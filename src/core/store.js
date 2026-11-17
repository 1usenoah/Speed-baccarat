/* =========================================================================
   store.js — one persisted session document shared by both games.
   Holds the virtual wallet, free top-up quota, VIP flag, peaks per period,
   nickname and each game's history. Everything is auto-saved on change.
   ========================================================================= */

const KEY = 'evolab.save.v2';
const LEGACY_KEY = 'evolab.wallet.v1';
const START = 1000000;
export const MIN_CHIP = 1000;
export const REFILL_AMOUNT = 1000000;
export const REFILL_BIG = 10000000; // VIP-only +10M
export const REFILL_DAILY_MAX = 10;
const VIP_CODE = 'noah2026';

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const weekKey = (d = new Date()) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${pad(week)}`;
};
export const localDay = dayKey;

const emptySave = () => ({
  balance: START,
  refill: { date: dayKey(), count: 0 },
  vip: false,
  nickname: '',
  totalRefilled: 0,
  peaks: { day: null, week: null, month: null }, // { key, value }
  history: { baccarat: [], crazy: [] }
});

class Wallet {
  constructor() {
    this.listeners = new Set();
    this.doc = emptySave();
    this._load();
    this._rollDay();
    try {
      const q = new URLSearchParams(window.location.search);
      if ((q.get('vip') || '').toLowerCase() === VIP_CODE) {
        this.doc.vip = true;
        this.save();
      }
    } catch (e) { /* ignore */ }
    this.round = 0;
  }

  _load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const v = JSON.parse(raw);
        this.doc = { ...emptySave(), ...v, history: { baccarat: [], crazy: [], ...(v.history || {}) } };
        if (!isFinite(this.doc.balance) || this.doc.balance < 0) this.doc.balance = START;
        return;
      }
      // migrate the old wallet-only record
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const v = JSON.parse(legacy);
        if (typeof v.balance === 'number') this.doc.balance = v.balance;
        if (v.refill) this.doc.refill = v.refill;
        if (v.vip) this.doc.vip = true;
      }
    } catch (e) { /* ignore */ }
  }

  _rollDay() {
    const today = dayKey();
    if (this.doc.refill.date !== today) {
      this.doc.refill = { date: today, count: 0 };
      this.save();
    }
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.doc));
    } catch (e) { /* ignore */ }
  }

  notify() {
    this.recordPeak(false);
    this.save();
    this.listeners.forEach((fn) => fn(this.balance, this));
  }

  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.balance, this);
    return () => this.listeners.delete(fn);
  }

  /* ----------------------------------------------------------- wallet */
  get balance() { return this.doc.balance; }
  set balance(v) { this.doc.balance = Math.max(0, Math.round(v)); }

  /** credits above the initial seed that were gifted through refills */
  get totalRefilled() { return this.doc.totalRefilled || 0; }

  /** pure game result, free top-ups excluded — what rankings are based on */
  get netBalance() { return this.balance - this.totalRefilled; }

  get vip() { return !!this.doc.vip; }
  get isVip() { return this.vip; }

  get nickname() {
    if (this.doc.nickname) return this.doc.nickname;
    return `PLAYER${String(Math.abs(this._seed())).slice(0, 4)}`;
  }

  _seed() {
    if (this._seedVal == null) {
      let h = 7;
      const s = 'evolab-device-' + (navigator.userAgent || '') + (window.screen?.width || 0);
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 999983;
      this._seedVal = h;
    }
    return this._seedVal;
  }

  setNickname(name) {
    const clean = String(name || '').trim().slice(0, 14).replace(/[<>&]/g, '');
    this.doc.nickname = clean;
    this.notify();
    return clean;
  }

  canAfford(n) { return this.balance >= n; }

  debit(n) {
    if (this.balance < n) return false;
    this.balance -= n;
    this.notify();
    return true;
  }

  credit(n) {
    if (n <= 0) return;
    this.balance += n;
    this.notify();
  }

  /* ------------------------------------------------------------ refill */
  get refillsUsed() {
    this._rollDay();
    return this.doc.refill.count;
  }

  get refillsLeft() {
    if (this.vip) return Infinity;
    return Math.max(0, REFILL_DAILY_MAX - this.refillsUsed);
  }

  enableVip(code) {
    if (String(code || '').trim().toLowerCase() !== VIP_CODE) return false;
    this.doc.vip = true;
    this.save();
    this.notify();
    return true;
  }

  /** free credits: 1,000,000 per use, 10 uses per local day (VIP: unlimited) */
  refill(amount = REFILL_AMOUNT) {
    this._rollDay();
    if (this.vip) {
      const amt = amount >= REFILL_BIG ? REFILL_BIG : REFILL_AMOUNT;
      this.balance += amt;
      this.doc.totalRefilled += amt;
      this.notify();
      return { ok: true, amount: amt, left: Infinity, used: this.doc.refill.count, vip: true };
    }
    if (amount > REFILL_AMOUNT) return { ok: false, reason: 'vip_only', left: this.refillsLeft };
    if (this.doc.refill.count >= REFILL_DAILY_MAX) return { ok: false, reason: 'daily_limit', left: 0 };
    this.doc.refill.count += 1;
    this.balance += REFILL_AMOUNT;
    this.doc.totalRefilled += REFILL_AMOUNT;
    this.notify();
    return { ok: true, amount: REFILL_AMOUNT, left: this.refillsLeft, used: this.doc.refill.count };
  }

  reset() {
    const keepVip = this.doc.vip;
    this.doc = emptySave();
    this.doc.vip = keepVip;
    this.notify();
  }

  /* -------------------------------------------------------------- peaks */
  get periodKeys() {
    return { day: dayKey(), week: weekKey(), month: monthKey() };
  }

  peekPeak(period) {
    const key = this.periodKeys[period];
    const p = this.doc.peaks[period];
    return p && p.key === key ? p.value : null;
  }

  recordPeak(emit = true) {
    const keys = this.periodKeys;
    let changed = false;
    for (const period of ['day', 'week', 'month']) {
      const key = keys[period];
      const value = Math.max(0, this.netBalance);
      const p = this.doc.peaks[period];
      if (!p || p.key !== key) {
        this.doc.peaks[period] = { key, value };
        changed = true;
      } else if (value > p.value) {
        p.value = value;
        changed = true;
      }
    }
    if (changed) this.save();
    return changed;
  }

  /** best net peak in the current period */
  get peakNow() {
    return Math.max(0, this.netBalance, this.peekPeak('day') || 0);
  }

  /** adopt a server account's wallet on login */
  adoptAccount(acc, { keepBalance = false } = {}) {
    if (!acc) return;
    if (!keepBalance && typeof acc.balance === 'number') this.doc.balance = Math.max(0, Math.round(acc.balance));
    else if (keepBalance && typeof acc.balance === 'number' && acc.balance > 0) this.doc.balance = Math.round(acc.balance);
    if (typeof acc.total_refilled === 'number') this.doc.totalRefilled = acc.total_refilled;
    if (acc.daily_refills && acc.daily_refills.date) this.doc.refill = acc.daily_refills;
    if (typeof acc.is_vip === 'boolean') this.doc.vip = acc.is_vip;
    this.notify();
  }

  setVip(v) {
    this.doc.vip = !!v;
    this.save();
    this.notify();
  }

  /* ------------------------------------------------------------ history */
  pushHistory(game, entry, max = 160) {
    const h = this.doc.history[game];
    h.push(entry);
    if (h.length > max) h.splice(0, h.length - max);
    this.recordPeak(false);
    this.save();
  }

  getHistory(game) {
    return this.doc.history[game] || [];
  }

  /* --------------------------------------------------------------- misc */
  get refillState() { return this.doc.refill; }
}

export const wallet = new Wallet();

export function fmt(n) {
  return Math.round(n).toLocaleString('en-US');
}

export function fmtShort(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 2).replace(/\.00$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return String(Math.round(n));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const randRange = (a, b) => a + Math.random() * (b - a);
