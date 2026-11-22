// Circulation : véhicules autonomes sur le graphe routier. Suivi de voie, virages en courbe,
// feux tricolores, distance de sécurité, piétons/joueur, recherche de place et créneau, sortie de place.
import * as THREE from 'three';
import * as W from './world.js';
import { signalState } from './city.js';
import { CATALOG, PAINTS, loadCarTemplate, makeCar, poseCar, carLOD } from './cars.js';

const tmp = new THREE.Vector3();
let uid = 0;

export class Traffic {
  constructor(scene) { this.scene = scene; this.cars = []; this.templates = []; this.time = 0; }

  async load() { this.templates = await Promise.all(CATALOG.map(c => loadCarTemplate(c.id))); }

  newCar(specId, paint) {
    const tpl = specId ? this.templates.find(t => t.spec.id === specId) : this.templates[Math.floor(Math.random() * this.templates.length)];
    const car = makeCar(tpl, paint || PAINTS[Math.floor(Math.random() * PAINTS.length)]);
    this.scene.add(car.obj);
    const ai = { id: uid++, car, tpl, state: 'parked', edge: null, t: 0, off: W.LANE, v: 0, spin: 0, steer: 0, heading: 0,
      pos: new THREE.Vector3(), route: [], turn: null, spot: null, owner: null, onArrive: null, aggr: 0.9 + Math.random() * 0.25, brake: false, waitT: 0 };
    this.cars.push(ai);
    return ai;
  }

  parkAt(ai, spot) {
    ai.state = 'parked'; ai.spot = spot; spot.taken = ai.id; ai.v = 0;
    ai.pos.set(spot.x, 0.0, spot.z); ai.heading = spot.rotY;
    if (spot.edge !== undefined) { ai.edge = W.edges[spot.edge]; ai.t = spot.t; ai.off = W.PARK; }
    this.sync(ai);
  }

  // Lance un trajet vers un lieu ; cb(ai) à l'arrivée (garé).
  drive(ai, place, cb) {
    const dest = place.door ? place.door.p : new THREE.Vector3(place.x, 0, place.z);
    // place libre la plus proche de la destination
    let best = null, bd = Infinity;
    for (const s of W.parkingSpots) {
      if (s.taken !== null || s.edge === undefined) continue;
      const d = (s.x - dest.x) ** 2 + (s.z - dest.z) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    if (!best) return false;
    best.taken = ai.id; // réservation
    if (ai.spot && ai.spot !== best) { ai.spot.taken = null; }
    ai.target = best; ai.onArrive = cb; ai.destPlace = place;
    const e = ai.edge || W.edges[W.nodes[W.nearestNode(ai.pos.x, ai.pos.z)].links[0]];
    ai.edge = e;
    ai.route = W.route(e.b, W.edges[best.edge].a) || [];
    ai.route.push(W.edges[best.edge].b);
    ai.state = ai.state === 'parked' ? 'unpark' : 'drive';
    if (ai.state === 'unpark') ai.unparkT = 0;
    return true;
  }

  // Circulation « de fond » : trajets aléatoires sans fin.
  wander(ai) {
    ai.state = ai.state === 'parked' ? 'unpark' : 'drive'; ai.unparkT = 0; ai.target = null; ai.route = []; ai.wander = true;
    if (!ai.edge) { const n = W.nearestNode(ai.pos.x, ai.pos.z); ai.edge = W.edges[W.nodes[n].links[0]]; ai.t = W.RW + 2; }
  }

  nextEdge(ai) {
    const node = ai.edge.b;
    let nxt = null;
    if (ai.route.length) {
      while (ai.route.length && ai.route[0] === ai.edge.a) ai.route.shift();
      if (ai.route[0] === node) ai.route.shift();
      if (ai.route.length) nxt = W.edgeBetween(node, ai.route[0]);
    }
    if (!nxt) {
      const opts = W.nodes[node].links.map(i => W.edges[i]).filter(e => e.b !== ai.edge.a);
      nxt = opts.length ? opts[Math.floor(Math.random() * opts.length)] : W.edges[W.nodes[node].links[0]];
    }
    return nxt;
  }

  lanePos(e, t, off, out) {
    const A = W.nodes[e.a];
    return out.set(A.x + e.dir.x * t - e.dir.z * off, 0, A.z + e.dir.z * t + e.dir.x * off);
  }

  update(dt, ctx) {
    this.time += dt;
    const obstacles = ctx.obstacles || [];
    for (const ai of this.cars) {
      if (ai.state === 'parked' || ai.state === 'player' || ai.state === 'police' || ai.state === 'jacked' || ai.state === 'broken') continue;
      this.step(ai, dt, obstacles, ctx);
    }
  }

  // Distance libre devant (autres voitures + obstacles), dans un couloir de ±1.4 m.
  gapAhead(ai, obstacles, range = 40) {
    const fw = tmp.set(Math.sin(ai.heading), 0, Math.cos(ai.heading));
    let gap = range;
    const test = (p, len) => {
      const dx = p.x - ai.pos.x, dz = p.z - ai.pos.z;
      const f = dx * fw.x + dz * fw.z; if (f <= 0 || f > range) return;
      const l = Math.abs(dx * fw.z - dz * fw.x); if (l > 1.6) return;
      gap = Math.min(gap, f - len);
    };
    for (const o of this.cars) { if (o === ai || o.state === 'parked') continue; test(o.pos, (o.tpl.size.z + ai.tpl.size.z) / 2 + 1.5); }
    for (const o of obstacles) test(o, o.len || 3);
    return gap;
  }

  step(ai, dt, obstacles, ctx) {
    const e = ai.edge;
    if (ai.state === 'unpark') {
      // sortie de place : clignotant, attendre un créneau, glisser vers la voie
      ai.unparkT += dt;
      ai.blink = (Math.floor(this.time * 3) % 2) * 3;
      if (ai.unparkT < 1.2) { this.sync(ai); return; }
      if (ai.spot) { ai.spot.taken = ai.target === ai.spot ? ai.id : null; ai.spot = null; }
      ai.state = 'drive';
    }
    let desired = e.speed * ai.aggr;
    // arrivée : manœuvre de stationnement
    let stopT = Infinity;
    const tgt = ai.target;
    const onTargetEdge = tgt && tgt.edge === e.id;
    if (onTargetEdge) {
      stopT = tgt.t;
      const toGo = stopT - ai.t;
      if (toGo < 14) { ai.off = THREE.MathUtils.lerp(W.PARK, W.LANE, THREE.MathUtils.clamp((toGo - 2) / 12, 0, 1)); ai.blink = (Math.floor(this.time * 3) % 2) * 3; }
    } else if (ai.off > W.LANE) ai.off = Math.max(W.LANE, ai.off - dt * 1.2); else ai.blink = 0;
    // feu rouge / orange
    const node = W.nodes[e.b];
    const stopLine = e.len - W.RW - 4.6;
    if (!ai.turn && node.signal && ai.t < stopLine + 0.5 && !ai.thief) {
      const st = signalState(node, Math.abs(e.dir.x) > 0.5 ? 'x' : 'z', this.time);
      if (st === 'R' || (st === 'Y' && stopLine - ai.t > ai.v * 1.2)) stopT = Math.min(stopT, stopLine);
    }
    // vitesse cible : distance d'arrêt
    const gap = this.gapAhead(ai, obstacles);
    let vmax = desired;
    if (stopT < Infinity && !ai.turn) vmax = Math.min(vmax, Math.sqrt(Math.max(0, 2 * 3.0 * (stopT - ai.t - 0.3))));
    vmax = Math.min(vmax, Math.sqrt(Math.max(0, 2 * 4.0 * (gap - 1.5))));
    if (ai.turn) vmax = Math.min(vmax, ai.turn.straight ? desired : 6.5);
    const acc = vmax > ai.v ? 2.2 * ai.aggr : -6.5;
    ai.v = THREE.MathUtils.clamp(ai.v + acc * dt, 0, Math.max(vmax, 0) + 0.01);
    if (vmax < 0.05 && ai.v < 0.3) ai.v = 0;
    ai.brake = acc < 0 && ai.v > 0.2 || ai.v === 0;
    const ds = ai.v * dt;
    // déplacement
    if (ai.turn) {
      const T = ai.turn; T.s += ds;
      const u = Math.min(1, T.s / T.len);
      const p = bez(T.p0, T.p1, T.p2, u, new THREE.Vector3());
      const d = bezD(T.p0, T.p1, T.p2, u, new THREE.Vector3());
      ai.pos.copy(p); const h = Math.atan2(d.x, d.z);
      ai.steer = THREE.MathUtils.clamp(angDiff(h, ai.heading) / Math.max(dt, 1e-3) * 0.12, -0.5, 0.5);
      ai.heading = h;
      if (u >= 1) { ai.turn = null; ai.edge = T.next; ai.t = W.RW + 0.5; }
    } else {
      ai.t += ds;
      if (onTargetEdge && ai.t >= stopT - 0.4 && ai.v < 0.6) { // garé
        ai.state = 'parked'; ai.spot = tgt; tgt.taken = ai.id; ai.target = null; ai.v = 0; ai.blink = 0;
        ai.pos.set(tgt.x, 0, tgt.z); ai.heading = tgt.rotY; this.sync(ai);
        const cb = ai.onArrive; ai.onArrive = null; cb && cb(ai);
        return;
      }
      const endT = e.len - W.RW;
      if (ai.t >= endT) {
        const nx = this.nextEdge(ai);
        const p0 = this.lanePos(e, endT, W.LANE, new THREE.Vector3());
        const p2 = this.lanePos(nx, W.RW + 0.5, W.LANE, new THREE.Vector3());
        const straight = Math.abs(e.dir.dot(nx.dir)) > 0.9;
        const p1 = straight ? p0.clone().lerp(p2, 0.5) : lineIntersect(p0, e.dir, p2, nx.dir);
        ai.turn = { p0, p1, p2, s: 0, len: bezLen(p0, p1, p2), next: nx, straight };
      } else {
        this.lanePos(e, ai.t, ai.off, ai.pos);
        const h = Math.atan2(e.dir.x, e.dir.z) + (ai.off - W.LANE) * 0.04 * (onTargetEdge ? -1 : 1);
        ai.steer *= 0.9; ai.heading = h;
      }
    }
    ai.spin += ds / (ai.tpl.wheelR || 0.33);
    this.sync(ai, ctx);
  }

  sync(ai, ctx) {
    const o = ai.car.obj;
    o.position.set(ai.pos.x, 0, ai.pos.z);
    o.rotation.set(0, ai.heading, 0);
    const night = ctx ? ctx.night : 0;
    poseCar(ai.car, { spin: ai.spin, steer: ai.steer, brake: ai.state !== 'parked' && ai.brake, head: ai.state === 'parked' ? 0 : night, blink: ai.blink || 0 });
  }

  // Cercles de collision des voitures proches (pour le joueur à pied ou en voiture).
  circles(pos, r = 18) {
    const out = [];
    for (const ai of this.cars) {
      if (ai.state === 'player') continue;
      if (Math.abs(ai.pos.x - pos.x) > r || Math.abs(ai.pos.z - pos.z) > r) continue;
      const fw = new THREE.Vector3(Math.sin(ai.heading), 0, Math.cos(ai.heading));
      const half = ai.tpl.size.z / 2 - ai.tpl.size.x / 2, rad = ai.tpl.size.x / 2;
      for (const o of [-half, -half / 3, half / 3, half]) out.push({ x: ai.pos.x + fw.x * o, z: ai.pos.z + fw.z * o, r: rad });
    }
    return out;
  }
  finishTrip(ai) {
    if (!ai.target) return;
    const tgt = ai.target; ai.turn = null; ai.edge = W.edges[tgt.edge];
    ai.state = 'parked'; ai.spot = tgt; tgt.taken = ai.id; ai.target = null; ai.v = 0; ai.pos.set(tgt.x, 0, tgt.z); ai.heading = tgt.rotY; this.sync(ai);
    const cb = ai.onArrive; ai.onArrive = null; cb && cb(ai);
  }

  remove(ai) {
    this.scene.remove(ai.car.obj); if (ai.spot) ai.spot.taken = null; if (ai.target) ai.target.taken = null;
    const i = this.cars.indexOf(ai); if (i >= 0) this.cars.splice(i, 1);
  }
  // Masque les voitures lointaines (simulation conservée).
  cull(cam, dist) {
    for (const ai of this.cars) {
      const d = ai.pos.distanceTo(cam);
      ai.car.obj.visible = ai.state === 'player' || ai.state === 'police' || d < dist;
      if (ai.car.obj.visible) carLOD(ai.car, ai.state === 'player' ? 0 : d);
    }
  }
}

function bez(a, b, c, t, o) { const u = 1 - t; return o.set(u * u * a.x + 2 * u * t * b.x + t * t * c.x, 0, u * u * a.z + 2 * u * t * b.z + t * t * c.z); }
function bezD(a, b, c, t, o) { return o.set(2 * (1 - t) * (b.x - a.x) + 2 * t * (c.x - b.x), 0, 2 * (1 - t) * (b.z - a.z) + 2 * t * (c.z - b.z)); }
function bezLen(a, b, c) { let L = 0; const p = new THREE.Vector3(), q = a.clone(); for (let i = 1; i <= 12; i++) { bez(a, b, c, i / 12, p); L += p.distanceTo(q); q.copy(p); } return L; }
function lineIntersect(p, d, q, e) {
  // p + s d = q - r e  (e : direction de sortie)
  const den = d.x * e.z - d.z * e.x;
  if (Math.abs(den) < 1e-5) return p.clone().lerp(q, 0.5);
  const s = ((q.x - p.x) * e.z - (q.z - p.z) * e.x) / den;
  return new THREE.Vector3(p.x + d.x * s, 0, p.z + d.z * s);
}
function angDiff(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
