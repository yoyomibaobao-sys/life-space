"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { formatStorage } from "@/lib/user-profile-shared";
import {
  formatMembershipDate,
  getMembershipEndDate,
  getDaysRemaining,
  getMembershipPlanLabel,
  getMembershipStatusLabel,
  getMembershipSummary,
  normalizeCloudTrialClaimRpcResult,
  normalizeCloudTrialOfferRpcResult,
  normalizeMembershipRpcResult,
  type CloudTrialOffer,
  type MyMembership,
} from "@/lib/membership";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { buildLoginHref } from "@/lib/auth-return";

export default function MembershipPage() {
  const { language, t } = useLanguage();
  const [membership, setMembership] = useState<MyMembership | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [membershipLoadFailed, setMembershipLoadFailed] = useState(false);
  const [trialOffer, setTrialOffer] = useState<CloudTrialOffer | null>(null);
  const [trialOfferLoadFailed, setTrialOfferLoadFailed] = useState(false);
  const [claimingTrial, setClaimingTrial] = useState(false);
  const [trialClaimMessage, setTrialClaimMessage] = useState("");
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    function updateViewportMode() {
      setIsMobileViewport(window.innerWidth < 760);
    }

    updateViewportMode();
    window.addEventListener("resize", updateViewportMode);
    return () => window.removeEventListener("resize", updateViewportMode);
  }, []);

  useEffect(() => {
    async function loadMembership() {
      setLoading(true);
      setMembershipLoadFailed(false);
      setTrialOfferLoadFailed(false);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.error("load user error:", userError);
      }

      if (!user) {
        setMembership(null);
        setTrialOffer(null);
        setUserEmail("");
        setLoading(false);
        return;
      }

      setUserEmail(user.email || "");

      const [membershipResult, trialOfferResult] = await Promise.all([
        supabase.rpc("get_my_membership"),
        supabase.rpc("get_my_cloud_trial_offer"),
      ]);

      if (membershipResult.error) {
        console.error("load membership error:", membershipResult.error);
        setMembership(null);
        setMembershipLoadFailed(true);
      } else {
        setMembership(normalizeMembershipRpcResult(membershipResult.data));
      }

      if (trialOfferResult.error) {
        console.error("load cloud trial offer error:", trialOfferResult.error);
        setTrialOffer(null);
        setTrialOfferLoadFailed(true);
      } else {
        setTrialOffer(normalizeCloudTrialOfferRpcResult(trialOfferResult.data));
      }

      setLoading(false);
    }

    void loadMembership();
  }, []);

  async function claimCloudTrial() {
    if (claimingTrial) return;

    setClaimingTrial(true);
    setTrialClaimMessage("");

    const { data, error } = await supabase.rpc("claim_my_cloud_trial");
    if (error) {
      console.error("claim cloud trial error:", error);
      setTrialClaimMessage(t.membership_page.trial_claim_failed);
      setClaimingTrial(false);
      return;
    }

    const result = normalizeCloudTrialClaimRpcResult(data);
    if (!result?.ok) {
      const reason = result?.reason || "unknown";
      setTrialClaimMessage(
        reason === "email_not_confirmed"
          ? t.membership_page.trial_email_unconfirmed
          : reason === "storage_safety_threshold"
            ? t.membership_page.trial_storage_paused
            : reason === "membership_active"
              ? t.membership_page.trial_membership_active
              : reason === "paid_membership_history"
                ? t.membership_page.trial_paid_history
              : t.membership_page.trial_claim_failed
      );
      setClaimingTrial(false);
      return;
    }

    setTrialClaimMessage(t.membership_page.trial_claim_success);
    const [membershipResult, trialOfferResult] = await Promise.all([
      supabase.rpc("get_my_membership"),
      supabase.rpc("get_my_cloud_trial_offer"),
    ]);
    if (!membershipResult.error) {
      setMembership(normalizeMembershipRpcResult(membershipResult.data));
    }
    if (!trialOfferResult.error) {
      setTrialOffer(normalizeCloudTrialOfferRpcResult(trialOfferResult.data));
    }
    setClaimingTrial(false);
  }

  const endDate = getMembershipEndDate(membership);
  const daysRemaining = getDaysRemaining(endDate);
  const shouldShowRenewalNotice = Boolean(
    membership &&
      (membership.can_create_content === false ||
        (typeof daysRemaining === "number" && daysRemaining <= 14))
  );
  const renewalNoticeText = membership?.can_create_content === false
    ? t.membership_page.expired
    : typeof daysRemaining === "number" && daysRemaining <= 14
      ? `${t.membership_page.expires_prefix}${daysRemaining}${t.membership_page.expires_suffix}`
      : "";
  const storageLimitText = useMemo(() => {
    if (!membership?.storage_limit_bytes) return t.membership_page.none;
    return formatStorage(Number(membership.storage_limit_bytes));
  }, [membership?.storage_limit_bytes, t.membership_page.none]);

  const marketQuotaText = membership
    ? `${Number(membership.market_post_limit || 0)}${t.membership_page.simultaneous_posts_suffix}`
    : t.membership_page.zero_posts;
  const isLocalFreeUser = Boolean(userEmail && !membership && !membershipLoadFailed);
  const trialOfferStatusText = trialOffer?.claimed
    ? trialOffer.lifecycle_status === "converted_to_paid"
      ? t.membership_page.trial_converted_to_paid
      : trialOffer.lifecycle_status === "cleanup_completed"
        ? t.membership_page.trial_cleanup_completed
        : trialOffer.lifecycle_status === "cleanup_in_progress" ||
            trialOffer.lifecycle_status === "cleanup_due"
          ? t.membership_page.trial_cleanup_in_progress
          : trialOffer.lifecycle_status === "handling_period"
            ? t.membership_page.trial_handling_period
            : t.membership_page.trial_already_claimed
    : trialOffer?.reason === "email_not_confirmed"
      ? t.membership_page.trial_email_unconfirmed
      : trialOffer?.reason === "membership_active"
        ? t.membership_page.trial_membership_active
        : trialOffer?.reason === "paid_membership_history"
          ? t.membership_page.trial_paid_history
        : trialOffer?.reason === "storage_safety_threshold"
          ? t.membership_page.trial_storage_paused
          : trialOffer?.can_claim
            ? t.membership_page.trial_available
            : t.membership_page.trial_unavailable;

  return (
    <main style={isMobileViewport ? mobilePageStyle : pageStyle}>
      <section style={isMobileViewport ? mobileHeroStyle : heroStyle}>
        <div className="mobile-app-desktop-only" style={eyebrowStyle}>{t.membership_page.eyebrow}</div>
        <h1 className="mobile-app-desktop-only" style={isMobileViewport ? mobileTitleStyle : titleStyle}>{t.membership_page.title}</h1>
        <p style={isMobileViewport ? mobileSubtitleStyle : subtitleStyle}>
          {isMobileViewport
            ? t.membership_page.mobile_subtitle
            : t.membership_page.subtitle}
        </p>
      </section>

      {loading ? (
        <section style={isMobileViewport ? mobileCardStyle : cardStyle}>{t.membership_page.reading_status}</section>
      ) : userEmail ? (
        <section style={isMobileViewport ? mobileStatusCardStyle : statusCardStyle}>
          <div>
            <div style={sectionLabelStyle}>{t.membership_page.current_account}</div>
            <h2 style={isMobileViewport ? mobileSectionTitleStyle : sectionTitleStyle}>
              {userEmail}
            </h2>
            <p style={mutedTextStyle}>
              {membershipLoadFailed
                ? t.membership_page.load_failed
                : getMembershipSummary(membership, language)}
            </p>
          </div>

          <div style={isMobileViewport ? mobileStatusGridStyle : statusGridStyle}>
            <InfoItem
              label={t.membership_page.current_identity}
              value={membership ? getMembershipPlanLabel(membership.plan, language) : t.membership_page.local_user}
              hint={membership ? getMembershipStatusLabel(membership.status, language) : t.membership_page.free_local_features}
              compact={isMobileViewport}
            />
            <InfoItem
              label={t.membership_page.valid_until}
              value={
                membership
                  ? formatMembershipDate(endDate, language)
                  : t.membership_page.not_applicable
              }
              hint={
                membership
                  ? t.membership_page.use_until_expiry
                  : t.membership_page.local_no_expiry
              }
              compact={isMobileViewport}
            />
            <InfoItem
              label={t.membership_page.storage_capacity}
              value={membership ? storageLimitText : "0 B"}
              hint={
                membership?.plan === "trial"
                  ? t.membership_page.trial_storage_hint
                  : t.membership_page.cloud_storage_hint
              }
              compact={isMobileViewport}
            />
            <InfoItem
              label={t.membership_page.market_posting}
              value={marketQuotaText}
              hint={membership ? t.membership_page.simultaneous_post_hint : t.membership_page.local_cannot_post}
              compact={isMobileViewport}
            />
          </div>

          {isLocalFreeUser && !isMobileViewport ? (
            <div style={localFreeNoticeStyle}>
              {t.membership_page.local_user_notice}
            </div>
          ) : null}

          {!trialOfferLoadFailed && trialOffer && (trialOffer.eligible || trialOffer.claimed) ? (
            <div style={trialClaimCardStyle}>
              <div>
                <div style={sectionLabelStyle}>{t.membership_page.trial_claim_eyebrow}</div>
                <strong style={trialClaimTitleStyle}>{t.membership_page.trial_claim_title}</strong>
                <p style={trialClaimTextStyle}>{t.membership_page.trial_claim_description}</p>
                <p style={trialClaimStatusStyle}>{trialOfferStatusText}</p>
                {trialOffer.claimed && trialOffer.trial_ends_at ? (
                  <p style={trialClaimTextStyle}>
                    {t.membership_page.trial_valid_until_prefix}
                    {formatMembershipDate(trialOffer.trial_ends_at, language)}
                  </p>
                ) : null}
                {trialOffer.claimed &&
                trialOffer.cleanup_due_at &&
                trialOffer.lifecycle_status !== "converted_to_paid" &&
                trialOffer.lifecycle_status !== "cleanup_completed" ? (
                  <p style={trialClaimTextStyle}>
                    {t.membership_page.trial_handling_until_prefix}
                    {formatMembershipDate(trialOffer.cleanup_due_at, language)}
                  </p>
                ) : null}
                {trialClaimMessage ? (
                  <p style={trialClaimStatusStyle}>{trialClaimMessage}</p>
                ) : null}
              </div>
              {trialOffer.can_claim && !trialOffer.claimed ? (
                <button
                  type="button"
                  style={primaryButtonStyle}
                  onClick={() => void claimCloudTrial()}
                  disabled={claimingTrial}
                >
                  {claimingTrial
                    ? t.membership_page.trial_claiming
                    : t.membership_page.trial_claim_action}
                </button>
              ) : null}
            </div>
          ) : null}

          {shouldShowRenewalNotice ? (
            <div style={renewalNoticeStyle}>
              <strong>{t.membership_page.membership_reminder}</strong>{renewalNoticeText}
              <div style={{ marginTop: 8 }}>
                {t.membership_page.payment_action_hint}{" "}
                <Link href="/membership/payment" style={inlineLinkStyle}>
                  {t.membership_page.open_payment_page}
                </Link>
              </div>
            </div>
          ) : null}

          <div style={isMobileViewport ? mobileActionRowStyle : actionRowStyle}>
            {isMobileViewport ? (
              <Link href="/membership/payment" style={primaryButtonStyle}>
                {membership
                  ? t.membership_page.renew_now
                  : t.membership_page.open_now}
              </Link>
            ) : (
              <a href="#payment" style={primaryButtonStyle}>
                {membership ? t.membership_page.view_renewal : t.membership_page.view_opening}
              </a>
            )}
            <Link href="/profile" style={secondaryButtonStyle}>
              {t.membership_page.back_to_profile}
            </Link>
          </div>
        </section>
      ) : (
        <section style={isMobileViewport ? mobileStatusCardStyle : statusCardStyle}>
          <div>
            <div style={sectionLabelStyle}>{t.membership_page.signed_out}</div>
            <h2 style={isMobileViewport ? mobileSectionTitleStyle : sectionTitleStyle}>
              {t.membership_page.signed_out_title}
            </h2>
            <p style={mutedTextStyle}>
              {t.membership_page.signed_out_intro}
            </p>
          </div>

          <div style={isMobileViewport ? mobileActionRowStyle : actionRowStyle}>
            {isMobileViewport ? (
              <Link
                href={buildLoginHref("/membership/payment")}
                style={primaryButtonStyle}
              >
                {t.membership_page.login_and_continue_payment}
              </Link>
            ) : (
              <>
                <Link href="/register" style={primaryButtonStyle}>
                  {t.membership_page.register_account}
                </Link>
                <Link
                  href={buildLoginHref("/membership")}
                  style={secondaryButtonStyle}
                >
                  {t.membership_page.existing_account_login}
                </Link>
              </>
            )}
          </div>
        </section>
      )}

      {isMobileViewport ? (
        <section style={mobileBenefitsCardStyle}>
          <div style={sectionLabelStyle}>{t.membership_page.core_benefits_title}</div>
          <div style={mobileMembershipPricesStyle}>
            <strong style={mobileMembershipPriceStyle}>
              {t.membership_page.domestic_price}
            </strong>
            <span style={mobileMembershipOverseasPriceStyle}>
              {t.membership_page.overseas_price}
            </span>
          </div>
          <ul style={mobileCoreBenefitsStyle}>
            {t.membership_page.plans[2].mobile_items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <Link href="/membership/benefits" style={mobileBenefitsLinkStyle}>
            {t.membership_page.view_benefits_rules}
          </Link>
        </section>
      ) : (
        <>
          <section style={trialNoticeStyle}>
            <div style={sectionLabelStyle}>{t.membership_page.trial_label}</div>
            <h2 style={noteTitleStyle}>{t.membership_page.trial_title}</h2>
            <p style={mutedTextStyle}>
              {t.membership_page.trial_description}
            </p>
          </section>

          <section style={plansGridStyle}>
            {t.membership_page.plans.map((plan, index) => (
              <PlanCard
                key={plan.title}
                {...plan}
                featured={index === 2}
                compact={false}
              />
            ))}
          </section>

          <section id="payment" style={paymentCardStyle}>
            <div>
              <div style={sectionLabelStyle}>{t.membership_page.payment_label}</div>
              <h2 style={noteTitleStyle}>{t.membership_page.payment_title}</h2>
              <p style={mutedTextStyle}>{t.membership_page.payment_intro}</p>
            </div>

            <div style={paymentGridStyle}>
              <div style={paymentItemStyle}>
                <div style={paymentTitleStyle}>{t.membership_page.domestic_users}</div>
                <div style={paymentPriceStyle}>{t.membership_page.domestic_price}</div>
                <p style={paymentDescStyle}>{t.membership_page.domestic_payment_summary}</p>
                <Link href="/membership/payment" style={paymentPageLinkStyle}>
                  {t.membership_page.open_payment_page}
                </Link>
              </div>

              <div style={paymentItemStyle}>
                <div style={paymentTitleStyle}>{t.membership_page.overseas_users}</div>
                <div style={paymentPriceStyle}>{t.membership_page.overseas_price}</div>
                <p style={paymentDescStyle}>{t.membership_page.overseas_payment_summary}</p>
                <Link href="/membership/payment" style={paymentPageLinkStyle}>
                  {t.membership_page.open_payment_page}
                </Link>
              </div>
            </div>

            <div style={adminContactStyle}>
              {t.membership_page.admin_email}
              <a href="mailto:yoyomibaobao@gmail.com" style={inlineLinkStyle}>
                yoyomibaobao@gmail.com
              </a>
            </div>

            <div style={customStorageStyle}>
              <strong>{t.membership_page.more_storage_label}</strong>
              {t.membership_page.more_storage_text}
            </div>
          </section>

          <section style={noteCardStyle}>
            <h2 style={noteTitleStyle}>{t.membership_page.rules_title}</h2>
            <ul style={ruleListStyle}>
              {t.membership_page.rules.map((rule) => <li key={rule}>{rule}</li>)}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}

function InfoItem({
  label,
  value,
  hint,
  compact = false,
}: {
  label: string;
  value: string;
  hint: string;
  compact?: boolean;
}) {
  return (
    <div style={compact ? mobileInfoItemStyle : infoItemStyle}>
      <div style={infoLabelStyle}>{label}</div>
      <div style={compact ? mobileInfoValueStyle : infoValueStyle}>{value}</div>
      <div style={compact ? mobileInfoHintStyle : infoHintStyle}>{hint}</div>
    </div>
  );
}

function PlanCard({
  title,
  price,
  description,
  items,
  mobile_items,
  featured = false,
  compact = false,
}: {
  title: string;
  price: string;
  description: string;
  items: string[];
  mobile_items?: string[];
  featured?: boolean;
  compact?: boolean;
}) {
  const visibleItems = compact ? mobile_items || items.slice(0, 3) : items;

  return (
    <article style={compact ? mobilePlanCardStyle(featured) : planCardStyle(featured)}>
      <div style={planTopStyle}>
        <h2 style={compact ? mobilePlanTitleStyle : planTitleStyle}>{title}</h2>
        <div style={compact ? mobilePlanPriceStyle : planPriceStyle}>{price}</div>
      </div>
      <p style={compact ? mobilePlanDescStyle : planDescStyle}>{description}</p>
      <ul style={compact ? mobilePlanListStyle : planListStyle}>
        {visibleItems.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}

const pageStyle: CSSProperties = {
  maxWidth: 1040,
  margin: "0 auto",
  padding: "40px 18px 72px",
};

const mobilePageStyle: CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "14px 12px 28px",
};

const heroStyle: CSSProperties = {
  marginBottom: 22,
};

const mobileHeroStyle: CSSProperties = {
  marginBottom: 12,
};

const eyebrowStyle: CSSProperties = {
  color: "#5f7d4c",
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: 1,
  marginBottom: 8,
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#1f2a1f",
  fontSize: 32,
  lineHeight: 1.2,
};

const mobileTitleStyle: CSSProperties = {
  ...titleStyle,
  fontSize: 25,
};

const subtitleStyle: CSSProperties = {
  maxWidth: 760,
  margin: "12px 0 0",
  color: "#5d6b57",
  fontSize: 15,
  lineHeight: 1.8,
};

const mobileSubtitleStyle: CSSProperties = {
  ...subtitleStyle,
  marginTop: 7,
  fontSize: 13,
  lineHeight: 1.55,
};

const cardStyle: CSSProperties = {
  border: "1px solid #dfe8d8",
  borderRadius: 20,
  background: "#fff",
  padding: 20,
  color: "#5d6b57",
};

const mobileCardStyle: CSSProperties = {
  ...cardStyle,
  borderRadius: 15,
  padding: 13,
};

const statusCardStyle: CSSProperties = {
  ...cardStyle,
  display: "grid",
  gap: 18,
  marginBottom: 20,
};

const mobileStatusCardStyle: CSSProperties = {
  ...mobileCardStyle,
  display: "grid",
  gap: 12,
  marginBottom: 12,
};

const trialNoticeStyle: CSSProperties = {
  ...cardStyle,
  marginBottom: 20,
  background: "#f7faf3",
};

const trialClaimCardStyle: CSSProperties = {
  border: "1px solid #d7e5d0",
  borderRadius: 16,
  background: "#f7faf3",
  padding: "14px 16px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  flexWrap: "wrap",
};

const trialClaimTitleStyle: CSSProperties = {
  color: "#243123",
  fontSize: 16,
};

const trialClaimTextStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#6f7b69",
  fontSize: 13,
  lineHeight: 1.6,
};

const trialClaimStatusStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#3f6f3d",
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.5,
};

const sectionLabelStyle: CSSProperties = {
  fontSize: 13,
  color: "#6b7b66",
  marginBottom: 4,
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 22,
  color: "#1f2a1f",
};

const mobileSectionTitleStyle: CSSProperties = {
  ...sectionTitleStyle,
  fontSize: 18,
  lineHeight: 1.35,
  overflowWrap: "anywhere",
};

const mutedTextStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "#6f7b69",
  fontSize: 14,
  lineHeight: 1.7,
};

const statusGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const mobileStatusGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 7,
};

const infoItemStyle: CSSProperties = {
  border: "1px solid #edf2e9",
  borderRadius: 16,
  background: "#fbfdf9",
  padding: 14,
};

const mobileInfoItemStyle: CSSProperties = {
  ...infoItemStyle,
  minWidth: 0,
  borderRadius: 12,
  padding: 9,
};

const infoLabelStyle: CSSProperties = {
  fontSize: 12,
  color: "#7d8b76",
  marginBottom: 6,
};

const infoValueStyle: CSSProperties = {
  fontSize: 19,
  fontWeight: 800,
  color: "#243123",
};

const mobileInfoValueStyle: CSSProperties = {
  ...infoValueStyle,
  fontSize: 15,
  lineHeight: 1.3,
};

const infoHintStyle: CSSProperties = {
  marginTop: 5,
  fontSize: 12,
  color: "#7d8b76",
  lineHeight: 1.5,
};

const mobileInfoHintStyle: CSSProperties = {
  ...infoHintStyle,
  marginTop: 3,
  fontSize: 12,
  lineHeight: 1.4,
};


const renewalNoticeStyle: CSSProperties = {
  border: "1px solid #ead9b8",
  borderRadius: 16,
  background: "#fff8ea",
  color: "#72541f",
  padding: "12px 14px",
  fontSize: 13,
  lineHeight: 1.7,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const mobileActionRowStyle: CSSProperties = {
  ...actionRowStyle,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
};

const primaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 16px",
  borderRadius: 999,
  background: "#3f7d3d",
  color: "#fff",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 700,
};

const paymentPageLinkStyle: CSSProperties = {
  ...primaryButtonStyle,
  alignSelf: "flex-start",
  marginTop: "auto",
};

const secondaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 16px",
  borderRadius: 999,
  border: "1px solid #d7e5d0",
  background: "#fff",
  color: "#355235",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 700,
};

const plansGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 14,
  marginBottom: 20,
};

const planCardStyle = (featured: boolean): CSSProperties => ({
  border: featured ? "1px solid #aacb9b" : "1px solid #e1eadb",
  borderRadius: 20,
  background: featured ? "#f6fbf3" : "#fff",
  padding: 18,
  boxShadow: featured ? "0 10px 24px rgba(63,125,61,0.10)" : "none",
});

const mobilePlanCardStyle = (featured: boolean): CSSProperties => ({
  ...planCardStyle(featured),
  borderRadius: 15,
  padding: 12,
  boxShadow: featured ? "0 5px 14px rgba(63,125,61,0.08)" : "none",
});

const planTopStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "baseline",
  marginBottom: 10,
};

const planTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 20,
  color: "#1f2a1f",
};

const mobilePlanTitleStyle: CSSProperties = {
  ...planTitleStyle,
  fontSize: 16,
};

const planPriceStyle: CSSProperties = {
  color: "#3f7d3d",
  fontSize: 14,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const mobilePlanPriceStyle: CSSProperties = {
  ...planPriceStyle,
  fontSize: 12,
};

const planDescStyle: CSSProperties = {
  margin: "0 0 12px",
  color: "#667260",
  fontSize: 14,
  lineHeight: 1.7,
};

const mobilePlanDescStyle: CSSProperties = {
  ...planDescStyle,
  marginBottom: 6,
  fontSize: 12,
  lineHeight: 1.45,
};

const planListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  color: "#3c4638",
  fontSize: 14,
  lineHeight: 1.8,
};

const mobilePlanListStyle: CSSProperties = {
  ...planListStyle,
  paddingLeft: 16,
  fontSize: 12,
  lineHeight: 1.6,
};

const paymentCardStyle: CSSProperties = {
  ...cardStyle,
  display: "grid",
  gap: 16,
  marginBottom: 20,
  background: "#fffdf7",
};

const paymentGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const paymentItemStyle: CSSProperties = {
  border: "1px solid #efe6c8",
  borderRadius: 16,
  background: "#fffaf0",
  padding: 14,
};

const paymentTitleStyle: CSSProperties = {
  color: "#6f5b24",
  fontSize: 13,
  fontWeight: 800,
  marginBottom: 6,
};

const paymentPriceStyle: CSSProperties = {
  color: "#2d3828",
  fontSize: 22,
  fontWeight: 900,
  marginBottom: 8,
};

const paymentDescStyle: CSSProperties = {
  margin: 0,
  color: "#6f6655",
  fontSize: 14,
  lineHeight: 1.7,
};

const adminContactStyle: CSSProperties = {
  borderTop: "1px solid #efe6c8",
  paddingTop: 12,
  color: "#6f6655",
  fontSize: 14,
  lineHeight: 1.7,
};

const inlineLinkStyle: CSSProperties = {
  color: "#356b34",
  fontWeight: 800,
  textDecoration: "none",
};

const noteCardStyle: CSSProperties = {
  ...cardStyle,
  background: "#fbfbf7",
};

const noteTitleStyle: CSSProperties = {
  margin: "0 0 10px",
  fontSize: 18,
  color: "#1f2a1f",
};

const ruleListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 20,
  color: "#4c5948",
  fontSize: 14,
  lineHeight: 1.8,
};

const localFreeNoticeStyle: CSSProperties = {
  marginTop: 14,
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid #dce9d5",
  background: "#f7fbf4",
  color: "#4f6849",
  fontSize: 14,
  lineHeight: 1.7,
};

const customStorageStyle: CSSProperties = {
  marginTop: 14,
  padding: "12px 14px",
  borderRadius: 14,
  background: "#f7f2e7",
  color: "#5e503d",
  fontSize: 14,
  lineHeight: 1.7,
};

const mobileBenefitsCardStyle: CSSProperties = {
  ...mobileCardStyle,
  display: "grid",
  gap: 12,
  background: "#f8fbf5",
};

const mobileMembershipPricesStyle: CSSProperties = {
  display: "grid",
  gap: 1,
};

const mobileMembershipPriceStyle: CSSProperties = {
  color: "#243123",
  fontSize: 20,
  fontWeight: 900,
  lineHeight: 1.35,
};

const mobileMembershipOverseasPriceStyle: CSSProperties = {
  color: "#6d7b68",
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.4,
};

const mobileCoreBenefitsStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 20,
  color: "#465541",
  fontSize: 14,
  lineHeight: 1.75,
};

const mobileBenefitsLinkStyle: CSSProperties = {
  ...secondaryButtonStyle,
  width: "100%",
  boxSizing: "border-box",
};
