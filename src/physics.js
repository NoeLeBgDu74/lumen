// Collisions statiques (bâtiments, mobilier) sur grille de hachage + hauteur du sol.
import * as W from './world.js';

const CELL = 24;
export class StaticWorld {
  constructor(colliders) {
    this.grid = new Map();
    for (const c of colliders) {
      const b = c.circle ? { x0: c.x - c.r, x1: c.x + c.r, z0: c.z - c.r, z1: c.z + c.r } : c;
      for (let gx = Math.floor(b.x0 / CELL); gx <= Math.floor(b.x1 / CELL); gx++)
        for (let gz = Math.floor(b.z0 / CELL); gz <= Math.floor(b.z1 / CELL); gz++) {
          const k = gx * 73856093 ^ gz * 19349663;
          if (!this.grid.has(k)) this.grid.set(k, []);
          this.grid.get(k).push(c);
        }
    }
  }
  near(x, z) { return this.grid.get(Math.floor(x / CELL) * 73856093 ^ Math.floor(z / CELL) * 19349663) || []; }

  // Repousse un cercle (x,z,r) hors des obstacles ; renvoie {x,z,hit, nx, nz}
  resolve(x, z, r, maxY = 99) {
    let hit = false, nx = 0, nz = 0;
    for (let it = 0; it < 2; it++) {
      const seen = new Set();
      for (const dx of [-r, r]) for (const dz of [-r, r]) for (const c of this.near(x + dx, z + dz)) {
        if (seen.has(c)) continue; seen.add(c);
        if (c.h !== undefined && c.h < 0.3) continue;
        if (c.circle) {
          const ddx = x - c.x, ddz = z - c.z, d = Math.hypot(ddx, ddz), m = r + c.r;
          if (d < m && d > 1e-5) { x = c.x + ddx / d * m; z = c.z + ddz / d * m; hit = true; nx = ddx / d; nz = ddz / d; }
        } else {
          const cx = Math.max(c.x0, Math.min(x, c.x1)), cz = Math.max(c.z0, Math.min(z, c.z1));
          const ddx = x - cx, ddz = z - cz, d2 = ddx * ddx + ddz * ddz;
          if (d2 < r * r) {
            if (d2 > 1e-8) { const d = Math.sqrt(d2); x = cx + ddx / d * r; z = cz + ddz / d * r; nx = ddx / d; nz = ddz / d; }
            else { // centre à l'intérieur : sortir par le côté le plus proche
              const o = [[x - c.x0, -1, 0], [c.x1 - x, 1, 0], [z - c.z0, 0, -1], [c.z1 - z, 0, 1]].sort((a, b) => a[0] - b[0])[0];
              if (o[1]) x = o[1] < 0 ? c.x0 - r : c.x1 + r; else z = o[2] < 0 ? c.z0 - r : c.z1 + r;
              nx = o[1]; nz = o[2];
            }
            hit = true;
          }
        }
      }
    }
    return { x, z, hit, nx, nz };
  }

  // Le segment a→b traverse-t-il un bâtiment ? renvoie la fraction libre (0..1)
  segmentFree(ax, ay, az, bx, by, bz) {
    let best = 1;
    const steps = 12;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      for (const c of this.near(x, z)) {
        if (c.circle || c.h === undefined) continue;
        if (x > c.x0 - 0.2 && x < c.x1 + 0.2 && z > c.z0 - 0.2 && z < c.z1 + 0.2 && y < c.h + 1) return Math.max(0, (s - 1) / steps);
      }
    }
    return best;
  }
}

// Hauteur du sol : trottoirs et îlots surélevés de 15 cm.
export function groundHeight(x, z) {
  const i = Math.floor((x - W.OX) / W.P), j = Math.floor((z - W.OZ) / W.P);
  if (i < 0 || j < 0 || i >= W.NX || j >= W.NZ) return 0;
  const lx = x - W.gx(i), lz = z - W.gz(j);
  if (lx > W.RW && lx < W.P - W.RW && lz > W.RW && lz < W.P - W.RW) return 0.15;
  return 0;
}
