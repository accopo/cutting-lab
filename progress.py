"""Atomic, bounded records of actual native solver incumbent callbacks.

No interpolation, animation, or invented intermediate solutions. Certificates
are written while the callback owns the native output object. Job cancellation
does not delete these files; job status remains authoritative for liveness.
"""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import re
import sys
import threading
import time
import uuid


CERTIFICATE_NAME = re.compile(r"^progress_certificate_([0-9]{6,12})\.(json|csv)$")
MAX_CERTIFICATE_BYTES = 8_000_000
MAX_MANIFEST_BYTES = 8_000_000


def _clean(value):
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {str(key): _clean(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_clean(item) for item in value]
    return value


def _timestamp():
    return datetime.now(timezone.utc).isoformat()


def _atomic_bytes(path, data):
    temp = path.with_name(f".{path.stem}.tmp-{uuid.uuid4().hex}{path.suffix}")
    try:
        with temp.open("wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, path)
    finally:
        try:
            temp.unlink(missing_ok=True)
        except OSError:
            pass


def _atomic_json(path, value):
    _atomic_bytes(path, json.dumps(_clean(value), ensure_ascii=False, allow_nan=False,
                                  separators=(",", ":")).encode("utf-8"))


class ProgressRecorder:
    def __init__(self, directory, engine, certificate_format, *, max_events=200, model=None):
        if certificate_format not in {"json", "csv"}:
            raise ValueError("Unsupported progress certificate format")
        if type(max_events) is not int or not 1 <= max_events <= 200:
            raise ValueError("Progress history must retain between 1 and 200 events")
        self.directory = Path(directory).resolve()
        self.engine = engine
        self.format = certificate_format
        self.max_events = max_events
        self.lock = threading.RLock()
        self.started = time.perf_counter()
        self.manifest = {"schema_version": 1, "source": "native-new-solution-callback",
                         "engine": engine, "certificate_format": certificate_format,
                         "state": "recording", "sequence": 0, "events": [], "latest": None,
                         "errors": [], "dropped_events": 0, "max_events": max_events,
                         "model": model or "native-geometry", "updated_at": _timestamp()}
        try:
            self.directory.mkdir(parents=True, exist_ok=True)
            self._publish()
        except Exception as exc:
            self._error("initialize", exc)

    def _publish(self):
        self.manifest["updated_at"] = _timestamp()
        _atomic_json(self.directory / "progress.json", self.manifest)

    def _error(self, stage, exc):
        # A public error has no exception message or path; diagnostics remain local.
        record = {"sequence": self.manifest["sequence"], "stage": stage,
                  "elapsed_s": max(0, time.perf_counter() - self.started),
                  "error_type": type(exc).__name__,
                  "message": "中间解记录失败；最终求解继续。"}
        self.manifest["errors"] = (self.manifest["errors"] + [record])[-20:]
        try:
            _atomic_json(self.directory / "progress_errors.json", self.manifest["errors"])
        except Exception:
            pass
        try:
            self._publish()
        except Exception:
            pass
        # If the filesystem itself fails, the owning worker log still records it.
        try:
            print(f"[progress] {stage}: {type(exc).__name__}: {exc}", file=sys.stderr, flush=True)
        except Exception:
            pass

    def __call__(self, output):
        with self.lock:
            self.manifest["sequence"] += 1
            sequence = self.manifest["sequence"]
            temp = None
            try:
                elapsed = float(output.time)
                if not math.isfinite(elapsed) or elapsed < 0:
                    raise ValueError("Native callback elapsed time is invalid")
                filename = f"progress_certificate_{sequence:06d}.{self.format}"
                target = self.directory / filename
                temp = self.directory / f".progress-{sequence}-{uuid.uuid4().hex}.{self.format}"
                output.solution.write(str(temp))
                certificate = temp.read_bytes()
                if len(certificate) > MAX_CERTIFICATE_BYTES:
                    raise ValueError("Intermediate certificate exceeds bounded record size")
                if self.format == "json":
                    json.loads(certificate)
                else:
                    certificate.decode("utf-8")
                stats = _clean(output.solution.to_json())
                search_stats = _clean(output.to_json())
                # Validate all JSON before publishing any reference to the certificate.
                json.dumps([stats, search_stats], ensure_ascii=False, allow_nan=False)
                os.replace(temp, target)
                temp = None
                _atomic_bytes(self.directory / f"latest_certificate.{self.format}", certificate)
                event = {"sequence": sequence, "elapsed_s": elapsed, "stats": stats,
                         "search_stats": search_stats, "certificate_format": self.format,
                         "certificate_file": filename, "certificate_bytes": len(certificate)}
                old_events = self.manifest["events"]
                all_events = old_events + [event]
                removed = all_events[:-self.max_events]
                self.manifest["events"] = all_events[-self.max_events:]
                self.manifest["latest"] = event
                self.manifest["dropped_events"] += len(removed)
                self._publish()
                # Prune only named files owned by this recorder, after the new manifest.
                for old in removed:
                    name = old["certificate_file"]
                    if CERTIFICATE_NAME.fullmatch(name):
                        try:
                            (self.directory / name).unlink(missing_ok=True)
                        except OSError as exc:
                            self._error("prune", exc)
            except Exception as exc:
                self._error("callback", exc)
            finally:
                if temp is not None:
                    try:
                        temp.unlink(missing_ok=True)
                    except OSError:
                        pass

    def finish(self, *, failed=False):
        with self.lock:
            self.manifest["state"] = "solver-error" if failed else "finished"
            try:
                self._publish()
            except Exception as exc:
                self._error("finish", exc)


def read_progress(directory, *, jobs_root):
    """Read only an owned job's allowlisted immutable certificate, never arbitrary paths."""
    directory = Path(directory).resolve()
    jobs_root = Path(jobs_root).resolve()
    if directory.parent != jobs_root or not re.fullmatch(r"[a-f0-9]{16}", directory.name):
        raise ValueError("Invalid progress job directory")
    manifest_path = directory / "progress.json"
    if not manifest_path.exists():
        return None
    if manifest_path.resolve().parent != directory or manifest_path.stat().st_size > MAX_MANIFEST_BYTES:
        return {"available": False, "error": "进度清单不可读取。"}
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        # Only this schema is exposed; a filesystem manifest cannot inject file paths.
        public = {key: deepcopy(manifest.get(key)) for key in
                  ("schema_version", "source", "engine", "certificate_format", "state",
                   "sequence", "dropped_events", "max_events", "model", "updated_at", "errors")}
        public["events"] = []
        fields = ("sequence", "elapsed_s", "stats", "search_stats", "certificate_format",
                  "certificate_file", "certificate_bytes")
        for event in manifest.get("events", [])[-200:]:
            if not isinstance(event, dict):
                continue
            name = event.get("certificate_file", "")
            if not isinstance(name, str) or not CERTIFICATE_NAME.fullmatch(name):
                continue
            public["events"].append({key: deepcopy(event.get(key)) for key in fields})
        latest = manifest.get("latest")
        public["latest"] = None
        public["available"] = True
        if latest is None:
            return public
        name = latest.get("certificate_file", "")
        match = CERTIFICATE_NAME.fullmatch(name) if isinstance(name, str) else None
        if (not match or match[2] != latest.get("certificate_format")
                or int(match[1]) != latest.get("sequence")):
            public["certificate_error"] = "中间解证书名称或序号不合法。"
            return public
        certificate_path = directory / name
        if certificate_path.resolve().parent != directory:
            public["certificate_error"] = "中间解证书不属于当前任务。"
            return public
        if certificate_path.stat().st_size > MAX_CERTIFICATE_BYTES:
            public["certificate_error"] = "中间解证书超出读取上限。"
            return public
        raw = certificate_path.read_text(encoding="utf-8")
        public["latest"] = {key: deepcopy(latest.get(key)) for key in fields}
        public["latest_raw_certificate"] = {
            "sequence": latest["sequence"], "format": match[2], "filename": name,
            "data": json.loads(raw) if match[2] == "json" else raw,
            "validation_status": "native-intermediate-not-independently-validated",
        }
        return public
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        return {"available": False, "error": "进度文件暂不可读取；已保存的中间解不会被删除。"}
