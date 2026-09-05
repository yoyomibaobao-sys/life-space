import app from "vinext/server/fetch-handler";
import {
  R2_CANARY_PATH,
  handleR2CanaryRequest,
} from "./r2-canary.mjs";
import { runScheduledMaintenance } from "./scheduled-maintenance.mjs";

const worker = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === R2_CANARY_PATH) {
      return handleR2CanaryRequest(request, env);
    }

    return app.fetch(request, env, ctx);
  },

  async scheduled(_controller, env, ctx) {
    await runScheduledMaintenance(app, env, ctx);
  },
};

export default worker;
