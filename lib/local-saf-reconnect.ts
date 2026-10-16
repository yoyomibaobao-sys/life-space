import { readSafCommitted } from "@/lib/local-saf-core";
import { hydrateSafGeneration } from "@/lib/local-saf-generation";
import { createNativeSafStorage } from "@/lib/local-saf-native";

/** Explicit engine operation only; not called by startup or any business page. */
export async function reconnectLocalSafDirectory() {
  const storage = createNativeSafStorage();
  const committed = await readSafCommitted(storage);
  if (!committed) throw Error("No committed LifeSpace revision; existing mirror retained.");
  await hydrateSafGeneration(storage);
  return { localSpaceId: committed.manifest.localSpaceId,
    revision: committed.commit.revision, projectCount: committed.source.entries
      .filter((entry) => entry.kind === "local-project").length };
}
