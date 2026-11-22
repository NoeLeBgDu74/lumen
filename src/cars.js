// Véhicules : préparation des modèles détaillés (roues pivotantes, volant, peinture vernie, vitres, feux),
// catalogue (caractéristiques, prix) et instanciation.
import * as THREE from 'three';
import { glb } from './assets.js';

export const CATALOG = [
  { id: 'ace11',        name: 'Ace ’11',            cls: 'Citadine',  file: 'ace11',        length: 4.1, price: 14900, power: 95,  mass: 1080, top: 175, fuel: 45, cons: 5.4 },
  { id: 'asti89',       name: 'Asti Stradale ’89',  cls: 'Coupé sport', file: 'asti89',     length: 4.3, price: 38500, power: 230, mass: 1240, top: 245, fuel: 60, cons: 9.8 },
  { id: 'milano95',     name: 'Milano ’95',         cls: 'Berline',   file: 'milano95',     length: 4.6, price: 19900, power: 140, mass: 1350, top: 205, fuel: 55, cons: 7.1 },
  { id: 'sigil07',      name: 'Sigil ’07',          cls: 'Break',     file: 'sigil07',      length: 4.85, price: 24500, power: 170, mass: 1520, top: 215, fuel: 65, cons: 7.6 },
  { id: 'fairheaven80', name: 'Fairheaven LT ’80',  cls: 'Grande berline', file: 'fairheaven80', length: 5.4, price: 21500, power: 160, mass: 1750, top: 190, fuel: 75, cons: 11.5 },
  { id: 'lightbody90',  name: 'Lightbody ’90 Utility', cls: 'Utilitaire', file: 'lightbody90', length: 5.5, price: 27900, power: 150, mass: 2100, top: 165, fuel: 80, cons: 12.4 },
  { id: 'canyon75taxi', name: 'Canyon ’75 Taxi',    cls: 'Taxi',      file: 'canyon75taxi', length: 5.2, price: 17500, power: 150, mass: 1700, top: 180, fuel: 70, cons: 11.0, fixedPaint: true },
];
export const PAINTS = ['#f2f2f0', '#101114', '#7d8790', '#1d3c78', '#8a1c1c', '#2f5a3d', '#c9b48a', '#5a5f66', '#b3541e', '#2a6f8f', '#e0c341', '#401a40'];

const templates = new Map();

export async function loadCarTemplate(id) {
  if (templates.has(id)) return templates.get(id);
  const spec = CATALOG.find(c => c.id === id);
  const p = (async () => {
    const g = await glb('assets/cars/' + spec.file + '.glb');
    const src = g.scene; src.updateMatrixWorld(true);
    // orientation : avant (phares) vers +z
    const center = (re) => { const b = new THREE.Box3(); src.traverse(o => { if (o.isMesh && re.test(o.name)) b.expandByObject(o); }); return b.isEmpty() ? null : b.getCenter(new THREE.Vector3()); };
    const front = center(/Headlights(?!_Glass)/i) || center(/headlights/i), rear = center(/Brakelights/i) || center(/Taillights/i);
    const wrap = new THREE.Group(); wrap.add(src);
    if (front && rear) {
      const d = front.clone().sub(rear); d.y = 0; d.normalize();
      wrap.rotation.y = -Math.atan2(d.x, d.z);
    }
    wrap.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(wrap);
    const s = spec.length / (box.max.z - box.min.z);
    wrap.scale.setScalar(s); wrap.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(wrap);
    const c = box.getCenter(new THREE.Vector3());
    const root = new THREE.Group();
    wrap.position.set(-c.x, -box.min.y, -c.z);
    root.add(wrap); root.updateMatrixWorld(true);
    // pivots de roues : on rattache chaque roue à deux groupes (braquage Y → rotation X) centrés sur la roue
    const wheels = {};
    const meshes = []; src.traverse(o => { if (o.isMesh) meshes.push(o); });
    for (const m of meshes) {
      const mm = /Wheel\w*_(FL|FR|RL|RR)/i.exec(m.name) || /Wheel\w*_(FL|FR|RL|RR)/i.exec(m.parent && m.parent.name || '');
      if (!mm) continue;
      const k = mm[1].toUpperCase();
      const wb = new THREE.Box3().setFromObject(m); const wc = wb.getCenter(new THREE.Vector3());
      const steer = new THREE.Group(); steer.position.copy(wc); steer.userData.wheel = k; root.add(steer);
      const spin = new THREE.Group(); steer.add(spin); root.updateMatrixWorld(true);
      spin.attach(m);
      wheels[k] = { steer, spin, radius: (wb.max.y - wb.min.y) / 2, pos: wc.clone() };
    }
    // volant
    // calage au sol sur le bas des roues (certains modèles contiennent des pièces parasites sous la caisse)
    const wl0 = Object.values(wheels);
    if (wl0.length) {
      const lowest = Math.min(...wl0.map(w => w.pos.y - w.radius));
      if (Math.abs(lowest) > 0.03) { for (const ch of root.children) ch.position.y -= lowest; for (const w of wl0) w.pos.y -= lowest; root.updateMatrixWorld(true); }
    }
    // volant : centre et axe de rotation déduits de la géométrie (plan de la jante = plus petite variance)
    for (const m of meshes) if (/Steering/i.test(m.name)) {
      const pos = m.geometry.attributes.position, v = new THREE.Vector3(), pts = [];
      const step = Math.max(1, Math.floor(pos.count / 1500));
      for (let i = 0; i < pos.count; i += step) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); pts.push(v.clone()); }
      // ne garder que la partie côté conducteur (x > 0) si le maillage contient deux volants
      const drv = pts.filter(p => p.x > 0.05); const P = drv.length > 30 ? drv : pts;
      const c = P.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / P.length);
      const C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      for (const p of P) { const d = [p.x - c.x, p.y - c.y, p.z - c.z]; for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) C[r * 3 + k] += d[r] * d[k]; }
      const tr = C[0] + C[4] + C[8];
      const Mx = new THREE.Matrix3().set(tr - C[0], -C[1], -C[2], -C[3], tr - C[4], -C[5], -C[6], -C[7], tr - C[8]);
      let ax = new THREE.Vector3(0.1, 0.3, 1);
      for (let it = 0; it < 40; it++) ax.applyMatrix3(Mx).normalize();
      if (ax.z < 0) ax.negate();
      if (c.y > 0.4 && c.y < 1.5 && Math.abs(c.z) < tpl0Len(spec) / 2) {
        const piv = new THREE.Group(); piv.position.copy(c); piv.userData.isSteering = true; piv.userData.axis = ax.toArray(); root.add(piv); root.updateMatrixWorld(true);
        piv.attach(m);
      }
      break;
    }
    // matériaux
    const lights = { head: [], brake: [], reverse: [], blink: [] };
    for (const m of meshes) {
      const mat = m.material; if (!mat) continue;
      if (/Bodymat/i.test(mat.name)) m.userData.paint = true;
      if (/Transperent|Transparent|Glass/i.test(mat.name) && mat.transparent !== undefined && /Transp/i.test(mat.name)) m.userData.glass = true;
      const n = m.name + ' ' + (m.parent ? m.parent.name : '');
      if (/Head_?lights?/i.test(n) && !/Head_?lights?_Glass/i.test(n)) m.userData.light = 'head';
      else if (/Brakelights/i.test(n)) m.userData.light = 'brake';
      else if (/Reverse/i.test(n)) m.userData.light = 'reverse';
      else if (/Blinkers/i.test(n)) m.userData.light = 'blink';
      m.castShadow = true; m.receiveShadow = true;
      if (/Interior|Badges|_NP_|NP_Front|NP_Rear|Suspension|Bottom|Reverse|Blinkers|Glass_Driver|Glass_Passanger|Stock_Trim|_inner/i.test(n)) m.userData.detail = true;
    }
    const bb = new THREE.Box3().setFromObject(root);
    const wl = wheels.FL && wheels.RL ? wheels.FL.pos.z - wheels.RL.pos.z : spec.length * 0.6;
    const track = wheels.FL && wheels.FR ? Math.abs(wheels.FL.pos.x - wheels.FR.pos.x) : 1.55;
    const tpl = { spec, root, size: bb.getSize(new THREE.Vector3()), wheelbase: wl, track, rearZ: wheels.RL ? wheels.RL.pos.z : -wl / 2, wheelR: wheels.FL ? wheels.FL.radius : 0.33 };
    prepMaterials(tpl);
    return tpl;
  })();
  templates.set(id, p);
  return p;
}

function prepMaterials(tpl) {
  tpl.root.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material;
    if (o.userData.paint) {
      const pm = new THREE.MeshPhysicalMaterial({
        map: m.map, normalMap: m.normalMap, color: 0xffffff, metalness: 0.55, roughness: 0.32,
        clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.35, roughnessMap: null
      });
      pm.name = 'paint'; o.material = pm;
    } else if (o.userData.glass) {
      o.material = new THREE.MeshPhysicalMaterial({ color: 0x0c1014, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.38, envMapIntensity: 1.6, depthWrite: false, clearcoat: 1 });
      o.castShadow = false;
    } else if (m) {
      m.envMapIntensity = 1.1;
      if (/Tire|BOTTOM/i.test(m.name)) m.envMapIntensity = 0.7;
    }
  });
}

// Instance d'un véhicule (géométries partagées, matériaux de peinture/feux propres à l'instance).
export function makeCar(tpl, paint) {
  const root = tpl.root.clone(true);
  const car = { tpl, obj: root, wheels: {}, lights: { head: [], brake: [], reverse: [], blink: [] }, steeringWheel: null };
  const paintMat = tpl.spec.fixedPaint ? null : findMat(root, 'paint');
  let pm = null;
  root.traverse(o => {
    if (!o.isMesh) return;
    if (o.material && o.material.name === 'paint' && !tpl.spec.fixedPaint) {
      if (!pm) { pm = o.material.clone(); pm.color.set(paint || '#ffffff'); }
      o.material = pm;
    }
    const l = o.userData.light;
    if (l) {
      o.material = o.material.clone();
      o.material.emissive = new THREE.Color(l === 'brake' ? 0xff1a0a : l === 'blink' ? 0xff8a10 : 0xfff4e0);
      o.material.emissiveIntensity = 0;
      car.lights[l].push(o.material);
    }
  });
  void paintMat;
  car.paint = pm;
  // halos lumineux (phares blancs à l'avant, feux rouges à l'arrière) visibles de loin la nuit
  const s = tpl.size, mkGlow = (col, x, z, sc) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: col, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); sp.position.set(x, 0.72, z); sp.scale.setScalar(sc); root.add(sp); return sp.material; };
  car.glowF = [mkGlow(0xfff2d6, s.x / 2 - 0.38, s.z / 2 + 0.05, 1.1), mkGlow(0xfff2d6, -s.x / 2 + 0.38, s.z / 2 + 0.05, 1.1)];
  car.glowR = [mkGlow(0xff2a1a, s.x / 2 - 0.35, -s.z / 2 - 0.05, 0.7), mkGlow(0xff2a1a, -s.x / 2 + 0.35, -s.z / 2 - 0.05, 0.7)];
  car.details = []; root.traverse(o => { if (o.isMesh && o.userData.detail) car.details.push(o); });
  car.lod = 0;
  root.traverse(o => {
    if (o.userData.wheel) car.wheels[o.userData.wheel] = { steer: o, spin: o.children[0] };
    if (o.userData.isSteering) car.steeringWheel = o;
  });
  return car;
}
function tpl0Len(spec) { return spec.length; }
function findMat(root, name) { let m = null; root.traverse(o => { if (o.isMesh && o.material && o.material.name === name) m = o.material; }); return m; }

// LOD : au-delà de 45 m, on masque les petits éléments (habitacle, plaques, logos, dessous) et les ombres.
export function carLOD(car, dist) {
  const lod = dist > 45 ? 1 : 0;
  if (lod === car.lod) return; car.lod = lod;
  for (const m of car.details) m.visible = !lod;
  car.obj.traverse(o => { if (o.isMesh) o.castShadow = !lod; });
}

// Mise à jour visuelle : roues (rotation + braquage), volant, feux.
export function poseCar(car, { spin = 0, steer = 0, brake = false, reverse = false, head = 0, blink = 0 }) {
  for (const k in car.wheels) {
    const w = car.wheels[k];
    w.spin.rotation.x = spin;
    if (k[0] === 'F') w.steer.rotation.y = steer;
  }
  if (car.steeringWheel) {
    const a = car.steeringWheel.userData.axis; if (a) { SW_TMP.fromArray(a); car.steeringWheel.quaternion.setFromAxisAngle(SW_TMP, -steer * 6); }
  }
  for (const m of car.lights.head) m.emissiveIntensity = head * 4;
  if (car.glowF) { for (const m of car.glowF) m.opacity = head * 0.9; for (const m of car.glowR) m.opacity = brake ? 0.95 : head * 0.45; }
  for (const m of car.lights.brake) m.emissiveIntensity = brake ? 6 : head * 1.6;
  for (const m of car.lights.reverse) m.emissiveIntensity = reverse ? 4 : 0;
  for (const m of car.lights.blink) m.emissiveIntensity = blink;
}
const SW_TMP = new THREE.Vector3();
let _glow = null;
function glowTex() {
  if (_glow) return _glow;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); _glow = new THREE.CanvasTexture(c); return _glow;
}
