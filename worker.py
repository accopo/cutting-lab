"""One isolated solver process per local job."""
import json
import os
from pathlib import Path
import sys
import traceback
import subprocess

root = Path(__file__).resolve().parent
job_dir = Path(sys.argv[1]).resolve()
if job_dir.parent != (root/'jobs').resolve():
    raise ValueError('Invalid job directory')
if len(sys.argv) != 3:
    raise ValueError('Worker requires its owning server process ID')
parent_pid = int(sys.argv[2])
# A separate watchdog remains responsive even if native solver code holds the GIL.
watchdog = subprocess.Popen([sys.executable,str(root/'watchdog.py'),str(parent_pid),str(os.getpid())],
                           creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
from engine import solve
try:
    problem = json.loads((job_dir/'problem.json').read_text(encoding='utf-8'))
    result = solve(problem, job_dir)
    temp = job_dir/'result.tmp'
    temp.write_text(json.dumps(result,ensure_ascii=False,allow_nan=False,indent=2),encoding='utf-8')
    os.replace(temp,job_dir/'result.json')
except Exception as exc:
    (job_dir/'error.json').write_text(json.dumps({'error':str(exc)},ensure_ascii=False),encoding='utf-8')
    traceback.print_exc()
    sys.exit(1)
