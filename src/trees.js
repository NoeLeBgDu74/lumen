// Arbres procéduraux : tronc et branches courbes (écorce PBR), feuillage en cartes alpha
// avec normales sphériques (éclairage doux) et balancement au vent. Rendus en instances.
import * as THREE from 'three';
import { canvasTex } from './assets.js';
import { rng } from './geo.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const windU = { uTime: { value: 0 }, uWind: { value: 0.6 } };

function leafTexture(hue) {
  return canvasTex(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const R = rng(hue * 999 + 7);
    for (let i = 0; i < 260; i++) {
      const x = R() * w, y = R() * h, s = 10 + R() * 16, a = R() * Math.PI * 2;
      const l = 22 + R() * 22, sat = 35 + R() * 25, hh = hue + R() * 18 - 9;
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = `hsl(${hh},${sat}%,${l}%)`;
      g.beginPath(); g.moveTo(0, -s); g.quadraticCurveTo(s * 0.55, -s * 0.2, 0, s); g.quadraticCurveTo(-s * 0.55, -s * 0.2, 0, -s); g.fill();
      g.strokeStyle = `hsla(${hh},30%,${l + 14}%,.55)`; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -s); g.lineTo(0, s); g.stroke();
      g.restore();
    }
  });
}

function windify(m, leaves) {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, windU);
    if (leaves) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);');
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime, uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec3 ip = vec3(0.);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xyz;
          #endif
          float hgt = max(position.y - 1.5, 0.);
          float ph = ip.x * .13 + ip.z * .17;
          float sway = sin(uTime * 1.1 + ph) * .5 + sin(uTime * 2.3 + ph * 1.7) * .25;
          transformed.x += sway * uWind * hgt * .012;
          transformed.z += cos(uTime * .9 + ph) * uWind * hgt * .008;
          ${leaves ? 'transformed += normal * sin(uTime * 4. + position.x * 3. + position.z * 2. + ph) * .03 * uWind;' : ''}
        }`);
  };
  m.customProgramCacheKey = () => 'wind' + (leaves ? 'L' : 'T');
}

// Génère une variante d'arbre (géométrie tronc + géométrie feuillage) en coordonnées locales.
function makeTree(seed, { height = 9, crown = 3.6, trunkR = 0.22 } = {}) {
  const R = rng(seed);
  const bark = [], leafs = [];
  const tube = (pts, r0, r1) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const seg = Math.max(4, Math.round(curve.getLength() * 2));
    const g = new THREE.TubeGeometry(curve, seg, 1, 7, false);
    // rayon dégressif
    const p = g.attributes.position, n = g.attributes.normal;
    const ring = 8;
    for (let i = 0; i < p.count; i++) {
      const t = Math.floor(i / ring) / seg; const r = THREE.MathUtils.lerp(r0, r1, t);
      const c = curve.getPointAt(Math.min(1, t));
      p.setXYZ(i, c.x + n.getX(i) * r, c.y + n.getY(i) * r, c.z + n.getZ(i) * r);
    }
    // UV : v en mètres le long du tube, u autour
    const uv = g.attributes.uv; const L = curve.getLength();
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * r0 * 6.28 / 1.2, uv.getY(i) * L / 1.2);
    bark.push(g);
    return curve;
  };
  const trunkTop = height * (0.45 + R() * 0.1);
  const lean = new THREE.Vector3(R() - 0.5, 0, R() - 0.5).multiplyScalar(0.6);
  const trunk = tube([new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(lean.x * 0.3, trunkTop * 0.5, lean.z * 0.3), new THREE.Vector3(lean.x, trunkTop, lean.z)], trunkR * 1.25, trunkR * 0.7);
  // racines/évasement
  const flare = new THREE.CylinderGeometry(trunkR * 1.2, trunkR * 1.9, 0.5, 9, 1, true); flare.translate(0, 0.05, 0); bark.push(flare);
  const crownC = new THREE.Vector3(lean.x, trunkTop + crown * 0.7, lean.z);
  const nb = 5 + Math.floor(R() * 3);
  const clusters = [];
  for (let b = 0; b < nb; b++) {
    const a = (b / nb) * Math.PI * 2 + R() * 0.6;
    const t0 = trunk.getPointAt(0.75 + R() * 0.25);
    const out = new THREE.Vector3(Math.cos(a), 0.6 + R() * 0.6, Math.sin(a)).normalize();
    const L = crown * (0.7 + R() * 0.5);
    const mid = t0.clone().addScaledVector(out, L * 0.5).add(new THREE.Vector3(0, L * 0.15, 0));
    const end = t0.clone().addScaledVector(out, L).add(new THREE.Vector3(0, L * 0.35, 0));
    tube([t0, mid, end], trunkR * 0.45, trunkR * 0.12);
    clusters.push(end, mid.clone().lerp(end, 0.4));
    // rameaux
    for (let k = 0; k < 2; k++) {
      const s0 = mid.clone().lerp(end, 0.3 + R() * 0.5);
      const o2 = new THREE.Vector3(R() - 0.5, R() * 0.8, R() - 0.5).normalize();
      const e2 = s0.clone().addScaledVector(o2, L * 0.4);
      tube([s0, s0.clone().lerp(e2, 0.5).add(new THREE.Vector3(0, 0.2, 0)), e2], trunkR * 0.12, trunkR * 0.04);
      clusters.push(e2);
    }
  }
  clusters.push(crownC.clone().add(new THREE.Vector3(0, crown * 0.3, 0)));
  // feuillage : cartes orientées aléatoirement, regroupées en boules ; normales = direction depuis le centre de la couronne
  const quad = new THREE.PlaneGeometry(1, 1);
  const tmp = new THREE.Object3D();
  for (const c of clusters) {
    const cr = crown * (0.45 + R() * 0.25);
    const cards = 26;
    for (let k = 0; k < cards; k++) {
      const d = new THREE.Vector3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1); if (d.lengthSq() > 1) d.normalize();
      d.y *= 0.75;
      tmp.position.copy(c).addScaledVector(d, cr);
      tmp.rotation.set(R() * 6.28, R() * 6.28, R() * 6.28);
      const s = 1.1 + R() * 0.9; tmp.scale.set(s, s, s);
      tmp.updateMatrix();
      const g = quad.clone().applyMatrix4(tmp.matrix);
      const p = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).sub(crownC).normalize();
        const vv = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).sub(c).normalize();
        v.lerp(vv, 0.5).normalize();
        n.setXYZ(i, v.x, v.y, v.z);
      }
      leafs.push(g);
    }
  }
  const bg = mergeGeometries(bark.map(g => g.index ? g.toNonIndexed() : g).map(g => { g.deleteAttribute && g.attributes.uv || g; return g; }));
  const lg = mergeGeometries(leafs);
  return { bark: bg, leaves: lg };
}

export class Trees {
  constructor(scene, barkMat) {
    this.scene = scene;
    this.barkMat = barkMat.clone(); windify(this.barkMat, false);
    this.variants = [];
    const hues = [96, 84, 108, 72];
    for (let v = 0; v < 4; v++) {
      const t = makeTree(1000 + v * 77, { height: 8 + v * 1.5, crown: 3.2 + v * 0.5, trunkR: 0.2 + v * 0.03 });
      const lm = new THREE.MeshStandardMaterial({ map: leafTexture(hues[v]), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, metalness: 0, color: 0xdde8cc });
      windify(lm, true);
      lm.shadowSide = THREE.DoubleSide;
      this.variants.push({ ...t, leafMat: lm, list: [] });
    }
  }
  add(x, z, { variant, scale = 1, rot, y = 0 } = {}) {
    const v = variant ?? Math.floor(Math.abs(Math.sin(x * 12.9 + z * 78.2)) * 4);
    this.variants[v % 4].list.push({ x, y, z, s: scale * (0.85 + Math.abs(Math.sin(x * 3.1 + z)) * 0.3), r: rot ?? (x * 7 + z * 3) });
  }
  build() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    this.meshes = [];
    for (const v of this.variants) {
      if (!v.list.length) continue;
      const tm = new THREE.InstancedMesh(v.bark, this.barkMat, v.list.length);
      const lm = new THREE.InstancedMesh(v.leaves, v.leafMat, v.list.length);
      v.list.forEach((t, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.r); m.compose(p.set(t.x, t.y, t.z), q, s.set(t.s, t.s, t.s));
        tm.setMatrixAt(i, m); lm.setMatrixAt(i, m);
      });
      for (const im of [tm, lm]) { im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); this.scene.add(im); this.meshes.push(im); }
    }
  }
}
