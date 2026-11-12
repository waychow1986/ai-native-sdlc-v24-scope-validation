# Coding 后 Convergence 报告

## Candidate 与证据范围

- **Delivery：** `DLV-20261112-929DC1B4EC64`
- **Active Feature：** `.ai-delivery/features/001-delivery-dlv-20261112-929dc1b4ec64`
- **检查范围：** Constitution、technical baseline、全部已批准 Markdown 制品、四项通过的阶段门禁、当前实现与测试、runtime 就绪制品及 `reports/implementation.md`。
- **阶段边界：** 本门禁位于平台 CI、image publication、远程部署、Independent QA、UAT、发布审批、Review 与 Merge 之前；这些下游结果不参与本轮零阻塞项计算。

## 结论

`Repair Required`

用户可见行为、四个本地浏览器验收场景及平台就绪制品已有实现和开发者证据；但已批准运维契约要求的 `request_completed` 事件完全缺失。该运行时不变量已有 `T014` 负责，应返回 Coding 修复，不追加 Feature 任务。

## 问题摘要

### CRITICAL

无。

### HIGH

无。

### MEDIUM

- **CVG-001（阻塞）：** `design.md` 要求每个请求输出 `request_completed`，且仅记录 route template、HTTP method、status code、duration 和内部 request id；`src/app.js` 与 `src/server.js` 没有请求完成 hook 或等价实现，测试也没有对应断言。已批准的运维运行时不变量实质性不完整。

### LOW

- 锁定的 ESLint 版本在 Coding setup 中出现停止维护警告，但实施报告记录 `npm audit --audit-level=moderate` 为 0 个漏洞；该维护风险不改变已批准行为或必需证据，不阻塞本轮。

## 制品到实现与测试的可追溯关系

| 来源 | 实现路径 | 测试/证据路径 | 结论 |
|---|---|---|---|
| `FR-001`—`FR-003` / `AC-001` / `IQA-001` / `T008`—`T014` | `src/app.js`、`src/status-adapter.js`、`public/index.html`、`public/app.js` | `test/unit/app.test.js`、`test/unit/status-adapter.test.js`、`test/functional/status-page.spec.js` | 标题、首次查看和成功文字“ok”均有 contract 与真实 Chromium 证据 |
| `FR-004`—`FR-005` / `AC-002`—`AC-004` / `IQA-002`—`IQA-004` / `T015`—`T022` | `src/status-adapter.js`、`src/app.js`、`public/index.html`、`public/app.js` | 同上 | 失败提示、重试成功及连续失败仍可重试均有真实 Chromium 证据 |
| HTTP contract / `TD-003`—`TD-005` | `src/app.js`、`public/app.js` | `test/unit/app.test.js`、`test/functional/status-page.spec.js` | 已覆盖成功、503、400、health、404/405、安全响应头、单次求值与单次重试请求 |
| OCI readiness / `TD-007` / `T023`—`T026` | `Dockerfile`、`.dockerignore`、`src/app.js`、`src/server.js`、`runtime/deployment.json`、`runtime/developer-functional-run.sh` | `test/unit/app.test.js`、`reports/implementation.md` | 已提供非 root image、health、identity、分类验证命令和可执行功能脚本 |
| 运维日志 / `design.md` 配置、可观测性与运维 / `T014` | `src/app.js`、`src/server.js` | `test/unit/app.test.js` | 部分；缺少 `request_completed` 实现和验证，见 `CVG-001` |

## 开发者验证独立复核

`runtime/deployment.json` 的 setup 为 `npm ci`、`npx playwright install --with-deps chromium`；验证命令仅含非空 `staticAnalysis`、`build`、`developerTests` 三类，依次为 `npm run lint`、`npm run build`、`npm run test:unit`、`npm run test:functional`，没有 no-op 或未批准类别。

独立核对命令入口、测试源码和最终实施记录后，`reports/implementation.md` 保留了 Node.js 24 clean setup、lint、build、20/20 unit/component/contract tests、4/4 本地 Fastify + Chromium functional/end-to-end 场景、语法检查、dependency audit、非 root 只读 container smoke 及本地 functional script 的退出码 0 证据。四个 IQA 不是 Mock、health、build 或页面加载 smoke 的替代结果。由于 `CVG-001` 对应契约没有测试，现有通过结果不足以使 Candidate 整体收敛。

## 用户可见行为比较

- 首页固定标题“流程状态”与成功文字“ok”准确保留。
- 页面加载发起一次状态查看；成功、明确失败、失败后重试成功、重试仍失败四条路径与 `FR-001`—`FR-005`、`AC-001`—`AC-004` 一致。
- 失败不显示“ok”并提供“重新尝试”；每次点击只发起一次新请求，没有自动重试。
- 未引入登录、权限、数据库、后台管理、多页面导航、外部 integration、复杂视觉设计或其他未请求行为。

## 架构、Contract、运维与任务覆盖

实现保持 Node.js 24 LTS、Fastify 5、原生同源页面、进程内 adapter、无持久化和 provider-neutral OCI container。API、health、Candidate identity、严格配置、CSP、安全响应头、非 root container、确定性 build 与 clean-runner contract 均有实现路径。

`T001`—`T026` 已标记完成。未发现跳过的产品任务、隐藏外部依赖、被削弱的用户控制、无证据成功声明，或无批准追踪关系的外部产品、服务、telemetry backend、身份产品、告警、保留策略。唯一实施偏差是 `T014` 负责范围内的请求完成日志遗漏，路由为 `coding-repair`。

## 延后平台证据

最终集成 Candidate commit SHA、registry image digest、远程部署 target、远程 identity 结果、Independent QA 的 `IQA-001`—`IQA-004` 证据、UAT、发布审批、Review 与 Merge 尚未产生，符合阶段顺序且不阻塞本轮。

Coding 已提供生产 `Dockerfile`、`runtime/deployment.json`、`/candidate-identity`、三种 `STATUS_MODE`、四个本地浏览器场景和 `runtime/developer-functional-run.sh`。该脚本验证部署后 `IQA-001` 与 Candidate identity；其余 IQA 的独立远程结果仍由下游 QA 产生。

## 阻塞项

### CVG-001 缺少请求完成运维事件

- **严重性：** `MEDIUM`
- **分类：** `partial`
- **来源制品：** `design.md`“配置、可观测性与运维”；`tasks-implementation.md` 的 `T014`
- **实现或证据路径：** `src/app.js`、`src/server.js`、`test/unit/app.test.js`
- **修复路由：** `coding-repair`
- **所需证据：** 在现有 `T014` 责任内实现每个请求恰好一个 `request_completed` 结构化事件，只含批准字段；补充测试证明正常、失败和未知路径的字段及无敏感信息泄露；按 `runtime/deployment.json` 重跑全部开发者验证命令并保留真实结果。

## 警告与剩余风险

- ESLint 停止维护警告仅作为依赖维护风险，不应借本轮修复扩大依赖升级范围。
- `fail-once` 的 Independent QA 前置条件仍要求干净单实例 target；这是下游执行约束，不是当前缺陷。
- 当前没有 append-only Convergence 任务、产品澄清或平台事件。

## 最终判定依据

用户可见行为、四个必需 functional 场景和 CI 前就绪制品均已落实，下游证据被正确延后；但 `CVG-001` 是已批准 `design.md` 明确规定、由现有 `T014` 负责的运行时不变量缺口。实质性不完整的 MEDIUM 事项进入 blockers，因此本轮判定 `Repair Required`。
