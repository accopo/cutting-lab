# 原生中间解进度记录

`progress.py` 将 `OptimizeParameters.new_solution_callback(output)` 实际触发的 incumbent 保存为真实证书；没有补帧、插值或模拟求解过程。异形路线使用 JSON，矩形、贯通、一维、三维使用 CSV。FFD/BFD 与货架等无原生回调路线不会伪造过程。

每次回调在锁内同步读取仍然有效的原生 `output.solution`，写入临时证书，成功解析后原子替换为 `progress_certificate_NNNNNN.json/csv`；再原子更新 `latest_certificate.json/csv` 别名和 `progress.json` 清单。清单最多保留 200 条事件，成功发布后删除被淘汰的历史证书。每条记录包含 sequence、原生 elapsed_s、solution stats、search stats、证书格式、相对文件名与大小。单份证书和读取清单均设置 8 MB 上限。

快照使用清单指向的独立序号文件，不从可变的 latest 别名读取，因此不会把新证书和旧 sequence 拼在一起。`server.snapshot(id, detail=True)` 在任务任何状态下添加 `progress`，包括取消状态；嵌套的 `latest_raw_certificate` 包含 `sequence`、`format`、`filename`、`data`。JSON 的 data 为解析对象，CSV 的 data 为原始文本。浏览器适配器可根据格式映射，但应保留 `validation_status=native-intermediate-not-independently-validated`，直到独立校验完成。

一维逐件锯缝路线的原生中间证书使用变换后长度，`progress.model` 会明确标记 `certificate_lengths=finished_length_plus_kerf` 及 `kerf_per_piece`，后续展示须还原原始成品长度。最终结果映射与校验保持原流程。

只允许当前 `jobs_root` 的直属、16 位十六进制任务目录；只读取固定的 `progress_certificate_数字.json/csv` 文件名，验证序号/格式一致，拒绝路径穿越与指向任务外的符号链接。不把绝对证书路径返回网页。回调记录失败写入清单 errors、`progress_errors.json` 及 worker stderr，不传播进最终求解；如果文件系统与日志都不可写，则无法持久化诊断，最终求解仍继续。

取消采用现有进程终止机制，不清理进度文件。取消后的 `progress.state` 可能仍为 recording，这是落盘时的求解器状态；快照附带的 `progress.job_status` 才是当前任务生命周期状态。

运行验收：

```powershell
.\.venv\Scripts\python.exe test_progress.py
```

`results.json` 保存实际结果。验收涵盖 6 条原生路线回调、真实子进程运行期间解析、进程取消后保留、直接调用 server.snapshot、注入回调写证书失败后最终求解仍通过，以及有界留存/路径白名单。留存测试明确为对真实证书的存储回放 fixture，不计为真实算法中间解。测试不会启动 HTTP 服务或浏览器。
