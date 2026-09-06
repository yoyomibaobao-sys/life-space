# Android 外壳维护

有时·耕作的 Android 版本是围绕现有网页建立的轻量 Capacitor 外壳。网页、导航、文案和业务功能仍由网站部署更新；只有系统返回、系统栏、启动图、图标、原生权限或包版本变化时才需要重新生成 APK。

## 固定身份

- 应用名称：`有时·耕作`
- Application ID：`com.youshi.cultivation`
- 最低 Android：API 24（Android 7）
- 目标 Android：API 36（Android 16）

Application ID 发布后不得随意改变，否则 Android 会把它识别成另一个 App。

## 网站地址

构建时通过 `CAPACITOR_SERVER_URL` 指定 HTTPS 网站地址：

```bash
CAPACITOR_SERVER_URL=https://example.com npm run android:sync
```

未提供时使用正式域名 `https://life-space.uk`。CI 和正式 APK 也必须明确传入该正式域名，不再把 `workers.dev` 或 `vercel.app` 预览地址作为用户入口。

## 本地构建

需要 Node.js 22+、Java 21、Android SDK 36 和 Android Build Tools 36。

```bash
npm ci
npm run android:debug
```

测试 APK 输出在：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

当前主分支测试包按 512 KiB 分片复制到网站静态目录：

```text
/downloads/android-test-parts/part-00 ... part-07
```

`/api/download/android` 会读取全部分片、校验总字节数，并以
`youshi-cultivation-android-1.0.3.apk` 文件名返回完整 APK。

若配置了 `ANDROID_APK_DOWNLOAD_URL` 或
`NEXT_PUBLIC_ANDROID_APK_URL`，网页下载入口会优先跳转到配置的正式地址。
当前静态包属于调试签名测试版；调试签名变化时可能需要卸载后重装，
不应把它当作可长期覆盖升级的正式发行包。

## 正式签名

正式更新必须始终使用同一把 keystore。以下变量只放在本机安全环境或 GitHub Actions Secrets，不写入仓库：

```text
ANDROID_KEYSTORE_PATH
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
ANDROID_VERSION_CODE
ANDROID_VERSION_NAME
```

`ANDROID_VERSION_CODE` 每次发布必须递增；`ANDROID_VERSION_NAME` 使用面向用户的版本号，例如 `1.0.1`。

```bash
npm run android:release
```

正式 APK 输出在：

```text
android/app/build/outputs/apk/release/app-release.apk
```

不要提交 `.jks`、`.keystore`、密码、Base64 密钥、`local.properties` 或 APK 构建产物。

## 离线边界

APK 内置本地项目、记录和照片的离线页面。正式域名无法连接时，外壳自动打开该页面；它与正式网页使用同一个 IndexedDB 存储域，因此离线新增内容在重新联网后仍然可见，但不会自动上传云端。

从早期签名 RC 包升级到正式域名时，APK 内置只读迁移桥，把旧 Workers 存储域内的项目、记录、照片和本地分组复制到正式域名存储域。迁移完全发生在设备内，按图片逐张处理，并保留旧数据作为可重试来源。`workers.dev` 只作为 Android WebView 识别旧 IndexedDB 的兼容 origin，不承载任何云端请求。

## 返回顺序

Android 返回键或边缘返回手势按以下顺序处理：

1. 图片预览等覆盖层打开时，只关闭覆盖层。
2. 普通详情页返回站内上一级。
3. 首页没有可返回内容时才退出 App。

网页端的同一组件同时保留 PWA 横向滑动返回，图片预览会隔离全局横划手势。
