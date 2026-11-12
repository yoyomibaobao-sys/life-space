/* Server-only QA page gate. Client JS is a separate QA-only static asset. */

const QA_ORIGIN = "https://lifespace-site-media-qa-20261028.lifespace-assets-isolated-lab.workers.dev";
export const M4_QA_PAGE = "/__qa/m4-controlled-mirror";
export const M4_QA_CLIENT = "/__qa/m4-controlled-mirror.js";

const secureHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "Cross-Origin-Resource-Policy": "same-origin",
};
const html = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>LifeSpace｜M4隔离QA单次镜像</title>
<style>body{font:16px/1.65 system-ui,sans-serif;max-width:660px;margin:25px auto;padding:0 18px;color:#193027}h1{font-size:24px}section{padding:16px;border:1px solid #bec9bd;border-radius:10px;margin:16px 0;background:#f7f9f7}button{padding:12px 18px;font:inherit;border:0;border-radius:7px;background:#235943;color:#fff;cursor:pointer}button:disabled{opacity:.55;cursor:default}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;background:#edf3ef;padding:12px;max-height:390px;overflow:auto}</style>
</head><body><main>
<h1>M4｜仅隔离QA：指定媒体镜像</h1>
<p>仅用于现有QA账号A和固定私密媒体。不提供生产业务入口。原图与缩略图镜像不会删除Supabase原件。</p>
<section><strong>已指定操作</strong><pre id="m4-review">正在加载指定媒体…</pre></section>
<section><strong>身份检查</strong><p id="m4-account-status" role="status">正在核验身份…</p>
<button id="m4-run-once" type="button" disabled>执行一次受控原图＋缩略图镜像</button></section>
<section><strong>脱敏HTTP回执（仅在点击后产生）</strong><pre id="m4-receipt" role="status">未执行，暂无写入请求。D组读回需完整成功回执。</pre></section>
</main><script src="${M4_QA_CLIENT}?v=112r01" defer></script></body></html>`;

export function handleM4QaControlledUi(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== M4_QA_PAGE) return null;
  // Production is impossible to enable by flag alone: the exact QA origin is mandatory.
  if (url.origin !== QA_ORIGIN || env?.R2_BUSINESS_MEDIA_MODE !== "isolated" ||
      env?.M4_QA_CONTROL_UI_ENABLED !== "true") {
    return Response.json({ error: "not_found" }, { status: 404, headers: secureHeaders });
  }
  if (request.method !== "GET") {
    return Response.json({ error: "method_not_allowed" }, { status: 405, headers: secureHeaders });
  }
  return new Response(html, {
    headers: {
      ...secureHeaders,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; script-src 'self'; connect-src 'self' https://mablwxlipcgbmbnfdbkc.supabase.co; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
    },
  });
}
