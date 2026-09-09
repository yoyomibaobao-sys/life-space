export type ParsedAccountNumber = {
  accountClass: string;
  registrationYear: number;
  registrationSequence: number;
};

const SEQUENCE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const MAX_COMPACT_ACCOUNT_SEQUENCE = 999 + SEQUENCE_LETTERS.length * 99;

export function formatAccountSequence(sequence: number): string | null {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > MAX_COMPACT_ACCOUNT_SEQUENCE) return null;
  if (sequence <= 999) return String(sequence).padStart(3, "0");
  const offset = sequence - 1000;
  return `${SEQUENCE_LETTERS[Math.floor(offset / 99)]}${String(offset % 99 + 1).padStart(2, "0")}`;
}

export function parseAccountNumber(value?: string | null): ParsedAccountNumber | null {
  const raw = String(value || "").trim();
  const legacy = /^LS([a-z])-([0-9]{4})-([0-9]+)$/.exec(raw);
  const compact = /^LS([a-z])([0-9]{4})([0-9]{3}|[A-HJ-NP-Z][0-9]{2})$/.exec(raw);
  const match = legacy || compact;
  if (!match) return null;

  const registrationYear = Number(match[2]);
  const suffix = match[3];
  const letterIndex = SEQUENCE_LETTERS.indexOf(suffix[0]);
  if (compact && letterIndex >= 0 && Number(suffix.slice(1)) === 0) return null;
  const registrationSequence = compact && letterIndex >= 0
    ? 999 + letterIndex * 99 + Number(suffix.slice(1))
    : Number(suffix);
  if (
    !Number.isInteger(registrationYear) || registrationYear < 2000 ||
    !Number.isSafeInteger(registrationSequence) ||
    registrationSequence <= 0
  ) {
    return null;
  }

  return {
    accountClass: match[1],
    registrationYear,
    registrationSequence,
  };
}

export function formatAccountNumber(value?: string | null) {
  const raw = String(value || "").trim();
  const parsed = parseAccountNumber(raw);
  const suffix = parsed && formatAccountSequence(parsed.registrationSequence);
  return parsed && suffix ? `LS${parsed.accountClass}${parsed.registrationYear}${suffix}` : raw;
}

/** Accept equivalent old/new account numbers, never a different UUID or rank. */
export function matchesAccountConfirmation(input: string, expected: string) {
  if (!input.trim() || !expected.trim()) return false;
  if (input.trim() === expected.trim()) return true;
  const first = parseAccountNumber(input);
  const second = parseAccountNumber(expected);
  return !!first && !!second && first.accountClass === second.accountClass
    && first.registrationYear === second.registrationYear
    && first.registrationSequence === second.registrationSequence;
}

export function getAccountRegistrationSummary(
  value?: string | null,
  language: Language = "zh"
) {
  const parsed = parseAccountNumber(value);
  if (!parsed) return "";

  return language === "en"
    ? `Registered ${parsed.registrationYear} · Formal user #${parsed.registrationSequence}`
    : `${parsed.registrationYear}年注册 · 正式用户总第${parsed.registrationSequence}位`;
}
import type { Language } from "@/lib/i18n";
