/* =========================================================================
   shared/studio.js — the broadcast render recipe used by both rooms.

   ACES filmic tone mapping, soft PCF shadows, a PMREM environment built from
   a small warm/cool light-box studio (so gold, satin and acrylic pick up real
   reflections), a three-point lighting rig, and a restrained Unreal bloom —
   the same combination that gives a live-casino feed its glossy look.
   ========================================================================= */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export function makeRenderer(canvas, { exposure = 1.0, alpha = false } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false
  });
  const mobile = Math.min(window.innerWidth, window.innerHeight) < 820;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.9));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}

/**
 * Environment probe: a lit black studio box with warm ceiling soft-boxes and
 * two cold side strips. Cheap to build and gives metals believable highlights.
 */
export function makeEnv(renderer, { warm = 0xffd7a2, cool = 0x9fd8ff, rim = 0xff9ec4, intensity = 1 } = {}) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x050607);

  const room = new THREE.Mesh(
    new THREE.BoxGeometry(14, 8, 14),
    new THREE.MeshBasicMaterial({ color: 0x0a0c0e, side: THREE.BackSide })
  );
  room.position.y = 1.5;
  env.add(room);

  const panel = (w, h, color, pos, rotY = 0, k = 1) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) })
    );
    m.position.set(...pos);
    m.rotation.y = rotY;
    env.add(m);
    return m;
  };
  // warm ceiling soft boxes
  panel(5.5, 3.2, warm, [0, 5.2, 0.2], 0, 1.6);
  env.children[env.children.length - 1].rotation.x = Math.PI / 2;
  panel(2.2, 2.2, 0xfff2dd, [-3.4, 4.2, 2.2], 0.5, 1.2);
  // cool kickers
  panel(4.0, 2.2, cool, [-6.4, 2.2, -1.4], Math.PI / 2, 0.9);
  panel(3.0, 2.0, rim, [6.4, 2.0, 1.2], -Math.PI / 2, 0.75);
  // gold bounce low
  panel(6.0, 1.4, 0xffc27a, [0, 0.4, -6.2], 0, 0.35);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const tex = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  room.geometry.dispose();
  room.material.dispose();
  return { env: tex, intensity };
}

/** three-point rig + practicals */
export function addStudioLights(scene, {
  warm = 0xffd9a0, cool = 0x8fd6ff, accent = 0xff8fbf, intensity = 1
} = {}) {
  scene.add(new THREE.AmbientLight(0xd8e6ff, 0.055 * intensity));
  scene.add(new THREE.HemisphereLight(0xffeedd, 0x05080c, 0.14 * intensity));

  // KEY — warm, high, camera left, casts the shadows
  const key = new THREE.SpotLight(warm, 26 * intensity, 18, THREE.MathUtils.degToRad(30), 0.55, 1.6);
  key.position.set(-2.1, 4.4, 3.1);
  key.target.position.set(0, 0.2, -0.6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.018;
  key.shadow.camera.near = 0.8;
  key.shadow.camera.far = 14;
  key.shadow.radius = 3;
  scene.add(key, key.target);

  // FILL — soft, camera right, no shadow
  const fill = new THREE.SpotLight(0xfff0dd, 7 * intensity, 14, THREE.MathUtils.degToRad(40), 0.9, 1.8);
  fill.position.set(2.9, 2.2, 2.6);
  fill.target.position.set(0, 0.3, -0.8);
  scene.add(fill, fill.target);

  // RIM — cold back light to separate heads from the wall
  const rim = new THREE.SpotLight(cool, 20 * intensity, 16, THREE.MathUtils.degToRad(38), 0.85, 1.8);
  rim.position.set(2.2, 3.4, -3.2);
  rim.target.position.set(0, 1.0, -0.6);
  scene.add(rim, rim.target);

  // ACCENT wash behind the set
  const accentLight = new THREE.PointLight(accent, 3 * intensity, 12, 2);
  accentLight.position.set(-2.6, 1.8, -3.4);
  scene.add(accentLight);

  return { key, fill, rim, accent: accentLight };
}

/** composer: MSAA-less HDR bloom + ACES output */
export function makeComposer(renderer, scene, camera, { strength = 0.34, radius = 0.55, threshold = 0.9 } = {}) {
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(size.x * 0.5, size.y * 0.5), strength, radius, threshold
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return { composer, bloom };
}

/* ------------------------------------------------------------------ misc */
export function resizeTo(renderer, camera, el, composer = null) {
  const w = Math.max(1, el.clientWidth);
  const h = Math.max(1, el.clientHeight);
  renderer.setSize(w, h, false);
  if (composer) composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

export function tween(duration, onUpdate, ease = (t) => t, raf = requestAnimationFrame) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      onUpdate(ease(t), t);
      if (t < 1) raf(step);
      else resolve();
    };
    raf(step);
  });
}

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
