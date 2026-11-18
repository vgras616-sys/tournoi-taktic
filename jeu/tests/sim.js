// Simulation IA vs IA : vérifie les invariants du moteur et mesure la force relative des niveaux.
const TT = require('../js/engine.js');
const AI = require('../js/ai.js');

function check(S) {
  const seen = new Set();
  S.pawns.forEach((a, s) => a.forEach((x, i) => {
    if (x.p < -1 || x.p > 67) throw new Error('p hors limites');
    if (x.u && x.p !== 0) throw new Error('pieu hors case départ');
    const id = x.p >= 0 && x.p < 64 ? 'r' + TT.ringOf(S.slots[s], x.p) : x.p >= 64 ? 'h' + s + ':' + x.p : null;
    if (id) { if (seen.has(id)) throw new Error('deux pions sur ' + id + ' ' + JSON.stringify(S.pawns)); seen.add(id); }
  }));
  const total = S.hands.reduce((n, h) => n + h.length, 0) + S.deck.length + S.discard.length;
  if (total !== 48) throw new Error('cartes perdues : ' + total);
}

function playGame(n, teams, levels, maxTurns = 4000) {
  const S = TT.newGame({ n, teams });
  while (S.phase !== 'over') {
    if (S.turns > maxTurns) return { timeout: true, S };
    if (S.phase === 'swap') {
      for (let s = 0; s < S.n; s++) TT.setSwap(S, s, AI.chooseSwap(S, s, levels[s]));
      check(S);
      continue;
    }
    const seat = S.turn;
    const d = AI.chooseAction(S, seat, levels[seat]);
    const r = TT.play(S, seat, d);
    if (!r.ok) throw new Error('action refusée ' + JSON.stringify(d) + ' ' + r.err);
    check(S);
  }
  return { S };
}

const games = +process.argv[2] || 30;
const configs = [
  { name: 'Duel Facile vs Difficile', n: 2, teams: false, levels: [0, 2] },
  { name: 'Duel Moyen vs Difficile', n: 2, teams: false, levels: [1, 2] },
  { name: '2v2 (Facile,Facile) vs (Difficile,Difficile)', n: 4, teams: true, levels: [0, 2, 0, 2] },
  { name: '2v2 (Moyen,Moyen) vs (Difficile,Difficile)', n: 4, teams: true, levels: [1, 2, 1, 2] },
  { name: '4 solo F/M/D/D', n: 4, teams: false, levels: [0, 1, 2, 2] }
];
for (const c of configs) {
  const wins = {}; let to = 0, turns = 0, t0 = Date.now();
  for (let g = 0; g < games; g++) {
    const r = playGame(c.n, c.teams, c.levels);
    if (r.timeout) { to++; continue; }
    wins[r.S.winner] = (wins[r.S.winner] || 0) + 1; turns += r.S.turns;
  }
  console.log(c.name, '→ victoires', JSON.stringify(wins), 'timeouts', to,
    'tours moy.', Math.round(turns / Math.max(1, games - to)), (Date.now() - t0) + 'ms');
}
