# 项目技术基线

**版本：** 1
**批准基线记录 SHA-256：** `e4f3efe692d50333f6439202a8ec0d6a5f99003d5aea37a833663a904fe27690`
**选择模式：** `agent_proposed`

## 技术要求



## 标准与约束

必须保持已批准的最小产品范围；凭据仅保留在服务端，支持时使用 managed identity；验证输入并执行 least privilege，不记录 secret 或客户内容；每项用户可见能力必须具有可独立执行的验收场景，Mock、health check 或 build 成功不能替代 functional acceptance；若引入外部 integration，必须针对真实测试服务执行 contract、integration 和 end-to-end 测试；Coding 沙箱不得访问 Azure/云资源、远程部署环境、托管身份、网络或 RBAC；CI、Independent QA、人工审批和发布证据均为必需门禁；Production candidate 必须包含 Dockerfile，并在 active Feature 下提供 runtime/deployment.json，项目特有 setup 与 staticAnalysis、build、developerTests 验证命令必须可在 clean runner 上幂等执行。

## 已批准的 Agent 建议

- 推荐基线（Option A）：采用 Node.js 24 LTS、Fastify 5 和原生 HTML/CSS/JavaScript，单一进程同时提供首页静态资源与同源 GET /api/status；浏览器在首次加载及用户点击重新尝试时发起独立请求，只把当前请求结果呈现为“ok”或明确失败。选择该方案是因为仓库当前无应用代码、业务仅有单页和一个无持久化状态读取，原生前端可避免 React/Vite 等非必要构建层，Fastify 则以较小依赖面提供明确 HTTP/error contract 与可测试 adapter 边界。服务保持无状态，不使用数据库、消息系统、身份服务、telemetry backend 或其他 managed cloud service；以 OCI container 交付至平台后续批准的 container runtime，监听由环境变量提供的端口，并提供仅供部署探测的 /healthz（不能作为功能验收）。状态 adapter 默认反映进程内可用状态；测试与 Independent QA 通过服务端环境配置选择成功或失败结果，不向浏览器暴露控制入口。安全控制限于同源访问、严格枚举 adapter 结果、通用失败响应、安全响应头、非 root container、只读应用文件、最小环境变量及不记录请求内容/secret；本范围没有用户凭据或授权。Developer 环境执行静态分析、build、unit/component 测试及浏览器 functional tests；平台 CI 在 clean runner 重复这些检查并构建 container；Independent QA 对同一已部署 Candidate 分别执行 IQA-001 至 IQA-004。运维约束为单实例无持久状态、请求失败不自动重试、每次用户重新尝试只产生一次新请求；水平扩缩不依赖 session affinity，失败恢复采用重新部署或回滚同一不可变 image。具体 cloud provider、managed service、SLO、容量、超时和保留期限均无获批来源，不纳入基线。
- Option B：采用 .NET 10 LTS、ASP.NET Core Minimal API 与原生 HTML/CSS/JavaScript，仍使用单一无状态 container、同源 GET /api/status、服务端可配置状态 adapter，以及与 Option A 相同的安全、环境分层、验收和运维边界。优势是 runtime 与框架具有统一的长期支持周期、内建配置/日志/health primitives，并能减少第三方 server framework 依赖；代价是对当前极小页面而言 image 与 SDK bootstrap 通常更重，仓库也没有既有 .NET 资产可复用。若组织运行平台已标准化 .NET 10，该方案可替代推荐基线；否则不如 Option A 精简。无需新增 cloud service。
- Option C：采用 Node.js 24 LTS、React 19、Vite 7，并以 Fastify 5 提供同源 GET /api/status；部署、安全、adapter、测试环境和无状态运维边界与 Option A 相同。优势是后续若已获批范围发展为复杂交互，可获得成熟 component model 和前端测试生态；代价是为当前单页、两种结果和一个重试操作引入额外依赖、bundle/build pipeline、升级面与 client state 复杂度，且不存在已批准的后续复杂 UI 需求，因此本次不推荐。将 API 改为 provider-specific serverless function 或引入 Azure/AWS/GCP managed service 也不推荐，因为当前没有获批 provider、外部 integration、数据库、身份或弹性目标；只有后续技术约束明确指定 provider 时才应重新评估。