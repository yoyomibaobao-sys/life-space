import assert from "node:assert/strict";
import { test } from "node:test";
import { webcrypto, createHash } from "node:crypto";
import mediaWorker from "../cloudflare/qa-media-r2-read-overlay-r02.mjs";
import { createR2InternalReadHeaders, R2_BUSINESS_INTERNAL_READ_PATH } from "../lib/r2-media-read-service-auth.mjs";
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const owner = "45bf1d5f-73b3-455d-b598-3a652a14fd4f";
const path = owner + "/original.jpg";
const secret = "isolated-test-service-secret-1234567890";
const bytes = Uint8Array.from([0xff,0xd8,0xff,0xd9]);
const sha = createHash("sha256").update(bytes).digest("hex");
const url = "https://media.internal" + R2_BUSINESS_INTERNAL_READ_PATH;
const env = () => ({R2_BUSINESS_MEDIA_MODE:"isolated", R2_MEDIA_SERVICE_AUTH_SECRET:secret,
  QA_TOKEN:"existing_qa_token", R2_BUSINESS_MEDIA:{
    async get(key){assert.equal(key,path);return {size:bytes.length,
      customMetadata:{sha256:sha},httpMetadata:{contentType:"image/jpeg"},
      async arrayBuffer(){return bytes.buffer}};}
  }});
test("existing QA media Worker now rejects unsigned read-by-path",async()=>{
  const r=await mediaWorker.fetch(new Request(url),env());
  assert.equal(r.status,401);
  assert.match(r.headers.get("cache-control"),/no-store/);
});
test("internal HMAC read returns verified bytes and zero-cache response",async()=>{
  const headers=await createR2InternalReadHeaders({secret,ownerId:owner,path});
  const r=await mediaWorker.fetch(new Request(url,{headers}),env());
  assert.equal(r.status,200);
  assert.equal(r.headers.get("cdn-cache-control"),"no-store");
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()),bytes);
});
test("remote M4 source preserves pre-existing stage route and QA auth guard",async()=>{
  const e=env();
  const stage=await mediaWorker.fetch(new Request("https://media.internal/__internal/r2/business-media/stage-bytes",{method:"POST"}),e);
  assert.equal(stage.status,401);
  const unknown=await mediaWorker.fetch(new Request("https://media.internal/__qa/m4-testrun"),e);
  assert.equal(unknown.status,401);
});
