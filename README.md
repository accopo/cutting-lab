# 裁切实验室 · Cutting Lab

中文裁切、排料与三维装箱研究工作台。用公开轮廓与合成行业实例，探索材料、方向、工艺约束和算法之间的关系。

**[打开在线实验室](https://accopo.github.io/cutting-lab/)** · [使用说明](使用说明.md) · [行业研究](research/industry_reports.md) · [数据来源](data/SOURCE_AUDIT.md) · [实际分发清单](data/DISTRIBUTION_SOURCE_AUDIT.md)

## 网页功能

- **二维排料**：五组公开纺织历史基准和多行业示例；旋转、材料尺寸、间距、留边、刀缝与矩形禁排区。
- **自定义绘图**：点选绘制、拖动顶点、编辑坐标和数量、撤销/重做，加入真实问题计算。
- **三维建模与装箱**：长方体容器和零件、数量、价值、朝向及重量；旋转观察、点选、切换容器和保存视图。
- **真实求解过程**：运行后自动切换到实时预览；展示实际中间方案、用时、目标曲线和数量，可回看与停止。快速基线不生成假轨迹。
- **行业报告**：八行业的约束、方法、软件资料、研究问题与官方链接，从报告可直接载入示例。
- **实验记录**：保存参数与结果、导入导出方案、SVG/PNG、同条件结果比较。

## 计算路线

| 路线 | 用途 | 在线实现 |
| --- | --- | --- |
| irregular | 凹/凸多边形排料、缺陷和方向约束 | 官方 PackingSolver WASM |
| rectangle | 自由矩形排放 | 官方 PackingSolver WASM |
| guillotine | 三阶段贯通切割、锯缝 | 官方 PackingSolver WASM |
| onedimensional | 一维定长材料 | 官方 PackingSolver WASM |
| onedimensional-kerf | 每件成品尾部计锯缝 | 官方一维求解器 + 长度变换 |
| FFD / BFD | 一维递减贪心基线 | JavaScript 移植 |
| shelf | 包围盒货架基线 | JavaScript 移植 |
| MaxRects BSSF / Skyline BL | 矩形构造基线 | rectpack 规则移植 |
| box | 三维长方体装箱、总限重 | 官方 PackingSolver WASM |

在线计算在当前设备的 Worker 中运行，数据和历史保留在当前浏览器。关闭标签页会停止该页计算；清理站点存储会移除浏览器历史。首次访问需要下载约 7.4 MB 的 WASM 并建立线程隔离，可能自动刷新一次。初始化时间与实际求解预算分开；同一设备、浏览器配置和站点地址使用各自历史。无痕模式、存储配额或禁止服务工作线程可能影响运行，重要结果请导出。建议支持 WebAssembly 线程与 SharedArrayBuffer 的现代桌面浏览器。

Python 本地版使用相同网页、原生 PackingSolver、rectpack 与 Shapely，任务单独运行并保存到 `jobs/`，关闭网页本身不会停止本地服务中的求解。两种运行时的版本、数值容差和机器性能可能不同，不承诺相同时间内产生相同布局。

## 本地启动

Python 3.12 或更新版本，推荐 3.13：

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-lock.txt
.\.venv\Scripts\python server.py
```

打开 <http://127.0.0.1:8767/>。Windows 配置好环境后可双击 `启动裁切实验室.vbs`。服务仅监听回环接口；用 `停止裁切实验室.ps1` 停止本项目拥有的服务。

纯浏览器版也可以用普通静态服务启动：

```powershell
python -m http.server 8768 --bind 127.0.0.1 --directory static
```

访问 <http://127.0.0.1:8768/?runtime=browser>，强制使用浏览器求解及同源线程隔离脚本。

## 能力和证据边界

- 公开纺织数据是历史排料轮廓，物理单位未知，没有完整尺码、缝份、丝缕或缝合对应关系，不能直接当作可生产服装纸样。
- 多行业示例主要是合成数据。利用率改善不等于工厂节省率，单次限时启发式结果不证明全局最优。
- 间距与刀缝是不同约束。一维锯缝采用保守模型：**每件成品尾部预留一刀，末件也计入**，原料容量不变；不含端头修边、夹持、斜切或余料库存。
- 三维支持长方体和总限重；未实现任意网格、重力支撑、局部堆叠承重、重心或装卸顺序。
- 天然皮张边界、孔洞、纹理连续、条格匹配、共边切割和设备刀路不能由一般几何可行性推断。
- 保留独立验证状态，区分中间候选、完整订单、部分背包解和停止状态。

专项证据位于 `qa_1d/`、`qa_progress/`、`qa/weight_results.json`；浏览器计算说明与回归命令见 [WASM_PLAN.md](docs/WASM_PLAN.md)。同输入矩形比较在 `static/reports/rectangle_comparison.json`。部署及公开验收流程见 [PUBLISHING.md](docs/PUBLISHING.md)。

## 构建与许可

`python scripts/audit_distribution.py` 核对公开输入；`python build_site.py` 校验依赖和源数据后，仅把静态应用与明确列出的公开许可、来源说明和 normalized 数据复制到 `dist/`，生成逐文件 SHA-256 的 build-manifest.json，不包含本地任务或 raw 研究下载。GitHub Actions 在 `main` 更新或手动触发后运行检查并部署 Pages；公网是否可用以实际部署与浏览器验收为准。

官方浏览器求解器固定为提交 `649fd65233ee93f50b69871f197779ace46db9f5`，取自上游构建 `38660278943`；校验值与许可在 `static/vendor/packingsolver/`。本地包固定为 `packingsolver==0.1.1184`。

原创代码采用 MIT，但含 rectpack 修改移植的 `static/solver-worker.js` 明确采用 Apache-2.0；第三方组件和数据保留各自许可，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。感谢 [PackingSolver](https://github.com/fontanf/packingsolver)、[ESICUP](https://github.com/ESICUP/datasets)、[rectpack](https://github.com/secnot/rectpack)、[Three.js](https://github.com/mrdoob/three.js) 及相关开源组件。
