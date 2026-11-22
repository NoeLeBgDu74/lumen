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
    let steeringWheel = null;
    for (const m of meshes) if (/Steering/i.test(m.name)) {
      const b = new THREE.Box3().setFromObject(m); const cc = b.getCenter(new THREE.Vector3());
      const piv = new THREE.Group(); piv.position.copy(cc); piv.userData.isSteering = true; root.add(piv); root.updateMatrixWorld(true);
      piv.attach(m); steeringWheel = piv; break;
    }
    // matériaux
    const lights = { head: [], brake: [], reverse: [], blink: [] };
    for (const m of meshes) {
      const mat = m.material; if (!mat) continue;
      if (/Bodymat/i.test(mat.name)) m.userData.paint = true;
      if (/Transperent|Transparent|Glass/i.test(mat.name) && mat.transparent !== undefined && /Transp/i.test(mat.name)) m.userData.glass = true;
      const n = m.name + ' ' + (m.parent ? m.parent.name : '');
      if (/Head_?lights?/i.test(n) && !/Glass/i.test(n)) m.userData.light = 'head';
      else if (/Brakelights/i.test(n)) m.userData.light = 'brake';
      else if (/Reverse/i.test(n)) m.userData.light = 'reverse';
      else if (/Blinkers/i.test(n)) m.userData.light = 'blink';
      m.castShadow = true; m.receiveShadow = true;
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
  root.traverse(o => {
    if (o.userData.wheel) car.wheels[o.userData.wheel] = { steer: o, spin: o.children[0] };
    if (o.userData.isSteering) car.steeringWheel = o;
  });
  return car;
}
function findMat(root, name) { let m = null; root.traverse(o => { if (o.isMesh && o.material && o.material.name === name) m = o.material; }); return m; }

// Mise à jour visuelle : roues (rotation + braquage), volant, feux.
export function poseCar(car, { spin = 0, steer = 0, brake = false, reverse = false, head = 0, blink = 0 }) {
  for (const k in car.wheels) {
    const w = car.wheels[k];
    w.spin.rotation.x = spin;
    if (k[0] === 'F') w.steer.rotation.y = steer;
  }
  if (car.steeringWheel) {
    car.steeringWheel.quaternion.setFromAxisAngle(SW_AXIS, -steer * 7);
  }
  for (const m of car.lights.head) m.emissiveIntensity = head * 4;
  for (const m of car.lights.brake) m.emissiveIntensity = brake ? 6 : head * 1.6;
  for (const m of car.lights.reverse) m.emissiveIntensity = reverse ? 4 : 0;
  for (const m of car.lights.blink) m.emissiveIntensity = blink;
}
const SW_AXIS = new THREE.Vector3(0, 0.38, 0.925).normalize();
