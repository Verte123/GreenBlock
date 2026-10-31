// GreenBlock relay helper — a Cloudflare Worker.
//
// Phones on mobile data often can't connect to each other directly, so the game
// asks this Worker for short-lived passwords to Cloudflare's TURN relay. The relay
// is only used when a direct connection fails.
//
// It needs two secrets (Worker → Settings → Variables and Secrets → Add, type "Secret"):
//   TURN_KEY_ID          — the "Turn Token ID" from Cloudflare Realtime → TURN Server
//   TURN_KEY_API_TOKEN   — the "API Token" shown next to it
//
// It only hands out passwords to the GreenBlock site below. Opening the Worker's
// address directly in a browser just shows whether it is set up — never a password.

const ALLOWED_ORIGINS = ['https://verte123.github.io'];
const TTL_SECONDS = 24 * 60 * 60;   // each password lasts 24 hours

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = !!origin && ALLOWED_ORIGINS.includes(origin);
    const cors = allowed ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : {};
    const ready = Boolean(env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: allowed ? 204 : 403,
        headers: { ...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' },
      });
    }

    // Opened directly in a browser tab (no Origin header): show a status line only.
    if (!origin) {
      return new Response(
        ready ? 'GreenBlock relay is set up and running.'
              : 'GreenBlock relay is running, but the TURN_KEY_ID and TURN_KEY_API_TOKEN secrets are not set yet.',
        { status: ready ? 200 : 500, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    if (!allowed) return new Response('Not allowed', { status: 403 });
    if (!ready) return json({ error: 'relay secrets not set' }, 500, cors);

    let res;
    try {
      res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: TTL_SECONDS }),
      });
    } catch (e) {
      return json({ error: 'could not reach Cloudflare TURN' }, 502, cors);
    }
    if (!res.ok) return json({ error: `Cloudflare TURN said ${res.status}` }, 502, cors);

    const data = await res.json();
    // Browsers block port 53, and those addresses would just time out, so leave them out.
    const iceServers = (Array.isArray(data.iceServers) ? data.iceServers : [])
      .map(s => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter(u => typeof u === 'string' && !/:53(\?|$)/.test(u)) }))
      .filter(s => s.urls.length);
    return json({ iceServers }, 200, cors);
  },
};

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
