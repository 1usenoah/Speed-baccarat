/* =========================================================================
   shared/textures.js — high-resolution procedural textures drawn on canvas.

   Everything the cameras get close to (face, hair, tuxedo cloth, velvet,
   felt, marble, the 54-segment money wheel, the top-slot reels) is painted
   here at 1024–4096px so the materials never look like flat plastic.
   ========================================================================= */
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d') };
}

export function texture(c, { repeat = null, aniso = 8, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};
const rgbCss = (r, g, b) => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
export function shade(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  const f = (v) => clamp(Math.round(v * (1 + amt)), 0, 255);
  return rgbCss(f(r), f(g), f(b));
}
function rgba(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/* ------------------------------------------------------------------ skin */
/**
 * Equirect face map painted on the head sphere.
 * u = 0.25 is the front of the face (three's SphereGeometry convention),
 * v = 0 at the crown.
 */
export function skinTexture(skinHex = '#c9976f', { blush = true, pores = true } = {}) {
  const S = 1024;
  const { c, g } = canvas2d(S, S);
  g.fillStyle = skinHex;
  g.fillRect(0, 0, S, S);

  // broad tonal variation — forehead lighter, jaw/neck darker
  const grd = g.createLinearGradient(0, 0, 0, S);
  grd.addColorStop(0, rgba('#ffffff', 0.05));
  grd.addColorStop(0.45, rgba('#ffffff', 0.0));
  grd.addColorStop(0.78, rgba('#000000', 0.06));
  grd.addColorStop(1, rgba('#000000', 0.13));
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);

  // side temples / ears cheek shadow (periphery of the map)
  const side = g.createLinearGradient(0, 0, S, 0);
  side.addColorStop(0, rgba('#000000', 0.20));
  side.addColorStop(0.12, rgba('#000000', 0.0));
  side.addColorStop(0.38, rgba('#000000', 0.0));
  side.addColorStop(0.5, rgba('#000000', 0.0));
  side.addColorStop(0.62, rgba('#000000', 0.0));
  side.addColorStop(0.88, rgba('#000000', 0.0));
  side.addColorStop(1, rgba('#000000', 0.20));
  g.fillStyle = side;
  g.fillRect(0, 0, S, S);

  const fx = S * 0.25; // front centre column

  if (blush) {
    // cheeks
    for (const dx of [-1, 1]) {
      const r = g.createRadialGradient(fx + dx * S * 0.062, S * 0.585, 4, fx + dx * S * 0.062, S * 0.585, S * 0.055);
      r.addColorStop(0, 'rgba(206,86,74,0.20)');
      r.addColorStop(1, 'rgba(206,86,74,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, S, S);
    }
    // nose + lip warmth
    const n = g.createRadialGradient(fx, S * 0.53, 2, fx, S * 0.53, S * 0.04);
    n.addColorStop(0, 'rgba(214,108,92,0.18)');
    n.addColorStop(1, 'rgba(214,108,92,0)');
    g.fillStyle = n;
    g.fillRect(0, 0, S, S);
  }

  // eye socket shading (paint is what sells the depth at broadcast distance)
  for (const dx of [-1, 1]) {
    const ex = fx + dx * S * 0.038;
    const ey = S * 0.465;
    const s = g.createRadialGradient(ex, ey, 2, ex, ey, S * 0.032);
    s.addColorStop(0, 'rgba(86,42,30,0.30)');
    s.addColorStop(0.7, 'rgba(96,52,38,0.10)');
    s.addColorStop(1, 'rgba(96,52,38,0)');
    g.fillStyle = s;
    g.beginPath();
    g.ellipse(ex, ey, S * 0.040, S * 0.030, 0, 0, Math.PI * 2);
    g.fill();
  }
  // subtle under-lip / chin shadow
  const shade1 = g.createLinearGradient(0, S * 0.60, 0, S * 0.70);
  shade1.addColorStop(0, 'rgba(90,45,34,0)');
  shade1.addColorStop(0.5, 'rgba(90,45,34,0.10)');
  shade1.addColorStop(1, 'rgba(90,45,34,0)');
  g.fillStyle = shade1;
  g.fillRect(fx - S * 0.10, S * 0.60, S * 0.20, S * 0.10);

  if (pores) {
    // fine skin grain — thousands of tiny low-alpha specks
    const img = g.getImageData(0, 0, S, S);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 9;
      d[i] = clamp(d[i] + n, 0, 255);
      d[i + 1] = clamp(d[i + 1] + n, 0, 255);
      d[i + 2] = clamp(d[i + 2] + n, 0, 255);
    }
    g.putImageData(img, 0, 0);
  }
  return texture(c, { aniso: 4 });
}

/** roughness variation for skin: matte cheeks, slightly oilier T-zone */
export function skinRoughness(skinHex = '#c9976f') {
  const S = 512;
  const { c, g } = canvas2d(S, S);
  g.fillStyle = '#b4b4b4';
  g.fillRect(0, 0, S, S);
  const fx = S * 0.25;
  const tz = g.createLinearGradient(fx, S * 0.35, fx, S * 0.62);
  tz.addColorStop(0, 'rgba(140,140,140,0.7)');
  tz.addColorStop(1, 'rgba(140,140,140,0)');
  g.fillStyle = tz;
  g.fillRect(fx - S * 0.06, S * 0.35, S * 0.12, S * 0.27);
  for (let i = 0; i < 26000; i++) {
    g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
    g.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  void skinHex;
  return texture(c, { aniso: 2 });
}

/* ------------------------------------------------------------------ hair */
/** long fine strands, alpha where the hair thins out — used with alphaTest */
export function hairStrands(hairHex = '#2a1a12', { density = 9000, base = 0.0 } = {}) {
  const W = 1024;
  const H = 1024;
  const { c, g } = canvas2d(W, H);
  g.clearRect(0, 0, W, H);
  // solid mass
  g.fillStyle = hairHex;
  g.fillRect(0, 0, W, H * (1 - base));

  for (let i = 0; i < density; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const len = 40 + Math.random() * 220;
    const light = Math.random();
    g.strokeStyle = light > 0.82
      ? rgba('#ffffff', 0.05 + Math.random() * 0.10)
      : light < 0.18
        ? rgba('#000000', 0.08 + Math.random() * 0.16)
        : rgba(hairHex, 0.10 + Math.random() * 0.2);
    g.lineWidth = 0.6 + Math.random() * 1.8;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + (Math.random() - 0.5) * 16, y + len * 0.5, x + (Math.random() - 0.5) * 26, y + len);
    g.stroke();
  }
  return texture(c, { aniso: 4 });
}

/** alpha mask for the hairline silhouette (painted per hairstyle) */
export function hairMask(style = 'bun', S = 1024) {
  const { c, g } = canvas2d(S, S);
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#fff';

  // u wraps around the head: 0 = left side, 0.25 = face, 0.5 = right, 0.75 = back
  const u = (x) => (x / S) * Math.PI * 2;
  const front = 0.25;

  // base cap: full around the back, hairline higher at the front
  const pts = [];
  const N = 160;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    // distance from the face centre (0..0.5)
    let d = Math.abs(((a / (Math.PI * 2)) - front + 0.5) % 1 - 0.5);
    let top = 0.62; // how far down the head the hair reaches (v)
    if (style === 'crop' || style === 'pompadour') top = 0.58;
    if (style === 'bun') top = 0.60;
    if (style === 'ponytail') top = 0.56;
    if (style === 'long') top = 0.68;
    if (style === 'wave') top = 0.66;
    // forehead hairline sits higher (smaller v) at the front
    const frontness = clamp(1 - d / 0.30, 0, 1);
    top -= frontness * 0.20;
    if (style === 'pompadour') top -= frontness * 0.05;
    const ang = a - Math.PI / 2;
    pts.push([S / 2 + Math.cos(ang) * S * 0.5, S / 2 + Math.sin(ang) * S * 0.5]);
    pts[pts.length - 1].push(top);
  }
  // draw a cap: for each column x compute the hairline y, fill above it
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(S, 0);
  for (let x = S; x >= 0; x -= 2) {
    const a = (x / S) * Math.PI * 2;
    let d = Math.abs(((a / (Math.PI * 2)) - front + 0.5) % 1 - 0.5);
    let top = style === 'crop' || style === 'pompadour' ? 0.58 : style === 'long' ? 0.68 : 0.62;
    const frontness = clamp(1 - d / 0.30, 0, 1);
    top -= frontness * 0.20;
    if (style === 'pompadour') top -= frontness * 0.06;
    // side sweep: a low edge just in front of the ears
    g.lineTo(x, top * S);
  }
  g.closePath();
  g.fill();

  // side locks for long styles
  if (style === 'long' || style === 'wave' || style === 'ponytail') {
    g.beginPath();
    g.ellipse(S * 0.105, S * 0.72, S * 0.05, S * 0.26, 0.06, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(S * 0.395, S * 0.72, S * 0.05, S * 0.26, -0.06, 0, Math.PI * 2);
    g.fill();
  }
  if (style === 'pompadour') {
    g.beginPath();
    g.ellipse(S * 0.25, S * 0.10, S * 0.17, S * 0.12, 0, 0, Math.PI * 2);
    g.fill();
  }
  return texture(c, { aniso: 2, srgb: false });
}

/* ----------------------------------------------------------------- cloth */
export function clothTexture(baseHex = '#15171d', { weave = 3, sheen = true } = {}) {
  const S = 512;
  const { c, g } = canvas2d(S, S);
  g.fillStyle = baseHex;
  g.fillRect(0, 0, S, S);
  // twill diagonal
  for (let i = -S; i < S * 2; i += weave) {
    g.strokeStyle = rgba('#ffffff', 0.035);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + S, S);
    g.stroke();
    g.strokeStyle = rgba('#000000', 0.05);
    g.beginPath();
    g.moveTo(i + 1.2, 0);
    g.lineTo(i + S + 1.2, S);
    g.stroke();
  }
  if (sheen) {
    const grd = g.createLinearGradient(0, 0, S, S);
    grd.addColorStop(0, rgba('#ffffff', 0.05));
    grd.addColorStop(0.5, 'rgba(0,0,0,0)');
    grd.addColorStop(1, rgba('#000000', 0.10));
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
  }
  return texture(c, { repeat: [3, 3], aniso: 8 });
}

export function velvetTexture(baseHex = '#3a0e1a') {
  const S = 512;
  const { c, g } = canvas2d(S, S);
  g.fillStyle = baseHex;
  g.fillRect(0, 0, S, S);
  // crushed velvet mottling
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const r = 4 + Math.random() * 26;
    const grd = g.createRadialGradient(x, y, 1, x, y, r);
    const up = Math.random() > 0.5;
    grd.addColorStop(0, up ? rgba('#ffffff', 0.045) : rgba('#000000', 0.06));
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return texture(c, { repeat: [2, 2], aniso: 4 });
}

/* ---------------------------------------------------------------- marble */
export function marbleTexture(base = '#e8e4da', vein = '#8d8578') {
  const S = 1024;
  const { c, g } = canvas2d(S, S);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  // cloudy patches
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const r = 40 + Math.random() * 220;
    const grd = g.createRadialGradient(x, y, 2, x, y, r);
    grd.addColorStop(0, rgba('#ffffff', 0.16));
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // veins
  for (let v = 0; v < 22; v++) {
    let x = Math.random() * S;
    let y = Math.random() * S;
    g.beginPath();
    g.moveTo(x, y);
    const dir = Math.random() * Math.PI * 2;
    for (let s = 0; s < 90; s++) {
      x += Math.cos(dir) * 14 + (Math.random() - 0.5) * 16;
      y += Math.sin(dir) * 14 + (Math.random() - 0.5) * 16;
      g.lineTo(x, y);
    }
    g.strokeStyle = rgba(vein, 0.06 + Math.random() * 0.10);
    g.lineWidth = 0.6 + Math.random() * 2.4;
    g.stroke();
  }
  return texture(c, { repeat: [2, 2], aniso: 8 });
}

/* ------------------------------------------------------------------ felt */
/** Casino felt with the full baccarat layout printed in gold foil. */
export function feltTexture({ tint = '#083a2c', label = 'SPEED BACCARAT', accent = '#1f9c63', limits = '1K – 500K' } = {}) {
  const W = 2048;
  const H = 1250;
  const { c, g } = canvas2d(W, H);

  // scattered pile direction
  const grd = g.createRadialGradient(W * 0.5, H * 0.35, 40, W * 0.5, H * 0.3, W * 0.75);
  grd.addColorStop(0, shade(tint, 0.16));
  grd.addColorStop(0.45, tint);
  grd.addColorStop(1, shade(tint, -0.55));
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 90000; i++) {
    g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.014)' : 'rgba(0,0,0,0.05)';
    g.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 2, 1);
  }

  const gold = '#d8bb78';
  const goldDim = 'rgba(216,187,120,0.55)';

  // outer frame with double line + corner flourishes
  g.strokeStyle = goldDim;
  g.lineWidth = 6;
  g.strokeRect(72, 72, W - 144, H - 144);
  g.lineWidth = 2;
  g.strokeRect(96, 96, W - 192, H - 192);

  // dealer arc across the top
  g.strokeStyle = 'rgba(216,187,120,0.35)';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(W / 2, H * 0.02, W * 0.40, Math.PI * 0.12, Math.PI * 0.88);
  g.stroke();

  // logo at the far (dealer) side
  g.textAlign = 'center';
  g.fillStyle = 'rgba(233,213,166,0.55)';
  g.font = `700 ${Math.round(W * 0.030)}px "DejaVu Serif", Georgia, serif`;
  g.fillText(label, W / 2, H * 0.125);
  g.font = `500 ${Math.round(W * 0.0135)}px "DejaVu Sans", Arial, sans-serif`;
  g.fillStyle = 'rgba(233,213,166,0.35)';
  g.fillText(`8 DECKS · ${limits}`, W / 2, H * 0.165);

  // PLAYER / BANKER / TIE betting fields in gold foil line-work
  const zone = (cx, cy, w, h, title, sub, color) => {
    g.save();
    g.translate(cx, cy);
    g.strokeStyle = color;
    g.lineWidth = 4;
    g.beginPath();
    g.roundRect(-w / 2, -h / 2, w, h, 18);
    g.stroke();
    g.fillStyle = rgba(color === gold ? '#d8bb78' : '#ffffff', 0.05);
    g.fill();
    g.fillStyle = color;
    g.textAlign = 'center';
    g.font = `700 ${Math.round(W * 0.017)}px "DejaVu Sans", Arial, sans-serif`;
    g.fillText(title, 0, -h * 0.18);
    g.font = `500 ${Math.round(W * 0.011)}px "DejaVu Sans", Arial, sans-serif`;
    g.fillStyle = rgba(color === gold ? '#d8bb78' : '#ffffff', 0.6);
    g.fillText(sub, 0, h * 0.06);
    g.restore();
  };
  zone(W * 0.28, H * 0.72, W * 0.22, H * 0.20, 'PLAYER', 'PAYS 1 TO 1', gold);
  zone(W * 0.72, H * 0.72, W * 0.22, H * 0.20, 'BANKER', 'PAYS 0.95 TO 1', gold);
  zone(W * 0.5, H * 0.60, W * 0.14, H * 0.10, 'TIE', 'PAYS 8 TO 1', gold);
  zone(W * 0.335, H * 0.47, W * 0.10, H * 0.055, 'P PAIR', '11 TO 1', goldDim);
  zone(W * 0.665, H * 0.47, W * 0.10, H * 0.055, 'B PAIR', '11 TO 1', goldDim);

  // card placement frames (where the hands land)
  const cardFrame = (cx, cy, w, h, who, color) => {
    g.save();
    g.translate(cx, cy);
    g.strokeStyle = color;
    g.lineWidth = 3;
    g.setLineDash([14, 10]);
    g.beginPath();
    g.roundRect(-w / 2, -h / 2, w, h, 14);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = rgba('#d8bb78', 0.16);
    g.font = `600 ${Math.round(W * 0.011)}px "DejaVu Sans", Arial, sans-serif`;
    g.textAlign = 'center';
    g.fillText(who, 0, h / 2 + W * 0.020);
    g.restore();
  };
  cardFrame(W * 0.30, H * 0.30, W * 0.235, H * 0.24, 'PLAYER', 'rgba(140,180,245,0.55)');
  cardFrame(W * 0.70, H * 0.30, W * 0.235, H * 0.24, 'BANKER', 'rgba(240,150,160,0.55)');

  // little concentric chip rings in the corners
  for (const [x, y] of [[W * 0.10, H * 0.88], [W * 0.90, H * 0.88]]) {
    g.strokeStyle = 'rgba(216,187,120,0.22)';
    g.lineWidth = 2;
    for (let r = 18; r < 70; r += 16) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.stroke();
    }
  }
  void accent;
  return texture(c, { aniso: 16 });
}

/* --------------------------------------------------------- backdrop wall */
export function marbleWallTexture() {
  const W = 1024;
  const H = 1024;
  const { c, g } = canvas2d(W, H);
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#1c1a17');
  grd.addColorStop(0.5, '#12100e');
  grd.addColorStop(1, '#08070a');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // vertical fluting
  for (let x = 0; x < W; x += 32) {
    const lg = g.createLinearGradient(x, 0, x + 32, 0);
    lg.addColorStop(0, 'rgba(255,225,180,0.045)');
    lg.addColorStop(0.5, 'rgba(0,0,0,0.16)');
    lg.addColorStop(1, 'rgba(255,225,180,0.02)');
    g.fillStyle = lg;
    g.fillRect(x, 0, 32, H);
  }
  return texture(c, { repeat: [2, 1], aniso: 8 });
}

/* ------------------------------------------------------- crazy time wheel */
const CT_COLORS = {
  n1: ['#0f7a4a', '#0a4f30'],
  n2: ['#1c56b8', '#0e3578'],
  n5: ['#6a2fa8', '#3f1a6b'],
  n10: ['#c0281c', '#7a1208'],
  cf: ['#e0a92c', '#94640a'],
  pa: ['#0d8ea0', '#075a66'],
  ch: ['#d02a6a', '#870f3f'],
  ct: ['#e01040', '#8c0020']
};

function drawCoin(g, x, y, r) {
  const grd = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  grd.addColorStop(0, '#fff8dc');
  grd.addColorStop(0.55, '#f5c84e');
  grd.addColorStop(1, '#a06f10');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,240,190,0.9)';
  g.lineWidth = r * 0.10;
  g.stroke();
  g.strokeStyle = 'rgba(120,80,10,0.5)';
  g.lineWidth = r * 0.07;
  g.beginPath();
  g.arc(x, y, r * 0.66, 0, Math.PI * 2);
  g.stroke();
}

/** icon drawn at the origin; the caller sets the transform */
function drawIcon(g, type, r) {
  if (type === 'cf') {
    drawCoin(g, -r * 0.42, 0, r * 0.58);
    drawCoin(g, r * 0.40, r * 0.18, r * 0.46);
    g.fillStyle = 'rgba(255,248,220,0.95)';
    g.font = `800 ${r * 0.5}px "DejaVu Sans", Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('CF', 0, -r * 0.66);
  } else if (type === 'pa') {
    g.fillStyle = 'rgba(255,248,220,0.92)';
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3 - i; j++) {
        g.beginPath();
        g.arc(-r * 0.45 + j * r * 0.45 + i * r * 0.22, -r * 0.42 + i * r * 0.42, r * 0.08, 0, Math.PI * 2);
        g.fill();
      }
    }
    const grd = g.createRadialGradient(-r * 0.1, r * 0.3, 2, 0, r * 0.38, r * 0.3);
    grd.addColorStop(0, '#fff6cc');
    grd.addColorStop(1, '#e08a1a');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(0, r * 0.40, r * 0.24, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,240,190,0.6)';
    g.lineWidth = r * 0.05;
    g.stroke();
  } else if (type === 'ch') {
    g.strokeStyle = 'rgba(255,248,220,0.9)';
    g.lineWidth = r * 0.10;
    for (const k of [0.34, 0.58, 0.82]) {
      g.beginPath();
      g.arc(0, 0, r * k, 0, Math.PI * 2);
      g.stroke();
    }
    g.lineWidth = r * 0.11;
    g.beginPath();
    g.moveTo(-r, 0); g.lineTo(-r * 0.45, 0);
    g.moveTo(r * 0.45, 0); g.lineTo(r, 0);
    g.moveTo(0, -r); g.lineTo(0, -r * 0.45);
    g.moveTo(0, r * 0.45); g.lineTo(0, r);
    g.stroke();
    g.fillStyle = '#ffe9a8';
    g.beginPath();
    g.arc(0, 0, r * 0.15, 0, Math.PI * 2);
    g.fill();
  } else {
    g.strokeStyle = 'rgba(255,248,220,0.95)';
    g.lineWidth = r * 0.09;
    g.beginPath();
    g.arc(0, 0, r * 0.82, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82);
      g.stroke();
    }
    g.fillStyle = '#fff2c0';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rad = i % 2 ? r * 0.18 : r * 0.40;
      g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rad, Math.sin(a) * rad);
    }
    g.closePath();
    g.fill();
  }
}

/** Ring of coloured wedges only — labels are separate 3D plates. */
export function ctWheelBase(wheel, segAngle) {
  const S = 2048;
  const { c, g } = canvas2d(S, S);
  const cx = S / 2;
  const cy = S / 2;
  const R = S / 2 - 12;
  const seg = segAngle;

  g.clearRect(0, 0, S, S);
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fillStyle = '#160409';
  g.fill();

  for (let i = 0; i < wheel.length; i++) {
    const a0 = -Math.PI / 2 - seg / 2 + i * seg;
    const type = wheel[i];
    const [c0, c1] = CT_COLORS[type];
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, R, a0, a0 + seg);
    g.closePath();
    const grd = g.createRadialGradient(cx, cy, R * 0.16, cx, cy, R);
    grd.addColorStop(0, shade(c0, 0.12));
    grd.addColorStop(0.55, c0);
    grd.addColorStop(1, c1);
    g.fillStyle = grd;
    g.fill();

    g.save();
    g.clip();
    const gl = g.createLinearGradient(cx, cy - R, cx + R, cy + R * 0.4);
    gl.addColorStop(0, 'rgba(255,255,255,0.12)');
    gl.addColorStop(0.42, 'rgba(255,255,255,0)');
    gl.addColorStop(1, 'rgba(0,0,0,0.30)');
    g.fillStyle = gl;
    g.fillRect(0, 0, S, S);
    g.restore();

    g.strokeStyle = 'rgba(255,226,160,0.5)';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(cx + Math.cos(a0) * R * 0.13, cy + Math.sin(a0) * R * 0.13);
    g.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R);
    g.stroke();
  }

  const inner = g.createRadialGradient(cx, cy, R * 0.88, cx, cy, R);
  inner.addColorStop(0, 'rgba(0,0,0,0)');
  inner.addColorStop(1, 'rgba(0,0,0,0.42)');
  g.fillStyle = inner;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fill();

  const hub = g.createRadialGradient(cx - R * 0.03, cy - R * 0.03, R * 0.01, cx, cy, R * 0.185);
  hub.addColorStop(0, '#fff6dc');
  hub.addColorStop(0.4, '#e8bd6c');
  hub.addColorStop(0.78, '#a5761f');
  hub.addColorStop(1, '#4f3308');
  g.beginPath();
  g.arc(cx, cy, R * 0.185, 0, Math.PI * 2);
  g.fillStyle = hub;
  g.fill();
  g.strokeStyle = 'rgba(255,246,214,0.9)';
  g.lineWidth = 10;
  g.stroke();

  return texture(c, { aniso: 16 });
}

const segLabelCache = new Map();

/** One segment's icon + name on a transparent plate (drawn upright). */
export function ctSegmentPlate(type, label) {
  const key = type + '|' + label;
  if (segLabelCache.has(key)) return segLabelCache.get(key);

  const W = 128;
  const H = 512;
  const { c, g } = canvas2d(W, H);
  g.clearRect(0, 0, W, H);

  const isNumber = type === 'n1' || type === 'n2' || type === 'n5' || type === 'n10';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,251,236,0.98)';
  g.shadowColor = 'rgba(0,0,0,0.55)';
  g.shadowBlur = 12;

  if (isNumber) {
    g.font = `800 ${label.length > 1 ? 128 : 150}px "DejaVu Sans", Arial, sans-serif`;
    g.fillText(label, W / 2, H * 0.50);
  } else {
    // icon near the rim end
    g.save();
    g.translate(W / 2, H * 0.14);
    drawIcon(g, type, 46);
    g.restore();
    // name reading outward along the radius
    const words = label.split(' ');
    g.save();
    g.translate(W / 2, H * 0.40);
    g.rotate(-Math.PI / 2);
    g.font = '800 40px "DejaVu Sans", Arial, sans-serif';
    words.forEach((w, k) => {
      const offset = (k - (words.length - 1) / 2) * 46;
      g.fillText(w, offset, 0);
    });
    g.restore();
  }
  g.shadowBlur = 0;

  const t = texture(c, { aniso: 8 });
  segLabelCache.set(key, t);
  return t;
}

/* ---------------------------------------------------- top slot reel cell */
const slotCellCache = new Map();
export function slotCell(text, { bonus = false } = {}) {
  const key = text + (bonus ? '*' : '');
  if (slotCellCache.has(key)) return slotCellCache.get(key);
  const W = 256;
  const H = 320;
  const { c, g } = canvas2d(W, H);
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#2a1220');
  grd.addColorStop(0.5, bonus ? '#3d1526' : '#1d0c14');
  grd.addColorStop(1, '#2a1220');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,214,140,0.28)';
  g.lineWidth = 4;
  g.strokeRect(2, 2, W - 4, H - 4);

  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = bonus ? '#ffd76a' : '#fff1cf';
  g.shadowColor = 'rgba(255,170,50,0.85)';
  g.shadowBlur = bonus ? 26 : 14;
  const long = text.length > 2;
  g.font = `800 ${long ? Math.round(H * 0.16) : Math.round(H * 0.30)}px "DejaVu Sans", Arial, sans-serif`;
  const words = text.split(' ');
  words.forEach((w, k) => g.fillText(w, W / 2, H / 2 + (k - (words.length - 1) / 2) * H * (long ? 0.2 : 0)));
  g.shadowBlur = 0;
  const t = texture(c, { aniso: 8 });
  slotCellCache.set(key, t);
  return t;
}

/* ---------------------------------------------------- top slot reel strip */
export function slotStrip(labels, { bonus = -1 } = {}) {
  const cellH = 128;
  const W = 512;
  const H = cellH * labels.length;
  const { c, g } = canvas2d(W, H);
  labels.forEach((lab, i) => {
    const y = i * cellH;
    const grd = g.createLinearGradient(0, y, 0, y + cellH);
    grd.addColorStop(0, '#1b0f16');
    grd.addColorStop(0.5, i === bonus ? '#2a1020' : '#140c12');
    grd.addColorStop(1, '#1b0f16');
    g.fillStyle = grd;
    g.fillRect(0, y, W, cellH);
    g.strokeStyle = 'rgba(255,214,140,0.25)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, y + 1);
    g.lineTo(W, y + 1);
    g.stroke();

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = i === bonus ? '#ffd76a' : '#fff1cf';
    g.shadowColor = 'rgba(255,180,60,0.8)';
    g.shadowBlur = i === bonus ? 26 : 12;
    const long = lab.length > 4;
    g.font = `800 ${long ? 62 : 92}px "DejaVu Sans", Arial, sans-serif`;
    g.fillText(lab, W / 2, y + cellH / 2 + 4);
    g.shadowBlur = 0;
  });
  const t = texture(c, { aniso: 8 });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/* --------------------------------------------------------- neon backdrop */
export function carnivalBackdrop() {
  const W = 2048;
  const H = 1024;
  const { c, g } = canvas2d(W, H);
  const grd = g.createRadialGradient(W / 2, H * 0.42, 40, W / 2, H * 0.5, W * 0.62);
  grd.addColorStop(0, '#5c1330');
  grd.addColorStop(0.35, '#38081f');
  grd.addColorStop(0.7, '#1b0410');
  grd.addColorStop(1, '#06010a');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);

  // radiating carnival rays
  g.save();
  g.globalAlpha = 0.10;
  g.translate(W / 2, H * 0.46);
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    g.fillStyle = i % 2 ? '#ff5b8a' : '#ffc861';
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, W, a, a + (Math.PI * 2) / 72);
    g.closePath();
    g.fill();
  }
  g.restore();

  // dust / bokeh
  for (let i = 0; i < 400; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 1 + Math.random() * 7;
    g.fillStyle = `rgba(255,${180 + Math.random() * 60},140,${0.03 + Math.random() * 0.10})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  // soft vignette
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.95);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.75)');
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
  return texture(c, { aniso: 4 });
}

/* --------------------------------------------------------- soft light pool */
export function softGlow(color = '#ffb46a') {
  const S = 512;
  const { c, g } = canvas2d(S, S);
  const grd = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  grd.addColorStop(0, rgba(color, 0.95));
  grd.addColorStop(0.35, rgba(color, 0.45));
  grd.addColorStop(0.7, rgba(color, 0.12));
  grd.addColorStop(1, rgba(color, 0));
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  return texture(c, { aniso: 4 });
}

/* ------------------------------------------------------- baccarat backdrop */
export function roomBackdrop(tint = '#0a2620') {
  const W = 1024;
  const H = 1024;
  const { c, g } = canvas2d(W, H);
  const grd = g.createRadialGradient(W / 2, H * 0.38, 30, W / 2, H * 0.55, W * 0.7);
  grd.addColorStop(0, shade(tint, 0.35));
  grd.addColorStop(0.45, tint);
  grd.addColorStop(1, '#02050a');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // faint light bloom behind the dealer
  const b = g.createRadialGradient(W / 2, H * 0.34, 10, W / 2, H * 0.36, W * 0.30);
  b.addColorStop(0, 'rgba(255,226,170,0.20)');
  b.addColorStop(1, 'rgba(255,226,170,0)');
  g.fillStyle = b;
  g.fillRect(0, 0, W, H);
  return texture(c, { aniso: 4 });
}
