import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { verifyAccessIdentity } from "../functions/access-auth.js";

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

test("Cloudflare Access JWT verification accepts only a valid signed operator identity", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const kid = "bm01-test-key";
  const jwk = publicKey.export({ format: "jwk" });
  jwk.kid = kid;
  jwk.alg = "RS256";
  jwk.use = "sig";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers: { "Content-Type": "application/json" } });
  try {
    const now = Math.floor(Date.now() / 1000);
    const header = encode({ alg: "RS256", kid, typ: "JWT" });
    const payload = encode({
      iss: "https://creatorloop-team.cloudflareaccess.com",
      aud: ["creatorloop-console-audience"],
      email: "Operator@Example.com",
      nbf: now - 5,
      exp: now + 300,
    });
    const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey).toString("base64url");
    const token = `${header}.${payload}.${signature}`;
    const env = { CLOUDFLARE_ACCESS_TEAM_DOMAIN: "creatorloop-team", CLOUDFLARE_ACCESS_AUD: "creatorloop-console-audience" };

    const accepted = await verifyAccessIdentity(new Request("https://ops.creatorloop.net/console/", { headers: { "Cf-Access-Jwt-Assertion": token } }), env, now);
    assert.deepEqual(accepted, { ok: true, email: "operator@example.com" });

    const wrongAudience = await verifyAccessIdentity(new Request("https://ops.creatorloop.net/console/", { headers: { "Cf-Access-Jwt-Assertion": token } }), { ...env, CLOUDFLARE_ACCESS_AUD: "wrong" }, now);
    assert.deepEqual(wrongAudience, { ok: false, status: 401 });

    const unsigned = await verifyAccessIdentity(new Request("https://ops.creatorloop.net/console/"), env, now);
    assert.deepEqual(unsigned, { ok: false, status: 401 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Access verification fails closed when configuration is missing", async () => {
  const result = await verifyAccessIdentity(new Request("https://ops.creatorloop.net/console/"), {});
  assert.deepEqual(result, { ok: false, status: 503 });
});
