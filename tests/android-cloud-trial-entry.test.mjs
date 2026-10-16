import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

test("Android cloud trial uses one in-shell entry before the identity card", () => {
  const profile = read("components/profile/AndroidProfileController.tsx");
  const view = read("components/profile/MobileProfileView.tsx");
  const entry = read("components/profile/AndroidCloudTrialEntry.tsx");
  assert.match(profile, /identityPrelude=\{signedIn && snapshot\.userId \? <AndroidCloudTrialEntry[\s\S]*?key=\{snapshot\.userId\}/);
  assert.match(view, /\{identityPrelude\}[\s\S]*?<section style=\{profileIdentityCardStyle\}>/);
  assert.match(entry, /supabase\.auth\.getUser\(\)/);
  assert.match(entry, /get_my_cloud_trial_offer/);
  assert.match(entry, /claim_my_cloud_trial/);
  assert.match(entry, /get_my_cloud_trial_server_time/);
  assert.match(entry, /AppConfirmDialog[\s\S]*?onConfirm=\{\(\) => void \(confirmKind === "end" \? endEarly\(\) : claim\(\)\)\}/);
  assert.match(entry, /end_my_cloud_trial_early/);
  assert.match(entry, /offer\.lifecycle_status !== "active"/);
  assert.match(entry, /if \(!userId \|\| !online \|\| !offer\?\.can_claim/);
  assert.doesNotMatch(entry, /Browser\.open|window\.open|life-space\.uk/);
  assert.match(entry, /开通90天云端试用/);
});

test("paid and internal accounts do not get the invitation; offline does not claim", () => {
  const entry = read("components/profile/AndroidCloudTrialEntry.tsx");
  for (const state of ["paid_membership_history", "converted_to_paid", "internal_test_account", "membership_active"]) {
    assert.ok(entry.includes(state));
  }
  assert.match(entry, /if \(!userId \|\| !online\)/);
  assert.match(entry, /if \(!userId \|\| !online \|\| !offer\?\.can_claim \|\| offer\.claimed \|\| busy\.current\) return;/);
});

test("Android My Space uses one server-timed trial notice without local copy while active", () => {
  const shell = read("mobile-offline-src/main.tsx");
  const reminder = read("components/archive-ui/AndroidCloudTrialReminder.tsx");
  assert.match(shell, /screen\.kind === "list" && auth\.status === "signed-in"[\s\S]*?<AndroidCloudTrialReminder/);
  assert.match(reminder, /get_my_cloud_trial_server_time/);
  assert.match(reminder, /active && days > 7/);
  assert.match(reminder, /offer\.lifecycle_status === "handling_period"/);
  assert.doesNotMatch(reminder, /saveCloudArchiveToLocal|claim_my_cloud_trial/);
  assert.match(shell, /data-android-cloud-access-options="true"/);
  assert.match(shell, /renderCloudAccessOptions\(\)/);
  assert.match(shell, /升级Plus会员/);
  assert.match(shell, /openCloudLogin\("membership-payment"\)/);
  assert.match(shell, /!canCreateMembershipContent\(membership\) \? renderCloudAccessOptions\(\)/);
  assert.match(shell, /cloudReadable && sourceFilter !== "local"/);
  assert.match(shell, /supabase\.rpc\("get_my_cloud_trial_offer"\)/);
  assert.match(shell, /canReadAndroidCloudWorkspace\(\{[\s\S]*?trialAccess: cloudTrialAccess/);
  assert.doesNotMatch(shell, /Date\.parse\(membership\.trial_ends_at/);
  assert.match(shell, /onChanged=\{\(\) => \{ void loadShellIdentity\(cloudUserId\); \}\}/);
  assert.match(shell, /screen\.kind === "new-project"[\s\S]*?screen\.destination === "live-cloud" \|\| screen\.destination === "pending-cloud"/);
  assert.match(shell, /data-android-shell-page="cloud-create-access"/);
  assert.match(shell, /!canCreateMembershipContent\(membership\) \? \([\s\S]*?renderCloudAccessOptions\(\)/);
});
