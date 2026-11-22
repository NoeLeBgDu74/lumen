// Génération de la ville à partir du plan (world.js) : sol, routes et marquages, trottoirs à bordures,
// quartiers (centre, résidentiel, pavillons, commerces, industrie, loisirs), mobilier, feux, places de parking.
import * as THREE from 'three';
import { GB, Buckets, Y, rng, pick } from './geo.js';
import { building, tower, sides, at, glass, STYLES } from './buildings.js';
import { house, villa } from './houses.js';
import { signMaterial, awningMaterial } from './materials.js';
import { makeGlassMaterial } from './interior.glsl.js';
import * as W from './world.js';

const { P, RW, SW, NX, NZ } = W;
const SHOPS = [
  { name: 'Boulangerie Martin', type: 'bakery', bg: '#3b2516', fg: '#f1d9a8', awning: ['#7a2b20', '#efe4cf'] },
  { name: 'Pharmacie du Centre', type: 'pharmacy', bg: '#0f4d3a', fg: '#ffffff' },
  { name: 'Café des Arts', type: 'cafe', bg: '#1e2b26', fg: '#e8d5a6', awning: ['#22412f', '#e9e1cc'] },
  { name: 'Fleurs & Jardin', type: 'shop', bg: '#ece6da', fg: '#2f4a33', awning: ['#3d6b47', '#f4efe2'] },
  { name: 'Librairie Pages', type: 'shop', bg: '#25303f', fg: '#f0e6d0' },
  { name: 'Coiffure Élégance', type: 'shop', bg: '#111', fg: '#e8c98c' },
  { name: 'Épicerie Fine', type: 'grocery', bg: '#5b3a1e', fg: '#f6e7c8', awning: ['#2b4a6b', '#f1ece0'] },
  { name: 'Tabac Presse', type: 'shop', bg: '#7a1d1d', fg: '#ffffff' },
  { name: 'Optique Vision', type: 'shop', bg: '#f2f2f2', fg: '#1a3c6e' },
  { name: 'Banque Lumière', type: 'bank', bg: '#0e2346', fg: '#e9d8a6' },
  { name: 'Pizzeria Napoli', type: 'restaurant', bg: '#1d3b21', fg: '#f3e2b8', awning: ['#9c2a22', '#f2e9d8'] },
  { name: 'Sushi Kaze', type: 'restaurant', bg: '#151515', fg: '#f04a3a' },
  { name: 'Boucherie Dupont', type: 'shop', bg: '#7d1f1f', fg: '#f5e8d0', awning: ['#7d1f1f', '#f3ead9'] },
  { name: 'Mode & Co', type: 'shop', bg: '#e7ded0', fg: '#222' },
  { name: 'Électro Plus', type: 'shop', bg: '#0b4f8a', fg: '#fff' },
  { name: 'Armurerie Lumen', type: 'gunshop', bg: '#1b1b1b', fg: '#e0b13a' },
  { name: 'Brasserie Le Lumen', type: 'restaurant', bg: '#2a1c12', fg: '#e8c27a', awning: ['#3a2416', '#e9d9b8'] },
];

export function buildCity(scene, M, trees) {
  const ctx = {
    B: null, glass: [], colliders: [], doors: [], shopDoors: [], lamps: [], props: [], beacons: [],
    signMats: {}, awnMats: {}, trees, signals: [], lampPosts: [], chunks: []
  };
  const r = rng(20261122);

  // ---------- sol : campagne + base asphalte de la ville ----------
  const ext = 2600;
  const terrain = new THREE.Mesh(new THREE.PlaneGeometry(ext * 2, ext * 2).rotateX(-Math.PI / 2), M.field);
  scaleUV(terrain.geometry, ext * 2);
  terrain.position.y = -0.03; terrain.receiveShadow = true; scene.add(terrain);
  const cx0 = W.gx(0) - RW, cx1 = W.gx(NX) + RW, cz0 = W.gz(0) - RW, cz1 = W.gz(NZ) + RW;
  const base = new THREE.Mesh(planeXZ(cx0, cz0, cx1, cz1, 0), M.asphalt); base.receiveShadow = true; scene.add(base);

  // ---------- routes rurales ----------
  const rural = new Buckets();
  const seen = new Set();
  for (const e of W.edges) {
    const k = Math.min(e.a, e.b) + '-' + Math.max(e.a, e.b); if (seen.has(k)) continue; seen.add(k);
    const A = W.nodes[e.a], Bn = W.nodes[e.b];
    if (e.kind === 'rural') ruralRoad(rural, A, Bn);
    else cityRoadMarks(rural, A, Bn);
  }
  // carrefours ruraux
  for (const n of W.nodes) if (!n.signal && n.links.length) rural.get('asphaltRural').aabb(n.x - 4.5, -0.01, n.z - 4.5, n.x + 4.5, 0.012, n.z + 4.5, 4);
  for (const m of rural.toMeshes(M, { cast: false })) scene.add(m);

  // ---------- blocs ----------
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    ctx.B = new Buckets();
    const br = r;
    sidewalkBlock(ctx, scene, M, i, j);
    const d = W.district(i, j), sp = W.SPECIAL[i + ',' + j];
    const rect = W.blockRect(i, j);
    const R = rng(i * 131 + j * 977 + 5);
    if (sp === 'park') park(ctx, rect, R, i, j);
    else if (sp === 'sports') sports(ctx, rect, R);
    else if (sp === 'villas') villas(ctx, rect, R, i, j);
    else if (sp === 'supermarket') supermarket(ctx, rect, R);
    else if (sp === 'dealership') dealership(ctx, rect, R);
    else if (sp === 'gas_station_block') gasStationBlock(ctx, rect, R);
    else if (sp === 'office_block') officeBlock(ctx, rect, R);
    else if (sp === 'mall_parking') mallParking(ctx, rect, R);
    else if (sp === 'garage_block') industrial(ctx, rect, R, true);
    else if (d === 'S') suburb(ctx, rect, R, i, j);
    else if (d === 'I') industrial(ctx, rect, R, false);
    else if (d === 'C') retail(ctx, rect, R);
    else perimeter(ctx, rect, R, d, sp, i, j);
    streetFurniture(ctx, i, j, d, R);
    const g = new THREE.Group(); g.name = 'block' + i + ',' + j;
    resolveDynamicMats(ctx, M);
    for (const m of ctx.B.toMeshes(M)) g.add(m);
    g.userData.center = new THREE.Vector3(W.gx(i) + P / 2, 0, W.gz(j) + P / 2);
    scene.add(g); ctx.chunks.push(g);
    void br;
  }

  // ---------- lac de Lumen et sa plage (campagne, au nord-ouest) ----------
  {
    ctx.B = new Buckets();
    const lx = W.RING_BOX.X0 + 130, lz = W.RING_BOX.Z0 + 110, R0 = 70;
    const sand = new THREE.CircleGeometry(R0 + 14, 48).rotateX(-Math.PI / 2); sand.translate(lx, 0.01, lz);
    const uvs = sand.attributes.uv; for (let k = 0; k < uvs.count; k++) uvs.setXY(k, uvs.getX(k) * (R0 + 14) * 2 / 3, uvs.getY(k) * (R0 + 14) * 2 / 3);
    ctx.B.get('sand').addGeometry(sand);
    const lake = new THREE.CircleGeometry(R0, 48).rotateX(-Math.PI / 2); lake.translate(lx, 0.06, lz); ctx.B.get('lakeWater').addGeometry(lake);
    // ponton en bois
    ctx.B.get('fence').aabb(lx - 1.2, 0.3, lz + R0 - 16, lx + 1.2, 0.42, lz + R0 + 4);
    for (let z = lz + R0 - 15; z < lz + R0 + 4; z += 3) for (const x of [lx - 1.1, lx + 1.1]) ctx.B.get('frameWood').aabb(x - 0.08, -0.5, z - 0.08, x + 0.08, 0.3, z + 0.08);
    for (let k = 0; k < 5; k++) { const a = 1.2 + k * 0.35; ctx.props.push({ name: 'wooden_picnic_table', x: lx + Math.cos(a) * (R0 + 8), y: 0.01, z: lz + Math.sin(a) * (R0 + 8), ry: a, s: 1 }); }
    for (let k = 0; k < 26; k++) { const a = Math.random() * 6.28, rr = R0 + 18 + Math.random() * 25; trees.add(lx + Math.cos(a) * rr, lz + Math.sin(a) * rr, { scale: 1 + Math.random() * 0.5 }); }
    const g = new THREE.Group(); for (const m of ctx.B.toMeshes(M)) g.add(m); g.userData.center = new THREE.Vector3(lx, 0, lz); scene.add(g); ctx.chunks.push(g);
    W.addPlace({ type: 'lake', name: 'Lac de Lumen', x: lx, z: lz, door: { p: new THREE.Vector3(lx, 0, lz + R0 + 6), nrm: new THREE.Vector3(0, 0, 1) } });
    ctx.lake = { x: lx, z: lz, r: R0 };
  }

  // ---------- vitrages (une seule InstancedMesh pour toute la ville) ----------
  const gm = makeGlassMaterial();
  const quad = new THREE.PlaneGeometry(1, 1);
  const n = ctx.glass.length;
  const aRoom = new Float32Array(n * 4), aInfo = new Float32Array(n * 4);
  const im = new THREE.InstancedMesh(quad, gm, n);
  ctx.glass.forEach((g, k) => { im.setMatrixAt(k, g.m); aRoom.set(g.room, k * 4); aInfo.set(g.info, k * 4); });
  quad.setAttribute('aRoom', new THREE.InstancedBufferAttribute(aRoom, 4));
  quad.setAttribute('aInfo', new THREE.InstancedBufferAttribute(aInfo, 4));
  im.receiveShadow = false; im.castShadow = false; im.frustumCulled = false;
  scene.add(im);
  ctx.glassMesh = im; ctx.glassMat = gm;

  // ---------- feux tricolores ----------
  buildSignals(ctx, scene, M);
  // ---------- places de stationnement le long des rues ----------
  curbParking();
  return ctx;
}

function resolveDynamicMats(ctx, M) {
  for (const k in ctx.signMats) if (!M[k]) { const s = ctx.signMats[k]; M[k] = signMaterial(s.name, { bg: s.bg, fg: s.fg }); }
  for (const k in ctx.awnMats) if (!M['awning:' + k]) M['awning:' + k] = awningMaterial(...ctx.awnMats[k]);
}

function scaleUV(g, size) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size, uv.getY(i) * size); }
function planeXZ(x0, z0, x1, z1, y) {
  const gb = new GB();
  gb.quad(new THREE.Vector3(x0, y, z1), new THREE.Vector3(x1, y, z1), new THREE.Vector3(x1, y, z0), new THREE.Vector3(x0, y, z0), Y, [x0, z1], [x1, z1], [x1, z0], [x0, z0]);
  return gb.build();
}

// ---------- routes ----------
function strip(gb, A, d, from, to, off, w, y = 0.008) {
  // bande au sol le long de la direction d (unitaire, axe), décalée latéralement de off, largeur w
  const rgt = new THREE.Vector3(-d.z, 0, d.x);
  const p = (t, o) => new THREE.Vector3(A.x + d.x * t + rgt.x * o, y, A.z + d.z * t + rgt.z * o);
  const a = p(from, off - w / 2), b = p(to, off - w / 2), c = p(to, off + w / 2), e = p(from, off + w / 2);
  // orientation : normale vers le haut
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(e, a));
  if (n.y > 0) gb.quad(a, b, c, e, Y, [from, 0], [to, 0], [to, 1], [from, 1]);
  else gb.quad(a, e, c, b, Y, [from, 0], [from, 1], [to, 1], [to, 0]);
}
function cityRoadMarks(B, A, Bn) {
  const dx = Bn.x - A.x, dz = Bn.z - A.z, L = Math.hypot(dx, dz);
  const d = new THREE.Vector3(dx / L, 0, dz / L);
  const w = B.get('paintW');
  const s0 = RW + 4.4, s1 = L - RW - 4.4;
  // double ligne continue axiale
  strip(w, A, d, s0, s1, -0.12, 0.12); strip(w, A, d, s0, s1, 0.12, 0.12);
  // séparation voie / stationnement (pointillés)
  for (const side of [-1, 1]) for (let t = s0 + 2; t < s1 - 2; t += 6) strip(w, A, d, t, t + 3, side * 3.6, 0.1);
  // passages piétons et lignes d'arrêt aux deux bouts
  for (const [t0, dirSign] of [[RW + 0.6, 1], [L - RW - 0.6, -1]]) {
    for (let o = -RW + 0.6; o < RW - 0.4; o += 1.0) strip(w, A, d, Math.min(t0, t0 + dirSign * 3.2), Math.max(t0, t0 + dirSign * 3.2), o + 0.25, 0.5, 0.009);
    const ts = t0 + dirSign * 3.8;
    // ligne d'arrêt sur la voie entrante (côté droit pour celui qui arrive)
    const side = dirSign > 0 ? -1 : 1;
    strip(w, A, d, ts - 0.25, ts + 0.25, side * 1.8, 3.4, 0.009);
  }
  // bouches d'égout et plaques
  const mh = B.get('manhole');
  for (let t = RW + 14; t < L - RW - 10; t += 38) {
    const p = new THREE.Vector3(A.x + d.x * t, 0.01, A.z + d.z * t).addScaledVector(new THREE.Vector3(-d.z, 0, d.x), 1.9);
    mh.quad(new THREE.Vector3(p.x - 0.4, 0.011, p.z + 0.4), new THREE.Vector3(p.x + 0.4, 0.011, p.z + 0.4), new THREE.Vector3(p.x + 0.4, 0.011, p.z - 0.4), new THREE.Vector3(p.x - 0.4, 0.011, p.z - 0.4), Y, [0, 0], [1, 0], [1, 1], [0, 1]);
  }
}
function ruralRoad(B, A, Bn) {
  const dx = Bn.x - A.x, dz = Bn.z - A.z, L = Math.hypot(dx, dz);
  const d = new THREE.Vector3(dx / L, 0, dz / L);
  const startInCity = Math.abs(A.x) <= -W.OX + 1 && Math.abs(A.z) <= -W.OZ + 1;
  const endInCity = Math.abs(Bn.x) <= -W.OX + 1 && Math.abs(Bn.z) <= -W.OZ + 1;
  const t0 = startInCity ? RW : -4.5, t1 = endInCity ? L - RW : L + 4.5;
  strip(B.get('asphaltRural'), A, d, t0, t1, 0, 8, 0.004);
  strip(B.get('gravelShoulder'), A, d, t0, t1, -4.8, 1.6, -0.006);
  strip(B.get('gravelShoulder'), A, d, t0, t1, 4.8, 1.6, -0.006);
  const w = B.get('paintW');
  strip(w, A, d, t0 + 6, t1 - 6, -3.75, 0.15, 0.012); strip(w, A, d, t0 + 6, t1 - 6, 3.75, 0.15, 0.012);
  for (let t = t0 + 8; t < t1 - 8; t += 13) strip(w, A, d, t, t + 4, 0, 0.13, 0.012);
}

// ---------- trottoirs ----------
function roundedRect(x0, z0, x1, z1, rad) {
  const s = new THREE.Shape();
  // coordonnées de forme : (x, -z)
  s.moveTo(x0 + rad, -z0); s.lineTo(x1 - rad, -z0); s.quadraticCurveTo(x1, -z0, x1, -z0 - rad);
  s.lineTo(x1, -z1 + rad); s.quadraticCurveTo(x1, -z1, x1 - rad, -z1);
  s.lineTo(x0 + rad, -z1); s.quadraticCurveTo(x0, -z1, x0, -z1 + rad);
  s.lineTo(x0, -z0 - rad); s.quadraticCurveTo(x0, -z0, x0 + rad, -z0);
  return s;
}
function sidewalkBlock(ctx, scene, M, i, j) {
  const x0 = W.gx(i) + RW, x1 = W.gx(i + 1) - RW, z0 = W.gz(j) + RW, z1 = W.gz(j + 1) - RW;
  const shape = roundedRect(x0, z0, x1, z1, 4.5);
  const lot = W.blockRect(i, j);
  const hole = new THREE.Path();
  hole.moveTo(lot.x0, -lot.z0); hole.lineTo(lot.x0, -lot.z1); hole.lineTo(lot.x1, -lot.z1); hole.lineTo(lot.x1, -lot.z0); hole.lineTo(lot.x0, -lot.z0);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.04, bevelSegments: 2, curveSegments: 6 });
  g.rotateX(-Math.PI / 2);
  // ExtrudeGeometry : groupe 0 = faces, groupe 1 = côtés (bordure)
  const mesh = new THREE.Mesh(g, [M.sidewalk, M.curb]);
  mesh.receiveShadow = true; mesh.castShadow = false;
  ctx.B.__sidewalk = mesh;
  scene.add(mesh);
  // les côtés d'extrusion ont des UV en (longueur, profondeur) : OK pour le béton
}
function lotGround(ctx, rect, key, y = 0.151) {
  ctx.B.get(key).quad(new THREE.Vector3(rect.x0, y, rect.z1), new THREE.Vector3(rect.x1, y, rect.z1), new THREE.Vector3(rect.x1, y, rect.z0), new THREE.Vector3(rect.x0, y, rect.z0), Y,
    [rect.x0, rect.z1], [rect.x1, rect.z1], [rect.x1, rect.z0], [rect.x0, rect.z0]);
}

// ---------- quartiers ----------
const RES_STYLES = ['paris', 'cream', 'brick', 'painted', 'brickD', 'grey'];
const DT_STYLES = ['paris', 'modern', 'tiles', 'brickD', 'grey', 'paris'];
let shopIdx = 0;
function nextShop(R) { const s = SHOPS[shopIdx++ % SHOPS.length]; return s; }

// Îlot haussmannien/urbain : bâtiments mitoyens en périphérie, cour plantée au centre.
function perimeter(ctx, rect, R, d, sp, i, j) {
  lotGround(ctx, rect, 'plaza');
  const depth = 15 + R() * 3;
  const styles = d === 'D' ? DT_STYLES : RES_STYLES;
  const fl = d === 'D' ? [6, 10] : [4, 7];
  const list = [];
  const side = (key) => {
    const horiz = key === 'n' || key === 's';
    const a0 = horiz ? rect.x0 : rect.z0 + depth, a1 = horiz ? rect.x1 : rect.z1 - depth;
    let a = a0;
    while (a1 - a > 8) {
      let w = 14 + R() * 12; if (a1 - a - w < 10) w = a1 - a;
      const b = horiz
        ? { x0: a, x1: a + w, z0: key === 'n' ? rect.z0 : rect.z1 - depth, z1: key === 'n' ? rect.z0 + depth : rect.z1 }
        : { z0: a, z1: a + w, x0: key === 'w' ? rect.x0 : rect.x1 - depth, x1: key === 'w' ? rect.x0 + depth : rect.x1 };
      b.face = key; list.push(b); a += w;
    }
  };
  ['n', 's', 'w', 'e'].forEach(side);
  const opp = { n: 's', s: 'n', e: 'w', w: 'e' };
  list.forEach((b, k) => {
    b.rng = rng(Math.floor(R() * 1e9));
    b.style = pick(R, styles);
    b.floors = Math.floor(fl[0] + R() * (fl[1] - fl[0] + 1));
    const shopChance = d === 'D' ? 0.8 : 0.45;
    if (sp === 'driving_school_block' && !ctx._dsDone && b.face === 's') { ctx._dsDone = true; b.shops = [b.face]; b.shopInfo = { name: 'Auto-École Lumière', type: 'driving_school', bg: '#e08a1e', fg: '#ffffff', awning: ['#e08a1e', '#ffffff'] }; }
    else if (R() < shopChance) { b.shops = [b.face]; b.shopInfo = nextShop(R); }
    else b.entrance = b.face;
    b.blind = []; // murs mitoyens : pas d'ouvertures (cachés)
    const H = building(ctx, b);
    const place = b.shops ? W.addPlace({ type: b.shopInfo.type, name: b.shopInfo.name, bounds: b, floors: b.floors, height: H, district: d })
      : W.addPlace({ type: 'apartments', name: 'Résidence ' + (k + 1), bounds: b, floors: b.floors, units: (b.floors - 1) * 2, height: H, district: d });
    const door = (b.shops ? ctx.shopDoors : ctx.doors).at(-1);
    if (door) place.door = door;
    void opp;
  });
  // cour intérieure : pelouse + arbres
  const court = { x0: rect.x0 + depth + 1, x1: rect.x1 - depth - 1, z0: rect.z0 + depth + 1, z1: rect.z1 - depth - 1 };
  lotGround(ctx, court, 'grass', 0.16);
  for (let k = 0; k < 6; k++) ctx.trees.add(court.x0 + 4 + R() * (court.x1 - court.x0 - 8), court.z0 + 4 + R() * (court.z1 - court.z0 - 8), { scale: 0.9 + R() * 0.4, y: 0.15 });
  if (sp === 'home_block') W.places.filter(p => p.type === 'apartments' && Math.abs(p.bounds.x0 - rect.x0) < 60 && p.bounds.z0 >= rect.z0 - 1 && p.bounds.z1 <= rect.z1 + 1).forEach(p => p.homeBlock = true);

  if (sp === 'restaurant_block') {
    const p = W.places.filter(q => q.bounds && q.bounds.x0 >= rect.x0 - 1 && q.bounds.x1 <= rect.x1 + 1 && q.bounds.z0 >= rect.z0 - 1 && q.bounds.z1 <= rect.z1 + 1 && q.door && q.type !== 'apartments');
    if (p[0]) p[0].type = 'restaurant';
  }
}

function officeBlock(ctx, rect, R) {
  lotGround(ctx, rect, 'plaza');
  const t1 = { x0: rect.x0 + 6, x1: rect.x0 + 40, z0: rect.z0 + 8, z1: rect.z0 + 40, floors: 28, rng: R, entrance: 's', tint: 'alu', office: true, shopInfo: { name: 'Tour Lumière', type: 'office' } };
  const t2 = { x0: rect.x1 - 36, x1: rect.x1 - 6, z0: rect.z1 - 38, z1: rect.z1 - 8, floors: 18, rng: R, entrance: 'w', tint: 'aluDark', office: true, shopInfo: { name: 'Centre d’affaires Nova', type: 'office' } };
  for (const t of [t1, t2]) { const H = tower(ctx, t); W.addPlace({ type: 'office', name: t.shopInfo.name, bounds: t, height: H, door: ctx.shopDoors.at(-1), district: 'D' }); }
  // parvis : bacs plantés, bancs, arbres
  for (let k = 0; k < 8; k++) ctx.props.push({ name: 'planter_box_01', x: rect.x0 + 50 + (k % 4) * 9, y: 0.15, z: rect.z0 + 20 + Math.floor(k / 4) * 12, ry: 0, s: 1.6 });
  for (let k = 0; k < 4; k++) ctx.props.push({ name: 'modular_street_seating', x: rect.x0 + 55 + k * 9, y: 0.15, z: rect.z0 + 50, ry: 0, s: 1 });
  for (let k = 0; k < 5; k++) ctx.trees.add(rect.x0 + 12 + k * 7, rect.z1 - 14, { scale: 1, y: 0.15 });
  water(ctx, rect.x0 + 60, rect.z0 + 70, 9);
}

function water(ctx, x, z, rad) {
  const B = ctx.B;
  const ring = new THREE.TorusGeometry(rad, 0.35, 8, 40); ring.rotateX(Math.PI / 2); ring.translate(x, 0.55, z);
  B.get('stone').addGeometry(ring);
  const basin = new THREE.CylinderGeometry(rad, rad, 0.5, 40, 1, true); basin.translate(x, 0.4, z);
  B.get('stone').addGeometry(basin);
  const w = new THREE.CircleGeometry(rad - 0.1, 40).rotateX(-Math.PI / 2); w.translate(x, 0.5, z);
  B.get('water').addGeometry(w);
  const col = new THREE.CylinderGeometry(0.5, 0.8, 2.2, 16); col.translate(x, 1.4, z);
  B.get('stone').addGeometry(col);
  const bowl = new THREE.SphereGeometry(1.6, 20, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); bowl.translate(x, 2.6, z);
  B.get('stone').addGeometry(bowl);
  ctx.colliders.push({ circle: true, x, z, r: rad + 0.3 });
}

function park(ctx, rect, R, i, j) {
  lotGround(ctx, rect, 'grass');
  const cx = (rect.x0 + rect.x1) / 2, cz = (rect.z0 + rect.z1) / 2;
  // allées en croix + diagonales
  const path = ctx.B.get('gravel');
  path.aabb(rect.x0, 0.15, cz - 2, rect.x1, 0.168, cz + 2, 4);
  path.aabb(cx - 2, 0.15, rect.z0, cx + 2, 0.168, rect.z1, 4);
  water(ctx, cx, cz, 7);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2;
    ctx.props.push({ name: 'modular_street_seating', x: cx + Math.cos(a) * 13, y: 0.16, z: cz + Math.sin(a) * 13, ry: -a + Math.PI / 2, s: 1 });
  }
  for (let k = 0; k < 34; k++) {
    const x = rect.x0 + 4 + R() * (rect.x1 - rect.x0 - 8), z = rect.z0 + 4 + R() * (rect.z1 - rect.z0 - 8);
    if (Math.abs(x - cx) < 5 || Math.abs(z - cz) < 5) continue;
    ctx.trees.add(x, z, { scale: 0.9 + R() * 0.6, y: 0.15 });
  }
  for (let k = 0; k < 20; k++) ctx.props.push({ name: 'shrub_02', x: rect.x0 + 3 + R() * (rect.x1 - rect.x0 - 6), y: 0.15, z: rect.z0 + 3 + R() * (rect.z1 - rect.z0 - 6), ry: R() * 6, s: 0.6 + R() * 0.3 });
  for (const [x, z] of [[cx - 20, cz - 2.6], [cx + 20, cz + 2.6], [cx - 2.6, cz + 22], [cx + 2.6, cz - 22]]) ctx.props.push({ name: 'street_lamp_02', x, y: 0.15, z, ry: 0, s: 1, h: 4.2 });
  W.addPlace({ type: 'park', name: i === 1 ? 'Parc des Tilleuls' : 'Parc du Lac', x: cx, z: cz, bounds: rect, door: { p: new THREE.Vector3(cx, 0, rect.z1 - 1), nrm: new THREE.Vector3(0, 0, 1) } });
}

function sports(ctx, rect, R) {
  lotGround(ctx, rect, 'grass');
  const cx = (rect.x0 + rect.x1) / 2, cz = (rect.z0 + rect.z1) / 2;
  const fw = 34, fl = 60;
  ctx.B.get('pitch').aabb(cx - fw / 2 - 2, 0.15, cz - fl / 2 - 2, cx + fw / 2 + 2, 0.165, cz + fl / 2 + 2, 4);
  const w = ctx.B.get('paintW');
  const line = (x0, z0, x1, z1) => w.aabb(Math.min(x0, x1) - 0.06, 0.166, Math.min(z0, z1) - 0.06, Math.max(x0, x1) + 0.06, 0.168, Math.max(z0, z1) + 0.06, 4);
  line(cx - fw / 2, cz - fl / 2, cx + fw / 2, cz - fl / 2); line(cx - fw / 2, cz + fl / 2, cx + fw / 2, cz + fl / 2);
  line(cx - fw / 2, cz - fl / 2, cx - fw / 2, cz + fl / 2); line(cx + fw / 2, cz - fl / 2, cx + fw / 2, cz + fl / 2);
  line(cx - fw / 2, cz, cx + fw / 2, cz);
  for (const s of [-1, 1]) {
    line(cx - 8, cz + s * (fl / 2 - 9), cx + 8, cz + s * (fl / 2 - 9));
    line(cx - 8, cz + s * fl / 2, cx - 8, cz + s * (fl / 2 - 9)); line(cx + 8, cz + s * fl / 2, cx + 8, cz + s * (fl / 2 - 9));
    // buts
    const m = ctx.B.get('frameWhite'); const gz = cz + s * fl / 2;
    m.aabb(cx - 3.7, 0.15, gz - 0.06, cx - 3.58, 2.6, gz + 0.06); m.aabb(cx + 3.58, 0.15, gz - 0.06, cx + 3.7, 2.6, gz + 0.06); m.aabb(cx - 3.7, 2.48, gz - 0.06, cx + 3.7, 2.6, gz + 0.06);
  }
  // tribune
  const tb = ctx.B.get('concTile');
  for (let k = 0; k < 6; k++) tb.aabb(cx + fw / 2 + 5 + k * 0.9, 0.15, cz - 25, cx + fw / 2 + 5.9 + k * 0.9, 0.6 + k * 0.5, cz + 25);
  ctx.B.get('aluDark').aabb(cx + fw / 2 + 4, 6.5, cz - 26, cx + fw / 2 + 11, 6.7, cz + 26);
  for (let z = -24; z <= 24; z += 12) ctx.B.get('aluDark').aabb(cx + fw / 2 + 10.6, 0.15, cz + z - 0.12, cx + fw / 2 + 10.9, 6.6, cz + z + 0.12);
  ctx.colliders.push({ x0: cx + fw / 2 + 4.5, z0: cz - 25, x1: cx + fw / 2 + 11, z1: cz + 25, h: 3 });
  for (let k = 0; k < 10; k++) ctx.trees.add(rect.x0 + 4, rect.z0 + 6 + k * 9, { y: 0.15 });
  W.addPlace({ type: 'sports', name: 'Stade municipal', x: cx, z: cz, bounds: rect, door: { p: new THREE.Vector3(rect.x0 + 2, 0, cz), nrm: new THREE.Vector3(-1, 0, 0) } });
}

function suburb(ctx, rect, R, i, j) {
  lotGround(ctx, rect, 'grass');
  const lw = (rect.x1 - rect.x0) / 4, mid = (rect.z0 + rect.z1) / 2;
  for (const front of ['n', 's']) for (let k = 0; k < 4; k++) {
    const lot = { x0: rect.x0 + k * lw, x1: rect.x0 + (k + 1) * lw, z0: front === 'n' ? rect.z0 : mid, z1: front === 'n' ? mid : rect.z1, front };
    const h = house(ctx, lot, rng(Math.floor(R() * 1e9)));
    const price = 180000 + Math.floor(R() * 14) * 10000;
    W.addPlace({ type: 'house', name: `${(k + 1) * 2 + (front === 'n' ? 0 : 1)} rue des Tilleuls`, bounds: h.bounds, lot, door: { ...h.door }, garage: h.garage, price, rent: Math.round(price / 220), district: 'S' });
    // haie de fond
    const zz = front === 'n' ? mid - 0.5 : mid + 0.5;
    for (let x = lot.x0 + 1.5; x < lot.x1 - 1; x += 3) if (R() < 0.8) ctx.props.push({ name: 'shrub_02', x, y: 0.15, z: zz, ry: R() * 6, s: 0.6 });
  }
}

const VILLA_NAMES = ['Villa Azur', 'Villa des Pins', 'Villa Horizon', 'Villa Solstice', 'Villa Belvédère', 'Villa Les Oliviers', 'Villa Panorama', 'Villa Cap Lumière', 'Villa Émeraude', 'Villa Riviera', 'Villa Zénith', 'Villa Les Cèdres'];
let villaN = 0;
function villas(ctx, rect, R, i, j) {
  lotGround(ctx, rect, 'grass');
  const mx = (rect.x0 + rect.x1) / 2, mz = (rect.z0 + rect.z1) / 2;
  for (const front of ['n', 's']) for (const half of [0, 1]) {
    const lot = { x0: half ? mx : rect.x0, x1: half ? rect.x1 : mx, z0: front === 'n' ? rect.z0 : mz, z1: front === 'n' ? mz : rect.z1, front };
    const v = villa(ctx, lot, rng(Math.floor(R() * 1e9)));
    const price = 950000 + Math.floor(R() * 16) * 100000;
    W.addPlace({ type: 'house', villa: true, name: VILLA_NAMES[villaN++ % VILLA_NAMES.length], bounds: v.bounds, lot, door: v.door, garage: v.garage, price, rent: Math.round(price / 260), district: 'V' });
  }
}

function retail(ctx, rect, R) {
  lotGround(ctx, rect, 'parkingLot');
  // deux bâtiments commerciaux bas + parking central
  const shops = [nextShop(R), nextShop(R)];
  const b1 = { x0: rect.x0 + 4, x1: rect.x0 + 44, z0: rect.z0 + 4, z1: rect.z0 + 26, floors: 2, style: 'modern', rng: R, shops: ['s'], shopInfo: shops[0], blind: [] };
  const b2 = { x0: rect.x1 - 44, x1: rect.x1 - 4, z0: rect.z0 + 4, z1: rect.z0 + 26, floors: 2, style: 'tiles', rng: R, shops: ['s'], shopInfo: shops[1], blind: [] };
  for (const b of [b1, b2]) { const H = building(ctx, b); W.addPlace({ type: b.shopInfo.type, name: b.shopInfo.name, bounds: b, height: H, door: ctx.shopDoors.at(-1), district: 'C' }); }
  parkingLot(ctx, { x0: rect.x0 + 6, x1: rect.x1 - 6, z0: rect.z0 + 34, z1: rect.z1 - 6 }, R);
}

function parkingLot(ctx, area, R, place) {
  const w = ctx.B.get('paintW');
  const rows = [];
  for (let z = area.z0 + 3; z + 5 <= area.z1; z += 16) rows.push(z);
  const spots = [];
  for (const z of rows) for (const dir of [1, -1]) {
    const zr = dir > 0 ? z : z + 10.5;
    for (let x = area.x0 + 1; x + 2.6 < area.x1; x += 2.7) {
      w.aabb(x - 0.05, 0.155, zr, x + 0.05, 0.157, zr + 5, 4);
      const s = { x: x + 1.35, z: zr + 2.5, rotY: dir > 0 ? 0 : Math.PI, taken: null, lot: true };
      spots.push(s); W.parkingSpots.push(s);
    }
  }
  for (let k = 0; k < spots.length; k += 11) ctx.props.push({ name: 'street_lamp_01', x: spots[k].x, y: 0.15, z: spots[k].z + (spots[k].rotY ? -3 : 3), ry: 0, s: 1, h: 7 });
  if (place) place.parking = spots;
  return spots;
}

function supermarket(ctx, rect, R) {
  lotGround(ctx, rect, 'parkingLot');
  const b = { x0: rect.x0 + 4, x1: rect.x1 - 4, z0: rect.z0 + 4, z1: rect.z0 + 42, floors: 2, style: 'tiles', rng: R, shops: ['s'], shopInfo: { name: 'SUPER U-LUMEN', type: 'supermarket', bg: '#c4161c', fg: '#ffffff' }, blind: [] };
  const H = building(ctx, b);
  const place = W.addPlace({ type: 'supermarket', name: 'Supermarché Lumen', bounds: b, height: H, door: ctx.shopDoors.at(-1), district: 'C', jobs: ['cashier', 'shelver'] });
  // marquise d'entrée
  const cx = (b.x0 + b.x1) / 2;
  ctx.B.get('aluDark').aabb(cx - 9, 4.0, b.z1, cx + 9, 4.4, b.z1 + 4);
  for (const x of [cx - 8.6, cx + 8.6]) ctx.B.get('alu').aabb(x - 0.12, 0.15, b.z1 + 3.6, x + 0.12, 4.0, b.z1 + 3.85);
  // abris à chariots
  for (const x of [rect.x0 + 30, rect.x1 - 30]) { ctx.B.get('aluDark').aabb(x - 3, 2.3, b.z1 + 12, x + 3, 2.4, b.z1 + 14.5); ctx.B.get('alu').aabb(x - 3, 0.15, b.z1 + 12, x - 2.9, 2.3, b.z1 + 12.1); ctx.B.get('alu').aabb(x + 2.9, 0.15, b.z1 + 12, x + 3, 2.3, b.z1 + 12.1); }
  parkingLot(ctx, { x0: rect.x0 + 4, x1: rect.x1 - 4, z0: b.z1 + 18, z1: rect.z1 - 3 }, R, place);
}

function dealership(ctx, rect, R) {
  lotGround(ctx, rect, 'plaza');
  // showroom vitré
  const b = { x0: rect.x0 + 6, x1: rect.x0 + 56, z0: rect.z0 + 6, z1: rect.z0 + 34, rng: R, floors: 2 };
  const B = ctx.B; const H = 8;
  for (const s of sides(b)) {
    const n = Math.round(s.L / 4); const bay = s.L / n;
    for (let k = 0; k < n; k++) glass(ctx, at(s, bay * (k + 0.5), H / 2, -0.05), s.nrm, bay - 0.15, H - 0.4, [bay * 2, H, 14, R()], [1, 0, 0.2, 0]);
    for (let k = 0; k <= n; k++) B.get('alu').box(at(s, bay * k, H / 2, 0.05), 0.08, H / 2, 0.1, s.ax);
    B.get('aluDark').box(at(s, s.L / 2, H + 0.6, 0.1), s.L / 2 + 0.2, 0.6, 0.15, s.ax);
  }
  B.get('roof').aabb(b.x0, H, b.z0, b.x1, H + 1.1, b.z1, 4);
  B.get('showroomFloor').aabb(b.x0, 0.15, b.z0, b.x1, 0.17, b.z1, 4);
  const sm = 'sign:Concession Lumière Auto';
  ctx.signMats[sm] = { name: 'Lumière Automobiles', bg: '#101820', fg: '#f2c14e' };
  const s0 = sides(b)[0];
  const a = at(s0, 10, H + 1.4, 0.3), c = at(s0, 40, H + 1.4, 0.3);
  B.get(sm).quad(a, c, c.clone().setY(H + 3.2), a.clone().setY(H + 3.2), s0.nrm, [0, 0], [1, 0], [1, 1], [0, 1]);
  ctx.colliders.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, h: H });
  const door = { p: at(s0, s0.L / 2, 0, 1.2), nrm: s0.nrm.clone() };
  const place = W.addPlace({ type: 'dealership', name: 'Lumière Automobiles', bounds: b, height: H, door, district: 'C', jobs: ['car_seller'] });
  // parc extérieur de véhicules en vente
  place.display = [];
  for (let k = 0; k < 8; k++) place.display.push({ x: rect.x0 + 66 + (k % 2) * 8, z: rect.z0 + 10 + Math.floor(k / 2) * 8, rotY: -Math.PI / 2 });
  for (let k = 0; k < 5; k++) place.display.push({ x: rect.x0 + 12 + k * 9, z: rect.z0 + 48, rotY: Math.PI });
  // fanions
  for (let k = 0; k < 6; k++) { B.get('alu').aabb(rect.x0 + 62 + k * 5, 0.15, rect.z1 - 4, rect.x0 + 62.1 + k * 5, 7, rect.z1 - 3.9); B.get('flag').aabb(rect.x0 + 62.1 + k * 5, 4.5, rect.z1 - 3.97, rect.x0 + 63.2 + k * 5, 6.8, rect.z1 - 3.93); }
  parkingLot(ctx, { x0: rect.x0 + 4, x1: rect.x1 - 4, z0: rect.z0 + 58, z1: rect.z1 - 8 }, R);
}

function gasStationBlock(ctx, rect, R) {
  lotGround(ctx, rect, 'parkingLot');
  const B = ctx.B;
  // auvent de station
  const cx = rect.x0 + 30, cz = rect.z1 - 26;
  B.get('canopy').aabb(cx - 16, 5.2, cz - 10, cx + 16, 6.2, cz + 10);
  B.get('canopyRed').aabb(cx - 16.05, 5.5, cz - 10.05, cx + 16.05, 6.0, cz + 10.05);
  for (const [dx, dz] of [[-10, -5], [10, -5], [-10, 5], [10, 5]]) B.get('frameWhite').aabb(cx + dx - 0.3, 0.15, cz + dz - 0.3, cx + dx + 0.3, 5.2, cz + dz + 0.3);
  const pumps = [];
  for (const dx of [-10, 0, 10]) for (const dz of [-5, 5]) {
    // îlot + pompe
    B.get('curbMat').aabb(cx + dx - 0.7, 0.15, cz + dz - 2.2, cx + dx + 0.7, 0.35, cz + dz + 2.2);
    B.get('pumpBody').aabb(cx + dx - 0.45, 0.35, cz + dz - 0.6, cx + dx + 0.45, 2.3, cz + dz + 0.6);
    B.get('pumpScreen').aabb(cx + dx - 0.46, 1.5, cz + dz - 0.3, cx + dx + 0.46, 1.9, cz + dz + 0.3);
    B.get('canopyRed').aabb(cx + dx - 0.47, 2.0, cz + dz - 0.62, cx + dx + 0.47, 2.35, cz + dz + 0.62);
    B.get('rubber').aabb(cx + dx + 0.45, 0.9, cz + dz - 0.04, cx + dx + 0.5, 1.6, cz + dz + 0.04);
    pumps.push({ x: cx + dx + 2.2, z: cz + dz, rotY: Math.PI / 2 }, { x: cx + dx - 2.2, z: cz + dz, rotY: -Math.PI / 2 });
    ctx.colliders.push({ x0: cx + dx - 0.7, z0: cz + dz - 2.2, x1: cx + dx + 0.7, z1: cz + dz + 2.2, h: 2.3 });
  }
  // boutique de station
  const b = { x0: rect.x0 + 6, x1: rect.x0 + 36, z0: rect.z0 + 6, z1: rect.z0 + 22, floors: 1, style: 'tiles', rng: R, shops: ['s'], shopInfo: { name: 'Station Lumen 24/24', type: 'gas_station', bg: '#0b5a2a', fg: '#ffffff' }, blind: [] };
  const H = building(ctx, b);
  W.addPlace({ type: 'gas_station', name: 'Station-service Lumen', bounds: b, height: H, door: ctx.shopDoors.at(-1), pumps, district: 'C', jobs: ['cashier'] });
  // totem prix
  B.get('canopy').aabb(rect.x1 - 8, 0.15, rect.z1 - 4, rect.x1 - 6, 7.5, rect.z1 - 3.4);
  const tm = 'sign:Station prix'; ctx.signMats[tm] = { name: 'Gazole 1,79 · SP95 1,89', bg: '#0b5a2a', fg: '#ffe066' };
  const a = new THREE.Vector3(rect.x1 - 9.5, 5.2, rect.z1 - 3.38), c = new THREE.Vector3(rect.x1 - 4.5, 5.2, rect.z1 - 3.38);
  B.get(tm).quad(a, c, c.clone().setY(7.2), a.clone().setY(7.2), new THREE.Vector3(0, 0, 1), [0, 0], [1, 0], [1, 1], [0, 1]);
  // garage / lavage + boutique annexe
  const b2 = { x0: rect.x1 - 40, x1: rect.x1 - 4, z0: rect.z0 + 4, z1: rect.z0 + 40, floors: 3, style: 'grey', rng: R, shops: ['w'], shopInfo: nextShop(R), blind: [] };
  const H2 = building(ctx, b2);
  W.addPlace({ type: b2.shopInfo.type, name: b2.shopInfo.name, bounds: b2, height: H2, door: ctx.shopDoors.at(-1), district: 'C' });
}

function mallParking(ctx, rect, R) {
  lotGround(ctx, rect, 'parkingLot');
  const b = { x0: rect.x0 + 4, x1: rect.x1 - 4, z0: rect.z1 - 30, z1: rect.z1 - 4, floors: 3, style: 'modern', rng: R, shops: ['n'], shopInfo: nextShop(R), blind: [] };
  const H = building(ctx, b);
  W.addPlace({ type: b.shopInfo.type, name: b.shopInfo.name, bounds: b, height: H, door: ctx.shopDoors.at(-1), district: 'C' });
  parkingLot(ctx, { x0: rect.x0 + 4, x1: rect.x1 - 4, z0: rect.z0 + 4, z1: rect.z1 - 36 }, R);
}

function industrial(ctx, rect, R, withGarage) {
  lotGround(ctx, rect, 'concreteYard');
  const B = ctx.B;
  const halls = withGarage
    ? [{ x0: rect.x0 + 4, x1: rect.x0 + 40, z0: rect.z0 + 4, z1: rect.z0 + 34, name: 'Garage Mécanique Lumen', type: 'garage', jobs: ['mechanic'] }, { x0: rect.x0 + 48, x1: rect.x1 - 4, z0: rect.z0 + 4, z1: rect.z0 + 50, name: 'Entrepôt Express Livraisons', type: 'warehouse', jobs: ['delivery'] }]
    : [{ x0: rect.x0 + 4, x1: rect.x0 + 46, z0: rect.z0 + 4, z1: rect.z0 + 46, name: 'Entrepôts des Forges', type: 'warehouse', jobs: ['delivery'] }, { x0: rect.x0 + 52, x1: rect.x1 - 4, z0: rect.z0 + 4, z1: rect.z0 + 40, name: 'Usine Metalis', type: 'factory', jobs: ['worker'] }];
  for (const h of halls) {
    const H = 9 + R() * 4;
    const hb = { ...h };
    for (const s of sides(hb)) {
      B.get('metalSheet').wallRect(s.o, s.ax, s.nrm, 0, s.L, 1.2, H);
      B.get('concTile').wallRect(s.o, s.ax, s.nrm, 0, s.L, 0, 1.2);
      // bande de fenêtres hautes
      for (let u = 3; u < s.L - 3; u += 6) glass(ctx, at(s, u, H - 1.6, 0.03), s.nrm, 4, 1.2, [6, 6, 12, R()], [2, 0, 3, 0]);
      // portes sectionnelles + quais
      if (s.key === 's') for (let u = 6; u < s.L - 4; u += 9) {
        const a = at(s, u - 2, 0, 0.04), c = at(s, u + 2, 0, 0.04);
        B.get('garageDoor').quad(a, c, c.clone().setY(4.5), a.clone().setY(4.5), s.nrm, [0, 0], [4, 0], [4, 4.5], [0, 4.5]);
        B.get('aluDark').box(at(s, u, 4.8, 0.6), 2.4, 0.08, 0.6, s.ax);
        B.get('rubber').box(at(s, u - 2.2, 2.2, 0.1), 0.1, 2.2, 0.1, s.ax); B.get('rubber').box(at(s, u + 2.2, 2.2, 0.1), 0.1, 2.2, 0.1, s.ax);
      }
    }
    // toit à faible pente + lanterneaux
    B.get('metalSheet').aabb(hb.x0 - 0.3, H, hb.z0 - 0.3, hb.x1 + 0.3, H + 0.3, hb.z1 + 0.3);
    for (let x = hb.x0 + 5; x < hb.x1 - 4; x += 8) B.get('skylight').aabb(x, H + 0.3, hb.z0 + 4, x + 2.5, H + 0.9, hb.z1 - 4);
    ctx.colliders.push({ x0: hb.x0, z0: hb.z0, x1: hb.x1, z1: hb.z1, h: H });
    if (h.type === 'factory') {
      // cheminée
      const cyl = new THREE.CylinderGeometry(1.1, 1.5, 26, 20); cyl.translate(hb.x1 - 6, 13, hb.z0 + 6);
      B.get('brickDark').addGeometry(cyl);
      for (let k = 0; k < 4; k++) { const t = new THREE.TorusGeometry(1.25 - k * 0.04, 0.08, 6, 20); t.rotateX(Math.PI / 2); t.translate(hb.x1 - 6, 8 + k * 5, hb.z0 + 6); B.get('metalDark').addGeometry(t); }
    }
    // enseigne
    const key = 'sign:' + h.name; ctx.signMats[key] = { name: h.name, bg: '#1b2733', fg: '#ffffff' };
    const s0 = sides(hb)[0]; const a = at(s0, s0.L / 2 - 9, H - 3.4, 0.08), c = at(s0, s0.L / 2 + 9, H - 3.4, 0.08);
    B.get(key).quad(a, c, c.clone().setY(H - 2.2), a.clone().setY(H - 2.2), s0.nrm, [0, 0], [1, 0], [1, 1], [0, 1]);
    const door = { p: at(s0, 2, 0, 1.5), nrm: s0.nrm.clone() };
    B.get('door').box(at(s0, 2, 1.1, 0.03), 0.5, 1.1, 0.03, s0.ax);
    W.addPlace({ type: h.type, name: h.name, bounds: hb, height: H, door, district: 'I', jobs: h.jobs });
  }
  // conteneurs, palettes, clôture grillagée
  const colors = ['containerBlue', 'containerRed', 'containerGreen', 'containerOrange'];
  for (let k = 0; k < 6; k++) {
    const x = rect.x0 + 8 + k * 13, z = rect.z1 - 12, c = pick(R, colors);
    B.get(c).aabb(x, 0.15, z - 1.22, x + 12.2, 2.74, z + 1.22);
    if (R() < 0.4) B.get(pick(R, colors)).aabb(x, 2.74, z - 1.22, x + 12.2, 5.33, z + 1.22);
    ctx.colliders.push({ x0: x, z0: z - 1.22, x1: x + 12.2, z1: z + 1.22, h: 2.7 });
  }
  for (let k = 0; k < 6; k++) ctx.props.push({ name: 'concrete_road_barrier', x: rect.x0 + 10 + k * 4, y: 0.15, z: rect.z1 - 22, ry: 0, s: 1 });
}

// ---------- mobilier urbain ----------
function streetFurniture(ctx, i, j, d, R) {
  const x0 = W.gx(i) + RW, x1 = W.gx(i + 1) - RW, z0 = W.gz(j) + RW, z1 = W.gz(j + 1) - RW;
  const edgesB = [
    { a: [x0 + 8, z0 + 0.7], b: [x1 - 8, z0 + 0.7], ry: 0 }, { a: [x0 + 8, z1 - 0.7], b: [x1 - 8, z1 - 0.7], ry: Math.PI },
    { a: [x0 + 0.7, z0 + 8], b: [x0 + 0.7, z1 - 8], ry: Math.PI / 2 }, { a: [x1 - 0.7, z0 + 8], b: [x1 - 0.7, z1 - 8], ry: -Math.PI / 2 },
  ];
  const urban = d === 'D' || d === 'R';
  for (const e of edgesB) {
    const L = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
    const pt = (t) => [e.a[0] + (e.b[0] - e.a[0]) * t / L, e.a[1] + (e.b[1] - e.a[1]) * t / L];
    for (let t = 2; t <= L - 2; t += 30) { const [x, z] = pt(t); ctx.props.push({ name: d === 'S' ? 'street_lamp_02' : 'street_lamp_01', x, y: 0.15, z, ry: e.ry, s: 1, h: d === 'S' ? 4.6 : 7.5 }); ctx.lampPosts.push({ x, z, h: d === 'S' ? 4.6 : 7.5 }); }
    if (urban || d === 'C') {
      for (let t = 17; t <= L - 10; t += 15) {
        if (Math.abs(((t - 2) % 30)) < 3) continue;
        const [x, z] = pt(t); const ins = [x + (e.ry === Math.PI / 2 ? 1.3 : e.ry === -Math.PI / 2 ? -1.3 : 0), z + (e.ry === 0 ? 1.3 : e.ry === Math.PI ? -1.3 : 0)];
        ctx.trees.add(ins[0], ins[1], { scale: 0.85 + R() * 0.3, y: 0.15 });
        const g = ctx.B.get('treeGrate');
        g.quad(new THREE.Vector3(ins[0] - 0.75, 0.155, ins[1] + 0.75), new THREE.Vector3(ins[0] + 0.75, 0.155, ins[1] + 0.75), new THREE.Vector3(ins[0] + 0.75, 0.155, ins[1] - 0.75), new THREE.Vector3(ins[0] - 0.75, 0.155, ins[1] - 0.75), Y, [0, 0], [1, 0], [1, 1], [0, 1]);
        ctx.colliders.push({ circle: true, x: ins[0], z: ins[1], r: 0.35 });
      }
    }
    if (R() < 0.7) { const [x, z] = pt(L * (0.2 + R() * 0.6)); ctx.props.push({ name: 'fire_hydrant', x, y: 0.15, z, ry: e.ry, s: 1, h: 0.75 }); }
    if (urban && R() < 0.8) { const [x, z] = pt(L * (0.3 + R() * 0.4)); ctx.props.push({ name: 'metal_trash_can', x, y: 0.15, z, ry: e.ry, s: 1, h: 0.95 }); }
    if (urban && R() < 0.4) { const [x, z] = pt(L * (0.4 + R() * 0.3)); ctx.props.push({ name: 'modular_street_seating', x, y: 0.15, z, ry: e.ry, s: 1 }); }
  }
}

// ---------- feux tricolores ----------
function buildSignals(ctx, scene, M) {
  const B = new Buckets();
  const lens = [];
  for (const n of W.nodes) {
    if (!n.signal) continue;
    n.phaseOffset = Math.random() * 40;
    for (const eid of n.links) {
      const e = W.edges[eid]; // sortante ; l'entrante est l'opposée
      const din = e.dir.clone().negate(); // direction des véhicules qui arrivent sur n par cette arête
      const rgt = new THREE.Vector3(-din.z, 0, din.x);
      const base = new THREE.Vector3(n.x, 0, n.z).addScaledVector(din, -(RW + 1.2)).addScaledVector(rgt, RW + 0.9);
      // mât
      B.get('signalPole').addGeometry(new THREE.CylinderGeometry(0.09, 0.11, 6.2, 10), new THREE.Matrix4().makeTranslation(base.x, 3.25, base.z));
      // potence au-dessus de la voie
      const armLen = RW + 0.9 - W.LANE + 0.6;
      const armMid = base.clone().addScaledVector(rgt, -armLen / 2);
      const m = new THREE.Matrix4().makeRotationY(Math.atan2(rgt.x, rgt.z)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
      m.setPosition(armMid.x, 6.1, armMid.z);
      B.get('signalPole').addGeometry(new THREE.CylinderGeometry(0.06, 0.07, armLen, 8), m);
      const heads = [base.clone().addScaledVector(rgt, -armLen + 0.6).setY(5.3), base.clone().addScaledVector(din, 0.05).setY(2.9)];
      const ry = Math.atan2(-din.x, -din.z);
      for (const h of heads) {
        const hm = new THREE.Matrix4().makeRotationY(ry).setPosition(h.x, h.y, h.z);
        B.get('signalBody').addGeometry(new THREE.BoxGeometry(0.34, 1.0, 0.26), hm);
        B.get('signalBody').addGeometry(new THREE.BoxGeometry(0.56, 1.24, 0.03), new THREE.Matrix4().makeTranslation(0, 0, -0.15).premultiply(hm));
        for (let k = 0; k < 3; k++) {
          const visor = new THREE.CylinderGeometry(0.13, 0.13, 0.18, 12, 1, true, -Math.PI / 2, Math.PI);
          visor.rotateX(Math.PI / 2); visor.translate(0, 0.32 - k * 0.32 + 0.0, 0.22);
          B.get('signalBody').addGeometry(visor, hm);
          lens.push({ m: new THREE.Matrix4().makeTranslation(0, 0.32 - k * 0.32, 0.135).premultiply(hm), color: k, node: n.id, axis: Math.abs(din.x) > 0.5 ? 'x' : 'z' });
        }
      }
      ctx.colliders.push({ circle: true, x: base.x, z: base.z, r: 0.2 });
    }
  }
  for (const mesh of B.toMeshes(M)) scene.add(mesh);
  const lg = new THREE.CircleGeometry(0.11, 16);
  const lm = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: true });
  const im = new THREE.InstancedMesh(lg, lm, lens.length);
  lens.forEach((l, k) => { im.setMatrixAt(k, l.m); im.setColorAt(k, new THREE.Color(0x111111)); });
  im.instanceColor.needsUpdate = true; im.frustumCulled = false;
  scene.add(im);
  ctx.signals = { mesh: im, lens };
}

// État d'un feu pour une arête entrante (axe x ou z) : 'G' | 'Y' | 'R'
export const CYCLE = 34;
export function signalState(node, axis, t) {
  const c = ((t + (node.phaseOffset || 0)) % CYCLE + CYCLE) % CYCLE;
  // 0-14 : x vert, 14-17 : x orange, 17-31 : z vert, 31-34 : z orange (rouge total 1 s inclus)
  if (axis === 'x') return c < 13.5 ? 'G' : c < 16.5 ? 'Y' : 'R';
  return c >= 17 && c < 30.5 ? 'G' : c >= 30.5 && c < 33.5 ? 'Y' : 'R';
}
const ON = [new THREE.Color(9, 0.6, 0.4), new THREE.Color(9, 5, 0.3), new THREE.Color(0.4, 7, 2.5)];
const OFF = [new THREE.Color(0.12, 0.02, 0.02), new THREE.Color(0.12, 0.08, 0.01), new THREE.Color(0.02, 0.1, 0.05)];
export function updateSignals(ctx, t) {
  const s = ctx.signals; if (!s) return;
  s.lens.forEach((l, k) => {
    const st = signalState(W.nodes[l.node], l.axis, t);
    const on = (l.color === 0 && st === 'R') || (l.color === 1 && st === 'Y') || (l.color === 2 && st === 'G');
    s.mesh.setColorAt(k, on ? ON[l.color] : OFF[l.color]);
  });
  s.mesh.instanceColor.needsUpdate = true;
}

// ---------- stationnement en bordure ----------
function curbParking() {
  const seen = new Set();
  for (const e of W.edges) {
    if (e.kind !== 'city') continue;
    const A = W.nodes[e.a];
    for (let t = RW + 10; t < e.len - RW - 10; t += 6.5) {
      if (Math.random() < 0.15) continue;
      const rgt = new THREE.Vector3(-e.dir.z, 0, e.dir.x);
      const x = A.x + e.dir.x * t + rgt.x * W.PARK, z = A.z + e.dir.z * t + rgt.z * W.PARK;
      const k = Math.round(x) + ',' + Math.round(z); if (seen.has(k)) continue; seen.add(k);
      W.parkingSpots.push({ x, z, rotY: Math.atan2(e.dir.x, e.dir.z), taken: null, edge: e.id, t });
    }
  }
}
