/** Only decoded image bytes are allowed to reach URL.createObjectURL. */
export function normalizeLocalImageBlob(
  value: unknown,
  mimeType?: string | null,
): Blob | null {
  if (typeof Blob === "undefined") return null;
  if (value instanceof Blob) return value.size > 0 ? value : null;

  const candidate = value && typeof value === "object"
    ? value as { data?: unknown; bytes?: unknown; type?: unknown }
    : null;
  const type = typeof mimeType === "string" && mimeType.startsWith("image/")
    ? mimeType
    : typeof candidate?.type === "string" && candidate.type.startsWith("image/")
      ? candidate.type
      : null;
  if (!type) return null;

  const source = candidate?.data ?? candidate?.bytes ?? value;
  let bytes: Uint8Array;
  if (source instanceof ArrayBuffer) {
    bytes = new Uint8Array(source);
  } else if (ArrayBuffer.isView(source)) {
    bytes = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  } else if (
    Array.isArray(source) &&
    source.length > 0 &&
    source.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
  ) {
    bytes = Uint8Array.from(source);
  } else {
    return null;
  }

  if (bytes.byteLength === 0) return null;
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new Blob([copy], { type });
}
