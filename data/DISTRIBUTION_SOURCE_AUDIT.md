# 发布包的数据分发说明

核对日期：2026-10-16。发布包包含五份 **ESICUP XML 派生的规范化 JSON** 和十份明确标记的合成教学场景。它不包含历史 raw XML/PDF/TXT 下载、OR-Datasets 对照文件、真实工厂订单或用户求解记录。

## 实际分发内容

| 内容 | 项目文件 | 静态站点中的用途 |
| --- | --- | --- |
| 五份规范化历史基准 | `data/normalized/{albano,dagli,shirts,swim,trousers}.json` | 供来源复核和下载；目录中的真实问题来自相同轮廓、数量与方向 |
| 浏览器目录输入 | `static/vendor/browser-data.json` | 五份公开基准 + 十份合成场景的应用格式输入，无求解结果 |
| 原始来源审计 | `data/SOURCE_AUDIT.md` | 2026-10-15 对历史 XML、TXT、JSON、PDF 的审阅结论 |
| 历史下载回执 | `data/download_manifest.json` | 固定上游提交、URL、原文件字节数和 SHA-256；不代表 raw 文件随包提供 |
| 当前分发核对 | `data/distribution_source_audit.json` | 本发布包规范化 JSON 与浏览器包的独立 SHA-256、文件大小、来源映射和逐项核对 |
| 数据许可 | `data/LICENSE-ESICUP` | 上游固定提交的 CC0 1.0 文本；原作者参考文献见来源审计 |

历史清单中的 `raw/...` 和规范化文件中的 `source_path` 都是当时原研究归档的路径标识。公开包不能通过该相对路径读取原文件；可按同条记录的固定 URL 访问上游版本。`source_sha256` 和应用 `source.sha256` 校验的是上游 XML 字节，**不是**规范化 JSON，也不是 browser-data.json。三者的哈希分开记录。

## 转换保留与单位

规范化数据提取 XML 的多边形顶点、需求量和允许角度，并保留源坐标约定及说明；应用目录再映射为 polygon、quantity、allowed_rotations。负坐标作为合法局部顶点保留，原始 0°/180°方向、需求和条带宽度没有因算法选择而放宽。规范化文件采用 UTF-8 / LF 文本编码，以便 Git 和静态构建中的字节哈希一致。

SWIM 明确采用 XML 整数坐标变体；它与 TXT/OR-Datasets 小数变体有几何差异。OR-Datasets 仅用于历史审计交叉比较，其 JSON、DXF 和许可文本没有作为本发布输入分发。五组物理长度单位均未知，保持 benchmark coordinate units，不能推断毫米或可直接生产服装纸样。

合成实例由 `catalog.py` 定义，用于说明异形、缺陷、贯通刀缝、一维尾刀和三维限重等能力，不代表企业订单。修改材料、需求、方向、间距、刀缝、缺陷或目标后，应用会标明派生场景；客户端提交的来源标签不会直接被信任。

## 自动核对

```powershell
python scripts/audit_distribution.py
python build_site.py
```

核对只读取本项目公开数据与源码，不下载、不求解。它验证：浏览器包与当前公开/合成目录一致；五份规范化来源 SHA/commit 与历史回执一致；轮廓顶点、需求量和允许方向逐项相同；输入包不含用户来源。构建在核对失败时停止，并将当前核对回执写入 `dist/data/distribution_source_audit.json`。

这证明本分发包的来源链和内容一致性，不重新证明上游原始扫描精度、物理单位、历史作者权利或工业可加工性。
