# Android 单运行时切换审计（2026-09-28）

第二阶段实现及剩余真机门槛见 [android-single-runtime-stage2.md](android-single-runtime-stage2.md)。

基线：`integrate-android-local-first-after-cache`，`a64379145ea6daa0fb71cadc7dda8f787549b6bd`，Capacitor Android `8.5.0`。本审计不改变运行时入口、App 身份、生产站或发行版本。

## 已核实的启动路径

`capacitor.config.ts` 同时指定 `server.url=https://life-space.uk`、`webDir=mobile-shell` 和 `errorPath=offline.html`。`scripts/build-mobile-offline.mjs` 将 `index.html` 生成为占位页，把真正的 React bundle 写在 `offline.html`。联网正常加载远程 Next 文档；加载错误时进入另一份 APK 文档。共享 React 展示组件并不能消除这两个 document、CSS 和路由入口。

Capacitor `8.5.0` 的 `Bridge.java` 在无 `server.url` 时把 `appUrl` 设置为 `androidScheme://hostname`。因此保持 `hostname=life-space.uk`、`androidScheme=https`，理论启动 URL 与现有生产 WebView 同为 `https://life-space.uk/`。这需要用覆盖安装真机验证，而不是仅凭字符串一致宣称所有设备上的数据已安全保留。对应源码：

- [Capacitor 8.5.0 Bridge.java](https://github.com/ionic-team/capacitor/blob/8.5.0/android/capacitor/src/main/java/com/getcapacitor/Bridge.java)
- [Capacitor 8.5.0 WebViewLocalServer.java](https://github.com/ionic-team/capacitor/blob/8.5.0/android/capacitor/src/main/java/com/getcapacitor/WebViewLocalServer.java)
- [Capacitor v8 配置](https://capacitorjs.com/docs/config)

## 阻止直接删除 `server.url` 的问题

`WebViewLocalServer.isMainUrl()` 在无 `server.url` 且请求 host 等于本地 hostname 时成立，并优先调用 `handleLocalRequest()`。因此 `fetch('/api/trash')` 和 `fetch('https://life-space.uk/api/trash')` 在同一 origin 下**都不能仅靠 URL 写法绕过本地资源服务**。Android `shouldInterceptRequest` 对部分方法（尤其 POST）又不是可靠的统一入口。若采用本地同源资源，需要设计并真机验证窄范围的远程请求通路，覆盖 GET、写入方法、重定向、Cookie/Authorization、Service Worker 和无网络回退，不能只替换成绝对 URL。

现有可见调用：`lib/cloud-trash.ts` 的 `/api/trash`、`/api/trash/restore`、`/api/{archive|record}/...`；网页 Profile、会员、管理页面还使用 `/api/export/...`、`/api/account/...`、`/api/paypal/...` 等。Supabase SDK 的请求使用独立 Supabase 域名；Turnstile 的站点域名与登录/会话恢复仍须在 APK 内实测。原生产站的 `/auth/confirm` 等 Next 页面也不能直接在本地 asset server 里假定存在。

## 已有数据与缺失的 Android 控制器

当前本机数据库 `life-space-local-offline` 版本 6 包含 `archives`、`records`、`images`（Blob）及 `taxonomy`。本地所有者上下文、身份快照、指引和 Supabase 会话分别有 localStorage 状态。保持完全相同的 `https://life-space.uk` origin 时原则上无需迁移这些键；从早期 Workers origin 的既有一次性迁移仍应保留。若改用 `localhost` 或其他 scheme/hostname，则必须先做包括 Blob、缓存、待同步操作及会话的可回退迁移。

`mobile-offline-src/main.tsx` 已有云项目列表、IndexedDB 项目详情、离线缓存和待同步队列，但在线云项目详情仍未接入 `app/archive/[id]/page.tsx` 的完整读取/编辑控制器。Profile 在 APK shell 中仍走 `OfflineAndroidProfilePage`，云端分组标签仍被锁定；`app/follow/page.tsx` 还直接调用 Next `useRouter()`。在这些能力没有同运行时接入前，把 `offline.html` 设为正常入口会造成功能回退或页面异常。

## 切换门槛

1. 在同一个 APK document 中实现云端详情读写、本地详情、Profile、分组设置、关注、集市、首页的正常路由；在线和离线只换数据及能力。
2. 为生产 API 做可验证的显式请求通路，分别测试 GET、POST、DELETE、网络失败和认证，不允许本地 `index.html` 被误读为 JSON。
3. 验证 Turnstile、Supabase session restore、登录和退出，以及旧 Service Worker 的一次性退役。
4. 以装有实际本地档案、文字、照片、缓存和待同步操作的旧包进行覆盖安装；核验所有者隔离与字节、ID、云端同步目的地。
5. 达成上述门槛才移除 `server.url`/`errorPath` 双入口；随后进行完整 Node、TypeScript、Vinext、Capacitor、Android debug 和真机验证。不得以静态源码断言替代真机结果。

本轮修复的图片兼容与移动端标题问题可在现有双入口下单独验证。rc21 真机 `mobile-shell-render` 的具体错误尚未取得；兼容图片是风险修复，不作为已确认根因。
