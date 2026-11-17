// solve camera placement: head near top, cards just above the UI overlay
const H = 902 - 58; // main area height at 1440x900
const fov = 42 * Math.PI/180;
const tanH = Math.tan(fov/2);
function proj(p, cam, tgt) {
  // camera space: forward = normalize(tgt-cam), up approximated by world up
  const f = [tgt[0]-cam[0], tgt[1]-cam[1], tgt[2]-cam[2]];
  const fl = Math.hypot(...f); const fw = f.map(v=>v/fl);
  let r = [fw[2], 0, -fw[0]]; // right = cross(fw, up) with up=(0,1,0)
  const rl = Math.hypot(...r); r = r.map(v=>v/rl);
  const u = [ r[1]*fw[2]-r[2]*fw[1], r[2]*fw[0]-r[0]*fw[2], r[0]*fw[1]-r[1]*fw[0] ];
  const d = [p[0]-cam[0], p[1]-cam[1], p[2]-cam[2]];
  const zc = -(d[0]*fw[0]+d[1]*fw[1]+d[2]*fw[2]);
  const yc = d[0]*u[0]+d[1]*u[1]+d[2]*u[2];
  const ndcY = (yc/(-zc))/tanH;
  return { f: 0.5 - ndcY*0.5, px: H*0.5 - ndcY*H*0.5, zc };
}
const headTop=[0,1.34,-0.95], headC=[0,1.25,-0.95], cards=[0,0,-0.46], cardsTop=[0,0.09,-0.46], feltNear=[0,0,0.5];
const configs = [
  [1.45, 2.30, 0.30],
  [1.45, 2.30, 0.15],
  [1.55, 2.10, 0.20],
  [1.60, 2.20, 0.25],
  [1.35, 2.10, 0.10],
  [1.50, 2.05, 0.18],
  [1.40, 1.95, 0.12],
];
for (const [Yc,Zc,Yt] of configs) {
  const cam=[0,Yc,Zc], tgt=[0,Yt,-0.45];
  const a=proj(headTop,cam,tgt), b=proj(cards,cam,tgt), c=proj(cardsTop,cam,tgt), d=proj(headC,cam,tgt);
  const headPx = (b) => 0;
  console.log(`cam y=${Yc} z=${Zc} tgtY=${Yt} | headTop ${(a.f*100).toFixed(1)}% headC ${(d.f*100).toFixed(1)}% cardsTop ${(c.f*100).toFixed(1)}% cards ${(b.f*100).toFixed(1)}% | cardDist ${b.zc.toFixed(2)} headDist ${a.zc.toFixed(2)} headSizePx ${((0.2/(2*tanH*a.zc))*H).toFixed(0)}`);
}
