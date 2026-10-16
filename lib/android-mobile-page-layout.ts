export const ANDROID_MOBILE_BOTTOM_NAV_IDS = [
  "home",
  "following",
  "market",
  "me",
] as const;

export const ANDROID_MOBILE_SHARED_PAGES = [
  "discover",
  "following",
  "market",
  "personal-space",
  "profile",
  "guides",
] as const;

export const ANDROID_MOBILE_PAGE_CONTRACT = {
  discoverGrid: "discover-mobile-two-column",
  discoverSearch: "discover-search-entry",
  followingChrome: "follow-mobile-top-bar",
  marketChrome: "market-mobile-top-bar",
  personalSpaceCard: "archive-project-card",
  profilePage: "profile",
  guideChrome: "plant-page",
  offlineState: "mobile-network-unavailable",
} as const;
