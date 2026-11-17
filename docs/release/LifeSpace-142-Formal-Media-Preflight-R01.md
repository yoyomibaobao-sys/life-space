# LifeSpace｜142 正式媒体接线与 147／148 发布前置收口

- **日期：** 2026-11-16（Asia/Shanghai）
- **基准 Commit：** `90a9c8bc1dcccf7a5887e3d1b496cf4f790567f1`
- **独立工作树：** `D:\LifeSpace-WP11-P0-Isolated-20261027\.webcodex-managed-worktrees\lifespace-unified-r01-08bf311f-df04-47fa-8fae-18dd6c62ecc7`
- **授权边界：** READ-ONLY + SOURCE FIX + BUILD + ISOLATED TEST。无正式部署、生产配置写入、生产资源创建、SQL 安装或 R2 开关变更。

## 1. 结论

- **142 源码／配置候选：READY。** 在精确 `90a9c8b` 独立工作树补齐正式站点媒体 Binding 的可重复构建覆盖；构建、类型检查、83 项定向测试及两个 Wrangler dry-run 均通过。
- **正式 Cloudflare 资源：NOT READY。** 正式媒体 Worker、业务私有 R2 桶、站点 Service Binding 和共享 HMAC Secret 均未在正式账户就绪。
- **147／148：NOT READY FOR DEPLOYMENT。** 尚无正式媒体 Worker Version ID，也没有新 SQL 提交后可用的正式 W4 回退 Version ID。镜像写入还缺正式 Rate Limiting binding。
- 本轮没有修改原签 ZIP、原始 dirty checkout、正式 Worker、正式 R2、正式数据库或正式域名。

## 2. ZIP 身份与构建可重复性

用户指定 ZIP：

- 文件：`LifeSpace-137-142-W4-Storage-Fallback-90a9c8b.zip`
- SHA-256：`f7cddd1d8e7fa88a96ad27dca96d0d3d7315da48dc83b21ea8cea9896310eb5d`

11 月 15 日总控更正记录已对该 SHA 重新核验，并记载 manifest 指向 `90a9c8b`、626 个文件，且 `dist/server/wrangler.json` 包含 `R2_BUSINESS_MEDIA_SERVICE → life-space-business-media`，保留 `R2_MEDIA_CANARY`，读写开关均为 false。早期无 Binding ZIP 不属于这个签名指纹。本轮原 ZIP 不在当前 Runner 允许目录或 Library 中，故没有再次读取字节或重算 SHA；原件未改动。

**本轮发现的可重复构建缺口：**从干净 `90a9c8b` 直接执行原 `build:vinext`，生成的 `dist/server/wrangler.json` 不含 Service Binding 和三个业务媒体变量。为避免依赖一次性手工补丁，新增正式候选 overlay 和构建后合并脚本。

- `package.json` 新增 `build:vinext:formal-candidate`；原 `deploy:vinext` 明确使用 `dist/server/wrangler.json`。
- `wrangler.site-formal-candidate.jsonc`：定义站点 Worker Service Binding、正式 Rate Limiting binding 与关闭状态变量。
- `scripts/prepare-w4-formal-wrangler.mjs`：严格核对 Worker 名称和既有 `R2_MEDIA_CANARY`，拒绝冲突 Service／Rate Limiting binding 或任何已开启的门禁；向构建产物合并服务绑定、限流绑定及三个关闭状态变量。
- `wrangler.media-formal-candidate.jsonc`：独立媒体 Worker 配置，保留私有桶绑定和读写关闭状态。

### 候选配置合同

**站点 Worker：** `life-space-canary`

- 保留既有 `R2_MEDIA_CANARY → life-space-media-canary`。
- 增加 `R2_BUSINESS_MEDIA_SERVICE → life-space-business-media`。
- 增加 `R2_MEDIA_MIRROR_RATE_LIMITER`：正式 `namespace_id=2026111801`，`limit=60`、`period=60`。
- `R2_BUSINESS_MEDIA_MODE=isolated`。
- `R2_MEDIA_READ_ENABLED=false`。
- `R2_MEDIA_MIRROR_WRITE_ENABLED=false`。

**媒体 Worker：** `life-space-business-media`

- 入口：`./cloudflare/r2-media-worker-entry.mjs`。
- R2 binding：`R2_BUSINESS_MEDIA → life-space-business-media`。
- 同样设置 `R2_BUSINESS_MEDIA_MODE=isolated`、`R2_MEDIA_READ_ENABLED=false`、`R2_MEDIA_MIRROR_WRITE_ENABLED=false`。
- `workers_dev=false`、`preview_urls=false`；不配置公开 Route 或 Custom Domain，仅供站点 Service Binding 调用。

### 本轮产物 SHA-256

| 文件 | SHA-256 |
|---|---|
| `package.json` | `b9292c6720bed342c74b9309701de18fb7b2ca8091ab331a3cdb8d4a9bb249b6` |
| `wrangler.site-formal-candidate.jsonc` | `0c414c250bfce6a2211488d80ea44eb0479b9bd35f66e2f283b315542f9cdc1f` |
| `scripts/prepare-w4-formal-wrangler.mjs` | `4bba2b70d0b73b99b90ceae9c14c9839e0232160835eeeb47169575b2a383132` |
| `tests/w4-formal-wrangler-config.test.mjs` | `d5950a36c4366c80a5fb7f1e23ef52f0541c2010317472a3c5b47cf50b9ac009` |
| `wrangler.media-formal-candidate.jsonc` | `061cd69ce7b74cf61481d0a5c5312d0d180afb544b592e0a94aebca1b06e1992` |
| 构建产物 `dist/server/wrangler.json` | `d6bb33e310900644bb4f7f3491801ec373d98fce1093cc4b29319bee05a986bc` |

### 2026-11-18 正式限流绑定续办候选

- 基准源码：HEAD `5a381189d0c0f969b51a38f1c3383d6ba2bb7c22`，在独立干净 Worktree 构建；未复用早期 `dist`，也未改动原工作树中的其他未提交文件。
- 正式构建变量：正式 Supabase URL／Publishable Key 与正式 Turnstile Site Key；PayPal、R2 镜像和 Trial 媒体代理客户端开关均关闭。
- Rate Limiting binding：`R2_MEDIA_MIRROR_RATE_LIMITER`，`namespace_id=2026111801`，`limit=60`、`period=60`。正式账户 6 个 Worker 的 111 个历史版本已扫描，未发现既有 Rate Limiting binding；QA ID `2026110201` 未复用。
- 构建与验证：`node scripts/build-vinext.mjs` PASS；`npm run typecheck:vinext` PASS；Android Auth／Android 单运行时前置／R2 正常路径／W4 配置／R2 用户网关安全定向测试合计 63/63 PASS；`wrangler deploy --dry-run --config dist/server/wrangler.json` PASS。
- 本次续办文件 SHA-256：`wrangler.site-formal-candidate.jsonc` `9f0b927e910d23436503e8b9aa85a3ae8da98849ffc036d3f710cb239b4fdadb`；`scripts/prepare-w4-formal-wrangler.mjs` `a280a6a66a0c251c0e73373107d5db427fd86a37794a617924a6c9f0c3f506ad`；`tests/w4-formal-wrangler-config.test.mjs` `1d7a0cbb76c4bf998cd63f731a303e90fbaa411d6af1b72bd365ac4ce68bdfc0`；本次 `dist/server/wrangler.json` `636572376bea16b53b37349277262ccaa821efaf5fc3e32f4da35525caaad8cc`。
- Dry-run 明确显示 `R2_MEDIA_MIRROR_RATE_LIMITER (60 requests/60s)`、`R2_BUSINESS_MEDIA_SERVICE` 与旧 `R2_MEDIA_CANARY`；`R2_MEDIA_READ_ENABLED=false`、`R2_MEDIA_MIRROR_WRITE_ENABLED=false`，模式 `isolated`。
- **未上传新 Worker 版本、未创建 Deployment、未改变正式流量。**正式 `life-space-canary` 仍由 v98 100% 承接；v99 保持已上传但未部署。新候选部署需另行授权，且部署后仍保持 R2 两项开关关闭。

## 3. 构建与隔离验证

- `npm ci --no-audit --no-fund`：PASS，593 个依赖安装完成。
- 使用正式 Supabase 项目 `eidltoikfpnrzxruvawf` 的有效 publishable key 做构建；未使用 service-role key 代替，未将 key 写入源码或 `.env.local`。
- `build:vinext:formal-candidate`：PASS。
- `npm run typecheck:vinext`：PASS。
- **W4／R2 测试：**原 9 个媒体配置与路径测试 **83/83 PASS**；新增 12 个新 SQL 兼容相关测试文件 **59/59 PASS**，包含 ADM／144 R04、Guide RPC／公共投影、Free／Plus 权限、集市合同。两组均为源码／隔离测试，不代替生产 HTTP。
- **SQL 后兼容性：**继承 022 五步 SQL 最终后像下的 141 R02 实际隔离回退：同一入口 `200 → 503 → 200`；管理员审核列表／详情 RPC 200；A Storage full/thumb 200 且 SHA 一致；B 双图 404；R2 读写关闭。此证明 `90a9c8b` 是 SQL 后兼容 W4 隔离候选，但尚未形成正式 Version ID。
- **141 R04：**仍 PARTIAL。原联合执行记录显示临时 Worker 返回 404、临时凭据及本地密钥文件不存在，三阶段真实 HTTP 未完成；本轮仅继承 141 R02／R03，不把 R04 标为 PASS。
- **回退手册：**`docs/release/LifeSpace-142-SQL-Compatible-W4-Rollback-Runbook-R01.md`，覆盖 SQL 分步失败、SQL 后 W4 切换失败、R2 读取故障及镜像写入故障；正式回退 Version ID 仍 NOT READY。
- 站点配置 `wrangler deploy --dry-run --config dist/server/wrangler.json`：PASS。
- 媒体 Worker 配置 `wrangler deploy --dry-run --config wrangler.media-formal-candidate.jsonc`：PASS。
- CRLF-aware `git diff --check`：PASS。
- Dry-run 临时目录已清理；`dist` 与依赖目录保留为本地构建输出。
- 未执行真实 `wrangler deploy`、版本上传、Worker 资源创建或生产绑定写入。

## 4. 正式 Cloudflare 控制面只读结果

正式账户：`Yoyomibaobao Account`（`5765d2d135aa20de90c898ab93ad4c11`）。

| 项目 | 真实读回 |
|---|---|
| 正式站点 Worker | `life-space-canary` |
| 正式 Custom Domain | `life-space.uk` → `life-space-canary`，environment=production |
| 当前活动 Version ID | `3b35e5f4-740a-4173-9428-aaa0f133c974` |
| 当前 Deployment ID | `aa90caf0-b9a4-499a-87db-f25e14305b45` |
| 当前 R2 binding | `R2_MEDIA_CANARY → life-space-media-canary` |
| 当前 Service Binding | 未发现 `R2_BUSINESS_MEDIA_SERVICE` |
| 当前站点 vars | 空 |
| 当前站点 Secret 名称 | `CRON_SECRET`、`PAYPAL_CLIENT_ID`、`PAYPAL_CLIENT_SECRET`、`PAYPAL_WEBHOOK_ID`、`R2_CANARY_SECRET`、`SUPABASE_SERVICE_ROLE_KEY` |
| `R2_MEDIA_SERVICE_AUTH_SECRET` | 未发现 |
| 正式账户 Worker 总数 | 5 |
| 正式账户 R2 桶 | 仅 `life-space-media-canary` |
| `life-space-business-media` Worker | 不存在 |
| `life-space-business-media` R2 桶 | 不存在 |

隔离实验账户中已有的 QA Worker 与 QA R2 桶不计入正式资源。两个账户保持区分。

## 5. Secret 与 Rate Limit 合同

- 当前私有媒体 Worker 入口所需的共享 HMAC Secret 名称为 `R2_MEDIA_SERVICE_AUTH_SECRET`。
- 同一个随机 Secret 值必须分别配置在站点 Worker 与媒体 Worker；代码要求至少 32 字节。
- 站点 Worker 现有 `SUPABASE_SERVICE_ROLE_KEY` 保留原位；媒体 Worker 不需要也不得复制该 service-role secret。
- 当前私有 Worker 入口只暴露内部读取与受控阶段写入；未启用旧迁移入口时，不额外创建 `R2_MEDIA_MIGRATION_SECRET` 或 `R2_MEDIA_SIGNING_SECRET`。
- 镜像写入还要求站点 Worker 有 Cloudflare Rate Limiting binding：`R2_MEDIA_MIRROR_RATE_LIMITER`。正式部署候选已补齐该绑定；当前生产 Worker 尚未部署此绑定。
- Cloudflare Rate Limiting binding 的 `namespace_id` 是账户内自行指定的正整数，不需要另建独立 namespace 资源；必须保证同一 Cloudflare 账户内唯一。QA 的 `2026110201` 仅属 QA，不得复制到正式账户。正式候选使用 `2026111801`，`limit=60`、`period=60`；只读扫描正式账户 6 个 Worker 的全部 111 个历史版本，未发现既有 Rate Limiting binding。正式写入开关启用前仍须先部署并核验此绑定。
- 本轮未读取、输出或写入任何正式 Secret 值。

## 6. Android v29 合同核对

从 Actions Artifact `14136050225` 下载并检查实际 APK：

- 包名：`com.youshi.cultivation`。
- versionCode：`29`；versionName：`1.0.5-rc137`。
- APK SHA-256：`76461fefe4c380156dfa280ad04243ead0cdcee8730b48b7b8c69f588a91c82b`。
- Capacitor API Origin：`https://life-space.uk`。
- 离线壳媒体接口包含同源 `/api/media/record-image`，同时保留 Supabase Storage 签名地址兼容逻辑。
- 静态合同与新 W4 接口一致；未发现需要交回 137／139 的 Origin 错配。
- Artifact 元数据 `channel=test`；工作流网站发布步骤 SKIPPED。签名 APK 存在不代表正式下载分发已完成。
- 未做新真机安装或正式包覆盖升级。

## 7. 147／148 可执行发布前置顺序

**A. 正式资源准备（本轮 STOP）**

1. 在正式账户创建私有 R2 桶 `life-space-business-media`；保持公开访问关闭，不启用 r2.dev 或公开域名。
2. 创建媒体 Worker `life-space-business-media`，按 `wrangler.media-formal-candidate.jsonc` 配置 `R2_BUSINESS_MEDIA`，关闭 workers.dev、preview URL 和所有公开路由。
3. 在媒体 Worker 与站点 Worker 配置同一个 `R2_MEDIA_SERVICE_AUTH_SECRET`；不改变现有 Supabase service-role secret。
4. 如需启用镜像写入，站点 binding `R2_MEDIA_MIRROR_RATE_LIMITER` 使用正式唯一 `namespace_id=2026111801`、`limit=60`、`period=60`；不创建独立 namespace 资源，不使用 QA ID `2026110201`。部署绑定与开启镜像写入是两个独立步骤，绑定部署后仍保持写入开关关闭，待单独授权和验收后才可开启。

**B. 先媒体 Worker，后站点 W4**

5. 部署媒体 Worker，读写变量全部 false；记录真实 Version ID。
6. 部署站点 W4，使用构建产物 `dist/server/wrangler.json`；保留 `life-space.uk` Custom Domain 与旧 `R2_MEDIA_CANARY`；增加 Service Binding；两项开关继续 false；记录真实 Version ID。
7. 用真实 Owner／非 Owner／匿名会话验收 full/thumb、Storage fallback、拒绝状态和缓存控制；确认 R2 读写仍未触发。

**C. 只有另获开关授权后才启用**

8. 启用 R2 读取时：先把媒体 Worker 的 `R2_MEDIA_READ_ENABLED` 设为 true，确认服务可用；再把站点 Worker 同一开关设为 true。
9. 启用镜像写入时：先把媒体 Worker 的 `R2_MEDIA_MIRROR_WRITE_ENABLED` 设为 true；再把站点 Worker 同一开关设为 true。必须先有正式 Rate Limiting binding。
10. 发生异常时先关闭站点 Worker 对应开关，停止新请求；再关闭媒体 Worker 对应开关。保留 Storage fallback、Service Binding 和 R2 对象，不以删除资源作为回退手段。

## 8. 新 SQL 后的兼容回退门禁

- SQL 正式安装仍为 STOP。
- SQL 提交前，当前 v93 仍是现役站点版本。
- 新审核 SQL 提交后，旧 v93 不兼容，不得作为整站回退版本。
- 本轮生成的 `90a9c8b` W4 构建候选具备配置与隔离测试证据，但**尚未上传正式 Cloudflare，也没有正式 Version ID**，所以现在还不是可执行的生产回退入口。
- 只有在新 W4 兼容版本实际上传、真实 HTTP 验收、Version ID 和回退指令被记录后，才能将其登记为 SQL 后的回退目标。
- 141 R02／R03 已通过成果继承；141 R04 仍 PARTIAL：既有联合执行记录显示临时 Worker 404、临时凭据与本地密钥文件不存在，三阶段真实 HTTP 未完成。不能用本轮 dry-run 替代。详见 `docs/release/LifeSpace-142-SQL-Compatible-W4-Rollback-Runbook-R01.md`。

## 9. 最终判定

| 判定项 | 结果 |
|---|---|
| 142 源码／配置候选 | READY |
| 142 正式 Cloudflare 资源 | NOT READY |
| 142 生产部署 | STOP |
| 147／148 部署前置 | NOT READY |
| SQL 后正式回退入口 | NOT READY |
| Android v29 静态合同 | PASS |
| Android v29 正式分发 | NOT VERIFIED |

**需另行授权的事项：** 创建正式 R2 桶、创建／部署正式媒体 Worker、写入两个 Worker 的 HMAC Secret、创建正式 Rate Limiting namespace、部署站点 W4、正式 SQL 安装，以及任何 R2 读取／镜像写入开关。全部保持 STOP。
