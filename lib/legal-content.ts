import type { Language } from "@/lib/i18n";

export type LegalPageKey = "privacy" | "terms" | "refunds" | "contact";

export type LegalSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type LegalPageContent = {
  eyebrow: string;
  title: string;
  intro: string;
  version: string;
  sections: LegalSection[];
};

type LegalContent = {
  index: {
    eyebrow: string;
    title: string;
    intro: string;
    version: string;
  };
  nav: Record<LegalPageKey, { title: string; description: string }>;
  backToLegal: string;
  backToProfile: string;
  serviceName: string;
  pages: Record<LegalPageKey, LegalPageContent>;
};

const zh: LegalContent = {
  index: {
    eyebrow: "公开规则",
    title: "隐私、服务与退款说明",
    intro: "这里集中说明有时·耕作如何处理数据、提供服务、受理退款以及与运营者联系。",
    version: "更新日期：2026/09/01；生效日期：2026/09/01。",
  },
  nav: {
    privacy: {
      title: "隐私说明",
      description: "了解收集哪些数据、如何使用和保护，以及如何导出、更正或删除。",
    },
    terms: {
      title: "服务条款",
      description: "了解本地功能、云会员、公开内容、账号责任和服务边界。",
    },
    refunds: {
      title: "退款规则",
      description: "查看7日全额、180日内半额、未开始续费和例外情形。",
    },
    contact: {
      title: "运营者联系信息",
      description: "通过公开邮箱联系运营者，处理服务、付款、退款和隐私问题。",
    },
  },
  backToLegal: "返回规则中心",
  backToProfile: "返回用户信息",
  serviceName: "有时·耕作 / LifeSpace for Cultivation",
  pages: {
    privacy: {
      eyebrow: "隐私与个人信息",
      title: "隐私说明",
      intro: "本说明适用于有时·耕作网页端、手机网页端及加载同一服务的 App。我们坚持数据最少化、本地优先和由用户决定是否公开。",
      version: "更新日期：2026/09/01；生效日期：2026/09/01。",
      sections: [
        {
          title: "1. 谁处理你的信息",
          paragraphs: [
            "本服务名称为“有时·耕作 / LifeSpace for Cultivation”。隐私、数据权利或安全问题请发送邮件至 yoyomibaobao@gmail.com。",
          ],
        },
        {
          title: "2. 我们可能处理的信息",
          bullets: [
            "账号与身份信息：注册邮箱、用户名、头像、会员编号、登录与账号状态。",
            "用户主动填写的信息：国家或地区、省州、城市、语言偏好及反馈内容。位置字段由用户填写，不用于获取精确定位。",
            "耕作与互动内容：档案、记录、图片或视频、标签、分类、经验卡、评论、关注、收藏、集市内容及其公开状态。",
            "会员与付款信息：订单号、金额、币种、付款方式、交易参考号、付款凭证、审核记录、服务期限和退款记录。付款凭证存放在私有空间，仅订单本人和授权管理员可按权限查看。",
            "运行与安全信息：会话、错误、下载和防滥用所需的技术信息。基础设施提供商为交付和保护服务可能处理网络地址、设备或请求日志。",
          ],
        },
        {
          title: "3. 浏览统计的边界",
          paragraphs: [
            "站内浏览统计只保存归一化页面路径、访问时间、平台类型、匿名访客标识和必要的用户代理信息，用于了解功能使用和排查故障。统计表不保存搜索词、页面内容、精确位置或邮箱，也不建立跨站设备指纹。",
          ],
        },
        {
          title: "4. 本地、云端与公开内容",
          bullets: [
            "本地离线项目默认保存在当前设备，不主动上传云端；卸载、清理浏览器数据或更换设备可能造成丢失。",
            "使用云空间、同步、互动、集市或付款功能时，相关数据会上传并保存在服务端。",
            "档案和记录是否公开由用户选择。私密内容不会因为开通会员或同步而自动公开；主动设为公开的内容可被其他用户访问。",
          ],
        },
        {
          title: "5. 使用目的",
          bullets: [
            "创建和保护账号，提供本地、云端、同步、互动和集市功能。",
            "处理会员订单、核验付款、开通权益、受理退款并保存必要审计记录。",
            "维护安全、预防滥用、排查故障、统计功能使用和改进服务。",
            "回应反馈、隐私权利请求和依法必须处理的事项。",
          ],
        },
        {
          title: "6. 共享、受托处理与跨境",
          paragraphs: [
            "我们不出售个人信息。为运行服务，数据可能由托管、数据库、对象存储、邮件和付款渠道等服务商按指示处理；仅提供完成相应功能所必需的信息。付款由支付宝、PayPal等渠道独立处理，其账户和支付数据也适用相应渠道的规则。",
            "当前网页托管和网络交付使用 Vercel, Inc.；账号认证、数据库和对象存储使用 Supabase, Inc.，本项目主要数据库区域位于日本东京。相应服务商可能在其全球基础设施中处理账号、请求日志、用户主动上传的耕作内容、互动内容和云端文件，以完成注册、登录、存储、同步、公开展示、安全防护和故障排查。服务商隐私说明分别见 vercel.com/legal/privacy-policy 和 supabase.com/privacy。",
            "注册页会把跨境处理同意与服务条款同意分开提供。不同意跨境处理时，仍可使用不注册、不上传的本地记录。已经同意的用户可以通过 yoyomibaobao@gmail.com 撤回同意或申请访问、更正、删除及了解境外处理情况；撤回不影响撤回前处理的合法性，但可能导致账号和云端功能无法继续提供。",
          ],
        },
        {
          title: "7. 保存期限与账号注销",
          paragraphs: [
            "账号使用期间，我们保存提供服务所需的数据。用户注销后，账号、资料、云端项目、记录和文件会按注销流程删除或去标识化；依法必须保留的付款、退款、安全和操作审计记录会在法定期限或解决争议所需期限内受限保存，之后删除或匿名化。备份中的残留副本会随正常轮换逐步清除。",
          ],
        },
        {
          title: "8. 你的选择与权利",
          bullets: [
            "可在用户信息页直接更正资料、调整语言和管理公开状态。",
            "可使用备份与导出功能获取当前支持导出的记录；需要其他数据副本可通过邮箱申请。",
            "可在账号管理中申请注销，也可通过邮箱申请访问、更正、删除、限制处理、撤回同意或提出异议。",
            "撤回同意不影响撤回前处理的合法性；法律另有规定的，从其规定。",
          ],
        },
        {
          title: "9. 安全与未成年人",
          paragraphs: [
            "我们采取权限隔离、私有存储、访问控制和审计等合理措施，但任何网络服务都无法保证绝对安全。发现异常请及时联系我们。",
            "未满14周岁的未成年人应由监护人阅读并同意后使用需要账号或云端处理的功能。发现未经有效监护人同意处理的儿童信息时，请联系我们核实并处理。",
          ],
        },
        {
          title: "10. 更新与联系",
          paragraphs: [
            "重大变化会通过页面提示、站内通知或注册邮箱进行合理告知。对本说明有疑问，或希望行使个人信息权利，请发邮件至 yoyomibaobao@gmail.com。",
          ],
        },
      ],
    },
    terms: {
      eyebrow: "使用规则",
      title: "服务条款",
      intro: "使用有时·耕作即表示你同意遵守本条款。强制性法律赋予消费者的权利不因本条款而被排除。",
      version: "更新日期：2026/09/01；生效日期：2026/09/01。",
      sections: [
        {
          title: "1. 服务内容",
          paragraphs: [
            "有时·耕作提供耕作档案、记录、经验、植物指引、互动和集市信息等工具。本地离线功能免费；云端存储、同步及部分互动功能需要账号或有效云会员。",
            "集市用于信息发布和联系，平台不是用户之间交易的卖方、买方、代理或担保方。用户应自行核实交易对象、商品、交付和付款安全。",
          ],
        },
        {
          title: "2. 账号与使用资格",
          bullets: [
            "请提供真实可用的注册邮箱，妥善保管登录凭证，并对账号下的操作负责。",
            "不得冒用他人身份、绕过权限、破坏服务、批量滥用、传播违法侵权内容或利用平台实施欺诈。",
            "未满14周岁的用户使用账号或云端功能前应取得监护人同意。",
          ],
        },
        {
          title: "3. 用户内容与公开选择",
          paragraphs: [
            "用户保留其原创内容的权利。为存储、同步、展示和提供用户选择的公开功能，用户授予服务一项非独占、仅为运行服务所必要、可随内容删除而终止的使用许可，但依法需要保留的备份和审计除外。",
            "用户应确保上传内容有权使用，不侵犯隐私、知识产权或其他合法权益。设置为公开的内容可被其他人查看、引用或分享；私密内容不会自动公开。",
          ],
        },
        {
          title: "4. 云会员与付款",
          bullets: [
            "当前云会员标准方案为12个月，人民币64元或8美元，以付款页显示和订单确认为准。当前不自动续费。",
            "支付宝或PayPal付款后，用户需提交订单要求的交易参考信息或付款凭证；管理员会在真实收款渠道核对后开通或续费。上传截图本身不代表付款已确认。",
            "服务期限、容量和权益以已确认订单及会员页面为准。已购买期限内的核心权益不会因后续价格调整而追溯缩减。",
          ],
        },
        {
          title: "5. 退款",
          paragraphs: [
            "退款适用公开的《退款规则》。用户应从会员订单页发起申请；批准后由管理员在原付款渠道完成退款，实际完成并登记外部退款参考号后，系统才结束或回退相应会员权益。",
          ],
        },
        {
          title: "6. 本地数据、备份与服务变化",
          paragraphs: [
            "本地离线数据由用户设备保存。更换设备、卸载应用或清理浏览器数据可能导致丢失，用户应自行保留重要备份。",
            "我们可能为安全、合规或产品改进调整服务，并尽量提前说明重大变化。维护、网络、第三方服务或不可抗力可能造成暂时中断；我们会在合理范围内恢复和减少影响。",
          ],
        },
        {
          title: "7. 停用、注销与责任边界",
          paragraphs: [
            "违反条款、危害安全或依法必须处理时，平台可限制相关内容或账号，并在可行时告知理由。用户可在账号管理中申请注销；依法必须保存的付款、退款和安全审计记录不随内容立即删除。",
            "在法律允许范围内，服务按实际可用状态提供。我们不对用户自行交易、设备故障、本地数据未备份或第三方服务造成的间接损失作超出法律要求的承诺；因故意或重大过失、消费者强制性权利等依法不得限制的责任不受本条影响。",
          ],
        },
        {
          title: "8. 争议与联系",
          paragraphs: [
            "如有争议，请先发邮件至 yoyomibaobao@gmail.com，我们会尝试核实和解决。适用法律及争议处理不得减损用户所在地强制性消费者保护和个人信息权利。",
          ],
        },
      ],
    },
    refunds: {
      eyebrow: "云会员",
      title: "退款规则",
      intro: "本规则适用于通过有时·耕作购买并已确认的云会员订单。退款申请时间以系统成功接收申请的时间为准。",
      version: "更新日期：2026/09/01；生效日期：2026/09/01。",
      sections: [
        {
          title: "1. 标准退款金额",
          bullets: [
            "付款确认后的7个自然日内申请：退还该笔订单实付金额的100%。",
            "付款确认后的第8个自然日起至第180个自然日内申请：退还该笔订单实付金额的50%。",
            "付款确认超过180个自然日：不再受理个人原因的自愿退款。",
            "续费订单对应的服务期尚未开始，且在付款确认后180个自然日内申请：退还该笔续费订单实付金额的100%。",
          ],
        },
        {
          title: "2. 例外情形",
          paragraphs: [
            "重复扣款、付款后未开通或未交付、平台造成的严重持续服务故障，以及法律规定必须退款的情形，不受上述个人原因比例限制。退款金额会根据核实结果和适用法律处理。用户应提供订单号、交易参考号及必要证据。",
          ],
        },
        {
          title: "3. 如何申请",
          bullets: [
            "登录后进入“用户信息 → 订单进度查询 → 申请退款”，选择对应订单并提交原因。",
            "系统按提交时间锁定可退比例和金额；管理员核对订单、会员期限和必要证据。",
            "审核通过只代表退款金额已批准，不代表资金已经退回。管理员随后在支付宝或PayPal原付款交易中执行退款。",
            "外部渠道显示退款成功后，管理员登记退款参考号并确认完成；此时订单改为已退款，相应会员期限才结束或回退。",
          ],
        },
        {
          title: "4. 原路退回与到账",
          paragraphs: [
            "退款原则上退回原付款渠道和原付款账户，不以现金、转账到其他账户或新的个人付款代替。到账时间由支付宝、PayPal、发卡行或银行处理进度决定。若原渠道客观上无法退款，请通过运营邮箱联系并完成身份与订单核验后依法处理。",
          ],
        },
        {
          title: "5. 订单关系与限制",
          bullets: [
            "同一付款订单只能建立一笔退款申请；存在未完成退款时，不能同时确认新的会员付款，以避免会员期限计算错误。",
            "若该付款之后已有新的已确认会员订单，系统会先阻止自动退款申请，并要求管理员核对期限。",
            "退款申请未完成前请不要注销账号；应先完成退款或联系运营者处理。",
          ],
        },
        {
          title: "6. 联系与法定权利",
          paragraphs: [
            "对审核结果有异议，或无法使用站内入口，请发送订单号和注册邮箱至 yoyomibaobao@gmail.com。本规则不限制消费者依法享有的退款、撤销、索赔或投诉权利。",
          ],
        },
      ],
    },
    contact: {
      eyebrow: "公开联系信息",
      title: "运营者联系信息",
      intro: "服务、账号、付款、退款、隐私与安全问题均可通过同一公开邮箱联系。",
      version: "更新日期：2026/09/01；生效日期：2026/09/01。",
      sections: [
        {
          title: "服务信息",
          bullets: [
            "服务名称：有时·耕作 / LifeSpace for Cultivation",
            "服务形态：网页端、手机网页端及加载同一服务的 App",
            "运营联系邮箱：yoyomibaobao@gmail.com",
          ],
        },
        {
          title: "联系时请提供",
          bullets: [
            "账号或隐私问题：注册邮箱、会员编号及具体请求；不要发送登录密码或验证码。",
            "付款或退款问题：订单号、付款渠道、交易参考号和问题说明；仅在站内私有入口按要求上传付款凭证。",
            "安全问题：发生时间、页面、设备类型和可复现步骤；请勿在公开内容中发布他人的个人信息。",
          ],
        },
        {
          title: "处理方式",
          paragraphs: [
            "我们会先核验请求是否与相关账号或订单对应，再通过注册邮箱或站内状态反馈处理结果。支付渠道到账时间、法定机关处理时间和需要补充材料的时间不由本服务控制。",
          ],
        },
      ],
    },
  },
};

const en: LegalContent = {
  index: {
    eyebrow: "PUBLIC POLICIES",
    title: "Privacy, Terms and Refunds",
    intro: "This hub explains how LifeSpace for Cultivation handles data, provides the service, reviews refunds and can be contacted.",
    version: "Updated: 2026/09/01. Effective: 2026/09/01.",
  },
  nav: {
    privacy: {
      title: "Privacy Notice",
      description: "What data is handled, why it is used, how it is protected, and your access, export and deletion choices.",
    },
    terms: {
      title: "Terms of Service",
      description: "Rules for local features, cloud membership, public content, accounts and service boundaries.",
    },
    refunds: {
      title: "Refund Policy",
      description: "The 7-day full refund, 180-day half refund, unused renewals and exceptions.",
    },
    contact: {
      title: "Operator Contact",
      description: "Contact the operator about service, payment, refund or privacy matters.",
    },
  },
  backToLegal: "Back to policy hub",
  backToProfile: "Back to profile",
  serviceName: "有时·耕作 / LifeSpace for Cultivation",
  pages: {
    privacy: {
      eyebrow: "PRIVACY AND PERSONAL DATA",
      title: "Privacy Notice",
      intro: "This notice applies to the desktop web service, mobile web service and the App that loads the same LifeSpace for Cultivation service. We follow data minimization, local-first use and user-controlled sharing.",
      version: "Updated: 2026/09/01. Effective: 2026/09/01.",
      sections: [
        {
          title: "1. Who handles your information",
          paragraphs: ["The service is 有时·耕作 / LifeSpace for Cultivation. Email yoyomibaobao@gmail.com for privacy, data-rights or security requests."],
        },
        {
          title: "2. Information we may handle",
          bullets: [
            "Account and identity data: registration email, username, avatar, member number, login and account status.",
            "Information you enter: country or region, state or province, city, language preference and feedback. Location fields are user-entered and are not precise geolocation.",
            "Cultivation and interaction content: archives, records, photos or videos, tags, categories, experience cards, comments, follows, saves, market posts and their visibility settings.",
            "Membership and payment data: order number, amount, currency, method, transaction reference, private payment proof, review records, service term and refund records. Payment proof is held privately and can be accessed only by the order owner and authorized administrators under access controls.",
            "Operations and security data: session, error, download and anti-abuse information needed to run the service. Infrastructure providers may process network addresses, device headers or request logs to deliver and protect it.",
          ],
        },
        {
          title: "3. Limits of page analytics",
          paragraphs: ["In-product analytics stores only a normalized route, time, platform type, anonymous visitor ID and necessary user-agent information. It does not store search terms, page content, precise location or email, and it does not create a cross-site device fingerprint."],
        },
        {
          title: "4. Local, cloud and public data",
          bullets: [
            "Local offline projects remain on the current device by default and are not uploaded automatically. Uninstalling, clearing browser data or changing devices may cause loss.",
            "Cloud storage, sync, interaction, market and payment features send the data needed for those features to the service.",
            "You choose whether archives and records are public. Syncing or purchasing membership never makes private content public automatically; content you deliberately publish can be viewed by others.",
          ],
        },
        {
          title: "5. Why information is used",
          bullets: [
            "To create and protect accounts and provide local, cloud, sync, interaction and market features.",
            "To handle orders, verify payments, activate benefits, review refunds and keep necessary audit records.",
            "To maintain security, prevent abuse, diagnose faults, understand feature use and improve the service.",
            "To answer feedback, data-rights requests and legally required requests.",
          ],
        },
        {
          title: "6. Sharing, processors and international handling",
          paragraphs: [
            "We do not sell personal data. Hosting, database, object storage, email and payment providers may process only the information needed for their role. Alipay, PayPal and other payment channels independently apply their own rules to payment-account data.",
            "The service currently uses Vercel, Inc. for web hosting and network delivery and Supabase, Inc. for authentication, database and object storage. This project's primary database region is Tokyo, Japan. These providers may process account information, request logs, cultivation content, interactions and cloud files through their global infrastructure to provide registration, login, storage, synchronization, public sharing, security and fault diagnosis. Their notices are available at vercel.com/legal/privacy-policy and supabase.com/privacy.",
            "Registration presents cross-border-processing consent separately from agreement to the service terms. You may continue using unregistered, non-uploaded local records without consenting. Email yoyomibaobao@gmail.com to withdraw consent or request access, correction, deletion or more information about overseas processing. Withdrawal does not affect earlier lawful processing but may make account and cloud features unavailable.",
          ],
        },
        {
          title: "7. Retention and account deletion",
          paragraphs: ["We retain data needed to provide the service while the account is active. After deletion, account, profile, cloud projects, records and files are deleted or de-identified through the deletion process. Payment, refund, security and operational audit records that must be retained by law or for dispute resolution remain restricted for the necessary period, then are deleted or anonymized. Residual backup copies expire through normal rotation."],
        },
        {
          title: "8. Your choices and rights",
          bullets: [
            "Correct profile details, change language and manage visibility in the profile and content settings.",
            "Use backup and export for currently supported records, or email us to request other available account data.",
            "Request account deletion in Account Management, or email us to request access, correction, deletion, restriction, withdrawal of consent or objection where applicable.",
            "Withdrawing consent does not affect processing that was lawful before withdrawal. Mandatory law prevails where it provides additional rights.",
          ],
        },
        {
          title: "9. Security and children",
          paragraphs: [
            "We use reasonable controls including access separation, private storage, authorization and audit measures, but no online service can guarantee absolute security. Contact us promptly if you notice an issue.",
            "A child under 14 should use account or cloud features only after a guardian has reviewed and agreed. Contact us if you believe a child's information was processed without valid guardian authorization.",
          ],
        },
        {
          title: "10. Changes and contact",
          paragraphs: ["Material changes will be reasonably notified on the page, in the service or through the registered email. Questions and personal-data requests can be sent to yoyomibaobao@gmail.com."],
        },
      ],
    },
    terms: {
      eyebrow: "SERVICE RULES",
      title: "Terms of Service",
      intro: "By using LifeSpace for Cultivation, you agree to follow these terms. Mandatory consumer rights are not excluded.",
      version: "Updated: 2026/09/01. Effective: 2026/09/01.",
      sections: [
        {
          title: "1. The service",
          paragraphs: [
            "LifeSpace for Cultivation provides tools for cultivation archives, records, experience, plant guidance, interactions and market listings. Local offline functions are free; cloud storage, sync and some interactions require an account or active cloud membership.",
            "The market is an information and contact feature. The platform is not the seller, buyer, agent or guarantor in user-to-user transactions. Users must verify counterparties, goods, delivery and payment safety themselves.",
          ],
        },
        {
          title: "2. Accounts and eligibility",
          bullets: [
            "Provide a working registration email, protect login credentials and take responsibility for account activity.",
            "Do not impersonate others, bypass authorization, disrupt the service, abuse it at scale, publish unlawful or infringing material, or use it for fraud.",
            "A user under 14 should obtain guardian agreement before using account or cloud features.",
          ],
        },
        {
          title: "3. User content and visibility",
          paragraphs: [
            "You retain rights in your original content. You grant a non-exclusive license limited to what is necessary to store, sync, display and provide the public features you select. It ends when content is deleted, except for legally required backups and audit records.",
            "You must have the right to upload content and must respect privacy, intellectual property and other lawful rights. Public content can be viewed, referenced or shared by others; private content is not published automatically.",
          ],
        },
        {
          title: "4. Cloud membership and payment",
          bullets: [
            "The current standard cloud membership is 12 months for CNY 64 or USD 8, subject to the payment page and confirmed order. It does not auto-renew.",
            "After Alipay or PayPal payment, submit the transaction reference or payment proof requested by the order. An administrator activates or renews only after checking the real receiving account. An uploaded screenshot alone is not confirmation.",
            "The confirmed order and membership page govern the service term, capacity and benefits. Later pricing changes do not retroactively reduce core benefits already purchased for a confirmed term.",
          ],
        },
        {
          title: "5. Refunds",
          paragraphs: ["The published Refund Policy applies. Request a refund from the membership order page. Approval locks the amount; the administrator then refunds the original transaction in the payment channel. Benefits end or roll back only after the external refund succeeds and its reference is recorded."],
        },
        {
          title: "6. Local data, backups and changes",
          paragraphs: [
            "Local offline data is stored by your device. Changing devices, uninstalling the app or clearing browser data can cause loss, so keep backups of important material.",
            "We may adjust the service for security, compliance or product improvement and will reasonably explain material changes. Maintenance, networks, providers or force majeure may cause temporary interruption; we will reasonably work to restore service and reduce impact.",
          ],
        },
        {
          title: "7. Restriction, deletion and liability boundaries",
          paragraphs: [
            "We may restrict relevant content or accounts for term violations, security threats or legal requirements, with reasons where feasible. You can request deletion in Account Management. Payment, refund and security audit records that must be retained do not disappear immediately with user content.",
            "To the extent permitted by law, the service is provided as actually available. We do not promise liability beyond legal requirements for user-arranged trades, device failure, unbacked-up local data or third-party services. Liability that cannot lawfully be limited, including intentional or grossly negligent conduct and mandatory consumer rights, is unaffected.",
          ],
        },
        {
          title: "8. Disputes and contact",
          paragraphs: ["Email yoyomibaobao@gmail.com first so we can investigate and attempt resolution. Applicable law and dispute handling will not reduce mandatory consumer or personal-data protections in the user's location."],
        },
      ],
    },
    refunds: {
      eyebrow: "CLOUD MEMBERSHIP",
      title: "Refund Policy",
      intro: "This policy applies to confirmed cloud-membership orders purchased through LifeSpace for Cultivation. Eligibility is determined by the time the service successfully receives the request.",
      version: "Updated: 2026/09/01. Effective: 2026/09/01.",
      sections: [
        {
          title: "1. Standard refund amount",
          bullets: [
            "Request within 7 calendar days after payment confirmation: 100% of the amount paid for that order.",
            "Request from calendar day 8 through calendar day 180 after confirmation: 50% of the amount paid for that order.",
            "More than 180 calendar days after confirmation: voluntary refunds for personal reasons are no longer available.",
            "A renewal whose service term has not started, requested within 180 days after payment confirmation: 100% of that renewal order.",
          ],
        },
        {
          title: "2. Exceptions",
          paragraphs: ["Duplicate charges, payment without activation or delivery, serious sustained platform-caused service failure, and refunds required by law are not limited by the personal-reason percentages above. The amount follows the verified facts and applicable law. Provide the order number, transaction reference and necessary evidence."],
        },
        {
          title: "3. How to request",
          bullets: [
            "Sign in and open Profile → Order History → Request refund, select the order and submit a reason.",
            "The system locks the eligible percentage and amount at submission; an administrator checks the order, membership term and required evidence.",
            "Approval means the amount is authorized, not that funds have arrived. The administrator then performs the refund against the original Alipay or PayPal transaction.",
            "After the channel reports success, the administrator records the refund reference and completes the request. Only then is the payment marked refunded and the corresponding membership term ended or rolled back.",
          ],
        },
        {
          title: "4. Original payment route and settlement time",
          paragraphs: ["Refunds are normally returned to the original payment channel and original payer account, not cash, another account or a new personal transfer. Settlement time depends on Alipay, PayPal, the card issuer or the bank. If the original route is objectively unavailable, contact the operator and complete account and order verification so the matter can be handled lawfully."],
        },
        {
          title: "5. Order relationships and limits",
          bullets: [
            "Each payment can have one refund request. A new paid term cannot be confirmed while a refund remains open, preventing incorrect entitlement calculations.",
            "If a newer confirmed membership order exists, automatic refund submission is blocked pending administrator review of the terms.",
            "Do not delete the account while a refund is open. Complete it first or contact the operator.",
          ],
        },
        {
          title: "6. Contact and statutory rights",
          paragraphs: ["If you disagree with a review or cannot use the in-product route, email the order number and registration email to yoyomibaobao@gmail.com. This policy does not limit statutory rights to refund, withdraw, claim or complain."],
        },
      ],
    },
    contact: {
      eyebrow: "PUBLIC CONTACT",
      title: "Operator Contact",
      intro: "Use the same public email for service, account, payment, refund, privacy and security matters.",
      version: "Updated: 2026/09/01. Effective: 2026/09/01.",
      sections: [
        {
          title: "Service information",
          bullets: [
            "Service: 有时·耕作 / LifeSpace for Cultivation",
            "Surfaces: desktop web, mobile web and the App that loads the same service",
            "Operator contact email: yoyomibaobao@gmail.com",
          ],
        },
        {
          title: "What to include",
          bullets: [
            "Account or privacy: registration email, member number and the specific request. Never send a password or verification code.",
            "Payment or refund: order number, payment channel, transaction reference and a description. Upload payment proof only through the private in-product route when requested.",
            "Security: time, page, device type and reproduction steps. Do not publish another person's information in public content.",
          ],
        },
        {
          title: "How requests are handled",
          paragraphs: ["We first verify that the request corresponds to the account or order, then respond through the registered email or in-product status. Payment settlement, public-authority handling and time spent waiting for requested evidence are controlled by the relevant third parties."],
        },
      ],
    },
  },
};

export function getLegalContent(language: Language) {
  return language === "en" ? en : zh;
}
