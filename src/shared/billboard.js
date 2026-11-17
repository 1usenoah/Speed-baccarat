/* =========================================================================
   shared/billboard.js — a photographed (AI-generated, chroma-keyed) person
   standing inside the 3D set.

   The cutout keeps its own studio lighting so it reads as a live camera feed.
   A single-plane billboard is used with a very light parallax-free camera, and
   the figure is animated with breathing, weight shift and a lean-in for the
   dealing / hosting beats.
   ========================================================================= */
import * as THREE from 'three';

const BASE = (import.meta.env && import.meta.env.BASE_URL) || '/';

export class PhotoPerson {
  constructor({ file, height = 1.35, x = 0, y = -0.45, z = -1.35, tint = 0xffffff, opacity = 1 } = {}) {
    this.height = height;
    this.file = file;
    this.baseY = y;
    this.baseX = x;
    this.group = new THREE.Group();
    this.group.position.set(x, y, z);
    this.phase = Math.random() * Math.PI * 2;
    this.leanAmount = 0;
    this.leanTarget = 0;
    this.bob = 0;
    this.ready = false;

    this.uniforms = {
      map: { value: null },
      tint: { value: new THREE.Color(tint) },
      opacity: { value: opacity },
      warmth: { value: 0.0 }
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D map;
        uniform vec3 tint;
        uniform float opacity;
        uniform float warmth;
        varying vec2 vUv;
        void main() {
          vec4 c = texture2D(map, vUv);
          // kill the faint keying haze so the cutout never shows as a rectangle
          float a = smoothstep(0.03, 0.16, c.a);
          if (a < 0.02) discard;
          vec3 rgb = c.rgb * tint;
          // filmic grade: slight warm lift in the mid-tones like a live feed
          rgb = pow(rgb, vec3(0.96));
          rgb += vec3(0.012, 0.006, 0.0) * warmth;
          gl_FragColor = vec4(rgb, a * opacity);
        }
      `
    });

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    this._applySize(0.62);
  }

  _applySize(aspect) {
    this.aspect = aspect;
    this.mesh.scale.set(this.height * aspect, this.height, 1);
  }

  async load() {
    const url = BASE + 'dealers/' + this.file;
    const tex = await new THREE.TextureLoader().loadAsync(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.uniforms.map.value = tex;
    this._applySize(tex.image.width / tex.image.height);
    this.ready = true;
    return this;
  }

  setTint(hex) { this.uniforms.tint.value.set(hex); }

  /** lean toward the table / wheel: 0 = upright, 1 = full lean */
  lean(v) { this.leanTarget = v; }

  update(dt) {
    this.phase += dt;
    const t = this.phase;
    this.leanAmount += (this.leanTarget - this.leanAmount) * (1 - Math.exp(-4.5 * dt));
    // breathing: the chest and shoulders rise a hair, the head floats
    const breath = Math.sin(t * 1.15) * 0.5 + 0.5;
    const sway = Math.sin(t * 0.42) * 0.006;
    this.group.position.y = this.baseY + breath * 0.004 - this.leanAmount * 0.012;
    this.group.position.x = this.baseX + sway;
    this.group.rotation.z = sway * 0.35;
    this.group.rotation.x = -this.leanAmount * 0.02;
    this.mesh.scale.y = this.height * (1 + breath * 0.0025);
    this.mesh.position.z = this.leanAmount * 0.05;
    this.mesh.position.y = this.leanAmount * 0.004;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    if (this.uniforms.map.value) this.uniforms.map.value.dispose();
  }
}

/* Small helper: a soft radial dark blob used as a contact shadow. */
export function contactShadow(radius = 0.9, strength = 0.55) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  grd.addColorStop(0, `rgba(0,0,0,${strength})`);
  grd.addColorStop(0.55, `rgba(0,0,0,${strength * 0.45})`);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}
