/* =========================================================================
   cards3d.js — 52 hi-res card faces drawn on canvas (real pip layouts and
   mirrored court cards), a guilloché card back, plus glossy card meshes.
   ========================================================================= */
import * as THREE from 'three';

const CARD_W = 0.198;
const CARD_H = 0.280;
const TEX_W = 620;
const TEX_H = 868;

const RED = '#c8102e';
const BLACK = '#0a0a0d';
const SUIT_GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' };
const isRed = (s) => s === 'H' || s === 'D';

const faceCache = new Map();
let backTexture = null;

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

const PIPS = {
  A: [[0.5, 0.5, 0.34]],
  2: [[0.5, 0.19], [0.5, 0.81]],
  3: [[0.5, 0.19], [0.5, 0.5], [0.5, 0.81]],
  4: [[0.3, 0.19], [0.7, 0.19], [0.3, 0.81], [0.7, 0.81]],
  5: [[0.3, 0.19], [0.7, 0.19], [0.5, 0.5], [0.3, 0.81], [0.7, 0.81]],
  6: [[0.3, 0.19], [0.7, 0.19], [0.3, 0.5], [0.7, 0.5], [0.3, 0.81], [0.7, 0.81]],
  7: [[0.3, 0.19], [0.7, 0.19], [0.5, 0.34], [0.3, 0.5], [0.7, 0.5], [0.3, 0.81], [0.7, 0.81]],
  8: [[0.3, 0.16], [0.7, 0.16], [0.5, 0.32], [0.3, 0.44], [0.7, 0.44], [0.5, 0.58], [0.3, 0.72], [0.7, 0.72], [0.5, 0.86]],
  9: [[0.3, 0.15], [0.7, 0.15], [0.3, 0.36], [0.7, 0.36], [0.5, 0.5], [0.3, 0.64], [0.7, 0.64], [0.3, 0.85], [0.7, 0.85]],
  10: [[0.3, 0.14], [0.7, 0.14], [0.5, 0.28], [0.3, 0.42], [0.7, 0.42], [0.3, 0.58], [0.7, 0.58], [0.5, 0.72], [0.3, 0.86], [0.7, 0.86]]
};

function drawGlyph(g, glyph, x, y, size, color, rotate = false) {
  g.save();
  g.translate(x, y);
  if (rotate) g.rotate(Math.PI);
  g.fillStyle = color;
  g.font = `${size}px "DejaVu Serif", Georgia, serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(glyph, 0, size * 0.04);
  g.restore();
}

function drawCourt(g, rank, suit, color) {
  const cx = TEX_W / 2;
  const cy = TEX_H / 2;
  // mirrored ornamental panel
  for (const flip of [0, 1]) {
    g.save();
    if (flip) {
      g.translate(TEX_W, TEX_H);
      g.rotate(Math.PI);
    }
    // frame
    g.strokeStyle = color;
    g.lineWidth = 5;
    roundRect(g, 92, 108, TEX_W - 184, cy - 84, 16);
    g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.16)';
    g.lineWidth = 2;
    roundRect(g, 104, 120, TEX_W - 208, cy - 108, 12);
    g.stroke();

    // crown / hat motif
    g.fillStyle = color;
    g.beginPath();
    const bx = cx, by = 196;
    g.moveTo(bx - 62, by + 30);
    g.lineTo(bx - 46, by - 26);
    g.lineTo(bx - 12, by + 8);
    g.lineTo(bx, by - 40);
    g.lineTo(bx + 12, by + 8);
    g.lineTo(bx + 46, by - 26);
    g.lineTo(bx + 62, by + 30);
    g.closePath();
    g.fill();
    // head
    g.beginPath();
    g.ellipse(cx, by + 76, 34, 38, 0, 0, Math.PI * 2);
    g.fill();
    // shoulders / robe
    g.beginPath();
    g.moveTo(cx - 78, by + 300);
    g.quadraticCurveTo(cx - 58, by + 120, cx - 20, by + 108);
    g.lineTo(cx + 20, by + 108);
    g.quadraticCurveTo(cx + 58, by + 120, cx + 78, by + 300);
    g.closePath();
    g.fill();
    // robe detail
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx, by + 120);
    g.lineTo(cx, by + 300);
    g.stroke();

    // big rank letter
    g.fillStyle = color;
    g.font = `bold 92px "DejaVu Serif", Georgia, serif`;
    g.textAlign = 'center';
    g.fillText(rank, cx, by + 250);
    // suit emblem in robe
    drawGlyph(g, SUIT_GLYPH[suit], cx - 44, by + 250, 44, color);
    drawGlyph(g, SUIT_GLYPH[suit], cx + 44, by + 250, 44, color);
    g.restore();
  }
  // centre divider
  g.strokeStyle = color;
  g.globalAlpha = 0.5;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(96, cy);
  g.lineTo(TEX_W - 96, cy);
  g.stroke();
  g.globalAlpha = 1;
}

function drawFace(rank, suit) {
  const c = document.createElement('canvas');
  c.width = TEX_W;
  c.height = TEX_H;
  const g = c.getContext('2d');
  g.fillStyle = '#fbfaf6';
  g.fillRect(0, 0, TEX_W, TEX_H);

  // paper fibre
  const img = g.getImageData(0, 0, TEX_W, TEX_H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 6;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);

  // inner hairline border
  g.strokeStyle = 'rgba(30,30,40,0.12)';
  g.lineWidth = 2;
  roundRect(g, 16, 16, TEX_W - 32, TEX_H - 32, 26);
  g.stroke();

  const color = isRed(suit) ? RED : BLACK;
  const glyph = SUIT_GLYPH[suit];

  // corner indices
  for (const corner of [0, 1]) {
    g.save();
    if (corner) {
      g.translate(TEX_W, TEX_H);
      g.rotate(Math.PI);
    }
    g.fillStyle = color;
    g.font = `bold ${rank === '10' ? 86 : 96}px "DejaVu Serif", Georgia, serif`;
    g.textAlign = 'center';
    g.fillText(rank, 76, 108);
    drawGlyph(g, glyph, 76, 186, 62, color);
    g.restore();
  }

  if (['J', 'Q', 'K'].includes(rank)) {
    drawCourt(g, rank, suit, color);
  } else if (rank === 'A') {
    drawGlyph(g, glyph, TEX_W / 2, TEX_H / 2 + 6, 300, color);
  } else {
    const pips = PIPS[rank] || [];
    const size = rank === '10' ? 108 : 118;
    pips.forEach(([px, py]) => {
      drawGlyph(g, glyph, px * TEX_W, py * TEX_H, size, color, py > 0.5);
    });
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function getFaceTexture(rank, suit) {
  const key = rank + suit;
  if (!faceCache.has(key)) faceCache.set(key, drawFace(rank, suit));
  return faceCache.get(key);
}

export function getBackTexture() {
  if (backTexture) return backTexture;
  const c = document.createElement('canvas');
  c.width = TEX_W;
  c.height = TEX_H;
  const g = c.getContext('2d');

  const grd = g.createLinearGradient(0, 0, TEX_W, TEX_H);
  grd.addColorStop(0, '#7c1220');
  grd.addColorStop(0.45, '#b31b2c');
  grd.addColorStop(1, '#6d0f1b');
  g.fillStyle = grd;
  g.fillRect(0, 0, TEX_W, TEX_H);

  // guilloche lattice
  g.save();
  g.globalAlpha = 0.5;
  g.strokeStyle = '#f0c674';
  g.lineWidth = 1.6;
  for (let i = -TEX_H; i < TEX_W + TEX_H; i += 26) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + TEX_H, TEX_H);
    g.stroke();
    g.beginPath();
    g.moveTo(i, TEX_H);
    g.lineTo(i + TEX_H, 0);
    g.stroke();
  }
  g.restore();

  // ornamental frame
  g.strokeStyle = '#e8c37a';
  g.lineWidth = 6;
  roundRect(g, 26, 26, TEX_W - 52, TEX_H - 52, 24);
  g.stroke();
  g.lineWidth = 2;
  roundRect(g, 42, 42, TEX_W - 84, TEX_H - 84, 18);
  g.stroke();

  // centre medallion
  g.save();
  g.translate(TEX_W / 2, TEX_H / 2);
  const rg = g.createRadialGradient(0, 0, 10, 0, 0, 138);
  rg.addColorStop(0, 'rgba(255,220,150,0.34)');
  rg.addColorStop(1, 'rgba(255,220,150,0)');
  g.fillStyle = rg;
  g.beginPath();
  g.arc(0, 0, 138, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#e8c37a';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(0, 0, 96, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#f2d18f';
  g.font = 'bold 62px "DejaVu Serif", Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('SB', 0, 4);
  for (let i = 0; i < 12; i++) {
    g.save();
    g.rotate((i / 12) * Math.PI * 2);
    g.fillStyle = '#e8c37a';
    g.beginPath();
    g.moveTo(0, -112);
    g.lineTo(6, -104);
    g.lineTo(-6, -104);
    g.closePath();
    g.fill();
    g.restore();
  }
  g.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  backTexture = tex;
  return tex;
}

export const CARD_DIMS = { w: CARD_W, h: CARD_H };

const edgeMat = new THREE.MeshStandardMaterial({ color: 0xd8d3c6, roughness: 0.8 });

/** A single glossy card, lying flat (face up, reading toward +Z/camera). */
export function createCard(rank, suit, { backTint = null } = {}) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(CARD_W, 0.0026, CARD_H), edgeMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const faceMat = new THREE.MeshPhysicalMaterial({
    map: getFaceTexture(rank, suit),
    color: 0xded9cd,
    roughness: 0.55,
    metalness: 0.0,
    clearcoat: 0.45,
    clearcoatRoughness: 0.30,
    sheen: 0.2,
    sheenColor: new THREE.Color(0xffffff)
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), faceMat);
  // top of the print faces the camera (near edge), so the corner index reads
  face.rotation.set(-Math.PI / 2, 0, 0);
  face.position.y = 0.0016;
  group.add(face);

  const backMat = new THREE.MeshPhysicalMaterial({
    map: getBackTexture(),
    color: backTint || 0xffffff,
    roughness: 0.3,
    metalness: 0.05,
    clearcoat: 0.9,
    clearcoatRoughness: 0.14
  });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), backMat);
  back.rotation.set(Math.PI / 2, 0, 0);
  back.position.y = -0.0016;
  group.add(back);

  group.userData = { rank, suit, body, face, back };
  return group;
}

/* ---------------- chip trims used on the 3D rail trays ---------------- */
export function chipTexture(color, edgeColor) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  g.fillStyle = color;
  g.beginPath();
  g.arc(128, 128, 124, 0, Math.PI * 2);
  g.fill();
  // edge spots
  g.fillStyle = edgeColor;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.save();
    g.translate(128 + Math.cos(a) * 108, 128 + Math.sin(a) * 108);
    g.rotate(a);
    g.fillRect(-13, -15, 26, 30);
    g.restore();
  }
  g.strokeStyle = 'rgba(255,255,255,0.65)';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(128, 128, 92, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.arc(128, 128, 30, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
