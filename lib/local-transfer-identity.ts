/** Stable IDs are scoped to one durable SAF transfer, never to the source cloud archive. */
export async function stableTransferRecordId(targetArchiveId: string, localRecordId: string) {
  const input = new TextEncoder().encode(`LifeSpace/transfer-record/v1\\0${targetArchiveId}\\0${localRecordId}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input as BufferSource));
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function uniqueCloudArchiveTitle(original: string, names: ReadonlySet<string>) {
  if (!names.has(original)) return original;
  for (let number = 2; number < 10000; number += 1) {
    const candidate = `${original}（${number}）`;
    if (!names.has(candidate)) return candidate;
  }
  throw Error("云端项目重名过多，请先整理项目名称。");
}
