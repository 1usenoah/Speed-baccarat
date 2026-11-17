/* =========================================================================
   ui/authUI.js — mandatory sign-in gate, account chip in the top bar,
   and the operator panel (ban / unban) for VIP-admins.
   ========================================================================= */
import { wallet, fmt } from '../core/store.js';
import { showModal, closeModal, toast, uiClick } from './shell.js';
import {
  signup, login, logout, loadSession, onAuthChange, currentUser, isAdmin,
  listAccounts, setBan, syncAccount
} from '../services/auth.js';
import { sbState } from '../services/supabase.js';

let gateOpen = false;

const modeBadge = () => (sbState.online === false
  ? '<span class="conn local">LOCAL</span>'
  : '<span class="conn live">LIVE</span>');

function authForm(mode = 'login') {
  return `
    <div class="auth-wrap">
      <div class="auth-brand">
        <span class="auth-mark">◆</span>
        <div><b>EVOLAB</b><i>LIVE CASINO</i></div>
        ${modeBadge()}
      </div>
      <div class="auth-tabs">
        <button data-mode="login" class="${mode === 'login' ? 'on' : ''}">로그인</button>
        <button data-mode="signup" class="${mode === 'signup' ? 'on' : ''}">회원가입</button>
      </div>
      <form class="auth-form" id="authForm">
        <label>아이디<input id="authUser" autocomplete="username" placeholder="영문/숫자 3~16자" spellcheck="false" /></label>
        <label>비밀번호<input id="authPass" type="password" autocomplete="current-password" placeholder="4자 이상" /></label>
        ${mode === 'signup' ? '<label>비밀번호 확인<input id="authPass2" type="password" placeholder="다시 입력" /></label>' : ''}
        <div class="auth-err" id="authErr"></div>
        <button class="auth-submit" type="submit">${mode === 'signup' ? '가입하고 시작하기' : '로그인'}</button>
      </form>
      <p class="auth-note">
        무료 가상 칩 전용 시뮬레이터입니다. 실제 금액의 입출금은 없습니다.<br />
        가입 시 <b>1,000,000</b> 크레딧이 지급되며 두 게임이 공유합니다.
      </p>
      <p class="auth-note dim">계정 데이터는 Supabase에 안전하게 저장되며, 비밀번호는 SHA-256으로 해시되어 전송됩니다.</p>
    </div>`;
}

export function showGate({ force = false } = {}) {
  if (gateOpen && !force) return;
  gateOpen = true;
  const wrap = showModal({ title: 'SIGN IN', body: authForm('login'), className: 'auth-modal' });
  const modal = wrap.querySelector('.modal');
  modal.classList.add('auth-modal-inner');
  wrap.querySelector('.modal-close').style.display = 'none';
  const bind = (mode) => {
    wrap.querySelector('.modal-body').innerHTML = authForm(mode);
    wire(mode);
  };
  const wire = (mode) => {
    wrap.querySelectorAll('.auth-tabs button').forEach((b) =>
      b.addEventListener('click', () => { uiClick(); bind(b.dataset.mode); })
    );
    const form = wrap.querySelector('#authForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const user = wrap.querySelector('#authUser').value;
      const pass = wrap.querySelector('#authPass').value;
      const err = wrap.querySelector('#authErr');
      const btn = wrap.querySelector('.auth-submit');
      if (mode === 'signup') {
        const p2 = wrap.querySelector('#authPass2').value;
        if (pass !== p2) { err.textContent = '비밀번호가 일치하지 않습니다.'; return; }
      }
      btn.disabled = true;
      btn.textContent = '처리 중…';
      const res = mode === 'signup' ? await signup(user, pass) : await login(user, pass);
      btn.disabled = false;
      btn.textContent = mode === 'signup' ? '가입하고 시작하기' : '로그인';
      if (!res.ok) {
        err.textContent = res.error || '로그인에 실패했습니다.';
        return;
      }
      gateOpen = false;
      closeModal();
      toast(`${currentUser().username} 님 환영합니다`);
      onSignedIn?.();
    });
  };
  wire('login');
}

let onSignedIn = null;
export function setOnSignedIn(fn) { onSignedIn = fn; }

/* ------------------------------------------------------------- top bar */
export function mountAccount(onChange) {
  const host = document.getElementById('accountHost');
  const paint = () => {
    const u = currentUser();
    if (!host) return;
    if (!u) {
      host.innerHTML = '<button class="account-btn" id="loginBtn" type="button">로그인 / 가입</button>';
      host.querySelector('#loginBtn').addEventListener('click', () => { uiClick(); showGate(); });
    } else {
      host.innerHTML = `
        <button class="account-btn on" id="accBtn" type="button" title="계정">
          <span class="acc-dot" style="--tone:${u.is_vip ? '#f0c05a' : '#3ddc84'}"></span>
          <b>${u.username}</b>${u.is_vip ? '<i class="vip-tag">VIP</i>' : ''}
        </button>
        <button class="account-out" id="logoutBtn" type="button" title="로그아웃">⏻</button>`;
      host.querySelector('#accBtn').addEventListener('click', () => { uiClick(); showAccountSheet(); });
      host.querySelector('#logoutBtn').addEventListener('click', () => {
        uiClick();
        syncAccount();
        logout();
        toast('로그아웃되었습니다');
        showGate({ force: true });
      });
    }
    onChange?.(u);
  };
  onAuthChange(paint);
  paint();
  return { paint };
}

export function showAccountSheet() {
  const u = currentUser();
  if (!u) { showGate(); return; }
  showModal({
    title: 'MY ACCOUNT',
    body: `
      <div class="refill-status"><span>아이디</span><b>${u.username}</b></div>
      <div class="refill-status"><span>상태</span><b>${u.is_vip ? 'VIP · 무제한 충전' : '일반 회원'}</b></div>
      <div class="refill-status"><span>잔액</span><b>${fmt(wallet.balance)}</b></div>
      <div class="refill-status"><span>동기화</span><b>${sbState.online === false ? 'LOCAL (기기 저장)' : 'CLOUD'}</b></div>
      <p class="muted" style="margin-top:10px">잔액·충전 횟수·VIP 여부는 라운드마다 자동으로 서버에 저장됩니다.</p>
      ${isAdmin() ? '<button class="admin-open" id="adminOpen" type="button">회원 관리 (Admin)</button>' : ''}`,
    onMount(wrap) {
      wrap.querySelector('#adminOpen')?.addEventListener('click', () => { uiClick(); showAdmin(); });
    }
  });
}

/* ---------------------------------------------------------- admin panel */
export async function showAdmin() {
  const body = `
    <div class="admin-head">
      <span>Supabase · game_accounts</span>
      <b id="adminConn">${sbState.online === false ? 'LOCAL' : 'LIVE'}</b>
    </div>
    <div id="adminList" class="admin-list"><div class="muted">불러오는 중…</div></div>
    <p class="muted" style="margin-top:10px">정지된 계정은 로그인·동기화 시 즉시 차단되며 사유가 표시됩니다.</p>`;
  const wrap = showModal({ title: 'MEMBER ADMIN', body });
  const list = wrap.querySelector('#adminList');

  const render = async () => {
    const res = await listAccounts();
    wrap.querySelector('#adminConn').textContent = res.source === 'cloud' ? 'LIVE' : 'LOCAL';
    if (!res.rows.length) {
      list.innerHTML = '<div class="muted">계정이 없습니다.</div>';
      return;
    }
    list.innerHTML = res.rows.map((r) => `
      <div class="admin-row">
        <span class="ar-name">${r.username}${r.is_vip ? ' <i class="vip-tag">VIP</i>' : ''}</span>
        <span class="ar-bal">${fmt(r.balance || 0)}</span>
        <span class="ar-state ${r.is_banned ? 'banned' : 'ok'}">${r.is_banned ? '정지' : '정상'}</span>
        <button class="ar-btn ${r.is_banned ? 'unban' : 'ban'}" data-user="${r.username}" data-ban="${r.is_banned ? '0' : '1'}"
          ${r.username === 'noah2026' ? 'disabled title="관리자 계정은 정지할 수 없습니다"' : ''}>
          ${r.is_banned ? '해제' : '정지'}
        </button>
      </div>`).join('');
    list.querySelectorAll('.ar-btn').forEach((b) => {
      b.addEventListener('click', async () => {
        const banned = b.dataset.ban === '1';
        const res2 = await setBan(b.dataset.user, banned);
        if (!res2.ok) { toast(res2.error || '변경 실패'); return; }
        toast(`${b.dataset.user} ${banned ? '정지' : '정지 해제'} 완료`);
        render();
      });
    });
  };
  render();
}
