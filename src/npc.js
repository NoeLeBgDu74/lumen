// Population autonome : identité, personnalité, métier, domicile, voiture, relations, mémoire, emploi du temps.
// Simulation multi-niveaux : chaque habitant est toujours simulé (position/activité), mais seuls les proches
// reçoivent un personnage 3D animé. Les trajets à pied suivent les trottoirs, les trajets en voiture passent par
// la circulation (recherche de place, créneau). Rien ne se téléporte, sauf lors d'un saut temporel (sommeil, travail du joueur).
import * as THREE from 'three';
import * as W from './world.js';
import { Character } from './chars.js';

const FIRST_M = ['Thomas', 'Nicolas', 'Julien', 'Karim', 'Antoine', 'Hugo', 'Mehdi', 'Pierre', 'Louis', 'Yanis', 'Bastien', 'Olivier', 'Samuel', 'Théo', 'Rachid', 'Marc', 'Victor', 'Paul', 'Éric', 'Damien', 'Kevin', 'Alexandre', 'Mathis', 'Sébastien'];
const FIRST_F = ['Camille', 'Sarah', 'Inès', 'Julie', 'Manon', 'Chloé', 'Léa', 'Nadia', 'Sophie', 'Emma', 'Laura', 'Fatima', 'Claire', 'Élodie', 'Anaïs', 'Marion', 'Lina', 'Pauline', 'Aurélie', 'Céline', 'Zoé', 'Hélène', 'Yasmine', 'Nathalie'];
const LAST = ['Martin', 'Bernard', 'Dubois', 'Durand', 'Lefebvre', 'Moreau', 'Laurent', 'Simon', 'Michel', 'Garcia', 'Roux', 'Fournier', 'Girard', 'Bonnet', 'Lambert', 'Fontaine', 'Rousseau', 'Vincent', 'Muller', 'Faure', 'Mercier', 'Blanc', 'Guerin', 'Boyer', 'Chevalier', 'Benali', 'Nguyen', 'Petit', 'Robin', 'Gauthier'];
const TRAITS = {
  presse: { label: 'pressé', pace: 1.25, social: 0.3 }, prudent: { label: 'prudent', pace: 0.85, social: 0.5 },
  sociable: { label: 'sociable', pace: 1.0, social: 0.95 }, solitaire: { label: 'solitaire', pace: 1.0, social: 0.08 },
  travailleur: { label: 'travailleur', pace: 1.05, social: 0.4 }, desorganise: { label: 'désorganisé', pace: 0.95, social: 0.6 },
};
const HOBBIES = ['le football', 'la cuisine', 'les voitures anciennes', 'la lecture', 'la musique', 'les jeux vidéo', 'le jardinage', 'la photo', 'le cinéma', 'la course à pied', 'la pêche', 'la randonnée'];
export const JOBS = {
  cashier: { label: 'caissier·ère', places: ['supermarket', 'gas_station'], start: 8, hours: 8 },
  shelver: { label: 'employé·e de rayon', places: ['supermarket'], start: 6, hours: 8 },
  office: { label: 'employé·e de bureau', places: ['office'], start: 9, hours: 8 },
  mechanic: { label: 'mécanicien·ne', places: ['garage'], start: 8, hours: 9 },
  delivery: { label: 'livreur·se', places: ['warehouse'], start: 7, hours: 8 },
  worker: { label: 'ouvrier·ère', places: ['factory'], start: 6, hours: 8 },
  waiter: { label: 'serveur·se', places: ['restaurant', 'cafe'], start: 11, hours: 9 },
  baker: { label: 'boulanger·ère', places: ['bakery'], start: 5, hours: 8 },
  seller: { label: 'vendeur·se', places: ['shop', 'pharmacy', 'grocery', 'bank'], start: 9, hours: 8 },
  car_seller: { label: 'vendeur·se automobile', places: ['dealership'], start: 9, hours: 8 },
  instructor: { label: 'moniteur·rice d’auto-école', places: ['driving_school'], start: 9, hours: 8 },
  retired: { label: 'retraité·e', places: [], start: 0, hours: 0 },
  student: { label: 'étudiant·e', places: ['office'], start: 10, hours: 5 },
};

const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const TOPS = [0x3b5b8c, 0x8c2f2f, 0x2f6b47, 0xe8e4da, 0x1d1f24, 0xc98a2b, 0x6b3f8c, 0x7d8a96, 0x4a6670, 0xb7b0a0];
const BOTS = [0x2b2b30, 0x3a4a66, 0x5a4a3a, 0xc9c2b4, 0x1a1a1a, 0x4b5b3b];

export class Population {
  constructor(scene, traffic, bases, game) {
    this.scene = scene; this.traffic = traffic; this.bases = bases; this.game = game;
    this.people = []; this.pool = []; this.maxVisible = 40;
  }

  generate(n) {
    const homes = W.places.filter(p => (p.type === 'apartments' || p.type === 'house') && p.door);
    const work = W.places.filter(p => p.door);
    const fun = W.places.filter(p => ['park', 'sports', 'restaurant', 'cafe'].includes(p.type));
    const shops = W.places.filter(p => ['supermarket', 'bakery', 'grocery', 'pharmacy', 'shop'].includes(p.type));
    for (let i = 0; i < n; i++) {
      const female = Math.random() < 0.5;
      const traitKey = rnd(Object.keys(TRAITS));
      const age = 19 + Math.floor(Math.random() * 60);
      let jobKey = age > 64 ? 'retired' : age < 24 && Math.random() < 0.5 ? 'student' : rnd(Object.keys(JOBS).filter(k => k !== 'retired' && k !== 'student'));
      let workplace = null;
      if (JOBS[jobKey].places.length) {
        const opts = work.filter(p => JOBS[jobKey].places.includes(p.type));
        workplace = opts.length ? rnd(opts) : null;
        if (!workplace) { jobKey = 'office'; workplace = rnd(work.filter(p => p.type === 'office')); }
      }
      const home = rnd(homes);
      const p = {
        id: i, female, first: rnd(female ? FIRST_F : FIRST_M), last: rnd(LAST), age, trait: traitKey, t: TRAITS[traitKey],
        job: jobKey, workplace, home, hobby: rnd(HOBBIES), favShop: rnd(shops), favFun: rnd(fun),
        relations: {}, memory: [], metPlayer: 0, playerOpinion: 0, mood: 0.6 + Math.random() * 0.3,
        wake: 6 + Math.random() * 2 - (jobKey === 'baker' ? 2 : 0), sleep: 22 + Math.random() * 2,
        state: 'inside', at: home, pos: home.door.p.clone(), heading: 0, path: null, car: null, char: null, plan: [], task: null,
        model: female ? 'michelle' : 'rpm', tint: female ? null : { Outfit_Top: rnd(TOPS), Outfit_Bottom: rnd(BOTS) },
        height: female ? 1.62 + Math.random() * 0.12 : 1.72 + Math.random() * 0.14, waitUntil: 0, talkWith: null, talkUntil: 0,
      };
      p.pos.add(home.door.nrm.clone().multiplyScalar(-2)); // à l'intérieur
      this.people.push(p);
    }
    // relations : collègues, voisins, quelques amis
    for (const p of this.people) {
      for (const q of this.people) {
        if (p === q) continue;
        if (p.workplace && p.workplace === q.workplace && Math.random() < 0.6) rel(p, q, 0.35, 'collègue');
        if (p.home === q.home && Math.random() < 0.7) rel(p, q, 0.3, 'voisin·e');
      }
      const nf = Math.round(p.t.social * 4);
      for (let k = 0; k < nf; k++) { const q = rnd(this.people); if (q !== p) { rel(p, q, 0.65 + Math.random() * 0.3, 'ami·e'); rel(q, p, 0.65, 'ami·e'); } }
    }
    // voitures : 60 % possèdent une voiture garée près de chez eux
    for (const p of this.people) {
      if (Math.random() > 0.6 || p.age < 20) continue;
      const spot = nearestFreeSpot(p.home.door.p);
      if (!spot) continue;
      const ai = this.traffic.newCar(); ai.owner = p; this.traffic.parkAt(ai, spot); p.car = ai;
    }
    for (const p of this.people) this.planDay(p, this.game.hour, true);
  }

  // ---------- emploi du temps ----------
  planDay(p, hour, initial = false) {
    const J = JOBS[p.job];
    const plan = [];
    const jitter = () => (Math.random() - 0.5) * (p.trait === 'desorganise' ? 1.2 : 0.4);
    if (p.workplace && J.hours && !(this.game.day % 7 === 0 || this.game.day % 7 === 6) || (p.workplace && Math.random() < 0.25)) {
      const lead = p.trait === 'prudent' ? 0.9 : p.trait === 'presse' ? 0.4 : 0.6;
      plan.push({ at: J.start - lead + jitter(), go: p.workplace, why: 'travailler', stay: J.hours });
    }
    // après le travail / dans la journée
    const after = p.workplace ? J.start + J.hours + 0.3 : 9 + Math.random() * 4;
    if (Math.random() < 0.45) plan.push({ at: after + jitter(), go: p.favShop, why: 'faire des courses', stay: 0.4 + Math.random() * 0.4 });
    if (Math.random() < 0.35 + p.t.social * 0.3) {
      const friend = this.bestFriend(p);
      plan.push({ at: Math.max(after + 0.8, 17.5) + jitter(), go: p.favFun, why: friend ? 'retrouver ' + friend.first : 'se détendre', stay: 1 + Math.random(), friend });
    }
    if (!p.workplace || J.start >= 10 || Math.random() < 0.4) { const parks = W.places.filter(x => x.type === 'park' || x.type === 'sports'); plan.push({ at: 9.5 + Math.random() * 8, go: parks[Math.floor(Math.random() * parks.length)], why: 'se promener', stay: 0.6 + Math.random() }); }
    if (Math.random() < 0.5) { const sh = W.places.filter(x => ['bakery', 'shop', 'pharmacy', 'cafe', 'restaurant'].includes(x.type)); plan.push({ at: 8 + Math.random() * 11, go: sh[Math.floor(Math.random() * sh.length)], why: 'faire un tour en ville', stay: 0.3 + Math.random() * 0.5 }); }
    plan.push({ at: Math.max(after + 1.5, 19.5 + Math.random() * 2), go: p.home, why: 'rentrer chez soi', stay: 12 });
    plan.sort((a, b) => a.at - b.at);
    p.plan = plan.filter(t => t.at > (initial ? hour - 6 : hour - 0.01));
    p.planDay = this.game.day;
    if (initial) {
      // placer chacun là où il devrait être à l'heure de départ
      const cur = [...plan].reverse().find(t => t.at <= hour && t.at + t.stay > hour);
      if (cur && cur.go !== p.home) { p.at = cur.go; p.pos.copy(cur.go.door.p); p.until = cur.at + cur.stay; p.plan = plan.filter(t => t.at > hour); p.task = cur; }
      else p.plan = plan.filter(t => t.at > hour);
    }
  }
  bestFriend(p) { let best = null, b = 0.5; for (const id in p.relations) { const r = p.relations[id]; if (r.v > b && r.kind === 'ami·e') { b = r.v; best = this.people[id]; } } return best; }

  remember(p, text) {
    p.memory.push({ day: this.game.day, h: Math.round(this.game.hour * 10) / 10, text });
    if (p.memory.length > 30) p.memory.shift();
  }

  // ---------- mise à jour ----------
  update(dt, camPos) {
    const h = this.game.hour;
    for (const p of this.people) {
      if (p.planDay !== this.game.day && h > 3 && h < p.wake) this.planDay(p, h);
      switch (p.state) {
        case 'inside': {
          const next = p.plan[0];
          const asleep = p.at === p.home && (h > p.sleep || h < p.wake);
          if (next && h >= next.at && !asleep && (!p.until || h >= p.until || next.go === p.home)) {
            p.plan.shift(); this.startTrip(p, next);
          }
          break;
        }
        case 'walk': this.walk(p, dt); break;
        case 'toCar': this.walk(p, dt); break;
        case 'driving': if (p.car) p.pos.copy(p.car.pos); break;
        case 'talk': if (this.game.time > p.talkUntil) { p.state = p.resume; p.talkWith = null; } break;
        case 'outside': // présent à l'extérieur (parc, terrasse)
          if (h >= p.until || (p.plan[0] && h >= p.plan[0].at)) { const n = p.plan.shift() || { go: p.home, why: 'rentrer chez soi', stay: 12, at: h }; this.startTrip(p, n); }
          break;
      }
    }
    this.encounters();
    this.render(dt, camPos);
  }

  startTrip(p, task) {
    p.task = task;
    const from = p.pos.clone(), dest = task.go.door ? task.go.door.p : new THREE.Vector3(task.go.x, 0, task.go.z);
    const dist = from.distanceTo(dest);
    p.until = null;
    if (p.car && p.car.state === 'parked' && dist > 420) {
      p.state = 'toCar';
      p.path = walkPath(from, p.car.pos.clone()); p.pi = 0;
      p.onArrive = () => this.boardCar(p, task);
    } else {
      p.state = 'walk'; p.path = walkPath(from, dest); p.pi = 0;
      p.onArrive = () => this.arrive(p, task);
    }
    this.remember(p, `est parti·e ${task.why}${task.go.name ? ' (' + task.go.name + ')' : ''}`);
  }

  boardCar(p, task) {
    p.state = 'driving';
    const ok = this.traffic.drive(p.car, task.go, (ai) => {
      // garé : marcher jusqu'à la porte
      p.pos.copy(ai.pos);
      p.state = 'walk'; p.path = walkPath(ai.pos.clone(), task.go.door.p); p.pi = 0;
      p.onArrive = () => this.arrive(p, task);
      this.remember(p, `s'est garé·e près de ${task.go.name || 'sa destination'}`);
    });
    if (!ok) { p.state = 'walk'; p.path = walkPath(p.pos.clone(), task.go.door.p); p.pi = 0; p.onArrive = () => this.arrive(p, task); }
  }

  arrive(p, task) {
    p.at = task.go; p.until = this.game.hour + task.stay; p.path = null;
    if (task.go.type === 'park' || task.go.type === 'sports') {
      p.state = 'outside';
      const c = new THREE.Vector3(task.go.x, 0, task.go.z);
      p.pos.copy(c).add(new THREE.Vector3((Math.random() - 0.5) * 30, 0.15, (Math.random() - 0.5) * 30));
      p.heading = Math.random() * 6.28;
    } else p.state = 'inside';
    if (task.friend && task.friend.at === task.go) { rel(p, task.friend, 0.05); rel(task.friend, p, 0.05); this.remember(p, `a passé un moment avec ${task.friend.first}`); }
    if (task.go === p.workplace) this.remember(p, `a travaillé à ${task.go.name}`);
  }

  walk(p, dt) {
    const path = p.path; if (!path) { p.state = 'inside'; return; }
    let step = 1.35 * p.t.pace * dt;
    while (step > 0 && p.pi < path.length) {
      const tgt = path[p.pi];
      const dx = tgt.x - p.pos.x, dz = tgt.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d < 1e-3) { p.pi++; continue; }
      const m = Math.min(step, d);
      p.pos.x += dx / d * m; p.pos.z += dz / d * m; step -= m;
      const hd = Math.atan2(dx, dz); let dd = hd - p.heading; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); p.heading += dd * Math.min(1, dt * 8);
      if (m >= d) p.pi++;
    }
    p.pos.y = groundY(p.pos.x, p.pos.z);
    if (p.pi >= path.length) { const cb = p.onArrive; p.onArrive = null; p.path = null; cb && cb(); }
  }

  // Rencontres : deux habitants qui se connaissent et se croisent s'arrêtent pour discuter.
  encounters() {
    if (!this._encT) this._encT = 0;
    if (this.game.time - this._encT < 1) return; this._encT = this.game.time;
    const walkers = this.people.filter(p => p.state === 'walk' || p.state === 'outside');
    for (let i = 0; i < walkers.length; i++) for (let j = i + 1; j < walkers.length; j++) {
      const a = walkers[i], b = walkers[j];
      if (a.pos.distanceToSquared(b.pos) > 9) continue;
      const r = a.relations[b.id];
      const sociable = (a.t.social + b.t.social) / 2;
      if ((r && r.v > 0.3 && Math.random() < 0.6) || (!r && Math.random() < sociable * 0.15)) {
        const dur = 8 + Math.random() * 20 * sociable;
        for (const [x, y] of [[a, b], [b, a]]) {
          x.resume = x.state; x.state = 'talk'; x.talkWith = y; x.talkUntil = this.game.time + dur;
          x.heading = Math.atan2(y.pos.x - x.pos.x, y.pos.z - x.pos.z);
          rel(x, y, r ? 0.03 : 0.2, r ? r.kind : 'connaissance'); if (this.game.living) this.game.living.spread(x, y);
          this.remember(x, r ? `a discuté avec ${y.first} (${r.kind})` : `a fait la connaissance de ${y.first} ${y.last}`);
        }
      }
    }
  }

  // ---------- rendu (LOD) ----------
  visible(p) { return p.state === 'walk' || p.state === 'toCar' || p.state === 'talk' || p.state === 'outside'; }
  render(dt, cam) {
    const cand = this.people.filter(p => this.visible(p)).map(p => [p, p.pos.distanceToSquared(cam)]).filter(x => x[1] < 140 * 140).sort((a, b) => a[1] - b[1]).slice(0, this.maxVisible).map(x => x[0]);
    const keep = new Set(cand);
    for (const p of this.people) if (p.char && !keep.has(p)) { this.release(p); }
    for (const p of cand) {
      if (!p.char) this.acquire(p);
      const c = p.char;
      c.obj.position.copy(p.pos); c.obj.rotation.set(0, p.heading, 0);
      if (p.knockT && this.game.time - p.knockT < 6.6) { // renversé : chute et relevé
        const t = this.game.time - p.knockT; if (t < 0.5) p.pos.addScaledVector(p.knockDir, dt * 6 * (1 - t / 0.5));
        c.obj.rotation.set(-Math.PI / 2 * Math.min(1, t / 0.35) * (t < 6 ? 1 : Math.max(0, 1 - (t - 6) / 0.6)), p.heading, 0, 'YXZ'); c.obj.position.y += t < 6 ? 0.12 : 0;
      }
      const moving = p.state === 'walk' || p.state === 'toCar';
      c.play(p.state === 'talk' ? (c.has('talk') ? 'talk' : 'idle') : moving ? 'walk' : 'idle', 0.35, moving ? p.t.pace * 0.95 : 1);
      c.update(dt, Math.sqrt(p.pos.distanceToSquared(cam)));
    }
  }
  acquire(p) {
    let c = this.pool.find(x => x.model === p.model && !x.used && x.tintKey === JSON.stringify(p.tint));
    if (!c) {
      const ch = new Character(this.bases[p.model], { height: p.height, tint: p.tint });
      c = { ch, model: p.model, tintKey: JSON.stringify(p.tint), used: false }; this.pool.push(c); this.scene.add(ch.obj);
    }
    c.used = true; c.ch.obj.visible = true; p.char = c.ch; p._slot = c;
  }
  release(p) { p._slot.used = false; p.char.obj.visible = false; p.char = null; p._slot = null; }

  // Saut temporel : termine les trajets en cours et rejoue les décisions.
  skip(hours) {
    for (const p of this.people) {
      if (p.state === 'driving' && p.car) { this.traffic.finishTrip(p.car); }
      if (p.state === 'walk' || p.state === 'toCar' || p.state === 'talk') { const t = p.task; if (t) this.arrive(p, t); else p.state = 'inside'; }
    }
  }

  nearestTo(pos, r = 2.5) { let best = null, bd = r * r; for (const p of this.people) { if (!p.char) continue; const d = p.pos.distanceToSquared(pos); if (d < bd) { bd = d; best = p; } } return best; }
}

function rel(a, b, dv, kind) {
  const r = a.relations[b.id] || (a.relations[b.id] = { v: 0, kind: kind || 'connaissance', met: 0 });
  r.v = Math.min(1, r.v + dv); r.met++;
  if (kind && (kind === 'ami·e' || r.kind === 'connaissance')) r.kind = kind;
  if (r.v > 0.7 && r.kind === 'connaissance') r.kind = 'ami·e';
}

function nearestFreeSpot(p) {
  let best = null, bd = Infinity;
  for (const s of W.parkingSpots) { if (s.taken !== null || s.edge === undefined) continue; const d = (s.x - p.x) ** 2 + (s.z - p.z) ** 2; if (d < bd) { bd = d; best = s; } }
  return best;
}

export function groundY(x, z) {
  const i = Math.floor((x - W.OX) / W.P), j = Math.floor((z - W.OZ) / W.P);
  if (i < 0 || j < 0 || i >= W.NX || j >= W.NZ) return 0;
  const lx = x - W.gx(i), lz = z - W.gz(j);
  return lx > W.RW && lx < W.P - W.RW && lz > W.RW && lz < W.P - W.RW ? 0.15 : 0;
}

// Chemin piéton : trottoirs le long du réseau, traversées aux passages piétons.
const SWO = W.RW + 2.4;
export function walkPath(a, b) {
  if (a.distanceTo(b) < 75) { const sa = toSidewalk(a), sb = toSidewalk(b); return [a.clone(), sa, sb, b.clone()]; }
  const na = W.nearestNode(a.x, a.z, n => n.signal), nb = W.nearestNode(b.x, b.z, n => n.signal);
  const corner = (n, x, z) => { const N = W.nodes[n]; return new THREE.Vector3(N.x + Math.sign(x - N.x || 1) * SWO, 0.15, N.z + Math.sign(z - N.z || 1) * SWO); };
  const pts = [a.clone()];
  // sortie vers le trottoir le plus proche
  pts.push(toSidewalk(a));
  const route = W.route(na, nb) || [na];
  let cur = pts[pts.length - 1];
  for (let k = 0; k < route.length; k++) {
    const N = W.nodes[route[k]];
    const c1 = corner(route[k], cur.x, cur.z);
    pts.push(c1);
    const nextRef = k + 1 < route.length ? W.nodes[route[k + 1]] : b;
    const c2 = corner(route[k], nextRef.x === N.x ? c1.x - N.x + N.x : nextRef.x, nextRef.z === N.z ? c1.z : nextRef.z);
    if (c2.distanceTo(c1) > 0.5) pts.push(c2); // traversée
    cur = c2;
  }
  pts.push(toSidewalk(b)); pts.push(b.clone());
  return pts;
}
function toSidewalk(p) {
  // point du trottoir le plus proche (bande à 2,4 m de la bordure, côté îlot)
  const i = Math.floor((p.x - W.OX) / W.P), j = Math.floor((p.z - W.OZ) / W.P);
  const x0 = W.gx(i) + SWO, x1 = W.gx(i + 1) - SWO, z0 = W.gz(j) + SWO, z1 = W.gz(j + 1) - SWO;
  const c = [[Math.abs(p.x - x0), x0, p.z], [Math.abs(p.x - x1), x1, p.z], [Math.abs(p.z - z0), p.x, z0], [Math.abs(p.z - z1), p.x, z1]].sort((a, b) => a[0] - b[0])[0];
  return new THREE.Vector3(THREE.MathUtils.clamp(c[1], x0, x1), 0.15, THREE.MathUtils.clamp(c[2], z0, z1));
}
