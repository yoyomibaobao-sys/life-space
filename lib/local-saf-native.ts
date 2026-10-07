import { Capacitor, registerPlugin } from "@capacitor/core";
import { safSha256 } from "@/lib/local-saf-contract";
import { invalidateSafVerifiedHead, type SafStorage } from "@/lib/local-saf-core";

type NativeSaf = {
  chooseDirectory(): Promise<{ uri: string }>;
  confirmDirectory(): Promise<void>;
  discardDirectory(): Promise<void>;
  directoryStatus(): Promise<{ uri: string | null; available: boolean }>;
  listDirectory(options: { path: string }): Promise<{ names: string[] }>;
  fileMetadata(options: { path: string }): Promise<{ exists: boolean; size?: number; mimeType?: string }>;
  writeCheckpoint(options: { base64: string; sha256: string }): Promise<void>;
  listManifests(): Promise<{ names: string[] }>;
  listRoot(): Promise<{ names: string[] }>;
  readChunk(options: { path: string; offset: number }): Promise<{ exists: boolean; base64: string; done: boolean }>;
  readFiles(options: { paths: string[] }): Promise<{ files: Array<{ path: string; exists: boolean; base64: string }> }>;
  hasFile(options: { path: string; sha256: string }): Promise<{ exists: boolean }>;
  beginWrite(options: { path: string; sha256: string; size: number }): Promise<void>;
  appendChunk(options: { base64: string }): Promise<void>;
  finishWrite(): Promise<void>;
  cancelWrite(): Promise<void>;
};

const native = registerPlugin<NativeSaf>("LocalSaf");
const CHUNK = 128 * 1024;
const MAX_BATCH_FILES = 16;
const MAX_BATCH_BYTES = 512 * 1024;

export function isAndroidSafAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function getLocalSafDirectory() {
  if (!isAndroidSafAvailable()) return { uri: null, available: false };
  return native.directoryStatus();
}

export async function chooseLocalSafDirectory() {
  if (!isAndroidSafAvailable()) throw new Error("Only the Android app can select a local data folder.");
  const chosen = await native.chooseDirectory();
  invalidateSafVerifiedHead(nativeStorage);
  return chosen;
}

/** The caller must validate the candidate before accepting it as the active tree. */
export async function confirmLocalSafDirectory() {
  await native.confirmDirectory();
  invalidateSafVerifiedHead(nativeStorage);
}
export async function discardLocalSafDirectory() {
  await native.discardDirectory();
  invalidateSafVerifiedHead(nativeStorage);
}

export function createNativeSafStorage(): SafStorage {
  if (!isAndroidSafAvailable()) throw Error("Android SAF is unavailable.");
  return nativeStorage;
}

const nativeStorage: SafStorage = {
    async list(path) { return (await native.listDirectory({ path })).names; },
    async read(path) { return readOptionalLocalSafFile(path); },
    async readMany(paths) {
      if (!paths.length || paths.length > MAX_BATCH_FILES || new Set(paths).size !== paths.length) {
        throw Error("Invalid SAF batch paths.");
      }
      const response = await native.readFiles({ paths });
      if (!Array.isArray(response?.files) || response.files.length !== paths.length) {
        throw Error("Incomplete SAF batch response.");
      }
      const expected = new Set(paths);
      const result = new Map<string, Uint8Array | null>();
      let total = 0;
      for (const file of response.files) {
        if (!file || typeof file.path !== "string" || !expected.has(file.path) ||
            result.has(file.path) || typeof file.exists !== "boolean" ||
            typeof file.base64 !== "string") throw Error("Invalid SAF batch response.");
        if (!file.exists && file.base64 !== "") throw Error("Invalid SAF missing file response.");
        const data = file.exists ? decodeBase64(file.base64) : null;
        total += data?.byteLength ?? 0;
        if (total > MAX_BATCH_BYTES) throw Error("SAF batch byte limit exceeded.");
        result.set(file.path, data);
      }
      return result;
    },
    async create(path, bytes) {
      await writeLocalSafFile(path, bytes);
      const data = await readLocalSafFile(path);
      if (data.byteLength !== bytes.byteLength || await safSha256(data) !== await safSha256(bytes)) {
        throw Error("SAF immutable file verification failed.");
      }
    },
    async checkpoint(path, bytes) {
      if (path !== "manifest.json") throw Error("Invalid SAF checkpoint path.");
      await native.writeCheckpoint({ base64: encodeBase64(bytes), sha256: await safSha256(bytes) });
    },
};

export async function listLocalSafManifests() {
  return (await native.listManifests()).names;
}

export async function listLocalSafRoot() {
  return (await native.listRoot()).names;
}

function encodeBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 16_384) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 16_384));
  }
  return btoa(binary);
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function writeLocalSafFile(path: string, bytes: Uint8Array) {
  const sha256 = await safSha256(bytes);
  if (path.startsWith("media/") && (await native.hasFile({ path, sha256 })).exists) return sha256;
  await native.beginWrite({ path, sha256, size: bytes.byteLength });
  try {
    for (let offset = 0; offset < bytes.byteLength; offset += CHUNK) {
      await native.appendChunk({ base64: encodeBase64(bytes.subarray(offset, offset + CHUNK)) });
    }
    await native.finishWrite();
    return sha256;
  } catch (error) {
    await native.cancelWrite().catch(() => undefined);
    throw error;
  }
}

async function readOptionalLocalSafFile(path: string, expectedSha256?: string): Promise<Uint8Array | null> {
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const chunk = await native.readChunk({ path, offset: size });
    if (!chunk.exists) {
      if (size !== 0) throw new Error("LifeSpace file disappeared during reading.");
      return null;
    }
    const bytes = decodeBase64(chunk.base64);
    if (!chunk.done && bytes.length === 0) throw new Error("LifeSpace file read stopped unexpectedly.");
    parts.push(bytes);
    size += bytes.length;
    if (size > 64 * 1024 * 1024) throw new Error("LifeSpace file exceeds the supported size.");
    if (chunk.done) break;
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { data.set(part, offset); offset += part.length; }
  if (expectedSha256 && await safSha256(data) !== expectedSha256) {
    throw new Error("LifeSpace file hash does not match the saved manifest.");
  }
  return data;
}

export async function readLocalSafFile(path: string, expectedSha256?: string): Promise<Uint8Array> {
  const data = await readOptionalLocalSafFile(path, expectedSha256);
  if (!data) throw new Error(`Missing LifeSpace file: ${path}`);
  return data;
}
