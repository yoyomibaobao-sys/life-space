import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { cdnAdapter } from "@vinext/cloudflare/cache/cdn-adapter";

export default defineConfig({
  define: {
    // Build scope is set by scripts/build-vinext.mjs before Vite loads this config.
    // The formal Worker must tree-shake QA-only route handlers and host constants.
    "process.env.NEXT_PUBLIC_LIFESPACE_BUILD_SCOPE": JSON.stringify(
      process.env.NEXT_PUBLIC_LIFESPACE_BUILD_SCOPE || "dynamic",
    ),
  },
  plugins: [
    vinext({
      cache: { cdn: cdnAdapter() },
    }),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
