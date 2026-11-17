/* =========================================================================
   services/syncEngine.js — one global clock, one deterministic outcome.

   Every client aligns to the Supabase `Date` header, then derives the round
   index purely from wall-clock time. Cards, wheel results, the dealer on
   duty and the recent roadmap are all pure functions of
   (tableId, roundIndex) — so two players in the same room at the same second
   see the identical hand, the identical dealer and the identical roadmap.
   ========================================================================= */
import { RANKS, SUITS, cardValue, total } from '../baccarat/engine.js';

export const SUPABASE_URL = 'https://dhgfijnaxeiuiplqnriy.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_BwEaG0K2BNrNoEO_zjeNvg_5i2A2Gei';

/* ------------------------------------------------------------------ clock */
let serverOffsetMs = 0;
let clockSynced = false;
let lastSync = 0;

export function syncClock() {
  return fetch(`${SUPABASE_URL}/rest/v1/game_accounts?select=username&limit=1`, {
    method: 'HEAD',
    headers: { apikey: SUPABASE_KEY }
  })
    .then((res) => {
      const dateHeader = res.headers.get('date');
      if (dateHeader) {
        const server = Date.parse(dateHeader);
        if (!Number.isNaN(server)) {
          // Date headers have 1s resolution: keep the sub-second part from the local clock
          serverOffsetMs = server + (Date.now() % 1000) - Date.now();
          clockSynced = true;
          lastSync = Date.now();
        }
      }
      return { synced: clockSynced, offset: serverOffsetMs };
    })
    .catch(() => ({ synced: clockSynced, offset: serverOffsetMs }));
}

export const serverNow = () => Date.now() + serverOffsetMs;
export const isClockSynced = () => clockSynced;
export const clockOffset = () => serverOffsetMs;

/* -------------------------------------------------------------- timing */
export const ROUND = {
  baccarat: { ms: 20000, betMs: 10000, dealMs: 7000, resultMs: 3000 },
  crazy: { ms: 30000, betMs: 15000, spinMs: 9000, resultMs: 6000 }
};

export function roundIndexFor(kind, tableId, at = serverNow()) {
  const cfg = ROUND[kind];
  const offset = TABLE_OFFSETS[tableId] || 0;
  return Math.floor((at + offset) / cfg.ms);
}

export function roundPhase(kind, tableId, at = serverNow()) {
  const cfg = ROUND[kind];
  const offset = TABLE_OFFSETS[tableId] || 0;
  const idx = Math.floor((at + offset) / cfg.ms);
  const elapsed = at + offset - idx * cfg.ms;
  const mid = cfg.dealMs ?? cfg.spinMs ?? 8000; // baccarat deals, crazy time spins
  let phase = 'betting';
  if (elapsed >= cfg.betMs && elapsed < cfg.betMs + mid) phase = 'dealing';
  else if (elapsed >= cfg.betMs + mid) phase = 'result';
  return { index: idx, elapsed, phase, timeLeft: Math.max(0, cfg.betMs - elapsed), cfg };
}

/** stagger tables so the lobby has different rooms at different moments */
const TABLE_OFFSETS = {
  'speed-a': 0,
  'speed-b': 4000,
  'speed-c': 9000,
  'salon': 13000,
  'crazy': 0
};
export function setTableOffset(id, ms) { TABLE_OFFSETS[id] = ms; }

/* --------------------------------------------------------- deterministic */
export function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFor(tableId, roundIndex, salt = '') {
  return hashStr(`${tableId}:${roundIndex}:${salt}`);
}

function makeDrawer(rnd) {
  return () => ({
    rank: RANKS[Math.floor(rnd() * RANKS.length)],
    suit: SUITS[Math.floor(rnd() * SUITS.length)].key
  });
}

/* Baccarat third-card rules (mirrors engine.js, driving off a seeded drawer) */
function playerDraws(pTotal) { return pTotal <= 5; }
function bankerDraws(bTotal, pThird) {
  if (pThird == null) return bTotal <= 5;
  const t = cardValue(pThird.rank);
  switch (bTotal) {
    case 0: case 1: case 2: return true;
    case 3: return t !== 8;
    case 4: return t >= 2 && t <= 7;
    case 5: return t >= 4 && t <= 7;
    case 6: return t === 6 || t === 7;
    default: return false;
  }
}

/** Full deterministic hand for a table + round. */
export function baccaratHand(tableId, roundIndex) {
  const rnd = mulberry32(seedFor(tableId, roundIndex, 'shoe'));
  const draw = makeDrawer(rnd);
  const player = [];
  const banker = [];
  const steps = [];

  for (let i = 0; i < 2; i++) {
    const p = draw();
    player.push(p);
    steps.push({ side: 'P', card: p, index: i, type: 'deal' });
    const b = draw();
    banker.push(b);
    steps.push({ side: 'B', card: b, index: i, type: 'deal' });
  }

  let pTotal = total(player);
  let bTotal = total(banker);
  const natural = pTotal >= 8 || bTotal >= 8;
  let pThird = null;

  if (!natural && playerDraws(pTotal)) {
    pThird = draw();
    player.push(pThird);
    steps.push({ side: 'P', card: pThird, index: 2, type: 'third' });
    pTotal = total(player);
  }
  if (!natural && bankerDraws(bTotal, pThird)) {
    const bThird = draw();
    banker.push(bThird);
    steps.push({ side: 'B', card: bThird, index: 2, type: 'third' });
    bTotal = total(banker);
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
    playerPair: player.length >= 2 && player[0].rank === player[1].rank,
    bankerPair: banker.length >= 2 && banker[0].rank === banker[1].rank,
    natural,
    roundIndex,
    tableId
  };
}

/** Dealer on duty for a round — rotates every `rotation` rounds. */
export function dealerFor(dealers, roundIndex, rotation = 12) {
  if (!dealers || !dealers.length) return null;
  const shift = Math.floor(roundIndex / rotation);
  return dealers[((shift % dealers.length) + dealers.length) % dealers.length];
}

/** Recent settled rounds, rebuilt from seeds (identical for every client). */
export function recentBaccarat(tableId, count = 60, endIndex = null) {
  const last = endIndex == null ? roundIndexFor('baccarat', tableId) : endIndex;
  const out = [];
  for (let i = last - count; i < last; i++) {
    if (i < 0) continue;
    const h = baccaratHand(tableId, i);
    out.push({
      roundIndex: i,
      result: h.result,
      playerTotal: h.playerTotal,
      bankerTotal: h.bankerTotal,
      playerPair: h.playerPair,
      bankerPair: h.bankerPair
    });
  }
  return out;
}

/* ------------------------------------------------------- crazy time data */
const CT_WHEEL = [];
(function buildWheel() {
  const push = (v, n) => { for (let i = 0; i < n; i++) CT_WHEEL.push(v); };
  push('n1', 21); push('n2', 13); push('n5', 6); push('n10', 4);
  push('cf', 4); push('pa', 2); push('ch', 2); push('ct', 1);
})();
export { CT_WHEEL };

export const CT_LABEL = {
  n1: '1', n2: '2', n5: '5', n10: '10',
  cf: 'COIN FLIP', pa: 'PACHINKO', ch: 'CASH HUNT', ct: 'CRAZY TIME'
};

export function crazySpin(roundIndex, tableId = 'crazy') {
  const seed = seedFor(tableId, roundIndex, 'wheel');
  const rnd = mulberry32(seed);
  const stop = Math.floor(rnd() * CT_WHEEL.length);
  const segment = CT_WHEEL[stop];
  const slotA = CT_WHEEL[Math.floor(rnd() * CT_WHEEL.length)];
  const multB = [2, 5, 10, 15, 20, 25, 30, 40, 50][Math.floor(rnd() * 9)];
  const bonusRnd = mulberry32(seedFor(tableId, roundIndex, 'bonus'));
  return {
    roundIndex,
    stop,
    segment,
    label: CT_LABEL[segment],
    topSlotA: slotA,
    topSlotB: multB,
    topSlotWin: slotA === segment,
    bonusSeed: seedFor(tableId, roundIndex, 'bonus'),
    bonusRnd
  };
}

export function recentCrazy(count = 12, endIndex = null) {
  const last = endIndex == null ? roundIndexFor('crazy', 'crazy') : endIndex;
  const out = [];
  for (let i = Math.max(0, last - count); i < last; i++) out.push(crazySpin(i));
  return out;
}
