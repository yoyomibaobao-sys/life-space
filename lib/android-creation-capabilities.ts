export type CreationDestination = "live-cloud" | "pending-cloud" | "local-only" | "login";
export type QuickAddSource = "camera" | "gallery";
export type QuickAddDraft = {
  files: File[];
  capturedAt: (string | null)[];
  source: QuickAddSource;
  note: string;
};

export type AndroidAuthStatus = "checking" | "signed-out" | "signed-in";
export type WorkspaceSource = "all" | "cloud" | "local";

/** The server-reported trial lifecycle, never the device clock, controls expired-trial access. */
export function canReadAndroidCloudWorkspace(input: {
  auth: AndroidAuthStatus;
  userId: string | null;
  membership: { plan: string; can_create_content: boolean | null } | null;
  trialAccess: { userId: string; lifecycle: string } | null;
}): boolean {
  const { auth, userId, membership, trialAccess } = input;
  if (auth !== "signed-in" || !userId || !membership) return false;
  if (membership.can_create_content === true) return true;
  if (["basic", "large", "seller", "admin"].includes(membership.plan)) return true;
  return membership.plan === "trial" && membership.can_create_content === false &&
    trialAccess?.userId === userId && trialAccess.lifecycle === "handling_period";
}

export function workspaceSourceOptions(
  auth: AndroidAuthStatus, localSpaceEnabled: boolean, cloudReadable = true,
): WorkspaceSource[] {
  if (auth === "checking") return localSpaceEnabled ? ["local"] : [];
  if (auth !== "signed-in") return localSpaceEnabled ? ["cloud", "local"] : ["cloud"];
  return localSpaceEnabled
    ? (cloudReadable ? ["all", "cloud", "local"] : ["cloud", "local"])
    : ["cloud"];
}

export function projectCreationDestinations(online: boolean, signedIn: boolean, localSpaceEnabled = true): CreationDestination[] {
  if (!signedIn) return localSpaceEnabled ? ["local-only"] : [];
  if (!localSpaceEnabled) return online ? ["live-cloud"] : ["pending-cloud"];
  return online ? ["live-cloud", "local-only"] : ["pending-cloud", "local-only"];
}

export function chooseProjectSources(signedIn: boolean, localSpaceEnabled: boolean): Array<"cloud" | "local"> {
  const sources: Array<"cloud" | "local"> = [];
  if (signedIn) sources.push("cloud");
  if (localSpaceEnabled) sources.push("local");
  return sources;
}

export function quickAddExistingSources(online: boolean, signedIn: boolean, localSpaceEnabled = true) {
  const sources: Array<"live-cloud" | "cloud-cache" | "pending-cloud" | "local-only"> = [];
  if (signedIn) {
    if (online) sources.push("live-cloud");
    else sources.push("cloud-cache", "pending-cloud");
  }
  if (localSpaceEnabled) sources.push("local-only");
  return sources;
}
