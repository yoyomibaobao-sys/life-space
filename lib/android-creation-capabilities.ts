export type CreationDestination = "live-cloud" | "pending-cloud" | "local-only" | "login";
export type QuickAddSource = "camera" | "gallery";
export type QuickAddDraft = {
  files: File[];
  capturedAt: (string | null)[];
  source: QuickAddSource;
  note: string;
};

export function projectCreationDestinations(online: boolean, signedIn: boolean): CreationDestination[] {
  if (!signedIn) return online ? ["local-only", "login"] : ["local-only"];
  return online ? ["live-cloud", "local-only"] : ["pending-cloud", "local-only"];
}

export function quickAddExistingSources(online: boolean, signedIn: boolean) {
  return signedIn ? online ? ["live-cloud", "local-only"] : ["cloud-cache", "pending-cloud", "local-only"]
    : ["local-only"];
}
