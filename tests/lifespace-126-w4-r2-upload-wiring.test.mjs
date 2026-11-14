import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function section(path, start, end) {
  const source = readFileSync(path, "utf8");
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, path + ": source anchors must exist");
  return source.slice(a, b);
}

function assertUploadSequence(source, ownerExpression, mediaExpression, thumbExpression) {
  const originalUpload = source.indexOf("uploadMediaStorageObject(");
  const settle = source.indexOf("settleStorageUploadReservation(");
  const mirror = source.indexOf("mirrorCommittedRecordMedia(");
  assert(originalUpload >= 0, "Supabase Storage upload retained");
  assert(settle > originalUpload && mirror > settle, "R2 copy after Storage and settlement");
  assert(source.includes("if (settleResult.ok) {") || source.includes("if (settled.ok) {"),
    "R2 copy gated on confirmed quota settlement");
  assert(source.includes("mediaId: " + mediaExpression) ||
    (mediaExpression === "mediaId" && source.includes("mediaId, ownerId:")),
    "mirror uses confirmed media ID");
  assert(source.includes("ownerId: " + ownerExpression), "mirror uses current Owner");
  assert(source.includes("thumbPath: " + thumbExpression), "actual thumbnail path passed");
  assert(source.includes("cancelStorageUploadReservation("), "Storage cleanup preserved");
  assert(!source.includes("/__internal/r2/business-media/mirror"), "no direct bypass");
}

test("126 new-record W4 upload mirrors only after quota settlement", () => {
  const path = "app/archive/[id]/AddRecord.tsx";
  assert(readFileSync(path, "utf8").includes('from "@/lib/r2-business-media-mirror"'));
  const source = section(path, "const reservation = {", "async function recoverConfirmedRecordPhoto()");
  assertUploadSequence(source, "userId", "mediaId", "uploadedThumbPath");
  assert(source.indexOf("mirrorCommittedRecordMedia(") < source.indexOf("return actualBytes;"));
});

test("126 append-photo W4 upload mirrors after commit, retains prior UI and signing", () => {
  const path = "app/archive/[id]/page.tsx";
  assert(readFileSync(path, "utf8").includes('from "@/lib/r2-business-media-mirror"'));
  const source = section(path, "const reservation = {", "async function handleReplaceMedia(");
  assertUploadSequence(source, "user.id", "committedMedia.id", "uploadedThumbPath");
  assert(source.indexOf("mirrorCommittedRecordMedia(") < source.indexOf("attachMediaDisplayUrls("));
  assert(source.includes("showToast(options.successMessage ?? recordCopy.photo_added)"));
});

test("126 source retains reservation, reconcile, and Storage source semantics", () => {
  for (const path of ["app/archive/[id]/AddRecord.tsx", "app/archive/[id]/page.tsx"]) {
    const source = readFileSync(path, "utf8");
    for (const symbol of ["reserveStorageUpload(", "settleStorageUploadReservation(",
      "reconcileMediaUploadCommit(", "uploadMediaStorageObject("]) {
      assert(source.includes(symbol), path + ": missing " + symbol);
    }
  }
});
