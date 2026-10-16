import * as THREE from './vendor/three-0.180.0/three.module.js';
import { OrbitControls } from './vendor/three-0.180.0/OrbitControls.js';

// Model X/Y/Z map to world X/Z/Y so the solver's Z axis appears vertically.
const mounted=new WeakMap();
const palette=['#3878d8','#16a28c','#e7813f','#d6ae27','#9a74d3','#dc678d','#41a7ce','#74a84c','#cd7c51','#6a83d2'];
const finite=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
const fmt=v=>Number(v.toFixed(3)).toLocaleString('zh-CN');
function dimensions(item){const a=item.dimensions||[];return[finite(item.width??a[0]),finite(item.height??a[1]),finite(item.depth??a[2])];}
function position(item){const a=item.position||[];return[finite(item.x??a[0]),finite(item.y??a[1]),finite(item.z??a[2])];}
function colorFor(id){let n=0;for(const ch of String(id??0))n=(n*31+ch.charCodeAt(0))>>>0;return palette[n%palette.length];}
const vec=(x,y,z)=>new THREE.Vector3(x,z,y);

function mount(container, options={}){
  if(typeof container==='string')container=document.querySelector(container);
  if(!container)throw new Error('找不到三维视图容器。');
  mounted.get(container)?.destroy();
  const isResult=options.mode==='result';
  const stock=options.stock||{},[sw,sh,sd]=dimensions(stock);
  const units=options.units||options.unit||'原始单位';
  const items=Array.isArray(options.items)?options.items:[];
  const wrapper=document.createElement('section');wrapper.className='c3d-viewer';
  wrapper.innerHTML=`<div class="c3d-toolbar"><span class="c3d-mode"></span><button type="button" data-command="reset">重置视角</button><button type="button" data-command="top">俯视</button><button type="button" data-command="front">正视</button><button type="button" data-command="wire" aria-pressed="false">线框</button><button type="button" data-command="transparent" aria-pressed="false">半透明</button></div><div class="c3d-stage" tabindex="0" aria-label="三维箱体视图。鼠标拖动旋转，滚轮缩放，右键拖动平移；方向键旋转，加减缩放，0复位。"><div class="c3d-caption"><strong></strong><span></span></div><div class="c3d-selection" aria-live="polite"><div class="c3d-selection-title">点击箱体查看参数</div><p>不同颜色对应不同类型。</p><p>旋转视图不会改变求解结果。</p></div></div><div class="c3d-legend"><span><i style="background:#be7260"></i>X 长度</span><span><i style="background:#709c67"></i>Y 宽度</span><span><i style="background:#6e94b5"></i>Z 高度</span><span class="c3d-help">左键旋转 · 滚轮缩放 · 右键平移</span></div>`;
  container.append(wrapper);
  const stage=wrapper.querySelector('.c3d-stage'),caption=wrapper.querySelector('.c3d-caption'),selection=wrapper.querySelector('.c3d-selection');
  wrapper.querySelector('.c3d-mode').textContent=isResult?'三维装箱结果':'箱体参数预览';
  caption.querySelector('strong').textContent=isResult?`容器 ${finite(options.binIndex)+1} · ${items.length} 个已放置箱体`:'参数展台 · 每种箱体显示一件';
  caption.querySelector('span').textContent=isResult?`长 X ${fmt(sw)} × 宽 Y ${fmt(sh)} × 高 Z ${fmt(sd)} ${units}`:'左侧为容器，右侧为箱体模型；尚未进行装箱计算。';
  let renderer;
  function errorView(message){stage.replaceChildren();const e=document.createElement('div');e.className='c3d-error';const title=document.createElement('strong');title.textContent='三维视图暂时不可用';const p=document.createElement('p');p.textContent=message;e.append(title,p);stage.append(e);for(const b of wrapper.querySelectorAll('button'))b.disabled=true;const fallback={destroy(){wrapper.remove();mounted.delete(container);},resize(){},resetView(){},setWireframe(){},setTransparent(){},select(){},captureImage(){throw new Error(message);},error:message};mounted.set(container,fallback);return fallback;}
  if([sw,sh,sd].some(d=>!(d>0)))return errorView('请先填写大于零的容器长、宽、高，再预览模型。');
  if(items.some(item=>dimensions(item).some(d=>!(d>0))))return errorView('有箱体缺少有效长、宽、高；请先修正参数。');
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});}catch(e){return errorView('浏览器未能创建 WebGL 三维画布。请启用浏览器图形加速或换用支持 WebGL 的浏览器；参数和求解功能仍可继续使用。');}
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;
  stage.prepend(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,1,.01,1e7);
  scene.add(new THREE.HemisphereLight(0xffffff,0xa2ac8a,2.1));
  const light=new THREE.DirectionalLight(0xfffaf0,2.6);light.position.set(4,8,6);scene.add(light);
  const fill=new THREE.DirectionalLight(0xdfeaff,.8);fill.position.set(-6,4,-5);scene.add(fill);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.screenSpacePanning=true;controls.maxPolarAngle=Math.PI*.96;
  const meshes=[],disposables=[],bounds=new THREE.Box3(),group=new THREE.Group();scene.add(group);
  let destroyed=false,queuedFrame=0,selected=null,wire=false,transparent=false;
  const keep=x=>{disposables.push(x);return x;};
  function requestRender(){if(destroyed||queuedFrame)return;queuedFrame=requestAnimationFrame(()=>{queuedFrame=0;if(!destroyed)renderer.render(scene,camera);});}
  function label(text,point,size,color='#536e48'){
    const canvas=document.createElement('canvas');canvas.width=text.length<3?128:512;canvas.height=128;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,128);ctx.font='600 64px "Microsoft YaHei", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(text,canvas.width/2,64,canvas.width-12);
    const tex=keep(new THREE.CanvasTexture(canvas));tex.colorSpace=THREE.SRGBColorSpace;
    const mat=keep(new THREE.SpriteMaterial({map:tex,depthTest:false,transparent:true}));const sprite=new THREE.Sprite(mat);sprite.position.copy(point);sprite.scale.set(size,size*128/canvas.width,1);sprite.renderOrder=5;scene.add(sprite);return sprite;
  }
  function edgeBox(dims,origin,color,opacity=1){const geometry=keep(new THREE.BoxGeometry(dims[0],dims[2],dims[1])),edges=keep(new THREE.EdgesGeometry(geometry)),material=keep(new THREE.LineBasicMaterial({color,transparent:opacity<1,opacity})),line=new THREE.LineSegments(edges,material);line.position.copy(vec(origin[0]+dims[0]/2,origin[1]+dims[1]/2,origin[2]+dims[2]/2));group.add(line);return line;}
  const stockGeo=keep(new THREE.BoxGeometry(sw,sd,sh)),stockMaterial=keep(new THREE.MeshStandardMaterial({color:'#b0bea3',transparent:true,opacity:.045,roughness:1,side:THREE.DoubleSide,depthWrite:false})),stockMesh=new THREE.Mesh(stockGeo,stockMaterial);stockMesh.position.copy(vec(sw/2,sh/2,sd/2));group.add(stockMesh);edgeBox([sw,sh,sd],[0,0,0],'#67855b',.7);
  bounds.expandByPoint(vec(0,0,0));bounds.expandByPoint(vec(sw,sh,sd));
  const stockMax=Math.max(sw,sh,sd);
  if(!isResult)label('容器模型',vec(sw/2,sh/2,sd+stockMax*.08),stockMax*.42);
  let previewX=sw+stockMax*.38,previewY=0,rowH=0;
  items.forEach((item,index)=>{
    const dims=dimensions(item);let pos;
    if(isResult)pos=position(item);
    else{if(index&&index%3===0){previewX=sw+stockMax*.38;previewY+=rowH+stockMax*.14;rowH=0;}pos=[previewX,previewY,0];previewX+=dims[0]+stockMax*.13;rowH=Math.max(rowH,dims[1]);}
    const geometry=keep(new THREE.BoxGeometry(dims[0],dims[2],dims[1]));
    const color=colorFor(item.id??index),material=keep(new THREE.MeshStandardMaterial({color,roughness:.6,metalness:.025}));
    const mesh=new THREE.Mesh(geometry,material);mesh.position.copy(vec(pos[0]+dims[0]/2,pos[1]+dims[1]/2,pos[2]+dims[2]/2));mesh.userData={item,index,dims,pos,color};group.add(mesh);meshes.push(mesh);
    const outline=edgeBox(dims,pos,new THREE.Color(color).multiplyScalar(.62));mesh.userData.outline=outline;
    bounds.expandByPoint(vec(...pos));bounds.expandByPoint(vec(pos[0]+dims[0],pos[1]+dims[1],pos[2]+dims[2]));
    if(!isResult)label(`${item.name||`箱体 ${index+1}`} × ${item.quantity??1}`,vec(pos[0]+dims[0]/2,pos[1]+dims[1]/2,dims[2]+stockMax*.07),Math.max(dims[0]*1.4,stockMax*.44));
  });
  const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),extent=Math.max(size.x,size.y,size.z,1);
  const gridSize=Math.max(sw,sh,size.x,size.z)*1.35,grid=new THREE.GridHelper(gridSize,20,'#b7c4ad','#d8e1d0');grid.position.set(center.x,-extent*.003,center.z);scene.add(grid);keep(grid.geometry);if(Array.isArray(grid.material))grid.material.forEach(keep);else keep(grid.material);
  const axisLength=stockMax*.24;
  const arrows=[{dir:new THREE.Vector3(1,0,0),color:'#b46d5b',label:'X'},{dir:new THREE.Vector3(0,0,1),color:'#739867',label:'Y'},{dir:new THREE.Vector3(0,1,0),color:'#6f91ad',label:'Z'}];
  for(const a of arrows){const arrow=new THREE.ArrowHelper(a.dir,new THREE.Vector3(0,0,0),axisLength,a.color,axisLength*.12,axisLength*.065);scene.add(arrow);keep(arrow.line.geometry);keep(arrow.line.material);keep(arrow.cone.geometry);keep(arrow.cone.material);label(a.label,a.dir.clone().multiplyScalar(axisLength*1.17),axisLength*.32,a.color);}
  camera.near=Math.max(extent/5000,.001);camera.far=extent*100;camera.updateProjectionMatrix();controls.minDistance=extent*.05;controls.maxDistance=extent*30;
  function resetView(view='iso'){
    const aspect=Math.max(camera.aspect,.2),distance=extent/Math.min(aspect,1)*1.8;
    controls.target.copy(center);let offset;if(view==='top')offset=new THREE.Vector3(0,distance,.0001*distance);else if(view==='front')offset=new THREE.Vector3(0,.0001*distance,distance);else offset=new THREE.Vector3(distance*.78,distance*.65,distance*.9);
    camera.position.copy(center).add(offset);camera.up.set(0,1,0);controls.update();requestRender();
  }
  function resize(){if(destroyed)return;const width=stage.clientWidth,height=Math.max(stage.clientHeight,350);if(width<1)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();requestRender();}
  function select(meshOrIndex){const next=typeof meshOrIndex==='number'?meshes[meshOrIndex]:meshOrIndex;
    if(selected){selected.material.emissive.set(0);selected.userData.outline.material.color.copy(new THREE.Color(selected.userData.color).multiplyScalar(.62));}
    selected=next||null;
    const title=selection.querySelector('.c3d-selection-title'),paragraphs=selection.querySelectorAll('p');
    if(selected){selected.material.emissive.set('#7d6128');selected.material.emissiveIntensity=.25;selected.userData.outline.material.color.set('#ad6d24');const {item,dims,pos,index}=selected.userData;title.textContent=item.name||`箱体 ${index+1}`;paragraphs[0].textContent=`长 X ${fmt(dims[0])} × 宽 Y ${fmt(dims[1])} × 高 Z ${fmt(dims[2])} ${units}`;paragraphs[1].textContent=isResult?`原点 (${pos.map(fmt).join(', ')})${item.rotation?' · 方向 '+item.rotation:''}`:`需求 ${item.quantity??1} 件 · 体积 ${fmt(dims.reduce((a,b)=>a*b,1))} ${units}³`;options.onSelect?.(item,index);}
    else{title.textContent='点击箱体查看参数';paragraphs[0].textContent='不同颜色对应不同类型。';paragraphs[1].textContent=isResult?'旋转视图不会改变求解结果。':'展台位置仅用于参数预览。';options.onSelect?.(null,-1);}
    requestRender();
  }
  function setWireframe(value){wire=Boolean(value);for(const mesh of meshes)mesh.material.wireframe=wire;wrapper.querySelector('[data-command="wire"]').setAttribute('aria-pressed',String(wire));requestRender();}
  function setTransparent(value){transparent=Boolean(value);for(const mesh of meshes){mesh.material.transparent=transparent;mesh.material.opacity=transparent?.4:1;mesh.material.depthWrite=!transparent;mesh.material.needsUpdate=true;}wrapper.querySelector('[data-command="transparent"]').setAttribute('aria-pressed',String(transparent));requestRender();}
  function captureImage(){
    if(destroyed)throw new Error('三维视图已关闭，请重新打开后再保存。');
    const previousBackground=scene.background;
    try{scene.background=new THREE.Color('#f4f7f1');renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png');}
    finally{scene.background=previousBackground;requestRender();}
  }
  wrapper.querySelector('.c3d-toolbar').addEventListener('click',event=>{const command=event.target.closest('button')?.dataset.command;if(command==='reset')resetView();else if(command==='top'||command==='front')resetView(command);else if(command==='wire')setWireframe(!wire);else if(command==='transparent')setTransparent(!transparent);});
  const raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2();let pointerStart=null;
  renderer.domElement.addEventListener('pointerdown',e=>{if(e.button===0)pointerStart=[e.clientX,e.clientY];});
  renderer.domElement.addEventListener('pointerup',event=>{if(!pointerStart||Math.hypot(event.clientX-pointerStart[0],event.clientY-pointerStart[1])>5){pointerStart=null;return;}pointerStart=null;const r=renderer.domElement.getBoundingClientRect();mouse.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(mouse,camera);select(raycaster.intersectObjects(meshes,false)[0]?.object);});
  stage.addEventListener('keydown',e=>{if(e.key==='0'){e.preventDefault();resetView();return;}if(['+','=','-','_'].includes(e.key)){e.preventDefault();const offset=camera.position.clone().sub(controls.target).multiplyScalar(e.key==='-'||e.key==='_'?1.15:1/1.15);camera.position.copy(controls.target).add(offset);controls.update();requestRender();return;}if(e.key.startsWith('Arrow')){e.preventDefault();const offset=camera.position.clone().sub(controls.target),s=new THREE.Spherical().setFromVector3(offset);if(e.key==='ArrowLeft')s.theta-=.12;if(e.key==='ArrowRight')s.theta+=.12;if(e.key==='ArrowUp')s.phi-=.1;if(e.key==='ArrowDown')s.phi+=.1;s.phi=Math.min(Math.PI*.95,Math.max(.05,s.phi));camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));controls.update();requestRender();}});
  const observer=new ResizeObserver(resize);observer.observe(stage);controls.addEventListener('change',requestRender);
  const api={resize,resetView,setWireframe,setTransparent,select,captureImage,
    getViewState(){return {position:camera.position.toArray(),target:controls.target.toArray(),zoom:camera.zoom};},
    setViewState(value){if(!value||!Array.isArray(value.position)||!Array.isArray(value.target))return;camera.position.fromArray(value.position);controls.target.fromArray(value.target);if(Number.isFinite(value.zoom))camera.zoom=value.zoom;camera.updateProjectionMatrix();controls.update();requestRender();},
    get renderer(){return renderer;},get scene(){return scene;},get camera(){return camera;},
    destroy(){if(destroyed)return;destroyed=true;observer.disconnect();controls.dispose();if(queuedFrame)cancelAnimationFrame(queuedFrame);for(const obj of new Set(disposables))obj.dispose?.();renderer.dispose();renderer.forceContextLoss();wrapper.remove();mounted.delete(container);},
    get selected(){return selected?.userData.item||null;}
  };
  mounted.set(container,api);resize();resetView();return api;
}
function renderResult(container,result,options={}){
  const bins=result?.bins||[];const binIndex=Math.max(0,Math.min(bins.length-1,Number(options.binIndex)||0));const bin=bins[binIndex];
  if(!bin)throw new Error('此结果还没有可视化的容器。');
  return mount(container,{...options,mode:'result',binIndex,stock:bin,items:bin.items||[],units:result.units||options.units||'原始单位'});
}
window.Cutting3DViewer={mount,renderResult,version:THREE.REVISION};
window.dispatchEvent(new CustomEvent('cutting-3d-ready'));
export {mount,renderResult};
