"""Real incumbent callback, atomic read, cancellation and error-isolation checks.

Runs local child solver processes only; never starts an HTTP server.
"""
from copy import deepcopy
import csv
from io import StringIO
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from types import SimpleNamespace
import unittest
import uuid
from unittest.mock import patch

from catalog import get_all
from engine import solve
from progress import ProgressRecorder, read_progress


ROOT = Path(__file__).resolve().parent
QA = ROOT / "qa_progress"
JOBS = QA / "jobs"
RECORDS = []
RUN_PREFIX = uuid.uuid4().hex[:12]


def jobdir(index):
    return JOBS / f"{RUN_PREFIX}{index:04x}"


def load(name, seconds=1):
    p = get_all()[name]
    p["settings"]["time_limit"] = seconds
    return p


def run_child(directory, seconds):
    p = load("shirts", seconds)
    (directory / "problem.json").write_text(json.dumps(p), encoding="utf-8")
    solve(p, directory)


class ProgressTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        JOBS.mkdir(parents=True, exist_ok=True)

    def test_actual_callbacks_all_native_routes(self):
        cases = [("shirts", "irregular"), ("paper-layout", "rectangle"),
                 ("wood-cabinet", "guillotine"), ("bar-stock", "onedimensional"),
                 ("bar-stock-kerf", "onedimensional-kerf"), ("box-weight", "box")]
        for index, (name, engine) in enumerate(cases, 1):
            with self.subTest(engine=engine):
                directory = jobdir(index)
                result = solve(load(name), directory)
                progress = read_progress(directory, jobs_root=JOBS)
                self.assertTrue(result["validation"]["pass"])
                self.assertEqual(progress["errors"], [])
                self.assertTrue(progress["events"])
                self.assertGreater(progress["latest"]["stats"]["NumberOfItems"], 0)
                self.assertEqual(progress["latest"]["sequence"], progress["latest_raw_certificate"]["sequence"])
                self.assertEqual(progress["state"], "finished")
                raw = progress["latest_raw_certificate"]
                if raw["format"] == "json":
                    self.assertIn("bins", raw["data"])
                else:
                    self.assertTrue(list(csv.DictReader(StringIO(raw["data"]))))
                if engine == "onedimensional-kerf":
                    self.assertEqual(progress["model"]["certificate_lengths"], "finished_length_plus_kerf")
                RECORDS.append({"name": "native-" + engine, "events": len(progress["events"]),
                                "latest_sequence": progress["latest"]["sequence"],
                                "latest_elapsed_s": progress["latest"]["elapsed_s"],
                                "format": raw["format"], "validation_pass": result["validation"]["pass"],
                                "error_count": len(progress["errors"])})

    def test_live_parse_and_cancel_preserves_last_incumbent(self):
        directory = jobdir(0x100)
        directory.mkdir(exist_ok=True)
        with (directory / "test_child.log").open("w", encoding="utf-8") as log:
            child = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "--child", str(directory), "5"],
                                     cwd=ROOT, stdout=log, stderr=subprocess.STDOUT,
                                     creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            observed = []
            deadline = time.monotonic() + 8
            try:
                while time.monotonic() < deadline and child.poll() is None:
                    progress = read_progress(directory, jobs_root=JOBS)
                    if progress and progress.get("latest_raw_certificate"):
                        self.assertTrue(progress["available"])
                        # Read the atomic JSON repeatedly while the native solve is alive.
                        raw_manifest = json.loads((directory / "progress.json").read_text(encoding="utf-8"))
                        self.assertTrue(raw_manifest["events"])
                        observed.append(progress["latest"]["sequence"])
                        if len(observed) >= 3:
                            break
                    time.sleep(.015)
                self.assertIsNone(child.poll(), "The live-read assertion requires an active native solver")
                self.assertGreaterEqual(len(observed), 3)
                before = read_progress(directory, jobs_root=JOBS)
                child.terminate()
                child.wait(timeout=5)
            finally:
                if child.poll() is None:
                    child.kill(); child.wait(timeout=5)
        after = read_progress(directory, jobs_root=JOBS)
        self.assertTrue(after["latest_raw_certificate"])
        self.assertGreaterEqual(after["latest"]["sequence"], before["latest"]["sequence"])
        self.assertFalse((directory / "result.json").exists())
        # Exercise server.snapshot directly, without constructing an HTTP server.
        import server
        state = {directory.name: {"id": directory.name, "status": "cancelled", "elapsed_s": .1}}
        with patch.object(server, "JOBS", JOBS), patch.object(server, "STATE", state):
            snap = server.snapshot(directory.name, detail=True)
            self.assertEqual(snap["progress"]["job_status"], "cancelled")
            self.assertTrue(snap["progress"]["latest_raw_certificate"])
            self.assertNotIn(str(JOBS), json.dumps(snap["progress"], ensure_ascii=False))
        RECORDS.append({"name": "live-read-and-cancel", "reads_while_running": len(observed),
                        "sequence_before_cancel": before["latest"]["sequence"],
                        "sequence_after_cancel": after["latest"]["sequence"],
                        "certificate_retained": True, "final_result_absent": True})

    def test_callback_failure_is_recorded_without_aborting_final_solve(self):
        class BrokenSolution:
            def write(self, path):
                raise OSError("injected callback certificate failure")

        class FailFirstRecorder(ProgressRecorder):
            def __call__(self, output):
                if self.manifest["sequence"] == 0:
                    output = SimpleNamespace(time=output.time, solution=BrokenSolution(), to_json=output.to_json)
                super().__call__(output)

        directory = jobdir(0x200)
        with patch("progress.ProgressRecorder", FailFirstRecorder):
            result = solve(load("paper-layout"), directory)
        progress = read_progress(directory, jobs_root=JOBS)
        self.assertTrue(result["validation"]["pass"])
        self.assertTrue(progress["errors"])
        self.assertEqual(progress["errors"][0]["error_type"], "OSError")
        self.assertTrue((directory / "progress_errors.json").exists())
        RECORDS.append({"name": "callback-error-isolation", "final_validation_pass": True,
                        "error_recorded": True, "errors": progress["errors"]})

    def test_bounded_history_and_owned_path_allowlist(self):
        # Replay a real certificate to test storage bounds; these are not solver evidence.
        reference = read_progress(jobdir(2), jobs_root=JOBS)
        certificate = reference["latest_raw_certificate"]["data"]
        stats = reference["latest"]["stats"]

        class StorageFixtureSolution:
            def write(self, path): Path(path).write_text(certificate, encoding="utf-8")
            def to_json(self): return stats

        directory = jobdir(0x300)
        recorder = ProgressRecorder(directory, "storage-test", "csv", max_events=3)
        for index in range(8):
            recorder(SimpleNamespace(time=index / 10, solution=StorageFixtureSolution(), to_json=lambda: {}))
        recorder.finish()
        progress = read_progress(directory, jobs_root=JOBS)
        self.assertEqual([x["sequence"] for x in progress["events"]], [6, 7, 8])
        self.assertEqual(progress["dropped_events"], 5)
        self.assertEqual(len(list(directory.glob("progress_certificate_*.csv"))), 3)
        manifest = json.loads((directory / "progress.json").read_text(encoding="utf-8"))
        manifest["latest"]["certificate_file"] = "../../secret.csv"
        (directory / "progress.json").write_text(json.dumps(manifest), encoding="utf-8")
        bad = read_progress(directory, jobs_root=JOBS)
        self.assertNotIn("latest_raw_certificate", bad)
        self.assertIn("certificate_error", bad)
        with self.assertRaises(ValueError): read_progress(QA, jobs_root=JOBS)
        RECORDS.append({"name": "storage-bounds-and-allowlist", "retained_events": 3,
                        "retained_certificate_files": 3, "dropped_events": 5,
                        "path_traversal_rejected": True, "fixture_only": True})


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--child":
        run_child(Path(sys.argv[2]), float(sys.argv[3]))
    else:
        QA.mkdir(parents=True, exist_ok=True)
        suite = unittest.defaultTestLoader.loadTestsFromTestCase(ProgressTests)
        result = unittest.TextTestRunner(verbosity=2).run(suite)
        report = {"pass": result.wasSuccessful(), "tests_run": result.testsRun,
                  "failures": len(result.failures), "errors": len(result.errors), "records": RECORDS,
                  "scope": "Actual native callbacks are labeled native; storage replay fixtures are separately marked."}
        (QA / "results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        raise SystemExit(0 if result.wasSuccessful() else 1)
