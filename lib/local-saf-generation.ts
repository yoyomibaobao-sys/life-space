import { requireSafUuid, type SafEntry } from "@/lib/local-saf-contract";
import { readSafCommitted, type SafStorage } from "@/lib/local-saf-core";

const DB = "life-space-saf-mirror-v1";
type Pointer = { key: "active"; generation: string; localSpaceId: string; revision: string };

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}
function done(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || Error("SAF generation transaction aborted."));
  });
}
async function open() {
  const result = indexedDB.open(DB, 1);
  result.onupgradeneeded = () => {
    result.result.createObjectStore("rows", { keyPath: "key" });
    result.result.createObjectStore("control", { keyPath: "key" });
  };
  return request(result);
}
export async function readActiveSafGeneration(): Promise<{
  pointer: Pointer; entries: SafEntry[];
} | null> {
  const db = await open();
  try {
    const tx = db.transaction(["rows", "control"], "readonly");
    const finished = done(tx);
    const pointer = await request(tx.objectStore("control").get("active")) as Pointer | undefined;
    const rows = pointer ? await request(tx.objectStore("rows").getAll()) as
      Array<{ key: string; value: SafEntry }> : [];
    await finished;
    return pointer ? { pointer, entries: rows.filter((row) =>
      row.key.startsWith(`${pointer.generation}:`)).map((row) => row.value) } : null;
  } finally { db.close(); }
}

/** Separate generation first; one IDB transaction publishes the new pointer. */
export async function hydrateSafGeneration(storage: SafStorage, options?: {
  beforeActivate?: () => void; failBuildAt?: number;
}) {
  const state = await readSafCommitted(storage);
  if (!state?.manifest || !state.commit || !state.source) throw Error("SAF recovery failed; mirror unchanged.");
  requireSafUuid(state.manifest.localSpaceId, "localSpaceId");
  if (state.manifest.committedRevision !== state.commit.revision ||
      state.commit.localSpaceId !== state.manifest.localSpaceId) throw Error("SAF generation identity mismatch.");
  const ids = new Set<string>();
  for (const entry of state.source.entries) {
    if (ids.has(entry.id)) throw Error("Duplicate SAF generation entry.");
    ids.add(entry.id);
  }
  const generation = crypto.randomUUID();
  const db = await open();
  try {
    const build = db.transaction("rows", "readwrite");
    const built = done(build);
    const store = build.objectStore("rows");
    state.source.entries.forEach((value, index) => {
      if (options?.failBuildAt === index) store.add({ key: `${generation}:${value.id}`, value });
      store.add({ key: `${generation}:${value.id}`, value });
    });
    await built;
    options?.beforeActivate?.();
    const activate = db.transaction("control", "readwrite");
    const activated = done(activate);
    activate.objectStore("control").put({ key: "active", generation,
      localSpaceId: state.manifest.localSpaceId, revision: state.commit.revision } satisfies Pointer);
    await activated;
    return generation;
  } finally { db.close(); }
}

/** User-visible projection, with account isolation. Old generations are retained. */
export async function readVisibleSafGeneration(verifiedUserId: string | null) {
  const active = await readActiveSafGeneration();
  if (!active) throw Error("No validated SAF mirror; cannot report an empty local space.");
  return active.entries.filter((entry) =>
    (entry.kind === "local-project" && entry.archive.local_cloud_transfer?.stage !== "complete") ||
    Boolean(verifiedUserId && entry.ownerUserId === verifiedUserId));
}
