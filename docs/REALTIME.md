# 实时求解接口

`GET /api/jobs/{id}` 的详细快照包含可选 `progress`。本机路线来自原生求解器 `new_solution_callback`；浏览器 WASM 路线来自实际 `Session.poll()` 回调；JavaScript 基线只记录实际放置状态。没有定时伪造的优化方案或算法完成百分比。

## 事件和布局

- `sequence`、`events[]`：真实事件序号、引擎经过时间、解统计和搜索统计，最多保留 200 项；截断计入 `dropped_events`。
- `latest_raw_certificate`：本机引擎最近真实证书的序号、json/csv 格式、相对文件名和内容。原始记录标记为尚未经过浏览器独立校验，该字段由增强层保留原样。
- `preview_result`、`preview_validation`、`preview_sequence`：浏览器适配层转换并独立复核后的可视布局、验证结果和实际对应事件。`latest_sequence` 可能已经前进到其他界更新，不能拿它替代布局序号。
- `source`：明确区分 native callback、WASM callback 与 JavaScript constructive state。原生增强结果不会被标成浏览器 WASM 求解。
- `errors[]`、`preview_error`、`storage_error`：分别保留求解记录、证书增强及持久化失败说明；依赖增强失败不阻断原生 API。
- `model`：原生一维计缝路线的长度包含 kerf，显示前恢复成品长度，并另绘每件尾刀，末件也计刀。

浏览器事件补充 `placed_pieces`、`required_pieces`、`objective_value`、`bound_value`。没有界时保持 null；非背包的部分需求候选不填伪造的完整订单目标值。几何可行与排满需求分开报告。画布可跟随最新方案或停留在实际收到的历史快照；轮询未读到的布局不会被编造为已保存画面。

## 初始化、停止、恢复

浏览器 `phase=initializing` 和 `initialization_elapsed_s` 表示内核冷启动；`elapsed_s` 从真正开始求解后计时，加载不消耗请求的求解预算。没有新方案时保留最近布局并显示继续搜索，不插值制造零件运动。

停止先通知 Session 或 JS 构造过程，再等待清理；超出宽限期则终止 Worker。状态保持 cancelled，已校验的最佳候选通过 `best_result` 或 preview 保留；首个候选尚未到达时不产生虚假成功方案。存储写入失败不能阻断停止。每个任务的 Worker 代号防止迟到消息污染下一任务。

浏览器中间证书和布局保存在当前 origin 的 IndexedDB，可由 `CuttingBrowserRuntime.getSnapshot(jobId, sequence)` 读取。刷新后未完成任务标为中断/停止，保留此前已保存的数据；关闭浏览器标签页不会让该页 Worker 继续执行。本机任务则在 Python 服务中运行，关闭页面不等于停止任务。两种历史存储独立。

## 证据

原生回调验收见 `qa_progress/results.json` 与其 README。浏览器适配、独立校验、真实 Session/停止以及故障注入测试见 `docs/WASM_PLAN.md`、`tests/browser_runtime.test.cjs` 与 `tests/browser_wasm.test.cjs`。本地静态 CUA 已实际观察到 Shirts 的实时改进布局；公网、最终界面与当前提交仍按 `docs/PUBLISHING.md` 验收，不由旧截图或 Node 测试推断。
