/* Local polygon editor: no remote resources and no change to caller coordinates. */
(() => {
  'use strict';
  const NS='http://www.w3.org/2000/svg';
  const clone=x=>JSON.parse(JSON.stringify(x));
  const round=n=>Math.round(n*10000)/10000;
  function geometry(points) {
    if(points.length<3) return {valid:false,message:'至少需要 3 个顶点，点击画布继续描点。',area:0,width:0,height:0};
    if(points.some(p=>p.length!==2||p.some(v=>!Number.isFinite(v)||Math.abs(v)>1e9))) return {valid:false,message:'坐标必须是有限数值，绝对值不超过 10 亿。',area:0,width:0,height:0};
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
    const width=Math.max(...xs)-Math.min(...xs),height=Math.max(...ys)-Math.min(...ys);
    const eps=Math.max(1,width,height)*1e-9;
    let area=0;
    const n=points.length;
    for(let i=0;i<n;i++){const a=points[i],b=points[(i+1)%n];area+=a[0]*b[1]-b[0]*a[1];}
    area=Math.abs(area)/2;
    const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const on=(a,b,c)=>Math.abs(cross(a,b,c))<=eps*Math.max(1,width,height)&&c[0]>=Math.min(a[0],b[0])-eps&&c[0]<=Math.max(a[0],b[0])+eps&&c[1]>=Math.min(a[1],b[1])-eps&&c[1]<=Math.max(a[1],b[1])+eps;
    const intersects=(a,b,c,d)=>{const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);return (abC*abD<0&&cdA*cdB<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);};
    for(let i=0;i<n;i++){
      const a=points[i],b=points[(i+1)%n];
      if(Math.hypot(a[0]-b[0],a[1]-b[1])<=eps)return {valid:false,message:`顶点 ${i+1} 与相邻顶点重合，请移动或删除。`,area,width,height};
      for(let j=i+1;j<n;j++){
        if(j===i+1||(i===0&&j===n-1))continue;
        if(intersects(a,b,points[j],points[(j+1)%n]))return {valid:false,message:`第 ${i+1} 条边与第 ${j+1} 条边相交，请调整顶点。`,area,width,height};
      }
    }
    if(area<=eps*eps)return {valid:false,message:'裁片面积为零，请调整轮廓。',area,width,height};
    return {valid:true,message:'轮廓有效：闭合、无自交。',area,width,height};
  }
  function open(options={}){
    let points=Array.isArray(options.initialPoints)?clone(options.initialPoints):[];
    if(points.length>1&&points[0][0]===points.at(-1)[0]&&points[0][1]===points.at(-1)[1])points.pop();
    if(points.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v))))points=[];
    let closed=points.length>=3,selected=points.length?0:-1,past=[],future=[],drag=null,view={x:-10,y:-10,w:120,h:100},destroyed=false;
    const previousFocus=document.activeElement;
    const dialog=document.createElement('dialog');dialog.className='cde-dialog';dialog.setAttribute('aria-labelledby','cde-title');
    dialog.innerHTML=`<header class="cde-header"><div><h2 id="cde-title">绘制自定义裁片</h2><p>描出轮廓，拖动顶点微调；坐标和数量会直接加入当前场景。</p></div><button type="button" class="cde-close" data-action="cancel" aria-label="关闭绘图">×</button></header><div class="cde-body"><aside class="cde-panel"><h3>裁片信息</h3><label for="cde-name">裁片名称</label><input id="cde-name" maxlength="80" value="自定义裁片"><label for="cde-quantity">需求数量</label><input id="cde-quantity" type="number" min="1" max="500" step="1" value="1"><h3>矩形起稿</h3><div class="cde-row"><div><label for="cde-width">宽度 X</label><input id="cde-width" type="number" min="0.001" step="any" value="60"></div><div><label for="cde-height">高度 Y</label><input id="cde-height" type="number" min="0.001" step="any" value="40"></div></div><button type="button" class="cde-block-button" data-action="rectangle">生成矩形轮廓</button><h3>绘图辅助</h3><div class="cde-row"><label><input type="checkbox" id="cde-snap" checked>网格吸附</label><div><label for="cde-grid">网格间距</label><input id="cde-grid" type="number" min="0.001" step="any" value="5"></div></div><h3>精确编辑顶点</h3><div class="cde-row"><div><label for="cde-x">X 坐标</label><input id="cde-x" type="number" step="any" value="0"></div><div><label for="cde-y">Y 坐标</label><input id="cde-y" type="number" step="any" value="0"></div></div><button type="button" class="cde-block-button" data-action="coordinate">应用坐标</button><div class="cde-row"><button type="button" class="cde-block-button" data-action="insert">插入顶点</button><button type="button" class="cde-block-button" data-action="delete">删除顶点</button></div></aside><div class="cde-stage"><div class="cde-toolbar"><button type="button" data-action="undo" title="撤销 Ctrl+Z">撤销</button><button type="button" data-action="redo" title="重做 Ctrl+Shift+Z">重做</button><button type="button" data-action="clear">清空</button><button type="button" data-action="fit">适应视图</button><button type="button" data-action="finish">闭合轮廓</button><span class="cde-status" aria-live="polite"></span></div><svg class="cde-canvas" xmlns="http://www.w3.org/2000/svg" tabindex="0" role="img" aria-label="裁片绘图区域。点击描点，点击首点闭合，拖动顶点编辑。"></svg><div class="cde-note">点击空白处描点 · 点击首点闭合 · 拖动顶点调整 · 滚轮缩放 · 空格拖动平移<br>按住 Shift 临时关闭吸附 · 双击闭合 · Enter 完成轮廓</div></div><aside class="cde-panel"><div><h3>轮廓预览</h3><div class="cde-metrics"><div class="cde-metric"><span>外接宽度</span><strong data-metric="width">0</strong></div><div class="cde-metric"><span>外接高度</span><strong data-metric="height">0</strong></div><div class="cde-metric"><span>轮廓面积 · 单位²</span><strong data-metric="area">0</strong></div></div><p class="cde-validation" role="status" aria-live="polite"></p></div><div><h3>顶点坐标</h3><ol class="cde-point-list" aria-label="顶点列表"></ol><p class="cde-alert" role="alert"></p></div></aside></div><footer class="cde-footer"><p>不自动缩放尺寸，不镜像；允许旋转由主界面设置。<br>自定义轮廓应使用与材料一致的单位。</p><div class="cde-actions"><button type="button" data-action="cancel">取消</button><button type="button" class="cde-primary" data-action="save">加入裁片</button></div></footer>`;
    document.body.append(dialog);
    const $=sel=>dialog.querySelector(sel),svg=$('.cde-canvas'),pointList=$('.cde-point-list'),error=$('.cde-alert');
    if(options.mode==='edit'||(options.mode!=='create'&&Array.isArray(options.initialPoints))){$('#cde-title').textContent='编辑裁片轮廓';$('.cde-header p').textContent='调整这一类型的轮廓、名称或数量；保存后替换原裁片类型，不新增类型。';$('[data-action="save"]').textContent='保存修改';$('.cde-close').setAttribute('aria-label','关闭编辑');}
    $('#cde-name').value=options.name||'自定义裁片';$('#cde-quantity').value=options.quantity||1;
    const snapshot=()=>({points:clone(points),closed,selected});
    const restore=s=>{points=clone(s.points);closed=s.closed;selected=s.selected;render();};
    const change=fn=>{past.push(snapshot());if(past.length>100)past.shift();future=[];fn();error.textContent='';render();};
    const fmt=n=>Number(n.toFixed(3)).toLocaleString('zh-CN');
    const elt=(name,attrs)=>{const el=document.createElementNS(NS,name);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,v);return el;};
    let space=false;
    function fit(){if(points.length){const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),minX=Math.min(...xs),minY=Math.min(...ys),w=Math.max(...xs)-minX,h=Math.max(...ys)-minY,pad=Math.max(w,h,10)*.16;view={x:minX-pad,y:minY-pad,w:Math.max(w+pad*2,10),h:Math.max(h+pad*2,10)};}else view={x:-10,y:-10,w:120,h:100};render();}
    function render(){
      if(destroyed)return;
      svg.setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.h}`);svg.replaceChildren();
      const unit=Math.max(0.001,Number($('#cde-grid').value)||5);let displayed=unit;while(view.w/displayed>90||view.h/displayed>90)displayed*=10;
      const defs=elt('defs',{}),pattern=elt('pattern',{id:'cde-grid-pattern',width:displayed,height:displayed,patternUnits:'userSpaceOnUse'});pattern.append(elt('path',{d:`M ${displayed} 0 L 0 0 0 ${displayed}`,fill:'none',stroke:'#cfdacc','stroke-width':'.6','vector-effect':'non-scaling-stroke'}));defs.append(pattern);svg.append(defs,elt('rect',{x:view.x,y:view.y,width:view.w,height:view.h,fill:'url(#cde-grid-pattern)'}));
      const axis=elt('path',{d:`M ${view.x} 0 H ${view.x+view.w} M 0 ${view.y} V ${view.y+view.h}`,fill:'none',stroke:'#96ad92','stroke-width':1,'vector-effect':'non-scaling-stroke'});svg.append(axis);
      const geo=geometry(points),scale=Math.max(view.w/Math.max(svg.clientWidth,100),view.h/Math.max(svg.clientHeight,100));
      if(points.length>1)svg.append(elt(closed?'polygon':'polyline',{points:points.map(p=>p.join(',')).join(' '),fill:closed?(geo.valid?'#91bea362':'#e5a48c65'):'none',stroke:geo.valid||!closed?'#276950':'#b45f44','stroke-width':2.2,'vector-effect':'non-scaling-stroke','stroke-linejoin':'round'}));
      points.forEach((p,i)=>{const c=elt('circle',{cx:p[0],cy:p[1],r:(i===selected?6:4.5)*scale,fill:i===selected?'#235a50':'white',stroke:i===0&&!closed?'#b48036':'#326f56','stroke-width':1.8,'vector-effect':'non-scaling-stroke','data-index':i,class:'cde-vertex'});svg.append(c);const label=elt('text',{x:p[0]+8*scale,y:p[1]-8*scale,'font-size':10*scale,fill:'#49664f','pointer-events':'none'});label.textContent=i+1;svg.append(label);});
      $('.cde-status').textContent=`${points.length} 个顶点 · ${closed?'已闭合':'描点中'}`;
      for(const key of['width','height','area'])$(`[data-metric="${key}"]`).textContent=fmt(geo[key]);
      const val=$('.cde-validation');val.textContent=closed?geo.message:'点击首点或「闭合轮廓」完成绘制。';val.classList.toggle('error',closed&&!geo.valid);
      $('[data-action="undo"]').disabled=!past.length;$('[data-action="redo"]').disabled=!future.length;
      $('[data-action="finish"]').textContent=closed?'继续描点':'闭合轮廓';$('[data-action="finish"]').disabled=!closed&&points.length<3;
      $('[data-action="save"]').disabled=!(closed&&geo.valid);$('[data-action="delete"]').disabled=selected<0;$('[data-action="insert"]').disabled=selected<0||points.length>=200;
      $('[data-action="coordinate"]').textContent=selected>=0?'应用坐标':'添加坐标点';
      if(selected>=0&&points[selected]){$('#cde-x').value=points[selected][0];$('#cde-y').value=points[selected][1];}
      pointList.replaceChildren();points.forEach((p,i)=>{const li=document.createElement('li'),b=document.createElement('button');b.type='button';b.textContent=`${i+1}.  (${fmt(p[0])}, ${fmt(p[1])})`;if(selected===i)b.className='selected';b.addEventListener('click',()=>{selected=i;render();});li.append(b);pointList.append(li);});
    }
    function coords(event){const ctm=svg.getScreenCTM();if(!ctm)return [0,0];const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(ctm.inverse()),grid=Number($('#cde-grid').value);let x=p.x,y=p.y;if($('#cde-snap').checked&&!event.shiftKey&&grid>0){x=Math.round(x/grid)*grid;y=Math.round(y/grid)*grid;}return[round(x),round(y)];}
    const addPoint=p=>{if(points.length>=200){error.textContent='单个轮廓最多支持 200 个顶点。';return;}change(()=>{points.push(p);selected=points.length-1;});};
    svg.addEventListener('pointerdown',e=>{if(e.button!==0&&e.button!==1)return;e.preventDefault();const idx=e.target.getAttribute('data-index');if(space||e.button===1){drag={type:'pan',start:[e.clientX,e.clientY],view:{...view}};svg.setPointerCapture(e.pointerId);return;}if(idx!==null){const i=Number(idx);if(!closed&&i===0&&points.length>=3){change(()=>{closed=true;selected=0;});return;}selected=i;drag={type:'point',initial:snapshot(),index:i};svg.setPointerCapture(e.pointerId);render();return;}if(!closed)addPoint(coords(e));else{selected=-1;render();}});
    svg.addEventListener('pointermove',e=>{if(!drag)return;if(drag.type==='point'){points[drag.index]=coords(e);render();}else{const ctm=svg.getScreenCTM(),a=new DOMPoint(drag.start[0],drag.start[1]).matrixTransform(ctm.inverse()),b=new DOMPoint(e.clientX,e.clientY).matrixTransform(ctm.inverse());view.x=drag.view.x+a.x-b.x;view.y=drag.view.y+a.y-b.y;render();}});
    const finishDrag=()=>{if(drag?.type==='point'&&JSON.stringify(drag.initial.points)!==JSON.stringify(points)){past.push(drag.initial);future=[];}drag=null;render();};svg.addEventListener('pointerup',finishDrag);svg.addEventListener('pointercancel',finishDrag);
    svg.addEventListener('dblclick',e=>{e.preventDefault();if(!closed&&points.length>=3)change(()=>{if(points.length>3&&Math.hypot(...points.at(-1).map((v,i)=>v-points.at(-2)[i]))<1e-8)points.pop();closed=true;selected=points.length-1;});});
    svg.addEventListener('wheel',e=>{e.preventDefault();const point=coords({...e,clientX:e.clientX,clientY:e.clientY,shiftKey:true});const factor=Math.exp(Math.max(-1,Math.min(1,e.deltaY*.001)));if(view.w*factor<.01||view.w*factor>1e9)return;view={x:point[0]+(view.x-point[0])*factor,y:point[1]+(view.y-point[1])*factor,w:view.w*factor,h:view.h*factor};render();},{passive:false});
    let resolvePromise;const result=new Promise(resolve=>{resolvePromise=resolve;});
    function close(value=null){if(destroyed)return;destroyed=true;dialog.close();dialog.remove();previousFocus?.focus?.();resolvePromise(value);}
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    dialog.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;if(e.code==='Space'){space=true;e.preventDefault();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();action(e.shiftKey?'redo':'undo');}if(e.key==='Enter'){e.preventDefault();if(!closed&&points.length>=3)action('finish');}if(e.key==='Delete'&&selected>=0){e.preventDefault();action('delete');}});
    dialog.addEventListener('keyup',e=>{if(e.code==='Space')space=false;});
    dialog.addEventListener('click',e=>{const button=e.target.closest('button[data-action]');if(button)action(button.dataset.action);});
    $('#cde-grid').addEventListener('change',render);
    async function action(name){error.textContent='';switch(name){
      case'cancel':close();break;
      case'undo':if(past.length){future.push(snapshot());restore(past.pop());}break;
      case'redo':if(future.length){past.push(snapshot());restore(future.pop());}break;
      case'clear':change(()=>{points=[];closed=false;selected=-1;});break;
      case'fit':fit();break;
      case'finish':change(()=>{closed=!closed;});break;
      case'rectangle':{const w=Number($('#cde-width').value),h=Number($('#cde-height').value);if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0||w>1e9||h>1e9){error.textContent='请输入大于 0 的有限宽度和高度。';return;}change(()=>{points=[[0,0],[w,0],[w,h],[0,h]];closed=true;selected=0;});fit();break;}
      case'coordinate':{const x=Number($('#cde-x').value),y=Number($('#cde-y').value);if(!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>1e9||Math.abs(y)>1e9){error.textContent='请输入有效的 X / Y 坐标。';return;}if(selected>=0)change(()=>{points[selected]=[x,y];});else if(!closed)addPoint([x,y]);else error.textContent='先选择一个顶点，或点击「继续描点」。';break;}
      case'delete':if(selected>=0)change(()=>{points.splice(selected,1);selected=Math.min(selected,points.length-1);if(points.length<3)closed=false;});break;
      case'insert':if(selected>=0&&points.length<200)change(()=>{const a=points[selected],b=points[(selected+1)%points.length];points.splice(selected+1,0,[(a[0]+b[0])/2,(a[1]+b[1])/2]);selected++;});break;
      case'save':{const info=geometry(points),name=$('#cde-name').value.trim(),quantity=Number($('#cde-quantity').value);if(!closed||!info.valid){error.textContent=info.message;return;}if(!name){error.textContent='请给裁片填写名称。';$('#cde-name').focus();return;}if(!Number.isInteger(quantity)||quantity<1||quantity>500){error.textContent='需求数量应为 1–500 的整数。';$('#cde-quantity').focus();return;}try{$('[data-action="save"]').disabled=true;await options.onSave?.(clone(points),name,quantity);close({points:clone(points),name,quantity});}catch(e){error.textContent=e?.message||'未能保存，请检查当前场景。';$('[data-action="save"]').disabled=false;}break;}
    }}
    dialog.showModal();fit();$('#cde-name').focus();
    return {dialog,result,close,getPoints:()=>clone(points)};
  }
  window.CuttingDrawEditor={open,validate:geometry};
})();
