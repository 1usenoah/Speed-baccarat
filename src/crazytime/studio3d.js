/* =========================================================================
   crazytime/studio3d.js — the carnival show floor.

   A 54-segment vertical money wheel (not a roulette bowl): the disc stands
   upright on a gold stand, 54 brass pins stick out of the cream rim, and a
   spring-loaded flapper rides on top of the pegs at 12 o'clock — every peg
   strike kicks the flapper and fires a tick. Beside it stands the show host,
   and behind everything sits the painted carnival set (Crazy Time door,
   Coin Flip / Pachinko / Cash Hunt gates, marquee bulbs).
   The Top Slot is a broadcast overlay (DOM) above the wheel.
   ========================================================================= */
import * as THREE from 'three';
import { makeRenderer, makeEnv, addStudioLights, makeComposer, resizeTo, easeOutQuint } from '../shared/studio.js';
import { PhotoPerson, contactShadow } from '../shared/billboard.js';
import { softGlow } from '../shared/textures.js';
import { ctWheelFace, ctStudioMural } from './wheelart.js';
import { CT_WHEEL } from '../services/syncEngine.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class CrazyStudio {
  constructor(canvas) {
    this.canvas = canvas;
    this.running = true;
    this.spin = { angle: 0, speed: 0, active: false };
    this.flap = 0;
    this.flapVel = 0;
    this.pegAcc = 0;
    this.lastT = performance.now();
    this.init();
  }

  init() {
    const renderer = makeRenderer(this.canvas, { exposure: 1.24 });
    this.renderer = renderer;
    const scene = new THREE.Scene();
    this.scene = scene;
    this.mural = ctStudioMural();
    scene.background = this.mural;

    const { env } = makeEnv(renderer, { warm: 0xffd9a8, cool: 0xff86c0, rim: 0x9fe0ff });
    scene.environment = env;
    if ('environmentIntensity' in scene) scene.environmentIntensity = 0.62;

    this.camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 70);
    this.lights = addStudioLights(scene, { warm: 0xffd6a5, cool: 0x9fd6ff, accent: 0xff5fa8, intensity: 1.18 });

    this._buildStage();
    this._buildWheel();
    this._buildHost();

    const { composer, bloom } = makeComposer(renderer, scene, this.camera, {
      strength: 0.5, radius: 0.72, threshold: 0.78
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

    // painted carnival backdrop: a flat mural that fills whatever the camera
    // frame is, so the gates and the CRAZY TIME door always sit where they should
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.mural, depthWrite: false })
    );
    backdrop.renderOrder = -1;
    g.add(backdrop);
    this.backdrop = backdrop;

    // stage deck
    const deck = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.4, 0.30, 64),
      new THREE.MeshPhysicalMaterial({ color: 0x1a0410, roughness: 0.26, metalness: 0.5, clearcoat: 0.9, clearcoatRoughness: 0.22 })
    );
    deck.position.set(0, -0.15, 0);
    deck.receiveShadow = true;
    g.add(deck);

    // LED ring inset into the deck edge
    const led = new THREE.Mesh(
      new THREE.TorusGeometry(3.19, 0.032, 10, 128),
      new THREE.MeshBasicMaterial({ color: 0xffc257 })
    );
    led.rotation.x = Math.PI / 2;
    led.position.y = 0.006;
    g.add(led);
    this.led = led;

    const gold = new THREE.MeshStandardMaterial({ color: 0xe8c98a, metalness: 1, roughness: 0.2, envMapIntensity: 1.5 });

    // big gold arch over the wheel, studded with chasing bulbs
    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(1.86, 0.036, 12, 120, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0xe8c98a, metalness: 1, roughness: 0.22, envMapIntensity: 1.6 })
    );
    arch.position.set(-0.55, 1.98, -0.85);
    g.add(arch);

    this.bulbs = [];
    const bulbGeo = new THREE.SphereGeometry(0.033, 12, 10);
    for (let i = 0; i <= 28; i++) {
      const a = (i / 28) * Math.PI;
      const mat = new THREE.MeshBasicMaterial({ color: 0xffe3a4 });
      const b = new THREE.Mesh(bulbGeo, mat);
      b.position.set(-0.55 + Math.cos(a) * 1.86, 1.98 + Math.sin(a) * 1.86, -0.82);
      g.add(b);
      this.bulbs.push(b);
    }

    // glossy floor under the deck
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ color: 0x0a0207, roughness: 0.16, metalness: 0.75, envMapIntensity: 0.55 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.30;
    floor.receiveShadow = true;
    g.add(floor);

    // velvet rope in front of the host
    const ropeMat = new THREE.MeshPhysicalMaterial({ color: 0x2a030b, roughness: 0.9, sheen: 0.8, sheenColor: new THREE.Color(0x9c1533) });
    const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 2.0, 8, 16), ropeMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(1.9, 0.94, 1.30);
    g.add(bar);
    for (const x of [0.9, 2.9]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.058, 1.0, 16), gold);
      post.position.set(x, 0.48, 1.30);
      g.add(post);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), gold);
      knob.position.set(x, 0.99, 1.30);
      g.add(knob);
    }

    this.scene.add(g);
    this.set = g;
  }

  /* ---------------------------------------------------------- wheel */
  _buildWheel() {
    const R = 1.30;
    const cx = -0.55;
    const cy = 1.30;

    const group = new THREE.Group();
    group.position.set(cx, cy, 0.0);
    this.wheelGroup = group;

    const segA = (Math.PI * 2) / CT_WHEEL.length;
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(R, 160),
      new THREE.MeshPhysicalMaterial({
        map: ctWheelFace(CT_WHEEL, segA),
        roughness: 0.42, metalness: 0.05,
        clearcoat: 0.35, clearcoatRoughness: 0.28, envMapIntensity: 0.4
      })
    );
    face.position.z = 0.10;
    group.add(face);

    // disc body
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(R, R, 0.17, 128),
      new THREE.MeshPhysicalMaterial({ color: 0x2b0510, roughness: 0.3, metalness: 0.5, clearcoat: 0.7 })
    );
    body.rotation.x = Math.PI / 2;
    body.position.z = 0.0;
    body.castShadow = true;
    group.add(body);

    // gold edge of the disc
    const gold = new THREE.MeshStandardMaterial({ color: 0xf0d59b, metalness: 1, roughness: 0.16, envMapIntensity: 1.8 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.008, 0.036, 16, 160), gold);
    rim.position.z = 0.10;
    group.add(rim);

    // 54 brass pins on the rim
    const pegMat = new THREE.MeshStandardMaterial({ color: 0xf4d79c, metalness: 1, roughness: 0.14, envMapIntensity: 2.2 });
    const pegGeo = new THREE.CylinderGeometry(0.016, 0.018, 0.115, 12);
    const pegCapGeo = new THREE.SphereGeometry(0.02, 12, 10);
    const n = CT_WHEEL.length;
    const seg = (Math.PI * 2) / n;
    this.pegAngles = [];
    for (let j = 0; j < n; j++) {
      const a = Math.PI / 2 + seg / 2 - j * seg;
      const peg = new THREE.Group();
      peg.position.set(Math.cos(a) * (R + 0.01), Math.sin(a) * (R + 0.01), 0.13);
      peg.rotation.z = a - Math.PI / 2;
      const shaft = new THREE.Mesh(pegGeo, pegMat);
      shaft.rotation.x = Math.PI / 2;
      peg.add(shaft);
      const capm = new THREE.Mesh(pegCapGeo, pegMat);
      capm.position.z = 0.058;
      peg.add(capm);
      group.add(peg);
      this.pegAngles.push(a);
    }

    // thin gold bezel on the hub edge (the CRAZY TIME badge itself is painted)
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(R * 0.312, 0.012, 12, 72), gold);
    bezel.position.z = 0.104;
    group.add(bezel);

    this.scene.add(group);

    // ---- stand
    const standMat = new THREE.MeshPhysicalMaterial({ color: 0x240510, roughness: 0.26, metalness: 0.6, clearcoat: 0.85 });
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.28, cy - 0.22, 24), standMat);
    column.position.set(cx, (cy - 0.22) / 2, -0.12);
    column.castShadow = true;
    this.scene.add(column);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.70, 0.12, 48), standMat);
    foot.position.set(cx, 0.04, -0.12);
    foot.receiveShadow = true;
    this.scene.add(foot);
    const footRing = new THREE.Mesh(new THREE.TorusGeometry(0.63, 0.02, 8, 48), gold);
    footRing.rotation.x = Math.PI / 2;
    footRing.position.set(cx, 0.10, -0.12);
    this.scene.add(footRing);

    // ---- flapper: gold arm with a red rubber tip riding the pins at 12 o'clock
    const flapPivot = new THREE.Group();
    flapPivot.position.set(cx, cy + R + 0.33, 0.22);
    this.flapPivot = flapPivot;
    this.flapBaseAngle = -0.02;

    const armMat = new THREE.MeshStandardMaterial({ color: 0xf0d59b, metalness: 1, roughness: 0.18, envMapIntensity: 1.7 });
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.40, 0.05), armMat);
    arm.position.y = -0.20;
    flapPivot.add(arm);
    const tipMat = new THREE.MeshPhysicalMaterial({ color: 0xd21f3c, roughness: 0.38, metalness: 0.2, clearcoat: 0.65 });
    const tip = new THREE.Mesh(new THREE.CapsuleGeometry(0.034, 0.10, 6, 14), tipMat);
    tip.position.y = -0.40;
    tip.rotation.z = Math.PI / 2;
    flapPivot.add(tip);
    const spring = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.011, 8, 20), armMat);
    spring.position.y = -0.02;
    spring.rotation.y = Math.PI / 2;
    flapPivot.add(spring);
    this.scene.add(flapPivot);

    const bracket = new THREE.Mesh(
      new THREE.BoxGeometry(0.20, 0.055, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x2c1018, metalness: 0.85, roughness: 0.38 })
    );
    bracket.position.set(cx, cy + R + 0.36, 0.18);
    this.scene.add(bracket);
  }

  /* ------------------------------------------------------------ host */
  _buildHost() {
    this.host = new PhotoPerson({
      file: 'host_amy.webp',
      height: 1.30,
      x: 1.66,
      y: 0.90 + 0.65,
      z: 0.55
    });
    this.scene.add(this.host.group);
    this.host.load().catch((e) => console.warn('[host photo]', e));

    const sh = contactShadow(0.8, 0.4);
    sh.position.set(1.66, 0.02, 0.92);
    this.hostShadow = sh;
    this.scene.add(sh);

    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 1.9),
      new THREE.MeshBasicMaterial({
        map: softGlow('#ff8ec2'), transparent: true, opacity: 0.30,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    pool.position.set(1.66, 1.32, 0.36);
    this.hostPool = pool;
    this.scene.add(pool);
  }

  /* ---------------------------------------------------------- camera */
  onResize() {
    const el = this.canvas.parentElement || this.canvas;
    resizeTo(this.renderer, this.camera, el, this.composer);
    const aspect = (el.clientWidth || 1) / (el.clientHeight || 1);
    if (aspect > 1.5) {
      // broadcast framing: wheel fills the middle, host at the right edge
      this.camera.fov = 38;
      this.camera.position.set(0.16, 1.62, 5.60);
      this.camera.lookAt(-0.08, 1.34, 0);
    } else if (aspect > 1.05) {
      this.camera.fov = 42;
      this.camera.position.set(0.16, 1.66, 6.35);
      this.camera.lookAt(-0.06, 1.36, 0);
    } else {
      this.camera.fov = 50;
      this.camera.position.set(0.02, 1.74, 7.35);
      this.camera.lookAt(-0.42, 1.52, 0);
    }
    this._fitBackdrop();
    if (this.host) {
      this.host.baseX = aspect > 1.05 ? 1.66 : 1.02;
      if (this.hostPool) this.hostPool.position.x = this.host.baseX;
      if (this.hostShadow) this.hostShadow.position.x = this.host.baseX;
    }
    this.camera.updateProjectionMatrix();
  }

  /** stretch the backdrop to cover the frame (like background-size: cover) */
  _fitBackdrop() {
    if (!this.backdrop) return;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const d = 13.2;
    this.backdrop.position.copy(this.camera.position).addScaledVector(dir, d);
    this.backdrop.quaternion.copy(this.camera.quaternion);
    const h = 2 * d * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const w = h * this.camera.aspect;
    const imgA = 16 / 9;
    let pw;
    let ph;
    if (w / h > imgA) { pw = w; ph = w / imgA; } else { ph = h; pw = h * imgA; }
    this.backdrop.scale.set(pw * 1.02, ph * 1.02, 1);
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

    // flapper spring: pulled away from the pins, then snaps back with a shiver
    this.flapVel += (-this.flap * 120 - this.flapVel * 7.5) * dt;
    this.flap += this.flapVel * dt;
    this.flap = Math.max(-0.02, Math.min(0.62, this.flap));
    this.flapPivot.rotation.z = -this.flap;

    // chasing bulbs on the arch
    for (let i = 0; i < this.bulbs.length; i++) {
      const on = (Math.sin(t * 6 - i * 0.5) + 1) * 0.5;
      this.bulbs[i].scale.setScalar(0.62 + on * 0.75);
      this.bulbs[i].material.color.setHSL(0.11, 0.75, 0.45 + on * 0.42);
    }
    if (this.led) this.led.material.color.setHSL(0.11, 0.85, 0.5 + Math.sin(t * 2.2) * 0.08);

    if (this.host) {
      this.host.autoLean = true;
      this.host.update(dt);
    }

    this.composer.render();
    requestAnimationFrame(this._loop);
  }

  /* ------------------------------------------------------------ spin */
  /**
   * Rotate the disc so `segmentIndex` stops under the flapper at 12 o'clock.
   * Rotation is integrated every frame so the peg strikes stay in sync.
   */
  async spinTo(segmentIndex, { duration = 8100, onPeg = null } = {}) {
    const seg = (Math.PI * 2) / CT_WHEEL.length;
    const current = this.wheelGroup.rotation.z;
    const baseTurns = 4 + Math.random() * 1.6;
    const targetLocal = (segmentIndex * seg) % (Math.PI * 2);
    const delta = (targetLocal - (current % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const total = baseTurns * Math.PI * 2 + delta;

    this.onPeg = onPeg;
    this.spin.active = true;

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
    this.flapVel = 9;
    return true;
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
