/* =========================================================================
   services/auth.js — account signup / login / session / cloud save.

   Primary store: Supabase `game_accounts`
     (username PK, password_hash, balance, total_refilled, daily_refills jsonb,
      is_vip, is_banned, ban_reason, updated_at)
   Fallback store: localStorage (device only) so the site keeps working when
   the table has not been created yet or the network is down.
   Passwords are SHA-256(username + ':' + password) client side; the plain
   password never leaves the browser.
   ========================================================================= */
import { sbRequest, sbSelect, sbInsert, sbPatch, sbState } from './supabase.js';
import { wallet } from '../core/store.js';

const SESSION_KEY = 'evolab.session.v1';
const LOCAL_DB = 'evolab.accounts.v1';
const ADMIN_NAME = 'noah2026';
const SYNC_DEBOUNCE = 1800;

const listeners = new Set();
let session = null;
let syncTimer = null;
let lastSyncResult = null;

export function onAuthChange(fn) {
  listeners.add(fn);
  fn(session);
  return () => listeners.delete(fn);
}
const emit = () => listeners.forEach((fn) => fn(session));

/* ------------------------------------------------------------- helpers */
export async function hashPassword(username, password) {
  const data = new TextEncoder().encode(`${username}:${password}`);
  if (window.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // fallback (very old browsers): simple FNV hash — still never sends plaintext
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < data.length; i++) {
    h1 = Math.imul(h1 ^ data[i], 2654435761);
    h2 = Math.imul(h2 ^ data[i], 1597334677);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

const normUser = (u) => String(u || '').trim().toLowerCase();
export const isValidUser = (u) => /^[a-z0-9_]{3,16}$/.test(normUser(u));
export const isValidPass = (p) => typeof p === 'string' && p.length >= 4;

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_DB) || '{}'); } catch (e) { return {}; }
}
function saveLocal(db) {
  try { localStorage.setItem(LOCAL_DB, JSON.stringify(db)); } catch (e) { /* ignore */ }
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.username) {
        session = s;
        return s;
      }
    }
  } catch (e) { /* ignore */ }
  session = null;
  return null;
}

export function saveSession(s) {
  session = s;
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch (e) { /* ignore */ }
  emit();
}

export const currentUser = () => session;
export const isAdmin = () => !!session && (session.username === ADMIN_NAME || session.is_vip === true);
export const isVipUser = () => !!session && (session.is_vip === true || session.username === ADMIN_NAME);

/* ------------------------------------------------------------- accounts */
async function fetchAccount(username) {
  const q = `select=*&username=eq.${encodeURIComponent(username)}&limit=1`;
  const res = await sbSelect('game_accounts', q);
  if (res.ok && Array.isArray(res.data) && res.data.length) {
    sbState.accountsTable = true;
    return { account: res.data[0], source: 'cloud' };
  }
  if (res.ok && Array.isArray(res.data) && !res.data.length) {
    sbState.accountsTable = true;
    return { account: null, source: 'cloud' };
  }
  return { account: null, source: 'local', error: res.error };
}

export async function signup(username, password) {
  const user = normUser(username);
  if (!isValidUser(user)) return { ok: false, error: '아이디는 영문/숫자 3~16자로 입력해 주세요.' };
  if (!isValidPass(password)) return { ok: false, error: '비밀번호는 4자 이상이어야 합니다.' };

  const found = await fetchAccount(user);
  if (found.account) return { ok: false, error: '이미 존재하는 아이디입니다. 로그인해 주세요.' };

  const local = loadLocal();
  if (local[user]) return { ok: false, error: '이미 존재하는 아이디입니다. 로그인해 주세요.' };

  const hash = await hashPassword(user, password);
  const row = {
    username: user,
    password_hash: hash,
    balance: 1000000,
    total_refilled: 0,
    daily_refills: { date: new Date().toISOString().slice(0, 10), count: 0 },
    is_vip: user === ADMIN_NAME,
    is_banned: false,
    ban_reason: null,
    updated_at: new Date().toISOString()
  };

  if (found.source === 'cloud') {
    const ins = await sbInsert('game_accounts', row);
    if (ins.ok) {
      sbState.accountsTable = true;
      wallet.adoptAccount({ balance: row.balance, total_refilled: 0, daily_refills: row.daily_refills, is_vip: row.is_vip });
      saveSession({ username: user, is_vip: !!row.is_vip, source: 'cloud', since: Date.now() });
      return { ok: true, account: row, source: 'cloud' };
    }
    // fall through to local registration
  }

  local[user] = { ...row };
  saveLocal(local);
  wallet.adoptAccount({ balance: row.balance, total_refilled: 0, daily_refills: row.daily_refills, is_vip: row.is_vip });
  saveSession({ username: user, is_vip: !!row.is_vip, source: 'local', since: Date.now() });
  return { ok: true, account: row, source: 'local' };
}

export async function login(username, password) {
  const user = normUser(username);
  if (!user || !password) return { ok: false, error: '아이디와 비밀번호를 입력해 주세요.' };
  const hash = await hashPassword(user, password);

  const found = await fetchAccount(user);
  let account = found.account;
  let source = found.source;

  if (!account) {
    const local = loadLocal();
    if (local[user]) {
      account = local[user];
      source = 'local';
    }
  }
  if (!account) return { ok: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' };
  if (account.password_hash !== hash) return { ok: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' };
  if (account.is_banned) {
    return { ok: false, banned: true, error: '이용이 정지된 계정입니다.', reason: account.ban_reason || '' };
  }

  // cloud values win; a brand-new local player keeps their local progress
  if (source === 'cloud' && typeof account.balance === 'number') {
    wallet.adoptAccount(account);
  } else {
    wallet.adoptAccount({
      balance: account.balance ?? wallet.balance,
      total_refilled: account.total_refilled ?? wallet.totalRefilled,
      daily_refills: account.daily_refills ?? null,
      is_vip: account.is_vip || user === ADMIN_NAME
    }, { keepBalance: true });
  }

  saveSession({
    username: user,
    is_vip: !!(account.is_vip || user === ADMIN_NAME),
    source,
    since: Date.now()
  });
  return { ok: true, account, source };
}

export function logout() {
  saveSession(null);
  wallet.setVip(false);
}

/* ---------------------------------------------------------------- ban */
export async function checkBan() {
  if (!session) return { ok: true };
  const found = await fetchAccount(session.username);
  if (found.account?.is_banned) {
    const reason = found.account.ban_reason || '';
    logout();
    return { ok: false, banned: true, reason };
  }
  if (found.account) {
    if (!!found.account.is_vip !== !!session.is_vip) {
      session.is_vip = !!found.account.is_vip;
      saveSession(session);
      wallet.setVip(session.is_vip);
    }
  }
  return { ok: true };
}

/* ------------------------------------------------------- cloud autosave */
export function queueSync() {
  if (!session) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { syncAccount(); }, SYNC_DEBOUNCE);
}

export async function syncAccount() {
  if (!session) return null;
  const payload = {
    balance: Math.round(wallet.balance),
    total_refilled: Math.round(wallet.totalRefilled),
    daily_refills: wallet.refillState,
    is_vip: isVipUser(),
    updated_at: new Date().toISOString()
  };
  const res = await sbPatch('game_accounts', `username=eq.${encodeURIComponent(session.username)}`, payload);
  lastSyncResult = { at: Date.now(), ok: res.ok, source: res.ok ? 'cloud' : 'local' };
  if (!res.ok) {
    const local = loadLocal();
    local[session.username] = { ...(local[session.username] || {}), ...payload, username: session.username };
    saveLocal(local);
  }
  return lastSyncResult;
}

export const lastSync = () => lastSyncResult;

/* ------------------------------------------------------ admin utilities */
export async function listAccounts() {
  const res = await sbSelect('game_accounts', 'select=username,balance,is_vip,is_banned,ban_reason,updated_at&order=updated_at.desc&limit=50');
  if (res.ok && Array.isArray(res.data)) return { ok: true, rows: res.data, source: 'cloud' };
  const local = loadLocal();
  const rows = Object.values(local).map((a) => ({
    username: a.username,
    balance: a.balance,
    is_vip: !!a.is_vip,
    is_banned: !!a.is_banned,
    ban_reason: a.ban_reason || null,
    updated_at: a.updated_at
  }));
  return { ok: true, rows, source: 'local' };
}

export async function setBan(username, banned, reason = null) {
  const user = normUser(username);
  if (!user) return { ok: false };
  if (user === ADMIN_NAME) return { ok: false, error: '관리자 계정은 정지할 수 없습니다.' };
  if (session?.username === user) return { ok: false, error: '자기 자신은 정지할 수 없습니다.' };

  const res = await sbPatch('game_accounts', `username=eq.${encodeURIComponent(user)}`, {
    is_banned: banned,
    ban_reason: banned ? (reason || '운영 정책 위반') : null,
    updated_at: new Date().toISOString()
  });
  const local = loadLocal();
  if (local[user]) {
    local[user].is_banned = banned;
    local[user].ban_reason = banned ? (reason || '운영 정책 위반') : null;
    saveLocal(local);
  }
  return { ok: res.ok || !!local[user], source: res.ok ? 'cloud' : 'local', error: res.ok ? null : res.error };
}
