# 数据库变更与权限说明

数据库结构以 `supabase/migrations/` 为变更来源，`supabase/schema.sql` 是现有远端结构快照。所有结构与权限调整都必须写成可审查的 migration；不得在开发任务中直接修改生产数据库，也不得提交真实用户、付款或密钥数据。

## 会员与付款对象

- `public.user_memberships`：会员方案、状态、到期时间、云端容量和集市发布额度。
- `public.membership_payments`：已确认付款台账，同时承载用户创建的人工付款订单。订单扩展字段包括 `order_number`、`proof_path`、提交／审核时间、审核人和补充凭证说明。
- `storage.buckets.id = 'payment-proofs'`：私有付款凭证 bucket，单文件最多 5MB，仅接受 JPEG、PNG、WebP。
- `public.app_admins` 与 `public.is_app_admin`：管理员身份的服务端可信来源。前端显示管理员入口不能代替数据库权限检查。

## 经验实时播放

- `public.experience_cards.playback_media_ids`：仅保存作者选中的来源图片 ID 和顺序，不保存 MP4，也不复制记录图片。`NULL` 表示旧经验卡沿用全部来源图片；空数组表示作者主动选择纯文字播放。
- `save_experience_card_playback_selection`：仅允许有效云会员更新自己的经验卡播放配置，并校验每个图片都属于该经验卡已经选择的来源记录。
- 公开经验页读取经验卡、来源记录和原图片，在用户设备上实时组成竖屏播放；项目或来源记录失去公开资格时，现有 `is_experience_card_public` 规则会立即阻止公开读取。

## 付款权限边界

- 匿名用户没有付款表和付款 RPC 权限。
- 登录用户对付款表只保留 `SELECT`，并只能通过 RLS 查询自己的付款订单；`INSERT`、`UPDATE`、`DELETE`、`TRUNCATE` 等表权限全部撤销。
- 创建订单和提交凭证通过 `create_membership_payment_order_json`、`submit_membership_payment_order_json` 完成。
- 凭证固定保存为 `<user_id>/<order_id>/proof`，避免同一未完成订单无限创建对象；订单进入待审核后，用户不能再覆盖，只有管理员要求补充后才重新开放。
- 管理员队列、要求补充凭证和确认开通均使用 `admin_*` SECURITY DEFINER RPC；每个函数内部仍必须调用 `is_app_admin(auth.uid())`。
- `admin_confirm_submitted_membership_payment_json` 在单一事务中确认订单并更新会员，使用订单行锁与按用户 advisory lock 防止重复开通。
- 用户注销账号时删除 `payment-proofs/<user_id>/` 下的私有凭证，将未完成订单取消，并把保留的付款审计行中的凭证路径置空，避免遗留孤立截图或后台待审核项。

## 本地核验

数据库变更至少运行：

```bash
supabase db reset
psql "$LOCAL_SUPABASE_DB_URL" -f supabase/tests/membership_payment_orders_catalog.sql
psql "$LOCAL_SUPABASE_DB_URL" -f supabase/tests/experience_playback_manifest_catalog.sql
psql "$LOCAL_SUPABASE_DB_URL" -f supabase/tests/public_readiness_hardening_dynamic.sql
```

如果当前执行环境无法启动本地 Supabase，必须至少完成 TypeScript、应用测试和 SQL 静态审查，并在交付说明中明确数据库目录测试尚未实际执行；部署前仍需在可用的本地 Supabase 环境运行上述检查。

本批发布必须依次应用 `20260814022739_add_membership_payment_orders.sql` 与 `20260820101631_add_experience_playback_manifest.sql`，确认私有 bucket、字段、RLS 与 RPC 均已建立，再发布引用新付款和经验播放能力的网页代码。
