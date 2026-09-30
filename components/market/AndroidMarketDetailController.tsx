"use client";

import { Browser } from "@capacitor/browser";
import MarketDetailController from "@/components/market/MarketDetailController";
import MobilePageHeaderView from "@/components/mobile/MobilePageHeaderView";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function AndroidMarketDetailController({ id, online, onBack }: {
  id: string;
  online: boolean;
  onBack: () => void;
}) {
  const { t } = useLanguage();
  return <div data-android-market-detail="true">
    <MobilePageHeaderView title={t.market.detail_title} titleText={t.market.detail_title}
      showBack ariaLabel={t.nav.back} onBack={onBack} />
    <MarketDetailController id={id} online={online} onBack={onBack} onDeleted={onBack}
      onExternalLink={(url) => { void Browser.open({ url }); }} />
  </div>;
}
