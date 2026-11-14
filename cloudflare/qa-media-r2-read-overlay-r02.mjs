/**
 * QA-only R02 overlay around the EXACT deployed media M4 source fetched from
 * Cloudflare version f1947526-4ea6-4394-8679-0cbc5faaa364.
 * Upstream SHA-256: 994cf017350c4148e42438706c365b1c23d586e8588f687e64fc8486de0f3fa5.
 * Keep legacy QA mirror, stage, recovery, and auth routes unchanged.
 */
import currentQaWorker from "./qa-media-m4-20261113-upstream.mjs";
import { R2_BUSINESS_INTERNAL_READ_PATH } from "../lib/r2-media-read-service-auth.mjs";
import { handleR2InternalReadRequest } from "./r2-media-business.mjs";

export default {
  async fetch(request, env, ctx) {
    if (request.method === "GET" &&
        new URL(request.url).pathname === R2_BUSINESS_INTERNAL_READ_PATH) {
      return handleR2InternalReadRequest(request, env);
    }
    return currentQaWorker.fetch(request, env, ctx);
  },
};
