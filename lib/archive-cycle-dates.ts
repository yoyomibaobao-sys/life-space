export function toLocalDateInputValue(value?: string | Date | null) {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = safeDate.getFullYear();
  const month = `${safeDate.getMonth() + 1}`.padStart(2, "0");
  const day = `${safeDate.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function localDateInputToIso(value: string, boundary: "start" | "end" = "start") {
  const [year, month, day] = value.split("-").map(Number);
  return boundary === "end"
    ? new Date(year, month - 1, day, 23, 59, 59, 999).toISOString()
    : new Date(year, month - 1, day, 12, 0, 0, 0).toISOString();
}

export function toLocalDateEndIso(value: string | Date) {
  return localDateInputToIso(toLocalDateInputValue(value), "end");
}

export function isLocalDateBefore(value: string | Date, reference: string | Date) {
  return toLocalDateInputValue(value) < toLocalDateInputValue(reference);
}

export function formatLocalCycleDate(value?: string | Date | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}/${month}/${day}`;
}
