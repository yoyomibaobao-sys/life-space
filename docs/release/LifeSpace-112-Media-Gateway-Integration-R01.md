# LifeSpace｜112 受控媒体镜像入口统一源码接入 R01

- 日期：2026-11-12（北京时间）
- 工作树：`development/lifespace-unified-r01`
- 修改前 HEAD：`0a0c7c458eee150e522930f90593e209fd5a1a95`
- 源码提交：`637745ab4d63fcec0633135b451dbe620466bf44`
- 任务边界：源码接入与隔离测试。未打开 QA 页面、未登录／认证、未发送真实镜像 HTTP 请求、未写 R2、未部署；未执行 113／115。

## 结论

**源码接入 PASS；隔离测试 PASS；真实 R2 镜像及独立读回未执行。**

继承 011 与 D M4 R03／R04 的入口及服务合同。本轮将受控入口接入统一站点 Worker，并保留现有 QA media service binding、HMAC、时间戳、Nonce 与 R2 条件写入合同。

## 最小实现

1. `cloudflare/worker-entry.mjs` 增加两个最小分派：受控 QA 页面，以及 `/__internal/r2/business-media/mirror`。原 canary、下载及 App fallback 顺序保持。
2. QA 页面路径为 `/__qa/m4-controlled-mirror`。必须同时满足准确 QA Origin、`R2_BUSINESS_MEDIA_MODE=isolated`、`M4_QA_CONTROL_UI_ENABLED=true`，且只允许 GET。生产配置不含该启用标记。
3. 客户端 POST 只发送真实 `mediaId`、`businessType=media` 和分别指定的 `full`／`thumb`；不把对象路径交给服务端作为业务身份。每次 POST 前依次执行 SDK `getSession → getUser(accessToken) → getSession`，确认在线 UID 为 Owner A 且 Session 未变化。
4. 站点 Worker 再次通过 Supabase `getUser` 验证实际请求者；服务端从 mediaId 查询 media、record、archive 关系，核对 Owner、引用路径和媒体状态。公开可读不构成非 Owner 镜像授权。
5. 服务端读取对应原图／缩略图字节，核验大小及 MIME，计算 SHA-256；使用既有 HMAC 服务合同签署 Owner、对象路径、字节数、SHA、MIME、时间戳和 Nonce，再经既有 QA service binding 调用 media Worker。
6. stage-bytes handler 校验签名、60 秒时间偏差、Owner 路径、字节数、MIME、SHA 和 Nonce；Nonce 登记与媒体对象写入均使用 R2 条件写，目标对象已存在时先独立读回比对，不覆盖不匹配对象。
7. 原图请求失败时不发缩略图 POST；结果 UNKNOWN 时立即停止，不自动重试，也不继续客户端源对象后读，交由 D 组只读核账。确定失败只允许后续只读源对象检查，不发缩略图 POST。
8. QA 客户端单独构建到 `dist/qa-client`，不写入 `dist/client`。QA 配置只绑定既有 `lifespace-business-media-qa-20261028` service 与 QA Supabase 项目，不在配置文件中放 Service Role 或 HMAC secret。

## 脱敏回执字段

回执版本：`M4_QA_RECEIPT_V1`。

**顶层字段**

- `scope`、`qaOrigin`、`projectRef`、`mediaId`、`expectedOwnerRole`：标明隔离环境、QA 项目、指定媒体及 Owner A 角色。
- `operationId`、`startedAt`、`endedAt`：本次单次操作标识和时间。
- `status`：整体结果；成功也只表示 HTTP 回执与源对象稳定，不能替代 R2 独立读回。
- `sourceAfterStatus`、`nextStep`：源对象前后核验结果及下一步处置。
- `r2Readback`：固定为 `NOT_PERFORMED_BY_CLIENT`，明确客户端没有冒充独立 R2 读回。

**每个 full／thumb 条目**

- `variant`、`businessType`、`businessId`：尺寸、媒体类型及实际 mediaId。
- `expectedBytes`、`expectedMime`：样本预期值。
- `expectedR2KeyFingerprint`：对象路径的 SHA-256 指纹；不输出原始对象路径。
- `identity`：`status`、`ownerVerified`、`verifiedAt`、`reasonCode`。仅记录 Owner 核验结论，不输出 Owner UUID。
- `sourceBefore`／`sourceAfter`：分别记录 `pathFingerprint`、实际字节数、源字节 `sha256`、SDK MIME、字节签名识别的 `sniffedMime`、读取时间及错误码。
- `request`：记录 `status`、尺寸、HTTP 状态、CF-Ray、响应类型、服务端状态／安全错误码、回执字节数、SHA、MIME 和 `verified`。
- `request.status` 使用 `NOT_SENT`、`SENT_PENDING`、`RESPONSE_RECEIVED`、`UNKNOWN`；UNKNOWN 不允许自动重发。

回执不包含原始存储路径、Owner UUID、recordId、访问令牌、Cookie、refresh token、Authorization、服务签名、Nonce 原文或 Service Role。对象路径指纹与源字节 SHA 是两种不同字段：前者供 D 组按既有样本映射定位，后者用于核对媒体内容。

`cacheStatus=SDK_DEFAULT_UNVERIFIED`，`objectVersion`／`updatedAt` 为 null：当前 SDK 下载接口没有提供可核实的对象版本元数据，因此不声称已取得源对象版本号。服务器端源字节 SHA 与客户端回执必须一致，D 组仍须独立读回 R2 对象。

## 验证结果

| 验证 | 结果 |
|---|---|
| QA UI 精确 Origin、隔离开关、GET-only、生产资产分离 | PASS |
| 每次 POST 前在线 Owner／同一 Session 核验 | PASS（隔离模拟） |
| mediaId 对应 full／thumb 不同路径 | PASS（隔离模拟） |
| full 失败、UNKNOWN、Session 切换、thumb 源基线失败时停止 | PASS（隔离模拟） |
| HMAC、时间戳、Nonce、防重放及并发唯一写入 | PASS（隔离模拟） |
| R2 条件写、目标对象冲突保护、读回 SHA／大小／MIME | PASS（模拟 R2 bucket） |
| 脱敏回执不含路径及 Owner／Record UUID | PASS |
| 扩展定向隔离测试（7 个测试文件） | **60/60 PASS，0 FAIL** |
| TypeScript `tsc --noEmit -p tsconfig.vinext.json` | PASS |
| QA 配置下 Vinext 构建 | PASS |
| QA-only 客户端构建 | PASS |
| 本地统一 Worker 导入、QA 路由与静态资产隔离 smoke | PASS（QA Origin 200；生产 Origin／关闭开关 404；QA-only asset 存在，生产 asset 不存在） |

定向测试命令：

```text
node --test \
  tests/m4-qa-controlled-ui.test.mjs \
  tests/r2-media-user-gateway-media-id.test.mjs \
  tests/r2-media-user-gateway-security.test.mjs \
  tests/r2-media-service-stage.test.mjs \
  tests/r2-media-business.test.mjs \
  tests/r2-media-miniflare.isolated.mjs \
  tests/r2-media-http-concurrency.isolated.mjs
```

QA-only 客户端产物：`dist/qa-client/__qa/m4-controlled-mirror.js`，197,476 bytes。

SHA-256：`81526d92b97c26679bce75328a0a8fe013c58b7819e2241d03b7049066731ec5`。

本地统一 Worker smoke：`qaPageStatus=200`、`productionOriginStatus=404`、`disabledFlagStatus=404`；页面引用 QA 静态客户端，QA 产物存在、生产目录对应产物不存在。QA asset 为 197,476 bytes，SHA-256 与上方记录一致。构建输出确认生产 `dist/client` 未修改。源码提交 `git show --check` 通过。

## 提交与保护

源码提交：`637745ab4d63fcec0633135b451dbe620466bf44`（12 files changed，2,649 insertions）。

只提交本任务的 Worker 接入、QA 页面／客户端、媒体网关／签名处理、QA 配置和四组隔离测试。未提交以下已有无关成果：`android/app/capacitor.build.gradle`、`android/capacitor.settings.gradle`、`mobile-shell/index.html`、`.wp10-delivery/`。

QA 配置指向既有独立 media Worker service；本轮未修改或部署该独立服务，也未真实核验其线上 secret／bucket 绑定。所有 R2 结果均来自隔离模拟测试，不是线上写入证明。

## STOP 与后续

112 的源码接入和隔离测试交付完成。保持 STOP：

- 不打开 QA 页面，不运行真实认证。
- 不发送 full／thumb 真实 POST，不写 R2，不部署。
- 不把模拟测试结果标为真实 M4 PASS。
- 后续由 D 组在获准的真实会话交接后执行只读 R2 独立读回，比较两种尺寸的源字节 SHA、MIME、大小及路径指纹；若真实请求结果 UNKNOWN，先只读核账，不重试。
- 113／115 继续保持未执行。
