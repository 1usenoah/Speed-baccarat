/* =========================================================================
   crazytime/game.js — CRAZY TIME live show, clock-synchronised.
   Wheel + top slot results come from the same deterministic engine as the
   baccarat rooms; the four bonus games are fully playable.
   ========================================================================= */
import { wallet, fmt, fmtShort, sleep } from '../core/store.js';
import { CrazyStudio } from './studio3d.js';
import { showRefill, createChipTray, renderZoneChips, toast, uiClick } from '../ui/shell.js';
import {
  roundPhase, crazySpin, ROUND, serverNow, recentCrazy, CT_WHEEL, CT_LABEL
} from '../services/syncEngine.js';
import {
  chipPlace, chipPickup, countdownTick, betsClosedChime, topSlotSpin, topSlotStop, topSlotWin,
  flapperClick, wheelRumble, winFanfare, loseThud, chipPayout, errorBuzz, coinFlipWhoosh,
  coinFlipLand, pachinkoPeg, pachinkoDrop, pachinkoLanded, cashHuntCannon, cashHuntReveal,
  bigWheelRumble, multiplierApply, hostVoiceCue
} from '../core/audio.js';

const RING_LEN = 2 * Math.PI * 52;
const BET_ZONES = ['n1', 'n2', 'n5', 'n10', 'cf', 'pa', 'ch', 'ct'];
const MULT = { n1: 1, n2: 2, n5: 5, n10: 10 };
const SLOT_LABELS = { n1: '1', n2: '2', n5: '5', n10: '10', cf: 'COIN FLIP', pa: 'PACHINKO', ch: 'CASH HUNT', ct: 'CRAZY TIME' };

export class CrazyTimeGame {
  constructor(shell) {
    this.shell = shell;
    this.phase = 'idle';
    this.roundIndex = null;
    this.bets = {};
    BET_ZONES.forEach((z) => { this.bets[z] = 0; });
    this.chips = {};
    BET_ZONES.forEach((z) => { this.chips[z] = []; });
    this.undoStack = [];
    this.lastBets = null;
    this.history = [];
    this.timeLeft = 0;
    this.totalBetValue = 0;
    this.pendingBonus = false;
    this.started = false;

    this.tray = createChipTray(document.getElementById('ctChipTray'), { initial: 25000 });
    this.zoneEls = {};
    document.querySelectorAll('#view-crazy .czone').forEach((z) => {
      this.zoneEls[z.dataset.zone] = z;
      z.addEventListener('click', () => this.placeBet(z.dataset.zone));
    });
    document.querySelectorAll('#view-crazy .ctrl-btns button').forEach((b) => {
      b.addEventListener('click', () => this.control(b.dataset.ctrl));
    });
    this.ring = document.getElementById('ctRingFg');
    this.ring.style.strokeDasharray = RING_LEN;
    this.timerNum = document.getElementById('ctTimerNum');
    this.banner = document.getElementById('ctBanner');
    this.reelA = document.querySelector('#reelA .reel-strip');
    this.reelB = document.querySelector('#reelB .reel-strip');
    this.buildReels();
  }

  buildReels() {
    const a = [], b = [];
    for (let i = 0; i < 10; i++) {
      BET_ZONES.forEach((z) => a.push(`<div class="reel-cell ${z.length === 2 ? 'bonus' : ''}">${SLOT_LABELS[z]}</div>`));
    }
    ['2x', '5x', '10x', '15x', '20x', '25x', '30x', '40x', '50x'].forEach((m) => {
      for (let i = 0; i < 6; i++) b.push(`<div class="reel-cell">${m}</div>`);
    });
    this.reelA.innerHTML = a.join('');
    this.reelB.innerHTML = b.join('');
    this.reelA.style.transition = 'none';
    this.reelB.style.transition = 'none';
  }

  start() {
    if (this.started) return;
    this.started = true;
    const canvas = document.getElementById('ctCanvas');
    this.studio = new CrazyStudio(canvas);
    this.studio.onPeg = (power) => flapperClick(power, power > 0.7);
    this.tickTimer = setInterval(() => this.tick(), 100);
    this.tick();
  }

  /* ================================================================ tick */
  tick() {
    this.tickCount = (this.tickCount || 0) + 1;
    try {
      if (this.pendingBonus) return;
      const info = roundPhase('crazy', 'crazy');
      if (info.index !== this.roundIndex) this.enterRound(info.index);
      this.timeLeft = info.timeLeft;
      this.paintTimer();
      if (info.phase !== 'betting' && !this.spinning && !this.settled && this.phase === 'betting') this.closeBets(info);
      if (info.phase === 'result' && !this.settled && !this.spinning) this.finishRound();
    } catch (e) {
      window.__lastErr = String(e && e.stack || e);
      console.error('[crazy tick]', e);
    }
  }

  paintTimer() {
    const s = Math.max(0, this.timeLeft / 1000);
    this.timerNum.textContent = String(Math.ceil(s));
    this.ring.style.strokeDashoffset = RING_LEN * (1 - s / (ROUND.crazy.betMs / 1000));
    const el = document.getElementById('ctTimer');
    el.classList.toggle('urgent', s <= 3 && s > 0);
    if (this.phase === 'betting' && s <= 3 && Math.ceil(s) !== this.lastTick && s > 0) {
      this.lastTick = Math.ceil(s);
      countdownTick(1 - s / 3);
    }
  }

  enterRound(idx) {
    this.roundIndex = idx;
    this.settled = false;
    this.spinData = crazySpin(idx);
    this.phase = 'betting';
    this.lastTick = -1;
    this.shell.setBadge('PLACE YOUR BETS', '');
    document.getElementById('ctTimer').classList.remove('hidden', 'urgent');
    this.banner.classList.remove('show');
    Object.values(this.zoneEls).forEach((z) => z.classList.remove('winner'));
    this.renderHistory(idx);
    if (wallet.balance < 1000 && !this.refillShown) {
      this.refillShown = true;
      showRefill(() => { this.refillShown = false; });
    }
  }

  renderHistory(idx) {
    const recent = recentCrazy(10, idx);
    const host = document.getElementById('ctHistory');
    if (!host) return;
    host.innerHTML = recent.reverse().map((r) => {
      const isBonus = r.segment.length === 2;
      return `<div class="ct-hist-dot ${isBonus ? 'bonus' : ''}">${isBonus ? r.label.split(' ')[0].slice(0, 2) : r.label}</div>`;
    }).join('');
  }

  /* ============================================================= betting */
  get totalBet() { return BET_ZONES.reduce((a, z) => a + this.bets[z], 0); }

  canBet() { return this.phase === 'betting' && this.timeLeft > 250; }

  placeBet(zone) {
    if (!this.canBet()) { errorBuzz(); toast('베팅이 마감되었습니다'); return; }
    const amount = this.tray.value;
    if (!wallet.canAfford(amount)) { errorBuzz(); toast('잔액이 부족합니다'); showRefill(() => {}); return; }
    wallet.debit(amount);
    this.bets[zone] += amount;
    this.chips[zone].push(amount);
    this.undoStack.push({ zone, amount });
    chipPlace(amount);
    this.paintBets();
    const el = this.zoneEls[zone];
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  paintBets() {
    let total = 0;
    BET_ZONES.forEach((z) => {
      total += this.bets[z];
      renderZoneChips(document.querySelector(`#view-crazy [data-chips="${z}"]`), this.chips[z], this.bets[z]);
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
      BET_ZONES.forEach((z) => { this.bets[z] = 0; this.chips[z] = []; });
      this.undoStack = [];
      chipPickup();
      this.paintBets();
    }
    if (cmd === 'double') {
      const add = this.totalBet;
      if (!add || !wallet.canAfford(add)) { toast('잔액이 부족합니다'); errorBuzz(); return; }
      wallet.debit(add);
      BET_ZONES.forEach((z) => {
        if (this.bets[z]) { this.bets[z] *= 2; this.chips[z].push(this.bets[z] / 2); }
      });
      chipPlace(add);
      this.paintBets();
    }
    if (cmd === 'repeat') {
      if (!this.lastBets) { toast('반복할 이전 베팅이 없습니다'); return; }
      const need = Object.values(this.lastBets).reduce((a, b) => a + b, 0);
      if (!wallet.canAfford(need)) { toast('잔액이 부족합니다'); errorBuzz(); return; }
      wallet.credit(this.totalBet);
      BET_ZONES.forEach((z) => { this.bets[z] = this.lastBets[z] || 0; this.chips[z] = this.bets[z] ? [this.bets[z]] : []; });
      wallet.debit(need);
      chipPlace(need);
      this.paintBets();
    }
  }

  /* =============================================================== spin */
  async closeBets(info) {
    this.phase = 'closed';
    this.lastBets = { ...this.bets };
    this.shell.setBadge('NO MORE BETS', 'closed');
    document.getElementById('ctTimer').classList.add('hidden');
    betsClosedChime();
    this.startSpin();
  }

  async startSpin() {
    if (this.spinning) return;
    this.spinning = true;
    this.phase = 'dealing';
    this.shell.setBadge('SPINNING', 'dealing');
    const d = this.spinData;

    // 3D top slot above the wheel: both drums spin and settle on the round's
    // deterministic pair (left reel = bet spot, right reel = multiplier).
    this.studio?.spinTopSlot(SLOT_LABELS[d.topSlotA], d.topSlotB);
    this.studio?.markSlotWin(d.topSlotWin);
    topSlotSpin();
    setTimeout(() => topSlotStop(0), 1250);
    setTimeout(() => {
      topSlotStop(1);
      if (d.topSlotWin) {
        topSlotWin();
        this.banner.textContent = `TOP SLOT MATCH · ${d.topSlotB}x`;
        this.banner.classList.add('show');
      }
    }, 1950);

    wheelRumble(true);
    this.studio?.pullWheel();
    await sleep(420);
    await this.studio.spinTo(d.stop, { duration: ROUND.crazy.spinMs - 900 });
    wheelRumble(false);
    this.spinning = false;
    this.shell.setBadge(`RESULT · ${d.label}`, '');
  }

  async finishRound() {
    if (this.settled) return;
    this.settled = true;
    this.phase = 'result';
    const d = this.spinData;
    const bet = this.bets[d.segment] || 0;
    const topMult = d.topSlotWin ? d.topSlotB : 1;
    let payout = 0;
    let bonusMult = null;

    if (d.segment.length === 2) {
      // bonus round
      if (bet > 0) {
        this.pendingBonus = true;
        bonusMult = await this.runBonus(d.segment, bet, d);
        this.pendingBonus = false;
        payout = Math.floor(bet * bonusMult);
      } else {
        toast(`${d.label} 보너스 · 베팅 없음`);
      }
    } else {
      payout = Math.floor(bet * (MULT[d.segment] || 0) * (bet > 0 ? topMult : 1));
    }

    if (payout > 0) wallet.credit(payout);
    const net = payout - this.totalBet;

    this.zoneEls[d.segment]?.classList.add('winner');
    this.banner.textContent = payout > 0
      ? `${d.label} · WIN +${fmt(payout)}${topMult > 1 && MULT[d.segment] ? ` (TOP SLOT ${topMult}x)` : ''}`
      : `${d.label}${bonusMult ? ` · ${bonusMult}x` : ''}`;
    this.banner.classList.add('show');

    if (payout > 0) {
      this.shell.setBadge(`WIN +${fmt(payout)}`, 'win');
      winFanfare('tie');
      setTimeout(() => chipPayout(Math.min(24, payout / 50000)), 150);
      this.studio?.celebrate();
    } else if (this.totalBet > 0) {
      this.shell.setBadge('NO WIN', 'lose');
      loseThud();
    }

    wallet.pushHistory('crazy', {
      result: d.segment, label: d.label, mult: bonusMult, ts: Date.now(), roundIndex: this.roundIndex
    });
    this.history.push({ result: d.segment });
    this.bets = {};
    BET_ZONES.forEach((z) => { this.bets[z] = 0; this.chips[z] = []; });
    this.paintBets();
    this.renderHistory(this.roundIndex + 1);
  }

  /* ============================================================= bonuses */
  overlay(title) {
    const el = document.createElement('div');
    el.className = 'bonus-overlay';
    el.innerHTML = `
      <div class="bonus-head"><h3>${title}</h3><div class="bmult" id="bonusMult">× ?</div></div>
      <div class="bonus-stage" id="bonusStage"></div>
      <div class="bonus-foot" id="bonusFoot"></div>`;
    document.getElementById('ctStage').appendChild(el);
    this.bonusEl = el;
    return el;
  }

  closeOverlay() {
    this.bonusEl?.remove();
    this.bonusEl = null;
  }

  setFoot(html) {
    const f = this.bonusEl?.querySelector('#bonusFoot');
    if (f) f.innerHTML = html;
  }

  async runBonus(segment, bet, d) {
    hostVoiceCue();
    this.shell.setBadge(`BONUS · ${CT_LABEL[segment]}`, 'win');
    await sleep(500);
    const rnd = d.bonusRnd;
    let mult = 1;
    if (segment === 'cf') mult = await this.bonusCoinFlip(rnd, bet);
    if (segment === 'pa') mult = await this.bonusPachinko(rnd, bet);
    if (segment === 'ch') mult = await this.bonusCashHunt(rnd, bet);
    if (segment === 'ct') mult = await this.bonusCrazyTime(rnd, bet);
    this.closeOverlay();
    return mult;
  }

  pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  /* ---- COIN FLIP ---- */
  async bonusCoinFlip(rnd, bet) {
    const red = this.pick([2, 2, 3, 5, 10, 20, 50]);
    const blue = this.pick([2, 2, 3, 5, 10, 20, 50]);
    const el = this.overlay('COIN FLIP');
    el.querySelector('#bonusStage').innerHTML = `
      <div class="coin-wrap"><div class="coin" id="coin">
        <div class="face red">×${red}</div><div class="face blue">×${blue}</div>
      </div></div>
      <div class="mult-pill" style="left:22%;top:24%">RED ×${red}</div>
      <div class="mult-pill" style="right:22%;top:24%">BLUE ×${blue}</div>`;
    this.setFoot('빨강 / 파랑 중 하나를 선택하세요');
    const choice = await new Promise((resolve) => {
      const stage = el.querySelector('#bonusStage');
      const mk = (color) => {
        const b = document.createElement('button');
        b.className = 'bonus-btn';
        b.textContent = color === 'red' ? 'RED 선택' : 'BLUE 선택';
        b.onclick = () => resolve(color);
        return b;
      };
      const redBtn = mk('red');
      const blueBtn = mk('blue');
      redBtn.style.background = 'linear-gradient(180deg,#ff8a9b,#a3132c)';
      redBtn.style.color = '#fff';
      blueBtn.style.background = 'linear-gradient(180deg,#8ab6ff,#12328f)';
      blueBtn.style.color = '#fff';
      this.setFoot('');
      el.querySelector('#bonusFoot').append(redBtn, blueBtn);
    });
    const win = Math.random() < 0.5 ? 'red' : 'blue';
    const coin = el.querySelector('#coin');
    coinFlipWhoosh();
    const spins = 8 + Math.floor(Math.random() * 4);
    const deg = spins * 360 + (win === 'blue' ? 180 : 0);
    coin.style.transition = 'transform 3.2s cubic-bezier(.2,.6,.2,1)';
    coin.style.transform = `rotateY(${deg}deg)`;
    await sleep(3400);
    const mult = win === 'red' ? red : blue;
    coinFlipLand(mult >= 10);
    el.querySelector('#bonusMult').textContent = `× ${mult}`;
    this.setFoot(`<b style="color:${win === 'red' ? '#ff8a9b' : '#8ab6ff'}">${win.toUpperCase()}</b> · ×${mult} · WIN ${fmt(bet * mult)}`);
    await sleep(2200);
    return mult;
  }

  /* ---- PACHINKO ---- */
  async bonusPachinko(rnd, bet) {
    const el = this.overlay('PACHINKO');
    const stage = el.querySelector('#bonusStage');
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    stage.appendChild(canvas);
    this.setFoot('퍽이 떨어집니다…');
    const mult = await this.runPachinko(canvas);
    el.querySelector('#bonusMult').textContent = `× ${mult}`;
    pachinkoLanded(mult);
    this.setFoot(`×${mult} · WIN ${fmt(bet * mult)}`);
    await sleep(2000);
    return mult;
  }

  runPachinko(canvas) {
    return new Promise((resolve) => {
      const ctx = canvas.getContext('2d');
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      const W = rect.width || 600;
      const H = rect.height || 400;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.scale(dpr, dpr);

      const bins = [50, 20, 10, 5, 2, 'D', 2, 5, 10, 20, 50];
      const binW = W / bins.length;
      const pegs = [];
      const cols = 9;
      const rows = 7;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = (c + 0.5) * (W / cols) + (r % 2 ? binW * 0.18 : 0) - binW * 0.09;
          const y = 60 + r * ((H - 130) / rows);
          pegs.push({ x, y, r: 4 });
        }
      }
      let puck = { x: W / 2, y: 18, vx: 0, vy: 0, r: 9 };
      let drops = 0;
      let landed = null;
      let last = performance.now();
      pachinkoDrop();

      const roundRect = (x, y, w, h, r) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
      };

      const step = (now) => {
        const dt = Math.min(0.033, (now - last) / 1000);
        last = now;
        ctx.clearRect(0, 0, W, H);

        // board
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#2a0b3a');
        g.addColorStop(1, '#12031a');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);

        // pegs
        pegs.forEach((p) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fillStyle = '#c9a3ff';
          ctx.shadowColor = '#8a5cff';
          ctx.shadowBlur = 8;
          ctx.fill();
          ctx.shadowBlur = 0;
        });

        // bins
        bins.forEach((b, i) => {
          const x = i * binW;
          const isD = b === 'D';
          ctx.fillStyle = isD ? '#ffd76a' : b >= 20 ? '#ff3d6e' : b >= 10 ? '#a35cc0' : '#3a1750';
          roundRect(x + 3, H - 58, binW - 6, 50, 6);
          ctx.fill();
          ctx.fillStyle = isD ? '#2a1002' : '#fff';
          ctx.font = `700 ${Math.min(18, binW * 0.42)}px Arial`;
          ctx.textAlign = 'center';
          ctx.fillText(isD ? 'DOUBLE' : `×${b}`, x + binW / 2, H - 26);
        });

        if (puck) {
          puck.vy += 620 * dt;
          puck.vx += Math.sin(now / 220 + drops) * 26 * dt;
          puck.x += puck.vx * dt;
          puck.y += puck.vy * dt;
          // pegs
          pegs.forEach((p) => {
            const dx = puck.x - p.x;
            const dy = puck.y - p.y;
            const dist = Math.hypot(dx, dy);
            const min = puck.r + p.r;
            if (dist < min && dist > 0.01) {
              const nx = dx / dist;
              const ny = dy / dist;
              const overlap = min - dist;
              puck.x += nx * overlap;
              puck.y += ny * overlap;
              const dot = puck.vx * nx + puck.vy * ny;
              puck.vx = (puck.vx - 2 * dot * nx) * 0.72 + nx * 40;
              puck.vy = (puck.vy - 2 * dot * ny) * 0.72;
              if (Math.abs(dot) > 60) pachinkoPeg(Math.min(1, Math.abs(dot) / 500));
            }
          });
          // walls
          if (puck.x < puck.r) { puck.x = puck.r; puck.vx = Math.abs(puck.vx) * 0.6; }
          if (puck.x > W - puck.r) { puck.x = W - puck.r; puck.vx = -Math.abs(puck.vx) * 0.6; }

          // draw puck
          ctx.beginPath();
          ctx.arc(puck.x, puck.y, puck.r, 0, Math.PI * 2);
          const pg = ctx.createRadialGradient(puck.x - 3, puck.y - 3, 1, puck.x, puck.y, puck.r);
          pg.addColorStop(0, '#fff6c9');
          pg.addColorStop(1, '#ff9f1c');
          ctx.fillStyle = pg;
          ctx.shadowColor = '#ffd76a';
          ctx.shadowBlur = 18;
          ctx.fill();
          ctx.shadowBlur = 0;

          if (puck.y > H - 62) {
            const idx = Math.max(0, Math.min(bins.length - 1, Math.floor(puck.x / binW)));
            const b = bins[idx];
            if (b === 'D' && drops < 3) {
              ctx.fillStyle = 'rgba(255,215,106,0.85)';
              ctx.fillRect(idx * binW + 3, H - 58, binW - 6, 50);
              drops += 1;
              multiplierApply(2);
              puck = { x: W / 2, y: 10, vx: 0, vy: 0, r: 9 };
              pachinkoDrop();
            } else {
              landed = b === 'D' ? 2 : b;
            }
          }
        }

        if (landed != null && puck) {
          puck = null;
          ctx.beginPath();
          ctx.arc(W / 2, H / 2, 40, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fill();
          ctx.fillStyle = '#ffe9b5';
          ctx.font = '800 34px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(`×${landed}`, W / 2, H / 2 + 12);
          setTimeout(() => resolve(landed), 900);
          return;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  /* ---- CASH HUNT ---- */
  async bonusCashHunt(rnd, bet) {
    const el = this.overlay('CASH HUNT');
    const stage = el.querySelector('#bonusStage');
    const table = [1, 1, 2, 2, 3, 5, 5, 10, 10, 20, 20, 25, 50, 50, 100, 250];
    const values = [];
    for (let i = 0; i < 108; i++) values.push(table[Math.floor(Math.random() * table.length)]);
    const grid = document.createElement('div');
    grid.className = 'ch-targets';
    values.forEach((v, i) => {
      const cell = document.createElement('div');
      cell.className = 'ch-cell';
      cell.dataset.i = i;
      cell.textContent = '?';
      cell.addEventListener('click', () => pick(i), { once: true });
      grid.appendChild(cell);
    });
    stage.appendChild(grid);
    this.setFoot('과녁 108개 중 하나를 선택하세요 (8초)');

    let timer = null;
    const choice = await new Promise((resolve) => {
      const pick = (i) => {
        clearTimeout(timer);
        resolve(i);
      };
      timer = setTimeout(() => resolve(Math.floor(Math.random() * values.length)), 8000);
      grid.addEventListener('click', (e) => {
        const c = e.target.closest('.ch-cell');
        if (c) pick(Number(c.dataset.i));
      });
    });

    // scramble the board for a moment, then reveal
    const cells = Array.from(grid.children);
    for (let k = 0; k < 14; k++) {
      cells.forEach((c) => {
        c.textContent = ['?', '×', '◆', '●'][Math.floor(Math.random() * 4)];
        c.style.opacity = 0.35 + Math.random() * 0.5;
      });
      await sleep(55);
    }
    cashHuntCannon();
    cells.forEach((c, i) => {
      c.style.opacity = 1;
      c.textContent = i === choice ? `×${values[i]}` : '·';
      c.classList.toggle('dead', i !== choice);
    });
    const target = cells[choice];
    target.classList.add('picked', 'revealed');
    const mult = values[choice];
    el.querySelector('#bonusMult').textContent = `× ${mult}`;
    cashHuntReveal(mult);
    this.setFoot(`×${mult} · WIN ${fmt(bet * mult)}`);
    await sleep(2200);
    return mult;
  }

  /* ---- CRAZY TIME ---- */
  async bonusCrazyTime(rnd, bet) {
    const el = this.overlay('CRAZY TIME');
    const stage = el.querySelector('#bonusStage');
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    stage.appendChild(canvas);
    let stake = bet;
    let boost = 1;
    let total = 0;

    const SEG = 64;
    const segType = (i) => {
      const v = i % 16;
      if (v === 0) return 'DOUBLE';
      if (v === 8) return 'TRIPLE';
      if (v === 4) return 50;
      if (v === 12) return 20;
      return [2, 3, 5, 10][i % 4];
    };
    const colors = ['#22a06b', '#2f6fd0', '#e8b53c'];
    this.setFoot('플래퍼(초록/파랑/노랑)를 선택하세요');
    const chosen = await new Promise((resolve) => {
      this.setFoot('');
      colors.forEach((c, i) => {
        const b = document.createElement('button');
        b.className = 'bonus-btn';
        b.textContent = ['GREEN', 'BLUE', 'YELLOW'][i];
        b.style.background = `linear-gradient(180deg,${c},${c}bb)`;
        b.style.color = '#fff';
        b.onclick = () => resolve(i);
        el.querySelector('#bonusFoot').appendChild(b);
      });
    });

    const spin = () => new Promise((resolve) => {
      const ctx = canvas.getContext('2d');
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = canvas.getBoundingClientRect();
      const W = r.width || 600;
      const H = r.height || 400;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.scale(dpr, dpr);
      const cx = W / 2;
      const cy = H / 2 + 10;
      const R = Math.min(W, H) * 0.36;
      const seg = (Math.PI * 2) / SEG;
      const stop = Math.floor(Math.random() * SEG);
      const targetRot = -(stop + 0.5) * seg + Math.PI * 2 * 4;
      const t0 = performance.now();
      const dur = 5200;
      bigWheelRumble(true);
      const draw = (rot) => {
        ctx.clearRect(0, 0, W, H);
        for (let i = 0; i < SEG; i++) {
          const a0 = i * seg + rot;
          const t = segType(i);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, R, a0, a0 + seg);
          ctx.closePath();
          ctx.fillStyle = t === 'DOUBLE' ? '#ffd76a' : t === 'TRIPLE' ? '#ff5d7a' : t >= 20 ? '#c93b5b' : t >= 10 ? '#8452c8' : t >= 5 ? '#2f6fd0' : '#1f8f5b';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,240,210,0.25)';
          ctx.stroke();
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(a0 + seg / 2);
          ctx.fillStyle = '#fff';
          ctx.font = `${Math.max(8, R * 0.085)}px Arial`;
          ctx.textAlign = 'right';
          ctx.fillText(t === 'DOUBLE' ? '2x' : t === 'TRIPLE' ? '3x' : `×${t}`, R - 8, 4);
          ctx.restore();
        }
        // flappers
        colors.forEach((c, i) => {
          const a = -Math.PI / 2 + (i - 1) * 0.28;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(a);
          ctx.fillStyle = i === chosen ? c : 'rgba(255,255,255,0.18)';
          ctx.beginPath();
          ctx.moveTo(0, -R - 16);
          ctx.lineTo(10, -R + 2);
          ctx.lineTo(-10, -R + 2);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        });
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.16, 0, Math.PI * 2);
        ctx.fillStyle = '#1a0a12';
        ctx.fill();
      };
      const step = (now) => {
        const t = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - t, 3);
        const rot = targetRot * e;
        draw(rot);
        if (Math.random() > 0.7) flapperClick(1 - t, t > 0.85);
        if (t < 1) requestAnimationFrame(step);
        else {
          bigWheelRumble(false);
          resolve(segType(stop));
        }
      };
      requestAnimationFrame(step);
    });

    let result = await spin();
    while (result === 'DOUBLE' || result === 'TRIPLE') {
      const f = result === 'DOUBLE' ? 2 : 3;
      boost *= f;
      stake *= f;
      multiplierApply(f);
      this.setFoot(`${result}! 베팅 ${fmt(stake)} 로 증폭 · 재회전`);
      await sleep(1400);
      result = await spin();
    }
    const mult = boost * result;
    total = Math.floor(stake * result);
    el.querySelector('#bonusMult').textContent = `× ${mult}`;
    this.setFoot(`×${result} · BET ${fmt(stake)} · WIN ${fmt(total)}`);
    await sleep(2400);
    // payout handles the boost already applied to the stake
    return mult;
  }
}
