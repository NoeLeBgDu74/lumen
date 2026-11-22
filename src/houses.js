// Maisons individuelles : murs percés, toit à deux pans en tuiles (débords, rives, faîtage),
// cheminée, porche, garage accolé à porte sectionnelle, jardin clos, allée, boîte aux lettres.
import * as THREE from 'three';
import { Y, pick } from './geo.js';
import { STYLES, sides, at, windowUnit, wallBand, glass } from './buildings.js';

const HSTYLES = [
  { wall: 'plasterW', trim: 'stone', frame: 'frameWhite', roof: 'roofClay', ww: 1.2, wh: 1.45, shutter: ['shutterBlue', 'shutterGreen'] },
  { wall: 'plasterY', trim: 'stone', frame: 'frameWhite', roof: 'roofClay', ww: 1.2, wh: 1.45, shutter: ['shutterGreen', 'shutterWhite'] },
  { wall: 'whiteBrick', trim: 'stoneDark', frame: 'frameBlack', roof: 'roofGrey', ww: 1.5, wh: 1.5, shutter: null },
  { wall: 'brick', trim: 'stone', frame: 'frameWhite', roof: 'roofGrey', ww: 1.3, wh: 1.5, shutter: null },
  { wall: 'painted', trim: 'stone', frame: 'frameWhite', roof: 'roofClay', ww: 1.2, wh: 1.45, shutter: ['shutterWhite'] },
];

// lot : {x0,z0,x1,z1, front:'n'|'s'} ; renvoie le lieu (maison) créé.
export function house(ctx, lot, r) {
  const B = ctx.B;
  const hs = pick(r, HSTYLES);
  const st = { ...STYLES.cream, ...hs, header: false, bay: 3 };
  const front = lot.front; // côté rue
  const lw = lot.x1 - lot.x0, ld = lot.z1 - lot.z0;
  const w = Math.min(lw - 9, 9 + r() * 3), d = 8 + r() * 2;
  const floors = r() < 0.6 ? 2 : 1;
  const setback = 7 + r() * 2;
  const cx = lot.x0 + 2 + w / 2 + (r() < 0.5 ? 0 : lw - w - 9);
  const zF = front === 's' ? lot.z1 - setback : lot.z0 + setback;
  const b = { x0: cx - w / 2, x1: cx + w / 2, z0: front === 's' ? zF - d : zF, z1: front === 's' ? zF : zF + d, rng: r };
  const fh = 2.8, H = floors * fh + 0.3;
  const roofAxisX = true; // faîtage parallèle à la rue
  for (const s of sides(b)) {
    const L = s.L;
    const gable = (s.key === 'e' || s.key === 'w');
    const n = Math.max(1, Math.floor((L - 1) / 3));
    const bay = (L - 1) / n; const us = Array.from({ length: n }, (_, i) => 0.5 + bay * (i + 0.5));
    const isFront = s.key === front;
    for (let f = 0; f < floors; f++) {
      const y0 = 0.3 + f * fh;
      const doorIdx = isFront && f === 0 ? Math.floor(n / 2) : -1;
      const sill = 0.95;
      const holes = us.map((u, i) => i === doorIdx ? null : [u - st.ww / 2, u + st.ww / 2]).filter(Boolean);
      if (doorIdx >= 0) {
        // porte : construite à part
        const du = us[doorIdx], dw = 1.0;
        const g = B.get(st.wall);
        const hs2 = [...holes, [du - dw / 2, du + dw / 2]].sort((a, c) => a[0] - c[0]);
        g.wallRect(s.o, s.ax, s.nrm, 0, L, y0 + 2.2, y0 + fh);
        let u0 = 0;
        for (const [a, c] of hs2) {
          g.wallRect(s.o, s.ax, s.nrm, u0, a, y0, y0 + 2.2);
          if (c - a !== dw) { g.wallRect(s.o, s.ax, s.nrm, a, c, y0, y0 + sill); if (sill + st.wh < 2.2) g.wallRect(s.o, s.ax, s.nrm, a, c, y0 + sill + st.wh, y0 + 2.2); }
          u0 = c;
        }
        g.wallRect(s.o, s.ax, s.nrm, u0, L, y0, y0 + 2.2);
        // porte d'entrée + auvent
        const door = B.get('door');
        const a = at(s, du - dw / 2, y0, -0.15), c = at(s, du + dw / 2, y0, -0.15);
        door.quad(a, c, c.clone().setY(y0 + 2.15), a.clone().setY(y0 + 2.15), s.nrm, [0, 0], [1, 0], [1, 1], [0, 1]);
        const P = (uu, yy, dd) => at(s, uu, yy, dd);
        g.quad(P(du - dw / 2, y0, 0), P(du - dw / 2, y0, -0.15), P(du - dw / 2, y0 + 2.15, -0.15), P(du - dw / 2, y0 + 2.15, 0), s.ax, [0, 0], [.15, 0], [.15, 2], [0, 2]);
        g.quad(P(du + dw / 2, y0, -0.15), P(du + dw / 2, y0, 0), P(du + dw / 2, y0 + 2.15, 0), P(du + dw / 2, y0 + 2.15, -0.15), s.ax.clone().negate(), [0, 0], [.15, 0], [.15, 2], [0, 2]);
        B.get(st.trim).box(P(du, y0 + 2.4, 0.6), 1.0, 0.06, 0.6, s.ax);
        B.get(st.trim).box(P(du, y0 - 0.15, 0.7), 0.9, 0.15, 0.7, s.ax);
        B.get('frameBlack').box(P(du + 0.85, y0 + 1.9, 0.08), 0.06, 0.12, 0.06, s.ax);
        ctx.lamps.push({ p: P(du + 0.85, y0 + 1.9, 0.18), wall: true, nrm: s.nrm.clone() });
        b.door = { p: P(du, 0, 1.6), nrm: s.nrm.clone(), rotY: Math.atan2(s.nrm.x, s.nrm.z) };
        us.forEach((u, i) => { if (i === doorIdx) return; windowUnit(ctx, B, st, s, u, y0 + sill, st.ww, st.wh, [3, fh, 3.5, r()], [0, 0, sill, 0.2 + r() * 0.2], { reveal: 0.18, shutter: st.shutter ? pick(r, st.shutter) : null, noHeader: true }); });
      } else {
        wallBand(B, st.wall, s, L, y0, y0 + fh, holes, y0 + sill, y0 + sill + st.wh);
        us.forEach(u => windowUnit(ctx, B, st, s, u, y0 + sill, st.ww, st.wh, [3, fh, 3.5, r()], [0, 0, sill, 0.2 + r() * 0.3], { reveal: 0.18, shutter: st.shutter && !gable ? pick(r, st.shutter) : null, noHeader: true }));
      }
    }
    B.get(st.wall).wallRect(s.o, s.ax, s.nrm, 0, L, 0, 0.3);
    B.get('stoneDark').box(at(s, L / 2, 0.15, 0.03), L / 2 + 0.03, 0.17, 0.03, s.ax, 1 | 2 | 4 | 16);
    // pignon triangulaire
    if (gable && roofAxisX) {
      const rh = d * 0.42;
      const p0 = at(s, 0, H, 0), p1 = at(s, L, H, 0), p2 = at(s, L / 2, H + rh, 0);
      B.get(st.wall).tri(p0, p1, p2, s.nrm, [0, H], [L, H], [L / 2, H + rh]);
    }
  }
  // toit à deux pans
  const ov = 0.45, rh = d * 0.42;
  const roof = B.get(st.roof), fascia = B.get('frameWhite');
  const zc = (b.z0 + b.z1) / 2;
  const xa = b.x0 - ov, xb = b.x1 + ov;
  const slope = (zEave, sgn) => {
    const zE = zEave + sgn * ov * 1.0, yE = H - ov * (rh / (d / 2));
    const a = new THREE.Vector3(xa, yE, zE), c = new THREE.Vector3(xb, yE, zE), rr = new THREE.Vector3(xb, H + rh, zc), l = new THREE.Vector3(xa, H + rh, zc);
    const n = new THREE.Vector3().subVectors(c, a).cross(new THREE.Vector3().subVectors(l, a)).normalize();
    const len = a.distanceTo(l);
    if (n.y < 0) { n.negate(); roof.quad(c, a, l, rr, n, [xb, 0], [xa, 0], [xa, len], [xb, len]); }
    else roof.quad(a, c, rr, l, n, [xa, 0], [xb, 0], [xb, len], [xa, len]);
    // sous-face
    const n2 = n.clone().negate();
    const off = (v) => v.clone().addScaledVector(n, -0.12);
    B.get('frameWhite').quad(off(a), off(l), off(rr), off(c), n2, [0, 0], [0, 1], [1, 1], [1, 0]);
    // bandeau de rive (gouttière)
    fascia.box(new THREE.Vector3((xa + xb) / 2, yE - 0.06, zE), (xb - xa) / 2, 0.11, 0.06);
    B.get('alu').box(new THREE.Vector3((xa + xb) / 2, yE - 0.02, zE + sgn * 0.09), (xb - xa) / 2, 0.05, 0.06);
  };
  slope(b.z1, 1); slope(b.z0, -1);
  // faîtage
  B.get(st.roof === 'roofClay' ? 'ridgeClay' : 'ridgeGrey').box(new THREE.Vector3((xa + xb) / 2, H + rh + 0.05, zc), (xb - xa) / 2, 0.09, 0.16);
  // rives latérales
  for (const x of [xa, xb]) {
    for (const sgn of [1, -1]) {
      const zE = (sgn > 0 ? b.z1 : b.z0) + sgn * ov, yE = H - ov * (rh / (d / 2));
      const a = new THREE.Vector3(x, yE, zE), t = new THREE.Vector3(x, H + rh, zc);
      const mid = a.clone().lerp(t, 0.5); const len = a.distanceTo(t);
      const ang = Math.atan2(t.y - a.y, Math.abs(t.z - a.z));
      const m = new THREE.Matrix4().makeRotationX(sgn > 0 ? ang : -ang).setPosition(mid.x, mid.y - 0.04, mid.z);
      fascia.addGeometry(new THREE.BoxGeometry(0.06, 0.2, len), m);
    }
  }
  // cheminée
  const chx = b.x0 + w * (0.2 + r() * 0.6), chz = zc + (r() - 0.5) * d * 0.3;
  B.get(st.wall === 'brick' ? 'brick' : 'brickDark').aabb(chx - 0.35, H + 0.5, chz - 0.4, chx + 0.35, H + rh + 1.0, chz + 0.4, 63 & ~8);
  B.get('stone').aabb(chx - 0.42, H + rh + 1.0, chz - 0.47, chx + 0.42, H + rh + 1.1, chz + 0.47);
  // garage accolé
  const gw = 3.4, gd = 6.0;
  const toRight = cx - lot.x0 < lw / 2;
  const gx0 = toRight ? b.x1 : b.x0 - gw, gx1 = gx0 + gw;
  const gz0 = front === 's' ? b.z1 - gd : b.z0, gz1 = gz0 + gd;
  const gb = { x0: gx0, x1: gx1, z0: gz0, z1: gz1 };
  const gH = 2.9;
  for (const s of sides(gb)) {
    if (s.key === front) {
      const g = B.get(st.wall);
      g.wallRect(s.o, s.ax, s.nrm, 0, 0.3, 0, gH); g.wallRect(s.o, s.ax, s.nrm, s.L - 0.3, s.L, 0, gH); g.wallRect(s.o, s.ax, s.nrm, 0.3, s.L - 0.3, 2.35, gH);
      const sh = B.get('garageDoor');
      const a = at(s, 0.3, 0, -0.12), c = at(s, s.L - 0.3, 0, -0.12);
      sh.quad(a, c, c.clone().setY(2.35), a.clone().setY(2.35), s.nrm, [0, 0], [s.L - 0.6, 0], [s.L - 0.6, 2.35], [0, 2.35]);
      b.garage = { p: at(s, s.L / 2, 0, 3.5), nrm: s.nrm.clone(), rotY: Math.atan2(s.nrm.x, s.nrm.z) };
    } else B.get(st.wall).wallRect(s.o, s.ax, s.nrm, 0, s.L, 0, gH);
  }
  B.get('roof').aabb(gx0 - 0.1, gH, gz0 - 0.1, gx1 + 0.1, gH + 0.25, gz1 + 0.1);
  B.get(st.trim).aabb(gx0 - 0.15, gH + 0.25, gz0 - 0.15, gx1 + 0.15, gH + 0.35, gz1 + 0.15);
  // jardin : pelouse, allée, clôture, haie
  const yG = 0.15;
  const gr = B.get('grass');
  gr.quad(new THREE.Vector3(lot.x0, yG + 0.01, lot.z1), new THREE.Vector3(lot.x1, yG + 0.01, lot.z1), new THREE.Vector3(lot.x1, yG + 0.01, lot.z0), new THREE.Vector3(lot.x0, yG + 0.01, lot.z0), Y,
    [lot.x0, lot.z1], [lot.x1, lot.z1], [lot.x1, lot.z0], [lot.x0, lot.z0]);
  const dz0 = front === 's' ? gz1 : lot.z0, dz1 = front === 's' ? lot.z1 : gz0;
  B.get('drive').aabb(gx0 + 0.2, yG, dz0, gx1 - 0.2, yG + 0.04, dz1, 4);
  const pz = front === 's' ? [b.z1, lot.z1] : [lot.z0, b.z0];
  const dX = b.door ? b.door.p.x : cx;
  B.get('drive').aabb(dX - 0.6, yG, Math.min(...pz), dX + 0.6, yG + 0.035, Math.max(...pz), 4);
  // clôture en bois (côté rue, de part et d'autre des accès) + piquets
  const fz = front === 's' ? lot.z1 - 0.15 : lot.z0 + 0.15;
  const gaps = [[gx0 - 0.2, gx1 + 0.2], [dX - 0.8, dX + 0.8]].sort((a, c) => a[0] - c[0]);
  let fx = lot.x0 + 0.2;
  const fence = B.get('fence');
  for (const [a, c] of [...gaps, [lot.x1 - 0.2, lot.x1]]) {
    if (a - fx > 0.4) {
      fence.aabb(fx, yG + 0.12, fz - 0.03, a, yG + 0.24, fz + 0.03); fence.aabb(fx, yG + 0.75, fz - 0.03, a, yG + 0.87, fz + 0.03);
      for (let x = fx + 0.06; x < a; x += 0.16) fence.aabb(x - 0.05, yG, fz - 0.015 + 0.04, x + 0.05, yG + 1.05, fz + 0.015 + 0.04);
    }
    fx = c;
  }
  // haies latérales (arbustes Poly Haven)
  for (let z = lot.z0 + 2; z < lot.z1 - 2; z += 3.2) { if (r() < 0.75) ctx.props.push({ name: 'shrub_02', x: lot.x1 - 0.6, y: yG, z, ry: r() * 6, s: 0.55 + r() * 0.2 }); }
  // boîte aux lettres
  B.get('metalDark').aabb(dX + 1.1, yG, fz - 0.05, dX + 1.18, yG + 1.0, fz + 0.03);
  B.get('mailbox').aabb(dX + 0.95, yG + 1.0, fz - 0.2, dX + 1.33, yG + 1.3, fz + 0.15);
  // arbre de jardin
  if (r() < 0.8) ctx.trees.add(lot.x0 + 2 + r() * (lw - 4), front === 's' ? lot.z0 + 3 + r() * 5 : lot.z1 - 3 - r() * 5, { scale: 0.8 + r() * 0.4 });
  ctx.colliders.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, h: H + rh }, { x0: gx0, z0: gz0, x1: gx1, z1: gz1, h: gH });
  return { door: b.door, garage: b.garage, bounds: b, lot };
}

// Villa d'architecte : volumes décalés (rez vitré + étage en porte-à-faux), toits plats, grandes baies,
// piscine à débordement, terrasse en bois, pelouse, haies, mur d'enceinte et portail, garage double.
export function villa(ctx, lot, r) {
  const B = ctx.B, yG = 0.15;
  const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2, W = lot.x1 - lot.x0, D = lot.z1 - lot.z0;
  const front = lot.front; const sgn = front === 's' ? 1 : -1;
  const wallK = r() < 0.5 ? 'plasterW' : 'concTile';
  // pelouse
  B.get('grass').quad(new THREE.Vector3(lot.x0, yG + 0.012, lot.z1), new THREE.Vector3(lot.x1, yG + 0.012, lot.z1), new THREE.Vector3(lot.x1, yG + 0.012, lot.z0), new THREE.Vector3(lot.x0, yG + 0.012, lot.z0), Y,
    [lot.x0, lot.z1], [lot.x1, lot.z1], [lot.x1, lot.z0], [lot.x0, lot.z0]);
  // volume du rez (largement vitré)
  const w1 = W * 0.55, d1 = D * 0.32, x1 = cx - W * 0.12, z1 = cz - sgn * D * 0.06;
  const b1 = { x0: x1 - w1 / 2, x1: x1 + w1 / 2, z0: z1 - d1 / 2, z1: z1 + d1 / 2 };
  const H1 = 3.6;
  for (const s of sides(b1)) {
    const facing = (s.key === front) || (s.key === (front === 's' ? 'n' : 's'));
    if (facing) { // façade toute vitrée
      const n = Math.round(s.L / 2.6), bay = s.L / n;
      for (let k = 0; k < n; k++) glass(ctx, at(s, bay * (k + 0.5), H1 / 2, -0.05), s.nrm, bay - 0.12, H1 - 0.3, [bay * 2.5, H1, 8, r()], [1, 0, 0.1, 0]);
      for (let k = 0; k <= n; k++) B.get('aluDark').box(at(s, bay * k, H1 / 2, 0.02), 0.05, H1 / 2, 0.06, s.ax);
    } else B.get(wallK).wallRect(s.o, s.ax, s.nrm, 0, s.L, 0, H1);
  }
  B.get('aluDark').aabb(b1.x0 - 0.4, H1, b1.z0 - 0.4, b1.x1 + 0.4, H1 + 0.35, b1.z1 + 0.4);
  // étage en porte-à-faux, décalé
  const w2 = W * 0.42, d2 = D * 0.28, x2 = cx + W * 0.05, z2 = z1 + sgn * 1.6;
  const b2 = { x0: x2 - w2 / 2, x1: x2 + w2 / 2, z0: z2 - d2 / 2, z1: z2 + d2 / 2 };
  const y2 = H1 + 0.35, H2 = 3.3;
  for (const s of sides(b2)) {
    const g = B.get(wallK === 'plasterW' ? 'concTile' : 'plasterW');
    g.wallRect(s.o, s.ax, s.nrm, 0, s.L, y2, y2 + H2);
    if (s.key === front) { // bandeau vitré
      glass(ctx, at(s, s.L / 2, y2 + 1.6, 0.06), s.nrm, s.L * 0.8, 1.9, [s.L, H2, 5, r()], [0, 0, 0.6, 0.2]);
      B.get('aluDark').box(at(s, s.L / 2, y2 + 0.6, 0.12), s.L * 0.41, 0.04, 0.06, s.ax);
    }
  }
  B.get('stone').aabb(b2.x0 - 0.3, y2 + H2, b2.z0 - 0.3, b2.x1 + 0.3, y2 + H2 + 0.3, b2.z1 + 0.3);
  B.get('stone').aabb(b2.x0, y2 - 0.25, b2.z0, b2.x1, y2, b2.z1, 8 | 1 | 2 | 16 | 32);
  // piscine + plage en bois
  const px0 = cx + W * 0.05, px1 = px0 + W * 0.32, pz = cz + sgn * D * 0.28, pd = D * 0.16;
  const pool = { x0: Math.min(px0, px1), x1: Math.max(px0, px1), z0: pz - pd / 2, z1: pz + pd / 2 };
  B.get('fence').aabb(pool.x0 - 3, yG, pool.z0 - 2.5, pool.x1 + 3, yG + 0.08, pool.z1 + 2.5, 4);
  B.get('stone').aabb(pool.x0 - 0.4, yG, pool.z0 - 0.4, pool.x1 + 0.4, yG + 0.12, pool.z1 + 0.4, 4 | 1 | 2 | 16 | 32);
  const wg = new THREE.PlaneGeometry(pool.x1 - pool.x0, pool.z1 - pool.z0).rotateX(-Math.PI / 2); wg.translate((pool.x0 + pool.x1) / 2, yG + 0.1, (pool.z0 + pool.z1) / 2);
  B.get('poolWater').addGeometry(wg);
  for (let k = 0; k < 2; k++) ctx.props.push({ name: 'outdoor_table_chair_set_01', x: pool.x0 - 1.8, y: yG + 0.08, z: pool.z0 + 1 + k * 2.4, ry: Math.PI / 2, s: 1 });
  ctx.colliders.push({ x0: pool.x0, z0: pool.z0, x1: pool.x1, z1: pool.z1, h: 0.5 });
  // garage double
  const gx0 = lot.x1 - 9, gx1 = lot.x1 - 2, gz0 = front === 's' ? lot.z1 - 13 : lot.z0 + 5, gz1 = gz0 + 7;
  const gb = { x0: gx0, x1: gx1, z0: gz0, z1: gz1 };
  let garage = null;
  for (const s of sides(gb)) {
    if (s.key === front) { const g = B.get(wallK); g.wallRect(s.o, s.ax, s.nrm, 0, 0.4, 0, 3); g.wallRect(s.o, s.ax, s.nrm, s.L - 0.4, s.L, 0, 3); g.wallRect(s.o, s.ax, s.nrm, 0.4, s.L - 0.4, 2.5, 3);
      const a = at(s, 0.4, 0, -0.1), c = at(s, s.L - 0.4, 0, -0.1); B.get('garageDoor').quad(a, c, c.clone().setY(2.5), a.clone().setY(2.5), s.nrm, [0, 0], [s.L - 0.8, 0], [s.L - 0.8, 2.5], [0, 2.5]);
      garage = { p: at(s, s.L / 2, 0, 4), nrm: s.nrm.clone(), rotY: Math.atan2(s.nrm.x, s.nrm.z) };
    } else B.get(wallK).wallRect(s.o, s.ax, s.nrm, 0, s.L, 0, 3);
  }
  B.get('aluDark').aabb(gx0 - 0.2, 3, gz0 - 0.2, gx1 + 0.2, 3.25, gz1 + 0.2);
  // allée + mur d'enceinte + portail
  const fz = front === 's' ? lot.z1 - 0.2 : lot.z0 + 0.2;
  B.get('drive').aabb(gx0, yG, Math.min(fz, front === 's' ? gz1 : gz0), gx1, yG + 0.04, Math.max(fz, front === 's' ? gz1 : gz0), 4);
  const doorX = x1; B.get('drive').aabb(doorX - 0.8, yG, Math.min(fz, front === 's' ? b1.z1 : b1.z0), doorX + 0.8, yG + 0.035, Math.max(fz, front === 's' ? b1.z1 : b1.z0), 4);
  const wall = B.get('stone');
  for (const [a, b] of [[lot.x0 + 0.3, doorX - 1.4], [doorX + 1.4, gx0 - 0.5]]) if (b - a > 0.5) wall.aabb(a, yG, fz - 0.15, b, yG + 1.3, fz + 0.15);
  B.get('iron').aabb(gx0 - 0.4, yG + 0.1, fz - 0.03, gx1 + 0.4, yG + 1.6, fz + 0.03, 16 | 32);
  for (let z = lot.z0 + 2; z < lot.z1 - 2; z += 2.8) ctx.props.push({ name: 'shrub_02', x: lot.x0 + 0.8, y: yG, z, ry: r() * 6, s: 0.7 });
  for (let k = 0; k < 3; k++) ctx.trees.add(lot.x0 + 3 + r() * (W - 6), front === 's' ? lot.z0 + 3 + r() * 6 : lot.z1 - 3 - r() * 6, { scale: 1.1 + r() * 0.4, y: yG });
  ctx.colliders.push({ x0: b1.x0, z0: b1.z0, x1: b1.x1, z1: b1.z1, h: H1 + H2 }, { x0: gx0, z0: gz0, x1: gx1, z1: gz1, h: 3 });
  const door = { p: new THREE.Vector3(doorX, 0, front === 's' ? b1.z1 + 1.2 : b1.z0 - 1.2), nrm: new THREE.Vector3(0, 0, sgn), rotY: front === 's' ? 0 : Math.PI };
  return { door, garage, bounds: b1, lot };
}
