"use strict";

const $ = id => document.getElementById(id);
const clone = value => JSON.parse(JSON.stringify(value));
const NS = "http://www.w3.org/2000/svg";
const PALETTE = ["#3878d8", "#16a28c", "#e7813f", "#d6ae27", "#9a74d3", "#dc678d", "#41a7ce", "#74a84c", "#cd7c51", "#6a83d2", "#30adad", "#c8a148"];
const OBJECTIVES = {strip:"定宽排料", bins:"整板装箱", knapsack:"单板选件"};
const ROTATIONS = {source:"原始方向", none:"0°", half:"0° / 180°", quarter:"90° 四方向", custom:"自定义角度", continuous:"连续旋转"};
const STATUS = {queued:"排队中", running:"计算中", completed:"已完成", failed:"失败", cancelled:"已停止"};
function jobPhase(job) { return ["loading","loading-wasm"].includes(job?.progress?.state)&&["queued","running"].includes(job?.status)?"正在加载计算引擎":STATUS[job?.status]||job?.status||"准备中"; }
const state = {catalog:null, problem:null, original:null, resultJob:null, activeJob:null, history:[], compare:new Set(), view:"original", bin:0, showCuts:true, baseView:null, viewBox:null, pan:null, timer:null, polling:false, tab:"workspace", vertexDraft:null, vertexIndex:null, selection:null,submitting:false,cancelRequested:false,progress:null};
const submittedSnapshots = new Map();
state.datasetRevision=0;state.loadingDataset=false;state.draftRollback=null;state.settingsOpen=false;

function node(tag, props = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k,v] of Object.entries(props)) {
    if (k === "text") n.textContent = v;
    else if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k in n && !k.startsWith("aria")) n[k] = v;
    else n.setAttribute(k, v);
  }
  for (const child of (Array.isArray(children) ? children : [children])) if (child != null) n.append(typeof child === "string" ? document.createTextNode(child) : child);
  return n;
}
function svgNode(tag, attrs = {}, children = []) {
  const n = document.createElementNS(NS, tag);
  for (const [k,v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, String(v));
  for (const child of children) n.append(typeof child === "string" ? document.createTextNode(child) : child);
  return n;
}
function text(id, value) { $(id).textContent = value; }
function fmt(v, digits = 2) { return Number.isFinite(Number(v)) ? Number(v).toLocaleString("zh-CN", {maximumFractionDigits:digits}) : "—"; }
function safeURL(url) { try { const u = new URL(url); return ["http:","https:"].includes(u.protocol) ? u.href : null; } catch { return null; } }
function engineName(id) { return state.catalog?.engines.find(e => e.id === id)?.label || id; }
function unitName(p = state.problem) { return p?.unit === "mm" ? "mm" : p?.unit === "benchmark" ? "基准单位" : p?.unit && !["unit","unspecified"].includes(p.unit) ? p.unit : "未指定单位"; }
function totalPieces(p = state.problem) { return (p?.items || []).reduce((n,x) => n + Number(x.quantity || 0), 0); }
function canonicalPolygon(points) {
  if (!Array.isArray(points) || points.length < 3) return points;
  let ring = points.map(p => [...p]);
  if (ring.length > 3 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]) ring.pop();
  const candidates = [];
  for (const direction of [ring, [...ring].reverse()]) {
    let index = 0;
    for (let i = 1; i < direction.length; i++) if (direction[i][0] < direction[index][0] || (direction[i][0] === direction[index][0] && direction[i][1] < direction[index][1])) index = i;
    candidates.push(JSON.stringify([...direction.slice(index), ...direction.slice(0, index)]));
  }
  return JSON.parse(candidates.sort()[0]);
}
function signature(p) {
  const clean = (value, key = "") => {
    if (key === "polygon") return canonicalPolygon(value);
    if (Array.isArray(value)) return value.map(v => clean(v));
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.keys(value).sort().filter(k => !["source", "description", "area", "submitted_problem"].includes(k) && !k.startsWith("effective_")).map(k => [k, clean(value[k], k)]));
  };
  return JSON.stringify(clean(p));
}
function modified() { return state.original && signature(state.problem) !== signature(state.original); }
function displayJob() { return state.view === "original"?null:state.view === "live" ? state.progress?.current()?.job || null : state.resultJob; }
function stale(job=displayJob()) { return job && signature(job.submitted_problem || submittedSnapshots.get(job.id) || job.problem) !== signature(state.problem); }
function angles(item, p = state.problem) {
  const r = p.settings.rotation;
  return r === "source" ? (item.allowed_rotations || [0]) : r === "none" ? [0] : r === "half" ? [0,180] : r === "quarter" ? [0,90,180,270] : r === "custom" ? p.settings.custom_angles : null;
}
function color(id) { const s = String(id); let hash = 0; for (const c of s) hash = ((hash * 31) + c.charCodeAt(0)) >>> 0; return PALETTE[hash % PALETTE.length]; }
function toast(message) { text("toast",message); $("toast").hidden=false; clearTimeout(toast._timer); toast._timer=setTimeout(()=>$("toast").hidden=true,4200); }
function alertError(message) { text("global-alert",message); $("global-alert").hidden=!message; }
async function api(url, options = {}) {
  let response;
  try { response = await fetch(url,{...options,headers:{"Content-Type":"application/json",...options.headers},cache:"no-store"}); }
  catch { throw new Error("无法连接本机服务，请确认裁切实验室已启动。"); }
  let data;
  try { data = await response.json(); } catch { throw new Error(`本机服务返回了无法读取的响应（${response.status}）。`); }
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}
function download(name, data, type = "application/json") {
  const blob = new Blob([data],{type}); const url=URL.createObjectURL(blob);
  const a=node("a",{href:url,download:name}); document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function safeName(name) { return String(name || "cutting-lab").replace(/[<>:"/\\|?*\u0000-\u001f]/g,"_").slice(0,90); }
function tab(name) {
  if(name!==state.tab)setCanvasFocus(false);
  state.tab=name; document.body.dataset.mode=name; document.body.classList.toggle("box-mode",name==="three");
  document.querySelectorAll(".nav-tab").forEach(b=>{const active=b.dataset.tab===name; b.classList.toggle("active",active); if(active)b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current");});
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===`page-${name}`));
  if(name==="history") refreshHistory();
  if(name!=="three")syncRunButtons();
  window.dispatchEvent(new CustomEvent("cutting-tab-change",{detail:{tab:name}}));
}

function populateIndustries() {
  $("industry").replaceChildren(...state.catalog.industries.map(i=>node("option",{value:i.id,text:i.label})));
  $("industry-shortcuts").replaceChildren(node("span",{text:"应用行业"}),...state.catalog.industries.map(i=>node("button",{type:"button",text:i.label,"data-industry":i.id,onclick:()=>loadDataset(populateDatasets(i.id))})));
}
function populateDatasets(industry, selected) {
  const list=state.catalog.datasets.filter(d=>d.industry===industry);
  $("dataset").replaceChildren(...list.map(d=>node("option",{value:d.id,text:d.name})));
  if(selected && list.some(d=>d.id===selected))$("dataset").value=selected;
  return $("dataset").value;
}
async function loadDataset(id) {
  if(!id)return;
  const revision=++state.datasetRevision,previous=state.problem?{problem:clone(state.problem),original:state.original?clone(state.original):null}:null;
  alertError("");state.loadingDataset=true;syncRunButtons();
  try {
    const p=await api(`/api/datasets/${encodeURIComponent(id)}`);
    if(revision!==state.datasetRevision)return;
    if(previous&&previous.problem.id!==p.id){state.draftRollback=previous;$("draft-notice").hidden=false;text("draft-notice-text",`已切换场景；“${previous.problem.name}”的上一份配置可撤回。`);}
    state.problem=clone(p); state.original=clone(p); state.view="original"; state.selection=null; state.resultJob=null;if(!state.activeJob)state.progress?.reset();
    renderProblem(); toast(`已载入 ${p.name}`);
  } catch(error) { if(revision===state.datasetRevision)alertError(error.message); }
  finally{if(revision===state.datasetRevision){state.loadingDataset=false;syncRunButtons();}}
}
function initializeMissing(p) {
  p.id ||= `local-${Date.now()}`; p.name ||= "本地导入方案"; p.industry ||= "apparel"; p.kind ||= "irregular"; p.unit ||= "unspecified";
  p.source ||= {kind:"user-import",label:"本地导入"}; p.defects ||= [];
  p.stock={width:1000,height:1000,copies:20,...p.stock};
  p.settings={engine:p.kind==="onedimensional"?"onedimensional":p.kind==="rectangle"?"rectangle":"irregular",objective:p.kind==="onedimensional"?"bins":"strip",rotation:"source",custom_angles:[0,180],spacing:0,edge:0,kerf:0,time_limit:10,stages:3,first_cut:"vertical",...p.settings};
  p.items.forEach((i,index)=>{if(i.id==null)i.id=index;i.name ||= `裁片 ${index+1}`;i.quantity ??=1;i.profit ??=1;i.allowed_rotations ||= [0];});
  return p;
}
function renderProblem() {
  const p=state.problem; if(!p)return;
  if(!state.catalog.industries.some(i=>i.id===p.industry))p.industry="apparel";
  $("industry").value=p.industry;
  populateDatasets(p.industry,p.id);
  if(!state.catalog.datasets.some(d=>d.id===p.id))$("dataset").append(node("option",{value:p.id,text:p.name,selected:true}));
  $("engine").replaceChildren(...state.catalog.engines.filter(e=>e.kinds.includes(p.kind)).map(e=>node("option",{value:e.id,text:e.label})));
  if(![...$("engine").options].some(o=>o.value===p.settings.engine))p.settings.engine=$("engine").value;
  $("engine").value=p.settings.engine;
  for(const [id,key] of [["objective","objective"],["rotation","rotation"],["spacing","spacing"],["edge","edge"],["kerf","kerf"],["time-limit","time_limit"],["stages","stages"],["first-cut","first_cut"]])$(id).value=p.settings[key];
  $("custom-angles").value=(p.settings.custom_angles||[0,180]).join(", ");
  $("stock-width").value=p.stock.width; $("stock-height").value=p.stock.height; $("stock-copies").value=p.stock.copies;
  renderCapabilities(); renderSource(); renderMeta(); renderItems(); renderDefects(); renderMetrics(); renderCanvas();
  $("export-problem").disabled=false; $("restore-original").disabled=!state.original;
}
function capabilities(p = state.problem) {
  const e=p?.settings.engine;
  return {spacing:["irregular","shelf"].includes(e), defects:["irregular","rectangle","guillotine"].includes(e), custom:["irregular","shelf"].includes(e), continuous:e==="irregular", kerf:["guillotine","onedimensional-kerf","ffd-1d","bfd-1d"].includes(e), integer:["rectangle","guillotine","onedimensional","onedimensional-kerf","ffd-1d","bfd-1d","rectpack-maxrects","rectpack-skyline"].includes(e), one:p?.kind==="onedimensional"};
}
function renderCapabilities() {
  const p=state.problem,c=capabilities(),e=state.catalog.engines.find(e=>e.id===p.settings.engine);
  text("engine-help",e?.description || "当前路线暂不可用。");
  [...$("objective").options].forEach(o=>o.disabled=!(e?.objectives || []).includes(o.value));
  [...$("rotation").options].forEach(o=>{o.disabled=c.one ? !["source","none"].includes(o.value) : o.value==="continuous" ? !c.continuous : o.value==="custom" ? !c.custom : false;});
  $("custom-angle-wrap").hidden=p.settings.rotation!=="custom";
  const sourceAngles=[...new Set(p.items.flatMap(i=>i.allowed_rotations||[0]))].sort((a,b)=>a-b);
  const rotationText=p.settings.rotation==="source"?`原始角度：${sourceAngles.map(a=>`${fmt(a)}°`).join(" / ")}。每种裁片保留各自约束。`:p.settings.rotation==="continuous"?"允许求解器在 0°—360° 范围搜索。真实服装需先确认布纹、顺毛与花纹要求。":p.settings.rotation==="quarter"&&p.industry==="apparel"?"90° 转向会改变经纬向。本次作为放宽方向约束的派生实验。":"角度相对输入轮廓；旋转不会改变裁片形状或数量。";
  text("rotation-help",c.one?"一维下料没有平面旋转参数。":rotationText);
  $("spacing").disabled=!c.spacing; $("edge").disabled=!c.spacing;
  $("kerf-wrap").hidden=!c.kerf && !c.one; $("kerf").disabled=!c.kerf;
  $("guillotine-wrap").hidden=p.settings.engine!=="guillotine";
  $("stages").value="3"; $("stages").disabled=true;
  text("processing-help",c.one?(c.kerf?"每件及末件均预留整数锯缝；不含端头修边、夹持余量。":"原始一维路线不计锯缝；可选择逐件锯缝 / FFD / BFD 路线设置刀缝。"):c.kerf?"三阶段贯通切割；板材尺寸、裁片尺寸和锯缝需为整数。":c.spacing?"间距是裁片间的最小净距，留边应用于材料边界。":c.integer?"当前路线的尺寸需为整数；间距与留边暂只接受 0。":"当前路线不支持间距、留边、刀缝和缺陷；这些参数须为 0。");
  $("stock-height-wrap").hidden=c.one;
  text("stock-width-label",c.one?"原材料长度":p.settings.objective==="strip"?"可用长度上限":"板材长度 X");
  text("stock-height-label",p.settings.objective==="strip"?"固定幅宽 Y":"板材宽度 Y");
  $("stock-copies-wrap").hidden=p.settings.objective!=="bins";
  text("stock-objective-note",p.settings.objective==="bins"?"相同规格材料可用多张 / 根；库存上限可调整。":p.settings.objective==="strip"?"本目标仅使用一条定宽材料，优化其占用长度。":"本目标仅使用一张 / 根材料，按价值选择裁片。");
  for(const id of ["stock-width","stock-height","kerf"])$(id).step=c.integer?"1":"any";
  text("unit-label",unitName()); text("time-value",`${p.settings.time_limit} 秒`);
  text("defects-help",c.defects?"可设置矩形禁排区域。":"当前路线不支持缺陷；已有区域需先移除才能计算。");
  $("add-defect").disabled=!c.defects;
  text("defect-editor-note",c.defects?"区域坐标与材料使用同一单位。禁排区不能越过材料边界。":"当前计算路线不支持缺陷。可删除现有区域，或切换到支持缺陷的 PackingSolver 路线。");
}
function renderSource() {
  const p=state.problem,source=p.source||{},pub=source.kind==="public-benchmark";
  const title=node("div",{class:"source-title"},[node("span",{class:"source-label",text:pub?"公开基准":source.kind==="synthetic"?"合成示例":"本地数据"}),node("span",{text:source.label||p.name})]);
  const parts=[title,node("p",{text:pub?"物理单位未知，按原始坐标计算。含轮廓与需求，不保证包含生产用纸样信息。":source.note||"用于展示问题与约束；实际生产前需用真实样件核验。"})];
  const url=safeURL(source.url); if(url)parts.push(node("a",{href:url,target:"_blank",rel:"noopener noreferrer",text:"查看数据来源 ↗"}));
  $("source-card").replaceChildren(...parts);
}
function renderMeta() {
  const p=state.problem;if(!p)return;
  text("scenario-title",p.name);text("scenario-subtitle",`${state.catalog.industries.find(i=>i.id===p.industry)?.description||"本地裁切实验"} · ${p.items.length} 种轮廓 / ${fmt(totalPieces(),0)} 片 · ${unitName()}`);
  const isModified=modified(); text("scenario-badge",isModified?"派生场景":p.source?.kind==="public-benchmark"?"公开基准":p.source?.kind==="synthetic"?"合成示例":"本地导入");
  $("scenario-badge").classList.toggle("derived",!!isModified);text("modified-state",isModified?"参数已修改":"原始场景");$("modified-state").classList.toggle("modified",!!isModified);
  text("required-count",`${fmt(totalPieces(),0)} 个裁片`);text("defect-count",`${p.defects.length} 处 →`);text("item-type-count",`${p.items.length} 种类型`);
  text("input-summary",`${p.items.length} 种类型 · 共 ${fmt(totalPieces(),0)} 片 · ${unitName()}。${p.unit==="benchmark"?"这些是公开排料轮廓，未确认物理尺寸；请勿把基准坐标直接当作毫米。":"尺寸按当前场景单位解释。数量、价值、尺寸和轮廓均可编辑。"}`);
  text("coordinate-note",p.unit==="benchmark"?"基准坐标 · 物理单位未知":`尺寸单位：${unitName()}`);
  syncRunButtons();
  document.querySelectorAll("#industry-shortcuts [data-industry]").forEach(b=>b.classList.toggle("active",b.dataset.industry===p.industry));
  renderResultContext();
  renderExperimentSummary();
}
function setSettingsOpen(open,field=null){
  state.settingsOpen=!!open;$("experiment-settings").hidden=!open;$("settings-toggle").setAttribute("aria-expanded",String(!!open));$("settings-toggle").classList.toggle("is-open",!!open);
  if(open){setCanvasFocus(false);if(field)requestAnimationFrame(()=>{const control=$(field);control?.closest("details")?.setAttribute("open","");control?.focus({preventScroll:true});control?.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"nearest"});});}
}
function setCanvasFocus(focus){
  document.body.classList.toggle("canvas-focus",!!focus);
  for(const id of ["focus-toggle","box-focus-toggle"]){const button=$(id);if(button){button.setAttribute("aria-pressed",String(!!focus));button.textContent=focus?"退出专注":"专注画布";}}
}
function renderExperimentSummary(){
  const p=state.problem;if(!p)return;
  const material=p.kind==="onedimensional"?`${fmt(p.stock.width)} ${unitName()}`:p.settings.objective==="strip"?`幅宽 ${fmt(p.stock.height)} · 长度 ≤ ${fmt(p.stock.width)} ${unitName()}`:`${fmt(p.stock.width)} × ${fmt(p.stock.height)} ${unitName()}`;
  const direction=p.settings.rotation==="custom"?`${p.settings.custom_angles.join("° / ")}°`:p.settings.rotation==="source"?`原始 · ${[...new Set(p.items.flatMap(i=>i.allowed_rotations||[0]))].join("° / ")}°`:ROTATIONS[p.settings.rotation];
  const entries=[["材料",material,"stock-width"],["方向",direction,"rotation"],["工具",engineName(p.settings.engine),"engine"],["预算",`${p.settings.time_limit} 秒`,"time-limit"]];
  $("experiment-summary").replaceChildren(...entries.map(([label,value,field])=>node("button",{type:"button",class:`summary-chip summary-${field}`,title:`修改${label}：${value}`,onclick:()=>setSettingsOpen(true,field)},[node("span",{class:"summary-label label",text:label}),node("strong",{class:"summary-value value",text:value})])),node("span",{class:`summary-state${modified()?" is-dirty":""}`,text:modified()?"配置已修改":state.original?"原始配置":"本地配置"}));
}
function changed({rebuildItems=false,rebuildDefects=false}={}) {
  renderCapabilities();renderMeta();if(rebuildItems)renderItems();if(rebuildDefects)renderDefects();if(state.view==="original")renderCanvas();
}
function coerceEngine() {
  const p=state.problem,c=capabilities(),e=state.catalog.engines.find(e=>e.id===p.settings.engine),changes=[];
  if(!e.objectives.includes(p.settings.objective)){p.settings.objective=e.objectives[0];$("objective").value=p.settings.objective;changes.push("优化目标");}
  if((!c.continuous&&p.settings.rotation==="continuous")||(!c.custom&&p.settings.rotation==="custom")||(c.one&&!["source","none"].includes(p.settings.rotation))){p.settings.rotation="source";$("rotation").value="source";changes.push("旋转规则");}
  for(const k of ["spacing","edge","kerf"]){if((k==="kerf"?!c.kerf:!c.spacing)&&p.settings[k]!==0){p.settings[k]=0;$(k).value=0;changes.push(k==="spacing"?"间距":k==="edge"?"留边":"刀缝");}}
  p.settings.stages=3;
  if(changes.length)toast(`按所选路线已重置：${changes.join("、")}。`);
  changed();
}

function itemPolygon(item,p=state.problem) {
  if(p.kind==="onedimensional")return [[0,0],[Number(item.length),0],[Number(item.length),1],[0,1]];
  if(p.kind==="rectangle")return [[0,0],[Number(item.width),0],[Number(item.width),Number(item.height)],[0,Number(item.height)]];
  return item.polygon || [];
}
function bounds(points) {
  if(!points?.length)return {x:0,y:0,width:1,height:1,maxX:1,maxY:1};
  const xs=points.map(p=>Number(p[0])),ys=points.map(p=>Number(p[1]));const x=Math.min(...xs),y=Math.min(...ys),maxX=Math.max(...xs),maxY=Math.max(...ys);
  return {x,y,maxX,maxY,width:Math.max(maxX-x,1e-9),height:Math.max(maxY-y,1e-9)};
}
function area(points) { return Math.abs(points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p[0]*q[1]-q[0]*p[1];},0))/2; }
function miniSVG(item) {
  const points=itemPolygon(item),b=bounds(points),pad=Math.max(b.width,b.height)*.1;
  const svg=svgNode("svg",{class:"mini-shape",viewBox:`${b.x-pad} ${b.y-pad} ${b.width+2*pad} ${b.height+2*pad}`,role:"img","aria-label":item.name});
  svg.append(svgNode("polygon",{points:points.map(p=>p.join(",")).join(" "),fill:color(item.id),stroke:"#426151","stroke-width":.8,"vector-effect":"non-scaling-stroke"}));return svg;
}
function numericInput(value,onChange,attrs={}) { return node("input",{type:"number",value,min:0,step:"any",...attrs,onchange:event=>onChange(Number(event.target.value))}); }
function renderItems() {
  const p=state.problem;if(!p)return;
  const headings=["轮廓","名称","数量","单片价值",...(p.kind==="rectangle"?["宽 X","高 Y"]:p.kind==="onedimensional"?["长度"]:["几何轮廓"]),"原始方向","操作"];
  $("items-head").replaceChildren(node("tr",{},headings.map(h=>node("th",{text:h}))));
  $("items-body").replaceChildren(...p.items.map((item,index)=>{
    const cells=[node("td",{},[miniSVG(item)]),node("td",{},[node("input",{class:"name-input",value:item.name,"aria-label":`裁片 ${index+1} 名称`,onchange:event=>{item.name=event.target.value;changed();}})]),node("td",{},[numericInput(item.quantity,v=>{item.quantity=v;changed();},{min:1,max:500,step:1,"aria-label":`${item.name} 数量`})]),node("td",{},[numericInput(item.profit,v=>{item.profit=v;changed();},{min:0,"aria-label":`${item.name} 单片价值`})])];
    if(p.kind==="rectangle")for(const key of ["width","height"])cells.push(node("td",{},[numericInput(item[key],v=>{item[key]=v;delete item.polygon;changed({rebuildItems:true});},{min:0.000001,"aria-label":`${item.name} ${key==="width"?"宽":"高"}`})]));
    else if(p.kind==="onedimensional")cells.push(node("td",{},[numericInput(item.length,v=>{item.length=v;changed({rebuildItems:true});},{min:1,step:1,"aria-label":`${item.name} 长度`})]));
    else cells.push(node("td",{},[node("button",{type:"button",class:"row-button",text:`${item.polygon.length} 个顶点 · 编辑`,onclick:()=>openPolygon(index)})]));
    cells.push(node("td",{class:"no-wrap",text:(item.allowed_rotations||[0]).map(a=>`${fmt(a)}°`).join(" / ")}));
    cells.push(node("td",{},[node("button",{type:"button",class:"row-button delete",text:"移除","aria-label":`移除 ${item.name}`,disabled:p.items.length<=1,onclick:()=>{p.items.splice(index,1);changed({rebuildItems:true});}})]));
    return node("tr",{},cells);
  }));
}
function renderDefects() {
  const p=state.problem;if(!p)return;
  $("no-defects").hidden=p.defects.length>0;
  $("defects-body").replaceChildren(...p.defects.map((d,index)=>node("tr",{},[node("td",{text:`区域 ${index+1}`}),...["x","y","width","height"].map(k=>node("td",{},[numericInput(d[k],v=>{d[k]=v;changed();},{min:["width","height"].includes(k)?0.000001:0,"aria-label":`缺陷 ${index+1} ${k}`})])),node("td",{},[node("button",{type:"button",class:"row-button delete",text:"移除",onclick:()=>{p.defects.splice(index,1);changed({rebuildDefects:true});}})])])));
}
function addItem() {
  const p=state.problem;if(p.items.length>=60){toast("当前最多支持 60 种裁片。");return;}
  let id=Math.max(-1,...p.items.map(i=>Number(i.id)||0))+1;
  const item={id,name:`新裁片 ${id+1}`,quantity:1,profit:1,allowed_rotations:[0]};
  if(p.kind==="rectangle"){item.width=Math.max(1,Math.round(p.stock.width*.1));item.height=Math.max(1,Math.round(p.stock.height*.1));item.allowed_rotations=[0,90];}
  else if(p.kind==="onedimensional")item.length=Math.max(1,Math.round(p.stock.width*.1));
  else{const size=Math.max(.01,p.stock.height*.2);item.polygon=[[0,0],[size,0],[size,size],[0,size]];}
  p.items.push(item);changed({rebuildItems:true});if(p.kind==="irregular")openPolygon(p.items.length-1);
}
function openPolygon(index) {
  const item=state.problem.items[index];
  if(window.CuttingDrawEditor){window.CuttingDrawEditor.open({mode:"edit",initialPoints:clone(item.polygon),name:item.name,quantity:item.quantity,onSave:(points,name,quantity)=>{if(totalPieces()-item.quantity+quantity>500)throw Error("修改后总需求超过 500 片，请减少数量。");item.polygon=clone(points);item.name=name;item.quantity=quantity;changed({rebuildItems:true});toast("轮廓已更新，可重新排料。");}});return;}
  state.vertexIndex=index;state.vertexDraft=clone(item.polygon);text("polygon-title",`${item.name} · 轮廓`);text("polygon-error","");renderVertices();$("polygon-dialog").showModal();
}
function renderVertices() {
  $("vertices-body").replaceChildren(...state.vertexDraft.map((p,index)=>node("tr",{},[node("td",{text:index+1}),...[0,1].map(k=>node("td",{},[numericInput(p[k],v=>{p[k]=v;renderPolygonPreview();},{min:-1e10,"aria-label":`顶点 ${index+1} ${k?"Y":"X"}`})])),node("td",{},[node("button",{type:"button",class:"row-button delete",text:"×","aria-label":`移除顶点 ${index+1}`,disabled:state.vertexDraft.length<=3,onclick:()=>{state.vertexDraft.splice(index,1);renderVertices();}})])])));
  text("vertex-count",`${state.vertexDraft.length} / 200 个顶点`);renderPolygonPreview();
}
function renderPolygonPreview() {
  const points=state.vertexDraft,b=bounds(points),pad=Math.max(b.width,b.height)*.16,svg=$("polygon-preview");
  svg.setAttribute("viewBox",`${b.x-pad} ${b.y-pad} ${b.width+2*pad} ${b.height+2*pad}`);svg.replaceChildren(svgNode("polygon",{points:points.map(p=>p.join(",")).join(" "),fill:"#bdd8c7",stroke:"#5f8c70","stroke-width":1.2,"vector-effect":"non-scaling-stroke"}));
  points.forEach((p,i)=>{svg.append(svgNode("circle",{cx:p[0],cy:p[1],r:Math.max(b.width,b.height)*.014,fill:"#356a4b"}),svgNode("text",{x:p[0]+pad*.15,y:p[1]-pad*.12,"font-size":Math.max(b.width,b.height)*.045,fill:"#426444"},[String(i+1)]));});
}

function renderCanvas() {
  const p=state.problem,job=displayJob(),svg=$("layout-svg"),focusedKey=document.activeElement?.classList?.contains("layout-piece")?document.activeElement.dataset.selectionKey:null;svg.replaceChildren();
  state.progress?.setVisible(state.view==="live"||state.view==="layout"&&job?.id===state.progress.jobId);
  $("view-original").classList.toggle("active",state.view==="original");$("view-layout").classList.toggle("active",state.view==="layout");$("view-layout").disabled=!state.resultJob?.result;
  $("view-live").classList.toggle("active",state.view==="live");$("view-live").disabled=!state.progress?.jobId;
  $("toggle-cuts").hidden=state.view==="original"||!job?.result?.bins?.some(b=>b.cuts?.length);
  $("bin-select").hidden=state.view==="original" || (job?.result?.bins?.length||0)<2;
  if(!p){$("canvas-empty").hidden=false;return;}
  $("canvas-empty").hidden=true;
  const defs=svgNode("defs");defs.append(svgNode("pattern",{id:"defect-hatch",patternUnits:"userSpaceOnUse",width:8,height:8,patternTransform:"rotate(45)"},[svgNode("rect",{width:8,height:8,fill:"#f4d9ce"}),svgNode("line",{x1:0,y1:0,x2:0,y2:8,stroke:"#be7d68","stroke-width":2})]));svg.append(defs);
  if(state.view==="original")drawOriginal(svg,p);else if(job?.result?.bins?.length)drawLayout(svg,job);else {$("canvas-empty").hidden=false;$("canvas-empty").querySelector("h3").textContent="等待第一份真实方案";$("canvas-empty").querySelector("p").textContent="收到引擎实际生成的布局后，这里会自动更新。";text("canvas-legend","正在等待真实布局");text("canvas-note","首个方案到达后自动显示");}
  $("export-svg").disabled=!svg.querySelector(".layout-piece");
  text("ruler-context",state.view==="original"?"输入轮廓 · 同比例显示":state.view==="live"?"实时布局 · 仅显示真实快照":"保存结果 · 原始坐标");
  const selected=state.selection&&[...svg.querySelectorAll(".layout-piece")].find(piece=>piece.dataset.selectionKey===state.selection.key);
  if(selected)selectPiece(selected,false);else {state.selection=null;renderSelection(null);}
  if(focusedKey)[...svg.querySelectorAll(".layout-piece")].find(piece=>piece.dataset.selectionKey===focusedKey)?.focus({preventScroll:true});
  text("canvas-live-status",state.view==="original"?(modified()?"输入已修改 · 待计算":"输入预览 · 尚未运行"):`${jobPhase(state.view==="live"?state.activeJob||job:job)}${job?.preview?" · 中间方案":""}`);
  applyView();
}
function drawOriginal(svg,p) {
  const data=p.items.map(i=>({item:i,points:itemPolygon(i,p)}));
  if(!data.length)return;
  const boxes=data.map(d=>bounds(d.points)),maxW=Math.max(...boxes.map(b=>b.width)),maxH=p.kind==="onedimensional"?maxW*.12:Math.max(...boxes.map(b=>b.height));
  const columns=Math.min(4,Math.ceil(Math.sqrt(data.length*1.3))),gap=Math.max(maxW,maxH)*.2,cellW=maxW+gap*1.2,cellH=maxH+gap*1.5,fontSize=Math.max(maxW,maxH)*.045;
  data.forEach((d,i)=>{const b=boxes[i],x=(i%columns)*cellW+(cellW-b.width)/2,y=Math.floor(i/columns)*cellH+gap*.4;
    const points=d.points.map(([px,py])=>[px-b.x+x,p.kind==="onedimensional"?(py-b.y)*maxH+y:py-b.y+y]);
    const polygon=svgNode("polygon",{class:"layout-piece",points:points.map(pt=>pt.join(",")).join(" "),fill:color(d.item.id),"fill-opacity":.87,stroke:"#637a60","stroke-width":1,"vector-effect":"non-scaling-stroke",tabindex:0,"aria-label":`${d.item.name}，需求 ${d.item.quantity} 片`});
    polygon.append(svgNode("title",{},[`${d.item.name} × ${d.item.quantity}`]));bindPiece(polygon,{...d.item,polygon:d.points},true,`input:${p.id}:${d.item.id}`);svg.append(polygon);
    svg.append(svgNode("text",{x:(i%columns)*cellW+cellW/2,y:Math.floor(i/columns)*cellH+maxH+gap*.85,"text-anchor":"middle","font-size":fontSize,fill:"#74836b","font-family":"Segoe UI, Microsoft YaHei, sans-serif"},[`${d.item.name} × ${d.item.quantity}`]));
  });
  const rows=Math.ceil(data.length/columns),pad=gap*.7;state.baseView={x:-pad,y:-pad,width:cellW*columns+2*pad,height:cellH*rows+pad};state.viewBox={...state.baseView};
  text("canvas-legend",`原始轮廓 · ${p.items.length} 种类型（每种显示一片）`);text("canvas-note",p.kind==="onedimensional"?"一维长度按比例 · 视觉高度经放大 · 点击查看":"原始轮廓同一比例 · 滚轮缩放 · 拖动平移");
}
function drawLayout(svg,job) {
  const r=job?.result,p=job?.problem;if(!r?.bins?.length){$("canvas-empty").hidden=false;return;}
  state.bin=Math.min(state.bin,r.bins.length-1);const b=r.bins[state.bin],one=p.kind==="onedimensional",strip=p.settings.objective==="strip";
  $("bin-select").replaceChildren(...r.bins.map((_,i)=>node("option",{value:i,text:`材料 ${i+1} / ${r.bins.length}`})));$("bin-select").value=state.bin;
  const ext=bounds((b.items||[]).flatMap(i=>i.polygon||[]));
  const width=strip?Math.max(ext.maxX,Number(r.metrics.used_length)||0,1):b.width;
  const height=one?Math.max(width*.095,1):b.height,pad=Math.max(width,height)*.045,fontSize=Math.max(width,height)*.012;
  const group=svgNode("g");svg.append(group);
  group.append(svgNode("rect",{x:0,y:0,width,height,fill:"#fffef9",stroke:"#b6c1ab","stroke-width":1.1,"vector-effect":"non-scaling-stroke"}));
  (b.defects||[]).forEach(d=>{group.append(svgNode("rect",{x:d.x,y:one?d.y*height:d.y,width:d.width,height:one?d.height*height:d.height,fill:"url(#defect-hatch)",stroke:"#bb806c","stroke-width":1,"vector-effect":"non-scaling-stroke"}));});
  const occurrences=new Map();(b.items||[]).forEach(item=>{
    const pts=item.polygon.map(([x,y])=>[x,one?y*height:y]),ib=bounds(pts);
    const poly=svgNode("polygon",{class:"layout-piece",points:pts.map(pt=>pt.join(",")).join(" "),fill:color(item.id),"fill-opacity":.88,stroke:"#516d54","stroke-width":.8,"vector-effect":"non-scaling-stroke",tabindex:0,"aria-label":`${item.name || `裁片 ${item.id}`}，旋转 ${fmt(item.angle)} 度`});
    const occurrence=occurrences.get(String(item.id))||0;occurrences.set(String(item.id),occurrence+1);
    poly.append(svgNode("title",{},[`${item.name || item.id} · ${fmt(item.angle)}°`]));bindPiece(poly,item,false,`result:${job.id}:${state.bin}:${item.id}:${occurrence}`);group.append(poly);
    if(ib.width>fontSize*2.4&&ib.height>fontSize*1.5)group.append(svgNode("text",{x:ib.x+ib.width/2,y:ib.y+ib.height/2,"text-anchor":"middle","dominant-baseline":"middle","font-size":Math.min(fontSize,ib.height*.3),fill:"#416046","fill-opacity":.78,"pointer-events":"none","font-family":"Segoe UI, Microsoft YaHei, sans-serif"},[String(item.id)]));
  });
  if(state.showCuts)(b.cuts||[]).forEach(c=>group.append(svgNode("line",{x1:c.x1,y1:one?c.y1*height:c.y1,x2:c.x2,y2:one?c.y2*height:c.y2,stroke:"#be765a","stroke-width":1.2,"stroke-dasharray":"5 4","vector-effect":"non-scaling-stroke","pointer-events":"none"})));
  svg.append(svgNode("text",{x:width/2,y:-pad*.34,"text-anchor":"middle","font-size":fontSize,fill:"#849277","font-family":"Segoe UI, Microsoft YaHei, sans-serif"},[`${fmt(width)} ${unitName(p)}`]));
  if(!one)svg.append(svgNode("text",{x:-pad*.42,y:height/2,transform:`rotate(-90 ${-pad*.42} ${height/2})`,"text-anchor":"middle","font-size":fontSize,fill:"#849277","font-family":"Segoe UI, Microsoft YaHei, sans-serif"},[`${fmt(height)} ${unitName(p)}`]));
  state.baseView={x:-pad*1.3,y:-pad,width:width+pad*2.6,height:height+pad*2};state.viewBox={...state.baseView};
  text("canvas-legend",`材料 ${state.bin+1} · ${(b.items||[]).length} 个裁片${r.validation?.pass?" · 几何校验通过":""}`);
  text("coordinate-note",p.unit==="benchmark"?"基准坐标 · 物理单位未知":`尺寸单位：${unitName(p)}`);
  text("canvas-note",one?"一维长度按比例 · 视觉高度经放大":"滚轮缩放 · 拖动平移 · 点击裁片");
}
function selectPiece(element,raise=true){
  $("layout-svg").querySelectorAll(".layout-piece").forEach(p=>{p.classList.remove("is-selected");p.setAttribute("aria-pressed","false");});element.classList.add("is-selected");element.setAttribute("aria-pressed","true");
  const focused=document.activeElement===element;if(raise)element.parentNode.append(element);if(focused)element.focus({preventScroll:true});state.selection={key:element.dataset.selectionKey,id:element._pieceItem.id,original:element._pieceOriginal};renderSelection(element._pieceItem,element._pieceOriginal);
}
function clearSelection(){state.selection=null;$("layout-svg").querySelectorAll(".layout-piece").forEach(p=>{p.classList.remove("is-selected");p.setAttribute("aria-pressed","false");});renderSelection(null);}
function editSelectedType(item,original){
  if(!original&&stale()){const job=displayJob();state.problem=initializeMissing(clone(job.submitted_problem||job.problem));state.original=null;state.view="original";renderProblem();toast("已载入该结果的输入副本，编辑后可重新计算。");}
  const index=state.problem.items.findIndex(i=>String(i.id)===String(item.id));if(index<0)return toast("当前输入中没有该裁片类型。");
  if(state.problem.kind==="irregular")openPolygon(index);else{tab("items");requestAnimationFrame(()=>{$("items-body").children[index]?.querySelector("input")?.focus();$("items-body").children[index]?.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"center"});});}
}
function bindPiece(element,item,original,key) {
  element.setAttribute("role","button");element.setAttribute("aria-pressed","false");
  element.dataset.selectionKey=key;element._pieceItem=item;element._pieceOriginal=original;
  const select=()=>{if(state.pan?.moved)return;selectPiece(element);};
  element.addEventListener("click",select);element.addEventListener("keydown",e=>{if(["Enter"," "].includes(e.key)){e.preventDefault();select();}});
  if(original)element.addEventListener("dblclick",()=>editSelectedType(item,true));
}
function renderSelection(item,original=false) {
  const card=$("selection-card");card.replaceChildren(node("span",{class:"eyebrow",text:"裁片详情"}));
  if(!item){card.append(node("h3",{text:"点选一个裁片"}),node("p",{text:"查看类型、数量与实际旋转角度。允许旋转不等于必须旋转，求解器会按目标选择方向。"}));return;}
  const p=original?state.problem:displayJob().problem,source=p.items.find(i=>String(i.id)===String(item.id)),b=bounds(item.polygon||itemPolygon(item,p));
  card.append(node("h3",{text:item.name||source?.name||`裁片 ${item.id}`}));
  const values=[["类型编号",item.id],[original?"需求数量":"实际角度",original?`${item.quantity} 片`:`${fmt(item.angle)}°`],["轮廓包围尺寸",`${fmt(b.width)} × ${fmt(b.height)}`],["允许旋转",angles(source||item,p)?.map(a=>`${fmt(a)}°`).join(" / ")||"连续 0°—360°"]];
  const dl=node("dl");values.forEach(([k,v])=>dl.append(node("div",{},[node("dt",{text:k}),node("dd",{text:String(v)})])));card.append(dl,node("div",{class:"selection-actions"},[node("button",{type:"button",class:"button small secondary",text:!original&&stale()?"以此输入编辑":"编辑该类型",onclick:()=>editSelectedType(item,original)}),node("button",{type:"button",class:"text-button",text:"取消选择",onclick:clearSelection})]));
}
function applyView() { if(!state.viewBox)return;const b=state.viewBox,svg=$("layout-svg");svg.setAttribute("viewBox",`${b.x} ${b.y} ${b.width} ${b.height}`);const matrix=svg.getScreenCTM(),scale=matrix?Math.max(.0001,Math.hypot(matrix.a,matrix.b)):1;svg.style.setProperty("--piece-shadow-offset",`${1.2/scale}px`);svg.style.setProperty("--piece-shadow-blur",`${2.2/scale}px`);text("zoom-value",`${Math.round(state.baseView.width/b.width*100)}%`); }
function zoom(factor,point=null) {
  if(!state.viewBox)return;const b=state.viewBox,current=state.baseView.width/b.width,newZoom=Math.min(30,Math.max(.2,current*factor)),actual=newZoom/current;
  const cx=point?.x??b.x+b.width/2,cy=point?.y??b.y+b.height/2;
  state.viewBox={x:cx-(cx-b.x)/actual,y:cy-(cy-b.y)/actual,width:b.width/actual,height:b.height/actual};applyView();
}
function svgPoint(event) { const svg=$("layout-svg"),pt=svg.createSVGPoint();pt.x=event.clientX;pt.y=event.clientY;const matrix=svg.getScreenCTM();return matrix?pt.matrixTransform(matrix.inverse()):{x:0,y:0}; }
function fitView() { if(state.baseView){state.viewBox={...state.baseView};applyView();} }
function exportSVG() {
  if(!state.baseView)return;const svg=$("layout-svg").cloneNode(true),b=state.baseView;svg.setAttribute("viewBox",`${b.x} ${b.y} ${b.width} ${b.height}`);svg.setAttribute("width","1600");svg.setAttribute("height",String(Math.round(Math.max(250,Math.min(2000,1600*b.height/b.width)))));svg.setAttribute("xmlns",NS);
  svg.querySelectorAll(".layout-piece").forEach(piece=>{piece.classList.remove("is-selected");piece.removeAttribute("aria-pressed");piece.removeAttribute("tabindex");});svg.style.removeProperty("--piece-shadow-offset");svg.style.removeProperty("--piece-shadow-blur");
  const p=state.view!=="original"?displayJob()?.problem||state.problem:state.problem;download(`${safeName(p.name)}_${state.view!=="original"?`排料_材料${state.bin+1}`:"原始轮廓"}.svg`,new XMLSerializer().serializeToString(svg),"image/svg+xml;charset=utf-8");
}

function renderMetrics() {
  const job=displayJob(),r=job?.result,p=job?.problem;
  const objective=(p||state.problem)?.settings?.objective;const metricLabel=objective==="knapsack"?"选件总价值":objective==="strip"?"使用长度":(p||state.problem)?.kind==="onedimensional"?"使用根数":"使用板数";text("metric-length-label",metricLabel);
  for(const [id,order]of [["metric-length",0],["metric-pieces",1],["metric-util",2],["metric-time",3]]){const card=$(id).closest(".metric");card.classList.toggle("is-primary",order===0);card.classList.toggle("is-quality",order===1);card.style.order=order;}
  if(!r){text("metric-util","—");text("metric-length","—");text("metric-pieces",state.problem?`— / ${fmt(totalPieces(),0)}`:"—");text("metric-time","—");text("instrument-state",state.view==="live"?"等待布局":"输入预览");text("metric-util-note",state.view==="live"?"等待真实中间方案":"计算完成后显示");text("metric-length-note",objective==="knapsack"?"单张材料内优化价值":objective==="strip"?"在固定幅宽内优化":"装入全部需求后比较");text("metric-pieces-note","按当前配置参与计算");text("metric-time-note","实际运行后记录");renderResultContext();return;}
  const m=r.metrics||{};text("metric-util",`${fmt(m.utilization_percent)}%`);
  text("metric-length",objective==="knapsack"?fmt(m.profit):objective==="strip"?fmt(m.used_length):`${fmt(m.bin_count,0)} ${p.kind==="onedimensional"?"根":"张"}`);
  text("metric-length-note",objective==="knapsack"?"单张材料 · 按价值选择":objective==="strip"?unitName(p):`${fmt(p.stock.width)}${p.kind==="onedimensional"?"":` × ${fmt(p.stock.height)}`} ${unitName(p)}`);
  text("metric-pieces",`${fmt(m.placed_pieces,0)} / ${fmt(m.required_pieces,0)}`);text("metric-pieces-note",p.settings.objective==="knapsack"?`选件价值 ${fmt(m.profit??0)} · 允许未选中裁片`:r.full?"全部需求已排入":"未排满全部需求");
  text("metric-time",`${fmt(r.elapsed_s)} s`);text("metric-time-note",`${engineName(r.engine).split(" · ").pop()} · 限时 ${p.settings.time_limit}s`);
  text("metric-util-note",job.preview?"真实中间方案 · 尚非最终结论":r.validation?.pass?"独立几何校验通过":"请检查几何校验结果");
  text("instrument-state",job.preview?"中间方案":"最终结果");renderResultContext();
}
function renderResultContext() {
  const container=$("result-context"),job=displayJob();
  if(!job?.result){container.hidden=true;return;}container.hidden=false;
  const r=job.result,isStale=stale(),valid=r.validation?.pass;
  container.classList.toggle("stale",!!isStale);container.classList.toggle("invalid",valid===false&&!job.preview);
  const messages=[];
  if(isStale)messages.push("参数已修改；当前布局与读数来自上次计算，请重新运行。");
  else messages.push(`${job.preview?"中间方案":valid?"布局已验证":"结果需检查"} · ${r.metrics.placed_pieces} / ${r.metrics.required_pieces} 片 · ${ROTATIONS[job.problem.settings.rotation]} · ${OBJECTIVES[job.problem.settings.objective]}`);
  if(job.preview)messages.push(job.status==="cancelled"?"已停止；保留最近收到的真实中间方案，尚非最终求解结论。":"正在查看真实中间方案；完整需求与最终校验以任务结果为准。");else if(!valid)messages.push("几何校验未通过。");else if(!r.full&&job.problem.settings.objective!=="knapsack")messages.push("时限内未排满全部需求。");
  container.replaceChildren(node("span",{text:messages.join(" ")}));
  if(r.warnings?.length)container.append(node("details",{class:"result-notes"},[node("summary",{text:"求解说明"}),node("div",{class:"result-notes-body"},r.warnings.map(warning=>node("p",{text:warning})))]));
  container.append(node("div",{class:"action-row"},[
    node("button",{type:"button",text:"结果 JSON",onclick:()=>download(`${safeName(job.problem.name)}_结果.json`,JSON.stringify(job,null,2))}),
    node("button",{type:"button",text:"排布 CSV",onclick:()=>exportPlacementCSV(job)})
  ]));
}
function exportPlacementCSV(job) {
  const rows=[["材料编号","裁片编号","裁片名称","旋转角度","包围框X","包围框Y","包围框宽度","包围框高度","单位","轮廓坐标"]];
  for(const [index,bin] of (job.result.bins||[]).entries())for(const item of bin.items||[]){const b=bounds(item.polygon);rows.push([index+1,item.id,item.name,item.angle,b.x,b.y,b.width,b.height,unitName(job.problem),JSON.stringify(item.polygon)]);}
  download(`${safeName(job.problem.name)}_排布.csv`,toCSV(rows),"text/csv;charset=utf-8");
}
function validateClient() {
  const p=state.problem,c=capabilities();
  if(!p)throw new Error("请先载入一个场景。");
  if(!p.items.length)throw new Error("至少添加一种裁片。");
  if(totalPieces()>500)throw new Error("当前本地演示最多支持 500 个裁片，请减少数量。");
  if(p.items.some(i=>!Number.isInteger(i.quantity)||i.quantity<1))throw new Error("每种裁片的数量必须为正整数。");
  if(!c.defects&&p.defects.length)throw new Error("当前路线不支持缺陷。请在「裁片与材料」移除禁排区，或切换支持缺陷的路线。");
  if(p.settings.rotation==="custom"&&(!p.settings.custom_angles?.length||p.settings.custom_angles.some(a=>!Number.isFinite(a)||a<0||a>=360)))throw new Error("自定义角度请输入 0 到 360 之间的数值（不含 360），并用逗号分隔。");
  if(!Number.isFinite(p.stock.width)||p.stock.width<=0||!Number.isFinite(p.stock.height)||p.stock.height<=0)throw new Error("材料长度和幅宽必须为正数。");
  if(p.items.some(i=>!Number.isFinite(i.profit)||i.profit<0))throw new Error("单片价值必须为非负数。");
}
function syncRunButtons() {
  const busy=!!state.activeJob||state.submitting,disabled=!state.problem?.items?.length||busy||state.loadingDataset;
  $("run").disabled=disabled;$("run-quick").disabled=disabled;
  const activeLabel=state.activeJob&&jobPhase(state.activeJob)==="正在加载计算引擎"?"正在加载引擎…":"计算进行中";
  $("run-quick").textContent=state.submitting?"正在提交…":state.activeJob?activeLabel:"运行排料";
  $("run").replaceChildren(node("span",{class:"play-icon",text:busy?"◌":"▶"}),document.createTextNode(state.submitting?"正在提交…":state.activeJob?activeLabel:"开始计算"));
  for(const id of ["cancel","cancel-quick"]){$(id).hidden=!state.activeJob;$(id).disabled=state.cancelRequested;$(id).textContent=state.cancelRequested?"等待停止…":"停止计算";}
  if(state.tab!=="three"){document.body.classList.toggle("is-running",busy);document.body.dataset.runState=state.activeJob?(state.activeJob.progress?.state||state.activeJob.status):state.submitting?"submitting":"idle";}
}
function focusWorkspace() {
  tab("workspace");
  requestAnimationFrame(()=>$("precision-workbench").scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"}));
}
async function startJob() {
  if(state.activeJob||state.submitting)return;
  if(state.loadingDataset)return toast("场景正在载入，请稍后运行。");
  if(!state.problem?.items?.length)return alertError("请先载入或建立至少一种裁片。");
  alertError("");
  try {
    validateClient();state.submitting=true;syncRunButtons();setSettingsOpen(false);
    const submitted=clone(state.problem);
    const job=await api("/api/jobs",{method:"POST",body:JSON.stringify({problem:submitted})});
    submittedSnapshots.set(job.id,submitted);state.activeJob={...job,problem:submitted};state.resultJob=null;state.cancelRequested=false;state.view="live";state.bin=0;
    state.progress.begin(job,submitted);text("run-status","任务已提交，等待真实布局…");text("canvas-live-status","排队 / 准备中");renderMetrics();renderCanvas();focusWorkspace();pollJob();
  } catch(error) {alertError(error.message);}
  finally {state.submitting=false;syncRunButtons();}
}
async function pollJob() {
  if(!state.activeJob||state.polling)return;
  state.polling=true;const id=state.activeJob.id;
  try {
    const job=await api(`/api/jobs/${encodeURIComponent(id)}`);
    if(state.activeJob?.id!==id)return;
    state.activeJob=job;
    text("run-status",`${jobPhase(job)} · 已用 ${fmt(job.elapsed_s,1)} 秒${job.status==="queued"&&!job.progress?.state?"（等待当前任务）":""}`);
    if(state.view==="live"||displayJob()?.id===job.id)text("canvas-live-status",`${jobPhase(job)} · ${fmt(job.elapsed_s,1)} 秒`);
    if(state.view==="live"&&!state.progress.snapshots.length)$("canvas-empty").querySelector("p").textContent=["loading","loading-wasm"].includes(job.progress?.state)?"首次使用正在加载计算引擎，准备完成后才开始搜索。":"收到引擎实际生成的布局后，这里会自动更新。";
    state.progress.ingest(job);syncRunButtons();
    if(["completed","failed","cancelled"].includes(job.status)) {
      state.activeJob=null;state.cancelRequested=false;syncRunButtons();
      if(job.status==="completed"&&job.result){
        const presentingActive=state.view==="live"||!state.resultJob||state.resultJob.id===job.id;
        if(presentingActive)state.resultJob=job;state.progress.finish(job);
        if(presentingActive&&state.view!=="original"&&state.progress.following){state.bin=0;state.view="layout";renderMetrics();renderCanvas();}
        toast(job.result.validation?.pass?"计算完成，最终方案已通过几何校验。":"计算完成，请检查最终校验提示。");
      } else {
        state.progress.finish(job);
        if(state.view==="live"){renderMetrics();renderCanvas();}
        if(job.status==="failed")alertError(job.error||"本次计算未成功，请检查参数。");
        else toast(state.progress.snapshots.length?"任务已停止，最近的真实方案已保留，可继续回看与导出。":"任务已停止，尚未收到可显示的布局。");
      }
      text("run-status",job.status==="completed"?"最终输入、结果与过程记录已保存在本机":job.status==="failed"?"任务失败；已收到的过程快照仍可查看":"已停止 · 保留最近真实方案");refreshHistory();
    }
  } catch(error) {alertError(error.message);text("run-status","连接中断，正在尝试读取任务状态…");}
  finally {state.polling=false;if(state.activeJob)state.timer=setTimeout(pollJob,700);}
}
async function cancelJob() {
  if(!state.activeJob||state.cancelRequested)return;
  state.cancelRequested=true;syncRunButtons();
  try{await api(`/api/jobs/${encodeURIComponent(state.activeJob.id)}/cancel`,{method:"POST"});toast("停止请求已提交，画布保留最近实际方案。");}
  catch(e){state.cancelRequested=false;syncRunButtons();alertError(e.message);}
}
async function refreshHistory() {
  try {
    const data=await api("/api/jobs");state.history=data.jobs||[];text("history-count",state.history.length);renderHistory();
  } catch(error) { if(state.tab==="history")alertError(error.message); }
}
function jobResult(job){return job.result?.metrics||job.metrics||{};}
function renderHistory() {
  $("history-empty").hidden=state.history.length>0;
  $("history-body").replaceChildren(...state.history.map(job=>{
    const m=jobResult(job),p=job.problem,s=job.settings||p?.settings||{},complete=job.status==="completed",isBox=(job.engine||s.engine)==="box";
    const checkbox=node("input",{type:"checkbox",checked:state.compare.has(job.id),disabled:!complete||isBox,"aria-label":isBox?"三维任务请在三维工作台查看":`选择 ${job.name||p?.name||job.id} 进行比较`,onchange:event=>{if(event.target.checked&&state.compare.size>=3){event.target.checked=false;toast("最多同时对比三个任务。");return;}if(event.target.checked)state.compare.add(job.id);else state.compare.delete(job.id);renderComparison();}});
    const time=job.created_at?new Date(job.created_at).toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}):"";
    return node("tr",{},[node("td",{},[checkbox]),node("td",{},[node("span",{class:"history-name",text:job.name||p?.name||job.id}),node("span",{class:"history-sub",text:`${time} · ${job.id.slice(0,8)}`})]),node("td",{},[node("span",{text:engineName(job.engine||s.engine||job.result?.engine||"—")}),node("span",{class:"history-sub",text:ROTATIONS[job.rotation||s.rotation]||"保存配置可查看"})]),node("td",{},[node("span",{class:`status-pill ${job.status}`,text:STATUS[job.status]||job.status})]),node("td",{text:m.utilization_percent!=null?`${fmt(m.utilization_percent)}%`:"—"}),node("td",{text:m.placed_pieces!=null?`${fmt(m.placed_pieces,0)} / ${fmt(m.required_pieces,0)}`:"—"}),node("td",{},[node("div",{class:"history-actions"},[node("button",{type:"button",class:"row-button",text:complete?"查看":"详情",onclick:()=>openJob(job.id)}),node("button",{type:"button",class:"row-button",text:"复用",onclick:()=>reuseJob(job.id)})])])]);
  }));
  if(state.compare.size)renderComparison();
}
async function getJob(id) { return api(`/api/jobs/${encodeURIComponent(id)}`); }
async function openJob(id) {
  try {
    const job=await getJob(id);
    if((job.engine||job.problem?.settings?.engine)==="box"){if(window.CuttingBox?.openJob)window.CuttingBox.openJob(job);else toast("三维工作台尚未加载，请稍后重试。");return;}
    const otherRunning=state.activeJob&&state.activeJob.id!==job.id,preview=job.progress?.preview_result||job.best_result;
    if(otherRunning&&!job.result&&!preview){toast("该任务尚无真实布局；当前运行任务继续追踪。");return;}
    if(job.result||preview||["queued","running"].includes(job.status)){
      if(otherRunning){state.resultJob={...job,result:job.result||preview,preview:!job.result};state.view="layout";toast("已打开历史方案；停止按钮仍跟踪运行中的任务，点「实时预览」可返回。");}
      else {
        if(state.progress.jobId!==job.id)state.progress.begin(job,job.submitted_problem||job.problem);
        state.progress.ingest(job);if(["completed","failed","cancelled"].includes(job.status))state.progress.finish(job);
        state.resultJob=job.result?job:null;state.view=job.result?"layout":"live";
        if(["queued","running"].includes(job.status)){state.activeJob=job;syncRunButtons();pollJob();}
      }
      state.bin=0;renderMetrics();renderCanvas();tab("workspace");
    }else alertError(`${STATUS[job.status]}${job.error?`：${job.error}`:"。该任务尚未生成排料结果。"}`);
  }catch(e){alertError(e.message);}
}
async function reuseJob(id) {
  try {const job=await getJob(id);if((job.engine||job.problem?.settings?.engine)==="box"){if(window.CuttingBox?.openJob)window.CuttingBox.openJob(job);else toast("三维工作台尚未加载，请稍后重试。");return;}if(!job.problem)throw new Error("该任务没有可复用的输入。");state.problem=initializeMissing(clone(job.submitted_problem||job.problem));const catalog=state.catalog.datasets.find(d=>d.id===state.problem.id);state.original=catalog?await api(`/api/datasets/${encodeURIComponent(catalog.id)}`):null;state.view="original";renderProblem();tab("workspace");toast("已载入保存的配置；点击计算创建新任务。");}catch(e){alertError(e.message);}
}
let compareGeneration=0;
async function renderComparison() {
  const generation=++compareGeneration,container=$("comparison");if(!state.compare.size){container.hidden=true;return;}
  try {
    const jobs=await Promise.all([...state.compare].map(getJob));if(generation!==compareGeneration)return;
    container.hidden=false;container.replaceChildren(node("h3",{text:"并排比较"}));
    const table=node("table"),head=node("thead",{},[node("tr",{},[node("th",{text:"指标 / 配置"}),...jobs.map(j=>node("th",{text:j.name||j.problem.name}))])]);
    const rows=[["引擎",j=>engineName(j.problem.settings.engine)],["目标",j=>OBJECTIVES[j.problem.settings.objective]],["旋转",j=>ROTATIONS[j.problem.settings.rotation]+(j.problem.settings.rotation==="custom"?` ${j.problem.settings.custom_angles.join(" / ")}°`:"")],["材料规格",j=>`${fmt(j.problem.stock.width)} × ${fmt(j.problem.stock.height)} ${unitName(j.problem)}`],["间距 / 留边 / 刀缝",j=>["spacing","edge","kerf"].map(k=>fmt(j.problem.settings[k])).join(" / ")],["利用率",j=>`${fmt(j.result.metrics.utilization_percent)}%`],["使用长度 / 板数",j=>j.problem.settings.objective==="strip"?fmt(j.result.metrics.used_length):`${fmt(j.result.metrics.bin_count,0)} 张 / 根`],["已排 / 需求",j=>`${fmt(j.result.metrics.placed_pieces,0)} / ${fmt(j.result.metrics.required_pieces,0)}`],["耗时 / 搜索预算",j=>`${fmt(j.result.elapsed_s)}s / ${j.problem.settings.time_limit}s`],["几何校验",j=>j.result.validation?.pass?"通过":"未通过"]];
    const tbody=node("tbody",{},rows.map(([title,fn])=>node("tr",{},[node("th",{text:title}),...jobs.map(j=>node("td",{text:fn(j)}))])));table.append(head,tbody);container.append(node("div",{class:"table-scroll"},[table]));
    const comparable=jobs.every(j=>signature(j.problem.items)===signature(jobs[0].problem.items)&&signature(j.problem.stock)===signature(jobs[0].problem.stock)&&j.problem.settings.objective===jobs[0].problem.settings.objective);
    container.append(node("p",{class:"comparison-note",text:comparable?"裁片、库存与目标相同。请同时检查旋转、缺陷和加工参数；这些变化也会改变可行解空间。":"这些任务的裁片、库存或目标不同，结果仅供查看，不能据此直接比较算法优劣。"}));
    container.append(node("button",{type:"button",class:"text-button",text:"下载对比 CSV",onclick:()=>{const csv=[["指标",...jobs.map(j=>j.name||j.problem.name)],...rows.map(([label,fn])=>[label,...jobs.map(fn)])];download("裁切实验室_结果对比.csv",toCSV(csv),"text/csv;charset=utf-8");}}));
  } catch(e){alertError(e.message);}
}

function renderTools() {
  const icons={irregular:"◈",rectangle:"▦",guillotine:"⊞",shelf:"▤",onedimensional:"▰","rectpack-maxrects":"▥","rectpack-skyline":"▧"};
  $("tool-cards").replaceChildren(...state.catalog.engines.map(e=>node("article",{class:"tool-card"},[node("span",{class:"tool-icon",text:icons[e.id]||"◇"}),node("h3",{text:e.label}),node("p",{text:e.description}),node("div",{class:"tool-tags"},e.objectives.map(o=>node("span",{text:OBJECTIVES[o]})))])));
  const rows={irregular:["多边形 / 矩形","离散 + 连续","矩形禁排区","间距、留边"],rectangle:["整数矩形","0° / 90°","矩形禁排区","间距、留边仅 0"],guillotine:["整数矩形","0° / 90°","矩形禁排区","三阶段、整数锯缝"],shelf:["轮廓包围盒","有限离散","不支持","间距、留边；贪心基线"],onedimensional:["整数长度","不适用","不支持","当前不计锯缝"],"rectpack-maxrects":["矩形","统一允许 / 禁止 90°","不支持","仅最少板数；无间距 / 刀缝"],"rectpack-skyline":["矩形","统一允许 / 禁止 90°","不支持","仅最少板数；无间距 / 刀缝"]};
  $("capability-body").replaceChildren(...state.catalog.engines.map(e=>node("tr",{},[e.label,...(rows[e.id]||["见说明","见说明","见说明","见说明"])].map(t=>node("td",{text:t})))));
  const extraRows={"onedimensional-kerf":["整数长度","不适用","不支持","每件及末件均计整数锯缝"],"ffd-1d":["整数长度","不适用","不支持","递减首次适应；逐件锯缝"],"bfd-1d":["整数长度","不适用","不支持","递减最佳适应；逐件锯缝"]};
  state.catalog.engines.forEach((e,index)=>{if(extraRows[e.id])$("capability-body").children[index].replaceChildren(...[e.label,...extraRows[e.id]].map(t=>node("td",{text:t})));});
  const boxRow=["PackingSolver · 三维装箱","整数长方体","六种轴对齐朝向","不支持","容器总限重；无堆叠承重 / 稳定性"];
  if(state.catalog.engines.some(e=>e.id==='box'))$("capability-body").lastElementChild.replaceChildren(...boxRow.map(t=>node("td",{text:t})));
}

function toCSV(rows) { return "\uFEFF"+rows.map(row=>row.map(v=>{const s=String(v??"");return /[",\r\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s;}).join(",")).join("\r\n"); }
function parseCSV(raw) {
  const rows=[];let row=[],field="",quoted=false;const s=raw.replace(/^\uFEFF/,"");
  for(let i=0;i<s.length;i++){const ch=s[i];if(quoted){if(ch==='"'){if(s[i+1]==='"'){field+='"';i++;}else quoted=false;}else field+=ch;}
    else if(ch==='"'){if(field.trim())throw new Error("CSV 引号格式不正确。");quoted=true;}else if(ch===","){row.push(field);field="";}else if(ch==="\n"||ch==="\r"){if(ch==="\r"&&s[i+1]==="\n")i++;row.push(field);if(row.some(c=>c.trim()))rows.push(row);row=[];field="";}else field+=ch;}
  if(quoted)throw new Error("CSV 存在未闭合的引号。");row.push(field);if(row.some(c=>c.trim()))rows.push(row);return rows;
}
function updateImportFormat() {
  const type=$("import-type").value;
  text("import-format",type==="json"?"读取本工作台导出的完整方案 JSON，包含轮廓、需求、材料、旋转规则与缺陷。":type==="rectangle"?"第一行列名：width,height,quantity,name,profit\n必填 width（宽）与 height（高）；quantity 默认为 1，name 和 profit 可省略。尺寸单位需与材料统一。":"第一行列名：length,quantity,name,profit\n必填 length（长度）；quantity 默认为 1，name 和 profit 可省略。当前下料路线要求整数长度。");
  $("import-file").accept=type==="json"?".json,application/json":".csv,text/csv";
}
async function importData() {
  text("import-error","");try{
    const file=$("import-file").files[0];if(!file)throw new Error("请先选择本地文件。");if(file.size>2*1024*1024)throw new Error("文件超过 2 MB，请缩小后重试。");
    const content=await file.text(),type=$("import-type").value;let p;
    if(type==="json"){p=JSON.parse(content);if(!p||!Array.isArray(p.items)||!p.stock||!p.settings)throw new Error("请选择完整方案 JSON；文件需要包含 items、stock 和 settings。");if(!["irregular","rectangle","onedimensional"].includes(p.kind))throw new Error("JSON 中的 kind 必须为 irregular、rectangle 或 onedimensional。");p=initializeMissing(p);}
    else{
      const rows=parseCSV(content);if(rows.length<2)throw new Error("CSV 至少需要列名和一行数据。");const headers=rows.shift().map(h=>h.trim().toLowerCase());const required=type==="rectangle"?["width","height"]:["length"];if(required.some(h=>!headers.includes(h)))throw new Error(`CSV 缺少必填列：${required.join(", ")}`);
      const items=rows.map((row,index)=>{const data=Object.fromEntries(headers.map((h,i)=>[h,row[i]?.trim()??""]));const item={id:index,name:data.name||`裁片 ${index+1}`,quantity:data.quantity?Number(data.quantity):1,profit:data.profit?Number(data.profit):1,allowed_rotations:type==="rectangle"?[0,90]:[0]};for(const key of required){item[key]=Number(data[key]);if(!Number.isFinite(item[key])||item[key]<=0)throw new Error(`第 ${index+2} 行的 ${key} 必须为正数。`);}return item;});
      p=initializeMissing({id:`import-${Date.now()}`,name:$("import-name").value.trim()||file.name.replace(/\.csv$/i,""),industry:type==="rectangle"?"paper":"bars",kind:type,unit:"unspecified",source:{kind:"user-import",label:"本地 CSV 导入",note:"单位未指定；请确保裁片与材料使用相同单位。"},items,stock:{width:type==="rectangle"?1000:6000,height:type==="rectangle"?1000:1,copies:20},settings:{engine:type==="rectangle"?"rectangle":"onedimensional",objective:"bins",rotation:"source"}});
    }
    if(!p.items.length||p.items.length>60)throw new Error("需提供 1 至 60 种裁片。");if(p.items.some(i=>!Number.isInteger(i.quantity)||i.quantity<1)||totalPieces(p)>500)throw new Error("数量必须为正整数，总需求不得超过 500 片。");if(p.kind==="irregular"&&p.items.some(i=>!Array.isArray(i.polygon)||i.polygon.length<3||i.polygon.length>200))throw new Error("每个多边形需有 3 至 200 个顶点。");
    if($("import-name").value.trim())p.name=$("import-name").value.trim();state.problem=clone(p);state.original=null;state.view="original";renderProblem();$("import-dialog").close();tab("items");toast("已读入本地数据，请检查材料规格后开始计算。");
  }catch(error){text("import-error",error instanceof SyntaxError?"JSON 格式无法读取，请选择本工作台导出的完整方案。":error.message);}
}
function exportItemsCSV() {
  const p=state.problem;let headers=["id","name","quantity","profit",...(p.kind==="rectangle"?["width","height"]:p.kind==="onedimensional"?["length"]:["polygon"]),"allowed_rotations"];
  const rows=p.items.map(i=>headers.map(h=>h==="polygon"?JSON.stringify(i.polygon):h==="allowed_rotations"?(i.allowed_rotations||[0]).join(";"):i[h]));download(`${safeName(p.name)}_裁片.csv`,toCSV([headers,...rows]),"text/csv;charset=utf-8");
}

function bindEvents() {
  $("settings-toggle").addEventListener("click",()=>setSettingsOpen(!state.settingsOpen));
  $("focus-toggle").addEventListener("click",()=>setCanvasFocus(!document.body.classList.contains("canvas-focus")));
  $("draft-undo").addEventListener("click",()=>{const draft=state.draftRollback;if(!draft)return;state.datasetRevision++;state.loadingDataset=false;state.problem=clone(draft.problem);state.original=draft.original?clone(draft.original):null;state.draftRollback=null;$("draft-notice").hidden=true;state.view="original";state.resultJob=null;state.selection=null;if(!state.activeJob)state.progress.reset();renderProblem();toast("已恢复切换前的配置。");});
  document.addEventListener("click",event=>{const current=event.target.closest(".action-menu");document.querySelectorAll(".action-menu[open]").forEach(menu=>{if(menu!==current||event.target.closest("button"))menu.removeAttribute("open");});});
  window.addEventListener("keydown",event=>{if(document.querySelector("dialog[open]"))return;if(event.key==="Escape"){const menus=[...document.querySelectorAll(".action-menu[open]")];if(menus.length){event.preventDefault();menus.forEach(menu=>menu.removeAttribute("open"));menus[0].querySelector("summary")?.focus();return;}if(document.body.classList.contains("canvas-focus")){event.preventDefault();setCanvasFocus(false);}else clearSelection();return;}if((event.ctrlKey||event.metaKey)&&event.key==="Enter"&&!event.repeat&&event.target.tagName!=="TEXTAREA"){event.preventDefault();document.activeElement?.blur();if(state.tab==="three")window.CuttingBox?.run();else if(["workspace","items"].includes(state.tab))startJob();}});
  document.querySelectorAll(".nav-tab").forEach(b=>b.addEventListener("click",()=>tab(b.dataset.tab)));
  $("industry").addEventListener("change",()=>loadDataset(populateDatasets($("industry").value)));
  $("dataset").addEventListener("change",()=>{if(state.catalog.datasets.some(d=>d.id===$("dataset").value))loadDataset($("dataset").value);});
  $("engine").addEventListener("change",()=>{state.problem.settings.engine=$("engine").value;coerceEngine();});
  for(const [id,key] of [["objective","objective"],["rotation","rotation"],["spacing","spacing"],["edge","edge"],["kerf","kerf"],["time-limit","time_limit"],["stages","stages"],["first-cut","first_cut"]])$(id).addEventListener(id==="time-limit"?"input":"change",()=>{if(!state.problem)return;state.problem.settings[key]=["spacing","edge","kerf","time_limit","stages"].includes(key)?Number($(id).value):$(id).value;changed();});
  $("custom-angles").addEventListener("change",()=>{state.problem.settings.custom_angles=$("custom-angles").value.split(/[,，;；\s]+/).filter(Boolean).map(Number);changed();});
  for(const [id,key] of [["stock-width","width"],["stock-height","height"],["stock-copies","copies"]])$(id).addEventListener("change",()=>{state.problem.stock[key]=Number($(id).value);changed();});
  $("restore-original").addEventListener("click",()=>{if(!state.original)return;state.problem=clone(state.original);state.view="original";renderProblem();toast("已恢复原始实例；历史任务保留。");});
  $("run").addEventListener("click",startJob);$("run-quick").addEventListener("click",startJob);$("cancel").addEventListener("click",cancelJob);$("cancel-quick").addEventListener("click",cancelJob);
  $("view-live").addEventListener("click",()=>{state.view="live";state.progress?.followLatest();renderMetrics();renderCanvas();});
  $("edit-items-link").addEventListener("click",()=>tab("items"));$("edit-defects").addEventListener("click",()=>{tab("items");$("defect-editor").scrollIntoView({behavior:"smooth",block:"center"});});
  $("add-item").addEventListener("click",addItem);$("add-defect").addEventListener("click",()=>{if(state.problem.defects.length>=20){toast("最多支持 20 处缺陷。");return;}state.problem.defects.push({x:0,y:0,width:Math.max(1,Math.floor(state.problem.stock.width*.08)),height:Math.max(1,Math.floor(state.problem.stock.height*.08))});changed({rebuildDefects:true});});
  $("items-csv").addEventListener("click",exportItemsCSV);
  $("view-original").addEventListener("click",()=>{state.view="original";renderCanvas();renderMetrics();});$("view-layout").addEventListener("click",()=>{state.view="layout";renderCanvas();renderMetrics();});
  $("bin-select").addEventListener("change",()=>{state.bin=Number($("bin-select").value);renderCanvas();});
  $("toggle-cuts").addEventListener("click",()=>{state.showCuts=!state.showCuts;$("toggle-cuts").setAttribute("aria-pressed",String(state.showCuts));renderCanvas();});
  $("zoom-in").addEventListener("click",()=>zoom(1.25));$("zoom-out").addEventListener("click",()=>zoom(.8));$("fit-view").addEventListener("click",fitView);$("export-svg").addEventListener("click",exportSVG);
  const stage=$("canvas-stage"),svg=$("layout-svg");
  svg.addEventListener("click",event=>{if(!event.target.closest(".layout-piece")&&!state.pan?.moved)clearSelection();});
  stage.addEventListener("wheel",event=>{if(!state.viewBox)return;event.preventDefault();zoom(event.deltaY<0?1.1:1/1.1,svgPoint(event));},{passive:false});
  svg.addEventListener("pointerdown",event=>{if(event.button!==0||!state.viewBox)return;state.pan={start:svgPoint(event),box:{...state.viewBox},clientX:event.clientX,clientY:event.clientY,moved:false};stage.classList.add("dragging");});
  window.addEventListener("pointermove",event=>{if(!state.pan)return;const p=state.pan;if(Math.hypot(event.clientX-p.clientX,event.clientY-p.clientY)>4)p.moved=true;const current=svgPoint(event);state.viewBox.x+=p.start.x-current.x;state.viewBox.y+=p.start.y-current.y;applyView();});
  window.addEventListener("pointerup",()=>{stage.classList.remove("dragging");setTimeout(()=>state.pan=null,0);});
  stage.addEventListener("keydown",event=>{if(["+","="].includes(event.key)){event.preventDefault();zoom(1.25);}else if(event.key==="-"){event.preventDefault();zoom(.8);}else if(event.key==="0"){event.preventDefault();fitView();}else if(state.viewBox&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key)){event.preventDefault();const step=state.viewBox.width*.05;if(event.key==="ArrowLeft")state.viewBox.x-=step;if(event.key==="ArrowRight")state.viewBox.x+=step;if(event.key==="ArrowUp")state.viewBox.y-=step;if(event.key==="ArrowDown")state.viewBox.y+=step;applyView();}});
  $("refresh-history").addEventListener("click",refreshHistory);
  $("export-problem").addEventListener("click",()=>download(`${safeName(state.problem.name)}_方案.json`,JSON.stringify(state.problem,null,2)));
  $("import-open").addEventListener("click",()=>{text("import-error","");updateImportFormat();$("import-dialog").showModal();});$("import-type").addEventListener("change",updateImportFormat);$("import-confirm").addEventListener("click",importData);
  for(const id of ["polygon-close","polygon-cancel"])$(id).addEventListener("click",()=>$("polygon-dialog").close());
  $("add-vertex").addEventListener("click",()=>{if(state.vertexDraft.length>=200){toast("每个轮廓最多 200 个顶点。");return;}const last=state.vertexDraft.at(-1);state.vertexDraft.push([last[0]+1,last[1]+1]);renderVertices();});
  $("polygon-save").addEventListener("click",()=>{if(state.vertexDraft.some(p=>p.some(n=>!Number.isFinite(n)))){text("polygon-error","所有顶点坐标必须是有限数值。");return;}if(area(state.vertexDraft)<=0){text("polygon-error","轮廓面积需要大于 0；请检查顶点顺序。");return;}state.problem.items[state.vertexIndex].polygon=clone(state.vertexDraft);changed({rebuildItems:true});$("polygon-dialog").close();toast("轮廓已更新；计算前将检查自交与有效性。");});
}
async function boot() {
  bindEvents();
  state.progress=createProgressTracker("process",frame=>{if(state.view!=="live")return;const previous=state.viewBox?{...state.viewBox}:null;const hadFrame=!!state.baseView;renderMetrics();renderCanvas();if(previous&&hadFrame&&frame?.preserveView){state.viewBox=previous;applyView();}$("canvas-stage").classList.remove("fresh-frame");requestAnimationFrame(()=>$("canvas-stage").classList.add("fresh-frame"));});
  try {
    const [health,catalog]=await Promise.all([api("/api/health"),api("/api/catalog")]);state.catalog=catalog;
    $("connection").classList.add("ok");$("connection").replaceChildren(node("i"),document.createTextNode(health.runtime==="browser"||health.runtime==="wasm"||String(health.runtime||"").includes("browser")?"浏览器引擎就绪":"本地原生引擎在线"));text("engine-version",`PackingSolver ${health.engine_version||""}`);
    populateIndustries();renderTools();await loadDataset(catalog.datasets.find(d=>d.id==="shirts")?.id||catalog.datasets[0]?.id);await refreshHistory();
    const active=state.history.find(j=>["running","queued"].includes(j.status)&&j.engine!=="box");if(active){state.activeJob=active;state.view="live";state.progress.begin(active,state.problem);syncRunButtons();renderCanvas();pollJob();}
  }catch(error){$("connection").classList.add("error");$("connection").replaceChildren(node("i"),document.createTextNode("本地服务未连接"));alertError(error.message);}
}

function createProgressTracker(prefix,onFrame) {
  const get=suffix=>document.getElementById(`${prefix}-${suffix}`);
  const tracker={jobId:null,problem:null,snapshots:[],events:new Map(),following:true,index:-1,status:"queued",phase:"准备中",elapsed:0,lastKey:null,visible:true};
  const metricFor=(result,problem)=>{const objective=problem?.settings?.objective,m=result?.metrics||{},key=objective==="strip"?"used_length":objective==="knapsack"?"profit":"bin_count";return {key,value:Number.isFinite(m[key])?m[key]:null,label:objective==="strip"?"使用长度（越小越好）":objective==="knapsack"?"选件总价值（越大越好）":"使用原料数（完整订单间比较）"};};
  tracker.current=()=>tracker.snapshots[tracker.index]||null;
  function add(job,result,key,sequence,elapsed,preview=true){
    if(tracker.snapshots.some(s=>s.key===key)||!result||!Array.isArray(result.bins))return false;
    const problem=job.submitted_problem||tracker.problem||job.problem;
    const snapshot={key,sequence,elapsed:Number(elapsed)||0,metric:metricFor(result,problem),full:!!result.full,job:{...job,problem:job.problem||problem,submitted_problem:problem,result:clone(result),preview}};
    tracker.snapshots.push(snapshot);if(tracker.snapshots.length>120){tracker.snapshots.shift();tracker.index=Math.max(0,tracker.index-1);}
    if(tracker.following){tracker.index=tracker.snapshots.length-1;onFrame({...snapshot,preserveView:tracker.snapshots.length>1});}
    return true;
  }
  tracker.begin=(job,problem)=>{tracker.jobId=job.id;tracker.problem=clone(problem);tracker.snapshots=[];tracker.events.clear();tracker.following=true;tracker.index=-1;tracker.status=job.status||"queued";tracker.phase=jobPhase(job);tracker.elapsed=0;tracker.lastKey=null;tracker.visible=true;get("card").hidden=false;tracker.render();};
  tracker.ingest=job=>{
    if(!tracker.jobId)tracker.begin(job,job.submitted_problem||job.problem);
    if(tracker.jobId!==job.id)return;
    if(job.submitted_problem||job.problem)tracker.problem=clone(job.submitted_problem||job.problem);
    tracker.status=job.status;tracker.phase=jobPhase(job);tracker.elapsed=Number(job.elapsed_s)||0;
    const progress=job.progress||{};
    for(const event of progress.events||[]){const seq=event.sequence??event.seq;if(seq!=null)tracker.events.set(String(seq),{sequence:seq,elapsed:Number(event.elapsed_s)||0});}
    const result=progress.preview_result||job.best_result;
    if(result){const sequence=progress.preview_sequence??progress.latest?.sequence??progress.sequence??progress.seq??tracker.events.size;const event=tracker.events.get(String(sequence));add(job,result,`preview-${sequence}`,sequence,event?.elapsed??result.elapsed_s??job.elapsed_s,true);}
    tracker.render();
  };
  tracker.finish=job=>{if(tracker.jobId!==job.id)return;tracker.status=job.status;tracker.phase=jobPhase(job);tracker.elapsed=Number(job.elapsed_s)||tracker.elapsed;if(job.result)add(job,job.result,`final-${job.id}`,"最终",job.result.elapsed_s??job.elapsed_s,false);for(const snap of tracker.snapshots)snap.job.status=job.status;tracker.render();};
  tracker.followLatest=()=>{tracker.following=true;tracker.index=tracker.snapshots.length-1;const frame=tracker.current();if(frame)onFrame({...frame,preserveView:false});tracker.render();};
  tracker.seek=index=>{tracker.following=false;tracker.index=Math.max(0,Math.min(tracker.snapshots.length-1,Number(index)));const frame=tracker.current();if(frame)onFrame({...frame,preserveView:false});tracker.render();};
  tracker.reset=()=>{tracker.jobId=null;tracker.snapshots=[];tracker.events.clear();tracker.index=-1;get("card").hidden=true;};
  tracker.setVisible=visible=>{tracker.visible=visible;get("card").hidden=!visible||!tracker.jobId;};
  tracker.render=()=>{
    const card=get("card");if(!tracker.jobId){card.hidden=true;return;}card.hidden=!tracker.visible;card.classList.toggle("is-live",tracker.following&&["queued","running"].includes(tracker.status));
    get("phase").textContent=tracker.following?tracker.phase:["queued","running"].includes(tracker.status)?`回看模式 · ${tracker.phase}`:"回看已保存的真实方案";
    get("elapsed").textContent=`${fmt(tracker.elapsed,1)} 秒`;
    const n=tracker.snapshots.length,frame=tracker.current();get("event-count").textContent=`已读取 ${n} 个布局 / ${tracker.events.size} 次引擎事件`;
    get("metric-name").textContent=metricFor(null,tracker.problem).label;
    get("live").disabled=!n||tracker.following;get("scrubber").disabled=!n;get("scrubber").max=Math.max(0,n-1);get("scrubber").value=Math.max(0,tracker.index);
    get("frame-label").textContent=n?`${tracker.following?"最新":"回看"} ${tracker.index+1} / ${n} · ${fmt(frame.elapsed,1)}s`:"尚无真实快照";
    get("chart-note").textContent=n?"实心点：完整需求；空心点：部分方案。仅连接相同完成状态的实际快照，不补帧、不推算进度。":tracker.phase==="正在加载计算引擎"?"正在加载计算引擎；完成准备后开始搜索，尚未产生布局。":tracker.status==="queued"?"任务正在等待计算资源，尚未开始搜索。":tracker.status==="running"?"尚未收到可显示的真实方案；任务正在按设定预算搜索。":"本次任务没有收到可显示的真实布局。";
    const events=[...tracker.events.values()].sort((a,b)=>Number(b.sequence)-Number(a.sequence)).slice(0,6);
    get("events").replaceChildren(...(events.length?events.map(event=>{const snap=tracker.snapshots.find(s=>String(s.sequence)===String(event.sequence));return node("div",{class:"process-event"},[node("strong",{text:`${fmt(event.elapsed,1)}s`}),node("span",{text:snap?`方案 ${event.sequence} · ${snap.full?"完整需求":"部分需求"} · ${fmt(snap.metric.value)}`:`引擎事件 ${event.sequence} · 本次轮询未读取该布局`})]);}):[node("div",{class:"process-event"},[node("strong",{text:"等待"}),node("span",{text:tracker.status==="cancelled"?"停止前未收到真实布局。":"引擎产生可显示的方案后，这里会出现实际记录。"})])]));
    const svg=get("chart"),points=tracker.snapshots.filter(s=>s.metric.value!=null),width=680,height=120,left=42,right=14,top=14,bottom=22;svg.replaceChildren();
    for(let i=0;i<3;i++)svg.append(svgNode("line",{x1:left,x2:width-right,y1:top+i*(height-top-bottom)/2,y2:top+i*(height-top-bottom)/2,stroke:"#dce5f1","stroke-width":1}));
    if(!points.length)return;
    const maxTime=Math.max(1,...points.map(s=>s.elapsed)),values=points.map(s=>s.metric.value),vMin=Math.min(...values),vMax=Math.max(...values),delta=Math.max(1,(vMax-vMin)*.12),lo=vMin-delta,hi=vMax+delta;
    const x=s=>left+s.elapsed/maxTime*(width-left-right),y=s=>top+(hi-s.metric.value)/(hi-lo)*(height-top-bottom);
    for(let i=1;i<points.length;i++)if(points[i].full===points[i-1].full)svg.append(svgNode("path",{d:`M${x(points[i-1])} ${y(points[i-1])} H${x(points[i])} V${y(points[i])}`,fill:"none",stroke:points[i].full?"#315cda":"#b78226","stroke-width":1.7}));
    points.forEach(s=>{const dot=svgNode("circle",{cx:x(s),cy:y(s),r:s===frame?4.5:3.2,fill:s.full?"#087b69":"#ffffff",stroke:s.full?"#087b69":"#b78226","stroke-width":1.5});dot.append(svgNode("title",{},[`${fmt(s.elapsed,2)}秒 · ${fmt(s.metric.value)} · ${s.full?"完整需求":"部分需求"}`]));svg.append(dot);});
    for(const [label,px,py,anchor] of [[fmt(vMax),left-7,top+10,"end"],[fmt(vMin),left-7,height-bottom,"end"],["0s",left,height-3,"start"],[`${fmt(maxTime,1)}s`,width-right,height-3,"end"]])svg.append(svgNode("text",{x:px,y:py,"text-anchor":anchor,"font-size":12,fill:"#647892","font-family":"Consolas, monospace"},[label]));
  };
  get("live").addEventListener("click",tracker.followLatest);get("scrubber").addEventListener("input",event=>tracker.seek(event.target.value));
  return tracker;
}

window.CuttingLab = {
  getProblem: () => state.problem ? clone(state.problem) : null,
  getCatalog: () => state.catalog ? clone(state.catalog) : null,
  getResultJob: () => state.resultJob ? clone(state.resultJob) : null,
  setProblem: (problem, options = {}) => {
    state.datasetRevision++;state.loadingDataset=false;
    state.problem = initializeMissing(clone(problem));
    state.original = options.original === true ? clone(state.problem) : options.original ? clone(options.original) : null;
    state.view = "original";
    state.resultJob = null;
    if(!state.activeJob)state.progress?.reset();
    renderProblem();
    if (options.tab) tab(options.tab);
  },
  addPolygon: (points, name = "手绘裁片", quantity = 1) => {
    if (!state.problem) throw new Error("请先加载一个场景。");
    if (state.problem.kind === "onedimensional") throw new Error("一维场景无法添加多边形，请先选择二维场景。");
    if (!Array.isArray(points) || points.length < 3 || points.length > 200 || points.some(p => !Array.isArray(p) || p.length !== 2 || p.some(v => !Number.isFinite(v)))) throw new Error("轮廓需要 3 至 200 个有效顶点。");
    if (!Number.isInteger(quantity) || quantity < 1 || totalPieces() + quantity > 500 || state.problem.items.length >= 60) throw new Error("数量必须为正整数，最多 60 种类型 / 500 个裁片。");
    if (state.problem.kind === "rectangle") {
      state.problem.items.forEach(item => { item.polygon = itemPolygon(item, state.problem); });
      state.problem.kind = "irregular";
      state.problem.settings.engine = "irregular";
      state.problem.settings.kerf = 0;
    }
    const id = Math.max(-1, ...state.problem.items.map(i => Number(i.id) || 0)) + 1;
    state.problem.items.push({id, name, quantity, profit: 1, allowed_rotations: [0, 180], polygon: clone(points)});
    state.view = "original";
    renderProblem();
    return clone(state.problem.items.at(-1));
  },
  showTab: tab,
  setCanvasFocus,
  setSettingsOpen,
  refreshHistory,
  createProgressTracker,
  jobPhase,
  run: startJob,
  toast,
  notifyProblemChanged: () => changed({rebuildItems: true, rebuildDefects: true})
};
boot();
