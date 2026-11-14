# LifeSpace｜137 失败用例基线对照 R01

日期：2026-11-14。冻结基线 `6d85989bee46c98fac54527d11022ad5e3dcb671`；Actions 候选 `68109eb75b2e69dae7aafe7782e2f9df1f50ff5e`；失败 Run [43598254758](https://github.com/yoyomibaobao-sys/life-space/actions/runs/43598254758)。

## 执行口径

- GitHub Actions Ubuntu，Node 24，完整 `npm run test:android:acceptance`：1105 tests / 1035 pass / 70 fail。源日志 Run job `132457287356`。
- 冻结基线在 Windows PowerShell + Node v24.14.0，使用同一个 `node --test` 测试执行器，以 `--test-concurrency=2` 将对应 40 个文件分为 8 批运行，累计 78 项失败（含 8 项本地额外失败）。原始日志 `D:\LifeSpace-137-Compare-20261114\b1.log` 至 `b8.log`。同名匹配 69/70，路径斜杠差异映射 1/70。
- **结论：原 70 个失败用例均在冻结基线已有失败，不存在“只在 68109eb 出现”的测试身份。** 此处分类是 **用例层面的复现**，不是每一项错误根因和输出字节完全相同的证明。应按实际发布影响处理，而不能宣称整个签名前测试 PASS。
- Windows 基线相对 Actions 的 8 项额外失败涉及联网切换测试 1 项、历史 500MB 容量测试 6 项、R26 恢复测试 1 项；它们不是 CI 70 项中的候选新增失败。需要 Linux 同环境和断言详情复签以消除 OS/并发差异。

## 70 项失败矩阵

| # | Actions 文件 | 失败用例 | 基线归类 | 潜在发布影响／复验要求 |
|---:|---|---|---|---|
| 1 | `tests/account-and-region.test.mjs` | coarse project region never inherits a profile street address or record GPS | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 2 | `tests/admin-trial-cleanup-preview.test.mjs` | admin cleanup UI is preview-only, guarded by the existing admin page | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 3 | `tests/android-acceptance-defects.test.mjs` | offline cold start cannot apply an older list read over the verified account | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 4 | `tests/android-acceptance-defects.test.mjs` | a durable local create survives a later SAF revision conflict without a second project | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 5 | `tests/android-acceptance-defects.test.mjs` | image save return does not rebuild live cloud detail during connectivity checking | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 6 | `tests/android-acceptance-defects.test.mjs` | a failed probe keeps the open image readable and refuses cloud trash until online | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 7 | `tests/android-acceptance-defects.test.mjs` | closing an offline image does not replay a historical add-record request | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 8 | `tests/android-acceptance-defects.test.mjs` | a saved cloud record refreshes the project list without letting an older summary win | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 9 | `tests/android-cloud-export.test.mjs` | backup reminder opens the real App module; original web export endpoint remains the packer | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 10 | `tests/android-cloud-trial-entry.test.mjs` | Android My Space uses one server-timed trial notice without local copy while active | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 11 | `tests/android-creation-flow.test.mjs` | center action opens the in-app camera, supports album or skip, then preserves draft through project choice | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 12 | `tests/android-guide-cache-and-viewer.test.mjs` | visitor, Free and offline guides stay basic; only current paid Plus unlocks full reading | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 13 | `tests/android-local-transfer.test.mjs` | local transfer and cloud pending use different explicit engines and preserve engine conflict handling | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 14 | `tests/android-login-password-visibility.test.mjs` | Android login keeps one title and the requested compact actions | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 15 | `tests/android-mobile-page-parity.test.mjs` | guide online and offline keep the PlantPage presentation and swap data | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 16 | `tests/android-online-local-space-toggle.test.mjs` | online website and Android project-category settings hide the local-space tab | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 17 | `tests/android-presentation-convergence.test.mjs` | Guide list and detail change data within the same formal presentation | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 18 | `tests/android-presentation-convergence.test.mjs` | Web and Android Profile share navigation, identity card and offline capability | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 19 | `tests/android-project-detail-parity.test.mjs` | Android project details share one presentation across cloud, local, and offline adapters | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 20 | `tests/android-single-runtime-sr1-device.test.mjs` | online cloud workspace never falls back to cache cards when live loading fails | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 21 | `tests/android-stabilization.test.mjs` | signed-out cloud offers trial or Plus via bundled login; remembered local content remains | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 22 | `tests/android-stabilization.test.mjs` | route registry handles all profile, user and membership destinations | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 23 | `tests/cloud-offline-cache.test.mjs` | pending cloud records upload by explicit action without deleting local originals | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 24 | `tests/cloudflare-r2-canary.test.mjs` | Cloudflare deployment uses low-privilege public auth config and encrypted infrastructure secrets | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 25 | `tests/date-formatting.test.mjs` | dates use one numeric card and precise-time contract | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 26 | `tests/experience-cards.test.mjs` | experience card lists use a shared cover with source and archive fallbacks | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 27 | `tests/guide-free-plus-20261103.test.mjs` | Plus entitlement is paid, active and unexpired; Trial Free expired refund cannot unlock | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 28 | `tests/guide-free-plus-20261103.test.mjs` | held SQL's Plus predicate executes correctly in isolated PostgreSQL (no QA DB writes) | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 29 | `tests/guide-free-plus-20261103.test.mjs` | full plant content is still a server ACL installation gate, not falsely marked verified | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 30 | `tests/guide-r02-pagination-20261103.test.mjs` | Plus RPC client is server-gated, never falls back to old full-table SELECT | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 31 | `tests/local-upgrade-data.test.mjs` | a pre-upgrade member guide cache retains lookup names but discards full content offline | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 32 | `tests/local-upgrade-data.test.mjs` | adding a planting region to a legacy project preserves all records and original photo bytes | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 33 | `tests/membership-access.test.mjs` | expired cloud access is database-enforced read-only with narrow downgrade actions | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 34 | `tests/membership-access.test.mjs` | the launch cloud plan is fixed at 1 GB and 30 active market posts | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 35 | `tests/membership-access.test.mjs` | membership orders keep fixed prices, private Alipay proof, and transactional confirmation | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 36 | `tests/membership-access.test.mjs` | the plant pages request only data allowed for the current tier | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 37 | `tests/membership-access.test.mjs` | client-side entitlement checks fail closed when membership is absent | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 38 | `tests/mobile-cycle-and-navigation-polish.test.mjs` | mobile My Space is single-line and taxonomy actions move to long press | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 39 | `tests/mobile-follow-admin-polish.test.mjs` | admin section links remain reachable without long reverse scrolling | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 40 | `tests/navigation-and-signed-out-layout.test.mjs` | mobile archive creation and project controls stay compact without clipping | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 41 | `tests/navigation-and-signed-out-layout.test.mjs` | mobile market keeps actions out of the global bar and uses readable management cards | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 42 | `tests/navigation-and-signed-out-layout.test.mjs` | plant detail exposes guide, experience cards, and records as peer tabs | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 43 | `tests/offline-local-parity.test.mjs` | cold-start Android offline shell presents the local workspace rather than a separate mode | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 44 | `tests/paypal-return-terminal-status.test.mjs` | refunded Return is terminal before external Order lookup or Capture | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 45 | `tests/paypal-return-terminal-status.test.mjs` | unknown and non-payable local states fail closed before external calls | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 46 | `tests/paypal-return-terminal-status.test.mjs` | confirmed Return remains successful without another Capture | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 47 | `tests/paypal-return-terminal-status.test.mjs` | pending, canceled and expired orders retain the approved-order Capture path | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 48 | `tests/paypal-return-terminal-status.test.mjs` | official COMPLETED order is confirmed without a second Capture | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 49 | `tests/paypal-return-terminal-status.test.mjs` | wrong amount or payment method is rejected before external calls | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 50 | `tests/plant-alias-detail-behavior.test.mjs` | guest alias detail resolves the public summary and basic content | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 51 | `tests/plant-alias-detail-behavior.test.mjs` | expired alias detail resolves the public summary and basic content | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 52 | `tests/plant-alias-detail-behavior.test.mjs` | trialing alias detail resolves the public summary and full member content | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 53 | `tests/plant-alias-detail-behavior.test.mjs` | active alias detail resolves the public summary and full member content | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 54 | `tests/plus-capacity-500mb.test.mjs` | same completed Webhook twice and same RPC preserve capacity, dates, timestamps and payment history | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 55 | `tests/plus-capacity-500mb.test.mjs` | Historical R26 intermediate 500 MB migration, superseded by the 1 GB forward correction (PGlite only) | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 56 | `tests/plus-capacity-500mb.test.mjs` | R26 current UI defaults and bilingual Plus offers are 1 GB | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 57 | `tests/plus-capacity-r26-correction-1gb.test.mjs` | same completed Webhook twice and same RPC preserve capacity, dates, timestamps and payment history | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 58 | `tests/plus-capacity-r26-correction-1gb.test.mjs` | R26 correction restores 1 GB without changing historical records (PGlite only) | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 59 | `tests/plus-capacity-r26-correction-1gb.test.mjs` | R26 correction UI defaults and bilingual Plus offers are 1 GB | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 60 | `tests/project-categories-and-guides.test.mjs` | public related guides are explicit-grant, RLS-protected, and admin reviewed | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 61 | `tests/r22-shared-sync-owner-gate.isolated.test.mjs` | tests/r22-shared-sync-owner-gate.isolated.test.mjs | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 62 | `tests/signup-account-rollout.test.mjs` | registration, membership, and admin copy use the claim and handling rules | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 63 | `tests/ui-icon-consistency.test.mjs` | interactive UI uses the shared SVG icon language | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 64 | `tests/vinext-public-env-guard.test.mjs` | package.json routes vinext production builds through the public env guard | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 65 | `tests/w5-dual-entry.test.mjs` | W5 temporary listing has no independent creation route and invokes the existing upload and safe cancel functions | 基线同名失败 | UI/旧合同：确认是否仍适用本次版本 |
| 66 | `tests/w5-offline-owner-cache-record-edits.test.mjs` | historical synced cloud records stay read-only; pre-existing pending remains editable | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 67 | `tests/w5-online-saf-isolation.test.mjs` | online Android startup and login never request SAF or import the S6 origin | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 68 | `tests/w5-online-saf-isolation.test.mjs` | standalone local creation and old settings are hidden without changing stored data | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 69 | `tests/w5-online-saf-isolation.test.mjs` | cloud and pending creation do not touch the explicit SAF create branch | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |
| 70 | `tests/w5-r10-cloud-restore-list-refresh.test.mjs` | parent delegates to existing owner-scoped loadCloudList without new state, purge or RPC | 基线同名失败 | 安全/数据/会员/支付：发布前必须判定 |

## 发布判定与后续行动

1. 当前结果**不允许**把原 70 项跳过、注释或整体标记为通过。
2. 旧 UI 格式/历史套餐断言应逐项与当前 1GB、Plus、取消 Trial、R2 保密及离线同步规则核对；只修改确实失效的断言并加保留行为验证。
3. Owner/A-B 隔离、R2 私有媒体、恢复与 SAF、支付退款、Plus/Guide RLS、管理处置属于发布安全/数据合同；即使在基线已失败，也必须提供独立有效测试和真实回执，不得以“基线已失败”放行。
4. 142 R03 接线已在隔离候选增量纳入，新增双 Worker 读写门禁默认关闭。142 R03 媒体定向测试 82/82 PASS（修正原有测试中未显式开门禁的模拟环境）。
5. 签名前完整测试、正式签名 APK 和新 GitHub Actions Run 仍以最终全量测试结果为准。生产站点、R2 读写和分发保持 STOP。

## 同机完整测试补充复核（2026-11-14）

- 冻结基线完整套件：Windows Node v24.14.0，`node --test --test-concurrency=4 tests/*.test.mjs`，**1062 tests / 982 PASS / 80 FAIL**，日志 `D:\LifeSpace-137-Compare-20261114\baseline-full-node24.log`。
- 合入 R03 后候选完整套件：同机同 Node24、相同并发，**1115 tests / 1057 PASS / 58 FAIL**，日志 `D:\LifeSpace-137-Compare-20261114\candidate-final-after142.log`。
- 按失败用例身份逐一比对：**候选新增失败 0、从基线失败集合中消失 22、仍失败 58**。该判断不代表 58 项全部已查明根因，也不代表安全性已通过。
- 两套完整测试数量相差 53 项，因候选代码/测试定义不同；同机不等于 GitHub Actions 的 Ubuntu+Java21+AndroidSDK36 环境。
- 签名门槛未通过，不得启动新的 APK 签名 Actions 或生产发布。
