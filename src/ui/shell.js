/* =========================================================================
   ui/shell.js — top bar, toasts, modals (rules / refill / ranking / bonus
   hand-off), sound + fullscreen, and the shared chip tray component.
   ========================================================================= */
import { wallet, fmt, fmtShort } from '../core/store.js';
import { initAudio, toggleMute, isMuted, uiClick, chipPlace, errorBuzz, startAmbience } from '../core/audio.js';
import { getLeaderboard, submitScore } from '../services/ranking.js';

export { uiClick, initAudio, startAmbience, toggleMute } from '../core/audio.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function toast(msg, ms = 2200) {
  const root = document.getElementById('toastRoot');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.remove(), ms + 400);
}

/* ------------------------------------------------------------------ modal */
let openModal = null;

export function closeModal() {
  const root = document.getElementById('modalRoot');
  root.innerHTML = '';
  openModal = null;
}

export function showModal({ title, body, className = '', onMount }) {
  closeModal();
  const root = document.getElementById('modalRoot');
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal ${className}" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${title}</h3><button class="modal-close" type="button" aria-label="닫기">✕</button></div>
      <div class="modal-body">${body}</div>
    </div>`;
  root.appendChild(wrap);
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap) closeModal();
  });
  wrap.querySelector('.modal-close').addEventListener('click', closeModal);
  openModal = wrap;
  if (onMount) onMount(wrap, closeModal);
  return wrap;
}

/* ----------------------------------------------------------------- rules */
export function showRules(game = 'baccarat') {
  const bac = `
    <h4>SPEED BACCARAT</h4>
    <ul>
      <li>8덱 슈, 카드는 <b>PLAYER → BANKER</b> 순서로 2장씩 페이스업으로 배분됩니다.</li>
      <li>합계는 10의 자리를 버린 끝수(0~9)이며, 8·9 내추럴이면 즉시 승부가 납니다.</li>
      <li>플레이어 0~5에서 3번째 카드를 받고, 뱅커는 공식 3rd-card 룰에 따라 받습니다.</li>
      <li>배당 — PLAYER 1:1 · BANKER 0.95:1(5% 커미션) · TIE 8:1 · P PAIR / B PAIR 11:1.</li>
      <li>베팅 마감 10초 전 카운트다운이 종료되면 카드 딜링이 시작됩니다.</li>
    </ul>
    <h4>조작</h4>
    <ul>
      <li>칩을 고른 뒤 베팅 영역을 눌러 배치합니다. 같은 영역을 다시 누르면 누적됩니다.</li>
      <li><b>UNDO</b> 마지막 칩 취소 · <b>REPEAT</b> 직전 라운드 재베팅 · <b>2X DOUBLE</b> 전체 2배 · <b>CLEAR</b> 전체 취소.</li>
    </ul>`;
  const crazy = `
    <h4>CRAZY TIME</h4>
    <ul>
      <li>54칸 대형 휠 + 상단 <b>TOP SLOT</b> 2릴. 휠과 슬롯이 함께 회전합니다.</li>
      <li>숫자 <b>1 · 2 · 5 · 10</b> 은 각각 1:1 / 2:1 / 5:1 / 10:1 로 지급됩니다.</li>
      <li><b>COIN FLIP · PACHINKO · CASH HUNT · CRAZY TIME</b> 보너스에 베팅하면 해당 미니게임에 참여합니다.</li>
      <li>TOP SLOT 좌측 릴이 휠 결과와 일치하면 우측 릴의 배수(2x~50x)가 추가로 적용됩니다.</li>
      <li>보너스에서 <b>DOUBLE / TRIPLE</b>이 나오면 베팅액이 2배·3배로 증폭된 뒤 다시 진행됩니다.</li>
    </ul>`;
  showModal({
    title: game === 'crazy' ? 'CRAZY TIME · RULES' : 'SPEED BACCARAT · RULES',
    body: (game === 'crazy' ? crazy : bac) + `
      <h4>가상 칩 안내</h4>
      <p class="muted">본 게임은 <b>무료 가상 칩 전용 시뮬레이터</b>입니다. 실제 금액의 입출금이 없으며, 모든 결과는 오락 목적입니다.
      잔액은 브라우저에 자동 저장되고 두 게임이 공유합니다.</p>`
  });
}

/* ---------------------------------------------------------------- refill */
export function showRefill(onDone) {
  const vip = wallet.isVip;
  const left = wallet.refillsLeft;
  const disabled = !vip && left <= 0;
  const body = `
    <div class="refill-status">
      <span>오늘 남은 횟수</span>
      <b>${vip ? '∞ UNLIMITED' : `${left} / 10회`}</b>
    </div>
    <div class="refill-status">
      <span>현재 잔액</span>
      <b>${fmt(wallet.balance)}</b>
    </div>
    ${vip ? '<div style="margin:8px 0 2px"><span class="vip-badge">VIP · 무제한 충전</span></div>' : ''}
    <div class="refill-options">
      <button class="refill-opt" data-amt="1000000" ${disabled ? 'disabled' : ''}>
        <b>+1,000,000</b><span>무료 충전 · 1회</span>
      </button>
      ${vip ? `<button class="refill-opt" data-amt="10000000"><b>+10,000,000</b><span>VIP 전용 즉시 충전</span></button>` : ''}
    </div>
    <p class="muted" style="margin-top:10px">
      ${disabled ? '오늘 충전 한도(10/10회)를 모두 사용했습니다. 내일 00:00에 다시 충전할 수 있습니다.'
      : '충전된 무료 크레딧은 랭킹(최고 잔고) 집계에서 제외됩니다.'}
    </p>
    <div class="vip-row">
      <input id="vipInput" placeholder="VIP 코드" autocomplete="off" spellcheck="false" />
      <button id="vipApply" type="button">확인</button>
    </div>`;
  showModal({
    title: 'FREE CHIP REFILL',
    body,
    onMount(wrap, close) {
      wrap.querySelectorAll('.refill-opt').forEach((b) => {
        b.addEventListener('click', () => {
          const amt = Number(b.dataset.amt);
          const res = wallet.refill(amt);
          if (res.ok) {
            chipPlace(res.amount);
            toast(`+${fmt(res.amount)} 크레딧 충전`);
            close();
            if (onDone) onDone(res);
          } else {
            errorBuzz();
            toast(res.reason === 'daily_limit' ? '오늘 충전 한도를 모두 사용했습니다' : '충전할 수 없습니다');
          }
        });
      });
      const apply = wrap.querySelector('#vipApply');
      const input = wrap.querySelector('#vipInput');
      const go = () => {
        if (wallet.enableVip(input.value)) {
          toast('VIP 모드가 활성화되었습니다');
          close();
          showRefill(onDone);
        } else {
          errorBuzz();
          input.value = '';
          input.placeholder = '유효하지 않은 코드';
        }
      };
      apply.addEventListener('click', go);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    }
  });
}

/* --------------------------------------------------------------- ranking */
export async function showRanking(period = 'daily') {
  let current = period;

  const wrap = showModal({ title: '🏆 LEADERBOARD', body: '<div class="muted">불러오는 중…</div>', className: 'rank-modal' });
  const bodyEl = wrap.querySelector('.modal-body');

  const render = async () => {
    const board = await getLeaderboard(current);
    const rows = board.rows.map((r) => `
      <div class="rank-row ${r.you ? 'me' : ''} ${r.rank <= 3 ? 'top' + r.rank : ''}">
        <span class="rk">${r.rank}</span>
        <span class="nm">${r.you ? (r.name || 'YOU') + ' · 나' : r.name}</span>
        <span class="sc">${fmt(r.score)}</span>
      </div>`).join('');
    const live = board.mode === 'live';
    bodyEl.innerHTML = `
      <div class="rank-tabs">
        <button data-p="daily" class="${current === 'daily' ? 'on' : ''}">일간</button>
        <button data-p="weekly" class="${current === 'weekly' ? 'on' : ''}">주간</button>
        <button data-p="monthly" class="${current === 'monthly' ? 'on' : ''}">월간</button>
        <span class="conn ${live ? 'live' : 'local'}" title="${live ? 'Supabase 연동' : '로컬 저장소'}" style="align-self:center;margin-left:4px">${live ? 'LIVE' : 'LOCAL'}</span>
      </div>
      <div class="rank-note">🏆 <b>무료 충전 크레딧 제외 · 순수 게임 수익 기준</b><br />
        ${board.periodLabel} · 최고 잔고(Peak) 로 집계됩니다. 충전으로 늘어난 금액은 순위에 반영되지 않습니다.</div>
      <div class="rank-list">${rows}</div>
      <div class="rank-you">
        <span>내 순위 <b>${board.you ? board.you.rank : '-'}위</b></span>
        <span>최고 잔고 <b>${fmt(board.you ? board.you.score : 0)}</b></span>
      </div>
      <div class="nick-row">
        <input id="nickInput" maxlength="14" value="${wallet.nickname}" placeholder="닉네임" />
        <button id="nickSave" type="button">저장</button>
      </div>`;
    bodyEl.querySelectorAll('.rank-tabs button').forEach((b) => {
      b.addEventListener('click', async () => {
        current = b.dataset.p;
        uiClick();
        const st = wrap.querySelector('.modal').scrollTop;
        await render();
        wrap.querySelector('.modal').scrollTop = st;
      });
    });
    bodyEl.querySelector('#nickSave').addEventListener('click', async () => {
      const v = wallet.setNickname(bodyEl.querySelector('#nickInput').value);
      toast(v ? `닉네임이 "${v}"(으)로 저장되었습니다` : '닉네임을 입력해 주세요');
      const st = wrap.querySelector('.modal').scrollTop;
      await render();
      wrap.querySelector('.modal').scrollTop = st;
    });
  };
  await render();
}

/* ------------------------------------------------------------ top bar UI */
export function mountShell({ onGameChange, currentGame } = {}) {
  const balEl = document.getElementById('balance');
  const betEl = document.getElementById('totalBet');
  const badge = document.getElementById('statusBadge');

  const paint = () => {
    balEl.textContent = fmt(wallet.balance);
    balEl.style.color = wallet.balance < 1000 ? '#ff8b9b' : '';
  };
  wallet.subscribe(paint);

  document.getElementById('refillBtn').addEventListener('click', () => {
    initAudio();
    uiClick();
    showRefill();
  });

  document.getElementById('soundBtn').addEventListener('click', (e) => {
    initAudio();
    const m = toggleMute();
    e.currentTarget.classList.toggle('muted', m);
    if (!m) startAmbience(currentGame === 'crazy' ? 'crazy' : 'baccarat');
    toast(m ? '사운드 끔' : '사운드 켬', 1200);
  });
  document.getElementById('soundBtn').classList.toggle('muted', isMuted());

  document.getElementById('rulesBtn').addEventListener('click', () => { uiClick(); showRules(currentGame); });
  document.getElementById('rankBtn').addEventListener('click', async () => {
    uiClick();
    await submitScore('daily');
    showRanking('daily');
  });
  document.getElementById('fullBtn').addEventListener('click', () => {
    uiClick();
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el);
    } else {
      document.exitFullscreen?.();
    }
  });

  document.getElementById('gameSwitch').addEventListener('click', (e) => {
    const btn = e.target.closest('.gs');
    if (!btn) return;
    onGameChange?.(btn.dataset.game);
  });

  return {
    setBalance(v) { paint(v); },
    setTotalBet(v) { betEl.textContent = fmt(v); },
    setBadge(text, cls = '') {
      badge.textContent = text;
      badge.className = 'badge ' + cls;
      document.querySelectorAll('.stage-badge').forEach((b) => {
        b.textContent = text;
        b.className = 'stage-badge ' + cls;
      });
    },
    highlightGame(game) {
      document.querySelectorAll('.gs').forEach((b) => b.classList.toggle('is-active', b.dataset.game === game));
      document.querySelectorAll('.view').forEach((v) => v.classList.toggle('is-active', v.id === `view-${game}`));
    }
  };
}

/* ------------------------------------------------------- chip tray module */
export const CHIPS = [
  { v: 1000, cls: 'c1k', label: '1K' },
  { v: 5000, cls: 'c5k', label: '5K' },
  { v: 25000, cls: 'c25k', label: '25K' },
  { v: 100000, cls: 'c100k', label: '100K' },
  { v: 500000, cls: 'c500k', label: '500K' }
];

export function createChipTray(host, { initial = 25000, onSelect } = {}) {
  let selected = initial;
  host.innerHTML = '';
  CHIPS.forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `chip ${c.cls}`;
    b.dataset.value = c.v;
    b.innerHTML = `<span>${c.label}</span>`;
    b.addEventListener('click', () => {
      selected = c.v;
      host.querySelectorAll('.chip').forEach((x) => x.classList.toggle('is-selected', Number(x.dataset.value) === selected));
      initAudio();
      uiClick();
      onSelect?.(selected);
    });
    host.appendChild(b);
  });
  const setSel = (v) => {
    selected = v;
    host.querySelectorAll('.chip').forEach((x) => x.classList.toggle('is-selected', Number(x.dataset.value) === selected));
  };
  setSel(initial);
  return {
    get value() { return selected; },
    set value(v) { setSel(v); }
  };
}

/** render the chips sitting inside a bet zone */
export function renderZoneChips(el, entries, total) {
  if (!el) return;
  el.innerHTML = '';
  if (!entries || !entries.length) return;
  const shown = entries.slice(-3);
  const col = document.createElement('div');
  col.className = 'stack-col';
  shown.forEach((e, i) => {
    const chip = document.createElement('div');
    const cls = CHIPS.find((c) => c.v === e)?.cls || 'c25k';
    chip.className = `bet-chip ${cls}`;
    const face = { c1k: '#e6e8e6', c5k: '#c93446', c25k: '#1f8a5b', c100k: '#1b2430', c500k: '#7b3fa0' }[cls];
    chip.style.setProperty('--face', face);
    if (cls === 'c1k') chip.style.color = '#12232f';
    chip.innerHTML = (i === shown.length - 1 && total ? '' : '') + `<span>${fmtShort(total)}</span>`;
    col.appendChild(chip);
  });
  el.appendChild(col);
}

export function escapeHtml(s) {
  return String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}
