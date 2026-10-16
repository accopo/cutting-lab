"""Real one-second solver checks and independent certificate sabotage for 1D kerf."""
from copy import deepcopy
import json
from pathlib import Path
import unittest

from catalog import get_all
from engine import ProblemError, normalize_problem, solve, validate_result
from engine_1d import KERF_ENGINES


ROOT = Path(__file__).resolve().parent
EVIDENCE = ROOT / "qa_1d"
RECORDS = []


def problem(engine="onedimensional-kerf", lengths=(5, 5), capacity=10, copies=1, kerf=0):
    return {"name": "合成一维锯缝校验", "kind": "onedimensional", "unit": "mm",
            "stock": {"width": capacity, "height": 1, "copies": copies},
            "items": [{"id": i, "name": f"成品 {i}", "length": length,
                       "quantity": 1, "allowed_rotations": [0]} for i, length in enumerate(lengths)],
            "settings": {"engine": engine, "objective": "bins", "kerf": kerf,
                         "rotation": "none", "time_limit": 1}, "defects": []}


def run_case(name, p):
    result = solve(p, EVIDENCE / "runs" / name)
    RECORDS.append({"name": name, "engine": result["engine"], "time_budget_s": p["settings"]["time_limit"],
                    "elapsed_s": result["elapsed_s"], "full": result["full"],
                    "validation_pass": result["validation"]["pass"], "metrics": result["metrics"]})
    return result


class KerfTests(unittest.TestCase):
    def test_kerf_changes_feasibility(self):
        for engine in sorted(KERF_ENGINES):
            with self.subTest(engine=engine):
                no_kerf = run_case(engine + "-zero", problem(engine))
                with_kerf = run_case(engine + "-limited-stock", problem(engine, kerf=1))
                self.assertTrue(no_kerf["validation"]["pass"])
                self.assertEqual(no_kerf["metrics"]["bin_count"], 1)
                self.assertFalse(with_kerf["full"])
                self.assertFalse(with_kerf["validation"]["pass"])
                self.assertTrue(with_kerf["validation"]["geometry_pass"])
                self.assertLessEqual(with_kerf["metrics"]["bin_count"], 1)

    def test_kerf_adds_bins_and_preserves_finished_lengths(self):
        for engine in sorted(KERF_ENGINES):
            with self.subTest(engine=engine):
                p = problem(engine, copies=2, kerf=1)
                result = run_case(engine + "-two-bins", p)
                self.assertTrue(result["validation"]["pass"])
                self.assertEqual(result["metrics"]["bin_count"], 2)
                self.assertEqual(result["metrics"]["total_item_length"], 10)
                self.assertEqual(result["metrics"]["kerf_loss_length"], 2)
                self.assertEqual(result["metrics"]["occupied_length"], 12)
                self.assertEqual(result["metrics"]["unused_length"], 8)
                self.assertEqual(result["metrics"]["utilization_percent"], 50)
                for b in result["bins"]:
                    self.assertEqual(len(b["cuts"]), len(b["items"]))
                    for i in b["items"]:
                        self.assertEqual(max(x for x, y in i["polygon"]) - min(x for x, y in i["polygon"]), 5)

    def test_last_piece_always_reserves_a_cut(self):
        for engine in sorted(KERF_ENGINES):
            with self.subTest(engine=engine):
                result = run_case(engine + "-last-cut-fits", problem(engine, (10,), 12, kerf=2))
                self.assertTrue(result["validation"]["pass"])
                self.assertEqual(result["bins"][0]["cuts"][0]["end"], 12)
                bad_fit = run_case(engine + "-last-cut-exceeds", problem(engine, (10,), 10, kerf=1))
                self.assertFalse(bad_fit["full"])

    def test_quantity_repeated_patterns_and_string_ids(self):
        for engine in sorted(KERF_ENGINES):
            with self.subTest(engine=engine):
                p = problem(engine, (4,), 10, 3, 1)
                p["items"][0].update(id="beam-A", quantity=6)
                result = run_case(engine + "-repeated-pattern", p)
                self.assertTrue(result["validation"]["pass"])
                self.assertEqual(result["metrics"]["bin_count"], 3)
                self.assertEqual(result["validation"]["placed_counts"], {"beam-A": 6})
                self.assertEqual(result["metrics"]["kerf_loss_length"], 6)

    def test_transparency_of_greedy_routes(self):
        for engine in ["ffd-1d", "bfd-1d"]:
            p = problem(engine, (6, 5, 3, 2, 2, 2), 10, 3, 0)
            result = run_case(engine + "-trace", p)
            self.assertTrue(result["validation"]["pass"])
            # Independently replay the published selection rule, using remaining lengths.
            remaining, expected = [], []
            for item in sorted(p["items"], key=lambda i: -i["length"]):
                candidates = [i for i, n in enumerate(remaining) if n >= item["length"]]
                if candidates:
                    selected = candidates[0] if engine == "ffd-1d" else min(candidates, key=lambda i: (remaining[i], i))
                else:
                    selected = len(remaining); remaining.append(10); expected.append([])
                remaining[selected] -= item["length"]
                expected[selected].append(item["id"])
            self.assertEqual([[i["id"] for i in b["items"]] for b in result["bins"]], expected)

    def test_constraint_rejections(self):
        for engine in sorted(KERF_ENGINES):
            for field, value in [("kerf", -1), ("kerf", .5), ("kerf", True), ("kerf", float("nan")),
                                 ("spacing", 1), ("edge", 1), ("objective", "knapsack"),
                                 ("rotation", "quarter")]:
                with self.subTest(engine=engine, field=field, value=value):
                    p = problem(engine); p["settings"][field] = value
                    with self.assertRaises(ProblemError): normalize_problem(p)
            for field, value in [("length", 5.5), ("quantity", 1.5)]:
                p = problem(engine); p["items"][0][field] = value
                with self.assertRaises(ProblemError): normalize_problem(p)
            p = problem(engine); p["defects"] = [{"x": 1, "y": 0, "width": 1, "height": 1}]
            with self.assertRaises(ProblemError): normalize_problem(p)

    def test_original_route_still_rejects_kerf(self):
        p = problem("onedimensional", kerf=1)
        with self.assertRaises(ProblemError): normalize_problem(p)
        result = run_case("original-no-kerf", problem("onedimensional"))
        self.assertTrue(result["validation"]["pass"])
        self.assertNotIn("cuts", result["bins"][0])

    def test_synthetic_preset(self):
        p = get_all()["bar-stock-kerf"]
        self.assertEqual(p["source"]["kind"], "synthetic")
        self.assertEqual(normalize_problem(p)["settings"]["kerf"], 3)
        p["settings"]["time_limit"] = 1
        for engine in sorted(KERF_ENGINES):
            with self.subTest(engine=engine):
                p["settings"]["engine"] = engine
                result = run_case("synthetic-6m-" + engine, p)
                self.assertTrue(result["validation"]["pass"])
                self.assertEqual(result["metrics"]["placed_pieces"], sum(i["quantity"] for i in p["items"]))

    def test_certificate_sabotage(self):
        p = problem("ffd-1d", (10, 5), 30, 1, 2)
        result = run_case("sabotage-reference", p)
        self.assertTrue(result["validation"]["pass"])
        mutations = {}
        bad = deepcopy(result); bad["bins"][0]["cuts"].pop(); mutations["missing_cut"] = bad
        bad = deepcopy(result); bad["bins"][0]["cuts"][0]["width"] = 0; mutations["hidden_kerf"] = bad
        bad = deepcopy(result); bad["bins"][0]["cuts"][0]["end"] += 1; mutations["wrong_cut_end"] = bad
        bad = deepcopy(result); bad["bins"][0]["cuts"][0]["model"] = "between-pieces-only"; mutations["different_model"] = bad
        bad = deepcopy(result); bad["bins"][0]["cuts"][1]["item_index"] = 0; mutations["duplicate_cut_index"] = bad
        bad = deepcopy(result); bad["bins"][0]["cuts"][1]["item_id"] = "wrong"; mutations["wrong_cut_item"] = bad
        bad = deepcopy(result); bad["bins"][0]["items"][0]["polygon"][1][0] -= 1; mutations["changed_finished_shape"] = bad
        bad = deepcopy(result); bad["bins"][0]["items"].pop(); mutations["missing_quantity"] = bad
        bad = deepcopy(result); bad["bins"][0]["items"].append(deepcopy(bad["bins"][0]["items"][0])); mutations["extra_quantity"] = bad
        bad = deepcopy(result); bad["bins"][0]["items"][0]["angle"] = 180; mutations["forbidden_angle"] = bad
        bad = deepcopy(result); bad["bins"][0]["width"] = 31; mutations["changed_stock"] = bad
        bad = deepcopy(result)
        bad["bins"][0]["items"][1]["polygon"] = [[x-2, y] for x, y in bad["bins"][0]["items"][1]["polygon"]]
        for key in ["start", "end", "x1", "x2"]: bad["bins"][0]["cuts"][1][key] -= 2
        mutations["pieces_touch_but_kerf_overlaps"] = bad
        bad = deepcopy(result)
        bad["bins"][0]["items"][1]["polygon"] = [[x+.25, y] for x, y in bad["bins"][0]["items"][1]["polygon"]]
        for key in ["start", "end", "x1", "x2"]: bad["bins"][0]["cuts"][1][key] += .25
        mutations["fractional_coordinate"] = bad
        checks = []
        for name, bad in mutations.items():
            with self.subTest(name=name):
                check = validate_result(p, bad)
                checks.append({"name": name, "rejected": not check["pass"], "errors": check["errors"]})
                self.assertFalse(check["pass"])
        # Finished part remains inside stock but its tail cut extends outside.
        p_last = problem("ffd-1d", (10,), 12, 1, 2)
        bad = run_case("tail-bound-reference", p_last)
        bad["bins"][0]["items"][0]["polygon"] = [[x+1, y] for x, y in bad["bins"][0]["items"][0]["polygon"]]
        for key in ["start", "end", "x1", "x2"]: bad["bins"][0]["cuts"][0][key] += 1
        check = validate_result(p_last, bad)
        self.assertFalse(check["pass"])
        checks.append({"name": "last_cut_outside_stock", "rejected": not check["pass"], "errors": check["errors"]})
        (EVIDENCE / "tamper_checks.json").write_text(json.dumps(checks, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(KerfTests)
    run = unittest.TextTestRunner(verbosity=2).run(suite)
    summary = {"pass": run.wasSuccessful(), "tests_run": run.testsRun,
               "failures": len(run.failures), "errors": len(run.errors), "runs": RECORDS,
               "scope": "合成与公开软件实现验收；未证明最优、工厂节省率或完整加工可制造性。"}
    (EVIDENCE / "results.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    raise SystemExit(0 if run.wasSuccessful() else 1)
