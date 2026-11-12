# BUG-001 缺陷评估

## 缺陷信息

- **Bug ID：** `BUG-001`
- **QA Run ID：** `qa-1-1-6ed0defcad1b7c7d889fdfd83088592358f39f33`
- **Candidate SHA：** `69921436924c03b94d657bc848a958a7eda42de8`
- **环境：** Independent QA 远程 target `http://172.175.215.138`

## 问题报告

Independent QA 对精确 Candidate 执行验收时，远程 target 只能提供状态取得成功的结果条件。`AC-001` 已取得真实 Chromium 证据，但无法建立首次失败、首次失败后重试成功、首次失败后重试仍失败的前置条件，因此 `AC-002`、`AC-003` 和 `AC-004` 均未执行完成。

三个未完成场景共享同一可观察阻塞和同一有证据支持的原因：QA target 只以成功结果条件运行，未提供切换或重新部署为 `failure`、`fail-once` 所需的 QA 编排条件，故保留为一个 Bug。

## 预期与实际行为

- **预期：** Independent QA 应对同一 Candidate 分别建立 `success`、`failure` 和 `fail-once` 结果条件；在真实 Chromium 中独立执行 `IQA-001` 至 `IQA-004`，并记录失败提示、重新尝试操作以及重试后成功或再次失败的用户可见结果。
- **实际：** 远程 health 与 Candidate identity 正确匹配，成功条件下首页显示“流程状态”和“ok”，且首次加载仅请求一次 `/api/status`；远程 target 没有提供失败或首次失败后成功的结果条件，因而没有产生 `AC-002`、`AC-003`、`AC-004` 的产品行为证据，也没有观察到这些场景中的产品行为不符合预期。

## 复现步骤与证据

1. 访问 QA 提供的 `http://172.175.215.138`，核对 health、Delivery ID 与 Candidate SHA；QA 记录表明三者匹配本次交付和精确 Candidate。
2. 使用真实 Chromium 首次打开首页；可见标题“流程状态”和状态“ok”，并记录到一次 `/api/status` 请求，`AC-001` 成立。
3. 尝试建立首次状态取得失败的前置条件；当前 target 仍仅提供成功结果条件，无法进入 `IQA-002`。
4. 因首次失败前置条件无法建立，无法继续执行 `IQA-003` 的失败后重试成功和 `IQA-004` 的失败后重试仍失败。

仓库证据显示 Candidate 已包含这些确定性结果模式：`src/status-adapter.js` 支持 `success`、`failure`、`fail-once`，`src/server.js` 从服务端 `STATUS_MODE` 创建 adapter；`test/functional/status-page.spec.js` 使用真实本地 Fastify 进程与 Chromium 分别覆盖四个 IQA 场景。上述本地证据证明场景入口存在，但不能替代部署后 Independent QA 证据。

## 影响追踪

- **Requirement：** `FR-002`、`FR-003`、`FR-004`、`FR-005`
- **Acceptance：** `AC-002`、`AC-003`、`AC-004`
- **Scenario：** `IQA-002`、`IQA-003`、`IQA-004`
- **Success Criterion：** `SC-001`、`SC-003`、`SC-004`
- **Task：** `T017`（四个场景的浏览器自动化入口）、`T018`（`failure` 与 `fail-once` adapter）、`T024`（部署契约）、`T025`（四个 IQA 本地自动化验证）
- **技术决策：** `TD-004` 要求由服务端 `STATUS_MODE` 确定性建立四个场景；Technical Solution 的验证环境责任矩阵要求 Independent QA 针对远程精确 Candidate 使用三种 `STATUS_MODE` 独立取证。

## 根因分析

根因位于 Independent QA 的远程测试条件编排，而非已观察到的产品逻辑：本次只提供了默认成功配置的单一 target，没有为同一不可变 Candidate 建立 `STATUS_MODE=failure` 和 `STATUS_MODE=fail-once` 的运行实例或等效重新部署流程。由于浏览器端按设计没有测试控制入口，QA 无法从现有 target 自行改变服务端结果条件。

现有证据不支持产品缺陷：QA 只观察并通过了成功路径，未在失败或重试条件下观察到错误产品行为；仓库中的真实本地浏览器场景已覆盖相应行为，但按治理要求不能替代远程验收。

## 限定范围的修复方案

由 QA/部署编排为同一 Candidate image 提供可核验的结果条件并重新执行未完成场景：

1. 以 `STATUS_MODE=failure` 从干净进程启动 target，执行 `IQA-002` 和 `IQA-004`。
2. 以 `STATUS_MODE=fail-once` 从干净、固定单实例进程启动 target，执行 `IQA-003`。
3. 每次运行均重新核对相同 Delivery ID、Candidate SHA 和不可变 image，并保留 Specification 要求的真实 Chromium 可观察证据。

不修改应用代码、浏览器接口或已批准产品行为，也不增加客户端测试控制入口。该处理属于补齐 Independent QA 条件和证据，而不是实施代码修复。

## 回归风险

- 若不同模式使用了不同 image 或 Candidate SHA，证据将不能归属于本次候选。
- `fail-once` 依赖干净、固定单实例进程；复用已接受请求的实例或跨实例负载均衡会破坏 `IQA-003` 的确定性。
- QA 切换模式后若未恢复或隔离 target，可能使其他成功路径检查得到错误结果。
- 若通过浏览器参数或公开控制端点切换模式，会扩大产品和安全边界；不得采用。

## 未解决证据

- 尚无远程 `STATUS_MODE=failure` 条件下 `IQA-002`、`IQA-004` 的真实 Chromium 证据。
- 尚无远程干净单实例 `STATUS_MODE=fail-once` 条件下 `IQA-003` 的真实 Chromium 证据。
- 尚无平台为三种结果条件绑定同一 Candidate SHA 和不可变 image 的编排记录。
- 在补齐以上证据前，`AC-002`、`AC-003`、`AC-004` 仍不能判定通过；当前也没有证据可将其判定为产品行为失败。

## 分类与修复就绪决策

- **classification：** `test_gap`
- **ready_for_fix：** `false`
- **决策依据：** 缺口是 Independent QA 未建立已批准场景所需的远程结果条件，未观察到产品实现偏离预期；应由 QA/部署编排补齐条件并重新取证，不应进入产品代码修复。
