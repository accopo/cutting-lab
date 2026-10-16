"""Local sample catalog: preserved public data plus clearly marked synthetic scenarios."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data'
INDUSTRIES = [
    {'id':'apparel','label':'服装布料','description':'固定幅宽、纸样数量、布纹方向与旋转'},
    {'id':'leather','label':'皮革制品','description':'矩形可用区域内的异形件与疵点避让'},
    {'id':'metal','label':'钣金零件','description':'异形套料、零件间距与受限板材选件'},
    {'id':'wood','label':'木板家具','description':'板材开料、纹理方向、贯通切割与锯缝'},
    {'id':'glass','label':'玻璃裁切','description':'矩形定尺材料与分阶段贯通切割'},
    {'id':'paper','label':'纸张包装','description':'矩形拼版、转向与最少张数'},
    {'id':'bars','label':'型材管棒','description':'一维定长下料、最少根数与选件'},
]
ENGINES = [
    {'id':'irregular','label':'PackingSolver · 异形排料','description':'多边形，离散或连续旋转、间距、边距、矩形疵点。','kinds':['irregular','rectangle'],'objectives':['strip','bins','knapsack']},
    {'id':'rectangle','label':'PackingSolver · 矩形装排','description':'整数尺寸矩形，90°转向、定尺板或条带、疵点。','kinds':['rectangle'],'objectives':['strip','bins','knapsack']},
    {'id':'guillotine','label':'PackingSolver · 贯通切割','description':'整数矩形，三阶段贯通切割、锯缝、定尺板或选件。','kinds':['rectangle'],'objectives':['bins','knapsack']},
    {'id':'shelf','label':'包围盒货架 · 贪心基线','description':'简单可解释基线，按包围盒逐行摆放；支持有限离散旋转。','kinds':['irregular','rectangle'],'objectives':['strip','bins']},
    {'id':'rectpack-maxrects','label':'rectpack · MaxRects','description':'另一开源工具的最大空闲矩形启发式；整数矩形定尺板，无疵点/刀缝。','kinds':['rectangle'],'objectives':['bins']},
    {'id':'rectpack-skyline','label':'rectpack · Skyline','description':'另一开源工具的天际线启发式；整数矩形定尺板，无疵点/刀缝。','kinds':['rectangle'],'objectives':['bins']},
    {'id':'onedimensional','label':'PackingSolver · 一维下料','description':'整数长度管棒/型材；最少根数或受限库存选件；当前不计锯缝。','kinds':['onedimensional'],'objectives':['bins','knapsack']},
    {'id':'onedimensional-kerf','label':'一维逐件锯缝 · 原生优化','description':'每件长度加整数锯缝，原料容量不变；末件也预留一刀，不含端头修边和余料库存。','kinds':['onedimensional'],'objectives':['bins']},
    {'id':'ffd-1d','label':'一维 FFD · 递减首次适应','description':'按长度递减，放入首个容纳的原料；每件及末件均计整数锯缝。','kinds':['onedimensional'],'objectives':['bins']},
    {'id':'bfd-1d','label':'一维 BFD · 递减最佳适应','description':'按长度递减，选择放入后剩余最少的原料；每件及末件均计整数锯缝。','kinds':['onedimensional'],'objectives':['bins']},
    {'id':'box','label':'PackingSolver · 三维装箱','description':'长方体、六种轴对齐朝向、容器总重量限制；独立校验重叠、边界和总重量。','kinds':['box'],'objectives':['bins','knapsack']},
]


def settings(engine='irregular', objective='strip', **kw):
    return {'engine':engine,'objective':objective,'rotation':'source','custom_angles':[0,180],
            'spacing':0,'edge':0,'kerf':0,'time_limit':10,'stages':3,'first_cut':'vertical',**kw}


def public(name):
    raw = json.loads((DATA/'normalized'/f'{name}.json').read_text(encoding='utf-8'))
    labels = {'albano':'Albano · 历史纺织轮廓','dagli':'Dagli · 历史纺织轮廓','shirts':'Shirts · 衬衫排料基准',
              'swim':'Swim · 泳装排料基准','trousers':'Trousers · 裤装排料基准'}
    return {'id':name,'name':labels[name],'industry':'apparel','kind':'irregular','unit':'benchmark',
            'description':f'{len(raw["items"])} 种轮廓 / {sum(x["demand"] for x in raw["items"])} 片；原始方向 0°/180°。',
            'source':{'label':'ESICUP XML 固定版本','kind':'public-benchmark',
                      'url':f'https://github.com/ESICUP/datasets/tree/154a8f006a8e72f65d734f2d1e36777f678f31f8/2d_irregular/{name}',
                      'sha256':raw['source_sha256'],'commit':raw['source_commit'],
                      'note':'纺织来源的历史排料基准。物理单位未知，无完整缝制/缝份/尺码信息。'+('SWIM 采用 XML 整数版本，与 TXT/JSON 小数版本不同。' if name=='swim' else '')},
            'items':[{'id':i['id'],'name':f'轮廓 {i["id"]+1}','quantity':i['demand'],'polygon':i['points'],
                      'allowed_rotations':i['allowed_rotations_deg'],'profit':1} for i in raw['items']],
            'stock':{'width':raw['source_length_limit'],'height':raw['strip_width'],'copies':20},
            'settings':settings(),'defects':[]}


def synthetic(ident, name, industry, kind, stock, items, config, description, defects=None):
    return {'id':ident,'name':name,'industry':industry,'kind':kind,'unit':'mm','description':description,
            'source':{'label':'本地合成教学示例','kind':'synthetic','note':'为演示该行业约束而构造的尺寸与轮廓，不代表工厂订单或真实生产纸样。'},
            'stock':stock,'items':items,'settings':config,'defects':defects or []}


def rectangles(specs, rotations=(0,90)):
    return [{'id':i,'name':n,'quantity':q,'width':w,'height':h,'profit':v,'allowed_rotations':list(rotations)}
            for i,(n,w,h,q,v) in enumerate(specs)]


def get_all():
    data = {n:public(n) for n in ['shirts','trousers','swim','albano','dagli']}
    polys = [
        ('L 型支架', [[0,0],[240,0],[240,70],[80,70],[80,220],[0,220]], 6, 3),
        ('T 型连接片', [[0,0],[260,0],[260,70],[165,70],[165,200],[95,200],[95,70],[0,70]], 4, 4),
        ('斜边盖板', [[0,0],[210,0],[260,80],[210,170],[30,170],[0,120]], 5, 5),
        ('矩形垫片', [[0,0],[130,0],[130,80],[0,80]], 8, 1),
    ]
    metal_items = [{'id':i,'name':n,'polygon':p,'quantity':q,'profit':v,'allowed_rotations':[0,90,180,270]} for i,(n,p,q,v) in enumerate(polys)]
    data['metal-parts'] = synthetic('metal-parts','钣金 · 异形零件套料','metal','irregular',{'width':1200,'height':800,'copies':10},
        metal_items, settings(objective='bins',rotation='quarter',spacing=3,edge=5), '四种异形零件，允许 90°转向，预留间距与边距。')
    leather_items = [
        {'id':0,'name':'包面示意','polygon':[[0,0],[300,0],[330,160],[285,250],[45,250],[0,170]],'quantity':6,'profit':5,'allowed_rotations':[0,180]},
        {'id':1,'name':'侧片示意','polygon':[[0,0],[120,0],[160,220],[115,260],[20,240]],'quantity':8,'profit':3,'allowed_rotations':[0,180]},
        {'id':2,'name':'带片示意','polygon':[[0,0],[380,0],[380,35],[0,35]],'quantity':10,'profit':1,'allowed_rotations':[0,180]},
    ]
    data['leather-defects'] = synthetic('leather-defects','皮革 · 疵点避让示例','leather','irregular',{'width':1600,'height':1000,'copies':10},
        leather_items,settings(objective='bins',spacing=4,edge=8),'矩形可用区域中的合成皮革部件，带两处矩形疵点；未建模整张天然皮边界。',
        [{'x':450,'y':250,'width':140,'height':100},{'x':1050,'y':650,'width':180,'height':130}])
    wood = rectangles([('柜体侧板',700,500,4,5),('隔板',600,400,6,3),('门板',500,300,6,4),('抽屉底板',350,250,8,2)],(0,180))
    data['wood-cabinet'] = synthetic('wood-cabinet','木板 · 柜体三阶段开料','wood','rectangle',{'width':2440,'height':1220,'copies':10},
        wood, settings('guillotine','bins',kerf=3), '3 mm 锯缝，保留长宽方向，三阶段贯通切割。')
    glass = rectangles([('窗片 A',800,600,5,5),('窗片 B',700,500,4,4),('隔断小片',400,350,8,2)])
    data['glass-panels'] = synthetic('glass-panels','玻璃 · 定尺分割','glass','rectangle',{'width':2000,'height':1500,'copies':10},
        glass,settings('guillotine','bins',rotation='quarter'), '整数矩形与贯通切割，允许 90°换向；零切缝的教学模型。')
    paper = rectangles([('包装面 A',297,210,12,3),('标签 B',140,90,30,1),('内衬 C',220,160,10,2)])
    data['paper-layout'] = synthetic('paper-layout','纸张 · 包装拼版','paper','rectangle',{'width':900,'height':640,'copies':20},
        paper,settings('rectangle','bins',rotation='quarter'), '矩形自由摆放，允许 90°旋转；选择贯通路线可比较裁切约束。')
    bars = [{'id':i,'name':f'型材 {l} mm','length':l,'quantity':q,'profit':v,'allowed_rotations':[0]}
            for i,(l,q,v) in enumerate([(1700,5,5),(1350,7,4),(950,8,3),(650,10,2),(420,6,1)])]
    data['bar-stock'] = synthetic('bar-stock','型材 · 6 米定长下料','bars','onedimensional',{'width':6000,'height':1,'copies':30},
        bars,settings('onedimensional','bins',rotation='none'), '一维整数长度模型；当前路线不计锯缝。')
    data['bar-stock-kerf'] = synthetic('bar-stock-kerf','型材 · 6 米逐件锯缝下料','bars','onedimensional',{'width':6000,'height':1,'copies':30},
        deepcopy(bars),settings('onedimensional-kerf','bins',rotation='none',kerf=3),
        '合成教学示例：3 mm 逐件尾部锯缝，末件也预留一刀；不含端头修边、夹持余量与余料库存。可与相同约束的 FFD/BFD 基线比较。')
    box_items=[{'id':i,'name':n,'width':w,'height':h,'depth':d,'quantity':q,'profit':v}
               for i,(n,w,h,d,q,v) in enumerate([
                   ('标准箱 A',400,300,250,12,5),('标准箱 B',600,400,300,6,8),('长条零件 C',800,200,150,6,4)])]
    data['box-mixed']=synthetic('box-mixed','混合箱体 · 最少容器','logistics','box',
        {'width':1200,'height':1000,'depth':1000,'copies':10},box_items,
        settings('box','bins',rotation='orthogonal'),'三种参数化箱体，可改变朝向；仅几何装箱，未建模承重/重心/运输稳定性。')
    small_items=deepcopy(box_items)
    for i in small_items: i['quantity']=4
    data['box-value']=synthetic('box-value','单容器 · 价值优先选件','logistics','box',
        {'width':900,'height':650,'depth':600,'copies':1},small_items,
        settings('box','knapsack',rotation='orthogonal'),'固定一个容器，根据每件价值选择可装入的箱体。')
    weighted_items=deepcopy(box_items)
    for item,weight in zip(weighted_items,[12,22,18]): item['weight']=weight
    data['box-weight']=synthetic('box-weight','物流 · 容器限重装箱','logistics','box',
        {'width':1200,'height':1000,'depth':1000,'copies':10,'maximum_weight':180},weighted_items,
        settings('box','bins',rotation='orthogonal'),'重量单位统一为 kg：每容器最多180kg；未建模重心、支撑与单件堆叠承重。')
    return data


def catalog():
    return {'datasets':[{'id':p['id'],'name':p['name'],'industry':p['industry'],'kind':p['kind'],'unit':p['unit'],
                         'description':p['description'],'source_kind':p['source']['kind']} for p in get_all().values() if p['kind']!='box'],
            'box_datasets':[{'id':p['id'],'name':p['name'],'description':p['description']} for p in get_all().values() if p['kind']=='box'],
            'industries':INDUSTRIES,'engines':ENGINES}


def scenario_fingerprint(p):
    # Name, solver choice and time budget do not change the mathematical instance.
    s = p.get('settings',{})
    items=[{k:v for k,v in i.items() if k not in ('name','effective_rotations')} for i in p.get('items',[])]
    obj = {'kind':p.get('kind'),'unit':p.get('unit'),'stock':p.get('stock'),'items':items,
           'cut_family':'guillotine' if s.get('engine')=='guillotine' else 'unrestricted',
           'defects':p.get('defects',[]),'settings':{k:v for k,v in s.items() if k not in ('engine','time_limit')}}
    def numbers(value):
        if isinstance(value,float) and value.is_integer(): return int(value)
        if isinstance(value,list): return [numbers(v) for v in value]
        if isinstance(value,dict): return {k:numbers(v) for k,v in value.items()}
        return value
    return hashlib.sha256(json.dumps(numbers(obj),sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()


def annotate_source(p):
    p = deepcopy(p)
    original = get_all().get(p.get('id'))
    if original:
        from engine import normalize_problem
        p['source'] = deepcopy(original['source'])
        p['source']['derived'] = scenario_fingerprint(normalize_problem(p)) != scenario_fingerprint(normalize_problem(original))
        p['source']['scenario_label'] = '自定义派生场景' if p['source']['derived'] else '原始实例参数'
    else:
        p['source'] = {'label':'用户导入/自建数据','kind':'user','derived':True,
                       'scenario_label':'自定义数据','note':'由本机用户提供，未核实外部出处。'}
    return p
