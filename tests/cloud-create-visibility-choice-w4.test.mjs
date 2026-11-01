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
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "handleCreate") createFn = node;
  ts.forEachChild(node, visit);
}
visit(sourceFile);
assert.ok(createFn, "handleCreate must remain a normal function from the existing page");
const emitted = ts.transpileModule(createFn.getText(sourceFile), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function scenario({ visible = true, failCreate = false, failRead = false, forceRowVisibility, quick = false,
  createdArchiveId = "", readRetry = false } = {}) {
  const state = { createdArchiveId, creating: 0, reading: 0, pushed: [], toasts: [], loading: [], captures: [], projects: [] };
  const qaUser = { id: "user-a" };
  const projectId = "123e4567-e89b-12d3-a456-426614174000";
  const supabase = {
    auth: { getUser: async () => ({ data: { user: qaUser } }) },
    async rpc(name, args) {
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
        return { data: { id: projectId, user_id: qaUser.id,
          is_public: forceRowVisibility ?? visible,
          default_record_visibility: visible ? "public" : "private",
        }, error: null };
      } };
      return query;
    }
  };
  const vars = {
    loading: false,
    canCreateMembershipContent: () => true,
    membership: { plan: "Plus" },
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
    archiveIsPublic: visible,
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

test("default cloud creation visibly starts public and includes a private radio alternative", () => {
  assert.match(newPage, /const DEFAULT_ARCHIVE_IS_PUBLIC = true/);
  assert.match(newPage, /useState\(DEFAULT_ARCHIVE_IS_PUBLIC\)/);
  assert.match(newPage, /name="cloud-project-visibility" value="public"/);
  assert.match(newPage, /name="cloud-project-visibility" value="private"/);
  assert.match(newPage, /checked=\{archiveIsPublic\}/);
  assert.match(newPage, /checked=\{!archiveIsPublic\}/);
  assert.match(sharedShell, /visibilityControl\?: ReactNode/);
  assert.match(sharedShell, /\{visibilityControl\}/);
  assert.match(newPage, /notice=\{archiveIsPublic \? copy\.cloud_notice/);
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
