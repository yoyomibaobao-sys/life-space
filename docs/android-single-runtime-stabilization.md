# Android bundled runtime stabilization checkpoint

This branch keeps `ANDROID_SINGLE_RUNTIME=1` as an opt-in acceptance mode. The
default Capacitor `server.url` and `errorPath` remain unchanged. No APK or
production deployment is produced by this checkpoint.

## Connectivity and data ownership

`lib/android-connectivity.ts` publishes one observable status. Native Android
uses Capacitor Network `getStatus` and `networkStatusChange`; resume, focus and
visibility recheck it. Browser mode uses browser online/offline events. Shell,
Follow, Market, cloud detail writes, auth restore and pending sync read this
source. A connectivity transition changes mounted data/capabilities without
reloading the document. Discovery, search, public detail, Follow and Market
stop rendering live data as soon as status turns offline. Recovery reloads
current feeds and coalesces owner recovery work by connection epoch.

The remembered local owner identifies IndexedDB data; a verified Supabase
session independently permits cloud workspace access. Explicit Android logout
clears cloud snapshots according to the existing pending preservation rule,
but retains the remembered local owner and local projects.

## Route capability matrix

| Entry | Classification | Offline | Online |
| --- | --- | --- | --- |
| My Space, local archive, category settings | hybrid | IndexedDB | Same shell plus cloud controller |
| Recent browsing | hybrid | Local history summaries | Local history enriched with live metadata and covers |
| Trash | hybrid | Local deleted cycles | Local section plus external cloud trash entry |
| Guide list and detail | hybrid | Bundled/stored directory and overview | Plant directory and live guide data |
| Discovery, search, experience, Follow, Market, archive detail | online controller | Unavailable or owned cloud cache | Same shell controller/live data |
| Membership payment and benefits, helpful/flowers/followers, user profile, admin, legal, feedback, account web functions, market subpages | online web | Network required | Capacitor Browser custom tab at `https://life-space.uk` |
| Unregistered paths | unsupported | Stay in shell | Stay in shell; no document navigation |

The Browser custom tab leaves the bundled WebView mounted and resolves the
remote URL outside its local asset server. It may have a separate browser
session and can ask the user to sign in. Inline order status uses authenticated
Supabase data in `AndroidProfileController`. Backup/export and account controls
open the website profile; their exact web subsections are not deep linked.

## Cloud cache diagnosis and repair boundary

`diagnoseCloudOfflineCache(ownerContext)` is read only. Refresh logs raw row
count, unique source count, rows per source, owner, status, cache ID and pending
record/image counts before and after work. The 9-to-17 device database is not
available in this cloud checkout. Do not infer whether 17 represents 17 active
cloud projects until its device log is captured and compared with the live
archive list.

Refresh is single flight per owner and writes are serialized per owner/source.
New sources use a deterministic cache ID; legacy IDs stay in place. Visible
cards count unique cloud source IDs. The manual
`repairDiagnosedCloudCacheDuplicates` function checks the exact cache IDs from
a previous diagnosis, moves pending records and images (including a pending
image's synced parent) to the newest row, and removes only redundant synced
rows in one transaction. **Nothing calls this function automatically.** Review
the device diagnosis and user data before invoking it on a real installation.

## Remaining device checks

- Measure native status bar bounds, header bounding rectangle and computed top
  inset on the actual Android 15/target device. The bundled CSS assigns top
  inset `0px` because `StatusBar.overlaysWebView=false` positions the WebView
  below the native bar. This is a code contract, not a device measurement.
- Verify native Network hot toggle, Browser custom tab session behavior,
  Turnstile, cloud taxonomy RLS and guide appearance on the installed sr2 APK
  after a new acceptance build. No APK is built in this task.
- The online guide list still uses the existing PlantPage presentation while
  the offline directory uses the shared home tabs and cached summary list;
  further visual parity needs device review.
- Public record cards currently use a read-only record renderer inside the
  canonical detail hierarchy; owner records use `ArchiveRecordCard`.
