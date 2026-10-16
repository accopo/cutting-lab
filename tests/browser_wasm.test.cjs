const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../static/solver-worker.js'),G=require('../static/vendor/cutting-geometry.js');
const data=require('../static/vendor/browser-data.json').datasets;
const PackingSolver=require('../static/vendor/packingsolver/packingsolver.js');
const clone=x=>JSON.parse(JSON.stringify(x));
(async()=>{const mod=await PackingSolver();const receipts=[];
const cases=[['shirts','irregular'],['metal-parts','irregular'],['leather-defects','irregular'],['paper-layout','rectangle'],['wood-cabinet','guillotine'],['glass-panels','guillotine'],['bar-stock','onedimensional'],['bar-stock-kerf','onedimensional-kerf'],['box-mixed','box'],['box-value','box'],['box-weight','box']];
let failures=0;
for(const [id,engine]of cases){let p=clone(data[id]);p.settings.engine=engine;p.settings.time_limit=1;
try{p=G.normalize(p);const n=C.nativeInstance(p),raw=JSON.parse(mod.solve(n.problemType,JSON.stringify(n.instance),JSON.stringify(n.parameters)));assert(!raw.error,raw.error);const r=C.checked(p,C.parseCertificate(p,raw.certificate,raw.output,raw.output.Time),G);fs.mkdirSync(path.join(__dirname,'../test-artifacts/browser'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../test-artifacts/browser',id+'.json'),JSON.stringify({problem:p,native:n,raw,result:r},null,2));assert(r.validation.geometry_pass,JSON.stringify(r.validation));assert(r.metrics.placed_pieces>0);receipts.push({id,engine,placed:r.metrics.placed_pieces,required:r.metrics.required_pieces,full:r.full,bins:r.metrics.bin_count,validation:r.validation.geometry_pass});console.log('PASS',JSON.stringify(receipts.at(-1)));}catch(e){failures++;console.log('FAIL',id,e.stack);}}
const p=G.normalize({...clone(data['shirts']),settings:{...data.shirts.settings,time_limit:5}}),n=C.nativeInstance(p),session=new mod.Session();const err=session.start(n.problemType,JSON.stringify(n.instance),JSON.stringify(n.parameters));assert(!err,err);let seen=0,done=false,best=null,stopped=false;const started=performance.now();
while(!done&&performance.now()-started<12000){await new Promise(r=>setTimeout(r,50));const d=JSON.parse(session.poll());for(const raw of d.solutions||[]){seen++;const r=C.checked(p,C.parseCertificate(p,raw.certificate,raw.output,raw.output.Time),G);if(r.validation.geometry_pass&&r.metrics.placed_pieces>0)best=r;}if(best&&!stopped){session.stop();stopped=true;}if(d.done){done=true;assert(!d.result.error,d.result.error);}}
session.delete();assert(done);assert(seen>0);assert(best);assert(stopped);console.log('PASS live Session + cancel',JSON.stringify({seen,placed:best.metrics.placed_pieces,elapsed:(performance.now()-started)/1000}));
fs.writeFileSync(path.join(__dirname,'../test-artifacts/browser/wasm-smoke.json'),JSON.stringify({commit:C.COMMIT,receipts,failures,session:{seen,done,stopped,placed:best.metrics.placed_pieces}},null,2));process.exit(failures?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
