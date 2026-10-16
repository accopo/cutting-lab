# 裁切实验室

中文裁切、排料和三维装箱研究工作台。提供公开历史基准与合成行业实例、二维轮廓绘制、长方体参数建模、真实求解、独立校验以及方法报告。

> 2026-10-16：新版集成中。三套 UI 方向已供用户审阅，尚未选定。此目录的新增后端能力已做专项验证，最终前端、实时画布、GitHub 公开仓库和在线演示仍待整合与发布。

## 已有核心能力

- 服装、皮革、钣金、木板、玻璃、纸张、型材和三维物流场景。
- PackingSolver 异形、矩形、贯通切割、一维与三维求解；rectpack MaxRects / Skyline；包围盒货架基线。
- 新增逐件计锯缝的一维原生路线、FFD 与 BFD；新增三维容器总重量约束。
- 真实几何与数量核验；来源标记、导入导出、任务记录与取消。

## 本地运行

需要 Python 3.12 或更高版本。建议建立独立虚拟环境，再安装 `requirements-lock.txt`，运行 `python server.py` 并打开 `http://127.0.0.1:8766/`。本地服务只监听回环接口。任务存入忽略版本控制的 `jobs/`。

网页基于静态 HTML/JavaScript。现阶段真实求解通过 Python 本地 API；浏览器 WebAssembly 路线正在按 `docs/WASM_PLAN.md` 接入，尚未发布。

## 可复核证据

- `qa/weight_results.json`：容器总重量专项检查。
- `qa_1d/results.json`、`qa_1d/tamper_checks.json`：三条一维锯缝路线和证书篡改检查。
- `static/reports/rectangle_comparison.json`：同一合成矩形实例的三路线单次比较。
- `research/`：行业软件与算法官方来源记录；`static/reports/`：供网页消费的结构化报告。

这些测试确认指定输入和约束下的实现行为，不代表工厂节省率或一般最优性。五个公开纺织数据集是历史排料轮廓，物理单位未知，不能直接作为可缝制服装 CAD 纸样使用。其来源和许可见 `data/SOURCE_AUDIT.md` 与 `data/LICENSE-ESICUP`。
