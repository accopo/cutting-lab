# 公开纺织排料数据来源审计

核查日期：2026-10-15。发布分发说明更新于2026-10-16：本文件保留当时原始资料审计结论；本发布包仅分发 ESICUP XML 派生的 normalized 输入，不附带 raw 下载或 OR-Datasets 对照文件，详见 [分发来源核对](DISTRIBUTION_SOURCE_AUDIT.md)。

独立审计范围为 ESICUP 的 albano、dagli、shirts、swim、trousers 及其推荐的 OR-Datasets JSON 转换；未运行排料求解器。

## 结论

五组都被 ESICUP 官方说明列为**纺织工业来源的历史二维不规则排料基准**，适合建立排料算法基线。它们合计 53 种轮廓、按指定需求量共 265 片；每个实例是一个排料任务，不能把 265 片当作 265 个独立实验。

这些文件没有提供足以认证可缝制服装的完整纸样语义：没有可信的毫米/厘米标注、人体尺码、缝合对应关系、缝份、部件名称、放码规则或工艺单。SHIRTS、TROUSERS、SWIM 是历史实例名称，不足以把其中某个多边形正式命名为前片、袖片或领片。对本轮材料适当的称呼是“纺织/服装来源的公开排料轮廓数据”，不宜称为已验证可直接生产的真实纸样。

**关键版本问题：SWIM 的 ESICUP XML 与 TXT/OR-Datasets JSON 几何不完全相同。** XML 是整数坐标版本，而 TXT 和 JSON 保留小数；10 种形状中 8 种有几何差异。其余四组 XML 与 JSON 经平移归一后几何相同。数量和允许旋转角度五组全部一致。

## 仓库、许可和固定版本

| 来源 | 本次固定提交 | 仓库声明的许可 | 用途 |
|---|---|---|---|
| [ESICUP/datasets](https://github.com/ESICUP/datasets) | `154a8f006a8e72f65d734f2d1e36777f678f31f8` | 根 [LICENSE](https://github.com/ESICUP/datasets/blob/154a8f006a8e72f65d734f2d1e36777f678f31f8/LICENSE) 为 CC0 1.0 Universal | 社群维护的原始发布文件与来源说明 |
| [Oscar-Oliveira/OR-Datasets](https://github.com/Oscar-Oliveira/OR-Datasets) | `e2e151cf241ab97d860f657cbfe515232e7096d7` | 根 [LICENSE](https://github.com/Oscar-Oliveira/OR-Datasets/blob/e2e151cf241ab97d860f657cbfe515232e7096d7/LICENSE) 为 MIT，copyright 2018 Óscar António Maia de Oliveira | 统一 JSON 格式及逐形状 DXF |
| [JeroenGar/2d_irregular_converter](https://github.com/JeroenGar/2d_irregular_converter) | `834bca40621aa612ec2dc921fe45f5d949166fc4` | 本审计不推定独立代码许可 | 审阅转换源代码；没有安装或执行 |

上表是仓库实际声明，不扩展为对历史第三方材料权利的额外担保。历史审计的完整原始资料包涉及两仓库许可；本发布包仅分发 ESICUP 派生输入，保留其 CC0 文本和原作者参考文献，不分发 OR-Datasets 文件。ESICUP [2d_irregular/README.md](https://github.com/ESICUP/datasets/blob/154a8f006a8e72f65d734f2d1e36777f678f31f8/2d_irregular/README.md) 明确把统一格式转换指向 OR-Datasets，转换链有官方入口依据。

## 原始来源、格式及保留约束

幅宽列是数据的 `strip_height`，单位仅记作 **benchmark coordinate units**。XML 中对应板材多边形的 y 跨度。数值大小不能用来猜测 mm 或 cm。

| 实例 | 官方说明的来源与处理 | 原目录文件 | 种类 / 总片数 | 幅宽 | 每种形状允许旋转 |
|---|---|---|---:|---:|---|
| ALBANO | 纺织来源；E. Hopper 从 Albano 与 Sapuppo 1980 论文的样例布局扫描，使用多边形近似曲线 | PDF、XLS、XML、readme.txt | 8 / 24 | 4900 | 0°、180° |
| DAGLI | 纺织来源；E. Hopper 从 Ratanapan 与 Dagli 1997 论文的样例布局扫描；PDF说明为多边形近似 | PDF、XML、readme.txt | 10 / 30 | 60 | 0°、180° |
| SHIRTS | 纺织来源；Dowsland 等 1998 已使用，作者提供，Oliveira 等 2000 给出坐标 | PDF、TXT、XML、readme.txt | 8 / 99 | 40 | 0°、180° |
| SWIM | 纺织来源；Oliveira 等 2000 给出坐标；readme 宣称四舍五入，但各格式实际存在精度版本差异 | PDF、TXT、XML、readme.txt | 10 / 48 | 5752 | 0°、180° |
| TROUSERS | 纺织来源；Oliveira 等 2000 给出坐标 | PDF、TXT、XML、readme.txt | 17 / 64 | 79 | 0°、180° |

逐项原说明：[ALBANO](https://github.com/ESICUP/datasets/blob/154a8f006a8e72f65d734f2d1e36777f678f31f8/2d_irregular/albano/readme.txt)、[DAGLI](https://github.com/ESICUP/datasets/blob/154a8f006a8e72f65d734f2d1e36777f678f31f8/2d_irregular/dagli/readme.txt)、[SHIRTS](https://github.com/ESICUP/datasets/blob/154a8f006a8e72f65d734f2d1e36777f678f31f8/2d_irregular/shirts/readme.txt)、[SWIM](https://github.com/ESICUP/datasets/blob/154a8f006a8e72f65d734f2d1e36777f678f31f8/2d_irregular/swim/readme.txt)、[TROUSERS](https://github.com/ESICUP/datasets/blob/154a8f006a8e72f65d734f2d1e36777f678f31f8/2d_irregular/trousers/readme.txt)。

本次查看了五个原始 XML、三个可用 TXT、五个原始说明 PDF 的文字内容及五个 JSON。没有发现物理长度单位声明；SHIRTS、SWIM、TROUSERS 的 PDF 表头直接给出上述宽度和 0/180°。XML 的 `coordinatesOrigin` 为 `up-left`、`verticesOrientation` 为 `clockwise`；这些是坐标约定，不能解释为布纹方向或正反面标注。

## 转换代码与参数审计

审阅的代码为 [转换仓库 src](https://github.com/JeroenGar/2d_irregular_converter/tree/834bca40621aa612ec2dc921fe45f5d949166fc4/src) 下各实例的 `*Parser.java`、入口 `*Main.java`、`json/Shape.java`、`json/Item.java` 和 `general/Util.java`。

- ALBANO、DAGLI、TROUSERS 的转换读取 XML `lot/piece.quantity` 和引用多边形的 `segment.x0/y0`；SHIRTS、SWIM 读取 TXT 的 QUANTITY、NUMBER OF VERTICES、VERTICES。
- 五个转换器将允许方向写为常量 `[0.0, 180.0]`。本次逐项对比了原 XML 的 `orientation.enumeration.angle`，全部一致，未发现把 90°或连续旋转引入这些数据。
- 五组 JSON 的 `demand` 分别为 ALBANO `[2,2,4,4,4,4,2,2]`；DAGLI 十个 `3`；SHIRTS `[8,8,8,15,15,15,15,15]`；SWIM `[3,6,6,6,6,3,3,6,6,3]`；TROUSERS `[8,8,1,1,1,1,8,8,1,1,1,1,2,2,8,8,4]`。均与原 XML 一致。
- 五个转换器将幅宽写为上述常量，本次与 XML 板材 y 跨度核对一致。JSON 删除了 XML 板材的固定 x 长度，表达固定幅宽的条带排料；应明确本地实验的目标为最短使用长度。
- `Shape.java` 自动补上首尾闭合点。导入求解器时可去掉末尾重复点，但应保持多边形轮廓、数量和方向。负坐标是合法的局部坐标，不能按越界裁掉。
- JSON 中 DXF 是由多边形重新绘制导出的，并不是新增的工厂 CAD 原件。没有发现镜像授权、条格约束、刀缝、疵点或纸样缝合信息；不要为获得更高利用率自动放宽旋转或添加镜像。

## 几何版本核对

对每种形状，将 XML 和 JSON 多边形的包围盒左下角分别平移到原点，计算 Hausdorff 距离和对称差面积；未施加缩放、旋转或镜像。

| 实例 | XML 与 JSON 的几何结果 | 对解释的影响 |
|---|---|---|
| ALBANO | 8/8 完全相同，Hausdorff=0，对称差面积=0 | XML与JSON可互作几何核验 |
| DAGLI | 10/10 完全相同，Hausdorff=0，对称差面积=0 | 同上 |
| SHIRTS | 8/8 完全相同，Hausdorff=0，对称差面积=0 | 某些局部坐标平移不影响形状 |
| SWIM | 2/10 相同；0-based item 1、2、3、4、5、7、8、9 不同 | JSON/TXT小数版与XML整数版必须标记为不同变体 |
| TROUSERS | 17/17 完全相同，Hausdorff=0，对称差面积=0 | XML与JSON可互作几何核验 |

SWIM 的例子：item 8 的 XML 面积为 `151092`，JSON 面积为 `151589.41227110187`，单位均为 benchmark units²；该项归一后的 Hausdorff 距离约为 `1.66508284264594`。来源精度不同通常造成小幅几何差异，仍足以影响严谨的算法比较。TXT/PDF 包含 `26.962264 -299.698113` 等小数坐标，不能因 readme 的简短描述就再次把 JSON 四舍五入。

本轮最终选择：**五组统一以固定提交的 ESICUP XML 为主输入**，OR-Datasets JSON 只用于历史审计对照，不随本发布包分发；SWIM 明确标为 XML 整数坐标版本。所有算法应采用同一份输入、原需求量与 0/180°方向限制。本轮不报告与不同版本历史最优值的比较。将来做历史结果比较，须先查明原论文/程序使用整数版还是小数版。刀缝或边距若在后续实验中新增，应标记为派生场景，不能混入原始基准成绩。

## 原文参考文献

以下书目信息来自官方数据说明，原说明存在 Sapuppo/Sappupo、Bennell/Bennel 等拼写差异，本审计不把仓库文字当作完整出版元数据验证。

1. Albano, A.; Sapuppo, G. (1980). Optimal allocation of two-dimensional irregular shapes using heuristic search methods. IEEE Transactions on Systems, Man, and Cybernetics, 10(5), 242–248.
2. Ratanapan, K.; Dagli, C. H. (1997). An object-based evolutionary algorithm for solving irregular nesting problems. ANNIE'97, vol. 7, pp. 383–388.
3. Oliveira, J. F.; Gomes, A. M.; Ferreira, J. S. (2000). TOPOS – A new constructive algorithm for nesting problems. OR Spectrum, 22, 263–284.
4. Dowsland, K. A.; Dowsland, W. B.; Bennell, J. A. (1998). Jostling for position: Local improvement for irregular cutting patterns. Journal of the Operational Research Society, 49, 647–658.

原始下载文件保留在原研究归档，未复制到本发布项目。本目录的 `download_manifest.json` 保留原抓取日期、固定 URL、源文件大小与哈希；其中 `raw/...` 是历史归档相对路径，不是本发布包中的文件路径。当前分发的 normalized JSON 与浏览器输入包另由 `distribution_source_audit.json` 核对并记录哈希。本审计不替代求解结果或独立可行性校验。
