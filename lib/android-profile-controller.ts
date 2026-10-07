import { supabase } from "@/lib/supabase";
import { loadUserProfileData } from "@/lib/user-profile-shared";
import { normalizeMembershipRpcResult } from "@/lib/membership";

export async function loadAndroidProfileLive(userId: string, client: typeof supabase = supabase) {
  const auth = await client.auth.getUser();
  if (auth.error || auth.data.user?.id !== userId) throw new Error("not_authenticated");
  const [profileData, membership, payments, admin] = await Promise.all([
    loadUserProfileData(client, userId),
    client.rpc("get_my_membership"),
    client.from("membership_payments")
      .select("id, order_number, plan, status, amount, currency, payment_method, created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
    client.rpc("is_app_admin", { p_user_id: userId }),
  ]);
  if (membership.error) throw membership.error;
  if (payments.error) throw payments.error;
  // Never grant admin UI on an RPC failure.
  return {
    profile: profileData.profile,
    stats: profileData.stats,
    membership: normalizeMembershipRpcResult(membership.data),
    payments: payments.data || [],
    isAdmin: !admin.error && admin.data === true,
  };
}
