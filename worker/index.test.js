import assert from "node:assert/strict";
import test from "node:test";

import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair
} from "jose";

import worker, { verifyAccessJwt } from "./index.js";

const env = {
  POLICY_AUD: "test-audience",
  TEAM_DOMAIN: "https://example.cloudflareaccess.com"
};

async function signedToken(overrides = {}) {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.alg = "RS256";
  publicJwk.kid = "test-key";
  publicJwk.use = "sig";

  const claims = {
    audience: env.POLICY_AUD,
    issuer: env.TEAM_DOMAIN,
    ...overrides
  };

  const token = await new SignJWT({ email: "member@example.com" })
    .setProtectedHeader({ alg: "RS256", kid: publicJwk.kid })
    .setIssuedAt()
    .setIssuer(claims.issuer)
    .setAudience(claims.audience)
    .setExpirationTime("5m")
    .sign(privateKey);

  return {
    jwks: createLocalJWKSet({ keys: [publicJwk] }),
    token
  };
}

test("accepts a valid Access JWT", async () => {
  const { jwks, token } = await signedToken();
  await assert.doesNotReject(verifyAccessJwt(token, env, jwks));
});

test("rejects a JWT for another audience", async () => {
  const { jwks, token } = await signedToken({ audience: "other-audience" });
  await assert.rejects(verifyAccessJwt(token, env, jwks));
});

test("rejects a JWT from another issuer", async () => {
  const { jwks, token } = await signedToken({
    issuer: "https://other.cloudflareaccess.com"
  });
  await assert.rejects(verifyAccessJwt(token, env, jwks));
});

test("fails closed when the Access header is absent", async () => {
  const response = await worker.fetch(new Request("https://example.com"), env);
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
