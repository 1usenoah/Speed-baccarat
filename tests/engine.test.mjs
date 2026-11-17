import { Shoe, playHand, settle, cardValue } from '../src/baccarat/engine.js';
import { buildBigRoad, buildDerivedRoad, predict, statsFor } from '../src/baccarat/roadmap.js';

const shoe = new Shoe(8);
const counts = { P: 0, B: 0, T: 0 };
let thirdP = 0, thirdB = 0, pairs = 0;
for (let i = 0; i < 40000; i++) {
  const h = playHand(shoe);
  counts[h.result]++;
  if (h.player.length === 3) thirdP++;
  if (h.banker.length === 3) thirdB++;
  if (h.playerPair || h.bankerPair) pairs++;
  if (h.player.length > 3 || h.banker.length > 3) throw new Error('too many cards');
  if (h.playerTotal < 0 || h.playerTotal > 9 || h.bankerTotal < 0 || h.bankerTotal > 9) throw new Error('bad total');
  if (shoe.remaining < 20) shoe.build();
}
const tot = counts.P + counts.B + counts.T;
console.log('results', counts, 'P%', (counts.P / tot * 100).toFixed(2), 'B%', (counts.B / tot * 100).toFixed(2), 'T%', (counts.T / tot * 100).toFixed(2));
console.log('thirdP', (thirdP / tot * 100).toFixed(2) + '%', 'thirdB', (thirdB / tot * 100).toFixed(2) + '%', 'pairs', (pairs / tot * 100).toFixed(2) + '%');

const hand = { result: 'B', playerPair: false, bankerPair: true };
const s = settle({ P: 1000, B: 1000, BP: 1000, T: 500 }, hand);
console.log('settle', s);
if (s.totalReturn !== 1950 + 12000) throw new Error('settle wrong ' + s.totalReturn);

const hist = [
  { result: 'B', playerTotal: 1, bankerTotal: 5 }, { result: 'B', playerTotal: 2, bankerTotal: 6 },
  { result: 'P', playerTotal: 7, bankerTotal: 4 }, { result: 'P', playerTotal: 8, bankerTotal: 2 },
  { result: 'T', playerTotal: 5, bankerTotal: 5 }, { result: 'B', playerTotal: 0, bankerTotal: 3 },
  { result: 'B', playerTotal: 1, bankerTotal: 9 }, { result: 'B', playerTotal: 2, bankerTotal: 9 },
  { result: 'B', playerTotal: 3, bankerTotal: 9 }, { result: 'B', playerTotal: 4, bankerTotal: 9 },
  { result: 'B', playerTotal: 5, bankerTotal: 9 }, { result: 'B', playerTotal: 6, bankerTotal: 9 },
  { result: 'P', playerTotal: 9, bankerTotal: 2 }
];
const cols = buildBigRoad(hist);
console.log('cols', cols.map((c) => c.result + ':' + c.cells.map((x) => x.row).join(',')));
console.log('beb', buildDerivedRoad(cols, 1).map((c) => `${c.c},${c.r},${c.red ? 'R' : 'b'}`).join(' '));
console.log('sr ', buildDerivedRoad(cols, 2).map((c) => `${c.c},${c.r},${c.red ? 'R' : 'b'}`).join(' '));
console.log('cp ', buildDerivedRoad(cols, 3).map((c) => `${c.c},${c.r},${c.red ? 'R' : 'b'}`).join(' '));
console.log('stats', statsFor(hist), 'predict', predict(hist));
console.log('values', ['A', '2', '9', '10', 'J', 'Q', 'K'].map(cardValue).join(','));
console.log('OK');
