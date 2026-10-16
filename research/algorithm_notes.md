# 裁切减废：算法、开源实现与公开实例证据

检索日期：2026-10-15（Asia/Shanghai）。范围：服装布料、皮革、钣金、木板、玻璃的二维裁切，并以一维下料作对照。只纳入作者论文、作者代码、官方文档和机构数据页。此文件为快速技术证据清单；没有安装软件、运行 benchmark，表中性能均为作者报告，不是本地复现结果。

## 问题定义应先分开

| 问题 | 输入与目标 | 贴近的业务 | 主要区别 |
|---|---|---|---|
| 1D cutting stock / bin packing | 原料长度、目标长度和数量；少用原料、少废料或低成本 | 钢管、型材、木条；卷材分条的部分子问题 | 不含衣片轮廓几何；背包、动态规划、模式选择/列生成、树搜索等路线不能直接替代衣片排料 |
| 2D rectangle guillotine | 矩形零件、板材；允许整条从边到边的切割，可能限制切割阶段 | 板锯木工、部分玻璃加工 | “排得下”还必须“按设备规则切得出”；要记录锯缝、修边、切序与纹向 |
| 2D irregular strip packing | 固定幅宽，放下全部不规则衣片，最小化使用长度 | 成卷布料、服装排唛/排料 | 最贴近老师提出的布料问题；裁片数量和允许角度必须固定 |
| 2D irregular finite-bin packing | 已有有限板/皮张及不规则零件；少用板、低总成本或满足需求 | 钣金、皮革、余料再用 | 皮张或余料可是不规则容器，不能只截取最小外接矩形当作可用材料 |

四类问题可以共享几何和搜索思想，但不能混合排行榜。PackingSolver 官方问题/目标文档明确区分一维、矩形贯通切、不规则形状以及 bin packing/open dimension 等目标；其一维和贯通切内部算法文档分别给出动态规划、树搜索与列生成示例。[项目与目标](https://github.com/fontanf/packingsolver)、[一维算法](https://fontanf.github.io/packingsolver/internals/onedimensional.html)、[贯通切算法](https://fontanf.github.io/packingsolver/internals/rectangleguillotine.html)。

服装还要区分 grain（丝缕方向）、nap（绒向/单向图案）、正反面/镜像、条格对齐、成套数量、缝份、刀间隙和多层铺布。把允许旋转从 0/180 改成任意角度，可能仅仅放松了生产约束；更高利用率不能自动视为算法进步。具体工艺约束需要企业/老师确认，这里不替任何真实面料指定角度。

## 八组直接可查的来源

### 1. SVGnest：易读的 NFP + 遗传算法基线

Qiao, J. (n.d.). *SVGnest: A browser-based vector nesting tool* [Computer software]. [作者仓库](https://github.com/Jack000/SVGnest)。

- 本质：NFP（No-Fit Polygon，描述碰撞禁放区域）/Inner-Fit Polygon 负责几何可行放置；遗传算法搜索零件插入顺序与旋转，初始化含 first-fit-decreasing 思想。曲线会折线近似。
- 许可与状态：作者仓库明确 MIT；README 算法、旋转、间距和曲线误差配置已读。可作可解释、可修改的传统基线。
- 边界：README “与商业软件相当”的说法没有足够的公开、统一预算实验支撑本次用户场景，不采纳为结论。任意轮廓功能也不能证明具备完整服装生产约束。

### 2. Deepnest：SVGnest 路线的桌面/CNC入口

Qiao, J. (n.d.). *Deepnest* [Computer software]. [原作者仓库](https://github.com/Jack000/Deepnest)、[原官网](https://deepnest.io/)。另有独立社区延续：[deepnest-next/deepnest](https://github.com/deepnest-next/deepnest)。

- 原作者 README 明确其基于 SVGnest，并把计算敏感部分移至 C，增加共边合并、DXF 转换、复杂路径近似。它的名称不等于采用深度学习。
- 社区版 README 当前主许可 MIT，并列出额外依赖许可；原项目与社区分支必须分别记录版本来源。可用于本地导入/导出体验与可视化比较。
- 边界：共边合并主要服务激光/绘图等工艺；是否适用于多层布料刀切，应由裁床/工艺验证。未安装，也未验证任何转换服务或最新安装包。

### 3. PackingSolver：跨行业统一基线框架

Fontan, F., & contributors. (n.d.). *PackingSolver* [Computer software]. [作者仓库](https://github.com/fontanf/packingsolver)、[官方文档](https://fontanf.github.io/packingsolver/)。算法论文入口：Fontan, F., & Libralesso, L. (2020). *An anytime tree search algorithm for two-dimensional two- and three-staged guillotine packing problems*. [作者预印本](https://arxiv.org/abs/2004.02603)。

- 当前 MIT；C++、CLI、Python 与浏览器入口都在官方 README 中。覆盖 1D、矩形、贯通切、不规则形状；后者公开列出不规则容器、旋转/镜像、孔洞、疵点和不同间距。
- [不规则内部算法](https://fontanf.github.io/packingsolver/internals/irregular.html)包含逐件树搜索、栅格 MILP、重叠消解局部搜索和面积松弛界；不同算法支持不同目标。
- 边界：支持某一约束不等于所有算法/目标组合都完整支持，更不等于已证明最优。须按实际安装版本核对输入 API 和输出证书。

### 4. Sparrow：应优先比较的现代不规则条带启发式

Gardeyn, J., Vanden Berghe, G., & Wauters, T. (2025/2026). *An open-source heuristic to reboot 2D nesting research*. [作者论文 v4，2026-10-06](https://arxiv.org/html/2509.13329v4)、[作者代码](https://github.com/JeroenGar/sparrow)。

- 本质：逐渐缩短条带，把优化化为一系列固定尺寸可行性问题；暂时允许重叠，再用 guided local search / separation 消解碰撞。分 exploration 与 compression 两阶段；不是 SVGnest 的 NFP + GA 重命名。
- 代码 MIT，依赖 jagua-rs 几何引擎。作者提供十个新增跨行业实例及实验结果，可作强基线；论文的优秀结果仍需本地固定预算复现。
- 已读范围：问题定义、算法结构、开源实现说明、真实实例与未来方向。作者明确指出同类重复零件可形成紧凑重复组合，而当前方法缺乏有效重复这些组合的机制（§12）。

### 5. jagua-rs：几何后端，不能当作优化器冠军

Gardeyn, J., Vanden Berghe, G., & Wauters, T. (2025). *Decoupling geometry from optimization in 2D irregular cutting and packing problems: An open-source collision detection engine*. *INFORMS Journal on Computing*. [DOI](https://doi.org/10.1287/ijoc.2024.1025)、[作者实现与说明](https://github.com/JeroenGar/jagua-rs)。

- 定位是碰撞检测/几何状态维护引擎；项目当前为 MPL-2.0。作者 README 列出不规则容器、连续旋转、容器孔洞与质量区、最小间距及自定义 Hazards。
- 它支持在几何层表达疵点/禁放区，适合研究扩展；优化搜索需要 Sparrow 或自写策略。
- README 对随附 `lbf` 明确警告：仅为参考实现，不应用于真实优化。不能用其差结果代表该引擎或整个传统算法路线。
- 核实范围：作者仓库/许可与 DOI 字符串已核对；出版商 DOI 页面本次工具不可访问，卷页未核实，故不补造书目信息。

### 6. 2026 PoT/RL：已有开放代码，但还不能取代强启发式

Lehuger, A., & Henon-Just, G. (2026). *Geometry-Aware Reinforcement Learning for 2D Irregular Nesting* (arXiv:2606.10611v3). [最新版全文，2026-10-13](https://arxiv.org/html/2606.10611v3)、[作者代码 rl_nester](https://github.com/alehuger/rl_nester)、[MIT 许可](https://raw.githubusercontent.com/alehuger/rl_nester/main/LICENSE)。当前 arXiv 标注 TMLR under review。

- PoT 轮廓编码 + PPO + NFP 引导位置，属于学习改善已有布局。任务为 4/8 件、宽高可变化、近自由旋转的包围框优化，主要动机是 PCB；不能直接当固定幅宽衣片实验证据。
- v3 Table 1：P4 利用率 PoT 81.18%、Sparrow 81.07%；P8 为 81.79% 对 85.19%。学习法仅小规模略胜，大规模仍落后。
- 官方代码现已开放，旧 v1 的“发表后开放”不能代表当前状态。README 要 Python 3.12、CUDA、CGAL，权重/NPZ/特定 Linux wheel 在作者 Drive；只确认链接存在，未下载、未验证可运行性或数据包许可。故先列为后续路线。

### 7. ESICUP / OR-Library：公开基准与明确许可

ESICUP community. (n.d.). *ESICUP Cutting & Packing Datasets* [Data set]. [官方仓库](https://github.com/ESICUP/datasets)、[CC0 1.0 LICENSE](https://raw.githubusercontent.com/ESICUP/datasets/main/LICENSE)、[不规则数据目录说明](https://raw.githubusercontent.com/ESICUP/datasets/main/2d_irregular/README.md)。[原官网](https://www.euro-online.org/websites/esicup/data-sets/)已明确迁移到该仓库。

- 服装来源：albano、dagli、mao、marques、shirts、swim、trousers；人工来源：jakobs、shapes（blaz 另称 SHAPES2）。不能把人工多边形统称真实衣片数据。
- [gardeyn 新实例说明](https://raw.githubusercontent.com/ESICUP/datasets/main/2d_irregular/gardeyn/README.md)提供十个服装/钣金/CNC/船舶/印刷实例，各有 90° 与连续旋转版本；应该分开报告。
- OR-Library 的[官方法律声明](https://people.brunel.ac.uk/~mastjjb/jeb/orlib/legal.html)明确 MIT；[二维非贯通切页面](https://people.brunel.ac.uk/~mastjjb/jeb/orlib/ngcutinfo.html)是矩形长宽实例，适合规则板材对照，不能替代不规则衣片。
- 转换格式可从[作者维护 OR-Datasets](https://github.com/Oscar-Oliveira/OR-Datasets)取得，根许可 MIT；保存原来源和许可，避免只留下二次格式。

### 8. GarmentCodeData v2：衣片几何扩展来源，非现成排料排行榜

Korosteleva, M., et al. (2024). *GarmentCodeData: A Dataset of 3D Made-to-Measure Garments With Sewing Patterns*. ECCV 2024. [作者项目页](https://igl.ethz.ch/projects/GarmentCodeData/)、[ETH v2 数据与 CC BY 4.0 权利信息](https://www.research-collection.ethz.ch/items/9d16a4da-0d30-4963-8842-af20fcf82899)。

- 作者提供 115,000 个合成衣服数据点及缝纫纸样，衣型与体型覆盖更广；v2 许可已由 ETH 数据页确认。只需排料时应优先拿纸样文件，无须下载全部 3D 渲染资产。
- 边界：这是合成纸样/仿真数据，不是企业裁床日志，也没有自动提供统一幅宽、grain、铺布层数和最优排料答案。做 nesting benchmark 需要先固定这些协议，并明确曲线近似、单位与缝份处理。

## 输入兼容性和可复现性实查

Sparrow 当前 README 写 0.3.0 使用 jagua-rs 1.0，旋转字段为 `orientation.rotation`；输入中的孔洞等约束也需逐项确认，不能把 jagua-rs 所有能力都等同为 Sparrow CLI 已完整支持。README 已有迁移提示。[当前 README](https://github.com/JeroenGar/sparrow)。

本次直接读取仓库数据发现：[swim.json](https://raw.githubusercontent.com/JeroenGar/sparrow/main/data/input/swim.json)已使用新 schema，旋转为 0/180；而 [jakobs1.json](https://raw.githubusercontent.com/JeroenGar/sparrow/main/data/input/jakobs1.json)仍显示旧 `allowed_orientations` 字段。ESICUP gardeyn 说明示例也仍用旧字段。可能是文件迁移/抓取版本差异；本地必须记录 commit、原文件 hash、转换脚本与转换后 hash，不能无检查地把全部数据扔进最新二进制。

对算法公平比较的最小协议：同一轮廓、幅宽、数量、角度、镜像规则和间距；固定墙钟预算与 CPU/线程数，随机算法多 seed；输出独立检查重叠、越界、禁区、数量满足；同时报告长度/利用率、运行时间、不可行率。小规模可增加下界或精确求解作为校核。产业节料率必须有企业当前排料或商业软件的同输入基准，不能从公开实例直接外推。

## 提供给主代理的研究候选，不作为新颖性裁决

1. **疵点检测到安全排料的闭环**：已有 PackingSolver 疵点、jagua-rs 质量区说明“加一个禁区”本身不足以成为创新。可考虑检测误差/标定误差下的安全边界、不同衣片部位的可接受质量、漏检风险与材料利用率的权衡；需要有实测空间坐标，图像框不能直接当毫米裁切禁区。该条为本次证据后的研究假设，未验证效果。
2. **grain/单向图案与多订单配套**：限定真实可生产方向、尺码和完整套数，再优化批次混排、换床和交期；首先验证现有求解器基线是否已经足够好。不能只放松角度或丢弃难排衣片来宣称省料。该条为研究候选，尚未完成针对性新颖性检索。
3. **余料的未来价值**：从单次最高填充率拓展为有限余料库存与下一批订单可复用性；应同时评价剩余形状、后续可用率、库存占用和刀路代价。已有 bin packing with leftovers，不能把“考虑余料”概念本身宣称首次。
4. **重复模块与强基线协同**：Sparrow §12 明确提出同类零件重复紧凑组合的局限，是可追溯的算法切入口。可尝试先学习/发现可复用组合，再交给现有全局排料器；是否优于传统方法仍要在允许相同角度、相同总预算下比较。

## 检索和核实记录

- 关键检索：SVGnest NFP genetic algorithm；PackingSolver irregular/guillotine；Sparrow jagua-rs；Geometry-Aware Reinforcement Learning for 2D Irregular Nesting；ESICUP/Jakobs/SHAPES license；GarmentCodeData license。渠道为通用网络检索后回到作者/机构原页，没有采用论坛、营销排行榜或二手综述数字。
- 文献版本：Sparrow 用 v4（2026-10-06）；PoT/RL 用 v3（2026-10-13）。RL v1 与 v3 的结果、训练预算和开放状态不同，最终正文不得混用。
- 证据级别：软件功能/许可已由官方材料核实；论文表现为作者计算实验报告，未独立复现；研究机会为读者推断。临床 I–VII 层级不适用于求解器优劣裁决，因此不据此给出虚假的“一级科学证据”。
- 非系统综述：没有完成全数据库穷尽检索、S2/Crossref 全量元数据/撤稿核验或所有代码依赖审计；没有把本清单称为全面文献综述。对论文仅检查本任务相关章节，不据未读范围判断缺点。
- 软件来源的维护者也报告自身性能，存在自评偏差可能；本次未发现应据此排除项目的证据，但需要本地统一评测。RL 是当前 under-review 预印本，不能标成已发表同行评审论文。
