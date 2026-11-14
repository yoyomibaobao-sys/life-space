import {
  handleR2MediaStageBytesRequest,
  R2_BUSINESS_STAGE_BYTES_PATH,
} from "./r2-media-stage-bytes.mjs";
import { R2_BUSINESS_INTERNAL_READ_PATH } from "../lib/r2-media-read-service-auth.mjs";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

function reject(status, error) {
  return Response.json({ error }, { status, headers: NO_STORE });
}

// Private service-binding target only. No workers.dev host, public route,
// migration endpoint, QA fixture, or scheduled task is exposed by this entry.
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === R2_BUSINESS_INTERNAL_READ_PATH) {
      if (request.method !== "GET") return reject(405, "method_not_allowed");
      return handleR2MediaStageBytesRequest(request, env);
    }
    if (pathname === R2_BUSINESS_STAGE_BYTES_PATH) {
      if (request.method !== "POST") return reject(405, "method_not_allowed");
      return handleR2MediaStageBytesRequest(request, env);
    }
    return reject(404, "not_found");
  },
};
