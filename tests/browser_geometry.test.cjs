'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const G=require('../static/vendor/cutting-geometry.js');
const copy=x=>structuredClone(x);
const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const piece=(id,polygon,angle=0)=>({id,polygon,angle,mirror:false});
const valid=(p,r)=>{const v=G.validate(p,r);assert.equal(v.pass,true,JSON.stringify(v));return v;};
const invalid=(p,r,text)=>{const v=G.validate(p,r);assert.equal(v.pass,false,JSON.stringify(v));if(text)assert.match(v.errors.join(' '),text);return v;};
function concave() {
  const l=[[0,0],[4,0],[4,1],[1,1],[1,4],[0,4]],square=rect(0,0,1,1);
  return [{kind:'irregular',stock:{width:10,height:10,copies:1},items:[{id:'L',polygon:l},{id:'S',polygon:square}],settings:{engine:'irregular',objective:'bins',rotation:'source'}},
    {bins:[{width:10,height:10,items:[piece('L',copy(l)),piece('S',rect(2,2,1,1))]}]}];
}
function box() {
  return [{kind:'box',stock:{width:10,height:10,depth:10,copies:1,maximum_weight:10},items:[{id:'B',width:2,height:3,depth:4,weight:5,quantity:2}],settings:{engine:'box',objective:'bins'}},
    {bins:[{width:10,height:10,depth:10,items:[{id:'B',x:0,y:0,z:0,width:2,height:3,depth:4,rotation:'XYZ'},{id:'B',x:2,y:0,z:0,width:2,height:3,depth:4,rotation:'XYZ'}]}]}];
}
function kerf(k=1) {
  const p={kind:'onedimensional',stock:{width:10,height:1,copies:1},items:[{id:'R',length:4,quantity:2}],settings:{engine:'onedimensional-kerf',objective:'bins',kerf:k}};
  const items=[piece('R',rect(0,0,4,1)),piece('R',rect(4+k,0,4,1))];
  const cuts=items.map((item,index)=>{const end=(index?4+k:0)+4;return {item_index:index,item_id:'R',model:'per-piece-tail-kerf',start:end,end:end+k,width:k,x1:end+k/2,x2:end+k/2,y1:0,y2:1,stage:1};});
  return [p,{bins:[{width:10,height:1,items,cuts}]}];
}
function tree() {
  return [{kind:'rectangle',stock:{width:10,height:10,copies:1},items:[{id:'A',width:4,height:10}],settings:{engine:'guillotine',objective:'bins',kerf:1}},
    {bins:[{width:10,height:10,items:[piece('A',rect(0,0,4,10))]}],cut_tree:[
      {NODE_ID:0,PLATE_ID:0,PARENT:null,CUT:0,TYPE:-2,X:0,Y:0,WIDTH:10,HEIGHT:10,COPIES:1},
      {NODE_ID:1,PLATE_ID:0,PARENT:0,CUT:1,TYPE:0,X:0,Y:0,WIDTH:4,HEIGHT:10,COPIES:1},
      {NODE_ID:2,PLATE_ID:0,PARENT:0,CUT:1,TYPE:-1,X:5,Y:0,WIDTH:5,HEIGHT:10,COPIES:1}]}];
}

test('UMD browser export works offline in an isolated VM',()=>{
  const ctx=vm.createContext({});
  for(const file of ['robust-predicates-3.0.2/orient2d.js','polygon-clipping-0.15.7/polygon-clipping.umd.js','cutting-geometry.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/vendor',file),'utf8'),ctx,{filename:file});
  assert.equal(typeof ctx.CuttingGeometry.normalize,'function');
  const [p,r]=concave();assert.equal(ctx.CuttingGeometry.validate(p,r).pass,true);
});
test('triangle fallback independently preserves shape, concavity, overlap and rotation checks when primary clip fails',()=>{
  const ctx=vm.createContext({polygonClipping:{xor(){throw Error('forced clipping failure');},intersection(){throw Error('forced clipping failure');}}});
  for(const file of ['robust-predicates-3.0.2/orient2d.js','cutting-geometry.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/vendor',file),'utf8'),ctx,{filename:file});
  const [p,r]=concave();assert.equal(ctx.CuttingGeometry.validate(p,r).pass,true);
  const overlap=copy(r);overlap.bins[0].items[1].polygon=rect(.5,2,1,1);assert.match(ctx.CuttingGeometry.validate(p,overlap).errors.join(' '),/重叠/);
  const fake=copy(r);fake.bins[0].items[0].polygon=[[4,0],[0,0],[0,1],[3,1],[3,4],[4,4]];assert.match(ctx.CuttingGeometry.validate(p,fake).errors.join(' '),/原始轮廓/);
  p.items.pop();r.bins[0].items.pop();p.settings.rotation='continuous';const a=.58;
  r.bins[0].items[0].angle=a*180/Math.PI;r.bins[0].items[0].polygon=p.items[0].polygon.map(([x,y])=>[x*Math.cos(a)-y*Math.sin(a)+3,x*Math.sin(a)+y*Math.cos(a)+1]);
  const v=ctx.CuttingGeometry.validate(p,r);assert.equal(v.pass,true,JSON.stringify(v));
});
test('concave polygons can have overlapping bounding boxes without overlap; true clearance is 1',()=>{
  const [p,r]=concave();p.settings.spacing=.75;assert.equal(valid(p,r).minimum_item_clearance,1);
});
test('same bounding box and same area cannot substitute a mirrored source shape',()=>{
  const [p,r]=concave();r.bins[0].items[0].polygon=[[4,0],[0,0],[0,1],[3,1],[3,4],[4,4]];invalid(p,r,/形状与原始轮廓不符/);
});
test('actual polygon intersection is rejected',()=>{
  const [p,r]=concave();r.bins[0].items[1].polygon=rect(.5,2,1,1);invalid(p,r,/重叠/);
});
test('segment distance enforces spacing despite disjoint polygons',()=>{
  const [p,r]=concave();p.settings.spacing=1.01;invalid(p,r,/间距不足/);
});
test('boundary touch is valid at zero spacing; edge margin is enforced',()=>{
  const [p,r]=concave();r.bins[0].items[1].polygon=rect(1,2,1,1);assert.equal(valid(p,r).minimum_item_clearance,0);
  p.settings.edge=.1;invalid(p,r,/边距不足/);
});
test('defects use actual polygon geometry and distance, not bounding box overlap',()=>{
  const [p,r]=concave();p.items.pop();r.bins[0].items.pop();p.defects=[{x:2,y:2,width:1,height:1}];
  assert.equal(valid(p,r).minimum_defect_clearance,1);p.settings.spacing=1.1;invalid(p,r,/缺陷/);
  p.settings.spacing=0;p.defects[0].x=.5;invalid(p,r,/缺陷/);
});
test('rotated and translated source shape is accepted only in allowed orientation',()=>{
  const [p,r]=concave();p.items.pop();r.bins[0].items.pop();p.items[0].allowed_rotations=[90];
  r.bins[0].items[0].angle=90;r.bins[0].items[0].polygon=p.items[0].polygon.map(([x,y])=>[5-y,x+1]);valid(p,r);
  p.items[0].allowed_rotations=[0];invalid(p,r,/方向不符合/);
});
test('continuous irregular rotation keeps exact shape checking',()=>{
  const [p,r]=concave();p.items.pop();r.bins[0].items.pop();p.settings.rotation='continuous';const a=.37;
  r.bins[0].items[0].angle=a*180/Math.PI;r.bins[0].items[0].polygon=p.items[0].polygon.map(([x,y])=>[x*Math.cos(a)-y*Math.sin(a)+3,x*Math.sin(a)+y*Math.cos(a)+1]);valid(p,r);
});
test('self-intersection, nonadjacent touch, repeated edges, NaN and mirrored certificates fail closed',()=>{
  for(const ring of [[[0,0],[3,3],[0,3],[3,0]],[[0,0],[3,0],[3,3],[1,0],[0,3]],[[0,0],[3,0],[2,0],[2,3],[0,3]]]) {const [p]=concave();p.items[0].polygon=ring;assert.throws(()=>G.normalize(p),/自交|自接触|折返/);}
  const [p,r]=concave();r.bins[0].items[0].polygon[1][0]=NaN;invalid(p,r,/有限数字/);
  const [p2,r2]=concave();r2.bins[0].items[0].mirror=true;invalid(p2,r2,/方向/);
});
test('normalization never mutates input and rejects unsupported constraints and null numeric data',()=>{
  const [p]=concave(),saved=copy(p);G.normalize(p);assert.deepEqual(p,saved);
  for(const mutate of [x=>x.mirror=true,x=>x.items[0].holes=[[[0,0],[1,0],[0,1]]],x=>x.stock.polygon=rect(0,0,5,5),x=>x.items[0].quantity=null,x=>x.items[0].allowed_rotations=null,x=>x.stock.copies=null]) {const x=copy(p);mutate(x);assert.throws(()=>G.normalize(x));}
});
test('rectangle display shape, integer dimensions and engine-kind combinations are checked',()=>{
  const p={kind:'rectangle',stock:{width:10,height:10},items:[{width:2,height:3}],settings:{engine:'rectangle'}};
  G.normalize(p);p.items[0].polygon=rect(1,0,2,3);assert.throws(()=>G.normalize(p),/原始尺寸/);delete p.items[0].polygon;
  p.items[0].width=2.5;assert.throws(()=>G.normalize(p),/整数/);p.kind='irregular';assert.throws(()=>G.normalize(p),/类型/);
});
test('quantity, unknown ids and available stock are independently checked',()=>{
  const [p,r]=concave();r.bins[0].items.push(copy(r.bins[0].items[1]));invalid(p,r,/数量超过/);
  const [p2,r2]=concave();r2.bins[0].items[1].id='unknown';invalid(p2,r2,/未知零件/);
  const [p3,r3]=concave();r3.bins.push({width:10,height:10,items:[]});invalid(p3,r3,/原料超过/);
});
test('partial demand distinguishes geometric feasibility from order completion and knapsack',()=>{
  const [p,r]=concave();r.bins[0].items.pop();const v=invalid(p,r,/全部需求/);assert.equal(v.geometry_pass,true);assert.equal(v.full_demand,false);
  p.settings.objective='knapsack';assert.equal(valid(p,r).full_demand,false);
});
test('3D accepts touching boxes and recomputes total weight',()=>{
  const [p,r]=box();r.bins[0].items.forEach(i=>i.weight=0);assert.deepEqual(valid(p,r).bin_weights_checked,[10]);
  p.stock.maximum_weight=9;invalid(p,r,/总重量/);
});
test('3D checks all six dimension permutations',()=>{
  const dims={X:2,Y:3,Z:4};
  for(const rotation of ['XYZ','XZY','YXZ','YZX','ZXY','ZYX']) {const [p,r]=box();p.items[0].quantity=1;r.bins[0].items.splice(1);Object.assign(r.bins[0].items[0],{rotation,width:dims[rotation[0]],height:dims[rotation[1]],depth:dims[rotation[2]]});valid(p,r);}
});
test('3D rejects wrong dimensions, positive-volume overlap, unsupported rotation, bounds and excess quantity',()=>{
  for(const [mutate,pattern] of [[r=>r.bins[0].items[0].width=1,/原尺寸/],[r=>r.bins[0].items[1].x=1,/正体积/],[r=>r.bins[0].items[0].rotation='BAD',/朝向/],[r=>r.bins[0].items[0].z=9,/边界/],[r=>r.bins[0].items.push(copy(r.bins[0].items[0])),/数量超过/]]) {const [p,r]=box();mutate(r);invalid(p,r,pattern);}
});
test('3D weight alias and original per-item orientation restrictions are preserved',()=>{
  const [p]=box();p.stock.weight_capacity=p.stock.maximum_weight;delete p.stock.maximum_weight;
  assert.equal(G.normalize(p).stock.maximum_weight,10);p.stock.maximum_weight=11;assert.throws(()=>G.normalize(p),/不一致/);
  delete p.stock.maximum_weight;p.items[0].allowed_rotations=['YZX'];p.settings.rotation='none';assert.throws(()=>G.normalize(p),/没有交集/);
});
test('3D requires positive weights under capacity and explicitly rejects unsafe aggregate volume',()=>{
  const [p]=box();delete p.items[0].weight;assert.throws(()=>G.normalize(p),/范围/);
  const [q]=box();Object.assign(q.stock,{width:1000000,height:1000000,depth:1000000});assert.throws(()=>G.normalize(q),/JavaScript 安全整数/);
});
test('1D tail kerf and zero-width terminal cut validate',()=>{for(const k of [0,1]) {const [p,r]=kerf(k);assert.equal(valid(p,r).kerf_validation.kerf_loss_length,2*k);}});
test('1D missing last cut, changed cut widths, tail overflow and kerf-only overlap are rejected',()=>{
  const [p,r]=kerf();r.bins[0].cuts.pop();invalid(p,r,/尾部切口|切口位置/);
  const [p2,r2]=kerf();r2.bins[0].cuts[1].width=0;invalid(p2,r2,/切口位置/);
  const [p3,r3]=kerf();r3.bins[0].items[1].polygon=rect(6,0,4,1);invalid(p3,r3,/尾部锯缝超出/);
  const [p4,r4]=kerf();r4.bins[0].items[1].polygon=rect(4,0,4,1);invalid(p4,r4,/锯缝区间发生重叠/);
});
test('raw 1D route refuses nonzero kerf and fractional coordinates cannot bypass cut model',()=>{
  const [p]=kerf();p.settings.engine='onedimensional';assert.throws(()=>G.normalize(p),/不支持刀缝/);
  const [q,r]=kerf();r.bins[0].items[0].polygon=rect(.25,0,4,1);invalid(q,r,/整数坐标/);
});
test('guillotine independently validates actual raw tree and leaf/result correspondence',()=>{
  const [p,r]=tree();assert.equal(valid(p,r).cut_tree_validation.pass,true);
  r.cut_tree_validation={pass:true,errors:[]};delete r.cut_tree;invalid(p,r,/缺少原始 cut_tree/);
});
test('guillotine rejects nonspanning cuts, insufficient kerf, cycles and unrepresented leaves',()=>{
  for(const [mutate,pattern] of [[r=>r.cut_tree[2].HEIGHT=9,/贯穿/],[r=>{r.cut_tree[2].X=4;r.cut_tree[2].WIDTH=6;},/刀缝不足/],[r=>r.cut_tree[1].PARENT=1,/存在环|深度/],[r=>r.cut_tree[1].TYPE=-1,/缺少对应/]]) {const [p,r]=tree();mutate(r);invalid(p,r,pattern);}
});
test('malformed certificate never returns pass',()=>{
  const [p]=concave();for(const r of [null,{}, {bins:null},{bins:[null]},{bins:[{items:null}]}])invalid(p,r);
});

// Recheck saved original results without running or changing an optimizer.
const root=path.resolve(__dirname,'..');
for(const dir of ['qa_1d/runs','qa_progress/probe','engine_box_smoke_output','../cutting_lab/engine_preset_output']) {
  const absolute=path.join(root,dir);if(!fs.existsSync(absolute))continue;
  const walk=folder=>{
    const problem=path.join(folder,'problem_normalized.json'),result=path.join(folder,'result.json');
    if(fs.existsSync(problem)&&fs.existsSync(result))test('saved original certificate: '+path.relative(root,folder),()=>{
      const p=JSON.parse(fs.readFileSync(problem,'utf8').replace(/^\uFEFF/,'')),r=JSON.parse(fs.readFileSync(result,'utf8').replace(/^\uFEFF/,''));
      if(p.settings.engine==='guillotine'&&!r.cut_tree) {
        const csv=fs.readFileSync(path.join(folder,'solver_solution.csv'),'utf8').trim().split(/\r?\n/),header=csv.shift().split(',');
        r.cut_tree=csv.map(line=>Object.fromEntries(line.split(',').map((v,i)=>[header[i],v===''?null:Number(v)])));
      }
      const v=G.validate(p,r);assert.equal(v.geometry_pass,r.validation.geometry_pass,JSON.stringify(v));assert.equal(v.full_demand,r.validation.full_demand,JSON.stringify(v));assert.equal(v.pass,r.validation.pass,JSON.stringify(v));
    });
    else for(const entry of fs.readdirSync(folder,{withFileTypes:true}))if(entry.isDirectory())walk(path.join(folder,entry.name));
  };walk(absolute);
}
const browserFixtures=path.join(root,'test-artifacts/browser');
if(fs.existsSync(browserFixtures))for(const file of fs.readdirSync(browserFixtures).filter(f=>f.endsWith('.json'))) {
  const fixture=JSON.parse(fs.readFileSync(path.join(browserFixtures,file),'utf8').replace(/^\uFEFF/,''));
  if(!fixture.problem||!fixture.result)continue;
  test('real browser WASM certificate: '+file,()=>{
    const v=G.validate(fixture.problem,fixture.result);assert.equal(v.pass,true,JSON.stringify(v));assert.equal(v.geometry_pass,true);
    if(fixture.problem.settings.objective!=='knapsack')assert.equal(v.full_demand,true);
  });
}
