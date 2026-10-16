import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  COMPLETED_LOGIN_FLOW_KINDS,
  COMPLETED_PROJECT_FLOW_KINDS,
  applyCompletedShellFlow,
  describeShellHistoryPush,
  marketDetailBackPopsToList,
  planCompletedShellFlow,
} from "../lib/android-shell-history.ts";

function applyPush(stack, liveScreen, next, scrollY) {
  const current = stack[stack.length - 1] || null;
  const step = describeShellHistoryPush({
    replace: false,
    current,
    liveScreen,
    next,
    scrollY,
  });
  assert.equal(step.mode, "push");
  const replaced = stack.length
    ? [...stack.slice(0, -1), step.replaceCurrent]
    : [step.replaceCurrent];
  return [...replaced, step.pushed];
}

test("system back from a market post returns to the market list, not an earlier guide tab", () => {
  let live = { kind: "list" };
  let stack = applyPush([], live, { kind: "guides" }, 0);
  live = { kind: "guides" };
  stack = applyPush(stack, live, { kind: "market" }, 80);
  live = { kind: "market" };
  // The click listener may still have closed over the guide tab.
  const staleScreen = { kind: "guides" };
  assert.notEqual(staleScreen.kind, live.kind);
  stack = applyPush(stack, live, { kind: "market-detail", id: "post-1" }, 80);
  live = { kind: "market-detail", id: "post-1" };

  const previous = stack[stack.length - 2];
  assert.equal(previous.offlineScreen.kind, "market");
  assert.equal(previous.scrollY, 80);
  assert.equal(marketDetailBackPopsToList("market"), true);

  stack = stack.slice(0, -1);
  live = stack[stack.length - 1].offlineScreen;
  assert.equal(live.kind, "market");
  assert.equal(stack.filter((entry) => entry.offlineScreen.kind === "market-detail").length, 0);

  stack = applyPush(stack, live, { kind: "market-detail", id: "post-1" }, 80);
  stack = stack.slice(0, -1);
  assert.equal(stack[stack.length - 1].offlineScreen.kind, "market");
  assert.notEqual(stack[stack.length - 1].offlineScreen.kind, "guides");
});

test("leaving the market composer still has an explicit list destination", () => {
  assert.equal(marketDetailBackPopsToList("market-new"), false);
  assert.equal(marketDetailBackPopsToList(null), false);
});

test("the Android shell records the live screen and pops market detail back to the list", () => {
  const shell = fs.readFileSync("mobile-offline-src/main.tsx", "utf8");
  assert.match(shell, /const leaving = screenRef\.current/);
  assert.match(shell, /liveScreen: leaving/);
  assert.match(shell, /marketDetailBackPopsToList\(marketDetailSourceKindRef\.current\)/);
  assert.match(shell, /goBackInShell\(\{ kind: "market" \}\)/);
  assert.match(shell, /hidden=\{screen\.kind !== "market"\}/);
  assert.match(shell, /screen\.kind === "market" \|\| screen\.kind === "market-detail"/);
});

test("a finished login or new project drops its own earlier screens and keeps the pages before them", () => {
  const login = applyCompletedShellFlow(
    [{ kind: "list" }, { kind: "activity" }, { kind: "welcome" }, { kind: "cloud-login" }],
    { kind: "profile" },
    COMPLETED_LOGIN_FLOW_KINDS,
  );
  assert.deepEqual(login.next.map((entry) => entry.kind), ["list", "activity", "profile"]);
  assert.equal(login.plan.go, -2);
  assert.equal(login.plan.replace, false);
  assert.ok(login.plan.go >= 1 - 4);

  const rooted = applyCompletedShellFlow(
    [{ kind: "welcome" }, { kind: "register" }, { kind: "cloud-login" }],
    { kind: "list" },
    COMPLETED_LOGIN_FLOW_KINDS,
  );
  assert.deepEqual(rooted.next.map((entry) => entry.kind), ["list"]);
  assert.equal(rooted.plan.go, -2);
  assert.equal(rooted.plan.replace, true);
  assert.equal(planCompletedShellFlow(rooted.next, "list", COMPLETED_LOGIN_FLOW_KINDS).go, 0);

  const samePage = applyCompletedShellFlow(
    [{ kind: "list" }, { kind: "profile" }, { kind: "cloud-login" }],
    { kind: "profile" },
    COMPLETED_LOGIN_FLOW_KINDS,
  );
  assert.deepEqual(samePage.next.map((entry) => entry.kind), ["list", "profile"]);

  const created = applyCompletedShellFlow(
    [{ kind: "guides" }, { kind: "project-destination" }, { kind: "new-project" }],
    { kind: "cloud-detail", archiveId: "project-1" },
    COMPLETED_PROJECT_FLOW_KINDS,
  );
  assert.deepEqual(created.next.map((entry) => entry.kind), ["guides", "cloud-detail"]);
  assert.equal(created.next[1].archiveId, "project-1");
  assert.equal(created.plan.go, -2);

  const cancelled = [{ kind: "list" }, { kind: "project-destination" }, { kind: "new-project" }].slice(0, -1);
  assert.equal(cancelled.at(-1).kind, "project-destination");
  const abandonedLogin = [{ kind: "list" }, { kind: "welcome" }, { kind: "cloud-login" }].slice(0, -1);
  assert.equal(abandonedLogin.at(-1).kind, "welcome");
});
