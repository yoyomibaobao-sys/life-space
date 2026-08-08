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
  normalizeMembershipRpcResult,
  type MyMembership,
} from "@/lib/membership";

export default function MembershipPage() {
  const [membership, setMembership] = useState<MyMembership | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function loadMembership() {
      setLoading(true);
      setErrorMsg("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.error("load user error:", userError);
      }

      if (!user) {
        setMembership(null);
        setUserEmail("");
        setLoading(false);
        return;
      }

      setUserEmail(user.email || "");

      const { data, error } = await supabase.rpc("get_my_membership");
      if (error) {
        console.error("load membership error:", error);
        setMembership(null);
        setErrorMsg("使用状态读取失败");
      } else {
        setMembership(normalizeMembershipRpcResult(data));
      }

      setLoading(false);
    }

    void loadMembership();
  }, []);

  const endDate = getMembershipEndDate(membership);
  const daysRemaining = getDaysRemaining(endDate);
  const shouldShowRenewalNotice = Boolean(
    membership &&
      (membership.can_create_content === false ||
        (typeof daysRemaining === "number" && daysRemaining <= 14))
  );
  const renewalNoticeText = membership?.can_create_content === false
    ? "云空间已到期"
    : typeof daysRemaining === "number" && daysRemaining <= 14
      ? `云空间还有 ${daysRemaining} 天到期`
      : "";
  const storageLimitText = useMemo(() => {
    if (!membership?.storage_limit_bytes) return "暂无";
    return formatStorage(Number(membership.storage_limit_bytes));
  }, [membership?.storage_limit_bytes]);

  const marketQuotaText = membership
    ? `${Number(membership.market_post_limit || 0)} 条同时在线`
    : "0 条";
  const isSignupTrialAllowance = Boolean(
    membership?.plan === "trial" && !membership.trial_ends_at
  );

  const isLocalFreeUser = Boolean(userEmail && !membership && !errorMsg);

  return (
    <main style={pageStyle}>
      <section style={heroStyle}>
        <div style={eyebrowStyle}>云空间</div>
        <h1 style={titleStyle}>云空间</h1>
        <p style={subtitleStyle}>
          本地记录免费。云空间用于同步、备份、多设备使用、公开发现和求助；上传云空间不等于公开，已有记录不会自动公开。
        </p>
      </section>

      {loading ? (
        <section style={cardStyle}>正在读取使用状态...</section>
      ) : userEmail ? (
        <section style={statusCardStyle}>
          <div>
            <div style={sectionLabelStyle}>当前账号</div>
            <h2 style={sectionTitleStyle}>{userEmail}</h2>
            <p style={mutedTextStyle}>{errorMsg || getMembershipSummary(membership)}</p>
          </div>

          <div style={statusGridStyle}>
            <InfoItem label="当前方案" value={membership ? getMembershipPlanLabel(membership.plan) : "本地免费"} hint={membership ? getMembershipStatusLabel(membership.status) : "未开通云空间"} />
            <InfoItem
              label="有效期至"
              value={
                membership
                  ? isSignupTrialAllowance
                    ? "不设固定期限"
                    : formatMembershipDate(endDate)
                  : "不适用"
              }
              hint={
                membership
                  ? isSignupTrialAllowance
                    ? "30MB体验额度用完后可升级"
                    : "到期前可继续使用对应权限"
                  : "本地记录没有到期日"
              }
            />
            <InfoItem
              label="云空间容量"
              value={membership ? storageLimitText : "0 B"}
              hint={
                isSignupTrialAllowance
                  ? "首批注册体验额度；正式云空间为1GB"
                  : "正式云空间为1GB"
              }
            />
            <InfoItem
              label="集市发布"
              value={marketQuotaText}
              hint={membership ? "同时在线发布数量" : "本地免费用户不能发布"}
            />
          </div>

          {isLocalFreeUser ? (
            <div style={localFreeNoticeStyle}>
              当前账号是本地免费用户：可以在本机记录，查看植物指引的基础概要和少量核心参数，也可在集市咨询发布者；完整参数、社区互动和云端发布需开通云空间。
            </div>
          ) : null}

          {shouldShowRenewalNotice ? (
            <div style={renewalNoticeStyle}>
              <strong>云空间提醒：</strong>{renewalNoticeText}
              <div style={{ marginTop: 8 }}>
                付款时请备注注册邮箱；有问题可联系管理员邮箱：
                <a href="mailto:yoyomibaobao@gmail.com" style={inlineLinkStyle}>
                  yoyomibaobao@gmail.com
                </a>
              </div>
            </div>
          ) : null}

          <div style={actionRowStyle}>
            <button type="button" disabled style={disabledPrimaryButtonStyle}>
              支付功能准备中
            </button>
            <Link href="/profile" style={secondaryButtonStyle}>
              返回个人资料
            </Link>
          </div>
        </section>
      ) : (
        <section style={statusCardStyle}>
          <div>
            <div style={sectionLabelStyle}>尚未登录</div>
            <h2 style={sectionTitleStyle}>注册后仍可使用本地项目</h2>
            <p style={mutedTextStyle}>
              注册是推荐路径，但注册不等于上传云端。本地离线版免费；首批20名正式注册用户在名额和存储安全线允许时可获得30MB云空间体验。
            </p>
          </div>

          <div style={actionRowStyle}>
            <Link href="/register" style={primaryButtonStyle}>
              注册账号
            </Link>
            <Link href="/login" style={secondaryButtonStyle}>
              已有账号登录
            </Link>
          </div>
        </section>
      )}

      <section style={trialNoticeStyle}>
        <div style={sectionLabelStyle}>首批注册体验</div>
        <h2 style={noteTitleStyle}>前20名正式账号可获30MB云空间</h2>
        <p style={mutedTextStyle}>
          体验额度不设6个月期限，是否获得以注册成功时的剩余名额和平台存储安全线为准。30MB用完后仍可继续使用本地记录；开通正式云空间后，容量升级为1GB。内部测试账号不占这20个名额。
        </p>
      </section>

      <section style={plansGridStyle}>
        <PlanCard
          title="游客（未注册）"
          price="免费"
          description="可以浏览公开内容，也可以直接在当前设备本地记录。"
          items={[
            "浏览发现页、公开记录和集市",
            "查看植物目录、名称和分类",
            "本机离线项目、记录和图片",
            "未来可通过直接链接查看作者公开的单张经验卡",
            "不能查看指引概要、参数或参与互动",
          ]}
        />
        <PlanCard
          title="本地免费用户"
          price="免费"
          description="注册账号，但记录仍只保存在这台设备。"
          items={[
            "拥有游客的全部浏览和本地记录能力",
            "可以查看植物指引的基础概要和少量核心参数",
            "可以在集市咨询或联系发布者",
            "项目、记录和图片保存在 App 私有存储中",
            "不能查看完整参数、完整指引或聚合种植经验",
            "不能评论、点赞、标记有帮助、关注或云端发布",
          ]}
        />
        <PlanCard
          title="云空间（首发价）"
          price="¥64 / 年｜US$8 / year"
          description="适合同步、备份、多设备使用和公开发现。"
          items={[
            "1GB 云空间",
            "云端私密空间和多设备同步",
            "记录可设为仅自己可见，也可公开发现",
            "参数、生长周期、完整指引和相关种植记录",
            "未来可创建经验卡、生成短视频和参加试用／试种",
            "评论、回复、点赞、有帮助反馈和关注",
            "集市同时“发布中”最多 30 条",
          ]}
          featured
        />
      </section>

      <section style={paymentCardStyle}>
        <div>
          <div style={sectionLabelStyle}>付款方式</div>
          <h2 style={noteTitleStyle}>当前采用人工确认开通云空间</h2>
          <p style={mutedTextStyle}>
            自动在线支付暂未接入。付款时请备注注册邮箱；管理员确认后会手动开通对应云空间期限。
          </p>
        </div>

        <div style={paymentGridStyle}>
          <div style={paymentItemStyle}>
            <div style={paymentTitleStyle}>国内用户</div>
            <div style={paymentPriceStyle}>¥64 / 年</div>
            <p style={paymentDescStyle}>
              当前通过支付宝人工付款。请先发送邮件至 {" "}
              <a href="mailto:yoyomibaobao@gmail.com" style={inlineLinkStyle}>
                yoyomibaobao@gmail.com
              </a>{" "}
              获取收款方式，邮件中请写明注册邮箱和开通方案；付款后请将付款截图发送至该邮箱。
            </p>
          </div>

          <div style={paymentItemStyle}>
            <div style={paymentTitleStyle}>海外用户</div>
            <div style={paymentPriceStyle}>US$8 / year</div>
            <p style={paymentDescStyle}>
              可通过 PayPal 付款：{" "}
              <a
                href="https://paypal.me/ying0chen/8"
                target="_blank"
                rel="noreferrer"
                style={inlineLinkStyle}
              >
                paypal.me/ying0chen/8
              </a>
              。付款时请备注注册邮箱；如果付款后未及时开通，请发送邮件至 {" "}
              <a href="mailto:yoyomibaobao@gmail.com" style={inlineLinkStyle}>
                yoyomibaobao@gmail.com
              </a>{" "}
              并附上 PayPal 付款记录。
            </p>
          </div>
        </div>

        <div style={adminContactStyle}>
          管理员邮箱：
          <a href="mailto:yoyomibaobao@gmail.com" style={inlineLinkStyle}>
            yoyomibaobao@gmail.com
          </a>
        </div>

        <div style={customStorageStyle}>
          <strong>更多空间需求：</strong>如果你有大量图片保存、长期项目归档或更高容量需求，可以通过管理员邮箱单独联系评估。大空间方案不公开展示，按实际需求确认。
        </div>
      </section>

      <section style={noteCardStyle}>
        <h2 style={noteTitleStyle}>使用规则</h2>
        <ul style={ruleListStyle}>
          <li>本地离线版免费，数据只保存在当前设备的 App 私有存储中。</li>
          <li>注册不等于上传云端；首批20名正式账号可获30MB体验额度，其他账号仍可免费使用本地功能。</li>
          <li>上传云空间不等于公开，记录可设为仅自己可见或公开发现。</li>
          <li>已有本地记录开通后默认同步为云空间私密，不会自动公开。</li>
          <li>云空间包含 1GB 容量，集市最多同时发布中 30 条；暂不提供集市加量包。</li>
          <li>当前为首发价 ¥64/年或 US$8/year，不自动续费。</li>
          <li>当前为人工确认付款并手动开通云空间；后续可再接入自动支付或应用商店内购。</li>
        </ul>
      </section>
    </main>
  );
}

function InfoItem({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div style={infoItemStyle}>
      <div style={infoLabelStyle}>{label}</div>
      <div style={infoValueStyle}>{value}</div>
      <div style={infoHintStyle}>{hint}</div>
    </div>
  );
}

function PlanCard({
  title,
  price,
  description,
  items,
  featured = false,
}: {
  title: string;
  price: string;
  description: string;
  items: string[];
  featured?: boolean;
}) {
  return (
    <article style={planCardStyle(featured)}>
      <div style={planTopStyle}>
        <h2 style={planTitleStyle}>{title}</h2>
        <div style={planPriceStyle}>{price}</div>
      </div>
      <p style={planDescStyle}>{description}</p>
      <ul style={planListStyle}>
        {items.map((item) => (
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

const heroStyle: CSSProperties = {
  marginBottom: 22,
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

const subtitleStyle: CSSProperties = {
  maxWidth: 760,
  margin: "12px 0 0",
  color: "#5d6b57",
  fontSize: 15,
  lineHeight: 1.8,
};

const cardStyle: CSSProperties = {
  border: "1px solid #dfe8d8",
  borderRadius: 20,
  background: "#fff",
  padding: 20,
  color: "#5d6b57",
};

const statusCardStyle: CSSProperties = {
  ...cardStyle,
  display: "grid",
  gap: 18,
  marginBottom: 20,
};

const trialNoticeStyle: CSSProperties = {
  ...cardStyle,
  marginBottom: 20,
  background: "#f7faf3",
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

const infoItemStyle: CSSProperties = {
  border: "1px solid #edf2e9",
  borderRadius: 16,
  background: "#fbfdf9",
  padding: 14,
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

const infoHintStyle: CSSProperties = {
  marginTop: 5,
  fontSize: 12,
  color: "#7d8b76",
  lineHeight: 1.5,
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

const disabledPrimaryButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  border: "none",
  background: "#9aa398",
  cursor: "not-allowed",
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

const planPriceStyle: CSSProperties = {
  color: "#3f7d3d",
  fontSize: 14,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const planDescStyle: CSSProperties = {
  margin: "0 0 12px",
  color: "#667260",
  fontSize: 14,
  lineHeight: 1.7,
};

const planListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  color: "#3c4638",
  fontSize: 14,
  lineHeight: 1.8,
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
