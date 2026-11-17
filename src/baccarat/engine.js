/* =========================================================================
   baccarat/engine.js — eight-deck shoe, official Punto Banco third-card
   rules, pairs and settlement. Framework free so it can be unit tested.
   ========================================================================= */

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUITS = [
  { key: 'S', glyph: '♠', color: '#12161c', red: false },
  { key: 'H', glyph: '♥', color: '#c8202f', red: true },
  { key: 'D', glyph: '♦', color: '#c8202f', red: true },
  { key: 'C', glyph: '♣', color: '#12161c', red: false }
];

export const cardValue = (rank) => {
  if (rank === 'A') return 1;
  if (rank === '10' || rank === 'J' || rank === 'Q' || rank === 'K') return 0;
  return Number(rank);
};

export const total = (cards) => cards.reduce((a, c) => a + cardValue(c.rank), 0) % 10;

export const isPair = (cards) => cards.length >= 2 && cards[0].rank === cards[1].rank;

export class Shoe {
  constructor(decks = 8, penetration = 0.86) {
    this.decks = decks;
    this.penetration = penetration;
    this.cards = [];
    this.shufflePoint = 0;
    this.build();
  }

  build() {
    const cards = [];
    for (let d = 0; d < this.decks; d++) {
      for (const s of SUITS) for (const r of RANKS) cards.push({ rank: r, suit: s.key });
    }
    this.cards = cards;
    this.position = 0;
    this.shufflePoint = Math.floor(cards.length * this.penetration);
    this.shuffle();
  }

  shuffle() {
    const a = this.cards;
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    this.position = 0;
  }

  get remaining() {
    return this.cards.length - this.position;
  }

  get needsShuffle() {
    return this.position >= this.shufflePoint || this.remaining < 12;
  }

  draw() {
    if (this.position >= this.cards.length) this.shuffle();
    return this.cards[this.position++];
  }
}

/**
 * Player third-card rule: draw on 0-5, stand on 6-7. Naturals stop the hand.
 */
function playerDraws(pTotal) {
  return pTotal <= 5;
}

/**
 * Banker third-card rule (official Punto Banco table).
 * `pThird` is null when the player stood.
 */
function bankerDraws(bTotal, pThird) {
  if (pThird == null) return bTotal <= 5;
  const t = cardValue(pThird.rank);
  switch (bTotal) {
    case 0:
    case 1:
    case 2:
      return true;
    case 3:
      return t !== 8;
    case 4:
      return t >= 2 && t <= 7;
    case 5:
      return t >= 4 && t <= 7;
    case 6:
      return t === 6 || t === 7;
    default:
      return false; // 7 stands
  }
}

/**
 * Plays one hand and returns an animation-friendly step list.
 * steps: [{ type:'deal'|'third', side:'P'|'B', card, index }]
 */
export function playHand(shoe) {
  const player = [];
  const banker = [];
  const steps = [];

  const take = (side) => {
    const card = shoe.draw();
    (side === 'P' ? player : banker).push(card);
    return card;
  };

  // initial four cards: P, B, P, B
  for (let i = 0; i < 2; i++) {
    const c = take('P');
    steps.push({ type: i === 0 ? 'deal' : 'deal', side: 'P', card: c, index: i });
    const d = take('B');
    steps.push({ type: 'deal', side: 'B', card: d, index: i });
  }

  let pTotal = total(player);
  let bTotal = total(banker);
  const playerNatural = pTotal >= 8;
  const bankerNatural = bTotal >= 8;

  let pThird = null;
  let bThird = null;

  if (!playerNatural && !bankerNatural) {
    if (playerDraws(pTotal)) {
      pThird = take('P');
      steps.push({ type: 'third', side: 'P', card: pThird, index: 2 });
      pTotal = total(player);
    }
    if (bankerDraws(bTotal, pThird)) {
      bThird = take('B');
      steps.push({ type: 'third', side: 'B', card: bThird, index: 2 });
      bTotal = total(banker);
    }
  }

  pTotal = total(player);
  bTotal = total(banker);

  const result = pTotal > bTotal ? 'P' : bTotal > pTotal ? 'B' : 'T';

  return {
    steps,
    player,
    banker,
    playerTotal: pTotal,
    bankerTotal: bTotal,
    result,
    playerPair: isPair(player),
    bankerPair: isPair(banker),
    natural: playerNatural || bankerNatural
  };
}

export const PAYOUTS = {
  P: 1, // 1:1
  B: 0.95, // 5% commission
  T: 8,
  PP: 11,
  BP: 11
};

/**
 * @param bets  { P, B, T, PP, BP } stake per zone
 * @param hand  result of playHand()
 * @returns { totalReturn, totalStake, net, wins: {zone: amount}, detail }
 */
export function settle(bets, hand) {
  const wins = {};
  let totalReturn = 0;
  let totalStake = 0;
  for (const [zone, stake] of Object.entries(bets)) {
    if (!stake) continue;
    totalStake += stake;
    let mult = 0;
    if (zone === 'P') mult = hand.result === 'P' ? PAYOUTS.P : 0;
    if (zone === 'B') mult = hand.result === 'B' ? PAYOUTS.B : 0;
    if (zone === 'T') mult = hand.result === 'T' ? PAYOUTS.T : 0;
    if (zone === 'PP') mult = hand.playerPair ? PAYOUTS.PP : 0;
    if (zone === 'BP') mult = hand.bankerPair ? PAYOUTS.BP : 0;
    if (mult > 0) {
      // stake back + profit; commission is applied on the profit part
      const ret = zone === 'B' ? Math.floor(stake * (1 + PAYOUTS.B)) : Math.floor(stake * (1 + mult));
      wins[zone] = ret;
      totalReturn += ret;
    }
  }
  return { totalStake, totalReturn, net: totalReturn - totalStake, wins };
}

/** Simulated co-players' bet distribution (visual only) */
export function mockDistribution() {
  const t = 0.02 + Math.random() * 0.16;
  const rest = 1 - t;
  const b = rest * (0.45 + Math.random() * 0.28);
  const p = rest - b;
  return { P: p, B: b, T: t };
}
