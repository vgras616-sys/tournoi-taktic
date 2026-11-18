/* Tac Tik — interface, salon, parties contre l'IA et entre amis */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const COLORS = ['#e5484d', '#3e63dd', '#f5a524', '#12a594'];
  const LEVELS = ['facile', 'moyen', 'difficile'];
  const AI_NAMES = ['', 'Mia', 'Noé', 'Zoé'];
  const SVGNS = 'http://www.w3.org/2000/svg';

  const G = {
    role: null,            // 'host' | 'client'
    S: null,               // état complet (hôte uniquement)
    view: null,            // vue du joueur local
    mySeat: 0,
    acts: [],              // coups légaux du joueur local
    mode: 'teams', swap: true,
    seats: [],             // configuration des sièges (hôte)
    host: null, conn: null, code: null,
    timer: null, waiting: false, boardKey: null,
    lobby: null            // dernier état de salon reçu (client)
  };
  const ui = { card: null, cardIdx: null, act: null, clicked: null, selPawn: null, P: null, seq: [], tgt: null };

  /* ================= utilitaires ================= */
  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), ms || 2200);
  }
  function show(id) {
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  }
  function modal(id, on) { $(id).classList.toggle('hidden', !on); }
  function myName() { return ($('#name').value || '').trim().slice(0, 14) || 'Joueur'; }
  function token() {
    let t = sessionStorage.getItem('tt-token');
    if (!t) { t = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('tt-token', t); }
    return t;
  }
  const modeOpts = m => (m === 'duel' ? { n: 2, teams: false } : m === 'teams' ? { n: 4, teams: true } : { n: 4, teams: false });
  const levelLabel = l => LEVELS[l];
  const KLABEL = { '1': '1', '2': '2', '3': '3', '5': '5', '6': '6', '8': '8', '9': '9', '10': '10', '12': '12', '-4': '−4', 'P': '⇄', '7': '7×1' };
  const KSUB = { '1': 'Démarrer<br>ou +1', '10': 'Démarrer<br>ou +10', '-4': 'Reculer', 'P': 'Permuter', '7': '7 pas<br>à répartir' };
  const KORDER = ['1', '2', '3', '-4', '5', '6', '7', '8', '9', '10', '12', 'P'];

  /* ================= MENU ================= */
  $('#name').value = localStorage.getItem('tt-name') || '';
  $('#name').addEventListener('input', () => localStorage.setItem('tt-name', $('#name').value));
  $('#btn-new').onclick = () => { openLobby(); };
  $('#btn-rules').onclick = () => modal('#rules', true);
  $('#rules-close').onclick = () => modal('#rules', false);
  $('#gm-rules').onclick = () => { modal('#gmenu', false); modal('#rules', true); };
  $('#btn-join').onclick = () => joinRoom($('#join-code').value.trim().toUpperCase());
  $('#join-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btn-join').click(); });

  /* ================= SALON (hôte) ================= */
  function defaultSeats(n) {
    const s = [{ type: 'me' }];
    for (let i = 1; i < n; i++) s.push({ type: 'ai', level: 1 });
    return s;
  }
  function openLobby() {
    G.role = 'host';
    G.mode = G.mode || 'teams';
    applyMode(G.mode, true);
    $('#lobby-title').textContent = 'Nouvelle partie';
    $('#lobby-host').classList.remove('hidden');
    $('#lobby-client').classList.add('hidden');
    show('lobby');
  }
  function applyMode(mode, fresh) {
    G.mode = mode;
    const { n } = modeOpts(mode);
    const old = G.seats;
    G.seats = defaultSeats(n);
    if (!fresh) for (let i = 1; i < n && i < old.length; i++) G.seats[i] = old[i];
    $$('#mode-seg button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
    $('#swap-row').classList.toggle('hidden', mode !== 'teams');
    // un ami retiré par le changement de mode est prévenu
    if (old.length > n) for (let i = n; i < old.length; i++) kick(old[i]);
    renderSeats();
  }
  $$('#mode-seg button').forEach(b => b.onclick = () => applyMode(b.dataset.mode, false));
  $('#opt-swap').onchange = e => { G.swap = e.target.checked; };
  $('#lobby-back').onclick = () => { leaveAll(); show('menu'); };

  function seatTitle(i) {
    const m = G.mode;
    if (m === 'teams') return (i % 2 === 0 ? 'Équipe A' : 'Équipe B') + (i === 2 ? ' · ton partenaire' : '');
    if (m === 'duel') return i === 0 ? 'Joueur 1' : 'Joueur 2';
    return 'Joueur ' + (i + 1);
  }
  function seatDisplayName(i) {
    const s = G.seats[i];
    if (s.type === 'me') return myName();
    if (s.type === 'ai') return AI_NAMES[i] + ' (IA)';
    return s.name || 'Ami ' + i;
  }
  function renderSeats() {
    const box = $('#seats'); box.innerHTML = '';
    G.seats.forEach((s, i) => {
      const row = document.createElement('div'); row.className = 'seat';
      const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = COLORS[i];
      const who = document.createElement('div'); who.className = 'who';
      who.textContent = s.type === 'me' ? myName() + ' (toi)' : seatDisplayName(i);
      const sm = document.createElement('small'); sm.textContent = seatTitle(i); who.appendChild(sm);
      row.append(dot, who);
      if (s.type === 'me') {
        const b = document.createElement('span'); b.className = 'badge ok'; b.textContent = 'hôte'; row.appendChild(b);
      } else {
        const sel = document.createElement('select');
        [['ai0', 'IA facile'], ['ai1', 'IA moyen'], ['ai2', 'IA difficile'], ['friend', 'Ami en ligne']].forEach(([v, l]) => {
          const o = document.createElement('option'); o.value = v; o.textContent = l; sel.appendChild(o);
        });
        sel.value = s.type === 'friend' ? 'friend' : 'ai' + s.level;
        sel.onchange = () => setSeatType(i, sel.value);
        row.appendChild(sel);
        if (s.type === 'friend') {
          const b = document.createElement('span');
          b.className = 'badge' + (s.connId ? ' ok' : ''); b.textContent = s.connId ? 'connecté' : 'en attente…';
          row.appendChild(b);
        }
      }
      box.appendChild(row);
    });
    const anyFriend = G.seats.some(s => s.type === 'friend');
    $('#room-box').classList.toggle('hidden', !anyFriend);
    if (anyFriend) $('#room-code').textContent = G.code || '…';
    const waiting = G.seats.filter(s => s.type === 'friend' && !s.connId).length;
    $('#btn-start').disabled = waiting > 0 || !!G.err;
    $('#room-status').textContent = G.err ? G.err : (waiting ? waiting + ' ami(s) attendu(s)' : 'Tout le monde est là');
    broadcastLobby();
  }
  function setSeatType(i, v) {
    const s = G.seats[i];
    kick(s);
    if (v === 'friend') {
      if (typeof Peer === 'undefined') { toast('Mode ami indisponible : connexion requise'); renderSeats(); return; }
      G.seats[i] = { type: 'friend' };
      ensureHost();
    } else {
      G.seats[i] = { type: 'ai', level: +v.slice(2) };
    }
    renderSeats();
  }
  function kick(s) {
    if (s && s.connId && G.host) { G.host.send(s.connId, { t: 'bye' }); }
  }
  function ensureHost() {
    if (G.host) return;
    G.err = null;
    G.host = TTNet.createHost({
      onReady(code) { G.code = code; renderSeats(); },
      onConn() {},
      onMsg: hostMsg,
      onClose: hostClosed,
      onError(err) { G.err = 'Réseau : ' + (err.type || err); renderSeats(); }
    });
  }
  $('#copy-link').onclick = () => {
    const url = location.origin + location.pathname + '?room=' + G.code;
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(
      () => toast('Lien copié !'), () => prompt('Copie ce lien :', url));
  };

  function broadcastLobby() {
    if (!G.host || G.role !== 'host' || G.S) return;
    G.seats.forEach((s, i) => {
      if (s.type === 'friend' && s.connId) G.host.send(s.connId, lobbyMsg(i));
    });
  }
  function lobbyMsg(youSeat) {
    return {
      t: 'lobby', code: G.code, mode: G.mode, youSeat,
      seats: G.seats.map((s, i) => ({ name: seatDisplayName(i), title: seatTitle(i), kind: s.type, ready: s.type !== 'friend' || !!s.connId }))
    };
  }

  /* ----- messages reçus par l'hôte ----- */
  function hostMsg(connId, msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'hello') {
      let idx = G.seats.findIndex(s => s.type === 'friend' && s.token && s.token === msg.token);
      if (idx < 0) idx = G.seats.findIndex(s => s.type === 'friend' && !s.connId);
      if (idx < 0) { G.host.send(connId, { t: 'full' }); return; }
      const s = G.seats[idx];
      s.connId = connId; s.token = msg.token; s.connected = true;
      s.name = String(msg.name || 'Ami').slice(0, 14);
      if (G.S) { G.S.names[idx] = s.name; G.S.conn[idx] = true; pushViews(); tick(); }
      else renderSeats();
      return;
    }
    const idx = G.seats.findIndex(s => s.connId === connId);
    if (idx < 0 || !G.S) return;
    if (msg.t === 'act') hostAct(idx, msg.d);
    else if (msg.t === 'swap') hostSwap(idx, msg.k);
  }
  function hostClosed(connId) {
    const idx = G.seats.findIndex(s => s.connId === connId);
    if (idx < 0) return;
    const s = G.seats[idx];
    s.connected = false;
    if (!G.S) { s.connId = null; s.token = null; renderSeats(); return; }
    G.S.conn[idx] = false; pushViews();
    toast(seatDisplayName(idx) + ' s’est déconnecté');
  }

  /* ================= PARTIE (hôte) ================= */
  $('#btn-start').onclick = () => startGame();
  function startGame() {
    const o = modeOpts(G.mode);
    const S = TT.newGame({ n: o.n, teams: o.teams, swap: G.mode === 'teams' && G.swap });
    S.turn = Math.floor(Math.random() * S.n);
    S.names = G.seats.map((s, i) => seatDisplayName(i));
    S.conn = G.seats.map(s => s.type !== 'friend' || !!s.connected);
    S.log = [];
    G.S = S; G.role = 'host'; G.mySeat = 0; G.waiting = false;
    S.log.push({ n: '', t: 'Nouvelle partie — ' + S.names[S.turn] + ' commence.' });
    resetUI(); G.boardKey = null;
    show('game'); modal('#over', false);
    pushViews(); tick();
  }
  function makeView(S, seat) {
    return {
      n: S.n, teams: S.teams, swap: S.swap, slots: S.slots, pawns: S.pawns,
      hands: S.hands.map((h, s) => (s === seat ? h : h.map(() => null))),
      deckN: S.deck.length, discardTop: S.discard.length ? S.discard[S.discard.length - 1] : null,
      turn: S.turn, phase: S.phase, swapChoice: (S.swapChoice || []).map(v => v != null),
      winner: S.winner, last: S.last, names: S.names, conn: S.conn, log: S.log.slice(-6),
      turns: S.turns, deals: S.deals
    };
  }
  function pushViews() {
    const S = G.S;
    S.log = S.log.slice(-30);
    S.conn.forEach((c, i) => { if (G.seats[i].type === 'friend' && G.seats[i].connId && G.host) G.host.send(G.seats[i].connId, { t: 'view', seat: i, view: makeView(S, i) }); });
    onView(makeView(S, 0), 0);
  }
  function describe(d, cap) {
    let t;
    switch (d.kind) {
      case 'start': t = 'sort un pion'; break;
      case 'fwd': t = 'avance de ' + d.k; break;
      case 'back': t = 'recule de 4'; break;
      case 'swap': t = 'permute deux pions'; break;
      case 'seven': t = 'joue un 7×1'; break;
      default: t = 'défausse un ' + (KLABEL[d.k] || d.k) + ' (aucun coup)';
    }
    if (cap) t += ' et mange ' + cap + ' pion' + (cap > 1 ? 's' : '');
    return t + '.';
  }
  function hostAct(seat, d) {
    const S = G.S;
    if (!S || S.phase !== 'play' || S.turn !== seat) return;
    const before = S.pawns;
    const r = TT.play(S, seat, d);
    if (!r.ok) { if (seat === 0) { toast('Coup refusé'); G.waiting = false; refresh(); } return; }
    let cap = 0;
    before.forEach((a, s) => a.forEach((x, i) => { if (x.p >= 0 && S.pawns[s][i].p === -1) cap++; }));
    S.log.push({ n: S.names[seat], t: describe(S.last.d, cap) });
    pushViews(); tick();
  }
  function hostSwap(seat, k) {
    const S = G.S;
    if (!S || S.phase !== 'swap') return;
    if (!TT.setSwap(S, seat, k)) return;
    if (S.phase === 'play') S.log.push({ n: '', t: 'Cartes échangées entre partenaires.' });
    pushViews(); tick();
  }
  const isAI = seat => G.seats[seat].type === 'ai';
  function tick() {
    const S = G.S;
    clearTimeout(G.timer);
    if (!S || S.phase === 'over') return;
    if (S.phase === 'swap') {
      let changed = false;
      for (let s = 0; s < S.n; s++) {
        if (isAI(s) && S.swapChoice[s] == null) { G.timer = setTimeout(() => aiSwap(), 450); return; }
      }
      return;
    }
    const seat = S.turn;
    if (isAI(seat)) G.timer = setTimeout(() => {
      if (!G.S || G.S.phase !== 'play' || G.S.turn !== seat) return;
      hostAct(seat, TTAI.chooseAction(G.S, seat, G.seats[seat].level));
    }, 750 + Math.random() * 450);
  }
  function aiSwap() {
    const S = G.S;
    if (!S || S.phase !== 'swap') return;
    for (let s = 0; s < S.n; s++) {
      if (isAI(s) && S.swapChoice[s] == null) TT.setSwap(S, s, TTAI.chooseSwap(S, s, G.seats[s].level));
    }
    if (S.phase === 'play') S.log.push({ n: '', t: 'Cartes échangées entre partenaires.' });
    pushViews(); tick();
  }

  /* ================= CLIENT ================= */
  function joinRoom(code) {
    if (!/^[A-Z2-9]{5}$/.test(code)) { $('#menu-msg').textContent = 'Le code a 5 caractères.'; return; }
    if (typeof Peer === 'undefined') { $('#menu-msg').textContent = 'Connexion requise pour jouer entre amis.'; return; }
    $('#menu-msg').textContent = 'Connexion à la salle ' + code + '…';
    leaveAll();
    G.role = 'client'; G.code = code;
    G.conn = TTNet.joinRoom(code, {
      onOpen() { G.conn.send({ t: 'hello', name: myName(), token: token() }); },
      onMsg: clientMsg,
      onClose() { if (G.role === 'client') { toast('Connexion perdue avec l’hôte'); leaveAll(); show('menu'); $('#menu-msg').textContent = 'Déconnecté de la salle.'; } },
      onError(err) { $('#menu-msg').textContent = err.type === 'peer-unavailable' || err.type === 'timeout' ? 'Salle introuvable (code erroné ou hôte parti).' : 'Erreur réseau : ' + (err.type || err); G.role = null; show('menu'); }
    });
  }
  function clientMsg(msg) {
    if (!msg) return;
    if (msg.t === 'lobby') {
      G.mySeat = msg.youSeat; G.lobby = msg;
      $('#lobby-title').textContent = 'Salle ' + msg.code;
      $('#lobby-host').classList.add('hidden'); $('#lobby-client').classList.remove('hidden');
      $('#client-code').textContent = msg.code;
      const box = $('#client-seats'); box.innerHTML = '';
      msg.seats.forEach((s, i) => {
        const row = document.createElement('div'); row.className = 'seat';
        const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = COLORS[i];
        const who = document.createElement('div'); who.className = 'who'; who.textContent = s.name + (i === msg.youSeat ? ' (toi)' : '');
        const sm = document.createElement('small'); sm.textContent = s.title; who.appendChild(sm);
        const b = document.createElement('span'); b.className = 'badge' + (s.ready ? ' ok' : ''); b.textContent = s.ready ? 'prêt' : 'en attente…';
        row.append(dot, who, b); box.appendChild(row);
      });
      if (!$('#game').classList.contains('active')) show('lobby');
    } else if (msg.t === 'view') {
      G.mySeat = msg.seat;
      if (!$('#game').classList.contains('active')) { G.boardKey = null; show('game'); }
      onView(msg.view, msg.seat);
    } else if (msg.t === 'full') {
      toast('Salle complète ou partie déjà lancée'); leaveAll(); show('menu');
    } else if (msg.t === 'bye') {
      toast('L’hôte vous a retiré de la salle'); leaveAll(); show('menu');
    }
  }
  function leaveAll() {
    clearTimeout(G.timer);
    if (G.host) { G.host.broadcast({ t: 'bye' }); setTimeout(((h) => () => h.close())(G.host), 200); }
    if (G.conn) { const c = G.conn; G.conn = null; G.role = null; c.close(); }
    G.host = null; G.S = null; G.view = null; G.code = null; G.err = null; G.role = null;
    G.seats = []; G.boardKey = null;
    resetUI(); modal('#over', false); modal('#gmenu', false);
  }

  /* ================= INTERFACE DE JEU ================= */
  function resetUI() { ui.card = null; ui.cardIdx = null; ui.act = null; ui.clicked = null; ui.selPawn = null; ui.P = null; ui.seq = []; ui.tgt = null; }
  const myTurn = () => G.view && G.view.phase === 'play' && G.view.turn === G.mySeat;

  function onView(v, seat) {
    G.view = v; G.mySeat = seat; G.waiting = false;
    resetUI();
    G.acts = myTurn() ? TT.legalActions(v, seat) : [];
    refresh(true);
  }

  /* ----- géométrie ----- */
  const CX = 410, CY = 410, R = 275;
  let rotSlot = 0;
  const ang = ring => (90 + (ring - rotSlot * TT.SEG) * 360 / TT.RING) * Math.PI / 180;
  const ringXY = (ring, r) => { const a = ang(ring); return [CX + (r || R) * Math.cos(a), CY + (r || R) * Math.sin(a)]; };
  function homeXY(v, s, h) { return ringXY(TT.ringOf(v.slots[s], 0), R - 34 * (h + 1)); }
  function reserveXY(v, s, i) {
    const a = ang(TT.ringOf(v.slots[s], 0));
    const rx = Math.cos(a), ry = Math.sin(a), tx = -ry, ty = rx;
    const base = R + 66, du = ((i % 2) - 0.5) * 30, dv = ((i >> 1) - 0.5) * 30;
    return [CX + base * rx + du * tx + dv * rx, CY + base * ry + du * ty + dv * ry];
  }
  function pawnXY(v, s, x, i) {
    if (x.p < 0) return reserveXY(v, s, i);
    if (x.p < TT.RING) return ringXY(TT.ringOf(v.slots[s], x.p));
    return homeXY(v, s, x.p - TT.RING);
  }
  function el(tag, attrs, parent) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  let pawnEls = [], labelEls = [], startRings = [], ghostEl = null;

  function buildBoard(v) {
    const svg = $('#board'); svg.innerHTML = '';
    rotSlot = v.slots[G.mySeat];
    el('circle', { class: 'disc', cx: CX, cy: CY, r: 312 }, svg);
    el('circle', { class: 'track', cx: CX, cy: CY, r: R }, svg);
    const startOf = {};
    v.slots.forEach((sl, s) => { startOf[TT.ringOf(sl, 0)] = s; });
    for (let r = 0; r < TT.RING; r++) {
      const [x, y] = ringXY(r);
      const s = startOf[r];
      const c = el('circle', { class: 'cell' + (s != null ? ' start' : ''), cx: x, cy: y, r: s != null ? 16 : 11.5 }, svg);
      if (s != null) c.style.stroke = COLORS[s];
    }
    startRings = [];
    v.slots.forEach((sl, s) => {
      for (let h = 0; h < 4; h++) {
        const [x, y] = homeXY(v, s, h);
        const c = el('circle', { class: 'hcell', cx: x, cy: y, r: 12 }, svg);
        c.style.stroke = COLORS[s]; c.style.fill = COLORS[s] + '33';
      }
      const [rx, ry] = ringXY(TT.ringOf(sl, 0));
      const sr = el('circle', { class: 'startring', cx: rx, cy: ry, r: 22 }, svg);
      sr.style.stroke = COLORS[s]; sr.style.opacity = 0;
      startRings[s] = sr;
      // plaque de réserve
      const [px, py] = reserveXY(v, s, 0), [qx, qy] = reserveXY(v, s, 3);
      const pl = el('circle', { cx: (px + qx) / 2, cy: (py + qy) / 2, r: 38 }, svg);
      pl.style.fill = COLORS[s] + '22'; pl.style.stroke = COLORS[s]; pl.style.strokeWidth = 2;
    });
    // noms
    labelEls = [];
    v.slots.forEach((sl, s) => {
      const a = ang(TT.ringOf(sl, 0));
      const x = CX + 392 * Math.cos(a), y = CY + 392 * Math.sin(a);
      const t = el('text', { class: 'lbl', x: 0, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, svg);
      const deg = (((Math.round(a * 180 / Math.PI)) % 360) + 360) % 360;
      let rot = 0;
      if (deg === 180) rot = 90; else if (deg === 0) rot = -90;
      t.setAttribute('transform', `translate(${x},${y}) rotate(${rot})`);
      labelEls[s] = t;
    });
    ghostEl = el('circle', { class: 'ghost', r: 14, cx: 0, cy: 0 }, svg);
    ghostEl.style.display = 'none';
    pawnEls = [];
    v.slots.forEach((sl, s) => {
      pawnEls[s] = [];
      for (let i = 0; i < 4; i++) {
        const g = el('g', { class: 'pawn' }, svg);
        g.dataset.s = s; g.dataset.i = i;
        g.style.transition = 'none';
        el('circle', { class: 'halo', r: 19 }, g);
        const b = el('circle', { class: 'body', r: 12.5 }, g); b.style.fill = COLORS[s];
        el('circle', { class: 'shade', r: 5, cx: -3, cy: -3 }, g).style.fill = 'rgba(255,255,255,.35)';
        el('circle', { class: 'pieu', r: 17 }, g);
        pawnEls[s][i] = g;
      }
    });
    G.boardKey = v.n + ':' + v.teams + ':' + G.mySeat;
    requestAnimationFrame(() => requestAnimationFrame(() => pawnEls.forEach(a => a.forEach(g => { g.style.transition = ''; }))));
  }
  $('#board').addEventListener('click', e => {
    const g = e.target.closest('.pawn');
    if (g) onPawnClick(+g.dataset.s, +g.dataset.i);
  });

  /* ----- calcul des surbrillances ----- */
  function computeHL() {
    const v = G.view, r = { hl: new Set(), tgt: new Set(), sel: new Set(), ghost: null, ok: false };
    if (!myTurn() || !ui.card) return r;
    const cs = TT.ctrlSeat(v, G.mySeat);
    const acts = G.acts.filter(a => a.d.k === ui.card);
    const k = ui.card;
    if (k === '7') {
      const P0 = ui.P || v.pawns, left = 7 - ui.seq.length;
      if (left > 0) for (let i = 0; i < 4; i++) {
        const Q = TT.step7(P0, v.slots, cs, i);
        if (Q && TT.feasible7(Q, v.slots, cs, left - 1)) r.hl.add(cs + ':' + i);
      }
      r.ok = ui.seq.length === 7;
    } else if (k === 'P') {
      const mine = new Set(acts.map(a => a.d.pawn));
      mine.forEach(i => r.hl.add(cs + ':' + i));
      if (ui.selPawn != null) {
        r.sel.add(cs + ':' + ui.selPawn);
        acts.filter(a => a.d.pawn === ui.selPawn).forEach(a => r.tgt.add(a.d.tseat + ':' + a.d.tpawn));
        if (ui.tgt) r.sel.add(ui.tgt);
      }
      r.ok = !!ui.act;
    } else {
      let hasStart = false;
      acts.forEach(a => {
        if (a.d.kind === 'start') hasStart = true; else r.hl.add(cs + ':' + a.d.pawn);
      });
      if (hasStart) v.pawns[cs].forEach((x, i) => { if (x.p === -1) r.hl.add(cs + ':' + i); });
      if (ui.act) {
        const a = ui.act;
        r.sel.add(ui.clicked);
        r.ghost = pawnXY(v, cs, a.Q[cs][a.d.pawn], a.d.pawn);
        r.ok = true;
      }
    }
    return r;
  }

  function onPawnClick(s, i) {
    const v = G.view;
    if (!myTurn() || !ui.card || G.waiting) return;
    const cs = TT.ctrlSeat(v, G.mySeat), k = ui.card;
    const acts = G.acts.filter(a => a.d.k === k), key = s + ':' + i;
    const hl = computeHL();
    if (k === '7') {
      if (s !== cs || !hl.hl.has(key)) return;
      const P0 = ui.P || v.pawns;
      ui.P = TT.step7(P0, v.slots, cs, i); ui.seq.push(i);
      ui.act = ui.seq.length === 7 ? { d: { k: '7', kind: 'seven', seq: ui.seq.slice() } } : null;
    } else if (k === 'P') {
      if (ui.selPawn != null && hl.tgt.has(key)) {
        if (ui.tgt === key && ui.act) { confirm(); return; }
        ui.tgt = key;
        ui.act = acts.find(a => a.d.pawn === ui.selPawn && a.d.tseat === s && a.d.tpawn === i) || null;
      } else if (s === cs && hl.hl.has(key)) {
        ui.selPawn = i; ui.tgt = null; ui.act = null;
      } else return;
    } else {
      if (s !== cs || !hl.hl.has(key)) return;
      if (ui.clicked === key && ui.act) { confirm(); return; }
      const isReserve = v.pawns[cs][i].p === -1;
      const a = isReserve ? acts.find(x => x.d.kind === 'start') : acts.find(x => x.d.pawn === i && x.d.kind !== 'start');
      if (!a) return;
      ui.act = a; ui.clicked = key;
    }
    refresh();
  }
  function confirm() {
    if (!ui.act || G.waiting) return;
    sendAction(ui.act.d);
  }
  function sendAction(d) {
    G.waiting = true;
    const dd = d;
    resetUI();
    if (G.role === 'host') hostAct(G.mySeat, dd);
    else if (G.conn) G.conn.send({ t: 'act', d: dd });
    refresh();
  }
  $('#btn-ok').onclick = confirm;
  $('#btn-cancel').onclick = () => { const c = ui.card, ci = ui.cardIdx; resetUI(); ui.card = c; ui.cardIdx = ci; refresh(); };

  function onCard(k, idx) {
    const v = G.view;
    if (!v || G.waiting) return;
    if (v.phase === 'swap') {
      if (v.swapChoice[G.mySeat]) return;
      G.waiting = true;
      if (G.role === 'host') hostSwap(G.mySeat, k); else G.conn.send({ t: 'swap', k });
      refresh(); return;
    }
    if (!myTurn()) return;
    if (!G.acts.length) { sendAction({ k, kind: 'discard' }); return; }
    if (!G.acts.some(a => a.d.k === k)) { toast('Cette carte n’est pas jouable maintenant'); return; }
    resetUI(); ui.card = k; ui.cardIdx = idx;
    const as = G.acts.filter(a => a.d.k === k);
    if (k !== 'P' && k !== '7' && as.length === 1) {
      const cs = TT.ctrlSeat(v, G.mySeat);
      ui.act = as[0]; ui.clicked = cs + ':' + as[0].d.pawn;
    }
    refresh();
  }

  /* ----- rendu ----- */
  function refresh(full) {
    const v = G.view;
    if (!v) return;
    const key = v.n + ':' + v.teams + ':' + G.mySeat;
    if (G.boardKey !== key) buildBoard(v);
    const P = ui.P || v.pawns;
    const hl = computeHL();
    // pions
    v.slots.forEach((sl, s) => {
      for (let i = 0; i < 4; i++) {
        const x = P[s][i], g = pawnEls[s][i];
        const [px, py] = pawnXY(v, s, x, i);
        g.style.transform = `translate(${px}px,${py}px)`;
        g.querySelector('.pieu').style.display = x.u ? 'block' : 'none';
        const k = s + ':' + i;
        g.classList.toggle('hl', hl.hl.has(k) || hl.tgt.has(k));
        g.classList.toggle('sel', hl.sel.has(k));
        g.classList.toggle('tgt', hl.tgt.has(k));
      }
    });
    if (hl.ghost) {
      ghostEl.style.display = ''; ghostEl.setAttribute('cx', hl.ghost[0]); ghostEl.setAttribute('cy', hl.ghost[1]);
      ghostEl.style.stroke = COLORS[TT.ctrlSeat(v, G.mySeat)];
    } else ghostEl.style.display = 'none';
    // noms + tour en cours
    labelEls.forEach((t, s) => {
      const n = (v.names[s] || '') + (s === G.mySeat ? ' (toi)' : '') + (v.conn && v.conn[s] === false ? ' ⚠' : '');
      t.textContent = n;
      t.classList.toggle('turn', v.phase === 'play' && v.turn === s);
    });
    startRings.forEach((r, s) => { r.style.opacity = v.phase === 'play' && v.turn === s ? 1 : 0; });
    // statut
    const st = $('#status');
    st.classList.toggle('me', false);
    if (v.phase === 'over') st.textContent = 'Partie terminée';
    else if (v.phase === 'swap') {
      st.textContent = v.swapChoice[G.mySeat] ? 'En attente des autres joueurs…' : 'Choisis une carte à passer à ton partenaire';
      st.classList.toggle('me', !v.swapChoice[G.mySeat]);
    } else if (myTurn()) {
      st.classList.add('me');
      if (!G.acts.length) st.textContent = 'Aucun coup possible : défausse une carte';
      else if (!ui.card) st.textContent = 'À toi ! Choisis une carte';
      else if (ui.card === '7') st.textContent = ui.seq.length >= 7 ? '7×1 : valide !' : `7×1 : clique un pion (${ui.seq.length}/7)`;
      else if (ui.card === 'P') st.textContent = ui.selPawn == null ? 'Permuter : choisis ton pion' : 'Permuter : choisis le pion cible';
      else st.textContent = ui.act ? 'Valide ou reclique sur le pion' : 'Choisis le pion à jouer';
      const cs = TT.ctrlSeat(v, G.mySeat);
      if (cs !== G.mySeat) st.textContent += ' (pions de ton partenaire)';
    } else {
      st.textContent = 'Tour de ' + v.names[v.turn] + (v.conn && v.conn[v.turn] === false ? ' (déconnecté)' : '');
    }
    $('#deck-n').textContent = v.deckN;
    // centre
    const ci = $('#center-info'); ci.innerHTML = '';
    const mini = document.createElement('div'); mini.className = 'mini';
    mini.textContent = v.discardTop ? (KLABEL[v.discardTop] || v.discardTop) : '·';
    const cap = document.createElement('div'); cap.textContent = 'Donne n° ' + v.deals;
    ci.append(mini, cap);
    // journal
    const lg = $('#log'); lg.innerHTML = '';
    (v.log || []).slice(-2).forEach(l => {
      const d = document.createElement('div');
      if (l.n) { const b = document.createElement('b'); b.textContent = l.n + ' '; d.appendChild(b); }
      d.appendChild(document.createTextNode(l.t)); lg.appendChild(d);
    });
    // main
    renderHand(v);
    // boutons
    $('#btn-ok').disabled = !hl.ok || G.waiting;
    $('#btn-cancel').style.visibility = ui.card && (ui.act || ui.selPawn != null || ui.seq.length) ? 'visible' : 'hidden';
    $('#btn-ok').style.visibility = myTurn() && G.acts.length ? 'visible' : 'hidden';
    // fin
    if (v.phase === 'over') showOver(v); else modal('#over', false);
    // menu
    $('#gm-ai').classList.toggle('hidden', !(G.role === 'host' && v.conn && v.conn.some(c => c === false)));
  }
  function renderHand(v) {
    const h = $('#hand'); h.innerHTML = '';
    const mine = v.hands[G.mySeat] || [];
    const idxs = mine.map((k, i) => i).sort((a, b) => KORDER.indexOf(mine[a]) - KORDER.indexOf(mine[b]));
    idxs.forEach(idx => {
      const k = mine[idx];
      const b = document.createElement('button'); b.className = 'card';
      if (k === '1' || k === '10') b.classList.add('t-start');
      if (k === '-4') b.classList.add('t-back');
      if (k === 'P') b.classList.add('t-swap');
      if (k === '7') b.classList.add('t-seven');
      const big = document.createElement('div'); big.className = 'big'; big.textContent = KLABEL[k];
      const sub = document.createElement('div'); sub.className = 'sub'; sub.innerHTML = KSUB[k] || 'Avancer<br>de ' + k;
      b.append(big, sub);
      const playable = G.acts.some(a => a.d.k === k);
      if (myTurn() && G.acts.length && !playable) b.classList.add('off');
      if (myTurn() && !G.acts.length) b.classList.add('pass');
      if (ui.card && ui.cardIdx === idx) b.classList.add('sel');
      if (v.phase === 'swap' && v.swapChoice[G.mySeat]) b.classList.add('off');
      b.onclick = () => onCard(k, idx);
      h.appendChild(b);
    });
  }
  function showOver(v) {
    const mine = v.teams ? (v.winner === G.mySeat % 2) : (v.winner === G.mySeat);
    const names = v.teams ? [v.names[v.winner], v.names[v.winner + 2]].join(' & ') : v.names[v.winner];
    $('#over-title').textContent = mine ? '🎉 Victoire !' : 'Défaite';
    $('#over-text').textContent = (v.teams ? 'L’équipe ' : '') + names + (v.teams ? ' l’emporte.' : ' l’emporte.');
    $('#over-again').classList.toggle('hidden', G.role !== 'host');
    modal('#over', true);
  }
  $('#over-again').onclick = () => startGame();
  $('#over-quit').onclick = () => { leaveAll(); show('menu'); };

  /* ----- menu en jeu ----- */
  $('#g-menu').onclick = () => modal('#gmenu', true);
  $('#gm-close').onclick = () => modal('#gmenu', false);
  $('#gm-quit').onclick = () => { if (confirmQuit()) { leaveAll(); show('menu'); } };
  const confirmQuit = () => window.confirm('Quitter la partie ?');
  $('#gm-ai').onclick = () => {
    G.seats.forEach((s, i) => {
      if (s.type === 'friend' && !s.connected) { G.seats[i] = { type: 'ai', level: 1 }; G.S.names[i] = seatDisplayName(i); G.S.conn[i] = true; }
    });
    modal('#gmenu', false); pushViews(); tick();
  };

  /* ================= démarrage ================= */
  const q = new URLSearchParams(location.search).get('room');
  if (q) {
    $('#join-code').value = q.toUpperCase();
    joinRoom(q.toUpperCase());
  }
  window.__tt = { G, ui, startGame, applyMode };
})();
