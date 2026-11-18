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

import {
  R2_BUSINESS_MIRROR_PATH,
  R2_BUSINESS_VIEW_PATH,
  handleR2BusinessUserReadRequest,
  handleR2BusinessUserMirrorRequest,
} from "./r2-media-user-gateway.mjs";

const worker = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // This route is compiled only into explicitly QA-scoped Worker builds.
    // Production builds replace the scope at build time and tree-shake the
    // handler module, including its QA origin and Supabase CSP constants.
    if (process.env.NEXT_PUBLIC_LIFESPACE_BUILD_SCOPE !== "production") {
      const { handleM4QaControlledUi } = await import("./m4-qa-controlled-page.mjs");
      const qaUi = handleM4QaControlledUi(request, env);
      if (qaUi) return qaUi;
    }

    if (url.pathname === R2_BUSINESS_VIEW_PATH && env?.R2_BUSINESS_MEDIA_MODE === "isolated") {
      return handleR2BusinessUserReadRequest(request, env);
    }

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
