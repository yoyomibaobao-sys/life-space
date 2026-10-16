import assert from "node:assert/strict";
import test from "node:test";
import { formatVerifiedLocalDirectory } from "../lib/local-saf-location.ts";

test("verified SAF tree labels the actual default or existing folder", () => {
  const defaultUri = "content://com.android.externalstorage.documents/tree/primary%3ADocuments%2FLifeSpace";
  const existingUri = "content://com.android.externalstorage.documents/tree/primary%3ADocuments%2FLifeSpace-SAF-Migration-Test-7826";
  assert.equal(formatVerifiedLocalDirectory(defaultUri, "zh"), "手机内部存储/Documents/LifeSpace");
  assert.equal(formatVerifiedLocalDirectory(existingUri, "en"), "Internal storage/Documents/LifeSpace-SAF-Migration-Test-7826");
});

test("an opaque or malformed tree is never mislabeled as the default folder", () => {
  for (const uri of ["content://other.provider/tree/my-folder", "not a URI", "content://com.android.externalstorage.documents/tree/secondary%3ADocuments%2FCustom"]) {
    assert.equal(formatVerifiedLocalDirectory(uri, "zh"), uri);
  }
});
