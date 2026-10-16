"""Loopback-only local UI + persisted single-worker job queue. No external services."""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import importlib.metadata
import json
import mimetypes
import os
from pathlib import Path
import queue
import re
import subprocess
import sys
import threading
import time
from urllib.parse import urlparse, unquote
import uuid

from catalog import catalog, get_all, annotate_source

ROOT = Path(__file__).resolve().parent
JOBS = ROOT/'jobs'
STATIC = ROOT/'static'
JOBS.mkdir(exist_ok=True)
LOCK = threading.RLock()
QUEUE = queue.Queue()
STATE = {}
PROCESSES = {}
ID = re.compile(r'^[a-f0-9]{16}$')
PORT = 8767


def write_json(path, data):
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(data,ensure_ascii=False,allow_nan=False,indent=2),encoding='utf-8')
    os.replace(temp,path)


def save(job):
    write_json(JOBS/job['id']/'job.json',job)


def snapshot(ident, detail=False):
    if not isinstance(ident,str) or not ID.fullmatch(ident):
        raise ValueError('Invalid job identifier')
    directory=(JOBS/ident).resolve()
    if directory.parent!=JOBS.resolve():
        raise ValueError('Invalid job directory')
    with LOCK:
        j = dict(STATE[ident])
        if j['status']=='running': j['elapsed_s'] = max(0,time.time()-j.get('started_epoch',time.time()))
        j.pop('started_epoch',None)
    if detail:
        j['problem'] = json.loads((JOBS/ident/'problem.json').read_text(encoding='utf-8'))
        submitted=JOBS/ident/'submitted_problem.json'
        if submitted.exists(): j['submitted_problem']=json.loads(submitted.read_text(encoding='utf-8'))
        if j['status']=='completed' and (JOBS/ident/'result.json').exists():
            j['result'] = json.loads((JOBS/ident/'result.json').read_text(encoding='utf-8'))
        from progress import read_progress
        progress=read_progress(JOBS/ident,jobs_root=JOBS)
        if progress is not None:
            progress['job_status']=j['status']
            j['progress']=progress
    return j


def restore():
    for path in JOBS.glob('*/job.json'):
        if not ID.fullmatch(path.parent.name): continue
        try:
            j=json.loads(path.read_text(encoding='utf-8'))
            if j['id']!=path.parent.name: continue
            if j['status'] in ('queued','running'):
                j.update(status='cancelled',error='服务重启，上一轮未完成任务已停止。')
                save(j)
            STATE[j['id']]=j
        except (ValueError,KeyError,OSError): continue


def runner():
    while True:
        ident=QUEUE.get()
        with LOCK:
            j=STATE[ident]
            if j['status']!='queued': QUEUE.task_done(); continue
            j.update(status='running',started_epoch=time.time()); save(j)
        directory=JOBS/ident
        started=time.perf_counter()
        try:
            problem=json.loads((directory/'problem.json').read_text(encoding='utf-8'))
            with (directory/'worker.log').open('w',encoding='utf-8') as log:
                proc=subprocess.Popen([sys.executable,str(ROOT/'worker.py'),str(directory),str(os.getpid())],cwd=ROOT,
                    stdout=log,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
                with LOCK:
                    PROCESSES[ident]=proc
                    if j['status']=='cancelled': proc.terminate()
                try:
                    proc.wait(timeout=float(problem['settings']['time_limit'])+90)
                except subprocess.TimeoutExpired:
                    proc.kill(); proc.wait()
                    raise RuntimeError('求解进程超过时间保护上限，已停止；请减少数据规模或旋转角度数。')
            with LOCK:
                if j['status']!='cancelled':
                    if proc.returncode==0 and (directory/'result.json').exists():
                        result=json.loads((directory/'result.json').read_text(encoding='utf-8'))
                        j.update(status='completed',result={k:result[k] for k in ['engine','objective','full','feasible','metrics','validation','warnings'] if k in result})
                    else:
                        error=json.loads((directory/'error.json').read_text(encoding='utf-8')).get('error') if (directory/'error.json').exists() else f'求解进程退出（{proc.returncode}），详情见本地 worker.log。'
                        j.update(status='failed',error=error)
        except Exception as exc:
            with LOCK:
                if j['status']!='cancelled': j.update(status='failed',error=str(exc))
        finally:
            with LOCK:
                j['elapsed_s']=time.perf_counter()-started
                PROCESSES.pop(ident,None); save(j)
            QUEUE.task_done()


class Handler(BaseHTTPRequestHandler):
    server_version='CuttingLab/0.1'

    def log_message(self, fmt, *args):
        if '/api/jobs' not in str(args): print(fmt%args,flush=True)

    def send(self,status,data,content_type='application/json; charset=utf-8'):
        body=json.dumps(data,ensure_ascii=False,allow_nan=False).encode() if not isinstance(data,bytes) else data
        self.send_response(status)
        self.send_header('Content-Type',content_type)
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
        self.end_headers(); self.wfile.write(body)

    def valid_origin(self):
        host=self.headers.get('Host','')
        if host not in (f'127.0.0.1:{PORT}',f'localhost:{PORT}'):
            self.send(403,{'error':'仅允许本机 localhost 访问。'}); return False
        origin=self.headers.get('Origin')
        if origin and origin not in (f'http://127.0.0.1:{PORT}',f'http://localhost:{PORT}'):
            self.send(403,{'error':'拒绝外部网页访问本机任务接口。'}); return False
        return True

    def do_GET(self):
        if not self.valid_origin(): return
        path=unquote(urlparse(self.path).path)
        try:
            if path=='/api/health':
                return self.send(200,{'ok':True,'version':'0.1','engine_version':importlib.metadata.version('packingsolver')})
            if path=='/api/catalog': return self.send(200,catalog())
            if path.startswith('/api/datasets/'):
                p=get_all().get(path.rsplit('/',1)[-1])
                return self.send(200,annotate_source(p)) if p else self.send(404,{'error':'实例不存在。'})
            if path=='/api/jobs':
                with LOCK: ids=sorted(STATE,key=lambda x:STATE[x]['created_at'],reverse=True)[:100]
                return self.send(200,{'jobs':[snapshot(i) for i in ids]})
            if path.startswith('/api/jobs/'):
                ident=path.rsplit('/',1)[-1]
                if not ID.fullmatch(ident) or ident not in STATE: return self.send(404,{'error':'任务不存在。'})
                return self.send(200,snapshot(ident,True))
            if path.startswith('/api/'): return self.send(404,{'error':'接口不存在。'})
            target=(STATIC/('index.html' if path=='/' else path.lstrip('/'))).resolve()
            if not target.is_relative_to(STATIC.resolve()) or not target.is_file(): return self.send(404,{'error':'页面不存在。'})
            mime=mimetypes.guess_type(target.name)[0] or 'application/octet-stream'
            if target.suffix=='.js': mime='application/javascript'
            return self.send(200,target.read_bytes(),mime+('; charset=utf-8' if mime.startswith('text/') or mime=='application/javascript' else ''))
        except (BrokenPipeError,ConnectionResetError): pass
        except Exception as exc: self.send(500,{'error':str(exc)})

    def do_POST(self):
        if not self.valid_origin(): return
        path=urlparse(self.path).path
        try:
            if path.startswith('/api/jobs/') and path.endswith('/cancel'):
                ident=path.split('/')[3]
                with LOCK:
                    if not ID.fullmatch(ident) or ident not in STATE: return self.send(404,{'error':'任务不存在。'})
                    j=STATE[ident]
                    if j['status'] in ('running','queued'):
                        j.update(status='cancelled',error='已由用户停止。'); save(j)
                        if ident in PROCESSES: PROCESSES[ident].terminate()
                return self.send(200,snapshot(ident,True))
            if path!='/api/jobs': return self.send(404,{'error':'接口不存在。'})
            if self.headers.get('Content-Type','').split(';')[0]!='application/json': return self.send(415,{'error':'请提交 JSON 数据。'})
            length=int(self.headers.get('Content-Length','0'))
            if length<=0 or length>2_000_000: return self.send(413,{'error':'数据为空或超过 2 MB，请缩小数据规模。'})
            data=json.loads(self.rfile.read(length))
            from engine import normalize_problem
            problem=normalize_problem(data['problem'])
            # Compare original user inputs before normalization adds internal fields/defaults.
            provenance=annotate_source(data['problem'])['source']
            problem['source']=provenance
            with LOCK:
                if sum(j['status'] in ('queued','running') for j in STATE.values())>=10:
                    return self.send(429,{'error':'最多同时保留 10 个待完成任务，请等待或停止部分任务。'})
                ident=uuid.uuid4().hex[:16]
                directory=JOBS/ident; directory.mkdir()
                write_json(directory/'submitted_problem.json',data['problem'])
                write_json(directory/'problem.json',problem)
                j={'id':ident,'name':str(problem.get('name','自定义排料'))[:200],
                   'created_at':datetime.now(timezone.utc).isoformat(),'status':'queued','elapsed_s':0,
                   'source':provenance,'engine':problem['settings']['engine'],'objective':problem['settings']['objective'],
                   'rotation':problem['settings']['rotation'],'kind':problem['kind']}
                STATE[ident]=j; save(j)
            QUEUE.put(ident)
            return self.send(202,{'id':ident,'status':'queued'})
        except (ValueError,TypeError,KeyError,AssertionError) as exc: self.send(400,{'error':str(exc)})
        except Exception as exc: self.send(500,{'error':str(exc)})


if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--port',type=int,default=8767)
    args=parser.parse_args(); PORT=args.port
    # Bind before touching persistent state: a second launcher cannot cancel or
    # overwrite the first server's jobs or PID record when the port is occupied.
    server=ThreadingHTTPServer(('127.0.0.1',PORT),Handler)
    write_json(ROOT/'server_state.json',{'pid':os.getpid(),'port':PORT,'started_at':datetime.now(timezone.utc).isoformat(),'script':str(Path(__file__).resolve())})
    restore()
    threading.Thread(target=runner,daemon=True).start()
    print(f'裁切实验室 http://127.0.0.1:{PORT}  (仅本机)',flush=True)
    try: server.serve_forever()
    finally:
        for proc in list(PROCESSES.values()): proc.terminate()
        server.server_close()
