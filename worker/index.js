import { createRemoteJWKSet, jwtVerify } from "jose";

const jwksByTeamDomain = new Map();

function forbidden() {
  return new Response("Forbidden", {
    status: 403,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8"
    }
  });
}

function remoteJwks(teamDomain) {
  let jwks = jwksByTeamDomain.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`${teamDomain}/cdn-cgi/access/certs`)
    );
    jwksByTeamDomain.set(teamDomain, jwks);
  }
  return jwks;
}

export async function verifyAccessJwt(token, env, jwks) {
  if (!token || !env.TEAM_DOMAIN || !env.POLICY_AUD) {
    throw new Error("Missing Cloudflare Access configuration or token");
  }

  await jwtVerify(token, jwks ?? remoteJwks(env.TEAM_DOMAIN), {
    issuer: env.TEAM_DOMAIN,
    audience: env.POLICY_AUD
  });
}

function secureAssetResponse(response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Robots-Tag", "noindex, nofollow");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request, env) {
    const token = request.headers.get("cf-access-jwt-assertion");

    try {
      await verifyAccessJwt(token, env);
    } catch {
      return forbidden();
    }

    return secureAssetResponse(await env.ASSETS.fetch(request));
  }
};
