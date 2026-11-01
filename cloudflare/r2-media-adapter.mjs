/**
 * Candidate server-only R2 object adapter. No public route, database write
 * or production bucket binding is created here. The owner, quota reservation
 * and referenced-media checks remain responsibilities of the approved caller.
 */
const OWNER = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/i;

export function validateMediaR2Key(key, ownerId) {
  if (typeof key !== "string" || typeof ownerId !== "string" ||
      !OWNER.test(ownerId) || key.length > 1024 || key.startsWith("/") ||
      key.includes("\\") || /[\u0000-\u001f\u007f]/.test(key) ||
      key.split("/").some((part) => !part || part === "." || part === "..")) {
    throw Error("invalid_r2_media_key");
  }
  if (key.split("/")[0].toLowerCase() !== ownerId.toLowerCase()) {
    throw Error("r2_media_owner_mismatch");
  }
  return key;
}

function assertBucket(bucket) {
  if (!bucket || ["put", "get", "head", "delete"].some((m) => typeof bucket[m] !== "function")) {
    throw Error("r2_binding_missing");
  }
}
function bytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw Error("invalid_media_bytes");
}
export async function sha256Media(value) {
  const hash = await crypto.subtle.digest("SHA-256", bytes(value));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getVerifiedR2Media(bucket, { key, ownerId, size, sha256 }) {
  assertBucket(bucket);
  validateMediaR2Key(key, ownerId);
  if (!Number.isSafeInteger(size) || size <= 0 || !SHA.test(sha256 || "")) {
    throw Error("media_verification_required");
  }
  const object = await bucket.get(key);
  if (!object) throw Error("r2_media_missing");
  const result = new Uint8Array(await object.arrayBuffer());
  if (result.length !== size || await sha256Media(result) !== sha256.toLowerCase()) {
    throw Error("r2_media_integrity_mismatch");
  }
  return result;
}

export async function putVerifiedR2Media(bucket, { key, ownerId, data, contentType }) {
  assertBucket(bucket);
  validateMediaR2Key(key, ownerId);
  const input = bytes(data);
  if (!input.length) throw Error("empty_media");
  if (typeof contentType !== "string" || !/^image\/[a-z0-9.+-]+$/i.test(contentType)) {
    throw Error("invalid_media_type");
  }
  // The R2 precondition is evaluated atomically by the binding, not by a
  // racy HEAD/GET followed by an unconditional PUT. Only one creator wins.
  const sha256 = await sha256Media(input);
  const saved = await bucket.put(key, input, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType },
  });
  if (!saved) {
    // A losing writer may only accept identical, independently verified bytes.
    // Never silently replace a different user's or an inconsistent copy.
    await getVerifiedR2Media(bucket, { key, ownerId, size: input.length, sha256 });
    return { key, size: input.length, sha256, alreadyExisted: true };
  }
  await getVerifiedR2Media(bucket, { key, ownerId, size: input.length, sha256 });
  return { key, size: input.length, sha256 };
}

export async function removeVerifiedR2Media(bucket, { key, ownerId, size, sha256, canDelete }) {
  assertBucket(bucket);
  validateMediaR2Key(key, ownerId);
  if (typeof canDelete !== "function") throw Error("media_reference_guard_required");
  if (await canDelete(key) !== true) throw Error("r2_media_still_referenced");
  await getVerifiedR2Media(bucket, { key, ownerId, size, sha256 });
  await bucket.delete(key);
  if (await bucket.head(key)) throw Error("r2_media_delete_unverified");
  return { deleted: true, key };
}
