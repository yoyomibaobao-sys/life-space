import test from "node:test";
import assert from "node:assert/strict";
import { handleR2BusinessUserMirrorRequest, R2_BUSINESS_MIRROR_PATH } from "../cloudflare/r2-media-user-gateway.mjs";

const owner = "45bf1d5f-73b3-455d-b598-3a652a14fd4f";
const viewer = "867387ba-eb8a-4233-860b-86531533fd56";
const id = "ad6c0b1c-425e-4b1c-a2e5-4e0026bc4a6c";
const path = owner + "/records/owner.jpg";
const jpeg = Uint8Array.from([255, 216, 255, 1, 2, 255, 217]);

function request(headers = {}) {
  return new Request("https://site.example" + R2_BUSINESS_MIRROR_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ businessType: "archive", businessId: id, variant: "full" }),
  });
}
function fixture(currentUser = owner, options = {}) {
  let rpcCalls = 0, storageCalls = 0, mirrorCalls = 0, limiterCalls = 0;
  const env = {
    R2_BUSINESS_MEDIA_MODE: "isolated",
    R2_MEDIA_SERVICE_AUTH_SECRET: "isolation-test-secret-of-at-least-thirty-two-chars",
    R2_BUSINESS_MEDIA_SERVICE: {
      async fetch(req) {
        mirrorCalls++;
        assert.equal(req.headers.has("cookie"), false);
        assert.equal(req.headers.has("authorization"), false);
        assert.equal(req.headers.has("apikey"), false);
        assert.ok(req.headers.get("x-ls-signature"));
        assert.equal(new URL(req.url).pathname, "/__internal/r2/business-media/stage-bytes");
        return Response.json({ status: "copied_verified" }, { status: 200 });
      },
    },
    ...(options.noLimiter ? {} : {
      R2_MEDIA_MIRROR_RATE_LIMITER: {
        async limit({ key }) {
          limiterCalls++;
          assert.equal(key, "mirror:" + currentUser);
          return { success: options.rateAllowed !== false };
        },
      },
    }),
  };
  const dependencies = {
    createUserClient() {
      return {
        accessToken: "mock-JWT",
        cookieWrites: [],
        supabase: {
          auth: {
            async getUser() {
              return { data: { user: { id: currentUser } }, error: null };
            },
          },
          storage: {
            from(bucket) {
              assert.equal(bucket, "media");
              return {
                async download(name) {
                  storageCalls++;
                  assert.equal(name, path);
                  return { data: new Blob([jpeg], { type: "image/jpeg" }), error: null };
                },
              };
            },
          },
        },
      };
    },
    createAdminClient() {
      return {
        from(table) {
          assert.equal(table, "archives");
          return {
            select() {
              return {
                eq() {
                  return {
                    async maybeSingle() {
                      return {
                        data: {
                          user_id: owner,
                          is_public: true,
                          trashed_at: null,
                          cover_image_path: path,
                          cover_thumb_path: null,
                        },
                        error: null,
                      };
                    },
                  };
                },
              };
            },
          };
        },
        async rpc(name) {
          assert.equal(name, "get_referenced_storage_paths");
          rpcCalls++;
          return { data: [{ object_path: path }], error: null };
        },
      };
    },
  };
  return { env, dependencies, counts: () => ({ rpcCalls, storageCalls, mirrorCalls, limiterCalls }) };
}

test("cookie write fails closed without Origin, cross-Origin, cross-site, or JSON", async () => {
  const f = fixture();
  const combinations = [
    [request({ cookie: "session=example" }), 403, "origin_required"],
    [request({ cookie: "session=example", origin: "https://evil.example" }), 403, "origin_not_allowed"],
    [request({ authorization: "Bearer test", "sec-fetch-site": "cross-site" }), 403, "cross_site_not_allowed"],
    [request({ authorization: "Bearer test", "Content-Type": "text/plain" }), 415, "json_required"],
  ];
  for (const [req, status, expected] of combinations) {
    const response = await handleR2BusinessUserMirrorRequest(req, f.env, f.dependencies);
    assert.equal(response.status, status);
    assert.equal((await response.json()).error, expected);
  }
  assert.equal(f.counts().mirrorCalls, 0);
  assert.equal(f.counts().rpcCalls, 0);
});

test("mirror fails closed when rate-limit binding is missing or rejects request", async () => {
  for (const [options, code, expected] of [
    [{ noLimiter: true }, 503, "mirror_rate_limit_not_configured"],
    [{ rateAllowed: false }, 429, "rate_limited"],
  ]) {
    const f = fixture(owner, options);
    const response = await handleR2BusinessUserMirrorRequest(
      request({ authorization: "Bearer mock-JWT" }), f.env, f.dependencies);
    assert.equal(response.status, code);
    assert.equal((await response.json()).error, expected);
    assert.equal(f.counts().mirrorCalls, 0);
    assert.equal(f.counts().storageCalls, 0);
  }
});

test("non-owner cannot trigger R2 write even if media is publicly readable", async () => {
  const f = fixture(viewer);
  const response = await handleR2BusinessUserMirrorRequest(
    request({ authorization: "Bearer mock-JWT" }), f.env, f.dependencies);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, "media_unavailable");
  assert.equal(f.counts().mirrorCalls, 0);
  assert.equal(f.counts().storageCalls, 0);
});

test("owner authenticated write verifies business reference, source bytes and internal signature", async () => {
  const f = fixture(owner);
  const response = await handleR2BusinessUserMirrorRequest(
    request({ authorization: "Bearer mock-JWT" }), f.env, f.dependencies);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "copied_verified");
  assert.deepEqual(f.counts(), {
    rpcCalls: 2,
    storageCalls: 1,
    mirrorCalls: 1,
    limiterCalls: 1,
  });
});
