/* =========================================================================
   dealer.js — procedural live-casino dealer, rebuilt to human proportions:
   hips 0.95m, shoulders at 40cm across, 1.7m tall. Articulated spine with
   lean/twist, two-bone IK arms, wrist + fingers, breathing, blink, gaze.
   ========================================================================= */
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt));
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const smoothstep = (t) => t * t * (3 - 2 * t);

function capsule(r, len, mat, radial = 16) {
  const g = new THREE.CapsuleGeometry(r, len, 8, radial);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export class Dealer {
  constructor({ outfit = 'tuxedo', skin = 0xc9976f, hair = 0x2a1a12, name = 'SOFIA', hairStyle = 'bun', suit = null, accent = null, lip = null } = {}) {
    this.hairStyle = hairStyle;
    this.customSuit = suit;
    this.customAccent = accent;
    this.customLip = lip;
    this.outfit = outfit;
    this.name = name;
    this.root = new THREE.Group();
    this.time = 0;
    this.blinkT = 1.6 + Math.random() * 2.5;
    this.blink = 0;
    this.gaze = { yaw: 0, pitch: 0, tyaw: 0, tpitch: 0, weight: 0 };
    this.lean = 0;
    this.leanTarget = 0;
    this.twist = 0;
    this.twistTarget = 0;
    this.breathPhase = Math.random() * Math.PI * 2;
    this.swayPhase = Math.random() * Math.PI * 2;

    this.skinMat = new THREE.MeshPhysicalMaterial({
      color: skin, roughness: 0.58, metalness: 0.0, clearcoat: 0.25, clearcoatRoughness: 0.6, sheen: 0.4, sheenColor: new THREE.Color(0xffd2bb)
    });
    this.hairMat = new THREE.MeshPhysicalMaterial({ color: hair, roughness: 0.78, metalness: 0.0, clearcoat: 0.25, clearcoatRoughness: 0.6 });
    this.lipMat = new THREE.MeshStandardMaterial({ color: lip ?? 0xa8464a, roughness: 0.38 });
    this.eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf6f1ea, roughness: 0.3 });
    this.irisMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1c, roughness: 0.12 });

    this._build();
  }

  /* ------------------------------------------------------------ geometry */
  _build() {
    const carnival = this.outfit === 'carnival';
    this.suitMat = new THREE.MeshPhysicalMaterial({
      color: this.customSuit ?? (carnival ? 0x8e1220 : 0x15171d),
      roughness: carnival ? 0.36 : 0.5,
      metalness: 0.1,
      clearcoat: carnival ? 0.85 : 0.3,
      clearcoatRoughness: 0.32,
      sheen: 0.7,
      sheenColor: new THREE.Color(carnival ? 0xffcf6b : 0x9aa3b5),
      sheenRoughness: 0.6
    });
    this.accentMat = new THREE.MeshPhysicalMaterial({
      color: this.customAccent ?? (carnival ? 0xf2b94a : 0x2a2e38),
      roughness: 0.22,
      metalness: 0.9,
      clearcoat: 0.6
    });
    this.shirtMat = new THREE.MeshPhysicalMaterial({
      color: 0xf7f5ef, roughness: 0.62, metalness: 0, sheen: 0.5, sheenColor: new THREE.Color(0xffffff)
    });
    this.brassMat = new THREE.MeshStandardMaterial({ color: 0xcaa45e, metalness: 0.95, roughness: 0.3 });

    /* hips + legs */
    this.hips = new THREE.Group();
    this.root.add(this.hips);
    const pelvis = capsule(0.098, 0.06, this.suitMat);
    pelvis.scale.set(1.12, 1, 0.86);
    pelvis.position.y = -0.04;
    this.hips.add(pelvis);
    for (const s of [-1, 1]) {
      const leg = capsule(0.062, 0.4, this.suitMat);
      leg.position.set(0.07 * s, -0.3, 0);
      this.hips.add(leg);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.045, 0.19), new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.35, metalness: 0.2 }));
      shoe.position.set(0.07 * s, -0.53, 0.035);
      this.hips.add(shoe);
    }

    /* spine chain */
    this.spine = new THREE.Group();
    this.spine.position.y = 0.1;
    this.hips.add(this.spine);
    const waist = capsule(0.118, 0.06, this.suitMat);
    waist.scale.set(1.16, 1, 0.86);
    this.spine.add(waist);

    this.chest = new THREE.Group();
    this.chest.position.y = 0.13;
    this.spine.add(this.chest);

    // tailored jacket torso: waist -> chest lathe
    const prof = [
      [0.132, -0.22], [0.138, -0.14], [0.126, -0.06], [0.119, 0.02],
      [0.123, 0.1], [0.132, 0.17], [0.141, 0.23], [0.145, 0.28],
      [0.136, 0.33], [0.112, 0.372], [0.086, 0.4]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const torsoGeo = new THREE.LatheGeometry(prof, 26);
    this.torsoGeo = torsoGeo;
    const jacket = new THREE.Mesh(torsoGeo, this.suitMat);
    jacket.scale.set(1.22, 1, 0.74);
    jacket.castShadow = true;
    jacket.receiveShadow = true;
    this.chest.add(jacket);
    this.jacket = jacket;

    // trouser waistband under the jacket hem
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.121, 0.121, 0.03, 22), new THREE.MeshStandardMaterial({ color: 0x0c0d11, roughness: 0.7 }));
    band.position.y = -0.16;
    band.scale.set(1.2, 1, 0.78);
    this.chest.add(band);

    // shoulder pads
    for (const s of [-1, 1]) {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.052, 18, 14), this.suitMat);
      pad.scale.set(1.0, 0.62, 0.9);
      pad.position.set(0.135 * s, 0.315, 0);
      pad.castShadow = true;
      this.chest.add(pad);
    }

    // white shirt front V
    const shirtShape = new THREE.Shape();
    shirtShape.moveTo(-0.072, 0.06);
    shirtShape.lineTo(0.072, 0.06);
    shirtShape.lineTo(0.042, 0.3);
    shirtShape.lineTo(-0.042, 0.3);
    shirtShape.closePath();
    const shirtGeo = new THREE.ExtrudeGeometry(shirtShape, { depth: 0.012, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.003, bevelSegments: 2 });
    const shirtV = new THREE.Mesh(shirtGeo, this.shirtMat);
    shirtV.position.set(0, 0.055, 0.093);
    shirtV.scale.set(1, 1, 1);
    this.chest.add(shirtV);

    // jacket lapels over the V
    for (const s of [-1, 1]) {
      const lap = new THREE.Shape();
      lap.moveTo(0.02 * s, 0);
      lap.lineTo(0.135 * s, 0.045);
      lap.lineTo(0.128 * s, 0.29);
      lap.lineTo(0.055 * s, 0.315);
      lap.lineTo(0.045 * s, 0.11);
      lap.closePath();
      const lapGeo = new THREE.ExtrudeGeometry(lap, { depth: 0.014, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.004, bevelSegments: 2 });
      const lapel = new THREE.Mesh(lapGeo, this.suitMat);
      lapel.position.set(0, 0.05, 0.1);
      lapel.castShadow = true;
      this.chest.add(lapel);
      // satin edge
      const satin = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.2, 0.006), this.accentMat);
      satin.position.set(0.056 * s, 0.17, 0.118);
      satin.rotation.z = -0.06 * s;
      this.chest.add(satin);
    }

    // shirt collar + bow tie
    for (const s of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.05, 0.026), this.shirtMat);
      col.position.set(0.036 * s, 0.335, 0.072);
      col.rotation.z = 0.62 * s;
      col.rotation.y = -0.25 * s;
      col.rotation.x = -0.15;
      this.chest.add(col);
    }
    this.bow = new THREE.Group();
    this.bow.position.set(0, 0.318, 0.098);
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.SphereGeometry(0.026, 16, 12), carnival ? this.accentMat : this.suitMat);
      wing.scale.set(1.5, 0.85, 0.5);
      wing.position.x = 0.03 * s;
      wing.rotation.z = 0.2 * s;
      this.bow.add(wing);
    }
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 10), this.accentMat);
    this.bow.add(knot);
    this.chest.add(this.bow);

    // waistcoat buttons + badge
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 10, 8), this.brassMat);
      b.position.set(0, 0.135 - i * 0.052, 0.106 + i * 0.004);
      this.chest.add(b);
    }
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.005, 14), this.brassMat);
    pin.rotation.x = Math.PI / 2;
    pin.position.set(-0.075, 0.17, 0.104);
    this.chest.add(pin);

    /* neck + head */
    const neck = capsule(0.036, 0.05, this.skinMat);
    neck.position.y = 0.36;
    this.chest.add(neck);

    this.headPivot = new THREE.Group();
    this.headPivot.position.y = 0.4;
    this.chest.add(this.headPivot);

    const head = new THREE.Group();
    head.position.y = 0.085;
    this.headPivot.add(head);
    this.head = head;

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.088, 32, 26), this.skinMat);
    skull.scale.set(0.86, 1.13, 0.95);
    skull.castShadow = true;
    head.add(skull);

    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.068, 26, 20), this.skinMat);
    jaw.scale.set(0.88, 0.92, 0.92);
    jaw.position.set(0, -0.042, 0.012);
    head.add(jaw);
    // chin
    const chin = new THREE.Mesh(new THREE.SphereGeometry(0.032, 18, 14), this.skinMat);
    chin.scale.set(1.15, 0.85, 0.9);
    chin.position.set(0, -0.075, 0.03);
    head.add(chin);

    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.021, 14, 12), this.skinMat);
      ear.scale.set(0.42, 1, 0.7);
      ear.position.set(0.079 * s, -0.004, 0.0);
      head.add(ear);
      const earring = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), this.brassMat);
      earring.position.set(0.082 * s, -0.03, 0.003);
      head.add(earring);
    }

    this.eyes = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(0.03 * s, 0.006, 0.070);
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.0148, 18, 14), this.eyeWhiteMat);
      white.scale.set(1.18, 0.86, 0.55);
      eye.add(white);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.0082, 14, 12), this.irisMat);
      iris.position.z = 0.0092;
      iris.scale.set(1, 1, 0.55);
      eye.add(iris);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0036, 10, 8), new THREE.MeshStandardMaterial({ color: 0x06040a, roughness: 0.15 }));
      pupil.position.z = 0.0142;
      eye.add(pupil);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.0018, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      glint.position.set(0.003, 0.004, 0.0155);
      eye.add(glint);
      // eyelid: a skin cap that rotates down over the eye
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.0162, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2.1), this.skinMat);
      lid.position.set(0, 0.001, 0.001);
      lid.scale.set(1.1, 1.05, 0.72);
      lid.rotation.x = -0.1;
      eye.add(lid);
      // lash line
      const lash = new THREE.Mesh(new THREE.BoxGeometry(0.029, 0.0022, 0.005), new THREE.MeshStandardMaterial({ color: 0x1a1008, roughness: 0.5 }));
      lash.position.set(0, 0.013, 0.014);
      eye.add(lash);
      head.add(eye);
      this.eyes.push({ eye, lid, iris, s });

      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.027, 0.0032, 0.007), this.hairMat);
      brow.position.set(0.03 * s, 0.034, 0.077);
      brow.rotation.z = -0.14 * s;
      brow.rotation.y = 0.2 * s;
      head.add(brow);
    }

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.042, 12), this.skinMat);
    nose.rotation.x = Math.PI * 0.55;
    nose.position.set(0, -0.008, 0.082);
    nose.scale.set(0.95, 1, 0.8);
    head.add(nose);

    const lips = new THREE.Mesh(new THREE.SphereGeometry(0.0165, 18, 12), this.lipMat);
    lips.scale.set(1.2, 0.36, 0.38);
    lips.position.set(0, -0.048, 0.073);
    head.add(lips);
    const lipLine = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.0022, 0.005), new THREE.MeshStandardMaterial({ color: 0x6d2c2c, roughness: 0.5 }));
    lipLine.position.set(0, -0.0485, 0.079);
    head.add(lipLine);

    // hair: swept-back cap + low bun
    const style = this.hairStyle;
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.0905, 30, 22, 0, Math.PI * 2, 0, Math.PI * (style === 'crop' ? 0.5 : 0.55)), this.hairMat);
    hairCap.scale.set(0.9, style === 'crop' ? 1.0 : 1.1, 0.99);
    hairCap.position.set(0, 0.006, -0.012);
    hairCap.rotation.x = -0.1;
    hairCap.castShadow = true;
    head.add(hairCap);

    if (style === 'bun') {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.042, 18, 14), this.hairMat);
      bun.position.set(0, -0.008, -0.082);
      bun.scale.set(1.0, 0.92, 0.78);
      head.add(bun);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, 8, 20), this.hairMat);
      band.position.set(0, -0.008, -0.062);
      head.add(band);
    } else if (style === 'ponytail') {
      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.11, 4, 10), this.hairMat);
      tail.position.set(0, -0.045, -0.088);
      tail.rotation.x = 0.25;
      head.add(tail);
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 8, 16), this.brassMat);
      tie.position.set(0, 0.012, -0.08);
      head.add(tie);
    } else if (style === 'long') {
      for (const s of [-1, 1]) {
        const lock = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.14, 4, 12), this.hairMat);
        lock.position.set(0.062 * s, -0.05, -0.03);
        lock.rotation.z = 0.12 * s;
        head.add(lock);
      }
      const back = new THREE.Mesh(new THREE.SphereGeometry(0.062, 18, 14), this.hairMat);
      back.position.set(0, -0.05, -0.062);
      back.scale.set(0.95, 1.1, 0.7);
      head.add(back);
    } else if (style === 'wave') {
      const back = new THREE.Mesh(new THREE.SphereGeometry(0.058, 18, 14), this.hairMat);
      back.position.set(0, -0.02, -0.058);
      back.scale.set(1.0, 1.0, 0.75);
      head.add(back);
      const wave = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 8, 18, Math.PI), this.hairMat);
      wave.position.set(0, 0.055, 0.02);
      wave.rotation.x = Math.PI / 2.2;
      head.add(wave);
    } else {
      // short / crop: sideburns only
      for (const s of [-1, 1]) {
        const burn = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.018), this.hairMat);
        burn.position.set(0.070 * s, 0.005, 0.012);
        head.add(burn);
      }
    }
    for (const s of [-1, 1]) {
      const strand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 14, 12), this.hairMat);
      strand.scale.set(0.26, style === 'crop' ? 0.5 : 0.8, 0.5);
      strand.position.set(0.066 * s, 0.01, -0.004);
      head.add(strand);
    }
    // earpiece (broadcast headset)
    const mic = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.05, 0.004), new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.5 }));
    mic.position.set(-0.077, -0.02, 0.03);
    mic.rotation.z = 0.2;
    head.add(mic);
    if (carnival) {
      const feather = new THREE.Mesh(
        new THREE.ConeGeometry(0.026, 0.11, 8),
        new THREE.MeshPhysicalMaterial({ color: 0xff4d6d, roughness: 0.3, metalness: 0.3, clearcoat: 1 })
      );
      feather.position.set(0.062, 0.095, -0.02);
      feather.rotation.z = -0.55;
      head.add(feather);
    }

    /* arms */
    this.arms = {};
    for (const side of ['L', 'R']) this.arms[side] = this._buildArm(side === 'L' ? -1 : 1, side);
    this.root.updateMatrixWorld(true);
  }

  _buildArm(sign, side) {
    const L1 = 0.28;
    const L2 = 0.25;

    const shoulderBone = new THREE.Group();
    shoulderBone.position.set(0.185 * sign, 0.3, 0.0);
    this.chest.add(shoulderBone);

    const upper = capsule(0.046, L1 - 0.07, this.suitMat);
    upper.position.y = -L1 / 2;
    shoulderBone.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -L1;
    shoulderBone.add(elbow);
    const elbowBall = new THREE.Mesh(new THREE.SphereGeometry(0.042, 14, 12), this.suitMat);
    elbow.add(elbowBall);

    const fore = capsule(0.037, L2 - 0.06, this.suitMat);
    fore.position.y = -L2 / 2;
    elbow.add(fore);

    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.0362, 0.0362, 0.016, 18), this.shirtMat);
    cuff.position.y = -L2 + 0.018;
    elbow.add(cuff);
    const cuffLink = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), this.brassMat);
    cuffLink.position.set(0.03 * sign, -L2 + 0.03, 0.02);
    elbow.add(cuffLink);

    const wrist = new THREE.Group();
    wrist.position.y = -L2;
    elbow.add(wrist);

    const hand = new THREE.Group();
    wrist.add(hand);

    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.068, 0.024), this.skinMat);
    palm.geometry.translate(0, -0.032, 0);
    palm.castShadow = true;
    hand.add(palm);
    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 12), this.skinMat);
    knuckle.scale.set(1.05, 0.7, 0.85);
    knuckle.position.y = -0.066;
    hand.add(knuckle);

    const fingers = [];
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Group();
      f.position.set(-0.019 + i * 0.0125, -0.066, 0.0);
      const seg = capsule(0.0062, 0.036, this.skinMat, 8);
      seg.position.y = -0.021;
      f.add(seg);
      hand.add(f);
      fingers.push(f);
    }
    const thumb = new THREE.Group();
    thumb.position.set(0.026 * sign, -0.018, 0.004);
    const thumbSeg = capsule(0.008, 0.028, this.skinMat, 8);
    thumbSeg.position.y = -0.016;
    thumb.add(thumbSeg);
    hand.add(thumb);

    const arm = {
      side, sign, L1, L2,
      shoulderBone, elbow, wrist, hand, fingers, thumb,
      target: new THREE.Vector3(sign * 0.26, -0.5, 0.1),
      targetSmooth: new THREE.Vector3(sign * 0.26, -0.5, 0.1),
      weight: 0, weightTarget: 0, grip: 0, gripTarget: 0,
      roll: 0.3 * sign,
      restShoulder: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, 0, 0.1 * sign)),
      restElbow: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.38, 0, 0))
    };
    shoulderBone.rotation.z = 0.1 * sign;
    shoulderBone.rotation.x = -0.12;
    elbow.rotation.x = -0.38;
    wrist.rotation.x = 0.12;
    hand.rotation.z = -0.08 * sign;
    return arm;
  }

  /* -------------------------------------------------------------- control */
  setHandTarget(side, worldTarget, { weight = 1, grip = 1, roll = null } = {}) {
    const arm = this.arms[side];
    if (!arm) return;
    arm.target.copy(worldTarget);
    arm.weightTarget = weight;
    arm.gripTarget = grip;
    if (roll !== null) arm.roll = roll;
  }

  releaseHand(side, { weight = 0 } = {}) {
    const arm = this.arms[side];
    if (!arm) return;
    arm.weightTarget = weight;
    arm.gripTarget = 0;
  }

  look(targetWorld, weight = 1) {
    const local = this.chest.worldToLocal(targetWorld.clone());
    const dx = local.x;
    const dy = local.y - 0.45;
    const dz = local.z;
    this.gaze.tyaw = clamp(Math.atan2(dx, Math.max(0.06, dz)), -0.95, 0.95);
    this.gaze.tpitch = clamp(-Math.atan2(dy, Math.max(0.1, Math.hypot(dx, dz))), -0.55, 0.45);
    this.gaze.weight = weight;
  }

  setLean(v) { this.leanTarget = v; }
  setTwist(v) { this.twistTarget = v; }

  /* ------------------------------------------------------------- IK solve */
  _solveArm(arm, dt) {
    const s = arm.shoulderBone;
    const parent = s.parent;

    arm.targetSmooth.lerp(arm.target, 1 - Math.exp(-16 * dt));
    arm.weight = damp(arm.weight, arm.weightTarget, 10, dt);
    arm.grip = damp(arm.grip, arm.gripTarget, 14, dt);

    const curl = arm.grip * 1.2;
    arm.fingers.forEach((f, i) => { f.rotation.x = -curl * (0.85 + i * 0.04); });
    arm.thumb.rotation.x = -curl * 0.8;
    arm.thumb.rotation.z = 0.32 * arm.sign;

    if (arm.weight < 0.01) {
      s.quaternion.slerp(arm.restShoulder, 1 - Math.exp(-10 * dt));
      arm.elbow.quaternion.slerp(arm.restElbow, 1 - Math.exp(-10 * dt));
      arm.wrist.rotation.x = damp(arm.wrist.rotation.x, 0.12, 8, dt);
      return;
    }

    const local = this._tmpV ? this._tmpV.copy(arm.targetSmooth) : (this._tmpV = arm.targetSmooth.clone());
    local.copy(arm.targetSmooth);
    parent.updateWorldMatrix(true, false);
    s.updateWorldMatrix(true, false);
    local.applyMatrix4(new THREE.Matrix4().copy(s.matrixWorld).invert());

    const raw = local.length();
    const dist = clamp(raw, 0.07, (arm.L1 + arm.L2) * 1.02);
    const dir = local.clone().normalize();

    const qAim = new THREE.Quaternion().setFromUnitVectors(V(0, -1, 0), dir);
    const qRoll = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), arm.roll);
    const cosA = (arm.L1 * arm.L1 + dist * dist - arm.L2 * arm.L2) / (2 * arm.L1 * dist);
    const a = Math.acos(clamp(cosA, -1, 1));
    const cosB = (arm.L1 * arm.L1 + arm.L2 * arm.L2 - dist * dist) / (2 * arm.L1 * arm.L2);
    const b = Math.acos(clamp(cosB, -1, 1));
    const qBend = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), a);
    const q = qAim.multiply(qRoll).multiply(qBend);

    s.quaternion.copy(arm.restShoulder).slerp(q, arm.weight);
    const eQ = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -(Math.PI - b));
    arm.elbow.quaternion.copy(arm.restElbow).slerp(eQ, arm.weight);

    // wrist aims the palm toward the target
    const over = clamp((raw - (arm.L1 + arm.L2)) / 0.2, 0, 1);
    arm.wrist.rotation.x = damp(arm.wrist.rotation.x, 0.1 + 0.3 * arm.weight + over * 0.2, 8, dt);
  }

  /* ------------------------------------------------------------- update */
  update(dt) {
    this.time += dt;
    const t = this.time;

    this.lean = damp(this.lean, this.leanTarget, 3.4, dt);
    this.twist = damp(this.twist, this.twistTarget, 3.0, dt);

    const breath = Math.sin(t * 1.05 + this.breathPhase) * 0.5 + 0.5;
    this.chest.scale.set(1 + breath * 0.008, 1 + breath * 0.01, 1 + breath * 0.008);

    this.spine.rotation.x = 0.02 + this.lean * 0.2 + Math.sin(t * 0.4 + this.swayPhase) * 0.008;
    this.spine.rotation.z = Math.sin(t * 0.5 + this.swayPhase) * 0.014;
    this.spine.rotation.y = this.twist;
    this.hips.position.x = Math.sin(t * 0.3 + this.swayPhase) * 0.008;
    this.hips.rotation.z = -Math.sin(t * 0.3 + this.swayPhase) * 0.01;
    this.hips.position.y = -this.lean * 0.02;

    // gaze with slight noise
    this.gaze.yaw = damp(this.gaze.yaw, this.gaze.tyaw * this.gaze.weight, 5.5, dt);
    this.gaze.pitch = damp(this.gaze.pitch, this.gaze.tpitch * this.gaze.weight, 5.5, dt);
    this.headPivot.rotation.y = this.gaze.yaw + Math.sin(t * 0.31) * 0.035;
    this.headPivot.rotation.x = this.gaze.pitch + Math.sin(t * 0.23 + 1.1) * 0.02;
    this.headPivot.rotation.z = Math.sin(t * 0.27) * 0.015;
    this.head.position.y = 0.085 + Math.sin(t * 1.8) * 0.0015;

    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blink = 1;
      this.blinkT = 2.6 + Math.random() * 3.8;
    }
    if (this.blink > 0) this.blink = Math.max(0, this.blink - dt * 7);
    const lidAngle = 0.02 - smoothstep(this.blink) * 1.5;
    this.eyes.forEach((e) => { e.lid.rotation.x = lidAngle; });

    for (const side of ['L', 'R']) this._solveArm(this.arms[side], dt);
  }

  palmWorld(side, offset = new THREE.Vector3()) {
    const h = this.arms[side].hand;
    this.root.updateMatrixWorld(true);
    return h.localToWorld(offset.clone());
  }
}
