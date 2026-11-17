/* =========================================================================
   audio.js — procedural Web Audio engine tuned to a live-casino studio.
   No external assets: every sound is synthesised (oscillators, filtered
   noise, FM bells, convolution-free reverb via feedback delay).
   ========================================================================= */

let ctx = null;
let master = null;
let sfxBus = null;
let ambBus = null;
let reverbSend = null;
let noiseBuf = null;
let muted = false;
let ambNodes = null;
const log = [];

export function isMuted() {
  return muted;
}

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();

  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 22;
  comp.ratio.value = 3.2;
  comp.attack.value = 0.004;
  comp.release.value = 0.22;
  master.connect(comp);
  comp.connect(ctx.destination);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.95;
  sfxBus.connect(master);

  ambBus = ctx.createGain();
  ambBus.gain.value = 0.0;
  ambBus.connect(master);

  // Small bright room: feedback-delay "reverb" (cheap but convincing on SFX)
  reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.5;
  const d1 = ctx.createDelay(0.5);
  d1.delayTime.value = 0.061;
  const d2 = ctx.createDelay(0.5);
  d2.delayTime.value = 0.113;
  const fb = ctx.createGain();
  fb.gain.value = 0.34;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3600;
  reverbSend.connect(d1);
  d1.connect(lp);
  lp.connect(d2);
  d2.connect(fb);
  fb.connect(d1);
  d2.connect(master);

  // reusable white-noise buffer
  const len = Math.floor(ctx.sampleRate * 2);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  return ctx;
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
  return muted;
}

export function toggleMute() {
  setMuted(!muted);
  return muted;
}

/* ---------------------------------------------------------------- helpers */
const now = () => (ctx ? ctx.currentTime : 0);

function gainNode(v = 1) {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

function noiseSource() {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  return s;
}

function env(g, t0, peak, attack, decay, sustain = 0, release = 0, hold = 0) {
  g.gain.cancelScheduledValues(t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
  if (hold > 0) g.gain.setValueAtTime(Math.max(peak, 0.0002), t0 + attack + hold);
  g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0002), t0 + attack + hold + decay);
  if (release > 0) g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + decay + release);
}

function osc(type, freq, t0, dur, peak = 0.2, glideTo = null, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  o.detune.value = detune;
  const g = gainNode(0);
  env(g, t0, peak, 0.004, dur * 0.9);
  o.connect(g);
  g.connect(sfxBus);
  const send = gainNode(0.16);
  g.connect(send);
  send.connect(reverbSend);
  o.start(t0);
  o.stop(t0 + dur + 0.12);
  return o;
}

function noiseBurst({ t0, dur = 0.06, peak = 0.3, type = 'bandpass', f0 = 2000, f1 = null, q = 1, rate = 1 }) {
  const src = noiseSource();
  src.playbackRate.value = rate;
  const filt = ctx.createBiquadFilter();
  filt.type = type;
  filt.frequency.setValueAtTime(f0, t0);
  if (f1) filt.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  filt.Q.value = q;
  const g = gainNode(0);
  env(g, t0, peak, 0.002, dur, 0, 0.02);
  src.connect(filt);
  filt.connect(g);
  g.connect(sfxBus);
  const send = gainNode(0.2);
  g.connect(send);
  send.connect(reverbSend);
  src.start(t0, Math.random());
  src.stop(t0 + dur + 0.05);
}

function bell(freq, t0, peak = 0.18, dur = 1.1, ratio = 2.76) {
  const car = ctx.createOscillator();
  car.type = 'sine';
  car.frequency.value = freq;
  const mod = ctx.createOscillator();
  mod.type = 'sine';
  mod.frequency.value = freq * ratio;
  const modGain = gainNode(freq * 1.6);
  const g = gainNode(0);
  env(g, t0, peak, 0.005, dur * 0.8);
  mod.connect(modGain);
  modGain.connect(car.frequency);
  car.connect(g);
  g.connect(sfxBus);
  const send = gainNode(0.35);
  g.connect(send);
  send.connect(reverbSend);
  car.start(t0);
  mod.start(t0);
  car.stop(t0 + dur);
  mod.stop(t0 + dur);
}

/* --------------------------------------------------------------- ambience */
export function startAmbience(kind = 'baccarat') {
  initAudio();
  if (!ctx || ambNodes) return;
  const src = noiseSource();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = kind === 'crazy' ? 520 : 380;
  lp.Q.value = 0.6;
  const g = gainNode(0);
  src.connect(lp);
  lp.connect(g);
  g.connect(ambBus);

  // slow breathing pad for the room "air"
  const pad = ctx.createOscillator();
  pad.type = 'sine';
  pad.frequency.value = kind === 'crazy' ? 110 : 82.5;
  const padG = gainNode(0.0);
  pad.connect(padG);
  padG.connect(ambBus);
  padG.gain.value = kind === 'crazy' ? 0.05 : 0.03;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoG = gainNode(0.02);
  lfo.connect(lfoG);
  lfoG.connect(padG.gain);

  src.start();
  pad.start();
  lfo.start();
  ambNodes = { src, pad, lfo, g, padG };
  g.gain.setTargetAtTime(kind === 'crazy' ? 0.05 : 0.035, now(), 1.2);
  ambBus.gain.setTargetAtTime(1, now(), 0.8);
}

export function setAmbienceLevel(v) {
  if (ambBus) ambBus.gain.setTargetAtTime(v, now(), 0.4);
}

/* ===================================================== SPEED BACCARAT SFX */

/** heavy clay chip settling on felt — the signature baccarat betting sound */
export function chipPlace(value = 1000) {
  if (!ctx) return;
  const t = now();
  const weight = Math.min(1, Math.log10(value + 10) / 6); // bigger chip = lower knock
  noiseBurst({ t0: t, dur: 0.045, peak: 0.16 + weight * 0.1, f0: 2600 - weight * 900, q: 1.6, rate: 1.4 });
  osc('triangle', 150 - weight * 48, t, 0.075, 0.2, 70);
  osc('sine', 640 - weight * 160, t + 0.004, 0.05, 0.07, 380);
  if (value >= 100000) noiseBurst({ t0: t + 0.03, dur: 0.05, peak: 0.1, f0: 1500, q: 2 });
}

export function chipPickup() {
  if (!ctx) return;
  const t = now();
  noiseBurst({ t0: t, dur: 0.035, peak: 0.08, f0: 3400, q: 2.4, rate: 1.7 });
  osc('sine', 900, t, 0.03, 0.045, 620);
}

export function chipStack(n = 6) {
  if (!ctx) return;
  const t = now();
  for (let i = 0; i < n; i++) {
    const tt = t + i * 0.045 + Math.random() * 0.02;
    noiseBurst({ t0: tt, dur: 0.03, peak: 0.07 + Math.random() * 0.04, f0: 2200 + Math.random() * 1400, q: 2 });
    osc('sine', 520 + Math.random() * 180, tt, 0.03, 0.035, 340);
  }
}

/** countdown tick, pitch rises as the clock runs out */
export function countdownTick(urgency = 0.5) {
  if (!ctx) return;
  const t = now();
  const f = 720 + urgency * 420;
  osc('sine', f, t, 0.06, 0.11, f * 0.985);
  noiseBurst({ t0: t, dur: 0.02, peak: 0.05, f0: 5200, q: 2 });
}

export function betsClosedChime() {
  if (!ctx) return;
  const t = now();
  bell(1046.5, t, 0.13, 1.0, 2.0);        // C6
  bell(1568.0, t + 0.1, 0.1, 1.2, 2.4);   // G6
  osc('sine', 392, t, 0.3, 0.05, 380);
}

export function cardSlideFromShoe() {
  if (!ctx) return;
  const t = now();
  noiseBurst({ t0: t, dur: 0.14, peak: 0.12, f0: 700, f1: 2600, q: 0.9, rate: 1.1 });
  noiseBurst({ t0: t + 0.02, dur: 0.09, peak: 0.06, f0: 3200, q: 1.4, rate: 1.3 });
}

export function cardLand() {
  if (!ctx) return;
  const t = now();
  // felt slap + stiff card snap
  noiseBurst({ t0: t, dur: 0.05, peak: 0.17, f0: 1100, f1: 420, q: 1.2, rate: 0.9 });
  noiseBurst({ t0: t + 0.002, dur: 0.03, peak: 0.1, f0: 4200, q: 2.2, rate: 1.6 });
  osc('triangle', 210, t, 0.06, 0.1, 120);
}

export function cardFlip() {
  if (!ctx) return;
  const t = now();
  noiseBurst({ t0: t, dur: 0.08, peak: 0.09, f0: 1800, f1: 5200, q: 1.1, rate: 1.5 });
}

export function cardSweep() {
  if (!ctx) return;
  const t = now();
  noiseBurst({ t0: t, dur: 0.34, peak: 0.12, f0: 400, f1: 2400, q: 0.8, rate: 0.85 });
  noiseBurst({ t0: t + 0.06, dur: 0.3, peak: 0.07, f0: 1200, f1: 3600, q: 1, rate: 1.2 });
}

export function shoeShuffle() {
  if (!ctx) return;
  const t = now();
  for (let i = 0; i < 18; i++) {
    noiseBurst({ t0: t + i * 0.035, dur: 0.04, peak: 0.05 + Math.random() * 0.04, f0: 1600 + Math.random() * 2600, q: 1.6, rate: 1.2 });
  }
  osc('sine', 90, t, 0.5, 0.05, 70);
}

/** Evolution-style win flourish: warm strings + bell sparkle arpeggio */
export function winFanfare(kind = 'player') {
  if (!ctx) return;
  const t = now();
  const root = kind === 'banker' ? 233.08 : 261.63; // Bb3 / C4
  const chord = kind === 'tie' ? [1, 1.25, 1.5, 2] : [1, 1.25, 1.5];
  // soft pad
  chord.forEach((r, i) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = root * r;
    o.detune.value = -6 + i * 5;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(700, t);
    f.frequency.linearRampToValueAtTime(2800, t + 0.5);
    f.frequency.linearRampToValueAtTime(900, t + 2.4);
    const g = gainNode(0);
    env(g, t, 0.045, 0.16, 0.9, 0.02, 1.4);
    o.connect(f); f.connect(g); g.connect(sfxBus);
    const send = gainNode(0.4); g.connect(send); send.connect(reverbSend);
    o.start(t); o.stop(t + 2.6);
  });
  // sparkle arpeggio
  [0, 4, 7, 12, 16].forEach((semi, i) => {
    const f = root * 2 * Math.pow(2, semi / 12);
    bell(f, t + 0.08 + i * 0.075, 0.055 + (i === 4 ? 0.03 : 0), 0.9, 2.2);
  });
  // low bloom
  osc('sine', root / 2, t, 1.2, 0.06, root / 2.02);
}

export function loseThud() {
  if (!ctx) return;
  const t = now();
  osc('sine', 120, t, 0.28, 0.1, 62);
  noiseBurst({ t0: t, dur: 0.16, peak: 0.05, f0: 600, f1: 180, q: 0.9 });
}

/** chip payout clatter, scaled with the amount won */
export function chipPayout(count = 8) {
  if (!ctx) return;
  const t = now();
  const n = Math.min(34, 6 + count * 2);
  for (let i = 0; i < n; i++) {
    const tt = t + i * (0.03 + Math.random() * 0.035);
    noiseBurst({ t0: tt, dur: 0.028, peak: 0.05 + Math.random() * 0.06, f0: 1800 + Math.random() * 3200, q: 2.4, rate: 1.2 });
    osc('sine', 700 + Math.random() * 500, tt, 0.03, 0.03, 400);
  }
}

/* ====================================================== CRAZY TIME SFX */

/** flapper striking a peg — speed-scaled click, the signature CT sound */
let lastFlapper = 0;
export function flapperClick(speed = 1, strong = false) {
  if (!ctx) return;
  const t = now();
  if (t - lastFlapper < 0.018) return;
  lastFlapper = t;
  const sp = Math.max(0.15, Math.min(1, speed));
  const peak = (strong ? 0.2 : 0.1) * (0.55 + sp * 0.65);
  noiseBurst({ t0: t, dur: 0.028 + (1 - sp) * 0.02, peak, f0: 2400 + Math.random() * 900, q: 3.2, rate: 1.4 });
  osc('square', 1300 + Math.random() * 700, t, 0.022, peak * 0.32, 600);
  osc('sine', 190 + Math.random() * 40, t, 0.05, peak * 0.34, 90);
}

export function wheelRumble(on = true) {
  if (!ctx) return;
  if (on) {
    if (wheelRumble.node) return;
    const src = noiseSource();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const g = gainNode(0);
    env(g, now(), 0.001, 0.6, 0.001, 0.055, 0.001);
    g.gain.cancelScheduledValues(now());
    g.gain.setValueAtTime(0.001, now());
    g.gain.linearRampToValueAtTime(0.07, now() + 0.5);
    src.connect(lp); lp.connect(g); g.connect(sfxBus);
    src.start();
    wheelRumble.node = { src, g, lp };
  } else if (wheelRumble.node) {
    const { src, g } = wheelRumble.node;
    g.gain.setTargetAtTime(0.0001, now(), 0.15);
    setTimeout(() => { try { src.stop(); } catch (e) {} }, 700);
    wheelRumble.node = null;
  }
}

export function hostVoiceCue() {
  if (!ctx) return;
  const t = now();
  bell(659.25, t, 0.09, 0.6, 2.1);
  bell(987.77, t + 0.08, 0.07, 0.7, 2.3);
}

export function topSlotSpin() {
  if (!ctx) return;
  const t = now();
  for (let i = 0; i < 10; i++) {
    noiseBurst({ t0: t + i * 0.055, dur: 0.02, peak: 0.045, f0: 3600, q: 3, rate: 1.8 });
  }
}

export function topSlotStop(i = 0) {
  if (!ctx) return;
  const t = now();
  noiseBurst({ t0: t, dur: 0.04, peak: 0.16, f0: 1200, q: 1.4 });
  osc('sine', 180, t, 0.09, 0.12, 90);
  osc('square', 620, t, 0.03, 0.04, 400);
}

export function topSlotWin() {
  if (!ctx) return;
  const t = now();
  [1046.5, 1318.5, 1568, 2093].forEach((f, i) => bell(f, t + i * 0.085, 0.13, 1.2, 2.5));
  osc('sine', 523.25, t, 1.0, 0.07, 520);
  [0, 3, 7].forEach((s) => {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 523.25 * Math.pow(2, s / 12);
    const g = gainNode(0);
    env(g, t, 0.05, 0.05, 0.8, 0.02, 0.6);
    o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 1.6);
  });
}

/* ----- bonuses -------------------------------------------------------- */
export function coinFlipWhoosh() {
  if (!ctx) return;
  const t = now();
  for (let i = 0; i < 9; i++) {
    noiseBurst({ t0: t + i * 0.14, dur: 0.07, peak: 0.05 + i * 0.004, f0: 900 + i * 260, f1: 1800 + i * 300, q: 1.2, rate: 1.6 });
  }
}
export function coinFlipLand(win) {
  if (!ctx) return;
  const t = now();
  bell(win ? 1568 : 659.25, t, 0.16, 1.4, 2.0);
  bell(win ? 2093 : 987.77, t + 0.02, 0.09, 1.2, 2.6);
  noiseBurst({ t0: t, dur: 0.06, peak: 0.12, f0: 3200, q: 2 });
}

export function pachinkoPeg(strength = 1) {
  if (!ctx) return;
  const t = now();
  osc('sine', 1500 + Math.random() * 900, t, 0.03, 0.035 * strength, 900);
  noiseBurst({ t0: t, dur: 0.015, peak: 0.03 * strength, f0: 6000, q: 4 });
}
export function pachinkoDrop() {
  if (!ctx) return;
  const t = now();
  noiseBurst({ t0: t, dur: 0.25, peak: 0.06, f0: 400, f1: 1600, q: 1.2 });
}
export function pachinkoLanded(mult) {
  if (!ctx) return;
  const t = now();
  if (mult >= 10) {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => bell(f, t + i * 0.07, 0.11, 1.0, 2.4));
  } else {
    bell(784, t, 0.11, 0.9, 2.2);
  }
  chipPayout(Math.min(20, mult));
}

export function cashHuntCannon() {
  if (!ctx) return;
  const t = now();
  osc('sine', 90, t, 0.4, 0.22, 42);
  noiseBurst({ t0: t, dur: 0.3, peak: 0.2, f0: 2600, f1: 200, q: 0.7, rate: 0.7 });
  noiseBurst({ t0: t, dur: 0.1, peak: 0.1, f0: 900, q: 1 });
}
export function cashHuntReveal(mult) {
  if (!ctx) return;
  const t = now();
  // firework burst
  for (let i = 0; i < 14; i++) {
    noiseBurst({ t0: t + Math.random() * 0.5, dur: 0.05, peak: 0.05 + Math.random() * 0.05, f0: 2600 + Math.random() * 3000, q: 2, rate: 1.4 });
  }
  [0, 4, 7, 12].forEach((s, i) => bell(523.25 * Math.pow(2, s / 12) * 2, t + i * 0.06, 0.09, 1.1, 2.3));
  if (mult >= 20) winFanfare('tie');
}

export function bigWheelRumble(on) {
  wheelRumble(on);
}
export function multiplierApply(factor = 2) {
  if (!ctx) return;
  const t = now();
  osc('sawtooth', 110, t, 0.5, 0.09, 330 * factor);
  for (let i = 0; i < 4; i++) bell(880 * Math.pow(2, i / 12), t + i * 0.06, 0.07, 0.6, 2.2);
}

export function uiClick() {
  if (!ctx) return;
  const t = now();
  noiseBurst({ t0: t, dur: 0.02, peak: 0.05, f0: 4200, q: 2 });
  osc('sine', 1200, t, 0.02, 0.03, 800);
}

export function errorBuzz() {
  if (!ctx) return;
  const t = now();
  osc('square', 180, t, 0.09, 0.05, 140);
  osc('square', 150, t + 0.1, 0.09, 0.04, 110);
}

/* ------------------------------------------------------- debug/log (test) */
export function audioLog() {
  return log.slice();
}
