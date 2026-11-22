// Monde vivant : délinquance des PNJ (vols de voitures, poursuites), rumeurs, accidents et pannes,
// traces de pneus persistantes, pigeons, horaires des commerces.
import * as THREE from 'three';
import * as W from './world.js';
import { Character } from './chars.js';
import { districtAt } from './life.js';

export class Living {
  constructor(game) {
    this.g = game; this.nextCrime = game.time + 90 + Math.random() * 90; this.nextIncident = game.time + 60 + Math.random() * 60;
    this.rumors = []; this.thieves = []; this.incidents = [];
    // traces de pneus (bandes instanciées)
    this.skidGeo = new THREE.PlaneGeometry(0.22, 0.6).rotateX(-Math.PI / 2);
    this.skid = new THREE.InstancedMesh(this.skidGeo, new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }), 1500);
    this.skid.count = 0; this.skid.frustumCulled = false; this.skidN = 0; game.R.scene.add(this.skid);
    this.birds = []; this.spawnBirds();
  }

  // ---------- rumeurs ----------
  rumor(text, where) {
    const r = { id: this.rumors.length, text, where: where || districtAt(this.g.player.pos.x, this.g.player.pos.z), day: this.g.day, h: this.g.hour };
    this.rumors.push(r); if (this.rumors.length > 30) this.rumors.shift();
    // quelques habitants proches l'apprennent ; elle se propage ensuite lors des conversations entre PNJ
    for (const p of this.g.pop.people) if (p.pos.distanceTo(this.g.player.pos) < 150 && Math.random() < 0.5) (p.rumors || (p.rumors = [])).push(r.id);
    return r;
  }
  spread(a, b) { // appelé quand deux PNJ discutent
    const ra = a.rumors || [], rb = b.rumors || [];
    for (const id of ra) if (!rb.includes(id) && Math.random() < 0.7) rb.push(id);
    for (const id of rb) if (!ra.includes(id) && Math.random() < 0.7) ra.push(id);
    a.rumors = ra.slice(-6); b.rumors = rb.slice(-6);
  }
  rumorsOf(p) { return (p.rumors || []).map(id => this.rumors.find(r => r.id === id)).filter(Boolean); }

  // ---------- délinquance des PNJ ----------
  startCarTheft() {
    const g = this.g, me = g.veh ? g.veh.pos : g.player.pos;
    const cands = g.traffic.cars.filter(a => a.state === 'parked' && !a.ownerIsPlayer && a.pos.distanceTo(me) > 50 && a.pos.distanceTo(me) < 200);
    if (!cands.length) return;
    const ai = cands[Math.floor(Math.random() * cands.length)];
    const thiefCh = new Character(g.charBases.rpm, { tint: { Outfit_Top: new THREE.Color(0x1a1a1a).multiplyScalar(1.4), Outfit_Bottom: new THREE.Color(0x222222).multiplyScalar(1.4) } });
    const door = ai.car.obj.localToWorld(new THREE.Vector3(ai.tpl.size.x / 2 + 0.6, 0, 0.15));
    thiefCh.obj.position.copy(door); thiefCh.obj.rotation.y = ai.heading - Math.PI / 2; thiefCh.play('talk', 0); g.R.scene.add(thiefCh.obj);
    const t = { ai, ch: thiefCh, phase: 'break', t: 0, owner: ai.owner && ai.owner.memory ? ai.owner : null };
    this.thieves.push(t);
  }
  updateThieves(dt) {
    const g = this.g;
    for (const t of [...this.thieves]) {
      t.t += dt; const ai = t.ai;
      if (t.phase === 'break') {
        t.ch.update(dt);
        if (t.t > 2.5) {
          g.R.scene.remove(t.ch.obj); t.phase = 'drive'; t.t = 0;
          if (ai.spot) { ai.spot.taken = null; ai.spot = null; }
          ai.state = 'unpark'; ai.unparkT = 0.8; ai.thief = true; ai.aggr = 1.55; ai.route = []; ai.wander = true; ai.target = null;
          if (!ai.edge) { const n = W.nearestNode(ai.pos.x, ai.pos.z); ai.edge = W.edges[W.nodes[n].links[0]]; ai.t = W.RW + 2; }
          const where = districtAt(ai.pos.x, ai.pos.z);
          this.rumor(`une ${ai.tpl.spec.name} a été volée à ${where}`, where);
          if (t.owner) { g.pop.remember(t.owner, `s'est fait voler sa ${ai.tpl.spec.name}`); t.owner.car = null; t.owner.mood = Math.max(0, t.owner.mood - 0.3); }
          if (ai.pos.distanceTo(g.player.pos) < 160) g.life.notify(`🚨 Vol de voiture en cours (${ai.tpl.spec.name}) près de vous !`, 'warn');
          setTimeout(() => { if (ai.thief) { const u = g.police.spawnUnit(ai.pos.clone().add(new THREE.Vector3(60, 0, 60))); u.target = ai; u.mode = 'chase'; } }, 6000 + Math.random() * 6000);
        }
      } else {
        // poursuite : le voleur est arrêté si une patrouille le coince, ou s'échappe au bout d'un moment
        const u = g.police.units.find(x => x.target === ai);
        if (u && u.ai.pos.distanceTo(ai.pos) < 7) t.caught = (t.caught || 0) + dt; else t.caught = 0;
        if (ai.shotT && g.time - ai.shotT < 1) { ai.v *= 0.5; }
        if (t.caught > 2.5) {
          ai.thief = false; ai.state = 'parked'; ai.v = 0; ai.aggr = 1;
          if (u) { u.target = null; u.leave = 0; setTimeout(() => g.police.removeUnit(u), 9000); }
          this.rumor(`la police a arrêté un voleur de voiture à ${districtAt(ai.pos.x, ai.pos.z)}`);
          if (ai.pos.distanceTo(g.player.pos) < 150) g.life.notify('🚓 Le voleur a été arrêté', 'ok');
          this.thieves.splice(this.thieves.indexOf(t), 1);
        } else if (t.t > 150) { ai.thief = false; ai.aggr = 1; if (u) { u.target = null; } this.thieves.splice(this.thieves.indexOf(t), 1); }
      }
    }
  }
  targets() { // pour le combat : tirer sur une voiture volée la ralentit
    return this.thieves.filter(t => t.phase === 'drive').map(t => ({ pos: t.ai.pos, h: 0.8, r: 1.2, hit: () => { t.ai.v *= 0.2; t.ai.shotT = this.g.time; } }));
  }

  // ---------- accidents et pannes de la circulation ----------
  incident() {
    const g = this.g, me = g.veh ? g.veh.pos : g.player.pos;
    const cars = g.traffic.cars.filter(a => a.state === 'drive' && !a.thief && a.pos.distanceTo(me) > 60 && a.pos.distanceTo(me) < 260 && !a.turn);
    if (!cars.length) return;
    const ai = cars[Math.floor(Math.random() * cars.length)];
    const kind = Math.random() < 0.6 ? 'panne' : 'accrochage';
    ai.state = 'broken'; ai.v = 0; ai.brokeT = g.time; ai.hazard = true;
    this.incidents.push({ ai, kind, t: 0 });
    const where = districtAt(ai.pos.x, ai.pos.z);
    this.rumor(kind === 'panne' ? `une voiture est tombée en panne à ${where}, ça bouchonne` : `il y a eu un accrochage à ${where}`, where);
    if (ai.owner && ai.owner.memory) g.pop.remember(ai.owner, kind === 'panne' ? 'sa voiture est tombée en panne' : 'a eu un accrochage');
  }
  updateIncidents(dt) {
    const g = this.g;
    for (const i of [...this.incidents]) {
      i.t += dt; const ai = i.ai;
      ai.blink = (Math.floor(g.time * 2.5) % 2) * 3; // feux de détresse
      g.traffic.sync(ai, { night: g.sky.night > 0.45 ? 1 : 0 });
      if (i.t > 75) { ai.state = 'drive'; ai.hazard = false; ai.blink = 0; this.incidents.splice(this.incidents.indexOf(i), 1); }
    }
  }

  // ---------- traces de pneus ----------
  skidmark(p, heading) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0.013 + (p.y > 0.1 ? 0.15 : 0), p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading), new THREE.Vector3(1, 1, 1));
    this.skid.setMatrixAt(this.skidN % 1500, m); this.skidN++; this.skid.count = Math.min(1500, this.skidN); this.skid.instanceMatrix.needsUpdate = true;
  }
  updateSkids() {
    const v = this.g.veh; if (!v) return;
    const sliding = Math.abs(v.vx) > 2.2 || (v.brake > 0.6 && v.kmh > 25) || (this.g.input.down('Space') && v.kmh > 15);
    if (!sliding) return;
    this.skAcc = (this.skAcc || 0) + 1; if (this.skAcc % 2) return;
    const fw = new THREE.Vector3(Math.sin(v.heading), 0, Math.cos(v.heading)), lt = new THREE.Vector3(fw.z, 0, -fw.x);
    const t = v.car.tpl, hw = t.track / 2;
    for (const s of [-1, 1]) this.skidmark(v.pos.clone().addScaledVector(fw, t.rearZ).addScaledVector(lt, s * hw), v.heading + Math.atan2(v.vx, Math.max(1, Math.abs(v.vz))));
  }

  // ---------- pigeons ----------
  spawnBirds() {
    const g = this.g;
    const geo = new THREE.ConeGeometry(0.09, 0.28, 5).rotateX(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0x7a7f88, roughness: 0.8 });
    const parks = W.places.filter(p => p.type === 'park' || p.type === 'restaurant' || p.type === 'bakery').slice(0, 14);
    for (const p of parks) {
      const c = p.door ? p.door.p : new THREE.Vector3(p.x, 0, p.z);
      for (let k = 0; k < 6; k++) {
        const m = new THREE.Mesh(geo, mat); const home = c.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 0.2, (Math.random() - 0.5) * 8));
        m.position.copy(home); m.rotation.y = Math.random() * 6.28; g.R.scene.add(m);
        this.birds.push({ m, home, state: 'ground', t: Math.random() * 5, v: new THREE.Vector3() });
      }
    }
  }
  updateBirds(dt) {
    const g = this.g, me = g.veh ? g.veh.pos : g.player.pos;
    for (const b of this.birds) {
      const d = b.m.position.distanceTo(me);
      b.m.visible = d < 90;
      if (!b.m.visible) continue;
      b.t += dt;
      if (b.state === 'ground') {
        if (Math.sin(b.t * 7) > 0.9) b.m.position.y = 0.2 + 0.03; else b.m.position.y = 0.19; // picore
        if (b.t > 2) { b.t = 0; b.m.rotation.y += (Math.random() - 0.5) * 2; b.m.position.addScaledVector(new THREE.Vector3(Math.sin(b.m.rotation.y), 0, Math.cos(b.m.rotation.y)), 0.25); }
        if (d < 4 || (g.veh && d < 9) || (g.combat && g.combat.flash.intensity > 1 && d < 40)) { b.state = 'fly'; b.t = 0; b.v.set((b.m.position.x - me.x), 0, (b.m.position.z - me.z)).normalize().multiplyScalar(5).setY(4 + Math.random() * 2); }
      } else {
        b.v.y -= dt * 0.8; b.m.position.addScaledVector(b.v, dt); b.m.rotation.z = Math.sin(b.t * 30) * 0.4; b.m.lookAt(b.m.position.clone().add(b.v));
        if (b.t > 8) { b.state = 'ground'; b.t = 0; b.m.position.copy(b.home); b.m.rotation.set(0, Math.random() * 6, 0); }
      }
    }
  }

  update(dt) {
    const g = this.g;
    if (g.time > this.nextCrime) { this.nextCrime = g.time + 150 + Math.random() * 180; if (!g.net || !g.net.connected || g.net.host) this.startCarTheft(); }
    if (g.time > this.nextIncident) { this.nextIncident = g.time + 120 + Math.random() * 150; if (!g.net || !g.net.connected || g.net.host) this.incident(); }
    this.updateThieves(dt); this.updateIncidents(dt); this.updateSkids(); this.updateBirds(dt);
  }
}
