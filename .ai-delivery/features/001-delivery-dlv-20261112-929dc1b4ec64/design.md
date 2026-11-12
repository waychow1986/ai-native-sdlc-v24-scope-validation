# 最小状态查看页技术方案

## 实施就绪状态

`implementationReady: true`

## 技术上下文（Technical Context）

- 仓库当前只有 AI Delivery 制品，没有既有应用代码、框架、运行时、部署资源或可复用集成。
- 产品是单一首页：加载时查看一次状态，成功显示固定文字“ok”，失败显示明确提示和重新尝试操作；重试后以本次结果替换上次结果。
- 采用已批准技术基线的 Option A：Node.js 24 LTS、Fastify 5、原生 HTML/CSS/JavaScript，一个进程提供静态页面、状态 API 和部署探针。
- 应用不使用数据库、消息系统、身份服务、外部 integration、managed service 或 telemetry backend。业务状态不持久化。
- 交付物是 OCI container。运行平台和 cloud provider 尚未指定，因此部署契约保持 provider-neutral；运行时只要求容器、TCP 端口和 HTTP 健康探针。
- `GET /api/status` 的默认 adapter 反映当前进程可用状态。服务端配置可选择确定性的成功、失败或首次失败后成功，用于开发者验证和 Independent QA；浏览器没有状态控制入口。
- 浏览器与服务端同源。没有登录、权限、用户输入、客户内容或业务 secret。
- 前置产品决策、治理输入和实现选择均已闭合；不存在需要 Coding 决定的产品、架构或契约问题。

## 治理与技术约束

- **最小范围：** 仅实现首页、状态成功、状态失败和用户发起的重新尝试。设计不包含登录、RBAC、数据库、后台、多页面导航或复杂视觉层。
- **安全与隐私：** API 不接受业务输入；Fastify schema 拒绝查询参数和请求体。容器使用非 root 用户，配置来自环境变量，日志不记录请求体、响应体、客户内容或环境变量值。
- **凭据：** 当前没有外部 integration，因而没有凭据或 managed identity。若未来引入外部系统，必须另行批准，不能从本方案推导。
- **可验收性：** 四个产品验收场景均由浏览器 functional test 和部署后的 Independent QA 覆盖。Unit test、build、`/healthz` 和 Mock 只提供辅助证据。
- **环境隔离：** Coding 只在本地进程和本地 container 上验证，不访问 Azure/云资源、远程环境、网络策略、托管身份或 RBAC。
- **候选一致性：** Production candidate 包含 `Dockerfile` 与 active Feature 下的 `runtime/deployment.json`；CI 构建的不可变 image、部署的 candidate SHA 和 Independent QA target 必须一致。
- **clean runner：** `runtime/deployment.json` 声明幂等 setup 命令，以及唯一的 `staticAnalysis`、`build`、`developerTests` 分类。依赖由 lockfile 固定，不依赖预热 cache。
- **质量边界：** Specification 没有批准性能、可用率、容量、超时、自动重试、保留期或可访问性等级，因此本方案不创建对应数值门禁或外部服务。

## 架构概览（Architecture）

系统是一个无持久化、同源、单进程 Web 应用：

1. Fastify 进程监听 `PORT`，提供 `/` 及静态资源、`GET /api/status`、`GET /healthz`。
2. 首页加载后，浏览器 controller 对 `/api/status` 发起一次 `GET`。
3. API 调用进程内 `StatusAdapter`。生产默认 adapter 返回进程可用状态；验证环境可由服务端配置选择确定性结果。
4. 浏览器只接受 HTTP 200 且符合 schema 的 `{"status":"ok"}` 为成功，显示“ok”；其他 HTTP、网络或解析错误统一显示“状态获取失败，请重试。”及“重新尝试”按钮。
5. 用户点击按钮时只发起一次新请求；新结果原子替换当前结果。客户端不自动重试。

静态页面和 API 共享 origin，无 CORS、反向代理专用协议或客户端路由。应用实例不共享业务数据，也不要求 session affinity。验证专用的首次失败计数仅存在于单个进程内，用于构造验收前置条件，不是生产业务状态。

## 技术决策与替代方案

| 决策 ID | 选择 | 理由 | 已考虑替代方案 | 来源 |
|---|---|---|---|---|
| TD-001 | Node.js 24 LTS + Fastify 5 | 符合批准基线；以单进程和较小依赖面提供 HTTP schema、adapter 注入和可测试边界 | .NET 10 Minimal API 可行但当前仓库无 .NET 资产且 bootstrap 更重；React/Vite 对单页交互不必要 | technical baseline Option A；`INT-006` |
| TD-002 | 原生 HTML/CSS/JavaScript，同源部署 | 页面只有一个结果区和一个重试操作，无需 component framework、bundler 或 client router | React 19/Vite 7 增加构建、依赖与状态复杂度 | `FR-001`—`FR-005`；technical baseline |
| TD-003 | `GET /api/status` 返回严格 JSON，业务失败使用 HTTP 503 | 清晰区分成功和不可用，客户端对所有非成功结果采用同一获批失败行为 | 始终 200 并在 body 表示失败会混淆 HTTP 语义；provider-specific function 引入未批准平台 | `FR-002`—`FR-005` |
| TD-004 | 进程内 `StatusAdapter`，由 `STATUS_MODE` 选择 `success`、`failure`、`fail-once` | 不引入外部系统即可确定性建立四个验收场景；配置仅在服务端，候选 image 不变 | 浏览器控制参数会暴露测试入口；数据库或远程 provider 均超范围；仅静态 success/failure 无法验证重试后恢复 | `IQA-001`—`IQA-004`；technical baseline |
| TD-005 | 客户端单飞请求、递增 attempt token、无自动重试 | 每个页面加载或用户重试恰好产生一次请求，并保证只呈现本次有效结果 | 自动重试未获批准；允许并行请求会产生旧结果覆盖新结果风险 | `FR-002`、`FR-005`；业务不变量 |
| TD-006 | Node 内建 test runner 用于 unit/component，Playwright Chromium 用于浏览器 functional test | 同时验证 server contract 和真实用户可观察行为；浏览器测试可独立覆盖四个场景 | 只做 unit/Mock、health 或 smoke 不能形成 functional acceptance 证据 | Constitution；spec 测试策略 |
| TD-007 | 多阶段、非 root OCI container；静态资源与 API 同一 image | 保持 candidate 不可变、部署边界简单且不依赖 provider | 分离静态站点和 API 会增加部署单元、CORS 和发布一致性风险 | technical baseline；交付治理 |
| TD-008 | 结构化 stdout/stderr 运维日志，不接入外部 telemetry backend | 为故障定位保留最小运行证据，同时不引入未批准外部产品 | managed logging、APM、告警平台均无批准来源 | Constitution；technical baseline |

## 领域与数据模型

### 领域对象

- **StatusResult**
  - `kind`: 内部严格枚举 `success | failure`
  - 不含用户、时间、身份、客户内容或可持久化字段。
- **StatusViewState**
  - `idle`: HTML 已加载、尚未发起首次请求的瞬时状态。
  - `loading`: 一次请求进行中。
  - `success`: 当前尝试成功，结果文本只能是 `ok`。
  - `failure`: 当前尝试失败，显示明确失败提示和重试操作。
- **Attempt**
  - `id`: 浏览器内递增整数，仅用于防止过期异步结果覆盖当前结果。
  - `controller`: 当前请求的 `AbortController`；页面卸载时取消。

### 配置模型

| 名称 | 必需性 | 合法值 | 默认值 | 所有者 |
|---|---|---|---|---|
| `PORT` | 可选 | 十进制整数 `1`—`65535` | `3000` | 部署运行时 |
| `HOST` | 可选 | `0.0.0.0` 或 `127.0.0.1` | container 为 `0.0.0.0`，本地测试显式使用 `127.0.0.1` | 启动配置 |
| `STATUS_MODE` | 可选 | `success`、`failure`、`fail-once` | `success` | 状态 adapter |
| `NODE_ENV` | 可选 | Node 约定字符串；不改变产品行为 | `production`（container） | Node runtime |

配置在启动时一次性解析；未知 `STATUS_MODE`、非法 `PORT` 或非法 `HOST` 使进程以非零码退出，不带错误配置值写日志。不存在动态配置、持久化 schema 或数据迁移。

### 验证 adapter 语义

- `success`：每次 `/api/status` 返回成功。
- `failure`：每次 `/api/status` 返回失败，支持首次失败和连续失败场景。
- `fail-once`：进程收到的第一次 `/api/status` 返回失败，其后返回成功，支持失败后重试成功场景。
- 计数器只由 `/api/status` 消费；静态资源和 `/healthz` 不影响它。进程重启后计数归零。
- `fail-once` 仅用于单实例验证拓扑。生产默认 `success` 模式不持有可观察业务状态，横向实例之间无需同步。

## Component 边界与项目结构

批准由 Coding 创建或修改的根路径如下：

- `package.json`
- `package-lock.json`
- `eslint.config.js`
- `playwright.config.js`
- `.gitignore`
- `Dockerfile`
- `.dockerignore`
- `src/`
- `public/`
- `scripts/`
- `test/`
- `.ai-delivery/features/001-delivery-dlv-20261112-929dc1b4ec64/runtime/`

具体结构：

```text
src/
├── app.js                 # Fastify factory、route/schema、错误映射
├── server.js              # 配置解析、监听、优雅停止
└── status-adapter.js      # 三种确定性 adapter 模式
public/
├── index.html             # 语义化单页骨架
├── app.js                 # 浏览器状态机与 fetch controller
└── styles.css             # 最小布局与状态样式
scripts/
└── build.mjs              # 生成可交付 dist，不改变源码
test/
├── unit/
│   ├── app.test.js
│   └── status-adapter.test.js
└── functional/
    └── status-page.spec.js
.ai-delivery/features/001-delivery-dlv-20261112-929dc1b4ec64/runtime/
└── deployment.json
```

`src/app.js` 只组装 HTTP component，通过构造参数接收 adapter；`src/server.js` 是唯一进程入口；`status-adapter.js` 不依赖 Fastify。`public/app.js` 只负责页面状态转换，不包含服务端模式选择。`scripts/build.mjs` 清理并重建 `dist/`，复制运行所需的 `src/`、`public/`、`package.json` 和 lockfile，并校验必需文件存在。

`.gitignore` 忽略 `node_modules/`、`dist/`、`playwright-report/`、`test-results/` 和本地日志；`.dockerignore` 排除 Git 元数据、AI Delivery 制品、测试报告、测试源码、开发依赖目录和本地构建输出。lockfile 和 deployment contract 必须提交。

## 数据流、状态、并发与生命周期

### 页面加载与重试

1. 浏览器取得 HTML，立即保留固定标题“流程状态”。
2. `DOMContentLoaded` 调用 `requestStatus()`，attempt id 加一，进入 `loading`。
3. controller 发起一次同源 `GET /api/status`，请求不携带 query、body、cookie 或凭据。
4. 若响应为 200、content type 为 JSON，且 body 精确符合成功 schema，则进入 `success` 并显示 `ok`。
5. 网络错误、非 200、JSON 解析失败或 schema 不匹配均进入 `failure`，显示“状态获取失败，请重试。”和“重新尝试”按钮。
6. 用户点击重试时按钮在本次请求期间不可再次触发；创建新 attempt 并发出一次请求。完成后以新结果替换旧结果；再次失败时重新启用按钮。

### 并发和顺序

- controller 保证同一页面最多一个活跃状态请求。新 attempt 开始前取消旧 controller。
- 每个 completion 先比较 attempt id；过期 completion 不得修改 DOM。
- 服务端 adapter 对每个 API 请求只求值一次。`fail-once` 的首次判定和计数增加在同步临界段完成，Node event loop 下不会把两个请求都判为首次。
- 不进行客户端或服务端自动重试，不设置任意重试次数，也不将失败缓存为后续结果。

### 生命周期

- 启动：解析配置、创建 adapter、注册 route，成功监听后才可通过 readiness 探测。
- 运行：除 `fail-once` 验证计数器外无可变共享状态，无文件写入。
- 停止：接收 `SIGTERM`/`SIGINT` 后停止接受新连接，调用 Fastify close 等待活跃请求结束，再正常退出；container runtime 负责最终终止边界。
- 页面卸载：浏览器取消活跃 fetch；无服务端 session 需要清理。

## Interface 与契约（Contract）

### `GET /`

- 返回 `200 text/html; charset=utf-8` 和 `public/index.html`。
- 页面必须包含固定 `h1` 文本“流程状态”、一个可更新结果区域和失败时可见的按钮“重新尝试”。
- 其他静态资源只允许 `GET`/`HEAD`；不存在客户端路由 fallback。

### `GET /api/status`

- Request：无 path parameter、query parameter 或 body；不要求身份或 cookie。
- Success：`200 application/json; charset=utf-8`

```json
{
  "status": "ok"
}
```

- 成功 schema：object，`status` 为唯一字段和唯一值 `ok`，`additionalProperties: false`。
- Status unavailable：`503 application/problem+json; charset=utf-8`

```json
{
  "type": "about:blank",
  "title": "Status unavailable",
  "status": 503,
  "code": "STATUS_UNAVAILABLE"
}
```

- Failure schema 字段固定，`additionalProperties: false`；不返回 stack、内部原因、配置或客户内容。
- 非法 query/body 由 schema 统一返回 `400 application/problem+json`，`code` 为 `INVALID_REQUEST`。
- 未处理内部错误返回同一 503 public contract，内部日志只记录固定错误类别。
- `Cache-Control: no-store`；客户端每次重试都必须到达服务端。
- 仅支持此 v1 路径和 schema。当前无旧客户端或兼容版本；后续破坏性变更必须新建 API version，不能静默改变本契约。

### `GET /healthz`

- 进程已启动且 event loop 可处理请求时返回 `200 application/json`：

```json
{
  "status": "ok"
}
```

- 不调用 `StatusAdapter`，因此 `STATUS_MODE=failure` 时仍可确认进程健康。
- 只用于 container liveness/readiness 与部署诊断，不能作为 `FR-002`—`FR-005` 或任一 IQA 的验收证据。

### HTTP 通用契约

- 未知路径返回 404；不包含 stack 或文件系统路径。
- 非允许 method 返回 405，并带 `Allow` header。
- 所有响应设置 `X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`、`Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`。
- 不启用 CORS。HTML 不使用 inline script/style，避免为 CSP 增加 nonce 或宽松源。

### Contract test 义务

- Fastify `inject` 测试精确验证 success、failure、invalid request、health、404/405、content type、cache header 和 JSON schema。
- adapter 测试验证三种模式、`fail-once` 顺序、重启等价的新实例归零和非法配置拒绝。
- 浏览器测试不得直接修改 DOM；必须通过真实首页与 API 验证标题、结果、失败提示、按钮和重试后的替换行为。
- 当前没有外部 adapter，因而没有远程 contract test。未来若引入，必须按 Constitution 在真实测试服务执行，不能沿用本地 adapter 作为替代证据。

## 安全、隐私、身份与 Secret

- 没有用户身份、授权、cookie、token、客户数据或业务 secret；不得添加登录和权限 UI。
- API 使用严格 schema，拒绝未声明输入；静态文件 root 固定，不接受用户提供路径。
- 同源和 CSP 限制资源加载；不启用 CORS，不加载第三方 script/font。
- Fastify 默认请求日志关闭。应用日志不得输出 header、IP、query、body、response body、环境变量或 stack；开发测试失败可在本地测试报告中保留框架断言，但不得写入 secret。
- container final stage 使用 Node 官方 24 LTS slim image 的非 root `node` 用户，只复制 production dependency 和应用文件；不包含 shell 脚本、测试工具、测试报告或源码映射。
- 文件系统视为只读；应用不需要 volume。运行平台提供临时目录不是应用依赖。
- `STATUS_MODE` 和 `PORT` 不是 secret。若部署平台未来要求 registry 或平台凭据，由平台 secret store 或 managed identity 注入，不能进入仓库、image、日志或本方案配置值。
- dependency 由 `package-lock.json` 固定；CI 使用 `npm ci`，不得在验证失败后临时安装未声明 package。

## 配置、可观测性与运维

- 配置仅来自进程环境并在启动时校验；没有配置文件、管理 API 或热更新。
- 结构化 JSON 日志输出到 stdout/stderr，事件仅包括 `service_started`、`service_stopping`、`request_completed`、`status_unavailable`、`configuration_invalid` 和 `uncaught_error`。
- `request_completed` 只记录 route template、HTTP method、status code、duration 和内部 request id；不记录 URL query、IP、user-agent、header 或 payload。
- 未批准日志 backend、指标 backend、distributed tracing、告警系统或保留期；container runtime 可收集 stdout，但本应用不依赖该能力。
- `/healthz` 是唯一运维探针。功能状态必须通过 `/api/status` 与浏览器场景验证。
- `runtime/deployment.json` 声明：
  - `developerSetupCommands`：`npm ci`、`npx playwright install --with-deps chromium`；
  - `developerValidationCommands.staticAnalysis`：`npm run lint`；
  - `developerValidationCommands.build`：`npm run build`；
  - `developerValidationCommands.developerTests`：`npm run test:unit`、`npm run test:functional`；
  - 不声明无适用场景的 `integrationTests`，也不添加其他类别；
  - container port 为 `3000`，health path 为 `/healthz`，生产默认 `STATUS_MODE=success`。
- `npm run lint` 使用 ESLint 对 `src/`、`public/`、`scripts/`、`test/` 与配置文件执行静态分析；`npm run build` 生成并校验 `dist/`；unit 和 functional 命令必须各自非空且失败时返回非零码。

## SLO、限制、扩缩容、重试与恢复

- Specification 未批准延迟、吞吐、可用率、容量、恢复时间或恢复点目标；本方案不设置任意 SLO 数值，也不把这些维度变成验收门禁。
- API 无 body、query 和业务 payload；Fastify 的 schema 和默认 HTTP parser 限制仍适用，但不形成新的产品承诺。
- 生产默认模式无持久状态，可运行一个或多个相同实例，不要求 session affinity。扩缩容由未来批准的运行平台负责，本方案不指定阈值或 autoscaler。
- `fail-once` 是单实例验证模式；用该模式执行 `IQA-003` 时 QA target 必须固定为一个实例并从干净进程开始，以保持前置条件确定。
- 客户端和服务端均不自动重试。只有用户点击“重新尝试”才开始下一次状态查看。
- 本地状态调用没有外部超时配置。网络中断由浏览器 fetch failure 呈现；页面卸载会取消请求。未批准任意超时数值。
- 实例故障由 container runtime 重启相同 image；应用没有待恢复数据。版本故障通过回滚上一不可变 image 恢复。

## 部署拓扑、迁移、Rollout 与 Rollback

- 拓扑为：用户浏览器 → 平台提供的 HTTP 入口 → 单一 OCI application container。没有 sidecar、database、queue、object storage、identity provider 或外部业务服务。
- container 监听 `0.0.0.0:$PORT`，声明端口 3000；入口终止 TLS 属于部署平台责任，应用内部提供 HTTP。
- `Dockerfile` 使用多阶段构建：builder 执行 lockfile 安装和 `npm run build`；production stage 仅安装 production dependency、复制 `dist` 内容、切换非 root 用户并以 `node src/server.js` 启动。
- 没有数据或 schema 迁移。首次 rollout 只需部署 image 和环境配置。
- CI 在 clean runner 完成 setup、三类 validation、container build 和本地 container smoke 后发布以 commit SHA/digest 标识的不可变 image。smoke 只确认启动与 `/healthz`，不替代 functional test。
- 远程部署必须绑定同一 candidate SHA 和 image digest；Independent QA 只对该 target 执行。
- Rollout 前验证配置枚举和探针；平台探针通过后才路由流量。没有获批 canary 比例或分阶段时长，不在本方案中虚构。
- Rollback 重新部署上一已知可用的不可变 image 与其对应配置；无数据回退步骤。rollback 后重新执行部署探针，产品验收结果由相应下游阶段记录。

## 验证环境责任矩阵（Verification Environment）

| 验证类型 | 责任阶段 | 环境来源 | 依赖/凭据 | Coding 证据 | 下游结果 |
|---|---|---|---|---|---|
| 静态分析 | Coding；平台 CI 重复 | 本地/clean runner，Node.js 24 LTS | `npm ci`；无凭据 | `npm run lint` 退出码与 stdout/stderr | CI 对同一 commit 重复后的结果 |
| Build 与制品组装 | Coding；平台 CI 重复 | 本地/clean runner | Node.js 24、lockfile；无凭据 | `npm run build` 及必需文件校验结果 | CI build 结果与 image digest |
| Unit/component/contract | Coding；平台 CI 重复 | 本地进程，Fastify inject | Node.js dependency；无远程服务或凭据 | `npm run test:unit`，覆盖 adapter 与 HTTP contract | CI 对同一 commit 的测试结果 |
| 浏览器 functional | Coding；平台 CI 重复 | 本地 Fastify + Playwright Chromium | clean runner 安装 Chromium；无云凭据 | `npm run test:functional` 覆盖 `IQA-001`—`IQA-004` 的可观察行为 | CI 浏览器测试结果；不能替代 Independent QA |
| Container smoke | 平台 CI | clean runner 本地 container runtime | 已构建 image；无云凭据 | Coding 提供 `Dockerfile`、`/healthz` 和启动配置 | image 可启动、探针通过及不可变 digest |
| 部署后功能验收 | Independent QA | 平台提供的远程 QA target，部署精确 Candidate | QA 部署权限由平台提供；应用无业务凭据 | 三种 `STATUS_MODE` 的可部署配置、四个 IQA 自动化入口及追踪映射 | 对同一 SHA/image target 的 `IQA-001`—`IQA-004` 独立证据 |
| 发布验证 | release verification | 已批准发布 target | 平台部署/回滚权限；应用无业务凭据 | 不可变 image、deployment contract、runbook | 探针、candidate identity、审批和发布/回滚结果 |

Coding 不得把无法访问远程 QA target 视为本地失败，也不得用本地或 Mock 结果代替 Independent QA。只有下游实际运行后，表中“下游结果”才可声明。

## 快速验证指南（Quickstart）

1. 在 Node.js 24 LTS clean environment 执行 `npm ci` 和 `npx playwright install --with-deps chromium`。
2. 依次执行 `npm run lint`、`npm run build`、`npm run test:unit`、`npm run test:functional`；任何命令失败立即停止。
3. 本地手工查看成功路径：以 `STATUS_MODE=success` 启动应用，打开 `http://127.0.0.1:3000/`，确认标题为“流程状态”、结果为“ok”。
4. 查看首次失败与连续失败：以 `STATUS_MODE=failure` 从干净进程启动，打开首页，确认失败提示和“重新尝试”；点击后确认仍为失败且按钮保留。
5. 查看恢复路径：以 `STATUS_MODE=fail-once` 从干净进程启动，打开首页确认首次失败；点击一次“重新尝试”，确认当前结果替换为“ok”。
6. 构建 container，使用默认 `STATUS_MODE=success` 启动并访问 `/healthz` 与首页。container smoke 只辅助验证打包，不替代第 3—5 步。
7. 平台 CI 发布 image 后，Independent QA 对绑定同一 SHA 和 image digest 的远程 target 分别运行 `IQA-001`—`IQA-004` 并保存 Specification 要求的证据。

## 支持 Runbook

- **进程无法启动：** 查看固定事件 `configuration_invalid` 或启动退出码；核对 `PORT`、`HOST`、`STATUS_MODE` 是否符合枚举。不得打印配置原值或临时绕过校验。
- **`/healthz` 失败：** 确认 container 状态、监听地址和端口映射；重启同一 digest。若仍失败，回滚上一不可变 image。
- **`/healthz` 成功但页面失败：** 直接检查 `/api/status` 的 HTTP status 和 public problem contract，确认部署所用 `STATUS_MODE`。不得以 health 成功判定产品功能通过。
- **静态页面无法加载：** 核对 image 中 `public/` 文件和入口路由，使用 CI build manifest 对照；不从运行实例临时修改文件。
- **用户重试后结果错误：** 复现相同 `STATUS_MODE`，核对每次点击只有一个 `/api/status` completion 以及 attempt token；保留不含 payload 的 route/status 日志。
- **QA 场景不确定：** 为每个模式使用干净单实例部署或重启进程；`fail-once` 场景先确认没有探针调用 `/api/status`。记录 candidate SHA、image digest、target、模式和用户可见结果。
- **依赖或 image 漏洞：** 不在运行容器中升级。更新声明依赖和 lockfile，经完整 validation、CI、Convergence 与审批产生新 candidate。
- **回滚：** 选择上一已批准 digest，恢复其配套配置，部署后检查 `/healthz`；产品功能结论仍须来自对应验证阶段。

## 开放决策

无。
