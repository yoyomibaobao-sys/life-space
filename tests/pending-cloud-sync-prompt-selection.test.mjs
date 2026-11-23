import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { build } from "esbuild";

const built = await build({
  entryPoints: ["lib/pending-cloud-sync-prompt-selection.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const { selectPendingCloudSyncPrompt } = await import(
  `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString("base64")}`
);

test("manual/deferred pending uploads do not reopen an automatic prompt", () => {
  assert.equal(selectPendingCloudSyncPrompt([
    { id: "deferred", should_prompt: false },
  ]), null);
  assert.equal(selectPendingCloudSyncPrompt([]), null);
});

test("only explicitly ask-mode uploads can automatically prompt", () => {
  const first = { id: "manual", should_prompt: false };
  const second = { id: "ask", should_prompt: true };
  assert.equal(selectPendingCloudSyncPrompt([first, second]), second);
  assert.equal(selectPendingCloudSyncPrompt([
    first, { id: "manual-2", should_prompt: false },
  ]), null);
});

test("global modal uses the safe automatic selection, never the first queued item", () => {
  const source = readFileSync("components/PendingCloudSyncPrompt.tsx", "utf8");
  assert.match(source, /setSummary\(selectPendingCloudSyncPrompt\(summaries\)\)/);
  assert.doesNotMatch(source, /setSummary\(summaries\.find\(\(item\) => item\.should_prompt\) \|\| summaries\[0\]/);
});
