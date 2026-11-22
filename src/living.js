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
    this.fires = []; this.nextFire = game.time + 200 + Math.random() * 200;
    this.flameTex = flameTexture(); this.smokeTex = smokeTexture();
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
    setTimeout(() => { const inc = this.incidents.find(i => i.ai === ai); if (!inc) return; const u = g.police.spawnUnit(ai.pos.clone()); u.target = { pos: ai.pos.clone().add(new THREE.Vector3(Math.sin(ai.heading), 0, Math.cos(ai.heading)).multiplyScalar(-9)) }; u.mode = 'chase'; inc.unit = u; }, 15000);
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
      // la police arrive, sécurise et fait dégager le véhicule (dépannage) : la circulation reprend
      if (i.unit && i.unit.ai.pos.distanceTo(ai.pos) < 14) { i.onSite = (i.onSite || 0) + dt; if (i.onSite > 1 && !i.said && ai.pos.distanceTo(g.player.pos) < 120) { i.said = true; g.life.notify('🚓 La police sécurise l’accident et fait circuler'); } }
      if ((i.onSite || 0) > 14 || i.t > 110) {
        if (i.kind === 'panne') { g.traffic.remove(ai); } else { ai.state = 'drive'; ai.hazard = false; ai.blink = 0; }
        if (i.unit) { const u = i.unit; u.target = null; setTimeout(() => { if (g.police.units.includes(u)) g.police.removeUnit(u); }, 8000); }
        this.incidents.splice(this.incidents.indexOf(i), 1);
      }
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

  // ---------- incendie : flammes, fumée, alerte, camion de pompiers, lances à eau ----------
  startFire(at) {
    const g = this.g, me = g.veh ? g.veh.pos : g.player.pos;
    const cands = W.places.filter(p => p.bounds && p.door && p.door.p.distanceTo(me) > 40 && p.door.p.distanceTo(me) < 230 && p.type !== 'park' && p.type !== 'sports');
    const pl = at || cands[Math.floor(Math.random() * cands.length)]; if (!pl) return;
    const b = pl.bounds, H = Math.min(pl.height || 12, 18);
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const grp = new THREE.Group(); g.R.scene.add(grp);
    const flames = [], smoke = [];
    for (let k = 0; k < 14; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flameTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      const fx = b.x0 + Math.random() * (b.x1 - b.x0), fz = Math.random() < 0.5 ? b.z0 - 0.3 : b.z1 + 0.3, fy = 3 + Math.random() * (H - 2);
      s.position.set(fx, fy, fz); s.scale.set(3, 4.5, 1); s.userData = { base: s.position.clone(), ph: Math.random() * 6 }; grp.add(s); flames.push(s);
    }
    for (let k = 0; k < 18; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, color: 0x333333, transparent: true, opacity: 0.6, depthWrite: false }));
      s.position.set(cx + (Math.random() - 0.5) * 8, H + Math.random() * 25, cz + (Math.random() - 0.5) * 8); s.scale.setScalar(8 + Math.random() * 6); s.userData = { v: 1.5 + Math.random() * 2 }; grp.add(s); smoke.push(s);
    }
    const light = new THREE.PointLight(0xff7a2a, 40, 40, 1.4); light.position.set(cx, H * 0.6, cz); grp.add(light);
    const fire = { pl, grp, flames, smoke, light, hp: 100, t: 0, cx, cz, H, truck: null, crew: [], phase: 'burn' };
    this.fires.push(fire);
    this.rumor(`un incendie s'est déclaré à ${pl.name}`, districtAt(cx, cz));
    g.life.notify(`🔥 Incendie à ${pl.name} ! Les pompiers sont alertés.`, 'warn');
    for (const p of g.pop.people) if (p.at === pl && p.state === 'inside') { p.state = 'walk'; p.path = [p.pos.clone(), pl.door.p.clone().add(pl.door.nrm.clone().multiplyScalar(12))]; p.pi = 0; p.onArrive = () => { p.state = 'outside'; p.until = g.hour + 0.6; }; g.pop.remember(p, `a dû évacuer ${pl.name} à cause d'un incendie`); }
    setTimeout(() => this.dispatchTruck(fire), 9000);
    return fire;
  }
  dispatchTruck(fire) {
    const g = this.g; if (!this.fires.includes(fire)) return;
    const ai = g.traffic.newCar('lightbody90', '#b3121b'); ai.state = 'fire';
    const a = Math.random() * 6.28; ai.pos.set(fire.cx + Math.cos(a) * 160, 0, fire.cz + Math.sin(a) * 160);
    const r = g.world.resolve(ai.pos.x, ai.pos.z, 3); ai.pos.set(r.x, 0, r.z); ai.v = 12; ai.heading = Math.atan2(fire.cx - ai.pos.x, fire.cz - ai.pos.z);
    const bar = new THREE.Group(); const mk = (c) => new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.24), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0 }));
    const l1 = mk(0xff2020), l2 = mk(0xff2020); l1.position.x = 0.32; l2.position.x = -0.32; bar.add(l1, l2); bar.position.set(0, ai.tpl.size.y + 0.05, 0.8); ai.car.obj.add(bar);
    fire.truck = { ai, l1: l1.material, l2: l2.material, stuck: 0 };
  }
  updateFires(dt) {
    const g = this.g;
    for (const f of [...this.fires]) {
      f.t += dt; const k = f.hp / 100;
      for (const s of f.flames) { const u = s.userData; s.position.y = u.base.y + Math.sin(g.time * 6 + u.ph) * 0.3; s.scale.set(3 * k + 0.3, (4.5 + Math.sin(g.time * 9 + u.ph)) * k + 0.3, 1); s.material.opacity = Math.min(1, k * 1.3); }
      for (const s of f.smoke) { s.position.y += s.userData.v * dt; if (s.position.y > f.H + 35) s.position.y = f.H; s.material.opacity = 0.25 + 0.35 * Math.max(k, f.phase === 'out' ? 0.3 : 0); }
      f.light.intensity = 40 * k * (0.8 + Math.random() * 0.4);
      // camion de pompiers : conduite directe vers le feu, sirène
      const T = f.truck;
      if (T) {
        const ai = T.ai, dest = f.pl.door.p.clone().add(f.pl.door.nrm.clone().multiplyScalar(9));
        T.age = (T.age || 0) + dt;
        // repli : s'il ne trouve pas son chemin, le camion se gare devant le feu (de préférence hors de la vue du joueur)
        if (T.age > 22 && ai.pos.distanceTo(dest) > 3 && (ai.pos.distanceTo(g.player.pos) > 50 || T.age > 40)) { ai.pos.copy(dest); ai.heading = Math.atan2(-f.pl.door.nrm.x, -f.pl.door.nrm.z) + Math.PI / 2; ai.v = 0; }
        const to = dest.clone().sub(ai.pos); to.y = 0; const dist = to.length();
        if (dist > 2) {
          const hd = Math.atan2(to.x, to.z); let dh = hd - ai.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
          ai.heading += THREE.MathUtils.clamp(dh, -1.4 * dt, 1.4 * dt); ai.v += THREE.MathUtils.clamp((dist < 20 ? dist * 0.5 : 15) - ai.v, -8 * dt, 4 * dt);
          const fw = new THREE.Vector3(Math.sin(ai.heading), 0, Math.cos(ai.heading));
          const r = g.world.resolve(ai.pos.x + fw.x * ai.v * dt, ai.pos.z + fw.z * ai.v * dt, ai.tpl.size.x / 2 + 0.3);
          if (r.hit) { ai.heading += 1.3 * dt; ai.v *= 0.6; T.stuck += dt; if (T.stuck > 4) { ai.pos.addScaledVector(fw, -3); T.stuck = 0; } } else ai.pos.set(r.x, 0, r.z);
        } else if (!f.crew.length) this.deployCrew(f);
        ai.spin += ai.v * dt / 0.4; g.traffic.sync(ai, { night: 1 });
        const ph = Math.floor(g.time * 5) % 2; T.l1.emissiveIntensity = ph ? 12 : 0; T.l2.emissiveIntensity = ph ? 0 : 12;
      }
      // pompiers : lances à eau
      for (const c of f.crew) {
        c.ch.update(dt); c.t += dt;
        for (const d of c.drops) { d.position.addScaledVector(d.userData.v, dt); d.userData.v.y -= 9.8 * dt; d.userData.t += dt; if (d.userData.t > 1.2) { d.position.copy(c.nozzle); d.userData.t = 0; d.userData.v.copy(c.dir).multiplyScalar(14 + Math.random() * 3).add(new THREE.Vector3((Math.random() - 0.5), 4 + Math.random() * 2, (Math.random() - 0.5))); } }
      }
      if (f.crew.length && f.phase === 'burn') { f.hp -= dt * 3.2; if (f.hp <= 0) { f.phase = 'out'; f.hp = 0; f.outT = g.time; g.life.notify(`🚒 L'incendie de ${f.pl.name} est maîtrisé`, 'ok'); this.rumor(`les pompiers ont éteint l'incendie de ${f.pl.name}`); } }
      if (f.phase === 'out' && g.time - f.outT > 25) { this.endFire(f); }
    }
  }
  deployCrew(f) {
    const g = this.g, base = g.charBases.soldier || g.charBases.rpm;
    const n = f.pl.door.nrm, side = new THREE.Vector3(-n.z, 0, n.x);
    for (let k = 0; k < 3; k++) {
      const ch = new Character(base, { tint: null, height: 1.8 });
      const p = f.pl.door.p.clone().addScaledVector(n, 6).addScaledVector(side, (k - 1) * 3); p.y = 0.15;
      ch.obj.position.copy(p); ch.obj.rotation.y = Math.atan2(-n.x, -n.z); ch.play('idle', 0); ch.overlay('aimR'); g.R.scene.add(ch.obj);
      const nozzle = p.clone().add(new THREE.Vector3(0, 1.3, 0)).addScaledVector(n, -0.6);
      const target = new THREE.Vector3(f.cx + (k - 1) * 4, f.H * 0.6, f.cz); const dir = target.clone().sub(nozzle).normalize();
      const drops = [];
      for (let j = 0; j < 40; j++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 3), new THREE.MeshBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.7 })); d.position.copy(nozzle); d.userData = { v: dir.clone().multiplyScalar(14), t: Math.random() * 1.2 }; g.R.scene.add(d); drops.push(d); }
      f.crew.push({ ch, nozzle, dir, drops, t: 0 });
    }
  }
  endFire(f) {
    const g = this.g; g.R.scene.remove(f.grp);
    for (const c of f.crew) { g.R.scene.remove(c.ch.obj); for (const d of c.drops) g.R.scene.remove(d); }
    if (f.truck) g.traffic.remove(f.truck.ai);
    this.fires.splice(this.fires.indexOf(f), 1);
  }

  update(dt) {
    const g = this.g;
    if (g.time > this.nextCrime) { this.nextCrime = g.time + 150 + Math.random() * 180; if (!g.net || !g.net.connected || g.net.host) this.startCarTheft(); }
    if (g.time > this.nextIncident) { this.nextIncident = g.time + 120 + Math.random() * 150; if (!g.net || !g.net.connected || g.net.host) this.incident(); }
    if (g.time > this.nextFire) { this.nextFire = g.time + 300 + Math.random() * 300; if (!g.net || !g.net.connected || g.net.host) this.startFire(); }
    this.updateThieves(dt); this.updateIncidents(dt); this.updateSkids(); this.updateBirds(dt); this.updateFires(dt);
  }
}

function flameTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 96, 2, 32, 80, 60); gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.25, 'rgba(255,200,80,.95)'); gr.addColorStop(0.55, 'rgba(255,90,20,.7)'); gr.addColorStop(1, 'rgba(120,20,0,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(32, 4); g.quadraticCurveTo(62, 70, 50, 120); g.lineTo(14, 120); g.quadraticCurveTo(2, 70, 32, 4); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function smokeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
