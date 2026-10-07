import { commitSafContent, initializeSafSpace, readSafCommitted } from "@/lib/local-saf-core";
import {
  chooseLocalSafDirectory, confirmLocalSafDirectory, createNativeSafStorage,
  discardLocalSafDirectory,
} from "@/lib/local-saf-native";

/** Explicit adapter entry point; no page or startup path calls it yet. */
export async function chooseAndValidateSafDirectory() {
  await chooseLocalSafDirectory();
  try {
    const storage = createNativeSafStorage();
    const root = await storage.list("");
    if (!root.length) {
      const localSpaceId = await initializeSafSpace(storage);
      await commitSafContent(storage, { entries: [], taxonomy: [], categoryDepths: {} }, null);
      await confirmLocalSafDirectory();
      return { localSpaceId, kind: "new" as const };
    }
    const restored = await readSafCommitted(storage);
    if (!restored) throw Error("LifeSpace directory has no complete commit; recovery required.");
    await confirmLocalSafDirectory();
    return { localSpaceId: restored.manifest.localSpaceId, kind: "existing" as const };
  } catch (error) {
    await discardLocalSafDirectory();
    throw error;
  }
}
