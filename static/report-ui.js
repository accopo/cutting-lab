/* Source-backed industry reports. All source text is rendered as text, never HTML. */
(() => {
  'use strict';
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
  const append=(p,...children)=>{children.flat().filter(Boolean).forEach(c=>p.append(c));return p;};
  const list=(values,ordered=false)=>append(el(ordered?'ol':'ul','report-list'),(values||[]).map(x=>el('li','',x)));
  let data,software,current='apparel',query='',tocObserver;
  const titles={irregular:'异形排料',rectangle:'自由矩形',guillotine:'贯通裁切',onedimensional:'一维下料','onedimensional-kerf':'一维锯缝优化','ffd-1d':'FFD 递减首次适应','bfd-1d':'BFD 递减最佳适应',shelf:'包围盒基线','rectpack-maxrects':'MaxRects BSSF','rectpack-skyline':'Skyline BL',box:'三维装箱'};
  const sampleNames={shirts:'Shirts · 服装纸样',trousers:'Trousers · 裤装纸样',swim:'Swim · 泳装纸样',albano:'Albano · 异形基准',dagli:'Dagli · 异形基准','leather-defects':'皮革 · 疵点避让','metal-parts':'钣金 · 零件排料','wood-cabinet':'木板 · 柜体下料','glass-panels':'玻璃 · 定尺板材','paper-layout':'纸张 · 拼版对照','bar-stock':'型材 · 定长下料','bar-stock-kerf':'型材 · 逐件锯缝','box-mixed':'物流 · 混合货件','box-value':'物流 · 价值选件','box-weight':'物流 · 容器承重'};
  const section=(id,kicker,title)=>{const s=el('section','report-section');s.id=id;return append(s,el('span','report-kicker',kicker),el('h3','',title));};
  const safeLink=(s)=>{const a=el('a','report-source',s.title||s.url);try{const u=new URL(s.url);if(!['https:','http:'].includes(u.protocol))throw Error();a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';}catch{a.removeAttribute('href');}return a;};
  function detail(title,body,open=false){const d=el('details','report-detail');d.open=open;append(d,el('summary','',title),append(el('div','report-detail-body'),body));return d;}
  function expandActions(container,label){
    const row=el('div','report-expand-actions');row.setAttribute('aria-label',label);
    for(const [text,open] of [['全部展开',true],['全部收起',false]]){const b=el('button','button secondary small',text);b.type='button';b.setAttribute('aria-label',`${label}${text}`);b.onclick=()=>container.querySelectorAll(':scope > details').forEach(d=>{d.open=open;});row.append(b);}
    return row;
  }
  function sampleButton(id,primary=false){const b=el('button',primary?'button primary':'report-sample',primary?'载入示例，开始实验':`载入 ${sampleNames[id]||id} ↗`);b.type='button';b.dataset.sample=id;b.title=sampleNames[id]||id;b.onclick=()=>launch(id,b);return b;}
  function watchContents(host,toc){
    tocObserver?.disconnect();
    const links=[...toc.querySelectorAll('a')],activate=id=>links.forEach(a=>{const active=a.hash===`#${id}`;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});
    links.forEach(a=>a.addEventListener('click',()=>activate(a.hash.slice(1))));
    if(!('IntersectionObserver' in window))return;
    tocObserver=new IntersectionObserver(entries=>{const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top);if(visible.length)activate(visible[0].target.id);},{rootMargin:'-10% 0px -60% 0px',threshold:0});
    host.querySelectorAll(':scope > .report-section').forEach(s=>tocObserver.observe(s));
  }
  function algorithms(ids){return (ids||[]).map(id=>{
    const a=data.algorithms.find(x=>x.id===id);if(!a)return null;
    const body=append(el('div'),el('p','report-principle',a.principle),el('p','report-muted',a.implementation),el('h4','','适用目标'),list(a.objectives),el('h4','','当前已接入的约束'),list(a.implemented_constraints),el('h4','','使用边界'),list(a.limitations));
    const sources=append(el('div','report-method-sources'),(a.source_ids||[]).map(s=>data.sources.find(x=>x.id===s)).filter(Boolean).map(safeLink));body.append(sources);
    const d=detail(a.title,body);d.dataset.algorithm=id;d.querySelector('summary').append(el('small','report-route-id',id));return d;
  });}
  async function launch(id,button){
    const label=button?.textContent;if(button){button.disabled=true;button.textContent='正在载入…';}
    try{const r=await fetch(`/api/datasets/${encodeURIComponent(id)}`);const p=await r.json();if(!r.ok)throw Error(p.error||'场景载入失败');
      if(p.kind==='box'){if(!window.CuttingBox?.loadProblem)throw Error('三维模块仍在载入，请稍后再试。');window.CuttingBox.loadProblem(p);}
      else window.CuttingLab.setProblem(p,{original:p,tab:'workspace'});
      window.CuttingLab.toast('已载入报告示例，可调整参数后开始求解。');
    }catch(e){window.CuttingLab?.toast(e.message);}finally{if(button){button.disabled=false;button.textContent=label;}}
  }
  function report(){
    const host=document.getElementById('report-document');if(!host)return;host.replaceChildren();
    const d=data.industries.find(x=>x.id===current);if(!d)return;
    const index=data.industries.indexOf(d)+1;host.dataset.industry=d.id;
    const ids=[...d.sample_ids];if(d.id==='bars'&&!ids.includes('bar-stock-kerf'))ids.push('bar-stock-kerf');
    const head=append(el('header','report-document-head'),el('span','report-kicker',`INDUSTRY NOTE / ${String(index).padStart(2,'0')}`),el('h2','',d.title),el('p','report-lead',d.problem));head.dataset.industry=d.id;
    const overview=el('div','report-overview');[[d.implemented_routes.length,'求解路线'],[ids.length,'可试示例'],[d.sources.length,'资料来源']].forEach(([value,label])=>overview.append(append(el('div','report-stat'),el('strong','',String(value).padStart(2,'0')),el('span','',label))));head.append(overview);
    const actions=el('div','report-head-actions');if(ids.length)actions.append(sampleButton(ids[0],true));const allSources=el('a','button secondary','查看全部资料');allSources.href='#report-sources';actions.append(allSources);head.append(actions);
    const quickSources=append(el('div','report-quick-sources'),el('span','report-muted','官方 / 作者资料'));
    const primarySources=(d.sources||[]).filter((s,i)=>i===0||(!s.id.startsWith('ps-')&&i===(d.sources||[]).findIndex(x=>!x.id.startsWith('ps-'))));primarySources.slice(0,2).forEach(s=>quickSources.append(safeLink(s)));head.append(quickSources,el('p','report-muted',`报告更新 ${data.updated_at} · 每项资料保留独立核查日期`));host.append(head);
    const toc=el('nav','report-toc');toc.setAttribute('aria-label','报告目录');[['problem','工艺与约束'],['routes','算法路线'],['practice','在工作台尝试'],['research','研究切入点'],['sources','资料来源']].forEach(([id,label])=>{const a=el('a','',label);a.href=`#report-${id}`;toc.append(a);});host.append(toc);
    const constraints=section('report-problem','01 / PROCESS','先明确生产约束');
    constraints.append(list(d.constraints),el('p','report-callout',d.implementation_note));
    constraints.append(detail('尚未建模的生产条件',list(d.unimplemented_constraints),true));host.append(constraints);
    const routes=section('report-routes','02 / METHODS','可选择的算法路线');routes.append(el('p','report-muted','展开查看算法原理、适用目标、当前约束和官方文档。浏览器与本地可用范围以运行时提示为准。'));
    const methodList=el('div','report-algorithm-list');methodList.append(...algorithms(d.implemented_routes));routes.append(expandActions(methodList,'算法详情'),methodList);
    const products=software.products.filter(p=>p.industries.includes(d.id));
    if(products.length){routes.append(el('h3','report-subhead','行业软件怎样衔接生产？'),el('p','report-muted',software.source_note));const productList=el('div','report-product-list');products.forEach(p=>productList.append(detail(p.name,append(el('div'),el('h4','','官方公开功能'),el('p','',p.features),el('h4','','输入、输出与工作流程'),el('p','',p.workflow),el('h4','','本地试用与许可入口'),el('p','',p.access),append(el('div','report-method-sources'),p.links.map(safeLink)),el('p','report-muted',`资料核查日期：${p.checked_on}；不据公开营销文字推断私有求解算法。`)))));routes.append(expandActions(productList,'软件详情'),productList);}
    host.append(routes);
    const practice=section('report-practice','03 / EXPERIMENT','把报告变成一次可复现实验');practice.append(el('p','',d.evidence),el('p','report-callout',d.data_quality));
    const samples=el('div','report-sample-row');ids.forEach(id=>samples.append(sampleButton(id)));practice.append(samples,el('p','report-muted','示例载入后可以编辑。公开服装基准的坐标不自动等于毫米；合成行业场景用于测试功能，不代表真实工厂订单。'));host.append(practice);
    const research=section('report-research','04 / RESEARCH','值得验证的研究问题');
    d.research_directions.forEach(r=>research.append(detail(r.title,append(el('div'),el('p','',r.hypothesis),el('h4','','需要的数据与基线'),el('p','',r.requirements),el('h4','','应报告的指标'),list(r.metrics)))));host.append(research);
    const sources=section('report-sources','05 / SOURCES','继续阅读官方资料');sources.append(el('p','report-muted','链接用于查阅原始依据。厂商公开功能说明不等于其私有算法、市场占有率或平均节料率。'));
    (d.sources||[]).forEach((s,i)=>sources.append(append(el('div','report-source-row'),el('span','report-source-no',String(i+1).padStart(2,'0')),append(el('div'),safeLink(s),el('p','report-muted',`核查记录：${s.checked_on} · ${s.verification}`)))));host.append(sources);
    document.querySelectorAll('.report-industry').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.industry===current)));
    watchContents(host,toc);
  }
  function navigation(){const nav=document.getElementById('report-industry-list');nav.replaceChildren();const q=query.trim().toLowerCase();const matches=data.industries.filter(d=>!q||JSON.stringify(d).toLowerCase().includes(q));
    matches.forEach(d=>{const b=el('button','report-industry');b.type='button';b.dataset.industry=d.id;append(b,el('span','',d.title),el('small','',`${d.implemented_routes.length} 条路线 · ${d.sources.length} 项资料`));b.setAttribute('aria-pressed',String(current===d.id));b.onclick=()=>{current=d.id;report();if(window.matchMedia('(max-width: 700px)').matches)document.getElementById('report-document').scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});};nav.append(b);});if(!matches.length)nav.append(el('p','report-muted','没有匹配的行业，可试试“刀缝”“旋转”或“重量”。'));const count=document.getElementById('report-search-count');if(count)count.textContent=q?`找到 ${matches.length} 个行业`:`共 ${data.industries.length} 个行业`;
  }
  function methodology(){
    const wrap=el('section','report-methodology');wrap.append(el('span','report-kicker','LAB NOTES / 方法与证据'),el('h2','','让每一次比较有依据'));
    wrap.append(detail('怎样公平比较不同算法？',list(data.fair_comparison.rules,true)));
    const metrics=append(el('dl','report-definitions'),data.fair_comparison.metrics.flatMap(m=>[el('dt','',m.name),el('dd','',m.definition)]));wrap.append(detail('指标怎样计算？',metrics));
    const evidence=el('div');data.data_quality.levels.forEach(x=>evidence.append(el('h4','',x.label),el('p','',x.scope),el('p','report-muted',x.limit)));wrap.append(detail('公开基准、合成数据与工业证据',evidence));
    wrap.append(detail('全部算法索引',append(el('div'),algorithms(data.algorithms.map(a=>a.id)))));
    const researchRoutes=[
      {name:'几何层：NFP 与碰撞检测',text:'无适配多边形（NFP）描述一个零件相对另一个零件产生碰撞的位置区域。先建立几何可行位置，再搜索零件的排列顺序和朝向，是异形排料的一条经典路线。几何引擎本身并不会自动决定最优布局。',url:'https://github.com/Jack000/SVGnest',source:'SVGnest 作者代码与算法说明',status:'扩展阅读；未把 SVGnest 接为当前求解路线。'},
      {name:'树搜索：逐步扩展可行方案',text:'从部分方案出发，尝试加入零件或切割决策，利用界、排序和搜索预算决定继续探索哪些分支。贯通裁切还需维护阶段与切割树，能排下并不代表能按设备规则切出。',url:'https://fontanf.github.io/packingsolver/internals/rectangleguillotine.html',source:'PackingSolver 贯通切内部算法',status:'当前贯通路线真实接入；内部策略取决于版本、目标和实例，不保证每次运行所有算法。'},
      {name:'列生成：从单根切法到整批需求',text:'一个切割模式规定一根材料能产出哪些零件。主问题决定各模式使用多少次；定价子问题寻找可能改善目标的新模式。用于大量重复需求时，可避免一开始列出所有切法，但整数化与实际工艺仍需验证。',url:'https://fontanf.github.io/packingsolver/internals/onedimensional.html',source:'PackingSolver 一维内部算法',status:'用于理解一维求解框架；FFD/BFD 则是独立的透明贪心基线。'},
      {name:'局部搜索：压缩与重叠消解',text:'可把缩短条带转为一系列固定长度的可行性问题：尝试压缩，再调整位置和朝向消除碰撞。Sparrow 的探索与压缩路线适合作为进一步研究的强基线，需要相同数据、方向和预算的本地复现。',url:'https://github.com/JeroenGar/sparrow',source:'Sparrow 作者实现',status:'研究候选，尚未接入本工作台；不使用作者成绩作为我们的实测结果。'},
      {name:'学习辅助：选择顺序、动作或搜索策略',text:'学习方法可以辅助排列顺序、选择旋转或改善布局；必须把训练、模型选择与最终测试实例分开。几何可行性和工艺约束仍需独立检查，不能只与较弱的贪心法比较后宣称工业优势。',url:'https://github.com/alehuger/rl_nester',source:'rl_nester 作者实现',status:'研究候选，尚未训练或部署；不表示已经验证优于当前启发式。'}
    ];
    const routeBody=el('div');researchRoutes.forEach(r=>routeBody.append(el('h4','',r.name),el('p','',r.text),el('p','report-muted',r.status),safeLink({title:r.source,url:r.url})));wrap.append(detail('进一步理解：几何、树搜索、列生成与学习路线',routeBody));
    const demo=data.fair_comparison.demo_artifact;if(demo?.results){const area=el('div','report-table-scroll'),table=el('table','report-comparison');const thead=el('thead'),hr=el('tr');['路线','已放 / 需求','张数','利用率','实测耗时','校验'].forEach(t=>hr.append(el('th','',t)));thead.append(hr);table.append(thead);const tb=el('tbody');demo.results.forEach(r=>{const tr=el('tr');[titles[r.route]||r.route,`${r.placed_pieces} / ${r.required_pieces}`,r.bin_count,`${r.utilization_percent.toFixed(2)}%`,`${r.actual_s.toFixed(3)} s`,r.validation_pass?'通过':'未通过'].forEach(v=>tr.append(el('td','',v)));tb.append(tr);});table.append(tb);area.append(table);wrap.append(detail('同输入实测：纸张拼版的三条路线',append(el('div'),area,el('p','report-muted',demo.interpretation))));}
    return wrap;
  }
  async function boot(){
    const host=document.getElementById('tab-reports');if(!host)return;
    host.append(el('p','report-muted','正在读取行业报告…'));
    try{const responses=await Promise.all(['industry_reports.json','software_catalog.json'].map(name=>fetch(`reports/${name}`)));if(responses.some(r=>!r.ok))throw Error('报告文件暂时不可读取');[data,software]=await Promise.all(responses.map(r=>r.json()));host.replaceChildren();
      host.append(append(el('header','report-page-head'),el('span','report-kicker','KNOWLEDGE / 裁切研究'),el('h1','','从材料出发，理解算法。'),el('p','','八个行业的工艺约束、求解路线与资料来源。选择行业深入阅读，也可以直接载入示例，在工作台验证。')));
      const layout=el('div','report-layout'),side=el('aside','report-sidebar'),search=el('input','report-search');search.type='search';search.placeholder='搜索行业、工艺或关键词';search.setAttribute('aria-label','搜索行业报告');search.oninput=()=>{query=search.value;navigation();};
      const count=el('p','report-search-count report-muted');count.id='report-search-count';count.setAttribute('role','status');count.setAttribute('aria-live','polite');append(side,el('h2','','行业目录'),search,count,Object.assign(el('div'),{id:'report-industry-list'}));layout.append(side,Object.assign(el('article','report-document'),{id:'report-document'}));host.append(layout,methodology());navigation();report();
    }catch(e){host.replaceChildren(el('p','report-callout',e.message));}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
