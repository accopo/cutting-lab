# WASM 发布文件核对清单

更新：2026-10-16。原“需取得”清单中的核心文件现已取得并运行验证；完整行为和测试见 WASM_PLAN.md。

| 文件 | 状态 | 依据 |
| --- | --- | --- |
| static/vendor/packingsolver/packingsolver.js | 已取得，原件 | 固定官方构建；SHA256SUMS |
| static/vendor/packingsolver/packingsolver.wasm | 已取得，7,444,974 bytes，真实求解通过 | 11份WASM输入 + Session/cancel |
| static/vendor/packingsolver/packingsolver_worker.js | 已取得，原件 | 同次三件套；保留溯源 |
| static/vendor/packingsolver/LICENSE、dependency-licenses/ | 已保留 | 主许可与原生依赖许可 |
| static/solver-worker.js | 已实现 | 5类原生问题 + 1D kerf转换 + 5条JS基线，真实事件 |
| static/browser-runtime.js | 已实现 | fetch兼容、本机探测、静态队列、IndexedDB、取消、native preview |
| static/vendor/cutting-geometry.js | 已实现 | normalize/validate/validateTree，78项检查 |
| static/vendor/polygon-clipping-0.15.7/ | 已固定并保留许可/来源 | 浏览器加载 polygon-clipping.umd.js |
| static/vendor/robust-predicates-3.0.2/ | 已固定并保留许可/来源 | 浏览器先加载 orient2d.js |
| static/vendor/rectpack-LICENSE、rectpack-provenance.json | 已保留 | Apache-2.0，注明JS规则移植与修改 |
| static/vendor/browser-data.json | 已生成 | 15份公开/明确合成输入；不含用户jobs |
| static/coi-config.js、coi-serviceworker.js、vendor/coi-serviceworker/ | 发布主任务已取得并接入 | 0.1.7，commit 7b1d2a092d0d2dd2b7270b6f12f13605de26f214 |
| scripts/prepare_browser_data.py | 已实现并运行 | 只导出目录输入 |
| scripts/browser_baseline_oracle.py | 已实现 | 原Python基线对照，可重复生成 |
| tests/browser_wasm.test.cjs | 已实现并通过 | 11真求解 + Session中止 |
| tests/browser_runtime.test.cjs | 已实现并通过 | 20生命周期/API场景 |
| tests/browser_baseline.test.cjs | 已实现并通过 | 44组布局位置对照 |
| tests/browser_geometry.test.cjs | 已实现并通过 | 78项几何与原证书 |

发布验收尚需由发布任务在实际公网地址保存：URL、部署SHA、`crossOriginIsolated === true`、SharedArrayBuffer、实际 WASM 资源响应、从输入启动新任务的证书/校验、实时更新与停止、刷新后的历史恢复。Node验收不替代浏览器与托管平台验收。

原生仍执行 C++ 求解与本机 Python 校验。浏览器执行同一固定官方 C++ WASM；输入规范化、API、证书转换、独立几何、存储和五条透明构造基线为 JavaScript 实现。不会把 Python/Shapely 当作浏览器内隐含服务，也不会以静态结果替代求解。
