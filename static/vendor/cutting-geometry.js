/* Independent input/certificate checks. Load polygon-clipping and robust-predicates first.
 * Numerical geometry is not a manufacturing tolerance or an optimality proof. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(
    require('./polygon-clipping-0.15.7/polygon-clipping.umd.js'),
    require('./robust-predicates-3.0.2/orient2d.js'));
  else root.CuttingGeometry = factory(root.polygonClipping, root.predicates);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (clip, predicates) {
  'use strict';
  const AXES = ['XYZ','XZY','YXZ','YZX','ZXY','ZYX'];
  const KERF = ['onedimensional-kerf','ffd-1d','bfd-1d'];
  const MODEL = 'per-piece-tail-kerf';
  const MODEL_NOTE = '保守逐件锯缝模型：每件成品尾部都预留一刀，末件也计锯缝；不含端头修边、夹持余量、斜切与余料库存。';
  const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
  const get = (o,k,fallback) => own(o,k) ? o[k] : fallback;
  const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const truthy = v => Array.isArray(v) ? v.length > 0 : obj(v) ? Object.keys(v).length > 0 : Boolean(v);
  const has = (o, keys) => keys.some(k => truthy(o[k]));
  const clone = v => Array.isArray(v) ? v.map(clone) : obj(v) ? Object.fromEntries(Object.entries(v).map(([k,x]) => [k,clone(x)])) : v;
  const fail = message => { throw new Error(message); };
  const defaults = (target, values) => { for (const [k,v] of Object.entries(values)) if (!own(target,k)) target[k]=clone(v); return target; };
  function number(v,label,{low=0,high=1e8,positive=false,integer=false}={}) {
    if (!finite(v)) fail(label+'必须是有限数字。');
    if (v<low || v>high || (positive && v<=0)) fail(label+'超出允许范围。');
    if (integer && !Number.isSafeInteger(v)) fail(label+'必须是 JavaScript 安全范围内的整数；请统一单位。');
    return v;
  }
  function angles(v,label) {
    if (!Array.isArray(v) || v.length<1 || v.length>72) fail(label+'需包含 1 至 72 个角度。');
    return [...new Set(v.map(x=>Math.round(((number(x,label,{low:-3600,high:3600})%360+360)%360)*1e10)/1e10))].sort((a,b)=>a-b);
  }
  const equalPoint = (a,b) => a[0]===b[0] && a[1]===b[1];
  function orient(a,b,c) {
    if (!predicates || typeof predicates.orient2d !== 'function') fail('独立几何内核 robust-predicates 未加载。');
    return predicates.orient2d(a[0],a[1],b[0],b[1],c[0],c[1]);
  }
  function onSegment(p,a,b) { return orient(a,b,p)===0 && p[0]>=Math.min(a[0],b[0]) && p[0]<=Math.max(a[0],b[0]) && p[1]>=Math.min(a[1],b[1]) && p[1]<=Math.max(a[1],b[1]); }
  function intersects(a,b,c,d) {
    const x=orient(a,b,c),y=orient(a,b,d),z=orient(c,d,a),w=orient(c,d,b);
    return (x===0&&onSegment(c,a,b)) || (y===0&&onSegment(d,a,b)) || (z===0&&onSegment(a,c,d)) || (w===0&&onSegment(b,c,d)) || ((x<0)!==(y<0) && (z<0)!==(w<0) && x!==0&&y!==0&&z!==0&&w!==0);
  }
  function signedArea(ring) {
    if (ring.length<3) return 0;
    const [x,y]=ring[0]; let area=0, correction=0;
    for(let i=1;i<ring.length-1;i++) { const term=(ring[i][0]-x)*(ring[i+1][1]-y)-(ring[i][1]-y)*(ring[i+1][0]-x); const next=term-correction, sum=area+next; correction=(sum-area)-next; area=sum; }
    return area/2;
  }
  function polygon(points,label='多边形',input=true) {
    if (!Array.isArray(points) || points.length<3 || points.length>(input?201:1001)) fail(label+'需提供合法的单一外轮廓顶点。');
    const ring=points.map(pt=>{
      if(!Array.isArray(pt)||pt.length!==2) fail(label+'顶点必须是 [x,y]。');
      return pt.map(v=>number(v,label,{low:input?-1e7:-1e9,high:input?1e7:1e9}));
    });
    if(equalPoint(ring[0],ring[ring.length-1])) ring.pop();
    if(ring.length<3 || ring.length>(input?200:1000)) fail(label+'顶点数量不合法。');
    for(let i=0;i<ring.length;i++) {
      const a=ring[i],b=ring[(i+1)%ring.length],c=ring[(i+2)%ring.length];
      if(equalPoint(a,b)) fail(label+'存在重复顶点或零长度边。');
      if(orient(a,b,c)===0 && (b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1])<0) fail(label+'存在折返或重复边。');
      for(let j=i+2;j<ring.length;j++) {
        if(i===0 && j===ring.length-1) continue;
        if(intersects(a,b,ring[j],ring[(j+1)%ring.length])) fail(label+'存在自交或自接触。');
      }
    }
    const area=signedArea(ring);
    if(!finite(area)||Math.abs(area)<=(input?1e-10:0)) fail(label+'存在零面积。');
    if(area<0) ring.reverse();
    return ring;
  }
  const rect = (x,y,w,h) => [[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
  function multiArea(multi) { return multi.reduce((total,poly)=>total+poly.reduce((area,ring,i)=>area+(i===0?1:-1)*Math.abs(signedArea(ring)),0),0); }
  // A second geometric construction handles polygon-clipping's known failure
  // mode on almost coincident edges. It never rounds coordinates or uses AABBs
  // as a substitute for intersection: simple rings are partitioned into ears,
  // and every triangle pair is clipped against three exact-sign half planes.
  // Summed intersection areas are valid because triangle interiors are disjoint.
  function triangulate(ring) {
    const remaining=ring.slice(),triangles=[];
    if(signedArea(remaining)<0) remaining.reverse();
    let changed=true;
    while(changed && remaining.length>3) {
      changed=false;
      for(let i=0;i<remaining.length;i++) {
        const a=remaining[(i+remaining.length-1)%remaining.length],b=remaining[i],c=remaining[(i+1)%remaining.length];
        if(onSegment(b,a,c)) { remaining.splice(i,1); changed=true; break; }
      }
    }
    while(remaining.length>3) {
      let found=false;
      for(let i=0;i<remaining.length;i++) {
        const before=(i+remaining.length-1)%remaining.length,after=(i+1)%remaining.length;
        const a=remaining[before],b=remaining[i],c=remaining[after];
        if(orient(a,b,c)>=0) continue;
        if(remaining.some((p,n)=>n!==before&&n!==i&&n!==after&&orient(a,b,p)<=0&&orient(b,c,p)<=0&&orient(c,a,p)<=0)) continue;
        triangles.push([a,b,c]); remaining.splice(i,1); found=true; break;
      }
      if(!found) fail('备用几何内核无法构建无重叠三角剖分。');
    }
    if(remaining.length===3) triangles.push(remaining);
    const area=Math.abs(signedArea(ring)),parts=triangles.reduce((sum,t)=>sum+Math.abs(signedArea(t)),0);
    if(Math.abs(parts-area)>Math.max(1e-10,area*1e-12)) fail('备用三角剖分面积校验失败。');
    return triangles;
  }
  function triangleIntersection(a,b) {
    // Recenter both triangles to limit cancellation without quantizing them.
    const origin=a[0],local=t=>t.map(p=>[p[0]-origin[0],p[1]-origin[1]]);
    let out=local(a); const clipTriangle=local(b);
    for(let i=0;i<3&&out.length;i++) {
      const u=clipTriangle[i],v=clipTriangle[(i+1)%3],input=out;out=[];
      let last=input[input.length-1],lastSide=orient(u,v,last);
      for(const current of input) {
        const side=orient(u,v,current),inside=side<=0,previousInside=lastSide<=0;
        if(inside!==previousInside) {
          const t=Math.max(0,Math.min(1,lastSide/(lastSide-side)));
          out.push([last[0]+t*(current[0]-last[0]),last[1]+t*(current[1]-last[1])]);
        }
        if(inside) out.push(current);
        last=current;lastSide=side;
      }
    }
    return Math.abs(signedArea(out));
  }
  function fallbackIntersection(a,b) {
    const at=triangulate(a),bt=triangulate(b);let total=0,correction=0;
    for(const ta of at) for(const tb of bt) {
      if(boundsGap(bounds(ta),bounds(tb))>0) continue;
      const term=triangleIntersection(ta,tb)-correction,sum=total+term;correction=(sum-total)-term;total=sum;
    }
    if(!finite(total)||total<0) fail('备用几何内核产生无效面积。');
    return total;
  }
  function operationArea(op,a,b) {
    if(!clip || typeof clip[op]!=='function') fail('独立多边形内核 polygon-clipping 未加载。');
    try { return multiArea(clip[op]([a],[b])); }
    catch(error) {
      if(op!=='intersection'&&op!=='xor') throw error;
      const intersection=fallbackIntersection(a,b);
      return op==='intersection'?intersection:Math.max(0,Math.abs(signedArea(a))+Math.abs(signedArea(b))-2*intersection);
    }
  }
  const bounds = ring => ring.reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity]);
  const boundsGap = (a,b) => Math.hypot(Math.max(0,a[0]-b[2],b[0]-a[2]),Math.max(0,a[1]-b[3],b[1]-a[3]));
  function pointInside(p,ring) {
    let inside=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
      const a=ring[j],b=ring[i]; if(onSegment(p,a,b)) return true;
      if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
    }
    return inside;
  }
  function pointSegment(p,a,b) {
    const dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy;
    const t=d===0?0:Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d));
    return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
  }
  function distance(a,b) {
    if(pointInside(a[0],b)||pointInside(b[0],a)) return 0;
    let result=Infinity;
    for(let i=0;i<a.length;i++) for(let j=0;j<b.length;j++) {
      const p=a[i],q=a[(i+1)%a.length],r=b[j],s=b[(j+1)%b.length];
      if(intersects(p,q,r,s)) return 0;
      result=Math.min(result,pointSegment(p,r,s),pointSegment(q,r,s),pointSegment(r,p,q),pointSegment(s,p,q));
    }
    return result;
  }
  function setup(problem,boxMode) {
    if(!obj(problem)) fail('问题必须是 JSON 对象。');
    const p=clone(problem); if(!own(p,'settings')) p.settings={};
    if(!obj(p.settings)) fail('settings 必须是对象。');
    if(has(p,['mirror','allow_mirror','mirroring'])||has(p.settings,['mirror','allow_mirror','mirroring'])) fail('当前版本不支持镜像，不能静默忽略。');
    if(!obj(p.stock)) fail('需要 stock 原料尺寸。');
    if(!Array.isArray(p.items)||p.items.length<1||p.items.length>60) fail('需提供 1 至 60 种零件。');
    if(!own(p,'defects')) p.defects=[];
    if(!Array.isArray(p.defects)||p.defects.length>20) fail('缺陷区域最多20个。');
    p.name=String(p.name??(boxMode?'三维装箱问题':'自定义裁切问题')).slice(0,180);
    p.unit=String(p.unit??'未指定单位').slice(0,60);
    return p;
  }
  function baseItem(item,n,ids) {
    if(!obj(item)) fail('每种零件必须是对象。');
    const id=own(item,'id')?item.id:n;
    if(!(typeof id==='string'||Number.isSafeInteger(id))||ids.has(String(id))) fail('零件 id 必须唯一，且为字符串或安全整数。');
    ids.add(String(id)); item.id=id; item.name=String(item.name??`零件 ${n+1}`).slice(0,120);
    if(has(item,['mirror','allow_mirror','mirroring'])) fail('当前版本不支持零件镜像。');
    item.quantity=number(get(item,'quantity',1),'零件数量',{low:1,high:500,integer:true});
    item.profit=number(get(item,'profit',1),'零件价值',{high:1e12,positive:true});
  }
  function normalizeBox(problem) {
    const p=setup(problem,true),s=p.settings,stock=p.stock;
    if(p.kind!=='box') fail('三维装箱必须使用 kind=box。');
    defaults(s,{engine:'box',objective:'bins',rotation:'orthogonal',spacing:0,edge:0,kerf:0,time_limit:10});
    if(s.engine!=='box') fail('box 箱体只支持 PackingSolver box 引擎。');
    if(!['bins','knapsack'].includes(s.objective)) fail('三维装箱仅支持 bins 和 knapsack。');
    if(!['none','orthogonal'].includes(s.rotation)) fail('三维仅支持保持 XYZ 或六种轴对齐朝向。');
    for(const k of ['spacing','edge','kerf']) { s[k]=number(s[k],k,{high:1e6,integer:true}); if(s[k]) fail('三维路线不支持间距、边距或刀缝。'); }
    s.time_limit=number(s.time_limit,'求解时限',{low:1,high:60});
    if(p.defects.length) fail('三维路线不支持容器缺陷区域。');
    if(has(stock,['polygon','shape','holes','mesh','vertices']) || (stock.kind!=null && stock.kind!=='box')) fail('三维仅支持实体长方体容器。');
    if(own(stock,'weight_capacity')) { if(own(stock,'maximum_weight')&&stock.maximum_weight!==stock.weight_capacity) fail('maximum_weight 与 weight_capacity 不一致。'); stock.maximum_weight=stock.weight_capacity; delete stock.weight_capacity; }
    if(stock.maximum_weight!=null) stock.maximum_weight=number(stock.maximum_weight,'容器总重量上限',{high:1e12,positive:true});
    for(const k of ['width','height','depth']) stock[k]=number(stock[k],'容器'+k,{high:1e6,positive:true,integer:true});
    stock.copies=number(get(stock,'copies',20),'容器数量',{low:1,high:100,integer:true});
    p.effective_stock_copies=s.objective==='bins'?stock.copies:1;
    const ids=new Set();
    p.items.forEach((item,n)=>{
      baseItem(item,n,ids);
      if(has(item,['polygon','shape','holes','mesh','vertices'])) fail('三维零件必须为实体长方体。');
      if(has(item,['maximum_weight_after','maximum_stackability'])) fail('尚未接入单件堆叠承重与层数约束。');
      item.weight=number(get(item,'weight',0),'单件重量',{high:1e12,positive:stock.maximum_weight!=null});
      for(const k of ['width','height','depth']) item[k]=number(item[k],'箱体'+k,{high:1e6,positive:true,integer:true});
      const allowed=get(item,'allowed_rotations',AXES);
      if(!Array.isArray(allowed)||allowed.length<1||allowed.length>6||allowed.some(a=>!AXES.includes(a))) fail('三维 allowed_rotations 必须为轴置换字符串列表。');
      item.allowed_rotations=[...new Set(allowed)]; item.effective_rotations=(s.rotation==='none'?['XYZ']:AXES).filter(a=>allowed.includes(a));
      if(!item.effective_rotations.length) fail('全局旋转模式与箱体允许朝向没有交集。');
    });
    if(p.items.reduce((n,i)=>n+i.quantity,0)>500) fail('单次任务最多500件箱体。');
    const volume=x=>BigInt(x.width)*BigInt(x.height)*BigInt(x.depth),max=BigInt(Number.MAX_SAFE_INTEGER);
    if(volume(stock)*BigInt(p.effective_stock_copies)>max || p.items.reduce((n,i)=>n+volume(i)*BigInt(i.quantity),0n)>max) fail('体积总量超出 JavaScript 安全整数范围，请统一缩小坐标单位。');
    return p;
  }
  function normalize(problem) {
    if(obj(problem)&&(problem.kind==='box'||(obj(problem.settings)&&problem.settings.engine==='box'))) return normalizeBox(problem);
    const p=setup(problem,false),s=p.settings,stock=p.stock,kind=get(p,'kind','irregular');
    if(!['irregular','rectangle','onedimensional'].includes(kind)) fail('未知零件类型。');
    defaults(s,{engine:kind,objective:kind==='onedimensional'?'bins':'strip',rotation:'source',custom_angles:[0,180],spacing:0,edge:0,kerf:0,time_limit:10,stages:3,first_cut:'vertical'});
    const eng=s.engine,rot=s.rotation;
    const kinds={irregular:['irregular','rectangle'],rectangle:['rectangle'],guillotine:['rectangle'],shelf:['irregular','rectangle'],onedimensional:['onedimensional'],'onedimensional-kerf':['onedimensional'],'ffd-1d':['onedimensional'],'bfd-1d':['onedimensional'],'rectpack-maxrects':['rectangle'],'rectpack-skyline':['rectangle']};
    const objectives={irregular:['strip','bins','knapsack'],rectangle:['strip','bins','knapsack'],guillotine:['bins','knapsack'],shelf:['strip','bins'],onedimensional:['bins','knapsack'],'onedimensional-kerf':['bins'],'ffd-1d':['bins'],'bfd-1d':['bins'],'rectpack-maxrects':['bins'],'rectpack-skyline':['bins']};
    if(!own(kinds,eng)||!kinds[eng].includes(kind)) fail('该工具路线不支持当前零件类型。');
    if(!objectives[eng].includes(s.objective)) fail(eng+' 路线不支持该目标。');
    if(!['source','none','half','quarter','custom','continuous'].includes(rot)) fail('未知旋转模式。');
    if(rot==='continuous'&&eng!=='irregular') fail('连续自由旋转仅支持不规则 PackingSolver 路线。');
    if(rot==='custom'&&['rectangle','guillotine','onedimensional','rectpack-maxrects','rectpack-skyline'].includes(eng)) fail('当前路线不支持自定义角度。');
    if(kind==='onedimensional'&&!['source','none'].includes(rot)) fail('一维下料不提供旋转设置。');
    s.custom_angles=angles(s.custom_angles,'自定义角度');
    const integer=['rectangle','guillotine','onedimensional','rectpack-maxrects','rectpack-skyline',...KERF].includes(eng);
    for(const k of ['spacing','edge','kerf']) s[k]=number(s[k],k,{high:1e6,integer});
    s.time_limit=number(s.time_limit,'求解时限',{low:1,high:60});
    if(!['irregular','shelf'].includes(eng)&&(s.spacing||s.edge)) fail('当前路线不支持额外间距/边距。');
    if(!['guillotine',...KERF].includes(eng)&&s.kerf) fail('该路线不支持刀缝；一维锯缝请显式选择相应路线。');
    if(eng==='guillotine'&&(s.stages!==3||!['vertical','horizontal'].includes(s.first_cut))) fail('贯通路线需 stages=3，并指定 vertical/horizontal 首刀。');
    if(has(stock,['polygon','holes','shape'])||['irregular','irregular-bin'].includes(stock.kind)) fail('当前仅支持矩形原料。');
    stock.width=number(stock.width,'原料长度',{positive:true,integer});
    stock.height=number(own(stock,'height')?stock.height:(kind==='onedimensional'?1:undefined),'原料宽度',{positive:true,integer});
    if(kind==='onedimensional'&&stock.height!==1) fail('一维原料 height 必须为1。');
    stock.copies=number(get(stock,'copies',20),'原料数量',{low:1,high:100,integer:true});
    p.effective_stock_copies=s.objective==='bins'?stock.copies:1;
    if(2*s.edge>=Math.min(stock.width,stock.height)) fail('边距占满了原料。');
    const ids=new Set();
    p.items.forEach((item,n)=>{
      baseItem(item,n,ids); item.allowed_rotations=angles(get(item,'allowed_rotations',[0]),'原始允许角度');
      item.effective_rotations=clone({none:[0],half:[0,180],quarter:[0,90,180,270],custom:s.custom_angles,source:item.allowed_rotations,continuous:null}[rot]);
      if(['rectangle','guillotine','rectpack-maxrects','rectpack-skyline'].includes(eng)&&item.effective_rotations.some(a=>a%90!==0)) fail('矩形路线只能使用90°整数倍方向。');
      if(kind==='onedimensional'&&(item.effective_rotations.length!==1||item.effective_rotations[0]!==0)) fail('一维原始方向需为 [0]。');
      if(truthy(item.holes)) fail('尚未接入带孔零件。');
      if(kind==='irregular') item.polygon=polygon(item.polygon,item.name);
      else {
        let expected;
        if(kind==='rectangle') { item.width=number(item.width,'零件宽',{positive:true,integer}); item.height=number(item.height,'零件高',{positive:true,integer}); expected=rect(0,0,item.width,item.height); }
        else { item.length=number(item.length,'零件长度',{positive:true,integer:true}); expected=rect(0,0,item.length,1); }
        if(truthy(item.polygon)&&operationArea('xor',polygon(item.polygon,item.name),expected)>Math.max(1e-9,Math.abs(signedArea(expected))*1e-10)) fail('显示 polygon 必须与从原点开始的原始尺寸一致。');
        item.polygon=expected;
      }
    });
    if(p.items.reduce((n,i)=>n+i.quantity,0)>500) fail('单次任务最多500件零件。');
    if(eng.startsWith('rectpack-')&&new Set(p.items.map(i=>[...new Set(i.effective_rotations.map(a=>a%180))].sort().join(','))).size!==1) fail('Rectpack 所有零件必须允许相同方向组合。');
    if(p.defects.length&&['shelf','onedimensional','rectpack-maxrects','rectpack-skyline',...KERF].includes(eng)) fail('当前路线不支持缺陷区域。');
    for(const d of p.defects) {
      if(!obj(d)||has(d,['polygon','shape','holes'])) fail('缺陷必须为 x/y/width/height 矩形。');
      for(const k of ['x','y','width','height']) d[k]=number(d[k],'缺陷'+k,{positive:['width','height'].includes(k),integer});
      if(d.x+d.width>stock.width||d.y+d.height>stock.height) fail('缺陷区域必须位于原料内部。');
    }
    p.kind=kind; return p;
  }
  function envelope(p,result) {
    if(!obj(result)||!Array.isArray(result.bins)) fail('结果 bins 必须是数组。');
    const required=new Map(p.items.map(i=>[String(i.id),i.quantity])),source=new Map(p.items.map(i=>[String(i.id),i])),counts=new Map(),errors=[];
    if(result.bins.length>p.effective_stock_copies) errors.push('使用原料超过可用数量。');
    for(const b of result.bins) if(!obj(b)||!Array.isArray(b.items)) fail('结果原料及 items 数组无效。');
    return {required,source,counts,errors};
  }
  function finish(p,state,extra) {
    const {required,counts,errors}=state;
    if([...counts].some(([id,n])=>n>(required.get(id)||0))) errors.push('零件数量超过需求。');
    const geometry_pass=errors.length===0,full_demand=counts.size===required.size&&[...required].every(([id,n])=>counts.get(id)===n);
    if(p.settings.objective!=='knapsack'&&!full_demand) errors.push('尚未放置全部需求零件。');
    return {pass:errors.length===0,geometry_pass,full_demand,errors:[...new Set(errors)],placed_counts:Object.fromEntries(counts),required_counts:Object.fromEntries(required),...extra};
  }
  function validateBox(p,result) {
    const state=envelope(p,result),{source,counts,errors}=state,tol=1e-7; let volume=0;
    const weights=[];
    for(const b of result.bins) {
      for(const k of ['width','height','depth']) if(!finite(b[k])||Math.abs(b[k]-p.stock[k])>tol) errors.push('结果容器尺寸与输入不一致。');
      const placed=[]; let weight=0;
      for(const piece of b.items) {
        if(!obj(piece)) { errors.push('箱体证书必须为对象。'); continue; }
        const id=String(piece.id); counts.set(id,(counts.get(id)||0)+1); const original=source.get(id);
        if(!original) { errors.push('结果包含未知箱体。'); continue; }
        weight+=original.weight;
        if(['x','y','z','width','height','depth'].some(k=>!finite(piece[k]))) { errors.push('箱体位置或尺寸不是有限数字。'); continue; }
        if(['width','height','depth'].some(k=>piece[k]<=0)) { errors.push('箱体尺寸必须为正。'); continue; }
        if(!original.effective_rotations.includes(piece.rotation)||truthy(piece.mirror)) errors.push(`箱体 ${id} 朝向不符合约束。`);
        else { const dims={X:original.width,Y:original.height,Z:original.depth}; if(['width','height','depth'].some((k,n)=>Math.abs(piece[k]-dims[piece.rotation[n]])>tol)) errors.push(`箱体 ${id} 尺寸与原尺寸轴置换不符。`); }
        const axes=[['x','width'],['y','height'],['z','depth']];
        if(axes.some(([a,k])=>piece[a]<-tol||piece[a]+piece[k]>p.stock[k]+tol)) errors.push(`箱体 ${id} 超出容器边界。`);
        if(placed.some(other=>axes.every(([a,k])=>Math.min(piece[a]+piece[k],other[a]+other[k])-Math.max(piece[a],other[a])>tol))) errors.push('箱体存在正体积重叠。');
        placed.push(piece); volume+=piece.width*piece.height*piece.depth;
      }
      weights.push(weight); const max=p.stock.maximum_weight;
      if(max!=null&&weight>max+Math.max(1e-8,max*1e-9)) errors.push('容器总重量超过上限。');
    }
    return finish(p,state,{total_item_volume_checked:volume,bin_weights_checked:weights,coordinate_tolerance:tol,checks:['quantity','container bounds','positive-volume overlap','axis-permutation orientation','original dimensions','container total weight'],scope:'独立三维长方体几何与总重量校验；不包含重力稳定性、局部堆叠承重、装卸顺序或全局最优证明。'});
  }
  function validateKerf(p,result) {
    const source=new Map(p.items.map(i=>[String(i.id),i])),kerf=p.settings.kerf,errors=[]; let total=0;
    for(const b of result.bins) {
      const cuts=Array.isArray(b.cuts)?b.cuts:[];
      if(!Array.isArray(b.cuts)) errors.push('一维锯缝证书缺少 cuts 数组。');
      if(cuts.length!==b.items.length) errors.push('每件成品必须对应一个尾部切口，包括末件与零宽切口。');
      const byIndex=new Map(),occupied=[];
      for(const cut of cuts) {
        if(!obj(cut)||!Number.isInteger(cut.item_index)||cut.item_index<0||cut.item_index>=b.items.length||byIndex.has(cut.item_index)) { errors.push('一维切口索引缺失、重复或越界。'); continue; }
        byIndex.set(cut.item_index,cut);
      }
      b.items.forEach((piece,index)=>{
        const original=obj(piece)&&source.get(String(piece.id)); if(!original) return;
        if(!Array.isArray(piece.polygon)||piece.polygon.length<3||piece.polygon.some(pt=>!Array.isArray(pt)||pt.length!==2||pt.some(v=>!finite(v)))) { errors.push('一维成品证书坐标无效。'); return; }
        const [start,ymin,end,ymax]=bounds(piece.polygon);
        if(piece.polygon.some(pt=>pt.some(v=>!Number.isSafeInteger(v)))) errors.push('一维成品证书必须使用整数坐标。');
        if(end-start!==original.length||ymin!==0||ymax!==1) errors.push('一维成品长度或显示高度与原始输入不一致。');
        const cutStart=start+original.length,cutEnd=cutStart+kerf;
        if(start<0||cutEnd>p.stock.width) errors.push('一维成品及其尾部锯缝超出原料长度。');
        occupied.push([start,cutEnd]); total+=kerf;
        const cut=byIndex.get(index),expected={start:cutStart,end:cutEnd,width:kerf,x1:cutStart+kerf/2,x2:cutStart+kerf/2,y1:0,y2:1,stage:1};
        if(!cut||String(cut.item_id)!==String(original.id)||cut.model!==MODEL||Object.entries(expected).some(([k,v])=>!finite(cut[k])||cut[k]!==v)) errors.push('一维切口位置、宽度或零件与输入锯缝模型不一致。');
      });
      occupied.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
      if(occupied.some((v,i)=>i>0&&occupied[i-1][1]>v[0])) errors.push('一维成品或尾部锯缝区间发生重叠。');
    }
    return {pass:!errors.length,errors:[...new Set(errors)],model:MODEL,kerf_loss_length:total,checks:['original finished length','integer coordinates','tail kerf per piece','last-piece kerf','occupied interval bounds','occupied interval overlap','cut certificate correspondence'],scope:MODEL_NOTE};
  }
  function validateTree(p,result) {
    const errors=[],raw=result.cut_tree;
    if(!Array.isArray(raw)) return {pass:false,errors:['贯通证书缺少原始 cut_tree 数组；不能信任自报校验结果。'],nodes:0};
    const rows=raw.filter(r=>obj(r)&&r.TYPE!==-4),nodes=new Map(),children=new Map(),roots=[];
    if(raw.some(r=>!obj(r))) errors.push('贯通树节点必须为对象。');
    for(const r of rows) {
      if(['NODE_ID','PLATE_ID','CUT','TYPE','X','Y','WIDTH','HEIGHT'].some(k=>!Number.isSafeInteger(r[k]))||!(r.PARENT===null||Number.isSafeInteger(r.PARENT))) { errors.push('贯通树节点字段必须为安全整数。'); continue; }
      if(nodes.has(r.NODE_ID)) errors.push('贯通切割树节点重复。'); nodes.set(r.NODE_ID,r);
      if(r.WIDTH<=0||r.HEIGHT<=0) errors.push('贯通树存在非正尺寸。');
      if(r.PARENT===null) {
        roots.push(r);
        if(r.X!==0||r.Y!==0||r.WIDTH!==p.stock.width||r.HEIGHT!==p.stock.height||r.CUT!==0) errors.push('贯通树根节点与原料不符。');
        if(!Number.isSafeInteger(r.COPIES)||r.COPIES<1||r.COPIES>p.effective_stock_copies) errors.push('贯通树根节点复制数无效。');
      }
    }
    if(new Set(roots.map(r=>r.PLATE_ID)).size!==roots.length) errors.push('同一板号存在多个贯通树根。');
    for(const r of nodes.values()) {
      if(r.PARENT===null) continue;
      const par=nodes.get(r.PARENT);
      if(!par) { errors.push('贯通树父节点缺失。'); continue; }
      if(!children.has(par.NODE_ID)) children.set(par.NODE_ID,[]); children.get(par.NODE_ID).push(r);
      if(r.PLATE_ID!==par.PLATE_ID||r.CUT!==par.CUT+1||r.CUT>3||r.CUT<1) errors.push('贯通树板号或三阶段深度不合法。');
      if(r.X<par.X||r.Y<par.Y||r.X+r.WIDTH>par.X+par.WIDTH||r.Y+r.HEIGHT>par.Y+par.HEIGHT) errors.push('贯通树子区域越过父区域。');
      let cursor=r,visited=new Set();
      while(cursor&&cursor.PARENT!==null&&!visited.has(cursor.NODE_ID)) { visited.add(cursor.NODE_ID); cursor=nodes.get(cursor.PARENT); }
      if(!cursor||cursor.PARENT!==null) errors.push('贯通树存在环或无法到达根节点。');
    }
    for(const [id,cs] of children) {
      const par=nodes.get(id),vertical=(par.CUT%2===0)===(p.settings.first_cut==='vertical');
      const [axis,len,orth,olen]=vertical?['X','WIDTH','Y','HEIGHT']:['Y','HEIGHT','X','WIDTH'];
      cs.sort((a,b)=>a[axis]-b[axis]);
      if(cs.some(r=>r[orth]!==par[orth]||r[olen]!==par[olen])) errors.push('切割没有贯穿所在父区域。');
      if(cs.some((r,i)=>i>0&&r[axis]-cs[i-1][axis]-cs[i-1][len]<p.settings.kerf)) errors.push('贯通切割树刀缝不足。');
      // A root TYPE is the stock type (often 0), not a finished item type.
      if(par.PARENT!==null&&par.TYPE>=0) errors.push('成品节点不能继续分割。');
    }
    let binIndex=0;
    for(const root of roots) {
      const leaves=rows.filter(r=>r.PLATE_ID===root.PLATE_ID&&r.PARENT!==null&&r.TYPE>=0);
      for(const leaf of leaves) if(leaf.TYPE>=p.items.length||!Number.isInteger(leaf.TYPE)) errors.push('贯通树成品类型越界。');
      for(let c=0;c<Math.min(root.COPIES||0,101);c++) {
        const b=result.bins[binIndex++]; if(!b) { errors.push('贯通树与结果原料数量不一致。'); continue; }
        const unmatched=b.items.slice();
        for(const leaf of leaves) {
          const original=p.items[leaf.TYPE]; if(!original) continue;
          const expected=rect(leaf.X,leaf.Y,leaf.WIDTH,leaf.HEIGHT);
          const index=unmatched.findIndex(i=>obj(i)&&String(i.id)===String(original.id)&&Array.isArray(i.polygon)&&operationArea('xor',polygon(i.polygon,'贯通叶节点',false),expected)<=Math.max(1e-8,original.width*original.height*1e-7));
          if(index<0) errors.push('贯通树叶节点与结果成品不一致。'); else unmatched.splice(index,1);
        }
        if(unmatched.length) errors.push('结果成品缺少对应贯通树叶节点。');
      }
    }
    if(binIndex!==result.bins.length) errors.push('贯通树与结果原料数量不一致。');
    return {pass:!errors.length,errors:[...new Set(errors)],nodes:rows.length,checks:['parent containment','acyclic topology','alternating spanning cuts','three-stage depth','sibling kerf','leaf items','leaf-to-result correspondence']};
  }
  function validate2D(p,result) {
    const state=envelope(p,result),{source,counts,errors}=state,s=p.settings,scale=Math.max(p.stock.width,p.stock.height,1),tol=Math.max(1e-7,scale*1e-8);
    let minclear=null,mindefect=null;
    const defects=p.defects.map(d=>({ring:rect(d.x,d.y,d.width,d.height),bounds:[d.x,d.y,d.x+d.width,d.y+d.height]}));
    for(const b of result.bins) {
      if(!finite(b.width)||!finite(b.height)||Math.abs(b.width-p.stock.width)>tol||Math.abs(b.height-p.stock.height)>tol) errors.push('结果原料尺寸与输入不符。');
      const placed=[];
      for(const item of b.items) {
        if(!obj(item)) { errors.push('零件证书必须为对象。'); continue; }
        const id=String(item.id); counts.set(id,(counts.get(id)||0)+1); const original=source.get(id);
        if(!original) { errors.push('证书包含未知零件。'); continue; }
        let ring;
        try { ring=polygon(item.polygon,`零件 ${id} 结果几何`,false); } catch(e) { errors.push(e.message); continue; }
        const areaTol=Math.max(1e-8,Math.abs(signedArea(original.polygon))*1e-7),bb=bounds(ring),angle=item.angle,allowed=original.effective_rotations;
        if(!finite(angle)||(allowed!==null&&!allowed.some(a=>Math.abs(((angle-a+180)%360+360)%360-180)<1e-6))||truthy(item.mirror)) errors.push(`零件 ${id} 方向不符合约束。`);
        if(finite(angle)) {
          // Match Shapely's affine rotation: remove round-off sine/cosine at
          // exact orthogonal directions before testing coincident boundaries.
          const rad=(angle%360)*Math.PI/180;
          const cosine=Math.cos(rad),sine=Math.sin(rad),c=Math.abs(cosine)<2.5e-16?0:cosine,sin=Math.abs(sine)<2.5e-16?0:sine;
          const rotated=original.polygon.map(([x,y])=>[x*c-y*sin,x*sin+y*c]),rb=bounds(rotated);
          const expected=rotated.map(([x,y])=>[x+bb[0]-rb[0],y+bb[1]-rb[1]]);
          if(operationArea('xor',ring,expected)>areaTol) errors.push(`零件 ${id} 形状与原始轮廓不符。`);
        }
        if(bb[0]<s.edge-tol||bb[1]<s.edge-tol||bb[2]>p.stock.width-s.edge+tol||bb[3]>p.stock.height-s.edge+tol) errors.push(`零件 ${id} 越界或边距不足。`);
        for(const other of placed) {
          const gap=boundsGap(bb,other.bounds),area=gap===0?operationArea('intersection',ring,other.ring):0;
          let dist;
          if(area>0) dist=0;
          else if(minclear===null||gap<minclear||gap<s.spacing-tol) dist=distance(ring,other.ring);
          else dist=gap;
          minclear=minclear===null?dist:Math.min(minclear,dist);
          if(area>areaTol||dist<s.spacing-tol) errors.push('零件之间重叠或间距不足。');
        }
        for(const d of defects) {
          const gap=boundsGap(bb,d.bounds),area=gap===0?operationArea('intersection',ring,d.ring):0;
          let dist;
          if(area>0) dist=0;
          else if(mindefect===null||gap<mindefect||gap<s.spacing-tol) dist=distance(ring,d.ring);
          else dist=gap;
          mindefect=mindefect===null?dist:Math.min(mindefect,dist);
          if(area>areaTol||dist<s.spacing-tol) errors.push('零件进入缺陷区域或避让间距不足。');
        }
        placed.push({ring,bounds:bb});
      }
    }
    const extra={minimum_item_clearance:minclear,minimum_defect_clearance:mindefect,coordinate_tolerance:tol,area_tolerance:'max(1e-8, original_piece_area * 1e-7)',checks:['source geometry','quantity','bounds','overlap','allowed angles','spacing','defects'],scope:'独立几何校验；不等同于加工可制造性或全局最优证明。'};
    if(s.engine==='guillotine') { extra.cut_tree_validation=validateTree(p,result); errors.push(...extra.cut_tree_validation.errors); extra.checks.push(...(extra.cut_tree_validation.checks||[])); }
    if(KERF.includes(s.engine)) { extra.kerf_validation=validateKerf(p,result); errors.push(...extra.kerf_validation.errors); extra.checks.push(...extra.kerf_validation.checks); }
    return finish(p,state,extra);
  }
  function validate(problem,result) {
    try { const p=normalize(problem); return p.kind==='box'?validateBox(p,result):validate2D(p,result); }
    catch(e) { return {pass:false,geometry_pass:false,full_demand:false,errors:['独立校验未通过：'+e.message],checks:[],scope:'输入、证书或几何内核异常；未作有效性背书。'}; }
  }
  return Object.freeze({normalize,validate,validateTree,version:'1.0.0',geometry_kernel:'polygon-clipping 0.15.7 + robust-predicates 3.0.2; independent triangle-intersection fallback for coincident boundaries'});
});
