# 裁切实验室：八行业算法与工艺边界报告

更新日期：2026-10-16（Asia/Shanghai）。

根据本地适配器与已核查的官方资料整理，供工作台行业报告整合。代码能力不等于网页已验收，不等于工业生产已验证。

- 八个行业共享几何、约束和优化思想，但目标与工艺不同，不能合并成一个利用率排行榜。
- 当前工作台以公开基准和合成教学数据为主，未获得足以推导工厂节料收益的真实生产对照。
- 材料间距用于保证零件间的净距离；刀缝用于表示切割消耗。两者不能替换。
- 采用何种商业软件、产品宣传中的智能/AI/最优等用词，不能推断其私有算法、工业收益或市场份额。
- 所有研究切入点是从现有能力与工艺缺口提出的研究假设，不构成新颖性认定。

## 核查口径

本轮已读取 `engine.py`、`catalog.py`、`engine_box.py`、`engine_1d.py` 与实时进度接口，以及已有验收收据。已实现表示本地后端代码和适配器能力，不等于前端或公开版已完成。三条新增一维路线现已实现并有验收证据；前端与公开版仍待整合。本报告作者未启动新求解、网络检索或浏览器验收。

官方来源按各自核查日记录：2026-10-15 的厂商和作者资料来自既有研究笔记；2026-10-16 补查 PackingSolver、rectpack 与 RectangleBinPack 官方文档。本次小更新仅同步本地证据，不更新网络核查日期。

## 八行业概览

| 行业 | 当前已实现路线 | 本地数据 | 关键未实现工艺 |
|---|---|---|---|
| 服装布料 | `irregular` 异形优化；`shelf` 包围盒贪心基线 | shirts、trousers、swim、albano、dagli | 条格/图案相位匹配、布料缩率、颜色分组 |
| 皮革制品 | `irregular` 异形优化 | leather-defects | 整张天然皮外边界、孔洞和异形缺陷 |
| 钣金零件 | `irregular` 异形优化；`rectangle` 矩形优化；`rectpack-maxrects` MaxRects 最大空闲矩形；`rectpack-skyline` Skyline 天际线 | metal-parts | 激光/等离子等加工路径、割缝补偿与共边 |
| 木板家具 | `guillotine` 三阶段贯通切割；`rectangle` 矩形优化；`rectpack-maxrects` MaxRects 最大空闲矩形；`rectpack-skyline` Skyline 天际线 | wood-cabinet | 真实纹理图案与跨部件纹理连续 |
| 玻璃裁切 | `guillotine` 三阶段贯通切割；`rectangle` 矩形优化；`rectpack-maxrects` MaxRects 最大空闲矩形；`rectpack-skyline` Skyline 天际线 | glass-panels | 掰断力学、破损风险和最小可掰条宽 |
| 纸张包装 | `rectangle` 矩形优化；`rectpack-maxrects` MaxRects 最大空闲矩形；`rectpack-skyline` Skyline 天际线；`guillotine` 三阶段贯通切割；`irregular` 异形优化 | paper-layout | 咬口、出血、印刷相位与色组 |
| 型材管棒 | `onedimensional` 一维下料：零刀缝基线；`onedimensional-kerf` 一维下料：显式刀缝路线；`ffd-1d` 一维首次适应递减 FFD；`bfd-1d` 一维最佳适应递减 BFD | bar-stock | 端头修边、夹持余量、斜切/角度配对与截面方向 |
| 物流装箱 | `box` 三维轴对齐装箱与容器总限重 | box-mixed、box-value、box-weight | 重力支撑与接触面积、局部堆叠承重 |

## 服装布料

**问题。** 在固定幅宽内放下完整纸样需求，尽量缩短使用长度；定尺面料也可使用最少张数目标。

**工艺约束。**

- 布幅、纸样数量及完整套数
- 丝缕方向、绒向/单向图案与允许旋转
- 正反面/镜像、条格与花型对齐、色差
- 缝份、间距、边距、疵点、多层铺布

**当前路线。** `irregular` 异形优化；`shelf` 包围盒贪心基线。

原始角度、离散旋转或连续旋转可进入几何模型；用 source 保留各纸样原始角度。丝缕方向目前以允许角度近似表达，没有独立丝缕线或条格约束。

**尚未实现的约束。**

- 条格/图案相位匹配、布料缩率、颜色分组
- 成套尺码与订单配比、铺布层数和裁床流程
- 镜像、带孔衣片、完整缝份与缝制语义

**适合研究的切入点。** 以下为研究假设，未完成新颖性认定或收益验证。

1. **真实工艺约束下的旋转与批次比较**：在固定方向和完整需求下比较订单混排与单订单排料，量化放宽角度的敏感性。 数据与验证要求：真实纸样、丝缕/绒向标注、配套规则及现有排料；不得把放宽角度的效果算为算法改进。 评价指标：完整套数满足率、使用长度、超时/不可行率、方向与工艺违规数。

2. **疵点检测误差到安全避让**：以标定误差和漏检风险确定禁放区扩张，研究利用率与缺陷风险的关系。 数据与验证要求：实测空间标定及独立缺陷真值；仅增加禁区功能本身不构成新颖性。 评价指标：违规裁片数、缺陷漏避率、完整需求满足率、材料使用长度。

**数据与记录。** 已登记5个公开历史纺织基准输入。本报告未启动新的求解；实测结论应绑定具体结果证书、角度和预算。 物理单位未知，缺乏完整尺码、缝份、丝缕和工厂生产记录；Swim 的 XML 整数版本与 TXT/JSON 小数版本须区分。

**官方来源。** [PackingSolver 官方 irregular 文档](https://fontanf.github.io/packingsolver/irregular.html)（核查 2026-10-16）；[Lectra：Valia Fashion与材料浪费问题](https://www.lectra.com/en/library/how-valia-fashion-solves-the-material-waste-challenge)（核查 2026-10-15）；[AccuNest：Lay Limits分组规则](https://gerber-help.lectra.com/AccuNest/Group_Function_in_Lay_Limits_for_AccuNest_Placement.htm)（核查 2026-10-15）；[ESICUP 数据集官方仓库](https://github.com/ESICUP/datasets)（核查 2026-10-15）。

代码核对：2026-10-16。状态：代码能力已核对；网页整合与本轮收益比较不在本报告范围。

## 皮革制品

**问题。** 把异形裁片分配到皮张可用区域，避开疵点并满足部位品质与纹理要求。

**工艺约束。**

- 天然不规则外边界与孔洞
- 疵点、品质分区与部位质量要求
- 纹理、伸缩方向和允许旋转
- 数量、间距、边距及可复用余皮

**当前路线。** `irregular` 异形优化。

当前 leather-defects 是矩形可用区域中的合成部件与2处矩形疵点，可测试间距/边距和0°/180°旋转。原料外边界并未建模成天然皮张。

**尚未实现的约束。**

- 整张天然皮外边界、孔洞和异形缺陷
- 局部品质区、不同部件的可接受质量等级
- 视觉缺陷检测到毫米坐标的自动标定与不确定性传播
- 伸缩方向、局部机械性能和余皮库存价值

**适合研究的切入点。** 以下为研究假设，未完成新颖性认定或收益验证。

1. **品质区域与部件质量要求联合排料**：将部件对质量的要求与皮张质量分区匹配，避免一刀切地丢弃所有低等级区域。 数据与验证要求：真实皮张坐标、专家质量标签、部件等级；先接通不规则容器和质量区基线。 评价指标：完整需求满足率、部件品质违规率、可用区域利用率、未用余皮可复用性。

2. **误差鲁棒的缺陷避让**：针对检测与标定误差设计安全缓冲区，评估漏避风险和材料占用之间的权衡。 数据与验证要求：同一缺陷真值和测试集，不能只比较无缺陷与有缺陷场景的利用率。 评价指标：缺陷违规数、安全余量、求解耗时。

**数据与记录。** 已登记合成教学场景；没有天然皮张工厂订单或实测收益证据。 合成皮革轮廓与矩形疵点只展示约束机制，不能当作真实制革材料分布。

**官方来源。** [PackingSolver 官方 irregular 文档](https://fontanf.github.io/packingsolver/irregular.html)（核查 2026-10-16）；[Boole & Partners OptiNest 官方产品页](https://www.boole.eu/optinest.php)（核查 2026-10-15）；[jagua-rs 作者实现](https://github.com/JeroenGar/jagua-rs)（核查 2026-10-15）。

代码核对：2026-10-16。状态：矩形区域模型已实现；整皮工艺未验证。

## 钣金零件

**问题。** 将零件排在有限板材上，减少板数或选择高价值零件，并兼顾后续切割工艺。

**工艺约束。**

- 材料/厚度/设备、板材尺寸和余料
- 刀缝、零件间距、边距、夹持安全区
- 引入引出、微连接、共边切割与刀路
- 热影响、穿孔数量、零件倾倒和碰撞

**当前路线。** `irregular` 异形优化；`rectangle` 矩形优化；`rectpack-maxrects` MaxRects 最大空闲矩形；`rectpack-skyline` Skyline 天际线。

异形路线支持真实多边形及 spacing/edge；矩形三路线只适合实际矩形零件。metal-parts 的3 mm间距并不表示已计算3 mm刀缝。

**尚未实现的约束。**

- 激光/等离子等加工路径、割缝补偿与共边
- 微连接、穿孔、热变形、夹具碰撞和加工顺序
- 异形余料边界及其库存生命周期

**适合研究的切入点。** 以下为研究假设，未完成新颖性认定或收益验证。

1. **从几何排料拓展到加工代价**：在相同几何可行条件下引入可测的穿孔、路径长度与热影响代价，比较多目标方案。 数据与验证要求：需实际设备工艺或可信加工仿真；利用率与加工时间分别报告。 评价指标：板数、成品面积利用率、穿孔数、刀路长度、工艺违规数。

2. **余料未来价值**：同时评价当前板数与下一批需求可用余料形状，避免产生难复用碎片。 数据与验证要求：按时间划分订单和余料库存，防止利用未来订单信息。 评价指标：后续订单用板数、余料可复用率、库存占用。

**数据与记录。** 现有样例为合成钣金几何，未形成设备切割或工厂节料对照。 矩形替代异形、放宽转向或删除难排零件都会改变问题；应保留真实输入与派生标记。

**官方来源。** [PackingSolver 官方 irregular 文档](https://fontanf.github.io/packingsolver/irregular.html)（核查 2026-10-16）；[PackingSolver 官方 rectangle 文档](https://fontanf.github.io/packingsolver/rectangle.html)（核查 2026-10-16）；[rectpack 作者仓库与API](https://github.com/secnot/rectpack)（核查 2026-10-16）；[Lantek Expert Cut 官方产品页](https://www.lantek.com/cad-cam/sheet-metal-cutting-software)（核查 2026-10-15）；[Hypertherm ProNest 官方产品页](https://www.hypertherm.com/hypertherm/pronest/pronest-cadcam-nesting-software/)（核查 2026-10-15）。

代码核对：2026-10-16。状态：几何适配器已核对；工业CAM能力未实现。

## 木板家具

**问题。** 将家具部件从板材中切出，满足纹理与板锯工艺，减少板数或切割成本。

**工艺约束。**

- 板材尺寸、数量、木纹方向
- 锯缝、修边、首刀方向与切割阶段
- 纹理连续、封边、部件编号与分拣
- 锯机夹持、翻板、余料回库和批次

**当前路线。** `guillotine` 三阶段贯通切割；`rectangle` 矩形优化；`rectpack-maxrects` MaxRects 最大空闲矩形；`rectpack-skyline` Skyline 天际线。

wood-cabinet 为2440×1220合成板材与3 mm刀缝，原始0°/180°保留长宽方向。贯通路线限制三阶段精确切割，并提供切割树检查；矩形自由摆放路线用于不同问题设定的参照。

**尚未实现的约束。**

- 真实纹理图案与跨部件纹理连续
- 修边、封边、夹持、翻板时间与锯机后处理
- 多种板材价格、可用余料库存和生产排程

**适合研究的切入点。** 以下为研究假设，未完成新颖性认定或收益验证。

1. **工艺约束的代价分解**：分别引入方向、刀缝和三阶段限制，分析每项约束导致的板数或材料变化。 数据与验证要求：各组只改变预先规定的一个工艺条件，并标记为敏感性分析，不能称跨模型算法胜负。 评价指标：板数、完整需求满足率、可验证切割树比例、实测/估计加工时间。

2. **同模型强弱基线比较**：在无额外工艺的共同矩形子集比较 PackingSolver、MaxRectsBssf 与 SkylineBl。 数据与验证要求：使用相同整数尺寸、统一旋转开关、库存与有效预算；报告实际耗时。 评价指标：成功实例数、板数、利用率、运行时间。

**数据与记录。** 已有合成柜体开料输入，代码提供刀缝与切割树校验；本报告不声称本轮已完成实锯。 输入是教学尺寸，缺少真实木纹图像、加工公差与机台日志。

**官方来源。** [PackingSolver 官方 rectangle-guillotine 文档](https://fontanf.github.io/packingsolver/rectangleguillotine.html)（核查 2026-10-16）；[rectpack 作者仓库与API](https://github.com/secnot/rectpack)（核查 2026-10-16）；[HOMAG Cut Rite 官方产品页](https://www.homag.com/en/software-detail/software/work-preparation/cut-rite-cutting-optimization-software)（核查 2026-10-15）；[Boole & Partners OptiCut 官方产品页](https://www.boole.eu/opticoupe.php)（核查 2026-10-15）。

代码核对：2026-10-16。状态：三阶段几何切割模型已核对；设备工艺需另验。

## 玻璃裁切

**问题。** 在定尺玻璃上安排片型，并保证切割与后续掰断路径可执行。

**工艺约束。**

- 片型、尺寸、数量与方向
- 切割阶段、掰断顺序、最小条宽与边距
- 镀膜/花纹方向、除膜和磨边余量
- 破片重排、架位分配和物流顺序

**当前路线。** `guillotine` 三阶段贯通切割；`rectangle` 矩形优化；`rectpack-maxrects` MaxRects 最大空闲矩形；`rectpack-skyline` Skyline 天际线。

glass-panels 为2000×1500合成矩形玻璃、允许90°换向的零刀缝三阶段教学模型。自由矩形算法可用作几何对照，但不保证贯通切割或掰断可行。

**尚未实现的约束。**

- 掰断力学、破损风险和最小可掰条宽
- 除膜、磨边余量和异形片组合
- 架位、槽位、实际切台指令与破片重排

**适合研究的切入点。** 以下为研究假设，未完成新颖性认定或收益验证。

1. **贯通可行到掰断可行**：在三阶段切割树上追加可核查的掰断顺序与最小条宽约束。 数据与验证要求：需玻璃厂或设备规则与破片记录；几何切割树不是力学证据。 评价指标：可执行切割树比例、破损/拒绝规则数、材料张数、返工次数。

**数据与记录。** 现有玻璃场景为零刀缝合成模型；没有掰断或设备验证。 零切缝是教学假设，不能未经工艺确认直接用于真实玻璃切割。

**官方来源。** [PackingSolver 官方 rectangle-guillotine 文档](https://fontanf.github.io/packingsolver/rectangleguillotine.html)（核查 2026-10-16）；[A+W Shape Optimizer 官方产品页](https://www.a-w.com/software/shape-optimizer/)（核查 2026-10-15）；[A+W Production 官方产品页](https://www.a-w.com/aw-clarity/aw-production/)（核查 2026-10-15）。

代码核对：2026-10-16。状态：几何模型已实现；掰断工艺未实现。

## 纸张包装

**问题。** 在定尺纸张或卷材上安排矩形版面或异形包装轮廓，减少用纸并满足后道加工。

**工艺约束。**

- 纸张规格、数量、纸纹和旋转
- 印刷对位、咬口、出血与裁切余量
- 模切刀版、压痕、折线和版面组合
- 切割方式、批次与包装完整套数

**当前路线。** `rectangle` 矩形优化；`rectpack-maxrects` MaxRects 最大空闲矩形；`rectpack-skyline` Skyline 天际线；`guillotine` 三阶段贯通切割；`irregular` 异形优化。

paper-layout 当前是900×640合成矩形拼版，允许90°转向。异形路线可用于用户提供的单外轮廓包装展开件，但该样例本身不包含真实展开结构。

**尚未实现的约束。**

- 咬口、出血、印刷相位与色组
- 模切刀版、压痕/折叠语义与设备安全间距
- 瓦楞方向、套印精度和真实包装结构验证

**适合研究的切入点。** 以下为研究假设，未完成新颖性认定或收益验证。

1. **纸纹约束下的矩形路线对照**：比较统一旋转条件下的 MaxRectsBssf、SkylineBl 与 PackingSolver，并另测纸纹约束的成本。 数据与验证要求：零间距/零刀缝共同子集做算法比较；额外印刷留边需作为独立模型变量。 评价指标：纸张数、完整套数、印刷/后道规则违规数、耗时。

2. **二维展开件与可制造包装**：把可验证展开结构和模切/压痕约束加入几何排料。 数据与验证要求：真实结构、折线与刀版数据，不能把任意多边形称为可生产包装。 评价指标：可制造比例、纸张数、刀版长度。

**数据与记录。** 主代理已在同一 paper-layout 合成输入上运行 rectangle、rectpack-maxrects、rectpack-skyline：三者均52/52、3张、利用率85.55787037037037%，且独立校验通过。本报告读取 rectangle_comparison.json 转录，未重跑；仅单次演示，不形成算法排名。 矩形版面与异形展开件不可混称同一基准，工艺余量须写入实例定义。

**官方来源。** [PackingSolver 官方 rectangle 文档](https://fontanf.github.io/packingsolver/rectangle.html)（核查 2026-10-16）；[rectpack 作者仓库与API](https://github.com/secnot/rectpack)（核查 2026-10-16）；[PackingSolver 官方 rectangle-guillotine 文档](https://fontanf.github.io/packingsolver/rectangleguillotine.html)（核查 2026-10-16）；[PackingSolver 官方 irregular 文档](https://fontanf.github.io/packingsolver/irregular.html)（核查 2026-10-16）。

代码核对：2026-10-16。状态：几何路线已实现；印后工艺未实现。

## 型材管棒

**问题。** 从有限定长原料中切出需求长度，减少根数；在单根受限材料上也可按价值选件。

**工艺约束。**

- 原料长度、数量、需求长度与数量
- 锯缝、端头修边与末件切断规则
- 型材截面、斜切角和可用方向
- 余料库存、材料批次及多规格成本

**当前路线。** `onedimensional` 一维下料：零刀缝基线；`onedimensional-kerf` 一维下料：显式刀缝路线；`ffd-1d` 一维首次适应递减 FFD；`bfd-1d` 一维最佳适应递减 BFD。

基础 onedimensional 为零刀缝；三条新增后端路线 onedimensional-kerf、ffd-1d、bfd-1d 已实现并通过已有验收。每件成品占用 length + kerf，原料容量保持原始 L；末件也预留完整尾刀。三条新路线只支持 bins，FFD/BFD 采用稳定长度递减排序。前端与公开版仍待整合。

前端与公开版待整合：`onedimensional-kerf` 一维下料：显式刀缝路线；`ffd-1d` 一维首次适应递减 FFD；`bfd-1d` 一维最佳适应递减 BFD；其后端已实现，不能将接口验收等同网页已上线。

**尚未实现的约束。**

- 端头修边、夹持余量、斜切/角度配对与截面方向
- 多种料长成本、余料回库与设备排程
- 一维新路线的前端与公开版整合尚未完成

**适合研究的切入点。** 以下为研究假设，未完成新颖性认定或收益验证。

1. **可解释一维基线与刀缝消融**：在完全相同切刀约定下比较优化器、FFD 与 BFD，并单独比较刀缝改变问题后造成的材料变化。 数据与验证要求：已实现的三条刀缝路线统一采用每件尾刀、末件也计刀缝、原料 L 不变的保守模型；只能在该相同模型下比较算法。现场工艺若不同，需先修改并重新验收模型。 评价指标：原料根数、满足需求数、刀缝总损耗、余料长度分布、实际耗时。

2. **可复用余料与新料成本**：用实际订单序列评价保留余料的未来价值，而非只最小化当前剩余长度。 数据与验证要求：真实库存与后续订单，防止未来信息泄漏。 评价指标：累计新料成本、库存数量、余料再用率。

**数据与记录。** 已读取 qa_1d/results.json：9组单元验收通过、26次真实/基线求解调用；其中包含预期不完整的边界用例。tamper_checks.json 中14种篡改全部被拒绝。本报告只转录已有运行证据，未重复求解。 展示高度1仅是绘图约定，不是型材截面，也不提供管壁厚度或斜切几何。

**官方来源。** [PackingSolver 官方 one-dimensional 文档](https://fontanf.github.io/packingsolver/onedimensional.html)（核查 2026-10-16）；[PackingSolver 一维内部算法](https://fontanf.github.io/packingsolver/internals/onedimensional.html)（核查 2026-10-15）；[Boole & Partners OptiCut 官方产品页](https://www.boole.eu/opticoupe.php)（核查 2026-10-15）。

代码核对：2026-10-16。状态：四条一维后端路线已实现；三条新增路线前端/公开版待整合。

## 物流装箱

**问题。** 把长方体货件分配到容器，减少容器数量或在一个容器内选取更高价值货件。

**工艺约束。**

- 容器尺寸、可用数量与轴对齐朝向
- 单件重量与容器总重量上限
- 支撑面、单件承重、堆叠层数、重心
- 装卸顺序、运输稳定性与异形货物

**当前路线。** `box` 三维轴对齐装箱与容器总限重。

当前 box 适配器已把容器 maximum_weight 与单件 weight 传入求解器，并独立重算总重量。box-weight 合成示例设每容器180 kg；这只验证总限重模型，不代表托盘局部承重。

**尚未实现的约束。**

- 重力支撑与接触面积、局部堆叠承重
- 重心、运输加速度、倾覆与装卸路径
- 异形物体、异形容器、网格、禁区与任意旋转
- 三维间距和边距

**适合研究的切入点。** 以下为研究假设，未完成新颖性认定或收益验证。

1. **从总限重走向可验证支撑**：在几何与总重量模型之上加入接触/支撑约束，并独立校验支撑面积与载荷传播。 数据与验证要求：材料承重数据、重力方向和接触模型；不得仅凭装箱图判断稳定。 评价指标：容器数、体积利用率、总重量合规率、无支撑货件数、局部承重违规数。

2. **朝向与限重敏感性**：固定货物需求与容器，分别改变允许朝向和重量上限，识别容量瓶颈。 数据与验证要求：尺寸和重量均有可追溯单位；多种工艺设定不混入算法排行榜。 评价指标：完整需求满足率、容器数、体积利用率、每容器重量占比。

**数据与记录。** 参数化合成箱体已登记，容器总重量已在代码中接通。本报告未运行新装箱或核查整合后的浏览器状态。 几何为长方体近似；合成重量为教学数据，不能代表真实包装材料承重和运输条件。

**官方来源。** [PackingSolver 官方 box 文档](https://fontanf.github.io/packingsolver/box.html)（核查 2026-10-16）。

代码核对：2026-10-16。状态：几何与总重量适配器已实现；稳定性/局部承重未实现。

## 已读取的本地验收证据

本节转录主代理团队已经生成的收据，本报告作者没有重跑。

- `qa_1d/results.json`：9组单元验收通过，26次真实/基线调用；包含预期无法满足需求的边界用例，不能解释为26个完整可行解。
- `qa_1d/tamper_checks.json`：14种证书篡改全部被拒绝。
- `qa_1d/README.md` 与 `engine_1d.py`：每件成品占用 `length + kerf`，原料容量 `L` 不变，末件也计尾刀；三条新路线仅支持 `bins`。
- `qa_progress/results.json`：4组验收通过；6条原生路线已有真实回调证书，另覆盖运行时读取、取消保留与回调错误隔离。存储回放 fixture 不计为原生中间解。
- `static/reports/rectangle_comparison.json`：三路线使用同一场景指纹，结果如下文单次对照表。

## 算法路线与本地实现边界

### 异形优化（`irregular`）

状态：已实现于本地适配器。PackingSolver irregular；由适配器调用 mod.optimize，未在报告中把所有内部子算法都宣称为本次实际使用。

**方法。** 对真实多边形轮廓搜索位置与允许朝向，满足几何不重叠等约束。不同目标、输入与版本可能选用不同内部算法。

**已接入目标。** strip：固定幅宽，减少使用长度；bins：满足全部需求，减少材料张数；knapsack：有限材料，按价值选件。

**已接入约束。**

- 单一外轮廓的凸或凹多边形
- 矩形材料与矩形疵点
- 原始/禁止/180°/90°/自定义离散角度，或连续旋转范围
- 零件间距、材料边距；零件到疵点的距离采用 spacing
- 独立核对原始形状、数量、边界、重叠、角度、间距与疵点

**限制。**

- 镜像、带孔零件、异形材料边界、异形疵点与材料孔洞尚未接入。
- 允许旋转用于表达方向约束，未显式建模丝缕线、条格匹配、色差或缝制规则。
- 除 source 外的全局旋转模式会替换原允许角度；更宽松角度属于派生场景。
- 连续旋转向求解器传入 0–360° 范围，有限预算不保证遍历所有角度。
- 不支持刀缝和机床路径。

代码定位：`engine.py:normalize_problem`；`engine.py:_packing_solver`；`engine.py:validate_result`。

来源：[PackingSolver 官方 irregular 文档](https://fontanf.github.io/packingsolver/irregular.html)（核查 2026-10-16）；[PackingSolver 异形内部算法](https://fontanf.github.io/packingsolver/internals/irregular.html)（核查 2026-10-15）。

### 包围盒贪心基线（`shelf`）

状态：已实现于本地适配器。本地 Python 包围盒摆放基线。

**方法。** 按候选朝向的外接矩形进行分列摆放，便于解释与作为朴素对照，不利用凹形之间的嵌合空间。

**已接入目标。** strip；bins。

**已接入约束。**

- 真实原轮廓参与最终证书检查
- 有限离散角度
- 零件间距与材料边距

**限制。**

- 不支持疵点、连续旋转、刀缝、背包选件。
- 输入保持真实轮廓，搜索使用外接矩形；不能将其差距概括为所有传统算法的差距。

代码定位：`engine.py:_shelf`；`engine.py:validate_result`。

### 矩形优化（`rectangle`）

状态：已实现于本地适配器。PackingSolver rectangle。

**方法。** 在矩形材料中放置矩形零件；不要求每刀从当前子板一侧贯穿到另一侧。

**已接入目标。** strip；bins；knapsack。

**已接入约束。**

- 整数长宽
- 90°整数倍方向组合
- 矩形疵点
- 固定规格材料及数量

**限制。**

- 不接收异形零件的隐式包围盒替代。
- 额外 spacing/edge 必须为0；不支持 kerf。
- 自由矩形几何可行不意味着能够按板锯或玻璃设备切出。

代码定位：`engine.py:normalize_problem`；`engine.py:_packing_solver`。

来源：[PackingSolver 官方 rectangle 文档](https://fontanf.github.io/packingsolver/rectangle.html)（核查 2026-10-16）。

### MaxRects 最大空闲矩形（`rectpack-maxrects`）

状态：已实现于本地适配器。rectpack.MaxRectsBssf。

**方法。** 跟踪可容纳零件的空闲矩形，按较短边剩余量选择位置；放入零件后更新自由区域。

**已接入目标。** bins。

**已接入约束。**

- 整数矩形
- 所有零件统一的0°/90°尺寸朝向开关
- 有限数量同规格材料

**限制。**

- 本地适配器不支持疵点、刀缝、间距、边距或异形件。
- 只运行当前选定 Bssf 变体，不能代表整个 MaxRects 家族。
- 这是一轮启发式打包；time_limit 未传入 rectpack 内部，须报告实际墙钟时间。
- 没有贯通切割树，不能据此认证板锯工艺。

代码定位：`engine.py:_rectpack`；`engine.py:normalize_problem`。

来源：[rectpack 作者仓库与API](https://github.com/secnot/rectpack)（核查 2026-10-16）；[Jukka Jylänki RectangleBinPack 作者实现](https://github.com/juj/RectangleBinPack)（核查 2026-10-16）。

### Skyline 天际线（`rectpack-skyline`）

状态：已实现于本地适配器。rectpack.SkylineBl。

**方法。** 维护已放置布局的边界轮廓，并按 Bottom-Left 规则插入下一个矩形。

**已接入目标。** bins。

**已接入约束。**

- 整数矩形
- 所有零件统一的0°/90°尺寸朝向开关
- 有限数量同规格材料

**限制。**

- 本地适配器不支持疵点、刀缝、间距、边距或异形件。
- 只运行 SkylineBl，未接入所有 Skyline 变体或带空洞管理的变体。
- time_limit 未传入 rectpack 内部，不能声称已经做过相同搜索预算的反复优化。
- 没有贯通切割树。

代码定位：`engine.py:_rectpack`；`engine.py:normalize_problem`。

来源：[rectpack 作者仓库与API](https://github.com/secnot/rectpack)（核查 2026-10-16）；[Jukka Jylänki RectangleBinPack 作者实现](https://github.com/juj/RectangleBinPack)（核查 2026-10-16）。

### 三阶段贯通切割（`guillotine`）

状态：已实现于本地适配器。PackingSolver rectangleguillotine；stages=3、CutType.Exact、指定首刀方向。

**方法。** 每次切割贯穿当前子板，切割方向按阶段交替；在满足给定切割树约束下优化材料使用或选件价值。

**已接入目标。** bins；knapsack。

**已接入约束。**

- 整数矩形及允许转向
- 三阶段精确切割，不采用第四阶段取件修边
- 刀缝 kerf；首刀水平或垂直
- 矩形疵点；刀线允许穿越疵点，成品避开疵点
- 独立检查父子包含、交替贯通、阶段深度、相邻刀缝和成品叶节点

**限制。**

- 额外间距/边距未接入，不能用刀缝替代任意两件间距。
- 不支持任意阶段数、多种机型的完整操作/夹持约束。
- 切割树通过仍不保证玻璃掰断、木材纹理连续或机床可执行性。
- 库名含 guillotine 不自动等同三阶段+真实刀缝；本地按上述具体模型验收。

代码定位：`engine.py:_packing_solver`；`engine.py:_validate_tree`。

来源：[PackingSolver 官方 rectangle-guillotine 文档](https://fontanf.github.io/packingsolver/rectangleguillotine.html)（核查 2026-10-16）；[PackingSolver 贯通切割内部算法](https://fontanf.github.io/packingsolver/internals/rectangleguillotine.html)（核查 2026-10-15）。

### 一维下料：零刀缝基线（`onedimensional`）

状态：已实现于本地适配器。PackingSolver onedimensional。

**方法。** 按整数长度与需求把零件分配到定长原料，优化根数或单根价值。

**已接入目标。** bins；knapsack。

**已接入约束。**

- 整数长度、同规格原料根数
- 零件数量、价值
- 原始或禁止旋转，实际允许角度仅 [0]
- 展示高度为1，仅用于可视化

**限制。**

- 基础 onedimensional 路线维持零刀缝；正 kerf 会被拒绝。需要刀缝时显式选择已实现的 onedimensional-kerf、ffd-1d 或 bfd-1d。
- 端头损耗、斜切、方向性截面、多种料长成本与余料库存未接入。

代码定位：`engine.py:normalize_problem`；`engine.py:_packing_solver`。

来源：[PackingSolver 官方 one-dimensional 文档](https://fontanf.github.io/packingsolver/onedimensional.html)（核查 2026-10-16）；[PackingSolver 一维内部算法](https://fontanf.github.io/packingsolver/internals/onedimensional.html)（核查 2026-10-15）。

### 一维下料：显式刀缝路线（`onedimensional-kerf`）

状态：已实现于本地适配器。真实 PackingSolver 一维模块加可验证长度变换；原料 L 不变，求解后的成品长度恢复，刀缝单独输出。

**方法。** 每件成品占用 length + kerf，原料容量保持原始 L；末件也预留完整尾刀。 通过对求解实例的长度变换实现保守逐件锯缝，最终证书独立校验。

前端与公开版状态：待整合。

**已接入目标。** bins：满足全部需求，减少原料根数。

**已接入约束。**

- 整数长度、非负整数刀缝、有限根数同规格原料
- 每件成品占用 length + kerf，原料容量保持原始 L；末件也预留完整尾刀。
- 每件输出独立 cuts 证书，包含零宽切口
- 从原始输入独立重算成品长度、尾刀、占用区间、边界与切口对应关系

**限制。**

- 仅支持 bins；不支持背包、非零间距、非零边距或疵点。
- 不含端头修边、夹持余量、斜切、余料库存或实际机器切割顺序。
- 前端与公开版仍待整合；后端验收通过不等于网页已上线。
- 原生逐件锯缝回调证书中长度含刀缝，展示成品前必须依据原始输入还原。

代码定位：`engine_1d.py:solve_kerf_1d`；`engine_1d.py:validate_kerf_1d`；`engine.py:normalize_problem`。

验收收据：`qa_1d/results.json`；`qa_1d/tamper_checks.json`；`qa_1d/README.md`。

来源：[PackingSolver 官方 one-dimensional 文档](https://fontanf.github.io/packingsolver/onedimensional.html)（核查 2026-10-16）。

### 一维首次适应递减 FFD（`ffd-1d`）

状态：已实现于本地适配器。本地 FFD 一维基线，使用与原生刀缝路线相同的逐件尾刀模型。

**方法。** 按成品长度稳定降序排序；同长件保留输入类型与副本顺序。每件放入第一个能容纳 length + kerf 的已开原料，否则在库存允许时开新原料。

前端与公开版状态：待整合。

**已接入目标。** bins：满足全部需求，减少原料根数。

**已接入约束。**

- 整数长度、非负整数刀缝、有限根数同规格原料
- 每件成品占用 length + kerf，原料容量保持原始 L；末件也预留完整尾刀。
- 每件输出独立 cuts 证书，包含零宽切口
- 从原始输入独立重算成品长度、尾刀、占用区间、边界与切口对应关系

**限制。**

- 仅支持 bins；不支持背包、非零间距、非零边距或疵点。
- 不含端头修边、夹持余量、斜切、余料库存或实际机器切割顺序。
- 前端与公开版仍待整合；后端验收通过不等于网页已上线。
- 确定性构造基线完成即返回，不提供原生 incumbent 回调；不模拟连续改进轨迹。

代码定位：`engine_1d.py:solve_kerf_1d`；`engine_1d.py:validate_kerf_1d`；`engine.py:normalize_problem`。

验收收据：`qa_1d/results.json`；`qa_1d/tamper_checks.json`；`qa_1d/README.md`。

### 一维最佳适应递减 BFD（`bfd-1d`）

状态：已实现于本地适配器。本地 BFD 一维基线，使用与原生刀缝路线相同的逐件尾刀模型。

**方法。** 按成品长度稳定降序排序；每件选择装入 length + kerf 后剩余长度最小的可行原料，同余量取最早原料。同长件保留输入顺序。

前端与公开版状态：待整合。

**已接入目标。** bins：满足全部需求，减少原料根数。

**已接入约束。**

- 整数长度、非负整数刀缝、有限根数同规格原料
- 每件成品占用 length + kerf，原料容量保持原始 L；末件也预留完整尾刀。
- 每件输出独立 cuts 证书，包含零宽切口
- 从原始输入独立重算成品长度、尾刀、占用区间、边界与切口对应关系

**限制。**

- 仅支持 bins；不支持背包、非零间距、非零边距或疵点。
- 不含端头修边、夹持余量、斜切、余料库存或实际机器切割顺序。
- 前端与公开版仍待整合；后端验收通过不等于网页已上线。
- 确定性构造基线完成即返回，不提供原生 incumbent 回调；不模拟连续改进轨迹。

代码定位：`engine_1d.py:solve_kerf_1d`；`engine_1d.py:validate_kerf_1d`；`engine.py:normalize_problem`。

验收收据：`qa_1d/results.json`；`qa_1d/tamper_checks.json`；`qa_1d/README.md`。

### 三维轴对齐装箱与容器总限重（`box`）

状态：已实现于本地适配器。PackingSolver box；已传入 maximum_weight 与 item.weight，并独立复算每容器总重量。

**方法。** 将长方体放入长方体容器，在允许的轴置换朝向下避免正体积重叠，并满足可选容器总重量上限。

**已接入目标。** bins；knapsack。

**已接入约束。**

- 整数长宽高、有限数量容器
- XYZ/XZY/YXZ/YZX/ZXY/ZYX 六种轴对齐朝向及每件允许子集
- 容器总重量；启用限重时每类零件需有正重量
- 数量、容器边界、重叠、朝向、原始尺寸与总重量独立校验

**限制。**

- 总限重不等于单件承重、重力支撑或运输稳定性。
- 不支持重心、局部堆叠承重、装卸顺序、异形物体/容器或网格。
- 不支持三维间距、边距、刀缝、容器禁区或任意连续旋转。
- 重量需统一单位；示例 box-weight 使用 kg，代码不会自动转换单位。

代码定位：`engine_box.py:normalize_box_problem`；`engine_box.py:solve_box`；`engine_box.py:validate_box_result`。

来源：[PackingSolver 官方 box 文档](https://fontanf.github.io/packingsolver/box.html)（核查 2026-10-16）。

## 路线公平比较：先固定问题，再评价求解器

1. 固定输入哈希、材料规格与数量、所有零件及需求、单位、允许角度、镜像、疵点、边距、间距、刀缝和目标；不得删除难排件。
2. 只有共同支持的模型才能直接做算法比较。无疵点、零间距/边距/刀缝、统一旋转的整数矩形 bins 子集可以比较 rectangle、MaxRectsBssf、SkylineBl。
3. 贯通切割与自由排放的可行域不同，适合比较工艺约束代价，不能以自由排放更密证明它在贯通工艺中更优。
4. 分别报告完整需求与可行性。bins/strip 未排完不能与完整订单方案按利用率直接排序；knapsack 可选子集，优先报告价值及约束可行性。
5. 固定墙钟上限、CPU型号、线程数、内存、软件版本和种子。随机算法预先声明种子集合与重复次数；一次结果不表示稳定优势。
6. 当前 PackingSolver 接收1–60秒 time_limit；rectpack 与 FFD/BFD 是一轮启发式/构造基线，适配器没有让它们反复搜索至预算耗尽。应报告实际耗时，并在统一外部上限内比较，不能虚构同等搜索过程。
7. 先独立核验数量、原始几何/尺寸、边界、重叠、方向与约束，再纳入结果统计；保存失败、超时、部分结果和原始证书。
8. 若做学习方法，训练、超参数选择与最终测试按实例家族/订单来源分离；预处理、模型加载与推理时间单列，并声明总预算口径。
9. 报告实例数、完整可行率、板/根/箱数、使用长度或价值、实际耗时与分布；在可比实例上报告配对差值，不只挑最好的一次。
10. 下界、精确小规模解与可行结果分开。没有匹配且有效的上下界证据，不写全局最优。
11. 工业收益必须有同订单、同设备/工艺、同需求的现场对照及成本口径；公开/合成基准不能直接外推为工厂节省率。

### 建议比较分组

| 分组 | 路线 | 必须固定或声明的条件 |
|---|---|---|
| 矩形共同子集 | `rectangle`、`rectpack-maxrects`、`rectpack-skyline` | 整数矩形 bins；相同统一旋转；无疵点、零间距、零边距、零刀缝。 |
| 异形原始方向基线 | `irregular`、`shelf` | 相同真实轮廓与需求，离散角度、相同间距/边距且无疵点；优先使用公开源角度。 |
| 工艺约束敏感性 | `rectangle`、`guillotine` | 明确区分自由排放与三阶段切割；刀缝与其他条件逐项消融，结论写为工艺约束代价。 |
| 一维保守逐件尾刀对照 | `onedimensional`、`onedimensional-kerf`、`ffd-1d`、`bfd-1d` | 三条新增后端已实现。比较时统一长度、库存、需求、每件尾刀与末件刀缝约定；原料 L 不变。基础零刀缝与非零刀缝按不同问题设定分组。 |
| 三维朝向/限重敏感性 | `box` | 同一容器与货件；分别固定/改变朝向和总重量上限；不与二维面积指标混合。 |

### 指标定义

| 指标 | 口径 |
|---|---|
| 条带利用率 | 已放置成品面积 ÷（使用长度 × 固定幅宽）；同时报告完整需求，单位未知时保持基准坐标。 |
| 定尺二维利用率 | 已放置成品面积 ÷ 已使用板材总面积；缺陷面积是否扣除须明确，本地当前分母未扣除疵点。 |
| 一维利用率 | 成品总长度 ÷ 已使用原料总长度；刀缝损耗与可复用余料应独立列出。 |
| 三维体积利用率 | 已放置货件体积 ÷ 已使用容器总体积；不能替代总限重或稳定性指标。 |
| 背包价值 | 已放置零件价值之和；数量可以不足完整需求，必须保留目标与价值定义。 |
| 达到首个可行解时间 | 从明确计时起点到首次观测到完整可行候选解的墙钟时间；标明是否独立校验。未观测则为空，不能以结束时间代替。 |
| 中间解改进轨迹 | 按真实时间记录当前目标值及解状态；不规则数量未满足、背包目标和完整订单目标不可混画为同一指标。 |
| 实际已用时间 | 使用单调时钟记录 elapsed，与预设 time_limit 分开。时间预算用量不能称为搜索完成百分比。 |

### 实时求解：展示观测到的过程，不制造进度

原生 new_solution_callback 已保存真实 incumbent 证书与进度清单；已有6条原生路线验收收据。中间证书标记 native-intermediate-not-independently-validated，不能因为最终结果通过而把所有中间解写成已独立验证。FFD/BFD、货架等无原生回调路线不伪造轨迹。

当前状态：回调后端已实现；前端及公开版待接入。收据为 `qa_progress/results.json`，本报告已读取，不依赖任务口头完成状态。

- 显示实际已用墙钟时间 elapsed、时间预算与当前运行状态；未获得新信息时如实显示等待。
- 首个可行解时间定义为开始计时后首次获得并可识别的可行候选解的时间，需记录计时起点与检测方式。只在结束时收到结果的路线，应写未观测，不应把总运行时间伪装为首解时间。
- 改进轨迹保存时间戳、目标值、已放置/需求数量、可行性、来源和校验状态。部分放置与完整可行解分开呈现；只能按当前目标的正确优化方向识别改进。
- 若引擎没有中间解回调或可解析记录，应显示已用时间和真实状态，并声明该路线未提供中间解轨迹。
- 候选解来自求解器的可行标记时，标明独立校验待完成；只有通过独立证书检查后才能升级为已验证。
- 时间预算已用比例仅表示时间，不是解空间搜索完成比例；不得绘制臆造的算法完成百分比。
- 目标值改善曲线只说明已观测候选解的变化，不证明全局最优，也不证明继续运行不会找到更优解。
- 若回调、序列化、几何校验或前端刷新增加开销，记录频率与开销；公平比较要统一监测设置。

建议事件字段：`event_time_s`、`elapsed_s`、`event_type`、`objective`、`objective_value`、`placed_pieces`、`required_pieces`、`solver_feasible`、`independent_validation`、`solution_id`、`source`。

没有观测即记录 null，并提供 unavailable_reason；不能补造曲线或中间解。

### 同输入矩形比较演示

已读取主代理运行的 `static/reports/rectangle_comparison.json`。输入为同一合成 `paper-layout`，场景指纹均为 `62d990a1af3f915dddaed34b2700fc931da91ca873c04e60af7b9bf173e95495`，本报告未重跑。

| 路线 | 完整需求 | 材料张数 | 利用率 | 请求预算/秒 | 实际耗时/秒 | 独立校验 |
|---|---|---:|---:|---:|---:|---|
| `rectangle` | 52/52 | 3 | 85.55787% | 1 | 1.052303 | 通过 |
| `rectpack-maxrects` | 52/52 | 3 | 85.55787% | 1 | 0.079674 | 通过 |
| `rectpack-skyline` | 52/52 | 3 | 85.55787% | 1 | 0.004707 | 通过 |

单组合成实例的单次演示，不用于算法排名。PackingSolver请求1秒限时，包含调用开销的实际耗时约1.052秒；rectpack完成一轮即返回，不能声称内部进行了等长1秒搜索。

## 数据质量与证据等级

- **公开历史基准**：Shirts/Trousers/Swim/Albano/Dagli；保留固定来源commit、原始SHA-256及转换记录。 边界：纺织来源不等于完整工业纸样；物理单位未知，缺少完整缝份/尺码/丝缕和生产日志。
- **合成教学示例**：皮革、钣金、木板、玻璃、纸张、型材、物流的本地尺寸与约束示例。 边界：用于验证流程及明确约束，不代表工厂订单、真实缺陷分布或工业收益。
- **用户导入/自建**：需要用户核实来源、授权、单位、标定与工艺语义。 边界：名称或手工标注不能自动升级为已验证真实生产数据。
- **厂商官方功能说明**：可核查产品公开功能、工作流和许可入口。 边界：带商业自评性质，不用于算法优劣、市场份额或平均节料率推断。

### 最低质量检查

- 几何需排除自交、零面积、重复/不闭合问题；曲线折线化记录误差容限，原始与转换数据分别保存哈希。
- 整数求解路线先统一单位与尺度，不能默默四舍五入成更小零件；数值容差不同于制造公差。
- 记录原始允许角度和 effective_rotations；旋转、数量、材料或工艺变化应标记派生场景。
- SWIM XML整数版与TXT/JSON小数版不能混用同一基准名称而不记录版本。
- 缺陷图像框需要相机/材料坐标标定和误差界；像素不能直接当毫米。
- 3D长方体模型需明确这是实际箱体还是外接盒近似；重量使用一致单位，限重启用时不能缺省为零。
- 软件支持某能力不等于本适配器已接入；本地状态以源码、证书与实际验收共同认定。
- 保留归一化输入、求解实例、原始证书、校验报告、日志、软件版本和时间预算；仅任务完成通知不足以认定结果有效。

建议保留字段：`source_kind`、`source_url`、`source_commit`、`source_sha256`、`normalized_sha256`、`unit`、`geometry_approximation`、`source_rotations`、`effective_rotations`、`scenario_fingerprint`、`derived`、`engine_version`、`budget`、`actual_elapsed`、`certificate`、`validation`。

本报告是针对现有工作台的工程与研究范围说明，非系统文献综述、专利新颖性检索或工业认证。

## 官方来源与核查日期

- **ps-irregular**：[PackingSolver 官方 irregular 文档](https://fontanf.github.io/packingsolver/irregular.html)。组织/作者：PackingSolver 项目；核查：2026-10-16。本轮网页直接读取。支持范围：上游多边形、旋转、镜像、孔洞、疵点和间距能力；本地实际接入范围另由代码限定。

- **ps-irregular-internals**：[PackingSolver 异形内部算法](https://fontanf.github.io/packingsolver/internals/irregular.html)。组织/作者：PackingSolver 项目；核查：2026-10-15。继承 research/algorithm_notes.md 的已核查记录，本轮未重新打开。支持范围：存在多种内部优化路线；不能不查具体运行配置就将全部算法等同于本次执行。

- **ps-rectangle**：[PackingSolver 官方 rectangle 文档](https://fontanf.github.io/packingsolver/rectangle.html)。组织/作者：PackingSolver 项目；核查：2026-10-16。本轮网页直接读取。支持范围：二维矩形求解器；本地目标、整数尺寸及限制由适配器确认。

- **ps-guillotine**：[PackingSolver 官方 rectangle-guillotine 文档](https://fontanf.github.io/packingsolver/rectangleguillotine.html)。组织/作者：PackingSolver 项目；核查：2026-10-16。本轮网页直接读取。支持范围：贯通切割模型与约束；具体三阶段、Exact和刀缝配置由本地代码确认。

- **ps-guillotine-internals**：[PackingSolver 贯通切割内部算法](https://fontanf.github.io/packingsolver/internals/rectangleguillotine.html)。组织/作者：PackingSolver 项目；核查：2026-10-15。继承 research/algorithm_notes.md 的已核查记录，本轮未重新打开。支持范围：树搜索等公开内部算法的说明入口。

- **ps-onedimensional**：[PackingSolver 官方 one-dimensional 文档](https://fontanf.github.io/packingsolver/onedimensional.html)。组织/作者：PackingSolver 项目；核查：2026-10-16。本轮网页直接读取。支持范围：一维模型和输入接口；不据上游页面声称本地已实现刀缝。

- **ps-onedimensional-internals**：[PackingSolver 一维内部算法](https://fontanf.github.io/packingsolver/internals/onedimensional.html)。组织/作者：PackingSolver 项目；核查：2026-10-15。继承 research/algorithm_notes.md 的已核查记录，本轮未重新打开。支持范围：一维动态规划、搜索与模式选择等公开算法说明入口。

- **ps-box**：[PackingSolver 官方 box 文档](https://fontanf.github.io/packingsolver/box.html)。组织/作者：PackingSolver 项目；核查：2026-10-16。本轮网页直接读取。支持范围：三维轴对齐长方体、六种朝向、容器最大总重量及证书格式。

- **rectpack**：[rectpack 作者仓库与API](https://github.com/secnot/rectpack)。组织/作者：rectpack 项目作者；核查：2026-10-16。本轮网页直接读取。支持范围：MaxRectsBssf、SkylineBl、旋转开关与矩形输入；本地仅接入两个变体。

- **rectanglebinpack**：[Jukka Jylänki RectangleBinPack 作者实现](https://github.com/juj/RectangleBinPack)。组织/作者：Jukka Jylänki；核查：2026-10-16。本轮网页直接读取。支持范围：MaxRects、Skyline与Guillotine家族的原作者公开实现和方法说明入口。

- **lectra-valia**：[Lectra：Valia Fashion与材料浪费问题](https://www.lectra.com/en/library/how-valia-fashion-solves-the-material-waste-challenge)。组织/作者：Lectra；核查：2026-10-15。继承 research/industry_notes.md 官方来源核查，本轮未重新打开。支持范围：布宽、缩率、图案重复、旋转和尺码组合等工业工作流要求；不采纳营销收益数值。

- **accunest-groups**：[AccuNest：Lay Limits分组规则](https://gerber-help.lectra.com/AccuNest/Group_Function_in_Lay_Limits_for_AccuNest_Placement.htm)。组织/作者：Lectra / Gerber 官方帮助；核查：2026-10-15。继承 research/industry_notes.md 官方来源核查，本轮未重新打开。支持范围：同组旋转/翻转、纱向与色差一致性的工艺语义。

- **esicup**：[ESICUP 数据集官方仓库](https://github.com/ESICUP/datasets)。组织/作者：ESICUP community；核查：2026-10-15。继承 research/algorithm_notes.md；本地 catalog 另记录固定commit与原始SHA-256。支持范围：公开基准来源；保留版本和许可，不把历史轮廓当完整工厂订单。

- **optinest**：[Boole & Partners OptiNest 官方产品页](https://www.boole.eu/optinest.php)。组织/作者：Boole & Partners；核查：2026-10-15。继承 research/industry_notes.md 官方来源核查，本轮未重新打开。支持范围：通用异形的旋转、分组、孔洞、刀具厚度等工艺功能说明；未获可复现私有优化器。

- **jagua**：[jagua-rs 作者实现](https://github.com/JeroenGar/jagua-rs)。组织/作者：Jeroen Gardeyn 与项目维护者；核查：2026-10-15。继承 research/algorithm_notes.md 的作者来源核查，本轮未重新打开。支持范围：几何碰撞后端、质量区和自定义禁区的研究参考；未在本工作台接入。

- **lantek**：[Lantek Expert Cut 官方产品页](https://www.lantek.com/cad-cam/sheet-metal-cutting-software)。组织/作者：Lantek；核查：2026-10-15。继承 research/industry_notes.md 官方来源核查，本轮未重新打开。支持范围：钣金共边、微连接、引入引出、余料及机床路径等功能范围。

- **pronest**：[Hypertherm ProNest 官方产品页](https://www.hypertherm.com/hypertherm/pronest/pronest-cadcam-nesting-software/)。组织/作者：Hypertherm；核查：2026-10-15。继承 research/industry_notes.md 官方来源核查，本轮未重新打开。支持范围：刀缝、夹持、切序及可选自动套料模块等生产约束；不推断私有算法。

- **cutrite**：[HOMAG Cut Rite 官方产品页](https://www.homag.com/en/software-detail/software/work-preparation/cut-rite-cutting-optimization-software)。组织/作者：HOMAG；核查：2026-10-15。继承 research/industry_notes.md 官方来源核查，本轮未重新打开。支持范围：板材开料、切割规则、余料、标签和设备衔接；不引用厂商收益作独立效果证据。

- **opticut**：[Boole & Partners OptiCut 官方产品页](https://www.boole.eu/opticoupe.php)。组织/作者：Boole & Partners；核查：2026-10-15。继承 research/industry_notes.md 官方来源核查，本轮未重新打开。支持范围：板材与棒料、纹理、修边、库存与余料等工艺问题范围。

- **aw-shape**：[A+W Shape Optimizer 官方产品页](https://www.a-w.com/software/shape-optimizer/)。组织/作者：A+W；核查：2026-10-15。继承 research/industry_notes.md 官方来源核查，本轮未重新打开。支持范围：玻璃形状组合、掰断与除膜要求；不提供本地掰断已验证的证据。

- **aw-production**：[A+W Production 官方产品页](https://www.a-w.com/aw-clarity/aw-production/)。组织/作者：A+W；核查：2026-10-15。继承 research/industry_notes.md 官方来源核查，本轮未重新打开。支持范围：机台、工序、批次、架位与切割优化的生产协同。

## 使用声明

本报告没有工业收益百分比、市场份额、商业软件私有算法推断，也没有将几何校验通过写成全局最优或工业可加工性证明。合成实例的利用率仅说明该实例结果。后续更新应依据明确的代码变更、验收收据与来源，而不是任务完成通知。
