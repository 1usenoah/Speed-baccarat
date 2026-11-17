import './style.css';
import { mountShell, toast, showRefill } from './ui/shell.js';
import { wallet, fmt } from './core/store.js';
import { BaccaratGame } from './baccarat/game.js';
import { initAudio, startAmbience } from './core/audio.js';
import { syncClock, isClockSynced, clockOffset, roundPhase, crazySpin, baccaratHand, roundIndexFor, ROUND, recentBaccarat } from './services/syncEngine.js';
import { loadSession, currentUser, checkBan, queueSync, syncAccount, isVipUser } from './services/auth.js';
import { mountAccount, showGate, setOnSignedIn } from './ui/authUI.js';

const q = new URLSearchParams(location.search);

let current = q.get('game') === 'crazy' ? 'crazy' : 'baccarat';
let baccarat = null;
let crazy = null;
let signedIn = false;

const shell = mountShell({
  currentGame: current,
  onGameChange: (game) => switchGame(game)
});

function bootGames() {
  if (!baccarat) {
    baccarat = new BaccaratGame(shell);
  }
  shell.highlightGame(current);
  if (current === 'baccarat') {
    baccarat.showLobby();
  } else {
    ensureCrazy().then((c) => c.start());
  }
}

function unlockAudio() {
  const unlock = () => {
    initAudio();
    startAmbience(current === 'crazy' ? 'crazy' : 'baccarat');
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

async function ensureCrazy() {
  if (crazy) return crazy;
  const mod = await import('./crazytime/game.js');
  crazy = new mod.CrazyTimeGame(shell);
  return crazy;
}

async function switchGame(game) {
  if (game === current) return;
  current = game;
  shell.highlightGame(game);
  if (game === 'baccarat') {
    baccarat?.table?.onResize();
    baccarat?.showLobby();
    startAmbience('baccarat');
  } else {
    await ensureCrazy();
    crazy.start();
    startAmbience('crazy');
  }
}

function applyVip() {
  if (isVipUser()) wallet.setVip(true);
}

async function boot() {
  // 1) session + gate first, so the sign-in screen paints immediately
  const s = loadSession();
  mountAccount((user) => {
    signedIn = !!user;
    if (user) applyVip();
  });
  if (!s) showGate();
  // 2) engines (3D init is heavy) after the first paint
  requestAnimationFrame(() => {
    bootGames();
    unlockAudio();
  });
  // 3) align every client to the same clock
  const sync = await syncClock();

  setOnSignedIn(async () => {
    signedIn = true;
    applyVip();
    baccarat?.showLobby();
    queueSync();
  });

  if (!s) {
    showGate();
  } else {
    const chk = await checkBan();
    if (!chk.ok) {
      toast('이용이 정지된 계정입니다');
      showGate({ force: true });
    }
  }

  // autosave to the cloud on every wallet change
  wallet.subscribe(() => {
    if (currentUser()) queueSync();
  });

  // periodic ban / vip re-check
  setInterval(async () => {
    if (!currentUser()) return;
    const res = await checkBan();
    if (!res.ok) {
      toast('이용이 정지된 계정입니다' + (res.reason ? ` · ${res.reason}` : ''));
      showGate({ force: true });
    }
  }, 60000);

  console.info('[sync] clock', sync, 'offset', clockOffset(), isClockSynced());
}

/* ------------------------------------------------------------- test hooks */
window.__SB = {
  wallet,
  get baccarat() { return baccarat; },
  get crazy() { return crazy; },
  get current() { return current; },
  switchGame,
  areas: { clockOffset, isClockSynced },
  state() {
    const g = current === 'baccarat' ? baccarat : crazy;
    return {
      game: current,
      phase: g?.phase,
      tableId: baccarat?.tableId || null,
      roundIndex: g?.roundIndex,
      balance: wallet.balance,
      netBalance: wallet.netBalance,
      totalRefilled: wallet.totalRefilled,
      bet: g?.totalBetValue || 0,
      history: g?.history?.length || 0,
      timeLeft: Math.round(g?.timeLeft || 0),
      refillsLeft: wallet.refillsLeft,
      vip: wallet.isVip,
      user: currentUser()?.username || null,
      hand: baccarat?.hand ? { result: baccarat.hand.result, p: baccarat.hand.playerTotal, b: baccarat.hand.bankerTotal } : null
    };
  },
  fmt,
  sync: { roundPhase, crazySpin, baccaratHand, roundIndexFor, ROUND, recentBaccarat }
};

boot();
export { shell };
