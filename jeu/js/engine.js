/* Tac Tik — moteur de règles (pur, sans DOM). Utilisable dans le navigateur (window.TT) et dans Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TT = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RING = 64;        // cases du circuit
  const SEG = 16;         // cases par secteur (une case de départ par secteur)
  const HOME_END = 67;    // progression 64..67 = les 4 cases de la maison
  const KINDS = ['1', '2', '3', '5', '6', '8', '9', '10', '12', '-4', 'P', '7'];
  const NUM = { '1': 1, '2': 2, '3': 3, '5': 5, '6': 6, '8': 8, '9': 9, '10': 10, '12': 12 };

  let rng = Math.random;
  function setRng(f) { rng = f; }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function makeDeck() {
    const d = [];
    KINDS.forEach(k => { for (let i = 0; i < 4; i++) d.push(k); });
    return d; // 48 cartes
  }

  /* ---------- géométrie ---------- */
  const ringOf = (slot, p) => (slot * SEG + p) % RING;
  const progOf = (slot, ring) => (((ring - slot * SEG) % RING) + RING) % RING;

  function clonePawns(P) { return P.map(a => a.map(x => ({ p: x.p, u: x.u }))); }
  function key(P) { return P.map(a => a.map(x => x.p + (x.u ? 'u' : '')).join(',')).join('|'); }
  function buildOcc(P, slots) {
    const o = new Array(RING).fill(null);
    P.forEach((a, s) => a.forEach((x, i) => {
      if (x.p >= 0 && x.p < RING) o[ringOf(slots[s], x.p)] = [s, i];
    }));
    return o;
  }
  const allHome = (P, s) => P[s].every(x => x.p >= RING);
  function homeFree(P, s, from, to) {
    for (let q = from; q <= to; q++) if (P[s].some(x => x.p === q)) return false;
    return true;
  }
  function kill(P, o) { if (o) { const y = P[o[0]][o[1]]; y.p = -1; y.u = false; } }

  /* ---------- équipes ---------- */
  const partnerOf = (S, s) => (S.teams ? (s + 2) % 4 : s);
  const teamOf = (S, s) => (S.teams ? s % 2 : s);
  function ctrlSeat(S, s) {
    if (S.teams && allHome(S.pawns, s)) return partnerOf(S, s);
    return s;
  }

  /* ---------- déplacements élémentaires ---------- */
  // avancer de n cases (sens horaire). Retourne null si illégal.
  function tryFwd(P, slots, occ, s, i, n) {
    const x = P[s][i], p = x.p;
    if (p < 0) return null;
    const q = p + n;
    if (q > HOME_END) return null;
    if (p >= RING) {
      if (!homeFree(P, s, p + 1, q)) return null;
      return { q, cap: null };
    }
    const last = Math.min(q, RING - 1);
    let cap = null;
    for (let k = p + 1; k <= last; k++) {
      const o = occ[ringOf(slots[s], k)];
      if (!o) continue;
      const y = P[o[0]][o[1]];
      if (y.u) return null;                 // un pieu ne se dépasse pas et ne se mange pas
      if (k === q) cap = o;                 // arrivée exacte sur un pion : on le mange
    }
    if (q >= RING) {
      const o = occ[ringOf(slots[s], 0)];   // on traverse sa propre case de départ
      if (o && P[o[0]][o[1]].u) return null;
      if (!homeFree(P, s, RING, q)) return null;
    }
    return { q, cap };
  }
  function tryStart(P, slots, occ, s, i) {
    if (P[s][i].p !== -1) return null;
    const o = occ[ringOf(slots[s], 0)];
    if (o && P[o[0]][o[1]].u) return null;  // son propre pieu bloque la sortie
    return { cap: o };
  }
  function tryBack(P, slots, occ, s, i) {
    const p = P[s][i].p;
    if (p < 0 || p >= RING) return null;
    let cap = null;
    for (let d = 1; d <= 4; d++) {
      const k = (p - d + RING) % RING;
      const o = occ[ringOf(slots[s], k)];
      if (!o) continue;
      if (P[o[0]][o[1]].u) return null;
      if (d === 4) cap = o;
    }
    return { q: (p - 4 + RING) % RING, cap };
  }
  function trySwap(P, s, i, t, j) {
    if (s === t && i === j) return false;
    const x = P[s][i], y = P[t][j];
    if (x.p < 0 || x.p >= RING || y.p < 0 || y.p >= RING) return false;
    if (y.u && t !== s) return false;
    return true;
  }
  // un pas de la carte 7x1 : mange tout sur son passage, pieux compris
  function step7(P, slots, s, i) {
    const x = P[s][i], p = x.p;
    if (p < 0) return null;
    const q = p + 1;
    if (q > HOME_END) return null;
    const occ = buildOcc(P, slots);
    let cap = null;
    if (p >= RING) {
      if (!homeFree(P, s, q, q)) return null;
    } else if (q < RING) {
      cap = occ[ringOf(slots[s], q)];
    } else { // q === 64 : traverse la case de départ
      cap = occ[ringOf(slots[s], 0)];
      if (cap && cap[0] === s && cap[1] === i) cap = null;
      if (!homeFree(P, s, RING, RING)) return null;
    }
    const Q = clonePawns(P);
    kill(Q, cap);
    Q[s][i].p = q; Q[s][i].u = false;
    return Q;
  }
  function enum7(P, slots, s, wanted) {
    let layer = new Map();
    layer.set(key(P), { P, seq: [] });
    const depth = wanted == null ? 7 : wanted;
    for (let d = 0; d < depth; d++) {
      const next = new Map();
      for (const { P: cur, seq } of layer.values()) {
        for (let i = 0; i < 4; i++) {
          const r = step7(cur, slots, s, i);
          if (r) { const k = key(r); if (!next.has(k)) next.set(k, { P: r, seq: seq.concat(i) }); }
        }
      }
      layer = next;
      if (!layer.size) return [];
    }
    return [...layer.values()];
  }
  // reste-t-il une façon d'utiliser `remaining` pas ? (sert à l'interface)
  function feasible7(P, slots, s, remaining, memo) {
    if (remaining === 0) return true;
    memo = memo || new Map();
    const mk = remaining + ':' + key(P);
    if (memo.has(mk)) return memo.get(mk);
    let ok = false;
    for (let i = 0; i < 4 && !ok; i++) {
      const r = step7(P, slots, s, i);
      if (r && feasible7(r, slots, s, remaining - 1, memo)) ok = true;
    }
    memo.set(mk, ok);
    return ok;
  }

  /* ---------- résolution d'une action ---------- */
  // d = {k, kind: 'fwd'|'start'|'back'|'swap'|'seven'|'discard', pawn, tseat, tpawn, seq}
  // retourne {d, Q} (Q = pions après l'action) ou null si illégal.
  function resolve(S, seat, d) {
    if (!d || !S.hands[seat].includes(d.k)) return null;
    const cs = ctrlSeat(S, seat);
    const P = S.pawns, slots = S.slots;
    const occ = buildOcc(P, slots);
    const Q = clonePawns(P);
    const isPawn = v => Number.isInteger(v) && v >= 0 && v < 4;
    switch (d.kind) {
      case 'fwd': {
        const n = NUM[d.k];
        if (!n || !isPawn(d.pawn)) return null;
        const r = tryFwd(P, slots, occ, cs, d.pawn, n);
        if (!r) return null;
        kill(Q, r.cap);
        Q[cs][d.pawn].p = r.q; Q[cs][d.pawn].u = false;
        return { d: { k: d.k, kind: 'fwd', pawn: d.pawn }, Q };
      }
      case 'start': {
        if (d.k !== '1' && d.k !== '10') return null;
        let i = P[cs].findIndex(x => x.p === -1);
        if (i < 0) return null;
        const r = tryStart(P, slots, occ, cs, i);
        if (!r) return null;
        kill(Q, r.cap);
        Q[cs][i].p = 0; Q[cs][i].u = true;
        return { d: { k: d.k, kind: 'start', pawn: i }, Q };
      }
      case 'back': {
        if (d.k !== '-4' || !isPawn(d.pawn)) return null;
        const r = tryBack(P, slots, occ, cs, d.pawn);
        if (!r) return null;
        kill(Q, r.cap);
        Q[cs][d.pawn].p = r.q; Q[cs][d.pawn].u = false;
        return { d: { k: d.k, kind: 'back', pawn: d.pawn }, Q };
      }
      case 'swap': {
        if (d.k !== 'P' || !isPawn(d.pawn) || !isPawn(d.tpawn)) return null;
        const t = d.tseat;
        if (!Number.isInteger(t) || t < 0 || t >= S.n) return null;
        if (!trySwap(P, cs, d.pawn, t, d.tpawn)) return null;
        const x = Q[cs][d.pawn], y = Q[t][d.tpawn];
        const rx = ringOf(slots[cs], x.p), ry = ringOf(slots[t], y.p);
        x.p = progOf(slots[cs], ry); y.p = progOf(slots[t], rx);
        x.u = false; y.u = false;
        return { d: { k: 'P', kind: 'swap', pawn: d.pawn, tseat: t, tpawn: d.tpawn }, Q };
      }
      case 'seven': {
        if (d.k !== '7' || !Array.isArray(d.seq) || d.seq.length !== 7) return null;
        let cur = P;
        for (const i of d.seq) {
          if (!isPawn(i)) return null;
          cur = step7(cur, slots, cs, i);
          if (!cur) return null;
        }
        return { d: { k: '7', kind: 'seven', seq: d.seq.slice() }, Q: cur };
      }
      case 'discard': {
        if (legalActions(S, seat).length) return null;
        return { d: { k: d.k, kind: 'discard' }, Q };
      }
    }
    return null;
  }

  // toutes les actions légales du joueur `seat` (sans doublons de cartes identiques)
  function legalActions(S, seat) {
    const cs = ctrlSeat(S, seat);
    const P = S.pawns, slots = S.slots;
    const out = [];
    const kinds = [...new Set(S.hands[seat])];
    const occ = buildOcc(P, slots);
    for (const k of kinds) {
      if (NUM[k]) {
        for (let i = 0; i < 4; i++) {
          const r = tryFwd(P, slots, occ, cs, i, NUM[k]);
          if (r) {
            const Q = clonePawns(P); kill(Q, r.cap);
            Q[cs][i].p = r.q; Q[cs][i].u = false;
            out.push({ d: { k, kind: 'fwd', pawn: i }, Q });
          }
        }
        if (k === '1' || k === '10') {
          const i = P[cs].findIndex(x => x.p === -1);
          if (i >= 0) {
            const r = tryStart(P, slots, occ, cs, i);
            if (r) {
              const Q = clonePawns(P); kill(Q, r.cap);
              Q[cs][i].p = 0; Q[cs][i].u = true;
              out.push({ d: { k, kind: 'start', pawn: i }, Q });
            }
          }
        }
      } else if (k === '-4') {
        for (let i = 0; i < 4; i++) {
          const r = tryBack(P, slots, occ, cs, i);
          if (r) {
            const Q = clonePawns(P); kill(Q, r.cap);
            Q[cs][i].p = r.q; Q[cs][i].u = false;
            out.push({ d: { k, kind: 'back', pawn: i }, Q });
          }
        }
      } else if (k === 'P') {
        for (let i = 0; i < 4; i++) for (let t = 0; t < S.n; t++) for (let j = 0; j < 4; j++) {
          if (!trySwap(P, cs, i, t, j)) continue;
          const Q = clonePawns(P);
          const x = Q[cs][i], y = Q[t][j];
          const rx = ringOf(slots[cs], x.p), ry = ringOf(slots[t], y.p);
          x.p = progOf(slots[cs], ry); y.p = progOf(slots[t], rx);
          x.u = false; y.u = false;
          out.push({ d: { k, kind: 'swap', pawn: i, tseat: t, tpawn: j }, Q });
        }
      } else if (k === '7') {
        for (const { P: Q, seq } of enum7(P, slots, cs)) out.push({ d: { k, kind: 'seven', seq }, Q });
      }
    }
    return out;
  }

  /* ---------- partie ---------- */
  function newGame(opts) {
    opts = opts || {};
    const n = opts.n === 2 ? 2 : 4;
    const teams = n === 4 && opts.teams !== false;
    const S = {
      n, teams,
      swap: teams && opts.swap !== false,
      slots: n === 2 ? [0, 2] : [0, 1, 2, 3],
      pawns: null, hands: [], deck: shuffle(makeDeck()), discard: [],
      turn: 0, phase: 'play', swapChoice: [], winner: null, last: null, deals: 0, turns: 0
    };
    S.pawns = S.slots.map(() => Array.from({ length: 4 }, () => ({ p: -1, u: false })));
    deal(S);
    return S;
  }
  function deal(S) {
    if (S.deck.length < 4 * S.n) {
      S.deck = shuffle(S.deck.concat(S.discard));
      S.discard = [];
    }
    S.hands = [];
    for (let s = 0; s < S.n; s++) S.hands.push(S.deck.splice(0, 4));
    S.deals++;
    if (S.swap) { S.phase = 'swap'; S.swapChoice = Array(S.n).fill(null); }
    else S.phase = 'play';
  }
  function setSwap(S, seat, k) {
    if (S.phase !== 'swap' || S.swapChoice[seat] != null) return false;
    if (!S.hands[seat].includes(k)) return false;
    S.swapChoice[seat] = k;
    if (S.swapChoice.every(v => v != null)) {
      const give = S.swapChoice.slice();
      for (let s = 0; s < S.n; s++) S.hands[s].splice(S.hands[s].indexOf(give[s]), 1);
      for (let s = 0; s < S.n; s++) S.hands[partnerOf(S, s)].push(give[s]);
      S.swapChoice = []; S.phase = 'play';
    }
    return true;
  }
  function winnerOf(S) {
    if (S.teams) {
      for (const t of [0, 1]) if (allHome(S.pawns, t) && allHome(S.pawns, t + 2)) return t;
      return null;
    }
    for (let s = 0; s < S.n; s++) if (allHome(S.pawns, s)) return s;
    return null;
  }
  // joue l'action `d` pour le joueur dont c'est le tour. Retourne {ok, err}
  function play(S, seat, d) {
    if (S.phase !== 'play') return { ok: false, err: 'phase' };
    if (S.turn !== seat) return { ok: false, err: 'tour' };
    const r = resolve(S, seat, d);
    if (!r) return { ok: false, err: 'illégal' };
    const hand = S.hands[seat];
    hand.splice(hand.indexOf(d.k), 1);
    S.discard.push(d.k);
    S.pawns = r.Q;
    S.last = { seat, d: r.d };
    S.turns++;
    const w = winnerOf(S);
    if (w != null) { S.phase = 'over'; S.winner = w; return { ok: true }; }
    S.turn = (S.turn + 1) % S.n;
    if (S.hands.every(h => h.length === 0)) deal(S);
    return { ok: true };
  }

  return {
    RING, SEG, KINDS, NUM, setRng, shuffle, makeDeck,
    ringOf, progOf, clonePawns, key, buildOcc, allHome, homeFree,
    partnerOf, teamOf, ctrlSeat,
    tryFwd, tryStart, tryBack, trySwap, step7, enum7, feasible7,
    resolve, legalActions, newGame, deal, setSwap, winnerOf, play
  };
});
