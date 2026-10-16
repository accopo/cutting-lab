"""Conservative one-dimensional cutting: every finished piece reserves a tail cut.

The last piece also reserves kerf. No head trimming, remnant inventory, angled
cuts, clamping allowance, or machine sequence is inferred from this model.
"""
from copy import deepcopy
import math


KERF_ENGINES = {"onedimensional-kerf", "ffd-1d", "bfd-1d"}
MODEL = "per-piece-tail-kerf"
MODEL_NOTE = "保守逐件锯缝模型：每件成品尾部都预留一刀，末件也计锯缝；不含端头修边、夹持余量、斜切与余料库存。"


def _append_cut(bin_result, item, start, kerf):
    from engine import _piece
    end = start + item["length"]
    index = len(bin_result["items"])
    bin_result["items"].append(_piece(item, 0, [[start, 0], [end, 0], [end, 1], [start, 1]]))
    bin_result.setdefault("cuts", []).append({
        "item_index": index, "item_id": item["id"], "model": MODEL,
        "start": end, "end": end + kerf, "width": kerf,
        "x1": end + kerf / 2, "y1": 0,
        "x2": end + kerf / 2, "y2": 1, "stage": 1,
    })


def solve_kerf_1d(p, out):
    """Return original finished pieces and explicit kerf intervals."""
    from engine import _bin, _packing_solver
    engine = p["settings"]["engine"]
    kerf = p["settings"]["kerf"]
    if engine == "onedimensional-kerf":
        transformed = deepcopy(p)
        transformed["settings"]["engine"] = "onedimensional"
        transformed["settings"]["kerf"] = 0
        transformed["progress_model"] = {
            "name": MODEL, "display_engine": engine,
            "certificate_lengths": "finished_length_plus_kerf", "kerf_per_piece": kerf,
            "note": "原生中间解长度含逐件尾部锯缝；展示成品前须按原始输入还原。"}
        for item in transformed["items"]:
            item["length"] += kerf
            item["polygon"] = [[0, 0], [item["length"], 0], [item["length"], 1], [0, 1]]
        raw_bins, stats, feasible, _ = _packing_solver(transformed, out)
        by_id = {str(item["id"]): item for item in p["items"]}
        bins = []
        for raw in raw_bins:
            mapped = _bin(p, len(bins))
            for piece in raw["items"]:
                original = by_id[str(piece["id"])]
                xs = [point[0] for point in piece["polygon"]]
                ys = [point[1] for point in piece["polygon"]]
                if (max(xs) - min(xs) != original["length"] + kerf
                        or min(ys) != 0 or max(ys) != 1 or piece["angle"] != 0):
                    raise RuntimeError("一维长度变换证书与原始长度加锯缝不一致。")
                _append_cut(mapped, original, min(xs), kerf)
            bins.append(mapped)
        stats = {"native_transformed_statistics": stats,
                 "length_transform": "solver_length = finished_length + kerf",
                 "bin_capacity_transform": "unchanged",
                 "kerf_per_piece": kerf, "kerf_model": MODEL}
        return bins, stats, feasible, None

    # Stable decreasing order: ties retain input type and copy order.
    pieces = [item for item in p["items"] for _ in range(item["quantity"])]
    pieces.sort(key=lambda item: -item["length"])
    bins, used = [], []
    capacity = p["stock"]["width"]
    for item in pieces:
        occupied = item["length"] + kerf
        if occupied > capacity:
            continue
        fits = [n for n, length in enumerate(used) if length + occupied <= capacity]
        if fits:
            index = (fits[0] if engine == "ffd-1d"
                     else min(fits, key=lambda n: (capacity - used[n] - occupied, n)))
        elif len(bins) < p["stock"]["copies"]:
            index = len(bins)
            bins.append(_bin(p, index))
            used.append(0)
        else:
            continue
        _append_cut(bins[index], item, used[index], kerf)
        used[index] += occupied
    return bins, {"algorithm": engine, "sort": "decreasing finished length; stable input ties",
                  "selection": "first fitting bin" if engine == "ffd-1d" else "minimum remaining capacity; first bin on tie",
                  "kerf_per_piece": kerf, "kerf_model": MODEL,
                  "occupied_lengths": used}, True, None


def validate_kerf_1d(p, result):
    """Reconstruct required tail intervals from original input, independently.

    This validator does not trust reported kerf, occupancy, or cut positions.
    Integers are checked exactly; the underlying one-dimensional API uses them.
    """
    source = {str(item["id"]): item for item in p["items"]}
    capacity, kerf = p["stock"]["width"], p["settings"]["kerf"]
    errors = []
    total_kerf = 0

    def numeric(value):
        return (isinstance(value, (int, float)) and not isinstance(value, bool)
                and math.isfinite(value))

    for bin_result in result.get("bins", []):
        pieces = bin_result.get("items", [])
        cuts = bin_result.get("cuts")
        if not isinstance(cuts, list):
            errors.append("一维锯缝证书缺少 cuts 数组。")
            cuts = []
        if len(cuts) != len(pieces):
            errors.append("每件成品必须且只能对应一个尾部切口，包括末件与零宽切口。")
        by_index = {}
        for cut in cuts:
            if not isinstance(cut, dict):
                errors.append("一维切口证书必须为对象。")
                continue
            index = cut.get("item_index")
            if type(index) is not int or index < 0 or index >= len(pieces) or index in by_index:
                errors.append("一维切口的零件索引缺失、重复或越界。")
                continue
            by_index[index] = cut
        occupied = []
        for index, piece in enumerate(pieces):
            original = source.get(str(piece.get("id")))
            if original is None:
                continue  # The shared validator reports the unknown identifier.
            polygon = piece.get("polygon", [])
            if (not isinstance(polygon, list) or len(polygon) < 3
                    or any(not isinstance(point, (list, tuple)) or len(point) != 2
                           or any(not numeric(value) for value in point) for point in polygon)):
                errors.append("一维成品证书坐标无效。")
                continue
            xs = [point[0] for point in polygon]
            ys = [point[1] for point in polygon]
            start, end = min(xs), max(xs)
            if any(value != int(value) for point in polygon for value in point):
                errors.append("一维成品证书必须使用整数坐标。")
            if end - start != original["length"] or min(ys) != 0 or max(ys) != 1:
                errors.append("一维成品长度或显示高度与原始输入不一致。")
            cut_start = start + original["length"]
            cut_end = cut_start + kerf
            if start < 0 or cut_end > capacity:
                errors.append("一维成品及其尾部锯缝超出原料长度。")
            occupied.append((start, cut_end))
            total_kerf += kerf
            cut = by_index.get(index)
            expected = {"start": cut_start, "end": cut_end, "width": kerf,
                        "x1": cut_start + kerf / 2, "x2": cut_start + kerf / 2,
                        "y1": 0, "y2": 1, "stage": 1}
            if (cut is None or str(cut.get("item_id")) != str(original["id"])
                    or cut.get("model") != MODEL
                    or any(not numeric(cut.get(key)) or cut[key] != value for key, value in expected.items())):
                errors.append("一维切口位置、宽度或对应零件与输入锯缝模型不一致。")
        occupied.sort()
        if any(left[1] > right[0] for left, right in zip(occupied, occupied[1:])):
            errors.append("一维成品或尾部锯缝区间发生重叠。")
    return {"pass": not errors, "errors": list(dict.fromkeys(errors)),
            "model": MODEL, "kerf_loss_length": total_kerf,
            "checks": ["original finished length", "integer coordinates", "tail kerf per piece",
                       "last-piece kerf", "occupied interval bounds", "occupied interval overlap",
                       "cut certificate correspondence"], "scope": MODEL_NOTE}
