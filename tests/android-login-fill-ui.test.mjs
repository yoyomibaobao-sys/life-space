import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const webView = fs.readFileSync(
  "android/app/src/main/java/com/youshi/cultivation/NoExtractUiCapacitorWebView.java",
  "utf8",
);
const guard = fs.readFileSync(
  "android/app/src/main/java/com/youshi/cultivation/LoginFillUiGuard.java",
  "utf8",
);
const activity = fs.readFileSync(
  "android/app/src/main/java/com/youshi/cultivation/MainActivity.java",
  "utf8",
);

test("login-only fill popup guard tracks edits without rewriting keys or touching other pages", () => {
  assert.match(webView, /Looper\.getMainLooper\(\)/);
  assert.match(webView, /url\.endsWith\("#cloud-login"\)/);
  assert.match(webView, /if \(!isCloudLoginPage\(\)\) return false/);
  assert.match(webView, /inputConnection != null && isCloudLoginPage\(\)/);
  assert.match(webView, /return super\.sendKeyEvent\(event\)/);
  assert.doesNotMatch(webView, /deleteSurroundingText\(1, 0\)|commitText\("", 1\)|showSoftInput|onWindowFocusChanged/);
  const shell = fs.readFileSync("mobile-offline-src/main.tsx", "utf8");
  assert.doesNotMatch(shell, /keepLoginCaret|applyLoginEndDelete/);
  assert.match(webView, /fillUiPolicy\.onUserEdit\(editorGeneration\)/);
  assert.doesNotMatch(webView, /notifyViewExited|requestFocus|\.cancel\(|\.commit\(/);
  assert.match(guard, /notifyViewExited\(webView, virtualId\)/);
  assert.match(guard, /notifyViewExited\(webView\)/);
  assert.match(guard, /suppressLoginFillUi\(\)/);
  assert.doesNotMatch(guard, /\.cancel\(|\.commit\(/);
  assert.match(activity, /SDK_INT >= 26\) LoginFillUiGuard\.attach/);
  assert.match(activity, /SDK_INT >= 26\) LoginFillUiGuard\.detach/);

  const javaBin = (() => {
    if (process.env.JAVA_HOME) return path.join(process.env.JAVA_HOME, "bin");
    const studio = "C:\\Program Files\\Android\\Android Studio\\jbr\\bin";
    if (process.platform === "win32" && fs.existsSync(path.join(studio, "javac.exe"))) return studio;
    return null;
  })();
  const java = javaBin
    ? path.join(javaBin, process.platform === "win32" ? "javac.exe" : "javac")
    : "javac";
  const runtime = javaBin
    ? path.join(javaBin, process.platform === "win32" ? "java.exe" : "java")
    : "java";
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "login-fill-ui-"));
  const sourceDir = path.join(work, "com", "youshi", "cultivation");
  fs.mkdirSync(sourceDir, { recursive: true });
  for (const name of ["LoginFillUiPolicy.java"]) {
    fs.copyFileSync(
      path.join("android/app/src/main/java/com/youshi/cultivation", name),
      path.join(sourceDir, name),
    );
  }
  const email = "1 | 0xd0";
  const password = "1 | 0xe0";
  const plain = "1";
  fs.writeFileSync(path.join(sourceDir, "LoginFillUiPolicyHarness.java"), `
package com.youshi.cultivation;
public final class LoginFillUiPolicyHarness {
  public static void main(String[] args) {
    LoginFillUiPolicy policy = new LoginFillUiPolicy();
    int emailGeneration = policy.onEditorStarted(${email});
    if (policy.suppressFillUi()) throw new AssertionError("suggestions stay available before editing");
    policy.onUserEdit(emailGeneration);
    if (!policy.suppressFillUi()) throw new AssertionError("editing suppresses the next popup");
    policy.onUserEdit(emailGeneration);
    if (!policy.suppressFillUi()) throw new AssertionError("continued editing stays suppressed");
    int restarted = policy.onEditorStarted(${email});
    if (restarted != emailGeneration) throw new AssertionError("same field keeps its generation");
    if (!policy.suppressFillUi()) throw new AssertionError("restarting the same field does not reopen the popup");

    int passwordGeneration = policy.onEditorStarted(${password});
    if (passwordGeneration == emailGeneration) throw new AssertionError("password is a new field");
    if (policy.suppressFillUi()) throw new AssertionError("a newly focused field may show suggestions");
    policy.onUserEdit(emailGeneration);
    if (policy.suppressFillUi()) throw new AssertionError("stale email edit does not suppress password");
    policy.onUserEdit(passwordGeneration);
    if (!policy.suppressFillUi()) throw new AssertionError("password editing suppresses the next popup");

    policy.reset();
    if (policy.suppressFillUi()) throw new AssertionError("leaving login resets popup state");
    int again = policy.onEditorStarted(${email});
    if (policy.suppressFillUi()) throw new AssertionError("returning to login shows first suggestions");
    policy.onUserEdit(passwordGeneration);
    if (policy.suppressFillUi()) throw new AssertionError("a stale edit cannot suppress new login");
    policy.onUserEdit(again);
    if (!policy.suppressFillUi()) throw new AssertionError("new login edits suppress repeat popup");

    int other = policy.onEditorStarted(${plain});
    if (policy.suppressFillUi()) throw new AssertionError("leaving login restores other editors");
    policy.onUserEdit(passwordGeneration);
    if (policy.suppressFillUi()) throw new AssertionError("old login edit does not affect another editor");
    policy.onUserEdit(other);
    if (policy.suppressFillUi()) throw new AssertionError("non-login editing does not suppress autofill");
  }
}
`);
  const compiled = spawnSync(java, [
    "-encoding", "UTF-8",
    "-d", work,
    path.join(sourceDir, "LoginFillUiPolicy.java"),
    path.join(sourceDir, "LoginFillUiPolicyHarness.java"),
  ], { encoding: "utf8" });
  assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout);
  const ran = spawnSync(runtime, ["-cp", work, "com.youshi.cultivation.LoginFillUiPolicyHarness"], { encoding: "utf8" });
  assert.equal(ran.status, 0, ran.stderr || ran.stdout);
});
