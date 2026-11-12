# 最小状态查看页实施任务

## 任务规则

- 每项任务使用格式：`- [ ] T001 [P?] [US?] 描述（准确仓库路径）`
- 每项任务必须引用来源 Intent、Specification 场景、Contract 或技术决策。
- 测试任务必须位于对应生产实现任务之前。
- CI、部署、Independent QA、UAT、发布、Review 和 Merge 结果属于下游平台证据。
- 浏览器 functional test 以本地真实 Fastify 进程和 Chromium 覆盖同源 integration 与 end-to-end 行为；本方案没有外部 integration，因此不创建远程 integration test 或凭据任务。

## 依赖关系

- Phase 1 无前置阶段；`T002`—`T004` 依赖 `T001`，且相互之间可并行。
- Phase 2 依赖 Phase 1；`T005` 依赖 `T001`。
- Phase 3 的测试先行：`T006`、`T007` 依赖 `T002`、`T005`，`T008` 依赖 `T003`、`T005`，三项相互之间可并行；`T009`—`T014` 必须在对应测试任务之后实施。
- Phase 4 依赖 Phase 3；`T015`—`T017` 必须先于 `T018`—`T022`，并分别扩展 unit、contract 及浏览器 functional/end-to-end 覆盖。
- Phase 5 依赖两个用户故事完成；`T023`、`T024` 可并行，`T025` 依赖二者，`T026` 依赖 `T025`。

## Phase 1：Setup

- [x] T001 建立 Node.js 24 LTS、Fastify 5、ES module、Node test runner、Playwright 与 `lint`、`build`、`test:unit`、`test:functional` 脚本的 npm manifest，并用 lockfile 固定全部依赖；完成证据为 `npm ci` 可从空依赖目录恢复一致依赖（`package.json`、`package-lock.json`；来源：TD-001、TD-006、Contract test 义务、clean runner 决策；依赖：无）
- [x] T002 [P] 配置 ESLint 覆盖 `src/`、`public/`、`scripts/`、`test/` 及配置文件，且 `npm run lint` 对违规返回非零码（`eslint.config.js`；来源：TD-006、配置与运维决策；依赖：T001）
- [x] T003 [P] 配置 Playwright Chromium 使用本地 Fastify 服务、隔离的 `STATUS_MODE` 和可重复启动环境，不依赖远程 target（`playwright.config.js`；来源：TD-004、TD-006、验证环境责任矩阵；依赖：T001）
- [x] T004 [P] 声明仅忽略 `node_modules/`、`dist/`、Playwright 输出和本地日志的仓库生成物规则（`.gitignore`；来源：批准路径清单、Component 边界；依赖：T001）

## Phase 2：Foundational

- [ ] T005 实现清理并重建 `dist/` 的构建入口，复制 `src/`、`public/`、manifest 与 lockfile，并在缺少必需文件时失败；完成证据为输出目录可由干净源码确定性生成（`scripts/build.mjs`；来源：TD-007、Component 边界、Build 与制品组装决策；依赖：T001）

## Phase 3：US1 - 查看当前状态（P1）

### 测试

- [ ] T006 [P] [US1] 先编写聚焦 unit tests，覆盖默认成功 adapter、成功结果严格枚举、独立实例初始状态以及非法 `PORT`、`HOST`、`STATUS_MODE` 配置拒绝且不泄露配置值；完成证据为测试在缺少实现时按预期失败（`test/unit/status-adapter.test.js`；来源：US-001、FR-002、FR-003、TD-004、配置模型；依赖：T002、T005）
- [ ] T007 [P] [US1] 先编写 Fastify contract/component tests，精确验证 `GET /`、成功 `GET /api/status`、`GET /healthz`、JSON schema、content type、`Cache-Control: no-store`、安全响应头及 404/405 契约；完成证据为断言在缺少 route 实现时按预期失败（`test/unit/app.test.js`；来源：US-001、FR-001—FR-003、AC-001、GET `/`、GET `/api/status`、GET `/healthz`、HTTP 通用契约；依赖：T002、T005）
- [ ] T008 [P] [US1] 先编写使用真实本地 Fastify 进程与 Chromium 的 integration、functional 和 end-to-end 场景，覆盖 `IQA-001`：打开首页后准确显示“流程状态”和“ok”，不直接修改 DOM；完成证据为场景在生产页面缺失时按预期失败（`test/functional/status-page.spec.js`；来源：US-001、IQA-001、AC-001、SC-001、SC-002、TD-006；依赖：T003、T005）

### 实现

- [ ] T009 [P] [US1] 实现无 Fastify 依赖的 `StatusAdapter` factory、严格配置解析和默认 `success` 行为，使 T006 的 US1 unit tests 通过（`src/status-adapter.js`；来源：FR-002、FR-003、TD-004、领域与配置模型；依赖：T006）
- [ ] T010 [US1] 实现 Fastify factory、固定静态资源 root、`GET /`、成功 `GET /api/status`、独立 `/healthz`、请求 schema、no-store 与通用安全/404/405 contract，使 T007 的 US1 contract tests 通过（`src/app.js`；来源：FR-001—FR-003、TD-001—TD-003、Interface 与契约、安全约束；依赖：T007、T009）
- [ ] T011 [P] [US1] 创建语义化首页骨架，包含准确 `h1`“流程状态”和可更新结果区域，且不使用 inline script/style（`public/index.html`；来源：FR-001、GET `/` Contract、HTTP 通用契约；依赖：T008）
- [ ] T012 [US1] 实现 `DOMContentLoaded` 后恰好一次同源 `GET /api/status`、严格成功响应判定和“ok”呈现，不发送 query、body、cookie 或凭据（`public/app.js`；来源：FR-002、FR-003、TD-002、TD-005、页面加载数据流；依赖：T008、T011）
- [ ] T013 [P] [US1] 实现批准范围内的最小首页布局与 loading/success 状态样式，不引入复杂视觉设计或第三方资源（`public/styles.css`；来源：INT-006、TD-002、GET `/` Contract；依赖：T008）
- [ ] T014 [US1] 实现唯一进程入口：启动时解析配置、创建 adapter、监听 `HOST`/`PORT`、处理 `SIGTERM`/`SIGINT`，并仅输出批准的无敏感内容结构化事件（`src/server.js`；来源：TD-004、TD-008、生命周期、配置与可观测性决策；依赖：T009、T010）

## Phase 4：US2 - 从状态取得失败中恢复（P1）

### 测试

- [ ] T015 [P] [US2] 在实现前扩展聚焦 unit tests，覆盖 `failure` 持续失败、`fail-once` 首次失败后成功、每请求只求值一次及新实例计数归零；完成证据为新增断言在缺少模式实现时按预期失败（`test/unit/status-adapter.test.js`；来源：US-002、FR-004、FR-005、AC-003、AC-004、TD-004、验证 adapter 语义；依赖：T006、T009、T014）
- [ ] T016 [P] [US2] 在实现前扩展 contract/component tests，覆盖固定 503 problem contract、非法 query/body 的 400、内部错误统一映射、failure schema、无 stack/配置泄露以及 adapter 每请求调用一次；完成证据为新增断言在缺少失败映射时按预期失败（`test/unit/app.test.js`；来源：US-002、FR-004、FR-005、GET `/api/status` Contract、Contract test 义务；依赖：T007、T010、T014）
- [ ] T017 [US2] 在实现前扩展真实浏览器 integration、functional 和 end-to-end 场景，分别以干净进程覆盖 `IQA-002`、`IQA-003`、`IQA-004`，验证失败不显示“ok”、重试成功替换旧结果、连续失败仍可重试且每次点击仅产生一次请求；完成证据为新增场景在缺少恢复行为时按预期失败（`test/functional/status-page.spec.js`；来源：US-002、FR-004、FR-005、IQA-002—IQA-004、AC-002—AC-004、TD-005、TD-006；依赖：T008、T011—T014）

### 实现

- [ ] T018 [US2] 实现 `failure` 与 `fail-once` adapter、同步首次判定及独立实例计数，使 T015 通过且不引入持久状态（`src/status-adapter.js`；来源：FR-004、FR-005、TD-004、验证 adapter 语义；依赖：T015）
- [ ] T019 [US2] 实现状态不可用 503、非法输入 400 和未处理错误的固定 public problem contract，只记录批准的固定类别，使 T016 通过（`src/app.js`；来源：FR-004、FR-005、TD-003、GET `/api/status` Contract、安全与日志约束；依赖：T016、T018）
- [ ] T020 [P] [US2] 为失败状态加入默认隐藏的明确失败结果容器和“重新尝试”按钮，保持语义化结构及 CSP 兼容（`public/index.html`；来源：FR-004、FR-005、GET `/` Contract；依赖：T017）
- [ ] T021 [US2] 实现 failure 映射、重试按钮、单活跃请求、递增 attempt token、旧请求取消/忽略及当前结果原子替换；禁止自动重试并确保再次失败后按钮恢复，使 T017 通过（`public/app.js`；来源：FR-004、FR-005、AC-002—AC-004、TD-005、数据流与并发决策；依赖：T017、T019、T020）
- [ ] T022 [P] [US2] 添加最小 failure 与重试操作样式，并保持第三方资源和复杂视觉设计在范围外（`public/styles.css`；来源：FR-004、INT-006、TD-002；依赖：T017、T020）

## Phase 5：Polish

- [ ] T023 [P] 创建多阶段 OCI 构建：builder 使用 lockfile 构建，final stage 仅含 production dependency 与 `dist`、以非 root `node` 用户运行且不包含测试/报告；同时排除 Git、AI Delivery、测试、开发依赖及本地输出（`Dockerfile`、`.dockerignore`；来源：TD-007、安全与隐私、部署拓扑决策；依赖：T005、T009—T014、T018—T022）
- [ ] T024 [P] 声明 provider-neutral deployment contract：幂等 `developerSetupCommands`，唯一分类的 `staticAnalysis`、`build`、`developerTests` 命令，container port `3000`、`/healthz` 及默认 `STATUS_MODE=success`；不得声明不适用的 `integrationTests` 或远程结果（`.ai-delivery/features/001-delivery-dlv-20261112-929dc1b4ec64/runtime/deployment.json`；来源：technical baseline、配置与运维、验证环境责任矩阵；依赖：T001—T003、T006—T022）
- [ ] T025 按 deployment contract 从干净依赖状态依次执行 `npm ci`、Chromium 安装、`npm run lint`、`npm run build`、`npm run test:unit`、`npm run test:functional`，首次失败即停止；完成证据为保留每条命令的真实 stdout/stderr 和退出码，且四个 IQA 自动化场景全部通过（`package.json`、`package-lock.json`、`.ai-delivery/features/001-delivery-dlv-20261112-929dc1b4ec64/runtime/deployment.json`；来源：Quickstart 1—5、验证环境责任矩阵；依赖：T023、T024）
- [ ] T026 构建本地 container 并以只读应用文件、非 root 用户和默认成功模式启动，验证 `/healthz` 与首页可达；完成证据为本地 build/启动/探针退出码，且明确该 smoke 不替代 T025 的 functional 证据或下游 Independent QA（`Dockerfile`、`.dockerignore`、`.ai-delivery/features/001-delivery-dlv-20261112-929dc1b4ec64/runtime/deployment.json`；来源：Quickstart 6、Container smoke 责任、TD-007；依赖：T025）

## 完成证据

- Setup 与 Foundational：提交可由 lockfile 重建的 manifest、静态分析/浏览器配置及确定性 build 入口；生成目录和测试报告不进入版本控制。
- US1：T006—T008 的先行测试在 T009—T014 实现后通过，并提供 `IQA-001` 的本地真实浏览器可观察结果。
- US2：T015—T017 的先行测试在 T018—T022 实现后通过，并提供 `IQA-002`—`IQA-004` 的本地真实浏览器可观察结果；Mock、`/healthz` 或 build 结果不得替代这些证据。
- Coding readiness：T023—T026 提供 Dockerfile、deployment contract、clean-runner 命令、四个 IQA 自动化入口及本地 container smoke 输入。
- Candidate SHA、registry digest、远程部署/QA target、Independent QA、UAT、发布审批、Review 和 Merge 证据由后续平台阶段产生，不是上述任务的完成前提。
