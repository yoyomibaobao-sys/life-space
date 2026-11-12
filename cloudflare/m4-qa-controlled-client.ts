/* M4 QA ONLY. Uses the existing Supabase SDK; never reads or stores browser auth tokens. */
import { supabase } from "../lib/supabase";

const QA_ORIGIN = "https://lifespace-site-media-qa-20261028.lifespace-assets-isolated-lab.workers.dev";
const QA_PROJECT_REF = "mablwxlipcgbmbnfdbkc";
const OWNER = "f99fd44d-820f-41f2-ad4e-85feb7c990a6";
const MEDIA = "ed4d0534-f686-42ff-82a6-1ab10e510063";
const RECORD = "b5baa3e2-68c9-45a3-ab9f-8a98cd4ef526";
const MIRROR_PATH = "/__internal/r2/business-media/mirror";
const USED_HASH = "#m4-used";

const FIXED = [
  {
    variant: "full",
    path: OWNER + "/" + RECORD + "/0cebadc6-f936-43d1-af45-eb9f9e720c7c-PR95-Cloud-Image-QA-Synthetic-20261018.jpg",
    expectedBytes: 14663,
    expectedMime: "image/jpeg",
  },
  {
    variant: "thumb",
    path: OWNER + "/" + RECORD + "/thumbs/0cebadc6-f936-43d1-af45-eb9f9e720c7c-thumb-PR95-Cloud-Image-QA-Synthetic-20261018.jpg",
    expectedBytes: 10997,
    expectedMime: "image/jpeg",
  },
] as const;

type Variant = typeof FIXED[number]["variant"];
type ReadStatus = "NOT_RUN" | "VERIFIED" | "NOT_VERIFIED";
type RequestStatus = "NOT_SENT" | "SENT_PENDING" | "RESPONSE_RECEIVED" | "UNKNOWN";

type SourceSnapshot = {
  status: ReadStatus;
  bucket: "media";
  pathFingerprint: string | null;
  bytes: number | null;
  sha256: string | null;
  contentType: string | null;
  sniffedMime: string | null;
  readAt: string | null;
  readMethod: "supabase-js-storage-download";
  cacheStatus: "SDK_DEFAULT_UNVERIFIED";
  objectVersion: null;
  updatedAt: null;
  comparedToBefore: boolean | null;
  errorCode: string | null;
};

type ReceiptEntry = {
  variant: Variant;
  businessType: "media";
  businessId: string;
  expectedBytes: number;
  expectedMime: string;
  expectedR2KeyFingerprint: string | null;
  identity: {
    status: "NOT_RUN" | "VERIFIED" | "NOT_VERIFIED";
    ownerVerified: boolean;
    verifiedAt: string | null;
    reasonCode: string | null;
  };
  sourceBefore: SourceSnapshot;
  request: {
    status: RequestStatus;
    businessType: "media";
    businessId: string;
    variant: Variant;
    startedAt: string | null;
    endedAt: string | null;
    http: number | null;
    cfRay: string | null;
    responseContentType: string | null;
    serverStatus: string | null;
    errorCode: string | null;
    bytes: number | null;
    sha256: string | null;
    contentType: string | null;
    verified: boolean;
  };
  sourceAfter: SourceSnapshot;
};

const SAFE_ERROR_CODES = new Set([
  "authentication_required",
  "owner_session_required",
  "owner_online_verification_failed",
  "session_changed",
  "source_download_failed",
  "source_read_interrupted",
  "source_hash_failed",
  "source_integrity_mismatch",
  "response_json_invalid",
  "fetch_outcome_unknown",
  "response_http_failure",
  "response_status_unrecognized",
  "response_content_type_mismatch",
  "response_integrity_mismatch",
  "source_changed_after_mirror",
  "one_shot_lock_unavailable",
  "unexpected_failure",
  "disabled",
  "media_service_unavailable",
  "gateway_not_configured",
  "origin_required",
  "origin_not_allowed",
  "cross_site_not_allowed",
  "json_required",
  "invalid_request",
  "request_too_large",
  "mirror_rate_limit_not_configured",
  "mirror_rate_limit_unavailable",
  "rate_limited",
  "media_unavailable",
  "business_reference_not_found",
  "source_unavailable",
  "source_size_invalid",
  "source_length_mismatch",
  "source_mime_mismatch",
  "business_reference_changed",
  "r2_object_conflict",
  "r2_stage_unavailable",
  "media_mirror_unavailable",
]);

class M4GateError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = SAFE_ERROR_CODES.has(code) ? code : "unexpected_failure";
  }
}

function now() {
  return new Date().toISOString();
}

function operationId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" +
    hex.slice(16, 20) + "-" + hex.slice(20);
}

function errorCode(error: unknown) {
  if (error instanceof M4GateError) return error.code;
  return "unexpected_failure";
}

function safeErrorCode(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return SAFE_ERROR_CODES.has(value) ? value : "unrecognized_error";
}

function safeServerStatus(value: unknown): string | null {
  if (value === "copied_verified" || value === "already_verified") return value;
  return safeErrorCode(value);
}

function safeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function safeSha256(value: unknown): string | null {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

function safeImageMime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const mime = value.trim().toLowerCase().split(";")[0];
  return ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/heic", "image/heif"].includes(mime)
    ? mime : null;
}

function safeCfRay(value: string | null): string | null {
  return value && /^[A-Za-z0-9-]{8,80}$/.test(value) ? value : null;
}

function safeResponseContentType(value: string | null): string | null {
  if (!value) return null;
  const mime = value.split(";")[0].trim().toLowerCase();
  return mime === "application/json" ? mime : "unrecognized";
}

function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
      bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a &&
      bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 6) {
    const gif = String.fromCharCode(...bytes.subarray(0, 6));
    if (gif === "GIF87a" || gif === "GIF89a") return "image/gif";
  }
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") return "image/webp";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(4, 8)) === "ftyp") {
    const brands = [];
    for (const offset of [8, 16, 20, 24, 28, 32]) {
      if (bytes.length >= offset + 4) brands.push(String.fromCharCode(...bytes.subarray(offset, offset + 4)));
    }
    if (brands.some((brand) => brand === "avif" || brand === "avis")) return "image/avif";
    if (brands.some((brand) => ["heic", "heix", "hevc", "hevx"].includes(brand))) return "image/heic";
    if (brands.some((brand) => brand === "mif1" || brand === "msf1")) return "image/heif";
  }
  return null;
}

async function sha256Hex(bytes: Uint8Array) {
  const digestInput = new Uint8Array(bytes.byteLength);
  digestInput.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", digestInput.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function verifyOwnerSession() {
  let first;
  try {
    first = await supabase.auth.getSession();
  } catch {
    throw new M4GateError("authentication_required");
  }
  const session = first?.data?.session;
  const accessToken = session?.access_token;
  if (first?.error || !accessToken || session?.user?.id !== OWNER) {
    throw new M4GateError("owner_session_required");
  }

  let verified;
  try {
    verified = await supabase.auth.getUser(accessToken);
  } catch {
    throw new M4GateError("owner_online_verification_failed");
  }
  if (verified?.error || verified?.data?.user?.id !== OWNER) {
    throw new M4GateError("owner_online_verification_failed");
  }

  await assertSessionUnchanged(accessToken);
  return {
    accessToken,
    verifiedUid: verified.data.user.id,
    verifiedAt: now(),
  };
}

async function assertSessionUnchanged(accessToken: string) {
  let current;
  try {
    current = await supabase.auth.getSession();
  } catch {
    throw new M4GateError("session_changed");
  }
  if (current?.error || current?.data?.session?.access_token !== accessToken ||
      current?.data?.session?.user?.id !== OWNER) {
    throw new M4GateError("session_changed");
  }
}

function emptySource(): SourceSnapshot {
  return {
    status: "NOT_RUN",
    bucket: "media",
    pathFingerprint: null,
    bytes: null,
    sha256: null,
    contentType: null,
    sniffedMime: null,
    readAt: null,
    readMethod: "supabase-js-storage-download",
    cacheStatus: "SDK_DEFAULT_UNVERIFIED",
    objectVersion: null,
    updatedAt: null,
    comparedToBefore: null,
    errorCode: null,
  };
}

function failedSource(pathFingerprint: string | null, code: string): SourceSnapshot {
  return {
    ...emptySource(),
    pathFingerprint,
    status: "NOT_VERIFIED",
    readAt: now(),
    errorCode: SAFE_ERROR_CODES.has(code) ? code : "unexpected_failure",
  };
}

async function readSource(item: typeof FIXED[number]): Promise<SourceSnapshot> {
  let pathFingerprint: string;
  try {
    pathFingerprint = await sha256Hex(new TextEncoder().encode(item.path));
  } catch {
    return failedSource(null, "source_hash_failed");
  }

  let identity;
  try {
    identity = await verifyOwnerSession();
  } catch (error) {
    return failedSource(pathFingerprint, errorCode(error));
  }

  let result;
  try {
    result = await supabase.storage.from("media").download(item.path);
  } catch {
    return failedSource(pathFingerprint, "source_download_failed");
  }
  if (result?.error || !result?.data || typeof result.data.arrayBuffer !== "function") {
    return failedSource(pathFingerprint, "source_download_failed");
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await result.data.arrayBuffer());
  } catch {
    return failedSource(pathFingerprint, "source_read_interrupted");
  }

  let digest: string;
  try {
    digest = await sha256Hex(bytes);
  } catch {
    return failedSource(pathFingerprint, "source_hash_failed");
  }

  const contentType = typeof result.data.type === "string" && result.data.type.trim()
    ? result.data.type.trim().toLowerCase().split(";")[0] : null;
  const sniffedMime = sniffMime(bytes);
  let sessionStable = true;
  try {
    await assertSessionUnchanged(identity.accessToken);
  } catch {
    sessionStable = false;
  }

  const integrityOk = bytes.byteLength === item.expectedBytes &&
    contentType === item.expectedMime && sniffedMime === item.expectedMime;
  return {
    status: integrityOk && sessionStable ? "VERIFIED" : "NOT_VERIFIED",
    bucket: "media",
    pathFingerprint,
    bytes: bytes.byteLength,
    sha256: digest,
    contentType,
    sniffedMime,
    readAt: now(),
    readMethod: "supabase-js-storage-download",
    cacheStatus: "SDK_DEFAULT_UNVERIFIED",
    objectVersion: null,
    updatedAt: null,
    comparedToBefore: null,
    errorCode: !sessionStable ? "session_changed" : integrityOk ? null : "source_integrity_mismatch",
  };
}

function sameSource(before: SourceSnapshot, after: SourceSnapshot) {
  return before.status === "VERIFIED" && after.status === "VERIFIED" &&
    before.pathFingerprint === after.pathFingerprint &&
    before.bytes === after.bytes && before.sha256 === after.sha256 &&
    before.contentType === after.contentType && before.sniffedMime === after.sniffedMime;
}

function makeEntry(item: typeof FIXED[number]): ReceiptEntry {
  return {
    variant: item.variant,
    businessType: "media",
    businessId: MEDIA,
    expectedBytes: item.expectedBytes,
    expectedMime: item.expectedMime,
    expectedR2KeyFingerprint: null,
    identity: {
      status: "NOT_RUN",
      ownerVerified: false,
      verifiedAt: null,
      reasonCode: null,
    },
    sourceBefore: emptySource(),
    request: {
      status: "NOT_SENT",
      businessType: "media",
      businessId: MEDIA,
      variant: item.variant,
      startedAt: null,
      endedAt: null,
      http: null,
      cfRay: null,
      responseContentType: null,
      serverStatus: null,
      errorCode: null,
      bytes: null,
      sha256: null,
      contentType: null,
      verified: false,
    },
    sourceAfter: emptySource(),
  };
}

const statusEl = document.getElementById("m4-account-status")!;
const button = document.getElementById("m4-run-once") as HTMLButtonElement;
const receiptEl = document.getElementById("m4-receipt")!;
const detailEl = document.getElementById("m4-review")!;
if (!statusEl || !button || !receiptEl || !detailEl) throw new Error("m4_ui_dom_missing");

const receipt = {
  version: "M4_QA_RECEIPT_V1",
  scope: "ISOLATED_QA_ONLY",
  qaOrigin: QA_ORIGIN,
  projectRef: QA_PROJECT_REF,
  mediaId: MEDIA,
  expectedOwnerRole: "QA_OWNER_A",
  operationId: operationId(),
  startedAt: null as string | null,
  endedAt: null as string | null,
  status: "NOT_STARTED",
  sourceAfterStatus: "NOT_RUN_NO_POSTS",
  nextStep: "NONE",
  r2Readback: "NOT_PERFORMED_BY_CLIENT",
  entries: FIXED.map(makeEntry),
};

let hasExecuted = window.location.hash === USED_HASH;

function show(node: HTMLElement, message: string) {
  node.textContent = message;
}

function renderReceipt() {
  receiptEl.textContent = JSON.stringify(receipt, null, 2);
}

function lockOneShot(): boolean {
  try {
    const url = new URL(window.location.href);
    url.hash = USED_HASH;
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    return window.location.hash === USED_HASH;
  } catch {
    return false;
  }
}

function entryFor(variant: Variant) {
  return receipt.entries.find((entry) => entry.variant === variant)!;
}

async function checkOwner() {
  button.disabled = true;
  if (hasExecuted) {
    show(statusEl, "此一次性入口已使用；刷新页面不会重新授予执行权限。");
    return;
  }
  show(statusEl, "正在使用现有Supabase会话进行在线Owner核验…");
  try {
    const identity = await verifyOwnerSession();
    show(statusEl, "指定QA Owner已在线核验。点击后仍会逐次重新验证。");
    button.disabled = identity.verifiedUid !== OWNER;
  } catch {
    show(statusEl, "当前会话不是指定QA Owner或在线核验失败，已禁止请求。");
  }
}

async function performMirror(item: typeof FIXED[number], entry: ReceiptEntry): Promise<"SUCCESS" | "FAILURE" | "UNKNOWN" | "NOT_SENT"> {
  let identity;
  try {
    identity = await verifyOwnerSession();
    entry.identity = {
      status: "VERIFIED",
      ownerVerified: identity.verifiedUid === OWNER,
      verifiedAt: identity.verifiedAt,
      reasonCode: null,
    };
  } catch (error) {
    entry.identity = {
      status: "NOT_VERIFIED",
      ownerVerified: false,
      verifiedAt: null,
      reasonCode: errorCode(error),
    };
    return "NOT_SENT";
  }

  entry.request.status = "SENT_PENDING";
  entry.request.startedAt = now();
  try {
    const response = await fetch(MIRROR_PATH, {
      method: "POST",
      credentials: "omit",
      mode: "same-origin",
      redirect: "error",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + identity.accessToken,
      },
      body: JSON.stringify({
        businessType: "media",
        businessId: MEDIA,
        variant: item.variant,
      }),
    });

    entry.request.http = response.status;
    entry.request.cfRay = safeCfRay(response.headers.get("cf-ray"));
    entry.request.responseContentType = safeResponseContentType(response.headers.get("content-type"));

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      entry.request.status = "UNKNOWN";
      entry.request.errorCode = "response_json_invalid";
      entry.request.endedAt = now();
      return "UNKNOWN";
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      entry.request.status = "UNKNOWN";
      entry.request.errorCode = "response_json_invalid";
      entry.request.endedAt = now();
      return "UNKNOWN";
    }

    const json = payload as Record<string, unknown>;
    entry.request.status = "RESPONSE_RECEIVED";
    entry.request.endedAt = now();
    entry.request.serverStatus = safeServerStatus(json.status);
    entry.request.errorCode = safeErrorCode(json.error);
    entry.request.bytes = safeInteger(json.bytes);
    entry.request.sha256 = safeSha256(json.sha256);
    entry.request.contentType = safeImageMime(json.contentType);

    if (response.status !== 200) {
      entry.request.errorCode = entry.request.errorCode || "response_http_failure";
      return "FAILURE";
    }
    if (entry.request.responseContentType !== "application/json") {
      entry.request.errorCode = "response_content_type_mismatch";
      return "FAILURE";
    }
    if (entry.request.serverStatus !== "copied_verified" &&
        entry.request.serverStatus !== "already_verified") {
      entry.request.errorCode = entry.request.errorCode || "response_status_unrecognized";
      return "FAILURE";
    }
    if (entry.request.bytes !== entry.sourceBefore.bytes ||
        entry.request.sha256 !== entry.sourceBefore.sha256 ||
        entry.request.contentType !== item.expectedMime ||
        entry.request.contentType !== entry.sourceBefore.contentType ||
        entry.sourceBefore.sniffedMime !== item.expectedMime) {
      entry.request.errorCode = "response_integrity_mismatch";
      return "FAILURE";
    }

    entry.request.verified = true;
    return "SUCCESS";
  } catch {
    entry.request.status = "UNKNOWN";
    entry.request.errorCode = "fetch_outcome_unknown";
    entry.request.endedAt = now();
    return "UNKNOWN";
  }
}

async function runOnce() {
  if (hasExecuted || button.disabled) return;
  hasExecuted = true;
  button.disabled = true;
  button.textContent = "执行已锁定（不可重复点击）";

  if (!lockOneShot()) {
    receipt.status = "STOP_ONE_SHOT_LOCK_UNAVAILABLE";
    receipt.nextStep = "NO_POST_SENT";
    show(statusEl, "一次性锁定失败，未发出请求。");
    renderReceipt();
    return;
  }

  receipt.startedAt = now();
  receipt.status = "SOURCE_BASELINE_RUNNING";
  show(statusEl, "先只读核对原图与缩略图源对象；两者均通过后才允许原图POST。");
  renderReceipt();

  let sourceBaselineOk = true;
  for (const item of FIXED) {
    const entry = entryFor(item.variant);
    entry.sourceBefore = await readSource(item);
    entry.expectedR2KeyFingerprint = entry.sourceBefore.pathFingerprint;
    if (entry.sourceBefore.status !== "VERIFIED") sourceBaselineOk = false;
    renderReceipt();
  }

  if (!sourceBaselineOk) {
    receipt.status = "STOP_SOURCE_BASELINE_NOT_VERIFIED_NO_POSTS";
    receipt.sourceAfterStatus = "NOT_RUN_NO_POSTS";
    receipt.nextStep = "READ_ONLY_SOURCE_REVIEW_REQUIRED";
    receipt.endedAt = now();
    show(statusEl, "源对象大小、MIME、SHA或Owner核验未全部通过；没有发出镜像POST。");
    renderReceipt();
    return;
  }

  let anyAttempted = false;
  let anyUnknown = false;
  let allRequestsSucceeded = true;

  for (const item of FIXED) {
    const entry = entryFor(item.variant);
    const outcome = await performMirror(item, entry);
    if (outcome !== "NOT_SENT") anyAttempted = true;
    renderReceipt();

    if (outcome === "SUCCESS") continue;
    allRequestsSucceeded = false;
    if (outcome === "UNKNOWN") {
      anyUnknown = true;
      receipt.status = "STOP_" + item.variant.toUpperCase() + "_UNKNOWN_READ_ONLY_RECONCILIATION_REQUIRED";
    } else if (outcome === "FAILURE") {
      receipt.status = "STOP_" + item.variant.toUpperCase() + "_FAILURE_READ_ONLY_RECONCILIATION_REQUIRED";
    } else {
      const reason = entry.identity.reasonCode || "owner_verification_failed";
      receipt.status = "STOP_" + item.variant.toUpperCase() + "_NOT_SENT_" + reason.toUpperCase();
    }
    break;
  }

  if (anyUnknown) {
    receipt.sourceAfterStatus = "SKIPPED_UNKNOWN";
    receipt.nextStep = "D_READ_ONLY_RECONCILIATION_REQUIRED_BEFORE_ANY_FURTHER_POST";
    receipt.endedAt = now();
    show(statusEl, "回执不确定，已停止后续请求；必须先由D组只读核账，不自动重试。");
    renderReceipt();
    return;
  }

  if (anyAttempted) {
    receipt.sourceAfterStatus = "RUNNING";
    for (const item of FIXED) {
      const entry = entryFor(item.variant);
      const after = await readSource(item);
      const unchanged = sameSource(entry.sourceBefore, after);
      entry.sourceAfter = {
        ...after,
        status: unchanged ? "VERIFIED" : "NOT_VERIFIED",
        comparedToBefore: unchanged,
        errorCode: unchanged ? null : (after.errorCode || "source_changed_after_mirror"),
      };
      renderReceipt();
    }
    receipt.sourceAfterStatus = receipt.entries.every((entry) => entry.sourceAfter.status === "VERIFIED")
      ? "VERIFIED" : "NOT_VERIFIED";
  }

  if (allRequestsSucceeded && receipt.entries.every((entry) => entry.request.verified) &&
      receipt.sourceAfterStatus === "VERIFIED") {
    receipt.status = "MIRROR_HTTP_RESPONSES_VERIFIED_SOURCE_STABLE_PENDING_INDEPENDENT_R2_READBACK";
    receipt.nextStep = "D_READ_ONLY_R2_READBACK_REQUIRED";
    show(statusEl, "两项HTTP回执及源对象前后SHA/MIME核验通过；仍须D组独立R2读回。");
  } else {
    if (!receipt.status.startsWith("STOP_")) receipt.status = "STOP_SOURCE_AFTER_NOT_VERIFIED";
    const requiresReadOnlyReconciliation = receipt.status.includes("_FAILURE_READ_ONLY_RECONCILIATION_REQUIRED");
    receipt.nextStep = requiresReadOnlyReconciliation || receipt.sourceAfterStatus === "NOT_VERIFIED"
      ? "D_READ_ONLY_RECONCILIATION_REQUIRED" : "D_READ_ONLY_R2_READBACK_REQUIRED";
    show(statusEl, "本轮已停止后续写请求；保留脱敏回执，等待D组只读核账。");
  }

  receipt.endedAt = now();
  renderReceipt();
}

show(detailEl,
  "QA指定媒体：" + MEDIA +
  "\n原图：" + FIXED[0].expectedBytes + "字节，" + FIXED[0].expectedMime +
  "\n缩略图：" + FIXED[1].expectedBytes + "字节，" + FIXED[1].expectedMime +
  "\n请求只传mediaId与full/thumb，不传客户端路径。点击后先读取两份源对象。");

if (hasExecuted) {
  button.disabled = true;
  button.textContent = "一次性入口已使用";
  show(statusEl, "此一次性入口已使用；刷新页面不会重新授予执行权限。");
} else {
  button.addEventListener("click", async () => { await runOnce(); }, { once: true });
  void checkOwner();
}
