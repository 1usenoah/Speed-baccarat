/* =========================================================================
   services/ranking.js — leaderboard (peak net balance, free credits excluded)

   LIVE:  Supabase table `baccarat_rankings`
          (player_id, nickname, period_type, period_key, peak_net_balance, updated_at)
   LOCAL: deterministic pseudo-field kept in localStorage, used whenever the
          cloud is unreachable or the table is missing. The UI is identical.
   ========================================================================= */
import { wallet as defaultWallet, dayKey, weekKey, monthKey, fmt } from '../core/store.js';
import { currentUser } from './auth.js';
import { sbSelect, sbUpsertBy, sbState } from './supabase.js';

const NAMES = [
  'NOAH', 'LUCKY7', 'BANKER_KING', 'MILANO', 'KIMCHI', 'GOLDEN_TIGER', 'MACAU88', 'LADY_LUCK',
  'DRAGON', 'SEOUL_BET', 'VEGAS_JOE', 'TERMINAL9', 'MR_PAIR', 'EMERALD', 'JACKPOT', 'MONACO',
  'BLACK_SWAN', 'DANIEL7', 'YUKI', 'SANTIAGO', 'CHIP_LEADER', 'HIGH_ROLLER', 'ACE_HIGH', 'TIE_MASTER'
];

const PERIOD_KEY = { daily: dayKey, weekly: weekKey, monthly: monthKey };
export const rankingStatus = { mode: 'local', lastError: null, at: 0 };

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** deterministic "other players" so the board looks alive without a crowd */
function mockRows(period, key) {
  const rnd = mulberry(hash(period + key));
  const scale = period === 'daily' ? 30 : period === 'weekly' ? 110 : 300;
  const out = [];
  const seen = new Set();
  for (let i = 0; i < 18; i++) {
    const r = Math.pow(rnd(), 1.7);
    let name = NAMES[Math.floor(rnd() * NAMES.length)];
    let k = 2;
    while (seen.has(name)) name = NAMES[Math.floor(rnd() * NAMES.length)] + '_' + k++;
    seen.add(name);
    out.push({ name, score: Math.round((500000 + r * scale * 1e6) / 1000) * 1000, bot: true });
  }
  return out;
}

export const playerId = () => {
  const u = currentUser();
  return u ? `user:${u.username}` : 'user:guest';
};

export function labelFor(period, key) {
  if (period === 'daily') return `${key} · DAILY`;
  if (period === 'weekly') return `${key} · WEEKLY`;
  return `${key} · MONTHLY`;
}

/** push my peak to the cloud (called on every settlement) */
export async function submitScore(period = 'daily', w = defaultWallet) {
  w.recordPeak();
  const key = PERIOD_KEY[period]();
  const score = Math.max(w.netBalance, w.peekPeak(period) || 0);
  const row = {
    player_id: playerId(),
    nickname: w.nickname,
    period_type: period,
    period_key: key,
    peak_net_balance: Math.max(0, Math.round(score)),
    updated_at: new Date().toISOString()
  };
  const match = `player_id=eq.${encodeURIComponent(row.player_id)}&period_type=eq.${period}&period_key=eq.${encodeURIComponent(key)}`;
  const res = await sbUpsertBy('baccarat_rankings', match, row);
  if (!res.ok) {
    rankingStatus.mode = 'local';
    rankingStatus.lastError = res.error;
    saveLocalRow(row);
  } else {
    rankingStatus.mode = 'live';
    rankingStatus.lastError = null;
  }
  rankingStatus.at = Date.now();
  return row;
}

function saveLocalRow(row) {
  try {
    const db = JSON.parse(localStorage.getItem('evolab.ranks.v1') || '{}');
    const k = `${row.period_type}:${row.period_key}`;
    db[k] = db[k] || {};
    const cur = db[k][row.player_id];
    if (!cur || row.peak_net_balance > cur.peak_net_balance) db[k][row.player_id] = row;
    localStorage.setItem('evolab.ranks.v1', JSON.stringify(db));
  } catch (e) { /* ignore */ }
}

function localRows(period, key) {
  try {
    const db = JSON.parse(localStorage.getItem('evolab.ranks.v1') || '{}');
    const bucket = db[`${period}:${key}`] || {};
    return Object.values(bucket).map((r) => ({ name: r.nickname || r.player_id, score: r.peak_net_balance, you: r.player_id === playerId() }));
  } catch (e) {
    return [];
  }
}

/** top 20 for a period; falls back to the local board on any error */
export async function getLeaderboard(period = 'daily', w = defaultWallet) {
  const key = PERIOD_KEY[period]();
  const myScore = Math.max(0, w.netBalance, w.peekPeak(period) || 0);
  let rows = null;
  let mode = 'local';

  const res = await sbSelect(
    'baccarat_rankings',
    `select=player_id,nickname,period_type,period_key,peak_net_balance,updated_at&period_type=eq.${period}&period_key=eq.${encodeURIComponent(key)}&order=peak_net_balance.desc&limit=20`
  );
  if (res.ok && Array.isArray(res.data)) {
    mode = 'live';
    rows = res.data.map((r) => ({
      name: r.nickname || r.player_id,
      score: Number(r.peak_net_balance) || 0,
      you: r.player_id === playerId()
    }));
  } else {
    rankingStatus.lastError = res.error || 'error';
  }

  if (!rows) {
    rows = [...localRows(period, key), ...mockRows(period, key)];
  } else if (rows.length < 6) {
    rows = [...rows, ...mockRows(period, key).slice(0, 8 - rows.length)];
  }

  const me = rows.find((r) => r.you);
  if (!me) rows.push({ name: w.nickname, score: myScore, you: true });
  rows.sort((a, b) => b.score - a.score);
  const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 }));
  const you = ranked.find((r) => r.you);
  const top = ranked.slice(0, 20);
  if (you && you.rank > 20) top.push(you);

  rankingStatus.mode = mode;
  rankingStatus.at = Date.now();
  if (mode === 'live') rankingStatus.lastError = null;
  return { period, key, rows: top, you, mode, periodLabel: labelFor(period, key) };
}

export { fmt };
