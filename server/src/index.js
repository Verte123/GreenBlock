// GreenBlock game rooms — a Cloudflare Worker with one Durable Object per game code.
//
// The host's phone opens  wss://<worker>/room/ABCD?role=host&cid=host
// each other phone opens  wss://<worker>/room/ABCD?role=guest&cid=<random id>
// Messages are JSON {to, m}. The room adds who sent it and passes it only to the
// addressee: guests talk to "host", the host talks to a guest's id. The game's own
// rules (who is out, who wins) stay on the host's phone, exactly as before.
//
// Free plan only: if a daily free limit is ever reached, Cloudflare returns errors
// for the rest of that day instead of charging, and the game falls back to Wi-Fi play.

import { DurableObject } from 'cloudflare:workers';

const DEFAULT_ORIGINS = ['https://verte123.github.io'];
const MAX_SOCKETS = 6;          // host + 2 guests, with room for brief reconnects
const MAX_MESSAGE = 16 * 1024;  // game messages are well under 1 KB

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowed = (env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',') : DEFAULT_ORIGINS).map(s => s.trim());
    const origin = request.headers.get('Origin');
    const originOk = !!origin && allowed.includes(origin);

    const room = url.pathname.match(/^\/room\/([A-Z]{4})$/);
    if (room) {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
      if (!originOk) return new Response('Not allowed', { status: 403 });
      return env.ROOMS.get(env.ROOMS.idFromName(room[1])).fetch(request);
    }

    if (url.pathname === '/') {
      const headers = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' };
      if (originOk) headers['Access-Control-Allow-Origin'] = origin;
      return new Response('GreenBlock game rooms are running.', { headers });
    }
    return new Response('Not found', { status: 404 });
  },
};

const tagOf = ws => { try { return ws.deserializeAttachment() || {}; } catch { return {}; } };
const sendTo = (ws, obj) => { try { ws.send(JSON.stringify(obj)); } catch {} };

export class Room extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);
    const role = url.searchParams.get('role');
    const cid = url.searchParams.get('cid') || '';
    if ((role !== 'host' && role !== 'guest') || !/^[a-z0-9]{3,24}$/.test(cid)) {
      return new Response('Bad request', { status: 400 });
    }
    const open = this.ctx.getWebSockets().filter(ws => ['host', 'guest'].includes(tagOf(ws).role));
    const hasHost = open.some(ws => tagOf(ws).role === 'host');

    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);       // hibernation API: the room can sleep between messages

    let verdict = 'ok';
    if (role === 'host' && hasHost) verdict = 'taken';          // code already in use: host picks another
    else if (role === 'guest' && !hasHost) verdict = 'noroom';  // nobody is hosting this code
    else if (open.length >= MAX_SOCKETS) verdict = 'full';

    server.serializeAttachment({ role: verdict === 'ok' ? role : 'rejected', cid });
    sendTo(server, { sys: verdict });
    if (verdict !== 'ok') server.close(4000, verdict);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    const me = tagOf(ws);
    if (me.role !== 'host' && me.role !== 'guest') return;
    if (typeof message !== 'string' || message.length > MAX_MESSAGE) return;
    let d;
    try { d = JSON.parse(message); } catch { return; }
    if (!d || typeof d !== 'object' || typeof d.to !== 'string') return;
    const from = me.role === 'host' ? 'host' : me.cid;
    const out = JSON.stringify({ from, to: d.to, m: d.m });
    for (const s of this.ctx.getWebSockets()) {
      if (s === ws) continue;
      const t = tagOf(s);
      const match = d.to === 'host' ? t.role === 'host' : (t.role === 'guest' && t.cid === d.to);
      if (match) { try { s.send(out); } catch {} }
    }
  }

  async webSocketClose(ws, code, reason) {
    this.gone(ws);
    try { ws.close(1000, 'bye'); } catch {}
  }

  async webSocketError(ws) {
    this.gone(ws);
  }

  // Tell the others straight away when a phone drops, rather than waiting for timeouts.
  gone(ws) {
    const me = tagOf(ws);
    if (me.role !== 'host' && me.role !== 'guest') return;
    ws.serializeAttachment({ ...me, role: 'closed' });
    for (const s of this.ctx.getWebSockets()) {
      if (s === ws) continue;
      const t = tagOf(s);
      if (me.role === 'host' && t.role === 'guest') sendTo(s, { from: 'host', to: t.cid, m: { t: 'gone' } });
      if (me.role === 'guest' && t.role === 'host') sendTo(s, { from: me.cid, to: 'host', m: { t: 'gone' } });
    }
  }
}
