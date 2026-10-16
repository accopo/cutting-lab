# 裁切减废：工业软件官方资料核查

核查日期：2026-10-15（Asia/Shanghai）。范围：服装布料、板材/金属、木材、玻璃。本文是厂商官方资料的来源核查与功能目录，供主报告综合；未安装、未注册账户、未提交个人信息、未启动付费或自动续费试用。

## 检索与证据边界

- 研究问题：这些行业公开提供哪些排料/套料/裁切优化软件；实际处理哪些生产约束；能否在本地试用；厂商是否公开足以复现的算法。
- 方法：按品牌与 `nesting / cutting optimization / marker / trial / system requirements / DXF` 检索；优先打开厂商产品页、官方帮助中心、安装指南与许可协议。中文与英文均纳入。当前产品优先；旧帮助页保留并标明版本边界。
- 纳入：产品厂商官网、官方帮助与技术文档；排除：破解站、软件聚合下载站、第三方营销比较、论坛用户意见、未核实的代理商宣称。HOMAG/Magi-Cut 的关系另以 HOMAG 官网交叉验证，但表中试用结论直接用 HOMAG 官网。
- 证据类型：全部为厂商第一手功能说明，适合核查“提供哪些功能/许可入口”，不构成独立节料效果验证。临床证据 I–VII 分级与期刊掠夺性检查不适用于该产品目录；商业利益冲突对全部来源均存在。
- 限定：表中的“官网未见”只覆盖本次阅读的产品/帮助页面，不能推出该公司全部技术资料或专利从未披露。本次未做专利检索、未实测版本兼容性、未获得报价。
- 商业软件的“AI / intelligent / advanced algorithm / optimal”表述，不足以确认它使用遗传算法、强化学习、NFP 或给出全局最优证明。下列来源多数未公开可直接复现的完整求解器；不要把通用学术算法强行对应某一商业产品。
- 覆盖偏向提示：这是按任务要求专门采集的厂商文档集合，100% 为商业灰色文献，因此不能用于估计市场份额、平均节料率或比较算法优劣。

## 产品目录（12 项）

| 行业/软件 | 官方资料确认的生产约束与功能 | 已确认输入/输出 | 部署、许可、试用现状 | 官方直接来源 |
|---|---|---|---|---|
| 服装：Lectra Diamino / Valia Fashion | 官方 2026 资料将 Diamino Expert 与 AccuNest 列为本地工作站方案，将 Valia 描述为云端整合平台；Valia 规则包含布宽、缩率、花型重复、旋转限制、尺码组合，并连接排料与裁床 | 订单、裁片和工艺规则进入；生成排料/用布估计并连到 Vector/Virga 等裁切流程。该页未给通用文件格式清单 | 云端 Valia 与历史桌面 Diamino 应区分；本次未确认无需联系销售的公开离线试用 | [Valia 约束说明](https://www.lectra.com/en/library/how-valia-fashion-solves-the-material-waste-challenge)；[2026 产品关系比较（意大利语）](https://www.lectra.com/it/libreria/perche-le-soluzioni-tradizionali-per-le-sale-taglio-non-riescono-a-stare-al-passo-con-le) |
| 服装：Gerber AccuNest | AccuMark Lay Limits 可把需缝合匹配的裁片分组，同组遵守允许的旋转/翻转以保持纱向、色差一致；MC 版多核并行找更好排料 | AccuMark Explorer / UltraQueue 提交 marker；输出 AccuMark 体系的排料结果 | 2022 版官方配置页写 Windows 10/11、64 位、至少 8 GB，建议独占物理 PC；不支持虚拟 PC/server。此为旧版本页，当前采购需核实；本次未确认公开免费试用 | [分组约束](https://gerber-help.lectra.com/AccuNest/Group_Function_in_Lay_Limits_for_AccuNest_Placement.htm)；[配置说明与版本边界](https://gerber-help.lectra.com/AccuNest/Recommended_Configuration.htm) |
| 服装/软材：Optitex Marker、Nest++2 / Nest++Pro | 按款式、材料、尺码数量建任务；支持旋转/翻转、沿折边放置、受损区域避让、顺序与方向约束、多核自动排料 | 可聚合 PDS；官方支持页确认可导入 DXF/AAMA、Lectra MDL、Gerber Zip、Investronica EXP；生成排料与耗料/成本报告 | 桌面 Windows 生态；安装指南明确 Nesting Pack 需要 Optitex license。产品页有咨询/概念验证服务，未确认无需销售授权的完整免费试用 | [Marker](https://optitex.com/products/marker/)；[格式与系统支持](https://optitex.com/support/)；[安装指南](https://help.optitex.com/1382687/Content/PDFs/Optitex%20Installation%20Guide.pdf) |
| 国内服装：富怡 Richpeace Garment CAD V10.0、Supernest | 自动/手工/交互排料；按面料限制旋转和翻转，支持倾斜容差、分组、条格、色差处理与疵点避让；可排队处理多个 marker | DGS 设计放码，GMS 排料；导入 DXF、AAMA/ASTM/AUTOCAD 和 HPGL；图样/裁切文件可重新排料，支持 1:1 绘图/裁切 | 页面列 Windows 7/10（不能据此保证 Win11）；有官方 Download、Manual，但下载安装包不等于取得免费排料许可证；试用/模块授权需核实 | [官方 V10 产品与下载入口](https://www.richpeace.com/garment_cad-show-437.html)；[官方手册](https://soft.richpeace.com/EN/manual/RichpeaceGarmentCADV10.0SystemManual.pdf) |
| 金属：Lantek Expert Cut | 自动/半自动/手工套料，按材料/厚度/设备设工艺；支持余料、共边、引入引出、微连接、刀路和碰撞管理；覆盖激光/等离子/火焰/水刀 | DXF、DWG、DSTV 几何与订单进入；生成设备 CNC 程序，连接 MES/ERP | 商业模块化 CAD/CAM；官方入口为申请个性化 demo；本次未确认无账户免费完整安装版 | [当前产品页](https://www.lantek.com/cad-cam/sheet-metal-cutting-software)；[官方技术单页](https://campaign.lantek.com/hubfs/Documents/English/Expert_CUT_ENG_PRINT.pdf?hsLang=en) |
| 金属/木材/复材：SigmaNEST | 旋转/镜像、夹具/压料、重定位、坡口、共边；优先板规格、余料库存；同时优化穿孔数、切割路径与生产批次 | 支持主要 2D/3D CAD；列出 DXF/DWG/IGES/DSTV/STEP 等；输出型材切割机程序与任务/成本报告 | 模块化商业软件、联系销售。EULA 明确 evaluation/demo/trial 仅供非生产用途；不能把评估许可当正式生产授权 | [当前官方产品页](https://www.sigmateksystems.com/en/sigmanest)；[官方 EULA](https://connect.sigmanest.com/Legal/EndUserLicenseAgreementPdf?language=en-US) |
| 金属：Hypertherm ProNest 2025 / ProNest LT | 完整版列纱纹方向/夹持安全区、割缝补偿、引入引出、切序、余料与水刀疵点；Automatic Nesting、Nesting System Optimization、Common Line Cutting 等属于可选模块 | CAD/PDF/OMX/ORD 与 BOM 输入；CNC、DXF、OMX/ORD 及 PDF/Excel/CSV 报告输出 | 完整版支持 Windows 10/11 64 位，8 GB 最低/16 GB 建议，6 GB 磁盘，入口为 Request a demo。LT 按计划订阅，官网写 7 天试用后自动计费；各计划设备与输出有差异 | [ProNest 完整版](https://www.hypertherm.com/hypertherm/pronest/pronest-cadcam-nesting-software/)；[LT 订阅与试用条款](https://www.hypertherm.com/hypertherm/pronest/pronest-lt-cadcam-nesting-software/) |
| 木材/板材：HOMAG Cut Rite | 按速度或废料优化；材料库、余料、切割规则、零件优先级、标签、分拣与 CNC/锯机衔接；Cut Rite Nesting 与锯切模式要区分 | 多格式零件表；官方设备手册例举 Excel/woodWOP 输入；输出切图、机加工/设备数据、标签和成本/时间 | 官方比较表明确 PC 安装、按用户许可、一次性购买；V12 提供免费 30 天试用。intelliDivide 是另一个云端产品，不能混称本地版 | [当前官方页/30 天试用/许可比较](https://www.homag.com/en/software-detail/software/work-preparation/cut-rite-cutting-optimization-software)；[Nesting 输入与机床联系](https://www.homag.com/fileadmin/product/cnc/brochures/centateq-n-500/gantry-processing-centateq-n-500-en.pdf) |
| 木材/板材/棒料：Boole & Partners OptiCut 6 | 板材与棒料优化；纹理方向和跨零件纹理连续、修边、封边、预切、库存和可复用余料、翻板与条料分组 | 产生切割方案、技术/财务汇总、二维码/条码标签、ERP 导出；Pro-PP 及以上有 CNC 锯机后处理 | 提供官方 Free demo version；Windows 命令行可被其他软件调用；50/200/500 件与 Pro 无限件版本不同。demo 的保存/导出限制未在当前产品页讲清 | [官方产品/下载](https://www.boole.eu/opticoupe.php) |
| 通用异形：Boole & Partners OptiNest 3 | 处理刀具厚度、板边修整、数量、旋转/翻转、内孔、分组；可调搜索深度、平滑和传播模式；官方只透露 CalepiLib 函数库，未给可复现完整求解器 | 输入 DXF 闭合多段线或线/圆弧组合，输出保留裁片加工信息的 DXF 排料图；Pro-PP 支持 G-code | 官方 Free demo version；LT 限最多 10 顶点多边形，Std/Pro/Pro-PP 功能不同；应核实 demo 实际导出限制 | [官方产品/下载](https://www.boole.eu/optinest.php) |
| 玻璃：A+W Production / Shape Optimizer / iCut | Production 联合机台、工序、批次、架位/存储与切割优化；Shape Optimizer 将两种异形组合进包围矩形并考虑掰断与除膜；iCut 有余片管理与破片重排 | iCut 支持标准异形库、DXF 异形输入；Production 可输出生产文件与机台 NC 代码 | 官方为联系/demo；Shape Optimizer 属 Business Pro/Production 可用扩展。当前页未确认无需销售介入的本地独立试用及标准价格 | [Production](https://www.a-w.com/aw-clarity/aw-production/)；[Shape Optimizer](https://www.a-w.com/software/shape-optimizer/)；[iCut](https://www.a-w.com/aw-clarity/aw-icut/) |
| 玻璃：LiSEC GPS.opt / TSO | 订单输入包含复杂中空玻璃层构、镀膜、台阶、磨边余量；支持异形 TSO、花纹玻璃、竖槽架槽位分配与多接口 | 当前官方页确认多接口和 CAD/CAM 扩展，但未在成功检索的正文中详列每种输入输出格式，因此不补写格式 | 官方为询价/样本资料申请；未确认公开免费本地试用。检索系统有官方页正文，直接 open 多次遇到 405/超时，读取范围低于其他产品 | [官方 GPS.opt](https://www.lisec.com/solutions/software/detail/optimizations/opt)；[中文官方页](https://www.lisec.com/cn/%E8%A7%A3%E5%86%B3%E6%96%B9%E6%A1%88/%E8%BD%AF%E4%BB%B6/detail/production/opt) |

## 几个容易影响本地比较的事实

1. **自动排料模块和基础 CAD/CAM 授权可能不同。** ProNest 官方明确列出可选自动排料/优化模块；Optitex 安装指南要求独立相应许可。只看产品名不能保证试用包包含所需模块。
2. **有官网下载不等于开源、免费或可直接生产。** 富怡提供下载但产品页未说明无授权可用；OptiCut/OptiNest 写 free demo，但当前页没有完整 demo 限制清单；SigmaNEST EULA 明确试用为非生产用途。
3. **本地与云端要分开。** HOMAG 官网直接对照 Cut Rite 的 PC 安装与 intelliDivide 的云端使用；Lectra 当前云产品与旧本地 AccuNest/Diamino 有产品路线差异。
4. **图排得密与机器能完成裁切属于不同证据。** 金属官方页面详列割缝、微连接、刀路、碰撞；A+W Shape Optimizer 显式提到掰断和除膜；木材页面列切割规则/加工时间。仅比较面积利用率无法核实这些约束。

## 行业采用证据的可用边界

厂商案例可支撑“有公开点名的实施案例”，但不是独立行业调查。Lectra 发布的 [Cintas 案例](https://www.lectra.com/sites/default/files/2022-03/Cintas%20Customer%20Story.pdf) 描述对数百个 marker 同时比较手工与 AccuNest，并按款式选择流程；这也说明不能预设自动法对每个款式都更好。这里不转述其节料数值，不把它外推成平均效果。

A+W 发布的 [TGVI 案例](https://blog.a-w.com/uk/automated-production-processes-at-tgvi?hs_amp=true) 描述切割、X/Y 切序、余片回库、机台控制与后续分拣的联动；可用来说明工业部署的范围远大于平面摆放。该案例来自软件供应商，未做独立现场核验。

## 来源记录与核查结果

全部表内来源：组织作者、日期缺失时按 n.d. 处理；访问日期 2026-10-15。已确认其官方来源与页面所述功能；效能数字、最优性、市场地位、真实许可证交付与安装行为均未实测。特别保留以下核查限制：

- AccuNest Recommended Configuration 明确引用 AccuMark May 2022 Version 15.0，因此不能把旧页当 2026 最新系统要求。
- 富怡 V10 页面标 Win7/10，可能是历史兼容信息；本机 Win11 能否正常用、加密锁/网络授权形式均需官方确认。
- LiSEC 官方 GPS.opt 搜索返回正文可读，直接打开失败；该项降为“官方检索正文确认”，没有借第三方重新提升置信度。
- 不引用任何营销节料百分比作效果结论；不依据厂商的“leader / #1 / most advanced”用词排序。
- 没有将商业产品自称 AI 解释为某种明确模型；未核实源代码、优化器 API 或学术许可价格。
