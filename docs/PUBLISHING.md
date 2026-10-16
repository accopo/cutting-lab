# 公开发布与构建验收

本文件说明如何验证发布候选，不代表某个公网地址已经部署成功。线上状态以成功的 GitHub Pages deployment、对应提交和真实浏览器检查为准。发布整理任务只修改文件、运行本地构建与测试，没有 push 或触发部署。

## 本地准备与已验证边界

```powershell
# 标准库即可执行，不下载数据、不调用求解器
python scripts/audit_distribution.py
python build_site.py
python scripts/verify_static_build.py
python -m unittest discover -s tests -p test_publication.py

# 实际计算回归，需要 Node.js；使用已随仓库保留的官方 WASM
node tests/browser_wasm.test.cjs
node tests/browser_runtime.test.cjs
node --test tests/browser_geometry.test.cjs
```

构建先检查实际运行依赖、官方求解器哈希、WASM 文件头、每份运行库许可证哈希与公开数据一致性。检查通过后清理本项目自己的 dist 目录，再复制 static 与公开说明白名单。项目外路径、符号链接和私有/研究路径会被拒绝。新增资源应同步加入 REQUIRED 或 HTML 引用检查；静态文件目录用于公共发布，不能存放用户订单或密钥。

`dist/build-manifest.json` 列出分发资源的字节数和 SHA-256；`dist/data/distribution_source_audit.json` 区分源 XML 哈希、规范化 JSON 哈希与浏览器输入包哈希。项目 LICENSE、第三方 notices、ESICUP CC0、normalized 数据和来源说明均随静态站点分发。raw 原始资料、jobs、测试证书、Python 环境及源码测试目录不进入静态包。

2026-10-16 本地构建检查通过：78 个文件（含两份构建控制文件），76 个条目有逐文件哈希；当时 HTML 中 13 处脚本/样式引用均可解析。实际大小约 10.4 MB。后续 UI 修改会改变文件数、大小和哈希，必须从最终提交重建，不复用该数字作为最终发布证据。

发布保护负例覆盖：浏览器包轮廓被修改、额外用户来源、normalized 源哈希被篡改、WASM 字节被修改、musl 许可缺失。任何失败应修复源文件后重建，不修改校验值掩盖文件变动。

## GitHub Pages 工作流

`.github/workflows/pages.yml` 在 main 更新或人工 workflow_dispatch 时运行。它使用 Node 22、Python 3.13，依次检查 JavaScript 语法、官方三件套哈希、真实 WASM/Session、运行时生命周期、独立几何、公开来源与静态构建，再上传 dist 并使用 deploy-pages 发布。

- 仓库应配置 Pages 的构建来源为 GitHub Actions；目标分支和仓库可见性由最终发布负责人确认。
- workflow_dispatch 可选择分支，会执行到实际 deploy；仅需本地检查时不要触发工作流。
- 本机版 Python 依赖不需要在 Pages 构建中安装；浏览器运行不依赖托管 Python API。
- `.github/workflows/prepare-wasm.yml` 是已完成的一次性官方构建获取工具，权限可写仓库且会提交/推送。普通 Pages 发布不调用它，也不应为重复取已验证文件而运行它。
- 上游 artifact 可能到期；当前三件套已入库，Pages 部署直接校验这些固定字节，不依赖上游 artifact 仍可下载。

## 真正的公网验收

最终部署后，记录提交 SHA、Actions run/deployment URL、实际页面 URL和浏览器信息，并完成：

1. 打开项目子路径的 HTTPS 页面，观察首次 COI 接管重载；验证 crossOriginIsolated 和 SharedArrayBuffer，且同源 Worker/WASM 请求成功。
2. 从页面输入启动一个新任务，记录真实引擎来源、独立校验证书与最终数量。下载到页面不等于已完成求解。
3. 验证真实中间事件、目标曲线和画布对应；初始化时间与求解预算分开，没有伪造百分比。
4. 求解中停止，核对 cancelled 状态、已收到最佳方案保留、后续新任务正常运行。
5. 刷新后重开已保存历史；未完成浏览器任务应标为中断/停止，不能伪称仍在后台计算。
6. 验证二维、三维限重、一维尾刀和贯通/矩形路线，以及文件导入导出和最终选定 UI。无痕窗口、另一个端口或域名使用独立浏览器历史。
7. 核对 dist 的 LICENSE、THIRD_PARTY_NOTICES.md、data/LICENSE-ESICUP 与分发来源文件可访问。

本地 CUA 已实际跑通独立静态服务器的 WASM Shirts 与实时回调，详见 WASM_PLAN.md；它不能替代 GitHub Pages origin 的最终验收。当前界面仍在迭代时，视觉截图与可交互验收以最终界面提交为准。

## 许可与固定文件

原创项目代码默认 MIT；`static/solver-worker.js` 因包含明确声明的 rectpack 修改移植，采用 Apache-2.0。第三方浏览器组件、原生依赖和数据各保留自身许可。WASM运行库清单还保留 musl、libc++、libc++abi 与 compiler-rt 的固定 Emscripten 6.0.11 文本；LLVM 条款和例外不简化为 MIT。

官方三件套保持原始字节，不在 loader 中打补丁。Emscripten 6 的 em-pthread 转发在本项目 solver-worker.js 中实现。Windows Git 自动换行不能改变已记录哈希的第三方原件；构建会拒绝不匹配，而不是重写 SHA256SUMS。
