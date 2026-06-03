# Supabase 数据库权限修正方案

本文档根据以下资料整理：

* `docs/database.md`
* `AGENTS.md`
* `0455f93 chore: add supabase schema snapshot` 中的 `supabase/schema.sql`
* 第 8 步 Supabase schema 审计结果

本文档只做分析和修正方案，不是 migration，不包含可直接执行的 SQL，不修改数据库结构。

## 一、profiles 公开读取风险

### 当前问题

`profiles` 已启用 RLS，但存在 `profiles_public_read USING (true)`，这会让外部角色读取整张 `profiles` 表中所有列。

`profiles` 当前包含：

* `id`
* `email`
* `username`
* `updated_at`
* `location`
* `level`
* `flower_count`
* `view_count`
* `created_at`
* `avatar_url`
* `storage_used`
* `storage_limit`
* `country_code`
* `country_name`
* `region_name`
* `city_name`

### 可以公开的字段

以下字段可考虑用于公开作者信息，但仍应通过专门 view 控制，而不是公开整表：

* `id`
* `username`
* `avatar_url`
* `level`
* `flower_count`
* `view_count`
* `country_code`
* `country_name`
* `region_name`
* `city_name`
* `created_at`

其中地区字段应根据产品规则谨慎处理。公开内容可以展示模糊地区，例如国家、地区、城市，但不能展示精确地址。

### 必须私密的字段

以下字段不应通过公开读取暴露：

* `email`
* `location`
* `storage_used`
* `storage_limit`
* 未来可能新增的手机号、支付标记、后台备注、精确位置、系统内部状态

`email` 是明确的个人敏感信息。`location` 语义不清，如果曾经存储过住址、详细地址或精确位置，也应视为敏感字段。`storage_used` / `storage_limit` 属于会员和容量状态，不应公开给匿名用户或其他普通用户。

### 是否需要 public_profiles view

建议创建 `public_profiles` view，用于公开作者信息展示。

建议 view 只包含前端公开展示确实需要的字段，例如：

* `id`
* `username`
* `avatar_url`
* `level`
* `flower_count`
* `view_count`
* `country_code`
* `country_name`
* `region_name`
* `city_name`

如果未来需要国际化或更细粒度隐私设置，可以再加入用户可控的公开字段开关。

### 是否应该移除 profiles 的公开全表读取 policy

建议移除 `profiles_public_read USING (true)` 或替换为更严格的策略。

推荐方向：

* 当前用户可以读取自己的完整 profile。
* 公开页面和 Discover 只读取 `public_profiles`。
* 管理员读取用户资料应通过后台 RPC 或管理端专用视图，并依赖 `is_app_admin(auth.uid())`。

### 前端展示作者信息应该改读什么

前端公开展示作者信息时，不应直接读 `profiles` 整表。

建议改读：

* `public_profiles` view
* 或已经做过公开字段筛选的 `discovery_feed_view`

如果页面需要当前登录用户自己的完整 profile，则应只允许读取 `auth.uid() = profiles.id` 的行。

## 二、timeline_view 私密内容泄露风险

### 当前问题

`timeline_view` 当前定义会从 `records`、`archives`、`media` 直接关联读取时间线数据，但没有公开 / 私密过滤，并且对 `anon` / `authenticated` 授予了访问权限。

### timeline_view 当前包含的字段

`timeline_view` 当前包含：

* `record_id`
* `archives.title`
* `records.note`
* `records.photo_time`
* `media.url`

### 是否包含私密内容

包含。

风险字段包括：

* `records.note`：用户记录正文，可能包含私密耕作过程、生活记录、地址、备注。
* `archives.title`：档案标题可能包含位置、家庭成员、私人命名。
* `media.url`：如果图片 URL 可直接访问，可能绕过记录可见性。

如果该 view 没有过滤 `records.visibility = 'public'` 和 `archives.is_public = true`，就不符合 Discover 只能读取公开内容的规则。

### 是否应该删除对 anon 的访问

建议删除 `anon` 对 `timeline_view` 的访问。

如果 `timeline_view` 是给登录用户自己的空间使用，则不应暴露给匿名用户。

### 是否应该拆成 private timeline 和 public discovery timeline

建议拆分。

推荐方向：

* 私有时间线：仅当前登录用户可访问自己的记录，过滤 `records.user_id = auth.uid()`。
* 公开发现流：只使用 `discovery_feed_view`，过滤 `records.visibility = 'public'` 且 `archives.is_public = true`。

### 是否应该只让当前用户访问自己的 timeline

是。

如果保留 `timeline_view`，建议明确它是“我的时间线”，并保证只返回当前用户有权限访问的内容。

更稳妥的做法是：

* `timeline_view` 不对 `anon` 开放。
* 对 `authenticated` 也只返回自己的记录。
* 如果 SQL view 难以正确使用调用者身份，应改为 RPC 或在应用查询层直接查询受 RLS 保护的表。

### Discover 应该只使用 discovery_feed_view

是。

Discover / 发现页应只使用 `discovery_feed_view` 或等价的公开内容 view。当前 `discovery_feed_view` 已包含：

* `records.visibility = 'public'`
* `archives.is_public = true`

后续仍需确认该 view 不包含不应公开的 profile 字段、精确位置字段或内部状态字段。

## 三、GRANT ALL 和 default privileges 过宽风险

### 当前问题

schema 中大量表、函数、序列对 `anon` / `authenticated` 授予了 `ALL`，且 default privileges 也授予未来对象 `ALL`。这会扩大攻击面。

RLS 可以限制表级数据访问，但不能自动修正所有风险：

* 没启用 RLS 的表会直接暴露。
* view 可能绕过预期过滤。
* RPC 函数如果是 `SECURITY DEFINER` 且内部校验不足，会绕过表 RLS。
* future default privileges 会让未来新建对象默认暴露。

### 哪些 GRANT 应收紧

建议优先收紧：

* 所有对 `anon` 的 `ALL ON TABLE`
* 所有对 `anon` 的 `ALL ON FUNCTION`
* 所有对 `anon` / `authenticated` 的 `TRUNCATE`、`REFERENCES`、`TRIGGER`、`MAINTAIN`
* 内部 trigger/helper 函数的外部执行权限
* `timeline_view`、`profiles`、`plant_species_pending`、`membership_payments` 等敏感对象的宽授权
* default privileges 中对 `anon` / `authenticated` 的 `ALL`

### anon 应该只保留哪些 SELECT 权限

`anon` 应尽量只用于公开页面需要的只读内容。

可考虑保留：

* `discovery_feed_view` 的 SELECT
* `discovery_view` 的 SELECT，如果仍被使用且公开过滤正确
* `public_profiles` 的 SELECT
* 公开作物库相关 view / 表的 SELECT，前提是不含用户提交草稿和后台字段
* 公开记录、公开档案相关查询能力，但最好通过 view 暴露，而不是整表 `ALL`

`anon` 不应拥有：

* INSERT / UPDATE / DELETE
* TRUNCATE / REFERENCES / TRIGGER / MAINTAIN
* 管理员 RPC 的执行权限
* 内部同步、通知、统计、容量函数的执行权限

### authenticated 应该只保留哪些权限

`authenticated` 应保留用户正常使用 App 所需的最小权限：

* 对自己档案、记录、媒体、标签、评论、关注、通知等表的 SELECT / INSERT / UPDATE / DELETE
* 对公开内容的 SELECT
* 对当前用户会员状态的读取
* 对必要用户操作 RPC 的 EXECUTE

这些权限必须由 RLS 限制到：

* 只能读写自己的私有数据
* 只能读取公开内容
* 只能对自己有权限的记录、档案、媒体执行操作
* 不能直接改会员、支付、管理员表

### 哪些权限应交给 RLS 控制

用户内容相关表应由 RLS 控制行级权限：

* `archives`
* `records`
* `media`
* `record_tags`
* `comments`
* `comment_likes`
* `record_likes`
* `comment_flowers`
* `follows`
* `archive_follows`
* `sub_tags`
* `group_tags`
* `locations`
* `notifications`
* `market_posts`
* `market_media`
* `market_comments`
* `user_plant_interests`
* `user_plant_plans`

但 RLS 不能替代列级隐私控制。像 `profiles.email` 这种字段，应通过 view 或 RPC 避免公开列级暴露。

### 是否应该撤销 default privileges 中对 anon / authenticated 的 ALL

建议撤销。

未来对象不应默认对 `anon` / `authenticated` 授权 `ALL`。建议改为：

* 默认不暴露新对象。
* 每个新表、新 view、新函数根据用途单独授权。
* 公开接口优先通过明确命名的 view / RPC 暴露。

## 四、plant_species_pending 未启用 RLS 风险

### 当前问题

`plant_species_pending` 含：

* `id`
* `user_id`
* `submitted_name`
* `language_code`
* `status`
* `created_at`
* `note`

但当前未启用 RLS，并且对 `anon` / `authenticated` 授予了宽权限。

### 是否应允许匿名提交

需要产品确认。

建议默认不允许匿名提交。原因：

* 容易被滥用为垃圾提交入口。
* `note` 可能包含用户隐私或攻击内容。
* 后续审核工作量会上升。

如果产品确实要允许匿名提交，应通过专门 RPC 做输入限制、频率限制和字段过滤，而不是开放整表写入。

### 如果允许匿名提交，是否需要限制可读

必须限制可读。

匿名用户即使可以提交，也不应读取全部 pending 内容。提交成功后可返回一个简单状态，不应暴露其他人的提交内容。

### 登录用户是否只能读取 / 修改自己的提交

是。

建议：

* 登录用户只能读取自己的提交。
* 登录用户只能修改自己仍处于 `pending` 状态的提交。
* 登录用户不能把自己的提交直接改成 `approved`。
* 登录用户不能删除或查看其他人的提交。

### 管理员是否可以查看全部

可以，但必须依赖 `is_app_admin(auth.uid())` 或更强的管理员后端逻辑。

管理员可用于：

* 查看全部 pending 项
* 审核通过
* 驳回
* 合并到正式作物库

### 应添加哪些 RLS policies

后续 migration 可考虑这些策略类型：

* 启用 `plant_species_pending` RLS。
* authenticated insert own：`user_id = auth.uid()`。
* authenticated select own：只能查看自己的提交。
* authenticated update own pending：只能更新自己的 pending 内容，不能改审核状态。
* admin select all：管理员可读取全部。
* admin update all：管理员可审核全部。
* anon insert limited：仅在产品确认允许匿名提交后，通过 RPC 或严格 policy 支持。
* 禁止 anon select all。

## 五、RPC 函数暴露风险

### create_notification

当前风险最高。

函数是 `SECURITY DEFINER`，内部没有校验调用者是否有权给目标用户创建通知，并且授予了 `anon` / `authenticated` 执行权限。

风险：

* 匿名用户可能伪造通知。
* 普通登录用户可能给任意用户发送通知。
* 可造成骚扰、钓鱼链接、伪造系统消息。

建议：

* 不授予 `anon`。
* 不直接授予普通 `authenticated` 外部调用。
* 仅作为 trigger 内部函数或服务端/admin 使用。
* 如果必须外部调用，应校验 `auth.uid()`、通知类型、目标资源权限、频率限制和内容长度。

### release_storage_bytes

当前函数会按 `auth.uid()` 降低当前用户 `profiles.storage_used`，但没有绑定具体 media 记录或 Storage 删除事件。

风险：

* 登录用户可反复调用降低自己的容量使用量。
* 可能绕过容量限制。
* 统计值可能与真实 Storage 对象不一致。

建议：

* 不授予 `anon`。
* 谨慎授予 `authenticated`。
* 最好改为只能在删除 media 记录或服务端确认 Storage 删除后触发。
* 如果保留 RPC，应传入并校验 `media_id`，确认 media 属于当前用户且确实被删除或即将删除。

### reserve_storage_bytes

当前函数会按 `auth.uid()` 增加当前用户使用量，并检查会员状态和容量上限。

风险：

* 不应授予 `anon`。
* 如果上传流程失败后没有可靠回滚，容量统计会不准确。
* 如果用户可以先 release 再 reserve，容量限制仍可能被绕过。

建议：

* 只授予 `authenticated` 或服务端上传流程。
* 与 media insert / Storage upload 建立一致的事务或补偿机制。
* 定期通过 Storage 对象重新核算容量。

### get_my_membership

当前函数按 `auth.uid()` 返回当前用户会员状态，逻辑方向正确。

建议：

* 不需要授予 `anon`，匿名调用只会返回空结果，但保留 anon 没有实际价值。
* 应授予 `authenticated`。
* 保持只返回当前用户，不接受任意 `user_id` 参数。

### is_app_admin

当前函数通过 `app_admins` 判断管理员，`admin_*` 函数依赖它。

建议：

* 不授予 `anon`。
* 可授予 `authenticated`，但仅返回当前用户是否为管理员更稳。
* 当前签名接受 `p_user_id`，普通用户理论上可探测任意用户是否管理员。建议未来改为仅判断 `auth.uid()`，或限制只有 admin / service role 可查任意用户。

### 所有 admin_* 函数

当前 `admin_*` 函数普遍有内部 `is_app_admin(auth.uid())` 检查，这是必要的后端判断，方向正确。

风险：

* 仍授予 `authenticated` 执行，攻击面较大。
* 如果某个函数内部漏校验，就会成为高危入口。
* `admin_search_memberships` 返回 email、会员状态、容量信息，只能管理员访问。

建议：

* 保留内部 `is_app_admin(auth.uid())` 检查。
* 限制 EXECUTE 权限，只开放给确认需要的角色。
* 后续逐个审计参数、返回值、幂等性和错误信息。
* 支付确认类函数必须校验订单、金额、币种、平台交易号和重复处理逻辑。

### increment_archive_view_count

当前函数只会更新 `is_public = true` 的档案浏览量。

风险：

* 授予 `anon` 可以接受，但可能被刷量。
* 不涉及私密内容泄露，但会造成统计污染。

建议：

* 可以保留匿名调用，但需要限流或服务端防刷。
* 只允许 public archive 增加浏览量，这一点应保留。
* 不应返回除计数外的敏感信息。

### SECURITY DEFINER / SECURITY INVOKER 建议

原则：

* 需要绕过 RLS 做受控内部操作的函数，才使用 `SECURITY DEFINER`。
* `SECURITY DEFINER` 函数必须有严格的 `auth.uid()`、角色、资源归属校验。
* 纯读取当前用户数据的函数优先考虑 `SECURITY INVOKER` 或依赖 RLS。
* trigger 专用函数不应授予外部角色直接执行。

## 六、Storage policy 缺失

public schema 无法完整覆盖 Storage bucket 和 Storage policy。后续必须从 Supabase Dashboard 单独检查。

### media bucket

必须确认：

* bucket 是否 public。
* select policy 是否只允许读取公开记录图片或当前用户自己的图片。
* insert policy 是否只允许用户上传到自己的路径。
* update policy 是否禁止用户改他人文件。
* delete policy 是否只允许用户删除自己的文件。
* 文件路径是否以 `user_id` 或等价 owner 前缀隔离。
* 私密记录图片是否可能通过 public URL 直接访问。
* 缩略图路径是否继承同样权限。

如果 `media` bucket 是 public，则即使表 RLS 正确，知道 URL 的人也可能直接访问私密图片。这需要重点确认。

### avatars bucket

必须确认：

* bucket 是否 public。
* 头像是否允许公开读取。
* insert / update / delete 是否限制用户只能操作自己的头像。
* 文件路径是否按 `user_id` 隔离。
* 是否允许覆盖他人头像路径。

头像可以公开展示，但写权限必须严格限制。

### EXIF 位置数据

后续需要确认上传流程是否清理图片 EXIF 位置信息。

如果图片用于 Discover，尤其需要避免公开家庭住址、精确经纬度、拍摄设备隐私信息。

## 七、分阶段修正计划

### P0：必须先修

1. 收紧 `profiles` 公开读取。

   移除或替换 `profiles_public_read USING (true)`，新增 `public_profiles` view 给公开页面使用，避免公开 `email`、`location`、容量信息。

2. 处理 `timeline_view`。

   删除 `anon` 对 `timeline_view` 的访问，或将其改为只返回公开内容 / 当前用户自己的内容。Discover 统一使用 `discovery_feed_view`。

3. 限制危险 RPC。

   优先处理 `create_notification`、`release_storage_bytes`、`reserve_storage_bytes`、内部 trigger/helper 函数的外部执行权限。`create_notification` 不应被匿名或普通用户直接调用。

4. 启用并收紧 `plant_species_pending` RLS。

   禁止匿名读取全部 pending 内容；登录用户只能操作自己的提交；管理员可审核全部。

5. 检查 Storage bucket policy。

   重点确认 `media` bucket 是否 public，以及私密记录图片是否能通过 URL 直接访问。

### P1：建议尽快修

1. 收紧表级 grants。

   撤销 `anon` / `authenticated` 不需要的 `ALL`、`TRUNCATE`、`REFERENCES`、`TRIGGER`、`MAINTAIN`。

2. 收紧 function execute grants。

   内部函数、统计同步函数、trigger 函数、管理员函数不应默认对外可执行。

3. 撤销 default privileges 中对 `anon` / `authenticated` 的 `ALL`。

   未来对象应默认不暴露，新增对象必须显式评审权限。

4. 审计 `is_app_admin(p_user_id)`。

   防止普通用户枚举管理员身份。可以考虑只允许判断当前用户，或限制任意用户查询能力。

5. 审计会员和支付相关 RPC。

   确认 `admin_*` 函数参数、幂等性、交易号唯一性、重复确认处理、金额币种校验。

### P2：后续优化

1. 建立公开数据层。

   用 `public_profiles`、`public_archives`、`public_records` 或 `discovery_feed_view` 这类 view 统一暴露公开内容，避免前端直接读宽表。

2. 建立私有数据层。

   当前用户自己的空间、导出、设置、会员状态使用 RLS 或专用 RPC，明确边界。

3. 建立权限审计清单。

   每张表记录：是否 public、是否含私密数据、RLS 状态、anon 权限、authenticated 权限、admin 权限。

4. 建立 Storage 路径规范。

   明确 `media`、`avatars`、缩略图路径规则，保证路径与用户 ID、记录可见性一致。

5. 建立容量重新核算任务。

   定期根据 Storage 对象和 `media` 表校准 `profiles.storage_used`，避免 RPC 或上传失败造成统计漂移。

## 八、后续 migration 建议

当前不生成 migration。后续可能需要这些 migration 类型：

* revoke grants：撤销 `anon` / `authenticated` 过宽表、函数、序列权限。
* enable RLS：为 `plant_species_pending` 等未启用 RLS 的敏感表启用 RLS。
* drop / replace policy：移除 `profiles_public_read USING (true)`，替换为 own-profile policy。
* create public_profiles view：公开作者信息通过 view 输出。
* alter view / replace timeline_view：修正 timeline 私密过滤，或拆分 public / private timeline。
* restrict function execute：限制 `create_notification`、容量 RPC、内部 trigger/helper 函数和 admin RPC 的执行权限。
* adjust default privileges：撤销未来对象对 `anon` / `authenticated` 的默认 `ALL`。
* add Storage policies：针对 `media`、`avatars` 分别补充 select / insert / update / delete policy。
* add rate limit or server-side guards：对浏览量、通知、匿名提交等容易滥用的入口增加限制。

## 九、结论

### 当前最危险的 5 个问题

1. `profiles` 整表公开读取，可能泄露 email、location、容量信息。
2. `timeline_view` 无公开 / 私密过滤且开放给外部角色，可能泄露私密记录和图片 URL。
3. `create_notification` 可被外部角色执行且缺少权限校验，可能被用于伪造通知。
4. `plant_species_pending` 未启用 RLS 且宽授权，可能暴露用户提交内容或被匿名滥用。
5. 大量 `GRANT ALL` 和 default privileges 过宽，未来新增对象容易默认暴露。

### 推荐最先修的 3 个问题

1. 先修 `profiles`：移除公开整表读取，建立 `public_profiles`。
2. 再修 `timeline_view`：禁止匿名访问，拆分私有 timeline 和公开 discovery。
3. 再修 RPC 暴露：限制 `create_notification`、`release_storage_bytes`、`reserve_storage_bytes` 和内部 helper 函数的外部执行权限。

### 必须人工确认后才能写 migration 的内容

* `profiles` 哪些字段允许公开展示。
* `location` 是否曾经存储精确地址或住址。
* 前端当前是否直接依赖 `profiles.email` 或整表 profile 查询。
* `timeline_view` 当前是否仍被页面使用。
* `plant_species_pending` 是否允许匿名提交。
* `media` bucket 和 `avatars` bucket 当前是否 public。
* 私密记录图片是否使用 public URL。
* `create_notification` 是否有前端直接调用场景。
* 容量统计流程中 `reserve_storage_bytes` / `release_storage_bytes` 的调用顺序。
* 管理员 RPC 是否只在后台页面调用，是否需要 service role API route 代理。

### 是否建议下一步生成 migration 草案

建议下一步生成 migration 草案，但先只生成草案，不直接运行。

推荐先生成 P0 migration 草案，范围只包括：

* `profiles` 公开读取修正
* `public_profiles` view
* `timeline_view` 访问限制或替代 view
* `create_notification` / 容量 RPC / 内部 helper 函数执行权限收紧
* `plant_species_pending` RLS

Storage policy 由于 public schema 不完整，必须先从 Supabase Dashboard 补充 `media` 和 `avatars` bucket policy 后，再决定对应 migration 或手动配置方案。
