# LifeSpace 当前开发进程（跨聊天交接）

## 最新专项检查点｜W4 R2 读取来源标识（2026-11-20）

- **正式请求证据继承：**Chrome A 已核实 Owner UID 匹配；正式 W4 v105 的原图与缩略图请求均 HTTP 200，字节数分别为 25,483／14,250，尺寸分别为 800×600／600×450；两份 SHA-256 均匹配此前独立读回的 R2 对象。响应未提供来源标识，因此只能签收 Owner 身份与双图 HTTP，不签收本次请求的 R2 来源。
- **候选基线：**以 Release 分支 `release/lifespace-r01-r2-client-20261118` 的父提交 `44b8ae5900be4d82b7a799fe8b2eaba5293ab2ec` 建立独立分支 `candidate/lifespace-w4-r2-source-header-20261120-r01`；没有基于或改写 PR #103 的候选提交。实现提交 `648965add1ae994386807e4d243279ffe4eebf6f`。
- **最小源码改动：**`cloudflare/r2-media-user-gateway.mjs` 仅在完成读取及二次授权后的 HTTP 200 响应增加 `X-LS-Media-Source`：R2 成功为 `r2`，Storage 回退成功为 `storage-fallback`。所有 `image_unavailable` 错误响应不带该头；不改变图片字节、状态码、授权、HMAC、缓存策略、回退顺序或数据库／R2 内容。
- **回归测试：**`tests/r2-media-user-gateway-read.test.mjs` 增加 R2 命中、R2 不可用／缺失后的 Storage 回退、R2 关闭时 Storage 路径及错误响应不带来源头的断言。定向四文件 Node 测试 **28/28 PASS**；涉及两个 JS 文件 ESLint PASS；保留 CRLF 的 `git -c core.whitespace=cr-at-eol diff --check` PASS。
- **保护边界：**本轮未部署、未切换流量、未修改 Cloudflare 配置／Secret、Supabase 正式库、R2 对象、前端代理开关或 APP。正式 W4 v105、媒体 Worker v3 保持原状；PR #103 仍 Draft。
- **下一步：**完成状态文档提交并推送本独立候选分支，远端核对 SHA 与文件内容；之后等待批准在正式环境部署诊断版本并重新发起 Owner 双图请求。未完成该真实请求前，不得把历史 HTTP 200／SHA 一致改写为 R2 来源 PASS。

## 最新专项检查点｜123 R02 媒体源对象字节校验（2026-11-12）

- 统一源码 `development/lifespace-unified-r01`，本轮起点 HEAD `54de3c136aff611ee5dd0781403a1595d42b785d`；原有 Android Gradle、`mobile-shell/index.html`、`.wp10-delivery/` 未提交成果保持原状。
- 修复 `cloudflare/r2-media-user-gateway.mjs`：对 Supabase Storage 原图／缩略图分别查询对象长度并与下载字节比较；`media.size_bytes` 继续只表示两个文件合计计费量。真实隔离样本 14,663 + 10,997 = 25,660；不匹配或 Storage 元数据不可用时禁止后续 R2 请求。
- 定向测试 `tests/r2-media-user-gateway-media-id.test.mjs` 5/5 PASS；网关安全、QA 一次性 UI 和签名 stage-bytes 定向回归合计 41/41 PASS。继承 112 原 60/60 证据，不重新执行全任务。
- 仅 SOURCE FIX + ISOLATED TEST。未部署 Worker、未真实镜像、未写 R2、未修改计费 RPC；本轮补丁及 SHA 另存专项交付文件，保持未提交，等待统一总控安排。


> 最近整理：2026-10-15（北京时间）。本文件是**人工／执行任务结束时更新的检查点**，不是自动实时监控、上线批准或完整验收报告。
>
> 可信度：Git／代码与正式站状态由 2026-10-15 只读核查确认；R6 的真机结果引用用户提供的 Work 终态报告；较早的 QA 与 Cloudflare 配置记录为历史检查点，继续操作前应重新核对。

## 当前受保护基线

- 仓库：`yoyomibaobao-sys/life-space`；当前任务工作树：`pr95-ci-isolated`；PR：[#95](https://github.com/yoyomibaobao-sys/life-space/pull/95)，**Draft、未合并**。
- 最近确认 HEAD：`fa23f3b80c1237652a9b33f8374676f9b6a410b5`；2026-10-15 核查有 **160 项已修改／未跟踪内容，暂存区为空**。数量只是本次观察，不可作为未来必须相等的硬指标。所有既有改动、未跟踪文件与 QA 资料受保护。
- 2026-10-15 已对 `AGENTS.md` 与 `docs/product-roadmap.md` 写入并核对：简约设计、管理员内容治理、体验30天处理期结束关闭访问而非自动物理清理，五区间实际删除方案延期冻结。**规则修改不代表后端已部署。**
- 任何任务开始均须重新读取 `AGENTS.md`、`docs/product-roadmap.md` 和本文件，并检查当前实际 Git 与环境；冲突时以最新总纲、真实代码／运行证据和用户新决定为准，禁止用本文件覆盖源码。

## 工作主线检查点

| 主线 | 已有结果与证据 | 当前阻断／未验证 | 下次只做什么 |
| --- | --- | --- | --- |
| Android / PR #95 | R6/D4、D6QA3真实MP4／编辑关联、桌面名称、公开链接分享和D3封面上传／回滚／重试的既有通过证据保留。22:09新独立d3editqa／2026101507真机：编辑Intent正确到QA HTTPS；App原作者登录、匿名编辑转QA登录页、关闭CustomTab回原帖、旧12包及资料保护通过，见最新复验节。 | **源站代码修复已真机通过，网页认证仍环境阻断：**真实Turnstile显示“無法連線至網站”，一次正常刷新后仍相同；未填写网页凭据或绕过验证码。作者编辑表单、保存、网页登录／退出及非作者权限闭环未验证，D3整体未收口。Android11+、正式签名覆盖升级等门禁另待验。 | 先核验该临时QA域名的验证码授权及验证服务连通性；远端配置变更另行核准。随后只补既有帖的作者编辑／取消返回与网页登录退出、非作者权限，不重测旧通过项，不清理数据、不改NativeShare。PR保持Draft。 |
| 临时／隔离 Supabase QA 数据库 | 原有 Android 专用账号、项目、媒体仍被 PR #95 真机及恢复验收引用；2026-10-13 交接曾记录专用试验资料。 | 尚未取得 Android 全部门禁结束及 QA 数据解除占用的批准。**不得清空、迁移、复用或删除**这批数据。 | Android 必需验收后，先做只读清点、证据保全与资源释放确认，再按既定计划衔接 PayPal、Cloudflare 工作。独立 QA 准备可并行，不将生产库当临时库。 |
| PayPal | GitHub [PR #81](https://github.com/yoyomibaobao-sys/life-space/pull/81)、[PR #82](https://github.com/yoyomibaobao-sys/life-space/pull/82) 已合并：一次性 US$8/年的自动开通核心与运行时开关已进主线；过往 Sandbox 模拟支付／退款有既有测试成果。2026-10-15 只读请求 `https://life-space.uk/api/paypal/status` 得 `enabled:false`。 | PR #95 内 Checkout、Return、Webhook、会员开通仍有未提交改动；正式站未开放自动付款。独立 Cloudflare PayPal QA、完整 Sandbox／退款、Live 真单是否已通过需以最新证据复核；不得由旧测试推断生产通过。 | 保护既有 Sandbox 成果；优先复用既定独立 QA 方案（本地 Supabase + HTTPS Tunnel／隔离环境），核对 Worker 与数据库身份，再验收 Capture、签名 Webhook、幂等、权限、退款和 Plus。**不得先开启 Live。** |
| Cloudflare | `life-space.uk` 正式网页与 `/api/health` 于 2026-10-15 实测 200 且经 Cloudflare；仓库 Worker `life-space-canary` 已绑定 `R2_MEDIA_CANARY`。 | 这不等于生产全迁移。2026-10-11 核查：Vercel 保留每日 Cron，Cloudflare 当时无对应 Trigger；原 Supabase Storage 媒体到 R2 的实际迁移／容量／读写／权限尚未完成证明。需复查当前控制台状态。 | 并行只读盘点正式域名、Worker、R2、Supabase Storage、Cron、环境变量和日志；待 QA、可回退机制及用户批准后，才分阶段切换维护任务，防重复运行或漏跑。 |
| 会员生命周期 | 总纲和路线图已确认 30MB／90天、结束后30天只读处理期、期满禁止访问、不自动物理清理；付费 Plus 长期保留只读，清理前开通可恢复仍存在资料。 | 旧生命周期 RPC／Cron、媒体访问路径及新迁移尚未完成隔离数据库与正式环境验收。PR #95 五区间物理清理实现冻结、执行入口锁定。 | 只读核实实际 RPC、Cron 和访问控制；隔离验收到期访问限制与 Plus 恢复，不触发真实数据清理。 |
| 管理员与网页简化 | 已只读审查当前会员后台及举报系统；既有举报队列可复用，当前总纲已加入“前台简单、后台可管理、操作留痕”及最小治理规则。 | 管理员举报处置尚缺独立验证的违规发言删除、公开内容下架／恢复、权限限制闭环；管理首页信息较繁杂。 | 在独立且不干扰 Android 验收的任务中，先核对实际界面，再做最小后台修改；不重做正常的集市、指引、个人空间页面。 |
| 正式收费发布 | 路线图与发布检查清单已存在；GitHub PayPal 核心已合并，网站域名已由 Cloudflare 服务。 | Android 门禁、会员生命周期、PayPal Live、R2／Cron、SMTP、权限与合规等未全部通过。 | 逐项补齐可证实的发布门禁，交付汇总报告，**未经用户明确授权不合并、部署、迁移数据库、开放收费或发布 APK**。 |

### NativeShare 构建侧检查点（2026-10-15，北京时间，历史记录）

- **R6 失败仍有效：**Huawei HMA-AL00、Android 10、versionCode `2026101406` 点经验卡“分享”时，系统面板未打开且无提示。本环境没有该手机，以下代码与构建结果**不能**把 D6 标成真机通过。
- **根因与修改：**Android WebView 的 `navigator.share` 打不开系统面板，`AbortError` 又被当成取消而不提示。未新增 `@capacitor/share`。新增 `NativeSharePlugin`，在 `MainActivity` 注册，复用 `${applicationId}.fileprovider` 与 `cache-path`。链接分享为标题加 `https://<origin>/experience-cards/{id}`；MP4 只接受含 `ftyp` 的文件，写入 `cache/native-share/` 后以 `video/mp4` 和读取授权交给系统。取消与系统返回都 resolve，打不开面板才用现有失败提示。网页非 Android 仍走 Web Share；Android 上 MP4 失败不触发本地下载。调用点：经验卡详情、列表和 `ExperienceCardVideoPanel`。
- **自动结果：**`tests/android-native-share.test.mjs` 与经验卡测试 19 通过。全量 `node --test --test-skip-pattern "two PostgreSQL sessions"`：747 通过、2 失败。失败均为缺少 `mobile-shell/offline.html`；单运行时壳构建会删除该文件，重建前同样缺失。`tsc --noEmit` 通过。Docker 双会话测试未计入通过。
- **QA APK：**`com.youshi.cultivation.d6qa`，versionCode `2026101501`，versionName `1.0.4-d6qa`。文件 `android/app/build/outputs/apk/d6qa/LifeSpace-d6qa-2026101501.apk`，5,179,252 字节，SHA-256 `c263216b90f9ba36dfad043bf6687dfa02b0edd48cf98e1c811f9ccd269fed02`。包内有 `NativeShare`、`shareText`、`shareMp4`，以及 `d6qa.fileprovider`。未安装、未覆盖设备上的 R6／R5／R4／正式包。
- **构建副作用：**Gradle 清理了 `android/app/build/outputs/apk/debug/`。构建前读到的本地 `app-debug.apk` 身份是 `com.youshi.cultivation.pr95safrecoveryverify`、versionCode `4`、versionName `1.0.4-pr95-safregrant-r4`；该文件字节未能留存。这不是已安装的 R6。SAF、照片、云资料和已安装应用本环境未改动，也未做真机只读核对。
- **仍未验证：**系统面板是否打开、目标应用是否收到公开链接、取消、分享后返回、MP4 是否被目标应用打开、编辑与返回是否回退。D3 仍缺匹配 QA HTTPS API 源站。PR #95 保持 Draft，未提交、推送、合并或部署。

### Work D6 真机接续检查点（2026-10-15 08:09—08:24，北京时间）

- **环境与安装通过：**工作树 `pr95-ci-isolated`，HEAD `fa23f3b80c1237652a9b33f8374676f9b6a410b5`；开测 158 项未提交／未跟踪、暂存区为空；Huawei HMA-AL00 / Android 10 / `HJS5T18B01022139` 为 device。完整读取三份当前规则／进度文档，保留新规则。现有 APK 5,179,252 字节，SHA 与构建报告一致；08:14 首次安装成功，没有覆盖 R4、R5、R6 或正式 App。
- **隔离阻断，尚无 NativeShare 真机结论：**安装启动后、输入任何 QA 凭据前，解压包内 `assets/public/index.html` 发现 Supabase client 初始化直接使用生产 URL；不是仅因页面 origin 为正式域名而推断。既有 QA project ref 未出现在包内。停止登录、分享、MP4 生成与编辑测试；随后仅停止独立 d6qa 进程，保留安装与全部资料。本轮不重建、不替换运行时配置；未主动操作生产账号、数据库、支付或配置。匿名启动流量没有完整采集，不能写成“完全没有生产请求”。
- **终态保护：**1,100 个 SAF 文件（含原 1,045 个）前后完全一致；6 个既有安装包路径及 SHA 保持，新增独立 d6qa 后共 7 个。新包设备 SHA 与构建文件一致；QA 项目、记录、媒体、卡片关系、集市和 Storage 全表只读数量／校验值不变。835 个开测源码文件在进度写回前无变化；本轮仅局部更新本进度文件。
- **照片保护异常：**1,868 个照片／下载文件总数不变，1,842 个校验一致；26 个差异全部位于 `Pictures/.gs` 与 `Pictures/.gs_fs0`，二次校验仍是变更后值。未执行照片保存、分享、删除、目录授权或清理，变化来源尚未确认；不得推定为 LifeSpace 写入，也不得声明所有照片保护通过。不恢复或删除这些文件。
- **后续只读复核（2026-10-15）：**现有 `protected-file-differences-readonly.json` 实列 26 项：`/sdcard/Pictures/.gs_fs0/.0.jpg`—`.12.jpg` 共 13 项，以及 `/sdcard/Pictures/.gs/com.taobao.taobao/.gs_fs0/0/.0.jpg`—`.12.jpg` 共 13 项；均为隐藏 JPG，`qaNamed:false`，差异文件二次校验已稳定。位置提示可能为非 LifeSpace 缓存，**但写入主体及原因没有证据，不得以推测解除保护异常**；继续保留前后哈希及原文件，不做复原。另已核对 `scripts/build-mobile-offline.mjs`：浏览器 Supabase URL 和公钥直接在**构建时**写入 bundle，必须在新 QA 包编译后校验真实 `createClient` 目标和配对公钥，不能只看包名或源环境变量；经验卡链接使用 `window.location.origin`，即使 Supabase 指向 QA，分享链接仍可能指向生产网站，必须事先确认隔离 QA 的公开可打开源站／目标链接，且不得对真实生产内容执行验收。
- **证据位置：**`C:\Users\67049\AppData\Local\Temp\LifeSpace-D6-NativeShare-Reverify-20261015`；重点为 `apk-qa-isolation.json`、`apk-client-call-confirmed.json`、`install-result.json`、`before-protection.json`、`after-protection.json`、`protected-file-differences-readonly.json`、原生日志及前后 QA 校验。用户报告另行交付为 `LifeSpace-PR95-D6QA-isolation-block-20261015.html`。
- **下一步：**见下方 d6qa2 构建检查点。原 d6qa 包保持停用登录。26 个隐藏 JPG 继续只读保留。

### D6 QA 构建隔离（2026-10-15，北京时间）

- **环境优先级：**`ANDROID_REQUIRE_QA_SUPABASE=1` 时，`scripts/build-mobile-offline.mjs` 只读取 `ANDROID_QA_SUPABASE_URL` 与 `ANDROID_QA_SUPABASE_PUBLISHABLE_KEY`。进程里已有的生产 `NEXT_PUBLIC_SUPABASE_URL` 和陷阱公钥不能替换它们；缺少 QA URL 时构建直接失败。生产 CI 不设置该开关，仍走原有 `NEXT_PUBLIC_*`。
- **新 APK：**`android/app/build/outputs/apk/d6qa2/LifeSpace-d6qa2-2026101502.apk`，5,179,616 字节。`applicationId` `com.youshi.cultivation.d6qa2`，versionCode `2026101502`，versionName `1.0.4-d6qa2`，SHA-256 `039a7e92f9db4ab45848f14d06dbeb8ed15f1a6b1aef0903c1da5fd453eb6257`。与原 d6qa 字节不同。原包哈希复查仍为 `c263216b90f9ba36dfad043bf6687dfa02b0edd48cf98e1c811f9ccd269fed02`。
- **解包证据：**`assets/public/index.html` 中 client 初始化 URL 为 `https://mablwxlipcgbmbnfdbkc.supabase.co`。包内两处 `sb_` 公钥相同，并与 Supabase 管理 API 对该 project ref 返回的 publishable key 一致。包内没有该项目的 service role、anon JWT，也没有父级 `.env.local` 的生产客户端密钥或 service role。生产 URL 只出现在“拒绝把 QA 会话发到正式站”的比较里，没有生产 client 初始化。本机对 QA Auth settings 的实时探测因连接重置未返回 200，身份以管理 API 与包内公钥比对为准。
- **分享与 API：**仓库、环境和文档中没有与该 QA 项目配套的 HTTPS API 源站。导出 origin 为空，匹配导出在请求前失败。QA 会话访问 `https://life-space.uk` 的远程 API 会在发出前抛出 `qa_export_to_production_rejected`。经验卡列表和详情的公开链接都走同一守卫；没有独立 QA 源站时抛出 `qa_share_origin_required`，只显示失败提示，不复制或分享正式站卡片链接。WebView 文档主机仍是 `life-space.uk`，这是本地壳的 origin，不是 QA API。未登录的健康探测仍请求正式站 `/api/health`，不携带 QA 会话。密码恢复沿用既有拦截，不把 QA 恢复令牌送到正式回调。
- **NativeShare 仍在包内：**dex 含 `NativeShare`、`shareText`、`shareMp4`；manifest 有 `android.intent.action.SEND` 的 `text/plain` 与 `video/mp4`，FileProvider authority 为 `com.youshi.cultivation.d6qa2.fileprovider`。分享功能未重写。
- **可交给 Work 的范围：**可与 d6qa、R6、R5、R4 和正式 App 并存安装。可用既有 QA 账号做登录，以及不含链接的真实 MP4 分享、取消和返回。公开链接被目标应用打开、D3 集市封面上传与回滚、任何带 QA 登录态的 `/api/` 写入，在出现独立 QA HTTPS 源站前保持阻断。不要把 `https://life-space.uk` 配成 QA 源站。
- **定向测试：**分享、远程 API 隔离、云导出和经验卡共 36 项通过；其中分享 4 项在两轮里各跑了一次。未重跑全量套件，也未把未运行的 Docker 双会话算作通过。真机尚未安装此包。
- **保护：**未改 1,100 个 SAF 文件、既有照片、26 个隐藏 JPG、QA 数据库、生产 Supabase／Cloudflare／Vercel／R2。未提交、推送、合并或部署。PR #95 保持 Draft。


### D6QA2 手机接续与保护核查（2026-10-15，北京时间）

- **执行范围：**Huawei HMA-AL00，ADB `HJS5T18B01022139`；本轮仅完成独立包安装、启动及只读保护复核。旧正式 App、R4、R5、R6、旧 D6 QA 包未覆盖。工作树原有变更、已确认总纲和路线图保留。
- **新包安装与启动：**从已验证的 `android/app/build/outputs/apk/d6qa2/LifeSpace-d6qa2-2026101502.apk` 成功安装 `com.youshi.cultivation.d6qa2`，哈希与构建侧检查点完全一致；应用出现正常欢迎页，点击“已有账号，登录”后 QA 登录表单正常，非启动白屏。
- **登录及功能阻断：**既有本机 DPAPI 加密 QA 密码及辅助脚本仍存在，但本轮自动使用受保护测试凭据的路径未能安全完成；**未填写／提交 QA 凭据，没有 QA 登录成功证据**。没有开始 MP4 生成、原生文件分享、目标接收、取消或编辑关联功能测试；这些项目全部维持 **未验证**，不能表述为通过。生产账户及生产 Supabase 均未用于测试。
- **只读资料保护：**与上一轮 Work 结束时保存的 `after-saf.txt`、`after-photos.txt` 校验清单对比：1,100 个 SAF 文件 **全部同路径同 SHA-256**；上一轮已有 1,868 个照片／下载文件 **全部同路径同 SHA-256**，包含先前 26 个隐藏 JPG 的变更后基线。当前共 1,871 个照片／下载文件，多出 3 个新增 JPG（`Pictures/Screenshots` 1 个、`Pictures/.thumbnails` 及其子目录 2 个）；旧文件未丢失或变化；新增来源未确定，不删除或推断为 LifeSpace 创建。原 7 个 LifeSpace 安装包的 Android 设备 APK 路径及哈希均与上一轮终态证据一致，另新增独立 d6qa2。
- **下一步：**先由有安全 QA 凭据操作能力的 Work／用户在设备上完成已有 QA 账号登录；之后复验 MP4 文件分享与实际目标接收、取消／返回、编辑无回退。若出现功能失败立即停止保存证据。独立 QA HTTPS API 源站缺失前不要测试生产站链接或 D3 的带登录态 API 写入。PR #95 仍 Draft；无源码修改、数据库迁移、提交、推送或部署。

### D6QA2 登录接续阻断（2026-10-15，北京时间）

- **新信息：**用户在手机 `d6qa2` 登录后报告“已登录”。连接端连续两次执行 `adb devices -l` 均无设备，因设备当前断连，未能用 WebView／原生界面核验已登录身份、经验卡或 MP4 分享；未执行任何分享／修改／删除测试。
- **QA Auth 只读检查：**隔离项目 `mablwxlipcgbmbnfdbkc` 中，早前聊天所指 `598505004@qq.com` 邮箱已确认但最近 90 分钟无新登录；另一个既有 QA 账号 `qq00oopp@qq.com` 有最近 90 分钟登录记录。两者身份不能混为一谈，不能仅凭 Auth 时间推断本机当前账号；不重置、不创建、不披露密码／令牌。
- **下一步：**USB/ADB 重新识别该 Huawei 后，只读确认 d6qa2 确实已登录 QA 项目，再沿前述 D6 范围执行 MP4 分享／取消／目标真实打开与系统返回；公开链接和 D3 仍环境阻断。既有 QA 测试数据和 1,100 SAF、照片／下载资料、8 个 App 不覆盖、不删除。

### D6QA2 原生分享通道烟测（2026-10-15，北京时间）

- **环境：**华为 HMA-AL00 Android 10，ADB `HJS5T18B01022139` 已恢复；d6qa2 内 WebView `#list` 显示用户名 `qq00oopp`、体验处理期只读及经验卡数 0。QA 数据库只读核查显示两张已发布卡均归 `pr95-sync-a` QA 作者，普通 QQ 登录的公开详情只读，不能执行作者的“生成/分享 MP4”完整 UI。
- **真实原生通道证据：**在 d6qa2 WebView 内直接调用已注册的 `NativeShare.shareMp4`，传入仅含 `ftyp` 头及空 `mdat` 的隔离测试文件；ADB `dumpsys activity activities` 证实 Huawei `com.huawei.android.internal.app/.HwChooserActivity` 成为 ResumedActivity。触发系统返回后 ResumedActivity 恢复 `com.youshi.cultivation.d6qa2/...MainActivity`，WebView Promise 状态为 `resolved:canceled`，详情页面仍可读。**这仅验证原生分享面板、FileProvider 基本传递、系统取消／返回；因文件不可播放，不能证明真实 MP4 内容、分享按钮 UI 或目标 App 实际播放。**测试文件仅写入 d6qa2 自身 `cache/native-share/`；未执行 QA 云记录改写。
- **只读保护复核：**测试后与前一轮 `after-saf.txt` / `after-photos.txt` 清单逐个对照：1,100 个 SAF 文件均未缺失／改动；既有 1,868 个照片和下载文件同路径同 SHA256，包含之前 26 个隐藏 JPG 的变更后基线。照片目录现有 1,871 个文件，新增 3 个 JPG 在 Screenshots 与 `.thumbnails`，其创建者未确定，原文件保护符合检查；没有清理或覆盖用户资料。
- **下一步：**保持 QQ QA 用户当前会话，不擅自退出；找到并安全使用原 `pr95-sync-a` 作者专用测试登录方式后，才做真实 MP4 生成／分享目标播放及编辑返回。普通链接分享、D3 继续待配套 QA HTTPS API 源站。PR #95 Draft；没有改业务源码、提交、推送、合并、部署或操作生产资料。

### D6QA2 原作者与真实 MP4 复验（2026-10-15 13:05—13:20，北京时间）

- **环境与安全登录通过：**完整读取三份最新文档；HEAD 仍 `fa23f3b80c1237652a9b33f8374676f9b6a410b5`，开测 160 项未提交／未跟踪，暂存为空。Huawei HMA-AL00 / Android 10 / `HJS5T18B01022139` 在线；沿用 `com.youshi.cultivation.d6qa2` / `2026101502` / `1.0.4-d6qa2`，SHA `039a7e92f9db4ab45848f14d06dbeb8ed15f1a6b1aef0903c1da5fd453eb6257`。既有验收私有夹具明确对应 `pr95-sync-a-20261013-1719@example.com`；密码仅在本机进程内读取后填入正常登录表单，完成界面人机验证，确认作者 ID `f99fd44d-820f-41f2-ad4e-85feb7c990a6` 及有效云体验。经用户本轮授权仅切换 d6qa2，未新建账号、重置密码或直接写数据库；不记录密码或令牌。
- **真实生成及系统面板通过：**从“我的经验卡”打开原 R5 卡 `265bfd6e-68db-438b-a2e0-22792406e469`，四条来源记录／一张图片保留。点击现有“生成MP4”，产物 H.264 / 720×1280 / 32.333333 秒，在 App 内实际播放；文件 1,108,102 字节，SHA `e53f3d99d5ed90675e95126a8db2b1b2c4067366d9472e453d6eea6f00144c82`，含 ftyp／moov／mdat／avc1／avcC。点击真实 UI“分享MP4”后，华为 `HwChooserActivity` 显示该文件及 1.11 MB。
- **已确认失败，停止功能测试：**选择“用OPlayer播放”后，d6qa2 在 `activityStopped / PendingTransactionActions$StopInfo.run` 原生崩溃：`TransactionTooLargeException: data parcel size 6022336 bytes`，13:15:48、PID 3699。接收端进入首次使用条款／存储权限说明，未授予权限或接受条款；崩溃时间早于该提示的返回操作。已保存截图、原生日志及真实文件，只读确认 d6qa2 进程与 Activity 已消失；没有重新启动、再次分享、生成第二份视频或测试其他功能。目标实际播放、真实文件取消／返回、编辑关联仍未验证。
- **只读定位与 Cursor 最小建议：**`NativeSharePlugin.shareMp4` 将原带大 Base64 的 PluginCall 交给 `startActivityForResult`；当前 Capacitor `Plugin.saveInstanceState` 及 `Bridge.saveInstanceState` 都序列化该 call data。建议在 MP4 缓存写入成功后、启动分享 Activity 前剥离大数据字段，仅保存必要小元数据，并验证两处状态均不再携带视频；本轮未应用任何修复。既有 24 字节烟测不覆盖这个真实体积故障。
- **终态保护通过（本轮基线）：**13:08:59—13:20:04 对比，13 个 SAF 目录／1,100 文件、1,871 个照片／下载文件均同路径同 SHA，无新增或缺失；先前 26 个隐藏 JPG 的变更后值保持，其历史成因仍未解除。8 个已有安装包的路径与 SHA 均保持。QA 项目13、记录24、媒体9、卡片2、卡片来源7、帖子5、帖子媒体2、Storage对象14，前后内容摘要完全一致。真实分享文件只进入 d6qa2 私有缓存并另存证据；未写入系统相册、下载或 SAF。835 个开测源码文件在进度更新前无变化，本轮仅局部更新本文件。
- **证据与交接：**`C:\Users\67049\AppData\Local\Temp\LifeSpace-D6QA2-RealMP4-20261015-1308`；重点 `15-generate-mp4-result.json/png`、`17-real-mp4-native-chooser.png`、`18-oplayer-received.json/png`、`21-shared-file-proof.json`、`22-crash-pid3699-redacted.log`、前后保护／QA 校验。报告 `LifeSpace-PR95-D6QA2-real-mp4-crash-20261015.html`。公开链接和 D3 继续环境阻断；该轮未改业务。崩溃证据与真实视频保留。

### D6 真实 MP4 状态崩溃修复（2026-10-15，北京时间）

- **核对：**HEAD `fa23f3b80c1237652a9b33f8374676f9b6a410b5`，160 项未提交／未跟踪，暂存区为空。崩溃日志确认 d6qa2 PID 3699 在 `activityStopped` 抛出 `TransactionTooLargeException`，parcel 6,022,336 字节。Capacitor `Plugin.saveInstanceState()` 序列化 `savedCall.getData()`，`Bridge.saveInstanceState()` 另外把同一个 `pluginCallForLastActivity.getData()` 写入 Bundle。
- **修改：**只改 `NativeSharePlugin.shareMp4`。`writeMp4` 关闭缓存文件后、`openChooser`／`startActivityForResult` 前，对原始 `call.getData()` 执行 `remove("data")`。没有覆盖 `saveInstanceState`。标题、文件名和 `shareFinished` 的完成／取消回调保留。MP4 生成、面板、FileProvider 和网页分享未改。
- **自动结果：**`tests/android-native-share.test.mjs` 5 项通过，含 1.5MB 载荷在两条状态路径中不再出现，以及网页分享和取消回归。经验卡 15 项通过。`tsc --noEmit` 通过。`shareMp4` 字节码顺序为 `writeMp4` → `getData` → `remove("data")` → 之后才 `openChooser`。
- **新 APK：**`android/app/build/outputs/apk/d6qa3/LifeSpace-d6qa3-2026101503.apk`，5,179,628 字节。`applicationId` `com.youshi.cultivation.d6qa3`，versionCode `2026101503`，versionName `1.0.4-d6qa3`，SHA-256 `6bd7cc2c0c6aef95c3b739e6ffff25e2aef254c4f9af09cf4f12546a8e0e06fe`。解包 client 为 `https://mablwxlipcgbmbnfdbkc.supabase.co`，公钥与该项目管理 API 的 publishable key 一致；没有生产 client 初始化、生产客户端密钥或 service role。dex 仍有 `NativeShare`、`shareText`、`shareMp4`、`fileprovider`。
- **旧包：**d6qa SHA-256 仍为 `c263216b90f9ba36dfad043bf6687dfa02b0edd48cf98e1c811f9ccd269fed02`；d6qa2 仍为 `039a7e92f9db4ab45848f14d06dbeb8ed15f1a6b1aef0903c1da5fd453eb6257`。
- **下一步：**Work 并存安装 d6qa3，用原 `pr95-sync-a` 作者和原经验卡复验真实 MP4 分享、目标播放、取消、返回及编辑关联。本环境未上机，不能写成真机通过。公开链接和 D3 仍缺 QA HTTPS 源站。未提交、推送、合并、部署或清理 QA 数据。PR #95 保持 Draft。

### D6QA3 崩溃修复独立真机复验（2026-10-15 15:23—15:39，北京时间）

- **前检通过：**完整读取当前总纲2030行、路线图231行及进度113行；HEAD 仍 `fa23f3b80c1237652a9b33f8374676f9b6a410b5`，160项未提交／未跟踪、暂存为空。Huawei HMA-AL00 / Android 10 / `HJS5T18B01022139` 在线，开测未装 d6qa3。APK `com.youshi.cultivation.d6qa3` / `2026101503` / `1.0.4-d6qa3`，5,179,628字节，文件和设备 SHA 均为 `6bd7cc2c0c6aef95c3b739e6ffff25e2aef254c4f9af09cf4f12546a8e0e06fe`；本轮未重建。
- **实际包隔离与修复通过：**包内 Supabase client 初始化为隔离 QA `mablwxlipcgbmbnfdbkc`；publishable key 只用指纹与项目管理接口比对，未输出 key。生产 URL 仅为拒绝生产访问／回调的守卫比较，无生产 client 初始化。Manifest 确认独立 FileProvider authority 与 SEND/video/mp4；实际 `classes11.dex` 指令确认 `writeMp4 → getData → remove("data") → openChooser`。上述全部通过后才首次并存安装，没有覆盖旧8个包。
- **安装、登录和真实生成通过：**使用原私有测试夹具正常登录 `pr95-sync-a-20261013-1719@example.com`，未新建／重置或直接写库，未泄露密码或令牌。复用原 R5 卡 `265bfd6e-68db-438b-a2e0-22792406e469` 及四条记录／一张图片；真实 H.264 MP4 为720×1280、32.333333秒、1,126,215字节（界面1.13MB），SHA `37a1a4a058677b850367ff5ebdfee3646e1d9e0a28a23c35758c8f71d818c953`，App 内真实播放通过；两次分享缓存副本与原 Blob 同 SHA。
- **真实系统分享及崩溃修复通过：**从真实“分享MP4”按钮打开华为 `HwChooserActivity`，选“用OPlayer播放”。系统任务证据显示 OPlayer 的 `ACTION_SEND video/mp4`、d6qa3 FileProvider URI 与 `readUriPermissions`。发送端从生成、目标选择到返回及取消后均保持 PID `15747`；本进程 crash buffer 无新条目，未重现 `TransactionTooLargeException`。结论限本轮约1.13MB真实文件／Android 10，不替代所有体积和平台验收。
- **目标应用独立阻断：**OPlayer 仍停在“温馨提示”首次使用条款／手机存储权限说明。未点击“同意”或授予额外权限；实际文件读取和播放没有证据，故目标实际接收／播放标为阻断，不能将 Intent 到达视为完整播放通过。系统返回未关闭该说明；点击“拒绝”后回到 LifeSpace 原 R5 作者详情。
- **取消及返回通过（限定已测路径）：**退出接收端首次使用说明后，以及再次分享真实文件、不选目标直接按系统返回后，均回到同一经验卡 `experience-detail`、`returnTo:my-experience`、history length 4；原 MP4 同 SHA、继续播放，导航未丢失。目标实际播放后的返回仍未验证。按“前面全部安全通过后继续”的本轮门禁，D6-5 编辑关联未进入；原 R6/D4 通过结果保留，不重复整套测试。
- **终态保护通过：**15:27:47—15:38:44 的前后快照，13个 SAF 目录／1,100文件及1,871照片／下载文件均同路径同 SHA，无新增、缺失或变化；先前26个隐藏 JPG 变更后值保持，历史成因未解除。旧8个安装包路径与 SHA 不变，另新增 d6qa3 后共9包。QA 项目13、记录24、媒体9、卡片2、来源关系7、帖子5、帖子媒体2、Storage对象14，数量及内容摘要一致。仅在 d6qa3 私有缓存生成两份同内容分享副本，另存 Windows 证据；没有保存到手机相册／Download／SAF、清理或覆盖原资料。835个开测源码在进度写回前无变化。
- **证据与下一步：**`C:\Users\67049\AppData\Local\Temp\LifeSpace-D6QA3-Reverify-20261015-1523`；含 `apk-isolation-redacted.json`、实际DEX片段、`01-install-launch.json`、`06-generated-mp4.json/png`、`08-oplayer-after-selection.json/png`、`10-return-from-oplayer.json/png`、`11-shared-file-proof.json`、`13-real-share-canceled-return.json/png`、`14-final-native-status.json`、前后保护及QA摘要。报告 `LifeSpace-PR95-D6QA3-reverify-20261015.html`。只更新本轮进度，未改业务源码／生产／支付／数据库结构或会员状态，未提交、推送、合并、部署或清理。PR #95 保持 Draft；D6 完整通过条件尚未满足。

### D6QA3 剩余真实 MP4 验收收口（2026-10-15 15:55—16:08，北京时间）

- **续接范围：**完整读取总纲2030行、路线图231行、进度124行，保留最新简约设计／治理／按需清理规则；HEAD 仍 `fa23f3b80c1237652a9b33f8374676f9b6a410b5`，160项未提交／未跟踪、暂存为空，835个开测源码文件在进度写回前无变化。Huawei HMA-AL00 / Android 10 / `HJS5T18B01022139` 在线。沿用已装 `com.youshi.cultivation.d6qa3` / `2026101503` / `1.0.4-d6qa3`，文件与设备 APK SHA 均仍为 `6bd7cc2c0c6aef95c3b739e6ffff25e2aef254c4f9af09cf4f12546a8e0e06fe`；不重建、不安装、不改 NativeShare。
- **原资料复用通过：**启动后自动恢复原 QA 作者会话，从“我的经验卡”打开原 R5 卡 `265bfd6e-68db-438b-a2e0-22792406e469`；App 自动恢复本机已生成视频，无需重新生成。视频32.333333秒、720×1280、1,126,215字节，SHA `37a1a4a058677b850367ff5ebdfee3646e1d9e0a28a23c35758c8f71d818c953`，与前轮一致；未新增账号、项目、记录、媒体或卡片。
- **目标实际接收／播放通过：**只读清点已装接收器，华为视频及 KMPlayer 均支持 `SEND video/mp4`，已有存储权限。实际从原“分享MP4”按钮打开华为面板，横向切换推荐目标后选“Play with KMPlayer”（`com.kmplayer` / 42.03.242）。系统证据为来源 d6qa3 的 ACTION_SEND、对应 FileProvider URI 和读取授权；KMPlayer 显示原卡画面与原记录字幕，媒体会话 `state=3`、进度13,150ms、speed 1.0、error=null，证明真实读取与播放，不再仅为 Intent 到达。未选择聊天／上传目标，未接受 OPlayer 条款；接收器运行权限前后完全一致，无新增授权。
- **发送端与返回通过：**两次复用同一真实视频，发送端全程 PID `22504`，当前进程 crash buffer 无条目。另一次在已确认 KMPlayer 正在播放时按 Android 系统返回，回到同卡作者详情、`returnTo:my-experience`、history length 3；原视频和导航保持，未重现 TransactionTooLargeException。前轮真实文件取消面板返回证据继续有效，不无意义重测。
- **编辑关联通过：**原作者详情点击“编辑经验卡”原位展开，读取正确来源项目 `bc1bb8b5-7727-40f0-aa3d-11a43dadf1f3`、全部四条原记录和一张600×375图片，显示“已选4/4”；“保存修改”禁用。未选择／修改／保存任何内容，收起编辑后系统返回“我的经验卡”，异步完成后仍为原2张卡；无白屏或 Router Context 异常证据。
- **终态保护通过：**15:59:09—16:08:04 前后，13个 SAF 目录／1,100文件、1,871照片／下载文件均同路径同 SHA，无新增、缺失或变化；先前26个隐藏 JPG 的变更后基线保持，历史成因未解除。现有9个 LifeSpace APK（含d6qa3）路径与 SHA 全部一致。QA 项目13、记录24、媒体9、卡片2、来源关系7、帖子5、帖子媒体2、Storage对象14，数量及内容摘要与前轮及开测一致；Storage摘要不包含访问时间，不等于重新下载全部对象字节。
- **私有分享缓存差异保留：**本轮正常分享生成两份同 SHA 的临时副本，结束时 `cache/native-share` 共3份；最早一份旧分享缓存不再在目录中。只读核对现有插件 `MAX_SHARE_COPIES=3` 及 `trimOldCopies`，与正常缓存上限行为一致；原本机生成视频和 Windows `actual-shared-mp4.mp4` 证据仍在，原始项目、图片、SAF及云资料不受影响。已留存缓存前后文件名／哈希，未手工清理或恢复文件。
- **证据与结论：**`C:\Users\67049\AppData\Local\Temp\LifeSpace-D6QA3-Continuation-20261015-1555`；重点 `05-restored-existing-mp4.json`、`09-kmplayer-received.json/png`、`10-kmplayer-state.json/png`、`16-kmplayer-before-system-back-redacted.json`、`17-return-after-kmplayer-playback.json/png`、`18-original-card-editor.json/png`、`19-editor-collapsed-no-save.json`、`21-final-native-and-ui.json`、前后保护和QA摘要。报告 `LifeSpace-PR95-D6QA3-MP4-closeout-20261015.html`。D6QA3真实 MP4 子项收口通过；公开链接分享／D3继续独立源站阻断，其他Android发布门禁不默认为通过。本轮仅局部更新本进度，无业务代码／生产／迁移／支付变更，无提交、推送、合并或部署；PR #95 保持 Draft。

### Android 桌面显示名独立修改（2026-10-15，北京时间）

- **用户已确认：**仅将 Android 桌面应用显示名称由“有时·耕作”改为 `LifeSpace`；App 内页面、网页、图标、启动画面、布局、业务、数据、正式 applicationId、签名和升级机制均不得改变。
- **本轮最小源码修改：**`android/app/src/main/res/values/strings.xml` 中 `app_name` 与 `title_activity_main` 各一处改为 `LifeSpace`（launcher Activity 自带 label，不能只改 application label）；`capacitor.config.ts` 中 `appName` 改为 `LifeSpace`；`tests/android-shell.test.mjs` 仅更新相应名称契约。忽略版本生成的 `android/app/src/main/assets/capacitor.config.json` 中 `appName` 同步为 `LifeSpace`，其他键未动；未更改 AndroidManifest 路由、权限与图标，也未改变 bundled 页面文字。
- **验证结果：**静态名称／Manifest 资源引用、正式 `appId` 不变的断言通过，改动范围 `git diff --check --` 检查无空白错误。现有 `tests/android-shell.test.mjs` 全套执行遇到先前已知的 `mobile-shell/offline.html` 缺失失败，不得归因于此次改名，也不能报告测试全通过。
- **隔离 APK 状态：**采用临时 Gradle init 脚本将 `:app` 构建输出改到 Windows Temp 并设置独立 `com.youshi.cultivation.labelqa20261015` / `2026101504` 测试身份；首次 JAVA_HOME 缺失，补用 Android Studio JBR 后构建超时（120 秒），临时输出目录未生成 APK，**没有真机安装及系统桌面标签验证**。原 `d6qa3` 包及原 `debug/app-debug.apk` SHA 均为 `6bd7cc2c0c6aef95c3b739e6ffff25e2aef254c4f9af09cf4f12546a8e0e06fe`，未覆盖。
- **下一步：**先在受控 QA 构建环境重新验证打包工具链和构建输出隔离，然后生成新的独立 APK，解包检查实际 label 为 `LifeSpace`，再由 Work 并存安装观察桌面图标及系统最近任务标签。保留现有9个安装包、QA 原资料、SAF／照片及 D6QA3 已通过证据；不直接覆盖正式 App。待 QA 证明通过后，此单点改名才算真机完成。PR #95 保持 Draft，未 commit、push、merge 或部署；公开链接分享和 D3 的 HTTPS QA 源站阻断不变。

### Android `LifeSpace` 桌面改名独立 QA 验收通过（2026-10-15，北京时间）

- **卡点与构建：**上一轮超时的 Gradle 进程经 `jcmd` 证实卡在 Windows 原生控制台检测 `WindowsConsoleFunctions.isConsole`，非源码编译错误；本轮改用无交互标准输入和禁用 Gradle native console 检测，**隔离构建 37 秒成功**，166 项任务中 34 执行、132 up-to-date。未修改业务源码来绕过环境。Gradle 独立输出保存在 Windows Temp，不覆盖项目 `android/app/build/outputs/apk/` 任何既有 APK。
- **实际新 APK：**`C:\Users\67049\AppData\Local\Temp\LifeSpace-LabelQA-20261015\app-build\outputs\apk\debug\app-debug.apk`；`applicationId=com.youshi.cultivation.labelqa20261015`，versionCode `2026101504`，versionName `1.0.4-labelqa`，大小 5,179,600 字节，SHA-256 `0c3bbbe18044afc6435c666c03cc304ac9d762ba10b074267ed0869b3bf99921`。`aapt dump badging` 证实 `application-label` 和 `launchable-activity` label 均为 **LifeSpace**；`apksigner verify` 通过。包内 `assets/public/index.html` 与此前已验收的 d6qa3 **SHA-256 完全一致**，仍是同一隔离 QA 网页资源，未替换为新的生产内容。打包 Capacitor 元数据 `appName=LifeSpace`，基础 `appId=com.youshi.cultivation` 未改。
- **真机可见性通过：**Huawei HMA-AL00 / Android 10，ADB `HJS5T18B01022139`；新包并存安装成功。华为系统“最近任务”无障碍节点 `text=LifeSpace`，Launcher 桌面另一页的图标节点 `text=LifeSpace` 且 `content-desc=LifeSpace`，系统打包名称和真实 UI 均已证实。首次打开成功；**没有在独立名称 QA 包内登录或测试云写入**，不把本轮改名验收解释为完整 Android 发布门禁通过。
- **资料保护与历史安装：**原9个 LifeSpace 相关安装包设备 APK 哈希与安装前快照全部一致，新包独立成为第10个；新包安装后的设备 APK SHA 与本地文件 SHA 相同。按前轮 D6QA3 终态 `after-saf.txt` 与 `after-photos.txt` 逐文件重新计算哈希：**1,100 个 SAF 文件、1,871 个照片／下载文件均同路径同 SHA，无新增、变化或缺失**；此前26个隐藏 JPG 的历史来源仍未知，仅验证它们的既有终态未变化。QA 数据库未执行修改、用户内容未迁移或清理。保留用户原有桌面快捷方式与页面。
- **测试及明确局限：**改名资源及 Manifest 静态契约、受控打包、签名及真机桌面／最近任务验收通过；`tests/android-shell.test.mjs` 在跳过已知缺失的 `mobile-shell/offline.html` 首项时，其余6项通过。**首项仍未运行成功，不得称全量测试通过。**正式 `com.youshi.cultivation` 覆盖升级、正式签名／Android 11+ 未在此独立 QA 标识上验证，发布前仍单独执行；当前正式 App 未更新名称。
- **证据与交接：**`C:\Users\67049\AppData\Local\Temp\LifeSpace-LabelQA-20261015`，重点 `isolated-gradle-build.log`、`old-android-apk-baseline.json`、`post-install-saf-photo-protection.json`、`labelqa-final-verification.json`。`device-after-install-integrity.json` 中旧的 `xargs sha256sum` 管道出现空输入误报，已由后续**直接对设备 APK 路径运行 `sha256sum`** 校正，最终证据以 `labelqa-final-verification.json` 为准。仅此前确认的3个受控源码／测试文件做了名称相关修改，本轮主要是构建与验收；没有额外视觉、功能或数据回退。PR #95 Draft，未 commit、push、merge、deploy，也未发布正式 APK。**下一个 Android 阻断仍是独立 QA HTTPS API 源站，之后完成公开链接分享和 D3**；勿重复 D6QA3 MP4 及本轮已通过的改名真机测试。


### 独立 QA HTTPS 与 Android 剩余验收检查点（2026-10-15，北京时间）

- **当前基线保护：**开始时完整读取本轮总纲2030行、路线图231行和进度152行；20:39续接确认三份文档仍为当轮已读哈希。HEAD 仍 `fa23f3b80c1237652a9b33f8374676f9b6a410b5`，163项未提交／未跟踪、暂存为空；835个开测源码文件在本次进度写回前全部同SHA。未修改共享业务源码、NativeShare、管理员后台、总纲或路线图。已通过的D6QA3、R6/D4及桌面名称验收不重测。
- **临时环境预检通过（历史在线阶段）：**复用已有cloudflared，以临时源码副本的实际Next.js路由配合本机限制代理建立 `https://penalties-given-bargains-aug.trycloudflare.com`；未部署远端应用、创建远端资源、改正式DNS／Worker／流量。显式配置隔离QA `mablwxlipcgbmbnfdbkc` 和配对publishable key，禁用支付／生产媒体代理；服务器出站限定QA和本轮源站，不接受未验证重定向。只在临时副本补齐匹配的Lightning CSS原生依赖、配置准确的开发来源域名，以及为QA子进程使用已有系统代理；原源码、共享依赖、全局网络和证书校验未改。
- **Auth／CORS／实际接口：**QA Auth settings 200、公钥匹配；无Bearer封面PUT为401，外域OPTIONS为403，本QA origin OPTIONS为204且无通配CORS。用原作者的既有会话向本轮已验证QA源站探测不存在UUID：实际封面PUT无效载荷400、合法空封面404，帖子DELETE404，均为预期JSON；未删除、回滚或修复旧帖子。代理进一步限制写入只能指向本轮新建且带专用标题前缀的作者帖子。服务端未配置service-role清理worker，已提交媒体的后续清理完整性仍须另行预检，不能由404探测认定通过。
- **手机公开页面预检通过：**Huawei HMA-AL00／Android 10 曾在线用Chrome打开该QA原R5经验卡 `265bfd6e-68db-438b-a2e0-22792406e469`，未登录页面显示正确卡名、公开状态、原四条记录；QA Storage签名和图片请求200。此为直接打开的页面／接口证据，**不是从LifeSpace原生分享面板交给接收应用的端到端通过证据**。
- **新独立APK构建、隔离、安装及作者登录通过：**`com.youshi.cultivation.httpsqa20261015`／`2026101505`／`1.0.4-httpsqa`，5,179,000字节；SHA-256 `13ba652b96bad5dea07b85cbc2ad1b8a877241938fade58cda2274ab59c3bc99`。Node24.14.0、Android Studio JBR，mobile bundle约9秒、离线Gradle约94秒，产物仅在Windows Temp。实际包内client初始化及Storage上传均指向QA，公钥配对、QA HTTPS origin、独立FileProvider、NativeShare、单运行时和APK签名检查通过。生产Supabase URL的两处出现分别为导出／密码恢复的拒绝判断，非生产client初始化；既有无登录态正式站健康探测未改，不能宣称采集或阻断了全部匿名生产请求。检查全部通过后才无-r并存安装，设备APK SHA与文件一致；复用安全私有夹具通过正常表单登录原作者，未新建／重置账号，不记录凭据。原10个包未覆盖；新增后应为11包，最终设备清单仍待复核。
- **剩余功能未验证：**原生公开链接分享面板、目标应用从分享进入QA页、取消／返回、网页登录／退出权限；D3实际上传、封面显示、失败回滚、重试去重、孤立对象和越权检查均尚无完整真机证据。未提交D3表单，不重试R2/R3资料。未将直接浏览或接口404写成上述功能通过。
- **终态与当前阻断：**20:39 ADB无设备；20:46用户报告连接后复核仍为空，Windows即插即用也未检出Huawei／Android／ADB设备，真机检查待USB重新识别；本机临时API39305及隧道ready端口20241均ECONNREFUSED，原临时入口当前不可用。该APK已固定旧临时origin，后续先恢复并核实HTTPS入口，不能假定换一个临时域名后旧包会自动改用新地址。当前不擅自新建远端部署、正式域名或覆盖现有包。
- **数据保护证据：**开测13个SAF目录／1,100文件、1,871照片／下载文件与前轮基线一致，原10个设备APK已保存路径及SHA。20:39本地新APK SHA保持，全部835源码未变；续接时只读核对隔离QA项目13、记录24、媒体9、卡片2、来源关系7、帖子5、帖子媒体2、Storage对象14，数量及有序JSONB MD5均与开测完全一致（Storage摘要排除last_accessed_at，不等于重下载所有对象字节），本轮专用帖子0、删除任务／条目0。正常浏览产生QA统计事件，不包含在这八类内容表校验内。因手机断连，**本轮结束时的SAF／照片及全部旧安装包重新逐文件校验未完成**；不能沿用开测快照冒充终态通过。26个隐藏JPG历史差异继续保留。
- **证据／下一步：**`C:\Users\67049\AppData\Local\Temp\LifeSpace-QAHTTPS-20261015-1703`；重点 `https-preflight-unauthenticated.json`、`authenticated-api-preflight.json`、`phone-public-page-verified.json`、`apk-isolation-redacted.json`、`install-result.json`、`02-author-login-result.json`、`resume-protection-check.json`、`resume-local-services.json`。USB回连后先检查设备及HTTPS入口可达性，复用已安装作者会话；若临时域名无法恢复，先明确新的入口／并存包安排再继续。随后只做公开分享与D3缺口和终态保护。新远端部署／资源仍需单独批准；正式签名覆盖升级、Android11+、长期QA源站及其他未完成发布门禁不默认为通过。无commit、push、merge、deploy、生产／数据库结构／支付修改或QA清理；PR #95保持Draft。

### QA HTTPS 真机续接结果（2026-10-15 21:32，北京时间）

> 本节接续上面的断连历史检查点；以本节为最新实际结果。发现集市编辑的错误源站跳转后已停止功能测试，未修改业务源码。

- **环境阻断已在临时验收范围解除：**20:49 USB恢复，Huawei HMA-AL00／Android10／HJS5T18B01022139在线。复用已有cloudflared和本机当前源码副本，建立 `https://allied-below-guest-expertise.trycloudflare.com`，QA Supabase仍为 `mablwxlipcgbmbnfdbkc`。从现有已鉴权CLI只读取该QA项目已有service-role，项目ref与角色核验后仅置于Temp私有服务端配置及子进程；未新建密钥、未嵌入APK或仓库。实际QA清理worker已可用。无远端部署、新资源、生产Worker／DNS／R2／支付／迁移变更。临时地址依赖本机进程，不能当长期源站。
- **新并存QA2包通过：**旧随机域名过期，因此只在Temp副本换用新的准确QA origin，原包保留。实际包 `com.youshi.cultivation.httpsqa20261015b`／`2026101506`／`1.0.4-httpsqa2`；5,179,000字节；SHA-256 `b3d1dbbb16726ce1c52e0f2f185ab740b9bb7a40c6506f186d8e6503355d5c43`。Node24.14.0、Android Studio JBR，mobile构建6.1秒、离线Gradle68.2秒；实际APK公钥／QA client／上传目标／API origin／NativeShare／FileProvider／单运行时／调试签名均核验，server-role和secret key不在包内。无-r安装，设备哈希一致，原作者正常登录；未新建账号、重置密码或改变会员。
- **公开链接实际分享通过（已测路径）：**原R5卡列表点击“分享”→华为原生面板→Chrome实际接收→地址为本轮QA origin的 `/experience-cards/265bfd6e-68db-438b-a2e0-22792406e469`。Chrome匿名页面显示正确卡名、公开状态、4条原记录及图片，无作者编辑操作；系统返回原LifeSpace卡片列表。再次从该卡分享后取消，仍保留同页与作者会话。独立网页正常登录／退出的完整权限变化尚未验证，不能把这些子项一起写成全通过。
- **媒体权限预检通过（限定已测对象）：**匿名对原公开卡图片签名200且实际读取18,299字节；同一请求方式对已确认私密且无公开引用的记录图片签名400 Object not found。没有放宽RLS或使用生产媒体；不是全量越权审计。
- **D3封面失败回滚通过：**先保存全部原数据摘要及空清理队列；仅对本轮专用新帖、通过作者鉴权后的第一次封面PUT，在Temp QA代理模拟一次JSON503。App只提交一次，已实际上传QA原图与缩略图，提示“保存来源封面失败，请稍后重试”，随后自动DELETE得到200。失败帖 `8ecc88b7-024b-4af3-84c2-dafdd077f3cc`、媒体及两个Storage对象均为0；删除任务 `b4489aec-ba90-4f67-ba65-35a1d69eee66` 与两个条目succeeded，旧8组内容数量／摘要完全回到基线。没有直接改表冒充App回滚，也没有触碰旧R2/R3帖子。
- **D3单次重试、封面与去重通过：**一次性故障已用完并解除后，仅重试同一专用表单一次。封面PUT200，进入新帖详情，QA缩略图实际加载600×375；成功帖 `f0f527a3-e836-4843-bbb5-4eabe575afd7`，媒体 `430bb199-3dcd-4bbd-8d84-f173efe9dd8f`，原图18,299字节／缩略图5,634字节。仅保留1新帖、1媒体关联、2对象，孤立新对象0、待处理删除任务／条目0。原图复用QA公开测试图片的本机副本，通过实际文件input及正常发布按钮；文件选择由CDP指定新App私有外部目录，无额外权限；未宣称验证系统图库选择器。新帖保留，不清理。
- **确认失败／交Cursor最小修复：**从上述新QA帖详情点击“编辑”后，跳至Chrome CustomTab，原生Intent为 `https://life-space.uk/market/f0f527a3-e836-4843-bbb5-4eabe575afd7/edit`，页面“没有此帖或你无权访问”。`lib/android-shell-app-routes.ts:58`把集市编辑列为online-web，`mobile-offline-src/main.tsx:1407-1413` 的 `openOnlineWeb` 固定正式源站。该QA环境路由失败不等于生产编辑已被证明回退。最小建议：让该网页跳转使用经过核验的当前环境源站，QA配置缺失时拒绝，不回退正式站；保留现有导航和权限，不为局部问题重构页面／数据层。Browser.open调用只有URL，未主动附加QA Bearer／密码；出现了非预期正式页面访问，未提交该页面，不宣称全部匿名流量为0或浏览器已有Cookie已审计。截图／Intent已保存后关闭该标签回App，后续功能测试停止。D3整体不能宣布完整通过。
- **终态保护通过且保留差异：**1,100个SAF文件同路径同SHA，无新增／缺失／变更；原1,871照片／下载文件均未变。20:52重连时已存在另5个文件，终态仍1,876且与重连快照逐文件一致；新增5文件的路径／哈希另存，来源未确定，不删除、不恢复、不归因。本轮开始的10旧App及续接前QA1均同安装路径／SHA；现在12包并存。原26个隐藏JPG历史差异保留。旧QA内容13项目、24记录、9媒体、2卡片、7来源关系、5旧帖、2旧帖媒体、14旧Storage对象的有序JSONB摘要全部一致（Storage排除last_accessed_at，不代表重下载全部字节）；总量仅按新成功帖变为6帖／3帖媒体／16对象。
- **Git与证据：**HEAD仍 `fa23f3b80c1237652a9b33f8374676f9b6a410b5`，163项未提交／未跟踪、暂存为空；835开测源码只本进度文件改变，总纲、路线图和全部其他成果SHA一致。原d6qa/d6qa2/d6qa3/debug APK及两份新增HTTPS APK保留。证据根 `C:\Users\67049\AppData\Local\Temp\LifeSpace-QAHTTPS-20261015-2052`，重点 `17-public-link-reception-proof.json`、`18-share-cancel-*.json`、`23-d3-rollback-*.json/png`、`26-d3-success-detail.json/png`、`27-d3-edit-native-target.json`／`27-d3-edit-target.png`、`29-final-protection-summary.json`；SAF／照片完整终态清单位于前一1703证据根的after文件。崩溃缓冲中的PID3699／6,022,336字节为此前d6qa2历史，不是当前QA2 PID8749新崩溃。
- **仍需验收：**Cursor最小修复错误源站跳转后，只复验集市编辑／返回与必要关联；网页登录／退出权限变化、更多接收目标或失败提示未取得证据的部分仍未验证；稳定QA源站、Android11+、正式签名覆盖升级、已知offline.html测试契约及其他发布清单缺口不默认为通过。D6QA3真实MP4、R6/D4及桌面名称既有结果继续保留。数据库仍在使用，仅可只读移交准备，不清理；PR #95保持Draft，无commit／push／merge／deploy。


### D3 集市编辑固定正式源站的最小源码修复（2026-10-15，北京时间）

- **新证据与边界：**沿用21:32 QA HTTPS真机报告：公开经验卡链接分享／Chrome打开／取消返回通过；D3封面上传、503失败回滚、单次重试及无孤立对象通过。新QA帖子 `f0f527a3-e836-4843-bbb5-4eabe575afd7` 点击编辑跳到正式站的真实失败仍有效，**改代码不等于真机D3通过**。未重新进行云端写入、真机编辑或用户权限测试。
- **定位：**`lib/android-shell-app-routes.ts` 中市场帖子编辑保留 `online-web` 路由；`mobile-offline-src/main.tsx` 的 `openOnlineWeb` 原来对该路由固定构造 `https://life-space.uk`，导致 QA 作者的帖子在生产站找不到或没有权限。原QA包 `httpsqa20261015b` 不会自动获得修复。
- **仅改导航源站：**在 `lib/android-native-share.ts` 导出已验收的 `qaShareOrigin` 校验函数，不改变其原逻辑；在 `mobile-offline-src/main.tsx` 的 `openOnlineWeb` 中仅匹配 `/market/{id}/edit`，通过当前打包QA Supabase项目和配置的HTTPS origin选择已核验QA网页源站；若QA origin缺失、非法或指向正式站，显示现有 `webOnly` 提示并拒绝跳转，绝不回退生产。非市场编辑的旧在线网页路由和生产市场编辑地址未改；不传递Bearer、密码或service-role到Custom Tab。
- **自动验证：**`tests/android-native-share.test.mjs` 新增QA环境缺少origin、错误的正式站、HTTP源站、有效HTTPS源站及生产模式回退的源站契约。与 Android navigation/history 合计 **17/17通过**；`npx tsc --noEmit` 通过，相关三个文件 `git diff --check` 通过；未全量构建或真机验证。工作树其他既有未提交成果受保护；无commit、push、merge、deploy。
- **下一步：**Work只用临时隔离QA HTTPS后端重新打新的独立Android QA包，先解包验证 Supabase client、publishable key、API origin及没有正式站回退，再用当前专用QA帖子验证编辑Web Custom Tab目标、浏览器侧QA作者正常登录、打开正确帖子、非破坏性编辑／返回／退出权限隔离。Custom Tab登录态不能假定与App自动共享；不得向URL或页面注入Android会话令牌。真机前后核对旧12包、1,100 SAF、原1,871照片及重连后新增5文件、全部QA内容摘要；未知新增文件与26个隐藏JPG保留。任一真实失败停止。D3整体仍**待复验**；不要重复已经通过的封面上传和公开链接分享。

### D3 编辑 QA 源站修复真机复验（2026-10-15 21:49—22:09，北京时间）

- **结论：源站修复真机通过，D3整体仍受网页认证环境阻断。**没有重新实现修复或修改共享业务代码；未重复D6QA3、R6/D4、桌面名称、公开链接分享、D3上传／回滚／重试。
- **前检与构建：**完整读取总纲2030行、路线图231行、当前进度189行；HEAD仍 `fa23f3b80c1237652a9b33f8374676f9b6a410b5`，163项未提交／未跟踪，暂存空。已核对三处最小修复与上一轮QA2源码差异；本轮不重跑已有17/17及TypeScript记录，不将其代替真机证据。Huawei HMA-AL00／Android10／HJS5T18B01022139在线。
- **本轮隔离HTTPS：**前轮入口预检仍在线但接近运行时限，仅停止自己持有的旧Next／限制代理／cloudflared进程，保留旧包与证据；复用本地设施建立 `https://exposure-comfortable-expand-put.trycloudflare.com`。当前源码冻结副本与QA `mablwxlipcgbmbnfdbkc`／配对公钥，编辑页、登录页、Auth均200，准确Origin OPTIONS204，外域403。限制代理仅开放本轮既有帖及登录等GET页面，不开放发布、删除或清理API；私有服务端密钥未入APK或仓库。未新建远端资源、部署或修改正式域名／Worker／DNS／支付；网页使用已有正常Turnstile sitekey，没有测试key或认证绕过。
- **新独立APK与安装通过：**`com.youshi.cultivation.d3editqa20261015`／`2026101507`／`1.0.4-d3editqa`，5,178,984字节，SHA-256 `733a2d262d83fa77d325d613a65ac825e282604d661e649fcd9b0a5c311db6f5`。Node24.14.0、Android Studio JBR，mobile构建5.5秒、离线Gradle58.0秒；仅Temp构建。实际aapt／签名、QA client及上传目标／配对公钥／新origin／QA编辑守卫／NativeShare／独立FileProvider／single-runtime／LifeSpace标签全部通过，生产client初始化false。检查全部通过后无-r安装，设备同SHA，现13包并存。
- **App QA作者登录通过：**复用原安全私有夹具，在新App正常表单完成真实验证码复选框和登录；作者仍 `f99fd44d-820f-41f2-ad4e-85feb7c990a6`。不新建账号、重置密码、改会员或权限；不把App会话注入网页。旧12个App会话／文件没有作为写入目标。
- **D3-1源站通过：**从集市正常入口打开既有成功帖 `f0f527a3-e836-4843-bbb5-4eabe575afd7`，点击“编辑”。实际Android Intent与CustomTab均为本轮QA origin的 `/market/{id}/edit`，不是正式站；没有Bearer／密码等URL参数。匿名网页随后正常转到本QA登录页，未出现作者编辑表单。原帖、封面和媒体未重建。
- **D3-2网页登录环境阻断：**CustomTab为独立QA域名，未继承App作者会话。页面真实Turnstile显示“無法連線至網站”；正常浏览器刷新一次并等待后仍相同。未填写网页凭据、未提交网页登录、未换测试验证码、未注入令牌。截图及脱敏原生日志保留；现有日志没有数字错误码，尚不能确定是临时域名授权还是验证服务／手机网络连通性，不能直接断言为110200。必须先获得该QA域名可正常完成验证码的配置／连通性证据，若需远端变更另行核准。本轮没有把预检200当网页登录成功。
- **D3-3取消返回通过（已测限定）：**关闭正常CustomTab登录页，回到同一LifeSpace `market-detail`、同帖ID、history length3，PID25416与打开前相同。恢复时短暂显示联网重查后的未联网提示，随后自动正常显示原帖标题、说明、封面操作与作者身份；当前PID crash buffer无崩溃。这不是编辑表单取消／保存回归通过；作者表单读取、保存及恢复未执行，网页退出、刷新后的退出权限与非作者编辑权限未验证／被认证环境阻断。
- **终态保护通过：**21:57—22:08前后，1,100 SAF及1,876照片／下载文件全部同路径同SHA，无新增、缺失、变化；原1,871和重连前另5文件均保持。26隐藏JPG历史差异不删除、不恢复、不归因。旧12个App安装路径／SHA全部一致，新包设备与文件SHA一致；已记录的旧本地APK继续保留。QA项目13、记录24、媒体9、卡片2、来源关系7、帖子6、帖子媒体3、Storage16、删除任务1及条目2，10组数量／有序JSONB摘要前后一致（Storage排除last_accessed_at，未重下载全部对象字节）。原成功帖及媒体／封面完全未改，没有新帖、编辑保存、清理或会员后台任务。
- **证据及后续：**`C:\Users\67049\AppData\Local\Temp\LifeSpace-D3EditQA-20261015-2153`，重点 `apk-isolation-redacted.json`、`install-result.json`、`04-author-login-result.json/png`、`07-editor-native-intent.json`、`10-web-login-ui.json/png`、`14-final-web-captcha-state.json/png`、`15-customtab-cancel-return.json/png`、`16-return-settled.json/png`、前后保护／QA摘要。源码835个基线文件在进度写回前全同SHA；本轮仅局部更新此进度，不动总纲和路线图。先解除网页验证码环境阻断，再只补作者表单、取消／必要编辑保存、网页退出与非作者／私密内容权限。此前通过项保留；Android11+、正式签名保资料升级及其他门禁不默认为通过。无commit／push／merge／deploy、生产变更或QA清理，PR #95继续Draft。



### Turnstile 110200 只读定位与固定 QA 源站待审批（2026-10-16，北京时间）

- **核对与结论：**完整读取当前总纲2030行、路线图231行及进度203行；HEAD仍 `fa23f3b80c1237652a9b33f8374676f9b6a410b5`，163项未提交／未跟踪、暂存为空，Huawei HMA-AL00／Android10／HJS5T18B01022139在线。本节补充上一检查点：Windows Next日志实际有18次Turnstile **110200**；Cloudflare官方定义为域名未授权。旧网页主机为 `exposure-comfortable-expand-put.trycloudflare.com`，不是组件已授权域的子域，原因已确认，不再仅按“无法连接”猜测。
- **组件／Auth只读事实：**实际APK、既有QA构建配置及Next启动配置使用独立组件“LifeSpace PR95 Android QA”，sitekey SHA-256 `f31df84e62d69b5ab0134c844b2794c069ad89b25ac4d97d5ae4b3f99738717e`；与生产组件“LifeSpace”不同。QA组件仅授权 `life-space.uk`，managed／no_clearance，QA secret存在但未输出或入Git。管理API读回隔离QA `mablwxlipcgbmbnfdbkc` 的 CAPTCHA 当前为 **enabled=false／provider=hcaptcha／secret未配置**；本轮没有禁用或修改它。前端挑战成功不等于服务端验证码验证已启用。QA作者会员仍active，archives／records／market_posts／market_media RLS已启用；静态策略检查不替代非作者真实请求验收。
- **固定域名最小提案，尚未执行：**准确主机 `qa-pr95.life-space.uk`。账户中life-space.uk为active zone，当前named Tunnel为0；正式自定义域名仍指向life-space-canary。候选主机与旧随机主机公共DNS均NXDOMAIN；DNS配置读取403，不能据此认定配置无占用。拟新增专用 `life-space-pr95-qa` named Tunnel及仅该QA主机的CNAME／公开路由，指向本机隔离代理39305；先取得该zone必要DNS能力并核实冲突，绝不覆盖已有记录。复用现有独立QA组件，父域授权已覆盖该子域，**无需修改Turnstile授权或生产组件**。需另获批准后才在该QA Auth启用Turnstile并安全配对其QA secret；这会影响该QA项目新登录／注册／找回密码，旧QA包若没有兼容挑战可能重新登录受限，不能承诺所有旧包认证行为不变。付费预算0，不买域名、不升级套餐、不新建付费服务；遇收费要求停止。
- **隔离与恢复边界：**未执行DNS／Tunnel／Turnstile／Supabase配置写入或远端部署。仅正常刷新已有Cloudflare OAuth会话并发起资源GET；本机Wrangler文件不完整，未改共享依赖。QA secret只用于QA Auth服务端，不进入APK／报告／Git；失败时停止新QA入口，保留资料，不自动退回关闭CAPTCHA或生产源站。现有密码登录使用内部returnTo；邮件注册／找回密码源码回调指向正式站，本轮不触发这些非D3流程，不能宣布QA邮件回调通过，也不为此扩大业务修改。
- **APK与未验证项：**本轮未重建、安装或覆盖。当前 `com.youshi.cultivation.d3editqa20261015`／2026101507／1.0.4-d3editqa，5,178,984字节，文件与设备SHA均 `733a2d262d83fa77d325d613a65ac825e282604d661e649fcd9b0a5c311db6f5`。重新提取实际页面确认QA client、公钥及QA sitekey匹配，无生产client初始化、server／secret key，single-runtime和LifeSpace名称保持。旧编译origin已失效；固定源站和普通Chrome真实认证通过后，才拟Temp构建独立 `com.youshi.cultivation.d3authqa20261016`／2026101601，并存安装。Android正确源站与关闭CustomTab返回的历史通过保留；作者表单、表单取消、保存恢复、网页登录退出、非作者UI／API权限仍未验证／环境阻断，D3整体未通过。
- **终态保护：**05:06—05:12前后1,100 SAF与1,876照片／下载逐文件同路径同SHA，新增／缺失／变化均0；原1,871及此前5个来源不明文件保持，26个隐藏JPG历史差异不删除、不恢复、不归因。13个已有App安装路径／SHA全同，当前APK与旧本地产物保留。14组QA数量及有序JSONB摘要全同：项目13、记录24、媒体9、卡片2、卡片来源7、帖子6、帖子媒体3、Storage16、删除任务1／条目2、profiles9、会员8、付款0、退款请求0（Storage排除last_accessed_at，非重下载全部字节）。无新帖、修改原帖、清理队列执行、会员／支付或数据库结构变更。
- **证据与下一步：**`C:\Users\67049\AppData\Local\Temp\LifeSpace-Turnstile-QA-Inventory-20261016-0504`，重点 `110200-log-evidence.json`、`cloudflare-readonly.json`、`supabase-auth-readonly.json`、`extra-readonly-checks.json`、`approval-plan.json`、前后保护及14组QA摘要。835文件在本轮进度写回前全同SHA，本轮仅局部追加此进度。报告 `LifeSpace-PR95-Turnstile-QA-preflight-20261016.md`。先请用户明确批准上述专用QA DNS／Tunnel及QA CAPTCHA配对，并解决DNS权限；获准后先普通Chrome真实挑战，再新包和原帖D3闭环。D6QA3、R6/D4等通过项不重复；Android11+、正式签名保资料升级、offline.html既有契约及其他发布门禁仍待。无commit／push／merge／生产部署／QA清理，PR #95继续Draft。


### 固定 QA 环境方案获准后的执行检查点（2026-10-16 05:21—05:28，北京时间）

- **已获明确授权：**用户批准仅新增 `qa-pr95.life-space.uk` 专用DNS／Tunnel、复用现有独立QA Turnstile，并在隔离QA Supabase配对／启用CAPTCHA。顺序为先核实HTTPS、域名及真实token，再启用Auth CAPTCHA；随后检查旧QA包登录兼容性，才构建新并存QA包完成D3。预算0、生产及既有资料保护不变，无需重新审批同一方案。
- **本轮前检：**完整读取总纲2030行、路线图231行、进度214行；HEAD仍 `fa23f3b80c1237652a9b33f8374676f9b6a410b5`，163项未提交／未跟踪、暂存为空、835文件基线，Huawei HMA-AL00／Android10／HJS5T18B01022139在线。既有通过项未重复，未改共享业务源码、依赖或正式配置。
- **配置快照与本地准备：**再次只读保存Cloudflare账户／zone／widget／Tunnel与QA Auth脱敏配置。QA组件与生产组件仍为不同sitekey，QA仍只授权life-space.uk；现有named Tunnel为0。QA Auth仍为enabled=false／hcaptcha／secret未配置，未提前启用。本轮Temp已准备固定QA origin及严格Host／Origin限制代理，Node语法检查通过，未启动服务；继续限制原帖及登录等必要GET页面，不开放发布、删除、清理API。真实HTTPS、Turnstile token及服务端配对均未验证，不能将本地语法检查当作环境通过。
- **明确平台阻断：**既有Cloudflare OAuth可读zone／widget／Tunnel，但DNS API仍403／code10000，不能确认记录配置无占用，因此没有提前创建孤立Tunnel或DNS。已搜索可用Cloudflare连接器，无匹配结果；转至当前云浏览器的正常Cloudflare登录。用户通过安全登录衔接选择Google及已显示的原账户后，Cloudflare返回 **“Unable to sign in. Try again or use your email and password.”**，页面仍在 `https://dash.cloudflare.com/login`。这不是DNS变更成功或新的Turnstile110200证据，不能仅凭此断言机器人拦截。停止自动重试、不切换其他认证路线，待用户接管同一浏览器完成平台登录；没有在聊天索要密码、验证码或令牌。
- **未执行范围：**远端DNS／Tunnel／Turnstile／QA Auth配置写入0；新资源0、付费0；没有验证真实QA token，未启用服务端CAPTCHA，没有检查启用后的旧包登录兼容性；未构建／安装新APK。D3作者表单、编辑保存恢复、网页登录退出、非作者UI／API权限继续环境阻断／未验证，不能宣布D3通过。既有13包与当前2026101507包保留。
- **终态保护：**本轮开始与05:28结束，1,100 SAF、1,876照片／下载文件逐文件同路径同SHA，新增／缺失／变化均0；13个已有App安装路径及APK SHA全部一致。原1,871及此前未知来源5文件、26隐藏JPG历史差异均保留。14组QA内容本轮读回与05:12基线一致，含项目13、记录24、媒体9、卡片2、卡片来源7、帖子6、帖子媒体3、Storage16、删除任务1／条目2、profiles9、会员8、付款0／退款0；未执行会员、支付、清理或结构变更。Storage摘要仍排除last_accessed_at。进度写回前835文件全部同SHA，本轮只追加此检查点。
- **证据与续接：**`C:\Users\67049\AppData\Local\Temp\LifeSpace-Turnstile-QA-Execute-20261016-0521`，重点 `execution-checkpoint.json`、`cloudflare-readonly.json`、`supabase-auth-readonly.json`、`qa-origin.json`、`qa-proxy-prepared.cjs`、前后保护清单及QA摘要。下一步先在交接浏览器完成Cloudflare登录并确认准确QA主机记录无冲突；已批准范围不变。平台认证未解决前，不启用QA CAPTCHA、不创建新App、不开展D3写入。无commit／push／merge／deploy／生产或QA清理，PR #95保持Draft。


### 改由用户现有浏览器添加专用 QA DNS（2026-10-16 05:38—05:41，北京时间）

- **沿用授权，未扩大范围：**用户报告独立浏览器可正常打开Cloudflare，而当前云浏览器不能登录。原专用QA DNS／Tunnel及CAPTCHA方案已获批准；不要求共享本地浏览器Cookie、不索要密码／令牌、不新增广泛DNS凭据。仅将DNS这一项交由用户已登录的后台操作，其配置会在平台生效，不依赖当前云浏览器登录态。
- **已执行且读回通过：**使用既有Cloudflare OAuth在原账户新建唯一专用named Tunnel `life-space-pr95-qa`，ID `f28d4971-47c1-4e17-a634-f9715307fd76`，config_src=cloudflare。仅配置 `qa-pr95.life-space.uk` → `http://127.0.0.1:39305`，未匹配主机兜底404；真实GET读回确认主机、服务及规则数量一致。初次JSON字符串比较因对象键顺序不同误报不一致；之后仅做语义读回核实，**没有重复POST或创建第二个Tunnel**。连接token已用当前Windows用户DPAPI加密保存在本机私有证据，不输出或入Git。
- **待用户添加的准确记录：**Cloudflare中life-space.uk → DNS → 记录，仅新增CNAME；名称 `qa-pr95`，目标 `f28d4971-47c1-4e17-a634-f9715307fd76.cfargotunnel.com`，代理开启（橙云），TTL自动。API仍无DNS读取／编辑能力；用户须先在后台核实无同名冲突，已有记录不覆盖。尚未声称DNS已创建、HTTPS可用或验证码通过。
- **当前边界及证据：**专用Tunnel配置已创建，但连接器／本机服务尚未启动；未新建付费订阅，未改正式Worker、自定义域名、既有DNS或生产数据。QA Auth CAPTCHA仍未启用，继续遵循“先HTTPS和真实token、再启用、再旧QA包兼容、再新APK及D3”的顺序。无新APK或设备资料操作；沿用05:28保护快照，不能将其冒充新的逐文件扫描。本轮仅局部追加本进度，其他业务源码、总纲及路线图不变。证据仍在0521根的 `tunnel-before-create.json`、`tunnel-created-redacted.json`、`tunnel-config-readback.json`、`qa-dns-manual-handoff.json`；初次比较失败记录保留且本节已说明原因。下一步在用户确认添加后核实公共DNS，启动专用隔离本地服务／连接器并验证TLS、Host、Origin及真实验证码。D3仍未验证，PR #95保持Draft，无commit／push／merge／deploy或清理。

### 固定 QA HTTPS 生效与真实验证码待完成（2026-10-16，北京时间）

- **DNS／HTTPS已核实：**用户05:49确认已添加专用DNS。公共DoH解析成功；启动本机隔离Next（39306）、限制代理（39305）及专用Tunnel连接器后，https://qa-pr95.life-space.uk 的环境、真实验证码预检、登录及原QA帖编辑页面均HTTP200，TLS验证未关闭。环境返回仅QA项目 mablwxlipcgbmbnfdbkc、隔离Supabase媒体、无生产回退、无远端部署、服务端业务写入关闭。精确QA Origin的预检204，非授权Origin403；Host和允许页面路径限制保留。未改正式Worker／正式流量，无新付费资源。
- **真实挑战尚待完成：**独立QA Turnstile组件已在固定子域正常显示“验证您是人类”复选挑战，当前未见110200；这不等于token已通过。专用 /qa/captcha-preflight 仅用真实QA sitekey生成挑战，正常提交后服务端调用Cloudflare Siteverify，只保存成功、hostname、action及token摘要，不登录、不写业务数据。QA secret仍仅DPAPI加密保存在本机服务端配置，未进入APK／Git／报告。须用户完成当前可见挑战并点击“验证真实令牌”；accepted=true且hostname/action匹配后，才能继续QA Auth CAPTCHA配对与正常登录。未使用测试验证码或绕过挑战。
- **服务与代码边界：**本机服务使用835文件的新鲜冻结副本，只有Temp内Next allowedDevOrigins适配固定QA主机；共享业务源码和依赖未修改。服务日志逐行脱敏。连接器为本轮Runner管理的临时进程，依赖Windows工作环境持续在线，最长本次运行1小时；不是远端部署或Windows持久服务。QA Auth仍未启用CAPTCHA，无新APK、无D3编辑保存、无账号／会员／数据库改动。
- **保护与续接：**写回前HEAD仍 fa23f3b80c1237652a9b33f8374676f9b6a410b5、163项、暂存为空、Huawei设备在线；835文件仅本进度因追加检查点变化。未操作手机资料，SAF1100／照片下载1876／13个旧App沿用05:28逐项同SHA证据，不能冒充本时刻的新扫描。原帖与14组QA数据沿用05:26只读摘要，本阶段未触发业务写入。证据位于0521根：dns-after-user-add.json、https-environment-preflight.json、qa-turnstile-identity.json、execution-checkpoint-https-ready.json及脱敏服务日志。下一步真实token→QA Auth配对／普通网页登录→旧包兼容检查→新并存包及D3权限返回闭环。D3仍环境阻断／未验证；无commit／push／merge／deploy／清理，PR #95保持Draft。

### 真实令牌验证通过并启用隔离 QA CAPTCHA（2026-10-16 06:06—06:15，北京时间）

- **真实验证通过：**用户在固定QA预检页完成挑战；06:06:41服务端Siteverify返回HTTP200、success=true、accepted=true，hostname=qa-pr95.life-space.uk、action=pr95-qa-preflight，error_codes为空。只保留令牌长度816及SHA摘要，未保存／输出完整令牌。此前110200的域名授权阻断在该固定域实际验证通过；不能因此将普通网页登录或D3权限验收标为通过。
- **已按授权启用QA CAPTCHA：**在真实token证据之后，于06:10:23仅PATCH隔离项目 mablwxlipcgbmbnfdbkc 的security_captcha_enabled、security_captcha_provider、security_captcha_secret；读回仅这3键变化，enabled=true、provider=turnstile、secret已配置。使用已被Siteverify实际接受的独立QA组件secret，未读取或修改生产secret。原配置false／hcaptcha／无secret已保存回退快照，未自动回退关闭保护。管理接口读回secret为非明文64位十六进制表示，与明文或其SHA256直接比较均未相等；这两项诊断结果保留，不能冒充配对失败或成功，最终以新真实验证码的正常Auth登录为准。site_url和回调白名单保持原值，本轮不触发注册／找回邮件。
- **正常网页登录仍待验证：**打开原QA帖子编辑的QA login returnTo入口。初期停留“正在加载安全验证…”；Next开发快照大块脚本经Tunnel加载完成后已正常显示真实“请验证您是真人”复选挑战，无新增Turnstile错误，非业务缺陷结论。预检token已消费，正常登录必须使用该页新token，不能注入App Bearer、复用旧token或绕过挑战。尚未填写或提交网页登录凭据，待用户完成当前登录页的独立验证码后，使用安全登录流程继续。未构建／安装新APK，旧QA包启用后的重新登录兼容性尚未验证，D3作者表单／保存恢复／退出／非作者及直接API权限仍未验证。
- **当前保护检查通过：**06:14新一轮逐文件校验对照05:28：SAF1100→1100、照片／下载1876→1876，新增／缺失／变化均0；13个旧App路径与SHA全同。原1871及未知来源5个文件保持，26隐藏JPG历史差异不清理、不恢复、不归因。14组QA有序摘要与原基线一致，项目13、记录24、媒体9、经验卡2、来源7、帖子6、帖子媒体3、Storage16、删除任务1／条目2、profiles9、会员8、付款0／退款0（Storage排除last_accessed_at）。本阶段仅Auth配置变更，没有业务数据写入、会员修改、数据库迁移或清理。
- **代码／证据与下一步：**AGENTS及路线图SHA与完整读取基线一致，HEAD仍fa23f3b80c1237652a9b33f8374676f9b6a410b5，163项、暂存为空；835文件只有本进度追加发生变化。证据在0521根：real-turnstile-preflight.json、qa-auth-before-enable.json、qa-auth-captcha-rollback.json、qa-auth-after-enable.json、qa-auth-enabled-check.json、qa-auth-secret-pairing-proof.json、captcha-enabled-protection-summary.json及qa-data-after-captcha.json。初次只读CredRead本地辅助代码因FILETIME类型名歧义编译失败，改为完全限定类型后读取成功；该技术错误无远端副作用，不是业务缺陷。旧云浏览器预检标签恢复被协议策略拒绝，未绕过；令牌成功以服务器脱敏证据核实，正常登录使用独立新HTTPS页。下一步完成正常网页真实挑战及QA作者登录，再核查旧包兼容、构建新并存包与原帖D3闭环。专用本机服务仍依赖本轮运行及Windows在线；PR #95保持Draft，无commit／push／merge／deploy／生产变更或资料清理。

### QA 登录凭据交接检查点（2026-10-16 06:30—06:42，北京时间）

- 用户完成正常QA登录页挑战，06:30浏览器可见Turnstile“成功”；这是前端挑战成功，不等于Auth登录通过。随后两次安全登录请求返回declined，第二次是在用户明确要求重试后发起；不将取消误报为密码错误、验证码错误或登录成功，不推断凭据是否已输入。用户说明原测试密码未知，已暂停重复弹框。
- 本轮实际作者仍为pr95-sync-a-20261013-1719@example.com，不使用正式QQ账号替代。只读核对原Windows安全测试凭据：文件存在、该作者唯一、原password字段非空；没有打印密码、重置密码、新建账号、修改数据库或注入App token。已准备本机一次性复制该QA密码的辅助脚本，尚未执行；复制会替换当前剪贴板内容，须先取得该项明确同意，再由用户粘贴至安全登录框。云浏览器不能自动读取Windows私有凭据，不能绕过安全登录通道直接填入。
- 06:41核对HEAD仍fa23f3b80c1237652a9b33f8374676f9b6a410b5，暂存为空。没有新APK或手机资料操作；保护结果引用06:14逐项校验，不伪称此时重扫。QA Auth仍沿用已启用Turnstile配置，没有为方便登录关闭CAPTCHA。D3作者编辑／保存恢复／退出／非作者权限，以及旧QA包登录兼容继续未验证。证据0521根qa-credential-availability-redacted.json；未提交、推送、合并、部署或清理，PR #95保持Draft。

### 原 QA 密码本机复制与 QA 服务续接（2026-10-16 06:52—06:56，北京时间）

- 用户06:52:31明确批准将该专用QA作者原密码一次复制到本机剪贴板，并已获知会替换当前剪贴板内容。已执行既有辅助脚本，仅从原私有fixture选择pr95-sync-a-20261013-1719@example.com，未输出密码；另一本机只读校验返回Clipboard matches original QA password=True。没有把密码放入聊天、工具参数、报告或Git，没有新建账号、重置密码或传递App token。
- 原QA服务Runner在3600秒时限后正常结束，39305／39306／20242端口均已关闭；未留下重复连接器。沿用同一固定域、同一Tunnel、同一隔离配置和冻结副本重新启动，当前服务Job为d87d6f2b-4a4f-4c86-9573-545876d977ed（本次仍最多1小时）。06:55:28环境及原帖returnTo登录页面重新HTTP200，QA标识仍mablwxlipcgbmbnfdbkc，productionFallback=false／serverWritesEnabled=false／remoteDeployment=false。浏览器一度停留服务交接时产生的502页面，服务恢复后仅正常刷新一次已回到QA登录页，不是110200或业务缺陷结论。
- 此时用户可在同一QA网页登录页自行完成原作者账号、粘贴已复制密码及真实新挑战；此前安全登录框因测试密码未知被取消，不再要求用户猜密码。旧验证码已过时，不复用令牌、不绕过验证。正常Auth登录及D3闭环仍未验证，未构建或安装新包；保护证据沿用06:14全量逐项校验，本阶段没有手机资料、QA业务数据或生产操作。证据0521根qa-service-resume-https.json、verify-qa-clipboard.ps1及qa-clipboard-copy-result.json（仅布尔结果，不含剪贴板内容）。本次只追加进度，PR #95保持Draft，无commit／push／merge／deploy／清理。

### QA 网页输入纠正与再次交接（2026-10-16 07:06，北京时间）

- 用户报告登录输入有误并失去页面控制，明确要求再次接管。同一固定QA origin页面显示“邮箱或密码不正确；刚注册请先确认邮箱”；尚未取得作者登录成功证据。按用户说明视为待纠正的输入，不据此认定业务缺陷或新的Turnstile错误，也不将该提示当作服务端CAPTCHA完整验收通过。
- 已遮蔽页面密码显示并准备重新交还同一标签页；未读取／截图／输出密码，未再次复制剪贴板、自动提交、重置密码或切换账号。原输入保留供用户更正；D3作者编辑及权限闭环仍未验证。本次仅追加相关进度，无新APK、手机文件或数据库操作，保护校验仍引用06:14证据，PR #95保持Draft。

### 网页接管入口未生效，改走安全登录（2026-10-16 07:10—07:13，北京时间）

- 用户再次报告无控制权；不继续重复调用手动交接，不把已发起handoff当作用户已取得键鼠控制。参考OpenAI Docs Browser的secure sign-in form流程及当前浏览器故障排查说明，后续改用独立安全登录框。此前该框两次declined与测试密码未知的情形已保留，不误报为平台拒绝或账号已登录。
- 当前QA页面仍停在登录，真实验证码为未勾选状态；仅裁取验证码区域核对，没有查看密码或读取登录字段值。当前运行时的dom_cua辅助接口不存在，已停止调用它，使用已公开的Playwright只读布局检查和验证码区域截图，不更换浏览器、使用原始CDP或绕过保护。下一步须当前验证码操作的现场确认，并另取得再次复制QA密码、替换剪贴板的同意；然后代操作当前挑战，由用户在安全表单输入QA账号及粘贴原密码。不自动输入凭据、不重置密码、不关闭CAPTCHA。
- 本轮未再次复制密码或提交登录，无新APK、业务源码、手机文件、QA数据库或生产配置改动；D3仍未验证，PR #95保持Draft。0521根qa-control-handoff-blocked.json只记录状态，不含密码、令牌或截图中的身份信息。

### 隔离 QA 作者密码已重置（2026-10-16，北京时间）

- 用户明确授权仅重置隔离 QA 作者 `pr95-sync-a-20261013-1719@example.com`。本机代理 `127.0.0.1:7897` 端口可用；未重复此前无代理的直连。通过官方 Auth Admin 读到唯一用户，UID、邮箱、邮箱已验证及项目 `mablwxlipcgbmbnfdbkc` 均匹配后，`updateUserById` 只更新密码。更新后再次读回，身份未变。
- 新密码只写入原私有 QA 凭据文件中该作者的 password 字段，并已复制到 Windows 剪贴板。未输出明文，未进入聊天、日志或 Git。管理接口成功不等于网页登录成功；本轮没有提交登录、没有完成验证码、没有关闭 CAPTCHA。
- 未触碰正式 Supabase、原帖、会员、验证码配置、手机资料、APK 或其他 QA 用户。HEAD 仍 `fa23f3b80c1237652a9b33f8374676f9b6a410b5`，暂存为空。下一步由用户在 `https://qa-pr95.life-space.uk` 完成当页真实验证码，使用该作者邮箱并粘贴剪贴板中的新密码。若页面不可用，先恢复本机 QA 服务，不把管理接口结果当成登录通过。无 commit／push／merge／deploy，PR #95 保持 Draft。

### QA B 非作者网页验收（2026-10-16，北京时间）

- 本轮只验收 QA B `pr95-sync-b-20261013-1719@example.com` 对原帖 `f0f527a3-e836-4843-bbb5-4eabe575afd7` 的非作者编辑与退出后匿名访问。已通过的 QA A 登录、编辑保存、恢复原文、匿名查看、匿名编辑跳转和数据库权限检查未重复。使用独立浏览器会话，未退出用户当前的 QA A。
- 验收开始时 `https://qa-pr95.life-space.uk` 返回 Cloudflare Tunnel 1033，本机 39305／39306 已关闭。已用既有 `launch-qa-services.cjs` 恢复同一隔离 QA 本机服务和原 Tunnel，不是生产部署。QA B 经正常网页登录，Turnstile 由页面自己签发令牌后提交；未关闭 CAPTCHA，未输出密码，未改帖子、封面、数据库或业务代码。
- **非作者编辑通过：**登录后的导航显示 QA B。打开原帖编辑地址后，页面只有“返回集市详情”和“只有发布者可以编辑这条集市信息。”没有输入框、文本区和“保存修改”。
- **退出后匿名访问通过：**点击“退出”后，隔离会话中的 QA 登录状态已清除。原帖详情仍可匿名打开，可见标题、发布人 QA A、正文和封面；直接打开编辑地址会进入 `/login?returnTo=/market/f0f527a3-e836-4843-bbb5-4eabe575afd7/edit`，只显示登录表单。同一会话里这两页的第一张截图仍停在“加载中”，解析完成后的页面已另行截图确认。
- 证据：`C:\Users\67049\AppData\Local\Temp\LifeSpace-D3-QAB-Browser-20261016`，重点 `01-non-author-edit.png`、`02-anonymous-detail-resolved.png`、`03-anonymous-edit-login.png`、`result-final.json`。无 commit／push／merge／deploy，PR #95 保持 Draft。

### PR #95｜RC21 单运行时签名包与覆盖升级前保护（2026-10-16）
- GitHub PR #95 仍为 Draft，远端 HEAD `76a948e64e741e3194e8ee1130066410ce9de890`。用户授权的 164 项原有成果分两批提交，隔离数据库 CI 的冻结迁移跳过规则第三次最小提交；三项常规 PR 检查均成功。未执行 11 项冻结 migration，未合并／部署。
- 用户自行触发专用 Android workflow_dispatch `38851457596`，勾选 `single_runtime_acceptance=true`，版本 `1.0.4-rc21` / code 28；单运行时内容、永久签名、APK release Artifact 上传成功，网站发布步骤跳过。已对 APK 核验包名 `com.youshi.cultivation`、证书与已装正式 code5 一致、无独立 `offline.html`。未安装 APK。
- 2026-10-16 12:48–12:50，Huawei HMA-AL00 / Android 10、USB ADB 在线，正式已装包仍为 code5；Git 工作树原始 HEAD `76a948e`、未提交内容为空。用户授权先确认可恢复备份，再作 ADB 原位覆盖升级。
- SAF 13 目录共 1100 个文件，通过只读 Android `tar` 归档到 Windows，使用 .NET TarReader 与原始 Android SHA256 清单逐项校验：**1100/1100 一致，0 缺失／哈希变化**。持久备份位于 `C:\Users\67049\Documents\LifeSpace-Backups\PR95-before-rc21-overlay-20261016`，包含 TAR、原始 SHA 清单及校验报告。早先直接 `adb pull` 的 Windows 目录复制因文件名冲突未完成，存于独立临时目录，不应当作有效备份或删除原资料。手机文件未修改。
- **覆盖安装仍阻断：**现有正式 App `android:allowBackup=false`，ADB `run-as` 不可访问私有数据；SAF TAR 不包含 WebView IndexedDB、登录缓存或尚未写入 SAF 的待同步内容，现有云端“备份导出”接口也无法证明覆盖它们。尚无私有数据可恢复备份、未证明 pending queue 为空；未运行 `adb install -r`。下一步先核实原 App 的本地项目与待上传状态，选择可验证的私有数据备份／恢复路径，再依用户授权进入签名原位升级；不因已有 SAF TAR 就宣称整套数据备份完成。Android 11+ 仍未验证。

## 已确认的工作依赖与执行顺序

1. **当前首要工作：**D6QA3、R6/D4、桌面名称、公开分享与D3上传／回滚／重试通过证据保留。D3编辑固定正式站问题已由新独立QA包真机确认修复；当前网页验证码无法连接，未绕过认证，作者编辑及网页登录／退出、非作者权限闭环仍受阻。先解决QA验证码环境，再补该路径与剩余发布门禁，不清理QA、SAF、照片或旧包。
2. **环境交接：**Android 所依赖的临时数据库结束占用，需先清点、确认和保全，不能把“R6 本轮通过”误当成“所有 QA 数据可删除”。其他独立测试环境可以准备，不得复用受保护数据。
3. **并行安全准备：**PayPal 独立 Sandbox QA、Cloudflare/R2/Cron 只读审计可以先行；实际复用或切换临时测试资源要等依赖解除。原已完成的测试只复核缺口，不从头开发。
4. **生产收口：**PayPal Live、Cloudflare Cron 接管、R2 正式媒体迁移、生产数据库迁移、正式签名 APK 等均按各自安全门禁验收并单独请用户授权；先避免双 Cron 与媒体丢失，再关闭旧设施。
5. **网页内容治理与正式发布：**优先最小可用的管理员举报、下架与权限闭环；全部上线门禁完成后再请求最终发布批准。延期的五区间删除系统不是首发任务。

## 每轮任务的自动交接格式

任务实际推进或中断时，执行者只更新**本轮涉及的主线**，不得以旧版完整覆盖本文件，也不得顺手更改其他主线。必要时补充：

- **最后核实时间／环境：**日期、工作树或 QA／生产范围、证据来源；没核验的标注“历史记录／未验证”。
- **本轮完成：**代码路径、测试／真机结论及证据位置；失败与环境阻断分别写清。
- **保护约束：**未提交成果、原数据、相关 APK／SAF、数据库及未授权操作。
- **下一轮第一步与依赖：**明确可直接继续做什么、为何暂不能做什么；不重复已通过测试。

仅讨论、没有推进事实时无需制造进度更新；连接不可用时应说明无法写回，不能虚报同步。修改总纲或路线图必须依其既定审批规则，不得用本文件自行变更产品决定。任何密钥、用户私密资料及令牌均不得写入本文件。

### Android SAF 自动连接与恢复最小修复／隔离真机检查点（2026-10-16，北京时间）

- **本轮基线：**完整读取当前总纲2030行、路线图231行、进度292行；实际 HEAD 为 `76a948e64e741e3194e8ee1130066410ce9de890`。开测仅本进度文件有既有未提交修改，暂存区为空，全部保留。Huawei HMA-AL00／Android10／API29／HJS5T18B01022139在线；实际受保护安装为正式RC21（com.youshi.cultivation，1.0.4-rc21／28）及d3editqa20261015、httpsqa20261015b两旧QA包，不沿用历史13包数量。无其他执行者源码变更混入本轮。
- **根因与最小改动：**已有有效授权时，connectedLocalSafState→readSafCommitted→mirrorCommittedLocalSaf本来就会校验并恢复；全新安装没有私有目录记录时，原流程仅在新建／写入动作中调用选择器，因此本地列表一直显示0。本轮在首次进入可见本地空间时自动调用原授权说明及系统选择器，复用现有初始化／连接与安全重新授权分支；成功后直接重建现有业务镜像并loadList，不通过新建项目或整页reload触发恢复。取消后保留原位授权重试，其他页面不被新弹层锁定；已有可验证身份时拒绝空目录初始化或不同localSpaceId。未改身份格式、提交校验、云同步规则、页面结构、卡片样式、底部导航、登录／会员／集市／分享或管理员。
- **修改清单（相对当前工作树）：**`lib/local-saf-directory.ts`、`lib/local-offline-db.ts`、`mobile-offline-src/main.tsx`、`android/app/src/main/java/com/youshi/cultivation/LocalSafPlugin.java`、`tests/local-saf-directory.test.mjs`、`tests/local-saf-business.test.mjs`；另只追加本进度。总纲／路线图与其余开测文件SHA保持。共7项未提交修改，暂存为空；没有commit／push／merge／部署／生产迁移。
- **自动验证通过：**全部SAF定向测试137/137；完整Android acceptance（当前tests/*.test.mjs）761/761，失败0、跳过0；TypeScript tsc --noEmit --incremental false通过；git diff --check通过。新增覆盖首次授权恢复、有效授权自动镜像、取消重试、原目录重新授权、身份冲突／未知空目录拒绝、损坏提交不写入，以及项目／记录／图片／分类关系和同一身份、不重复项目、在线离线读取。现有空默认目录初始化、安全校验及单运行时契约继续通过；未知／损坏／空目录的异常测试只用内存夹具，没有试验写入原目录。
- **独立APK隔离与构建通过：**Node24.14.0、Android Studio JBR、SDK compile36，Temp新鲜源码副本；mobile约7.3秒、离线Gradle约58.3秒成功，各Gradle项目输出均重定向到本轮Temp，未覆盖旧APK。`com.youshi.cultivation.safrestoreqa20261016` / `2026101602` / `1.0.4-safrestoreqa`，5,179,136字节；APK为 `C:\Users\67049\AppData\Local\Temp\LifeSpace-SAF-AutoRestore-20261016\LifeSpace-safrestoreqa-2026101602.apk`，SHA-256 `164b1eadc6fe0321c3d56e9eb63f6933233e8c2d3578c488709d214138af7334`。实际解包确认QA client为mablwxlipcgbmbnfdbkc、public key与既有QA配置指纹配对、无生产client初始化、无服务端secret／service-role JWT；QA API origin为https://qa-pr95.life-space.uk。NativeShare、LocalSaf、独立FileProvider、LifeSpace标签、bundled单运行时存在。APK签名验证通过，测试证书SHA-256为98d8f294ab771aca5d4362ac23f07d9581f79f7fbd04ef8d5ac353a6f3a1bdf2；没有修改永久签名。未验证本轮QA HTTPS服务可用性，也未用它进行带身份写入。隔离全部通过后无-r首次安装，设备APK同SHA，未覆盖旧包。
- **原数据数量纠正：**只读实际原Documents/LifeSpace的序号11／revision f452466a-89c2-4703-81d6-8664bcc7d4f0，含1项目、**2记录、1图片**、4分类，不是本轮交接中的0记录／0图片。1,100文件与持久备份source-saf-sha256.txt全同路径同SHA，故按实际原件验收，未删改以匹配交接数字。本地空间ID为58035edd-f3aa-497d-a229-603954ca45cb，项目ID为local_archive_1d4756fd-2720-4a68-8786-701cc44ab834。
- **首次连接／取消／恢复真机通过：**新QA游客欢迎页正常；点击“暂不注册，免费使用本地空间”即自动出现原生授权说明，明确选择原Documents/LifeSpace。先取消：仍在原本地列表，未确认目录、未创建身份，可再次授权；之后复用该提示进入Android系统选择器，仅选择Documents下准确的LifeSpace，系统确认后自动恢复“本地1”，无需设置、重启或新建项目。系统返回URI为content://com.android.externalstorage.documents/tree/home%3ALifeSpace；这是本次系统Documents入口实际授权结果，未更改其他目录授权。私有运行镜像和generation pointer均为原localSpaceId／revision；恢复前后1项目／2记录／1图片／4分类、全部ID及关联相同，重复读取不增加项目。
- **详情、图片、返回及有效授权重启通过：**项目详情显示原2条记录；原图Blob 784字节、64×64实际解码，SHA-256 a5349bbe4bbb82672ab7d3710fb7aefe26fade77a8019a891ca760415481fd01。全屏→系统返回仍在同项目详情→再次返回原列表；无误入新建记录。仅force-stop并重新打开新QA后，无授权提示，自动加载同一项目、记录、图片、4分类和identity／revision。原生当前QA进程crash buffer未见新崩溃。正式RC21本轮没有启动恢复、授权、清私有数据或覆盖；不能将新QA恢复结果表述为正式RC21已恢复。
- **完全断网冷启动仍环境阻断：**沿用单次不超过60秒授权，保存Wi-Fi／移动数据均1的原状态，设独立43秒恢复看门狗。两次尝试分别4.300秒、8.821秒后恢复1／1。第二次等待稳定后，两项设置确为0／0，但系统Network仍connected=true、type=unknown，navigator.onLine=true，1.1.1.1探测仍成功；只读connectivity显示持续VPN网络。虽然两次冷启均读到完整1／2／1／4及相同身份，**未建立完全断网条件，不计离线真机通过**。未自行停VPN、改其权限或配置；不能用设置开关为0代替真正断网证据。18、20两份尝试和21只读网络摘要均保留，不是SAF功能失败。
- **终态保护通过（文件快照13:50、摘要13:51）：**13 SAF目录1,100→1,100，全部同路径同SHA，新增／缺失／变化0；本轮开测照片／下载为1,898→1,898，全部同路径同SHA，新增／缺失／变化0。历史1,871、未知新增及26隐藏JPG均按现场基线保留，不清理、不恢复、不归因。正式RC21及两旧QA安装路径、时间、版本、APK SHA均不变；新增本轮QA后共4包。Documents/LifeSpace-Backups/PR95-before-rc21-overlay-20261016中的TAR、原SHA清单、校验报告三件文件SHA不变。只在新QA私有镜像和专属测试缓存写入恢复／界面证据，未写SAF原件、相册／下载或云端项目资料；本轮未登录云账号、未作云内容CRUD或远端逐表重校验，不把历史QA摘要冒充本轮新扫描。
- **证据及剩余门禁：**证据根 `C:\Users\67049\AppData\Local\Temp\LifeSpace-SAF-AutoRestore-20261016`：source-before.json、before/after-saf.txt、before/after-photos.txt、original-saf-before.json、apk-isolation.json、apk-signature.txt、install-result.json、03取消、05引导、09/10系统授权、11自动恢复、12完整运行镜像、14全屏、15/16返回、17重启、18/20断网条件未成立、21网络摘要、22稳定详情、23终态列表、24-final-protection-summary.json、saf-tests.log、android-acceptance.log、typescript.log及原生日志。13早期截图仍在过渡加载态，详情稳定截图以22为准；一次自动选择器误用role=button在只读确认真实role=link后纠正，无App功能失败。下一步只需在确认安全的VPN／实际网络断开与恢复方式后补真正离线冷启动及必要终态校验，不重跑已有通过项。Android11+、正式永久签名覆盖升级与私有pending保留、正式包实际重新授权恢复仍分别未验证；本轮独立QA尚不能宣布全部完成。PR #95保持Draft，未进入下一轮正式签名构建，须完成独立QA后再等用户明确批准。保留D3／D6QA3／R6D4等历史通过，不开展其他主线。

### Android SAF 完全断网补验环境检查点（2026-10-16 14:18，北京时间）

- **本轮授权与执行范围：**用户明确允许在可恢复前提下临时断开手机VPN，单次不超过60秒；本轮只补该项环境准备，复用已安装safrestoreqa20261016／2026101602及全部已有通过证据，未重建APK、未修改业务或测试源码。HEAD仍为76a948e64e741e3194e8ee1130066410ce9de890，共7项未提交修改、暂存为空。
- **结果：完全断网冷启动继续环境阻断，未判通过。**只读确认实际VPN为CokeCloud；通过正常公开启动入口、已知提示确认进入连接主页，保持原节点、代理模式、账号及权限。临时锁定竖屏，并在不断开VPN时验证LifeSpace→正常最近应用切回VPN主页的路径，设置35秒独立恢复看门狗。两次点击可见连接控制后，系统VPN仍为CONNECTED、客户端仍显示已连接；均在前置条件处终止，未继续关闭Wi-Fi／移动数据或执行冒充离线的冷启动。不是已确认SAF代码失败，未绕过客户端、强停VPN服务或更改其账号／配置。44与46记录保留，用户的VPN授权不因本次未实际断开而被重复索取。
- **恢复与保护：**Wi-Fi=1、移动数据=1、VPN连接保持；自动旋转恢复为原1、user_rotation恢复原0，LifeSpace返回前台。14:17:45终态快照：13目录SAF1,100文件、照片／下载1,898文件与开测清单全部同路径同SHA，新增／缺失／变化均0；正式RC21及原两QA包的版本、安装路径／时间和APK SHA不变，新QA仍并存共4包。三件Windows持久备份SHA不变；本轮APK SHA仍为164b1eadc6fe0321c3d56e9eb63f6933233e8c2d3578c488709d214138af7334。未写云数据，未清理任何资料。
- **证据／接续：**沿用上节Temp证据根，新增27–47环境预检、UI、短暂尝试和原设置恢复记录，vpn-final-saf.txt、vpn-final-photos.txt、vpn-final-protection.json、48-protection-summary.json。此前首次授权自动恢复、取消重试、有效授权重启、1项目／2记录／1图片／4分类、图片／返回和全部自动测试通过继续有效。下一步先解决VPN正常断开与恢复控制，再补真正离线冷启动；未取得该证据前不宣布独立QA全部完成，不进入正式签名构建。Android11+、正式签名覆盖升级及正式RC21重新授权恢复仍各自未验证。PR #95保持Draft，无commit／push／merge／deploy。

### Android SAF 完全断网冷启动补验收口（2026-10-16 14:26，北京时间）

- **补验通过：**沿用用户已批准的单次不超过60秒VPN断开范围，由用户手动关闭／重新开启手机VPN；不再自动点击VPN客户端。14:24:08检测VPN已断开，脚本临时关闭Wi-Fi及移动数据并设置35秒独立恢复看门狗，仅force-stop并冷启动safrestoreqa20261016。真实Network.getStatus为connected=false／connectionType=none，navigator.onLine=false；Wi-Fi=0、移动数据=0且系统无连接VPN，完全断网条件成立。App直接进入原本地列表，无重新授权弹窗，自动恢复1项目／2记录／1图片／4分类，原localSpaceId 58035edd-f3aa-497d-a229-603954ca45cb及revision f452466a-89c2-4703-81d6-8664bcc7d4f0不变，全部镜像行及关联与此前通过快照一致，原图SHA不变。未触发初始化、新建或上传。
- **时限与恢复：**14:24:17.817已恢复Wi-Fi=1／移动数据=1，完全断网持续9,722ms；14:24:56.828已读到VPN恢复连接，VPN断开时长上界48,733ms，低于60秒。自动旋转仍为原1、user_rotation为原0。客户端节点／模式／账号／权限未由脚本更改；本轮无VPN服务强停或私有接口调用。
- **终态保护通过：**14:25:21终态扫描与开测比较，13 SAF目录1,100文件及照片／下载1,898文件全部同路径同SHA，新增／缺失／变化0。正式RC21和两旧QA的APK、版本、安装路径与时间不变；包含本轮独立QA共4包与上一终态一致。原TAR、SHA清单、备份校验报告三件SHA不变。6个本轮源码／测试文件与已通过137项SAF、761项Android acceptance及TypeScript检查、实际构建使用的源码副本逐个SHA一致；本轮仅追加进度，未重建、未改业务代码。APK仍为com.youshi.cultivation.safrestoreqa20261016／2026101602／1.0.4-safrestoreqa，SHA-256 164b1eadc6fe0321c3d56e9eb63f6933233e8c2d3578c488709d214138af7334。
- **证据及交接：**沿用本节之前Temp根，新增49-manual-preflight.json、50-manual-offline-cold-start.json、50-true-offline-cold-start.png/xml、51-manual-network-restored.json（该次较早读数VPN尚未恢复，以后续观测及52终态为准）、manual-final-saf.txt、manual-final-photos.txt、manual-final-protection.json、52-manual-final-summary.json。本轮Android10独立QA的自动连接／已有资料恢复及断网冷启闭环通过，前两节历史环境阻断保留为执行记录，现由本节真实离线证据收口。Android11+、正式永久签名覆盖升级／私有pending保留、正式RC21实际重新授权恢复仍分别未验证，不能据独立QA判全部发布门禁通过。未登录或写入云内容，未重跑D3／D6QA3／R6D4；HEAD不变，7项未提交修改、暂存为空，PR #95保持Draft。未commit／push／merge／deploy，未覆盖正式RC21，等待用户另行批准后才能进入下一轮正式签名APK构建。

### RC22 Android 契约测试阻断最小修复（2026-10-16，北京时间）

- **基线与证据：**完整核对现行总纲、路线图和本进度；本地及远端PR #95原分支均为a194a09665060c3229c96f0233e506cbdc9e8147，开测工作树／暂存区为空。总纲和路线图SHA与本轮前已完整读取版本一致。原workflow_dispatch 38862563047／job116847974520采用RC22／29及single_runtime_acceptance=true，06:41:31Z开始契约测试，07:11:01Z因30分钟job总时限取消，无Artifact。完整日志保存在Temp/LifeSpace-RC22-CI-20261016/rc22-original-full-job.log，未取消原运行或并发触发候选包。
- **定位：**日志最后停在cleanup inventory测试之后，下一文件为admin-trial-cleanup-path-hold-race.test.mjs。该文件先spawn两个Docker psql会话、等待／轮询，再依次注册close监听；若任何会话已结束，事件不会重放，等待可永远不结束。已用真实Node子进程确定性复现“进程已close但迟注册监听不再触发”。这是可确认的测试harness竞态，位置与原CI阻塞吻合；取消日志没有OOM、测试断言失败或Docker下载失败证据，未伪称取得原现场调用栈。SAF新增测试不是该阻塞位置。
- **最小补丁：**只修改tests/admin-trial-cleanup-path-hold-race.test.mjs：启动每个会话后立即监听并保留退出码及输出，轮询完成后Promise.all读取两个已保存结果。增加1项真实子进程提前关闭的回归用例。原并发数据库／Storage拒绝删除等全部断言、SQL、等待参数和工作流超时保持不变；未改SAF、业务、UI、迁移或发布配置。
- **验证：**修复前Windows隔离CI参数副本761/761通过、两项SAF文件51/51正常退出；Linux Node24.21.0的同两文件51/51、约2.9秒通过。Linux完整诊断759/761，两个环境失败分别为无Docker引擎、未配置测试期望的Java路径，保留原始日志，不冒充绿色CI。修复后Windows隔离副本完整762/762，失败0、取消0、跳过0，约58.9秒；其中包含原761项和新增退出竞态回归，137项SAF覆盖保持。TypeScript --noEmit --incremental false通过。隔离副本构建、测试生成物均在新Temp中，未覆盖原工作树的mobile-shell产物。必要的修复提交／推送前后须核对远端HEAD，下一步只触发一次参数明确的RC22候选构建，签名与Artifact尚待实际验证。
- **保护：**本轮未调用ADB、不启动或安装手机App，不接触SAF、照片、私有pending或正式／QA云资料；沿用此前已通过的保护快照，不把历史快照写成新扫描。没有生产迁移、Cloudflare／R2／PayPal操作，PR #95保持Draft。正式覆盖升级、私有缓存／pending保留、RC22实际恢复及Android11+仍未验证。

### LifeSpace｜112 受控媒体镜像入口统一源码接入（2026-11-12，北京时间）

- **基线与提交：**在 `development/lifespace-unified-r01` 独立检出中，以 `0a0c7c458eee150e522930f90593e209fd5a1a95` 为修改前 HEAD；源码提交 `637745ab4d63fcec0633135b451dbe620466bf44`。只提交本任务 12 个文件，未纳入 Android Gradle、`mobile-shell/index.html` 和 `.wp10-delivery/` 等既有无关修改。
- **源码接入：**统一 Worker 接入严格 QA Origin／isolated flag／GET-only 控制页面和同源镜像 POST 路由；客户端每次 POST 前使用现有 SDK 在线验证 Owner A 与同一 Session，POST 使用实际 mediaId 和 full／thumb。服务端继续执行 Owner／业务引用校验，并保留 HMAC、时间戳、Nonce、R2 条件写与冲突读回合同。full 失败或 UNKNOWN 不会继续发 thumb POST，也不自动重试。
- **回执脱敏：**每种尺寸分别记录源字节 SHA-256、MIME、大小和前后状态；路径改为 SHA-256 指纹，Owner 只记录核验布尔结果，不输出路径、Owner UUID、recordId 或认证凭据。明确标注 SDK 缓存状态未验证、对象版本元数据不可用及客户端未执行独立 R2 读回。
- **验证：**扩展定向隔离测试（7 个测试文件）60/60 PASS；TypeScript 检查 PASS；QA 配置下 Vinext 构建 PASS；QA-only 客户端构建 PASS，197,476 bytes，SHA-256 `81526d92b97c26679bce75328a0a8fe013c58b7819e2241d03b7049066731ec5`。本地统一 Worker smoke PASS：QA Origin 返回 200，生产 Origin 和关闭开关均返回 404；页面引用 QA 静态客户端，QA 产物存在而生产目录对应产物不存在。生产 `dist/client` 未修改。
- **边界：**未打开线上 QA 页面、未执行真实认证、未发送真实镜像 HTTP 请求、未写 R2、未部署；未执行 113／115。60 项均为隔离模拟／本地模拟 R2，不能代替真实 R2 读回。QA 配置绑定既有独立 media Worker service，本轮未部署或线上核验该独立服务。
- **报告：**`docs/release/LifeSpace-112-Media-Gateway-Integration-R01.md`。完成本轮源码与隔离验证后 STOP，等待 D 组按合法会话交接执行独立只读 R2 读回。

### LifeSpace｜原160项统一目录续办：022、027、038、040、097、123（2026-11-12）

- **实际统一源码：** `development/lifespace-unified-r01`，本轮开始 HEAD `54de3c136aff611ee5dd0781403a1595d42b785d`；并行修改及未跟踪交付目录全部保护，没有重置或整文件覆盖。本段仅记录本轮实际操作，不代表发布。
- **123：** 当前统一工作区已有媒体 full/thumb 独立字节验证的未提交修改；实际核验签名补丁 SHA-256 `6537c909e25f02f63a983c50b190987293aaa71be922c4cddd7ce36a8e559717`，未重复打补丁。继承原41/41 PASS；本轮联合定向媒体4项PASS。无真实R2写入／读回／部署。
- **097：** 对照并验证独立工作树最小补丁 SHA-256 `02350a7df967235380edf0ced1c83ab2de5031bd485c92c129f385ba7f99b1b5`，已应用到统一工作区的 `lib/android-remote-api.ts` 与 `tests/android-single-runtime-prerequisites.test.mjs`。相关联合定向路由与权限测试通过；尚无真实QA HTTP删除与Android真机验收；没有实际删除。
- **027：** 在 `lib/auth-return.ts` 加入Supabase环境与认证邮件回调Origin匹配：生产限定正式Origin，QA必须显式提供 `NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN` 的独立HTTPS回调地址，缺失、错配、不合法均拒绝。新增 `tests/account-and-region.test.mjs` 环境错配测试并通过；实际Supabase callback白名单、CAPTCHA/Turnstile开关与真实邮件认证未验，QA配置必须相应设置。
- **040：** Vercel `life-space` 项目只读可见，最近查询部署 READY，来源提交 `56207d328b6d7f869aa0d94351b8e0d5acc1a37e`；仓库 `vercel.json` 声明UTC 03:17的 `/api/internal/storage-deletion-worker`。该路由在Storage清理前后各调用一次 `process_cloud_trial_lifecycle`。正式库只读 `pg_get_functiondef` 明确存在遍历 `market_posts` 并调用 `request_delete_market_post` 的旧清理代码路径，存在误删集市信息的风险；但其具体生产触发范围与UTC 04:03维护记录来源尚未关闭，未触发或修改任务。禁止恢复720小时自动结束。
- **038：** 继承037原24条真实HTTP PASS及038原24/24隔离测试PASS；本轮仅看到已连接浏览器中的ChatGPT标签页，没有可操作的QA A/B认证浏览器会话。真实签发、到期、缓存及回收站Owner专项仍未完成；不得标记真实HTTP PASS。
- **022：** 继承019、020 R02、021与R39的已签审查和确定的安装顺序；本轮未完成同一隔离数据库中R39与020实际事务联合测试，未执行生产SQL。保留PARTIAL；不将已审SQL当成安装完成。
- **本轮测试：** 四文件联合定向首次31项中30 PASS，旧地区空城市名称断言1 FAIL（与本次路径无直接关系）；按涉及改动的精确名称再跑15/15 PASS。TypeScript `npx tsc --noEmit --incremental false` 本轮执行超时，不能记录PASS；统一正式构建和Android真机均未完成。
- **结论：** 上述成果均限于源码／只读控制面／真实DB只读与隔离测试。本轮没有正式DDL/DML、真实删除、Storage清理、Webhook、R2写入、Worker部署、生产发布或Git提交。未完成项目继续PARTIAL，必须补实际证据后才可置PASS。

### LifeSpace｜原160项：统一QA与关键阻断续办（2026-11-12，040/022/088及关联）

- **040 最新只读生产事实：** 正式 Vercel `life-space` production 最新查询部署 `dpl_5KTPCp5nBRa59DfvLAQjGt3tQkp4`，Git `f5420dee0100c09e0090055dda8783071e73173c`，该提交的 `vercel.json` 实际声明UTC `03:17` Cron维护入口；源路由会在Storage批量删除前后各调用一次 `process_cloud_trial_lifecycle`。正式库 `pg_get_functiondef` MD5 `3f6e2056a63ac07811a56ff461204640`，在cleanup_due_at到期后仍循环 `market_posts` 并调用 `request_delete_market_post`。2026-10-30到11-12的14天每日有一条`source=vercel`的维护审计，时间集中UTC `04:03:55`，11-10 `lifecycle_processed=1`；审计未证明删除已经发生，也不能用03:17源码推断04:03具体调度来源。**风险未排除。**
- **040 最小安全候选：** `docs/release/LifeSpace-040-Market-Lifecycle-Safety-Candidate.sql`，SHA256 `b29d4c9d216c3300e7238fdb4b07c5c73bd4644ecc98e5b6e3cba3c2078f1f34`。仅在完全匹配当前正式函数MD5、前像位置/路径时，移去历史cleanup阶段自动删除集市帖子循环；其余试用通知、档案/Storage删除、错误及重试逻辑原样继承，避免绕开其它清理链。`tests/lifespace-040-market-lifecycle-source.test.mjs`静态守卫测试3/3 PASS；尚未进行该候选的真实PostgreSQL隔离执行与动态后像测试。**不得对生产执行候选**，正式修复需再次独立授权及守卫/兼容验收。
- **022 精确继承而非重跑：** 从Library找到原022最终R02独立签收 `PASS / SOURCE-READY`，其PGlite联合5/5（正序、逆序、RLS漂移、020回滚、重复拒绝/17保护）及历史源签验已通过。本轮Windows原件SHA再核：R39 `50de092582aa58d1238aa1175225d14b5af42a49b852c868806632567a2dbc8b`，020 `eb4a2860dabcc1f00b5a62e7b5fff1515d4c47b4136224b56a13e9133dc9fc82`。但原报告明确未执行完整249KB R39(含ADM2/R11)+020单个一次性真实PG数据库全链；本机Docker Linux引擎当前不可达，未假称本轮新完整事务PASS。022保持已签的SOURCE-READY，完整动态联合仍缺独立环境。
- **088 APK只读核验：** `D:\LifeSpace-QA-Android10-Pending-20261019\artifacts\088-unified-qa-build-20261112\LifeSpace-088-QA-20261112-2026111201.apk`，5,236,552字节，SHA256 `491a3bbdacd5345e44b7d4d2f081b1e16bb418500af19f7d88898c7026ee6464`；AAPT manifest确认真实`com.youshi.cultivation.w5qa20261112r088`、versionCode `2026111201`；APK内Capacitor server hostname 指向 `life-space-w4-r25-qa-20261109.yoyomibaobao.workers.dev`，无serverUrl，独立包名不同于R26。QA网站只读HEAD当前HTTP 200。签名v2继承088原通过回执，本轮没有重做签名校验（本机Java环境未自动配置）。
- **088/R26队列保护：** 因Android包名不同，088不能直接访问旧R26应用私有WebView IndexedDB/pending，也不能证明旧队列已迁入；应保留原R26包及其资料，不覆盖、不卸载。088可创建隔离QA自有pending样本测重试。需要历史数据迁移/覆盖保留的单独安全路径及实际真机前后快照，不能以新包复测替代。
- **QA集中验收条件：** 088编译时间早于本轮027、097及123整合，不能认定该APK包含这些后续改动。QA网站已在线并不代表部署有最新统一源码。真正集中验收需要同一已冻结源码构建的独立QA网站/APK、明确 `NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN` 白名单与CAPTCHA、`NEXT_PUBLIC_CLOUD_EXPORT_ORIGIN` 匹配QA服务、真实A/B凭据及合法签名URL；本轮无部署、真实删除或R2写入。后续单次Android10验收先保留R26，给088独立包建立QA样本，再分别验登录/回调、环境错配拒绝、待上传安全重试、Owner限制、媒体签名URL时间与缓存；真实删除/R2写入仍需单独授权。
- **本轮验证：** 040来源守卫3/3 PASS；统一源码TypeScript执行 `node ./node_modules/typescript/bin/tsc --noEmit --incremental false` exitCode 0 PASS。未重复088 Gradle打包；未执行新的Web部署或构建。历史未提交共享Android改动继续保持。禁止将040静态测试等同动态风险排除。

### LifeSpace｜原160项：040隔离实测、022联合边界与统一QA最终构建（2026-11-12，最新）

- **040 实际PG17隔离验收：** Docker自建独立 PostgreSQL 17.11，正式函数真实只读前像MD5 `3f6e2056a63ac07811a56ff461204640`，本地重新建立完全一致。040候选微调：取消trial cleanup对market_posts的自动删除后，同时移除它们在cleanup完成判定中的占用统计，但继续保留archive/storage删除失败重试及正常结束接口。最终候选 `docs/release/LifeSpace-040-Market-Lifecycle-Safety-Candidate.sql` SHA `9adec9557d23554c69c46ae7ebe921029c1427bf55d72a78e6544b3ee709c35d`。隔离执行SUCCESS，后像MD5 `aae1f18f432f49658f55a9d2083f5144`。真实PG样本验证活跃帖和主动结束帖保留、取消会员帖子不改、Archive清理、未完成Storage作业阻断、失败码记录与再试恢复；重复安装被精确前像指纹拒绝；人为SQL异常使事务回滚并恢复原MD5。源码静态测试5/5 PASS。证据 `docs/release/LifeSpace-040-PostgreSQL-Isolated-Receipt.md`。**正式风险未排除：候选没有安装正式库，需独立审批+恢复点+正式守卫/兼容验收。**
- **022 真实PG联合补验：** R39原件SHA `50de092582aa58d1238aa1175225d14b5af42a49b852c868806632567a2dbc8b` 与020 SHA `eb4a2860dabcc1f00b5a62e7b5fff1515d4c47b4136224b56a13e9133dc9fc82` 再核无误。隔离库020逆序触发严格前像拒绝且RPC不存在；真实PG的目标目录合成前像能够启动原R39，但原R11 `adm_r09_preflight_failed` 对缺失的准确生产ACL/RLS/Policy/视图等拒绝，事务没有提交且`market_posts.published_at`未创建。**022原源级SOURCE-READY与历史PGlite5/5继承不变；本轮完整原R39+020同一PG真实动态PASS尚未取得，仍PARTIAL，不得冒称最终实库验收通过。** 详情 `docs/release/LifeSpace-022-PostgreSQL-Joint-Receipt.md`。
- **统一Android QA正式候选：** 独立构建副本 `D:\LifeSpace-QA-Unified-20261112-Build` 冻结HEAD `54de3c136aff611ee5dd0781403a1595d42b785d` 与受保护未提交增量；为027补Android esbuild认证回调QA同源编译变量，`scripts/build-mobile-offline.mjs` SHA `ebb102f6e905cd54e2345fc5f67fdcd475bd53a47b622f0db7fbaf64af62c448`。Gradle 166项BUILD SUCCESSFUL exitCode0，APK `LifeSpace-Unified-QA-20261112-2026111202.apk` SHA `6529d80f36e0c283fa53944cdd90fd6de60a30a44a1f11d7eed649c6309c81a5`，包 `com.youshi.cultivation.w5qa20261112unified`，versionCode `2026111202`，v2 debug签名PASS。QA Supabase/Worker/027/097代码内嵌核对PASS。
- **统一网站QA最终候选：** Vinext/Vite构建exitCode0，客户端241文件/服务端383文件；在公开客户端bundle中补充并验证同QA Origin的Turnstile公开SiteKey，最终候选包 `D:\LifeSpace-QA-Unified-20261112-Build\LifeSpace-Unified-QA-Web-20261112-Final.zip`，7,548,254字节、SHA `89c70b8d647c84cce8bc638d556212d9b8f68db403741822b679c2d5312aa5ca`。前一版无站点Key的Web ZIP为历史中间产物，不作为最终候选。没有实际部署。
- **旧R26与集中验收：** 新APK独立包名/私有沙盒，不覆盖或继承原R26的WebView IndexedDB/pending；旧数据不得卸载/清理。新包只能以自有QA测试队列先验安全重试；旧数据迁移另需现场前后快照和合法迁移方案。027需正式/QA认证回调白名单及Turnstile真实邮件；038需A/B真实签名URL有效期/缓存；088需设备503/UNKNOWN幂等；097需QA HTTPS API与Owner路由的真机会话；123需另行授权真实R2写入与独立SHA读回。网站和APK均未部署/安装、未做生产SQL、未执行Cron或真实删除。完整交付记录 `docs/release/LifeSpace-Unified-QA-20261112-Build-Receipt.md`。





### LifeSpace｜隔离QA网站部署回执（2026-11-12 UTC 05:54，原160项目录）

- **授权边界：** 用户仅批准部署隔离QA网站；正式 `life-space.uk` / `life-space-canary`、正式Supabase、Cron、R2媒体Worker、Android APK 均未修改。
- **部署目标：** Cloudflare Worker `life-space-w4-r25-qa-20261109`（账户 `5765d2d135aa20de90c898ab93ad4c11`），在线地址 `https://life-space-w4-r25-qa-20261109.yoyomibaobao.workers.dev/`。
- **新部署：** `8672233c-2c9a-4f4a-aa7b-27c50c669814`，版本 `5b3d890e-e3bf-4b19-8e58-db61657c8abf`，Cloudflare控制面确认100% QA流量；原版本 `a867633d-218e-4db7-8b21-5d631f318981` 保留用于回退。
- **输入原件：** `D:\LifeSpace-QA-Unified-20261112-Build\LifeSpace-Unified-QA-Web-20261112-Final.zip`，大小7,548,254字节，SHA-256 `89c70b8d647c84cce8bc638d556212d9b8f68db403741822b679c2d5312aa5ca`。Web构建原件未改。
- **发布保护：** 原始dist/server/wrangler.json内默认Worker为正式 `life-space-canary`，故单独生成 `dist/server/wrangler.isolated-qa-web-only.json` 精确锁定隔离QA Worker及账户；保持原QA 13项绑定（名称/类型/值逐一一致），QA Supabase `mablwxlipcgbmbnfdbkc`，PayPal、搜索索引和R2业务媒体模式为关闭。首次候选 `66bef967-4738-4d0a-844a-a109e4aa3184` 曾意外包含 `R2_MEDIA_CANARY`，**只上传未激活**；纠正后最终版本无R2桶绑定，已核实且部署。
- **实际验证：** Wrangler versions upload及versions deploy均exitCode0；Cloudflare API确认100%生效且正式Worker版本仍为 `3b35e5f4-740a-4173-9428-aaa0f133c974`。Cloudflare Browser Rendering对隔离QA首页实际请求返回HTML，页面标题“有时·耕作 | LifeSpace for Cultivation”。本机Node fetch和curl访问新旧QA域名均网络超时，无法作为HTTP负例；真实QA A/B身份、注册邮件、签名URL、动态媒体、Android真机仍待单独验收。
- **结果：** **隔离QA网站发布及基础页面渲染PASS；不等于027/038/088/097/123等整项PASS。** 未执行生产SQL、正式Worker切换、定时任务、真实删除、R2写入、APK安装。

- **附加安全核账（部署后）：** 上传阶段曾产生但未激活的版本 `66bef967-4738-4d0a-844a-a109e4aa3184` 含不应带入QA的 `R2_MEDIA_CANARY` 桶绑定；已调用 Cloudflare Worker Version DELETE 成功，随后的GET返回404。最终QA版本 `5b3d890e-e3bf-4b19-8e58-db61657c8abf` 仍为100%流量且无R2桶绑定；正式 `life-space-canary` 版本保持 `3b35e5f4-740a-4173-9428-aaa0f133c974`。未删除原QA回退版本或任何存储对象。

### LifeSpace｜统一正式上线目标与执行终点（2026-11-12）

- **唯一最终交付：** 依据原160项唯一执行目录，把W4网站、W5 Android、正式Supabase、Cloudflare网站/媒体Worker与R2媒体系统合为同一可追溯版本，最终将经验证的正式网站更新到 `https://life-space.uk`，并交付Android正式版本、媒体链路和正式真实运行验收。**QA仅是必要验证门禁，不是整个项目的STOP或交付终点。**
- **禁止任务膨胀：** 原160编号不变，不新增SR类执行任务、固定执行组或长期分叉版本。子修复、源码回执、独立worktree仅是同一编号内部证据；既有PASS直接继承，不重做无影响的历史测试。
- **统一基线：** `development/lifespace-unified-r01` 是当前唯一集成候选；先核对实际HEAD、未提交/未跟踪成果及每份签收补丁，逐项安全合入，不覆盖、不清理、不重置，不把QA中间包当正式候选。
- **优先顺序由真实阻断决定：** 040生产旧生命周期集市删除风险需完成正式安全修复门禁；022真实同库R39→020联合动态缺口与023备份恢复/旧Worker兼容；027/038/088/097/123及相邻项目按真实使用链路开展必要的认证、权限、待上传、媒体和R2验收；然后统一生产变更窗口、精确部署、读回、回退验证和上线后的业务核账。能共用同一版本/会话/设备的验收一轮连续完成。
- **当前证据与未完成边界：** 040候选已在独立PG17隔离通过，但正式函数尚未修改、风险未解除；022仍缺精确前像下完整R39+020同一PostgreSQL实例动态PASS；统一QA网站已部署到 `life-space-w4-r25-qa-20261109`、QA Android APK `2026111202` 已构建但未安装，不能将QA通过等同正式签收；旧R26私有待上传资料须保护；真实R2镜像写入/独立SHA读回、正式数据库恢复门禁及网站正式运行尚缺。
- **操作授权边界：** 此决定明确**最终上线方向**，但不是跳过单项高风险操作门禁的授权。正式数据库DDL/DML、Cron/生产Worker部署、真实删除、R2写入/镜像迁移、正式Android发布须在核实目标、备份、权限、回退条件并取得对应明确授权后执行；不得以“完成QA”为由永久终止总目标。
- **汇报标准：** 每轮只报告原编号真实已关闭的数量、唯一统一版本、离生产上线最近的阻断及可直接执行的下一动作；SOURCE-READY、QA BUILD PASS、隔离测试PASS与真实正式运行PASS分别标识。整个项目完成条件为生产W4+W5+数据库+Worker+R2全部可追溯发布并实际验收，而非单一QA Worker部署。

### 原160项｜2026-11-12正式上线门禁补验（040、022、023）
- **022 完整真实PG联合 PASS / SOURCE-READY**：使用正式项目只读schema-only导出（937834字节、SHA 7d004c749aa8c49f3f1a01189eedc65c983fb55503f03924f2c82a8df95b95e8），在无网络的正式同版本PG17.6.1.141空库完整恢复，真实R39与020 R02按顺序分别COMMIT exit0；逆序拒绝、两SQL重复拒绝、R39策略漂移阻断、COMMIT前异常回滚PASS；三Guide策略与RPC精确后像、合成Plus/Free/匿名数据库权限PASS。正式未安装，真实JWT/HTTP门禁另验。详见 docs/release/LifeSpace-022-PostgreSQL-Joint-Receipt.md。
- **040 独立安全安装准备 PASS（正式风险尚未解除）**：正式函数MD5仍3f6e2056a63ac07811a56ff461204640；最终SQL SHA9adec9557d23554c69c46ae7ebe921029c1427bf55d72a78e6544b3ee709c35d。在R39前像、R39+020联合后像两个隔离副本均安装通过并达后像MD5 aae1f18f432f49658f55a9d2083f5144。受守卫独立安装及回滚文件 docs/release/LifeSpace-040-Production-Install-Guarded.sql（SHA384b3955fb65aac11880874b0a2f1c07f8838162f1ef7c9eb2152c403ea0ab30）、docs/release/LifeSpace-040-Production-Rollback-Guarded.sql（SHAda6bf1684c32e35df26b4b40da988892f2172a9384545870e6569c02ff26af19）均经实际隔离安装→回滚PASS。生产须先形成可验证备份并另获最小函数写入授权。详见040原报告续验。
- **023 PARTIAL：正式恢复点不满足生产门禁**：正式PG17.6.1.141，QA PG17.11.0.002；正式5认证账号、20项目、41记录、53媒体、6集市、124 Storage对象（metadata 37,404,186字节）。发现1条公开未回收但无下属记录的项目孤儿，不改Owner。CLI物理备份列表 backups=null、pitr_enabled=false（walg_enabled=true不能代替可恢复PITR）；仅完成schema真实恢复和历史QA备份SHA复核，正式用户数据及Storage 124对象同一时点加密备份/独立还原缺失。详见 docs/release/LifeSpace-023-Production-Recovery-and-Compatibility-Receipt.md。
- **正式W4/W5/R2状态**：life-space.uk仍绑定life-space-canary旧Worker版本3b35e5f4-740a-4173-9428-aaa0f133c974；QA Worker版本5b3d890e-e3bf-4b19-8e58-db61657c8abf。R2真实迁移未验；旧Android R26本机pending不受新独立QA APK迁移保证。统一源码HEAD仍54de3c136aff611ee5dd0781403a1595d42b785d，所有未提交成果原样受保护。无正式DDL/DML、Cron修改、Worker部署、R2写入或Android安装。当前唯一生产优先门禁是023可恢复的一致备份+停写和必要的操作批准。


### 2026-11-12｜040/022正式安装顺序再核验（覆盖前段040可先安装的解读）
- **040不能先于R39上线：** 隔离PG中040先安装虽可PASS，但随后原版R39触发 R08-S02 STOP: protected function drift public.process_cloud_trial_lifecycle(integer)。因此正式顺序必须是 **R39 R02 → 020 R02 → 040**，且先通过023恢复点与停写门禁。
- 新的 docs/release/LifeSpace-040-Production-Install-Gate.psql 已在R39+020后隔离库原子安装PASS，MD5进入 aae1f18f432f49658f55a9d2083f5144；重复安装拒绝且函数不变。docs/release/LifeSpace-040-Production-Rollback-Candidate.sql 已隔离回滚至原MD5 3f6e2056a63ac07811a56ff461204640。无生产写入。
- **022 SOURCE-READY：** 正式schema恢复隔离测试的完整R39→020、17函数NO-OP、RLS角色矩阵、逆序/重复/漂移拒绝均PASS；正式未安装。
- **023仍为生产STOP：** 缺正式数据和124个Storage对象同一时间完整备份与独立恢复，不得执行正式DDL、Cron修改或Worker部署。

### 原160项｜023正式数据＋Storage本地恢复补验（2026-11-12最新）
- **正式数据库数据级加密备份与真实还原PASS：** 正式只读数据导出3,410,571字节，压缩Windows用户级DPAPI密文669,974字节、SHA256 8f68b198a5c3daec2d491cb67ed56b924a25535141ca8c56ae7290c20d292cee，存 D:\LifeSpace-023-Encrypted-Recovery-20261112。利用正式已签的schema在无网络的Supabase PG17.6.1.141独立库中stdin解密恢复，103个COPY块、psql退出0。正式与独立恢复12张关键表全行哈希12/12一致，账号/会话/支付/Owner/Storage目录计数及指纹一致。
- **Storage实际字节备份及本机恢复PASS：** 124/124正式对象经只读HTTPS获取，每个大小与数据库元数据一致，总37,404,186字节，逐文件SHA256及DPAPI加密；独立进程对124个密文逐个解密并按SHA256复核PASS，密文清单SHA 86108676400220e32a782815236b1db6a9d0d049459f053810e9c3c45b07a61f，存同目录。备份前后云端对象数量、总字节及目录指纹相同。没有对生产Storage或R2执行任何写入。
- **023状态依然是PARTIAL / 正式安装STOP：** 该本机DPAPI备份只允许当前Windows账户解密，没有跨设备恢复密钥/异地独立副本；无正式受控停写窗口产生的DB+Storage原子一致恢复点，且没有独立Storage服务的真实对象重新导入验收。因此040、R39、020均仍不得正式安装。真实JWT/正式Worker/R2/旧R26升级均继续原门禁。
- **安全备注：** 本轮一次Supabase CLI dry-run向诊断工具日志输出数据库连接口令；禁止传播该日志，生产变更前应在单独授权下评估口令轮换。正文与回执不复述凭据。
- **完整新增回执：** docs/release/LifeSpace-023-Production-Recovery-and-Compatibility-Receipt.md 后续实测段落。统一源码HEAD 54de3c1和全部并行未提交文件受保护，无生产数据库修改、Cron变更、Worker部署或正式媒体写入。

### 原160项｜023恢复续办真实状态（2026-11-12 本轮）
- **凭据事件PASS：** 原CLI dry-run打印的PGUSER确认为临时`cli_login_postgres.eidltoikfpnrzxruvawf`而非长期postgres；正式库pg_roles只读显示口令有效期至2026-11-12 07:08:02 UTC且已过期。role与06:56—07:03 UTC原诊断执行记录吻合，不输出临时口令。未擅自轮换生产凭据；若未来发现长期口令泄漏需另行处理。
- **原备份继续继承：** 正式数据库12关键表全行fingerprint 12/12、生产Storage 124/124对象离线SHA及37,404,186字节恢复PASS，无需重做。
- **新隔离Storage接口验收未通过：** 创建独立内部Docker网络和正式同版PG、在隔离库重新从原加密备份导入schema与103COPY数据均PASS。但专属官方Supabase Storage API无法启动：Docker镜像拉取出现`containerd.metadata...meta.db: input/output error`并超时；C盘一度零剩余、当前约0.2GB。未产生任何接口对象PUT/真实API读回和Owner私有负例，不得签PASS。没有执行Docker全局prune、服务重置或删除已有镜像卷。
- **媒体Owner关联：** 53/53 `public.media`均关联有效记录且Owner一致；53原图、26缩略图Storage路径直接匹配。扩展至项目封面、记录主图和集市路径，123私有媒体桶对象中87个被所核对业务路径引用，另36个暂不在这些路径映射内，**不能认定可删除**。
- **原设备不可用后的恢复：NOT VERIFIED。** 现有Windows DPAPI备份依赖同一账号；仍需用户外部公钥或KMS/授权异地存放和真正另设备恢复测试。临时本机数据库恢复不代表跨设备验证。
- **联合上线窗口方案REVIEW-READY：** 已在`docs/release/LifeSpace-023-Production-Recovery-and-Compatibility-Receipt.md`补全W4/W5/Worker/R2、Vercel Cron、Storage任务、支付Webhook与队列停写排空、同一冻结快照、R39→020→040、旧站兼容HTTP、回滚及解冻逐项PASS/STOP门禁。023仍`PARTIAL / PRODUCTION WRITE GATE STOP`；原022/040隔离PASS继承。HEAD `54de3c1`及所有原未提交成果未变，未对生产/共享QA执行写入或发布。

### 原160项｜023隔离Storage API真实写回与独立读回（2026-11-12最终续验）
- **真实Storage恢复PASS：** Docker已恢复。本地专用`lifespace-023-recovery-only-20261112`内部网络内Storage API连接独立存储数据库和Docker卷；基于原DPAPI加密源124个对象、37,404,186字节，分批真实Storage HTTP POST合计124/124成功。另起独立HTTP GET对124/124逐个比对原始字节数和SHA256，全部exit0；本地库124对象、总字节37,404,186。
- **代表性权限矩阵PASS：** 隔离测试RLS/JWT，私有媒体Owner HTTP200；跨Owner HTTP400拒绝；匿名HTTP400拒绝；公开avatars匿名HTTP200，2,400,191字节。该策略和身份属于隔离环境，不冒充正式生产JWT/RLS动态PASS。历史源`public.media`53/53与record/Owner一致、53原图与26缩略图路径匹配继续继承。
- **新回执：** `docs/release/LifeSpace-023-Isolated-Storage-API-Actual-Restore-20261112.md` SHA256 `a1827ab5cc4d5a0012d3bde0730e1bdc04daf521d9c12fb6297af4c4a638628f`，原023综合回执已补最新实测，先前“Storage API NOT VERIFIED”结论被本轮结果替代。
- **023整体仍PARTIAL/生产写入门禁STOP：** 原设备不可用时的跨设备DPAPI密钥/异机恢复未实测；无授权生产停写/排空窗口与DB+Storage同一时点一致恢复点。正式W4+W5+R2联合上线、R39→020→040生产SQL及Worker/R2发布不得提前执行。统一分支HEAD当前`6d85989bee46c98fac54527d11022ad5e3dcb671`（并行会话已经改动），本轮未重置/覆盖未提交成果。


### 原160项｜144 现役旧 Worker 与 R07 SQL 兼容（2026-11-13）
- **144 旧站兼容 FAIL，正式 SQL／停写／部署／切流 STOP。** 现役 v93 版本 3b35e5f4-740a-4173-9428-aaa0f133c974 的 335 个原始部署模块实际在 workerd 运行，连接已核对 R39→020→040 后像的独立隔离库副本。公开与私有项目、审核隐藏、Plus Guide、旧站带图发布和双图读回、集市主动结束与 040 到期后保留集市均已实测。
- **已确认回退：** 旧页 /admin/support 选择「已采取处理」会调用 admin_update_support_submission(uuid,text,text,text)，R39 后 HTTP 200 但业务返回 moderation_rpc_required，举报保持 submitted、无处置审计。相同隔离样本及 JWT 对照精确前像 HTTP 200、resolved/action_taken。请求补充与越权拒绝均通过。需由总控安排具备审核 RPC 调用链的 W4 候选复验，结合 023/040 决定开窗。专项回执 LifeSpace-144-V93-R07-Compatibility-Receipt.md；原始脱敏证据 D:\LifeSpace-144-V93-R07-HTTP-20261113。

### 原160项｜144 新 W4 候选审核兼容 R02（2026-11-13）
- **144 新 W4 候选审核路径 FAIL，V93 兼容 FAIL 继续有效。** 统一候选 6d85989bee46c98fac54527d11022ad5e3dcb671 已接入 admin_moderate_record。使用 137 已构建 Worker，在专用隔离 R39 R02→020 R02→040 后像环境中真实打开 /admin/support。管理员列表请求及独立详情请求均返回 HTTP 404/PGRST202，库内缺 admin_list_support_report_groups 和 admin_get_support_report_group_details，无法在页面进入「已采取处理」。
- **第二阻断：** 同一合成公开记录举报，数据库仅允许历史举报类别，审核 RPC 接受三项新原因码并要求与原举报 category 一致。spam 返回 invalid_reason_code，改送 other_severe 返回 submission_target_mismatch，改写样本类别也被 support_submissions_category_check 拒绝并回滚。普通用户页面拒绝，直接请求返回 permission_denied；举报保持 submitted、记录仍公开，审核状态与两类审计均无新增。专项回执 LifeSpace-144-W4-Candidate-Moderation-Receipt-R02.md，脱敏原始证据 D:\LifeSpace-144-W4-Candidate-R02-20261113。正式 SQL、停写、部署、切流继续 STOP。

### LifeSpace｜142 正式媒体接线与 147／148 发布前置收口（2026-11-16，北京时间）

- **基线与保护：**以精确 Commit `90a9c8bc1dcccf7a5887e3d1b496cf4f790567f1` 建立独立 managed worktree。原 checkout HEAD 仍为 `6d85989`，原有 dirty 现场保持不动；本轮候选仅在独立 worktree 本地提交，不 push、不 merge、不部署。
- **源码修复：**干净 90a9 构建默认生成的 `dist/server/wrangler.json` 缺少 `R2_BUSINESS_MEDIA_SERVICE` 和三个业务媒体变量。新增 `wrangler.site-formal-candidate.jsonc`、`scripts/prepare-w4-formal-wrangler.mjs`、`tests/w4-formal-wrangler-config.test.mjs`，并新增 `build:vinext:formal-candidate`。脚本保留既有 `R2_MEDIA_CANARY`，添加 Service Binding，且严格保证 `R2_MEDIA_READ_ENABLED=false`、`R2_MEDIA_MIRROR_WRITE_ENABLED=false`。
- **验证：**`npm ci` 593 依赖 PASS；正式 Supabase publishable key 构建 PASS（未使用 service-role 代替、未将 key 写入文件）；W4/R2 定向测试 **83/83 PASS**；`typecheck:vinext` PASS；站点与媒体 Worker Wrangler dry-run 均 PASS；CRLF-aware diff check PASS。构建产物 `dist/server/wrangler.json` SHA-256 `d6bb33e310900644bb4f7f3491801ec373d98fce1093cc4b29319bee05a986bc`。
- **正式控制面：**正式 `life-space.uk` Custom Domain 仍绑定 `life-space-canary`，当前 Version ID `3b35e5f4-740a-4173-9428-aaa0f133c974`。正式 Worker 只有旧 `R2_MEDIA_CANARY`，无业务 Service Binding、无业务 vars、无 `R2_MEDIA_SERVICE_AUTH_SECRET`；正式账户仅有 `life-space-media-canary` 桶，`life-space-business-media` Worker 与桶均不存在。镜像写入另缺正式 Rate Limiting binding；QA namespace 不得复用。
- **Android：**实际 Actions APK v29 包名／版本／Origin 与 W4 同源媒体合同一致，APK SHA-256 `76461fefe4c380156dfa280ad04243ead0cdcee8730b48b7b8c69f588a91c82b`；但 Artifact channel=test，网站发布步骤 SKIPPED，正式分发未通过。
- **兼容回退补验：**12 个新 SQL 兼容相关测试文件 **59/59 PASS**。022 最终 SQL 后像下的 141 R02 W4 隔离回退 PASS 继承；新建 SQL 后兼容回退手册，正式 Version ID 仍缺失。141 R04 因临时 Worker 404、凭据缺失，真实 HTTP 联动仍未完成，保持 PARTIAL。
- **终态：**142 源码／配置候选 READY；正式资源与 SQL 后正式回退入口未建立；147／148 NOT READY，生产部署、正式资源创建、Secret 写入、SQL 与 R2 开关全部 STOP。详细配置见 `docs/release/LifeSpace-142-Formal-Media-Preflight-R01.md`；故障恢复顺序见 `docs/release/LifeSpace-142-SQL-Compatible-W4-Rollback-Runbook-R01.md`。

### LifeSpace｜受控正式上线执行 R01（2026-11-16）

- **项目策略已获用户确认：**停止大规模、重复性 QA；不再以 160 项全部 PASS 作为上线前提。已签收证据继承，QA 保留为历史记录，不再作为每次普通修改的必经环境。后续以受控真实使用和针对性修复迭代。
- **本轮范围：**统一源码整合包含 W4、W5、R2 媒体和 PayPal 业务代码；不执行生产 SQL、不部署正式 Worker、不切换 life-space.uk、不启用 R2 正式读写、不发布 APK、不启用 PayPal Live 收费。本轮未运行测试。
- **统一候选：**本地 Release HEAD 为 `861c7f791aa171f38f0ae2783c8f5bab26581b25`；GitHub Release 分支最新提交为 `5d6f44167cfd9022744f2c0d9aac20a081a78aeb`，两者源码树一致，Tree SHA `fdf598643eab6fc0fdb6f410bc485dbae0e1f5eb`。
- **保护：**原统一 checkout 的 49 项 dirty 现场保持原样；本轮在独立 managed worktree 建立 release/lifespace-r01-controlled-launch-20261116 分支，不覆盖原工作树。
- **main 历史整合：**main 的生产健康检查提交 `535a2a5eef384700ce7dab73264f30e2e8256f28` 已作为第二父提交纳入 GitHub Release 分支合并提交 `6b4132e27e5fe1a0b1e80adaa00dd60715f75661`，最新分支提交 `5d6f44167cfd9022744f2c0d9aac20a081a78aeb` 在其后追加状态记录。`app/api/health/route.ts` 的 Git blob SHA 与 main 一致；GitHub 比较结果：Release 分支相对 main ahead 216、behind 0。main 未被直接修改；PR #95 仍保持 Draft，本轮尚未创建新 PR 或合并到 main。
- **统一产品范围：**W4、W5、R2 媒体和 PayPal 均纳入同一 Release Commit、构建和发布分支；不因 R2／PayPal 运行开关关闭而拆分源码。首期网站可沿用 Supabase Storage 读取路径，R2 正式读写与 PayPal Live 收费仅在各自最低运行门禁满足后启用。数据库安装、W4 部署、R2 资源切换、APK 分发和 PayPal Live 均分别核准。
- **最低安全门禁仍保留：**SQL 顺序与事务后像、数据库与 W4 兼容、主账号和 Owner 权限、媒体 Storage 读取、恢复路径、正式 APK 包名／签名／目标环境及发布授权。停止大规模测试不等于放弃生产安全。
- **当前状态：**统一候选分支已建立，源码中保留 W4、W5、R2 和 PayPal 模块；正式数据库尚未安装；正式媒体资源未就绪；R2 正式读写与 PayPal Live 收费未开放；未发生生产环境变更。后续状态以本节之后的最新回执为准。
- **继承的最新数据库／审核状态：**022 五步 SQL 安装链已在隔离库复签 PASS，正式安装未执行；023 隔离恢复 12/12 表、124/124 对象 PASS，正式窗口尚未开启；144 R04 正常后台审核动作在隔离环境 PASS，正式 SQL 仍未安装。此前 144 R02 的失败记录保留为历史，不覆盖 R04 的后续修复结果。
- **040／Guide：**040 R16 Git 来源结论为 C，原件 SHA-256 已核对；静态审查及 022 安装链兼容性评估尚未签收，不执行 SQL。058、060、061 已有通过证据继承；059 Plus 真实浏览器登录／第六条显示仍保留 PARTIAL，不再作为首期受控使用的独立 QA 阻塞。
- **媒体／APP：**125、126、127、128、140、141 R02／R03 等已通过范围继承；141 R04 三阶段媒体开关联动仍 PARTIAL。138 正式签名 APK 与 139 真机升级证据继承，150 正式分发尚未执行。147 正式媒体 Worker 仍 NOT READY，148 正式网站部署未执行。
- **支付：**PayPal 订单、Capture、会员确认和 Webhook 代码保留在统一源码；143 Sandbox Capture／Webhook 幂等闭环仍未完成，因此 Live 收费保持关闭。R2 业务代码同样保留在统一源码；147 正式媒体 Worker／资源仍 NOT READY，因此 R2 正式读写保持关闭。
- **正式环境只读核查（2026-11-16）：**Supabase `eidltoikfpnrzxruvawf` 状态 ACTIVE_HEALTHY，PostgreSQL 17.6.1.141；最新已登记迁移 `20261011125530`。`market_posts.published_at`、会员服务期限字段及 `get_plus_plant_guide`、`public_guide_record_projection`、`begin_paypal_membership_capture`、`admin_moderate_record` 均未查到；`confirm_paypal_membership_payment_json` 存在。Cloudflare 正式账户目前只列出 R2 桶 `life-space-media-canary`，没有 `life-space-business-media` 桶或同名正式媒体 Worker。上述均为只读核查，未执行写入。
- **W4 构建尝试：**本地 `build:vinext:formal-candidate` 在 120 秒执行窗口超时；未得到完整构建回执，未生成可签收的 W4 发布产物。残留 Node 进程已停止。本轮未运行测试。

### LifeSpace｜正式 Android 登录持久化最小修复候选（2026-11-17）

- **缺陷依据：**正式 Android 10 真机包 versionCode 29 / versionName 1.0.5-rc137，登录后可进入个人空间，但强制停止再启动未保持登录。生产加载的 `app/login/page` chunk 只执行 `supabase.auth.signInWithPassword` 后跳转，没有调用 Android auth controller 的 begin/complete/fail 接线；只读检查未发现 Supabase auth token，Keystore 只读检查返回 `missing_binding`。
- **最小源码修复：**当前受控 Release worktree 分支 `release/lifespace-r01-controlled-launch-20261116`，基线 HEAD `008e07a7d02a11ef7ea3d48fea35c5d8d0de1eb3`。仅修改 `app/login/page.tsx` 与 `tests/android-auth-connectivity.test.mjs`：原生 Android 登录前调用 `beginAndroidAuthLogin`；Supabase 成功后调用 `completeAndroidAuthLogin(data.user)`，沿既有服务端 `getUser` 验证、暂存 Session 提交和 Keystore Seal 路径；凭据／网络失败时释放登录 gate。普通 Web 登录不调用 Android controller，保留原有验证码、remember-email、returnTo 和跳转行为；remember-email 写入失败不阻断登录。
- **验证：**`node --test tests/android-auth-connectivity.test.mjs` 21/21 PASS；`npm run typecheck:vinext` PASS；`npx eslint app/login/page.tsx` PASS；`git diff --check` PASS。对测试文件单独运行 ESLint 时报告5处既有 `@next/next/no-assign-module-variable` 错误（原测试辅助变量 `module`，非本轮新增行），不据此宣称测试文件lint通过。
- **构建状态：**`npm run build:vinext` 本地执行两次均无输出并超时；后续直接运行 `node scripts/build-vinext.mjs` 得到明确退出码 1：当前 worktree 与进程环境均缺少 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`。两项正式 Supabase 公共构建值存在于 `.github/workflows/android-apk.yml`，可从该工作流按正式环境注入，不需要写入仓库文件。`NEXT_PUBLIC_TURNSTILE_SITE_KEY` 则来自 GitHub Actions repository variable，本机未配置。Cloudflare 正式账户只读清单显示 `LifeSpace` 与 `LifeSpace PR95 Android QA` 两个均允许 `life-space.uk` 的 Turnstile widget；尚未核实 Actions variable 当前指向哪一个，因此不猜测、不用空值构建以免关闭前端 CAPTCHA。无 W4 构建产物、无候选 APK；未部署、push、merge、提交或重签。超时遗留 Node 进程已核对并清理，无构建进程仍运行。
- **现场保护：**保留既有未跟踪目录 `.lifespace-sql-install-local/`，未读取、删除或纳入补丁；当前仅两份本轮源码／测试文件有修改。未触碰正式数据库、Cloudflare Worker、正式网站流量、PayPal、R2、手机应用数据或既有 APK。
- **当前结论：**源码与定向逻辑测试已通过，但**真机重启后持久登录尚未复验**；需要候选构建可用并在获准的候选环境／包中验证 Session 持久化、Keystore Owner/Session 绑定及强制停止重启恢复。不得将源码测试等同正式修复已上线。

### LifeSpace｜Android 登录修复 QA 构建续办（2026-11-17）

- **QA 构建配置：**本轮只读核实隔离 Worker `lifespace-site-media-qa-20261028` 位于 Cloudflare 独立隔离账户（非正式账户），其公开环境指向 QA Supabase `mablwxlipcgbmbnfdbkc`，Turnstile Site Key 与认证回调均匹配该 QA Origin；PayPal 前端开关为 false，R2 业务模式为 isolated。没有复用另一工作树指向 `127.0.0.1` 的本地 Supabase 配置。
- **本地构建环境：**在当前独立 worktree 创建仅含上述 QA 公共变量的 `.env.local`；已核实被 `.gitignore` 忽略，不含 Service Role、Secret、密码或 Token，不纳入 Git。
- **Vinext 构建：**直接运行 `node scripts/build-vinext.mjs`，exitCode 0；构建器报告客户端 Supabase bundle 检查通过（2 chunks，选用 publishable key）。客户端 manifest 中 `app/login/page.tsx` 对应页面 chunk，并明确导入 `android-auth-state` chunk，确认 Android 认证状态模块进入候选页面构建。QA Supabase、QA Turnstile 与 QA Origin 均出现在对应客户端构建资产；共享运行时还包含生产环境选择常量，必须通过 QA 包身份与 Origin 的真实运行验收，不能只凭字符串存在判断实际使用目标。
- **部署闸门 STOP：**本次生成的 `dist/server/wrangler.json` 仍是默认正式配置：Worker 名称 `life-space-canary`，绑定正式桶 `life-space-media-canary`，没有 QA 业务媒体 Service Binding。它不是可直接部署的 QA 配置，**禁止使用该文件部署**。已只读核实真正隔离 Worker 的现有服务绑定、公开变量及 Secret 名称；尚未生成并复核完整保留其绑定／变量／Secret 的独立 QA Wrangler 配置。
- **本轮边界：**仅完成 QA 配置读取、忽略文件配置和本地 Vinext 构建；未部署 Cloudflare Worker、未修改正式网站／数据库／R2／PayPal，未 push、merge、commit，未重建或安装 APK，未操作手机数据。
- **下一步：**基于现有隔离 Worker 的真实设置制作专用 QA 部署配置，逐项核对目标账户、Worker、R2／Service Binding、开关和 Secret 保留；通过后才部署隔离 QA Worker。随后核对手机现有包名与版本，使用独立 QA 包验登录、Keystore Owner/Session 绑定及强制停止重启恢复，保留正式包及其本地资料。
- **Android 真机只读盘点：**ADB 重新确认华为 HMA-AL00 已连接（设备序列沿用既有记录）。设备同时安装正式包 `com.youshi.cultivation`（versionCode 29，versionName `1.0.5-rc137`）及独立 QA 包 `com.youshi.cultivation.w5qa20261109r18`（versionCode 2026112605，versionName `1.0.0-w5-r26-137-r05`）。两包并存；本轮未安装、卸载、覆盖或清除任何包／数据。现有 QA 包可作为后续隔离网站部署后的真机验证载体，暂不需要为网页登录接线另造 APK。

### LifeSpace｜Android 登录修复 QA Worker 部署（2026-11-17）

- **专用配置：**更新受控文件 `wrangler.m4-qa.jsonc`（SHA-256 `aa52e5fed26d7c537af4c7ec0eb663133d5e52e6dba183eff03188f31e205c9d`），明确列出从隔离 Worker 当前版本读取的 21 项非 Secret 变量、7 个必需 Secret 名称、`R2_BUSINESS_MEDIA_SERVICE` Service Binding、`R2_MEDIA_MIRROR_RATE_LIMITER`（60 次／60 秒，namespace `2026110201`）、`ASSETS`、空 Cron 列表、`keep_vars=true`。Supabase URL 指向 QA 项目 `mablwxlipcgbmbnfdbkc`；PayPal 仍关闭；未配置正式 R2 桶绑定。
- **部署预检：**Wrangler 4.128.0 执行 `deploy --dry-run --config wrangler.m4-qa.jsonc` PASS；读取 QA assets 258 个文件，上传估算 376.13 KiB（gzip 86.12 KiB）。配置与部署前 Worker 的公开变量、资源绑定及 Secret 名称逐项比对 PASS。
- **实际部署：**Cloudflare API 只读回查确认此前 Wrangler 命令虽返回 exitCode 1，实际已创建并激活 QA Version 30，故没有重复部署。Version ID `6c6ab5a8-936a-4a41-9665-e324fba63fbc`；Deployment ID `d4d4726f-ec6f-42a8-85e3-cb94a2397fc3`；时间 `2026-11-17T02:57:51Z`；流量 100%。上一版 v29 `efb5c327-9203-4277-ac23-139a61fd7efc` 保留为回退锚点。
- **部署后核账：**Version 30 仍含完整 21 项非 Secret 变量、7 项 Secret、QA 媒体 Service Binding、原限流绑定和 Assets；M4 QA 控制变量未变，R2 QA 读取开关仍为 true；Cron schedules 仍为空，workers.dev 开启、Preview URLs 关闭。正式 Worker、正式 Supabase、正式 R2 与 PayPal Live 未修改。
- **保留的既有配置提醒：**`M4_QA_RECOVERY_UI_ENABLED=true`，但原 `M4_QA_RECOVERY_UNTIL=1794517104` 对应 `2026-11-12T20:58:24Z`，目前已过期。本轮按原值保留，未擅自延长恢复窗口；这不是本次登录修复的变更范围。
- **HTTP 实测边界：**本地 Runner 访问 QA Origin 时连接超时；Cloudflare 执行环境的外部请求被平台策略拒绝（403，明确提示该环境不允许请求此域名）。这两项不能证明网站失败，也不能作为 HTTP 200 证据。当前浏览器标签中没有 QA 登录页；Android 设备前台为 YouTube，本轮未切换设备界面。故**部署 PASS，真实浏览器登录／Android Session 持久化仍待验收**。
- **本轮现场保护：**没有再次部署、没有操作手机、没有覆盖或清除正式／QA APP 数据，没有执行数据库 SQL、R2 写入、正式切流、push、merge 或 commit。QA 本地 `.env.local` 仍被 Git 忽略；保留既有未跟踪目录 `.lifespace-sql-install-local/`。
- **下一步：**请在已连接的电脑 Chrome／Edge 打开 QA 登录页，确认页面实际加载后告知我；随后继续真实登录和 Android 强制停止／重启恢复验收。登录密码请只在设备页面输入，不要发到聊天中。
### LifeSpace｜QA 浏览器 B／Android A 登录与 Keystore 真机验收（2026-11-17）

- **浏览器 B 登录：**Chrome 页面实际进入隔离 QA `/archive`。身份为 `pr95-sync-b-20261013-1719`；云空间 1 条；基线记录 `PR95 同步隔离 B 20261013` 显示「仅自己可见」。页面 DOM 与用户截图一致。
- **Android A 登录：**华为 HMA-AL00 上现有 QA 包 `com.youshi.cultivation.w5qa20261109r18`（versionCode 2026112605）实际加载 QA Worker，WebView 账号为 `pr95-sync-a-20261013-1719`；Plus 1 GB、经验卡 27、云空间 34、临时空间 1。
- **在线 Session 复验：**从 Android WebView 的 QA Supabase 缓存 Session 发起只读 `GET /auth/v1/user`，HTTP 200；服务端用户 ID 与本地 Session 用户 ID 一致，邮箱身份为 A。未输出或保存 Access／Refresh Token。
- **强制停止恢复：**仅对 QA 包执行 `am force-stop`，再启动 MainActivity；未清除数据、未卸载、未重装、未重启整台手机。重新读取 WebView 后 A 身份仍在，Plus／经验卡／云空间／临时空间数据仍可见。**QA APP 强制停止后重新启动恢复 PASS。**
- **Keystore 只读核验：**调用 `inspectOfflineOwnerProofReadOnly`，返回 `status=valid`、`keyAliasPresent=true`、`proofDecryptable=true`、`ownerMatchesExpected=true`、`sessionMatchesExpected=true`、`environmentMatches=true`、`originMatches=true`、`installBindingMatches=true`、`persistentStateUnchanged=true`。此项为真实 Android Keystore 只读检查，未修改 proof／key／generation。
- **A/B 样本隔离：**B 浏览器显示 B 账号及 B 基线记录，不包含 A 账号或 A 的 `140-R06-W5-POSTUPGRADE-20261114-1628` 样本；A Android 页面显示 A 账号及 A 基线，不包含 B 的 `PR95 同步隔离 B 20261013` 样本。所检查的这两组样本未见跨账号混显；这不是全库所有数据的穷尽性审计。
- **尚未关闭的最后一项：**本轮没有退出 A 账号再执行一次全新的 Android 密码登录，因此尚未直接证明本次新增的 `beginAndroidAuthLogin → signInWithPassword → completeAndroidAuthLogin → Keystore Seal` 接线在全新登录中完整执行。为避免在不知道密码时丢失现有有效 A 会话，未擅自退出。整机重启测试也未执行；当前 PASS 仅覆盖应用强制停止／重新启动。
- **边界：**本轮只操作 QA APP；正式 APP、正式网站、正式 Supabase、正式 R2、PayPal 均未修改；没有 SQL 写入、R2 写入、Git commit、push 或 merge。
- **下一步：**保留当前 A 会话。待确认 A 的 QA 密码可用后，再安排一次受控的退出／重新登录验收；密码只在手机输入，不通过聊天传递。

### LifeSpace｜正式 Android 登录接线与 W4 正式候选续办（2026-11-17 最新）

- **正式真机登录：**华为 HMA-AL00 正式包 `com.youshi.cultivation`、versionName `1.0.5-rc137`、versionCode 29。用户在手机本机输入密码后，正式 Supabase 创建新 Android/HUAWEI Session；Owner 与此前正式管理员身份匹配，首页可进入。未记录密码、Access Token 或 Refresh Token。
- **Keystore 结果：**重新登录后只读检查返回 `missing_binding`；此前退出登录已按显式退出合同撤销旧设备绑定。检查没有修改 Keystore、proof、generation 或 App 数据。正式包仍保持安装和当前登录页状态，未重启、未再次退出、未清除数据。
- **生产根因证据：**通过正式 WebView 读取 `https://life-space.uk/login` 的实际线上 HTML 与页面 chunk `page-BsX3flwb.js`。线上 bundle 包含 `signInWithPassword`，但不包含 `beginAndroidAuthLogin`、`completeAndroidAuthLogin`、`failAndroidAuthLogin`；因此正式密码登录没有接入 Android Auth Controller 的登录 gate、已验证 Session 提交及 Keystore Seal。与本次 Session 已创建、Keystore 返回 `missing_binding` 的现象吻合。该项仍须在修复上线后用正式真机复验，不能仅凭源码通过宣称已修复。
- **源码最小修复：**沿用受控 Release worktree，基线 HEAD `008e07a7d02a11ef7ea3d48fea35c5d8d0de1eb3`。登录页仅在原生 Android 路径增加 begin／complete／fail 接线；普通 Web 登录路径保持原行为。测试辅助变量改名为 `authModule`，仅消除 ESLint 的既有 `@next/next/no-assign-module-variable` 报错。正式 Wrangler 配置准备脚本增加 `keep_vars: true`，避免部署时清除未写入候选配置的现有 Dashboard vars；对应断言已加入配置测试。
- **验证：**Android Auth 与正式 Wrangler 配置两组测试合计 **26/26 PASS**；直接运行等价 TypeScript 命令 `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.vinext.json --pretty false` **PASS**；涉及文件 ESLint **PASS**；`git diff --check` **PASS**（仅有 LF／CRLF 提示，无 diff 错误）。`npm run typecheck:vinext` 与嵌套 npm build 包装命令在 Runner 窗口超时；改用直接 Node 入口完成构建和 TypeScript 检查，未把超时误报为 PASS。
- **正式构建候选：**通过进程环境注入正式 Supabase URL／Publishable Key、正式 Turnstile Site Key 与正式 Origin，未将任何密钥写入仓库文件。直接运行 `node scripts/build-vinext.mjs` exit 0；客户端 Supabase bundle 检查通过。登录页 manifest entry 为 `page-BIsXCsb1.js`（SHA-256 `eb41b0a69fd3941f842992d03147a33c4d1610cbb58c9304abc6a651e7141e10`），其静态 imports 明确包含 `android-auth-state-C1VCjblx.js`（SHA-256 `cf01affec03ba7cc3005ae992be220194367c28b60555fe1ac38e9ab20b7f108`）。随后生成 `dist/server/wrangler.json`，配置 SHA-256 `8b5fed5f659fae69733ac812d979184fbf0dfcb007cb4e3ad273725f3002207a`；目标 Worker `life-space-canary`，保留 `life-space-media-canary` 桶与 `life-space-business-media` Service Binding，R2 mode=`isolated`、读写两个开关均为 false，`keep_vars=true`。Wrangler `deploy --dry-run` 复验 PASS：353 modules，预计上传 3752.08 KiB（gzip 991.36 KiB）；明确显示 `--dry-run: exiting now`。
- **Cloudflare 正式配置只读更新：**当前正式 `life-space-canary` 已有 `R2_BUSINESS_MEDIA_SERVICE → life-space-business-media` Service Binding，且绑定 `life-space-media-canary` 桶；R2 业务模式仍 isolated，读／镜像写开关均 false。正式媒体 Worker 已存在。此状态更新 supersedes 本文件 2026-11-16 旧核查中“正式媒体 Worker／Service Binding 不存在”的记录；未修改 Cloudflare 配置。
- **Supabase 正式库只读核查：**最新登记迁移为 `20261116145357`；`private.storage_deletion_write_gate.writes_stopped=true`。当前已存在 `market_posts.published_at`、`get_plus_plant_guide` 及管理员审核相关 RPC。复核确认 `public.public_guide_record_projection` **实际存在**，其 `security_invoker=true`、`security_barrier=true`，anon/authenticated 均有 SELECT，列定义与正式源码查询一致；虽然迁移 `20261108130901` 未登记，但该 view 与其依赖的 `is_record_effectively_public` 函数、`records_select_own_or_public` RLS policy 均已存在，故不构成本轮发布阻断，不运行整份旧迁移。另缺 `begin_paypal_membership_capture`，但 PayPal 仍关闭；`membership_service_ends_at` 当前源码无直接引用，不据此扩大本轮 SQL 范围。当前登录接线修复不需要生产 SQL。
- **正式发布前基线与回退锚点：**Cloudflare 当前 `life-space-canary` 生产部署 ID `57d4b473-4ad2-4beb-b227-2329a547e4d3`，100% 指向 Worker version 96：`76f96d92-13ab-4307-a0d0-63155a939d3c`（2026-11-16 21:01:27Z）。版本 96 的部署说明为 T13 W4 public Supabase runtime media fix，维护冻结、R2 读写关闭。若新版本部署后异常，可用 `wrangler rollback 76f96d92-13ab-4307-a0d0-63155a939d3c --name life-space-canary --yes` 回到该已验证基线。
- **当前发布边界：**尚未执行生产 SQL、Worker 部署或流量切换；R2 读／镜像写仍关闭，PayPal Live 仍关闭，APK 未重建或安装。生产数据库、正式 APP 与用户数据保持原状。下一步是将已验证的登录接线候选提交并部署到 `life-space-canary`；部署后立即核对正式 `/login` 资源、登录会话与 Keystore 绑定。R2 开关、PayPal、生产 SQL 和 APK 发布继续独立处理。

### LifeSpace｜正式 W4 登录接线部署与真机续验（2026-11-17）

- **Release 分支同步：**本地 Release 与 GitHub 远端历史有分叉。保留双方提交后，GitHub Release 分支通过单文件提交同步 CI 工作流，远端提交 `4426c045361874890b0f7a97fc9135abd7e0d493`，父提交 `bdf89d1bf7766ad3642f85727824aa96ad7eda4e`。本地 Git push 因远端 HTTPS 连接超时未确认成功；GitHub API 已读回上述远端 Commit 与工作流文件。
- **正式候选 CI：**GitHub Actions run `44045478384` 成功；身份检查、依赖安装、Android Auth／W4／R2 测试、TypeScript、正式构建、绑定与开关断言、Version Upload 全部 PASS。
- **正式 Worker：**Cloudflare `life-space-canary` 新版本 v97，Version ID `bfc91b02-c041-4827-80f7-23829678a236`。已创建 Deployment ID `4f1bcf50-f684-4fdd-a66f-d9bcb7cb422d`，100% 流量指向 v97，时间 `2026-11-17T08:20:14Z`。v96 `76f96d92-13ab-4307-a0d0-63155a939d3c` 保留为回退锚点。
- **配置核验：**v97 保留 `R2_MEDIA_CANARY → life-space-media-canary`、`R2_BUSINESS_MEDIA_SERVICE → life-space-business-media`、正式 Supabase URL／Publishable Key、CRON／PayPal／R2／Supabase secrets。R2 模式为 `isolated`，`R2_MEDIA_READ_ENABLED=false`，`R2_MEDIA_MIRROR_WRITE_ENABLED=false`。没有执行 SQL、PayPal Live 或 R2 开关启用。
- **真机状态：**ADB 设备 HMA-AL00 在线，正式包 `com.youshi.cultivation` versionCode 29／`1.0.5-rc137` 未重装、未清数据。已启动正式 MainActivity，WebView 当前 URL 为 `https://life-space.uk/profile`。本轮没有退出登录或改动 APP 本地数据。
- **尚待验收：**Runner 直接请求 `https://life-space.uk/login` 超时，不能作为 HTTP 失败证据；手机 WebView 资源级新代码读取尚未完成。下一步在不清数据的前提下刷新正式 WebView，确认新登录 chunk 加载，再由用户在手机本机输入密码完成一次受控重新登录，检查 Keystore proof、Owner／Session 绑定及强制停止恢复。不得通过聊天收集密码。
