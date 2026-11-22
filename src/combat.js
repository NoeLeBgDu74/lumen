// Armes (achetées à l'armurerie) : poings, batte, pistolet, pistolet-mitrailleur. Tir au centre de l'écran,
// impacts sur les passants/habitants (chute), véhicules, police ; réactions de fuite ; santé du joueur, hôpital.
import * as THREE from 'three';

export const WEAPONS = {
  fists: { name: 'Poings', key: 'Digit1', price: 0, range: 1.6, dmg: 1, rate: 0.6, melee: true },
  bat: { name: 'Batte de baseball', key: 'Digit2', price: 60, range: 2.0, dmg: 2, rate: 0.8, melee: true },
  pistol: { name: 'Pistolet', key: 'Digit3', price: 650, range: 60, dmg: 2, rate: 0.35, ammoPrice: 45, clip: 12 },
  smg: { name: 'Pistolet-mitrailleur', key: 'Digit4', price: 2400, range: 55, dmg: 1, rate: 0.09, ammoPrice: 90, clip: 30 },
};
const $ = (id) => document.getElementById(id);

export class Combat {
  constructor(game) {
    this.g = game; this.cur = 'fists'; this.cool = 0; this.health = 100; this.shooting = false;
    const s = game.life.s; s.weapons = s.weapons || { fists: true }; s.ammo = s.ammo || { pistol: 0, smg: 0 };
    addEventListener('mousedown', (e) => { if (e.button === 0 && game.input.locked && game.input.enabled) this.shooting = true; });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.shooting = false; });
    this.flash = new THREE.PointLight(0xffc070, 0, 8); game.R.scene.add(this.flash);
    this.gun = this.makeGun(); this.attached = null;
    this.tracer = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0 }));
    this.tracer.frustumCulled = false; game.R.scene.add(this.tracer);
  }
  makeGun() {
    const g = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ color: 0x1a1b1d, metalness: 0.8, roughness: 0.35 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.19), m); body.position.z = 0.05; g.add(body);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.045), new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.7 })); grip.position.set(0, -0.06, -0.01); grip.rotation.x = 0.25; g.add(grip);
    const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.018, 0.85, 12), new THREE.MeshStandardMaterial({ color: 0x9a6a3a, roughness: 0.6 })); bat.rotation.x = Math.PI / 2; bat.position.z = 0.38; bat.name = 'bat'; g.add(bat);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  attach() {
    const ch = this.g.player.char; if (!ch) return;
    let hand = null; ch.model.traverse(o => { if (o.isBone && /RightHand$/.test(o.name)) hand = o; });
    if (!hand) return;
    if (this.attached !== hand) { hand.add(this.gun); this.attached = hand; const s = 1 / hand.getWorldScale(new THREE.Vector3()).x; this.gun.scale.setScalar(s); this.gun.position.set(0, 0.08 * s, 0.03 * s); this.gun.rotation.set(-Math.PI / 2, 0, 0); }
  }
  select(w) {
    const s = this.g.life.s; if (!s.weapons[w]) { this.g.life.notify('Arme non possédée (armurerie)', 'warn'); return; }
    this.cur = w; this.g.life.notify('Arme : ' + WEAPONS[w].name);
  }
  update(dt) {
    const g = this.g, inp = g.input; this.cool -= dt;
    for (const [k, w] of Object.entries(WEAPONS)) if (inp.pressed(w.key)) this.select(k);
    this.attach();
    const W = WEAPONS[this.cur];
    this.gun.visible = this.cur !== 'fists' && !g.veh && g.player.mode === 'foot';
    this.gun.getObjectByName('bat').visible = this.cur === 'bat';
    this.gun.children[0].visible = this.gun.children[1].visible = this.cur === 'pistol' || this.cur === 'smg';
    $('crosshair').hidden = !(this.cur === 'pistol' || this.cur === 'smg') || !!g.veh;
    const ammo = g.life.s.ammo[this.cur];
    $('weapon').textContent = W.name + (ammo !== undefined ? ' · ' + ammo : '') + ' · ❤ ' + Math.round(this.health);
    if (this.shooting && this.cool <= 0 && !g.veh && g.player.mode === 'foot') this.fire();
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 120);
    this.tracer.material.opacity = Math.max(0, this.tracer.material.opacity - dt * 6);
    // santé : régénération lente
    if (this.health < 100) this.health = Math.min(100, this.health + dt * 0.8);
    if (this.health <= 0) this.ko();
  }
  fire() {
    const g = this.g, W = WEAPONS[this.cur], s = g.life.s; this.cool = W.rate;
    const P = g.player; P.yaw = g.player.camYaw + Math.PI; P.char.obj.rotation.y = P.yaw;
    if (W.melee) {
      P.char.play('talk', 0.05);
      const fw = new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw));
      const hit = this.targets().find(t => t.pos.distanceTo(P.pos) < W.range + 0.4 && t.pos.clone().sub(P.pos).setY(0).normalize().dot(fw) > 0.4);
      if (hit) { hit.hit(fw, W.dmg); g.police.addWanted(1, 'agression'); }
      return;
    }
    if (!s.ammo[this.cur]) { g.life.notify('Plus de munitions', 'warn'); this.shooting = false; return; }
    s.ammo[this.cur]--;
    if (this.cur === 'pistol') this.shooting = false; // semi-auto
    const cam = g.R.camera;
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((Math.random() - 0.5) * 0.01, (Math.random() - 0.5) * 0.01), cam); ray.far = W.range;
    const from = P.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
    let best = null, bd = W.range;
    for (const t of this.targets()) {
      const c = t.pos.clone().add(new THREE.Vector3(0, t.h || 1.0, 0));
      const d = ray.ray.distanceToPoint(c); const along = c.clone().sub(ray.ray.origin).dot(ray.ray.direction);
      if (along > 0 && d < (t.r || 0.45) && along < bd) { bd = along; best = t; }
    }
    // obstacle : bâtiment devant ?
    const end = ray.ray.origin.clone().addScaledVector(ray.ray.direction, best ? bd : W.range);
    const free = g.world.segmentFree(from.x, from.y, from.z, end.x, end.y, end.z);
    if (free < 0.98) best = null;
    if (best) best.hit(ray.ray.direction.clone(), W.dmg);
    this.flash.position.copy(from).addScaledVector(ray.ray.direction, 0.8); this.flash.intensity = 30;
    this.tracer.geometry.setFromPoints([from.clone().addScaledVector(ray.ray.direction, 0.8), end]); this.tracer.material.opacity = 0.8;
    this.bang();
    g.police.addWanted(best ? 3 : 2, 'coups de feu');
    // panique : les passants s'enfuient
    for (const p of g.peds.list) if (p.state === 'walk' && p.pos.distanceTo(P.pos) < 40) { p.state = 'flee'; p.t = 0; p.fall = p.pos.clone().sub(P.pos).setY(0).normalize(); }
  }
  targets() {
    const g = this.g, out = [];
    for (const p of g.peds.list) if (p.state !== 'down') out.push({ pos: p.pos, hit: (dir) => { g.peds.knock(p, dir); } });
    for (const p of g.pop.people) if (p.char && !p.hurt) out.push({ pos: p.pos, hit: (dir) => {
      p.hurt = true; p.knockT = g.time; p.knockDir = dir.clone().setY(0).normalize(); p.resume = 'walk'; p.state = 'talk'; p.talkUntil = g.time + 7;
      setTimeout(() => { p.hurt = false; }, 7000); g.pop.remember(p, `s'est fait agresser par ${g.profile.first}`); p.playerOpinion = -1;
    } });
    for (const u of g.police.units) out.push({ pos: u.ai.pos, h: 0.9, r: 1.3, hit: () => { u.hp = (u.hp || 6) - 1; if (u.hp <= 0) { g.police.removeUnit(u); g.police.addWanted(1, 'policier neutralisé'); } } });
    for (const ai of g.traffic.cars) if (ai.state === 'drive' && ai.pos.distanceTo(g.player.pos) < 60) out.push({ pos: ai.pos, h: 0.8, r: 1.2, hit: () => { ai.v = 0; ai.aggr = 0.01; setTimeout(() => ai.aggr = 1, 8000); } });
    return out;
  }
  damage(n, why) { this.health -= n; if (why && !this._dw) { this._dw = true; setTimeout(() => this._dw = false, 2000); this.g.life.notify('❤ −' + Math.round(n) + ' (' + why + ')', 'warn'); } }
  ko() {
    const g = this.g, L = g.life; this.health = 100;
    const bill = Math.round(Math.min(L.s.money, 300 + L.s.money * 0.1)); L.s.money -= bill;
    g.police.wanted = 0; g.police.renderStars();
    if (g.veh) g.forceExit();
    L.notify(`K.O. — transporté·e à l’hôpital (frais : ${bill} €)`, 'warn');
    L.skip(4, () => { const ph = g.places && (window.__lwHospital || null); const d = ph || g.home.door.p; g.player.place(d.x + 1.5, d.z + 1.5, 0); });
  }
  bang() {
    try {
      const ctx = this.ac || (this.ac = new (window.AudioContext || window.webkitAudioContext)());
      const len = 0.25 * ctx.sampleRate, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
      const src = ctx.createBufferSource(); src.buffer = b; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = this.cur === 'smg' ? 2600 : 1800;
      const gn = ctx.createGain(); gn.gain.value = 0.35; src.connect(f); f.connect(gn); gn.connect(ctx.destination); src.start();
    } catch (e) {}
  }
}
