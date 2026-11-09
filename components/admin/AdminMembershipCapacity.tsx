"use client";
import type { CSSProperties } from "react";
export type EffectiveMembershipMetrics = {
  membership_contract_version?: string;
  free_members?: number | string | null;
  plus_members?: number | string | null;
  quota_mismatch_count?: number | string | null;
};
function count(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed=Number(value);
  return Number.isSafeInteger(parsed) && parsed>=0 ? parsed : null;
}
export default function AdminMembershipCapacity({metrics,language,loading,error}: {
  metrics: EffectiveMembershipMetrics | null; language: "zh"|"en"; loading:boolean; error:string;
}) {
  const free=count(metrics?.free_members),plus=count(metrics?.plus_members),mismatch=count(metrics?.quota_mismatch_count);
  const ready=metrics?.membership_contract_version==="free-plus-v1" && free!==null && plus!==null && mismatch!==null;
  const zh=language==="zh";
  return <>
    <h2>{zh?"会员与容量统计":"Membership and storage"}</h2>
    <p>{zh?"Free永久30MB，集市5条；Plus 1GB，集市30条。":"Free: permanent 30MB and 5 marketplace posts. Plus: 1GB and 30 posts."}</p>
    {loading?<p role="status">{zh?"正在读取统计…":"Loading statistics…"}</p>
      :error?<p role="alert">{error}</p>
      :!ready?<p role="alert">{zh?"会员统计暂未就绪，请稍后重试。":"Membership statistics are not ready. Please retry."}</p>
      :<dl style={grid}>
        <div><dt>{zh?"普通注册用户（Free）":"Registered users (Free)"}</dt><dd>{free}</dd></div>
        <div><dt>{zh?"有效Plus":"Active Plus"}</dt><dd>{plus}</dd></div>
        <div><dt>{zh?"存量权益差异":"Stored entitlement differences"}</dt><dd>{mismatch}</dd></div>
      </dl>}
    {ready && mismatch!==null && mismatch>0?<p role="status">{zh?"部分账号保存的旧额度与当前有效权益不同，需逐项核对。":"Some stored quotas differ from current effective benefits and require review."}</p>:null}
  </>;
}
const grid:CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:16};
