/* =========================================================================
   shared/studio.js — one renderer/environment recipe shared by both games.
   Warm gold key + emerald rim spotlights, PMREM studio reflections so the
   acrylic shoe, gold trim and metal pegs read as real materials.
   ========================================================================= */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export function makeRenderer(canvas, { exposure = 1.0 } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}

export function makeEnv(renderer, intensity = 0.55) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return { env, intensity };
}

/** soft radial studio backdrop as a canvas texture */
export function backdropTexture(inner = '#0d2b26', outer = '#04070a') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(256, 210, 20, 256, 256, 340);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.55, '#07100f');
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function addStudioLights(scene, { warm = 0xffd9a0, cool = 0x7fd8c0, intensity = 1 } = {}) {
  const amb = new THREE.AmbientLight(0xffffff, 0.34 * intensity);
  scene.add(amb);

  const hemi = new THREE.HemisphereLight(0xfff0d0, 0x0a1412, 0.35 * intensity);
  scene.add(hemi);

  const key = new THREE.SpotLight(warm, 52 * intensity, 14, Math.PI / 4.6, 0.75, 1.5);
  key.position.set(1.4, 4.6, 2.6);
  key.target.position.set(0, 0, -0.6);
  key.castShadow = true;
  key.shadow.mapSize.set(768, 768);
  key.shadow.bias = -0.0009;
  key.shadow.normalBias = 0.02;
  key.shadow.camera.near = 0.6;
  key.shadow.camera.far = 12;
  scene.add(key, key.target);

  const rim = new THREE.SpotLight(cool, 34 * intensity, 16, Math.PI / 4.2, 0.85, 1.8);
  rim.position.set(-2.6, 3.2, -3.4);
  rim.target.position.set(0, 0.9, -0.8);
  scene.add(rim, rim.target);

  const fill = new THREE.PointLight(0xffe6c4, 3.2 * intensity, 9, 2);
  fill.position.set(-1.6, 1.9, 2.6);
  scene.add(fill);

  const back = new THREE.PointLight(0xffb35c, 6 * intensity, 12, 2);
  back.position.set(2.4, 2.4, -3.2);
  scene.add(back);

  return { key, rim, fill, back };
}

/** procedural wood grain for rails */
export function woodTexture(base = '#3a2216', light = '#6b4426') {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 220; i++) {
    const y = Math.random() * c.height;
    g.strokeStyle = `rgba(${120 + Math.random() * 70},${70 + Math.random() * 40},${30 + Math.random() * 25},${0.05 + Math.random() * 0.12})`;
    g.lineWidth = 0.5 + Math.random() * 2.6;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x < c.width; x += 24) {
      g.lineTo(x, y + Math.sin((x + i * 30) * 0.008) * 3 + (Math.random() - 0.5) * 1.6);
    }
    g.stroke();
  }
  const grd = g.createLinearGradient(0, 0, 0, c.height);
  grd.addColorStop(0, 'rgba(255,220,170,0.16)');
  grd.addColorStop(0.45, 'rgba(0,0,0,0)');
  grd.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = grd;
  g.fillRect(0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function resizeTo(renderer, camera, el) {
  const w = el.clientWidth || 1;
  const h = el.clientHeight || 1;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

/** small tween helper: returns a promise */
export function tween(duration, onUpdate, ease = (t) => t) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      onUpdate(ease(t), t);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}
