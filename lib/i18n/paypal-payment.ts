import type { Language } from "@/lib/i18n";

type PayPalPaymentCopy = {
  payment_intro: string;
  order_hint: string;
  payment_steps: string;
  checkout_failed: string;
  opening_paypal: string;
  auto_notice: string;
  success_title: string;
  success_body: string;
  success_profile: string;
  success_membership: string;
};

const copies: Record<Language, PayPalPaymentCopy> = {
  zh: {
    payment_intro: "PayPal 付款成功后自动开通一年；支付宝付款后上传凭证，由管理员确认。",
    order_hint: "生成订单后进入 PayPal 支付 US$8；付款成功后自动开通一年，无需上传凭证。",
    payment_steps: "进入 PayPal 核对 US$8 订单并完成付款。付款确认后会自动返回并开通或顺延一年 Plus。",
    checkout_failed: "暂时无法进入 PayPal 付款，请稍后重试。",
    opening_paypal: "正在进入 PayPal...",
    auto_notice: "付款成功后自动开通，无需上传付款凭证。",
    success_title: "PayPal 付款成功",
    success_body: "Plus 云会员已自动开通或顺延一年，无需上传付款凭证，也无需等待人工确认。",
    success_profile: "返回我的信息",
    success_membership: "查看会员权益",
  },
  en: {
    payment_intro: "PayPal activates one year automatically after payment. Alipay still uses proof upload and administrator confirmation.",
    order_hint: "Create an order and pay US$8 through PayPal. One year is activated automatically after payment, with no proof upload.",
    payment_steps: "Open PayPal, verify the US$8 order, and complete payment. After confirmation, Plus is activated or extended by one year automatically.",
    checkout_failed: "PayPal checkout could not be opened. Try again later.",
    opening_paypal: "Opening PayPal...",
    auto_notice: "Membership activates automatically after payment. No proof upload is needed.",
    success_title: "PayPal payment complete",
    success_body: "Plus Cloud Membership has been activated or extended by one year automatically. No payment proof or manual confirmation is required.",
    success_profile: "Back to profile",
    success_membership: "View membership",
  },
};

export function getPayPalPaymentCopy(language: Language) {
  return copies[language];
}
