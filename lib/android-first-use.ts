import { Capacitor, registerPlugin } from "@capacitor/core";

const WELCOME_COMPLETED_KEY = "lifespace_android_welcome_completed_v1";
const InstallHistory = registerPlugin<{ getInstallState(): Promise<{ freshInstall: boolean }> }>("InstallHistory");

export function isAndroidWelcomeEligible(input: {
  freshInstall: boolean;
  markerCompleted: boolean;
  signedIn: boolean;
  hasLocalContent: boolean;
  hasRememberedOwner: boolean;
  explicitlySignedOut: boolean;
}) {
  return input.freshInstall && !input.markerCompleted && !input.signedIn &&
    !input.hasLocalContent && !input.hasRememberedOwner && !input.explicitlySignedOut;
}

export function markAndroidWelcomeCompleted() {
  try {
    window.localStorage.setItem(WELCOME_COMPLETED_KEY, "1");
  } catch {
    // No local content is changed if browser storage is unavailable.
  }
}

export async function shouldShowAndroidWelcome(input: {
  signedIn: boolean;
  hasLocalContent: boolean;
  hasRememberedOwner: boolean;
  explicitlySignedOut: boolean;
}): Promise<boolean> {
  if (input.signedIn || input.hasLocalContent || input.hasRememberedOwner || input.explicitlySignedOut) return false;
  try {
    // An inaccessible marker is ambiguous. Protect existing installations.
    const markerCompleted = window.localStorage.getItem(WELCOME_COMPLETED_KEY) === "1";
    if (markerCompleted) return false;
    if (!Capacitor.isNativePlatform()) return false;
    const { freshInstall } = await InstallHistory.getInstallState();
    return isAndroidWelcomeEligible({ ...input, freshInstall: freshInstall === true, markerCompleted });
  } catch {
    return false;
  }
}
