import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const shell = readFileSync(new URL("../mobile-offline-src/main.tsx", import.meta.url), "utf8");
const lightbox = readFileSync(new URL("../components/archive-detail/ArchiveLightbox.tsx", import.meta.url), "utf8");
const safCore = readFileSync(new URL("../lib/local-saf-core.ts", import.meta.url), "utf8");
const offlineDb = readFileSync(new URL("../lib/local-offline-db.ts", import.meta.url), "utf8");

test("offline cold start cannot apply an older list read over the verified account", () => {
  const loadList = shell.slice(shell.indexOf("const loadList = useCallback"), shell.indexOf("const loadCloudList"));
  assert.match(loadList, /listRequestRef/);
  assert.match(loadList, /authenticatedOwnerRef\.current/);
  assert.match(loadList, /if \(requestId !== listRequestRef\.current\) return/);
  assert.match(loadList, /if \(\(privateContext\?\.userId \|\| null\) !== currentPrivateId\) return/);
  assert.match(loadList, /privateContext[\s\S]*listVisibleCloudOfflineArchiveSummaries\(privateContext\)/);
  assert.match(loadList, /privateContext[\s\S]*listPendingCloudSyncSummaries\(privateContext\)/);
  assert.match(loadList, /setCloudCaches\(cachedCloud\)/);
  assert.match(loadList, /setPendingSync\(pending\)/);
  assert.doesNotMatch(loadList, /authenticatedOwnerContext,/);
});

test("a durable local create survives a later SAF revision conflict without a second project", () => {
  const form = shell.slice(shell.indexOf("function ProjectForm("), shell.indexOf("function RecordForm("));
  assert.match(form, /durableCreateRef/);
  assert.match(form, /durableCreateRef\.current \|\| await createLocalArchive/);
  assert.match(form, /durableCreateRef\.current = created/);
  const saved = shell.slice(shell.indexOf("onSaved={async (archive) => {"), shell.indexOf("onLiveSaved"));
  assert.match(saved, /SAF revision conflict\./);
  assert.match(saved, /SAF concurrent revision conflict\./);
  assert.match(saved, /setScreen\(\{ kind: "detail", archiveId: archive\.id \}\)/);
  assert.match(offlineDb, /isSafRevisionConflict\(error\)/);
  assert.match(offlineDb, /return connectedCloudSafState\(ownerUserId, attempt \+ 1\)/);
  assert.match(safCore, /advanceCommitEpoch\(storage\)/);
  assert.match(safCore, /readSafCommittedUnshared\(storage, baselineEpoch, currentCommitEpoch\(storage\)\)/);
});

test("image save return does not rebuild live cloud detail during connectivity checking", () => {
  const runtime = shell.slice(shell.indexOf("function CloudProjectRuntime("), shell.indexOf("function CloudLogin("));
  assert.match(runtime, /useAndroidConnectivityStatus\(\)/);
  assert.match(runtime, /connectivity\.status === "offline" && !imageFullscreenOpen/);
  assert.match(runtime, /imageFullscreenOpen \|\| connectivity\.status === "checking"[\s\S]*\? presentationOnline\.current/);
  assert.match(runtime, /showLiveCloud/);
  assert.match(shell, /function readMobileOverlayOpen\(\)/);
  const controller = readFileSync(new URL("../components/archive-ui/CloudArchiveDetailController.tsx", import.meta.url), "utf8");
  assert.match(controller, /isAndroidOnline\(\)/);
  assert.doesNotMatch(
    shell.slice(shell.indexOf("<CloudProjectRuntime"), shell.indexOf("archiveId={screen.archiveId}")),
    /\$\{online\}/,
  );
  assert.match(shell, /visibilityState === "hidden"/);
  assert.match(lightbox, /visibilityState === "hidden"/);
  assert.match(lightbox, /__archiveLightbox: true/);
  assert.match(lightbox, /delete rest\.__archiveLightbox/);
  assert.match(lightbox, /window\.history\.back\(\)/);
  assert.doesNotMatch(runtime, /if \(online\) return <CloudArchiveDetailController/);
});

test("a failed probe keeps the open image readable and refuses cloud trash until online", () => {
  const runtime = shell.slice(shell.indexOf("function CloudProjectRuntime("), shell.indexOf("function CloudLogin("));
  assert.match(runtime, /imageFullscreenOpen \|\| connectivity\.status === "checking"[\s\S]*\? presentationOnline\.current/);
  assert.match(runtime, /if \(showLiveCloud\) return <CloudArchiveDetailController/);
  const controller = readFileSync(new URL("../components/archive-ui/CloudArchiveDetailController.tsx", import.meta.url), "utf8");
  const guarded = controller.slice(controller.indexOf("async function change("), controller.indexOf("async function patchArchive("));
  assert.match(guarded, /!isAndroidOnline\(\)\) return/);
  const deleteMedia = controller.slice(controller.indexOf("onDeleteMedia="), controller.indexOf("onAddMedia="));
  assert.match(deleteMedia, /if \(!isAndroidOnline\(\) \|\| !await requestCloudTrash\("media", mediaId\)\) throw new Error\(recordCopy\.delete_failed\)/);
  const deleteImage = controller.slice(controller.indexOf("onDeleteCurrentImage:"), controller.indexOf("onChange:"));
  assert.match(deleteImage, /if \(!isAndroidOnline\(\) \|\| !image\.id \|\| !await requestCloudTrash\("media", image\.id\)\) throw new Error\(recordCopy\.delete_failed\)/);
  assert.match(deleteImage, /setLightbox/);
  const archiveTrash = controller.slice(controller.indexOf("open={trashConfirmOpen}"), controller.indexOf("</>;"));
  assert.match(archiveTrash, /requestCloudTrash\("archives", archiveId\)/);
  assert.match(archiveTrash, /change\(async \(\) => \{[\s\S]*requestCloudTrash\("archives", archiveId\)[\s\S]*\}, false\)/);
  assert.match(lightbox, /setTrashConfirmOpen\(false\)/);
  assert.match(lightbox, /async function saveCurrentImage\(\)/);
  assert.match(lightbox, /saveViewedImage\(current\.url, current\.id\)/);
});

test("closing an offline image does not replay a historical add-record request", () => {
  const runtime = shell.slice(shell.indexOf("function CloudProjectRuntime("), shell.indexOf("function CloudLogin("));
  const handoff = runtime.slice(runtime.indexOf("const lastAddRecordRequest"), runtime.indexOf("if (!authenticatedOwnerContext?.userId)"));
  assert.match(handoff, /useRef\(addRecordRequest\)/);
  assert.match(handoff, /if \(showLiveCloud\) \{\s*lastAddRecordRequest\.current = addRecordRequest;\s*return;\s*\}/);
  assert.match(handoff, /status !== "ready" \|\| !cached \|\| !addRecordRequest \|\| addRecordRequest === lastAddRecordRequest\.current/);
  assert.match(handoff, /onAddRecord\(cached\.archive\.id\)/);
  assert.match(shell, /setDetailAddRecordRequest\(\(current\) => \(\{ archiveId: screen\.archiveId, nonce: \(current\?\.nonce \|\| 0\) \+ 1 \}\)\)/);
  const controller = readFileSync(new URL("../components/archive-ui/CloudArchiveDetailController.tsx", import.meta.url), "utf8");
  assert.match(controller, /const lastAddRecordRequest = useRef\(addRecordRequest\)/);
  assert.match(controller, /if \(!addRecordRequest \|\| addRecordRequest === lastAddRecordRequest\.current\) return/);
  assert.match(controller, /setAddOpen\(true\)/);
});

test("system back can pop while the visible shell screen is already the list root", () => {
  const listener = shell.slice(shell.indexOf("CapacitorApp.addListener(\"backButton\""), shell.indexOf("const [owner, setOwner]"));
  assert.match(listener, /window\.history\.length > 1 && \(overlayOpen \|\| canPopShell\)\) window\.history\.back\(\)/);
  assert.doesNotMatch(listener, /screenRef\.current\.kind|kind === "list"/);
  const goList = shell.slice(shell.indexOf("function goList("), shell.indexOf("async function reconnect("));
  assert.match(goList, /setScreen\(\{ kind: "list" \}\)/);
  assert.doesNotMatch(goList, /setScreen\(\{ kind: "list" \}, true\)/);
});

test("Android system back pops shell history and does not consume the key in the WebView", () => {
  const listener = shell.slice(shell.indexOf("const back = (event: PopStateEvent)"), shell.indexOf("const [owner, setOwner]"));
  assert.match(listener, /CapacitorApp\.addListener\("backButton"/);
  assert.match(listener, /mobileOverlayOpen === "true"/);
  assert.match(listener, /history\.state\?\.offlineScreen/);
  assert.match(listener, /history\.length > 1 && \(overlayOpen \|\| canPopShell\)\) window\.history\.back\(\)/);
  assert.match(listener, /visibilityState === "hidden"/);
  assert.doesNotMatch(listener, /App\.exitApp|location\.replace|router\.replace/);
  assert.match(shell, /onBack=\{\(\) => goBackInShell\(\{ kind: "list" \}\)\}/);
  assert.match(shell, /onBack=\{returnToProfile\}/);
  const webView = readFileSync(new URL("../android/app/src/main/java/com/youshi/cultivation/NoExtractUiCapacitorWebView.java", import.meta.url), "utf8");
  const guard = readFileSync(new URL("../android/app/src/main/java/com/youshi/cultivation/LoginFillUiGuard.java", import.meta.url), "utf8");
  assert.doesNotMatch(webView, /KEYCODE_BACK/);
  assert.doesNotMatch(guard, /KEYCODE_BACK|onBackPressed/);
});

test("a long Android profile username wraps instead of covering the email", () => {
  const presentation = readFileSync(new URL("../components/profile/MobileProfilePresentation.tsx", import.meta.url), "utf8");
  const details = presentation.slice(
    presentation.indexOf("export const profileIdentityDetailsStyle"),
    presentation.indexOf("export const profileIdentityUsernameButtonStyle"),
  );
  const username = presentation.slice(
    presentation.indexOf("export const androidProfileIdentityUsernameStyle"),
    presentation.indexOf("export const androidProfileIdentityEmailStyle"),
  );
  const email = presentation.slice(
    presentation.indexOf("export const androidProfileIdentityEmailStyle"),
    presentation.indexOf("export const profileIdentityMembershipStyle"),
  );
  assert.match(details, /gridTemplateRows: "minmax\(30px, auto\) auto auto"/);
  assert.match(username, /minWidth: 0/);
  assert.match(username, /height: "auto"/);
  assert.match(username, /whiteSpace: "normal"/);
  assert.match(username, /overflowWrap: "anywhere"/);
  assert.match(username, /fontSize: 19/);
  assert.match(username, /maxWidth: "calc\(100% - 74px\)"/);
  assert.doesNotMatch(username, /height: 30/);
  assert.match(email, /overflowWrap: "anywhere"/);
  assert.match(email, /fontSize: 13/);
  const controller = readFileSync(new URL("../components/profile/AndroidProfileController.tsx", import.meta.url), "utf8");
  const identity = controller.slice(controller.indexOf("identityTop={<>"), controller.indexOf("identityAfterStats"));
  assert.match(identity, /androidProfileIdentityUsernameStyle[\s\S]*androidProfileIdentityEmailStyle[\s\S]*profileIdentityMembershipStyle/);
});

test("completed login and new-project flows remove the screens that led into them", () => {
  const login = shell.slice(shell.indexOf("onSuccess={(userId) => {"), shell.indexOf("screen.kind === \"register\""));
  assert.match(login, /finishCompletedFlow\(COMPLETED_LOGIN_FLOW_KINDS/);
  assert.doesNotMatch(login, /history\.go\(0\)|replaceState\(\{\}, \"\"\)/);
  const savedAt = shell.indexOf("onSaved={async (archive) => {");
  const created = shell.slice(savedAt, shell.indexOf("onLiveSaved", savedAt));
  assert.match(created, /finishCompletedFlow\(COMPLETED_PROJECT_FLOW_KINDS, "detail"/);
  assert.match(created, /finishCompletedFlow\(COMPLETED_PROJECT_FLOW_KINDS, "new-record"/);
  const live = shell.slice(shell.indexOf("onLiveSaved={async (id) => {"), shell.indexOf("screen.kind === \"detail\"", shell.indexOf("onLiveSaved={async (id) => {")));
  assert.match(live, /finishCompletedFlow\(COMPLETED_PROJECT_FLOW_KINDS, "cloud-detail"/);
  const cancel = shell.slice(shell.indexOf("onCancel={() => quickAddDraft"), shell.indexOf("onSaved={async (archive) => {"));
  assert.doesNotMatch(cancel, /finishCompletedFlow/);
  const loginBack = shell.slice(shell.indexOf("screen.kind === \"cloud-login\""), shell.indexOf("onSuccess={(userId) => {"));
  assert.match(loginBack, /goBackInShell\(\{ kind: "list" \}\)/);
  assert.doesNotMatch(loginBack, /finishCompletedFlow/);
  const back = shell.slice(shell.indexOf("CapacitorApp.addListener(\"backButton\""), shell.indexOf(".then(", shell.indexOf("CapacitorApp.addListener(\"backButton\"")));
  assert.doesNotMatch(back, /exitApp|goList\(\)/);
});

test("native market cover and rollback use the matching API origin", () => {
  const helper = readFileSync(new URL("../lib/market-media-storage.ts", import.meta.url), "utf8");
  const native = helper.slice(helper.indexOf("async function requestNativeMarketMutation"), helper.indexOf("async function requestMarketMutation"));
  assert.match(native, /resolveMatchingCloudOrigin\(\)/);
  assert.match(native, /origin === "https:\/\/life-space\.uk"/);
  assert.match(native, /requestAndroidRemoteApi/);
  assert.match(native, /CapacitorHttp\.request/);
  assert.match(native, /responseUrl\.origin !== origin/);
  assert.match(helper, /if \(Capacitor\.isNativePlatform\(\)\) return await requestNativeMarketMutation/);
  assert.match(helper, /credentials: "same-origin"/);
  const page = readFileSync(new URL("../app/market/new/page.tsx", import.meta.url), "utf8");
  assert.match(page, /setMarketPostCover/);
  assert.match(page, /requestMarketPostDeletion\(postId\)/);
  assert.doesNotMatch(page, /repost|publishAgain|createMarketPost\(/);
});

test("a saved cloud record refreshes the project list without letting an older summary win", () => {
  const list = shell.slice(shell.indexOf("const loadCloudList = useCallback"), shell.indexOf("const loadDetail = useCallback"));
  assert.match(list, /cloudListRequestRef/);
  assert.match(list, /if \(requestId !== cloudListRequestRef\.current\) return/);
  assert.match(list, /if \(requestId === cloudListRequestRef\.current\) setCloudLoading\(false\)/);
  const detail = shell.slice(shell.indexOf("onCacheChanged={async () => {"), shell.indexOf("onAddRecord={(id) =>"));
  assert.match(detail, /await loadList\(authenticatedOwnerContext\)/);
  assert.match(detail, /await loadCloudList\(authenticatedOwnerContext\?\.userId\)/);
  const controller = readFileSync(new URL("../components/archive-ui/CloudArchiveDetailController.tsx", import.meta.url), "utf8");
  assert.match(controller, /onRecordCreated=\{async \(\) => \{ await reload\(\); setAddOpen\(false\); onRecordCreated\?\.\(\); await onCacheChanged\(\); \}\}/);
});
