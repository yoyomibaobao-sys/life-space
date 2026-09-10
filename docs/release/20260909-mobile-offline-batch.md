# 2026-09-09 手机、离线与账号批次

本批基于 `92bd805642aa83de62f1de6fffdd1c0e9623d92b`。代码和本地验证完成，尚未部署数据库、替换正式网站或发布新 APK。不能将本文件视为正式发布验收。

## 已纳入代码

| 范围 | 本批行为 | 主要文件 |
| --- | --- | --- |
| 总纲 | 耕作始终为主线；会员价值以前期真实记录、云端保存和经验卡为主；实操指引逐步充实；地图与商社仍属后续规划 | AGENTS.md |
| 离线界面 | 我的空间、项目详情、属性、指引名称选择、新建项目、拍照／相册、记录编辑与分期；内置轻量名称目录，联网后缓存目录 | mobile-offline-src、lib/offline-guide-directory.ts |
| 语言与分类 | 游客显示语言切换，登录后归入设置；仅求助；APK 分类简写农设／虫鱼，网页保留全称 | navbar、GuestLanguageSwitcher、CategoryLabel |
| 布局 | 分类行风格统一；我的空间筛选与新增项目同排；添加记录标题与图片数量分行；项目状态与可见性分段切换 | archive-ui、SegmentedChoice、quick-record |
| 项目与集市 | 关联指引纯文本显示并保留修改；生命周期统一为期；记录菜单去掉多余层级；本人发布隐藏新咨询输入框，仍可回复他人 | archive-detail、MarketCommentsSection |
| 记录地点 | 默认账号保存的地点，可编辑；照片 GPS 仅建议并经用户采用；地点独立私有表、本人读取，转本地／转云端／结构化导出保留 | RecordLocationField、record-location、迁移 20260907212018 |
| 会员管理 | 手机按栏目切换、稳定分页、明确信息缺失；详情分区；注销继续校验操作者、目标、确认与审计 | admin/memberships、删除 API |
| 身份与体验 | 游客／注册用户／云体验／Plus；加载失败单独显示；我的空间和资料页增加主动开启一次 30MB、90 天体验入口 | membership、CloudTrialEntry |
| 账号编号 | 新账号使用 LSa2026001 格式；999 后 A01…Z99，跳过 I/O；旧编号显示、搜索和注销确认兼容；原 UUID 和流水序号不改 | account-number、迁移 20260909092635 |
| 种植地区 | 新建种植项目必填国家及城市／区县，默认资料中的粗粒度地区；离线可手填；旧项目保持兼容，编辑、互转和导出保留 | PlantingRegionField、PlantingRegionEditor、迁移 20260909092818 |
| 邮件回调 | 注册、重发和找回密码回到正式域名；支持模板 TokenHash 确认及旧邮件回调；错误不显示成功 | auth/confirm、auth-return、email-callbacks.md |
| 时区 | 显示和输入使用设备时区；存储时间点使用 UTC；导出跟随设备时区并注明；照片优先采用 EXIF 偏移量；文字编辑保留原时间点，跨夏令时按日历计算第几天 | date-time、photo-metadata、导出 API |

没有实际注销线上用户，也没有修改支付金额、实际付费权益或会员到期保留规则。

## 本地验证结果

- `node --test tests/*.test.mjs`：283 项通过，0 失败。包含旧版 IndexedDB 数据、照片字节、记录与分期关联、事务失败、账号身份、地区及时间转换的行为检查，以及现有功能约束。
- `npx tsc --noEmit`：通过。
- `npm run android:offline`：重新生成内置离线页面。
- `npm run build:vinext`：退出码 0；干净构建后重新生成 server/index.js 与 wrangler.json。
- `git diff --check`：通过。
- PGlite 中执行本批三个真实迁移，验证记录地点权限、跨账号拒绝、公开粗粒度地区、新项目创建权限、旧编号不变与新流水号分配。该测试没有连接生产数据库。
- 时区测试覆盖 UTC、Asia/Shanghai、America/New_York，包括跨年、夏令时重复小时、无效日期和照片偏移量。

浏览器预览被本环境的连接限制拦截，手机视觉、相机实拍和真实安装不能记为已验收。当前环境没有 Android SDK，尚未在这里产出新签名 APK。

## 数据与升级保护

- APK applicationId 保持 `com.youshi.cultivation`；构建默认版本升级至 `1.0.4-rc5` / versionCode 9。
- 发布工作流仍核对既有正式签名指纹，未更换密钥。实际发布前还应核对网站当前版本，保证 versionCode 严格递增。
- IndexedDB 保持 `life-space-local-offline`、版本 6。新字段是兼容性扩展，旧项目、记录、图片和分期 ID 不重新生成。
- 旧编号和账号归属不重写，注册流水不因年份或删除账号重置。三位紧凑编码目前覆盖 1–3375；达到容量之前必须另行确定扩展编码规则，不能回绕或复用。
- 本地照片先保留。转云端时，对未标记已去除元数据的旧照片处理一个副本；处理失败停止上传，不能悄悄上传原始 EXIF。已经处理过的照片避免重复压缩。
- 本批不批量修改历史时间，不自动把本地资料上传云端。

## 正式上线顺序与待验证项

1. 核对正式 Supabase 项目与迁移历史，按顺序应用：20260907212018_record_location_and_mobile_admin.sql、20260909092635_compact_account_numbers.sql、20260909092818_project_planting_region.sql。先数据库后前端，避免新版请求尚不存在的字段或 RPC。
2. 部署本批网页代码到既有 Cloudflare Worker／life-space.uk，复查新账号类型、体验入口、管理员分页、私有地点、导出和公开内容。
3. 按 email-callbacks.md 配置正式 SMTP、Site URL、回调白名单与模板；用真实邮箱在无 VPN 环境核对注册、重发、过期、重放及密码重置。仅换邮件首跳域名不代表 Supabase Auth 完整网络链路可用。
4. GitHub Actions 构建并校验正式签名；先使用候选安装包验收手机布局、相机／相册和联网／离线切换，再发布网站下载清单。现有 main 工作流会更新下载存储，因此合并前应安排好迁移与验收顺序。
5. 用同一签名的旧版与候选版实测覆盖安装：升级前创建项目、分期、文字和照片，升级后逐项核对；再断网和重新联网。自动数据测试不能替代此项。

回退以网页／APK 代码回退为主，保留本批新增字段、地点表和用户已写入的数据；不通过删除新表或重编号来回退。若发现已有历史时间偏差，先核实字段类型、原始值与来源，再制定单独修复方案。

时间输入参考：[MDN datetime-local](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/datetime-local)。该控件本身不携带时区，本批在保存和导出边界明确转换。
