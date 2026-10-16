# 浏览器真实求解与兼容 API

更新：2026-10-16。本文件描述已经实现的浏览器适配器；公网部署及真实浏览器的跨源隔离验收由发布任务单独记录。历史架构草案中的“尚缺二进制、待实现”状态已由本版取代。

## 已实现结构

现有 `app.js` / `workspace-3d.js` 继续调用 `/api/…`。`browser-runtime.js` 在页面脚本之前安装同源 fetch 适配：先探测真实 `/api/health`；原生服务可用时转发原 API，并异步增强任务详情中的中间证书。没有服务时使用 IndexedDB 任务队列与 `solver-worker.js`。所有资源相对运行时脚本 URL 解析，支持 GitHub Pages `/cutting-lab/` 子路径。`?runtime=browser` 可强制静态模式，供独立静态服务器验收。

原生增强依赖失败不会阻断原 API。原生中间证书保持 `latest_raw_certificate`、`state`、`errors` 原样，并增加 `preview_result`、`preview_validation`、`preview_sequence`。增强结果明确标记本机原生来源，不写成 WASM 求解。

浏览器流程：

```text
fetch /api/jobs → normalize + 来源核对 → IndexedDB + 单任务队列
                       ↓
                 dedicated Worker
                       ↓
       官方 C++ WASM Session / 明确的 JS 基线
                       ↓
      真实 certificate → 统一 Result → 独立几何校验
                       ↓
        真实事件 + 快照存储 + 现有二维/三维视图
```

## 路线及语义

| UI 路线 | 实际计算 | 保留的关键约束 |
| --- | --- | --- |
| irregular | 官方 WASM irregular | 原轮廓、单件允许角度、间距、边距、矩形缺陷、原料库存 |
| rectangle | 官方 WASM rectangle | 整数尺寸、单件正交方向、缺陷；90° only 在 native 输入中交换尺寸并设 oriented |
| guillotine | 官方 WASM rectangleguillotine | 三阶段 exact、首刀方向、锯缝、缺陷、真实切割树独立校验 |
| onedimensional | 官方 WASM onedimensional | 整数长度、库存、需求、收益 |
| onedimensional-kerf | 官方 WASM onedimensional + 输入/证书转换 | 每件长度加 kerf，末件也计一刀；证书恢复成品长度并生成对应切口 |
| box | 官方 WASM box | 六种轴置换、单件方向、整数三维尺寸、重量及容器最大总重量 |
| ffd-1d / bfd-1d | JavaScript 稳定递减贪心 | 与 Python 基线相同排序、选根规则及逐件尾部锯缝 |
| shelf | JavaScript 列式基线 | 原轮廓允许角度、包围盒列式排布、间距、边距；能力范围与原实现一致 |
| rectpack-maxrects / rectpack-skyline | JavaScript 移植 MaxRectsBssf / SkylineBl | rectpack 0.2.2 的排序、正常/旋转候选顺序、稳定同分处理、BFF 选箱规则 |

共 6 条 WASM UI 路线对应 5 类原生问题；另有 5 条明确标识的 JavaScript 构造基线。公开样例仅作为输入，不从保存结果取出“答案”。不支持的约束由 normalize 拒绝，绝不通过静默删掉约束来得到结果。

重量优先：box 的 `weight`、`maximum_weight` / 输入别名 `weight_capacity` 传入 WASM；独立校验根据原始输入重量累计每箱，拒绝超重或伪造的结果重量。总重量限制不代表局部承重、支撑、稳定性或重心约束。JS 累计三维体积用 BigInt 检查，超过安全整数范围的输入明确拒绝。

## 实时过程、停止与恢复

WASM 使用官方 `Session.start()` / `poll()` / `stop()`；约 100 ms 读取一次真实回调。初始化单列 `initialization_elapsed_s` / `phase=initializing`，`elapsed_s` 在 Session 真正开始后计时，加载不占用户求解预算。记录官方 `output.Time`、`Solution`、界（若该事件提供）、独立复核的已放数量和目标值。尚未排全的 bins/strip 候选不填伪造完整目标值；knapsack 允许部分需求。初始 `certificate = null` 且 `NumberOfItems = 0` 是真实空解事件，不当成有布局。

`progress.events[]` 最多 200 条，包含 sequence、elapsed_s、elapsed_wall_s、placed_pieces、required_pieces、objective_value、bound_value、geometry_pass、full_demand、source 和真实证书 SHA-256。`latest_sequence` 是最近事件；`preview_sequence` 是画布布局真正对应的事件。仅已独立校验且非空的布局可成为 `preview_result` / `best_result`。事件被截断时增加 `dropped_events`。快照另存 IndexedDB，可按任务与序号取回。

JavaScript 构造基线只报告已实际放置的中间状态，source 为 `javascript-constructive-state`，不声称持续优化。无新解时继续显示已用时间及最近方案，不合成算法百分比，不插值制造优化轨迹。

停止先发送 `stop`，保留已验证最佳解；到清理宽限期仍未结束则 `Worker.terminate()`。每个任务拥有独立 Worker 与代号，旧 Worker 的迟到消息不能覆盖新任务。计时器终结与事件存储串行。排队任务可直接取消。刷新后运行中/排队任务恢复为 cancelled，并保存此前实际收到的最佳解；不会声称后台仍在运行。IndexedDB 不可用时静态求解明确报错，原生模式仍可使用。存储失败单列错误，不报告“已可靠保存”。

## API 兼容面

- `GET /api/health`、`/api/catalog`、`/api/datasets/{id}`。
- `GET /api/jobs` / `/api/jobs/{id}`，`POST /api/jobs`（`{problem}`），`POST /api/jobs/{id}/cancel`。
- 浏览器额外支持 `GET /api/jobs/{id}/events?after={sequence}` 与 `/api/jobs/{id}/snapshots/{sequence}`。
- `window.CuttingBrowserRuntime.ready()`、`getMode()`、`subscribe(callback)`、`getSnapshot(jobId, sequence)`；每个浏览器事件另发 `cutting:progress` DOM event。
- 保留 Response 的 ok/status/json/text；异源请求与非 API 资源交给原 fetch。
- 输入 JSON 上限 2 MB、待完成任务上限 10、单队列。输入原快照、规范化输入、native instance、真实原证书、实际输出与独立校验结果保留。
- `browser-data.json` 仅导出 15 份公开历史/明确合成样例，来源、单位及派生场景语义保留，不导出本机 jobs 或用户数据。

## 独立几何校验

`vendor/cutting-geometry.js` 独立于求解器，不信任其 feasible、计数、面积、重量或 cut_tree_validation。使用固定的 polygon-clipping 0.15.7 和 robust-predicates 3.0.2。

二维验证简单多边形、旋转后原形与结果形的对称差、真实交集面积、线段最短距离、边界/缺陷、允许方向、数量和库存。正交旋转三角函数归零规则与 Shapely 对齐。polygon-clipping 在极近接触边界抛异常时，使用保留原坐标的独立耳切三角剖分与三角半平面求交备用算法；不改用包围盒/同面积替代形状检查，也不粗化几何。数值容差由 validation 明示。

三维验证原尺寸的轴置换、边界、正体积重叠、数量、库存和原始重量累计。一维检查每件与末件尾刀、零宽刀、整数占用区间和刀缝对应。贯通路线必须带真实 `cut_tree`，重新检查树连接、循环、父子包含、交替贯穿、三阶段、兄弟间锯缝及零件叶节点对应。根节点 TYPE 是原料类型，不当作零件。

`geometry_pass` 只描述当前布局约束；`full_demand` 单独报告是否排满；`pass` 对非背包问题还要求完整需求。几何通过不等于全局最优或工业加工认证。

## 官方构建与隔离

官方上游固定提交 `649fd65233ee93f50b69871f197779ace46db9f5`，上游成功工作流 run `38660278943` 的 `site` artifact；发布仓库 CI run `38856115455` 取得三件套。文件已在 `static/vendor/packingsolver/`，且 Node 已实际实例化和求解。

- packingsolver.js：`27a920820ebd0f537466843f83cd026946ece227e92f4ba34c9967cc4c6fd5a3`
- packingsolver.wasm（7,444,974 字节）：`2b9acda0c13db8c2e75e8cff4d4658d6770b5015fdd2a7c5ac4b1dd8d860924e`
- packingsolver_worker.js：`6d57dd55c1fee9de7f2cad368c5cb3a8273e2966f5ebcf165879afb754211ea7`

主适配 Worker 为本项目 `solver-worker.js`；官方 worker 原件保留作构建溯源。C++ 内核及 loader 未修改。Emscripten 6 在 Worker 中以 self.location.href 创建名为 em-pthread 的线程。适配 Worker 对该名字只 import 官方 loader，不安装普通 solve handler；否则线程池会停在初始化。当前官方 WASM 是 pthread 构建，必须跨源隔离且可用 SharedArrayBuffer。仅改 optimization_mode 为 sequential 不能绕过 Session 自己的线程。缺隔离会明确失败，绝不降级为假求解。

GitHub Pages 使用同源 `coi-serviceworker.js` 0.1.7、固定 commit `7b1d2a092d0d2dd2b7270b6f12f13605de26f214` 及独立 `coi-config.js`。首次加载需要 service worker 接管并重载；最终必须在真实公网 origin 核对 `crossOriginIsolated`、SharedArrayBuffer、WASM 网络请求、真实任务和停止。若改其他托管平台，应使用其经文档确认的 COOP/COEP 配置；没有确认任何名为 WorkerHeaders 的接口。禁止以“构建成功”替代线上隔离与求解验收。

WASM 参数接口只接收 `optimization_mode`、`time_limit`、`verbosity_level`。Python 的 `memory_limit_megabytes=2048` 未移植为不存在的 JS 选项；浏览器实际受 WASM 构建和浏览器资源上限约束。

## 已完成验证及可复现命令

在项目根目录执行：

```powershell
node --check static/browser-runtime.js
node --check static/solver-worker.js
node tests/browser_wasm.test.cjs
node tests/browser_runtime.test.cjs
# baseline oracle 需项目原生 Python 环境（Shapely/rectpack）
python scripts/browser_baseline_oracle.py
node tests/browser_baseline.test.cjs
node --test --test-reporter=spec tests/browser_geometry.test.cjs
```

2026-10-16 实测：

- 11 份真实 WASM 样例：Shirts 99/99、metal 23/23、leather 24/24、paper 52/52、wood 24/24、glass 17/17、两类一维各 36/36、box mixed 24/24、box weight 24/24（三箱）、box value 7/12（背包允许部分）。全部独立 geometry_pass=true。每例 time_limit=1 秒；仅是测试实例，不承诺工业性能。
- 真实 Session 收到 7 次回调，取得 Shirts 99 件方案后 stop，正常结束并保留候选。回调数与耗时允许随执行机器变化。
- 44 组 JS/Python baseline 对照：40 组确定种子的 MaxRects/Skyline 随机输入，加 shelf 与两类一维，逐件箱号、ID、方向与位置一致。
- 20 组运行时场景：项目子路径、目录、单队列、真实候选存储、取消保留、迟到消息、强制终止、历史恢复、来源篡改、非法输入、原生无依赖回退、原生证书增强/失败与字段保留、快速 ready/慢存储竞态、启动存储失败、存储失败时仍取消、初始化期间取消、pthread 分支转发。
- 几何测试 78 项：负例、历史真实证书与本轮 11 WASM 证书。包括原形替换、凹形、超重、方向、树结构、末刀及数值内核备用路径。

浏览器补充验收（发布主任务 CUA 回执）：在独立静态服务器 `http://127.0.0.1:8768/?runtime=browser` 经 COI 接管重载后，真实 WASM Shirts 10 秒求解完成，99/99 件，21 次真实引擎事件、6 份轮询读取布局，目标曲线约 68.33 → 63.87；console 无 error/warn。这验证了 `em-pthread` 转发修复在实际浏览器生效。公网 GitHub Pages origin 仍须另验收，不由本地结果推断。

输出证据在 `test-artifacts/browser/`。这些求解结果仅用于回归测试，不进入静态运行时数据包。

## 官方来源

- [PackingSolver 固定源码](https://github.com/fontanf/packingsolver/tree/649fd65233ee93f50b69871f197779ace46db9f5)
- [上游 WASM workflow](https://github.com/fontanf/packingsolver/actions/runs/38660278943)
- [coi-serviceworker 固定源码](https://github.com/gzuidhof/coi-serviceworker/tree/7b1d2a092d0d2dd2b7270b6f12f13605de26f214)
- [rectpack 官方仓库](https://github.com/secnot/rectpack)，移植规则来自本地固定安装 0.2.2；Apache-2.0 license 与修改说明随文件保留。
- [polygon-clipping 官方仓库](https://github.com/mfogel/polygon-clipping)，[robust-predicates 官方仓库](https://github.com/mourner/robust-predicates)。固定发行归档、哈希和许可证见对应 vendor 目录的 PROVENANCE.md。
