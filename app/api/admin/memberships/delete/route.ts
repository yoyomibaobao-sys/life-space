import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseServer } from "@/lib/supabaseServer";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DeleteMembershipBody = {
  userId?: unknown;
};

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
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

  const supabase = await getSupabaseServer();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return errorResponse("请先登录管理员账号", 401);
  }

  const { data: isAdmin, error: adminError } = await supabase.rpc("is_app_admin", {
    p_user_id: user.id,
  });

  if (adminError || !isAdmin) {
    return errorResponse("没有管理员权限", 403);
  }

  if (targetUserId === user.id) {
    return errorResponse("不能删除当前管理员自己", 400);
  }

  const adminClient = getSupabaseAdmin();
  const { data: membership, error: membershipError } = await adminClient
    .from("user_memberships")
    .select("user_id, plan, status, trial_started_at")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (membershipError) {
    return errorResponse("读取会员状态失败", 500);
  }

  if (!membership) {
    return errorResponse("会员不存在", 404);
  }

  if (membership.plan === "admin") {
    return errorResponse("管理员账号不能通过删除会员按钮处理", 400);
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
    return errorResponse("删除会员失败", 500);
  }

  return NextResponse.json({
    ok: true,
    membership: updatedMembership,
  });
}
