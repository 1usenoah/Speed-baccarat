/* =========================================================================
   table3d.js — live baccarat studio: emerald felt with gold inlay, padded
   wood rail, acrylic shoe, discard holder, chip rack, and the dealer who
   deals real cards (reach → lift → flip → place → sweep).
   ========================================================================= */
import * as THREE from 'three';
import { makeRenderer, makeEnv, addStudioLights, backdropTexture, woodTexture } from '../shared/studio.js';
import { Dealer } from './dealer.js';
import { createCard, chipTexture } from './cards3d.js';

const lerp = (a, b, t) => a + (b - a) * t;
function shade(hex, amt) {
  const c = hex.replace('#', '');
  const n = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * (1 + amt))));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * (1 + amt))));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * (1 + amt))));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const LAYOUT = {
  feltW: 2.2,
  feltZFar: -0.72,
  feltZNear: 0.62,
  dealerZ: -0.95,
  dealerY: 0.06,
  shoe: { x: 0.55, z: -0.66 },
  discard: { x: -0.55, z: -0.66 },
  slots: {
    P: [
      { x: -0.365, z: -0.46, rot: 0 },
      { x: -0.235, z: -0.46, rot: 0 },
      { x: -0.3, z: -0.22, rot: Math.PI / 2 }
    ],
    B: [
      { x: 0.235, z: -0.46, rot: 0 },
      { x: 0.365, z: -0.46, rot: 0 },
      { x: 0.3, z: -0.22, rot: Math.PI / 2 }
    ]
  }
};

/* ---------------------------------------------------------- felt artwork */
function feltTexture(tint) {
  const deep = tint ? tint : '#062a20';
  const W = 2048;
  const spanZ = LAYOUT.feltZNear - LAYOUT.feltZFar;
  const H = Math.round((W / LAYOUT.feltW) * spanZ);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const u = W / LAYOUT.feltW;
  const px = (x) => (x + LAYOUT.feltW / 2) * u;
  const pz = (z) => (z - LAYOUT.feltZFar) * u;

  const grd = g.createRadialGradient(px(0), pz(-0.3), 30, px(0), pz(-0.2), W * 0.58);
  grd.addColorStop(0, deep);
  grd.addColorStop(0.42, shade(deep, -0.35));
  grd.addColorStop(1, shade(deep, -0.62));
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);

  for (let i = 0; i < 34000; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.018)' : 'rgba(0,0,0,0.055)';
    g.fillRect(x, y, 2, 1);
  }

  // outer double gold border
  g.strokeStyle = 'rgba(206,170,98,0.5)';
  g.lineWidth = 4;
  g.strokeRect(px(-1.02), pz(-0.66), 2.04 * u, 1.2 * u);
  g.lineWidth = 1.6;
  g.strokeRect(px(-0.985), pz(-0.625), 1.97 * u, 1.13 * u);

  // central arc ornament
  g.strokeStyle = 'rgba(206,170,98,0.3)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(px(0), pz(-0.36), 0.62 * u, Math.PI * 0.05, Math.PI * 0.95, false);
  g.stroke();
  g.lineWidth = 1.4;
  g.beginPath();
  g.arc(px(0), pz(-0.36), 0.78 * u, Math.PI * 0.1, Math.PI * 0.9, false);
  g.stroke();

  // card frames
  const frame = (cx, label, color) => {
    const w = 0.34 * u;
    const h = 0.46 * u;
    const x = px(cx) - w / 2;
    const y = pz(-0.56);
    g.save();
    g.strokeStyle = color;
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(x, y, w, h, 10);
    g.stroke();
    g.globalAlpha = 0.05;
    g.fillStyle = color;
    g.beginPath();
    g.roundRect(x + 6, y + 6, w - 12, h - 12, 8);
    g.fill();
    g.restore();
    g.fillStyle = 'rgba(226,198,142,0.8)';
    g.font = `600 ${Math.round(u * 0.048)}px "DejaVu Sans", Arial, sans-serif`;
    g.textAlign = 'center';
    g.fillText(label, px(cx), pz(-0.585));
  };
  frame(-0.3, 'PLAYER', 'rgba(120,165,235,0.5)');
  frame(0.3, 'BANKER', 'rgba(225,115,125,0.5)');

  // dealer side line + shoe/discard marks
  g.strokeStyle = 'rgba(206,170,98,0.22)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(px(-0.95), pz(-0.68));
  g.lineTo(px(0.95), pz(-0.68));
  g.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export class BaccaratTable {
  constructor(canvas, { profile = null, tableCfg = null } = {}) {
    this.canvas = canvas;
    this.profile = profile;
    this.tableCfg = tableCfg || {};
    this.phase = 'betting';
    this.cards = [];
    this.carried = [];
    this.lastT = performance.now();
    this.autoIdle = true;
    this.gazeTimer = 0;
    this.pendingHighlights = [];
    this.init();
  }

  init() {
    const renderer = makeRenderer(this.canvas, { exposure: 1.12 });
    this.renderer = renderer;
    const scene = new THREE.Scene();
    scene.background = backdropTexture('#0a2620', '#02060a');
    this.scene = scene;

    const { env } = makeEnv(renderer, 0.55);
    scene.environment = env;
    if ('environmentIntensity' in scene) scene.environmentIntensity = 0.34;

    this.camera = new THREE.PerspectiveCamera(42, 1.7, 0.03, 40);
    this.camTarget = new THREE.Vector3(0, -0.18, -0.42);
    this.camDir = new THREE.Vector3(0, 0.42, 1.0).normalize();

    this.lights = addStudioLights(scene, { intensity: 1.08 });

    this._buildRoom();
    this._buildTable();
    this._buildShoe();
    this._buildDiscard();
    this._buildChipRack();

    this.dealer = this._makeDealer(this.profile);
    scene.add(this.dealer.root);
    this.dealer.look(new THREE.Vector3(0, 0.9, 2.2), 1);

    this.onResize();
    window.addEventListener('resize', () => this.onResize());

    this.running = true;
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _makeDealer(profile) {
    const p = profile || {};
    const d = new Dealer({
      outfit: 'tuxedo',
      name: p.name || 'SOFIA',
      skin: p.skin,
      hair: p.hair,
      hairStyle: p.hairStyle,
      suit: p.suit,
      accent: p.accent,
      lip: p.lip
    });
    d.root.position.set(0, LAYOUT.dealerY, LAYOUT.dealerZ);
    return d;
  }

  /** swap the person on duty without rebuilding the room */
  setDealer(profile, { animate = true } = {}) {
    this.profile = profile;
    const old = this.dealer;
    this.dealer = this._makeDealer(profile);
    this.dealer.root.position.set(0, LAYOUT.dealerY - (animate ? 0.35 : 0), LAYOUT.dealerZ);
    this.scene.add(this.dealer.root);
    if (profile) this.dealer.look(new THREE.Vector3(0, 0.9, 2.2), 1);
    if (old) {
      this.scene.remove(old.root);
      old.root.traverse?.((o) => {
        if (o.geometry) o.geometry.dispose();
      });
    }
    if (animate) {
      const t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / 650);
        const e = easeOut(t);
        this.dealer.root.position.y = LAYOUT.dealerY - 0.35 * (1 - e);
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }

  _buildRoom() {
    const g = new THREE.Group();
    // curved studio backdrop
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0a1a17, roughness: 0.98, side: THREE.BackSide, envMapIntensity: 0.2 });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(5.0, 5.0, 6.0, 40, 1, true, -1.35, 2.7), wallMat);
    wall.position.set(0, 1.6, -0.2);
    wall.receiveShadow = true;
    g.add(wall);

    const gold = new THREE.MeshStandardMaterial({ color: 0xc9a55d, metalness: 0.9, roughness: 0.34 });
    // vertical light panels behind the dealer
    for (const x of [-1.15, 1.15]) {
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(0.32, 2.3),
        new THREE.MeshBasicMaterial({ color: 0x27574a, transparent: true, opacity: 0.4 })
      );
      panel.position.set(x, 1.35, -1.62);
      g.add(panel);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 2.3, 0.02), gold);
      strip.position.set(x + (x > 0 ? 0.17 : -0.17), 1.35, -1.6);
      g.add(strip);
    }
    // horizontal gold rail
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.035, 0.05), gold);
    rail.position.set(0, 2.5, -1.62);
    g.add(rail);
    const rail2 = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.02, 0.05), gold);
    rail2.position.set(0, 0.32, -1.66);
    g.add(rail2);

    // hanging lamp above the table
    const lampShade = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 0.28, 28, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x1a1c1e, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide })
    );
    lampShade.position.set(0, 2.42, -0.35);
    g.add(lampShade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff1d4 }));
    bulb.position.set(0, 2.3, -0.35);
    g.add(bulb);

    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 7),
      new THREE.MeshStandardMaterial({ color: 0x0a1210, roughness: 1, side: THREE.DoubleSide })
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, 3.1, -1.2);
    g.add(ceil);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14),
      new THREE.MeshStandardMaterial({ color: 0x030806, roughness: 1, metalness: 0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.68, -1.0);
    floor.receiveShadow = true;
    g.add(floor);

    const backPanel = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 1.6, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x04100c, roughness: 0.98 })
    );
    backPanel.position.set(0, -0.55, -1.06);
    g.add(backPanel);

    this.scene.add(g);
  }

  _buildTable() {
    const g = new THREE.Group();
    const w = LAYOUT.feltW + 0.36;
    const d = LAYOUT.feltZNear - LAYOUT.feltZFar + 0.36;
    const cz = (LAYOUT.feltZFar + LAYOUT.feltZNear) / 2;

    const wood = woodTexture('#2e1a10', '#6b4426');
    const woodMat = new THREE.MeshPhysicalMaterial({
      map: wood, color: 0x2a170d, roughness: 0.62, metalness: 0.08,
      clearcoat: 0.35, clearcoatRoughness: 0.45, envMapIntensity: 0.4
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(w, 0.62, d), woodMat);
    body.position.set(0, -0.33, cz);
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    const leather = new THREE.MeshStandardMaterial({ color: 0x050908, roughness: 0.98, envMapIntensity: 0.2 });
    const apron = new THREE.Mesh(new THREE.BoxGeometry(w + 0.01, 0.42, 0.05), leather);
    apron.position.set(0, -0.3, LAYOUT.feltZNear + 0.185);
    g.add(apron);
    const apronFar = new THREE.Mesh(new THREE.BoxGeometry(w + 0.01, 0.5, 0.05), leather);
    apronFar.position.set(0, -0.34, LAYOUT.feltZFar - 0.185);
    g.add(apronFar);

    // padded rail
    const railMat = new THREE.MeshStandardMaterial({ color: 0x05090a, roughness: 0.92, metalness: 0.0, envMapIntensity: 0.25 });
    const rh = 0.05;
    const specs = [
      { p: [0, rh / 2, LAYOUT.feltZFar - 0.1], s: [w, rh, 0.2] },
      { p: [0, rh / 2, LAYOUT.feltZNear + 0.1], s: [w, rh, 0.2] },
      { p: [-(LAYOUT.feltW / 2 + 0.1), rh / 2, cz], s: [0.2, rh, d] },
      { p: [LAYOUT.feltW / 2 + 0.1, rh / 2, cz], s: [0.2, rh, d] }
    ];
    specs.forEach(({ p, s }) => {
      const r = new THREE.Mesh(new THREE.BoxGeometry(s[0], s[1], s[2]), railMat);
      r.position.set(...p);
      r.castShadow = true;
      r.receiveShadow = true;
      g.add(r);
    });

    // gold piping on the rail
    const gold = new THREE.MeshStandardMaterial({ color: 0xc9a55d, metalness: 0.92, roughness: 0.28 });
    const pipe = new THREE.Mesh(new THREE.BoxGeometry(w - 0.02, 0.008, 0.012), gold);
    pipe.position.set(0, rh - 0.004, LAYOUT.feltZNear + 0.19);
    g.add(pipe);

    const felt = new THREE.Mesh(
      new THREE.PlaneGeometry(LAYOUT.feltW, LAYOUT.feltZNear - LAYOUT.feltZFar),
      new THREE.MeshStandardMaterial({ map: feltTexture(this.tableCfg.felt), roughness: 0.97, metalness: 0 })
    );
    felt.rotation.x = -Math.PI / 2;
    felt.position.set(0, 0.002, cz);
    felt.receiveShadow = true;
    g.add(felt);

    this.scene.add(g);
    this.tableGroup = g;
  }

  _buildShoe() {
    const g = new THREE.Group();
    const { x, z } = LAYOUT.shoe;
    g.position.set(x, 0, z);
    g.rotation.y = -0.3;

    // NOTE: no `transmission` — a full transmissive pass costs a second
    // scene render per frame and is not worth it for one small card shoe.
    const acrylic = new THREE.MeshPhysicalMaterial({
      color: 0xdff8ee, metalness: 0.1, roughness: 0.06,
      transparent: true, opacity: 0.26, depthWrite: false,
      clearcoat: 1, clearcoatRoughness: 0.04,
      envMapIntensity: 1.8, side: THREE.DoubleSide
    });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd8b36a, metalness: 0.95, roughness: 0.22 });

    const W = 0.2, H = 0.13, D = 0.33;
    const c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    const gg = c.getContext('2d');
    gg.fillStyle = '#f4f0e6';
    gg.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 256; i += 3) {
      gg.fillStyle = i % 6 === 0 ? 'rgba(255,255,255,0.95)' : 'rgba(170,164,152,0.5)';
      gg.fillRect(0, i, 64, 1.4);
    }
    const stackTex = new THREE.CanvasTexture(c);
    stackTex.colorSpace = THREE.SRGBColorSpace;

    const stack = new THREE.Mesh(
      new THREE.BoxGeometry(W - 0.035, H * 0.8, D - 0.07),
      new THREE.MeshStandardMaterial({ map: stackTex, roughness: 0.72 })
    );
    stack.position.y = H * 0.44;
    stack.rotation.x = -0.13;
    stack.castShadow = true;
    g.add(stack);
    this.shoeStack = stack;

    const shell = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), acrylic);
    shell.position.y = H / 2;
    g.add(shell);

    const rim = new THREE.Mesh(new THREE.BoxGeometry(W + 0.014, 0.01, D + 0.014), gold);
    rim.position.y = H;
    g.add(rim);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(W - 0.02, 0.006, 0.03), new THREE.MeshStandardMaterial({ color: 0x080d0c, roughness: 0.5 }));
    mouth.position.set(0, H * 0.9, D / 2 - 0.02);
    g.add(mouth);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(W + 0.05, 0.018, D + 0.05), new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.7 }));
    foot.position.y = 0.009;
    g.add(foot);

    this.scene.add(g);
    this.shoeGroup = g;
    g.updateMatrixWorld(true);
    this.shoeDrawPoint = new THREE.Vector3(0, H * 0.94, D / 2 + 0.02).applyMatrix4(g.matrixWorld);
  }

  _buildDiscard() {
    const g = new THREE.Group();
    const { x, z } = LAYOUT.discard;
    g.position.set(x, 0, z);
    g.rotation.y = 0.14;
    const mat = new THREE.MeshPhysicalMaterial({ color: 0x5c3a20, roughness: 0.42, clearcoat: 0.45, metalness: 0.1 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.05, 0.3), mat);
    box.position.y = 0.025;
    box.castShadow = true;
    g.add(box);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.04, 0.26), new THREE.MeshStandardMaterial({ color: 0x0e0a07, roughness: 0.95 }));
    inner.position.y = 0.05;
    g.add(inner);
    const gold = new THREE.MeshStandardMaterial({ color: 0xd8b36a, metalness: 0.95, roughness: 0.28 });
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.006, 0.006), gold);
    lip.position.set(0, 0.057, 0.125);
    g.add(lip);
    this.scene.add(g);
    this.discardPoint = new THREE.Vector3(x, 0.07, z);
  }

  _buildChipRack() {
    const g = new THREE.Group();
    g.position.set(0, 0.0, -0.7);
    const woodMat = new THREE.MeshPhysicalMaterial({ color: 0x3d2414, roughness: 0.42, clearcoat: 0.5 });
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.024, 0.12), woodMat);
    tray.position.y = 0.013;
    tray.castShadow = true;
    tray.receiveShadow = true;
    g.add(tray);

    const colors = [
      ['#e8e6df', '#8f8d86'], ['#c62f3d', '#f0e9dc'], ['#2f6ac6', '#eef2f7'],
      ['#1f7a4d', '#e8f0ea'], ['#20232b', '#d9b45c'], ['#8e3ea8', '#f0e9dc'],
      ['#d9a53a', '#2a2620'], ['#3b3f4a', '#cfd6e2']
    ];
    colors.forEach((c, i) => {
      const n = 3 + Math.floor(Math.random() * 5);
      for (let k = 0; k < n; k++) {
        const chip = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.025, 0.0092, 24),
          new THREE.MeshPhysicalMaterial({
            map: chipTexture(c[0], c[1]), roughness: 0.42, metalness: 0.06, clearcoat: 0.45
          })
        );
        chip.position.set(-0.215 + i * 0.0615, 0.028 + k * 0.0098, 0);
        chip.rotation.y = Math.random() * 0.6;
        chip.castShadow = true;
        g.add(chip);
      }
    });
    this.scene.add(g);
  }

  frameCamera() {
    const el = this.canvas.parentElement || this.canvas;
    const aspect = (el.clientWidth || 1) / (el.clientHeight || 1);
    // Broadcast framing: dealer head near the top, card area just above the
    // UI overlay. Wider screens pull back so the table edges stay in frame.
    const fov = aspect > 1.4 ? 42 : 46;
    const dist = aspect > 1.4 ? 3.0 : 3.1;
    this.camTarget.set(0, aspect > 1.4 ? -0.06 : 0.04, -0.45);
    this.camera.position.set(0, aspect > 1.4 ? 1.05 : 1.12, this.camTarget.z + dist * 0.97);
    this.camera.fov = fov;
    this.camera.lookAt(this.camTarget);
    this.camera.updateProjectionMatrix();
  }

  onResize() {
    const el = this.canvas.parentElement || this.canvas;
    const w = el.clientWidth || 1;
    const h = el.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.frameCamera();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  }

  /* ------------------------------------------------------------- loop */
  _loop(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;

    this.dealer.update(dt);

    for (const c of this.carried) {
      if (c.state !== 'carried') continue;
      const palm = this.dealer.arms[c.hand].hand;
      const wp = new THREE.Vector3(0, -0.062, 0.012).applyMatrix4(palm.matrixWorld);
      c.mesh.position.copy(wp);
      const handQ = new THREE.Quaternion();
      palm.getWorldQuaternion(handQ);
      const carryQ = handQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2)));
      const flatQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, c.slotRot, 0));
      c.mesh.quaternion.copy(carryQ).slerp(flatQ, c.flip);
      c.mesh.position.y += Math.sin(c.flip * Math.PI) * 0.018;
    }

    if (this.autoIdle) {
      this.gazeTimer -= dt;
      if (this.gazeTimer <= 0) {
        this.gazeTimer = 2.4 + Math.random() * 3.6;
        const pick = Math.random();
        if (pick < 0.36) this.dealer.look(new THREE.Vector3(0, 0.9, 2.4), 1);
        else if (pick < 0.62) this.dealer.look(new THREE.Vector3(0.3, 0.04, -0.4), 0.95);
        else if (pick < 0.8) this.dealer.look(new THREE.Vector3(-0.3, 0.04, -0.4), 0.95);
        else this.dealer.look(new THREE.Vector3(0.5, 0.14, -0.62), 0.85);
      }
    }

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._loop);
  }

  /* -------------------------------------------------------- dealing API */
  _slot(side, index) {
    const slots = LAYOUT.slots[side];
    return slots[Math.min(index, slots.length - 1)];
  }

  focusSlot(side, index) {
    const slot = this._slot(side, index);
    this.autoIdle = false;
    this.dealer.look(new THREE.Vector3(slot.x, 0.03, slot.z), 1);
  }

  async dealCard(side, index, cardData, { speed = 1 } = {}) {
    const slot = this._slot(side, index);
    // player cards come from the shoe hand crossing the body; banker from the near hand
    const useHand = side === 'P' ? 'R' : 'R';
    const hand = useHand;
    const slotPos = new THREE.Vector3(slot.x, 0.003, slot.z);

    this.autoIdle = false;
    this.dealer.setLean(1);
    this.dealer.look(this.shoeDrawPoint.clone().add(new THREE.Vector3(0, 0.04, 0)), 1);
    this.dealer.setHandTarget(hand, this.shoeDrawPoint.clone(), {
      weight: 1, grip: 0, roll: hand === 'L' ? -0.55 : 0.55
    });
    await wait(250 / speed);

    const card = createCard(cardData.rank, cardData.suit);
    card.position.copy(this.shoeDrawPoint);
    this.scene.add(card);
    const entry = { mesh: card, hand, state: 'carried', flip: 0, slotRot: slot.rot, data: cardData };
    this.carried.push(entry);

    this.dealer.arms[hand].gripTarget = 1;
    await wait(110 / speed);

    const above = slotPos.clone().add(new THREE.Vector3(0, 0.085, 0.03));
    this.dealer.look(above, 0.85);
    this.dealer.setHandTarget(hand, above, { weight: 1, grip: 1, roll: hand === 'L' ? -0.35 : 0.35 });

    const t0 = performance.now();
    const dur = 320 / speed;
    await new Promise((resolve) => {
      const step = (now) => {
        const t = Math.min(1, (now - t0) / dur);
        entry.flip = easeInOut(Math.max(0, (t - 0.1) / 0.9));
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });

    this.dealer.setHandTarget(hand, slotPos.clone().add(new THREE.Vector3(0, 0.008, 0)), { weight: 1, grip: 0.55 });
    await wait(130 / speed);

    this.scene.attach(card);
    this.carried = this.carried.filter((c) => c !== entry);
    card.position.set(slot.x, 0.0015, slot.z);
    card.quaternion.setFromEuler(new THREE.Euler(0, slot.rot, 0));
    this.cards.push(card);
    this.dealer.arms[hand].gripTarget = 0;
    this.dealer.setHandTarget(hand, this._restHand(hand), { weight: 0 });
    await wait(110 / speed);
    return card;
  }

  _restHand(side) {
    const s = side === 'L' ? -1 : 1;
    return new THREE.Vector3(s * 0.28, 0.42, -0.5);
  }

  async sweep({ speed = 1 } = {}) {
    if (!this.cards.length) return;
    this.dealer.setLean(1);
    this.dealer.look(new THREE.Vector3(-0.2, 0.03, -0.45), 1);
    const first = this.cards[0].position.clone().add(new THREE.Vector3(0.06, 0.03, 0));
    this.dealer.setHandTarget('R', first, { weight: 1, grip: 0.85, roll: 0.55 });
    await wait(210 / speed);

    const end = new THREE.Vector3(-0.5, 0.04, -0.42);
    this.dealer.setHandTarget('R', end, { weight: 1, grip: 0.85 });
    const cards = this.cards.slice();
    const t0 = performance.now();
    const dur = 360 / speed;
    await new Promise((resolve) => {
      const step = (now) => {
        const t = Math.min(1, (now - t0) / dur);
        const e = easeInOut(t);
        cards.forEach((c, i) => {
          const delay = Math.min(0.6, i * 0.07);
          const tt = Math.max(0, Math.min(1, (e - delay) / (1 - delay || 1)));
          c.position.x = lerp(c.position.x, -0.52, tt * 0.9);
          c.position.y = 0.0015 + Math.sin(tt * Math.PI) * 0.004;
        });
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });

    this.dealer.setHandTarget('R', this.discardPoint.clone().add(new THREE.Vector3(0, 0.04, 0)), { weight: 1, grip: 0.9 });
    const t1 = performance.now();
    const dur2 = 300 / speed;
    await new Promise((resolve) => {
      const step = (now) => {
        const t = Math.min(1, (now - t1) / dur2);
        const e = easeOut(t);
        cards.forEach((c) => {
          c.position.lerp(this.discardPoint.clone(), e * 0.92);
          c.scale.setScalar(1 - e * 0.3);
          c.position.y = lerp(c.position.y, 0.055, e);
        });
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });

    cards.forEach((c) => {
      this.scene.remove(c);
      c.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    });
    this.cards = this.cards.filter((c) => !cards.includes(c));
    this.dealer.setHandTarget('R', this._restHand('R'), { weight: 0 });
    this.dealer.setLean(0);
    await wait(150 / speed);
  }

  setPhase(phase) {
    this.phase = phase;
    if (phase === 'betting') {
      this.autoIdle = true;
      this.dealer.setLean(0);
      this.dealer.look(new THREE.Vector3(0, 0.9, 2.4), 1);
      this.gazeTimer = 1.2;
    }
    if (phase === 'closed') {
      this.autoIdle = false;
      this.dealer.look(new THREE.Vector3(0, 0.04, -0.45), 1);
    }
    if (phase === 'result') this.autoIdle = true;
  }

  async celebrate() {
    this.dealer.look(new THREE.Vector3(0, 0.05, -0.45), 1);
    const side = Math.random() > 0.5 ? 'R' : 'L';
    this.dealer.setHandTarget(side, new THREE.Vector3(side === 'R' ? 0.42 : -0.42, 0.5, -0.3), { weight: 1, grip: 0.15 });
    await wait(240);
    this.dealer.setHandTarget(side, this._restHand(side), { weight: 0 });
  }

  clearTable() {
    this.cards.forEach((c) => this.scene.remove(c));
    this.cards = [];
  }
}
