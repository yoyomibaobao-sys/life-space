import type { UiIconName } from "@/components/ui/UiIcon";

export type MobilePrimaryNavigationId =
  | "home"
  | "following"
  | "market"
  | "me";

export type MobilePrimaryNavigationLabels = {
  home: string;
  following: string;
  market: string;
  me: string;
};

export type MobilePrimaryNavigationDescriptor = {
  id: MobilePrimaryNavigationId;
  label: string;
  icon: UiIconName;
};

export function getMobilePrimaryNavigationDescriptors(
  labels: MobilePrimaryNavigationLabels,
): MobilePrimaryNavigationDescriptor[] {
  return [
    { id: "home", label: labels.home, icon: "home" },
    { id: "following", label: labels.following, icon: "follow" },
    { id: "market", label: labels.market, icon: "store" },
    { id: "me", label: labels.me, icon: "user" },
  ];
}
