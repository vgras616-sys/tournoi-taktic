/* Tac Tik — IA. Niveaux : 0 = Facile, 1 = Moyen, 2 = Difficile */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.TTAI = factory(root.TT);
})(typeof self !== 'undefined' ? self : this, function (TT) {
  'use strict';
  const { RING, SEG } = TT;
  const rnd = () => Math.random();

  // valeur d'un pion selon sa progression
  function pawnValue(p) {
    if (p < 0) return 0;
    if (p >= RING) return 150 + (p - RING) * 3;
    return 22 + p * 1.25;
  }

  // probabilité qu'une carte d'un type donné soit dans une main de 4 cartes
  const PK = 0.29;

  function threatOn(S, P, s, i, occ) {
    // probabilité qu'un adversaire mange le pion (s,i) au prochain tour (estimation)
    const x = P[s][i];
    if (x.p < 0 || x.p >= RING || x.u) return 0;
    const myTeam = TT.teamOf(S, s);
    const cell = TT.ringOf(S.slots[s], x.p);
    let safe = 1;
    for (let t = 0; t < S.n; t++) {
      if (TT.teamOf(S, t) === myTeam) continue;
      // départ d'un adversaire sur sa case de départ occupée par mon pion
      if (cell === TT.ringOf(S.slots[t], 0) && P[t].some(y => y.p === -1)) safe *= (1 - 0.55);
      for (let j = 0; j < 4; j++) {
        const y = P[t][j];
        if (y.p < 0 || y.p >= RING) continue;
        const yc = TT.ringOf(S.slots[t], y.p);
        const d = (cell - yc + RING) % RING;   // distance en avant depuis y jusqu'à moi
        const back = (yc - cell + RING) % RING;
        let pr = 0;
        if ([1, 2, 3, 5, 6, 8, 9, 10, 12].includes(d)) pr = 1 - (1 - pr) * (1 - PK);
        if (d >= 1 && d <= 7) pr = 1 - (1 - pr) * (1 - PK * 0.8);
        if (back === 4) pr = 1 - (1 - pr) * (1 - PK);
        // un pion adverse ne peut pas dépasser un pieu ni sa propre maison : on ignore ces finesses
        safe *= (1 - pr);
      }
    }
    return 1 - safe;
  }

  function evalState(S, P, seat, level) {
    const me = TT.teamOf(S, seat);
    const tot = {};
    for (let s = 0; s < S.n; s++) {
      const t = TT.teamOf(S, s);
      tot[t] = tot[t] || 0;
      for (let i = 0; i < 4; i++) {
        let v = pawnValue(P[s][i].p);
        if (level >= 1 && P[s][i].p >= 0 && P[s][i].p < RING && P[s][i].u) v += 6; // un pieu est à l'abri
        tot[t] += v;
      }
      // un pieu sur sa case de départ gêne l'entrée à la maison
      if (level >= 2) {
        const hasPieu = P[s].some(x => x.u);
        const closeToHome = P[s].some(x => x.p >= 50 && x.p < RING);
        if (hasPieu && closeToHome) tot[t] -= 14;
      }
    }
    let mine = tot[me] || 0, opp = 0, nOpp = 0;
    for (const t in tot) if (+t !== me) { opp += tot[t]; nOpp++; }
    let score = mine - (nOpp ? opp / nOpp : 0);
    if (level >= 2) {
      const occ = TT.buildOcc(P, S.slots);
      for (let s = 0; s < S.n; s++) {
        const sign = TT.teamOf(S, s) === me ? -1 : 0.25; // exposer un adversaire est un (petit) plus
        for (let i = 0; i < 4; i++) {
          const th = threatOn(S, P, s, i, occ);
          if (th > 0) {
            const loss = pawnValue(P[s][i].p) + 12;
            if (sign < 0) score += sign * th * loss * 0.75;
            else score += sign * th * 0; // on ne modélise pas nos propres coups futurs
          }
        }
      }
    }
    return score;
  }

  function chooseAction(S, seat, level) {
    const acts = TT.legalActions(S, seat);
    if (!acts.length) {
      // défausse forcée : on garde les cartes flexibles, on jette les plus grosses valeurs
      const hand = S.hands[seat].slice();
      let pick = hand[Math.floor(rnd() * hand.length)];
      if (level >= 1) {
        const order = ['12', '9', '8', '6', '5', '3', '2', '-4', '10', '1', '7', 'P'];
        hand.sort((a, b) => order.indexOf(a) - order.indexOf(b));
        pick = hand[0];
      }
      return { k: pick, kind: 'discard' };
    }
    if (level === 0) return acts[Math.floor(rnd() * acts.length)].d;
    let best = null, bestScore = -Infinity;
    const noise = level === 1 ? 6 : 0.05;
    for (const a of acts) {
      const sc = evalState(S, a.Q, seat, level) + (rnd() - 0.5) * noise * 2;
      if (sc > bestScore) { bestScore = sc; best = a; }
    }
    return best.d;
  }

  // carte à passer au partenaire en début de donne
  function chooseSwap(S, seat, level) {
    const hand = S.hands[seat];
    if (level === 0) return hand[Math.floor(rnd() * hand.length)];
    let best = hand[0], bestScore = -Infinity;
    for (const k of new Set(hand)) {
      const rest = hand.slice(); rest.splice(rest.indexOf(k), 1);
      const T = { ...S, hands: S.hands.map((h, s) => (s === seat ? rest : h)) };
      const acts = TT.legalActions(T, seat);
      let sc = acts.length ? -Infinity : -400;
      for (const a of acts) sc = Math.max(sc, evalState(S, a.Q, seat, level));
      // donner un « démarrer » à un partenaire sans pion sorti est précieux
      if (level >= 2 && (k === '1' || k === '10')) {
        const partner = TT.partnerOf(S, seat);
        const partnerStarted = S.pawns[partner].some(x => x.p >= 0 && x.p < RING);
        if (!partnerStarted && hand.filter(c => c === '1' || c === '10').length >= 1) sc += 40;
      }
      if (sc > bestScore) { bestScore = sc; best = k; }
    }
    return best;
  }

  return { chooseAction, chooseSwap, evalState, pawnValue };
});
