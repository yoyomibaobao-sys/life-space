import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("space and Market notifications stay in separate surfaces", async () => {
  const [
    types,
    spacePage,
    mobileSpaceLink,
    navbar,
    marketPage,
    marketLink,
    marketMessages,
    marketComments,
    migration,
    zhCopy,
  ] = await Promise.all([
    source("lib/notification-types.ts"),
    source("app/notifications/page.tsx"),
    source("components/mobile/MobileNotificationLink.tsx"),
    source("components/navbar.tsx"),
    source("app/market/page.tsx"),
    source("components/market/MarketMessageLink.tsx"),
    source("app/market/messages/page.tsx"),
    source("components/market/MarketCommentsSection.tsx"),
    source("supabase/migrations/20260821120000_split_space_and_market_notifications.sql"),
    source("lib/i18n/zh.ts"),
  ]);

  assert.match(types, /market_comment/);
  assert.match(types, /market_reply/);
  assert.match(spacePage, /\.not\("type", "in", MARKET_NOTIFICATION_FILTER\)/);
  assert.match(mobileSpaceLink, /MARKET_NOTIFICATION_FILTER/);
  assert.match(navbar, /MARKET_NOTIFICATION_FILTER/);
  assert.match(marketPage, /<MarketMessageLink compact=\{isMobileViewport\} \/>/);
  assert.match(marketLink, /href="\/market\/messages"/);
  assert.match(marketMessages, /\.in\("type", \[\.\.\.MARKET_NOTIFICATION_TYPES\]\)/);
  assert.match(marketComments, /payload\.parent_comment_id = replyTarget\.id/);
  assert.match(marketComments, /isMissingParentCommentColumn/);
  assert.match(marketComments, /repliesSupported && canWrite/);
  assert.match(marketComments, /id=\{`market-comment-\$\{comment\.id\}`\}/);
  assert.match(migration, /trg_notify_market_comment_insert/);
  assert.match(migration, /'market_comment'/);
  assert.match(migration, /'market_reply'/);
  assert.match(zhCopy, /messages: "消息"/);
  assert.match(zhCopy, /messages_subtitle: "留言、回复和咨询提醒"/);
});

test("follow status label is concise", async () => {
  const zhCopy = await source("lib/i18n/zh.ts");
  assert.match(zhCopy, /status_all: "全部"/);
  assert.doesNotMatch(zhCopy, /status_all: "全部状态"/);
});
