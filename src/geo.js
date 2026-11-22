// Constructeur de géométrie fusionnée (UV en mètres) + utilitaires.
import * as THREE from 'three';

export class GB {
  constructor() { this.p = []; this.n = []; this.u = []; }
  get empty() { return this.p.length === 0; }
  // Quad p0..p3 (ordre anti-horaire vu de face), normale n, UV en mètres.
  quad(a, b, c, d, n, ua, ub, uc, ud) {
    const P = this.p, N = this.n, U = this.u;
    for (const [v, t] of [[a, ua], [b, ub], [c, uc], [a, ua], [c, uc], [d, ud]]) {
      P.push(v.x, v.y, v.z); N.push(n.x, n.y, n.z); U.push(t[0], t[1]);
    }
  }
  tri(a, b, c, n, ua, ub, uc) {
    for (const [v, t] of [[a, ua], [b, ub], [c, uc]]) { this.p.push(v.x, v.y, v.z); this.n.push(n.x, n.y, n.z); this.u.push(t[0], t[1]); }
  }
  // Rectangle vertical dans un plan de façade : origine o, axe horizontal ax (unitaire), normale nrm ; u0..u1 le long de ax, y0..y1 en hauteur.
  wallRect(o, ax, nrm, u0, u1, y0, y1, depth = 0, uOff = 0) {
    if (u1 - u0 < 1e-4 || y1 - y0 < 1e-4) return;
    const off = nrm.clone().multiplyScalar(depth);
    const P = (u, y) => new THREE.Vector3(o.x + ax.x * u + off.x, y + off.y, o.z + ax.z * u + off.z);
    this.quad(P(u0, y0), P(u1, y0), P(u1, y1), P(u0, y1), nrm, [u0 + uOff, y0], [u1 + uOff, y0], [u1 + uOff, y1], [u0 + uOff, y1]);
  }
  // Boîte orientée : centre c, demi-tailles h (x le long de ax, z le long de nrm), rotation autour de Y via ax.
  box(c, hx, hy, hz, ax = X, faces = 63) {
    const az = new THREE.Vector3(-ax.z, 0, ax.x); // perpendiculaire
    const V = (sx, sy, sz) => new THREE.Vector3(c.x + ax.x * hx * sx + az.x * hz * sz, c.y + hy * sy, c.z + ax.z * hx * sx + az.z * hz * sz);
    const W = hx * 2, H = hy * 2, D = hz * 2;
    const nx = ax, nz = az, ny = Y;
    if (faces & 1) this.quad(V(1, -1, 1), V(1, -1, -1), V(1, 1, -1), V(1, 1, 1), nx, [0, 0], [D, 0], [D, H], [0, H]);
    if (faces & 2) this.quad(V(-1, -1, -1), V(-1, -1, 1), V(-1, 1, 1), V(-1, 1, -1), nx.clone().negate(), [0, 0], [D, 0], [D, H], [0, H]);
    if (faces & 4) this.quad(V(-1, 1, 1), V(1, 1, 1), V(1, 1, -1), V(-1, 1, -1), ny, [0, 0], [W, 0], [W, D], [0, D]);
    if (faces & 8) this.quad(V(-1, -1, -1), V(1, -1, -1), V(1, -1, 1), V(-1, -1, 1), ny.clone().negate(), [0, 0], [W, 0], [W, D], [0, D]);
    if (faces & 16) this.quad(V(-1, -1, 1), V(1, -1, 1), V(1, 1, 1), V(-1, 1, 1), nz, [0, 0], [W, 0], [W, H], [0, H]);
    if (faces & 32) this.quad(V(1, -1, -1), V(-1, -1, -1), V(-1, 1, -1), V(1, 1, -1), nz.clone().negate(), [0, 0], [W, 0], [W, H], [0, H]);
  }
  // Boîte alignée sur les axes (min/max), UV mondes.
  aabb(x0, y0, z0, x1, y1, z1, faces = 63) {
    const c = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.box(c, (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2, X, faces);
  }
  // Ajoute une géométrie three existante (transformée).
  addGeometry(g, m) {
    const gg = g.index ? g.toNonIndexed() : g.clone();
    if (m) gg.applyMatrix4(m);
    const p = gg.attributes.position, n = gg.attributes.normal, u = gg.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      this.p.push(p.getX(i), p.getY(i), p.getZ(i));
      this.n.push(n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0);
      this.u.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
export const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

// Seaux de géométrie par matériau.
export class Buckets {
  constructor() { this.m = new Map(); }
  get(key) { if (!this.m.has(key)) this.m.set(key, new GB()); return this.m.get(key); }
  toMeshes(materials, { cast = true, receive = true } = {}) {
    const out = [];
    for (const [k, gb] of this.m) {
      if (gb.empty) continue;
      const mat = materials[k]; if (!mat) { console.warn('matériau manquant', k); continue; }
      const mesh = new THREE.Mesh(gb.build(), mat);
      mesh.castShadow = cast && !mat.userData.noShadow; mesh.receiveShadow = receive;
      mesh.name = k; out.push(mesh);
    }
    return out;
  }
}

// PRNG déterministe.
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; }; }
export const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
