# Cloudflare Workers + R2 canary

This configuration creates a parallel Cloudflare test deployment. It does not
change the Vercel production deployment, migrate user media, or replace
Supabase Storage.

## Scope

- `life-space-canary` runs the existing Next.js application through vinext on
  Cloudflare Workers.
- `life-space-media-canary` is an isolated R2 Standard bucket used only for
  write/read/delete checks.
- `POST /__canary/r2` writes a small random object, reads and verifies it, then
  deletes it. The endpoint requires the `R2_CANARY_SECRET` Worker secret.
- Existing application media continues to use Supabase Storage. Moving real
  media to R2 requires a separate capacity-ledger, signed-access, deletion,
  export, and rollback migration.

## Current compatibility result

- `vinext check` reports 96% compatibility: no unsupported APIs and one partial
  item (`next/font/google`). The production Workers build downloads and bundles
  the Geist font files, so the deployed page does not need Google Fonts at
  runtime.
- Both the normal `next build` and `vinext build` complete successfully. This
  keeps Vercel available while the Worker is tested in parallel.
- The R2 handler has executable tests for wrong method, wrong token, successful
  write/read/delete, and zero residual objects. A real R2 bucket test is still
  required after the isolated Cloudflare resources are created.

## One-time Cloudflare setup

1. Log in with `npx wrangler login`.
2. Enable R2 for the Cloudflare account, then create the canary bucket:
   `npx wrangler r2 bucket create life-space-media-canary`.
3. Add `R2_CANARY_SECRET` with `npx wrangler secret put R2_CANARY_SECRET`.
4. Configure the same Supabase public URL/key used by the Vercel preview. Add
   `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` as Worker secrets only when the
   related server routes are tested. Never commit their values or paste them
   into an issue or pull request.
5. Build with `npm run build:vinext`, then deploy with
   `npm run deploy:vinext`.

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
- Vercel Cron currently invokes the storage-deletion route. A Cloudflare
  scheduled handler must be added and tested before production cutover.
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
