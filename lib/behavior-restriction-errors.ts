import type { Language } from "@/lib/i18n";

export function getBehaviorRestrictionErrorText(
  error: unknown,
  language: Language = "zh"
): string | null {
  const message =
    typeof error === "object" && error && "message" in error
      ? String(error.message || "")
      : String(error || "");

  if (!message.includes("behavior_permission_restricted:")) return null;

  const permissionKey = message.split("behavior_permission_restricted:")[1]?.split(/[\s,;]+/)[0] || "";
  if (permissionKey === "comment") {
    return language === "en"
      ? "Your account is currently restricted from commenting. New or edited comments are unavailable until an administrator manually releases this restriction."
      : "当前账号的评论权限已被管理员限制，管理员人工解除前无法新增或修改评论。";
  }
  if (permissionKey === "public_publish") {
    return language === "en"
      ? "Your account is currently restricted from public publishing. Private projects and private records remain available."
      : "当前账号的公开发布权限已被管理员限制；仍可创建私密项目和私密记录。";
  }
  if (permissionKey === "market_publish") {
    return language === "en"
      ? "Your account is currently restricted from publishing marketplace posts. An administrator must manually release this restriction before you can publish or republish."
      : "当前账号的集市发布权限已被管理员限制，管理员人工解除前无法新发或重新发布集市信息。";
  }
  return language === "en"
    ? "This behavior permission is currently restricted by an administrator."
    : "该项行为权限目前受到管理员限制。";
}
