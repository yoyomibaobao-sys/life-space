export type ParsedAccountNumber = {
  accountClass: string;
  registrationYear: number;
  registrationSequence: number;
};

export function parseAccountNumber(value?: string | null): ParsedAccountNumber | null {
  const match = /^LS([a-z])-([0-9]{4})-([0-9]+)$/.exec(String(value || "").trim());
  if (!match) return null;

  const registrationYear = Number(match[2]);
  const registrationSequence = Number(match[3]);
  if (
    !Number.isInteger(registrationYear) ||
    !Number.isInteger(registrationSequence) ||
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

export function getAccountRegistrationSummary(value?: string | null) {
  const parsed = parseAccountNumber(value);
  if (!parsed) return "";

  return `${parsed.registrationYear}年注册 · 正式用户总第${parsed.registrationSequence}位`;
}
