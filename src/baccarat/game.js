/* =========================================================================
   baccarat/game.js — clock-synchronised live table.
   The round, the hand, the dealer on duty and the roadmap are all derived
   from (tableId, roundIndex); the UI simply replays that round as the global
   clock advances. Baccarat rooms are entered from the lobby.
   ========================================================================= */
import { wallet, fmt, fmtShort, sleep } from '../core/store.js';
import { settle } from './engine.js';
import { BaccaratTable } from './table3d.js';
import { renderAll } from './roadmap.js';
import { createChipTray, renderZoneChips, toast, showRefill, uiClick } from '../ui/shell.js';
import { DEALERS, TABLES, tableById } from '../data/cast.js';
import {
  roundPhase, baccaratHand, dealerFor, recentBaccarat, ROUND, serverNow, roundIndexFor
} from '../services/syncEngine.js';
import {
  chipPlace, chipPickup, countdownTick, betsClosedChime, cardSlideFromShoe,
  cardLand, cardFlip, cardSweep, winFanfare, loseThud, chipPayout, errorBuzz, hostVoiceCue
} from '../core/audio.js';

const RING_LEN = 2 * Math.PI * 52;

export class BaccaratGame {
  constructor(shell) {
    this.shell = shell;
    this.tableId = null;
    this.table = null;
    this.phase = 'lobby';
    this.roundIndex = null;
    this.hand = null;
    this.settled = false;
    this.dealerId = null;
    this.bets = { P: 0, B: 0, T: 0, PP: 0, BP: 0 };
    this.chips = { P: [], B: [], T: [], PP: [], BP: [] };
    this.undoStack = [];
    this.lastBets = null;
    this.history = [];
    this.timeLeft = 0;
    this.lastTick = -1;
    this.refillShown = false;
    this.totalBetValue = 0;
    this.dealing = false;

    this.tray = createChipTray(document.getElementById('chipTray'), { initial: 25000 });
    this.zones = {};
    document.querySelectorAll('#view-baccarat .zone[data-zone]').forEach((z) => {
      this.zones[z.dataset.zone] = z;
      z.addEventListener('click', () => this.placeBet(z.dataset.zone));
    });
    document.querySelectorAll('#view-baccarat .ctrl-btns button').forEach((b) => {
      b.addEventListener('click', () => this.control(b.dataset.ctrl));
    });

    this.hosts = {
      bead: document.getElementById('rmBead'),
      big: document.getElementById('rmBig'),
      beb: document.getElementById('rmBeb'),
      sr: document.getElementById('rmSr'),
      cp: document.getElementById('rmCp'),
      stats: document.getElementById('rmStats'),
      predict: document.getElementById('rmPredict')
    };
    this.timerNum = document.getElementById('timerNum');
    this.timerLabel = document.getElementById('timerLabel');
    this.ring = document.getElementById('ringFg');
    this.timerEl = document.getElementById('bacTimer');
    this.banner = document.getElementById('resultBanner');
    this.ring.style.strokeDasharray = RING_LEN;

    this.buildLobby();
    this.showLobby();
    this.shell.setTotalBet(0);
    this.tickTimer = setInterval(() => this.tick(), 100);
  }

  /* ================================================================ lobby */
  buildLobby() {
    const host = document.getElementById('bacLobby');
    if (host) return;
    const el = document.createElement('div');
    el.id = 'bacLobby';
    el.className = 'lobby';
    el.innerHTML = `
      <div class="lobby-head">
        <div>
          <h2>LIVE TABLES</h2>
          <p>같은 시각, 같은 테이블은 모든 플레이어에게 동일하게 송출됩니다.</p>
        </div>
        <div class="lobby-clock"><i></i><b id="lobbyClock">--:--:--</b><span>SYNCED</span></div>
      </div>
      <div class="lobby-grid" id="lobbyGrid"></div>
      <div class="lobby-foot">
        <span>· 8덱 슈 · 3rd CARD RULE · 20초 라운드</span>
        <span>· 딜러 로테이션 8~15판</span>
      </div>`;
    document.querySelector('.bac-layout').appendChild(el);
    el.addEventListener('click', (e) => {
      const card = e.target.closest('[data-table]');
      if (card) this.enterTable(card.dataset.table);
    });
  }

  showLobby() {
    this.phase = 'lobby';
    this.tableId = null;
    document.getElementById('bacLobby')?.classList.add('show');
    document.querySelector('.bac-layout')?.classList.add('in-lobby');
    this.shell.setBadge('SELECT A TABLE', '');
    this.renderLobby();
  }

  renderLobby() {
    const grid = document.getElementById('lobbyGrid');
    if (!grid) return;
    const clock = document.getElementById('lobbyClock');
    if (clock) {
      const d = new Date(serverNow());
      clock.textContent = d.toISOString().slice(11, 19);
    }
    const sig = TABLES.map((t) => roundPhase('baccarat', t.id).index).join('|');
    if (sig === this._lobbySig) return;
    this._lobbySig = sig;
    grid.innerHTML = TABLES.map((t) => {
      const info = roundPhase('baccarat', t.id);
      const recent = recentBaccarat(t.id, 18, info.index);
      const dealer = dealerFor(t.dealers, info.index, t.rotation);
      const onDuty = DEALERS[dealer];
      const shiftNo = Math.floor(info.index / t.rotation);
      const until = t.rotation - (info.index % t.rotation);
      const dots = recent.slice(-18).map((r) => `<i class="mini-dot ${r.result}"></i>`).join('');
      const phaseTxt = info.phase === 'betting' ? `BETTING ${Math.ceil(info.timeLeft / 1000)}s`
        : info.phase === 'dealing' ? 'DEALING' : 'RESULT';
      return `
      <button class="lobby-card" data-table="${t.id}" style="--accent:${t.accent}">
        <div class="lc-top">
          <span class="lc-name">${t.name}</span>
          <span class="lc-phase ${info.phase}">${phaseTxt}</span>
        </div>
        <div class="lc-seat">${t.seat}</div>
        <div class="lc-dealer">
          <span class="lc-avatar" style="--tone:${onDuty.tone}">${onDuty.name.slice(0, 1)}</span>
          <span class="lc-dinfo">
            <b>${onDuty.name}</b>
            <i>Shift ${(info.index % t.rotation) + 1}/${t.rotation} · next in ${until}</i>
          </span>
        </div>
        <div class="lc-road">${dots || '<span class="muted">no history</span>'}</div>
        <div class="lc-bottom">
          <span class="lc-limits">${t.limits}</span>
          <span class="lc-enter">ENTER →</span>
        </div>
      </button>`;
    }).join('');
  }

  enterTable(id) {
    const cfg = tableById(id);
    if (!cfg) return;
    this.tableId = id;
    this.cfg = cfg;
    document.getElementById('bacLobby')?.classList.remove('show');
    document.querySelector('.bac-layout')?.classList.remove('in-lobby');
    if (!this.table) {
      const profile = DEALERS[dealerFor(cfg.dealers, roundIndexFor('baccarat', id), cfg.rotation)];
      this.table = new BaccaratTable(document.getElementById('bacCanvas'), { profile, tableCfg: cfg });
      this.dealerId = profile.id;
    } else {
      this.table.onResize();
    }
    this.roundIndex = null;
    this.phase = 'betting';
    this.history = [];
    this.bets = { P: 0, B: 0, T: 0, PP: 0, BP: 0 };
    this.chips = { P: [], B: [], T: [], PP: [], BP: [] };
    this.paintBets();
    toast(`${cfg.name} 입장 · ${cfg.limits}`);
    uiClick();
  }

  leaveTable() {
    this.showLobby();
  }

  /* ================================================================= tick */
  tick() {
    try {
      if (this.phase === 'lobby' || !this.tableId) {
        if (this.phase === 'lobby' && Math.floor(serverNow() / 1000) % 2 === 0) this.renderLobby();
        return;
      }
      const info = roundPhase('baccarat', this.tableId);
      if (info.index !== this.roundIndex) this.enterRound(info.index);
      this.timeLeft = info.timeLeft;
      this.paintTimer();

      if (info.phase !== 'betting' && this.phase === 'betting') this.closeBets();
      if (info.phase === 'result' && !this.settled && !this.dealing) this.finishRound();
    } catch (e) {
      window.__lastErr = String((e && e.stack) || e);
      console.error('[tick]', e);
    }
  }

  paintTimer() {
    if (!this.timerNum) return;
    const s = Math.max(0, this.timeLeft / 1000);
    this.timerNum.textContent = String(Math.ceil(s));
    this.ring.style.strokeDashoffset = RING_LEN * (1 - s / (ROUND.baccarat.betMs / 1000));
    this.timerEl.classList.toggle('urgent', s <= 3 && s > 0);
    if (this.phase === 'betting') {
      const sec = Math.ceil(s);
      if (sec <= 3 && sec !== this.lastTick && sec > 0) {
        this.lastTick = sec;
        countdownTick(1 - s / 3);
      }
    }
  }

  enterRound(idx) {
    this.roundIndex = idx;
    this.settled = false;
    this.dealing = false;
    this.hand = baccaratHand(this.tableId, idx);
    this.lastTick = -1;
    this.dealt = { P: [], B: [] };

    // dealer rotation, derived from the round index
    const onDutyId = dealerFor(this.cfg.dealers, idx, this.cfg.rotation);
    const onDuty = DEALERS[onDutyId] || DEALERS.sofia;
    if (onDuty.id !== this.dealerId) {
      const first = this.dealerId == null;
      this.dealerId = onDuty.id;
      if (!first) {
        this.table?.setDealer(onDuty);
        this.showRotation(onDuty);
      }
    }
    const shift = (idx % this.cfg.rotation) + 1;
    const plate = document.querySelector('.dealer-plate span');
    if (plate) plate.textContent = `${onDuty.name}`;
    const pl = document.querySelector('.dealer-plate');
    if (pl) pl.title = `Dealer: ${onDuty.name} · Shift ${shift}/${this.cfg.rotation}`;

    this.phase = 'betting';
    this.shell.setBadge('PLACE YOUR BETS', '');
    this.timerEl.classList.remove('hidden', 'urgent');
    this.banner.classList.remove('show');
    Object.values(this.zones).forEach((z) => z.classList.remove('winner'));
    if (this.table) {
      this.table.clearTable();
      this.table.setPhase('betting');
    }
    this.clearCardFeed();
    this.history = recentBaccarat(this.tableId, 60, idx);
    renderAll(this.hosts, this.history);
    this.updateDistribution();
    if (wallet.balance < this.cfg.min && !this.refillShown) {
      this.refillShown = true;
      showRefill(() => { this.refillShown = false; });
    }
  }

  showRotation(profile) {
    this.banner.textContent = `DEALER ROTATION · ${profile.name}`;
    this.banner.style.color = '#ffe6a8';
    this.banner.classList.add('show');
    hostVoiceCue();
    setTimeout(() => this.banner.classList.remove('show'), 2600);
  }

  updateDistribution() {
    const t = 0.03 + Math.random() * 0.12;
    const rest = 1 - t;
    const b = rest * (0.44 + Math.random() * 0.26);
    const p = rest - b;
    const dist = { P: p, B: b, T: t };
    ['P', 'T', 'B'].forEach((k) => {
      const bar = document.querySelector(`[data-dist="${k}"]`);
      const lbl = document.querySelector(`[data-distn="${k}"]`);
      if (bar) bar.style.width = `${Math.round(dist[k] * 100)}%`;
      if (lbl) lbl.textContent = `${Math.round(dist[k] * 100)}%`;
    });
  }

  /* ============================================================== betting */
  get totalBet() {
    return Object.values(this.bets).reduce((a, b) => a + b, 0);
  }

  canBet() {
    return this.phase === 'betting' && this.timeLeft > 250 && !!this.tableId;
  }

  placeBet(zone) {
    if (!this.canBet()) {
      errorBuzz();
      toast('베팅이 마감되었습니다');
      return;
    }
    const amount = this.tray.value;
    if (amount < this.cfg.min && this.totalBet === 0) {
      toast(`최소 베팅 ${fmt(this.cfg.min)}`);
      errorBuzz();
      return;
    }
    if (!wallet.canAfford(amount)) {
      errorBuzz();
      toast('잔액이 부족합니다 · 충전하세요');
      showRefill(() => {});
      return;
    }
    wallet.debit(amount);
    this.bets[zone] += amount;
    this.chips[zone].push(amount);
    this.undoStack.push({ zone, amount });
    chipPlace(amount);
    this.paintBets();
    const z = this.zones[zone];
    z.classList.remove('flash');
    void z.offsetWidth;
    z.classList.add('flash');
  }

  paintBets() {
    let total = 0;
    Object.keys(this.bets).forEach((zone) => {
      total += this.bets[zone];
      renderZoneChips(document.querySelector(`[data-chips="${zone}"]`), this.chips[zone], this.bets[zone]);
    });
    this.totalBetValue = total;
    this.shell.setTotalBet(total);
  }

  control(cmd) {
    uiClick();
    if (!this.canBet()) return;
    if (cmd === 'undo') {
      const last = this.undoStack.pop();
      if (!last) return;
      this.bets[last.zone] = Math.max(0, this.bets[last.zone] - last.amount);
      this.chips[last.zone].pop();
      wallet.credit(last.amount);
      chipPickup();
      this.paintBets();
    }
    if (cmd === 'clear') {
      const refund = this.totalBet;
      if (!refund) return;
      wallet.credit(refund);
      this.bets = { P: 0, B: 0, T: 0, PP: 0, BP: 0 };
      this.chips = { P: [], B: [], T: [], PP: [], BP: [] };
      this.undoStack = [];
      chipPickup();
      this.paintBets();
    }
    if (cmd === 'repeat') {
      if (!this.lastBets) { toast('반복할 이전 베팅이 없습니다'); return; }
      const need = Object.values(this.lastBets).reduce((a, b) => a + b, 0);
      if (this.totalBet === 0 && !wallet.canAfford(need)) { toast('잔액이 부족합니다'); errorBuzz(); return; }
      wallet.credit(this.totalBet);
      this.bets = { ...this.lastBets };
      this.chips = { P: [], B: [], T: [], PP: [], BP: [] };
      Object.entries(this.bets).forEach(([z, v]) => { if (v) this.chips[z].push(v); });
      wallet.debit(need);
      chipPlace(need);
      this.paintBets();
    }
    if (cmd === 'double') {
      const add = this.totalBet;
      if (!add) return;
      if (!wallet.canAfford(add)) { toast('2배 베팅에 필요한 잔액이 부족합니다'); errorBuzz(); return; }
      wallet.debit(add);
      Object.keys(this.bets).forEach((z) => {
        if (this.bets[z]) {
          this.bets[z] *= 2;
          this.chips[z].push(this.bets[z] / 2);
        }
      });
      chipPlace(add);
      this.paintBets();
    }
  }

  /* ============================================================ dealing */
  closeBets() {
    this.phase = 'closed';
    this.lastBets = { ...this.bets };
    this.undoStack = [];
    this.shell.setBadge('BETS CLOSED', 'closed');
    this.timerEl.classList.add('hidden');
    betsClosedChime();
    this.table?.setPhase('closed');
    this.startDealing();
  }

  async startDealing() {
    if (this.dealing || !this.hand) return;
    this.dealing = true;
    this.phase = 'dealing';
    this.shell.setBadge('DEALING', 'dealing');
    const steps = this.hand.steps;
    const windowSec = ROUND.baccarat.dealMs / 1000;
    const speed = Math.max(1.0, (steps.length * 1.15) / windowSec);
    for (const step of steps) {
      if (!this.tableId) return;
      this.table?.focusSlot(step.side, step.index);
      cardSlideFromShoe();
      await this.table.dealCard(step.side, step.index, step.card, { speed });
      this.dealt[step.side].push(step.card);
      this.updateScore();
      this.pushCardFeed(step.side, step.card);
      cardFlip();
      setTimeout(cardLand, 30);
    }
    this.dealing = false;
    // wait for the result window before settling (keeps every client aligned)
    const waitMs = ROUND.baccarat.betMs + ROUND.baccarat.dealMs - (serverNow() % ROUND.baccarat.ms);
    if (waitMs > 0 && waitMs < 4000) await sleep(waitMs);
  }

  pushCardFeed(side, card) {
    const row = document.querySelector(`#cardFeed .cf-row[data-feed="${side}"]`);
    if (!row) return;
    const suit = { S: '♠', H: '♥', D: '♦', C: '♣' }[card.suit] || '';
    const red = card.suit === 'H' || card.suit === 'D';
    const el = document.createElement('div');
    el.className = 'pcard' + (red ? ' red' : '');
    el.innerHTML = `<i>${card.rank}</i><em>${suit}</em>`;
    row.querySelector('.cf-cards').appendChild(el);
  }

  clearCardFeed() {
    document.querySelectorAll('#cardFeed .cf-cards').forEach((c) => { c.innerHTML = ''; });
    document.querySelectorAll('#cardFeed .cf-total').forEach((c) => { c.textContent = '-'; });
  }

  updateScore() {
    const p = this.dealt.P.length ? this.dealt.P.reduce((a, c) => a + valueOf(c), 0) % 10 : null;
    const b = this.dealt.B.length ? this.dealt.B.reduce((a, c) => a + valueOf(c), 0) % 10 : null;
    const q = (s) => document.querySelector(`#stageScore ${s} b`);
    if (q('.player')) q('.player').textContent = p == null ? '-' : p;
    if (q('.banker')) q('.banker').textContent = b == null ? '-' : b;
    if (q('.tie')) q('.tie').textContent = this.dealt.P.length >= 2 ? '·' : '-';
    const fp = document.querySelector('#cardFeed .cf-row[data-feed="P"] .cf-total');
    const fb = document.querySelector('#cardFeed .cf-row[data-feed="B"] .cf-total');
    if (fp) fp.textContent = p == null ? '-' : p;
    if (fb) fb.textContent = b == null ? '-' : b;
  }

  async finishRound() {
    if (this.settled) return;
    this.settled = true;
    this.phase = 'result';

    // if the player joined mid-round, lay the cards instantly
    if (this.table && this.table.cards.length < this.hand.steps.length) {
      await this.fastDeal();
    }

    const res = settle(this.bets, this.hand);
    if (res.totalReturn > 0) wallet.credit(res.totalReturn);

    const entry = {
      result: this.hand.result,
      playerTotal: this.hand.playerTotal,
      bankerTotal: this.hand.bankerTotal,
      playerPair: this.hand.playerPair,
      bankerPair: this.hand.bankerPair,
      ts: Date.now()
    };
    wallet.pushHistory('baccarat', entry);
    this.history = recentBaccarat(this.tableId, 60, this.roundIndex + 1);
    renderAll(this.hosts, this.history);

    const label = this.hand.result === 'P' ? 'PLAYER WINS' : this.hand.result === 'B' ? 'BANKER WINS' : 'TIE';
    this.banner.textContent = `${label} · P ${this.hand.playerTotal} : B ${this.hand.bankerTotal}`;
    this.banner.style.color = this.hand.result === 'P' ? '#8fc0ff' : this.hand.result === 'B' ? '#ff9aa4' : '#7df0b6';
    this.banner.classList.add('show');

    const winners = [];
    if (this.hand.result === 'P') winners.push('P');
    if (this.hand.result === 'B') winners.push('B');
    if (this.hand.result === 'T') winners.push('T');
    if (this.hand.playerPair) winners.push('PP');
    if (this.hand.bankerPair) winners.push('BP');
    winners.forEach((w) => this.zones[w]?.classList.add('winner'));

    if (res.net > 0) {
      this.shell.setBadge(`WIN +${fmt(res.net)}`, 'win');
      winFanfare(this.hand.result === 'P' ? 'player' : this.hand.result === 'B' ? 'banker' : 'tie');
      setTimeout(() => chipPayout(Math.min(24, res.net / 50000)), 180);
      this.table?.celebrate();
    } else if (res.totalStake > 0) {
      this.shell.setBadge('NO WIN', 'lose');
      loseThud();
    } else {
      this.shell.setBadge(label, '');
    }

    this.bets = { P: 0, B: 0, T: 0, PP: 0, BP: 0 };
    this.chips = { P: [], B: [], T: [], PP: [], BP: [] };
    this.paintBets();
    setTimeout(() => {
      if (this.table && this.phase !== 'lobby') {
        cardSweep();
        this.table.sweep({ speed: 2 }).then(() => this.table?.clearTable());
      }
    }, 1400);
  }

  async fastDeal() {
    if (!this.table) return;
    this.table.clearTable();
    for (const step of this.hand.steps) {
      await this.table.dealCard(step.side, step.index, step.card, { speed: 6 });
      this.dealt[step.side].push(step.card);
      this.updateScore();
      this.pushCardFeed(step.side, step.card);
    }
  }

  destroy() {
    clearInterval(this.tickTimer);
    if (this.table) this.table.running = false;
  }
}

function valueOf(card) {
  const r = card.rank;
  if (r === 'A') return 1;
  if (r === '10' || r === 'J' || r === 'Q' || r === 'K') return 0;
  return Number(r);
}
