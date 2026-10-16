import { commitSafContent, initializeSafSpace, readSafCommitted } from "@/lib/local-saf-core";
import { readActiveSafGeneration } from "@/lib/local-saf-generation";
import {
  chooseLocalSafDirectory, confirmLocalSafDirectory, createNativeSafStorage,
  discardLocalSafDirectory, getLocalSafDirectory,
} from "@/lib/local-saf-native";

function isDefaultLocalDirectory(uri: string) {
  try {
    const parsed = new URL(uri);
    const treeId = /^\/tree\/([^/]+)$/.exec(parsed.pathname)?.[1];
    return parsed.protocol === "content:" && parsed.hostname === "com.android.externalstorage.documents" &&
      Boolean(treeId && decodeURIComponent(treeId) === "primary:Documents/LifeSpace");
  } catch {
    return false;
  }
}

/** Connect a validated existing space, or explicitly initialize only a truly empty default folder. */
export async function chooseAndValidateSafDirectory() {
  const saved = await getLocalSafDirectory();
  if (saved.uri && !saved.available) {
    throw Error("Reauthorize the original LifeSpace data folder before creating local data.");
  }
  const active = await readActiveSafGeneration();
  const selected = await chooseLocalSafDirectory();
  try {
    const storage = createNativeSafStorage();
    const root = await storage.list("");
    if (!root.length) {
      if (active) throw Error("The original LifeSpace identity or committed data could not be verified.");
      if (!isDefaultLocalDirectory(selected.uri)) {
        throw Error("Select the Documents/LifeSpace folder to create a new local space.");
      }
      const localSpaceId = await initializeSafSpace(storage);
      await commitSafContent(storage, { entries: [], taxonomy: [], categoryDepths: {} }, null);
      await confirmLocalSafDirectory();
      return { localSpaceId, kind: "new" as const };
    }
    const restored = await readSafCommitted(storage);
    if (!restored) throw Error("LifeSpace directory has no complete commit; recovery required.");
    if (active && restored.manifest.localSpaceId !== active.pointer.localSpaceId) {
      throw Error("The original LifeSpace identity or committed data could not be verified.");
    }
    await confirmLocalSafDirectory();
    return { localSpaceId: restored.manifest.localSpaceId, kind: "existing" as const };
  } catch (error) {
    await discardLocalSafDirectory();
    throw error;
  }
}

/** Recover only the saved tree and its already mirrored local space; never initialize a candidate. */
export async function regrantSavedSafDirectory() {
  const saved = await getLocalSafDirectory();
  if (!saved.uri || saved.available) throw Error("No saved LifeSpace directory needs reauthorization.");
  const active = await readActiveSafGeneration();
  if (!active?.pointer.localSpaceId) throw Error("The original LifeSpace identity cannot be verified.");

  const selected = await chooseLocalSafDirectory();
  try {
    if (selected.uri !== saved.uri) throw Error("Select the original LifeSpace data folder.");
    const restored = await readSafCommitted(createNativeSafStorage());
    if (!restored || restored.manifest.localSpaceId !== active.pointer.localSpaceId) {
      throw Error("The original LifeSpace identity or committed data could not be verified.");
    }
    await confirmLocalSafDirectory();
    return { localSpaceId: restored.manifest.localSpaceId, revision: restored.commit.revision };
  } catch (error) {
    await discardLocalSafDirectory();
    throw error;
  }
}
