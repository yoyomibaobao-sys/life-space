import app from "vinext/server/fetch-handler";
import {
  R2_CANARY_PATH,
  handleR2CanaryRequest,
} from "./r2-canary.mjs";
import {
  handleAndroidReleaseDownload,
  isAndroidReleaseDownloadPath,
} from "./android-release-download.mjs";
import { runScheduledMaintenance } from "./scheduled-maintenance.mjs";
import { handleM4QaControlledUi } from "./m4-qa-controlled-page.mjs";
import {
  R2_BUSINESS_MIRROR_PATH,
  handleR2BusinessUserMirrorRequest,
} from "./r2-media-user-gateway.mjs";

const worker = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const qaUi = handleM4QaControlledUi(request, env);
    if (qaUi) return qaUi;

    if (url.pathname === R2_BUSINESS_MIRROR_PATH) {
      return handleR2BusinessUserMirrorRequest(request, env);
    }

    if (url.pathname === R2_CANARY_PATH) {
      return handleR2CanaryRequest(request, env);
    }

    if (url.pathname === "/download/android") {
      const fallbackUrl = new URL("/api/download/android", url.origin);
      fallbackUrl.searchParams.set("source", "official_download");
      return Response.redirect(fallbackUrl.toString(), 302);
    }

    if (isAndroidReleaseDownloadPath(url.pathname)) {
      return handleAndroidReleaseDownload(request, env);
    }

    return app.fetch(request, env, ctx);
  },

  async scheduled(_controller, env, ctx) {
    await runScheduledMaintenance(app, env, ctx);
  },
};

export default worker;
