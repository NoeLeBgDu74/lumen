// Générateur de bâtiments détaillés : fenêtres réellement en retrait (tableaux, appuis, menuiseries),
// bandeaux, corniches à ressauts, balcons à garde-corps, volets, rez-de-chaussée commerciaux, toitures équipées.
import * as THREE from 'three';
import { X, Y, pick } from './geo.js';

export const STYLES = {
  brick:   { wall: 'brick',     trim: 'stone',     frame: 'frameGreen', ww: 1.3, wh: 2.0, bay: 3.3, balcony: 0.15, shutter: null, header: true },
  brickD:  { wall: 'brickDark', trim: 'stone',     frame: 'frameBlack', ww: 1.4, wh: 2.1, bay: 3.4, balcony: 0.1,  shutter: null, header: true },
  paris:   { wall: 'plasterW',  trim: 'stone',     frame: 'frameWhite', ww: 1.2, wh: 2.3, bay: 3.1, balcony: 0.45, shutter: null, header: true, frenchDoors: true },
  cream:   { wall: 'plasterY',  trim: 'stone',     frame: 'frameWhite', ww: 1.15, wh: 1.85, bay: 3.0, balcony: 0.1, shutter: ['shutterGreen', 'shutterBlue', 'shutterWhite'], header: false },
  grey:    { wall: 'plasterG',  trim: 'stoneDark', frame: 'frameBlack', ww: 1.6, wh: 1.9, bay: 3.5, balcony: 0.2,  shutter: null, header: false },
  painted: { wall: 'painted',   trim: 'stone',     frame: 'frameWhite', ww: 1.3, wh: 1.9, bay: 3.2, balcony: 0.15, shutter: ['shutterWhite', 'shutterBlue'], header: false },
  modern:  { wall: 'concTile',  trim: 'aluDark',   frame: 'aluDark',    ww: 2.6, wh: 2.1, bay: 3.6, balcony: 0.3,  shutter: null, header: false, modern: true },
  tiles:   { wall: 'facadeTile',trim: 'aluDark',   frame: 'alu',        ww: 2.2, wh: 2.0, bay: 3.2, balcony: 0.0,  shutter: null, header: false, modern: true },
};

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();

// Ajoute une vitre (instance) avec ses paramètres de pièce.
export function glass(ctx, center, nrm, w, h, room, info) {
  tmpQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm);
  tmpM.compose(center, tmpQ, tmpS.set(w, h, 1));
  ctx.glass.push({ m: tmpM.clone(), room, info });
}

export function sides(b) {
  return [
    { nrm: new THREE.Vector3(0, 0, 1),  o: new THREE.Vector3(b.x0, 0, b.z1), L: b.x1 - b.x0, key: 's' },
    { nrm: new THREE.Vector3(1, 0, 0),  o: new THREE.Vector3(b.x1, 0, b.z1), L: b.z1 - b.z0, key: 'e' },
    { nrm: new THREE.Vector3(0, 0, -1), o: new THREE.Vector3(b.x1, 0, b.z0), L: b.x1 - b.x0, key: 'n' },
    { nrm: new THREE.Vector3(-1, 0, 0), o: new THREE.Vector3(b.x0, 0, b.z0), L: b.z1 - b.z0, key: 'w' },
  ].map(s => (s.ax = new THREE.Vector3(s.nrm.z, 0, -s.nrm.x), s));
}
export const at = (s, u, y, d = 0) => new THREE.Vector3(s.o.x + s.ax.x * u + s.nrm.x * d, y, s.o.z + s.ax.z * u + s.nrm.z * d);

// Fenêtre complète dans un mur : trou + tableaux + menuiserie + vitre + appui.
export function windowUnit(ctx, B, st, s, u, y0, ww, wh, room, info, opts = {}) {
  const r = opts.reveal ?? 0.24;
  const wall = B.get(st.wall), frame = B.get(st.frame), trim = B.get(st.trim);
  const ul = u - ww / 2, ur = u + ww / 2, y1 = y0 + wh;
  // tableaux (côtés intérieurs de l'ouverture)
  const nIn = s.nrm.clone().negate();
  const P = (uu, yy, d) => at(s, uu, yy, d);
  wall.quad(P(ul, y0, 0), P(ul, y0, -r), P(ul, y1, -r), P(ul, y1, 0), s.ax, [0, y0], [r, y0], [r, y1], [0, y1]);
  wall.quad(P(ur, y0, -r), P(ur, y0, 0), P(ur, y1, 0), P(ur, y1, -r), s.ax.clone().negate(), [0, y0], [r, y0], [r, y1], [0, y1]);
  wall.quad(P(ul, y1, 0), P(ul, y1, -r), P(ur, y1, -r), P(ur, y1, 0), Y.clone().negate(), [ul, 0], [ul, r], [ur, r], [ur, 0]);
  trim.quad(P(ul, y0, -r), P(ul, y0, 0), P(ur, y0, 0), P(ur, y0, -r), Y, [ul, 0], [ul, r], [ur, r], [ur, 0]);
  // menuiserie
  const fd = -r + 0.09, ft = 0.065, fw = 0.075;
  const fb = (uu, yy, hx, hy) => frame.box(P(uu, yy, fd), hx, hy, ft / 2, s.ax);
  fb(u, y0 + fw / 2, ww / 2, fw / 2); fb(u, y1 - fw / 2, ww / 2, fw / 2);
  fb(ul + fw / 2, (y0 + y1) / 2, fw / 2, wh / 2); fb(ur - fw / 2, (y0 + y1) / 2, fw / 2, wh / 2);
  if (!opts.noMullion) {
    if (ww > 0.9) fb(u, (y0 + y1) / 2, 0.035, wh / 2 - fw);
    if (wh > 1.6 && !opts.noTransom) fb(u, y1 - wh * 0.26, ww / 2 - fw, 0.03);
    if (st.modern && ww > 2) { fb(u - ww / 4, (y0 + y1) / 2, 0.03, wh / 2 - fw); fb(u + ww / 4, (y0 + y1) / 2, 0.03, wh / 2 - fw); }
  }
  // vitre
  glass(ctx, P(u, (y0 + y1) / 2, fd - 0.01), s.nrm, ww - fw, wh - fw, room, info);
  // appui saillant
  if (!opts.noSill) trim.box(P(u, y0 - 0.045, 0.03 - r / 2 + 0.02), ww / 2 + 0.12, 0.045, r / 2 + 0.07, s.ax);
  // linteau mouluré
  if (st.header && !opts.noHeader) {
    trim.box(P(u, y1 + 0.09, 0.05), ww / 2 + 0.16, 0.09, 0.07, s.ax);
    trim.box(P(u, y1 + 0.2, 0.08), ww / 2 + 0.22, 0.03, 0.1, s.ax);
  }
  // volets ouverts
  if (opts.shutter) {
    const sh = B.get(opts.shutter), sw = ww / 2;
    for (const k of [-1, 1]) {
      const cu = u + k * (ww / 2 + sw / 2 + 0.03);
      sh.box(P(cu, (y0 + y1) / 2, 0.035), sw / 2, wh / 2, 0.025, s.ax);
    }
  }
}

// Mur percé : bandes horizontales et trumeaux entre les ouvertures (liste d'ouvertures [u0,u1] sur une rangée y0..y1).
export function wallBand(B, key, s, L, y0, y1, holes, hy0, hy1) {
  const g = B.get(key);
  if (!holes.length) { g.wallRect(s.o, s.ax, s.nrm, 0, L, y0, y1); return; }
  g.wallRect(s.o, s.ax, s.nrm, 0, L, y0, hy0);
  g.wallRect(s.o, s.ax, s.nrm, 0, L, hy1, y1);
  let u = 0;
  for (const [a, b] of holes) { g.wallRect(s.o, s.ax, s.nrm, u, a, hy0, hy1); u = b; }
  g.wallRect(s.o, s.ax, s.nrm, u, L, hy0, hy1);
}

export function ledge(B, key, s, L, y, h, d, ext = true) {
  const e = ext ? d : 0;
  B.get(key).box(at(s, L / 2, y + h / 2, d / 2), L / 2 + e, h / 2, d / 2, s.ax);
}

function balcony(B, st, s, u, y, w) {
  const slab = B.get(st.trim), iron = B.get('iron');
  const d = 0.85;
  slab.box(at(s, u, y - 0.08, d / 2), w / 2, 0.08, d / 2, s.ax);
  // consoles
  for (const k of [-1, 1]) slab.box(at(s, u + k * (w / 2 - 0.15), y - 0.3, 0.2), 0.06, 0.14, 0.2, s.ax);
  const rh = 1.0;
  iron.box(at(s, u, y + rh, d - 0.03), w / 2, 0.025, 0.03, s.ax);
  iron.box(at(s, u, y + 0.12, d - 0.03), w / 2, 0.015, 0.02, s.ax);
  for (let x = -w / 2 + 0.06; x <= w / 2 - 0.05; x += 0.13) iron.box(at(s, u + x, y + rh / 2 + 0.05, d - 0.03), 0.011, rh / 2 - 0.05, 0.011, s.ax);
  // retours latéraux
  for (const k of [-1, 1]) {
    const uu = u + k * (w / 2 - 0.02);
    const ax2 = s.nrm.clone().multiplyScalar(k); // axe perpendiculaire
    const c = at(s, uu, y + rh, d / 2);
    iron.box(c, d / 2, 0.025, 0.02, s.nrm);
    for (let z = 0.1; z < d - 0.05; z += 0.13) iron.box(at(s, uu, y + rh / 2 + 0.05, z), 0.011, rh / 2 - 0.05, 0.011, s.ax);
    void ax2;
  }
}

// Bâtiment classique / moderne.
export function building(ctx, b) {
  const st = STYLES[b.style]; const r = b.rng; const B = ctx.B;
  const gf = b.shops && b.shops.length ? 4.4 : 3.7;
  const fh = 3.15 + (st.modern ? 0.15 : 0);
  const H = gf + (b.floors - 1) * fh;
  const lod = !!b.lod;
  const roomBase = r() * 1000;
  for (const s of sides(b)) {
    const L = s.L;
    if (b.blind && b.blind.includes(s.key)) { B.get(st.wall).wallRect(s.o, s.ax, s.nrm, 0, L, 0, H); continue; }
    const n = Math.max(1, Math.round((L - 1.2) / st.bay));
    const bay = (L - 1.2) / n;
    const us = Array.from({ length: n }, (_, i) => 0.6 + bay * (i + 0.5));
    const ww = Math.min(st.ww, bay - 0.7);
    const shutter = st.shutter && !lod ? pick(r, st.shutter) : null;
    // --- étages ---
    for (let f = 1; f < b.floors; f++) {
      const y0 = gf + (f - 1) * fh;
      const balc = !lod && st.balcony > 0 && (r() < st.balcony || (b.style === 'paris' && (f === 2 || f === b.floors - 2)));
      const french = balc && st.frenchDoors;
      const sill = french ? 0.08 : 0.9;
      const wh = french ? Math.min(fh - 0.6, 2.45) : st.wh;
      const holes = us.map(u => [u - ww / 2, u + ww / 2]);
      wallBand(B, st.wall, s, L, y0, y0 + fh, holes, y0 + sill, y0 + sill + wh);
      us.forEach((u, i) => {
        const seed = roomBase + f * 37 + i * 3.1 + s.key.charCodeAt(0);
        const room = [bay, fh, 3.5 + (seed * 7.13 % 3), seed % 1000 / 1000 + i * 0.137];
        const info = [b.office ? 2 : 0, 0, sill, r() < 0.55 ? 0.12 + r() * 0.25 : 0];
        if (lod) glass(ctx, at(s, u, y0 + sill + wh / 2, -0.05), s.nrm, ww, wh, room, info);
        else windowUnit(ctx, B, st, s, u, y0 + sill, ww, wh, room, info, { shutter: french ? null : shutter, noSill: french });
        if (lod) B.get(st.wall).wallRect(s.o, s.ax, s.nrm, u - ww / 2, u + ww / 2, y0 + sill, y0 + sill + wh, -0.2);
      });
      if (balc && b.style === 'paris' && (f === 2 || f === b.floors - 2)) balcony(B, st, s, L / 2, y0, L - 0.4);
      else if (balc) us.forEach(u => { if (r() < 0.6) balcony(B, st, s, u, y0, ww + 0.7); });
      if (!lod && (st.header || b.style === 'paris') && f === 1) ledge(B, st.trim, s, L, y0 - 0.05, 0.12, 0.12);
    }
    // --- rez-de-chaussée ---
    const isShop = b.shops && b.shops.includes(s.key);
    const isEntr = b.entrance === s.key;
    if (isShop && !lod) shopFront(ctx, b, st, s, L, gf, us, bay);
    else {
      const holes = [], doorU = isEntr ? us[Math.floor(n / 2)] : null;
      us.forEach(u => { const w = u === doorU ? 1.7 : ww; holes.push([u - w / 2, u + w / 2]); });
      const gsill = 1.1, gwh = Math.min(st.wh, gf - 1.6);
      // rangée basse : fenêtres et porte n'ont pas la même hauteur → on construit séparément
      const g = B.get(st.wall);
      g.wallRect(s.o, s.ax, s.nrm, 0, L, gsill + gwh, gf);
      let u0 = 0;
      for (let i = 0; i < us.length; i++) {
        const [a, c] = holes[i];
        g.wallRect(s.o, s.ax, s.nrm, u0, a, 0, gsill + gwh);
        if (us[i] === doorU) { if (gsill + gwh < 2.6) g.wallRect(s.o, s.ax, s.nrm, a, c, gsill + gwh, 2.6); }
        else g.wallRect(s.o, s.ax, s.nrm, a, c, 0, gsill);
        u0 = c;
      }
      g.wallRect(s.o, s.ax, s.nrm, u0, L, 0, gsill + gwh);
      us.forEach((u, i) => {
        if (u === doorU) { entrance(ctx, b, st, s, u, Math.max(2.6, gsill + gwh)); return; }
        const seed = roomBase + i * 5.7 + s.key.charCodeAt(0) * 3;
        if (lod) { glass(ctx, at(s, u, gsill + gwh / 2, -0.05), s.nrm, ww, gwh, [bay, gf, 4, seed % 1], [0, 0, gsill, 0.3]); return; }
        windowUnit(ctx, B, st, s, u, gsill, ww, gwh, [bay, gf, 4, (seed % 1000) / 1000], [0, 0, gsill, 0.18 + r() * 0.2], { noHeader: true });
      });
      // soubassement en pierre
      if (!lod) B.get('stoneDark').box(at(s, L / 2, 0.3, 0.04), L / 2 + 0.04, 0.3, 0.04, s.ax, 1 | 2 | 4 | 16);
    }
    // --- bandeaux & corniche ---
    if (!lod) {
      ledge(B, st.trim, s, L, gf - 0.18, 0.26, 0.2);
      if (st.modern) {
        for (let f = 2; f < b.floors; f++) ledge(B, st.trim, s, L, gf + (f - 1) * fh - 0.1, 0.1, 0.06);
        ledge(B, st.trim, s, L, H, 0.5, 0.08);
      } else {
        ledge(B, st.trim, s, L, H - 0.35, 0.18, 0.18);
        ledge(B, st.trim, s, L, H - 0.17, 0.12, 0.36);
        ledge(B, st.trim, s, L, H - 0.05, 0.1, 0.5);
        // modillons sous la corniche
        if (b.style === 'paris' || b.style === 'cream' || b.style === 'brick') for (let u = 0.5; u < L - 0.3; u += 0.7) B.get(st.trim).box(at(s, u, H - 0.27, 0.22), 0.06, 0.08, 0.2, s.ax);
      }
    }
    // acrotère
    B.get(st.wall).wallRect(s.o, s.ax, s.nrm, -0.0, L, H, H + 0.95, lod ? 0 : 0.0);
  }
  // toit
  const roof = B.get('roof');
  const ih = 0.25;
  roof.quad(new THREE.Vector3(b.x0 + ih, H + 0.05, b.z1 - ih), new THREE.Vector3(b.x1 - ih, H + 0.05, b.z1 - ih), new THREE.Vector3(b.x1 - ih, H + 0.05, b.z0 + ih), new THREE.Vector3(b.x0 + ih, H + 0.05, b.z0 + ih), Y,
    [b.x0, b.z1], [b.x1, b.z1], [b.x1, b.z0], [b.x0, b.z0]);
  // faces intérieures de l'acrotère + chaperon
  const cap = B.get(st.trim === 'aluDark' ? 'aluDark' : 'stone');
  for (const s of sides(b)) {
    const inN = s.nrm.clone().negate();
    const o2 = at(s, s.L, 0, -ih); const ax2 = s.ax.clone().negate();
    B.get(st.wall).wallRect(o2, ax2, inN, 0, s.L - 0.0, H, H + 0.95);
    cap.box(at(s, s.L / 2, H + 1.0, -ih / 2 + 0.03), s.L / 2 + 0.03, 0.05, ih / 2 + 0.05, s.ax);
  }
  if (!lod) rooftop(ctx, b, H, st);
  ctx.colliders.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, h: H });
  return H;
}

function entrance(ctx, b, st, s, u, top) {
  const B = ctx.B; const w = 1.7, h = 2.6, r = 0.45;
  const trim = B.get(st.trim), wall = B.get(st.wall);
  const P = (uu, yy, d) => at(s, uu, yy, d);
  const ul = u - w / 2, ur = u + w / 2;
  wall.quad(P(ul, 0, 0), P(ul, 0, -r), P(ul, h, -r), P(ul, h, 0), s.ax, [0, 0], [r, 0], [r, h], [0, h]);
  wall.quad(P(ur, 0, -r), P(ur, 0, 0), P(ur, h, 0), P(ur, h, -r), s.ax.clone().negate(), [0, 0], [r, 0], [r, h], [0, h]);
  wall.quad(P(ul, h, 0), P(ul, h, -r), P(ur, h, -r), P(ur, h, 0), Y.clone().negate(), [0, 0], [0, r], [w, r], [w, 0]);
  if (top > h + 0.05) {
    // imposte vitrée
    B.get(st.frame).box(P(u, h + 0.03, -r + 0.06), w / 2, 0.04, 0.04, s.ax);
    glass(ctx, P(u, (h + top) / 2, -r + 0.05), s.nrm, w - 0.1, top - h - 0.1, [3, 3, 4, b.rng()], [0, 0, 0, 0]);
    wall.quad(P(ul, h, 0), P(ul, h, -r), P(ul, top, -r), P(ul, top, 0), s.ax, [0, 0], [r, 0], [r, 1], [0, 1]);
    wall.quad(P(ur, h, -r), P(ur, h, 0), P(ur, top, 0), P(ur, top, -r), s.ax.clone().negate(), [0, 0], [r, 0], [r, 1], [0, 1]);
    wall.quad(P(ul, top, 0), P(ul, top, -r), P(ur, top, -r), P(ur, top, 0), Y.clone().negate(), [0, 0], [0, r], [w, r], [w, 0]);
  }
  // double porte en bois
  const door = B.get('door');
  for (const k of [-1, 1]) {
    const c = P(u + k * w / 4, h / 2, -r + 0.04);
    const a = at(s, u + k * w / 4 - w / 4, 0, -r + 0.04), bb = at(s, u + k * w / 4 + w / 4, 0, -r + 0.04);
    const flip = k > 0;
    door.quad(a, bb, bb.clone().setY(h), a.clone().setY(h), s.nrm, flip ? [1, 0] : [0, 0], flip ? [0, 0] : [1, 0], flip ? [0, 1] : [1, 1], flip ? [1, 1] : [0, 1]);
    void c;
  }
  // marches + encadrement
  trim.box(P(u, 0.08, 0.25), w / 2 + 0.35, 0.08, 0.3, s.ax);
  trim.box(P(ul - 0.12, h / 2, 0.05), 0.12, h / 2, 0.06, s.ax);
  trim.box(P(ur + 0.12, h / 2, 0.05), 0.12, h / 2, 0.06, s.ax);
  trim.box(P(u, h + 0.12, 0.07), w / 2 + 0.3, 0.12, 0.08, s.ax);
  // applique murale
  ctx.lamps.push({ p: P(ur + 0.45, 2.4, 0.18), wall: true, nrm: s.nrm.clone() });
  B.get('frameBlack').box(P(ur + 0.45, 2.4, 0.1), 0.08, 0.16, 0.08, s.ax);
  const door0 = P(u, 0, 0.9);
  ctx.doors.push({ p: door0, nrm: s.nrm.clone(), building: b, rotY: Math.atan2(s.nrm.x, s.nrm.z) });
}

// Devanture : grandes vitrines, porte, bandeau d'enseigne, store banne.
function shopFront(ctx, b, st, s, L, gf, us, bay) {
  const B = ctx.B; const shop = b.shopInfo || {};
  const kick = 0.45, top = gf - 1.05, r = 0.3;
  const wall = B.get(st.wall), frame = B.get('aluDark'), trim = B.get(st.trim);
  // piliers
  const pw = 0.45;
  const opens = us.map(u => [u - bay / 2 + pw / 2, u + bay / 2 - pw / 2]);
  wall.wallRect(s.o, s.ax, s.nrm, 0, L, top, gf);
  let u0 = 0;
  for (const [a, c] of opens) { wall.wallRect(s.o, s.ax, s.nrm, u0, a, 0, top); u0 = c; }
  wall.wallRect(s.o, s.ax, s.nrm, u0, L, 0, top);
  const P = (uu, yy, d) => at(s, uu, yy, d);
  opens.forEach(([a, c], i) => {
    const w = c - a, u = (a + c) / 2;
    // tableaux
    wall.quad(P(a, 0, 0), P(a, 0, -r), P(a, top, -r), P(a, top, 0), s.ax, [0, 0], [r, 0], [r, top], [0, top]);
    wall.quad(P(c, 0, -r), P(c, 0, 0), P(c, top, 0), P(c, top, -r), s.ax.clone().negate(), [0, 0], [r, 0], [r, top], [0, top]);
    wall.quad(P(a, top, 0), P(a, top, -r), P(c, top, -r), P(c, top, 0), Y.clone().negate(), [0, 0], [0, r], [w, r], [w, 0]);
    // allège pleine
    B.get('stoneDark').box(P(u, kick / 2, -r + 0.06), w / 2, kick / 2, 0.06, s.ax);
    const isDoor = i === Math.floor(opens.length / 2);
    const fd = -r + 0.1;
    frame.box(P(u, kick + 0.03, fd), w / 2, 0.035, 0.05, s.ax);
    frame.box(P(u, top - 0.04, fd), w / 2, 0.04, 0.05, s.ax);
    frame.box(P(a + 0.04, (kick + top) / 2, fd), 0.04, (top - kick) / 2, 0.05, s.ax);
    frame.box(P(c - 0.04, (kick + top) / 2, fd), 0.04, (top - kick) / 2, 0.05, s.ax);
    const room = [Math.max(bay, 4), gf, 7 + b.rng() * 3, b.rng()];
    if (isDoor) {
      const dw = 1.1, du = u;
      frame.box(P(du - dw / 2, (top) / 2, fd), 0.04, top / 2, 0.05, s.ax);
      frame.box(P(du + dw / 2, (top) / 2, fd), 0.04, top / 2, 0.05, s.ax);
      frame.box(P(du, 2.3, fd), dw / 2, 0.04, 0.05, s.ax);
      B.get('alu').box(P(du + 0.3, 1.1, fd + 0.08), 0.015, 0.4, 0.015, s.ax);
      glass(ctx, P(du, 1.15, fd - 0.01), s.nrm, dw - 0.08, 2.25, room, [1, 0, 0.0, 0]);
      const restW = (w - dw) / 2;
      if (restW > 0.3) {
        glass(ctx, P(a + restW / 2, (kick + top) / 2, fd - 0.01), s.nrm, restW - 0.08, top - kick - 0.08, room, [1, 0, kick, 0]);
        glass(ctx, P(c - restW / 2, (kick + top) / 2, fd - 0.01), s.nrm, restW - 0.08, top - kick - 0.08, room, [1, 0, kick, 0]);
      }
      ctx.shopDoors.push({ p: P(du, 0, 1.0), nrm: s.nrm.clone(), shop, building: b });
    } else {
      frame.box(P(u, kick + (top - kick) * 0.78, fd), w / 2, 0.025, 0.04, s.ax);
      glass(ctx, P(u, (kick + top) / 2, fd - 0.01), s.nrm, w - 0.08, top - kick - 0.08, room, [1, 0, kick, 0]);
    }
  });
  // enseigne
  const signKey = 'sign:' + (shop.name || 'Boutique');
  if (!ctx.signMats[signKey]) ctx.signMats[signKey] = shop;
  const sw = Math.min(L - 1.2, 9 + shop.name.length * 0.25);
  const sc = P(L / 2, top + 0.5, 0.08);
  const g = B.get(signKey);
  const a = at(s, L / 2 - sw / 2, top + 0.12, 0.12), c = at(s, L / 2 + sw / 2, top + 0.12, 0.12);
  g.quad(a, c, c.clone().setY(top + 0.88), a.clone().setY(top + 0.88), s.nrm, [0, 0], [1, 0], [1, 1], [0, 1]);
  B.get('aluDark').box(at(s, L / 2, top + 0.5, 0.05), sw / 2 + 0.06, 0.42, 0.05, s.ax);
  void sc;
  // store banne
  if (shop.awning) {
    const aw = B.get('awning:' + shop.awning.join(','));
    if (!ctx.awnMats[shop.awning.join(',')]) ctx.awnMats[shop.awning.join(',')] = shop.awning;
    const ay = top - 0.05, ad = 1.6, drop = 0.55;
    for (const [a2, c2] of opens) {
      const p0 = at(s, a2 - 0.05, ay, 0.05), p1 = at(s, c2 + 0.05, ay, 0.05);
      const p2 = at(s, c2 + 0.05, ay - drop, ad), p3 = at(s, a2 - 0.05, ay - drop, ad);
      const n = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p3, p0)).normalize().negate();
      const w2 = (c2 - a2) / 1.6;
      aw.quad(p3, p2, p1, p0, n, [0, 0], [w2, 0], [w2, 1], [0, 1]);
      const p4 = at(s, c2 + 0.05, ay - drop - 0.25, ad), p5 = at(s, a2 - 0.05, ay - drop - 0.25, ad);
      aw.quad(p5, p4, p2, p3, s.nrm, [0, 0], [w2, 0], [w2, 0.3], [0, 0.3]);
    }
  }
}

function rooftop(ctx, b, H, st) {
  const B = ctx.B, r = b.rng;
  const w = b.x1 - b.x0, d = b.z1 - b.z0;
  // édicule d'escalier
  if (w > 10 && d > 10) {
    const cx = b.x0 + w * (0.3 + r() * 0.4), cz = b.z0 + d * (0.3 + r() * 0.4);
    B.get(st.wall).aabb(cx - 1.6, H, cz - 2.2, cx + 1.6, H + 2.8, cz + 2.2, 63 & ~8);
    B.get('stone').aabb(cx - 1.7, H + 2.8, cz - 2.3, cx + 1.7, H + 2.95, cz + 2.3);
  }
  // climatiseurs (modèle Poly Haven)
  const n = Math.floor(w * d / 120) + 1;
  for (let i = 0; i < Math.min(n, 5); i++) {
    ctx.props.push({ name: 'exterior_aircon_unit', x: b.x0 + 2 + r() * (w - 4), y: H + 0.05, z: b.z0 + 2 + r() * (d - 4), ry: Math.floor(r() * 4) * Math.PI / 2, s: 1 });
  }
  // réservoir / antenne
  if (r() < 0.45 && w > 12) {
    const cx = b.x0 + 3 + r() * (w - 6), cz = b.z0 + 3 + r() * (d - 6);
    const cyl = new THREE.CylinderGeometry(1.3, 1.3, 2.6, 20);
    B.get('tank').addGeometry(cyl, new THREE.Matrix4().makeTranslation(cx, H + 2.4, cz));
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.get('metalDark').aabb(cx + dx * 0.9 - 0.06, H, cz + dz * 0.9 - 0.06, cx + dx * 0.9 + 0.06, H + 1.1, cz + dz * 0.9 + 0.06);
    B.get('tank').addGeometry(new THREE.ConeGeometry(1.35, 0.5, 20), new THREE.Matrix4().makeTranslation(cx, H + 3.95, cz));
  }
  if (r() < 0.5) {
    const cx = b.x0 + 1.5 + r() * (w - 3), cz = b.z0 + 1.5 + r() * (d - 3);
    B.get('metalDark').addGeometry(new THREE.CylinderGeometry(0.04, 0.05, 4.5, 6), new THREE.Matrix4().makeTranslation(cx, H + 2.25, cz));
    B.get('metalDark').addGeometry(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 4), new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(cx, H + 3.6, cz));
    B.get('metalDark').addGeometry(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 4), new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(cx, H + 4.0, cz));
  }
}

// Tour de bureaux à mur-rideau : vitrage toute hauteur, ailettes aluminium, allèges, hall vitré.
export function tower(ctx, b) {
  const B = ctx.B, r = b.rng;
  const gf = 6.0, fh = 3.7, H = gf + (b.floors - 1) * fh;
  const tint = b.tint || 'alu';
  for (const s of sides(b)) {
    const L = s.L;
    const n = Math.max(2, Math.round(L / 3.0)); const bay = L / n;
    // hall
    for (let i = 0; i < n; i++) {
      const u = bay * (i + 0.5);
      glass(ctx, at(s, u, gf / 2 + 0.2, -0.6), s.nrm, bay - 0.12, gf - 0.5, [bay * 2, gf, 12, r()], [1, 0, 0.2, 0]);
    }
    B.get('spandrel').wallRect(s.o, s.ax, s.nrm, 0, L, gf - 0.3, gf + 0.4, 0.0);
    B.get('stoneDark').wallRect(s.o, s.ax, s.nrm, 0, L, 0, 0.2, -0.0);
    // sol du hall en retrait + soffite
    B.get('aluDark').box(at(s, L / 2, gf - 0.2, -0.3), L / 2, 0.08, 0.3, s.ax);
    if (b.entrance === s.key) {
      ctx.shopDoors.push({ p: at(s, L / 2, 0, 1.2), nrm: s.nrm.clone(), shop: b.shopInfo, building: b });
      B.get('aluDark').box(at(s, L / 2, gf - 1.2, 2.2), 4, 0.15, 2.4, s.ax);
      for (const k of [-1, 1]) B.get('alu').box(at(s, L / 2 + k * 3.6, (gf - 1.2) / 2, 4.2), 0.08, (gf - 1.2) / 2, 0.08, s.ax);
    }
    // étages
    for (let f = 1; f < b.floors; f++) {
      const y0 = gf + (f - 1) * fh;
      B.get('spandrel').wallRect(s.o, s.ax, s.nrm, 0, L, y0 + fh - 0.75, y0 + fh, 0.0);
      for (let i = 0; i < n; i++) {
        const u = bay * (i + 0.5);
        glass(ctx, at(s, u, y0 + (fh - 0.75) / 2, -0.02), s.nrm, bay - 0.08, fh - 0.75, [bay * 1.6, fh, 6 + r() * 4, r()], [2, 0, 0.0, r() < 0.2 ? 0.08 : 0]);
      }
    }
    // ailettes verticales
    for (let i = 0; i <= n; i++) B.get(tint).box(at(s, bay * i, (gf + H) / 2, 0.12), 0.05, (H - gf) / 2, 0.14, s.ax);
    // couronnement
    B.get('spandrel').wallRect(s.o, s.ax, s.nrm, 0, L, H, H + 2.4, 0.0);
    B.get(tint).box(at(s, L / 2, H + 2.45, 0.06), L / 2 + 0.1, 0.06, 0.12, s.ax);
  }
  B.get('roof').aabb(b.x0 + 0.1, H, b.z0 + 0.1, b.x1 - 0.1, H + 0.1, b.z1 - 0.1, 4);
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  B.get('spandrel').aabb(cx - 5, H, cz - 4, cx + 5, H + 4.5, cz + 4, 63 & ~8);
  for (let i = 0; i < 4; i++) ctx.props.push({ name: 'exterior_aircon_unit', x: cx - 8 + i * 4, y: H + 0.1, z: b.z1 - 3, ry: 0, s: 1.2 });
  // feu d'obstacle
  ctx.beacons.push(new THREE.Vector3(cx, H + 4.7, cz));
  ctx.colliders.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, h: H });
  return H;
}
