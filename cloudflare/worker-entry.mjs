import app from "vinext/server/fetch-handler";
import {
  R2_CANARY_PATH,
  handleR2CanaryRequest,
} from "./r2-canary.mjs";

const worker = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === R2_CANARY_PATH) {
      return handleR2CanaryRequest(request, env);
    }

    return app.fetch(request, env, ctx);
  },
};

export default worker;
