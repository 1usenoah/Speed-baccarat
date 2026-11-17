/* =========================================================================
   crazytime/studio3d.js — the carnival show floor.

   A 54-segment vertical money wheel (not a roulette bowl): the disc stands
   upright on a gold stand, 54 chrome pegs stick out of the rim, and a spring
   loaded flapper rides on top of the pegs at 12 o'clock — every peg strike
   kicks the flapper and fires a tick. Above the wheel sits the two-reel Top
   Slot; beside it stands the photoreal show host.
   ========================================================================= */
import * as THREE from 'three';
import { makeRenderer, makeEnv, addStudioLights, makeComposer, resizeTo, easeOutQuint, easeOutCubic } from '../shared/studio.js';
import { PhotoPerson, contactShadow } from '../shared/billboard.js';
import { ctWheelBase, ctSegmentPlate, carnivalBackdrop, slotStrip, slotCell, softGlow } from '../shared/textures.js';
import { CT_WHEEL, CT_LABEL } from '../services/syncEngine.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const SLOT_A = ['1', '2', '5', '10', 'COIN FLIP', 'PACHINKO', 'CASH HUNT', 'CRAZY TIME'];
const SLOT_B = ['2x', '5x', '10x', '15x', '20x', '25x', '30x', '40x', '50x'];

export class CrazyStudio {
  constructor(canvas) {
    this.canvas = canvas;
    this.running = true;
    this.spin = { angle: 0, speed: 0, active: false };
    this.flap = 0;
    this.flapVel = 0;
    this.pegAcc = 0;
    this.lastT = performance.now();
    this.reelSpin = [0, 0];
    this.init();
  }

  init() {
    const renderer = makeRenderer(this.canvas, { exposure: 1.2 });
    this.renderer = renderer;
    const scene = new THREE.Scene();
    this.scene = scene;
    scene.background = carnivalBackdrop();

    const { env } = makeEnv(renderer, { warm: 0xffcf9a, cool: 0xff7fc0, rim: 0x9fe0ff });
    scene.environment = env;
    if ('environmentIntensity' in scene) scene.environmentIntensity = 0.5;

    this.camera = new THREE.PerspectiveCamera(42, 1.6, 0.1, 70);
    this.lights = addStudioLights(scene, { warm: 0xffd6a5, cool: 0x9fd6ff, accent: 0xff5fa8, intensity: 1.05 });

    this._buildStage();
    this._buildWheel();
    this._buildTopSlot();
    this._buildHost();

    const { composer, bloom } = makeComposer(renderer, scene, this.camera, {
      strength: 0.42, radius: 0.7, threshold: 0.82
    });
    this.composer = composer;
    this.bloom = bloom;

    this.onResize();
    this._onResize = () => this.onResize();
    window.addEventListener('resize', this._onResize);

    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  /* ------------------------------------------------------------ set */
  _buildStage() {
    const g = new THREE.Group();

    // curved carnival backdrop wrapping the whole set
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(9, 9, 10, 48, 1, true, -1.2, 2.4),
      new THREE.MeshBasicMaterial({ map: carnivalBackdrop(), side: THREE.BackSide })
    );
    wall.position.set(0, 3.0, -1.2);
    g.add(wall);

    // stage deck
    const deck = new THREE.Mesh(
      new THREE.CylinderGeometry(3.6, 3.8, 0.34, 64),
      new THREE.MeshPhysicalMaterial({ color: 0x140311, roughness: 0.28, metalness: 0.45, clearcoat: 0.8, clearcoatRoughness: 0.25 })
    );
    deck.position.set(0, -0.17, 0);
    deck.receiveShadow = true;
    g.add(deck);

    // LED ring inset into the deck edge
    const led = new THREE.Mesh(
      new THREE.TorusGeometry(3.58, 0.035, 10, 96),
      new THREE.MeshBasicMaterial({ color: 0xff3f8f })
    );
    led.rotation.x = Math.PI / 2;
    led.position.y = 0.005;
    g.add(led);
    this.led = led;

    // big neon arch behind the wheel
    const neon = new THREE.Mesh(
      new THREE.TorusGeometry(2.25, 0.022, 10, 90, Math.PI),
      new THREE.MeshBasicMaterial({ color: 0xd83f7e })
    );
    neon.position.set(-0.45, 2.20, -1.30);
    g.add(neon);
    const neon2 = new THREE.Mesh(
      new THREE.TorusGeometry(2.52, 0.014, 10, 90, Math.PI),
      new THREE.MeshBasicMaterial({ color: 0xc9a04f })
    );
    neon2.position.set(-0.45, 2.20, -1.34);
    g.add(neon2);

    // chasing marquee bulbs on the arch
    this.bulbs = [];
    const bulbGeo = new THREE.SphereGeometry(0.045, 10, 8);
    for (let i = 0; i <= 26; i++) {
      const a = Math.PI - (i / 26) * Math.PI;
      const mat = new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffd07a : 0xff5f8f });
      const b = new THREE.Mesh(bulbGeo, mat);
      b.scale.setScalar(0.8);
      b.position.set(-0.45 + Math.cos(a) * 2.25, 2.20 + Math.sin(a) * 2.25, -1.24);
      g.add(b);
      this.bulbs.push(b);
    }

    // gold pilasters at the frame edges
    const gold = new THREE.MeshStandardMaterial({ color: 0xe2bd77, metalness: 0.97, roughness: 0.22, envMapIntensity: 1.3 });
    for (const x of [-3.1, 3.1]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 5.2, 24), gold);
      col.position.set(x, 2.4, 0.4);
      g.add(col);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.16, 24), gold);
      cap.position.set(x, 5.0, 0.4);
      g.add(cap);
    }

    // glossy floor under the deck
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ color: 0x070208, roughness: 0.18, metalness: 0.7, envMapIntensity: 0.5 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.34;
    floor.receiveShadow = true;
    g.add(floor);

    // velvet rope barrier in front — also hides the bottom of the host cutout
    const ropeMat = new THREE.MeshPhysicalMaterial({ color: 0x1d0208, roughness: 0.9, sheen: 0.8, sheenColor: new THREE.Color(0x8a1330) });
    const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 2.3, 8, 16), ropeMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(1.85, 0.98, 1.28);
    g.add(bar);
    for (const x of [0.72, 2.98]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.05, 16), gold);
      post.position.set(x, 0.50, 1.28);
      g.add(post);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), gold);
      knob.position.set(x, 1.03, 1.28);
      g.add(knob);
    }

    this.scene.add(g);
    this.set = g;
  }

  /* ---------------------------------------------------------- wheel */
  _buildWheel() {
    const R = 1.30;
    const cx = -0.62;
    const cy = 1.50;

    const group = new THREE.Group();
    group.position.set(cx, cy, 0.0);
    this.wheelGroup = group;

    const segA = (Math.PI * 2) / CT_WHEEL.length;
    const faceTex = ctWheelBase(CT_WHEEL, segA);

    const face = new THREE.Mesh(
      new THREE.CircleGeometry(R, 128),
      new THREE.MeshPhysicalMaterial({
        map: faceTex, roughness: 0.45, metalness: 0.08,
        clearcoat: 0.25, clearcoatRoughness: 0.3, envMapIntensity: 0.45
      })
    );
    face.position.z = 0.098;
    group.add(face);

    // 54 label plates riding on the face (crisp text instead of a painted strip)
    const plateH = R * 0.40;
    const plateW = plateH * (128 / 512);
    for (let i = 0; i < CT_WHEEL.length; i++) {
      const mid = -Math.PI / 2 + i * segA;
      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(plateW, plateH),
        new THREE.MeshBasicMaterial({
          map: ctSegmentPlate(CT_WHEEL[i], CT_LABEL[CT_WHEEL[i]]),
          transparent: true,
          depthWrite: false
        })
      );
      const rad = R * 0.70;
      plate.position.set(Math.cos(mid) * rad, Math.sin(mid) * rad, 0.1002);
      plate.rotation.z = mid - Math.PI / 2;
      group.add(plate);
    }

    // disc body
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(R, R, 0.16, 128),
      new THREE.MeshPhysicalMaterial({ color: 0x23040f, roughness: 0.3, metalness: 0.5, clearcoat: 0.7 })
    );
    body.rotation.x = Math.PI / 2;
    body.position.z = 0.0;
    body.castShadow = true;
    group.add(body);

    // gold rim
    const gold = new THREE.MeshStandardMaterial({ color: 0xe6c073, metalness: 1, roughness: 0.18, envMapIntensity: 1.6 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.005, 0.055, 16, 128), gold);
    rim.position.z = 0.098;
    group.add(rim);

    // 54 chrome pegs sticking out of the rim
    const pegMat = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, metalness: 1, roughness: 0.12, envMapIntensity: 2.2 });
    const pegGeo = new THREE.CylinderGeometry(0.017, 0.019, 0.11, 12);
    const pegCapGeo = new THREE.SphereGeometry(0.021, 12, 10);
    const n = CT_WHEEL.length;
    const seg = (Math.PI * 2) / n;
    this.pegAngles = [];
    for (let j = 0; j < n; j++) {
      const a = Math.PI / 2 + seg / 2 - j * seg;
      const peg = new THREE.Group();
      peg.position.set(Math.cos(a) * (R + 0.03), Math.sin(a) * (R + 0.03), 0.12);
      peg.rotation.z = a - Math.PI / 2;
      const shaft = new THREE.Mesh(pegGeo, pegMat);
      shaft.rotation.x = Math.PI / 2;
      peg.add(shaft);
      const capm = new THREE.Mesh(pegCapGeo, pegMat);
      capm.position.z = 0.055;
      peg.add(capm);
      group.add(peg);
      this.pegAngles.push(a);
    }

    // hub — bezel ring + gold cap (the painted hub stays visible behind it)
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(R * 0.185, 0.018, 12, 64), gold);
    bezel.position.z = 0.102;
    group.add(bezel);
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.075, 32, 24), gold);
    hub.scale.z = 0.55;
    hub.position.z = 0.12;
    group.add(hub);

    this.scene.add(group);

    // ---- stand
    const standMat = new THREE.MeshPhysicalMaterial({ color: 0x1a0410, roughness: 0.28, metalness: 0.55, clearcoat: 0.8 });
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, cy - 0.25, 24), standMat);
    column.position.set(cx, (cy - 0.25) / 2, -0.12);
    column.castShadow = true;
    this.scene.add(column);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.12, 40), standMat);
    foot.position.set(cx, 0.04, -0.12);
    foot.receiveShadow = true;
    this.scene.add(foot);
    const footRing = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.02, 8, 48), gold);
    footRing.rotation.x = Math.PI / 2;
    footRing.position.set(cx, 0.10, -0.12);
    this.scene.add(footRing);

    // ---- flapper: gold arm with a red rubber tip that rides the pegs at 12 o'clock
    const flapPivot = new THREE.Group();
    flapPivot.position.set(cx, cy + R + 0.30, 0.20);
    this.flapPivot = flapPivot;
    this.flapBaseAngle = -0.02;

    const armMat = new THREE.MeshStandardMaterial({ color: 0xe8c378, metalness: 1, roughness: 0.18, envMapIntensity: 1.6 });
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.40, 0.055), armMat);
    arm.position.y = -0.20;
    flapPivot.add(arm);
    const tipMat = new THREE.MeshPhysicalMaterial({ color: 0xd21f3c, roughness: 0.4, metalness: 0.2, clearcoat: 0.6 });
    const tip = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.10, 6, 14), tipMat);
    tip.position.y = -0.40;
    tip.rotation.z = Math.PI / 2;
    flapPivot.add(tip);
    const spring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 20), armMat);
    spring.position.y = -0.02;
    spring.rotation.y = Math.PI / 2;
    flapPivot.add(spring);
    this.scene.add(flapPivot);

    // bracket that holds the flapper
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.16), new THREE.MeshStandardMaterial({ color: 0x241018, metalness: 0.8, roughness: 0.4 }));
    bracket.position.set(cx, cy + R + 0.33, 0.16);
    this.scene.add(bracket);
  }

  /* -------------------------------------------------------- top slot */
  _buildTopSlot() {
    const group = new THREE.Group();
    const y = this.wheelGroup.position.y + 1.30 + 0.62;
    group.position.set(this.wheelGroup.position.x, y, 0.05);

    const gold = new THREE.MeshStandardMaterial({ color: 0xe8c47c, metalness: 1, roughness: 0.16, envMapIntensity: 1.8 });
    const casing = new THREE.MeshPhysicalMaterial({ color: 0x3a1420, roughness: 0.25, metalness: 0.65, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1.4 });

    const W = 1.34, H = 0.62, D = 0.26;
    // open-front housing so the drums are visible through the window
    const backPanel = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.03), casing);
    backPanel.position.z = -D / 2;
    group.add(backPanel);
    const topPanel = new THREE.Mesh(new THREE.BoxGeometry(W, 0.05, D), casing);
    topPanel.position.y = H / 2 - 0.02;
    topPanel.castShadow = true;
    group.add(topPanel);
    const botPanel = new THREE.Mesh(new THREE.BoxGeometry(W, 0.05, D), casing);
    botPanel.position.y = -H / 2 + 0.02;
    group.add(botPanel);
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.05, H, D), casing);
      side.position.x = sx * (W / 2 - 0.02);
      group.add(side);
    }
    // dark interior
    const inner = new THREE.Mesh(
      new THREE.PlaneGeometry(W - 0.08, H - 0.08),
      new THREE.MeshStandardMaterial({ color: 0x0a0206, roughness: 0.9 })
    );
    inner.position.z = -D / 2 + 0.02;
    group.add(inner);

    // gold frame
    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(W + 0.05, 0.05, D + 0.05), gold);
    frameTop.position.y = H / 2;
    group.add(frameTop);
    const frameBot = frameTop.clone();
    frameBot.position.y = -H / 2;
    group.add(frameBot);
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.05, H + 0.05, D + 0.05), gold);
      side.position.x = sx * W / 2;
      group.add(side);
    }

    // "TOP SLOT" marquee
    const marquee = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.13),
      new THREE.MeshBasicMaterial({ map: slotStrip(['TOP SLOT'], {}), color: 0xffd98a, transparent: true })
    );
    marquee.position.set(0, H / 2 + 0.11, 0.03);
    marquee.scale.set(0.78, 0.78, 1);
    group.add(marquee);

    // two reel drums
    this.reels = [];
    const reelR = 0.19;
    const reelLen = 0.38;
    SLOT_A.forEach(() => {});
    [[SLOT_A, -0.30, 7], [SLOT_B, 0.30, 8]].forEach(([labels, x, bonus]) => {
      const drum = new THREE.Group();
      drum.position.set(x, 0, 0);
      const inner = new THREE.Mesh(
        new THREE.CylinderGeometry(reelR, reelR, reelLen, 40, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x24101a, roughness: 0.45, metalness: 0.35, side: THREE.DoubleSide })
      );
      inner.rotation.z = Math.PI / 2;
      drum.add(inner);

      const count = labels.length;
      const sw = (2 * Math.PI * reelR / count) * 0.94;
      const sh = 0.135;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const mat = new THREE.MeshBasicMaterial({ map: slotCell(labels[i], { bonus: i === bonus }) });
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), mat);
        plane.position.set(0, Math.cos(a) * reelR, Math.sin(a) * reelR);
        plane.rotation.x = a - Math.PI / 2;
        drum.add(plane);
      }
      // side caps
      for (const sx of [-1, 1]) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(reelR, reelR, 0.012, 32), gold);
        cap.rotation.z = Math.PI / 2;
        cap.position.x = sx * reelLen / 2;
        drum.add(cap);
      }
      group.add(drum);
      this.reels.push({ drum, count, angle: 0 });
    });

    // glass window in front
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(W - 0.14, H - 0.16),
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.10,
        clearcoat: 1, envMapIntensity: 2, depthWrite: false
      })
    );
    glass.position.z = D / 2 + 0.001;
    group.add(glass);

    // win lamps either side
    this.slotLamps = [];
    for (const sx of [-1, 1]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 10), new THREE.MeshBasicMaterial({ color: 0x552233 }));
      lamp.position.set(sx * (W / 2 - 0.09), H / 2 + 0.11, 0.04);
      group.add(lamp);
      this.slotLamps.push(lamp);
    }

    // the slot hangs from two gold rods
    for (const sx of [-1, 1]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 10), gold);
      rod.position.set(sx * 0.5, H / 2 + 0.28, 0);
      group.add(rod);
    }

    this.scene.add(group);
    this.topSlot = group;
    this.slotHome = y;
  }

  /* ------------------------------------------------------------ host */
  _buildHost() {
    this.host = new PhotoPerson({
      file: 'host_amy.webp',
      height: 1.24,
      x: 1.72,
      y: 0.88 + 0.62, // group origin = plane centre
      z: 0.62
    });
    this.scene.add(this.host.group);
    this.host.load().catch((e) => console.warn('[host photo]', e));

    const sh = contactShadow(0.8, 0.4);
    sh.position.set(1.72, 0.02, 0.95);
    this.hostShadow = sh;
    this.scene.add(sh);

    // warm pool behind the host so she is not a cutout on flat paint
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 2.2),
      new THREE.MeshBasicMaterial({
        map: softGlow('#ff77b0'), transparent: true, opacity: 0.34,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    pool.position.set(1.72, 1.35, 0.40);
    this.hostPool = pool;
    this.scene.add(pool);
  }

  /* ---------------------------------------------------------- camera */
  onResize() {
    const el = this.canvas.parentElement || this.canvas;
    resizeTo(this.renderer, this.camera, el, this.composer);
    const aspect = (el.clientWidth || 1) / (el.clientHeight || 1);
    if (aspect > 1.5) {
      this.camera.fov = 40;
      this.camera.position.set(0.14, 1.62, 6.7);
      this.camera.lookAt(-0.05, 1.56, 0);
    } else if (aspect > 1.05) {
      this.camera.fov = 44;
      this.camera.position.set(0.14, 1.66, 7.4);
      this.camera.lookAt(-0.05, 1.58, 0);
    } else {
      this.camera.fov = 52;
      this.camera.position.set(0.34, 1.72, 7.2);
      this.camera.lookAt(0.02, 1.56, 0);
    }
    // on a narrow screen the host tucks in closer to the wheel
    if (this.host) {
      this.host.baseX = aspect > 1.05 ? 1.72 : 1.16;
      if (this.hostPool) this.hostPool.position.x = this.host.baseX;
      if (this.hostShadow) this.hostShadow.position.x = this.host.baseX;
    }
    this.camera.updateProjectionMatrix();
  }

  /* ------------------------------------------------------------ loop */
  _loop(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    const t = now / 1000;

    // wheel rotation + peg strikes
    if (this.spin.active) {
      const prev = this.wheelGroup.rotation.z;
      this.wheelGroup.rotation.z += this.spin.speed * dt;
      const moved = Math.abs(this.wheelGroup.rotation.z - prev);
      const seg = (Math.PI * 2) / CT_WHEEL.length;
      this.pegAcc += moved / seg;
      while (this.pegAcc >= 1) {
        this.pegAcc -= 1;
        const power = Math.min(1, Math.abs(this.spin.speed) / 11);
        this.flapVel = Math.min(26, 6 + this.spin.speed * 2.6);
        if (this.onPeg) this.onPeg(power, power > 0.68);
      }
    }

    // flapper spring: pulled away from the pegs, then snaps back with a shiver
    this.flapVel += (-this.flap * 120 - this.flapVel * 7.5) * dt;
    this.flap += this.flapVel * dt;
    this.flap = Math.max(-0.02, Math.min(0.62, this.flap));
    this.flapPivot.rotation.z = -this.flap;

    // marquee chase lights
    for (let i = 0; i < this.bulbs.length; i++) {
      const on = (Math.sin(t * 6 - i * 0.55) + 1) * 0.5;
      this.bulbs[i].material.color.setRGB(
        this.bulbs[i].material.color.r,
        this.bulbs[i].material.color.g,
        this.bulbs[i].material.color.b
      );
      this.bulbs[i].scale.setScalar(0.7 + on * 0.7);
    }
    if (this.led) this.led.material.color.setHSL(0.92 + Math.sin(t * 0.7) * 0.04, 0.9, 0.55 + Math.sin(t * 2.2) * 0.06);

    // host idle
    if (this.host) {
      this.host.autoLean = true;
      this.host.update(dt);
    }

    // reel drum spin-down
    this.reels.forEach((r, i) => {
      if (r.target !== undefined) {
        const diff = r.target - r.angle;
        if (Math.abs(diff) > 0.002) {
          r.angle += diff * (1 - Math.exp(-6 * dt));
        } else {
          r.angle = r.target;
          r.target = undefined;
        }
        r.drum.rotation.x = r.angle;
      }
    });

    this.composer.render();
    requestAnimationFrame(this._loop);
  }

  /* ------------------------------------------------------------ spin */
  /**
   * Rotate the disc so `segmentIndex` stops under the flapper at 12 o'clock.
   * Rotation is integrated every frame so the peg strikes stay in sync.
   */
  async spinTo(segmentIndex, { duration = 8100, onPeg = null } = {}) {
    const n = CT_WHEEL.length;
    const seg = (Math.PI * 2) / n;
    // segment i centre sits at geometry angle PI/2 - i*seg; to land at PI/2 the
    // disc must turn by i*seg (plus whole turns for the drama)
    const current = this.wheelGroup.rotation.z;
    const baseTurns = 4 + Math.random() * 1.6;
    const targetLocal = (segmentIndex * seg) % (Math.PI * 2);
    let delta = (targetLocal - (current % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const total = baseTurns * Math.PI * 2 + delta;

    this.onPeg = onPeg;
    this.spin.active = true;
    this.spinStopped = false;

    const start = current;
    const t0 = performance.now();
    let last = start;
    await new Promise((resolve) => {
      const step = (now) => {
        const t = Math.min(1, (now - t0) / duration);
        const e = easeOutQuint(t);
        const angle = start + total * e;
        this.wheelGroup.rotation.z = angle;
        const dtSec = Math.max(0.008, (now - (this._prev || now)) / 1000);
        this.spin.speed = (angle - last) / dtSec;
        last = angle;
        this._prev = now;
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });

    this.spin.active = false;
    this.spin.speed = 0;
    this.onPeg = null;
    // final nudge of the flapper as it drops into the gap between two pegs
    this.flapVel = 9;
    return true;
  }

  /* ------------------------------------------------------- top slot */
  spinTopSlot(labelA, multiplierB) {
    const aIdx = Math.max(0, SLOT_A.indexOf(labelA));
    const bIdx = Math.max(0, SLOT_B.indexOf(`${multiplierB}x`));
    this.reels.forEach((r, i) => {
      const idx = i === 0 ? aIdx : bIdx;
      const turns = 2 + i;
      r.target = r.angle + turns * Math.PI * 2 + (idx / r.count) * Math.PI * 2;
    });
    this.slotWinAt = null;
  }

  markSlotWin(win) {
    const color = win ? 0xffd76a : 0x552233;
    this.slotLamps.forEach((l, i) => {
      l.material.color.setHex(color);
      l.scale.setScalar(win ? 1.5 : 1);
      void i;
    });
  }

  /* -------------------------------------------------------- reaction */
  celebrate() {
    if (!this.host) return;
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 900);
      this.host.lean(0.35 + Math.sin(k * Math.PI * 3) * 0.2);
      if (k < 1) requestAnimationFrame(step);
      else this.host.lean(0.06);
    };
    requestAnimationFrame(step);
  }

  /** the host pulls the rim down and lets go — used when the spin starts */
  pullWheel() {
    if (!this.host) return;
    this.host.lean(0.55);
    setTimeout(() => this.host.lean(0.12), 700);
  }
}

export { wait };
