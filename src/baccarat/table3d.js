/* =========================================================================
   baccarat/table3d.js — a live baccarat studio shot on a broadcast camera.

   Set: marble pilasters, a gold backlit feature wall, a velvet felt with the
   full printed layout, an acrylic shoe, chip rack and discard well.
   Cast: a photoreal dealer cutout (AI-generated portrait) who breathes,
   shifts his/her weight and leans in on every deal.
   Action: cards fly out of the shoe, are peeled off the felt corner-first
   (squeeze) and flipped face-up in full 3D.
   ========================================================================= */
import * as THREE from 'three';
import { makeRenderer, makeEnv, addStudioLights, makeComposer, resizeTo, easeOutCubic, easeInOutCubic } from '../shared/studio.js';
import { PhotoPerson, contactShadow } from '../shared/billboard.js';
import { createCard, chipTexture } from './cards3d.js';
import { feltTexture, marbleTexture, marbleWallTexture, softGlow } from '../shared/textures.js';

const lerp = (a, b, t) => a + (b - a) * t;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const LAYOUT = {
  feltW: 2.2,
  feltZFar: -0.72,
  feltZNear: 0.62,
  dealerZ: -1.38,
  dealerY: -0.42,
  shoe: { x: 0.62, z: -0.66 },
  discard: { x: -0.62, z: -0.66 },
  slots: {
    P: [
      { x: -0.52, z: -0.46, rot: 0 },
      { x: -0.24, z: -0.46, rot: 0 },
      { x: -0.38, z: -0.26, rot: Math.PI / 2 }
    ],
    B: [
      { x: 0.24, z: -0.46, rot: 0 },
      { x: 0.52, z: -0.46, rot: 0 },
      { x: 0.38, z: -0.26, rot: Math.PI / 2 }
    ]
  }
};

export class BaccaratTable {
  constructor(canvas, { profile = null, tableCfg = null } = {}) {
    this.canvas = canvas;
    this.profile = profile;
    this.tableCfg = tableCfg || {};
    this.phase = 'betting';
    this.cards = [];
    this.lastT = performance.now();
    this.running = true;
    this.gazeTimer = 0;
    this.init();
  }

  /* ------------------------------------------------------------- boot */
  init() {
    const renderer = makeRenderer(this.canvas, { exposure: 1.0 });
    this.renderer = renderer;
    const scene = new THREE.Scene();
    this.scene = scene;

    const { env } = makeEnv(renderer, { warm: 0xffd2a0, cool: 0x8fd8ff, rim: 0xffb0c0 });
    scene.environment = env;
    if ('environmentIntensity' in scene) scene.environmentIntensity = 0.30;

    this.camera = new THREE.PerspectiveCamera(38, 1.7, 0.05, 60);
    this.lights = addStudioLights(scene, { intensity: 1 });

    // even wash over the felt so the layout never falls into shadow
    const feltWash = new THREE.PointLight(0xfff0d8, 2.6, 7.5, 2);
    feltWash.position.set(0.3, 1.65, 0.35);
    scene.add(feltWash);
    const feltWash2 = new THREE.PointLight(0xffe6c2, 1.3, 6.5, 2);
    feltWash2.position.set(-0.6, 1.35, -0.5);
    scene.add(feltWash2);

    this._buildRoom();
    this._buildTable();
    this._buildShoe();
    this._buildDiscard();
    this._buildChipRack();
    this._buildDealer(this.profile);

    const { composer, bloom } = makeComposer(renderer, scene, this.camera, {
      strength: 0.30, radius: 0.6, threshold: 0.92
    });
    this.composer = composer;
    this.bloom = bloom;

    this.onResize();
    this._onResize = () => this.onResize();
    window.addEventListener('resize', this._onResize);

    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  /* ------------------------------------------------------------ room */
  _buildRoom() {
    const g = new THREE.Group();

    // feature wall — dark fluted marble with a warm backlight
    const wallMat = new THREE.MeshStandardMaterial({
      map: marbleWallTexture(), color: 0x5c5c5c, roughness: 0.55, metalness: 0.25, envMapIntensity: 0.6
    });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.2), wallMat);
    wall.position.set(0, 1.5, -3.7);
    g.add(wall);

    // soft warm pool of light on the wall behind the dealer
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(6.4, 4.8),
      new THREE.MeshBasicMaterial({
        map: softGlow('#c08a44'), transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    pool.position.set(0, 1.15, -3.66);
    g.add(pool);

    const gold = new THREE.MeshStandardMaterial({ color: 0xd9b978, metalness: 0.96, roughness: 0.24, envMapIntensity: 1.2 });

    // marble pilasters
    const marble = new THREE.MeshStandardMaterial({
      map: marbleTexture('#efece3', '#8b8478'), color: 0x7d786e, roughness: 0.3, metalness: 0.05, envMapIntensity: 0.9
    });
    for (const x of [-2.95, 2.95]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 3.4, 28), marble);
      col.position.set(x, 1.1, -2.75);
      col.castShadow = true;
      g.add(col);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.10, 0.52), marble);
      cap.position.set(x, 2.85, -2.75);
      g.add(cap);
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.12, 0.56), marble);
      base.position.set(x, -0.55, -2.75);
      g.add(base);
      // gold fillet rings
      for (const y of [2.72, -0.46]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 8, 28), gold);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(x, y, -2.75);
        g.add(ring);
      }
    }

    // gold arch above the dealer
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.028, 10, 60, Math.PI), gold);
    arch.position.set(0, 1.62, -3.4);
    g.add(arch);
    const arch2 = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.014, 8, 60, Math.PI), gold);
    arch2.position.set(0, 1.62, -3.42);
    g.add(arch2);

    // slim LED light bars framing the feature wall
    for (const x of [-1.52, 1.52]) {
      const blade = new THREE.Mesh(
        new THREE.PlaneGeometry(0.035, 2.3),
        new THREE.MeshBasicMaterial({ color: 0xfff0d2 })
      );
      blade.position.set(x, 1.05, -3.58);
      g.add(blade);
      const bloom = new THREE.Mesh(
        new THREE.PlaneGeometry(0.16, 2.5),
        new THREE.MeshBasicMaterial({ color: 0xffc98a, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      bloom.position.set(x, 1.05, -3.59);
      g.add(bloom);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.022, 2.4, 0.02), gold);
      strip.position.set(x + (x > 0 ? 0.03 : -0.03), 1.05, -3.57);
      g.add(strip);
    }

    // ceiling + floor
    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 10),
      new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 1 })
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, 3.5, -1.2);
    g.add(ceil);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 16),
      new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.35, metalness: 0.5, envMapIntensity: 0.4 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.7, -0.6);
    floor.receiveShadow = true;
    g.add(floor);
    this.floorY = -0.7;

    // hanging lamp above the table — a soft warm practical
    const shade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.30, 0.62, 0.26, 40, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x2a2118, metalness: 0.85, roughness: 0.35, side: THREE.DoubleSide })
    );
    shade.position.set(0, 2.62, -0.35);
    g.add(shade);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff2d8 })
    );
    bulb.position.set(0, 2.52, -0.35);
    g.add(bulb);

    this.scene.add(g);
    this.room = g;
  }

  /* ----------------------------------------------------------- table */
  _buildTable() {
    const g = new THREE.Group();
    const w = LAYOUT.feltW + 0.34;
    const d = LAYOUT.feltZNear - LAYOUT.feltZFar + 0.34;
    const cz = (LAYOUT.feltZFar + LAYOUT.feltZNear) / 2;

    // padded leather rail — rounded, not a box
    const railMat = new THREE.MeshPhysicalMaterial({
      color: 0x0a0d12, roughness: 0.55, metalness: 0.05,
      clearcoat: 0.4, clearcoatRoughness: 0.5, sheen: 0.5, sheenColor: new THREE.Color(0x2a3038)
    });
    const railH = 0.085;
    const railGeoLong = new THREE.CapsuleGeometry(railH / 2, w, 8, 16);
    for (const z of [LAYOUT.feltZFar - 0.19, LAYOUT.feltZNear + 0.19]) {
      const rail = new THREE.Mesh(railGeoLong, railMat);
      rail.rotation.z = Math.PI / 2;
      rail.position.set(0, railH / 2 - 0.01, z);
      rail.castShadow = true;
      rail.receiveShadow = true;
      g.add(rail);
    }
    void d;
    for (const x of [-(LAYOUT.feltW / 2 + 0.19), LAYOUT.feltW / 2 + 0.19]) {
      const rail = new THREE.Mesh(new THREE.CapsuleGeometry(railH / 2, d, 8, 16), railMat);
      rail.rotation.x = Math.PI / 2;
      rail.position.set(x, railH / 2 - 0.01, cz);
      rail.castShadow = true;
      g.add(rail);
    }

    // gold piping
    const gold = new THREE.MeshStandardMaterial({ color: 0xcbab6a, metalness: 0.97, roughness: 0.22 });
    for (const z of [LAYOUT.feltZFar - 0.19, LAYOUT.feltZNear + 0.19]) {
      const pipe = new THREE.Mesh(new THREE.TorusGeometry(0.001, 0.006, 6, 4), gold);
      void pipe;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.012, 0.012), gold);
      bar.position.set(0, railH - 0.012, z + (z > 0 ? 0.03 : -0.03));
      g.add(bar);
    }

    // table body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.66, d),
      new THREE.MeshPhysicalMaterial({ color: 0x120f14, roughness: 0.42, metalness: 0.2, clearcoat: 0.5, clearcoatRoughness: 0.4 })
    );
    body.position.set(0, -0.345, cz);
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    // felt
    const feltMat = new THREE.MeshPhysicalMaterial({
      map: feltTexture({
        tint: this.tableCfg.felt || '#083a2c',
        label: this.tableCfg.name || 'SPEED BACCARAT',
        accent: this.tableCfg.accent || '#1f9c63',
        limits: this.tableCfg.limits || '1K – 500K'
      }),
      roughness: 0.94,
      metalness: 0.0,
      sheen: 0.22,
      sheenColor: new THREE.Color(0x1d4c3c),
      sheenRoughness: 1,
      envMapIntensity: 0.14
    });
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(LAYOUT.feltW, LAYOUT.feltZNear - LAYOUT.feltZFar, 1, 1), feltMat);
    felt.rotation.x = -Math.PI / 2;
    felt.position.set(0, 0.001, cz);
    felt.receiveShadow = true;
    g.add(felt);

    // gold inlay line at the dealer edge
    const inlay = new THREE.Mesh(new THREE.BoxGeometry(LAYOUT.feltW, 0.004, 0.012), gold);
    inlay.position.set(0, 0.004, LAYOUT.feltZFar + 0.02);
    g.add(inlay);

    this.scene.add(g);
    this.tableGroup = g;
  }

  /* ----------------------------------------------------------- props */
  _buildShoe() {
    const g = new THREE.Group();
    const { x, z } = LAYOUT.shoe;
    g.position.set(x, 0, z);
    g.rotation.y = -0.36;

    const acrylic = new THREE.MeshPhysicalMaterial({
      color: 0xe6fff6, metalness: 0.05, roughness: 0.03,
      transparent: true, opacity: 0.20, depthWrite: false,
      clearcoat: 1, clearcoatRoughness: 0.02,
      envMapIntensity: 2.4, side: THREE.DoubleSide
    });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe0bd76, metalness: 0.97, roughness: 0.2, envMapIntensity: 1.3 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xcfd6de, metalness: 1, roughness: 0.18, envMapIntensity: 1.4 });

    const W = 0.21, H = 0.15, D = 0.34;

    // card stack inside
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 512;
    const gg = c.getContext('2d');
    gg.fillStyle = '#f5f1e6';
    gg.fillRect(0, 0, 128, 512);
    for (let i = 0; i < 512; i += 3) {
      gg.fillStyle = i % 6 === 0 ? 'rgba(255,255,255,0.95)' : 'rgba(165,159,146,0.55)';
      gg.fillRect(0, i, 128, 1.5);
    }
    const stackTex = new THREE.CanvasTexture(c);
    stackTex.colorSpace = THREE.SRGBColorSpace;

    const stack = new THREE.Mesh(
      new THREE.BoxGeometry(W - 0.045, H * 0.78, D - 0.08),
      new THREE.MeshStandardMaterial({ map: stackTex, roughness: 0.68 })
    );
    stack.position.set(0, H * 0.42, -0.01);
    stack.rotation.x = -0.16;
    stack.castShadow = true;
    g.add(stack);

    // shell walls (open front so the card can slide out)
    const shell = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), acrylic);
    shell.position.y = H / 2;
    g.add(shell);

    for (const [sx, sy, sz, bw, bh, bd] of [
      [0, H, 0, W + 0.016, 0.012, D + 0.016],
      [0, 0.012, 0, W + 0.03, 0.024, D + 0.03]
    ]) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), gold);
      rim.position.set(sx, sy, sz);
      rim.castShadow = true;
      g.add(rim);
    }
    // chrome roller the cards ride over
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, W - 0.02, 16), chrome);
    roller.rotation.z = Math.PI / 2;
    roller.position.set(0, H * 0.88, D / 2 - 0.03);
    g.add(roller);
    const mouth = new THREE.Mesh(
      new THREE.BoxGeometry(W - 0.03, 0.004, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x05090b, roughness: 0.6 })
    );
    mouth.position.set(0, H * 0.86, D / 2 - 0.012);
    g.add(mouth);

    this.scene.add(g);
    this.shoeGroup = g;
    g.updateMatrixWorld(true);
    this.shoeDrawPoint = new THREE.Vector3(0, H * 0.9, D / 2 + 0.01).applyMatrix4(g.matrixWorld);
  }

  _buildDiscard() {
    const g = new THREE.Group();
    const { x, z } = LAYOUT.discard;
    g.position.set(x, 0, z);
    g.rotation.y = 0.18;
    const wood = new THREE.MeshPhysicalMaterial({ color: 0x2a1a12, roughness: 0.4, clearcoat: 0.5, metalness: 0.1 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.055, 0.32), wood);
    box.position.y = 0.028;
    box.castShadow = true;
    g.add(box);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.045, 0.28), new THREE.MeshStandardMaterial({ color: 0x080706, roughness: 0.95 }));
    inner.position.y = 0.05;
    g.add(inner);
    const gold = new THREE.MeshStandardMaterial({ color: 0xd8bb78, metalness: 0.95, roughness: 0.25 });
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.007, 0.007), gold);
    lip.position.set(0, 0.058, 0.135);
    g.add(lip);
    this.scene.add(g);
    this.discardPoint = new THREE.Vector3(x, 0.075, z);
  }

  _buildChipRack() {
    const g = new THREE.Group();
    g.position.set(0, 0, -0.72);
    const wood = new THREE.MeshPhysicalMaterial({ color: 0x3b2314, roughness: 0.36, clearcoat: 0.6, clearcoatRoughness: 0.3 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xc9a75e, metalness: 0.95, roughness: 0.25 });
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.028, 0.13), wood);
    tray.position.y = 0.014;
    tray.castShadow = true;
    tray.receiveShadow = true;
    g.add(tray);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.006, 0.135), gold);
    edge.position.y = 0.03;
    g.add(edge);

    const colors = [
      ['#eeece4', '#8a8880'], ['#c62f3d', '#f4ece0'], ['#2f6ac6', '#eef2f7'],
      ['#1f7a4d', '#e8f0ea'], ['#20232b', '#d9b45c'], ['#8e3ea8', '#f0e9dc'],
      ['#d9a53a', '#2a2620'], ['#3b3f4a', '#cfd6e2']
    ];
    colors.forEach((c, i) => {
      const n = 3 + Math.floor(Math.random() * 6);
      const mat = new THREE.MeshPhysicalMaterial({
        map: chipTexture(c[0], c[1]), roughness: 0.38, metalness: 0.08, clearcoat: 0.6, clearcoatRoughness: 0.25
      });
      for (let k = 0; k < n; k++) {
        const chip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.0095, 28), mat);
        chip.position.set(-0.245 + i * 0.07 + (Math.random() - 0.5) * 0.004, 0.033 + k * 0.0102, (Math.random() - 0.5) * 0.006);
        chip.rotation.y = Math.random() * 0.8;
        chip.castShadow = true;
        g.add(chip);
      }
    });
    this.scene.add(g);
  }

  /* ---------------------------------------------------------- dealer */
  _buildDealer(profile) {
    const p = profile || {};
    this.dealerPhoto = new PhotoPerson({
      file: `${p.id || 'sofia'}.webp`,
      height: 1.30,
      x: 0,
      y: LAYOUT.dealerY + 0.50, // group origin = plane centre
      z: LAYOUT.dealerZ
    });
    this.scene.add(this.dealerPhoto.group);
    this.dealerPhoto.load().catch((e) => console.warn('[dealer photo]', e));

    // contact shadow under the figure / table
    const sh = contactShadow(1.5, 0.5);
    sh.position.set(0, -0.68, -0.9);
    this.scene.add(sh);
  }

  setDealer(profile) {
    this.profile = profile;
    if (this.dealerPhoto) {
      this.scene.remove(this.dealerPhoto.group);
      this.dealerPhoto.dispose();
    }
    this._buildDealer(profile);
  }

  /* --------------------------------------------------------- camera */
  frameCamera() {
    const el = this.canvas.parentElement || this.canvas;
    const aspect = (el.clientWidth || 1) / (el.clientHeight || 1);
    // Broadcast framing: the felt fills the lower half, the dealer's head and
    // shoulders sit in the upper third, close enough that the cards read.
    if (aspect > 1.55) {
      this.camera.fov = 41;
      this.camera.position.set(0, 2.40, 2.86);
      this.camTarget = new THREE.Vector3(0, 0.10, -0.46);
    } else if (aspect > 1.1) {
      this.camera.fov = 45;
      this.camera.position.set(0, 2.42, 3.00);
      this.camTarget = new THREE.Vector3(0, 0.12, -0.46);
    } else {
      this.camera.fov = 54;
      this.camera.position.set(0, 2.36, 2.90);
      this.camTarget = new THREE.Vector3(0, 0.06, -0.44);
    }
    this.camBase = { pos: this.camera.position.clone(), target: this.camTarget.clone() };
    if (!this._camPos) {
      this._camPos = this.camBase.pos.clone();
      this._camTgt = this.camBase.target.clone();
    }
    this.camera.lookAt(this.camTarget);
    this.camera.updateProjectionMatrix();
  }

  /** push the camera in on a card for the squeeze, then let it drift back */
  setFocus(pos = null, target = null) {
    this.focusPose = pos ? { pos, target } : null;
  }

  onResize() {
    const el = this.canvas.parentElement || this.canvas;
    resizeTo(this.renderer, this.camera, el, this.composer);
    this.frameCamera();
  }

  /* ------------------------------------------------------------ loop */
  _loop(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;

    if (this.dealerPhoto) {
      if (this.autoIdle !== false) {
        this.gazeTimer -= dt;
        if (this.gazeTimer <= 0) {
          this.gazeTimer = 2.6 + Math.random() * 3.4;
          this.dealerPhoto.lean(Math.random() > 0.78 ? 0.22 : 0.05);
        }
      }
      this.dealerPhoto.update(dt);
    }

    // camera drift between the wide shot and the squeeze close-up
    if (this.camBase && this._camPos) {
      const wantP = this.focusPose ? this.focusPose.pos : this.camBase.pos;
      const wantT = this.focusPose ? this.focusPose.target : this.camBase.target;
      const k = 1 - Math.exp(-6.2 * dt);
      this._camPos.lerp(wantP, k);
      this._camTgt.lerp(wantT, k);
      this.camera.position.copy(this._camPos);
      this.camera.lookAt(this._camTgt);
    }

    this.composer.render();
    requestAnimationFrame(this._loop);
  }

  /* -------------------------------------------------------- dealing */
  _slot(side, index) {
    const slots = LAYOUT.slots[side];
    return slots[Math.min(index, slots.length - 1)];
  }

  focusSlot(side) {
    this.autoIdle = false;
    if (this.dealerPhoto) this.dealerPhoto.lean(0.16);
  }

  /**
   * Card out of the shoe → carried over the felt → corner lifted (squeeze)
   * → peeled over and snapped face-up.
   */
  async dealCard(side, index, cardData, { speed = 1 } = {}) {
    const slot = this._slot(side, index);
    const card = createCard(cardData.rank, cardData.suit);
    const from = this.shoeDrawPoint.clone();
    card.position.copy(from);
    card.rotation.set(Math.PI, 0, 0);
    this.scene.add(card);

    if (this.dealerPhoto) this.dealerPhoto.lean(0.55);

    // A — slide out of the shoe along a shallow arc
    const hover = new THREE.Vector3(slot.x, 0.085, slot.z + 0.10);
    const durA = 300 / speed;
    await new Promise((resolve) => {
      const t0 = performance.now();
      const step = (n) => {
        const t = Math.min(1, (n - t0) / durA);
        const e = easeOutCubic(t);
        card.position.lerpVectors(from, hover, e);
        card.position.y = lerp(from.y, hover.y, e) + Math.sin(Math.PI * e) * 0.05;
        card.rotation.z = Math.sin(Math.PI * e) * -0.30;
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });

    // B — the squeeze: the card stands up on its far edge and the near edge
    // peels toward the camera, revealing the face corner by corner
    this.setFocus(
      new THREE.Vector3(slot.x * 0.45 + 0.02, 1.12, slot.z + 1.30),
      new THREE.Vector3(slot.x * 0.82, 0.10, slot.z - 0.02)
    );
    const durB = 780 / speed;
    await new Promise((resolve) => {
      const t0 = performance.now();
      const step = (n) => {
        const t = Math.min(1, (n - t0) / durB);
        const e = easeInOutCubic(t);
        // hinge about the far edge: back stays down, face swings up to camera
        card.rotation.x = Math.PI * (1 - e * 0.86);
        card.rotation.y = Math.sin(t * Math.PI) * 0.10;
        card.rotation.z = lerp(-0.30, 0.02, e) + Math.sin(t * Math.PI * 2) * 0.012;
        card.position.y = lerp(0.085, 0.115, e) + Math.sin(t * Math.PI) * 0.028;
        card.position.z = lerp(slot.z + 0.10, slot.z + 0.035, e);
        card.position.x = lerp(slot.x + (from.x - slot.x) * 0.15, slot.x, e);
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    // hold the reveal so the ink actually registers
    await wait(110 / speed);

    // C — snap flat, face up, with a little bounce
    const durC = 230 / speed;
    await new Promise((resolve) => {
      const t0 = performance.now();
      const step = (n) => {
        const t = Math.min(1, (n - t0) / durC);
        const e = easeInOutCubic(t);
        card.rotation.x = Math.PI * 0.14 * (1 - e);
        card.rotation.y = 0;
        card.rotation.z = lerp(0.02, 0, e);
        card.position.set(
          lerp(slot.x, slot.x, e),
          lerp(0.115, 0.0045, e) + Math.sin(Math.PI * e) * 0.006,
          lerp(slot.z + 0.035, slot.z, e)
        );
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });

    card.rotation.set(0, slot.rot, 0);
    card.position.set(slot.x, 0.0026 + index * 0.0008, slot.z);
    this.cards.push(card);
    if (this.dealerPhoto) this.dealerPhoto.lean(0.1);
    setTimeout(() => this.setFocus(null), 260 / speed);
    return card;
  }

  async sweep({ speed = 1 } = {}) {
    if (!this.cards.length) return;
    if (this.dealerPhoto) this.dealerPhoto.lean(0.5);
    const cards = this.cards.slice();
    const dur = 520 / speed;
    await new Promise((resolve) => {
      const t0 = performance.now();
      const step = (n) => {
        const t = Math.min(1, (n - t0) / dur);
        const e = easeInOutCubic(t);
        cards.forEach((c, i) => {
          const delay = Math.min(0.5, i * 0.06);
          const tt = Math.max(0, Math.min(1, (e - delay) / (1 - delay || 1)));
          c.position.x = lerp(c.position.x, -0.5, tt);
          c.position.y = 0.002 + Math.sin(tt * Math.PI) * 0.02;
          c.position.z = lerp(c.position.z, -0.5, tt * 0.7);
          c.rotation.z = Math.sin(tt * Math.PI) * 0.4;
          c.scale.setScalar(1 - tt * 0.25);
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
    if (this.dealerPhoto) this.dealerPhoto.lean(0.1);
  }

  setPhase(phase) {
    this.phase = phase;
    if (phase === 'betting') {
      this.autoIdle = true;
      if (this.dealerPhoto) this.dealerPhoto.lean(0.04);
      this.gazeTimer = 1.0;
    }
    if (phase === 'closed') {
      this.autoIdle = false;
      if (this.dealerPhoto) this.dealerPhoto.lean(0.35);
    }
    if (phase === 'result') this.autoIdle = true;
  }

  async celebrate() {
    if (!this.dealerPhoto) return;
    this.dealerPhoto.lean(0.62);
    await wait(320);
    this.dealerPhoto.lean(0.1);
  }

  clearTable() {
    this.cards.forEach((c) => this.scene.remove(c));
    this.cards = [];
  }
}
