/** Fit prose and its trailing metadata into the same two-line text flow. */
export function fitInlineSummary(text: string, fits: (value: string) => boolean) {
  const normalized = text.replace(/\s+/gu, " ").trim();
  if (!normalized || fits(normalized)) return normalized;

  const characters = typeof Intl.Segmenter === "function"
    ? Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(normalized), ({ segment }) => segment)
    : Array.from(normalized);
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = `${characters.slice(0, middle).join("").trimEnd()}…`;
    if (fits(candidate)) low = middle;
    else high = middle - 1;
  }
  return low ? `${characters.slice(0, low).join("").trimEnd()}…` : "";
}
