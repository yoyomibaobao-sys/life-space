export const MARKET_NOTIFICATION_TYPES = [
  "market_comment",
  "market_reply",
] as const;

export const MARKET_NOTIFICATION_FILTER = `(${MARKET_NOTIFICATION_TYPES.join(",")})`;
