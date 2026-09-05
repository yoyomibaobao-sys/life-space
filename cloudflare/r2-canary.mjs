export const R2_CANARY_PATH = "/__canary/r2";

const R2_CANARY_PREFIX = "__life-space_canary__/";

function noStoreJson(body, status) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function constantTimeEqual(left, right) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }

  return difference === 0;
}

function isAuthorized(request, expectedSecret) {
  if (!expectedSecret) return false;
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const suppliedSecret = match?.[1]?.trim() || "";
  return constantTimeEqual(suppliedSecret, expectedSecret);
}

async function runR2Canary(env) {
  if (!env.R2_MEDIA_CANARY) {
    return noStoreJson({ ok: false, error: "r2_binding_missing" }, 503);
  }

  const key = `${R2_CANARY_PREFIX}${crypto.randomUUID()}.txt`;
  const payload = `life-space-r2-canary:${crypto.randomUUID()}`;
  let wroteObject = false;

  try {
    await env.R2_MEDIA_CANARY.put(key, payload, {
      httpMetadata: { contentType: "text/plain; charset=utf-8" },
      customMetadata: { purpose: "life-space-canary" },
    });
    wroteObject = true;

    const object = await env.R2_MEDIA_CANARY.get(key);
    if (!object || (await object.text()) !== payload) {
      return noStoreJson({ ok: false, error: "r2_round_trip_mismatch" }, 502);
    }

    await env.R2_MEDIA_CANARY.delete(key);
    wroteObject = false;

    const residual = await env.R2_MEDIA_CANARY.head(key);
    if (residual) {
      return noStoreJson({ ok: false, error: "r2_cleanup_failed" }, 502);
    }

    return noStoreJson({ ok: true, write: true, read: true, cleanup: true }, 200);
  } catch {
    return noStoreJson({ ok: false, error: "r2_canary_failed" }, 502);
  } finally {
    if (wroteObject) {
      await env.R2_MEDIA_CANARY.delete(key).catch(() => undefined);
    }
  }
}

export async function handleR2CanaryRequest(request, env) {
  if (request.method !== "POST") {
    return noStoreJson({ ok: false, error: "method_not_allowed" }, 405);
  }

  if (!isAuthorized(request, env.R2_CANARY_SECRET)) {
    return noStoreJson({ ok: false, error: "unauthorized" }, 401);
  }

  return runR2Canary(env);
}
