"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { formatStorage } from "@/lib/user-profile-shared";
import {
  formatMembershipDate,
  getMembershipEndDate,
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
        setErrorMsg("暂时无法读取你的试用与额度信息，请稍后再试。");
      } else {
        setMembership(normalizeMembershipRpcResult(data));
      }

      setLoading(false);
    }

    void loadMembership();
  }, []);

  const endDate = getMembershipEndDate(membership);
  const storageLimitText = useMemo(() => {
    if (!membership?.storage_limit_bytes) return "暂无";
    return formatStorage(Number(membership.storage_limit_bytes));
  }, [membership?.storage_limit_bytes]);

  const marketQuotaText = membership
    ? `${Number(membership.market_post_limit || 0)} 条同时在线`
    : "暂无";

  return (
    <main style={pageStyle}>
      <section style={heroStyle}>
        <div style={eyebrowStyle}>年度使用权</div>
        <h1 style={titleStyle}>小额年费，维持长期记录</h1>
        <p style={subtitleStyle}>
          有时·耕作采用免费试用 + 小额年费的方式。试用结束后，已有内容仍可查看、导出和删除；继续新增记录、上传照片或发布集市信息，需要开通年度使用权。
        </p>
      </section>

      {loading ? (
        <section style={cardStyle}>正在读取当前使用状态...</section>
      ) : userEmail ? (
        <section style={statusCardStyle}>
          <div>
            <div style={sectionLabelStyle}>当前账号</div>
            <h2 style={sectionTitleStyle}>{userEmail}</h2>
            <p style={mutedTextStyle}>{errorMsg || getMembershipSummary(membership)}</p>
          </div>

          <div style={statusGridStyle}>
            <InfoItem label="当前方案" value={membership ? getMembershipPlanLabel(membership.plan) : "暂无"} hint={membership ? getMembershipStatusLabel(membership.status) : "暂无"} />
            <InfoItem label="有效期至" value={formatMembershipDate(endDate)} hint="到期前可继续使用对应权限" />
            <InfoItem label="云端容量" value={storageLimitText} hint="主要用于照片与媒体文件" />
            <InfoItem label="集市发布" value={marketQuotaText} hint="同时在线发布数量" />
          </div>

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
            <h2 style={sectionTitleStyle}>注册后开始免费试用</h2>
            <p style={mutedTextStyle}>
              未注册用户可浏览公开内容。注册后可创建项目、添加记录和上传照片，并开始 6 个月免费试用。
            </p>
          </div>

          <div style={actionRowStyle}>
            <Link href="/register" style={primaryButtonStyle}>
              注册试用
            </Link>
            <Link href="/login" style={secondaryButtonStyle}>
              已有账号登录
            </Link>
          </div>
        </section>
      )}

      <section style={plansGridStyle}>
        <PlanCard
          title="免费试用"
          price="6 个月"
          description="适合刚开始记录的用户，先完整体验项目档案、时间线、照片和集市基础发布。"
          items={[
            "注册后自动开始试用",
            "云端容量 300MB",
            "集市同时在线 3 条",
            "可创建项目、添加记录和上传照片",
          ]}
        />
        <PlanCard
          title="基础年费"
          price="小额年费"
          description="适合长期使用。费用用于维持云端存储、网页打开和基础集市发布。"
          items={[
            "基础云端容量 1GB",
            "集市同时在线 10 条",
            "可继续新增项目、记录和照片",
            "不续费仍可查看、导出和删除已有内容",
          ]}
          featured
        />
        <PlanCard
          title="集市加量包"
          price="按月加购"
          description="适合某段时间集中交换、赠送、转让或求购的用户。"
          items={[
            "基础年费用户可加购",
            "按月增加集市发布数量",
            "适合季节性集中发布",
            "长期大量经营性发布以后进入商家版",
          ]}
        />
      </section>

      <section style={noteCardStyle}>
        <h2 style={noteTitleStyle}>使用规则</h2>
        <ul style={ruleListStyle}>
          <li>未注册用户只浏览公开内容。</li>
          <li>注册后开始免费试用，试用期内可新增项目、记录、照片和少量集市发布。</li>
          <li>试用期满或年费到期后，仍可查看、导出和删除已有内容。</li>
          <li>继续新增记录、上传照片或发布集市信息，需要开通年度使用权。</li>
          <li>支付功能暂未接入，当前页面先用于说明规则和承接入口。</li>
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
