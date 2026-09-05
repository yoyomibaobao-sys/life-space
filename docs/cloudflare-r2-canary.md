# Cloudflare Workers + R2 canary

This configuration creates a parallel Cloudflare test deployment. It does not
change the Vercel production deployment, migrate user media, or replace
Supabase Storage.

## Scope

- `life-space-canary` runs the existing Next.js application through vinext on
  Cloudflare Workers.
- `life-space-media-canary` is an isolated R2 Standard bucket used only for
  write/read/delete checks.
- The Worker compiles with the production Supabase project URL and a modern
  low-privilege publishable key, so email/password sign-in and RLS-protected
  application data can be tested on the canary. No secret/service-role key is
  present in the client bundle or Worker configuration.
- `POST /__canary/r2` writes a small random object, reads and verifies it, then
  deletes it. The endpoint requires the `R2_CANARY_SECRET` Worker secret.
- Existing application media continues to use Supabase Storage. Moving real
  media to R2 requires a separate capacity-ledger, signed-access, deletion,
  export, and rollback migration.
- The Worker includes a scheduled-maintenance handler that reuses the existing
  secret-protected lifecycle and Storage deletion route. The canary config does
  not declare a Cron Trigger, so deploying it cannot start another production
  maintenance schedule.

## Current compatibility result

- `vinext check` reports 96% compatibility: no unsupported APIs and one partial
  item (`next/font/google`). The production Workers build downloads and bundles
  the Geist font files, so the deployed page does not need Google Fonts at
  runtime.
- Both the normal `next build` and `vinext build` complete successfully. Vercel
  remains available while the Worker is tested in parallel. Signed-in canary
  users reach the same Supabase project and remain governed by its existing
  Row Level Security policies.
- The R2 handler has executable tests for wrong method, wrong token, successful
  write/read/delete, and zero residual objects. A real R2 bucket test is still
  required after the isolated Cloudflare resources are created.

## One-time Cloudflare setup

1. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub Actions
   repository secrets. The token is limited to `Workers Scripts: Edit` and
   `Workers R2 Storage: Edit` for the selected account.
2. Merge or manually run `.github/workflows/cloudflare-canary.yml`. The workflow
   creates `life-space-media-canary` only when it does not already exist, builds
   and deploys `life-space-canary`, rotates canary-only Worker secrets, and
   verifies an R2 write/read/delete round trip. Each run writes a
   `Cloudflare canary` success or failure status, linked to its Actions log, on
   the deployed commit.
3. The canary uses the same Supabase public URL and publishable key as the
   application. A publishable key is intentionally safe for browser bundles and
   public source; authorization still comes from the signed-in user's token and
   Row Level Security. Add `SUPABASE_SERVICE_ROLE_KEY` and a stable
   `CRON_SECRET` as Worker secrets only when the related server routes and
   scheduled handler are tested. Never commit those elevated values or paste
   them into an issue or pull request. Do not add a Cron Trigger to the canary
   while the Vercel Cron remains active.

The workflow is the preferred non-interactive path. For local-only recovery,
`npx wrangler login`, `npm run build:vinext`, and `npm run deploy:vinext` remain
available.

The canary should stay on its generated `workers.dev` address and remain out of
search indexes. Do not attach the production domain or disable the Vercel
deployment during this phase.

## R2 verification

After deployment, set `CLOUDFLARE_CANARY_URL` and `R2_CANARY_SECRET` only in the
local shell, then run:

```sh
npm run test:r2-canary
```

A passing result confirms R2 write, read, and cleanup. It does not authorize
moving real user media.

## Cutover blockers

- Supabase Auth `Redirect URLs` must include the exact Cloudflare canary origin
  with `/**` before signup confirmation and password reset are tested there.
  Keep the current production `Site URL` unchanged until final cutover.
- Vercel Cron currently invokes the storage-deletion route. The Cloudflare
  scheduled handler is present but deliberately has no canary trigger. During
  final cutover, disable the Vercel Cron and add `17 3 * * *` to Cloudflare in
  the same controlled release, then verify the first Cron Event before relying
  on it.
- China-mainland access, Google font behavior, all API routes, Android deep
  links, downloads, the manual PayPal payment return flow, export, and deletion
  flows must pass on the canary.
- The current PayPal flow is an external fixed-price payment page followed by a
  proof upload and administrator confirmation. There is no PayPal webhook or
  callback endpoint in this repository, so no PayPal callback URL changes are
  needed for the canary.
- Real media can move only after R2 capacity accounting, private-object access,
  deletion queues, export, and rollback have dedicated database migrations and
  isolated tests.
