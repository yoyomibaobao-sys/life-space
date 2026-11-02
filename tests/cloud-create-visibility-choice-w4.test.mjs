import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

const newPage = fs.readFileSync(new URL("../app/archive/new/page.tsx", import.meta.url), "utf8");
const sharedShell = fs.readFileSync(new URL("../components/archive-ui/ArchiveNewProjectFormShell.tsx", import.meta.url), "utf8");
const quickCapture = fs.readFileSync(new URL("../lib/cloud-quick-capture-record.ts", import.meta.url), "utf8");
const localNew = fs.readFileSync(new URL("../app/local/archive/new/page.tsx", import.meta.url), "utf8");
const sourceFile = ts.createSourceFile("new.tsx", newPage, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let createFn;
let publicGuardFn;
let defaultVisibilityFn;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "handleCreate") createFn = node;
  if (ts.isFunctionDeclaration(node) && node.name?.text === "canCreatePublicCloudProject") publicGuardFn = node;
  if (ts.isFunctionDeclaration(node) && node.name?.text === "resolveCloudProjectVisibility") defaultVisibilityFn = node;
  ts.forEachChild(node, visit);
}
visit(sourceFile);
assert.ok(createFn && publicGuardFn && defaultVisibilityFn, "page must expose create and membership visibility guards");
const helpers = ts.transpileModule(publicGuardFn.getText(sourceFile) + "\n" + defaultVisibilityFn.getText(sourceFile), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const { canCreatePublicCloudProject, resolveCloudProjectVisibility } = new Function(helpers + "\nreturn { canCreatePublicCloudProject, resolveCloudProjectVisibility };")();
const emitted = ts.transpileModule(createFn.getText(sourceFile), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

const plus = { user_id: "user-a", plan: "basic", status: "active", can_create_content: true, paid_until: "2099-01-01T00:00:00Z" };
const free = { user_id: "user-a", plan: "free", status: "active", can_create_content: true, paid_until: null };
function scenario({ visible, member = plus, freshMember, membershipFailure = false, ownerChanged = false,
  membershipLoading = false, failCreate = false, failRead = false, forceRowVisibility, forceRowOwner, quick = false,
  createdArchiveId = "" } = {}) {
  const state = { createdArchiveId, creating: 0, reading: 0, pushed: [], toasts: [], loading: [], captures: [], projects: [] };
  const qaUser = { id: "user-a" };
  const projectId = "123e4567-e89b-12d3-a456-426614174000";
  const selectedVisibility = visible ?? resolveCloudProjectVisibility(null, canCreatePublicCloudProject(member));
  let authCalls = 0;
  const supabase = {
    auth: { getUser: async () => ({ data: { user: ownerChanged && ++authCalls >= 2 ? { id: "user-b" } : qaUser } }) },
    async rpc(name, args) {
      if (name === "get_my_membership") return membershipFailure
        ? { data: null, error: { message: "membership unavailable" } }
        : { data: freshMember ?? member, error: null };
      assert.equal(name, "create_project");
      state.creating++;
      state.projects.push(args.p_project);
      return failCreate ? { data: null, error: { message: "QA failure" } } : { data: projectId, error: null };
    },
    from(name) {
      assert.equal(name, "archives");
      const query = { select(columns) {
        assert.equal(columns, "id,user_id,is_public,default_record_visibility");
        return query;
      }, eq(name, value) {
        if (name === "id") assert.equal(value, projectId);
        if (name === "user_id") assert.equal(value, qaUser.id);
        return query;
      }, async maybeSingle() {
        state.reading++;
        if (failRead) return { data: null, error: { message: "Read failed" } };
        return { data: { id: projectId, user_id: forceRowOwner ?? qaUser.id,
          is_public: forceRowVisibility ?? selectedVisibility,
          default_record_visibility: selectedVisibility ? "public" : "private",
        }, error: null };
      } };
      return query;
    }
  };
  const vars = {
    loading: false,
    membershipLoading,
    canCreateMembershipContent: member => member?.can_create_content === true,
    canCreatePublicCloudProject,
    normalizeMembershipRpcResult: data => Array.isArray(data) ? data[0] || null : data || null,
    membership: member,
    setMembership: updated => { state.updatedMembership = updated; },
    getCreateContentBlockedText: () => "not eligible",
    getBehaviorRestrictionErrorText: () => "",
    language: "zh",
    title: "QA synthetic project",
    category: "other",
    plantingRegion: {},
    normalizePlantingRegion: () => null,
    speciesSearch: "",
    systemName: "QA system",
    systemSearch: "",
    source: "QA only",
    note: "synthetic",
    setLoading: value => state.loading.push(value),
    supabase,
    createdArchiveId: state.createdArchiveId,
    archiveIsPublic: selectedVisibility,
    DEFAULT_RECORD_VISIBILITY: "public",
    speciesId: null,
    systemCandidates: [],
    pendingSpeciesName: null,
    setCreatedArchiveId: id => { state.createdArchiveId = id; },
    selectedPlanId: null,
    quickCaptureId: quick ? "qa-capture-id" : "",
    saveQuickCaptureAsFirstCloudRecord: async options => { state.captures.push(options); },
    CloudQuickCaptureError: class CloudQuickCaptureError extends Error {},
    showToast: value => state.toasts.push(value),
    copy: { project_name_required_error: "title", category_required_error: "category",
      system_name_required_error: "system", not_logged_in: "login", create_failed: "failed", plan_link_failed: "plan" },
    t: { record: { maintenance_record_not_saved: "maintenance" } },
    router: { push: url => state.pushed.push(url) }
  };
  const fn = new Function(...Object.keys(vars), emitted + "\nreturn handleCreate;")(...Object.values(vars));
  return { state, invoke: () => fn({ preventDefault() {} }), projectId };
}

test("untouched visibility follows current Plus, while Free starts private and manual choice persists", () => {
  assert.match(newPage, /useState<boolean \| null>\(null\)/);
  assert.equal(resolveCloudProjectVisibility(null, canCreatePublicCloudProject(plus)), true);
  assert.equal(resolveCloudProjectVisibility(null, canCreatePublicCloudProject(free)), false);
  assert.equal(resolveCloudProjectVisibility(false, canCreatePublicCloudProject(plus)), false);
  assert.equal(resolveCloudProjectVisibility(true, canCreatePublicCloudProject(free)), true);
  assert.match(newPage, /name="cloud-project-visibility" value="public"/);
  assert.match(newPage, /name="cloud-project-visibility" value="private"/);
  assert.match(newPage, /checked=\{archiveIsPublic\}/);
  assert.match(newPage, /checked=\{!archiveIsPublic\}/);
  assert.match(sharedShell, /visibilityControl\?: ReactNode/);
  assert.match(sharedShell, /\{visibilityControl\}/);
  assert.match(newPage, /notice=\{publicNeedsPlus \? plusPublicNotice/);
});

test("Free default creates private cloud project with private future records", async () => {
  const { state, invoke, projectId } = scenario({ member: free });
  await invoke();
  assert.equal(state.creating, 1);
  assert.deepEqual(state.projects.map(p => [p.is_public, p.default_record_visibility]), [[false, "private"]]);
  assert.deepEqual(state.pushed, ["/archive/" + projectId]);
  assert.equal(state.toasts.length, 0);
});

test("Free manual public choice shows Plus restriction and cannot create", async () => {
  const { state, invoke } = scenario({ member: free, visible: true });
  await invoke();
  assert.equal(state.creating, 0);
  assert.deepEqual(state.pushed, []);
  assert.match(state.toasts[0], /Plus会员/);
  assert.match(newPage, /disabled=\{membershipLoading \|\| contentBlocked \|\| publicNeedsPlus\}/);
  assert.match(newPage, /role="alert"/);
});

test("expired/refunded Plus defaults private unless the user deliberately selected public", async () => {
  for (const status of ["expired", "canceled", "past_due"]) {
    const expired = { ...plus, status, can_create_content: true };
    assert.equal(canCreatePublicCloudProject(expired), false);
    const { state, invoke } = scenario({ member: expired });
    await invoke();
    assert.equal(state.projects[0].is_public, false);
    const selected = scenario({ member: expired, visible: true });
    await selected.invoke();
    assert.equal(selected.state.creating, 0);
  }
  assert.equal(canCreatePublicCloudProject({ ...plus, paid_until: "2020-01-01" }), false);
  assert.equal(canCreatePublicCloudProject({ ...plus, can_create_content: false }), false);
  assert.equal(canCreatePublicCloudProject({ ...plus, user_id: "another" }, "user-a"), false);
});

test("refund or expiry between first load and submit rejects stale public choice", async () => {
  for (const freshMember of [free, { ...plus, status: "canceled" }, { ...plus, paid_until: "2020-01-01" }]) {
    const { state, invoke } = scenario({ member: plus, freshMember });
    await invoke();
    assert.equal(state.creating, 0);
    assert.deepEqual(state.pushed, []);
    assert.match(state.toasts[0], /Plus会员/);
  }
});

test("membership still loading, RPC failure and auth owner switch fail closed", async () => {
  for (const opts of [{ membershipLoading: true }, { membershipFailure: true }, { ownerChanged: true },
    { freshMember: { ...plus, user_id: "user-b" } }]) {
    const { state, invoke } = scenario(opts);
    await invoke();
    assert.equal(state.creating, 0);
    assert.deepEqual(state.pushed, []);
  }
});

test("server-side scoped readback rejects a foreign Owner even when the returned visibility matches", async () => {
  const { state, invoke } = scenario({ forceRowOwner: "user-b" });
  await invoke();
  assert.equal(state.creating, 1);
  assert.equal(state.reading, 1);
  assert.deepEqual(state.pushed, []);
  assert.match(state.toasts[0], /无法确认/);
});

test("default public creation writes public project and record visibility, then reads the same row", async () => {
  const { state, invoke, projectId } = scenario();
  await invoke();
  assert.equal(state.creating, 1);
  assert.equal(state.reading, 1);
  assert.equal(state.projects[0].is_public, true);
  assert.equal(state.projects[0].default_record_visibility, "public");
  assert.deepEqual(state.pushed, ["/archive/" + projectId]);
  assert.deepEqual(state.toasts, []);
});

test("explicit private creation saves both project and future records private and verifies read-back", async () => {
  const { state, invoke, projectId } = scenario({ visible: false });
  await invoke();
  assert.equal(state.creating, 1);
  assert.equal(state.reading, 1);
  assert.equal(state.projects[0].is_public, false);
  assert.equal(state.projects[0].default_record_visibility, "private");
  assert.deepEqual(state.pushed, ["/archive/" + projectId]);
});

test("RPC failure creates no client-side project and never navigates", async () => {
  const { state, invoke } = scenario({ visible: false, failCreate: true });
  await invoke();
  assert.equal(state.creating, 1);
  assert.equal(state.reading, 0);
  assert.equal(state.createdArchiveId, "");
  assert.equal(state.pushed.length, 0);
  assert.ok(state.toasts.length);
});

test("committed project with failed read-back stops navigation and retains ID to prevent duplicate creation", async () => {
  const bad = scenario({ visible: false, failRead: true });
  await bad.invoke();
  assert.equal(bad.state.creating, 1);
  assert.equal(bad.state.reading, 1);
  assert.equal(bad.state.createdArchiveId, bad.projectId);
  assert.equal(bad.state.pushed.length, 0);
  assert.match(bad.state.toasts[0], /项目已创建/);
  const retry = scenario({ visible: false, createdArchiveId: bad.state.createdArchiveId });
  await retry.invoke();
  assert.equal(retry.state.creating, 0, "same committed ID must be reused");
  assert.equal(retry.state.reading, 1);
  assert.deepEqual(retry.state.pushed, ["/archive/" + retry.projectId]);
});

test("read-back with inconsistent visibility stops before presenting the project as saved", async () => {
  const { state, invoke } = scenario({ visible: false, forceRowVisibility: true });
  await invoke();
  assert.equal(state.creating, 1);
  assert.equal(state.reading, 1);
  assert.equal(state.pushed.length, 0);
  assert.ok(state.createdArchiveId);
});

test("quick-captured first record inherits the newly selected project visibility", async () => {
  for (const visible of [true, false]) {
    const { state, invoke } = scenario({ visible, quick: true });
    await invoke();
    assert.equal(state.captures.length, 1);
    assert.equal(state.captures[0].visibility, visible ? "public" : "private");
  }
  assert.match(quickCapture, /p_visibility: visibility/);
  assert.match(newPage, /visibility: recordVisibility/);
  assert.doesNotMatch(localNew, /visibilityControl|cloud-project-visibility/);
});

test("existing project edit, member gate and mobile navigation remain separate", () => {
  const archiveDetail = fs.readFileSync(new URL("../app/archive/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(archiveDetail, /make_my_archive_public/);
  assert.match(archiveDetail, /make_my_archive_private/);
  assert.match(newPage, /canCreateMembershipContent\(membership\)/);
  assert.match(newPage, /router\.push\(\`\/archive\/\$\{archiveId\}\`\)/);
  assert.match(sharedShell, /onSubmit=\{onSubmit\}/);
});
