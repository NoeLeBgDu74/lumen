// Plan du monde : quartiers, réseau routier (graphe orienté), lieux importants.
// Tout le reste (génération 3D, circulation, PNJ, GPS) s'appuie sur ces données.
import * as THREE from 'three';

export const P = 120;          // pas de la grille (axe de route à axe de route)
export const RW = 7;           // demi-largeur de chaussée (bordure à bordure : 14 m)
export const SW = 5;           // largeur du trottoir
export const LANE = 1.9;       // décalage de la voie de circulation (à droite de l'axe)
export const PARK = 5.25;      // décalage de la file de stationnement
export const NX = 8, NZ = 6;   // blocs
export const OX = -NX * P / 2, OZ = -NZ * P / 2;
export const RING = 260;       // marge de la route de campagne autour de la ville

// Quartiers par bloc (ligne = j du nord au sud).
// S pavillons · R résidentiel · D centre-ville · C commerces · I industrie · L loisirs
const MAP = [
  'SSSRRIII',
  'SSRRDDII',
  'SLRDDCCI',
  'SSRDDCCC',
  'SSRRLLCC',
  'SSSRRLCC',
];
export const DISTRICT_NAMES = { S: 'Les Tilleuls (pavillons)', R: 'Belleville (résidentiel)', D: 'Centre-ville', C: 'Zone commerciale du Lac', I: 'Zone industrielle des Forges', L: 'Parc & loisirs' };
export const district = (i, j) => (MAP[j] && MAP[j][i]) || 'X';

// Lots spéciaux : bloc → bâtiment(s) clé(s).
export const SPECIAL = {
  '3,2': 'driving_school_block',  // auto-école + immeubles
  '4,2': 'office_block',          // tour de bureaux (emploi)
  '4,3': 'restaurant_block',      // restaurant / café / boutiques
  '5,2': 'supermarket',           // supermarché + parking
  '6,2': 'dealership',            // concession automobile
  '5,3': 'gas_station_block',     // station-service + commerces
  '6,4': 'mall_parking',          // parking + commerces
  '7,1': 'garage_block',          // garage mécanique + entrepôts
  '1,2': 'park',                  // parc central
  '4,4': 'park', '5,4': 'sports', '5,5': 'park',
  '2,3': 'home_block',            // immeuble de départ du joueur
};

// ---------- graphe routier ----------
export const nodes = [];   // {id, x, z, links:[edgeIds], signal:bool}
export const edges = [];   // {id, a, b, len, dir:Vector3(a→b), kind}
const nodeAt = new Map();
function addNode(x, z, signal = false) {
  const k = Math.round(x) + ',' + Math.round(z);
  if (nodeAt.has(k)) { const n = nodes[nodeAt.get(k)]; n.signal = n.signal || signal; return n.id; }
  const id = nodes.length; nodes.push({ id, x, z, links: [], signal }); nodeAt.set(k, id); return id;
}
function addEdge(a, b, kind = 'city') {
  const A = nodes[a], B = nodes[b];
  const dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz);
  for (const [u, v] of [[a, b], [b, a]]) {
    const U = nodes[u], V = nodes[v];
    const id = edges.length;
    edges.push({ id, a: u, b: v, len, dir: new THREE.Vector3((V.x - U.x) / len, 0, (V.z - U.z) / len), kind, speed: kind === 'rural' ? 22 : 13.9 });
    U.links.push(id);
  }
}
export const gx = (i) => OX + i * P, gz = (j) => OZ + j * P;
for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) addNode(gx(i), gz(j), true);
for (let j = 0; j <= NZ; j++) for (let i = 0; i < NX; i++) addEdge(addNode(gx(i), gz(j)), addNode(gx(i + 1), gz(j)));
for (let i = 0; i <= NX; i++) for (let j = 0; j < NZ; j++) addEdge(addNode(gx(i), gz(j)), addNode(gx(i), gz(j + 1)));
// Route de campagne en anneau + raccordements.
const X0 = gx(0) - RING, X1 = gx(NX) + RING, Z0 = gz(0) - RING, Z1 = gz(NZ) + RING;
export const RING_BOX = { X0, X1, Z0, Z1 };
const exitsX = [2, 6], exitsZ = [3];
const ringNodes = { n: [], s: [], w: [], e: [] };
for (const i of exitsX) {
  const a = addNode(gx(i), Z0), b = addNode(gx(i), Z1);
  addEdge(addNode(gx(i), gz(0)), a, 'rural'); addEdge(addNode(gx(i), gz(NZ)), b, 'rural');
  ringNodes.n.push(a); ringNodes.s.push(b);
}
for (const j of exitsZ) {
  const a = addNode(X0, gz(j)), b = addNode(X1, gz(j));
  addEdge(addNode(gx(0), gz(j)), a, 'rural'); addEdge(addNode(gx(NX), gz(j)), b, 'rural');
  ringNodes.w.push(a); ringNodes.e.push(b);
}
const c00 = addNode(X0, Z0), c10 = addNode(X1, Z0), c11 = addNode(X1, Z1), c01 = addNode(X0, Z1);
const chain = (ids) => { for (let k = 0; k < ids.length - 1; k++) addEdge(ids[k], ids[k + 1], 'rural'); };
chain([c00, ...ringNodes.n, c10]); chain([c01, ...ringNodes.s, c11]);
chain([c00, ...ringNodes.w, c01]); chain([c10, ...ringNodes.e, c11]);
for (const id of [c00, c10, c11, c01, ...ringNodes.n, ...ringNodes.s, ...ringNodes.w, ...ringNodes.e]) nodes[id].signal = false;
// les nœuds de bord de ville sans raccordement n'ont pas besoin de feux (carrefours en T : feux quand même pour l'homogénéité)

export function edgeBetween(a, b) { for (const e of nodes[a].links) if (edges[e].b === b) return edges[e]; return null; }

// Plus court chemin (A*) entre deux nœuds → liste de nœuds.
export function route(from, to) {
  if (from === to) return [from];
  const open = new Map([[from, 0]]), came = new Map(), g = new Map([[from, 0]]);
  const h = (n) => Math.hypot(nodes[n].x - nodes[to].x, nodes[n].z - nodes[to].z);
  const f = new Map([[from, h(from)]]);
  while (open.size) {
    let cur = -1, best = Infinity;
    for (const [n] of open) { const v = f.get(n); if (v < best) { best = v; cur = n; } }
    if (cur === to) { const path = [cur]; while (came.has(cur)) { cur = came.get(cur); path.unshift(cur); } return path; }
    open.delete(cur);
    for (const eid of nodes[cur].links) {
      const e = edges[eid]; const ng = g.get(cur) + e.len / (e.speed / 13.9);
      if (ng < (g.get(e.b) ?? Infinity)) { came.set(e.b, cur); g.set(e.b, ng); f.set(e.b, ng + h(e.b)); open.set(e.b, 1); }
    }
  }
  return null;
}

export function nearestNode(x, z, filter) {
  let best = -1, bd = Infinity;
  for (const n of nodes) { if (filter && !filter(n)) continue; const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = n.id; } }
  return best;
}

// Rectangle constructible d'un bloc (intérieur des trottoirs).
export function blockRect(i, j) {
  return { x0: gx(i) + RW + SW, z0: gz(j) + RW + SW, x1: gx(i + 1) - RW - SW, z1: gz(j + 1) - RW - SW };
}

// Registre des lieux (rempli par la génération) : {id, type, name, x, z, door:{x,z,rotY}, parking:[...], ...}
export const places = [];
export function addPlace(p) { p.id = places.length; places.push(p); return p; }
export const placesOf = (type) => places.filter(p => p.type === type);

// Places de stationnement (le long des trottoirs et dans les parkings) : {x, z, rotY, edge?, taken:null|carId}
export const parkingSpots = [];
