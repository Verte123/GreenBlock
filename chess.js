'use strict';
/* =====================================================================
   ScrappyChess — two-player chess with cartoon castle folk.
   Full chess rules (castling, en passant, promotion, check, checkmate,
   stalemate and the usual draws). A capture plays a short battle scene.
   Power-ups, each once per game: Undo (take back your last move) and
   Hint (a small built-in chess computer suggests a move).

   The host's phone puts moves in order: a guest asks to move, the host
   checks it and tells both phones. Uses the lobby and connection code in
   index.html.
   ===================================================================== */

/* ENGINE-START — pure chess rules and the hint computer (no screen code) */
const CH_START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const CH_FILES = 'abcdefgh';
// Squares are numbered 0 (a8) to 63 (h1): row 0 is rank 8.
const chSqName = s => CH_FILES[s & 7] + (8 - (s >> 3));
const chWhite = p => p >= 'A' && p <= 'Z';
const CH_DN = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const CH_DK = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const CH_DB = [[-1,-1],[-1,1],[1,-1],[1,1]];
const CH_DR = [[-1,0],[1,0],[0,-1],[0,1]];

function chFromFen(fen){
  const [bd, turn, cas, ep, half, full] = fen.split(' ');
  const b = [];
  for (const ch of bd){
    if (ch === '/') continue;
    if (ch >= '1' && ch <= '8') for (let i = 0; i < +ch; i++) b.push(''); else b.push(ch);
  }
  return {b, turn: turn || 'w', castle: !cas || cas === '-' ? '' : cas,
          ep: !ep || ep === '-' ? -1 : CH_FILES.indexOf(ep[0]) + (8 - +ep[1]) * 8, half: +half || 0, full: +full || 1};
}
const chKey = st => st.b.map(p => p || '.').join('') + st.turn + st.castle + st.ep;

function chAttacked(b, sq, byWhite){
  const r = sq >> 3, c = sq & 7;
  const pr = r + (byWhite ? 1 : -1), P = byWhite ? 'P' : 'p';
  if (pr >= 0 && pr < 8){
    if (c > 0 && b[pr * 8 + c - 1] === P) return true;
    if (c < 7 && b[pr * 8 + c + 1] === P) return true;
  }
  const N = byWhite ? 'N' : 'n', K = byWhite ? 'K' : 'k', B = byWhite ? 'B' : 'b', R = byWhite ? 'R' : 'r', Q = byWhite ? 'Q' : 'q';
  for (const [dr, dc] of CH_DN){ const r2 = r + dr, c2 = c + dc; if (r2 >= 0 && r2 < 8 && c2 >= 0 && c2 < 8 && b[r2 * 8 + c2] === N) return true; }
  for (const [dr, dc] of CH_DK){ const r2 = r + dr, c2 = c + dc; if (r2 >= 0 && r2 < 8 && c2 >= 0 && c2 < 8 && b[r2 * 8 + c2] === K) return true; }
  for (const [dr, dc] of CH_DB){
    let r2 = r + dr, c2 = c + dc;
    while (r2 >= 0 && r2 < 8 && c2 >= 0 && c2 < 8){ const p = b[r2 * 8 + c2]; if (p){ if (p === B || p === Q) return true; break; } r2 += dr; c2 += dc; }
  }
  for (const [dr, dc] of CH_DR){
    let r2 = r + dr, c2 = c + dc;
    while (r2 >= 0 && r2 < 8 && c2 >= 0 && c2 < 8){ const p = b[r2 * 8 + c2]; if (p){ if (p === R || p === Q) return true; break; } r2 += dr; c2 += dc; }
  }
  return false;
}
const chKing = (b, white) => b.indexOf(white ? 'K' : 'k');
const chInCheck = st => chAttacked(st.b, chKing(st.b, st.turn === 'w'), st.turn !== 'w');

// Moves that follow how the pieces move, before checking whether the king is left in check.
function chMoves(st, capsOnly){
  const b = st.b, w = st.turn === 'w', out = [];
  for (let s = 0; s < 64; s++){
    const p = b[s]; if (!p || chWhite(p) !== w) continue;
    const r = s >> 3, c = s & 7, t = p.toLowerCase();
    if (t === 'p'){
      const d = w ? -1 : 1, startRow = w ? 6 : 1, promoRow = w ? 0 : 7, r1 = r + d;
      if (r1 < 0 || r1 > 7) continue;
      const add = (to, cap) => { if (r1 === promoRow) for (const pr of 'qrbn') out.push({from: s, to, p, cap, promo: pr}); else out.push({from: s, to, p, cap}); };
      if (!b[r1 * 8 + c]){
        if (!capsOnly || r1 === promoRow) add(r1 * 8 + c, '');
        if (!capsOnly && r === startRow && !b[(r + 2 * d) * 8 + c]) out.push({from: s, to: (r + 2 * d) * 8 + c, p, cap: '', flag: 'dbl'});
      }
      for (const dc of [-1, 1]){
        const c2 = c + dc; if (c2 < 0 || c2 > 7) continue;
        const to = r1 * 8 + c2, q = b[to];
        if (q){ if (chWhite(q) !== w) add(to, q); }
        else if (to === st.ep) out.push({from: s, to, p, cap: w ? 'p' : 'P', flag: 'ep'});
      }
    } else if (t === 'n' || t === 'k'){
      for (const [dr, dc] of (t === 'n' ? CH_DN : CH_DK)){
        const r2 = r + dr, c2 = c + dc; if (r2 < 0 || r2 > 7 || c2 < 0 || c2 > 7) continue;
        const to = r2 * 8 + c2, q = b[to];
        if (!q){ if (!capsOnly) out.push({from: s, to, p, cap: ''}); }
        else if (chWhite(q) !== w) out.push({from: s, to, p, cap: q});
      }
      if (t === 'k' && !capsOnly && st.castle){
        const home = w ? 60 : 4, rook = w ? 'R' : 'r';
        if (s === home && !chAttacked(b, home, !w)){
          if (st.castle.includes(w ? 'K' : 'k') && !b[home + 1] && !b[home + 2] && b[home + 3] === rook
              && !chAttacked(b, home + 1, !w) && !chAttacked(b, home + 2, !w)) out.push({from: s, to: home + 2, p, cap: '', flag: 'ck'});
          if (st.castle.includes(w ? 'Q' : 'q') && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === rook
              && !chAttacked(b, home - 1, !w) && !chAttacked(b, home - 2, !w)) out.push({from: s, to: home - 2, p, cap: '', flag: 'cq'});
        }
      }
    } else {
      const dirs = t === 'b' ? CH_DB : t === 'r' ? CH_DR : CH_DK;
      for (const [dr, dc] of dirs){
        let r2 = r + dr, c2 = c + dc;
        while (r2 >= 0 && r2 < 8 && c2 >= 0 && c2 < 8){
          const to = r2 * 8 + c2, q = b[to];
          if (!q){ if (!capsOnly) out.push({from: s, to, p, cap: ''}); }
          else { if (chWhite(q) !== w) out.push({from: s, to, p, cap: q}); break; }
          r2 += dr; c2 += dc;
        }
      }
    }
  }
  return out;
}
function chMake(st, m){
  const b = st.b.slice(), w = st.turn === 'w';
  b[m.to] = m.promo ? (w ? m.promo.toUpperCase() : m.promo) : m.p; b[m.from] = '';
  if (m.flag === 'ep') b[m.to + (w ? 8 : -8)] = '';
  else if (m.flag === 'ck'){ b[m.to + 1] = ''; b[m.to - 1] = w ? 'R' : 'r'; }
  else if (m.flag === 'cq'){ b[m.to - 2] = ''; b[m.to + 1] = w ? 'R' : 'r'; }
  let castle = st.castle;
  if (castle){
    if (m.p === 'K') castle = castle.replace(/[KQ]/g, '');
    else if (m.p === 'k') castle = castle.replace(/[kq]/g, '');
    for (const s of [m.from, m.to]){
      if (s === 63) castle = castle.replace('K', ''); else if (s === 56) castle = castle.replace('Q', '');
      else if (s === 7) castle = castle.replace('k', ''); else if (s === 0) castle = castle.replace('q', '');
    }
  }
  return {b, turn: w ? 'b' : 'w', castle, ep: m.flag === 'dbl' ? (m.from + m.to) / 2 : -1,
          half: (m.cap || m.p === 'P' || m.p === 'p') ? 0 : st.half + 1, full: st.full + (w ? 0 : 1)};
}
function chLegal(st, capsOnly){
  const w = st.turn === 'w', out = [];
  for (const m of chMoves(st, capsOnly)){
    const n = chMake(st, m);
    if (!chAttacked(n.b, chKing(n.b, w), !w)) out.push(m);
  }
  return out;
}
// Has the game finished? hist is the list of earlier positions ({st}).
function chResult(st, hist){
  if (!chLegal(st).length) return chInCheck(st) ? {type: 'mate', winner: st.turn === 'w' ? 'b' : 'w'} : {type: 'stalemate'};
  if (st.half >= 100) return {type: 'fifty'};
  const key = chKey(st); let seen = 0;
  for (const e of hist || []){ if (!e.key) e.key = chKey(e.st); if (e.key === key) seen++; }
  if (seen >= 2) return {type: 'threefold'};
  const rest = st.b.filter(p => p && p !== 'K' && p !== 'k');
  if (!rest.length || (rest.length === 1 && 'nb'.includes(rest[0].toLowerCase()))) return {type: 'material'};
  return null;
}

/* ---- hint computer: looks a few moves ahead and picks the best it can find ---- */
const CH_VAL = {p: 100, n: 320, b: 330, r: 500, q: 900, k: 0};
function chEval(st){                       // score from the point of view of the side to move
  const b = st.b; let s = 0, heavy = 0; const kings = [];
  for (let i = 0; i < 64; i++){
    const p = b[i]; if (!p) continue;
    const w = chWhite(p), t = p.toLowerCase(), r = i >> 3, c = i & 7;
    const cd = Math.max(Math.abs(r - 3.5), Math.abs(c - 3.5));
    let v = CH_VAL[t];
    if (t === 'p'){ const adv = w ? 6 - r : r - 1; v += adv * adv * 2 + (c >= 2 && c <= 5 && adv >= 2 ? 12 : 0); }
    else if (t === 'n') v += 32 - cd * 14;
    else if (t === 'b') v += 18 - cd * 7;
    else if (t === 'r') v += (w ? r === 1 : r === 6) ? 18 : 0;
    else if (t === 'q') v += 6 - cd * 3;
    else { kings.push([w, r, c, cd]); continue; }
    if (t !== 'p') heavy += CH_VAL[t];
    s += w ? v : -v;
  }
  for (const [w, r, c, cd] of kings){
    let v;
    if (heavy < 2700) v = 40 - cd * 14;                              // endgame: bring the king out
    else v = ((w ? r === 7 : r === 0) ? 15 : -25) + (c <= 2 || c >= 6 ? 18 : 0);   // otherwise keep it tucked away
    s += w ? v : -v;
  }
  return st.turn === 'w' ? s : -s;
}
const chOrder = m => (m.cap ? 10 * CH_VAL[m.cap.toLowerCase()] - CH_VAL[m.p.toLowerCase()] + 1000 : 0) + (m.promo === 'q' ? 900 : 0);
function chQuiesce(st, alpha, beta, ctx, depth){
  const stand = chEval(st);
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  if (depth >= 6) return alpha;
  const moves = chLegal(st, true).sort((a, b) => chOrder(b) - chOrder(a));
  for (const m of moves){
    if (ctx.stop) return alpha;
    const v = -chQuiesce(chMake(st, m), -beta, -alpha, ctx, depth + 1);
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}
function chSearch(st, depth, alpha, beta, ctx){
  if ((++ctx.nodes & 255) === 0 && ctx.deadline && performance.now() > ctx.deadline) ctx.stop = true;
  if (ctx.stop) return 0;
  const moves = chLegal(st);
  if (!moves.length) return chInCheck(st) ? -100000 - depth : 0;
  if (st.half >= 100) return 0;
  if (depth <= 0) return chQuiesce(st, alpha, beta, ctx, 0);
  moves.sort((a, b) => chOrder(b) - chOrder(a));
  let best = -Infinity;
  for (const m of moves){
    const v = -chSearch(chMake(st, m), depth - 1, -beta, -alpha, ctx);
    if (ctx.stop) return 0;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}
// Best move found within about `ms` milliseconds (always looks at least two moves ahead).
function chBest(st, ms, maxDepth){
  const root = chLegal(st); if (!root.length) return null;
  root.sort((a, b) => chOrder(b) - chOrder(a));
  const t0 = performance.now(); let best = root[0];
  for (let depth = 1; depth <= (maxDepth || 5); depth++){
    const ctx = {nodes: 0, stop: false, deadline: depth > 2 ? t0 + (ms || 900) : 0};
    let alpha = -Infinity, pick = null;
    for (const m of root){
      const v = -chSearch(chMake(st, m), depth - 1, -Infinity, -alpha, ctx);
      if (ctx.stop) break;
      if (v > alpha){ alpha = v; pick = m; }
    }
    if (ctx.stop) break;
    best = pick || best;
    root.sort((a, b) => (b === best) - (a === best));          // try the best move first next time round
    if (alpha > 90000) break;                                  // found a checkmate
    if (depth >= 2 && performance.now() - t0 > (ms || 900) * 0.45) break;
  }
  return best;
}
/* ENGINE-END */

/* ---------------- game state ---------------- */
const CH = {
  phase: 'idle',            // idle | play | over
  g: 0, sid: '', st: null, hist: [], // hist: [{st (position before the move), m, mover}]
  white: -1, black: -1, me: 'w', lastWhite: -1,
  sel: -1, targets: [], last: null, hint: null, promo: null,
  pw: {undo: true, hint: true}, undoLeft: {w: true, b: true},
  tally: {}, over: null, pendingOver: false,
  awaiting: false, awaitT: 0, thinking: false, syncT: -1e9,
  anim: null, dirty: true,
};
const CHL = {cell: 44};
const CH_NAMES = {k: 'King', q: 'Queen', r: 'Tower', b: 'Wizard', n: 'Knight', p: 'Squire'};
const CH_VERB  = {k: 'bonked', q: 'walloped', r: 'squashed', b: 'zapped', n: 'trampled', p: 'poked'};
const CH_WORD  = {k: 'BONK!', q: 'WHAM!', r: 'CRUNCH!', b: 'ZAP!', n: 'CHARGE!', p: 'POKE!'};
const chId = color => color === 'w' ? CH.white : CH.black;
const chOpp = () => CH.me === 'w' ? 'b' : 'w';
const chColorOf = id => id === CH.white ? 'w' : id === CH.black ? 'b' : null;
const chMyTurn = () => CH.phase === 'play' && CH.st && CH.st.turn === CH.me;

/* ---------------- saved game ----------------
   Each phone keeps one unfinished game in its own browser storage, updated after every move.
   Whoever hosts next can resume it from the lobby. */
const CH_SAVE_KEY = 'gg_chess_save' + (new URLSearchParams(location.search).get('slot') || '');
function chReadSave(){
  try{
    const d = JSON.parse(localStorage.getItem(CH_SAVE_KEY) || 'null');
    return d && d.v === 1 && Array.isArray(d.moves) && d.moves.length ? d : null;
  }catch(_){ return null; }
}
function chSave(){
  if (CH.phase !== 'play' || !CH.hist.length) return;
  const opp = chId(chOpp());
  try{
    localStorage.setItem(CH_SAVE_KEY, JSON.stringify({v: 1, sid: CH.sid, at: Date.now(), me: CH.me, opp: nameOf(opp),
      moves: CH.hist.map(e => [e.m.from, e.m.to, e.m.promo || '']), undoLeft: CH.undoLeft, hint: CH.pw.hint,
      score: [CH.tally[S.myId] | 0, CH.tally[opp] | 0]}));
  }catch(_){}
}
function chClearSave(){ try{ const d = chReadSave(); if (d && d.sid === CH.sid) localStorage.removeItem(CH_SAVE_KEY); }catch(_){} }
function chSaveLabel(){
  const d = chReadSave(); if (!d) return '';
  const n = Math.ceil(d.moves.length / 2), days = Math.floor((Date.now() - (d.at || 0)) / 86400000);
  return `vs ${String(d.opp || 'rival').slice(0, 12)} · ${n} move${n === 1 ? '' : 's'} in · ${days <= 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago'}`;
}
// Replay a list of moves from the starting position (used for saved games and catching up).
function chReplay(moves, undoLeft){
  let st = chFromFen(CH_START); const hist = [];
  for (const mv of (Array.isArray(moves) ? moves : []).slice(0, 2000)){
    const cand = chLegal(st).find(x => x.from === (mv[0] | 0) && x.to === (mv[1] | 0) && (x.promo || '') === String(mv[2] || ''));
    if (!cand) break;
    hist.push({st, m: cand, mover: st.turn}); st = chMake(st, cand);
  }
  CH.st = st; CH.hist = hist;
  const u = undoLeft || {}; CH.undoLeft = {w: u.w !== false, b: u.b !== false}; CH.pw.undo = CH.undoLeft[CH.me];
  const e = hist[hist.length - 1]; CH.last = e ? {from: e.m.from, to: e.m.to} : null;
  CH.anim = null; CH.awaiting = false; CH.sel = -1; CH.targets = []; CH.hint = null;
}

/* ---------------- starting games ---------------- */
function chReset(){
  CH.phase = 'idle'; CH.st = null; CH.hist = []; CH.tally = {}; CH.lastWhite = -1; CH.anim = null;
  CH.awaiting = false; CH.thinking = false; CH.pendingOver = false; CH.over = null;
  chOvHide();
}
function chBegin(white, g, sid, resume){
  const other = S.players.find(p => p.id !== white);
  CH.g = g; CH.white = white; CH.black = other ? other.id : -1; CH.me = white === S.myId ? 'w' : 'b';
  CH.st = chFromFen(CH_START); CH.hist = []; CH.phase = 'play';
  CH.sel = -1; CH.targets = []; CH.last = null; CH.hint = null; CH.promo = null;
  CH.pw = {undo: true, hint: true}; CH.undoLeft = {w: true, b: true};
  CH.over = null; CH.pendingOver = false; CH.awaiting = false; CH.thinking = false; CH.anim = null;
  S.mode = 'chess'; S.playing = false;
  CH.sid = String(sid || '');
  if (resume){
    chReplay(resume.moves, resume.undoLeft);
    const mine = chReadSave(); if (mine && mine.sid === CH.sid) CH.pw.hint = mine.hint !== false;   // my own hint, as I left it
  }
  chOvHide(); showScreen('chess'); chUpdate(); requestWake();
  if (resume){ chSave(); chToast(`Saved game resumed — you are the <b>${CH.me === 'w' ? 'cream' : 'purple'}</b> team`, true, 3000); }
  else chToast(CH.me === 'w' ? 'You are the <b>cream</b> team — you move first' : 'You are the <b>purple</b> team', true, 2600);
}
function chStartMatch(resumeSaved){               // host, after Start, Resume or Rematch
  if (S.role !== 'host' || S.players.length !== 2 || S.lost) return;
  clearTimers(); S.inMatch = true;
  const ids = S.players.map(p => p.id), other = ids.find(id => id !== S.myId);
  const save = resumeSaved ? chReadSave() : null;
  let white, sid, resume = null;
  if (save){                                     // carry on: I keep the side I had
    white = save.me === 'w' ? S.myId : other; sid = save.sid || '';
    resume = {moves: save.moves, undoLeft: save.undoLeft};
    const sc = Array.isArray(save.score) ? save.score : [0, 0];
    CH.tally = {[S.myId]: sc[0] | 0, [other]: sc[1] | 0};
  } else {
    white = CH.lastWhite < 0 || !ids.includes(CH.lastWhite) ? ids[Math.floor(Math.random() * 2)] : ids.find(id => id !== CH.lastWhite);
    sid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }
  CH.lastWhite = white;                          // sides swap each game
  const g = (CH.g | 0) + 1;
  broadcast({t: 'ch-start', g, white, sid, resume, players: S.players, tally: CH.tally});
  chBegin(white, g, sid, resume);
}
function chRematch(btn){
  if (S.lost) return leave();
  if (S.role === 'host') return chStartMatch();
  toHost({t: 'ch-rematch', g: CH.g});
  if (btn){ btn.textContent = 'Starting…'; btn.disabled = true; }
}

/* ---------------- moves: ask, check, apply ---------------- */
function chAct(a){
  a.n = CH.hist.length;
  if (S.role === 'host') chHostAct(S.myId, a);
  else { toHost({t: 'ch-act', g: CH.g, ...a}); CH.awaiting = true; CH.awaitT = performance.now(); }
  chUpdate();
}
function chHostAct(id, a){
  const color = chColorOf(id);
  const refuse = () => { if (id !== S.myId) chSendState(id); };
  if (CH.phase !== 'play' || !color || (a.n | 0) !== CH.hist.length) return refuse();
  if (a.k === 'move'){
    if (CH.st.turn !== color) return refuse();
    const m = chFindMove(a.from | 0, a.to | 0, a.promo);
    if (!m) return refuse();
    chEmit({k: 'move', from: m.from, to: m.to, promo: m.promo || ''});
  } else if (a.k === 'undo'){
    const n = CH.hist.length;
    if (!CH.undoLeft[color] || !n) return refuse();
    const plies = CH.hist[n - 1].mover === color ? 1 : n >= 2 ? 2 : 0;
    if (!plies) return refuse();
    chEmit({k: 'undo', by: color, plies});
  }
}
function chEmit(ev){
  ev.t = 'ch-ev'; ev.g = CH.g; ev.n = CH.hist.length;
  broadcast(ev); chApply(ev);
}
const chFindMove = (from, to, promo) => chLegal(CH.st).find(m => m.from === from && m.to === to && (m.promo || '') === (m.promo ? (promo || 'q') : ''));
function chApply(ev){
  if (CH.phase !== 'play') return;
  if ((ev.n | 0) !== CH.hist.length){ chAskSync(); return; }
  if (ev.k === 'move'){
    const m = chFindMove(ev.from | 0, ev.to | 0, ev.promo);
    if (!m){ chAskSync(); return; }
    const mover = CH.st.turn;
    CH.hist.push({st: CH.st, m, mover}); CH.st = chMake(CH.st, m);
    CH.last = {from: m.from, to: m.to};
    CH.anim = {type: m.cap ? 'battle' : 'slide', m, mover, t0: performance.now(), dur: m.cap ? CH_BATTLE_MS : 230};
    if (m.cap) CH.anim.sc = chPickScene(m, CH.hist.length - 1);
    const pill = $('#chToastPill'); if (pill) pill.classList.remove('show');
  } else if (ev.k === 'undo'){
    const plies = Math.min(ev.plies | 0, CH.hist.length); if (plies < 1) return;
    const by = ev.by === 'b' ? 'b' : 'w';
    CH.st = CH.hist[CH.hist.length - plies].st; CH.hist.length -= plies;
    CH.undoLeft[by] = false; if (by === CH.me) CH.pw.undo = false;
    const e = CH.hist[CH.hist.length - 1]; CH.last = e ? {from: e.m.from, to: e.m.to} : null; CH.anim = null;
    chToast(by === CH.me ? '↩ Move taken back' : `↩ <b>${esc(nameOf(chId(by)))}</b> took back a move`, by === CH.me, 2200);
  } else return;
  CH.awaiting = false; CH.sel = -1; CH.targets = []; CH.hint = null;
  if (CH.promo){ CH.promo = null; chOvHide(); }
  chSave();
  if (S.role === 'host'){
    const res = chResult(CH.st, CH.hist);
    if (res){
      const winner = res.type === 'mate' ? chId(res.winner) : -1;
      if (winner >= 0) CH.tally[winner] = (CH.tally[winner] | 0) + 1;
      const msg = {t: 'ch-over', g: CH.g, type: res.type, winner, tally: CH.tally};
      broadcast(msg); chOver(msg);
    }
  }
  chUpdate();
}
function chOver(m){
  if (CH.phase !== 'play') return;
  CH.phase = 'over'; CH.over = {type: String(m.type), winner: m.winner | 0}; CH.tally = m.tally || {};
  CH.pendingOver = true; CH.sel = -1; CH.targets = []; CH.hint = null; CH.awaiting = false;
  chClearSave(); chUpdate();
}
const CH_END = {mate: 'Checkmate', stalemate: 'Stalemate — no legal moves', fifty: 'Draw — 50 moves with no capture or squire move',
                threefold: 'Draw — the same position three times', material: 'Draw — not enough pieces left to win'};
function chShowOver(){
  const o = CH.over; if (!o) return;
  const draw = o.winner < 0, me = o.winner === S.myId;
  chOverlay(`<div class="ov-big ${draw ? '' : me ? 'win' : 'lose'}${me || draw ? '' : ' mid-size'}">${draw ? 'Draw' : me ? 'You win!' : `${esc(nameOf(o.winner))} wins!`}</div>
    <div class="ov-sub">${CH_END[o.type] || 'Game over'}${chTallyText() ? '<br>' + chTallyText() : ''}</div>
    <button class="btn primary" data-chov="rematch">Rematch (swap sides)</button>
    <button class="btn" data-chov="view">Look at the board</button>
    <button class="btn" data-chov="menu">Leave</button>`);
}
function chTallyText(){
  if (!S.players.some(p => CH.tally[p.id])) return '';
  return S.players.map(p => `${esc(p.id === S.myId ? 'You' : p.name)} ${CH.tally[p.id] | 0}`).join(' · ');
}

/* ---------------- keeping the two phones in step ---------------- */
function chSendState(id){
  sendTo(id, {t: 'ch-state', g: CH.g, white: CH.white, moves: CH.hist.map(e => [e.m.from, e.m.to, e.m.promo || '']),
              undoLeft: CH.undoLeft, tally: CH.tally});
}
function chAskSync(){
  if (S.role === 'host') return;
  const now = performance.now(); if (now - CH.syncT < 800) return;
  CH.syncT = now; toHost({t: 'ch-sync', g: CH.g});
}
function chLoadState(m){
  chReplay(m.moves, m.undoLeft);
  if (CH.promo){ CH.promo = null; chOvHide(); }
  chSave(); chUpdate();
}
function chHostMsg(id, m){
  if (S.game !== 'chess') return;
  if (m.t === 'ch-rematch'){ if (CH.phase === 'over') chStartMatch(); return; }
  if ((m.g | 0) !== CH.g) return;
  if (m.t === 'ch-act') chHostAct(id, {k: m.k, n: m.n, from: m.from, to: m.to, promo: /^[qrbn]$/.test(m.promo) ? m.promo : ''});
  else if (m.t === 'ch-sync') chSendState(id);
}
function chGuestMsg(m){
  if (m.t === 'ch-start'){
    S.game = 'chess'; S.inMatch = true; S.players = normPlayers(m.players);
    CH.tally = normWins(m.tally);
    chBegin(m.white | 0, m.g | 0, String(m.sid || '').slice(0, 40), m.resume && Array.isArray(m.resume.moves) ? m.resume : null);
    return;
  }
  if ((m.g | 0) !== CH.g) return;
  if (m.t === 'ch-ev') chApply(m);
  else if (m.t === 'ch-state'){ if (CH.phase === 'play') chLoadState(m); }
  else if (m.t === 'ch-over') chOver({type: m.type, winner: m.winner, tally: normWins(m.tally)});
}

/* ---------------- power-ups ---------------- */
function chCanUndo(){
  const n = CH.hist.length;
  return CH.phase === 'play' && CH.pw.undo && !CH.awaiting && !CH.thinking && n > 0 && (CH.hist[n - 1].mover === CH.me || n >= 2);
}
function chUndo(){ if (chCanUndo()) chAct({k: 'undo'}); }
const chCanHint = () => chMyTurn() && CH.pw.hint && !CH.awaiting && !CH.thinking && !CH.promo;
function chHint(){
  if (!chCanHint()) return;
  CH.thinking = true; CH.sel = -1; CH.targets = []; chUpdate();
  const n = CH.hist.length, g = CH.g;
  setTimeout(() => {
    const m = chBest(CH.st, 900);
    CH.thinking = false;
    if (CH.phase === 'play' && CH.g === g && CH.hist.length === n && m){
      CH.pw.hint = false; CH.hint = {from: m.from, to: m.to}; chSave();
      chToast(`💡 Try your <b>${CH_NAMES[m.p.toLowerCase()]}</b>: ${chSqName(m.from)} → ${chSqName(m.to)}`, false, 3200);
    }
    chUpdate();
  }, 80);
}

/* ---------------- taps ---------------- */
function chTap(sq){
  if (CH.anim && CH.anim.type === 'battle'){ CH.anim = null; CH.dirty = true; return; }     // tap to skip the battle
  if (!chMyTurn() || CH.awaiting || CH.thinking || CH.promo) return;
  const p = CH.st.b[sq], mine = p && chWhite(p) === (CH.me === 'w');
  if (CH.sel >= 0 && CH.targets.includes(sq)){
    const from = CH.sel, cand = chLegal(CH.st).filter(m => m.from === from && m.to === sq);
    CH.sel = -1; CH.targets = [];
    if (cand.length && cand[0].promo){ CH.promo = {from, to: sq}; chPromoPick(); }
    else if (cand.length) chAct({k: 'move', from, to: sq, promo: ''});
  } else if (mine && sq !== CH.sel){
    CH.sel = sq; CH.targets = chLegal(CH.st).filter(m => m.from === sq).map(m => m.to);
  } else { CH.sel = -1; CH.targets = []; }
  chUpdate();
}
function chPromoPick(){
  chOverlay(`<div class="ov-sub" style="color:var(--ink);font-weight:800">Your Squire made it! Promote to…</div>
    <div class="ch-promo">${['q', 'r', 'b', 'n'].map(t => `<button data-promo="${t}" aria-label="${CH_NAMES[t]}"><canvas width="112" height="112"></canvas></button>`).join('')}</div>
    <button class="btn" data-chov="nopromo">Cancel</button>`);
  document.querySelectorAll('.ch-promo button').forEach(b => {
    const x = b.querySelector('canvas').getContext('2d');
    chDrawPiece(x, b.dataset.promo, CH.me === 'w', 0, 0, 112);
  });
}

/* ---------------- characters ----------------
   Six original cartoon castle folk, drawn in a 100×100 box standing on a team-coloured base. */
const CH_PAL = {
  w: {main: '#f6ecd4', shade: '#d9c79a', accent: '#d1483a', trim: '#e9b949', base: '#efe0b5', ink: '#3a2a1a', hair: '#b4552b'},
  b: {main: '#4a4696', shade: '#2e2b66', accent: '#2fc9bf', trim: '#a5a2ff', base: '#35327a', ink: '#12102a', hair: '#e2def6'},
};
function chDrawPiece(x, type, white, px, py, size, flip){
  const P = CH_PAL[white ? 'w' : 'b'], SKIN = '#ffd7b0', STEEL = '#b4bac8', EYE = '#1b1420';
  x.save(); x.translate(px, py); x.scale(size / 100, size / 100);
  if (flip){ x.translate(100, 0); x.scale(-1, 1); }
  x.lineJoin = 'round'; x.lineCap = 'round';
  const ink = w => { x.strokeStyle = P.ink; x.lineWidth = w || 3; };
  const fs = fill => { x.fillStyle = fill; x.fill(); ink(); x.stroke(); };
  const ell = (cx, cy, rx, ry, rot) => { x.beginPath(); x.ellipse(cx, cy, rx, ry, rot || 0, 0, Math.PI * 2); };
  const poly = pts => { x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); };
  const line = (x1, y1, x2, y2, col, w) => { x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.strokeStyle = col; x.lineWidth = w; x.stroke(); };
  const dot = (cx, cy, r, fill) => { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fillStyle = fill; x.fill(); };
  const eyes = (cx, cy, gap) => { dot(cx - gap, cy, 2.7, EYE); dot(cx + gap, cy, 2.7, EYE); };
  ell(50, 90, 33, 8); fs(P.base);                                     // the base it stands on
  switch (type){
    case 'p':                                                         // Squire: saucepan helmet
      x.beginPath(); x.moveTo(34, 89); x.quadraticCurveTo(32, 60, 50, 58); x.quadraticCurveTo(68, 60, 66, 89); x.closePath(); fs(P.main);
      line(34.5, 76, 65.5, 76, P.accent, 4.5);
      ell(50, 45, 15, 15); fs(SKIN);
      x.beginPath(); x.arc(50, 42, 17, Math.PI, 0); x.closePath(); fs(STEEL);
      line(31, 42, 82, 42, P.ink, 3.4);                               // brim and pan handle
      eyes(50, 49, 5.5);
      x.beginPath(); x.arc(50, 52.5, 4, 0.15 * Math.PI, 0.85 * Math.PI); ink(2); x.stroke();
      break;
    case 'r':                                                         // Tower: a castle turret with boots
      ell(40, 88, 8, 4.5); fs(P.accent); ell(60, 88, 8, 4.5); fs(P.accent);
      poly([[30, 85], [32, 32], [68, 32], [70, 85]]); fs(P.main);
      poly([[25, 36], [25, 17], [36, 17], [36, 25], [45, 25], [45, 17], [55, 17], [55, 25], [64, 25], [64, 17], [75, 17], [75, 36]]); fs(P.main);
      line(34, 72, 44, 72, P.shade, 2); line(56, 76, 66, 76, P.shade, 2); line(35, 42, 43, 42, P.shade, 2); line(58, 44, 65, 44, P.shade, 2);
      x.beginPath(); x.moveTo(37, 66); x.lineTo(37, 54); x.quadraticCurveTo(50, 42, 63, 54); x.lineTo(63, 66); x.closePath();
      x.fillStyle = '#211a2b'; x.fill(); ink(2.5); x.stroke();
      dot(45, 57, 3.8, '#fff'); dot(55, 57, 3.8, '#fff'); dot(45.8, 57.6, 1.8, EYE); dot(55.8, 57.6, 1.8, EYE);
      break;
    case 'n':                                                         // Knight: a hobby horse
      line(59, 72, 59, 90, '#8a5a2b', 6);
      poly([[72, 80], [81, 71], [75, 65], [83, 56], [76, 50], [82, 42], [70, 34], [66, 78]]); fs(P.accent);       // mane
      poly([[43, 80], [72, 80], [74, 46], [58, 27], [42, 44]]); fs(P.main);
      poly([[55, 31], [59, 11], [68, 30]]); fs(P.main);                                                           // ear
      ell(38, 47, 26, 14.5, -0.35); fs(P.main);
      line(27, 39, 31, 62, P.accent, 3.6);                                                                        // bridle
      dot(46, 41, 4.6, '#fff'); dot(45.2, 41.6, 2.2, EYE);
      dot(18, 53, 1.9, EYE);
      x.beginPath(); x.arc(22, 58, 5, 0.1 * Math.PI, 0.7 * Math.PI); ink(2); x.stroke();
      break;
    case 'b':                                                         // Wizard: pointy hat, beard and staff
      line(79, 36, 79, 89, '#8a5a2b', 4.5);
      ell(79, 30, 6.5, 6.5); fs(P.accent);
      x.beginPath(); x.moveTo(27, 89); x.quadraticCurveTo(33, 52, 50, 48); x.quadraticCurveTo(67, 52, 73, 89); x.closePath(); fs(P.main);
      ell(50, 45, 12.5, 12.5); fs(SKIN);
      x.beginPath(); x.moveTo(38, 47); x.quadraticCurveTo(50, 55, 62, 47); x.quadraticCurveTo(61, 71, 50, 78); x.quadraticCurveTo(39, 71, 38, 47); x.closePath(); fs('#f7f7f7');
      x.beginPath(); x.moveTo(33, 38); x.quadraticCurveTo(47, 22, 61, 3); x.quadraticCurveTo(60, 24, 67, 38); x.closePath(); fs(P.main);
      ell(50, 38, 23, 5.5); fs(P.shade);
      dot(53, 23, 3.4, P.trim);
      eyes(50, 46, 4.6);
      break;
    case 'q':                                                         // Queen: spiky crown and a fierce look
      ell(33, 41, 9.5, 12); fs(P.hair); ell(67, 41, 9.5, 12); fs(P.hair);
      x.beginPath(); x.moveTo(23, 89); x.quadraticCurveTo(40, 72, 43, 52); x.lineTo(57, 52); x.quadraticCurveTo(60, 72, 77, 89); x.closePath(); fs(P.main);
      x.beginPath(); x.moveTo(29, 82); x.quadraticCurveTo(50, 88, 71, 82); x.strokeStyle = P.accent; x.lineWidth = 3.6; x.stroke();
      ell(50, 40, 13.5, 13.5); fs(SKIN);
      poly([[36, 30], [33, 11], [43, 21], [50, 7], [57, 21], [67, 11], [64, 30]]); fs(P.trim);
      dot(33, 11, 2.6, P.accent); dot(50, 7, 2.6, P.accent); dot(67, 11, 2.6, P.accent);
      line(41.5, 36, 47.5, 39, P.ink, 2.6); line(58.5, 36, 52.5, 39, P.ink, 2.6);
      eyes(50, 42.5, 5);
      x.beginPath(); x.moveTo(46, 48.5); x.quadraticCurveTo(51, 50.5, 55, 47.5); ink(2); x.stroke();
      break;
    case 'k':                                                         // King: big crown, big moustache, bad mood
      x.beginPath(); x.moveTo(21, 89); x.quadraticCurveTo(20, 54, 50, 52); x.quadraticCurveTo(80, 54, 79, 89); x.closePath(); fs(P.main);
      poly([[44, 55], [56, 55], [58, 89], [42, 89]]); fs('#fbfbfb');
      dot(50, 63, 1.7, EYE); dot(48, 72, 1.7, EYE); dot(52, 80, 1.7, EYE);
      ell(50, 40, 14.5, 14.5); fs(SKIN);
      line(50, 2, 50, 16, P.ink, 7.5); line(44.5, 7, 55.5, 7, P.ink, 7.5);
      line(50, 2, 50, 16, P.trim, 3.5); line(44.5, 7, 55.5, 7, P.trim, 3.5);
      poly([[34, 30], [31, 15], [42, 22], [50, 14], [58, 22], [69, 15], [66, 30]]); fs(P.trim);
      dot(50, 24, 2.6, P.accent);
      line(40.5, 37.5, 47, 38.5, P.ink, 3); line(59.5, 37.5, 53, 38.5, P.ink, 3);
      eyes(50, 42.5, 5.5);
      x.beginPath(); x.moveTo(50, 46.5); x.quadraticCurveTo(40, 44, 33, 51); x.quadraticCurveTo(42, 55, 50, 50); x.quadraticCurveTo(58, 55, 67, 51); x.quadraticCurveTo(60, 44, 50, 46.5); x.closePath(); fs(P.hair);
      break;
  }
  x.restore();
}
const chSprites = new Map();
function chSprite(p, px){
  const key = p + '|' + px; let c = chSprites.get(key); if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = Math.max(2, Math.round(px * DPR));
  const x = c.getContext('2d'); x.scale(DPR, DPR);
  chDrawPiece(x, p.toLowerCase(), chWhite(p), 0, 0, px);
  chSprites.set(key, c); return c;
}

/* ---------------- screen ---------------- */
function chStatusHTML(){
  if (CH.phase === 'over'){
    const o = CH.over, draw = o.winner < 0;
    return `<b>${draw ? 'Draw' : o.winner === S.myId ? 'You won' : `${esc(nameOf(o.winner))} won`}</b> · ${CH_END[o.type] || ''}`;
  }
  if (CH.phase !== 'play') return '';
  const check = chInCheck(CH.st);
  if (CH.thinking) return 'Thinking of a hint…';
  if (CH.st.turn === CH.me){
    if (CH.hint) return `<b>Your move</b> · hint: ${chSqName(CH.hint.from)} → ${chSqName(CH.hint.to)}`;
    return `<b>Your move</b>${check ? ' — you are in check!' : CH.sel >= 0 ? ' · tap a dot to move there' : ' · tap a piece'}`;
  }
  return `<b>${esc(nameOf(chId(chOpp())))}</b> is thinking…${check ? ' Check!' : ''}`;
}
function chCaptured(by){                         // pieces taken by this side, biggest first
  return CH.hist.filter(e => e.mover === by && e.m.cap).map(e => e.m.cap)
    .sort((a, b) => CH_VAL[b.toLowerCase()] - CH_VAL[a.toLowerCase()]);
}
function chDrawCaps(id, by){
  const cv = $(id), x = cv.getContext('2d'); x.setTransform(DPR, 0, 0, DPR, 0, 0); x.clearRect(0, 0, cv.width, cv.height);
  const list = chCaptured(by), w = cv.width / DPR, step = Math.min(13, (w - 22) / Math.max(1, list.length - 1));
  list.forEach((p, i) => x.drawImage(chSprite(p, 22), w - 22 - (list.length - 1 - i) * step, 0, 22, 22));
}
function chUpdate(){
  CH.dirty = true;
  if (!onChessScreen() || !CH.st) return;
  const opp = chOpp(), turn = CH.phase === 'play' ? CH.st.turn : '';
  $('#chTopName').textContent = nameOf(chId(opp)); $('#chBotName').textContent = nameOf(S.myId) + ' (you)';
  $('#chTopDot').className = 'ch-dot ' + opp; $('#chBotDot').className = 'ch-dot ' + CH.me;
  $('#chTop').classList.toggle('turn', turn === opp); $('#chBot').classList.toggle('turn', turn === CH.me);
  chDrawCaps('#chTopCap', opp); chDrawCaps('#chBotCap', CH.me);
  const st = $('#chStatus'); st.innerHTML = chStatusHTML(); st.classList.toggle('myturn', chMyTurn());
  $('#chScore').innerHTML = chTallyText();
  const over = CH.phase === 'over', u = $('#chUndo'), h = $('#chHint'), again = $('#chAgain');
  u.style.display = h.style.display = over ? 'none' : ''; again.style.display = over ? '' : 'none';
  u.classList.toggle('used', !CH.pw.undo); u.querySelector('span').textContent = CH.pw.undo ? 'Undo' : 'Undo used'; u.disabled = !chCanUndo();
  h.classList.toggle('used', !CH.pw.hint); h.querySelector('span').textContent = CH.thinking ? 'Thinking…' : CH.pw.hint ? 'Hint' : 'Hint used'; h.disabled = !chCanHint();
}
function chLayout(){
  if (!onChessScreen()) return;
  const capW = Math.max(100, Math.min(190, $('#chTop').clientWidth - 175));     // leave room for the names on narrow phones
  sizeCanvas($('#chTopCap'), capW, 22); sizeCanvas($('#chBotCap'), capW, 22);
  sizeCanvas($('#chCv'), 16, 16);                 // shrink first so the space left for the board is measured properly
  const main = $('#chMain'), W = main.clientWidth, H = main.clientHeight;
  if (!W || !H) return;
  CHL.cell = Math.max(20, Math.floor(Math.min(W, H, 528) / 8));
  sizeCanvas($('#chCv'), CHL.cell * 8, CHL.cell * 8);
  chSprites.clear(); chUpdate();
}
const chXY = sq => { let r = sq >> 3, c = sq & 7; if (CH.me === 'b'){ r = 7 - r; c = 7 - c; } return [c * CHL.cell, r * CHL.cell]; };
function chRender(now){
  const cv = $('#chCv'); if (!cv || !cv.width || !CH.st) return;
  const x = cv.getContext('2d'), cell = CHL.cell, size = cell * 8, b = CH.st.b;
  x.setTransform(DPR, 0, 0, DPR, 0, 0); x.clearRect(0, 0, size, size);
  const a = CH.anim, flip = CH.me === 'b';
  x.font = `700 ${Math.max(8, Math.round(cell * 0.2))}px -apple-system,system-ui,sans-serif`; x.textBaseline = 'alphabetic';
  for (let sq = 0; sq < 64; sq++){
    const [px, py] = chXY(sq), dark = ((sq >> 3) + (sq & 7)) % 2 === 1;
    x.fillStyle = dark ? '#6d9a66' : '#c2dba6'; x.fillRect(px, py, cell, cell);
    if (CH.last && (sq === CH.last.from || sq === CH.last.to)){ x.fillStyle = 'rgba(255,196,60,.42)'; x.fillRect(px, py, cell, cell); }
    if (CH.hint && (sq === CH.hint.from || sq === CH.hint.to)){ x.fillStyle = 'rgba(72,182,255,.5)'; x.fillRect(px, py, cell, cell); }
    if (sq === CH.sel){ x.fillStyle = 'rgba(255,255,255,.45)'; x.fillRect(px, py, cell, cell); }
    x.fillStyle = dark ? 'rgba(255,255,255,.5)' : 'rgba(40,70,40,.55)';
    const sr = flip ? 7 - (sq >> 3) : sq >> 3, sc = flip ? 7 - (sq & 7) : sq & 7;
    if (sc === 0){ x.textAlign = 'left'; x.fillText(String(8 - (sq >> 3)), px + 2, py + cell * 0.24); }
    if (sr === 7){ x.textAlign = 'right'; x.fillText(CH_FILES[sq & 7], px + cell - 2, py + cell - 3); }
  }
  if (CH.phase === 'play' && chInCheck(CH.st)){
    const [px, py] = chXY(chKing(b, CH.st.turn === 'w'));
    const g = x.createRadialGradient(px + cell / 2, py + cell / 2, cell * 0.1, px + cell / 2, py + cell / 2, cell * 0.7);
    g.addColorStop(0, 'rgba(255,60,60,.85)'); g.addColorStop(1, 'rgba(255,60,60,0)');
    x.fillStyle = g; x.fillRect(px, py, cell, cell);
  }
  const sliding = a && a.type === 'slide' ? a : null;
  for (let sq = 0; sq < 64; sq++){
    const p = b[sq]; if (!p || (sliding && sq === sliding.m.to)) continue;
    const [px, py] = chXY(sq);
    x.drawImage(chSprite(p, cell), px, py, cell, cell);
  }
  for (const t of CH.targets){                     // where the selected piece can go
    const [px, py] = chXY(t);
    if (b[t] || t === CH.st.ep && b[CH.sel] && b[CH.sel].toLowerCase() === 'p'){
      x.strokeStyle = 'rgba(210,40,40,.9)'; x.lineWidth = Math.max(2.5, cell * 0.09);
      x.beginPath(); x.arc(px + cell / 2, py + cell / 2, cell * 0.42, 0, Math.PI * 2); x.stroke();
    } else {
      x.fillStyle = 'rgba(30,40,60,.42)'; x.beginPath(); x.arc(px + cell / 2, py + cell / 2, cell * 0.16, 0, Math.PI * 2); x.fill();
    }
  }
  if (CH.hint){                                    // arrow for the hint
    const [fx, fy] = chXY(CH.hint.from), [tx, ty] = chXY(CH.hint.to);
    x.strokeStyle = 'rgba(20,90,170,.7)'; x.lineWidth = Math.max(3, cell * 0.11); x.lineCap = 'round';
    x.beginPath(); x.moveTo(fx + cell / 2, fy + cell / 2); x.lineTo(tx + cell / 2, ty + cell / 2); x.stroke();
    x.fillStyle = 'rgba(20,90,170,.9)'; x.beginPath(); x.arc(tx + cell / 2, ty + cell / 2, cell * 0.17, 0, Math.PI * 2); x.fill();
  }
  if (sliding){
    const u = Math.min(1, (now - a.t0) / a.dur), e = 1 - (1 - u) * (1 - u);
    const [fx, fy] = chXY(a.m.from), [tx, ty] = chXY(a.m.to);
    x.drawImage(chSprite(b[a.m.to] || a.m.p, cell), fx + (tx - fx) * e, fy + (ty - fy) * e, cell, cell);
  } else if (a && a.type === 'battle') chDrawBattle(x, a, now);
}

/* ---------------- battle scenes ----------------
   Anime-style special moves. Every piece has six named moves of its own; each is built from a
   cut-in close-up, the attack itself, an impact frame and one of several ways for the loser to
   leave. The move, the ending and the backdrop are picked from the game's id and the move number,
   so both phones show the same scene and a piece works through all six moves before repeating. */
const CH_ATTACKS = {
  p: [['Hundred-Poke Flurry', 'rush'], ['Saucepan Storm', 'barrage', 'pan'], ['Shooting Squire', 'meteor'], ['Squire Squad, Assemble!', 'clones'], ['Mega Squire Stomp', 'giant'], ['Tiny Fury Shockwave', 'quake']],
  n: [['Thunder Gallop', 'rush'], ['Hobby-Horse Hurricane', 'tornado'], ['Comet Canter', 'meteor'], ['Stampede of Shadows', 'clones'], ['Neigh-Beam', 'beam'], ['Horseshoe Hail', 'barrage', 'shoe']],
  b: [['Staff of a Thousand Suns', 'beam'], ['Sky-Splitter', 'storm'], ['Pocket Black Hole', 'vortex'], ['Starfall Barrage', 'barrage', 'star'], ['Mirror Wizards', 'clones'], ['Great Big Wizard', 'giant']],
  r: [['Colossal Crunch', 'giant'], ['Rampart Ripple', 'quake'], ['Brick Blizzard', 'barrage', 'brick'], ['Falling Fortress', 'meteor'], ['Arrow-Slit Laser', 'beam'], ['Spinning Keep', 'tornado']],
  q: [['Royal Thousand Slaps', 'rush'], ['Crown Jewel Cannon', 'beam'], ['Reign of Thunder', 'storm'], ['Court of Queens', 'clones'], ['Curtsy of Oblivion', 'vortex'], ['Ballgown Cyclone', 'tornado']],
  k: [['Majestic Mega Bonk', 'giant'], ['Royal Decree Quake', 'quake'], ['Moustache Beam', 'beam'], ['Treasury Barrage', 'barrage', 'coin'], ['Crown Comet', 'meteor'], ['Thunder of the Throne', 'storm']],
};
const CH_GLOW = {p: '#ffd23f', n: '#ff8a3d', b: '#6fd3ff', r: '#ff6b4a', q: '#ff6ad5', k: '#ffc93f'};
const CH_FINISH = ['star', 'flat', 'shatter', 'poof', 'rocket', 'spin'];
const CH_FIN_FOR = {giant: ['flat', 'rocket', 'star', 'poof'], meteor: ['flat', 'star', 'poof', 'rocket'], quake: ['rocket', 'star', 'flat', 'poof'], vortex: ['spin', 'poof', 'shatter']};
const CH_BGS = ['day', 'sunset', 'night', 'storm'];
const CH_BATTLE_MS = 3300;
function chHash(str){ let h = 2166136261; for (let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function chPickScene(m, ply){
  const at = m.p.toLowerCase();
  const earlier = CH.hist.slice(0, ply).filter(e => e.m.cap && e.m.p.toLowerCase() === at).length;
  const order = [0, 1, 2, 3, 4, 5]; let h = chHash(CH.sid + at);
  for (let i = 5; i > 0; i--){ h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; const j = h % (i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  const atk = CH_ATTACKS[at][order[earlier % 6]], h2 = chHash(CH.sid + '|' + ply);
  const fins = CH_FIN_FOR[atk[1]] || CH_FINISH;
  return {name: atk[0], kind: atk[1], obj: atk[2], fin: fins[h2 % fins.length], bg: CH_BGS[(h2 >>> 8) % CH_BGS.length], seed: h2};
}
function chBattleBg(x, sc, W, py, ph, gy){
  const pal = {day: ['#6fbdf0', '#d9f1ff', '#a9b3c4', '#6fae5a'], sunset: ['#f2674a', '#ffd98a', '#8b6f8f', '#5c8a48'],
               night: ['#0f1433', '#3a3f7a', '#4b5275', '#2c5644'], storm: ['#2e2a45', '#77748f', '#565b6c', '#476a48']}[sc.bg] || [];
  const sky = x.createLinearGradient(0, py, 0, gy); sky.addColorStop(0, pal[0]); sky.addColorStop(1, pal[1]);
  x.fillStyle = sky; x.fillRect(0, py, W, ph);
  const blob = (cx, cy, r, col) => { x.fillStyle = col; for (const [ox, oy, k] of [[-1.1, 0.1, 0.8], [0, -0.25, 1], [1.1, 0.1, 0.75]]){ x.beginPath(); x.arc(cx + ox * r, cy + oy * r, r * k, 0, Math.PI * 2); x.fill(); } };
  if (sc.bg === 'day'){ blob(W * 0.25, py + ph * 0.2, W * 0.05, 'rgba(255,255,255,.8)'); blob(W * 0.72, py + ph * 0.3, W * 0.04, 'rgba(255,255,255,.7)'); }
  else if (sc.bg === 'sunset'){ x.fillStyle = '#fff3c0'; x.beginPath(); x.arc(W * 0.5, gy - ph * 0.12, W * 0.16, 0, Math.PI * 2); x.fill(); blob(W * 0.2, py + ph * 0.25, W * 0.045, 'rgba(255,190,150,.7)'); }
  else if (sc.bg === 'night'){
    x.fillStyle = '#fdf6d0'; x.beginPath(); x.arc(W * 0.78, py + ph * 0.2, W * 0.07, 0, Math.PI * 2); x.fill();
    x.fillStyle = pal[0]; x.beginPath(); x.arc(W * 0.755, py + ph * 0.185, W * 0.06, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff'; for (let i = 0; i < 26; i++){ const v = Math.sin(i * 91.7) * 4375.5, f = v - Math.floor(v), v2 = Math.sin(i * 33.1) * 951.3, f2 = v2 - Math.floor(v2); x.fillRect(f * W, py + f2 * ph * 0.55, 2, 2); }
  } else { blob(W * 0.3, py + ph * 0.16, W * 0.09, 'rgba(30,26,48,.75)'); blob(W * 0.7, py + ph * 0.2, W * 0.1, 'rgba(30,26,48,.7)'); }
  x.fillStyle = pal[2]; x.fillRect(0, gy - ph * 0.13, W, ph * 0.13);
  for (let i = 0; i < 12; i++) x.fillRect(i * W / 11 - W * 0.02, gy - ph * 0.17, W * 0.045, ph * 0.05);
  x.fillStyle = pal[3]; x.fillRect(0, gy, W, py + ph - gy);
  x.fillStyle = 'rgba(0,0,0,.12)'; x.fillRect(0, gy, W, ph * 0.02);
}
function chDrawBattle(x, a, now){
  if (!a.sc) a.sc = chPickScene(a.m, CH.hist.length);
  const size = CHL.cell * 8, W = size, t = Math.min(1, (now - a.t0) / a.dur), sc = a.sc;
  const m = a.m, at = m.p.toLowerCase(), dt = m.cap.toLowerCase(), aw = chWhite(m.p), glow = CH_GLOW[at];
  const py = size * 0.1, ph = size * 0.8, gy = py + ph * 0.75;
  const Sz = Math.min(ph * 0.4, size * 0.29), midY = gy - Sz * 0.46;
  const ax0 = W * 0.24, dx0 = W * 0.76, PI = Math.PI;
  const T_CUT = 0.09, T_ATK = 0.29, T_HIT = 0.63, T_FIN = 0.69;
  const rnd = i => { const v = Math.sin((sc.seed % 997) + i * 12.9898) * 43758.5453; return v - Math.floor(v); };
  const clamp = u => Math.max(0, Math.min(1, u)), ease = u => 1 - (1 - u) * (1 - u), seg = (a0, b0) => clamp((t - a0) / (b0 - a0));
  const fA = at === 'n', fD = dt === 'b';
  // feet-anchored and centre-anchored actors
  const actor = (type, white, cx, lift, rot, scl, al, flip, sx, sy) => {
    if (al <= 0) return;
    x.save(); x.globalAlpha = Math.min(1, al); x.translate(cx, gy - (lift || 0)); x.rotate(rot || 0); x.scale((scl || 1) * (sx === undefined ? 1 : sx), (scl || 1) * (sy === undefined ? 1 : sy));
    chDrawPiece(x, type, white, -Sz / 2, -Sz * 0.92, Sz, flip); x.restore();
  };
  const actorC = (type, white, cx, cy, rot, scl, al, flip, sx) => {
    if (al <= 0) return;
    x.save(); x.globalAlpha = Math.min(1, al); x.translate(cx, cy); x.rotate(rot || 0); x.scale((scl || 1) * (sx === undefined ? 1 : sx), scl || 1);
    chDrawPiece(x, type, white, -Sz / 2, -Sz * 0.48, Sz, flip); x.restore();
  };
  const A = (cx, lift, rot, scl, al, sx, sy) => actor(at, aw, cx, lift, rot, scl, al === undefined ? 1 : al, sx !== undefined && sx < 0 ? !fA : fA, sx === undefined ? 1 : Math.abs(sx), sy);
  const D = (cx, lift, rot, scl, al, sx, sy) => actor(dt, !aw, cx, lift, rot, scl, al === undefined ? 1 : al, fD, sx, sy);
  const shadow = (cx, s, al) => { x.fillStyle = `rgba(0,0,0,${0.2 * (al === undefined ? 1 : al)})`; x.beginPath(); x.ellipse(cx, gy + Sz * 0.02, Sz * 0.32 * s, Sz * 0.06 * s, 0, 0, PI * 2); x.fill(); };
  const spark = (cx, cy, r, col) => { x.fillStyle = col || '#fff'; x.beginPath(); for (let i = 0; i < 8; i++){ const an = i * PI / 4, d = i % 2 ? r * 0.25 : r; x.lineTo(cx + Math.cos(an) * d, cy + Math.sin(an) * d); } x.closePath(); x.fill(); };
  const burst = (cx, cy, R, c1, c2, n) => { x.beginPath(); for (let i = 0; i < (n || 24); i++){ const an = i * PI * 2 / (n || 24), d = i % 2 ? R * 0.58 : R; x.lineTo(cx + Math.cos(an) * d, cy + Math.sin(an) * d); } x.closePath(); x.fillStyle = c1; x.fill(); if (c2){ x.strokeStyle = c2; x.lineWidth = Math.max(2, R * 0.08); x.lineJoin = 'round'; x.stroke(); } };
  const speedH = (al, col) => {                     // streaking horizontal speed lines
    x.fillStyle = `rgba(12,10,26,${al})`; x.fillRect(0, py, W, ph);
    x.strokeStyle = col || 'rgba(255,255,255,.55)'; x.lineCap = 'butt';
    for (let i = 0; i < 26; i++){ const y = py + rnd(i + 200) * ph, len = W * (0.15 + rnd(i + 230) * 0.4), off = ((now * (0.9 + rnd(i + 260)) * 1.6 + rnd(i + 290) * W * 2) % (W + len)) - len; x.lineWidth = 1 + rnd(i + 300) * 3; x.beginPath(); x.moveTo(W - off, y); x.lineTo(W - off - len, y); x.stroke(); }
  };
  const speedR = (cx, cy, al, col, inner) => {      // radial focus lines
    x.fillStyle = col; x.globalAlpha = al;
    for (let i = 0; i < 40; i++){ const an = i * PI / 20 + rnd(i + 400) * 0.1, r1 = (inner || W * 0.22) * (0.8 + rnd(i + 440 + Math.floor(now / 70)) * 0.5), wd = 0.012 + rnd(i + 480) * 0.03;
      x.beginPath(); x.moveTo(cx + Math.cos(an) * r1, cy + Math.sin(an) * r1); x.lineTo(cx + Math.cos(an - wd) * W * 1.5, cy + Math.sin(an - wd) * W * 1.5); x.lineTo(cx + Math.cos(an + wd) * W * 1.5, cy + Math.sin(an + wd) * W * 1.5); x.closePath(); x.fill(); }
    x.globalAlpha = 1;
  };
  const aura = (cx, s, col) => {                    // rising power-up aura
    for (let i = 0; i < 9; i++){ const f = ((now * 0.0016 + rnd(i + 500)) % 1), px = cx + (rnd(i + 520) - 0.5) * Sz * 0.9 * s; x.strokeStyle = col; x.globalAlpha = (1 - f) * 0.85; x.lineWidth = Math.max(2, Sz * 0.035); x.lineCap = 'round';
      x.beginPath(); x.moveTo(px, gy - f * Sz * 1.2 * s); x.lineTo(px, gy - f * Sz * 1.2 * s - Sz * 0.22); x.stroke(); }
    x.globalAlpha = 0.28; x.fillStyle = col; x.beginPath(); x.ellipse(cx, gy - Sz * 0.45 * s, Sz * 0.55 * s, Sz * 0.62 * s, 0, 0, PI * 2); x.fill(); x.globalAlpha = 1;
  };
  const bolt = (x1, y1, x2, y2, col, wd, k) => {
    const n = 7; x.beginPath(); x.moveTo(x1, y1);
    for (let i = 1; i < n; i++) x.lineTo(x1 + (x2 - x1) * i / n + (rnd(i + k) - 0.5) * Sz * 0.5, y1 + (y2 - y1) * i / n);
    x.lineTo(x2, y2); x.lineJoin = 'miter'; x.lineCap = 'round';
    x.strokeStyle = col; x.lineWidth = wd; x.stroke(); x.strokeStyle = '#fff'; x.lineWidth = wd * 0.35; x.stroke();
  };
  const slash = (i, al) => { const an = rnd(i + 600) * PI, L = Sz * 0.95, cx = dx0, cy = midY; x.save(); x.globalAlpha = al; x.translate(cx, cy); x.rotate(an);
    x.fillStyle = glow; x.beginPath(); x.moveTo(-L, 0); x.quadraticCurveTo(0, -Sz * 0.12, L, 0); x.quadraticCurveTo(0, Sz * 0.12, -L, 0); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.moveTo(-L, 0); x.quadraticCurveTo(0, -Sz * 0.045, L, 0); x.quadraticCurveTo(0, Sz * 0.045, -L, 0); x.fill(); x.restore(); };
  const obj = (kind, cx, cy, s, rot) => {
    x.save(); x.translate(cx, cy); x.rotate(rot); x.lineWidth = Math.max(1.5, s * 0.12); x.strokeStyle = '#2a2018'; x.lineJoin = 'round';
    if (kind === 'pan'){ x.fillStyle = '#b4bac8'; x.beginPath(); x.arc(0, 0, s * 0.5, 0, PI * 2); x.fill(); x.stroke(); x.fillStyle = '#7d8494'; x.beginPath(); x.arc(0, 0, s * 0.3, 0, PI * 2); x.fill(); x.fillStyle = '#5a3a1c'; x.fillRect(s * 0.45, -s * 0.09, s * 0.7, s * 0.18); x.strokeRect(s * 0.45, -s * 0.09, s * 0.7, s * 0.18); }
    else if (kind === 'shoe'){ x.strokeStyle = '#2a2018'; x.lineWidth = s * 0.36; x.lineCap = 'round'; x.beginPath(); x.arc(0, 0, s * 0.42, PI * 0.15, PI * 0.85, true); x.stroke(); x.strokeStyle = '#c9ced9'; x.lineWidth = s * 0.2; x.stroke(); }
    else if (kind === 'brick'){ x.fillStyle = '#c0583c'; x.fillRect(-s * 0.6, -s * 0.32, s * 1.2, s * 0.64); x.strokeRect(-s * 0.6, -s * 0.32, s * 1.2, s * 0.64); x.fillStyle = 'rgba(255,255,255,.25)'; x.fillRect(-s * 0.5, -s * 0.24, s, s * 0.14); }
    else if (kind === 'coin'){ x.fillStyle = '#f2b72c'; x.beginPath(); x.ellipse(0, 0, s * 0.5, s * 0.5 * Math.abs(Math.cos(rot * 2)) + s * 0.08, 0, 0, PI * 2); x.fill(); x.stroke(); x.fillStyle = '#fff3b0'; x.beginPath(); x.arc(-s * 0.12, -s * 0.1, s * 0.12, 0, PI * 2); x.fill(); }
    else { x.fillStyle = '#ffe66b'; x.beginPath(); for (let i = 0; i < 10; i++){ const an = i * PI / 5 - PI / 2, d = i % 2 ? s * 0.28 : s * 0.62; x.lineTo(Math.cos(an) * d, Math.sin(an) * d); } x.closePath(); x.fill(); x.stroke(); }
    x.restore();
  };
  const flame = (cx, cy, ang, len, wd) => { for (let g = 0; g < 7; g++){ const f = g / 7, r = wd * (1 - f * 0.8) * (0.85 + 0.3 * Math.sin(now * 0.05 + g)); x.fillStyle = ['#fff6c8', '#ffe066', '#ffb23a', '#ff8a2a', '#ff5a2a', '#e2402a', '#b02a2a'][g]; x.globalAlpha = 1 - f * 0.6; x.beginPath(); x.arc(cx - Math.cos(ang) * len * f, cy - Math.sin(ang) * len * f, r, 0, PI * 2); x.fill(); } x.globalAlpha = 1; };

  x.fillStyle = 'rgba(8,8,14,.74)'; x.fillRect(0, 0, size, size);
  x.save();
  let shake = 0;
  if (t > T_ATK && t < T_FIN + 0.04) shake = (t > T_HIT ? 1.3 : 0.3) * (['giant', 'quake', 'beam', 'meteor', 'storm'].includes(sc.kind) ? 1.7 : 1) * W * 0.008;
  if (shake) x.translate(Math.sin(now * 0.09) * shake, Math.cos(now * 0.13) * shake);
  rr(x, 6, py, W - 12, ph, 16); x.save(); x.clip();
  chBattleBg(x, sc, W, py, ph, gy);

  if (t < T_CUT){                                                   // ---- the two walk on
    const u = ease(seg(0, T_CUT));
    shadow(-Sz + (ax0 + Sz) * u, 1); shadow(W + Sz - (W + Sz - dx0) * u, 1);
    D(W + Sz - (W + Sz - dx0) * u, 0, 0, 1); A(-Sz + (ax0 + Sz) * u, 0, 0, 1);
  } else if (t < T_ATK){                                            // ---- cut-in: close-up and the name of the move
    const u = seg(T_CUT, T_ATK), slide = Math.min(1, u / 0.16) * (u > 0.9 ? 1 - (u - 0.9) / 0.1 : 1);
    shadow(ax0, 1); shadow(dx0, 1); aura(ax0, 1, glow);
    D(dx0 + Math.sin(now * 0.06) * Sz * 0.012, 0, 0, 1); A(ax0, Math.abs(Math.sin(u * PI * 3)) * Sz * 0.04, -0.05, 1);
    x.fillStyle = '#fff'; x.font = `900 ${Math.round(Sz * 0.3)}px -apple-system,system-ui,sans-serif`; x.textAlign = 'center'; x.fillText('!', dx0 + Sz * 0.35, gy - Sz * 1.0);
    const bh = ph * 0.4, by = py + ph * 0.2, skew = W * 0.1, bx = -W * (1 - slide);
    x.save(); x.translate(bx, 0);
    x.beginPath(); x.moveTo(-20, by + skew * 0.3); x.lineTo(W + 20, by - skew * 0.3); x.lineTo(W + 20, by + bh - skew * 0.3); x.lineTo(-20, by + bh + skew * 0.3); x.closePath();
    x.save(); x.clip();
    const g = x.createLinearGradient(0, by, W, by + bh); g.addColorStop(0, '#16122e'); g.addColorStop(1, glow); x.fillStyle = g; x.fillRect(-20, by - skew, W + 40, bh + skew * 2);
    x.strokeStyle = 'rgba(255,255,255,.5)';
    for (let i = 0; i < 18; i++){ const y = by - skew * 0.3 + rnd(i + 700) * (bh + skew * 0.6), len = W * (0.2 + rnd(i + 720) * 0.4), off = (now * (1.5 + rnd(i + 740) * 2) + rnd(i + 760) * W * 2) % (W + len); x.lineWidth = 1 + rnd(i + 780) * 3; x.beginPath(); x.moveTo(W - off + len, y); x.lineTo(W - off, y); x.stroke(); }
    const big = bh * 2.1, faceX = W * 0.23 + Math.sin(now * 0.01) * 3;
    x.save(); x.translate(faceX, by + bh * 0.5 + big * 0.06); chDrawPiece(x, at, aw, -big / 2, -big * 0.45, big, fA); x.restore();
    spark(faceX + (fA ? big * 0.04 : -big * 0.055), by + bh * 0.42, bh * 0.12 * (0.7 + 0.5 * Math.abs(Math.sin(now * 0.012))), '#fff');
    x.restore();
    x.lineWidth = 4; x.strokeStyle = '#fff'; x.beginPath(); x.moveTo(-20, by + skew * 0.3); x.lineTo(W + 20, by - skew * 0.3); x.moveTo(W + 20, by + bh - skew * 0.3); x.lineTo(-20, by + bh + skew * 0.3); x.stroke();
    const words = sc.name.split(' '), lines = []; let cur = '';
    for (const w of words){ if ((cur + ' ' + w).trim().length > 13 && cur){ lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); } lines.push(cur);
    let fz = Math.round(bh * (lines.length > 2 ? 0.2 : 0.26));
    x.save(); x.translate(W * 0.71, by + bh * 0.5); x.rotate(-0.06); x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `italic 900 ${fz}px -apple-system,system-ui,sans-serif`;
    while (fz > 9 && Math.max(...lines.map(l => x.measureText(l).width)) > W * 0.46){ fz--; x.font = `italic 900 ${fz}px -apple-system,system-ui,sans-serif`; }
    lines.forEach((l, i) => { const yy = (i - (lines.length - 1) / 2) * fz * 1.08; x.lineWidth = Math.max(4, fz * 0.26); x.strokeStyle = '#16122e'; x.lineJoin = 'round'; x.strokeText(l, 0, yy); x.fillStyle = '#fff'; x.fillText(l, 0, yy); });
    x.restore(); x.restore();
  } else if (t < T_HIT){                                            // ---- the special move
    const u = seg(T_ATK, T_HIT), trem = Math.sin(now * 0.07) * Sz * 0.015, K = sc.kind;
    if (K === 'rush'){
      speedH(0.72, glow);
      if (u < 0.16){ shadow(dx0, 1); D(dx0 + trem, 0, 0, 1); A(ax0 - W * 0.05 * (u / 0.16), 0, -0.18, 1); }
      else {
        const v = (u - 0.16) / 0.84 * 6, k = Math.min(5, Math.floor(v)), f = v - k, dir = k % 2 ? -1 : 1, L = dx0 - Sz * 1.15, Rr = dx0 + Sz * 0.75, pos = dir > 0 ? L + (Rr - L) * f : Rr - (Rr - L) * f;
        D(dx0 + trem * 3, 0, Math.sin(now * 0.05) * 0.12, 1);
        for (let g = 4; g >= 1; g--) A(pos - dir * g * Sz * 0.24, Sz * 0.04, dir * 0.2, 1, 0.5 - g * 0.1, dir);
        A(pos, Sz * 0.04, dir * 0.2, 1, 1, dir);
        for (let i = 0; i <= k; i++) slash(i, i < k ? 0.9 : clamp((f - 0.35) * 4));
      }
    } else if (K === 'beam'){
      const ox = ax0 + Sz * 0.5, oy = midY - Sz * 0.08;
      if (u < 0.42){
        const c = u / 0.42; x.fillStyle = `rgba(12,10,26,${0.55 * c})`; x.fillRect(0, py, W, ph);
        shadow(ax0, 1); shadow(dx0, 1); aura(ax0, 1 + c * 0.4, glow); D(dx0 + trem, 0, 0, 1); A(ax0 - W * 0.02 * c, 0, -0.1 * c, 1);
        x.strokeStyle = glow; x.lineWidth = 2.5;
        for (let i = 0; i < 14; i++){ const an = rnd(i + 800) * PI * 2, f = 1 - ((c * 3 + rnd(i + 820)) % 1), r1 = Sz * (0.2 + f * 1.1); x.globalAlpha = 1 - f; x.beginPath(); x.moveTo(ox + Math.cos(an) * r1, oy + Math.sin(an) * r1); x.lineTo(ox + Math.cos(an) * (r1 + Sz * 0.14), oy + Math.sin(an) * (r1 + Sz * 0.14)); x.stroke(); }
        x.globalAlpha = 1; x.fillStyle = glow; x.beginPath(); x.arc(ox, oy, Sz * (0.06 + 0.2 * c), 0, PI * 2); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(ox, oy, Sz * (0.03 + 0.11 * c), 0, PI * 2); x.fill();
      } else {
        const b = (u - 0.42) / 0.58, wd = Sz * (0.62 + 0.1 * Math.sin(now * 0.06)) * Math.min(1, b * 5);
        x.fillStyle = 'rgba(12,10,26,.6)'; x.fillRect(0, py, W, ph);
        D(dx0 + trem * 4, 0, 0.1, 1, 0.9); A(ax0 - W * 0.03, 0, -0.14, 1);
        const g = x.createLinearGradient(0, oy - wd, 0, oy + wd); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.25, glow); g.addColorStop(0.5, '#fff'); g.addColorStop(0.75, glow); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.globalAlpha = 0.93; x.fillStyle = g; x.fillRect(ox, oy - wd, W, wd * 2); x.globalAlpha = 1;
        x.fillStyle = '#fff'; x.beginPath(); x.arc(ox, oy, wd * 0.62, 0, PI * 2); x.fill();
        x.strokeStyle = '#fff'; x.lineWidth = 2;
        for (let i = 0; i < 12; i++){ const yy = oy + (rnd(i + 840) - 0.5) * wd * 2.6, off = (now * 2.2 + rnd(i + 860) * W) % W; x.beginPath(); x.moveTo(ox + off, yy); x.lineTo(ox + off + W * 0.12, yy); x.stroke(); }
        for (let i = 0; i < 3; i++){ const rr2 = ((b * 2 + i / 3) % 1); x.strokeStyle = glow; x.globalAlpha = 1 - rr2; x.lineWidth = 3; x.beginPath(); x.ellipse(ox, oy, wd * 0.3 * (1 + rr2 * 2), wd * (1 + rr2 * 2), 0, 0, PI * 2); x.stroke(); } x.globalAlpha = 1;
      }
    } else if (K === 'barrage'){
      x.fillStyle = 'rgba(12,10,26,.3)'; x.fillRect(0, py, W, ph);
      shadow(ax0, 1); shadow(dx0, 1); aura(ax0, 1, glow);
      D(dx0 + trem * 3, 0, Math.sin(now * 0.06) * 0.1, 1); A(ax0 + Math.sin(now * 0.05) * Sz * 0.03, Math.abs(Math.sin(now * 0.03)) * Sz * 0.05, 0.08, 1);
      const N = 16;
      for (let i = 0; i < N; i++){
        const v = (u - i / N * 0.8) / 0.2; if (v < 0 || v > 1.5) continue;
        const ex = dx0 + (rnd(i + 900) - 0.5) * Sz * 0.6, ey = midY + (rnd(i + 920) - 0.5) * Sz * 0.7;
        if (v <= 1){ const sx = ax0 + Sz * 0.3, sy = midY - Sz * 0.2, px = sx + (ex - sx) * v, pyy = sy + (ey - sy) * v - Math.sin(v * PI) * Sz * (0.2 + rnd(i + 940) * 1.1);
          x.strokeStyle = glow; x.globalAlpha = 0.6; x.lineWidth = Sz * 0.05; x.lineCap = 'round'; x.beginPath(); x.moveTo(px, pyy); x.lineTo(px - (ex - sx) * 0.08, pyy - (ey - sy) * 0.08 + Math.cos(v * PI) * Sz * 0.08); x.stroke(); x.globalAlpha = 1;
          obj(sc.obj, px, pyy, Sz * 0.24, v * 9 + i); }
        else { x.globalAlpha = 1 - (v - 1) * 2; burst(ex, ey, Sz * (0.14 + (v - 1) * 0.3), '#fff', glow, 14); x.globalAlpha = 1; }
      }
    } else if (K === 'meteor'){
      shadow(dx0, 1);
      if (u < 0.26){ const c = u / 0.26; D(dx0, 0, 0, 1); A(ax0, c * c * ph * 1.2, 0, 1, 1, 1, 1 + c * 0.5); x.globalAlpha = 1 - c; burst(ax0, gy, Sz * (0.2 + c * 0.5), 'rgba(255,255,255,.8)', null, 12); x.globalAlpha = 1; }
      else if (u < 0.42){ D(dx0 + trem, 0, 0, 1); spark(ax0 * 0.8, py + ph * 0.1, Sz * 0.22 * Math.abs(Math.sin((u - 0.26) * 40)), '#fff'); }
      else {
        const c = (u - 0.42) / 0.58, sx = ax0 * 0.4, sy = py - Sz * 0.6, ex = dx0 - Sz * 0.25, ey = midY - Sz * 0.1, cc = c * c, px = sx + (ex - sx) * cc, pyy = sy + (ey - sy) * cc, ang = Math.atan2(ey - sy, ex - sx);
        x.fillStyle = `rgba(12,10,26,${0.5 * c})`; x.fillRect(0, py, W, ph); speedR(ex, ey, 0.35 * c, glow, W * 0.3);
        D(dx0 + trem * 4, 0, 0, 1);
        flame(px, pyy, ang, Sz * 1.6, Sz * (0.42 + c * 0.2));
        actorC(at, aw, px, pyy, ang - PI * 0.15 + c * 12, 1 + c * 0.5, 1, fA);
      }
    } else if (K === 'clones'){
      speedH(0.7, glow); D(dx0 + trem * 2, 0, Math.sin(now * 0.05) * 0.08, 1);
      A(ax0, 0, 0, 1, 1 - u / 0.14);
      for (let i = 0; i < 5; i++){
        const an = -PI * 0.5 + (i - 2) * PI * 0.42 + PI, hx = dx0 + Math.cos(an) * Sz * 1.3 * (i % 2 ? 1 : 0.8) - Sz * 0.2, hy = Math.min(gy, midY + Sz * 0.46 + Math.sin(an) * Sz * 0.9);
        const al = clamp((u - (0.1 + i * 0.06)) / 0.06), s0 = 0.52 + i * 0.09, v = clamp((u - s0) / 0.08), go = v < 0.5 ? v * 2 : 2 - v * 2;
        const cx = hx + (dx0 - Sz * 0.3 - hx) * go, lift = (gy - hy) + ((gy - midY - Sz * 0.46) - (gy - hy)) * go;
        if (al > 0){ for (let g2 = 2; g2 >= 1; g2--) actor(at, aw, cx - Sz * 0.12 * g2, lift, 0, 0.8, al * 0.25, fA); actor(at, aw, cx, lift, 0.1, 0.8, al * 0.95, fA); }
        if (v > 0.35) slash(i, clamp(1.6 - v));
      }
    } else if (K === 'giant'){
      if (u < 0.5){ const c = ease(u / 0.5); x.fillStyle = `rgba(12,10,26,${0.4 * c})`; x.fillRect(0, py, W, ph); shadow(ax0, 1 + c * 2.2); shadow(dx0, 1); aura(ax0, 1 + c * 2.2, glow); D(dx0 + trem, 0, 0, 1 - c * 0.15); A(ax0 + W * 0.03 * c, 0, 0, 1 + c * 2.3);
        x.fillStyle = '#fff'; x.font = `900 ${Math.round(Sz * 0.3)}px -apple-system,system-ui,sans-serif`; x.textAlign = 'center'; x.fillText('!?', dx0 + Sz * 0.3, gy - Sz * 0.95); }
      else { const c = (u - 0.5) / 0.5, land = clamp(c / 0.8), px = ax0 + W * 0.03 + (dx0 - Sz * 0.35 - ax0) * land, lift = Math.sin(land * PI) * Sz * 1.3;
        x.fillStyle = 'rgba(12,10,26,.4)'; x.fillRect(0, py, W, ph); shadow(px, 3.2 - lift / Sz); 
        D(dx0 + trem * 3, 0, 0, 0.85, 1, 1, c > 0.8 ? 0.25 : 1); A(px, lift, 0.2 * land, 3.3);
        if (c > 0.8){ x.globalAlpha = 1 - (c - 0.8) * 3; burst(dx0, gy, Sz * (0.6 + (c - 0.8) * 4), '#fff', glow, 20); x.globalAlpha = 1; } }
    } else if (K === 'tornado'){
      const c = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u), pos = ax0 + (dx0 + Sz * 0.1 - ax0) * c, near = Math.abs(pos - dx0) < Sz * 0.7;
      x.fillStyle = 'rgba(12,10,26,.35)'; x.fillRect(0, py, W, ph);
      shadow(pos, 1.3);
      if (near) actorC(dt, !aw, dx0 + Math.sin(now * 0.02) * Sz * 0.5, midY - Sz * (0.5 + 0.3 * Math.sin(now * 0.015)), now * 0.02, 0.9, 1, fD); else D(dx0 + trem * 2, 0, 0, 1);
      A(pos, Sz * 0.08, 0, 1, 1, Math.cos(now * 0.035) || 0.1);
      for (let j = 0; j < 8; j++){ const yy = gy - j * Sz * 0.2, rx = Sz * (0.22 + j * 0.085), ph0 = now * 0.02 + j * 0.9; x.strokeStyle = j % 2 ? glow : '#fff'; x.globalAlpha = 0.75; x.lineWidth = Math.max(2, Sz * 0.04); x.lineCap = 'round';
        x.beginPath(); x.ellipse(pos + Math.sin(now * 0.012 + j) * Sz * 0.07, yy, rx, Sz * 0.07, 0, ph0, ph0 + PI * 1.3); x.stroke(); }
      x.globalAlpha = 1;
      for (let i = 0; i < 10; i++){ const an = now * 0.018 + i * 0.63, h = rnd(i + 1000); x.fillStyle = i % 2 ? '#fff' : '#7a5a3a'; x.fillRect(pos + Math.cos(an) * Sz * (0.3 + h * 0.6), gy - h * Sz * 1.5 + Math.sin(an) * Sz * 0.05, Sz * 0.05, Sz * 0.05); }
    } else if (K === 'storm'){
      x.fillStyle = `rgba(10,8,24,${0.62 * Math.min(1, u * 5)})`; x.fillRect(0, py, W, ph);
      shadow(ax0, 1); shadow(dx0, 1); aura(ax0, 1.2, glow); A(ax0, Sz * 0.12 + Math.sin(now * 0.01) * Sz * 0.03, -0.08, 1.05);
      let flash = 0;
      for (let i = 0; i < 7; i++){ const v = (u - (0.14 + i * 0.115)) / 0.1; if (v < 0 || v > 1) continue; flash = Math.max(flash, 1 - v);
        bolt(dx0 + (rnd(i + 1100) - 0.5) * Sz * 1.6, py - 4, dx0 + (rnd(i + 1120) - 0.5) * Sz * 0.5, gy - rnd(i + 1140) * Sz * 0.6, glow, Math.max(5, Sz * 0.1) * (1 - v * 0.5), i * 13);
        x.globalAlpha = 1 - v; burst(dx0 + (rnd(i + 1120) - 0.5) * Sz * 0.5, gy - Sz * 0.1, Sz * 0.3 * (0.5 + v), '#fff', glow, 12); x.globalAlpha = 1; }
      D(dx0 + trem * 4, flash * Sz * 0.08, 0, 1, 1);
      if (flash > 0.55){ x.fillStyle = `rgba(255,255,255,${(flash - 0.55) * 1.2})`; x.fillRect(0, py, W, ph); }
    } else if (K === 'quake'){
      if (u < 0.3){ const c = u / 0.3; shadow(ax0, 1 - Math.sin(c * PI) * 0.5); shadow(dx0, 1); D(dx0, 0, 0, 1); A(ax0, Math.sin(c * PI) * Sz * 1.1, c * PI * 2, 1); }
      else { const c = (u - 0.3) / 0.7, n = 9, x0 = ax0 + Sz * 0.45;
        x.fillStyle = 'rgba(12,10,26,.35)'; x.fillRect(0, py, W, ph);
        x.globalAlpha = 1 - clamp(c * 3); burst(ax0, gy, Sz * (0.5 + c * 2), '#fff', glow, 18); x.globalAlpha = 1;
        const up = clamp((c - 0.78) / 0.22);
        D(dx0 + trem * 3, up * Sz * 0.75, up * 0.5, 1); A(ax0, 0, 0, 1, 1, 1.12, 0.88);
        x.strokeStyle = '#2a2018'; x.lineWidth = 3; x.beginPath(); x.moveTo(ax0, gy + 4); for (let i = 1; i <= 12; i++) x.lineTo(ax0 + (dx0 - ax0) * Math.min(1, c * 1.3) * i / 12, gy + 4 + (i % 2 ? 6 : -3)); x.stroke();
        for (let i = 0; i < n; i++){ const r = clamp((c - i / n * 0.75) / 0.09); if (!r) continue; const cx = x0 + (dx0 - x0) * i / (n - 1), h = Sz * (0.28 + 0.1 * i) * r * (i === n - 1 ? 1.25 : 1), wd = Sz * (0.11 + 0.012 * i);
          x.beginPath(); x.moveTo(cx - wd, gy + 2); x.lineTo(cx + (rnd(i + 1200) - 0.5) * wd, gy - h); x.lineTo(cx + wd, gy + 2); x.closePath(); x.fillStyle = i % 2 ? '#8d7b68' : '#a8957f'; x.fill(); x.strokeStyle = glow; x.lineWidth = 2.5; x.lineJoin = 'round'; x.stroke(); }
      }
    } else {                                                        // vortex
      const g0 = ease(Math.min(1, u * 2));
      x.fillStyle = `rgba(10,8,24,${0.6 * g0})`; x.fillRect(0, py, W, ph);
      shadow(ax0, 1); aura(ax0, 1.1, glow); A(ax0, Sz * 0.05, -0.06, 1);
      const hx = dx0, hy = midY - Sz * 0.1, R = Sz * 0.75 * g0;
      x.fillStyle = '#07040f'; x.beginPath(); x.arc(hx, hy, R * 0.8, 0, PI * 2); x.fill();
      for (let j = 0; j < 5; j++){ x.strokeStyle = j % 2 ? glow : '#b58cff'; x.lineWidth = Math.max(2, Sz * 0.045); x.globalAlpha = 0.85; x.beginPath(); x.arc(hx, hy, R * (0.45 + j * 0.16), now * 0.012 * (j % 2 ? 1 : -1.4) + j, now * 0.012 * (j % 2 ? 1 : -1.4) + j + PI * 1.1); x.stroke(); }
      x.globalAlpha = 1;
      for (let i = 0; i < 14; i++){ const f = 1 - ((u * 2.5 + rnd(i + 1300)) % 1), an = rnd(i + 1320) * PI * 2 + now * 0.01; spark(hx + Math.cos(an) * R * 1.7 * f, hy + Math.sin(an) * R * 1.7 * f, Sz * 0.06 * f + 1, '#fff'); }
      x.strokeStyle = glow; x.lineWidth = 3; x.beginPath(); x.ellipse(dx0, gy, Sz * 0.75 * g0, Sz * 0.16 * g0, 0, 0, PI * 2); x.stroke();
      for (let i = 0; i < 8; i++){ const an = now * 0.008 + i * PI / 4; spark(dx0 + Math.cos(an) * Sz * 0.75 * g0, gy + Math.sin(an) * Sz * 0.16 * g0, Sz * 0.05, glow); }
      actorC(dt, !aw, dx0 + Math.sin(now * 0.03) * Sz * 0.06 * u, midY - Sz * 0.12 * u, Math.sin(now * 0.02) * 0.3 * u + u * u * 5, 1 - u * 0.45, 1, fD, 1 - u * 0.4);
    }
  } else if (t < T_FIN){                                            // ---- impact frame
    const u = seg(T_HIT, T_FIN), inv = u < 0.5;
    x.fillStyle = inv ? '#fff' : '#0c0a1a'; x.fillRect(0, py, W, ph);
    speedR(dx0, midY, 1, inv ? '#0c0a1a' : '#fff', W * 0.2);
    burst(dx0, midY, Sz * (0.55 + u * 0.35), inv ? '#0c0a1a' : glow, inv ? null : '#fff', 22);
    const word = CH_WORD[at]; x.save(); x.translate(W * 0.36, midY - Sz * 0.35); x.rotate(-0.14);
    x.font = `italic 900 ${Math.round(Sz * (word.length > 6 ? 0.42 : 0.56))}px -apple-system,system-ui,sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = Sz * 0.08; x.lineJoin = 'round'; x.strokeStyle = inv ? '#0c0a1a' : '#fff'; x.strokeText(word, 0, 0); x.fillStyle = inv ? '#fff' : glow; x.fillText(word, 0, 0); x.restore();
  } else {                                                          // ---- how the loser leaves, and a victory pose
    const w = seg(T_FIN, 1), F = sc.fin, melee = !['beam', 'barrage', 'storm', 'vortex'].includes(sc.kind);
    x.globalAlpha = clamp(1 - w * 4); x.fillStyle = '#fff'; x.fillRect(0, py, W, ph); x.globalAlpha = 1;
    const vx = melee ? dx0 - Sz * 0.5 + (W * 0.42 - dx0 + Sz * 0.5) * ease(Math.min(1, w * 1.6)) : ax0 + (W * 0.36 - ax0) * ease(Math.min(1, w * 1.6));
    if (F === 'star'){
      const cx = dx0 + w * W * 0.3, cy = midY - Math.sin(Math.min(1, w * 1.25) * PI * 0.6) * ph * 0.72;
      actorC(dt, !aw, cx, cy, w * 20, 1 - 0.85 * Math.min(1, w * 1.25), 1, fD);
      x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 3; x.setLineDash([8, 8]); x.beginPath(); x.moveTo(dx0, midY); x.quadraticCurveTo(dx0 + W * 0.05, midY - ph * 0.4, cx, cy); x.stroke(); x.setLineDash([]);
      if (w > 0.72) spark(W * 0.92, py + ph * 0.1, Sz * 0.3 * Math.sin((w - 0.72) / 0.28 * PI), '#fff');
    } else if (F === 'flat'){
      const s = Math.min(1, w * 7); shadow(dx0, 1 + s * 0.6);
      D(dx0, 0, 0, 1, 1, 1 + s * 0.7, 1 - s * 0.88);
      for (let i = 0; i < 4; i++){ const an = now * 0.006 + i * PI / 2; spark(dx0 + Math.cos(an) * Sz * 0.42, gy - Sz * 0.42 + Math.sin(an) * Sz * 0.1, Sz * 0.09, '#ffe66b'); }
    } else if (F === 'shatter'){
      if (w < 0.22){ D(dx0, 0, 0, 1); x.globalAlpha = 0.6; x.fillStyle = '#bfeaff'; x.beginPath(); x.ellipse(dx0, midY, Sz * 0.45, Sz * 0.55, 0, 0, PI * 2); x.fill(); x.globalAlpha = 1;
        x.strokeStyle = '#fff'; x.lineWidth = 2.5; for (let i = 0; i < 5; i++){ x.beginPath(); x.moveTo(dx0, midY); x.lineTo(dx0 + Math.cos(i * 1.3 + rnd(i)) * Sz * 0.5, midY + Math.sin(i * 1.3 + rnd(i)) * Sz * 0.55); x.stroke(); } }
      else { const v = (w - 0.22) / 0.78;
        for (let i = 0; i < 18; i++){ const an = rnd(i + 1400) * PI * 2, d = v * W * (0.2 + rnd(i + 1420) * 0.45), cx = dx0 + Math.cos(an) * d, cy = midY + Math.sin(an) * d + v * v * Sz * 0.8, s = Sz * (0.08 + rnd(i + 1440) * 0.14);
          x.save(); x.globalAlpha = 1 - v * v; x.translate(cx, cy); x.rotate(v * 9 * (rnd(i + 1460) - 0.5) + i); x.fillStyle = ['#bfeaff', '#7fd0f5', '#fff'][i % 3]; x.beginPath(); x.moveTo(-s, s * 0.6); x.lineTo(0, -s); x.lineTo(s, s * 0.5); x.closePath(); x.fill(); x.strokeStyle = '#3b7fa6'; x.lineWidth = 1.5; x.stroke(); x.restore(); } }
    } else if (F === 'poof'){
      D(dx0, 0, 0, 1, 1 - w * 6);
      for (let i = 0; i < 9; i++){ const an = rnd(i + 1500) * PI * 2, d = Sz * (0.1 + w * 0.6) * (0.5 + rnd(i + 1520)); x.globalAlpha = Math.max(0, 0.95 - w); x.fillStyle = i % 2 ? '#fff' : '#d9dbe6'; x.beginPath(); x.arc(dx0 + Math.cos(an) * d, midY + Math.sin(an) * d * 0.8 - w * Sz * 0.3, Sz * (0.16 + w * 0.3) * (0.6 + rnd(i + 1540) * 0.6), 0, PI * 2); x.fill(); }
      x.globalAlpha = 1;
    } else if (F === 'rocket'){
      const lift = w * w * ph * 1.5;
      x.globalAlpha = 1 - w; x.strokeStyle = '#fff'; x.lineWidth = 3; x.beginPath(); x.ellipse(dx0, gy, Sz * (0.3 + w * 1.2), Sz * (0.06 + w * 0.2), 0, 0, PI * 2); x.stroke(); x.globalAlpha = 1;
      flame(dx0, gy - lift + Sz * 0.1, -PI / 2, Sz * (0.6 + w), Sz * 0.3);
      D(dx0 + Math.sin(now * 0.08) * Sz * 0.02, lift, 0, 1, 1, 1 - w * 0.25, 1 + w * 0.4);
    } else {                                                        // spin
      shadow(dx0, 1 - w);
      D(dx0 + Math.sin(w * 14) * Sz * 0.3 * (1 - w), 0, 0, 1 - w * 0.95, 1, Math.cos(now * 0.04) || 0.1);
      for (let i = 0; i < 6; i++){ const an = now * 0.02 + i; x.globalAlpha = 1 - w; x.fillStyle = '#fff'; x.beginPath(); x.arc(dx0 + Math.cos(an) * Sz * 0.5 * (1 - w * 0.5), gy - Sz * 0.05 + Math.sin(an) * Sz * 0.08, Sz * 0.05, 0, PI * 2); x.fill(); } x.globalAlpha = 1;
    }
    shadow(vx, 1); A(vx, Math.abs(Math.sin(w * PI * 3.5)) * Sz * 0.2 * (1 - w * 0.4), Math.sin(w * PI * 3.5) * 0.08, 1.15);
    for (let i = 0; i < 4; i++) spark(vx + Math.cos(i * 1.7 + now * 0.004) * Sz * 0.75, midY - Sz * 0.15 + Math.sin(i * 2.3 + now * 0.005) * Sz * 0.5, Sz * 0.09 * (0.5 + Math.abs(Math.sin(now * 0.008 + i))), glow);
    if (w > 0.1){
      const mine = a.mover === CH.me, other = nameOf(chId(mine ? chOpp() : a.mover));
      const text = mine ? `Your ${CH_NAMES[at]} ${CH_VERB[at]} ${other}'s ${CH_NAMES[dt]}!` : `${other}'s ${CH_NAMES[at]} ${CH_VERB[at]} your ${CH_NAMES[dt]}!`;
      const bh = ph * 0.11; x.fillStyle = 'rgba(12,10,26,.86)'; x.fillRect(0, py + ph - bh, W, bh);
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
      let fz = Math.round(Math.min(bh * 0.5, W * 0.045)); x.font = `800 ${fz}px -apple-system,system-ui,sans-serif`;
      while (fz > 9 && x.measureText(text).width > W - 40){ fz--; x.font = `800 ${fz}px -apple-system,system-ui,sans-serif`; }
      x.fillText(text, W / 2, py + ph - bh / 2);
    }
  }
  if (t >= T_CUT && t < T_FIN){ x.fillStyle = '#07060f'; x.fillRect(0, py, W, ph * 0.055); x.fillRect(0, py + ph * 0.945, W, ph * 0.055);       // cinema bars
    if (t >= T_ATK){ x.fillStyle = '#fff'; x.textAlign = 'left'; x.textBaseline = 'middle'; x.font = `italic 800 ${Math.round(ph * 0.032)}px -apple-system,system-ui,sans-serif`; x.fillText(sc.name.toUpperCase(), 16, py + ph * 0.972); } }
  x.restore();
  rr(x, 6, py, W - 12, ph, 16); x.strokeStyle = glow; x.lineWidth = 3.5; x.stroke();
  x.restore();
}
function chFrame(now){
  if (CH.anim && now - CH.anim.t0 >= CH.anim.dur){ CH.anim = null; CH.dirty = true; }
  if (CH.awaiting && now - CH.awaitT > 3000){ CH.awaiting = false; chAskSync(); chUpdate(); }
  if (CH.pendingOver && !CH.anim){ CH.pendingOver = false; chShowOver(); }
  if (CH.dirty || CH.anim){ CH.dirty = false; chRender(now); }
}

/* ---------------- overlay, toast, buttons ---------------- */
function chOverlay(html){ const o = $('#chOverlay'); o.innerHTML = html; o.classList.add('show'); }
function chOvHide(){ const o = $('#chOverlay'); if (o) o.classList.remove('show'); }
let chToastT = null;
function chToast(html, info, ms){
  const p = $('#chToastPill'); if (!p) return;
  p.innerHTML = html; p.classList.toggle('info', !!info);
  p.classList.add('show'); clearTimeout(chToastT); chToastT = setTimeout(() => p.classList.remove('show'), ms || 1700);
}
$('#chOverlay').addEventListener('click', e => {
  const pr = e.target.closest('[data-promo]');
  if (pr && CH.promo){
    const {from, to} = CH.promo; CH.promo = null; chOvHide();
    if (chMyTurn()) chAct({k: 'move', from, to, promo: pr.dataset.promo});
    return;
  }
  const b = e.target.closest('[data-chov]'); if (!b) return;
  const act = b.dataset.chov;
  if (act === 'menu') leave();
  else if (act === 'view') chOvHide();
  else if (act === 'nopromo'){ CH.promo = null; chOvHide(); chUpdate(); }
  else if (act === 'rematch') chRematch(b);
});
$('#chUndo').addEventListener('click', chUndo);
$('#chHint').addEventListener('click', chHint);
$('#chAgain').addEventListener('click', e => chRematch(e.currentTarget));
$('#chQuit').addEventListener('click', () => {
  if (!S.lost && CH.phase === 'play' && !confirm(CH.hist.length ? 'Leave the game? It is saved, so you can resume it later.' : 'Leave the game?')) return;
  leave();
});
let chDown = null;
$('#chCv').addEventListener('pointerdown', e => { chDown = {x: e.clientX, y: e.clientY, id: e.pointerId}; });
$('#chCv').addEventListener('pointerup', e => {
  if (!chDown || chDown.id !== e.pointerId) return;
  const moved = Math.hypot(e.clientX - chDown.x, e.clientY - chDown.y); chDown = null;
  if (moved > 16) return;
  const r = $('#chCv').getBoundingClientRect();
  let c = Math.floor((e.clientX - r.left) / CHL.cell), rw = Math.floor((e.clientY - r.top) / CHL.cell);
  if (c < 0 || c > 7 || rw < 0 || rw > 7) return;
  if (CH.me === 'b'){ c = 7 - c; rw = 7 - rw; }
  chTap(rw * 8 + c);
});
$('#chCv').addEventListener('pointercancel', () => { chDown = null; });

// the little picture on the home screen
(function(){
  const cv = $('#chLogo'); if (!cv) return;
  const x = cv.getContext('2d');
  chDrawPiece(x, 'k', true, 2, 2, 84); chDrawPiece(x, 'n', false, 70, 2, 84); chDrawPiece(x, 'b', true, 138, 2, 84);
})();

// test hook (harmless in normal play)
window.__ch = {CH, CHL, CH_ATTACKS, CH_FINISH, CH_BGS, chPickScene, chDrawBattle, chTap, chBest, chLegal, chFromFen, chSqName, chDrawPiece, chHint, chUndo,
  setFen(fen){ CH.phase = 'play'; CH.over = null; CH.pendingOver = false; chOvHide(); CH.st = chFromFen(fen); CH.hist = []; CH.last = null; CH.sel = -1; CH.targets = []; CH.hint = null; CH.anim = null; chUpdate(); }};
