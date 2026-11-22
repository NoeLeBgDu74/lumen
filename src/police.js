// Police et niveau de recherche (1 à 5 étoiles) : patrouilles qui prennent en chasse, sirènes, arrestation, fuite.
import * as THREE from 'three';
import { poseCar } from './cars.js';
import { Character } from './chars.js';
import { groundHeight } from './physics.js';

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
    if (car) { this.knownCar = car; g.life.notify(`🚘 Plaque relevée : ${car.name} recherchée`, 'warn'); }
    if (this.wanted > before) g.life.notify(`${byPolice ? '🚓 La police vous a vu·e' : '📞 Un témoin a appelé la police'} : ${'★'.repeat(this.wanted)} (${why})`, 'warn');
    this.renderStars();
  }
  renderStars() { $('stars').textContent = this.wanted ? '★'.repeat(this.wanted) + '☆'.repeat(5 - this.wanted) : ''; }

  spawnUnit() {
    const g = this.g, p = this.search ? this.search.pos : (g.veh ? g.veh.pos : g.player.pos);
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
    const inKnownCar = this.knownCar && g.veh && (g.veh.car.tpl.spec.id + (g.veh.car.paint ? g.veh.car.paint.color.getHexString() : '')) === this.knownCar.key;
    // nombre d'unités selon le niveau
    const want = this.wanted ? Math.min(6, this.wanted + 1) : 0;
    if (this.units.length < want && (!this._spawnT || g.time - this._spawnT > 4)) { this._spawnT = g.time; this.spawnUnit(); }
    let seen = false, close = false;
    for (const u of [...this.units]) {
      const ai = u.ai;
      const dist = target.distanceTo(ai.pos);
      // repérage : vue directe du joueur (plus loin si la voiture recherchée est reconnue)
      const sight = inKnownCar ? 120 : 60;
      const sees = this.wanted && dist < sight && g.world.segmentFree(ai.pos.x, 1.4, ai.pos.z, target.x, 1.4, target.z) > 0.97;
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
      const hd = Math.atan2(to.x, to.z); let dh = hd - ai.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      const vmax = !this.wanted ? 8 : u.mode === 'chase' ? (dist < 12 ? Math.max(2, dist * 0.8) : 22 + this.wanted * 2) : 13;
      ai.heading += THREE.MathUtils.clamp(dh, -1.6 * dt * (1 + ai.v / 20), 1.6 * dt * (1 + ai.v / 20));
      ai.v += THREE.MathUtils.clamp(vmax - ai.v, -9 * dt, 6 * dt);
      if (Math.abs(dh) > 1.2) ai.v *= Math.pow(0.4, dt);
      const fw = new THREE.Vector3(Math.sin(ai.heading), 0, Math.cos(ai.heading));
      const nx = ai.pos.x + fw.x * ai.v * dt, nz = ai.pos.z + fw.z * ai.v * dt;
      const r = g.world.resolve(nx, nz, ai.tpl.size.x / 2 + 0.3);
      if (r.hit) { u.stuck += dt; ai.heading += 1.4 * dt; ai.v *= 0.6; } else u.stuck = Math.max(0, u.stuck - dt);
      if (u.stuck > 3) { // dégagement : recule
        ai.pos.addScaledVector(fw, -3); u.stuck = 0;
      } else ai.pos.set(r.x, 0, r.z);
      ai.spin += ai.v * dt / 0.33;
      ai.car.obj.position.copy(ai.pos); ai.car.obj.rotation.set(0, ai.heading, 0);
      poseCar(ai.car, { spin: ai.spin, steer: THREE.MathUtils.clamp(dh, -0.5, 0.5), brake: ai.v < 3, head: 1 });
      const ph = Math.floor(g.time * 6) % 2;
      u.red.emissiveIntensity = this.wanted ? (ph ? 12 : 0) : 0; u.blue.emissiveIntensity = this.wanted ? (ph ? 0 : 12) : 0;
      // collision avec la voiture du joueur
      if (g.veh && dist < (ai.tpl.size.z / 2 + 1.6)) { g.veh.vz *= 0.85; if (!u.rammed && Math.abs(g.veh.vz) > 6) { u.rammed = true; this.addWanted(1, 'collision avec la police'); } }
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
      if (close && spd < 8 && !this.arrest) this.bustT += dt; else this.bustT = Math.max(0, this.bustT - dt);
      if (this.bustT > 1.2 && !this.arrest) this.startArrest();
      // tirs de la police à partir de 3 étoiles
      if (this.wanted >= 3 && g.combat && !this.arrest) {
        const nearU = this.units.find(u => u.ai.pos.distanceTo(target) < 30);
        if (nearU) { const a = nearU.ai.pos, b = target; if (g.world.segmentFree(a.x, 1.2, a.z, b.x, 1.2, b.z) > 0.97) g.combat.damage(dt * (g.veh ? 2 : 5), 'tirs de la police'); }
      }
    }
    this.siren(this.units.length && this.wanted ? Math.min(1, 60 / Math.max(10, Math.min(...this.units.map(u => u.ai.pos.distanceTo(target))))) : 0);
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
      if (d > 0.25) { off.obj.position.addScaledVector(to.normalize(), Math.min(d, 4.8 * dt)); off.obj.rotation.y = Math.atan2(to.x, to.z); off.play(d > 2 ? 'run' : 'walk', 0.2); }
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
