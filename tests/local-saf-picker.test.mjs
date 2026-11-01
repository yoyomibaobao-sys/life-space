import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const plugin = fs.readFileSync("android/app/src/main/java/com/youshi/cultivation/LocalSafPlugin.java", "utf8");
const chooser = plugin.slice(plugin.indexOf("public void chooseDirectory("), plugin.indexOf("@ActivityCallback"));

test("SAF authorization opens one system picker without an App confirmation or data writes", () => {
  assert.match(chooser, /new Intent\(Intent\.ACTION_OPEN_DOCUMENT_TREE\)/);
  assert.equal((chooser.match(/startActivityForResult\(/g) || []).length, 1);
  assert.match(chooser, /startActivityForResult\(call, intent, "directorySelected"\)/);
  for (const flag of ["READ", "WRITE", "PERSISTABLE"]) {
    assert.ok(chooser.includes(`Intent.FLAG_GRANT_${flag}_URI_PERMISSION`));
  }
  assert.doesNotMatch(chooser, /AlertDialog|setPositiveButton|setNegativeButton|\.show\(/);
  assert.doesNotMatch(chooser, /takePersistableUriPermission|candidateTree\s*=|\.edit\(|createDocument|call\.resolve/);
});

test("the picker hints the saved tree before the default folder without probing or replacing it", () => {
  assert.match(chooser, /buildDocumentUri\(\s*"com\.android\.externalstorage\.documents", "primary:Documents\/LifeSpace"\)/);
  assert.match(chooser, /getSharedPreferences\(PREFS, 0\)\.getString\(KEY, null\)/);
  assert.match(chooser, /"content"\.equals\(tree\.getScheme\(\)\) && DocumentsContract\.isTreeUri\(tree\)/);
  assert.match(chooser, /initialUri = DocumentsContract\.buildDocumentUriUsingTree\(tree,\s*DocumentsContract\.getTreeDocumentId\(tree\)\)/);
  assert.match(chooser, /catch \(IllegalArgumentException ignored\)/);
  assert.match(chooser, /putExtra\(DocumentsContract\.EXTRA_INITIAL_URI, initialUri\)/);
  assert.doesNotMatch(chooser, /getContentResolver|listRoot|fileMetadata|\.query\(|\.mkdir/);
});

test("Huawei gallery and camera picker handlers remain discoverable", () => {
  const manifest = fs.readFileSync("android/app/src/main/AndroidManifest.xml", "utf8");
  assert.match(manifest, /android\.media\.action\.IMAGE_CAPTURE/);
  assert.match(manifest, /<package android:name="com\.huawei\.photos"\s*\/>/);
});

test("system cancellation, candidate validation and existing inline recovery guidance remain", () => {
  const callback = plugin.slice(plugin.indexOf("public void directorySelected("), plugin.indexOf("public void confirmDirectory("));
  assert.match(callback, /result\.getResultCode\(\) != Activity\.RESULT_OK/);
  assert.match(callback, /call\.reject\("No LifeSpace data directory was selected\."\);\s*return;/);
  assert.match(callback, /takePersistableUriPermission/);
  assert.match(callback, /candidateTree = uri/);
  assert.doesNotMatch(callback, /getSharedPreferences|createDocument/);
  const shell = fs.readFileSync("mobile-offline-src/main.tsx", "utf8");
  assert.match(shell, /safConnectionMissing \? copy\.safConnectWarning : copy\.safRegrantWarning/);
  assert.match(shell, /safConnectRunning\.current\) return/);
  assert.match(shell, /onClick=\{\(\) => void connectSaf\(\)\}/);
  assert.equal((shell.match(/void connectSaf\(\)/g) || []).length, 1, "SAF recovery must be user-initiated, never an automatic startup effect");
  assert.match(shell, /copy\.safRegrantCanceled/);
});
