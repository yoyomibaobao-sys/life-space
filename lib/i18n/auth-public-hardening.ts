import type { Language } from "@/lib/i18n";

type AuthPublicHardeningCopy = {
  captcha_loading: string;
  captcha_load_failed: string;
  captcha_required: string;
  password_minimum: string;
  register_failed_password: string;
  password_length_error: string;
  registration_terms_prefix: string;
  registration_terms: string;
  registration_terms_joiner: string;
  registration_privacy: string;
  registration_cross_border_consent: string;
  registration_consent_required: string;
  email_not_confirmed: string;
  reset_email_sent: string;
  confirm_email_intro: string;
  confirmation_sent: string;
};

const copies: Record<Language, AuthPublicHardeningCopy> = {
  zh: {
    captcha_loading: "正在加载安全验证…",
    captcha_load_failed: "安全验证加载失败，请检查网络后刷新页面。",
    captcha_required: "请先完成安全验证。",
    password_minimum: "密码至少需要 8 位",
    register_failed_password: "注册失败：密码至少需要 8 位",
    password_length_error: "密码长度至少 8 位",
    registration_terms_prefix: "我已阅读并同意",
    registration_terms: "《服务条款》",
    registration_terms_joiner: "和",
    registration_privacy: "《隐私说明》",
    registration_cross_border_consent: "我单独同意：为完成注册、登录及我主动使用的云端功能，将账号信息、使用数据和我主动上传的云端内容传输至境外服务商处理；不同意仍可使用本地记录。处理详情见《隐私说明》。",
    registration_consent_required: "请分别确认服务与隐私条款，以及跨境处理同意。",
    email_not_confirmed: "邮箱未确认，请查找来自 LifeSpace·自然 的邮件",
    reset_email_sent: "重置邮件已发送，请查找来自 LifeSpace·自然 的邮件",
    confirm_email_intro: "请在邮箱中查找来自 LifeSpace·自然 的确认邮件。也请检查垃圾邮件或促销邮件。",
    confirmation_sent: "确认邮件已发送，请查找来自 LifeSpace·自然 的邮件",
  },
  en: {
    captcha_loading: "Loading security verification…",
    captcha_load_failed: "Security verification could not load. Check your network and refresh the page.",
    captcha_required: "Complete the security verification first.",
    password_minimum: "Password must be at least 8 characters",
    register_failed_password: "Registration failed: password must be at least 8 characters",
    password_length_error: "Password must be at least 8 characters",
    registration_terms_prefix: "I have read and agree to the ",
    registration_terms: "Terms of Service",
    registration_terms_joiner: " and ",
    registration_privacy: "Privacy Notice",
    registration_cross_border_consent: "I separately consent to account information, usage data, and cloud content that I actively upload being processed by overseas service providers for registration, login, and cloud features I choose to use. I can still use local records without this consent. See the Privacy Notice for details.",
    registration_consent_required: "Confirm the service/privacy terms and the separate cross-border processing consent.",
    email_not_confirmed: "Your email is not confirmed. Look for a message from LifeSpace.",
    reset_email_sent: "Password-reset email sent. Look for a message from LifeSpace.",
    confirm_email_intro: "Look for a confirmation message from LifeSpace. Check your spam and promotions folders too.",
    confirmation_sent: "Confirmation email sent. Look for a message from LifeSpace.",
  },
};

export function getAuthPublicHardeningCopy(language: Language) {
  return copies[language];
}
