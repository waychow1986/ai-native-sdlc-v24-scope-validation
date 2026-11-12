# Independent QA 验收计划

## Candidate 与执行边界

- Delivery：`DLV-20261112-929DC1B4EC64`
- Candidate SHA：`69921436924c03b94d657bc848a958a7eda42de8`
- 部署 image：`acraidhdevivmw2d.azurecr.io/ai-native-sdlc-v24-scope-validation@sha256:95fb53e4e68eca13b2ac69abd6ea58c48cdd36a0dae7453d89850019955b4b07`
- QA target：`http://172.175.215.138`
- Health path：`/healthz`
- 本轮为首次 Independent QA，`bugfixResults` 必须为空数组。
- Candidate readiness、health、identity、结果聚合和 JSON 写入仅为脚本前置步骤，不作为 IQA 场景。
- 产品没有获批准的外部系统依赖，各场景的 `externalServices` 为空。

## 验收任务

- [ ] **IQA-001：首页状态取得成功**
  - **追踪：** `US-001`；`FR-001`、`FR-002`、`FR-003`；`SC-001`、`SC-002`；`AC-001`
  - **输入或命令：** 对处于成功结果条件的 `QA_BASE_URL` 使用真实 Chromium 打开首页；记录页面发出的 `/api/status` 请求和最终可见内容。
  - **预期结果：** 页面准确显示标题“流程状态”和状态文字“ok”；首次页面加载只发起一次状态查看，用户可判定取得成功。
  - **证据要求：** Candidate identity 已匹配；记录页面 URL、标题、最终状态文字、状态请求次数与场景判定。

- [ ] **IQA-002：首页状态取得失败**
  - **追踪：** `US-001`、`US-002`；`FR-001`、`FR-002`、`FR-004`；`SC-001`、`SC-003`；`AC-002`
  - **输入或命令：** 对处于首次失败结果条件的 `QA_BASE_URL` 使用真实 Chromium 打开首页；观察标题、失败结果和可用操作。
  - **预期结果：** 页面准确显示标题“流程状态”、明确失败提示和可用的“重新尝试”操作，不把失败显示为“ok”；首次页面加载只发起一次状态查看。
  - **证据要求：** Candidate identity 已匹配；记录失败前置条件、标题、失败提示、重试操作可用性、是否出现“ok”、状态请求次数与场景判定。

- [ ] **IQA-003：失败后重新尝试成功**
  - **追踪：** `US-002`；`FR-003`、`FR-004`、`FR-005`；`SC-003`、`SC-004`；`AC-003`
  - **输入或命令：** 在首页已呈现首次失败且下一次结果为成功时，使用真实 Chromium 点击一次“重新尝试”，观察本次请求和更新后的可见结果。
  - **预期结果：** 点击只发起一次新的状态查看；当前结果更新为固定文字“ok”，先前失败不再作为当前结果。
  - **证据要求：** Candidate identity 已匹配；记录点击前失败结果、点击操作、点击前后请求数、更新后的状态文字及场景判定。

- [ ] **IQA-004：失败后重新尝试仍失败**
  - **追踪：** `US-002`；`FR-004`、`FR-005`；`SC-003`、`SC-004`；`AC-004`
  - **输入或命令：** 在首页已呈现首次失败且下一次结果仍为失败时，使用真实 Chromium 点击一次“重新尝试”，观察本次请求和更新后的可见结果。
  - **预期结果：** 点击只发起一次新的状态查看；页面继续显示明确失败提示，并继续提供可用的“重新尝试”操作。
  - **证据要求：** Candidate identity 已匹配；记录点击前失败结果、点击操作、点击前后请求数、再次失败提示、重试操作可用性及场景判定。

## 执行与结果规则

- 脚本从平台变量读取 Delivery、Candidate、target、health、QA plan identity 和结果路径，不硬编码另一 Candidate 或环境。
- DNS、TLS、health 与不可变 Candidate identity 最多等待五分钟；不关闭 TLS certificate verification。
- 同一部署配置不能建立某个已批准场景的结果前置条件时，该场景不得以其他场景、源码、Mock、health 或开发者测试代替，必须在 `testGaps` 中记录具体缺口。
- 观察到的产品行为直接违反对应预期结果时，在 `defects` 中记录具体缺陷；Runner、网络、DNS、TLS、浏览器或环境失败仅记录环境诊断，`defects` 和 `testGaps` 保持为空。
- 只有四个场景均以远程 Candidate 的黑盒证据通过，且 `defects`、`testGaps` 均为空时，总体 `passed` 才能为 `true`。

## 计划自检

| 检查项 | 结论 |
|---|---|
| Approved acceptance 覆盖 | `IQA-001`—`IQA-004` 分别且仅覆盖 `AC-001`—`AC-004`，无遗漏、重复或新增场景 |
| 权威追踪 | 每项 checklist 均追踪到 approved Specification 的 US、FR、SC 和 AC |
| 场景边界 | readiness、health、identity、聚合和结果写入未创建 IQA checklist |
| 范围控制 | 未增加性能、可靠性、安全、可访问性、兼容性或外部 integration 产品门禁 |
| 可执行性 | 每项均包含远程黑盒输入或命令、预期结果和必需证据 |
| 证据完整性 | 明确禁止用源码、Mock、health、build 或开发者测试替代用户可见验收证据 |

自检结论：结构、覆盖和追踪完整，可以生成 `runtime/qa-run.sh`。
