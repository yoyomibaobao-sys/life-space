// Contract for every current Next route handler. Adding a handler requires
// classifying it before any bundled Android caller may use it.
export const androidNextApiInventory = {
  "/api/archives/[id]": "android-native",
  "/api/records/[id]": "android-native",
  "/api/media/[id]": "android-native",
  "/api/trash": "android-native",
  "/api/trash/empty": "android-native",
  "/api/trash/purge": "android-native",
  "/api/trash/restore": "android-native",
  "/api/trash/retry": "android-native",
  "/api/export/my-records": "network-only-binary-pending",
  "/api/account/delete": "web-only",
  "/api/admin/memberships/delete": "web-only",
  "/api/paypal/status": "web-only",
  "/api/paypal/checkout": "web-only",
  "/api/paypal/return": "web-only",
  "/api/paypal/webhook": "server-only",
  "/api/market/posts/[id]": "web-only",
  "/api/market/posts/[id]/cover": "web-only",
  "/api/market/media/[id]": "web-only",
  "/api/download/android": "web-only",
  "/api/internal/storage-deletion-worker": "server-only",
} as const;

export type AndroidApiDisposition = typeof androidNextApiInventory[keyof typeof androidNextApiInventory];
