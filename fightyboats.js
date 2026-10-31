'use strict';
/* =====================================================================
   FightyBoats — canal-boat battleships for 2–3 players, or against the
   computer. Each phone keeps its own fleet secret and answers shots fired
   at it; the host's phone referees whose turn it is, who is out and who
   wins. Uses the lobby and connection code in index.html.

   Power-ups, each once per game:
   - Move a boat: any time during the battle, without using your turn. A hit
     boat keeps its damage (the damaged sections move with it). It can only
     move into water nobody has fired at. Rivals are told, and the old hit
     marks fade.
   - Big bomb: instead of a normal shot, hits two squares side by side
     (across or down) in one rival's waters.
   ===================================================================== */

const FB_N = 10;
const FB_COLS = 'ABCDEFGHIJ';
const FB_FLEET = [
  {name:'Narrowboat', len:5, color:'#1f6b4a'},
  {name:'Widebeam',   len:4, color:'#7a2232'},
  {name:'Butty',      len:3, color:'#244a8a'},
  {name:'Cruiser',    len:3, color:'#8a5a1a'},
  {name:'Tender',     len:2, color:'#5b3a8a'},
];
const CPU = 99;                       // player id of the computer in solo games
const fbCellName = c => FB_COLS[c % FB_N] + (Math.floor(c / FB_N) + 1);
const fbShuffle = a => { for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };
const fbPick = a => a[Math.floor(Math.random()*a.length)];
const fbRow = c => Math.floor(c/FB_N);

const FB = {
  phase:'idle',          // idle | place | wait | battle | over
  solo:false, g:0,       // g = game number, so stale messages are ignored
  order:[], alive:new Set(), turn:-1, ready:new Set(),
  fleet:[],              // my boats: {name,len,color,cells:[...],hits:Set}
  shots:{},              // targetId -> {cell: {hit, by}}   (every shot is public)
  sunk:{},               // targetId -> [{name,len,color,cells}]
  faded:{},              // targetId -> Set of old hit squares whose boat has moved away
  reveal:{},             // id -> fleet, shown after the game
  answered:{},           // cell -> my answer (so a repeated question gets the same reply)
  view:-1, aim:-1, sel:-1, awaiting:false,
  pw:{move:false, bomb:false},
  aimMode:'shot', bombVert:false,     // big bomb aiming
  moving:false, draft:null,           // move-a-boat mode
  log:[], tally:{}, winner:-1, last:null,
  dirty:true, bottomKey:'',
  ref:null,              // referee state — host phone (or solo) only
  cpu:null,              // solo: the computer's fleet and power-ups
};
const FBL = {lab:20, cell:32, mini:13};

/* ---------------- fleets ---------------- */
const fbIsH = cells => cells.length < 2 || cells[1] - cells[0] === 1;
function fbBoatCells(bow, len, horiz){
  const r=fbRow(bow), c=bow%FB_N;
  if (horiz ? c+len>FB_N : r+len>FB_N) return null;
  return Array.from({length:len}, (_,i)=> horiz ? bow+i : bow+i*FB_N);
}
function fbFits(fleet, idx, cells){
  if (!cells) return false;
  const used=new Set(); fleet.forEach((b,i)=>{ if (i!==idx) b.cells.forEach(x=>used.add(x)); });
  return cells.every(x=>!used.has(x));
}
function fbRandomFleet(){
  for (let tries=0; tries<200; tries++){
    const boats=[]; let ok=true;
    for (const t of FB_FLEET){
      let placed=false;
      for (let k=0;k<300 && !placed;k++){
        const cells=fbBoatCells(Math.floor(Math.random()*FB_N*FB_N), t.len, Math.random()<0.5);
        if (cells && fbFits(boats, -1, cells)){ boats.push({...t, cells, hits:new Set()}); placed=true; }
      }
      if (!placed){ ok=false; break; }
    }
    if (ok) return boats;
  }
  return null;
}
function fbFleetShot(fleet, cell){
  const b=fleet.find(b=>b.cells.includes(cell));
  if (!b) return {hit:false, sunk:null, dead:false};
  const wasSunk=b.hits.size===b.len;
  b.hits.add(cell);
  const sunk = !wasSunk && b.hits.size===b.len ? {name:b.name, len:b.len, color:b.color, cells:b.cells.slice()} : null;
  return {hit:true, sunk, dead: fleet.every(x=>x.hits.size===x.len)};
}
// Move boat idx to newCells, carrying its damaged sections with it.
function fbMoveBoat(fleet, idx, newCells){
  const b=fleet[idx];
  const dmg=b.cells.map((c,i)=>b.hits.has(c)?i:-1).filter(i=>i>=0);
  b.cells=newCells.slice(); b.hits=new Set(dmg.map(i=>b.cells[i]));
}
const fbPublic = fleet => fleet.map(b=>({name:b.name, len:b.len, color:b.color, cells:b.cells.slice()}));
function fbCleanBoat(b){
  if (!b || typeof b!=='object') return null;
  const cells=(Array.isArray(b.cells)?b.cells:[]).slice(0,5).map(x=>x|0).filter(x=>x>=0 && x<100);
  if (!cells.length) return null;
  return {name:String(b.name||'Boat').slice(0,12), len:cells.length, color:/^#[0-9a-f]{6}$/i.test(b.color)?b.color:'#556070', cells};
}
const fbCleanFleet = f => (Array.isArray(f)?f:[]).slice(0,5).map(fbCleanBoat).filter(Boolean);
const fbCleanCells = a => (Array.isArray(a)?a:[]).slice(0,5).map(x=>x|0).filter(x=>x>=0 && x<100);
// A square in target's waters that can still usefully be fired at.
const fbFresh = (target, cell) => cell>=0 && cell<FB_N*FB_N && !(FB.shots[target]||{})[cell]
                               && !(FB.sunk[target]||[]).some(b=>b.cells.includes(cell));
function fbBombCells(cell, vert){
  if (vert) return fbRow(cell)<FB_N-1 ? [cell, cell+FB_N] : [cell-FB_N, cell];
  return cell%FB_N<FB_N-1 ? [cell, cell+1] : [cell-1, cell];
}

/* ---------------- starting games ---------------- */
function fbReset(){
  FB.phase='idle'; FB.ref=null; FB.cpu=null; FB.solo=false; FB.tally={}; FB.bottomKey=''; FB.awaiting=false;
  FB.moving=false; FB.draft=null; FB.aimMode='shot';
  fbOvHide();
}
function fbBegin(order){
  FB.phase='place'; FB.order=order.slice(); FB.alive=new Set(order); FB.turn=-1; FB.ready=new Set();
  FB.fleet=fbRandomFleet(); FB.shots={}; FB.sunk={}; FB.faded={}; FB.reveal={}; FB.answered={};
  FB.view=order.find(id=>id!==S.myId); FB.aim=-1; FB.sel=-1; FB.awaiting=false;
  FB.pw={move:true, bomb:true}; FB.aimMode='shot'; FB.bombVert=false; FB.moving=false; FB.draft=null;
  FB.log=[]; FB.winner=-1; FB.last=null; FB.bottomKey='';
  S.mode='boats'; S.playing=false;
  fbOvHide(); showScreen('boats'); fbUpdate(); requestWake();
}
function fbStartMatch(){                        // host, after Start (or Rematch)
  if (S.role!=='host' || S.players.length<2 || S.lost) return;
  clearTimers(); S.inMatch=true; FB.solo=false; FB.g=(FB.g|0)+1;
  const order=fbShuffle(S.players.map(p=>p.id));   // random order = random first player
  fbRefStart(order);
  broadcast({t:'fb-start', g:FB.g, order, players:S.players, tally:FB.tally});
  fbBegin(order);
}
function fbStartSolo(){
  const keepTally = FB.solo ? FB.tally : {};
  clearTimers(); resetNet();
  S.role=null; S.game='boats'; S.myId=0;
  S.players=[{id:0, name:S.myName}, {id:CPU, name:'Computer'}];
  FB.solo=true; FB.tally=keepTally; FB.g=(FB.g|0)+1;
  FB.cpu={fleet:fbRandomFleet(), parity:Math.floor(Math.random()*2), pw:{move:true, bomb:true}, turns:0};
  const order=Math.random()<0.5 ? [0, CPU] : [CPU, 0];
  fbRefStart(order);
  fbBegin(order);
}
function fbRematch(btn){
  if (FB.solo) return fbStartSolo();
  if (S.lost) return leave();
  if (S.role==='host') return fbStartMatch();
  toHost({t:'fb-rematch', g:FB.g});
  if (btn){ btn.textContent='Starting…'; btn.disabled=true; }
}

/* ---------------- referee (host phone, or solo) ---------------- */
function fbSend(m){ if (!FB.solo) broadcast(m); }
function fbRefStart(order){
  FB.ref={order:order.slice(), alive:new Set(order), ready:new Set(), turn:-1, pending:null, between:false, over:false,
          shot:{}, sunkCells:{}, usedBomb:new Set()};
}
function fbRefReady(id){
  const R=FB.ref; if (!R || R.over || !R.alive.has(id)) return;
  R.ready.add(id);
  if (FB.solo) R.ready.add(CPU);
  const ready=[...R.ready];
  fbSend({t:'fb-readies', g:FB.g, ready}); fbApplyReadies(ready);
  if (R.turn===-1 && R.order.every(p=>!R.alive.has(p) || R.ready.has(p))) fbRefNextTurn(true);
}
function fbRefNextTurn(first){
  const R=FB.ref; if (!R || R.over) return;
  R.between=false;
  const alive=R.order.filter(p=>R.alive.has(p));
  if (alive.length<=1){ fbRefOver(alive.length ? alive[0] : -1); return; }
  const n=R.order.length, i=first ? -1 : R.order.indexOf(R.turn);
  let next=alive[0];
  for (let k=1;k<=n;k++){ const p=R.order[((i+k)%n+n)%n]; if (R.alive.has(p)){ next=p; break; } }
  R.turn=next;
  fbSend({t:'fb-turn', g:FB.g, turn:next}); fbApplyTurn(next);
  if (FB.solo && next===CPU) fbCpuMove();
}
const fbRefShot = (shooter, target, cell) => fbRefFire(shooter, target, [cell], false);
const fbRefBomb = (shooter, target, cells) => fbRefFire(shooter, target, cells, true);
function fbRefFire(shooter, target, cells, bomb){
  const R=FB.ref; if (!R || R.over) return;
  const done=R.shot[target] || (R.shot[target]=new Set()), sunkSet=R.sunkCells[target] || new Set();
  const fresh=c=>c>=0 && c<FB_N*FB_N && !done.has(c) && !sunkSet.has(c);
  let ok = !R.pending && !R.between && R.turn===shooter && target!==shooter && R.alive.has(target);
  if (ok && bomb){
    const [a,b]=cells;
    ok = cells.length===2 && !R.usedBomb.has(shooter)
      && ((Math.abs(a-b)===1 && fbRow(a)===fbRow(b)) || Math.abs(a-b)===FB_N) && cells.some(fresh);
  } else if (ok) ok = cells.length===1 && fresh(cells[0]);
  if (!ok){
    // tell a guest it's still their go, so their phone doesn't sit waiting
    if (!FB.solo && shooter!==S.myId && R.turn===shooter && !R.pending && !R.between) sendTo(shooter, {t:'fb-turn', g:FB.g, turn:R.turn});
    return;
  }
  if (bomb) R.usedBomb.add(shooter);
  R.pending={shooter, target, cells:cells.filter(fresh).sort((x,y)=>x-y), i:0, bomb, hits:0, cell:-1, at:0};
  fbRefAsk();
}
function fbRefAsk(){
  const R=FB.ref, p=R.pending;
  p.cell=p.cells[p.i]; p.at=performance.now();
  if (p.target===S.myId) fbRefResult(fbAnswer(p.cell));
  else if (FB.solo && p.target===CPU) fbRefResult(fbFleetShot(FB.cpu.fleet, p.cell));
  else sendTo(p.target, {t:'fb-incoming', g:FB.g, shooter:p.shooter, cell:p.cell});
}
function fbRefResult(res){
  const R=FB.ref, p=R && R.pending; if (!p) return;
  (R.shot[p.target] || (R.shot[p.target]=new Set())).add(p.cell);
  const sunk=res.sunk ? fbCleanBoat(res.sunk) : null;
  if (sunk){ const ss=R.sunkCells[p.target] || (R.sunkCells[p.target]=new Set()); sunk.cells.forEach(c=>ss.add(c)); }
  if (res.hit) p.hits++;
  const dead=!!res.dead, more=!dead && p.i+1<p.cells.length;
  const r={g:FB.g, shooter:p.shooter, target:p.target, cell:p.cell, hit:!!res.hit, sunk, dead, bomb:p.bomb, last:!more, hits:p.hits};
  if (dead) R.alive.delete(p.target);
  fbSend({t:'fb-res', ...r}); fbApplyResult(r);
  if (more){ p.i++; fbRefAsk(); return; }       // the bomb's second square
  R.pending=null; R.between=true;
  later(()=>fbRefNextTurn(false), 900);
}
function fbRefOver(winner){
  const R=FB.ref; if (!R || R.over) return;
  R.over=true;
  if (winner>=0) FB.tally[winner]=(FB.tally[winner]|0)+1;
  fbSend({t:'fb-over', g:FB.g, winner, tally:FB.tally}); fbApplyOver(winner, FB.tally);
}
function fbPlayerLeft(id){                       // host: a player left mid-game
  const R=FB.ref; FB.alive.delete(id);
  if (!R || R.over){ fbUpdate(); return; }
  const wasTurn=R.turn===id, p=R.pending, involved=p && (p.shooter===id || p.target===id);
  R.alive.delete(id); R.ready.delete(id);
  if (involved) R.pending=null;
  broadcast({t:'fb-gone', g:FB.g, id}); fbApplyGone(id);
  if (FB.phase==='place' || FB.phase==='wait' || R.turn===-1){
    const ready=[...R.ready]; broadcast({t:'fb-readies', g:FB.g, ready}); fbApplyReadies(ready);
    if (R.order.filter(x=>R.alive.has(x)).length>=2 && R.order.every(x=>!R.alive.has(x) || R.ready.has(x))) fbRefNextTurn(true);
    return;
  }
  if (R.order.filter(x=>R.alive.has(x)).length<=1){ fbRefOver(R.order.find(x=>R.alive.has(x)) ?? -1); return; }
  if ((wasTurn || involved) && !R.between) fbRefNextTurn(false);
}

/* ---------------- answering shots at my own fleet ---------------- */
function fbAnswer(cell){
  if (FB.answered[cell]) return FB.answered[cell];
  const res=fbFleetShot(FB.fleet, cell);
  FB.answered[cell]=res;
  if (FB.moving) fbSyncDraft();
  return res;
}

/* ---------------- messages ---------------- */
function fbHostMsg(id, m){
  if (S.game!=='boats') return;
  const R=FB.ref;
  switch (m.t){
    case 'fb-ready':   if (m.g===FB.g) fbRefReady(id); break;
    case 'fb-shot':    if (m.g===FB.g) fbRefShot(id, m.target|0, m.cell|0); break;
    case 'fb-bomb':    if (m.g===FB.g) fbRefBomb(id, m.target|0, fbCleanCells(m.cells).slice(0,2)); break;
    case 'fb-result':
      if (m.g===FB.g && R && R.pending && R.pending.target===id && R.pending.cell===(m.cell|0)) fbRefResult(m);
      break;
    case 'fb-moved':
      if (m.g===FB.g && FB.alive.has(id)){ const cells=fbCleanCells(m.cells); broadcast({t:'fb-moved', g:FB.g, id, cells}, id); fbApplyMoved(id, cells); }
      break;
    case 'fb-reveal':
      if (m.g===FB.g){ const fleet=fbCleanFleet(m.fleet); FB.reveal[id]=fleet; broadcast({t:'fb-reveal', g:FB.g, id, fleet}, id); FB.dirty=true; }
      break;
    case 'fb-rematch': if (FB.phase==='over') fbStartMatch(); break;
  }
}
function fbGuestMsg(m){
  if (m.t==='fb-start'){
    S.game='boats'; S.inMatch=true; S.players=normPlayers(m.players);
    FB.solo=false; FB.ref=null; FB.g=m.g|0; FB.tally=normWins(m.tally);
    fbBegin((Array.isArray(m.order)?m.order:[]).map(x=>x|0));
    return;
  }
  if ((m.g|0)!==FB.g) return;
  switch (m.t){
    case 'fb-readies': fbApplyReadies((m.ready||[]).map(x=>x|0)); break;
    case 'fb-turn':    fbApplyTurn(m.turn|0); break;
    case 'fb-incoming': {
      const cell=m.cell|0; if (cell<0 || cell>=100) return;
      const res=fbAnswer(cell);
      toHost({t:'fb-result', g:FB.g, cell, hit:res.hit, sunk:res.sunk, dead:res.dead});
      break; }
    case 'fb-res':
      fbApplyResult({shooter:m.shooter|0, target:m.target|0, cell:m.cell|0, hit:!!m.hit, sunk:fbCleanBoat(m.sunk), dead:!!m.dead,
                     bomb:!!m.bomb, last:m.last!==false, hits:m.hits|0});
      break;
    case 'fb-moved':  fbApplyMoved(m.id|0, fbCleanCells(m.cells)); break;
    case 'fb-gone':   fbApplyGone(m.id|0); break;
    case 'fb-over':   fbApplyOver(m.winner|0, normWins(m.tally)); break;
    case 'fb-reveal': FB.reveal[m.id|0]=fbCleanFleet(m.fleet); FB.dirty=true; break;
  }
}

/* ---------------- applying what happened (every phone) ---------------- */
const fbWho = id => id===S.myId ? 'You' : nameOf(id);
const fbRivals = () => FB.order.filter(id=>id!==S.myId && S.players.some(p=>p.id===id));
function fbApplyReadies(list){ FB.ready=new Set(list); fbUpdate(); }
function fbApplyTurn(turn){
  if (FB.phase==='over') return;
  FB.phase='battle'; FB.turn=turn; FB.awaiting=false; FB.aim=-1;
  if (turn!==S.myId || !FB.pw.bomb) FB.aimMode='shot';
  if (turn===S.myId && !FB.alive.has(FB.view)){ const v=fbRivals().find(id=>FB.alive.has(id)); if (v!=null) FB.view=v; }
  fbUpdate();
}
function fbApplyResult(r){
  const tgt=FB.shots[r.target] || (FB.shots[r.target]={});
  tgt[r.cell]={hit:r.hit, by:r.shooter};
  if (r.sunk) (FB.sunk[r.target] || (FB.sunk[r.target]=[])).push(r.sunk);
  if (r.dead) FB.alive.delete(r.target);
  FB.last={target:r.target, cell:r.cell, hit:r.hit, at:performance.now()};
  if (r.shooter===S.myId) FB.view=r.target;
  const cn=fbCellName(r.cell), them=r.target===S.myId ? 'you' : nameOf(r.target);
  const whose=r.target===S.myId ? 'your' : `${nameOf(r.target)}'s`;
  const you = r.shooter===S.myId || r.target===S.myId, b=r.bomb ? '💣 ' : '';
  if (r.sunk) fbLog(`${b}${fbWho(r.shooter)} sank ${whose} ${r.sunk.name}! (${cn})`, 'sunk', you);
  else fbLog(`${b}${fbWho(r.shooter)} → ${them} ${cn}: ${r.hit?'hit!':'splash'}`, r.hit?'hit':'', you);
  if (r.shooter===S.myId){
    if (r.sunk) fbToast(`You sank ${esc(whose)} <b>${esc(r.sunk.name)}</b>!`);
    else if (r.bomb){ if (r.last) fbToast(r.hits ? `💣 <b>Boom!</b> ${r.hits} hit${r.hits>1?'s':''} on ${esc(nameOf(r.target))}` : '💣 Both squares splashed', !r.hits); }
    else if (r.hit) fbToast(`<b>Clonk!</b> A hit on ${esc(nameOf(r.target))}`);
    else fbToast('Splash — missed', true);
  } else if (r.target===S.myId){
    const boat=(FB.fleet.find(x=>x.cells.includes(r.cell))||{}).name;
    if (r.sunk) fbToast(`${esc(nameOf(r.shooter))} sank your <b>${esc(r.sunk.name)}</b>!`);
    else if (r.bomb){ if (r.last) fbToast(r.hits ? `💣 ${esc(nameOf(r.shooter))} bombed you: ${r.hits} hit${r.hits>1?'s':''}` : `💣 ${esc(nameOf(r.shooter))}'s bomb missed you`, !r.hits); }
    else if (r.hit) fbToast(`${esc(nameOf(r.shooter))} hit your <b>${esc(boat||'boat')}</b>!`);
    else fbToast(`${esc(nameOf(r.shooter))} missed you (${cn})`, true);
  } else if (r.bomb && r.last){
    fbToast(`💣 ${esc(nameOf(r.shooter))} bombed ${esc(nameOf(r.target))}`, true);
  }
  if (r.dead){
    fbLog(`${r.target===S.myId?'Your':`${nameOf(r.target)}'s`} fleet is sunk!`, 'sunk', r.target===S.myId);
    if (r.target===S.myId){ fbToast('Your fleet is sunk!'); FB.moving=false; FB.draft=null; }
    else if (r.shooter!==S.myId) fbToast(`${esc(nameOf(r.target))}'s fleet is sunk!`, true);
  }
  fbUpdate();
}
function fbApplyMoved(id, cells){
  const f=FB.faded[id] || (FB.faded[id]=new Set());
  cells.forEach(c=>f.add(c));
  fbLog(`⚓ ${fbWho(id)} moved a boat!`, 'sunk', id===S.myId);
  fbToast(id===S.myId ? '⚓ Boat moved' : `⚓ <b>${esc(nameOf(id))}</b> moved a boat!`, id===S.myId);
  fbUpdate();
}
function fbApplyGone(id){
  if (!FB.alive.has(id)) return;
  FB.alive.delete(id);
  fbLog(`${nameOf(id)} left the game`, '', false);
  if (FB.view===id){ const v=fbRivals().find(x=>FB.alive.has(x)); if (v!=null) FB.view=v; }
  fbUpdate();
}
function fbApplyOver(winner, tally){
  if (FB.phase==='over') return;
  FB.phase='over'; FB.winner=winner; FB.tally=tally||{}; FB.turn=-1; FB.aim=-1; FB.awaiting=false;
  FB.moving=false; FB.draft=null; FB.aimMode='shot'; FB.sel=-1;
  const pub=fbPublic(FB.fleet);                  // show everyone where my boats were
  if (FB.solo) FB.reveal[CPU]=fbPublic(FB.cpu.fleet);
  else if (S.role==='host') broadcast({t:'fb-reveal', g:FB.g, id:S.myId, fleet:pub});
  else toHost({t:'fb-reveal', g:FB.g, fleet:pub});
  const me=winner===S.myId;
  fbOverlay(`<div class="ov-big ${me?'win':'lose'}${me?'':' mid-size'}">${me?'You win!':`${esc(nameOf(winner))} wins!`}</div>
    <div class="ov-sub">${fbTallyText() || 'Game over'}</div>
    <button class="btn primary" data-fbov="rematch">${FB.solo?'Play again':'Rematch'}</button>
    <button class="btn" data-fbov="view">See where the boats were</button>
    <button class="btn" data-fbov="menu">${FB.solo?'Menu':'Leave'}</button>`);
  fbUpdate();
}
function fbRoster(){
  if (!fbRivals().includes(FB.view)){ const v=fbRivals().find(x=>FB.alive.has(x)) ?? fbRivals()[0]; if (v!=null) FB.view=v; }
  fbUpdate();
}
function fbLog(txt, cls, you){ FB.log.push({txt, cls, you}); if (FB.log.length>30) FB.log.shift(); }
function fbTallyText(){
  const ids=S.players.map(p=>p.id);
  if (!ids.some(id=>FB.tally[id])) return '';
  return S.players.map(p=>`${esc(p.id===S.myId?'You':p.name)} ${FB.tally[p.id]|0}`).join(' · ');
}

/* ---------------- computer opponent ---------------- */
function fbCpuMove(){
  later(()=>{
    if (!fbCpuTurn()) return;
    if (fbCpuMaybeMove()) later(fbCpuFire, 900); else fbCpuFire();
  }, 750 + Math.random()*550);
}
const fbCpuTurn = () => FB.solo && FB.phase==='battle' && FB.ref && FB.ref.turn===CPU && !FB.ref.pending && !FB.ref.between;
function fbCpuFire(){
  if (!fbCpuTurn()) return;
  FB.cpu.turns++;
  const bomb=FB.cpu.pw.bomb ? fbAiBombPick() : null;
  if (bomb){ FB.cpu.pw.bomb=false; fbRefBomb(CPU, S.myId, bomb); }
  else fbRefShot(CPU, S.myId, fbAiPick());
}
// Once per game the computer moves a damaged boat that's close to sinking.
function fbCpuMaybeMove(){
  const c=FB.cpu; if (!c || !c.pw.move) return false;
  const shots=FB.shots[CPU] || {};
  const idx=c.fleet.findIndex(b=>b.hits.size>0 && b.hits.size<b.len && b.hits.size>=Math.min(2, b.len-1));
  if (idx<0) return false;
  const b=c.fleet[idx];
  for (let k=0;k<500;k++){
    const cells=fbBoatCells(Math.floor(Math.random()*FB_N*FB_N), b.len, Math.random()<0.5);
    if (cells && fbFits(c.fleet, idx, cells) && cells.every(x=>!shots[x])){
      const pub=b.cells.filter(x=>shots[x] && shots[x].hit);
      fbMoveBoat(c.fleet, idx, cells); c.pw.move=false;
      fbApplyMoved(CPU, pub);
      return true;
    }
  }
  return false;
}
function fbAiOpen(){
  const me=S.myId, shots=FB.shots[me] || {}, faded=FB.faded[me] || new Set();
  const sunkCells=new Set((FB.sunk[me]||[]).flatMap(b=>b.cells));
  return Object.keys(shots).map(Number).filter(c=>shots[c].hit && !sunkCells.has(c) && !faded.has(c));
}
// Hunts on a checkerboard; after a hit, tries the squares around it, then follows the line.
function fbAiPick(){
  const me=S.myId, free=c=>fbFresh(me, c);
  const open=fbAiOpen();
  if (open.length){
    const os=new Set(open), line=[];
    for (const c of open){
      const r=fbRow(c), k=c%FB_N;
      if ((k>0 && os.has(c-1)) || (k<FB_N-1 && os.has(c+1))){
        let a=c; while (a%FB_N>0 && os.has(a-1)) a--;
        let b=c; while (b%FB_N<FB_N-1 && os.has(b+1)) b++;
        if (a%FB_N>0 && free(a-1)) line.push(a-1);
        if (b%FB_N<FB_N-1 && free(b+1)) line.push(b+1);
      }
      if ((r>0 && os.has(c-FB_N)) || (r<FB_N-1 && os.has(c+FB_N))){
        let a=c; while (a>=FB_N && os.has(a-FB_N)) a-=FB_N;
        let b=c; while (b<FB_N*(FB_N-1) && os.has(b+FB_N)) b+=FB_N;
        if (a>=FB_N && free(a-FB_N)) line.push(a-FB_N);
        if (b<FB_N*(FB_N-1) && free(b+FB_N)) line.push(b+FB_N);
      }
    }
    if (line.length) return fbPick(line);
    const adj=[];
    for (const c of open){
      const r=fbRow(c), k=c%FB_N;
      if (r>0 && free(c-FB_N)) adj.push(c-FB_N);
      if (r<FB_N-1 && free(c+FB_N)) adj.push(c+FB_N);
      if (k>0 && free(c-1)) adj.push(c-1);
      if (k<FB_N-1 && free(c+1)) adj.push(c+1);
    }
    if (adj.length) return fbPick(adj);
  }
  const sunkNames=(FB.sunk[me]||[]).map(b=>b.name);
  const left=FB_FLEET.filter(b=>!sunkNames.includes(b.name)).map(b=>b.len);
  const minLen=left.length ? Math.min(...left) : 2;
  const par=(FB.cpu ? FB.cpu.parity : 0) % minLen;
  const hunt=[], any=[];
  for (let c=0;c<FB_N*FB_N;c++){
    if (!free(c)) continue;
    any.push(c);
    if ((fbRow(c)+c%FB_N)%minLen===par) hunt.push(c);
  }
  return fbPick(hunt.length ? hunt : any);
}
// When to use the big bomb: to push two squares further along a line of hits,
// or two squares out from a single hit; failing that, late in a long hunt.
function fbAiBombPick(){
  const me=S.myId, free=c=>fbFresh(me, c);
  const open=fbAiOpen(), os=new Set(open), pairs=[];
  const pair=(a,b)=>{ if (free(a) && free(b)) pairs.push([Math.min(a,b), Math.max(a,b)]); };
  for (const c of open){
    const k=c%FB_N, r=fbRow(c);
    if ((k>0 && os.has(c-1)) || (k<FB_N-1 && os.has(c+1))){
      let a=c; while (a%FB_N>0 && os.has(a-1)) a--;
      let b=c; while (b%FB_N<FB_N-1 && os.has(b+1)) b++;
      if (a%FB_N>=2) pair(a-1, a-2);
      if (b%FB_N<=FB_N-3) pair(b+1, b+2);
    }
    if ((r>0 && os.has(c-FB_N)) || (r<FB_N-1 && os.has(c+FB_N))){
      let a=c; while (a>=FB_N && os.has(a-FB_N)) a-=FB_N;
      let b=c; while (b<FB_N*(FB_N-1) && os.has(b+FB_N)) b+=FB_N;
      if (fbRow(a)>=2) pair(a-FB_N, a-2*FB_N);
      if (fbRow(b)<=FB_N-3) pair(b+FB_N, b+2*FB_N);
    }
  }
  if (pairs.length) return fbPick(pairs);
  for (const c of open){
    const k=c%FB_N, r=fbRow(c);
    if (k>=2) pair(c-1, c-2);
    if (k<=FB_N-3) pair(c+1, c+2);
    if (r>=2) pair(c-FB_N, c-2*FB_N);
    if (r<=FB_N-3) pair(c+FB_N, c+2*FB_N);
  }
  if (pairs.length) return fbPick(pairs);
  if (open.length || !FB.cpu || FB.cpu.turns<12) return null;
  for (let c=0;c<FB_N*FB_N;c++){
    if (c%FB_N<FB_N-1) pair(c, c+1);
    if (fbRow(c)<FB_N-1) pair(c, c+FB_N);
  }
  return pairs.length ? fbPick(pairs) : null;
}

/* ---------------- placing boats ---------------- */
// Put boat idx of fleet so it covers the anchor square, as centred on it as possible.
function fbTryPlace(fleet, idx, anchor, horiz, okCell){
  const b=fleet[idx], r=fbRow(anchor), c=anchor%FB_N, len=b.cells.length;
  const pos=horiz ? c : r, ideal=pos-Math.floor(len/2);
  const starts=[];
  for (let s=pos-len+1; s<=pos; s++) if (s>=0 && s+len<=FB_N) starts.push(s);
  starts.sort((a,z)=>Math.abs(a-ideal)-Math.abs(z-ideal));
  for (const s of starts){
    const cells=fbBoatCells(horiz ? r*FB_N+s : s*FB_N+c, len, horiz);
    if (cells && fbFits(fleet, idx, cells) && (!okCell || cells.every(okCell))){ b.cells=cells; return true; }
  }
  return false;
}
function fbPlaceTap(cell){
  const fl=FB.fleet, idx=fl.findIndex(b=>b.cells.includes(cell));
  if (FB.sel<0){
    if (idx>=0) FB.sel=idx; else fbToast('Tap one of your boats first', true);
  } else if (idx===FB.sel){
    if (!fbTryPlace(fl, idx, cell, !fbIsH(fl[idx].cells))) fbToast('No room to turn it there', true);
  } else if (idx>=0){
    FB.sel=idx;
  } else if (!fbTryPlace(fl, FB.sel, cell, fbIsH(fl[FB.sel].cells))){
    fbToast("It won't fit there", true);
  }
  fbUpdate();
}
function fbReady(){
  if (FB.phase!=='place') return;
  FB.phase='wait'; FB.sel=-1;
  if (FB.solo || S.role==='host') fbRefReady(S.myId);
  else toHost({t:'fb-ready', g:FB.g});
  fbUpdate();
}

/* ---------------- move-a-boat power-up ---------------- */
const fbCanMove = () => FB.phase==='battle' && FB.pw.move && FB.alive.has(S.myId);
function fbStartMove(){
  if (!fbCanMove()) return;
  FB.aimMode='shot'; FB.aim=-1;
  FB.moving=true; FB.sel=-1;
  FB.draft=FB.fleet.map(b=>({...b, cells:b.cells.slice()}));
  fbUpdate();
}
function fbCancelMove(){ FB.moving=false; FB.draft=null; FB.sel=-1; fbUpdate(); }
function fbSyncDraft(){                  // a shot landed while choosing: keep the draft sensible
  if (!FB.draft) return;
  const shots=FB.shots[S.myId] || {};
  FB.draft.forEach((d,i)=>{ if (d.cells.some(c=>shots[c] && !FB.fleet[i].cells.includes(c))) d.cells=FB.fleet[i].cells.slice(); });
}
function fbMoveTap(cell){
  const fl=FB.draft, shots=FB.shots[S.myId] || {};
  const open=c=>!shots[c];
  const idx=fl.findIndex(b=>b.cells.includes(cell));
  const afloat=i=>FB.fleet[i].hits.size<FB.fleet[i].len;
  if (FB.sel<0){
    if (idx>=0 && afloat(idx)) FB.sel=idx;
    else fbToast(idx>=0 ? 'That boat has sunk' : 'Tap the boat you want to move', true);
  } else if (idx===FB.sel){
    if (!fbTryPlace(fl, idx, cell, !fbIsH(fl[idx].cells), open)) fbToast('No open water to turn it there', true);
  } else if (idx>=0){
    if (!afloat(idx)){ fbToast('That boat has sunk', true); }
    else { fl[FB.sel].cells=FB.fleet[FB.sel].cells.slice(); FB.sel=idx; }      // only one boat moves
  } else if (shots[cell]){
    fbToast('Boats can only move into water nobody has fired at', true);
  } else if (!fbTryPlace(fl, FB.sel, cell, fbIsH(fl[FB.sel].cells), open)){
    fbToast("It won't fit there", true);
  }
  fbUpdate();
}
const fbDraftChanged = () => FB.sel>=0 && FB.draft && FB.draft[FB.sel].cells.join()!==FB.fleet[FB.sel].cells.join();
function fbCommitMove(){
  if (!FB.moving || !fbDraftChanged() || !fbCanMove()) return;
  const i=FB.sel, nc=FB.draft[i].cells, shots=FB.shots[S.myId] || {};
  if (!nc.every(c=>!shots[c]) || !fbFits(FB.fleet, i, nc)){ fbToast("Can't move there now", true); return; }
  const pub=FB.fleet[i].cells.filter(c=>shots[c] && shots[c].hit);    // old hit squares everyone saw
  fbMoveBoat(FB.fleet, i, nc);
  FB.pw.move=false; FB.moving=false; FB.draft=null; FB.sel=-1;
  if (FB.solo || S.role==='host') fbSend({t:'fb-moved', g:FB.g, id:S.myId, cells:pub});
  else toHost({t:'fb-moved', g:FB.g, cells:pub});
  fbApplyMoved(S.myId, pub);
}

/* ---------------- firing ---------------- */
const fbMyGo = () => FB.phase==='battle' && FB.turn===S.myId && FB.alive.has(S.myId) && !FB.awaiting && !FB.moving
                  && FB.view!==S.myId && FB.alive.has(FB.view);
const fbCanAim = cell => fbMyGo() && fbFresh(FB.view, cell);
const fbBombOk = cell => fbMyGo() && FB.pw.bomb && fbBombCells(cell, FB.bombVert).some(c=>fbFresh(FB.view, c));
function fbToggleBomb(){
  if (FB.aimMode==='bomb'){ FB.aimMode='shot'; FB.aim=-1; }
  else if (fbMyGo() && FB.pw.bomb){ FB.aimMode='bomb'; FB.aim=-1; }
  fbUpdate();
}
function fbFire(){
  const cell=FB.aim, target=FB.view;
  if (cell<0) return;
  if (FB.aimMode==='bomb'){
    if (!fbBombOk(cell)) return;
    const cells=fbBombCells(cell, FB.bombVert);
    FB.pw.bomb=false; FB.aimMode='shot'; FB.aim=-1; FB.awaiting=true; fbUpdate();
    if (FB.solo || S.role==='host') fbRefBomb(S.myId, target, cells);
    else toHost({t:'fb-bomb', g:FB.g, target, cells});
    return;
  }
  if (!fbCanAim(cell)) return;
  FB.aim=-1; FB.awaiting=true; fbUpdate();
  if (FB.solo || S.role==='host') fbRefShot(S.myId, target, cell);
  else toHost({t:'fb-shot', g:FB.g, target, cell});
}
function fbTap(cell){
  if (FB.phase==='place'){ fbPlaceTap(cell); return; }
  if (FB.moving){ fbMoveTap(cell); return; }
  if (FB.aimMode==='bomb'){
    if (FB.aim===cell){                              // tap again: turn the bomb across/down
      FB.bombVert=!FB.bombVert;
      if (!fbBombOk(cell)) FB.bombVert=!FB.bombVert;
    } else if (fbBombOk(cell)) FB.aim=cell;
    fbUpdate(); return;
  }
  if (!fbCanAim(cell)) return;
  if (FB.aim===cell){ fbFire(); return; }      // tap the same square again to fire
  FB.aim=cell; fbUpdate();
}

/* ---------------- screen ---------------- */
function fbStatusHTML(){
  const rivals=fbRivals(), many=rivals.filter(id=>FB.alive.has(id)).length>1;
  if (FB.moving) return '<b>Move a boat:</b> tap it, then tap open water (no splashes or hits). Tap it again to turn it, then press <b>Move it!</b>';
  switch (FB.phase){
    case 'place': return 'Hide your boats: tap one, then tap the water to move it. Tap it again to turn it.';
    case 'wait': {
      const waiting=FB.order.filter(id=>id!==S.myId && FB.alive.has(id) && !FB.ready.has(id));
      return waiting.length ? `Waiting for <b>${waiting.map(id=>esc(nameOf(id))).join('</b> and <b>')}</b> to hide their boats…` : 'Starting…';
    }
    case 'battle':
      if (!FB.alive.has(S.myId)) return `Your fleet is sunk — watching. <b>${esc(nameOf(FB.turn))}</b>'s turn.`;
      if (FB.turn===S.myId){
        if (FB.awaiting) return 'Firing…';
        if (FB.aimMode==='bomb') return `<b>Big bomb:</b> tap a square in <b>${esc(nameOf(FB.view))}</b>'s waters — tap it again to turn the bomb across/down — then press <b>Drop bomb</b>.`;
        return `<b>Your turn</b> — pick a square in <b>${esc(nameOf(FB.view))}</b>'s waters${many?' (tap a name to switch)':''}, then tap it again or press Fire.`;
      }
      return FB.turn===CPU ? 'The computer is taking aim…' : `<b>${esc(nameOf(FB.turn))}</b> is taking aim…`;
    case 'over': return rivals.length>1 ? 'Game over — tap a name to see where their boats were.' : 'Game over.';
  }
  return '';
}
const FB_ICON_MOVE = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 20h20q5 0 7-4-3-2-7-2H6q-3 0-3 3z" fill="#1f6b4a"/><rect x="7" y="11" width="12" height="4" rx="1" fill="#7a2232"/><path d="M4 26q4-2 8 0t8 0 8 0" fill="none" stroke="#48b6ff" stroke-width="2" stroke-linecap="round"/><path d="M22 5h7m0 0-3-3m3 3-3 3" fill="none" stroke="#ffb03b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const FB_ICON_BOMB = '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="14" cy="19" r="10" fill="#2a2d3d" stroke="#596079" stroke-width="1.5"/><circle cx="10.5" cy="15.5" r="2.5" fill="#596079"/><path d="M20 11l3-3" stroke="#8b90b2" stroke-width="3" stroke-linecap="round"/><path d="M23 8q2-4 5-3" fill="none" stroke="#c98a12" stroke-width="1.8" stroke-linecap="round"/><g fill="#ffd23f"><circle cx="28" cy="5" r="2"/><circle cx="30.5" cy="2.5" r="1"/><circle cx="25.5" cy="2" r="1"/></g></svg>';
function fbUpdate(){
  FB.dirty=true;
  if (!onBoatsScreen()) return;
  const st=$('#fbStatus');
  st.innerHTML=fbStatusHTML();
  st.classList.toggle('myturn', FB.moving || (FB.phase==='battle' && FB.turn===S.myId && FB.alive.has(S.myId)));
  $('#fbScore').innerHTML=fbTallyText();

  // rival tabs
  const showTabs=(FB.phase==='battle' || FB.phase==='over') && !FB.moving;
  $('#fbTabs').innerHTML = showTabs ? fbRivals().map(id=>{
    const left=FB_FLEET.length-(FB.sunk[id]||[]).length, out=!FB.alive.has(id);
    const sub = out ? (left===0 ? 'fleet sunk' : 'out') : `${left} boat${left===1?'':'s'} afloat`;
    return `<button class="fb-tab${id===FB.view?' on':''}${out?' out':''}${id===FB.turn?' turn':''}" data-id="${id}"><span class="tn">${esc(nameOf(id))}</span><small>${sub}</small></button>`;
  }).join('') : '';

  // bottom area
  const key = FB.phase==='place' ? 'place' : FB.phase==='wait' ? 'wait' : 'battle';
  const bottom=$('#fbBottom');
  if (FB.bottomKey!==key){
    FB.bottomKey=key;
    bottom.className='fb-bottom'+(key==='battle'?'':' place');
    bottom.innerHTML = key==='place'
      ? `<div class="fb-fleet" id="fbChips"></div><div class="fb-btns"><button class="btn" id="fbShuffle">Shuffle</button><button class="btn primary" id="fbReadyBtn">Ready!</button></div>`
      : key==='wait' ? `<div class="fb-wait" id="fbWait"></div>`
      : `<div class="fb-mine-wrap"><div class="lbl" id="fbMineLbl">YOUR FLEET</div><canvas id="fbMine"></canvas></div>
         <div class="fb-side">
           <div class="fb-pws"><button class="fb-pw" id="fbPwMove">${FB_ICON_MOVE}<span></span></button><button class="fb-pw" id="fbPwBomb">${FB_ICON_BOMB}<span></span></button></div>
           <div class="fb-log" id="fbLog"></div>
           <button class="btn primary" id="fbAct"></button>
         </div>`;
    requestAnimationFrame(()=>fbLayout());
  }
  if (key==='place'){
    $('#fbChips').innerHTML=FB.fleet.map((b,i)=>`<button class="fb-chip${i===FB.sel?' sel':''}" data-i="${i}">${b.name} · ${b.len}</button>`).join('');
  } else if (key==='wait'){
    $('#fbWait').innerHTML = `<b>Ready ✓</b><br>` + FB.order.filter(id=>FB.alive.has(id)).map(id=>`${esc(id===S.myId?'You':nameOf(id))}: ${FB.ready.has(id)?'<b>ready</b>':'hiding boats…'}`).join('<br>');
  } else {
    const afloat=FB.fleet.filter(b=>b.hits.size<b.len).length;
    $('#fbMineLbl').textContent=`YOUR FLEET · ${afloat} AFLOAT`;
    $('#fbLog').innerHTML=FB.log.slice(-4).map(l=>`<div class="${l.cls}${l.you?' you':''}">${esc(l.txt)}</div>`).join('');
    // power-up buttons
    const mv=$('#fbPwMove'), bm=$('#fbPwBomb'), live=FB.phase==='battle' && FB.alive.has(S.myId);
    mv.classList.toggle('used', !FB.pw.move); mv.classList.toggle('on', FB.moving);
    mv.querySelector('span').textContent = FB.moving ? 'Cancel' : FB.pw.move ? 'Move boat' : 'Used';
    mv.disabled = !(FB.moving || (live && FB.pw.move));
    bm.classList.toggle('used', !FB.pw.bomb); bm.classList.toggle('on', FB.aimMode==='bomb');
    bm.querySelector('span').textContent = FB.aimMode==='bomb' ? 'Cancel' : FB.pw.bomb ? 'Big bomb' : 'Used';
    bm.disabled = !(FB.aimMode==='bomb' || (fbMyGo() && FB.pw.bomb));
    // main action button
    const act=$('#fbAct');
    if (FB.phase==='over'){ act.textContent=FB.solo?'Play again':'Rematch'; act.disabled=false; act.dataset.act='rematch'; }
    else if (FB.moving){ act.textContent='Move it!'; act.dataset.act='move'; act.disabled=!fbDraftChanged(); }
    else if (!FB.alive.has(S.myId)){ act.textContent='Watching'; act.disabled=true; act.dataset.act=''; }
    else if (FB.turn===S.myId){
      act.dataset.act='fire';
      if (FB.aimMode==='bomb'){
        const cells=FB.aim>=0 ? fbBombCells(FB.aim, FB.bombVert) : null;
        act.textContent = cells ? `Drop bomb: ${fbCellName(cells[0])}+${fbCellName(cells[1])}` : 'Pick a square';
      } else act.textContent = FB.awaiting ? 'Firing…' : FB.aim>=0 ? `Fire at ${fbCellName(FB.aim)}!` : 'Pick a square';
      act.disabled = FB.awaiting || FB.aim<0;
    } else { act.textContent=FB.turn===CPU?"Computer's turn":`${nameOf(FB.turn)}'s turn`; act.disabled=true; act.dataset.act=''; }
  }
}
function fbLayout(){
  if (!onBoatsScreen()) return;
  const main=$('#fbMain'), W=main.clientWidth, H=main.clientHeight;
  if (!W || !H) return;
  const size=Math.floor(Math.min(W, H, 520));
  FBL.lab=Math.max(14, Math.round(size*0.055));
  FBL.cell=Math.max(12, Math.floor((size-FBL.lab-2)/FB_N));
  const px=FBL.lab+FBL.cell*FB_N+2;
  sizeCanvas($('#fbCv'), px, px);
  const mine=$('#fbMine');
  if (mine){ FBL.mini = window.innerHeight>=640 ? 13 : 11; sizeCanvas(mine, FBL.mini*FB_N, FBL.mini*FB_N); }
  FB.dirty=true;
}

/* ---------------- drawing ---------------- */
function fbHullPath(x, l, r, top, bot){
  const th=bot-top;
  x.beginPath();
  x.moveTo(l+th*0.28, top);
  x.lineTo(r-th*0.95, top);
  x.quadraticCurveTo(r-th*0.15, top, r, (top+bot)/2);       // pointed bow
  x.quadraticCurveTo(r-th*0.15, bot, r-th*0.95, bot);
  x.lineTo(l+th*0.28, bot);
  x.quadraticCurveTo(l, bot, l, bot-th*0.28);              // rounded stern
  x.lineTo(l, top+th*0.28);
  x.quadraticCurveTo(l, top, l+th*0.28, top);
  x.closePath();
}
function fbDrawBoat(x, b, ox, oy, cell, style){
  const h=fbIsH(b.cells), len=b.cells.length;
  const r0=fbRow(b.cells[0]), c0=b.cells[0]%FB_N;
  const W=h ? len*cell : cell, H=h ? cell : len*cell;
  x.save();
  x.translate(ox+c0*cell+W/2, oy+r0*cell+H/2);
  if (!h) x.rotate(Math.PI/2);
  const L=len*cell, pad=cell*0.11, l=-L/2+pad, r=L/2-pad, top=-cell/2+pad*1.2, bot=cell/2-pad*1.2, th=bot-top;
  if (style==='ghost') x.globalAlpha=0.55;
  fbHullPath(x, l, r, top, bot);
  x.fillStyle = style==='sunk' ? '#3b4252' : b.color; x.fill();
  if (style!=='sunk'){
    const cl=l+th*0.6, cr=r-th*1.35;
    if (cr>cl){
      x.fillStyle='rgba(255,255,255,.17)'; rr(x, cl, top+th*0.2, cr-cl, th*0.6, th*0.18); x.fill();
      x.fillStyle='#fff3c4';
      const n=Math.max(1, len-1);
      for (let i=0;i<n;i++){ x.beginPath(); x.arc(cl+(i+0.5)*(cr-cl)/n, (top+bot)/2, Math.max(1.1, th*0.09), 0, Math.PI*2); x.fill(); }
      if (len>=4){ x.fillStyle='#20232c'; x.fillRect(cr-th*0.3, (top+bot)/2-th*0.13, th*0.2, th*0.26); }   // chimney
    }
    x.strokeStyle='#f2c14e'; x.lineWidth=Math.max(1, th*0.07);
    x.beginPath(); x.moveTo(l+th*0.3, bot-th*0.13); x.lineTo(r-th*0.95, bot-th*0.13); x.stroke();
  } else {
    x.strokeStyle='rgba(0,0,0,.35)'; x.lineWidth=Math.max(1, th*0.06);
    x.beginPath(); x.moveTo(l+th*0.4, top+th*0.3); x.lineTo(r-th*1.1, bot-th*0.3); x.stroke();
  }
  if (style==='sel' || style==='ghost'){
    fbHullPath(x, l, r, top, bot);
    x.strokeStyle = style==='sel' ? '#ffb03b' : '#eef0ff';
    x.lineWidth = style==='sel' ? Math.max(2, cell*0.09) : Math.max(1, cell*0.04);
    if (style==='ghost') x.setLineDash([cell*0.12, cell*0.1]);
    x.stroke(); x.setLineDash([]);
  }
  x.restore();
}
function fbDrawMiss(x, cx, cy, cell){
  x.strokeStyle='rgba(215,240,255,.55)'; x.lineWidth=Math.max(1, cell*0.05);
  x.beginPath(); x.arc(cx, cy, cell*0.27, 0, Math.PI*2); x.stroke();
  x.fillStyle='rgba(215,240,255,.75)'; x.beginPath(); x.arc(cx, cy, cell*0.1, 0, Math.PI*2); x.fill();
}
function fbDrawHit(x, cx, cy, cell){
  const n=8, R=cell*0.4, r=cell*0.19;
  x.beginPath();
  for (let i=0;i<n*2;i++){ const a=i*Math.PI/n - Math.PI/2, d=i%2 ? r : R; x.lineTo(cx+Math.cos(a)*d, cy+Math.sin(a)*d); }
  x.closePath(); x.fillStyle='#ff5a3d'; x.fill();
  x.fillStyle='#ffd23f'; x.beginPath(); x.arc(cx, cy, cell*0.13, 0, Math.PI*2); x.fill();
}
function fbDrawFaded(x, cx, cy, cell){              // a hit whose boat has since moved away
  x.strokeStyle='rgba(255,140,110,.45)'; x.lineWidth=Math.max(1, cell*0.05); x.setLineDash([cell*0.08, cell*0.07]);
  x.beginPath(); x.arc(cx, cy, cell*0.3, 0, Math.PI*2); x.stroke(); x.setLineDash([]);
  x.fillStyle='rgba(255,140,110,.35)'; x.beginPath(); x.arc(cx, cy, cell*0.09, 0, Math.PI*2); x.fill();
}
function fbDrawWater(x, ox, oy, cell, labels){
  const S2=cell*FB_N;
  const g=x.createLinearGradient(0, oy, 0, oy+S2); g.addColorStop(0,'#123f47'); g.addColorStop(1,'#0d3037');
  x.fillStyle=g; rr(x, ox, oy, S2, S2, Math.min(10, cell*0.3)); x.fill();
  x.strokeStyle='rgba(255,255,255,.07)'; x.lineWidth=1;
  for (let i=1;i<FB_N;i++){
    x.beginPath(); x.moveTo(ox+i*cell+.5, oy); x.lineTo(ox+i*cell+.5, oy+S2); x.stroke();
    x.beginPath(); x.moveTo(ox, oy+i*cell+.5); x.lineTo(ox+S2, oy+i*cell+.5); x.stroke();
  }
  if (labels){
    x.fillStyle='#8b90b2'; x.font=`700 ${Math.round(FBL.lab*0.58)}px -apple-system,system-ui,sans-serif`;
    x.textAlign='center'; x.textBaseline='middle';
    for (let i=0;i<FB_N;i++){
      x.fillText(FB_COLS[i], ox+(i+0.5)*cell, oy/2);
      x.fillText(String(i+1), ox/2, oy+(i+0.5)*cell);
    }
  }
}
const fbCenter = (ox, oy, cell, c) => [ox+(c%FB_N+0.5)*cell, oy+(fbRow(c)+0.5)*cell];
function fbPulse(x, ox, oy, cell, target){
  const L=FB.last; if (!L || L.target!==target) return false;
  const t=(performance.now()-L.at)/800; if (t>=1) return false;
  const [cx,cy]=fbCenter(ox, oy, cell, L.cell);
  x.strokeStyle = L.hit ? `rgba(255,120,80,${1-t})` : `rgba(215,240,255,${1-t})`;
  x.lineWidth=Math.max(1.5, cell*0.08);
  x.beginPath(); x.arc(cx, cy, cell*(0.3+0.9*t), 0, Math.PI*2); x.stroke();
  return true;
}
// My own waters: my boats (or the move draft), their damage, and every shot fired at me.
function fbDrawMine(x, ox, oy, cell, labels){
  fbDrawWater(x, ox, oy, cell, labels);
  const boats=FB.moving && FB.draft ? FB.draft : FB.fleet;
  const damage=new Set();
  boats.forEach((b,i)=>{
    const real=FB.fleet[i];
    real.cells.forEach((c,k)=>{ if (real.hits.has(c)) damage.add(b.cells[k]); });
    fbDrawBoat(x, b, ox, oy, cell, real.hits.size===real.len ? 'sunk' : (FB.moving && i===FB.sel ? 'sel' : 'mine'));
  });
  const inc=FB.shots[S.myId] || {};
  for (const k in inc){
    const c=+k, [cx,cy]=fbCenter(ox, oy, cell, c);
    if (!inc[k].hit) fbDrawMiss(x, cx, cy, cell);
    else if (!damage.has(c)) fbDrawFaded(x, cx, cy, cell);
  }
  damage.forEach(c=>{ const [cx,cy]=fbCenter(ox, oy, cell, c); fbDrawHit(x, cx, cy, cell); });
  return fbPulse(x, ox, oy, cell, S.myId);
}
function fbRender(){
  const cv=$('#fbCv'); if (!cv || !cv.width) return false;
  const x=cv.getContext('2d'); x.setTransform(DPR,0,0,DPR,0,0);
  x.clearRect(0, 0, cv.width, cv.height);
  const ox=FBL.lab, oy=FBL.lab, cell=FBL.cell;
  let anim=false;
  if (FB.moving){
    anim=fbDrawMine(x, ox, oy, cell, true);
  } else if (FB.phase==='place' || FB.phase==='wait' || FB.phase==='idle'){
    fbDrawWater(x, ox, oy, cell, true);
    FB.fleet.forEach((b,i)=>fbDrawBoat(x, b, ox, oy, cell, i===FB.sel ? 'sel' : 'mine'));
  } else {
    fbDrawWater(x, ox, oy, cell, true);
    const t=FB.view, shots=FB.shots[t] || {}, sunk=FB.sunk[t] || [], faded=FB.faded[t] || new Set();
    if (FB.phase==='over' && FB.reveal[t]) FB.reveal[t].forEach(b=>{ if (!sunk.some(s=>s.name===b.name)) fbDrawBoat(x, b, ox, oy, cell, 'ghost'); });
    sunk.forEach(b=>fbDrawBoat(x, b, ox, oy, cell, 'sunk'));
    for (const k in shots){
      const c=+k, [cx,cy]=fbCenter(ox, oy, cell, c);
      if (!shots[k].hit) fbDrawMiss(x, cx, cy, cell);
      else if (faded.has(c)) fbDrawFaded(x, cx, cy, cell);
      else fbDrawHit(x, cx, cy, cell);
    }
    if (FB.aim>=0){
      const squares = FB.aimMode==='bomb' ? fbBombCells(FB.aim, FB.bombVert) : (fbCanAim(FB.aim) ? [FB.aim] : []);
      x.strokeStyle='#ffb03b'; x.lineWidth=Math.max(2, cell*0.08);
      for (const c of squares){
        const px=ox+(c%FB_N)*cell, py=oy+fbRow(c)*cell;
        rr(x, px+2, py+2, cell-4, cell-4, cell*0.18); x.stroke();
        if (FB.aimMode==='bomb'){ x.fillStyle='rgba(255,176,59,.28)'; rr(x, px+2, py+2, cell-4, cell-4, cell*0.18); x.fill(); }
        else {
          x.beginPath(); x.moveTo(px+cell/2, py+cell*0.2); x.lineTo(px+cell/2, py+cell*0.8);
          x.moveTo(px+cell*0.2, py+cell/2); x.lineTo(px+cell*0.8, py+cell/2); x.stroke();
        }
      }
    }
    anim = fbPulse(x, ox, oy, cell, t) || anim;
    if (!FB.alive.has(t) && FB.phase==='battle'){
      x.fillStyle='rgba(10,11,18,.35)'; x.fillRect(ox, oy, cell*FB_N, cell*FB_N);
    }
  }
  const mv=$('#fbMine');
  if (mv && mv.width){
    const m=mv.getContext('2d'); m.setTransform(DPR,0,0,DPR,0,0); m.clearRect(0,0,mv.width,mv.height);
    anim = fbDrawMine(m, 0, 0, FBL.mini, false) || anim;
  }
  return anim;
}
function fbFrame(){
  // host: if a shot's answer hasn't arrived, ask again (answers are repeatable)
  const R=FB.ref;
  if (R && R.pending && !FB.solo && R.pending.target!==S.myId && R.pending.at && performance.now()-R.pending.at>4000){
    R.pending.at=performance.now();
    sendTo(R.pending.target, {t:'fb-incoming', g:FB.g, shooter:R.pending.shooter, cell:R.pending.cell});
  }
  if (FB.dirty || FB.animating){ FB.dirty=false; FB.animating=fbRender(); }
}

/* ---------------- overlay, toast, input ---------------- */
function fbOverlay(html){ const o=$('#fbOverlay'); o.innerHTML=html; o.classList.add('show'); }
function fbOvHide(){ const o=$('#fbOverlay'); if (o) o.classList.remove('show'); }
let fbToastT=null;
function fbToast(html, info){
  const p=$('#fbToastPill'); if (!p) return;
  p.innerHTML=html; p.classList.toggle('info', !!info);
  p.classList.add('show'); clearTimeout(fbToastT); fbToastT=setTimeout(()=>p.classList.remove('show'), 1700);
}
$('#fbOverlay').addEventListener('click', e=>{
  const b=e.target.closest('[data-fbov]'); if (!b) return;
  const a=b.dataset.fbov;
  if (a==='menu') leave();
  else if (a==='view') fbOvHide();
  else if (a==='rematch') fbRematch(b);
});
$('#fbTabs').addEventListener('click', e=>{
  const b=e.target.closest('.fb-tab'); if (!b) return;
  FB.view=+b.dataset.id; FB.aim=-1; fbUpdate();
});
$('#fbBottom').addEventListener('click', e=>{
  const t=e.target.closest('button'); if (!t || t.disabled) return;
  if (t.id==='fbShuffle'){ FB.fleet=fbRandomFleet(); FB.sel=-1; fbUpdate(); }
  else if (t.id==='fbReadyBtn') fbReady();
  else if (t.classList.contains('fb-chip')){ FB.sel=+t.dataset.i; fbUpdate(); }
  else if (t.id==='fbPwMove'){ if (FB.moving) fbCancelMove(); else fbStartMove(); }
  else if (t.id==='fbPwBomb') fbToggleBomb();
  else if (t.id==='fbAct'){
    if (t.dataset.act==='fire') fbFire();
    else if (t.dataset.act==='move') fbCommitMove();
    else if (t.dataset.act==='rematch') fbRematch(t);
  }
});
$('#fbQuit').addEventListener('click', ()=>{
  if (!FB.solo && !S.lost && FB.phase!=='over' && !confirm('Leave the game?')) return;
  leave();
});
let fbDown=null;
$('#fbCv').addEventListener('pointerdown', e=>{ fbDown={x:e.clientX, y:e.clientY, id:e.pointerId}; });
$('#fbCv').addEventListener('pointerup', e=>{
  if (!fbDown || fbDown.id!==e.pointerId) return;
  const moved=Math.hypot(e.clientX-fbDown.x, e.clientY-fbDown.y); fbDown=null;
  if (moved>14) return;
  const r=$('#fbCv').getBoundingClientRect();
  const c=Math.floor((e.clientX-r.left-FBL.lab)/FBL.cell), rw=Math.floor((e.clientY-r.top-FBL.lab)/FBL.cell);
  if (c<0 || c>=FB_N || rw<0 || rw>=FB_N) return;
  fbTap(rw*FB_N+c);
});
$('#fbCv').addEventListener('pointercancel', ()=>{ fbDown=null; });

// test hook (harmless in normal play)
window.__fb = {FB, FBL, CPU, fbTap, fbFire, fbReady, fbAiPick, fbAiBombPick, fbRandomFleet, fbCellName, fbStartSolo,
               fbBombCells, fbStartMove, fbCommitMove, fbToggleBomb, fbMoveBoat, fbCpuMaybeMove};
