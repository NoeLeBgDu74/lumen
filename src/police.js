// Police et niveau de recherche (1 à 5 étoiles) : patrouilles qui prennent en chasse, sirènes, arrestation, fuite.
import * as THREE from 'three';
import { poseCar } from './cars.js';
import { Character } from './chars.js';
import { groundHeight } from './physics.js';
import * as W from './world.js';

const $ = (id) => document.getElementById(id);

export class Police {
  constructor(game) {
    this.g = game; this.wanted = 0; this.heat = 0; this.units = []; this.lostT = 0; this.bustT = 0; this.audio = null; this.pending = []; this.search = null; this.knownCar = null;
  }
  // Un délit ne déclenche rien tout seul : il faut un témoin (passant, habitant, policier) qui le voie et appelle.
  addWanted(n, why, direct = false) {
    const g = this.g;
    if (direct) return this.raise(n, why, (g.veh ? g.veh.pos : g.player.pos).clone(), null);
    const pos = (g.veh ? g.veh.pos : g.player.pos).clone();
    const car = g.veh ? { key: g.veh.car.tpl.spec.id + (g.veh.car.paint ? g.veh.car.paint.color.getHexString() : ''), name: g.veh.car.tpl.spec.name } : null;
    const seen = (q) => q.distanceTo(pos) < 38 && g.world.segmentFree(q.x, 1.5, q.z, pos.x, 1.5, pos.z) > 0.97;
    // un policier témoin = signalement immédiat
    for (const u of this.units) if (u.ai.pos.distanceTo(pos) < 70 && g.world.segmentFree(u.ai.pos.x, 1.4, u.ai.pos.z, pos.x, 1.4, pos.z) > 0.97) { this.raise(n, why, pos, car, true); u.mode = 'chase'; return; }
    const w = [];
    for (const p of g.peds.list) if (p.state !== 'down' && seen(p.pos)) w.push({ name: 'Un passant', obj: p, ped: true });
    for (const p of g.pop.people) if (p.char && !p.hurt && seen(p.pos)) w.push({ name: p.first + ' ' + p.last, obj: p });
    if (!w.length) { if (n >= 2) g.life.notify('Aucun témoin… pour cette fois'); return; }
    // chaque témoin peut appeler après un délai (s'il n'est pas neutralisé entre-temps)
    const inc = { n, why, pos, car, reported: false };
    for (const t of w.slice(0, 4)) {
      if (Math.random() > 0.75) continue;
      if (!t.ped) g.pop.remember(t.obj, `a été témoin d'un délit (${why}) commis par ${g.profile.first}`);
      this.pending.push({ inc, t, at: g.time + 4 + Math.random() * 14 });
    }
    if (this.pending.length) g.life.notify('👀 Des témoins vous ont vu·e…', 'warn');
  }
  // Signalement par une personne précise (commerçant braqué, voisin…) après un délai.
  report(n, why, who, delay = 6 + Math.random() * 8) {
    const g = this.g; const pos = (g.veh ? g.veh.pos : g.player.pos).clone();
    this.pending.push({ inc: { n, why, pos, car: null, reported: false }, t: { name: who, obj: {} }, at: g.time + delay });
    g.life.notify(`☎ ${who} appelle la police…`, 'warn');
  }
  raise(n, why, pos, car, byPolice) {
    const g = this.g, before = this.wanted;
    this.wanted = Math.min(5, before ? Math.max(before + (n >= 2 ? 1 : 0), n) : n); this.lostT = 0;
    this.search = { pos: pos.clone(), r: 160 - this.wanted * 15, t: g.time };
    this.lastSeenAs = g.veh ? 'car:' + g.veh.car.tpl.spec.id + (g.veh.car.paint ? g.veh.car.paint.color.getHexString() : '') : 'foot';
    if (car) { this.knownCar = car; g.life.notify(`🚘 Plaque relevée : ${car.name} recherchée`, 'warn'); }
    if (this.wanted > before) g.life.notify(`${byPolice ? '🚓 La police vous a vu·e' : '📞 Un témoin a appelé la police'} : ${'★'.repeat(this.wanted)} (${why})`, 'warn');
    this.renderStars();
  }
  renderStars() { $('stars').textContent = this.wanted ? '★'.repeat(this.wanted) + '☆'.repeat(5 - this.wanted) : ''; }

  spawnUnit(at) {
    const g = this.g, p = at || (this.search ? this.search.pos : (g.veh ? g.veh.pos : g.player.pos));
    const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 80;
    let x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
    const r = g.world.resolve(x, z, 2.5); x = r.x; z = r.z;
    const ai = g.traffic.newCar('fairheaven80', '#16181d');
    ai.state = 'police'; ai.pos.set(x, 0, z); ai.heading = Math.atan2(p.x - x, p.z - z); ai.v = 10;
    // rampe de gyrophares
    const bar = new THREE.Group();
    const mk = (c) => new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.22), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0 }));
    const red = mk(0xff2020), blue = mk(0x2050ff); red.position.x = 0.26; blue.position.x = -0.26;
    bar.add(red, blue, new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.26), new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.6, roughness: 0.4 })));
    bar.position.set(0, ai.tpl.size.y + 0.02, -0.2); ai.car.obj.add(bar);
    // bande blanche « POLICE » sur les portières
    const u = { ai, red: red.material, blue: blue.material, stuck: 0, mode: 'search', goal: null };
    this.units.push(u);
    return u;
  }
  removeUnit(u) { this.g.removeCar(u.ai); this.units.splice(this.units.indexOf(u), 1); }

  update(dt) {
    const g = this.g; if (!g.traffic) return;
    this.updateArrest(dt);
    const target = g.veh ? g.veh.pos : g.player.pos;
    // appels des témoins
    for (const c of [...this.pending]) {
      if (g.time < c.at) continue;
      this.pending.splice(this.pending.indexOf(c), 1);
      const o = c.t.obj; if ((c.t.ped && o.state === 'down') || o.hurt) continue; // témoin neutralisé
      if (!c.inc.reported) { c.inc.reported = true; this.raise(c.inc.n, c.inc.why + ' — signalé par ' + c.t.name.toLowerCase(), c.inc.pos, c.inc.car); }
    }
    const curAs = g.veh ? 'car:' + g.veh.car.tpl.spec.id + (g.veh.car.paint ? g.veh.car.paint.color.getHexString() : '') : 'foot';
    const inKnownCar = this.knownCar && g.veh && (g.veh.car.tpl.spec.id + (g.veh.car.paint ? g.veh.car.paint.color.getHexString() : '')) === this.knownCar.key;
    // nombre d'unités selon le niveau
    // escalade progressive : 1 patrouille à 1★, jusqu'à 6 à 5★ ; renforts plus rapides quand ça chauffe
    const want = this.wanted ? [0, 1, 2, 3, 5, 6][this.wanted] : 0;
    if (this.units.filter(u => !u.target).length < want && (!this._spawnT || g.time - this._spawnT > 14 / this.wanted)) { this._spawnT = g.time; this.spawnUnit(); }
    let seen = false, close = false;
    for (const u of [...this.units]) {
      const ai = u.ai;
      if (u.target) { this.chaseCar(u, dt); continue; }
      const dist = target.distanceTo(ai.pos);
      // repérage : vue directe du joueur (plus loin si la voiture recherchée est reconnue)
      const sight = inKnownCar ? 120 : 60;
      const los = this.wanted && dist < sight && g.world.segmentFree(ai.pos.x, 1.4, ai.pos.z, target.x, 1.4, target.z) > 0.97;
      // reconnaissance : en poursuite on vous suit des yeux ; sinon il faut vous identifier (même véhicule qu'au dernier repérage,
      // plaque relevée, ou vous à pied à moins de 10 m)
      const recognized = u.mode === 'chase' || this.lastSeenAs === curAs || inKnownCar || (!g.veh && dist < 10);
      const sees = los && recognized;
      if (sees) this.lastSeenAs = curAs;
      if (sees) { u.mode = 'chase'; this.search = { pos: target.clone(), r: 60, t: g.time }; }
      else if (u.mode === 'chase' && dist > sight * 1.3) { u.mode = 'search'; u.goal = null; }
      let dest = target;
      if (u.mode !== 'chase' && this.search) {
        if (!u.goal || ai.pos.distanceTo(u.goal) < 12) { const a = Math.random() * 6.28, r = Math.random() * this.search.r; u.goal = this.search.pos.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
        dest = u.goal;
      }
      const to = dest.clone().sub(ai.pos); to.y = 0;
      if (!this.wanted) { // retour à la circulation puis disparition
        u.leave = (u.leave || 0) + dt; if (u.leave > 8 || dist > 200) { this.removeUnit(u); continue; }
      }
      // conduite réaliste : par les rues quand on ne vous voit pas, poursuite directe à vue et de près
      const keep = this.wanted >= 3 ? 0 : this.wanted === 2 ? 5 : 9;
      const direct = u.mode === 'chase' && sees && dist < 45;
      steerDrive(g, ai, dest, dt, { vmax: !this.wanted ? 9 : u.mode === 'chase' ? 13 + this.wanted * 3.5 : 12, direct, stopDist: u.mode === 'chase' ? keep : 0 });
      const dh = ai.steer;
      poseCar(ai.car, { spin: ai.spin, steer: THREE.MathUtils.clamp(dh, -0.5, 0.5), brake: ai.v < 3, head: 1 });
      const ph = Math.floor(g.time * 6) % 2;
      u.red.emissiveIntensity = this.wanted ? (ph ? 12 : 0) : 0; u.blue.emissiveIntensity = this.wanted ? (ph ? 0 : 12) : 0;
      // collision avec la voiture du joueur
      if (g.veh && dist < (ai.tpl.size.z / 2 + 1.6) && this.wanted >= 3) { g.veh.vz *= 0.8; g.veh.yawRate += (Math.random() - 0.5) * 0.8; /* manœuvre PIT */ }
      if (g.veh && dist < (ai.tpl.size.z / 2 + 1.6)) { g.veh.vz *= 0.92; if (!u.rammed && Math.abs(g.veh.vz) > 6) { u.rammed = true; this.addWanted(1, 'collision avec la police'); } }
      if (sees) seen = true;
      if (dist < 8 && u.mode === 'chase') close = true;
    }
    // fuite / arrestation
    if (this.wanted) {
      if (seen) this.lostT = 0; else this.lostT += dt;
      const need = 10 + this.wanted * 6;
      $('stars').classList.toggle('blink', !seen);
      if (inKnownCar && !seen) this.lostT -= dt * 0.5; // la voiture recherchée vous trahit : changez de véhicule
      if (this.lostT > need) { this.wanted--; this.lostT = 0; this.renderStars(); if (!this.wanted) { g.life.notify('Vous avez semé la police', 'ok'); this.search = null; this.knownCar = null; } }
      const spd = g.veh ? g.veh.kmh : g.player.speed * 3.6;
      // interpellation : il faut être à l'arrêt (ou immobilisé) assez longtemps ; plus facile quand le niveau monte
      if (close && spd < 4 && !this.arrest) this.bustT += dt; else this.bustT = Math.max(0, this.bustT - dt * 2);
      if (this.wanted && seen && !this._warned) { this._warned = true; g.life.notify('📢 « Police ! Arrêtez-vous immédiatement ! »', 'warn'); }
      if (!this.wanted) this._warned = false;
      if (this.bustT > [0, 5, 4, 3, 2.5, 2][this.wanted] && !this.arrest) this.startArrest();
      // tirs de la police à partir de 3 étoiles
      if (this.wanted >= 4 && g.combat && !this.arrest) {
        const nearU = this.units.find(u => u.ai.pos.distanceTo(target) < 30);
        if (nearU) { const a = nearU.ai.pos, b = target; if (g.world.segmentFree(a.x, 1.2, a.z, b.x, 1.2, b.z) > 0.97) g.combat.damage(dt * (g.veh ? 2 : 5), 'tirs de la police'); }
      }
    }
    this.siren(this.units.length && this.wanted ? Math.min(1, 60 / Math.max(10, Math.min(...this.units.map(u => u.ai.pos.distanceTo(target))))) : 0);
  }
  // Poursuite d'un véhicule volé par un PNJ
  chaseCar(u, dt) {
    const g = this.g, ai = u.ai, tg = u.target.pos;
    const fixed = !u.target.car && !u.target.tpl; // point fixe (accident) : s'arrêter à côté
    const near = ai.pos.distanceTo(tg) < 40 && g.world.segmentFree(ai.pos.x, 1.4, ai.pos.z, tg.x, 1.4, tg.z) > 0.97;
    steerDrive(g, ai, tg, dt, { vmax: fixed ? 14 : 22, direct: near, stopDist: fixed ? 2 : 0 });
    poseCar(ai.car, { spin: ai.spin, steer: ai.steer, brake: ai.v < 3, head: 1 });
    const ph = Math.floor(g.time * 6) % 2; u.red.emissiveIntensity = ph ? 12 : 0; u.blue.emissiveIntensity = ph ? 0 : 12;
  }
  // Interpellation : un agent sort de la voiture, court vers le joueur et le menotte.
  startArrest() {
    const g = this.g; this.bustT = 0;
    const target = g.veh ? g.veh.pos : g.player.pos;
    const u = this.units.slice().sort((a, b) => a.ai.pos.distanceTo(target) - b.ai.pos.distanceTo(target))[0]; if (!u) return;
    const ai = u.ai; ai.v = 0;
    const base = g.charBases.soldier || g.charBases.rpm;
    const off = new Character(base, { height: 1.82 });
    const door = ai.car.obj.localToWorld(new THREE.Vector3(ai.tpl.size.x / 2 + 0.5, 0, 0.1));
    off.obj.position.copy(door); off.obj.rotation.y = ai.heading + Math.PI / 2; g.R.scene.add(off.obj);
    this.arrest = { u, off, phase: 'run', t: 0 };
    g.life.notify('🚓 « Police ! Ne bougez plus ! »', 'warn');
  }
  updateArrest(dt) {
    const g = this.g, A = this.arrest; if (!A) return;
    A.t += dt; const off = A.off;
    const P = g.player;
    if (A.phase === 'run') {
      const tgt = g.veh ? g.veh.car.obj.localToWorld(new THREE.Vector3(g.veh.car.tpl.size.x / 2 + 0.7, 0, 0.1)) : P.pos.clone().add(new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw)).multiplyScalar(-0.8));
      const to = tgt.clone().sub(off.obj.position); to.y = 0; const d = to.length();
      if (d > 0.25) {
        A.v = Math.min(d > 3 ? 4.6 : 1.6, (A.v || 0) + dt * 5);
        off.obj.position.addScaledVector(to.normalize(), Math.min(d, A.v * dt));
        const want = Math.atan2(to.x, to.z); let dy = Math.atan2(Math.sin(want - off.obj.rotation.y), Math.cos(want - off.obj.rotation.y)); off.obj.rotation.y += dy * Math.min(1, dt * 7);
        off.play(A.v > 2.5 ? 'run' : 'walk', 0.3, A.v > 2.5 ? A.v / 5.6 : A.v / 1.6);
      } else A.v = 0;
      off.obj.position.y = groundHeight(off.obj.position.x, off.obj.position.z);
      const fleeing = g.veh ? g.veh.kmh > 12 : P.speed > 3.5 && P.pos.distanceTo(off.obj.position) > 3;
      if (fleeing && A.t > 1.5) { this.endArrest(); return; }
      if (d <= 0.25 || A.t > 9) {
        if (g.veh) g.forceExit();
        A.phase = 'cuff'; A.t = 0; g.input.enabled = false; P.mode = 'cuffed';
        P.char.play('cuffed', 0.35); off.play('talk', 0.3);
        g.life.notify('🔒 Vous êtes menotté·e', 'warn');
      }
    } else if (A.phase === 'cuff') {
      P.char.play('cuffed', 0.3); P.char.update(dt);
      const behind = P.pos.clone().add(new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw)).multiplyScalar(-0.7));
      off.obj.position.lerp(behind, Math.min(1, dt * 4)); off.obj.rotation.y = P.yaw;
      P.updateCamera(dt, P.pos, 3.2, 1.5);
      if (A.t > 3.2) { this.endArrest(); g.input.enabled = true; P.mode = 'foot'; this.bust(); return; }
    }
    off.update(dt);
  }
  endArrest() { const A = this.arrest; if (!A) return; this.g.R.scene.remove(A.off.obj); this.arrest = null; }

  bust() {
    const g = this.g, L = g.life; this.bustT = 0;
    const fine = Math.round(L.s.money * 0.5 + this.wanted * 250);
    L.s.money = Math.max(0, L.s.money - fine);
    L.notify(`Arrêté·e ! Amende et caution : ${fine} €`, 'warn');
    this.wanted = 0; this.renderStars();
    if (g.veh) g.forceExit();
    L.skip(6, () => {
      const st = g.policeStation || g.home.door.p; g.player.place(st.x + 2, st.z + 2, 0);
    });
  }
  // sirène deux tons (Web Audio)
  siren(level) {
    if (!level && !this.audio) return;
    if (!this.audio) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator(); o.type = 'sawtooth'; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
        const gn = ctx.createGain(); gn.gain.value = 0; o.connect(f); f.connect(gn); gn.connect(ctx.destination); o.start();
        this.audio = { ctx, o, gn };
      } catch (e) { this.audio = { dead: true }; return; }
    }
    if (this.audio.dead) return;
    const { o, gn, ctx } = this.audio;
    o.frequency.setTargetAtTime(Math.floor(this.g.time * 1.4) % 2 ? 640 : 860, ctx.currentTime, 0.02);
    gn.gain.setTargetAtTime(level * 0.06, ctx.currentTime, 0.2);
  }
}


// Conduite réaliste d'un véhicule d'intervention : itinéraire par les rues (A*), rayon de braquage selon la vitesse,
// accélération/freinage progressifs, ralentissement avant les virages, poursuite directe seulement à vue et de près.
export function steerDrive(g, ai, dest, dt, { vmax = 20, direct = false, stopDist = 0 } = {}) {
  let wp = dest;
  if (!direct) {
    ai._rt = (ai._rt || 0) - dt;
    if (ai._rt <= 0 || !ai._route) {
      ai._rt = 2.5; const a = W.nearestNode(ai.pos.x, ai.pos.z), b = W.nearestNode(dest.x, dest.z);
      ai._route = (W.route(a, b) || []).map(n => new THREE.Vector3(W.nodes[n].x, 0, W.nodes[n].z));
    }
    while (ai._route.length && ai.pos.distanceTo(ai._route[0]) < 10) ai._route.shift();
    if (ai._route.length) wp = ai._route[0];
  }
  const to = wp.clone().sub(ai.pos); to.y = 0; const d = to.length(), dFinal = ai.pos.distanceTo(dest);
  const want = Math.atan2(to.x, to.z); let dh = Math.atan2(Math.sin(want - ai.heading), Math.cos(want - ai.heading));
  // vitesse cible : virage serré → on ralentit ; arrivée → on freine
  let vt = vmax * (1 - Math.min(1, Math.abs(dh) / 1.3) * 0.75);
  if (stopDist >= 0 && direct) vt = Math.min(vt, Math.max(0, (dFinal - stopDist) * 0.9));
  else vt = Math.min(vt, Math.max(4, (dFinal - stopDist) * 0.8));
  if (Math.abs(dh) > 2.2 && ai.v < 3) vt = 3; // demi-tour lent
  ai.v += THREE.MathUtils.clamp(vt - ai.v, -9 * dt, 5 * dt);
  // braquage limité par le rayon de virage (≈ 6,5 m)
  const rate = Math.max(0.35, ai.v / 6.5);
  const turn = THREE.MathUtils.clamp(dh, -rate * dt, rate * dt);
  ai.heading += turn; ai.steer = THREE.MathUtils.clamp(dh * 1.2, -0.55, 0.55);
  const fw = new THREE.Vector3(Math.sin(ai.heading), 0, Math.cos(ai.heading));
  const r = g.world.resolve(ai.pos.x + fw.x * ai.v * dt, ai.pos.z + fw.z * ai.v * dt, ai.tpl.size.x / 2 + 0.25);
  if (r.hit) { ai.v *= 0.5; ai._stuck = (ai._stuck || 0) + dt; } else ai._stuck = Math.max(0, (ai._stuck || 0) - dt);
  if (ai._stuck > 2.5) { ai.pos.addScaledVector(fw, -2.5); ai.heading += 0.8; ai._stuck = 0; ai._rt = 0; } else ai.pos.set(r.x, 0, r.z);
  ai.spin += ai.v * dt / (ai.tpl.wheelR || 0.33);
  const o = ai.car.obj; o.position.copy(ai.pos); o.rotation.set(0, ai.heading, 0);
  o.rotateZ(THREE.MathUtils.clamp(-turn / Math.max(dt, 1e-3) * ai.v * 0.004, -0.05, 0.05)); // roulis
  return dFinal;
}
