"""Export only public/synthetic catalog inputs, never saved user jobs."""
from pathlib import Path
import hashlib
import importlib.metadata
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from catalog import catalog, get_all, annotate_source


def main():
    target = ROOT / "static" / "vendor"
    target.mkdir(parents=True, exist_ok=True)
    data = {"schema_version": 1, "catalog": catalog(),
            "datasets": {key: annotate_source(value) for key, value in get_all().items()},
            "source": "public historical benchmark and explicitly synthetic teaching inputs"}
    out = target / "browser-data.json"
    out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    print(json.dumps({"file": str(out), "datasets": len(data["datasets"]), "bytes": out.stat().st_size,
                      "sha256": hashlib.sha256(out.read_bytes()).hexdigest()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
