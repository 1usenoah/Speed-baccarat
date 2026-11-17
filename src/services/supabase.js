/* =========================================================================
   services/supabase.js — tiny REST client (no SDK) with connection state.
   Every call is wrapped so a missing table, a bad key or being offline can
   never break the game: callers get { ok, data, error, offline }.
   ========================================================================= */

export const SUPABASE_URL = 'https://dhgfijnaxeiuiplqnriy.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_BwEaG0K2BNrNoEO_zjeNvg_5i2A2Gei';

export const sbState = {
  online: null, // null = unknown, true = reaching Supabase, false = local
  lastError: null,
  accountsTable: null, // null unknown, true present, false missing
  checkedAt: 0
};

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    'Content-Type': 'application/json',
    ...extra
  };
}

export async function sbRequest(path, { method = 'GET', body = null, prefer = null, timeout = 6000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: headers(prefer ? { Prefer: prefer } : {}),
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    if (res.ok) {
      sbState.online = true;
      sbState.lastError = null;
    } else {
      sbState.lastError = `${res.status} ${data?.message || ''}`.trim();
      if (res.status === 404 || data?.code === 'PGRST205') {
        sbState.accountsTable = false;
      }
      if (res.status === 401 || res.status === 403) sbState.online = false;
    }
    return { ok: res.ok, status: res.status, data, error: res.ok ? null : sbState.lastError };
  } catch (e) {
    sbState.online = false;
    sbState.lastError = e.name === 'AbortError' ? 'timeout' : 'offline';
    return { ok: false, status: 0, data: null, error: sbState.lastError, offline: true };
  } finally {
    clearTimeout(t);
  }
}

export const sbSelect = (table, query = 'select=*') => sbRequest(`${table}?${query}`);

export function sbInsert(table, rows, { returning = true } = {}) {
  const prefer = returning ? 'return=representation' : 'return=minimal';
  return sbRequest(table, { method: 'POST', body: Array.isArray(rows) ? rows : [rows], prefer });
}

export function sbPatch(table, query, body, { returning = true } = {}) {
  const prefer = returning ? 'return=representation' : 'return=minimal';
  return sbRequest(`${table}?${query}`, { method: 'PATCH', body, prefer });
}

/** upsert that does not depend on a unique constraint existing */
export async function sbUpsertBy(table, matchQuery, row) {
  const patch = await sbPatch(table, matchQuery, row);
  if (patch.ok && Array.isArray(patch.data) && patch.data.length) return { ...patch, mode: 'patch' };
  if (!patch.ok && patch.status !== 404) return patch;
  const ins = await sbInsert(table, row);
  return { ...ins, mode: 'insert' };
}

export const sbOnline = () => sbState.online !== false;
