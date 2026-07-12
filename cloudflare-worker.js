// Rose City Clinics Demo Proxy Worker
// Deploy: wrangler deploy (from this folder, after wrangler login)
//
// Secrets to set before deploying (never hardcode these):
//   wrangler secret put ANTHROPIC_API_KEY
//   wrangler secret put DEMO_PASSWORD
//
// This worker validates the demo password, rate-limits by IP, forwards ONLY
// the fields the demo actually needs to the Anthropic API, and ignores/
// overrides anything a caller tries to inject (model, max_tokens). The API
// key never appears in the HTML and can't be exfiltrated by inflating a
// request — the worst a bad actor can do is burn 20 requests/min of a
// capped, fixed-shape call.

const ALLOWED_ORIGIN = "https://alexdoster.github.io";
const MODEL = "claude-sonnet-4-6"; // hardcoded — client-supplied model is ignored
const MAX_TOKENS_CEILING = 1024;   // demo's real usage tops out at 800

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
    }

    const password = request.headers.get("X-Demo-Password");
    if (!password || password !== env.DEMO_PASSWORD) {
      return json({ error: { message: "Invalid password" } }, 403);
    }

    // Rate limit per client IP. Fails open (allows the request) if the
    // binding isn't configured, so a missing wrangler.toml setting doesn't
    // brick the demo — it just means rate limiting isn't active yet.
    const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
    if (env.RATE_LIMITER) {
      const { success } = await env.RATE_LIMITER.limit({ key: clientIP });
      if (!success) {
        return json({ error: { message: "Rate limit exceeded. Please wait a moment." } }, 429);
      }
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: { message: "Invalid JSON body" } }, 400);
    }

    if (!body.system || !Array.isArray(body.messages) || body.messages.length === 0) {
      return json({ error: { message: "Malformed request" } }, 400);
    }

    // Only forward the fields the demo needs, with the model and token cap
    // pinned server-side — a tampered client payload can't request a
    // different (pricier) model or an unbounded response.
    const upstreamBody = {
      model: MODEL,
      max_tokens: Math.min(Number(body.max_tokens) || 800, MAX_TOKENS_CEILING),
      system: String(body.system).slice(0, 20000),
      messages: body.messages
    };

    const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(upstreamBody)
    });

    const data = await anthropicResp.json();
    return json(data, anthropicResp.status);
  }
};

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() }
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Demo-Password"
  };
}
