# Android bundled runtime stabilization checkpoint

This branch keeps `ANDROID_SINGLE_RUNTIME=1` as an opt-in acceptance mode. The
default Capacitor `server.url` and `errorPath` remain unchanged. No APK or
production deployment is produced by this checkpoint.

## Connectivity and data ownership

`lib/android-connectivity.ts` publishes transport, service and final business
status. Capacitor Network only determines `connected` or `disconnected`.
Connected transport enters `checking`; a native `CapacitorHttp` request to
`https://life-space.uk/api/health` must return `{ "ok": true }` before the app
becomes online. Failed or timed-out health checks make the app offline. The
probe has a 2500 ms timeout, debounce, single-flight execution and a generation
guard so an old response cannot overwrite a newer transport transition.

Initial boot, native network changes, resume, focus, visible
`visibilitychange`, disconnected-to-connected transitions and manual reconnect
all recheck reachability. Wi-Fi, mobile data and VPN are only possible network
paths; no VPN flag is a LifeSpace product state. A transport with an
unreachable LifeSpace service is offline, while a reachable service without a
VPN is online.

The remembered local owner identifies IndexedDB data; a verified Supabase
session independently permits cloud workspace access.
`lib/android-auth-state.ts` is the bundled Android auth state machine. Its
`checking`, `signed-out` and `signed-in` states do not derive from connectivity.
A persisted, previously validated session remains signed in while the service
is offline. Recovery revalidates the same session without first publishing
signed-out. Only explicit logout or a server-confirmed invalid session can
publish signed-out.

The four business combinations are:

1. Online + signed-in: live cloud, local data and authenticated online
   capabilities.
2. Online + signed-out: local data and public online content; no private cloud
   data or cloud writes.
3. Offline + signed-in: local data, the same owner's cloud cache and pending
   queue, including offline pending cloud work.
4. Offline + signed-out: local data and bundled public material only; no
   private cache or pending writes under an old identity.

Explicit logout works online or offline. It writes the explicit signed-out
marker, clears the locally recoverable Supabase session and removes synced
cloud snapshots under the existing cache rule. It retains remembered local
ownership, local-only projects and every pending cloud project, record and
image. Pending rows remain scoped to their original owner: only the same
account can resume them; a different account cannot list or sync them.

Connectivity transitions change mounted data sources and capabilities only.
They do not reload or replace the document, reset the current screen, clear
authenticated identity or force a login route.

Android presentation remains one shared presentation with different data
sources and capabilities. Live cloud, cloud cache, pending cloud and local-only
are data/runtime states, not four separate user spaces. The user-facing source
model remains cloud and local.

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
- Follow presentation parity remains for the next UI round.
- Market internal detail remains for the next UI round.
- Guide presentation parity remains for the next UI round.
- Project-card action menus and final Profile parity remain for later rounds.
- The centered add action and the complete +Project flow are not completed by
  this auth/connectivity checkpoint.
