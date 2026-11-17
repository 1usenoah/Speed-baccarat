/* =========================================================================
   crazytime/studio3d.js — carnival studio: 54-segment money wheel with real
   pegs and a spring flapper, wedding-cake lighting, show host on stage.
   ========================================================================= */
import * as THREE from 'three';
import { makeRenderer, makeEnv, addStudioLights, backdropTexture } from '../shared/studio.js';
import { Dealer } from '../baccarat/dealer.js';
import { CT_WHEEL, CT_LABEL } from '../services/syncEngine.js';

const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const COLORS = {
  n1: ['#1f8f5b', '#136c42'],
  n2: ['#2f6fd0', '#1c4a95'],
  n5: ['#8452c8', '#5c3594'],
  n10: ['#d2492f', '#97271a'],
  cf: ['#e8b53c', '#b3811c'],
  pa: ['#d84a8c', '#9c2a60'],
  ch: ['#2fb6c0', '#1b7d85'],
  ct: ['#ff3d6e', '#a80f36']
};

function wheelTexture() {
  const S = 2048;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const cx = S / 2;
  const cy = S / 2;
  const R = S / 2 - 8;
  const n = CT_WHEEL.length;
  const seg = (Math.PI * 2) / n;

  g.clearRect(0, 0, S, S);
  for (let i = 0; i < n; i++) {
    const a0 = i * seg - Math.PI / 2 - seg / 2;
    const a1 = a0 + seg;
    const type = CT_WHEEL[i];
    const [c0, c1] = COLORS[type];
    const grd = g.createRadialGradient(cx, cy, R * 0.1, cx, cy, R);
    grd.addColorStop(0, c1);
    grd.addColorStop(0.55, c0);
    grd.addColorStop(1, c1);
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, R, a0, a1);
    g.closePath();
    g.fillStyle = grd;
    g.fill();
    g.strokeStyle = 'rgba(255,235,190,0.55)';
    g.lineWidth = 3;
    g.stroke();

    // label
    g.save();
    g.translate(cx, cy);
    g.rotate(a0 + seg / 2);
    g.fillStyle = '#fff8e8';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const label = CT_LABEL[type];
    if (label.length > 3) {
      const parts = label.split(' ');
      g.font = `700 ${Math.round(S * 0.024)}px "DejaVu Sans", Arial, sans-serif`;
      parts.forEach((p, idx) => g.fillText(p, R * 0.72, (idx - (parts.length - 1) / 2) * S * 0.03));
    } else {
      g.font = `800 ${Math.round(S * 0.05)}px "DejaVu Sans", Arial, sans-serif`;
      g.fillText(label, R * 0.68, 0);
    }
    g.restore();
  }

  // gold hub
  const hub = g.createRadialGradient(cx, cy, 10, cx, cy, R * 0.2);
  hub.addColorStop(0, '#ffe8ad');
  hub.addColorStop(0.6, '#d4a94f');
  hub.addColorStop(1, '#7a5a1c');
  g.beginPath();
  g.arc(cx, cy, R * 0.2, 0, Math.PI * 2);
  g.fillStyle = hub;
  g.fill();
  g.strokeStyle = 'rgba(255,240,200,0.8)';
  g.lineWidth = 6;
  g.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export class CrazyStudio {
  constructor(canvas) {
    this.canvas = canvas;
    this.running = true;
    this.spinState = { angle: 0, speed: 0, spinning: false };
    this.pegAcc = 0;
    this.flap = 0;
    this.flapVel = 0;
    this.lastT = performance.now();
    this.init();
  }

  init() {
    const renderer = makeRenderer(this.canvas, { exposure: 1.12 });
    this.renderer = renderer;
    const scene = new THREE.Scene();
    scene.background = backdropTexture('#2a0710', '#060103');
    this.scene = scene;
    const { env } = makeEnv(renderer, 0.6);
    scene.environment = env;
    if ('environmentIntensity' in scene) scene.environmentIntensity = 0.4;

    this.camera = new THREE.PerspectiveCamera(40, 1.6, 0.05, 50);
    addStudioLights(scene, { warm: 0xffd08a, cool: 0xff7fb0, intensity: 1.15 });

    this._buildStudio();
    this._buildWheel();
    this._buildHost();

    this.onResize();
    window.addEventListener('resize', () => this.onResize());
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _buildStudio() {
    const g = new THREE.Group();
    // carnival backdrop: red drapes + gold arches
    const drape = new THREE.Mesh(
      new THREE.CylinderGeometry(6, 6, 8, 32, 1, true, -1.3, 2.6),
      new THREE.MeshStandardMaterial({ color: 0x3d0713, roughness: 0.92, side: THREE.BackSide })
    );
    drape.position.set(0, 2.0, -0.6);
    g.add(drape);

    const goldMat = new THREE.MeshStandardMaterial({ color: 0xe0b45c, metalness: 0.92, roughness: 0.28 });
    for (const x of [-2.3, -0.78, 0.78, 2.3]) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 10, 32, Math.PI), goldMat);
      arch.position.set(x, 2.35, -1.6);
      g.add(arch);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.05, 0.05), goldMat);
    bar.position.set(0, 2.32, -1.6);
    g.add(bar);

    // marquee bulbs
    for (let i = 0; i < 22; i++) {
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 10, 8),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffcf6b : 0xff4d6d })
      );
      bulb.position.set(-2.6 + i * 0.25, 2.62, -1.55);
      g.add(bulb);
    }

    // stage floor
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(2.8, 2.8, 0.12, 48),
      new THREE.MeshStandardMaterial({ color: 0x1a0509, roughness: 0.55, metalness: 0.2 })
    );
    floor.position.set(0, 0.06, 0.2);
    floor.receiveShadow = true;
    g.add(floor);

    this.scene.add(g);
  }

  _buildWheel() {
    const g = new THREE.Group();
    g.position.set(0, 1.15, -0.1);
    g.rotation.x = -0.16;

    const R = 1.15;
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(R, 96),
      new THREE.MeshStandardMaterial({ map: wheelTexture(), roughness: 0.42, metalness: 0.15, emissive: 0x221008, emissiveIntensity: 0.6 })
    );
    face.rotation.x = -Math.PI / 2;
    g.add(face);

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(R, R * 0.96, 0.16, 96),
      new THREE.MeshStandardMaterial({ color: 0x2a0a12, roughness: 0.4, metalness: 0.35 })
    );
    body.position.y = -0.085;
    g.add(body);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(R + 0.03, 0.05, 12, 96),
      new THREE.MeshStandardMaterial({ color: 0xe8bd63, metalness: 0.95, roughness: 0.22 })
    );
    rim.rotation.x = Math.PI / 2;
    g.add(rim);

    // pegs at every segment boundary
    this.pegs = [];
    const n = CT_WHEEL.length;
    const pegMat = new THREE.MeshStandardMaterial({ color: 0xfff0cc, metalness: 0.7, roughness: 0.25, emissive: 0x3a2a10, emissiveIntensity: 0.8 });
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.07, 10), pegMat);
      peg.position.set(Math.cos(a) * (R + 0.02), 0.04, Math.sin(a) * (R + 0.02));
      g.add(peg);
      this.pegs.push(a);
    }

    // centre tower with marquee
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.14, 0.18, 24),
      new THREE.MeshStandardMaterial({ color: 0xd4a94f, metalness: 0.9, roughness: 0.25 })
    );
    tower.position.y = 0.08;
    g.add(tower);

    this.wheel = g;
    this.scene.add(g);

    // flapper: a spring arm above the rim
    const flapPivot = new THREE.Group();
    flapPivot.position.set(0, 1.45, 0.62);
    const armMat = new THREE.MeshStandardMaterial({ color: 0xf2c766, metalness: 0.85, roughness: 0.25 });
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.42), armMat);
    arm.position.z = -0.2;
    flapPivot.add(arm);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), new THREE.MeshStandardMaterial({ color: 0xff5d7a, roughness: 0.3, metalness: 0.4 }));
    tip.position.z = -0.42;
    flapPivot.add(tip);
    this.flapPivot = flapPivot;
    this.flapBase = 0.0;
    this.scene.add(flapPivot);

    // stand
    const stand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.5, 0.9, 20),
      new THREE.MeshStandardMaterial({ color: 0x120409, roughness: 0.7, metalness: 0.3 })
    );
    stand.position.set(0, 0.55, -0.1);
    this.scene.add(stand);
  }

  _buildHost() {
    this.host = new Dealer({ outfit: 'carnival', name: 'AMY', hair: 0x4a2418, hairStyle: 'long', skin: 0xdcab86, lip: 0xd0576a });
    this.host.root.position.set(-1.5, 0.12, 0.55);
    this.host.root.rotation.y = 0.6;
    this.host.look(new THREE.Vector3(0, 1.2, 1.2), 1);
    this.scene.add(this.host.root);
  }

  onResize() {
    const el = this.canvas.parentElement || this.canvas;
    const w = el.clientWidth || 1;
    const h = el.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camera.fov = aspect > 1.4 ? 44 : 50;
    // look down onto the wheel face, host on the left of frame
    if (aspect > 1.4) {
      this.camera.position.set(0, 3.15, 3.05);
      this.camera.lookAt(0, 1.05, -0.2);
    } else {
      this.camera.position.set(0, 3.4, 3.2);
      this.camera.lookAt(0, 1.0, -0.1);
    }
    this.camera.updateProjectionMatrix();
  }

  _loop(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;

    // wheel motion + flapper physics
    if (this.spinState.spinning) {
      const prev = this.wheel.rotation.y;
      this.wheel.rotation.y += this.spinState.speed * dt;
      const moved = Math.abs(this.wheel.rotation.y - prev);
      const segAngle = (Math.PI * 2) / CT_WHEEL.length;
      this.pegAcc += moved / segAngle;
      if (this.pegAcc >= 1) {
        this.pegAcc = 0;
        this.flapVel = Math.min(14, this.spinState.speed * 2.2 + 3);
        if (this.onPeg) this.onPeg(Math.min(1, Math.abs(this.spinState.speed) / 9));
      }
    }
    // spring back flapper
    this.flapVel += (this.flapBase - this.flap) * 90 * dt;
    this.flapVel *= Math.exp(-9 * dt);
    this.flap += this.flapVel * dt;
    this.flapPivot.rotation.x = -this.flap;

    this.host.update(dt);
    if (this.hostIdle === undefined || now - (this.hostIdle || 0) > 3000) {
      this.hostIdle = now;
      const t = Math.random();
      this.host.look(new THREE.Vector3(t > 0.5 ? 0 : -1.2, 1.2, 1.4), 0.9);
    }

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._loop);
  }

  /** spin to a segment index with a natural deceleration */
  async spinTo(segmentIndex, { duration = 7600, onPeg = null } = {}) {
    const n = CT_WHEEL.length;
    const segAngle = (Math.PI * 2) / n;
    // land the chosen segment under the flapper (12 o'clock, +Z of the wheel)
    const targetLocal = -(segmentIndex + 0.5) * segAngle;
    const turns = 5 + Math.random() * 2;
    const start = this.wheel.rotation.y;
    const target = start + turns * Math.PI * 2 + (targetLocal - (start % (Math.PI * 2)));
    this.onPeg = onPeg;
    this.spinState.spinning = true;

    const t0 = performance.now();
    let lastAngle = start;
    await new Promise((resolve) => {
      const step = (now) => {
        const t = Math.min(1, (now - t0) / duration);
        const e = easeOut(t);
        const angle = start + (target - start) * e;
        this.wheel.rotation.y = angle;
        // instantaneous speed for the sound engine
        const dtSec = Math.max(0.008, (now - (this._prevNow || now)) / 1000);
        this.spinState.speed = Math.abs(angle - lastAngle) / dtSec;
        lastAngle = angle;
        this._prevNow = now;
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });

    this.spinState.spinning = false;
    this.spinState.speed = 0;
    this.onPeg = null;
    this.flapVel = 6;
    return true;
  }

  celebrate() {
    const t = performance.now();
    const step = () => {
      const k = (performance.now() - t) / 900;
      this.host.setHandTarget('R', new THREE.Vector3(-1.4, 1.7, 0.9), { weight: Math.min(1, k * 2), grip: 0.1 });
      this.host.setHandTarget('L', new THREE.Vector3(-2.3, 1.6, 0.9), { weight: Math.min(1, k * 2), grip: 0.1 });
      if (k < 1.4) requestAnimationFrame(step);
      else {
        this.host.releaseHand('R');
        this.host.releaseHand('L');
      }
    };
    requestAnimationFrame(step);
  }
}

export { wait };
