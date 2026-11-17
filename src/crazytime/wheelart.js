/* =========================================================================
   crazytime/wheelart.js — the money wheel and the carnival set, painted.

   Everything here is drawn from the real Evolution Crazy Time broadcast:
   a thick cream rim with brass pins, pastel pinwheel wedges, a dark coloured
   shield carrying every number, green/blue/purple/magenta strips with gold
   script on the nine bonus segments, and the red CRAZY TIME badge in the hub.
   The whole face is one 3072px canvas so labels can never drift off their
   wedge (the wheel is rotated as a single rigid body).
   ========================================================================= */
import { canvas2d, texture, shade } from '../shared/textures.js';

/* shield colours follow the betting tiles: 1 teal, 2 bronze, 5 maroon, 10 navy */
const CT_FACE = {
  n1: { kind: 'num', digit: '1', shield: '#0f6069', edge: '#a9e6df' },
  n2: { kind: 'num', digit: '2', shield: '#7d5a1c', edge: '#f4dda0' },
  n5: { kind: 'num', digit: '5', shield: '#6a2034', edge: '#f2b3c2' },
  n10: { kind: 'num', digit: '10', shield: '#2a3078', edge: '#c4caf6' },
  cf: { kind: 'bonus', name: 'Coin Flip', fill: ['#3e4490', '#191c50'], icon: 'coin' },
  pa: { kind: 'bonus', name: 'Pachinko', fill: ['#76389d', '#340f4d'], icon: 'pins' },
  ch: { kind: 'bonus', name: 'Cash Hunt', fill: ['#126d3a', '#042c19'], icon: 'target' },
  ct: { kind: 'bonus', name: 'Crazy Time', fill: ['#bb1f60', '#5c0a2c'], icon: 'spiral' }
};

/* the pastel pinwheel: adjacent wedges always take different colours */
const CT_PASTEL = ['#9ed4ec', '#edb246', '#efa189', '#ab9ad8', '#9fd8c0', '#e7cc90'];

const TAU = Math.PI * 2;

function disc(g, r, fill) {
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.fillStyle = fill;
  g.fill();
}

/* ---------------------------------------------------------------- icons */
function iconCoin(g, r) {
  const coin = (x, rad, inner) => {
    const grd = g.createRadialGradient(x - rad * 0.35, -rad * 0.35, rad * 0.1, x, 0, rad);
    grd.addColorStop(0, '#fff6d8');
    grd.addColorStop(0.45, inner);
    grd.addColorStop(1, inner === '#d3243c' ? '#6d0716' : '#0c2a74');
    g.beginPath();
    g.arc(x, 0, rad, 0, TAU);
    g.fillStyle = grd;
    g.fill();
    g.lineWidth = rad * 0.16;
    g.strokeStyle = 'rgba(255,232,170,0.95)';
    g.stroke();
    g.beginPath();
    g.arc(x, 0, rad * 0.62, 0, TAU);
    g.lineWidth = rad * 0.10;
    g.strokeStyle = 'rgba(40,20,10,0.35)';
    g.stroke();
  };
  coin(-r * 0.46, r * 0.60, '#d3243c');
  coin(r * 0.46, r * 0.60, '#2b57c4');
}

function iconPins(g, r) {
  g.fillStyle = 'rgba(255,238,190,0.9)';
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      g.beginPath();
      g.arc((-1 + col) * r * 0.46 + (row % 2 ? r * 0.23 : 0), (-1 + row) * r * 0.44 - r * 0.10, r * 0.10, 0, TAU);
      g.fill();
    }
  }
  const grd = g.createRadialGradient(0, r * 0.62, r * 0.04, 0, r * 0.68, r * 0.30);
  grd.addColorStop(0, '#fff7cd');
  grd.addColorStop(1, '#e39a1c');
  g.beginPath();
  g.arc(0, r * 0.68, r * 0.27, 0, TAU);
  g.fillStyle = grd;
  g.fill();
  g.lineWidth = r * 0.06;
  g.strokeStyle = 'rgba(255,244,200,0.8)';
  g.stroke();
}

function iconTarget(g, r) {
  const bands = [['#f6e7c2', 1], ['#d3283c', 0.78], ['#f6e7c2', 0.56], ['#d3283c', 0.34], ['#ffe9b0', 0.14]];
  bands.forEach(([col, k]) => {
    g.beginPath();
    g.arc(0, 0, r * k, 0, TAU);
    g.fillStyle = col;
    g.fill();
  });
  g.lineWidth = r * 0.07;
  g.strokeStyle = 'rgba(255,240,200,0.85)';
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.stroke();
}

function iconSpiral(g, r) {
  g.strokeStyle = '#ffe9b0';
  g.lineWidth = r * 0.16;
  g.lineCap = 'round';
  g.beginPath();
  for (let a = 0; a < Math.PI * 4.4; a += 0.08) {
    const rad = r * (0.12 + (a / (Math.PI * 4.4)) * 0.86);
    const x = Math.cos(a - Math.PI / 2) * rad;
    const y = Math.sin(a - Math.PI / 2) * rad;
    if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke();
  g.lineCap = 'butt';
}

function bonusIcon(g, kind, r) {
  if (kind === 'coin') iconCoin(g, r);
  else if (kind === 'pins') iconPins(g, r);
  else if (kind === 'target') iconTarget(g, r);
  else iconSpiral(g, r);
}

/* gold script: hairlines between the wedge edges and the printed plate */
function scriptFont(px) {
  return `italic 700 ${Math.round(px)}px "URW Chancery L", "Apple Chancery", "Z003", Georgia, serif`;
}

/* -------------------------------------------------------------- the face */
export function ctWheelFace(wheel, segAngle) {
  const S = 3072;
  const { c, g } = canvas2d(S, S);
  const cx = S / 2;
  const cy = S / 2;
  const R = S / 2 - 6;
  const seg = segAngle;

  const RIM_IN = R * 0.886;
  const SHIELD_R = R * 0.792;
  const HUB_R = R * 0.302;
  const WEDGE_IN = HUB_R * 1.02;

  g.clearRect(0, 0, S, S);

  /* dark bed so nothing shows through the rim gap */
  disc(g, R, '#1a0308');

  /* ---- wedges */
  for (let i = 0; i < wheel.length; i++) {
    const mid = -Math.PI / 2 + i * seg;
    const a0 = mid - seg / 2;
    const a1 = mid + seg / 2;
    const cfg = CT_FACE[wheel[i]];

    g.save();
    g.beginPath();
    g.arc(cx, cy, RIM_IN, a0, a1);
    g.arc(cx, cy, WEDGE_IN, a1, a0, true);
    g.closePath();
    g.clip();

    if (cfg.kind === 'num') {
      const base = CT_PASTEL[i % CT_PASTEL.length];
      const grd = g.createRadialGradient(cx, cy, WEDGE_IN, cx, cy, RIM_IN);
      grd.addColorStop(0, shade(base, 0.10));
      grd.addColorStop(0.55, base);
      grd.addColorStop(1, shade(base, -0.16));
      g.fillStyle = grd;
      g.fillRect(cx - R, cy - R, S, S);
      /* silk sheen across the wedge */
      const sheen = g.createLinearGradient(
        cx + Math.cos(mid - seg / 2) * WEDGE_IN, cy + Math.sin(mid - seg / 2) * WEDGE_IN,
        cx + Math.cos(mid + seg / 2) * RIM_IN, cy + Math.sin(mid + seg / 2) * RIM_IN
      );
      sheen.addColorStop(0, 'rgba(255,255,255,0.16)');
      sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
      sheen.addColorStop(1, 'rgba(0,0,0,0.10)');
      g.fillStyle = sheen;
      g.fillRect(cx - R, cy - R, S, S);
    } else {
      const grd = g.createLinearGradient(cx, cy, cx + Math.cos(mid) * RIM_IN, cy + Math.sin(mid) * RIM_IN);
      grd.addColorStop(0, cfg.fill[1]);
      grd.addColorStop(0.45, cfg.fill[0]);
      grd.addColorStop(1, shade(cfg.fill[0], 0.16));
      g.fillStyle = grd;
      g.fillRect(cx - R, cy - R, S, S);
      /* fine cloth ribs running along the radius */
      g.strokeStyle = 'rgba(255,255,255,0.05)';
      g.lineWidth = 3;
      for (let t = 0.1; t < 1; t += 0.06) {
        const aa = a0 + (a1 - a0) * t;
        g.beginPath();
        g.moveTo(cx + Math.cos(aa) * WEDGE_IN, cy + Math.sin(aa) * WEDGE_IN);
        g.lineTo(cx + Math.cos(aa) * RIM_IN, cy + Math.sin(aa) * RIM_IN);
        g.stroke();
      }
    }
    g.restore();

    /* separator: a thin gold hairline, as printed on the real disc */
    g.beginPath();
    g.moveTo(cx + Math.cos(a0) * WEDGE_IN, cy + Math.sin(a0) * WEDGE_IN);
    g.lineTo(cx + Math.cos(a0) * RIM_IN, cy + Math.sin(a0) * RIM_IN);
    g.strokeStyle = 'rgba(255,240,205,0.55)';
    g.lineWidth = 3.5;
    g.stroke();
    g.strokeStyle = 'rgba(90,60,30,0.20)';
    g.lineWidth = 1.6;
    g.stroke();

    if (cfg.kind === 'num') {
      /* ---- number shield */
      g.save();
      g.translate(cx + Math.cos(mid) * SHIELD_R, cy + Math.sin(mid) * SHIELD_R);
      g.rotate(mid + Math.PI / 2);
      /* dark bed under the plate so neighbours read as separate tiles */
      g.fillStyle = 'rgba(28,8,10,0.55)';
      g.beginPath();
      g.roundRect(-R * 0.056, -R * 0.088, R * 0.112, R * 0.176, R * 0.016);
      g.fill();
      const w = R * 0.086;
      const h = R * 0.150;
      g.beginPath();
      g.moveTo(-w / 2 + w * 0.14, -h / 2);
      g.lineTo(w / 2 - w * 0.14, -h / 2);
      g.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + h * 0.16);
      g.lineTo(w / 2, h / 2 - h * 0.20);
      g.quadraticCurveTo(w / 2, h / 2, w / 2 - w * 0.14, h / 2);
      g.lineTo(-w / 2 + w * 0.14, h / 2);
      g.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - h * 0.20);
      g.lineTo(-w / 2, -h / 2 + h * 0.16);
      g.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + w * 0.14, -h / 2);
      g.closePath();
      const sg = g.createLinearGradient(0, -h / 2, 0, h / 2);
      sg.addColorStop(0, shade(cfg.shield, 0.22));
      sg.addColorStop(0.5, cfg.shield);
      sg.addColorStop(1, shade(cfg.shield, -0.28));
      g.fillStyle = sg;
      g.fill();
      g.lineWidth = R * 0.009;
      g.strokeStyle = cfg.edge;
      g.stroke();
      g.lineWidth = R * 0.0035;
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.stroke();

      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const px = cfg.digit.length > 1 ? h * 0.56 : h * 0.70;
      g.font = `800 ${px}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
      g.shadowColor = 'rgba(0,0,0,0.45)';
      g.shadowBlur = R * 0.006;
      g.fillText(cfg.digit, 0, h * 0.02);
      g.shadowBlur = 0;
      g.restore();
    } else {
      /* ---- gold script running out along the radius + round icon at the rim */
      g.save();
      g.translate(cx, cy);
      g.rotate(mid);
      g.textAlign = 'center';
      g.textBaseline = 'middle';

      const name = cfg.name;
      const span = RIM_IN - SHIELD_R * 1.02;
      const from = HUB_R * 1.12;
      const inner = from + R * 0.02;
      const outer = inner + span * 0.50;
      const midR = (inner + outer) / 2;

      let px = R * 0.062;
      g.font = scriptFont(px);
      const tw = g.measureText(name).width;
      if (tw > outer - inner) px *= (outer - inner) / tw;
      g.font = scriptFont(px);
      g.fillStyle = '#ffeac0';
      g.shadowColor = 'rgba(90,20,10,0.65)';
      g.shadowBlur = R * 0.008;
      g.fillText(name, midR, 0);
      g.shadowBlur = 0;
      g.strokeStyle = 'rgba(120,50,20,0.35)';
      g.lineWidth = R * 0.0018;
      g.strokeText(name, midR, 0);

      /* hairline rules flanking the script */
      g.strokeStyle = 'rgba(255,225,160,0.55)';
      g.lineWidth = R * 0.0022;
      for (const dy of [-R * 0.030, R * 0.030]) {
        g.beginPath();
        g.moveTo(inner, dy);
        g.lineTo(outer, dy);
        g.stroke();
      }
      g.restore();

      g.save();
      g.translate(cx + Math.cos(mid) * SHIELD_R, cy + Math.sin(mid) * SHIELD_R);
      bonusIcon(g, cfg.icon, R * 0.052);
      g.restore();
    }
  }

  /* ---- glitter specks pressed into the print */
  g.save();
  g.beginPath();
  g.arc(cx, cy, RIM_IN, 0, TAU);
  g.clip();
  for (let i = 0; i < 26000; i++) {
    const a = Math.random() * TAU;
    const r = WEDGE_IN + Math.random() * (RIM_IN - WEDGE_IN);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    g.fillStyle = Math.random() > 0.55 ? 'rgba(255,255,255,0.16)' : 'rgba(60,20,0,0.10)';
    g.fillRect(x, y, 2.2, 2.2);
  }
  g.restore();

  /* ---- cream rim */
  g.save();
  g.beginPath();
  g.arc(cx, cy, R, 0, TAU);
  g.arc(cx, cy, RIM_IN, 0, TAU, true);
  g.closePath();
  const rimG = g.createRadialGradient(cx, cy, RIM_IN, cx, cy, R);
  rimG.addColorStop(0, '#c9a86a');
  rimG.addColorStop(0.14, '#f7efd8');
  rimG.addColorStop(0.55, '#fffaee');
  rimG.addColorStop(0.88, '#f0e4c6');
  rimG.addColorStop(1, '#b9985c');
  g.fillStyle = rimG;
  g.fill();

  /* gold rules on both edges of the rim */
  g.lineWidth = R * 0.006;
  g.strokeStyle = 'rgba(176,138,70,0.95)';
  g.beginPath();
  g.arc(cx, cy, R * 0.998, 0, TAU);
  g.stroke();
  g.lineWidth = R * 0.004;
  g.strokeStyle = 'rgba(196,158,88,0.85)';
  g.beginPath();
  g.arc(cx, cy, RIM_IN * 1.008, 0, TAU);
  g.stroke();

  /* brass studs at every segment boundary, like the real rim screws */
  for (let i = 0; i < wheel.length; i++) {
    const a = -Math.PI / 2 + i * seg;
    const r = R * 0.943;
    g.save();
    g.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.rotate(a);
    g.beginPath();
    g.roundRect(-R * 0.016, -R * 0.008, R * 0.032, R * 0.016, R * 0.006);
    const sg = g.createLinearGradient(0, -R * 0.008, 0, R * 0.008);
    sg.addColorStop(0, '#f6e2ae');
    sg.addColorStop(1, '#9a7734');
    g.fillStyle = sg;
    g.fill();
    g.restore();
  }
  g.restore();

  /* ---- hub badge: red disc, gold rings, CRAZY TIME */
  g.save();
  g.translate(cx, cy);
  disc(g, HUB_R * 1.10, '#2b070d');
  const ringG = g.createLinearGradient(-HUB_R, -HUB_R, HUB_R, HUB_R);
  ringG.addColorStop(0, '#fff1c8');
  ringG.addColorStop(0.35, '#d8ac5c');
  ringG.addColorStop(0.6, '#8e6624');
  ringG.addColorStop(1, '#f4dfa6');
  g.beginPath();
  g.arc(0, 0, HUB_R * 1.10, 0, TAU);
  g.fillStyle = ringG;
  g.fill();

  disc(g, HUB_R * 0.965, '#62070f');
  const redG = g.createRadialGradient(-HUB_R * 0.28, -HUB_R * 0.34, HUB_R * 0.06, 0, 0, HUB_R * 0.96);
  redG.addColorStop(0, '#f0453a');
  redG.addColorStop(0.45, '#cf1420');
  redG.addColorStop(1, '#8a0713');
  disc(g, HUB_R * 0.95, redG);

  /* carnival starburst on the badge */
  g.globalAlpha = 0.5;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, HUB_R * 0.95, a, a + TAU / 48);
    g.closePath();
    g.fillStyle = i % 2 ? 'rgba(255,210,120,0.20)' : 'rgba(120,0,10,0.22)';
    g.fill();
  }
  g.globalAlpha = 1;

  g.lineWidth = HUB_R * 0.035;
  g.strokeStyle = 'rgba(255,225,160,0.85)';
  g.beginPath();
  g.arc(0, 0, HUB_R * 0.86, 0, TAU);
  g.stroke();

  /* the wordmark: CRAZY over TIME, warm white with a gold shadow */
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const word = (txt, y, px, spacing) => {
    if ('letterSpacing' in g) g.letterSpacing = `${Math.round(spacing)}px`;
    g.font = `800 ${Math.round(px)}px "Trebuchet MS", "Helvetica Neue", Arial, sans-serif`;
    g.shadowColor = 'rgba(90,0,10,0.85)';
    g.shadowBlur = px * 0.22;
    g.fillStyle = '#ffeec2';
    g.fillText(txt, 0, y);
    g.lineWidth = px * 0.055;
    g.strokeStyle = 'rgba(255,196,84,0.85)';
    g.strokeText(txt, 0, y);
    g.shadowBlur = 0;
    if ('letterSpacing' in g) g.letterSpacing = '0px';
  };
  word('CRAZY', -HUB_R * 0.20, HUB_R * 0.375, HUB_R * 0.012);
  word('TIME', HUB_R * 0.27, HUB_R * 0.375, HUB_R * 0.055);

  /* little gold diamond between the words */
  g.beginPath();
  g.moveTo(0, -HUB_R * 0.005);
  g.lineTo(HUB_R * 0.05, HUB_R * 0.045);
  g.lineTo(0, HUB_R * 0.095);
  g.lineTo(-HUB_R * 0.05, HUB_R * 0.045);
  g.closePath();
  g.fillStyle = '#ffd97e';
  g.fill();
  g.restore();

  return texture(c, { aniso: 16 });
}

/* ================================================================ studio */
/**
 * The carnival set behind the wheel: a dark plum tent with gold-trimmed
 * drapery, a scalloped valance strung with bulbs, the red CRAZY TIME door on
 * the left and two lit bonus gates at the outer edges. Everything that the
 * wheel and the host stand in front of is deliberately kept dark, so the disc
 * is the brightest thing on screen — as it is on the real broadcast.
 */
export function ctStudioMural() {
  const W = 4096;
  const H = 2304;
  const { c, g } = canvas2d(W, H);

  /* tent ground */
  const bg = g.createRadialGradient(W * 0.5, H * 0.62, W * 0.04, W * 0.5, H * 0.58, W * 0.62);
  bg.addColorStop(0, '#4a0a1c');
  bg.addColorStop(0.32, '#330714');
  bg.addColorStop(0.66, '#1a0410');
  bg.addColorStop(1, '#070109');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  /* pleated drapery */
  const panelW = W / 34;
  for (let i = 0; i < 34; i++) {
    const x = i * panelW;
    const lg = g.createLinearGradient(x, 0, x + panelW, 0);
    lg.addColorStop(0, 'rgba(10,0,6,0.55)');
    lg.addColorStop(0.38, 'rgba(108,18,40,0.40)');
    lg.addColorStop(0.64, 'rgba(146,26,52,0.28)');
    lg.addColorStop(1, 'rgba(8,0,5,0.6)');
    g.fillStyle = lg;
    g.fillRect(x, 0, panelW + 1, H);
  }

  /* warm pool of light behind the wheel */
  const pool = g.createRadialGradient(W * 0.48, H * 0.50, W * 0.03, W * 0.48, H * 0.52, W * 0.36);
  pool.addColorStop(0, 'rgba(255,196,130,0.26)');
  pool.addColorStop(0.5, 'rgba(210,80,90,0.11)');
  pool.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = pool;
  g.fillRect(0, 0, W, H);

  /* scalloped valance */
  const scallops = 18;
  const sw = W / scallops;
  g.beginPath();
  g.moveTo(0, 0);
  for (let i = 0; i < scallops; i++) {
    const x0 = i * sw;
    g.lineTo(x0, H * 0.070);
    g.quadraticCurveTo(x0 + sw / 2, H * 0.125, x0 + sw, H * 0.070);
  }
  g.lineTo(W, 0);
  g.closePath();
  const valG = g.createLinearGradient(0, 0, 0, H * 0.13);
  valG.addColorStop(0, '#3d0612');
  valG.addColorStop(0.55, '#6d0d22');
  valG.addColorStop(1, '#30040f');
  g.fillStyle = valG;
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(214,172,96,0.5)';
  g.stroke();

  const bulb = (x, y, r, warm = 1) => {
    const rg = g.createRadialGradient(x, y, 1, x, y, r);
    rg.addColorStop(0, 'rgba(255,250,226,0.95)');
    rg.addColorStop(0.42, `rgba(255,${190 + 30 * warm},${110 + 40 * warm},0.55)`);
    rg.addColorStop(1, 'rgba(255,150,40,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  };
  for (let i = 0; i < scallops; i++) {
    const x = i * sw + sw / 2;
    for (const dy of [H * 0.030, H * 0.078]) bulb(x, dy, 20);
    bulb(x - sw * 0.3, H * 0.062, 15);
    bulb(x + sw * 0.3, H * 0.062, 15);
  }

  /* swags of festoon bulbs across the top */
  for (let s = 0; s < 5; s++) {
    const y0 = H * (0.15 + s * 0.045);
    g.beginPath();
    g.moveTo(0, y0);
    for (let x = 0; x <= W; x += 40) {
      g.lineTo(x, y0 + Math.sin((x / W) * Math.PI * 4 + s) * H * 0.012);
    }
    g.strokeStyle = 'rgba(30,8,12,0.55)';
    g.lineWidth = 2;
    g.stroke();
    for (let x = 40 + s * 30; x < W; x += 130) {
      bulb(x, y0 + Math.sin((x / W) * Math.PI * 4 + s) * H * 0.012 + 6, 11 + (s % 2) * 3);
    }
  }

  /* gold pillar */
  const pillar = (x, w, top, bottom) => {
    const pg = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    pg.addColorStop(0, '#3a2408');
    pg.addColorStop(0.22, '#c9a65c');
    pg.addColorStop(0.48, '#8a6526');
    pg.addColorStop(0.66, '#e2c184');
    pg.addColorStop(0.88, '#6f4f18');
    pg.addColorStop(1, '#2e1c06');
    g.fillStyle = pg;
    g.fillRect(x - w / 2, top, w, bottom - top);
    g.fillStyle = 'rgba(0,0,0,0.28)';
    for (let i = 1; i < 4; i++) g.fillRect(x - w / 2 + (w / 4) * i - 2, top, 4, bottom - top);
    for (const y of [top, bottom - w * 2.4]) {
      g.fillStyle = '#d8b572';
      g.fillRect(x - w * 0.85, y, w * 1.7, w * 0.55);
    }
  };

  /* a gold-framed gate with a lit sign */
  const gate = (cxg, cw, top, label, glow, ink) => {
    const x0 = cxg - cw / 2;
    const ch = H * 0.40;
    const ig = g.createLinearGradient(x0, top, x0 + cw, top + ch);
    ig.addColorStop(0, 'rgba(255,255,255,0.03)');
    ig.addColorStop(0.45, glow);
    ig.addColorStop(1, 'rgba(6,0,8,0.55)');
    g.fillStyle = ig;
    g.beginPath();
    g.moveTo(x0, top + ch);
    g.lineTo(x0, top + cw * 0.55);
    g.quadraticCurveTo(cxg, top - cw * 0.28, x0 + cw, top + cw * 0.55);
    g.lineTo(x0 + cw, top + ch);
    g.closePath();
    g.fill();

    g.lineWidth = cw * 0.05;
    const fg = g.createLinearGradient(x0, top, x0 + cw, top + ch);
    fg.addColorStop(0, '#fff1c9');
    fg.addColorStop(0.45, '#b98f42');
    fg.addColorStop(0.72, '#7c571e');
    fg.addColorStop(1, '#e4c88c');
    g.strokeStyle = fg;
    g.stroke();

    for (let i = 0; i <= 12; i++) {
      const a = Math.PI * (1 - i / 12);
      bulb(cxg + Math.cos(a) * (cw / 2), top + cw * 0.55 - Math.sin(a) * (cw * 0.72), 13);
    }

    g.save();
    g.translate(cxg, top + cw * 0.16);
    g.fillStyle = 'rgba(12,2,8,0.9)';
    g.beginPath();
    g.roundRect(-cw * 0.44, -cw * 0.075, cw * 0.88, cw * 0.15, cw * 0.03);
    g.fill();
    g.lineWidth = cw * 0.010;
    g.strokeStyle = 'rgba(236,204,132,0.85)';
    g.stroke();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if ('letterSpacing' in g) g.letterSpacing = `${Math.round(cw * 0.006)}px`;
    g.font = `800 ${Math.round(cw * 0.082)}px "Trebuchet MS", Arial, sans-serif`;
    g.fillStyle = ink;
    g.shadowColor = ink;
    g.shadowBlur = 22;
    g.fillText(label, 0, cw * 0.006);
    g.shadowBlur = 0;
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    g.restore();
  };

  /* ---- the set: CRAZY TIME door left, bonus gates at the edges */
  pillar(W * 0.043, W * 0.022, H * 0.14, H * 0.98);
  pillar(W * 0.205, W * 0.020, H * 0.16, H * 0.98);
  pillar(W * 0.735, W * 0.020, H * 0.16, H * 0.98);
  pillar(W * 0.968, W * 0.020, H * 0.14, H * 0.98);

  /* red CRAZY TIME double door */
  (() => {
    const cw = W * 0.115;
    const x0 = W * 0.062;
    const y0 = H * 0.34;
    const ch = H * 0.56;
    const dg = g.createLinearGradient(x0, y0, x0 + cw, y0 + ch);
    dg.addColorStop(0, '#7d0a1e');
    dg.addColorStop(0.5, '#ab1729');
    dg.addColorStop(1, '#4c0511');
    g.fillStyle = dg;
    g.fillRect(x0, y0, cw, ch);
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(x0 + cw / 2 - 3, y0, 6, ch);
    g.lineWidth = cw * 0.05;
    g.strokeStyle = '#c9a45c';
    g.strokeRect(x0, y0, cw, ch);
    g.lineWidth = cw * 0.016;
    g.strokeStyle = 'rgba(255,226,160,0.6)';
    g.strokeRect(x0 + cw * 0.07, y0 + cw * 0.10, cw - cw * 0.14, ch - cw * 0.18);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 ${Math.round(cw * 0.15)}px "Trebuchet MS", Arial, sans-serif`;
    g.fillStyle = '#ffe9b8';
    g.fillText('CRAZY', x0 + cw / 2, y0 + ch * 0.42);
    g.fillText('TIME', x0 + cw / 2, y0 + ch * 0.58);
    g.beginPath();
    g.arc(x0 + cw / 2, y0 + ch * 0.78, cw * 0.045, 0, TAU);
    g.fillStyle = '#e6c684';
    g.fill();
    for (const yy of [y0 + ch * 0.18]) {
      bulb(x0 + cw * 0.2, yy, 12);
      bulb(x0 + cw * 0.8, yy, 12);
    }
  })();

  gate(W * 0.275, W * 0.105, H * 0.44, 'COIN FLIP', 'rgba(56,88,200,0.45)', '#c2d6ff');
  gate(W * 0.665, W * 0.105, H * 0.46, 'CASH HUNT', 'rgba(24,132,76,0.42)', '#c8ffd8');
  gate(W * 0.905, W * 0.105, H * 0.44, 'PACHINKO', 'rgba(126,58,182,0.42)', '#efc4ff');

  /* sparkle haze */
  for (let i = 0; i < 700; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 1 + Math.random() * 4;
    g.fillStyle = `rgba(255,${185 + Math.random() * 60},${150 + Math.random() * 80},${0.02 + Math.random() * 0.08})`;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }

  /* vignette so the edges of the frame fall away */
  const v = g.createRadialGradient(W / 2, H * 0.55, H * 0.24, W / 2, H * 0.55, H * 1.05);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.86)');
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);

  return texture(c, { aniso: 4 });
}
