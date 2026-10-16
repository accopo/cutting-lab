/* Cutting Lab browser solver adapter. Real PackingSolver WASM plus explicit JS
 * baseline ports. Copyright 2026 Cutting Lab contributors. Licensed under Apache-2.0.
 * MaxRectsBssf / SkylineBl selection and split rules ported from rectpack 0.2.2;
 * Modified JavaScript port of SecNot rectpack 0.2.2 (Apache-2.0); see vendor/rectpack-LICENSE. No stored solutions are used as computation. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CuttingSolverCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';
  const COMMIT = '649fd65233ee93f50b69871f197779ace46db9f5';
  const ENGINE_VERSION = COMMIT.slice(0,12);
  function engineURL(name,base,attempt=0){const u=new URL('vendor/packingsolver/'+name,base);u.searchParams.set('v',ENGINE_VERSION);if(attempt)u.searchParams.set('retry',attempt);return u.href;}
  // Keep pthread boot synchronous: Emscripten installs its message queue while
  // importing, before the parent's initial load message can be delivered.
  function importEngineScript(importer,base){let last;for(let attempt=0;attempt<3;attempt++){try{importer(engineURL('packingsolver.js',base,attempt));return;}catch(e){last=e;if(!['NetworkError','TypeError'].includes(e.name))break;}}
    throw Error('计算引擎脚本 packingsolver.js 加载失败。请再次点击运行；若仍失败，按 Ctrl+F5 刷新页面或使用本地版。详细原因：'+(last?.message||last));}
  async function fetchEngineAsset(fetcher,base,name,signal){const controller=new AbortController(),abort=()=>controller.abort();if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,45000);
    try{const r=await fetcher(engineURL(name,base),{signal:controller.signal,cache:'no-cache'});if(!r.ok)throw Error('HTTP '+r.status);const bytes=new Uint8Array(await r.arrayBuffer());if(name.endsWith('.wasm')&&(bytes.length<8||bytes[0]!==0||bytes[1]!==97||bytes[2]!==115||bytes[3]!==109))throw Error('收到的文件不是 WebAssembly 模块');if(name.endsWith('.js')&&!/javascript|ecmascript/i.test(r.headers.get('content-type')||''))throw Error('收到的文件不是 JavaScript 脚本');return bytes;}
    catch(e){if(signal?.aborted)throw Error('引擎加载已停止。');throw Error('计算引擎文件 '+name+' 加载失败（'+(e.name==='AbortError'?'下载超时':e.message)+'）。请再次点击运行；若仍失败，按 Ctrl+F5 刷新或使用本地版。');}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}}
  const BASELINES = ['shelf','ffd-1d','bfd-1d','rectpack-maxrects','rectpack-skyline'];
  const KERF = ['onedimensional-kerf','ffd-1d','bfd-1d'];
  const clone = x => JSON.parse(JSON.stringify(x));
  const rect = (x,y,w,h) => [[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
  const area = pts => Math.abs(pts.reduce((a,p,i) => {const q=pts[(i+1)%pts.length];return a+p[0]*q[1]-q[0]*p[1];},0))/2;
  const bounds = pts => {const x=pts.map(p=>p[0]),y=pts.map(p=>p[1]);return [Math.min(...x),Math.min(...y),Math.max(...x),Math.max(...y)];};
  const rotated = (pts,a) => {let c=Math.cos(a*Math.PI/180),s=Math.sin(a*Math.PI/180);if(Math.abs(c)<2.5e-16)c=0;if(Math.abs(s)<2.5e-16)s=0;return pts.map(([x,y])=>[x*c-y*s,x*s+y*c]);};
  const shape = pts => ({type:'general',elements:pts.map((p,i)=>({type:'LineSegment',start:{x:p[0],y:p[1]},end:{x:pts[(i+1)%pts.length][0],y:pts[(i+1)%pts.length][1]}}))});
  function nativeInstance(p) {
    const s=p.settings, e=s.engine, stock=p.stock, copies=s.objective==='bins'?stock.copies:1;
    const objective={strip:'open-dimension-x',bins:'bin-packing',knapsack:'knapsack'}[s.objective];
    let type=e==='guillotine'?'rectangleguillotine':e==='onedimensional-kerf'?'onedimensional':e;
    const inst={objective,bin_types:[],item_types:[]};
    if(type==='irregular') {
      inst.parameters={item_item_minimum_spacing:s.spacing};
      inst.bin_types=[{...shape(rect(0,0,stock.width,stock.height)),copies,item_bin_minimum_spacing:s.edge,
        defects:p.defects.map(d=>({...shape(rect(d.x,d.y,d.width,d.height)),item_defect_minimum_spacing:s.spacing}))}];
      inst.item_types=p.items.map(i=>({shapes:[shape(i.polygon)],copies:i.quantity,profit:i.profit,
        allowed_rotations:i.effective_rotations===null?[{start:0,end:360,mirror:false}]:i.effective_rotations.map(a=>({start:a,end:a,mirror:false}))}));
    } else if(type==='box') {
      inst.bin_types=[{x:stock.width,y:stock.height,z:stock.depth,copies,...(stock.maximum_weight!=null?{maximum_weight:stock.maximum_weight}:{})}];
      inst.item_types=p.items.map(i=>({x:i.width,y:i.height,z:i.depth,copies:i.quantity,profit:i.profit,weight:i.weight,rotations:i.effective_rotations}));
    } else if(type==='onedimensional') {
      inst.bin_types=[{length:stock.width,copies}];
      inst.item_types=p.items.map(i=>({length:i.length+(e==='onedimensional-kerf'?s.kerf:0),copies:i.quantity,profit:i.profit}));
    } else if(type==='rectangle'||type==='rectangleguillotine') {
      const guill=type==='rectangleguillotine', dims=guill?['width','height']:['x','y'];
      inst.bin_types=[{[dims[0]]:stock.width,[dims[1]]:stock.height,copies,defects:p.defects.map(d=>({x:d.x,y:d.y,width:d.width,height:d.height}))}];
      if(guill) Object.assign(inst,{number_of_stages:3,cut_type:'exact',first_stage_orientation:s.first_cut,cut_thickness:s.kerf,cut_through_defects:true});
      inst.item_types=p.items.map(i=>{const directions=[...new Set(i.effective_rotations.map(a=>a%180))],sw=directions.length===1&&directions[0]===90;return {[dims[0]]:sw?i.height:i.width,[dims[1]]:sw?i.width:i.height,copies:i.quantity,profit:i.profit,oriented:directions.length===1};});
    } else throw Error('此路线由明确的 JavaScript 基线执行，不可提交到原生 WASM。');
    return {problemType:type,instance:inst,parameters:{time_limit:s.time_limit,verbosity_level:0,optimization_mode:'anytime'}};
  }
  function csv(text) {
    if(typeof text!=='string')throw Error('CSV 证书不是文本。');
    const rows=[];let row=[],field='',quoted=false;
    for(let k=0;k<text.length;k++){const c=text[k];if(c==='"'){if(quoted&&text[k+1]==='"'){field+='"';k++;}else quoted=!quoted;}
      else if(c===','&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[k+1]==='\n')k++;row.push(field);if(row.some(Boolean))rows.push(row);row=[];field='';}else field+=c;}
    if(quoted)throw Error('CSV 证书引号未闭合。');if(field||row.length){row.push(field);rows.push(row);}if(!rows.length)return [];
    const header=rows.shift().map(s=>s.replace(/^\uFEFF/,'').trim());
    if(new Set(header).size!==header.length)throw Error('CSV 证书列名重复。');
    return rows.map(r=>{if(r.length!==header.length)throw Error('CSV 证书列数不一致。');return Object.fromEntries(header.map((h,i)=>[h,r[i]]));});
  }
  const number=(v,label)=>{if(v===null||v===undefined||v===''||!Number.isFinite(Number(v)))throw Error('证书数值无效：'+label);return Number(v);};
  const integer=(v,label)=>{const n=number(v,label);if(!Number.isSafeInteger(n))throw Error('证书整数超出安全范围：'+label);return n;};
  function bin(p,n){return {index:n,width:p.stock.width,height:p.stock.height,...(p.kind==='box'?{depth:p.stock.depth}:{}),items:[],defects:clone(p.defects||[])};}
  const piece=(i,angle,polygon)=>({id:i.id,name:i.name,angle,mirror:false,polygon});
  function original(p,id){const n=integer(id,'item type ID');if(n<0||n>=p.items.length)throw Error('证书包含未知原生零件索引。');return p.items[n];}
  function angleFor(i,w,h){for(const a of i.effective_rotations){const sw=a%180===90;if(Math.abs((sw?i.height:i.width)-w)<1e-7&&Math.abs((sw?i.width:i.height)-h)<1e-7)return a;}throw Error('矩形证书尺寸与允许方向不一致。');}
  function addKerf(b,i,x,k){const end=x+i.length;const index=b.items.length;b.items.push(piece(i,0,rect(x,0,i.length,1)));(b.cuts||(b.cuts=[])).push({item_index:index,item_id:i.id,model:'per-piece-tail-kerf',start:end,end:end+k,width:k,x1:end+k/2,y1:0,x2:end+k/2,y2:1,stage:1});}
  function parseCertificate(p,certificate,output={},elapsed=0) {
    const e=p.settings.engine,s=p.settings,bins=[];let tree;
    if(e==='irregular') {
      const raw=typeof certificate==='string'?JSON.parse(certificate):certificate;
      if(raw===null&&output.Solution?.NumberOfItems===0)return makeResult(p,[],output,elapsed);
      if(!raw||!Array.isArray(raw.bins))throw Error('异形证书缺少 bins。');
      for(const source of raw.bins){const b=bin(p,bins.length);for(const part of source.items||[]){if(part.mirror)throw Error('证书返回未允许的镜像。');const i=original(p,part.id);if(part.item_shapes?.length!==1)throw Error('当前只支持单组件多边形证书。');const edges=part.item_shapes[0].shape;if(!Array.isArray(edges)||edges.some(x=>x.type!=='LineSegment'))throw Error('当前证书只允许直线多边形。');b.items.push(piece(i,number(part.angle,'angle'),edges.map(x=>[number(x.xs,'xs'),number(x.ys,'ys')])));}
        const copies=integer(source.copies,'bin copies');if(copies<1||copies>p.effective_stock_copies)throw Error('证书复制数不合法。');for(let j=0;j<copies;j++){const c=clone(b);c.index=bins.length;bins.push(c);}}
    } else if(e==='guillotine') {
      tree=csv(certificate).map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,v===''?null:integer(v,k)]))).filter(r=>r.TYPE!==-4);
      const nodes=new Map(tree.map(r=>[r.NODE_ID,r]));
      for(const root of tree.filter(r=>r.PARENT===null)){const copies=integer(root.COPIES,'COPIES');if(copies<1||copies>p.effective_stock_copies)throw Error('切割树复制数不合法。');for(let n=0;n<copies;n++){const b=bin(p,bins.length);b.cuts=[];for(const r of tree.filter(r=>r.PLATE_ID===root.PLATE_ID)){if(r.PARENT===null)continue;const {X:x,Y:y,WIDTH:w,HEIGHT:h}=r;if(r.TYPE>=0){const i=original(p,r.TYPE);b.items.push(piece(i,angleFor(i,w,h),rect(x,y,w,h)));}const par=nodes.get(r.PARENT);if(!par)throw Error('切割树父节点缺失。');const vertical=(r.CUT%2===1)===(s.first_cut==='vertical');if(vertical&&x>par.X)b.cuts.push({x1:x-s.kerf/2,y1:y,x2:x-s.kerf/2,y2:y+h,stage:r.CUT});else if(!vertical&&y>par.Y)b.cuts.push({x1:x,y1:y-s.kerf/2,x2:x+w,y2:y-s.kerf/2,stage:r.CUT});}bins.push(b);}}
    } else {
      const rows=csv(certificate),groups=new Map();
      for(const r of rows)if(r.TYPE==='BIN'){if(groups.has(r.BIN))throw Error('重复容器证书。');const copies=integer(r.COPIES,'copies');if(copies<1||copies>p.effective_stock_copies)throw Error('证书复制数不合法。');groups.set(r.BIN,{copies,items:[]});}
      for(const r of rows)if(r.TYPE==='ITEM'){if(!groups.has(r.BIN))throw Error('零件引用不存在的容器。');groups.get(r.BIN).items.push(r);}
      for(const group of groups.values())for(let n=0;n<group.copies;n++){const b=bin(p,bins.length);for(const r of group.items){const i=original(p,r.ID),c=integer(r.COPIES,'item copies');if(c!==1&&c!==group.copies)throw Error('零件复制数与原料模式不一致。');if(e==='box'){const part={id:i.id,name:i.name,rotation:r.ROTATION,weight:i.weight};for(const [k,v] of [['x','X'],['y','Y'],['z','Z'],['width','LX'],['height','LY'],['depth','LZ']])part[k]=integer(r[v],v);b.items.push(part);}else{const x=number(r.X,'X'),w=number(r.LX,'LX'),y=p.kind==='onedimensional'?0:number(r.Y,'Y'),h=p.kind==='onedimensional'?1:number(r.LY,'LY');if(e==='onedimensional-kerf'){if(w!==i.length+s.kerf)throw Error('锯缝变换证书长度不符。');addKerf(b,i,x,s.kerf);}else b.items.push(piece(i,p.kind==='onedimensional'?0:angleFor(i,w,h),rect(x,y,w,h)));}}if(e==='box'){b.total_weight=b.items.reduce((a,i)=>a+i.weight,0);b.maximum_weight=p.stock.maximum_weight??null;}bins.push(b);}
    }
    const result=makeResult(p,bins,output,elapsed);if(tree)result.cut_tree=tree;return result;
  }
  function makeResult(p,bins,output={},elapsed=0) {
    bins=bins.filter(b=>b.items.length);bins.forEach((b,n)=>b.index=n);const box=p.kind==='box',s=p.settings;
    const pieces=bins.flatMap(b=>b.items),required=p.items.reduce((a,i)=>a+i.quantity,0),byId=new Map(p.items.map(i=>[String(i.id),i]));
    const size=box?pieces.reduce((a,i)=>a+i.width*i.height*i.depth,0):pieces.reduce((a,i)=>a+area(i.polygon),0);
    const used=box?null:Math.max(0,...pieces.flatMap(i=>i.polygon.map(p=>p[0])))+(pieces.length?s.edge:0);
    const denominator=box?bins.length*p.stock.width*p.stock.height*p.stock.depth:s.objective==='strip'?used*p.stock.height:bins.length*p.stock.width*p.stock.height;
    const metrics={required_pieces:required,placed_pieces:pieces.length,bin_count:bins.length,utilization_percent:denominator?100*size/denominator:0,profit:pieces.reduce((a,i)=>a+(byId.get(String(i.id))?.profit||0),0)};
    if(box)Object.assign(metrics,{total_item_volume:size,total_stock_volume:denominator,total_item_weight:bins.reduce((a,b)=>a+(b.total_weight||0),0)});else Object.assign(metrics,{used_length:s.objective==='strip'?used:null,total_item_area:size});
    if(KERF.includes(s.engine))Object.assign(metrics,{total_item_length:size,kerf_loss_length:pieces.length*s.kerf,occupied_length:size+pieces.length*s.kerf,total_stock_length:bins.length*p.stock.width,unused_length:bins.length*p.stock.width-size-pieces.length*s.kerf});
    return {engine:s.engine,objective:s.objective,...(box?{kind:'box'}:{}),elapsed_s:elapsed,full:pieces.length===required,feasible:false,units:p.unit,metrics,bins,solver_statistics:clone(output.Solution||output),raw_output:clone(output),engine_version:BASELINES.includes(s.engine)?'js-port-1':'wasm-'+COMMIT.slice(0,12),config:{engine:s.engine,objective:s.objective,settings:clone(s),stock:clone(p.stock),effective_stock_copies:p.effective_stock_copies},warnings:[BASELINES.includes(s.engine)?'真实 JavaScript 构造式基线；与 Python 路线保持同一规则，并非原生 WASM 优化。':'真实浏览器 WebAssembly 限时求解；不保证全局最优。','独立数值几何校验不等同于工业加工、局部承重或稳定性证明。',...(KERF.includes(s.engine)?['逐件尾部锯缝模型，末件也预留一刀。']:[])]};
  }
  function checked(p,result,geometry){const v=geometry.validate(p,result);result.validation=v;result.full=v.full_demand;result.feasible=v.pass;if(!result.full)result.warnings.push(p.settings.objective==='knapsack'?'背包问题允许只选部分零件。':'本次尚未满足全部需求。');return result;}
  function objectiveValue(p,r){if(!r)return null;if(p.settings.objective==='knapsack')return r.metrics.profit;if(!r.full)return null;return p.settings.objective==='strip'?r.metrics.used_length:r.metrics.bin_count;}
  function better(p,a,b){if(!b)return true;if(a.full!==b.full&&p.settings.objective!=='knapsack')return a.full;if(a.metrics.placed_pieces!==b.metrics.placed_pieces&&!a.full&&p.settings.objective!=='knapsack')return a.metrics.placed_pieces>b.metrics.placed_pieces;const x=objectiveValue(p,a),y=objectiveValue(p,b);if(x==null)return a.metrics.placed_pieces>=b.metrics.placed_pieces;return p.settings.objective==='knapsack'?x>y:x<y;}
  function candidateMax(free,w,h,rot){const choices=[];for(const [a,b] of rot?[[w,h],[h,w]]:[[w,h]])for(const r of free)if(a<=r.w&&b<=r.h)choices.push({x:r.x,y:r.y,w:a,h:b,fitness:Math.min(r.w-a,r.h-b)});return choices.reduce((a,b)=>!a||b.fitness<a.fitness?b:a,null);}
  function splitFree(free,p){const next=[];for(const r of free){if(p.x>=r.x+r.w||p.x+p.w<=r.x||p.y>=r.y+r.h||p.y+p.h<=r.y){next.push(r);continue;}if(p.x>r.x)next.push({x:r.x,y:r.y,w:p.x-r.x,h:r.h});if(p.x+p.w<r.x+r.w)next.push({x:p.x+p.w,y:r.y,w:r.x+r.w-p.x-p.w,h:r.h});if(p.y+p.h<r.y+r.h)next.push({x:r.x,y:p.y+p.h,w:r.w,h:r.y+r.h-p.y-p.h});if(p.y>r.y)next.push({x:r.x,y:r.y,w:r.w,h:p.y-r.y});}
    const contained=new Set();for(let i=0;i<next.length;i++)for(let j=i+1;j<next.length;j++){const a=next[i],b=next[j],contains=(a,b)=>a.x<=b.x&&a.y<=b.y&&a.x+a.w>=b.x+b.w&&a.y+a.h>=b.y+b.h;if(contains(a,b))contained.add(j);else if(contains(b,a))contained.add(i);}return next.filter((_,i)=>!contained.has(i));}
  function candidateSkyline(lines,w,h,rot,W,H){let best=null;for(const [a,b] of rot&&w!==h?[[w,h],[h,w]]:[[w,h]]){const positions=lines.flatMap(s=>[s.x,s.x+s.w-a]).filter(x=>x>=0&&x+a<=W).sort((x,y)=>x-y);for(const x of positions){const y=Math.max(...lines.filter(s=>s.x<x+a&&s.x+s.w>x).map(s=>s.y));if(y+b<=H&&(!best||y+b<best.fitness))best={x,y,w:a,h:b,fitness:y+b};}}return best;}
  function skylineAdd(lines,p){const next=[];for(const s of lines){if(s.x+s.w<=p.x||s.x>=p.x+p.w)next.push(s);else{if(s.x<p.x)next.push({x:s.x,w:p.x-s.x,y:s.y});if(s.x+s.w>p.x+p.w)next.push({x:p.x+p.w,w:s.x+s.w-p.x-p.w,y:s.y});}}next.push({x:p.x,w:p.w,y:p.y+p.h});next.sort((a,b)=>a.x-b.x);const out=[];for(const s of next){const last=out.at(-1);if(last&&last.y===s.y&&last.x+last.w===s.x)last.w+=s.w;else out.push(s);}return out;}
  async function baseline(p,onResult=()=>{},cancelled=()=>false) {
    const start=performance.now(),s=p.settings,e=s.engine,bins=[],yieldStep=()=>new Promise(resolve=>setTimeout(resolve,0));let lastEmit=0;
    async function emit(force=false){const now=performance.now();if(force||now-lastEmit>60){lastEmit=now;await onResult(makeResult(p,clone(bins),{algorithm:e,runtime:'javascript'},(now-start)/1000));}await yieldStep();}
    if(e==='ffd-1d'||e==='bfd-1d'){const used=[],items=p.items.flatMap(i=>Array.from({length:i.quantity},()=>i)).sort((a,b)=>b.length-a.length);for(const i of items){if(cancelled()||(performance.now()-start)/1000>s.time_limit)break;const size=i.length+s.kerf;if(size>p.stock.width)continue;const fits=used.map((u,n)=>({u,n})).filter(v=>v.u+size<=p.stock.width);let n;if(fits.length)n=e==='ffd-1d'?fits[0].n:fits.reduce((a,b)=>b.u>a.u?b:a).n;else if(bins.length<p.stock.copies){n=bins.length;bins.push(bin(p,n));used.push(0);}else continue;addKerf(bins[n],i,used[n],s.kerf);used[n]+=size;await emit();}}
    else if(e==='shelf'){const W=p.stock.width,H=p.stock.height,edge=s.edge,gap=s.spacing,items=[];for(const i of p.items){const options=i.effective_rotations.map(a=>{const poly=rotated(i.polygon,a),b=bounds(poly);return {w:b[2]-b[0],h:b[3]-b[1],a,poly,b};}).filter(o=>o.w<=W-2*edge+1e-9&&o.h<=H-2*edge+1e-9);for(let k=0;k<i.quantity;k++)items.push({i,options});}items.sort((a,b)=>Math.max(0,...b.options.map(o=>o.w*o.h))-Math.max(0,...a.options.map(o=>o.w*o.h)));let x=edge,y=edge,column=0;for(const {i,options}of items){if(cancelled()||(performance.now()-start)/1000>s.time_limit)break;if(!options.length)continue;if(!bins.length)bins.push(bin(p,0));let choices=[];for(const o of options){if(y+o.h<=H-edge+1e-9&&x+o.w<=W-edge+1e-9)choices.push({...o,score:x+Math.max(column,o.w),newcol:0,x,y});const nx=x+column+(column?gap:0);if(nx+o.w<=W-edge+1e-9)choices.push({...o,score:nx+o.w,newcol:1,x:nx,y:edge});}if(!choices.length){if(bins.length>=p.effective_stock_copies)continue;bins.push(bin(p,bins.length));x=y=edge;column=0;choices=options.map(o=>({...o,score:edge+o.w,newcol:0,x:edge,y:edge}));}choices.sort((a,b)=>a.score-b.score||a.newcol-b.newcol||a.h-b.h||a.a-b.a);const o=choices[0];if(o.newcol)column=0;bins.at(-1).items.push(piece(i,o.a,o.poly.map(pt=>[pt[0]+o.x-o.b[0],pt[1]+o.y-o.b[1]])));x=o.x;y=o.y+o.h+gap;column=Math.max(column,o.w);await emit();}}
    else if(e==='rectpack-maxrects'||e==='rectpack-skyline'){const W=p.stock.width,H=p.stock.height,states=[],dims=[...new Set(p.items[0].effective_rotations.map(a=>a%180))],rot=dims.length===2,swap=dims.length===1&&dims[0]===90,items=p.items.flatMap(i=>Array.from({length:i.quantity},()=>i)).sort((a,b)=>b.width*b.height-a.width*a.height);for(const i of items){if(cancelled()||(performance.now()-start)/1000>s.time_limit)break;const w=swap?i.height:i.width,h=swap?i.width:i.height,choose=st=>e==='rectpack-maxrects'?candidateMax(st,w,h,rot):candidateSkyline(st,w,h,rot,W,H);let best=null;for(let n=0;n<states.length;n++){const c=choose(states[n]);if(c&&(!best||c.fitness<best.c.fitness))best={n,c};}if(!best&&bins.length<p.stock.copies){const st=e==='rectpack-maxrects'?[{x:0,y:0,w:W,h:H}]:[{x:0,w:W,y:0}],c=choose(st);if(c){const n=bins.length;bins.push(bin(p,n));states.push(st);best={n,c};}}if(!best)continue;const {n,c}=best;states[n]=e==='rectpack-maxrects'?splitFree(states[n],c):skylineAdd(states[n],c);bins[n].items.push(piece(i,angleFor(i,c.w,c.h),rect(c.x,c.y,c.w,c.h)));await emit();}}
    else throw Error('未实现的浏览器基线路线。');
    const result=makeResult(p,bins,{algorithm:e,runtime:'javascript'},(performance.now()-start)/1000);await onResult(clone(result));return result;
  }
  return {COMMIT,ENGINE_VERSION,engineURL,importEngineScript,fetchEngineAsset,BASELINES,KERF,clone,area,bounds,nativeInstance,csv,parseCertificate,makeResult,checked,objectiveValue,better,baseline};
});

// This file also loads as a normal script for certificate adaptation. Only a
// classic dedicated Worker installs the execution loop.
if(typeof importScripts==='function'&&typeof document==='undefined'){
  // Emscripten 6 pthread workers reuse self.location.href (this adapter).
  // Forward these workers directly to the untouched official pthread loader.
  if(self.name==='em-pthread'){self.CuttingSolverCore.importEngineScript(url=>importScripts(url),self.location.href);}
  else {
  importScripts('vendor/robust-predicates-3.0.2/orient2d.js','vendor/polygon-clipping-0.15.7/polygon-clipping.umd.js','vendor/cutting-geometry.js');
  const core=self.CuttingSolverCore;let modulePromise=null,session=null,pollTimer=null,job=null,stopped=false,busy=false,loadController=null;
  const send=x=>self.postMessage(x);
  async function loadWasm(){
    if(!self.crossOriginIsolated||typeof SharedArrayBuffer==='undefined')throw Error('浏览器计算环境尚未准备好。请刷新页面完成隔离加载；建议使用最新版 Chrome 或 Edge，也可使用本地版。');
    if(!modulePromise){loadController=new AbortController();modulePromise=(async()=>{
      send({type:'loading',jobId:job.id,message:'正在下载并校验计算引擎（约 7.6 MB）；网络中断时会自动重试。'});
      // Warm the verified service-worker cache before 32 pthreads import the
      // same script, and download WASM explicitly so HTTP errors are legible.
      const [,wasmBinary]=await Promise.all(['packingsolver.js','packingsolver.wasm'].map(name=>core.fetchEngineAsset(fetch.bind(self),self.location.href,name,loadController.signal)));
      if(stopped)throw Error('引擎加载已停止。');
      core.importEngineScript(url=>importScripts(url),self.location.href);
      send({type:'loading',jobId:job.id,message:'引擎文件已就绪，正在初始化计算线程…'});
      return PackingSolver({wasmBinary,mainScriptUrlOrBlob:core.engineURL('packingsolver.js',self.location.href),locateFile:name=>core.engineURL(name,self.location.href),onAbort:reason=>send({type:'error',jobId:job?.id,error:'计算引擎初始化失败：'+reason+'。请重新运行或使用本地版。'})});
    })().catch(e=>{loadController.abort();modulePromise=null;throw e;});}return modulePromise;
  }
  function cleanup(){if(pollTimer)clearInterval(pollTimer);pollTimer=null;if(session){session.delete();session=null;}busy=false;job=null;}
  function parsed(message){const result=core.checked(job.problem,core.parseCertificate(job.problem,message.certificate,message.output,Number(message.output?.Time)||0),CuttingGeometry);return {...message,result};}
  self.onmessage=async event=>{const m=event.data;if(m.type==='stop'){stopped=true;loadController?.abort();if(session)session.stop();return;}if(m.type!=='solve')return;if(busy){send({type:'error',jobId:m.jobId,error:'已有求解任务正在运行。'});return;}busy=true;stopped=false;job={id:m.jobId,problem:CuttingGeometry.normalize(m.problem)};
    try{const p=job.problem;if(core.BASELINES.includes(p.settings.engine)){send({type:'started',jobId:m.jobId,problemType:p.kind,source:'javascript-constructive-state'});const result=await core.baseline(p,raw=>{const result=core.checked(p,raw,CuttingGeometry);send({type:'solution',jobId:m.jobId,result,output:{Time:result.elapsed_s,Solution:result.solver_statistics},source:'javascript-constructive-state'});},()=>stopped);send({type:'done',jobId:m.jobId,result:core.checked(p,result,CuttingGeometry),source:'javascript-constructive-state',stopped});cleanup();return;}
      send({type:'loading',jobId:m.jobId});const mod=await loadWasm();if(stopped){send({type:'done',jobId:m.jobId,stopped:true});cleanup();return;}const native=core.nativeInstance(p);send({type:'started',jobId:m.jobId,native_instance:native.instance,problemType:native.problemType});session=new mod.Session();const error=session.start(native.problemType,JSON.stringify(native.instance),JSON.stringify(native.parameters));if(error)throw Error(JSON.parse(error).error||error);
      pollTimer=setInterval(()=>{try{const message=JSON.parse(session.poll());for(const s of message.solutions||[]){try{send({type:'solution',jobId:m.jobId,...parsed(s),source:'wasm-session-callback'});}catch(error){send({type:'candidate-error',jobId:m.jobId,error:error.message,output:s.output,certificate:s.certificate});}}if(message.done){const r=message.result;if(r.error)throw Error(r.error);send({type:'done',jobId:m.jobId,...parsed(r),stopped});cleanup();}}catch(error){send({type:'error',jobId:m.jobId,error:error.message});cleanup();}},100);
    }catch(error){send({type:'error',jobId:m.jobId,error:error.message});cleanup();}
  };send({type:'ready',engine_version:'wasm-'+core.COMMIT.slice(0,12),wasm_loaded:false});
}
}
