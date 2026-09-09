# 正式域名邮件确认上线核对

本轮代码把注册、重发确认邮件和密码重置的 redirectTo 固定到 `https://life-space.uk/auth/confirm`。确认页支持旧邮件的会话片段，以及新模板的 token_hash；新模板必须由用户点击“确认并继续”才验证，邮件预览不消耗凭证。错误、过期和网络失败不能显示为验证成功。

## Supabase Auth 配置

- Site URL：`https://life-space.uk`。
- Redirect URLs：精确允许 `https://life-space.uk/auth/confirm`，以及仅该路径查询参数的规则 `https://life-space.uk/auth/confirm?**`。旧有效邮件兼容期保留旧有正式域名回调，不添加全域通配符。
- 确认注册模板使用下列链接，首跳直接打开正式域名；token_hash 放在 fragment，不进入站点请求日志。

```html
<h2>确认 LifeSpace 注册邮箱 / Confirm your LifeSpace email</h2>
<p><a href="{{ .SiteURL }}/auth/confirm#token_hash={{ .TokenHash }}&amp;type=email">确认邮箱 / Confirm email</a></p>
```

- 重置密码模板：

```html
<h2>重置 LifeSpace 密码 / Reset your LifeSpace password</h2>
<p><a href="{{ .SiteURL }}/auth/confirm#token_hash={{ .TokenHash }}&amp;type=recovery">设置新密码 / Set new password</a></p>
<p>如果不是你本人发起，请忽略此邮件。 / Ignore this email if you did not request it.</p>
```

- 使用已验证的正式发信地址与自定义 SMTP，关闭会改写链接的邮件点击跟踪。
- 修改线上配置前读取现有设置、记录回退值，代码部署后再更新模板。

## 尚需真实环境验证

不得把本地测试视为已完成以下检查：关闭 VPN 后，新账号注册 → 实际收信 → 邮件首跳为 life-space.uk → 点击确认 → 成功提示 → 登录 App；重发、过期链接、密码重置、重放失效链接分别验证。浏览器中的 Supabase Auth API 仍需网络可达，正式域名首跳成功不等于完整验证链已成功。

来源：[Supabase Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates)、[Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)。2026-09-09 核对。新建 Free 项目采用默认 SMTP 时可能不能自定义模板，需核对实际项目计划与 SMTP；见 [2026-06-03 更新](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier)。
