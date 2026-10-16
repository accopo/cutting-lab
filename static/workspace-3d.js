import './viewer-3d.js';
const byId=id=>document.getElementById(id),copy=v=>JSON.parse(JSON.stringify(v));
const state3={problem:null,job:null,active:null,view:'model',bin:0,viewer:null,timer:null,previewTimer:null,initializing:true,loading:false,submitting:false,polling:false,cancelling:false,cancelRequested:false,viewRevision:0,loadRevision:0,presetKey:null,progress:null,settingsOpen:false};
const importedPresets=new Map();
const format=v=>Number.isFinite(Number(v))?Number(v).toLocaleString('zh-CN',{maximumFractionDigits:2}):'—';
const statusLabels={queued:'排队中',running:'计算中',completed:'已完成',cancelled:'已停止',failed:'失败'};
function el(tag,attrs={},children=[]){const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k==='text')n.textContent=v;else if(k.startsWith('on'))n.addEventListener(k.slice(2),v);else if(k in n)n[k]=v;else n.setAttribute(k,v);}for(const c of children)n.append(c);return n;}
async function request(url,opts={}){const r=await fetch(url,{...opts,headers:{'Content-Type':'application/json'},cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'本机请求失败');return d;}
function error3(message=''){byId('box-error').textContent=message;byId('box-error').hidden=!message;}
function save3(name,value,type='application/json'){const url=URL.createObjectURL(new Blob([value],{type}));const a=el('a',{href:url,download:name});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function updateControls(){
  const ready=!!state3.problem&&!state3.initializing&&!state3.loading;
  byId('box-run').disabled=!ready||state3.submitting||!!state3.active;
  const activeLabel=state3.active&&window.CuttingLab.jobPhase(state3.active)==='正在加载计算引擎'?'正在加载引擎…':'三维任务进行中';
  byId('box-run').textContent=state3.submitting?'正在提交…':state3.active?activeLabel:'开始三维装箱';
  byId('box-run-top').disabled=byId('box-run').disabled;byId('box-run-top').textContent=state3.submitting?'正在提交…':state3.active?activeLabel:'运行三维装箱';
  byId('box-cancel').hidden=!state3.active;
  byId('box-cancel').disabled=state3.cancelling||state3.cancelRequested;
  byId('box-cancel').textContent=state3.cancelling?'正在请求停止…':state3.cancelRequested?'等待任务停止…':'停止三维任务';
  byId('box-cancel-top').hidden=byId('box-cancel').hidden;byId('box-cancel-top').disabled=byId('box-cancel').disabled;byId('box-cancel-top').textContent=byId('box-cancel').textContent;
  byId('box-export').disabled=!ready;
  byId('box-add').disabled=!ready;
  byId('box-snapshot').disabled=!ready;
  for(const id of ['box-name','box-stock-width','box-stock-height','box-stock-depth','box-stock-copies','box-maximum-weight','box-objective','box-rotation','box-time'])byId(id).disabled=!ready||(id==='box-stock-copies'&&state3.problem?.settings.objective==='knapsack');
  byId('box-items').querySelectorAll('input, select, button').forEach(control=>control.disabled=!ready);
  if(document.body.classList.contains('box-mode')){document.body.classList.toggle('is-running',!!state3.active||state3.submitting);document.body.dataset.runState=state3.active?(state3.active.progress?.state||state3.active.status):state3.submitting?'submitting':'idle';}
}
function setSettings3(open,field=null){state3.settingsOpen=!!open;byId('box-experiment-settings').hidden=!open;byId('box-settings-toggle').setAttribute('aria-expanded',String(!!open));byId('box-settings-toggle').classList.toggle('is-open',!!open);if(open){window.CuttingLab.setCanvasFocus(false);if(field)requestAnimationFrame(()=>{byId(field)?.focus({preventScroll:true});byId(field)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});});}}
function renderSummary3(){const p=state3.problem;if(!p)return;const entries=[['容器',`${format(p.stock.width)} × ${format(p.stock.height)} × ${format(p.stock.depth)} mm`,'box-stock-width'],['方向',p.settings.rotation==='none'?'保持原向':'六种轴对齐朝向','box-rotation'],['限重',p.stock.maximum_weight!=null?format(p.stock.maximum_weight):'未启用','box-maximum-weight'],['预算',`${p.settings.time_limit} 秒`,'box-time']];byId('box-experiment-summary').replaceChildren(...entries.map(([label,value,field])=>el('button',{type:'button',className:'summary-chip',title:'修改'+label,onclick:()=>setSettings3(true,field)},[el('span',{className:'summary-label label',text:label}),el('strong',{className:'summary-value value',text:value})])));}
function clearDisplayedResult(){state3.job=null;state3.view='model';state3.bin=0;if(!state3.active)state3.progress?.reset();renderBins();updateMetrics();selection3(null);}
function inputSignature(p){if(!p)return '';return JSON.stringify({items:p.items.map(i=>({id:i.id,name:i.name,width:i.width,height:i.height,depth:i.depth,quantity:i.quantity,profit:i.profit,weight:i.weight||0,allowed_rotations:i.allowed_rotations||null})),stock:p.stock,objective:p.settings.objective,rotation:p.settings.rotation,time:p.settings.time_limit});}
function currentJob3(){return state3.view==='model'?null:state3.view==='live'?state3.progress?.current()?.job||null:state3.job;}
function currentStale(){const job=currentJob3();return job&&inputSignature(job.submitted_problem||job.problem)!==inputSignature(state3.problem);}
function showThree(){window.CuttingLab.showTab('three');document.body.classList.add('box-mode');requestAnimationFrame(()=>draw3());refresh3();}
function dispose3(){if(state3.viewer){(state3.viewer.destroy||state3.viewer.dispose)?.call(state3.viewer);state3.viewer=null;}}
function selection3(value){const i=value?.item||value||{};byId('box-selection').textContent=i.name?`${i.name}　长 ${format(i.width)} × 宽 ${format(i.height)} × 高 ${format(i.depth)} mm${i.x!=null?`　位置 (${format(i.x)}, ${format(i.y)}, ${format(i.z)})`:''}${i.rotation?`　朝向 ${i.rotation}`:''}${Number.isFinite(i.weight)?`　单件重量 ${format(i.weight)}`:''}`:'拖动旋转视角，滚轮缩放，点击箱体查看尺寸与位置。';}
function draw3({preserveView=false}={}){
  if(!state3.problem||!document.body.classList.contains('box-mode'))return;
  const savedView=preserveView?state3.viewer?.getViewState?.():null;dispose3();const container=byId('box-stage');container.replaceChildren();
  const opts={onSelect:selection3,units:'mm'};
  try{
    const job=currentJob3();
    state3.progress?.setVisible(state3.view==='live'||state3.view==='result'&&job?.id===state3.progress.jobId);
    if(state3.view!=='model'&&job?.result?.bins?.length){state3.viewer=window.Cutting3DViewer.renderResult(container,job.result,{...opts,binIndex:state3.bin});}
    else if(state3.view==='live'){container.append(el('div',{className:'box-waiting'},[el('strong',{text:'等待第一份真实三维方案'}),el('p',{text:'收到引擎实际生成的三维布局后，这里会自动更新。'})]));}
    else state3.viewer=window.Cutting3DViewer.mount(container,{stock:state3.problem.stock,items:state3.problem.items,...opts});
    if(savedView)state3.viewer?.setViewState?.(savedView);
    selection3(null);
  }catch(e){error3('三维视图未能创建：'+e.message);}
  byId('box-view-model').classList.toggle('active',state3.view==='model');byId('box-view-result').classList.toggle('active',state3.view==='result');byId('box-view-live').classList.toggle('active',state3.view==='live');byId('box-view-live').disabled=!state3.progress?.jobId;
}
function updateNote(){
 const note=byId('box-result-note'),job=currentJob3();
 if(state3.view==='model'){note.textContent='参数建模预览：每种箱体展示一件及数量，不是装箱结果。长 X / 宽 Y 为水平面，高 Z 向上。';note.classList.remove('stale');return;}
 const r=job?.result;if(!r){note.textContent='等待真实三维方案；计算状态和事件记录显示在下方。';return;}
 const stale=currentStale();note.classList.toggle('stale',!!stale);
 const prefix=job.preview?(job.status==='cancelled'?'已停止，保留最近真实中间方案。 ':'真实中间方案，最终结论以任务完成后的独立校验为准。 '):r.validation?.pass?'三维几何与已启用的重量约束校验通过。 ':'三维校验未通过，请查看结果。 ';
 note.textContent=(stale?'参数已修改，当前布局仍使用保存的任务输入。 ':'')+prefix+(job.problem.settings.objective==='knapsack'?`单容器选件，选中价值 ${format(r.metrics.profit)}。 `:r.full?'全部需求已装入。 ':'尚未装入全部需求。 ')+(r.warnings||[]).join(' ');
 const bin=r.bins?.[state3.bin];byId('box-weight-status').textContent=bin?.total_weight!=null?`当前容器重量 ${format(bin.total_weight)}${bin.maximum_weight!=null?' / '+format(bin.maximum_weight):''}（统一重量单位；示例为 kg）`:'容器重量约束与尺寸约束分别检查。';
}
function updateMetrics(){const job=currentJob3(),m=job?.result?.metrics,objective=(job?.problem||state3.problem)?.settings.objective;byId('box-metric-objective-label').textContent=objective==='knapsack'?'选件总价值':'使用容器';byId('box-metric-util').textContent=m?format(m.utilization_percent)+'%':'—';byId('box-metric-bins').textContent=m?format(objective==='knapsack'?m.profit:m.bin_count):'—';byId('box-metric-count').textContent=m?`${m.placed_pieces} / ${m.required_pieces}`:'—';byId('box-metric-time').textContent=job?.result?format(job.result.elapsed_s)+' 秒':'—';byId('box-view-result').disabled=!state3.job?.result;for(const[id,order]of[['box-metric-bins',0],['box-metric-count',1],['box-metric-util',2],['box-metric-time',3]]){const card=byId(id).closest('.box-metric');card.classList.toggle('is-primary',order===0);card.classList.toggle('is-quality',order===1);card.style.order=order;}updateNote();}
function changed(){if(!state3.problem)return;error3();updateNote();renderSummary3();if(!state3.active)byId('box-status').textContent='输入已修改 · 待重新计算';if(state3.view==='model'){clearTimeout(state3.previewTimer);state3.previewTimer=setTimeout(()=>draw3({preserveView:true}),250);}}
function renderRows(){const tbody=byId('box-items');tbody.replaceChildren();if(!state3.problem)return;state3.problem.items.forEach((item,idx)=>{
  const tr=el('tr');for(const field of ['name','width','height','depth','quantity','profit','weight']){const input=el('input',{type:field==='name'?'text':'number',value:item[field]??(field==='weight'?0:''),min:field==='name'?undefined:field==='weight'?0:1,step:['weight','profit'].includes(field)?'any':1,'aria-label':`${item.name} ${({name:'名称',width:'长',height:'宽',depth:'高',quantity:'数量',profit:'价值',weight:'重量'})[field]}`});input.dataset.field=field;input.addEventListener('input',()=>{item[field]=field==='name'?input.value:Number(input.value);changed();});tr.append(el('td',{},[input]));}
  const originalDirections=Array.isArray(item.allowed_rotations)?copy(item.allowed_rotations):null;
  const fixed=originalDirections?.length===1&&originalDirections[0]==='XYZ';
  const all=!originalDirections||(['XYZ','XZY','YXZ','YZX','ZXY','ZYX'].every(a=>originalDirections.includes(a))&&originalDirections.length===6);
  const custom=!!originalDirections&&!fixed&&!all;
  const orientation=el('select',{'aria-label':`${item.name} 单件朝向`,title:(originalDirections||['XYZ','XZY','YXZ','YZX','ZXY','ZYX']).join(' / ')},[el('option',{value:'all',text:'允许换向'}),el('option',{value:'fixed',text:'保持原向'}),el('option',{value:'custom',text:'指定方向（保留导入）',disabled:!custom})]);
  orientation.value=fixed?'fixed':all?'all':'custom';
  orientation.addEventListener('change',()=>{if(orientation.value==='fixed')item.allowed_rotations=['XYZ'];else if(orientation.value==='custom')item.allowed_rotations=copy(originalDirections);else delete item.allowed_rotations;orientation.title=(item.allowed_rotations||['XYZ','XZY','YXZ','YZX','ZXY','ZYX']).join(' / ');changed();});tr.append(el('td',{},[orientation]));tr.append(el('td',{},[el('button',{type:'button',className:'box-remove',text:'移除',onclick:()=>{if(state3.problem.items.length===1)return error3('请至少保留一种零件。');state3.problem.items.splice(idx,1);renderRows();changed();}})]));tbody.append(tr);
  });}
function renderForm(){const p=state3.problem;if(!p){updateControls();return;}byId('box-name').value=p.name;byId('box-maximum-weight').value=p.stock.maximum_weight??p.stock.weight_capacity??'';for(const key of ['width','height','depth','copies'])byId('box-stock-'+key).value=p.stock[key];byId('box-objective').value=p.settings.objective;byId('box-rotation').value=p.settings.rotation;byId('box-time').value=p.settings.time_limit;byId('box-stock-copies').disabled=p.settings.objective==='knapsack';byId('box-stock-note').textContent=p.settings.objective==='knapsack'?'本目标只使用一个容器，允许只选部分零件。':'按相同尺寸的多个容器优化使用数量。';renderRows();renderSummary3();updateMetrics();updateControls();draw3();}
async function loadPreset(id){
  if(!id)return error3('当前没有可用的三维示例，可导入自己的三维方案。');
  const revision=++state3.loadRevision;state3.loading=true;updateControls();
  try{error3();const problem=importedPresets.has(id)?copy(importedPresets.get(id)):await request('/api/datasets/'+encodeURIComponent(id));if(revision!==state3.loadRevision)return;state3.problem=problem;state3.presetKey=id;state3.viewRevision++;clearDisplayedResult();renderForm();if(!state3.active)byId('box-status').textContent='模型已载入，修改后可开始计算。';}
  catch(e){if(revision===state3.loadRevision)error3(e.message);}
  finally{if(revision===state3.loadRevision){state3.loading=false;updateControls();}}
}
function validate3(p=state3.problem){
  if(!p||typeof p!=='object'||p.kind!=='box'||p.settings?.engine!=='box')throw Error('请选择或导入有效的三维长方体方案（kind 和 engine 均为 box）。');
  if(!p.stock||typeof p.stock!=='object'||!Array.isArray(p.items)||!p.items.length||p.items.length>60)throw Error('需要有效容器和 1 至 60 种箱体模型。');
  if(!['bins','knapsack'].includes(p.settings.objective)||!['none','orthogonal'].includes(p.settings.rotation))throw Error('三维目标仅支持最少容器数 / 单容器选件，朝向仅支持保持原向 / 六种轴对齐朝向。');
  for(const k of ['width','height','depth','copies'])if(!Number.isInteger(p.stock[k])||p.stock[k]<=0||p.stock[k]>(k==='copies'?100:1e6))throw Error('容器尺寸须为 1 至 1000000 的整数，容器数量须为 1 至 100 的整数。');
  if(!Number.isFinite(p.settings.time_limit)||p.settings.time_limit<1||p.settings.time_limit>60)throw Error('求解时限为 1 到 60 秒。');
  for(const i of p.items){if(!i||typeof i!=='object')throw Error('每种箱体模型必须包含长、宽、高和数量。');for(const k of ['width','height','depth','quantity','profit'])if(!Number.isFinite(i[k])||i[k]<=0||(k!=='profit'&&!Number.isInteger(i[k]))||i[k]>(k==='profit'?1e12:k==='quantity'?500:1e6))throw Error('零件尺寸与数量必须为正整数，单件价值必须为正数，且不得超出本机演示范围。');}
  const cap=p.stock.maximum_weight??p.stock.weight_capacity;if(cap!=null&&(!Number.isFinite(cap)||cap<=0||cap>1e12))throw Error('容器总重量上限必须为正数；留空表示不启用。');
  if(p.items.some(i=>!Number.isFinite(i.weight??0)||(i.weight??0)<0||(cap!=null&&(i.weight??0)<=0)))throw Error('单件重量须为非负数；启用限重时每种零件都需要正重量。');
  if(p.items.reduce((s,i)=>s+i.quantity,0)>500)throw Error('单次最多 500 件零件。');
}
async function run3(){
  if(state3.active||state3.submitting)return error3('已有三维任务正在运行或排队，请等待结束或先停止该任务。');
  if(state3.initializing||state3.loading)return error3('模型正在载入，请稍后再开始计算。');
  try{error3();validate3();state3.submitting=true;setSettings3(false);updateControls();const submitted=copy(state3.problem),viewRevision=state3.viewRevision;const j=await request('/api/jobs',{method:'POST',body:JSON.stringify({problem:submitted})});state3.active={...j,submitted,viewRevision};state3.job=null;state3.view='live';state3.bin=0;state3.progress.begin(j,submitted);byId('box-status').textContent='任务已提交，等待本地三维引擎。';showThree();renderBins();updateMetrics();draw3();requestAnimationFrame(()=>byId('box-stage').closest('.box-view-card').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}));poll3();}
  catch(e){error3(e.message);}finally{state3.submitting=false;updateControls();}
}
async function poll3(){
  if(!state3.active||state3.polling)return;
  clearTimeout(state3.timer);const active=state3.active;state3.polling=true;
  try{
    const j=await request('/api/jobs/'+encodeURIComponent(active.id));if(state3.active?.id!==active.id)return;
    state3.active={...active,...j,submitted:active.submitted,viewRevision:active.viewRevision};updateControls();
    byId('box-status').textContent=`${window.CuttingLab.jobPhase(j)} · 已用 ${format(j.elapsed_s)} 秒`;
    const waiting=byId('box-stage').querySelector('.box-waiting p');if(waiting)waiting.textContent=['loading','loading-wasm'].includes(j.progress?.state)?'首次使用正在加载计算引擎，准备完成后才开始搜索。':'收到引擎实际生成的三维布局后，这里会自动更新。';
    if(!state3.progress.jobId)state3.progress.begin(j,j.submitted_problem||active.submitted||j.problem);state3.progress.ingest({...j,submitted_problem:j.submitted_problem||active.submitted||j.problem});
    if(['completed','failed','cancelled'].includes(j.status)){
      if(!j.submitted_problem)j.submitted_problem=active.submitted;
      state3.active=null;state3.cancelling=false;state3.cancelRequested=false;state3.progress.finish(j);updateControls();
      if(j.status==='completed'&&j.result){
        if(active.viewRevision===state3.viewRevision){state3.job=j;if(state3.progress.following)state3.view='result';state3.bin=0;renderBins();updateMetrics();draw3();}
        else window.CuttingLab.toast('三维任务已完成并保存到历史，当前查看的方案保持不变。');
      }else if(j.status==='failed')error3(j.error||'三维计算失败');
      else {if(state3.view==='live'){renderBins();updateMetrics();draw3();}window.CuttingLab.toast(state3.progress.snapshots.length?'三维任务已停止，最近真实布局与过程快照已保留。':'三维任务已停止，尚未收到真实布局。');}
      refresh3();window.CuttingLab.refreshHistory();
    }
  }catch(e){error3(e.message);byId('box-status').textContent='任务连接中断，正在重试读取状态…';}
  finally{state3.polling=false;if(state3.active)state3.timer=setTimeout(poll3,700);}
}
function renderBins(){const bins=currentJob3()?.result?.bins||[];state3.bin=Math.min(state3.bin,Math.max(0,bins.length-1));byId('box-bin').replaceChildren(...bins.map((b,i)=>el('option',{value:i,text:`容器 ${i+1} · ${b.items.length} 件`})));byId('box-bin').hidden=bins.length===0;byId('box-bin').value=state3.bin;}
async function refresh3({recoverActive=false}={}){try{const data=await request('/api/jobs');const jobs=(data.jobs||[]).filter(j=>j.engine==='box');const list=byId('box-history');list.replaceChildren();if(!jobs.length)list.append(el('p',{text:'完成首次计算后，三维结果会保存在这里。',className:'box-small'}));for(const j of jobs.slice(0,15)){const m=j.result?.metrics||{};const summary=el('div',{},[el('strong',{text:j.name}),el('small',{text:`${new Date(j.created_at).toLocaleString('zh-CN')} · ${statusLabels[j.status]}${m.utilization_percent!=null?' · 体积利用率 '+format(m.utilization_percent)+'%':''}`})]);list.append(el('div',{className:'box-history-row'},[summary,el('button',{text:'打开',onclick:async()=>{try{await openJob3(await request('/api/jobs/'+encodeURIComponent(j.id)));}catch(e){error3(e.message);}}})]));}
  if(recoverActive&&!state3.active&&!state3.submitting){const existing=jobs.find(j=>['running','queued'].includes(j.status));if(existing){state3.active={...existing,viewRevision:-1};updateControls();poll3();}}
 }catch(e){error3(e.message);}}
async function openJob3(job){
  const problem=job?.submitted_problem||job?.problem;
  if(!problem||problem.kind!=='box'||problem.settings?.engine!=='box')return error3('该历史任务没有有效的三维模型。');
  state3.loadRevision++;state3.loading=false;state3.viewRevision++;
  const otherRunning=state3.active&&state3.active.id!==job.id,preview=job.progress?.preview_result||job.best_result;
  state3.problem=copy(problem);state3.job=job.result?job:otherRunning&&preview?{...job,result:preview,preview:true}:null;state3.view=state3.job?'result':preview?'live':'model';state3.bin=0;
  if(!state3.active||state3.active.id===job.id){state3.progress.begin(job,problem);state3.progress.ingest(job);if(['completed','failed','cancelled'].includes(job.status))state3.progress.finish(job);}
  if(['queued','running'].includes(job.status)){
    if(!state3.active){state3.active={...job,submitted:copy(state3.problem),viewRevision:state3.viewRevision};poll3();}
    else if(state3.active.id===job.id){state3.active.viewRevision=state3.viewRevision;state3.active.submitted=copy(state3.problem);}
    else window.CuttingLab.toast('已打开该任务的输入；运行状态与停止按钮仍跟踪原先的三维任务。');
  }
  error3();renderBins();renderForm();showThree();
}
function prepareImportedProblem(data){
  const raw=data&&typeof data==='object'&&!Array.isArray(data)&&data.problem?data.problem:data;
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.kind!=='box'||raw.settings?.engine!=='box')throw Error('请选择三维方案 JSON：kind 必须为 box，settings.engine 必须为 box。');
  const p=copy(raw);
  if(p.unit&&p.unit!=='mm')throw Error('当前三维工作台使用毫米（mm）。请先统一换算容器与所有零件尺寸，再导入。');
  p.unit='mm';p.name=typeof p.name==='string'&&p.name.trim()?p.name:'导入的三维方案';p.id=p.id||'box-import-'+Date.now();
  if(!p.stock||typeof p.stock!=='object'||Array.isArray(p.stock))throw Error('JSON 缺少有效的 stock 容器参数。');
  p.stock.copies??=20;p.settings={objective:'bins',rotation:'orthogonal',time_limit:10,spacing:0,edge:0,kerf:0,...p.settings};
  if(!Array.isArray(p.items))throw Error('JSON 需要 items 箱体模型列表。');
  p.items.forEach((item,index)=>{if(!item||typeof item!=='object'||Array.isArray(item))throw Error('箱体列表中存在无效项。');item.id??=index;item.name=typeof item.name==='string'?item.name:`箱体 ${index+1}`;item.quantity??=1;item.profit??=1;});
  p.defects??=[];p.source??={kind:'user-import',label:'本地三维 JSON 导入'};
  validate3(p);return p;
}
async function import3(event){
  const file=event.target.files?.[0];if(!file)return;
  try{
    error3();if(file.size>2*1024*1024)throw Error('三维方案文件不得超过 2 MB。');
    const data=JSON.parse(await file.text()),problem=prepareImportedProblem(data);
    const importKey='local-import-'+Date.now();
    state3.loadRevision++;state3.loading=false;state3.viewRevision++;state3.problem=problem;state3.presetKey=importKey;importedPresets.set(importKey,copy(problem));clearDisplayedResult();
    const preset=byId('box-preset');preset.append(el('option',{value:importKey,text:'本地导入 · '+problem.name}));preset.value=importKey;
    renderForm();
    if(!state3.active)byId('box-status').textContent='模型已导入，尚未计算；点击开始三维装箱生成可验证结果。';
    window.CuttingLab.toast(data?.last_result?'已导入模型参数；文件中的历史结果未载入，请重新计算。':'三维模型已导入，请检查尺寸与参数。');
  }catch(e){error3(e instanceof SyntaxError?'JSON 格式无法读取，请选择完整三维方案文件。':e.message);}
  finally{event.target.value='';updateControls();}
}
function addDrawButton(){const button=el('button',{type:'button',className:'button secondary draw-start',text:'自定义画图'});const target=byId('edit-items-link'),actions=byId('workspace-main-actions');actions.insertBefore(button,byId('run-quick'));button.addEventListener('click',()=>{
  if(!window.CuttingDrawEditor)return window.CuttingLab.toast('绘图编辑器正在准备，请刷新后重试。');window.CuttingDrawEditor.open({onSave:(points,name,quantity)=>{window.CuttingLab.addPolygon(points,name,quantity);window.CuttingLab.showTab('workspace');}});
  });
  const fresh=el('button',{type:'button',className:'button secondary small draw-start',text:'新建自绘场景'});byId('workspace-more-actions').prepend(fresh);fresh.addEventListener('click',()=>{
    if(!window.CuttingDrawEditor)return window.CuttingLab.toast('绘图编辑器正在准备，请刷新后重试。');window.CuttingDrawEditor.open({onSave:(points,name,quantity)=>{
      if(!Number.isInteger(quantity)||quantity<1||quantity>500)throw Error('裁片数量必须是 1 至 500 的整数。');
      if(!Array.isArray(points)||points.length<3||points.length>200||points.some(pt=>!Array.isArray(pt)||pt.length!==2||pt.some(v=>!Number.isFinite(v)||Math.abs(v)>1e7)))throw Error('轮廓需要 3 至 200 个有效顶点，坐标绝对值不得超过 10000000。');
      const p={id:'custom-drawing',name:'自绘裁片场景',industry:'apparel',kind:'irregular',unit:'mm',source:{kind:'user',label:'自定义画图'},items:[{id:0,name,quantity,polygon:points,allowed_rotations:[0,180],profit:1}],stock:{width:5000,height:1000,copies:20},settings:{engine:'irregular',objective:'strip',rotation:'source',custom_angles:[0,180],spacing:0,edge:0,kerf:0,time_limit:10,stages:3,first_cut:'vertical'},defects:[]};window.CuttingLab.setProblem(p,{tab:'workspace'});}});
  });
}
function build3(){
 const nav=document.querySelector('.top-nav'),button=el('button',{className:'nav-tab',type:'button',text:'三维装箱'});button.dataset.tab='three';nav.insertBefore(button,nav.children[1]);button.addEventListener('click',showThree);
 document.querySelectorAll('.nav-tab').forEach(b=>{if(b!==button)b.addEventListener('click',()=>{document.body.classList.remove('box-mode');dispose3();});});
 const page=el('section',{id:'page-three',className:'page box-workspace','aria-label':'三维建模与装箱'});page.innerHTML=`
 <div class="box-top"><div><span class="eyebrow">参数建模 / 三维布局</span><h2>把空间，也用得更好。</h2><p>建立箱体模型、设置方向，直接检查三维装箱方案。</p></div><div class="action-row" id="box-main-actions"><button type="button" id="box-settings-toggle" class="button secondary settings-toggle" aria-expanded="false" aria-controls="box-experiment-settings">实验设置</button><details class="action-menu"><summary>数据与导出</summary><div class="action-menu-content"><input id="box-import-file" type="file" accept=".json,application/json" aria-label="选择三维方案 JSON 文件" hidden><button type="button" id="box-import" class="button secondary">导入三维方案</button><button type="button" id="box-export" class="button secondary" disabled>导出三维方案</button></div></details><button type="button" id="box-run-top" class="button primary" title="运行三维装箱（Ctrl + Enter）" disabled>运行三维装箱</button><button type="button" id="box-cancel-top" class="button danger" hidden>停止三维任务</button></div></div>
 <p id="box-error" class="box-error" role="alert" hidden></p><div class="box-grid"><aside class="box-sidebar">
 <div class="box-card"><h3>模型与场景</h3><label for="box-preset">示例场景</label><select id="box-preset"></select><label for="box-name">方案名称</label><input id="box-name"><p class="box-small">模型为可编辑长方体，尺寸单位为毫米。示例由本地合成。</p></div>
 <div class="box-card"><h3>容器尺寸</h3><div class="box-fields"><div><label for="box-stock-width">长 X</label><input type="number" min="1" step="1" id="box-stock-width"></div><div><label for="box-stock-height">宽 Y</label><input type="number" min="1" step="1" id="box-stock-height"></div><div><label for="box-stock-depth">高 Z</label><input type="number" min="1" step="1" id="box-stock-depth"></div></div><label for="box-stock-copies">最多可用容器数</label><input type="number" min="1" max="100" id="box-stock-copies"><p class="box-small" id="box-stock-note"></p><label for="box-maximum-weight">容器总重量上限</label><input type="number" min="0" step="any" id="box-maximum-weight" placeholder="留空表示不限制"><p class="box-small">重量使用同一单位（示例为 kg）。启用限重后，请填写所有零件的正重量。</p></div>
 <div class="box-card"><h3>装箱策略</h3><label for="box-objective">优化目标</label><select id="box-objective"><option value="bins">装入全部零件 · 尽量少用容器</option><option value="knapsack">单个容器 · 优先选择高价值零件</option></select><label for="box-rotation">允许放置方向</label><select id="box-rotation"><option value="orthogonal">六种轴对齐朝向</option><option value="none">保持原始方向</option></select><label for="box-time">求解时限（秒）</label><input type="number" min="1" max="60" step="1" id="box-time"><p class="box-small">PackingSolver 三维引擎。每件的朝向设置可进一步收紧全局方向。支持容器总重量上限；不包含单件堆叠承重、重心与稳定性。</p><button class="button primary" id="box-run" disabled>开始三维装箱</button><button class="button danger" id="box-cancel" hidden>停止三维任务</button><p class="box-small" id="box-status" role="status">模型正在载入…</p></div></aside>
 <div><div class="box-metrics"><div class="box-metric"><span>体积利用率</span><strong id="box-metric-util">—</strong></div><div class="box-metric"><span id="box-metric-objective-label">使用容器</span><strong id="box-metric-bins">—</strong></div><div class="box-metric"><span>已装 / 需求</span><strong id="box-metric-count">—</strong></div><div class="box-metric"><span>计算用时</span><strong id="box-metric-time">—</strong></div></div>
 <div class="box-card box-view-card"><div class="box-view-toolbar"><button id="box-view-model" class="active">模型预览</button><button id="box-view-result" disabled>装箱结果</button><button id="box-view-live" disabled>实时预览</button><select id="box-bin" aria-label="查看容器" hidden></select><span class="box-view-spacer"></span><button id="box-snapshot" disabled>保存视图</button><button id="box-focus-toggle" class="canvas-focus-toggle" aria-pressed="false" title="专注画布；Esc 退出">专注画布</button></div><div class="box-stage" id="box-stage"></div><div class="box-selection" id="box-selection">拖动旋转视角，滚轮缩放，点击箱体查看尺寸与位置。</div><div class="box-result-note" id="box-result-note"></div><div class="box-weight-status" id="box-weight-status">重量与尺寸使用不同单位，分别校验。</div></div>
 <div class="box-card"><div class="box-card-head"><h3>自定义零件模型</h3><button type="button" id="box-add" class="button secondary small">＋ 添加箱体</button></div><p class="box-small">直接修改长、宽、高即可建模；每种零件可以设置数量、价值与朝向。</p><div class="box-table-wrap"><table class="box-table"><thead><tr><th>名称</th><th>长 X</th><th>宽 Y</th><th>高 Z</th><th>数量</th><th>单件价值</th><th>单件重量</th><th>朝向</th><th></th></tr></thead><tbody id="box-items"></tbody></table></div></div>
 <div class="box-card"><div class="box-card-head"><h3>三维计算记录</h3><button type="button" id="box-history-refresh" class="button secondary small">刷新</button></div><div id="box-history"></div></div></div></div>`;
 byId('main-content').append(page);
 const progressPanel=byId('process-card').cloneNode(true);progressPanel.id='box-process-card';progressPanel.querySelectorAll('[id]').forEach(n=>n.id=n.id.replace(/^process-/,'box-process-'));progressPanel.querySelectorAll('[for]').forEach(n=>n.setAttribute('for',n.getAttribute('for').replace(/^process-/,'box-process-')));const viewCard=byId('box-stage').closest('.box-view-card'),metricRail=page.querySelector('.box-metrics'),parameterDeck=page.querySelector('.box-sidebar'),precision=el('div',{className:'box-precision'});viewCard.before(precision);precision.append(viewCard,metricRail);precision.after(progressPanel);const summary=el('div',{id:'box-experiment-summary',className:'experiment-summary'});parameterDeck.id='box-experiment-settings';parameterDeck.hidden=true;precision.before(summary,parameterDeck);
 state3.progress=window.CuttingLab.createProgressTracker('box-process',frame=>{if(state3.view!=='live')return;renderBins();updateMetrics();draw3({preserveView:!!frame?.preserveView});});
 for(const key of ['width','height','depth','copies'])byId('box-stock-'+key).addEventListener('input',e=>{if(!state3.problem)return;state3.problem.stock[key]=Number(e.target.value);changed();});
 byId('box-maximum-weight').addEventListener('input',e=>{if(!state3.problem)return;delete state3.problem.stock.weight_capacity;if(e.target.value==='')delete state3.problem.stock.maximum_weight;else state3.problem.stock.maximum_weight=Number(e.target.value);changed();});
 byId('box-name').addEventListener('input',e=>{if(!state3.problem)return;state3.problem.name=e.target.value;changed();});
 byId('box-objective').addEventListener('change',e=>{if(!state3.problem)return;state3.problem.settings.objective=e.target.value;renderForm();changed();});
 byId('box-rotation').addEventListener('change',e=>{if(!state3.problem)return;state3.problem.settings.rotation=e.target.value;changed();});
 byId('box-time').addEventListener('input',e=>{if(!state3.problem)return;state3.problem.settings.time_limit=Number(e.target.value);changed();});
 byId('box-preset').addEventListener('change',e=>loadPreset(e.target.value));
 byId('box-add').addEventListener('click',()=>{if(!state3.problem)return error3('请先载入或导入三维模型。');if(state3.problem.items.length>=60)return error3('最多60种箱体。');const next=Math.max(-1,...state3.problem.items.map(i=>Number(i.id)||0))+1;state3.problem.items.push({id:next,name:`自定义箱体 ${next+1}`,width:200,height:150,depth:100,quantity:1,profit:1,weight:0});renderRows();changed();});
 byId('box-run').addEventListener('click',run3);byId('box-run-top').addEventListener('click',run3);byId('box-cancel-top').addEventListener('click',()=>byId('box-cancel').click());byId('box-cancel').addEventListener('click',async()=>{if(!state3.active||state3.cancelling||state3.cancelRequested)return;const activeId=state3.active.id;state3.cancelling=true;updateControls();try{await request('/api/jobs/'+encodeURIComponent(activeId)+'/cancel',{method:'POST'});if(state3.active?.id===activeId){state3.cancelRequested=true;byId('box-status').textContent='已提交停止请求，等待任务终止…';}}catch(e){error3(e.message);}finally{state3.cancelling=false;updateControls();}});
 byId('box-view-live').addEventListener('click',()=>{state3.view='live';state3.progress.followLatest();renderBins();updateMetrics();draw3();});
 byId('box-view-model').addEventListener('click',()=>{state3.view='model';draw3();updateMetrics();});byId('box-view-result').addEventListener('click',()=>{state3.view='result';draw3();updateMetrics();});
 byId('box-bin').addEventListener('change',e=>{state3.bin=Number(e.target.value);if(state3.view!=='live')state3.view='result';draw3();updateMetrics();});
 byId('box-snapshot').addEventListener('click',()=>{try{if(!state3.viewer?.captureImage)throw Error('三维视图尚未准备好，请先打开模型预览。');const image=state3.viewer.captureImage();const bytes=Uint8Array.from(atob(image.split(',')[1]),c=>c.charCodeAt(0));save3('三维装箱视图.png',bytes,'image/png');}catch(e){error3(e.message);}});
 byId('box-export').addEventListener('click',()=>{if(!state3.problem)return error3('请先载入或建立三维模型。');save3('三维装箱方案.json',JSON.stringify({problem:state3.problem,last_result:currentJob3()||null},null,2));});
 byId('box-import').addEventListener('click',()=>byId('box-import-file').click());byId('box-import-file').addEventListener('change',import3);
 byId('box-history-refresh').addEventListener('click',refresh3);byId('box-settings-toggle').addEventListener('click',()=>setSettings3(!state3.settingsOpen));byId('box-focus-toggle').addEventListener('click',()=>window.CuttingLab.setCanvasFocus(!document.body.classList.contains('canvas-focus')));window.addEventListener('cutting-tab-change',e=>{if(e.detail.tab==='three')updateControls();});addDrawButton();
 window.CuttingBox={openJob:openJob3,show:showThree,run:run3,setSettingsOpen:setSettings3,loadProblem:(p,options={})=>{state3.loadRevision++;state3.loading=false;state3.viewRevision++;state3.problem=prepareImportedProblem(p);clearDisplayedResult();renderForm();if(options.show!==false)showThree();},getProblem:()=>state3.problem?copy(state3.problem):null};
 updateControls();
 request('/api/catalog').then(async c=>{const presets=c.box_datasets||[{id:'box-mixed',name:'混合箱体 · 最少容器'},{id:'box-value',name:'单容器 · 价值优先选件'}];byId('box-preset').replaceChildren(...presets.map(p=>el('option',{value:p.id,text:p.name})),...[...importedPresets.entries()].map(([key,p])=>el('option',{value:key,text:'本地导入 · '+p.name})));if(!state3.problem&&presets.length)await loadPreset(presets[0].id);else if(!state3.problem)error3('尚无三维示例，可使用「导入三维方案」载入自己的模型。');if(state3.problem)byId('box-preset').value=state3.presetKey||state3.problem.id;await refresh3({recoverActive:true});}).catch(e=>error3(e.message)).finally(()=>{state3.initializing=false;updateControls();});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build3,{once:true});else build3();
