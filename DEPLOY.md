# Rose City Clinics Demo — Deployment

## One-time setup

1. `npm install -g wrangler` (if not already installed)
2. `wrangler login`
3. From this `demo/` folder:
   ```
   wrangler secret put ANTHROPIC_API_KEY
   wrangler secret put DEMO_PASSWORD
   ```
4. **Set a monthly spend cap** on this key's workspace in the Anthropic
   Console before going live — this is the real backstop, not the code.
5. `wrangler deploy`
6. Confirm the deployed URL matches `WORKER_URL` in `index.html` (currently
   `https://rosecity-proxy.alex80ad.workers.dev`) — Cloudflare assigns the
   subdomain from the `name` field in `wrangler.toml`, adjust if it differs.

## GitHub Pages hosting

- Push `index.html` to the repo's default branch, enable Pages.
- Push the CSVs in `data/` to a branch literally named `data` — `index.html`
  fetches them from `raw.githubusercontent.com/.../data/<table>.csv` at
  runtime (see `BASE` constant). Nothing else needs that branch.
- If the Pages URL isn't `alexdoster.github.io/rosecity-demo/`, update
  `ALLOWED_ORIGIN` in `cloudflare-worker.js` and redeploy the Worker, or the
  demo's fetch calls will be blocked by CORS.

## What's hardened vs. the original TOC worker

- Model and `max_tokens` are pinned server-side — a tampered request can't
  demand a pricier model or an unbounded response.
- CORS restricted to the GitHub Pages origin instead of `*`.
- Per-IP rate limiting via the native Workers rate-limiting binding (20
  req/min) — no KV setup, no custom domain required.
- Password check is unchanged from the TOC version.

## Rotating the demo password later

`wrangler secret put DEMO_PASSWORD` again with a new value, no redeploy
needed beyond that.
