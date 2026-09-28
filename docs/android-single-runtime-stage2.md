# Android 单运行时第二阶段：切换前置能力（2026-09-29）

基线为 `e84fcc3c0db6af4813caeccde312ee0ecbf7b24b`。本阶段保留 `capacitor.config.ts` 中的 `server.url`、`errorPath`、`hostname`、scheme 和 Android 版本；生产网站、数据库、DNS 与流量不变。本文记录代码已覆盖的功能与仍须在真机验证的边界。

## 同一 Android document 的控制器

| 入口 | 在线 | 离线 | 展示 |
| --- | --- | --- | --- |
| 我的空间云项目卡片或 `/archive/:id` | `CloudArchiveDetailController` → `loadCloudArchiveDetail` / `loadCloudArchiveTimeline`（Supabase RLS） | `CloudProjectRuntime` → 按 `source_cloud_archive_id` 找 IndexedDB 缓存 → `DeviceOwnedProjectDetail` | `ArchiveProjectDetailView` |
| 本地项目 `/local/archive/:id` | IndexedDB → `DeviceOwnedProjectDetail` | 同左 | `ArchiveProjectDetailView` |
| Profile | `loadAndroidProfileLive` 读取本人 profile、身份统计、会员、容量、最近订单、管理员 RPC；可在原界面修改用户名 | 现有 owner/identity snapshot | `MobileProfileView` |
| 项目分组 | 本人登录后 `getCloudArchiveCategoryDepths` / `saveCloudArchiveCategoryDepths` | 本地标签 `getLocalArchiveCategoryDepths` / `saveLocalArchiveCategoryDepths`；云标签需联网 | `ProjectCategorySettingsView` |

网页详情也调用同一 `loadCloudArchiveTimeline`，没有复制网页整页 JSX。Android live 控制器接入档案字段、系统名称候选、分类/子分类/分组、种植地区、状态/可见性、记录、图片上传、期次、成员写入门槛和回收站 API。图片上传沿用“压缩 → 预留容量 → 上传 → 写入 media → 对账/结算”的顺序；状态/公开用原有 RPC。离线缓存已有待上传记录及照片处理，恢复网络时运行原有 pending sync 并刷新 live 详情。云缓存的旧记录仍只读，新增记录走本机队列。

Android Profile 在线订单为**只读状态**，云分组设置在本 document 内可读写；会员购买、退款、账户注销、导出下载及管理员管理页仍是网络/网页专属入口，不能把仅凭管理员链接可见当成完整管理页。管理员链接只在 `is_app_admin` 返回 true 时出现。未实现的同源页面在 bundled shell 被阻止 document 导航并明确提示网页可用，避免混入第二份 Next document。

## 远程 API transport

选择 **C：CapacitorHttp 显式原生请求**。`lib/android-remote-api.ts` 限定 `https://life-space.uk/api/` 的 JSON 路径，不启用全局 `fetch` patch；只有 `Capacitor.isNativePlatform()` 才调用 `CapacitorHttp.request`。该方法由 Capacitor 原生网络库执行，不进入 Android WebView 的 `shouldInterceptRequest`，所以同名 hostname 的 `WebViewLocalServer` 无机会把 API 请求作为本地 asset 返回。[Capacitor HTTP v8 文档](https://capacitorjs.com/docs/apis/http)说明了原生 request API 和与全局 patch 的区别。

| 能力 | 当前合同与测试 | 切换前仍需验证 |
| --- | --- | --- |
| GET、POST、PATCH、PUT、DELETE | 注入原生请求测试方法、固定 origin、JSON body 与 Bearer 头；`cloud-trash.ts` 的 GET/POST/DELETE 接入该 transport | Android 原生插件对正式后端的逐方法回归；当前写操作只使用 POST/DELETE |
| Authorization / session | 取 Supabase 本地会话 access token，服务器 `getAuthenticatedRequestClient` 验证 Bearer；无 token 拒绝 | 真实 session 续期、401 与过期 token 的真机回归 |
| Cookie | Capacitor Android 的 `CapacitorCookies` 设置 `CookieHandler`，原生请求**可能自动带 WebView Cookie**。显式 Bearer 优先，服务端 `getAuthenticatedRequestClient` 遇到 Bearer 时只按该 token 验证；无效 token 不回退到其他账号 Cookie | Cookie-only handler 不得进入 Android；真机核对 CookieHandler 和身份冲突 |
| redirect | `disableRedirects: true`，收到 3xx 或其他 origin URL 返回错误；不向第三方转发 token | 插件在目标设备上的真实 302/307 行为 |
| JSON / 失败 | HTML、本地 asset 误响应、无网络、非原生环境返回显式错误 | 实际 WebView 网络切换与代理/CDN 响应 |
| upload/download | 图片上传和缓存下载使用 **Supabase Storage 独立域名** 的既有 SDK/媒体路径，不走同名 `/api`；原生 JSON transport 不声称支持大文件 | `/api/export/my-records` 返回 ZIP，必须设计 File Transfer/下载能力后才能进 Android |

候选 A/B 需要 DNS、Worker 或生产流量调整，当前禁止；D 的普通同源 fetch 会被本地 asset server 截获。C 维持已存在的主机/存储 origin，并对 API 访问使用显式边界。当前没有真机或正式 Turnstile 变量，因此这些测试验证的是 JS/native API 调用合同，**不是完整原生网络验收**。

## Next API 依赖清单

`lib/android-api-inventory.ts` 对每个 `app/api/**/route.ts` 建立枚举；测试发现遗漏 route handler 会失败。

| 归类 | route handler / 调用 | Android 处理 |
| --- | --- | --- |
| Android 必须直接支持、显式 transport | `/api/trash`、`/api/trash/{restore,purge,retry,empty}`、`/api/{archives,records,media}/[id]` | `lib/cloud-trash.ts` 网页 fetch、原生 CapacitorHttp；Bearer；JSON；回收站/删除 |
| 暂标记 network-only，尚未迁移 binary transport | `/api/export/my-records`，Profile 备份导出 | 只在网页完整导出，Android 提示；不得把 ZIP 当 JSON |
| Web-only | `/api/account/delete`、`/api/admin/memberships/delete`、`/api/paypal/{status,checkout,return}`、`/api/market/{posts/[id],posts/[id]/cover,media/[id]}`、`/api/download/android` | 本轮不引入对应 Next 页，管理员和支付动作未接入 |
| Server-only | `/api/paypal/webhook`、`/api/internal/storage-deletion-worker` | 不允许客户端调用 |

`/auth/confirm`、注册、找回密码、会员购买、管理员详情、集市发布/详情、用户空间是 **Next 页面**，不是 API handler。它们当前是网页专属/待迁移路由，不在 bundled shell 中换 document。Supabase 数据查询、Auth、Storage、市场列表、关注列表用独立 Supabase 域名；不能将它们与同源 `/api` 混为一类。

## Android 主页面依赖与导航

| 页面 | 当前来源 | 路由和 CSS 结论 |
| --- | --- | --- |
| 首页记录/发现 | `fetchDiverseDiscoveryProjectBatch` + shell React | 无 Next router，数据走 Supabase；共享 UI 的 CSS module 随 bundle 内联 |
| 经验 | `fetchDiscoverExperienceCardSearchResults` + `PublicExperienceGallery` | 共享组件；经验卡详情是 web-only，不替换 document |
| 指引 | `PlantPage` + 离线 guide detail | 指引详情走 shell route；网站独有会员/注册链接被阻止并提示 |
| 关注 | 共享 `FollowPage` | 已移除 `useRouter`，在 Android 使用 `InternalNavigationProvider`；用户空间详情仍 web-only |
| 集市 | 共享 `MarketPage` | 列表不依赖 Next router，链接使用 `InternalLink`；发布、消息、单条详情仍 web-only |
| 我的空间 | `ArchiveWorkspaceTemplate`、本地/云列表及两种 controller | Android 内部 history/route；本地项目不跳 Next `/local/archive/:id` |

`scripts/build-mobile-offline.mjs` 把 `offline.css`、`local-parity.css` 和 bundler 输出 CSS 一起内联至本地文档；尚需在真机逐页确认字体/样式和链接行为。Cloud/Market/Follow 的 server component 入口没有引入 bundled shell。

## Auth、Turnstile、Service Worker

`restoreBundledSession` 离线保留已存会话的 owner 数据隔离，在线再以 `getUser` 验证；`onAuthStateChange` 和本机明确退出逻辑保持。`loginBundledWithTurnstile` 无 site key 或 token 时拒绝登录，后端登录继续带 captcha token。Android workflow 的站点 key 来自 GitHub variable，当前云环境未取得实际值；构建时缺 key 的 bundle **不能登录**，不会绕过挑战。Turnstile 要求授权 hostname；保持 `life-space.uk` 同源理论上适配，但须确认 widget 的 Hostname Management 和真机 WebView 表现。[Cloudflare hostname 文档](https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/)。邮箱确认 `/auth/confirm` 仍为 Next 页面，没有在 bundled document 实现 callback controller，不能宣称认证闭环已完成。

仓库未发现普通生产页面注册 SW 的代码；**无法据此确认用户设备或生产站从未有旧注册**。现有 `LifeSpaceWebViewClient` 在生产 host 页面完成后会列出、unregister 并刷新旧 SW，代码未改。新增的 bundled helper 在本地数据库/迁移成功加载后，仅 unregister 当前生产 origin 的注册；不删除 Cache Storage、IndexedDB、localStorage、Blob 或会话。仍需在带旧 SW 的覆盖安装真机上确认控制器退役时序、旧缓存和首屏。

## 切换门槛余项

1. 真实 Android 覆盖安装：本机项目、文字、Blob、云缓存、待同步记录/图片、所有者隔离和旧 SW；没有 rc21 日志，不能判断真机崩溃根因。
2. 原生 CapacitorHttp 与正式后端的 GET/写入/重定向/断网/认证验证；上传下载分别验证 Storage 路径，二进制 Next 导出继续 web-only。
3. 正式 Turnstile site key + hostname、会话恢复、登录、退出、邮箱确认/深链完整路径；当前 `/auth/confirm` 仍 web-only。
4. 集市/关注关联的用户空间、经验卡详情、支付/管理等 web-only 能力如需 Android 完整可用，应各自加入 controller。不得在 bundled runtime 中默默打开 Next document。

上述未完成前，**不得删除 `server.url` 或 `errorPath`，不得宣称单运行时切换完成**。
