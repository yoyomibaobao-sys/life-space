import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

test("offline Owner can create only a pending-cloud project while authentication is being revalidated", () => {
  const shell = read("mobile-offline-src/main.tsx");
  assert.match(shell, /const offlineOwnerRead = !auth\.explicitSignedOut && auth\.status !== "signed-in" && Boolean\(readOwnerContext\?\.userId\)/);
  assert.match(shell, /const canCreatePendingCloud = newProjectDestination === "pending-cloud" && offlineOwnerRead && Boolean\(readOwnerContext\?\.userId\)/);
  assert.match(shell, /auth\.status !== "signed-in" && !canCreatePendingCloud/);
  assert.match(shell, /projectCreationDestinations\(online, signedIn, false, offlineOwnerRead\)/);
  assert.match(shell, /sync_destination: owner\?\.userId && destination === "pending-cloud" \? "pending-cloud" : "local-only"/);
  assert.match(shell, /destination !== "local-only"/);
});

test("reconnect keeps the verified offline Owner cache visible until the same Owner is verified", () => {
  const auth = read("lib/android-auth-state.ts");
  const shell = read("mobile-offline-src/main.tsx");
  const archivePage = read("app/archive/page.tsx");
  assert.match(archivePage, /resolveAndroidReadOwner\(getAndroidAuthSnapshot\(\)\)/);
  assert.match(archivePage, /sessionOwnerRef\.current === retainedOfflineOwner\.userId\) return/);
  assert.match(auth, /retainedOfflineReadDuringRevalidation/);
  assert.match(auth, /preserveOfflineReadOwner = true/);
  assert.match(auth, /publishChecking\("service-unavailable", false\)/);
  assert.match(auth, /transient Keystore read error does not revoke a proof already verified/);
  assert.match(auth, /if \(snapshot\.offlineReadOwner\?\.userId\) return restoreOfflineOwner\(epoch\);/);
  assert.match(shell, /const retainedOfflineOwner = !auth\.explicitSignedOut \? resolveAndroidReadOwner\(auth\) : null/);
  assert.match(shell, /auth\.status === "checking" && !retainedOfflineOwner/);
  assert.match(shell, /hasAuthenticatedIdentity = Boolean\(readOwnerContext\?\.userId\)/);
  assert.match(shell, /w5WorkspaceSources\(offlineOwnerRead \? "offline-owner-read" : auth\.status\)/);
  assert.match(shell, /const chooseSources = auth\.status === "checking" && !offlineOwnerRead/);
  assert.match(shell, /chooseProjectSources\(Boolean\(readOwnerContext\), localSpaceEnabled\)/);
});

test("pending-cloud records and cloud caches do not display the independent-local-project badge", () => {
  const recordCard = read("components/archive-detail/ArchiveRecordCard.tsx");
  const detail = read("components/archive-ui/DeviceOwnedProjectDetail.tsx");
  assert.match(recordCard, /showLocalStatus\s*\?\s*<MobileLocalRecordMetaRow statusLabel=\{localStatusLabel\} \/> : null/);
  assert.match(detail, /showLocalStatus=\{!isCloudCache && archive\.sync\?\.operation_kind !== "create-archive"\}/);
});

test("My Space identity, source and category rows share one sticky header", () => {
  const template = read("components/archive-ui/ArchiveWorkspaceTemplate.tsx");
  const shell = read("mobile-offline-src/main.tsx");
  const globals = read("app/globals.css");
  assert.match(template, /headerSlot\?: ReactNode/);
  assert.match(template, /headerSlot \? <div className="ls-sticky-workspace-header">\{headerSlot\}<\/div> : null/);
  assert.match(shell, /headerSlot=\{\s*<PersonalSpaceMobileIdentity/);
  assert.match(globals, /\.ls-sticky-workspace-controls\s*\{[\s\S]*?position: sticky/);
  assert.match(read("components/archive-ui/PersonalSpaceMobileIdentity.tsx"), /marginBottom: 2/);
});

test("category rows on discovery, experience, guide and public user-space pages remain sticky", () => {
  assert.match(read("components/discover/DiscoverFilterBar.tsx"), /filterStyles\.sticky/);
  assert.match(read("app/experience/page.tsx"), /filterStyles\.sticky/);
  assert.match(read("components/plant/GuideCategoryTabs.module.css"), /position: sticky/);
  assert.match(read("components/ui/CategoryFilterRow.module.css"), /position: sticky/);
  assert.match(read("components/user-space/UserSpaceFilters.tsx"), /className=\{styles\.sticky\}/);
  assert.match(read("components/user-space/UserSpaceFilters.module.css"), /position: sticky/);
});

test("My Space project cards keep one-line titles, visibility on row two and help below the menu", () => {
  const card = read("components/project/ProjectSummaryCard.tsx");
  const css = read("components/project/ProjectSummaryCard.module.css");
  assert.match(card, /compactOwnerHeader/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) max-content/);
  assert.match(css, /\.compactTitleGrid \.title[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap/);
  assert.match(css, /\.compactVisibilityRow\s*\{[\s\S]*?grid-row: 2/);
  assert.match(css, /\.compactHelpRow\s*\{[\s\S]*?grid-column: 2;[\s\S]*?grid-row: 2/);
});