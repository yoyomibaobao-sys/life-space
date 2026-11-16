# LifeSpace｜新 SQL 后 W4 兼容回退执行手册 R01

**适用基线：** `90a9c8bc1dcccf7a5887e3d1b496cf4f790567f1`
**适用 SQL 顺序：** R39 R02 → 020 R02 → R10 正式适配 R01 → 040 安装包装 → 144 R04
**当前状态：** 方案已准备；生产回退入口未就绪；本手册不构成部署、SQL、停写、解闸或 R2 开关授权。

## 1. 不能违反的兼容边界

1. 首次 R39 COMMIT 前，v93 只可在已确认仍是旧 SQL 的状态下作为原部署锚点。
2. 首次 R39 COMMIT 后，v93 与新审核 SQL 不兼容，禁止把 v93 设为回退目标。不能以隐藏按钮、旧 UI 或重放旧 ZIP 规避 SQL 合同。
3. SQL 每一步都是独立事务。后一步失败不会撤销前面已 COMMIT 的步骤；不能从头重装已提交步骤，也不能默认执行逆迁移。
4. SQL 后可用的 W4 前向恢复目标是已验证兼容新审核合同的 `90a9c8b`。但正式上传、部署、真实 HTTP 验收和 Version ID 登记尚未完成；在这些前置闭环前，它只是已验证的隔离候选，不是可直接点选的正式回退 Version。
5. SQL 后异常保持 gate=true；只有 SQL、W4、权限与业务验收全部 PASS，才可另行批准 gate=false；Vercel Cron 最后恢复。

## 2. 场景 A：SQL 任一步失败

**立即停止：**本步失败后不执行下一步，不重跑此前已提交步骤，不解除 gate，不恢复 Cron，不回退 v93。

| 失败点 | 必须保留的后像 | 继续起点 |
|---|---|---|
| R39 在 COMMIT 前失败 | 旧 SQL 前像；核实 R39 未提交 | 修复后重新核对第 1 步前置 |
| R39 已 COMMIT，020 失败 | R39 保留；v93 已禁作回退 | 从 020 续办 |
| 020 已 COMMIT，R10 失败 | R39／020 保留 | 从 R10 续办 |
| R10 已 COMMIT，040 失败 | R39／020／R10 保留；唯一 gate=true；144 未执行 | 从 040 安装包装续办 |
| 040 已 COMMIT，144 失败 | R39／020／R10／040 保留；gate=true；144 未提交 | 从 144 R04 续办 |

**已验证的失败处置样例：**141 R03 在 R39／020／R10 已提交的隔离库中，于 040 COMMIT 前注入 SQLSTATE `P1410`。psql 退出码 3；040 未提交；此前提交保留；gate 仍为 true；144 未执行。故实际恢复起点是 040 包装，不是回滚前三步。

## 3. 场景 B：新 SQL 已提交，W4 切换后验收失败

**立即停止：**

1. 保持 gate=true；若 Cron 已按另行授权暂停，则继续保持暂停，不自行恢复。
2. R2 读取和镜像写入保持 false。
3. 停止新的业务写入与后续发布步骤，保留数据库现有已提交后像。
4. 不切回 v93，不运行 SQL 逆迁移。

**恢复顺序：**

1. 先确认当前站点 Worker、Custom Domain、Deployment／Version ID、构建 SHA 和实际 Supabase 目标。
2. 若已部署并完成新 SQL 兼容验收的 `90a9c8b` W4 版本有正式 Version ID，则将站点恢复到该兼容版本；核对 Service Binding、旧 `R2_MEDIA_CANARY`、HMAC Secret 名称与两个 R2 开关均符合冻结配置。
3. 若该兼容版本尚无正式 Version ID，或真实 HTTP 验收未通过，**没有可宣称可执行的生产代码回退目标**。保持维护／写入冻结，修复并前向发布兼容 W4；不得用 v93 代替。
4. 恢复后重新验证登录与个人空间、管理员审核列表／详情 RPC、管理员与普通用户权限、Guide 投影／Plus RPC、会员与集市合同、Owner A 双图和非 Owner B／匿名拒绝。
5. SQL、W4 与权限验收全部通过后，gate=false 必须单独授权、单行断言；按批准顺序恢复业务，Cron 最后恢复。

## 4. 场景 C：R2 读取异常

此场景采用功能级回退，不需要整站回滚：

1. **先关闭站点 Worker** `R2_MEDIA_READ_ENABLED=false`，立即停止新请求走 R2。
2. **再关闭媒体 Worker** `R2_MEDIA_READ_ENABLED=false`。
3. 保留 Service Binding、HMAC Secret、私有桶和对象；不要删除 R2 数据或解除 Storage 原路径。
4. 通过原 Supabase Storage 授权链读取 Owner A 的 full/thumb；确认非 Owner B 与匿名仍被拒绝，响应为私有、no-store。
5. 核对双图长度、MIME、SHA-256 与既有源指纹；确认页面和 API 已回到 Storage 路径后停止。
6. R2 修复与重新开启必须另行授权；恢复顺序先媒体 Worker 读开关，再站点 Worker 读开关。

## 5. 场景 D：R2 镜像写入异常

1. **先关闭站点 Worker** `R2_MEDIA_MIRROR_WRITE_ENABLED=false`，阻止新镜像请求进入。
2. **再关闭媒体 Worker** `R2_MEDIA_MIRROR_WRITE_ENABLED=false`。
3. 保留旧 Storage 正常上传／读取路径；不删除已写对象，不盲目重试部分失败对象。
4. 核对记录、媒体关联、Owner、容量计数、对象 SHA、幂等键及 Rate Limiting 状态；区分未写、部分写、已写但回执丢失。
5. 修复、补写与重新打开写开关均需独立授权。正式 Rate Limiting namespace 与 `R2_MEDIA_MIRROR_RATE_LIMITER` binding 未建立前不得打开镜像写入。

## 6. 当前可执行性清单

| 条件 | 当前证据 | 状态 |
|---|---|---|
| 新 SQL 后像兼容的 W4 源码 | `90a9c8b` | PASS（隔离） |
| 五步 SQL 后像下 W4 回退 HTTP | 141 R02：200 → 503 → 200 | PASS（隔离） |
| 管理员审核列表／详情 | 141 R02 RPC HTTP 200 | PASS（隔离） |
| Owner A Storage 原图／缩略图 | 200／200，SHA 一致 | PASS（隔离） |
| B 双图拒绝 | 404／404 | PASS（隔离） |
| SQL 中途失败处理 | 141 R03：040 P1410、前序后像保留、gate=true | PASS（隔离） |
| 正式媒体 Worker／R2 桶 | 正式账户未发现 | NOT READY |
| 正式站点 Service Binding／共享 HMAC Secret | 当前正式 Worker 未配置 | NOT READY |
| 正式 W4 兼容 Version ID | 尚未上传 | NOT READY |
| 141 R04 真实站点／媒体 Worker 开关联动 HTTP | 旧演练暂停；临时 Worker 404、临时凭据缺失 | NOT VERIFIED |
| 147／148 正式发布 | 需另行授权 | STOP |

**结论：**恢复方案的 SQL 事务边界、隔离兼容版本和功能级 R2 回退顺序已有证据；但正式 Worker 版本与绑定尚未建立。当前不得签收“正式回退入口 READY”，不得把 141 R04 记为 PASS。
