"use client";

import { useEffect, useState } from "react";
import MarketDetailView from "@/components/market/MarketDetailView";
import { loadMarketPostDetail, type MarketDetailPayload } from "@/lib/market-detail-loader";
import { requestMarketPostDeletion } from "@/lib/market-media-storage";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function MarketDetailController({ id, online, onBack, onDeleted, onExternalLink, onTitleChange }: {
  id: string;
  online: boolean;
  onBack: () => void;
  onDeleted: () => void;
  onExternalLink?: (url: string) => void;
  onTitleChange?: (title: string) => void;
}) {
  const { t } = useLanguage();
  const [payload, setPayload] = useState<MarketDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!online || !id) { setPayload(null); setLoading(false); onTitleChange?.(""); return; }
    let cancelled = false;
    setLoading(true);
    void loadMarketPostDetail(supabase, id).then((value) => {
      if (!cancelled) { setPayload(value); setLoading(false); onTitleChange?.(value?.item?.title || ""); }
    }).catch((error) => {
      console.error("load market detail error:", error);
      if (!cancelled) { setPayload(null); setLoading(false); onTitleChange?.(""); }
    });
    return () => { cancelled = true; };
  }, [id, online, onTitleChange]);

  async function updateStatus(nextStatus: "active" | "ended") {
    const item = payload?.item;
    if (!online || !item || item.user_id !== payload?.currentUserId || working) return;
    setWorking(true);
    const result = nextStatus === "ended"
      ? await supabase.rpc("end_my_market_post", { p_market_post_id: item.id })
      : await supabase.from("market_posts").update({ status: "active" })
        .eq("id", item.id).eq("user_id", item.user_id).select("id").single();
    if (result.error || (nextStatus === "ended" && result.data !== true)) {
      setWorking(false);
      const message = String(result.error?.message || "");
      window.alert(message.includes("market_post_limit_reached") ? t.market.post_limit_alert
        : message.includes("membership_inactive") ? t.market.membership_required_alert : t.market.status_update_failed);
      return;
    }
    // B R06: publication timestamps come from the server activation trigger.
    const { data: currentPost, error: readbackError } = await supabase
      .from("market_posts")
      .select("status, published_at, updated_at, ended_at")
      .eq("id", item.id)
      .eq("user_id", item.user_id)
      .maybeSingle();
    setWorking(false);
    if (readbackError) console.error("market status readback error:", readbackError);
    setPayload((previous) => previous?.item?.id === item.id && previous.currentUserId === item.user_id
      ? { ...previous, item: { ...previous.item, ...(currentPost || {}), status: nextStatus } }
      : previous);
  }

  async function deletePost() {
    const item = payload?.item;
    if (!online || !item || item.user_id !== payload?.currentUserId || working) return;
    if (!window.confirm(t.market.delete_confirm)) return;
    setWorking(true);
    const result = await requestMarketPostDeletion(item.id);
    setWorking(false);
    if (result.ok) onDeleted();
  }

  return <MarketDetailView payload={online ? payload : null} loading={online && loading} working={working} online={online}
    onBack={onBack} onStatus={(status) => void updateStatus(status)}
    onDelete={() => void deletePost()} onExternalLink={onExternalLink} />;
}
