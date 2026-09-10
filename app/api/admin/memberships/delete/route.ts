import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { hasValidMutationOrigin, getAuthenticatedRequestClient } from "@/lib/server/authenticated-request";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DeleteMembershipBody = {
  userId?: unknown;
};

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  if (!hasValidMutationOrigin(request)) {
    return errorResponse("请求来源无效", 403);
  }

  let body: DeleteMembershipBody;

  try {
    body = (await request.json()) as DeleteMembershipBody;
  } catch {
    return errorResponse("请求格式不正确", 400);
  }

  const targetUserId = typeof body.userId === "string" ? body.userId.trim() : "";

  if (!UUID_PATTERN.test(targetUserId)) {
    return errorResponse("会员 ID 不正确", 400);
  }

  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return errorResponse("请先登录管理员账号", 401);
  const { supabase, userId } = auth;

  const { data: isAdmin, error: adminError } = await supabase.rpc("is_app_admin", {
    p_user_id: userId,
  });

  if (adminError || !isAdmin) {
    return errorResponse("没有管理员权限", 403);
  }

  if (targetUserId === userId) {
    return errorResponse("不能停用当前管理员自己", 400);
  }

  const adminClient = getSupabaseAdmin();
  const { data: targetAdmin, error: targetAdminError } = await adminClient.rpc("is_app_admin", { p_user_id: targetUserId });
  if (targetAdminError) return errorResponse("无法核对目标账号权限", 500);
  if (targetAdmin) return errorResponse("管理员账号不能停用会员权益", 400);
  const { data: membership, error: membershipError } = await adminClient
    .from("user_memberships")
    .select("user_id, plan, status, trial_started_at")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (membershipError) {
    return errorResponse("读取会员状态失败", 500);
  }

  if (!membership) {
    return errorResponse("该账号没有会员权益，若需删除账号请使用永久注销", 404);
  }

  if (membership.plan === "admin") {
    return errorResponse("管理员账号不能停用会员权益", 400);
  }

  if (membership.status === "canceled") {
    return NextResponse.json({
      ok: true,
      membership,
    });
  }

  const nowDate = new Date();
  const trialStartedAt = membership.trial_started_at ? new Date(String(membership.trial_started_at)) : null;
  const now = nowDate.toISOString();
  const safeTrialEndsAt =
    trialStartedAt && !Number.isNaN(trialStartedAt.getTime()) && trialStartedAt > nowDate
      ? trialStartedAt.toISOString()
      : now;
  const { data: updatedMembership, error: updateError } = await adminClient
    .from("user_memberships")
    .update({
      status: "canceled",
      paid_until: now,
      trial_ends_at: safeTrialEndsAt,
    })
    .eq("user_id", targetUserId)
    .select("user_id, plan, status, trial_ends_at, paid_until, storage_limit_bytes, base_market_post_limit")
    .single();

  if (updateError) {
    return errorResponse("停用会员权益失败", 500);
  }

  return NextResponse.json({
    ok: true,
    membership: updatedMembership,
  });
}
