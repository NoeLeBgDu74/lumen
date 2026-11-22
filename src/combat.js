// Armes réelles (modèles Poly Haven CC0) : couteau, batte, pistolet de service, fusil à verrou.
// Tenues en main (placement monde à partir de l'os de la main), pose de visée, tir depuis le canon vers le viseur,
// recul, rechargement, éclair de bouche, douilles, impacts ; réactions (chute, fuite) ; santé et hôpital.
import * as THREE from 'three';
import { glb } from './assets.js';

export const WEAPONS = {
  fists:  { name: 'Poings', key: 'Digit1', price: 0, range: 1.6, rate: 0.55, melee: true },
  knife:  { name: 'Couteau', key: 'Digit2', price: 45, range: 1.8, rate: 0.5, melee: true, model: 'fish_knife', axis: 'y', grip: [0.005, -0.075, 0], len: 0.21 },
  bat:    { name: 'Batte de baseball', key: 'Digit3', price: 60, range: 2.1, rate: 0.75, melee: true, model: 'baseball_bat', axis: 'y', grip: [0, -0.2, 0], len: 0.91 },
  pistol: { name: 'Pistolet de service', key: 'Digit4', price: 650, range: 70, rate: 0.28, clip: 15, reload: 1.4, ammoPrice: 45, model: 'service_pistol', axis: 'x', grip: [-0.06, 0.03, 0], muzzle: [0.175, 0.17, 0], aim: 'aimP', semi: true, spread: 0.006 },
  rifle:  { name: 'Fusil à verrou', key: 'Digit5', price: 1900, range: 160, rate: 1.15, clip: 5, reload: 2.6, ammoPrice: 70, model: 'bolt_action_rifle_7_62', axis: 'x', grip: [-0.21, -0.02, 0], muzzle: [0.6, 0.03, 0], aim: 'aimR', semi: true, spread: 0.001, zoom: 34 },
};
const $ = (id) => document.getElementById(id);
const UP = new THREE.Vector3(0, 1, 0);

export class Combat {
  constructor(game) {
    this.g = game; this.cur = 'fists'; this.cool = 0; this.health = 100; this.shooting = false; this.aiming = false; this.reloadT = 0;
    const s = game.life.s; s.weapons = s.weapons || { fists: true }; s.ammo = s.ammo || {}; s.clip = s.clip || {};
    if (s.weapons.smg) { delete s.weapons.smg; s.weapons.rifle = true; } // ancienne sauvegarde
    addEventListener('mousedown', (e) => {
      if (!game.input.enabled) return;
      if (e.button === 0 && game.input.locked) this.shooting = true;
      if (e.button === 2) this.aiming = true;
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.shooting = false; if (e.button === 2) this.aiming = false; });
    addEventListener('contextmenu', (e) => e.preventDefault());
    this.flash = new THREE.PointLight(0xffc070, 0, 9); game.R.scene.add(this.flash);
    const fm = new THREE.SpriteMaterial({ color: 0xffd28a, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, map: flashTex() });
    this.flashSprite = new THREE.Sprite(fm); this.flashSprite.scale.setScalar(0.35); game.R.scene.add(this.flashSprite);
    this.tracer = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: 0 }));
    this.tracer.frustumCulled = false; game.R.scene.add(this.tracer);
    this.models = {}; this.held = null;
    this.shells = []; this.decals = [];
    this.loadModels();
  }
  async loadModels() {
    for (const [k, w] of Object.entries(WEAPONS)) {
      if (!w.model) continue;
      try {
        const g = await glb('assets/props/' + w.model + '.glb');
        const holder = new THREE.Group(); const m = g.scene.clone(true);
        m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.material.envMapIntensity = 1.2; } });
        m.position.set(-w.grip[0], -w.grip[1], -w.grip[2]); holder.add(m);
        holder.visible = false; this.g.R.scene.add(holder); this.models[k] = holder;
      } catch (e) { console.warn('arme', k, e); }
    }
  }
  select(w) {
    const s = this.g.life.s; if (!s.weapons[w]) { this.g.life.notify('Arme non possédée (armurerie)', 'warn'); return; }
    this.cur = w; this.reloadT = 0; this.g.life.notify('Arme : ' + WEAPONS[w].name);
  }
  get armedGun() { return !!WEAPONS[this.cur].aim; }

  update(dt) {
    const g = this.g, inp = g.input, P = g.player; this.cool -= dt;
    for (const [k, w] of Object.entries(WEAPONS)) if (inp.pressed(w.key)) this.select(k);
    if (inp.pressed('KeyR') && this.armedGun) this.reload();
    const W = WEAPONS[this.cur], s = g.life.s;
    const onFoot = !g.veh && P.mode === 'foot' && !g.seq;
    // pose et orientation
    const ch = P.char;
    const aimPose = onFoot && this.armedGun;
    if (ch) ch.overlay(aimPose && this.reloadT <= 0 ? W.aim : null);
    P.aimLock = aimPose && (this.aiming || this.shooting || inp.locked);
    // zoom de visée
    const cam = g.R.camera, fov = aimPose && this.aiming ? (W.zoom || 48) : 62;
    if (Math.abs(cam.fov - fov) > 0.1) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 10); cam.updateProjectionMatrix(); }
    P.aimShoulder = aimPose && this.aiming;
    this.placeModel(onFoot);
    $('crosshair').hidden = !aimPose;
    $('crosshair').classList.toggle('small', this.aiming);
    const clip = s.clip[this.cur], ammo = s.ammo[this.cur];
    $('weapon').innerHTML = `<b>${W.name}</b>${W.clip ? ` · ${clip || 0}/${W.clip} <span>(${ammo || 0})</span>` : ''}${this.reloadT > 0 ? ' · rechargement…' : ''}<br>❤ ${Math.round(this.health)}`;
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.finishReload(); }
    if (this.shooting && this.cool <= 0 && onFoot && this.reloadT <= 0) this.fire();
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 160);
    this.flashSprite.material.opacity = Math.max(0, this.flashSprite.material.opacity - dt * 25);
    this.tracer.material.opacity = Math.max(0, this.tracer.material.opacity - dt * 7);
    this.recoil = Math.max(0, (this.recoil || 0) - dt * 6);
    // douilles
    for (const sh of [...this.shells]) { sh.v.y -= 9.8 * dt; sh.m.position.addScaledVector(sh.v, dt); sh.m.rotation.x += dt * 20; if (sh.m.position.y < 0.17) { sh.v.set(0, 0, 0); sh.m.position.y = 0.17; } sh.t += dt; if (sh.t > 6) { g.R.scene.remove(sh.m); this.shells.splice(this.shells.indexOf(sh), 1); } }
    if (this.health < 100) this.health = Math.min(100, this.health + dt * 0.8);
    if (this.health <= 0) this.ko();
  }

  // Position monde de l'arme : dans la main droite ; canon aligné sur la visée (armes à feu), lame dans l'axe de l'avant-bras (mêlée).
  placeModel(onFoot) {
    for (const k in this.models) this.models[k].visible = false;
    const W = WEAPONS[this.cur], m = this.models[this.cur]; const ch = this.g.player.char;
    if (!m || !onFoot || !ch) return;
    const hand = this.hand || (ch.model.traverse(o => { if (o.isBone && /RightHand$/.test(o.name)) this.hand = o; }), this.hand);
    const fore = this.fore || (ch.model.traverse(o => { if (o.isBone && /RightForeArm$/.test(o.name)) this.fore = o; }), this.fore);
    if (!hand || this.handOwner !== ch) { this.hand = null; this.fore = null; this.handOwner = ch; return; }
    ch.obj.updateMatrixWorld(true);
    const hp = hand.getWorldPosition(new THREE.Vector3()), fp = fore.getWorldPosition(new THREE.Vector3());
    const q = new THREE.Quaternion();
    if (W.axis === 'x') {
      const d = this.aimDir(); const right = new THREE.Vector3().crossVectors(d, UP).normalize(); const up = new THREE.Vector3().crossVectors(right, d).normalize();
      q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(d, up, right.clone().negate()));
      if (this.recoil) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.recoil * 0.35));
    } else {
      const d = hp.clone().sub(fp).normalize();
      const dir = d.clone().lerp(UP, 0.35).normalize(); // lame/batte tenue un peu relevée
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    }
    m.quaternion.copy(q); m.position.copy(hp); m.visible = true;
  }
  aimDir() { const cam = this.g.R.camera; const d = new THREE.Vector3(); cam.getWorldDirection(d); return d; }

  reload() {
    const W = WEAPONS[this.cur], s = this.g.life.s; if (!W.clip || this.reloadT > 0) return;
    if ((s.clip[this.cur] || 0) >= W.clip) return;
    if (!s.ammo[this.cur]) { this.g.life.notify('Plus de munitions (armurerie)', 'warn'); return; }
    this.reloadT = W.reload; this.g.player.char.play('talk', 0.1); this.click(0.6);
  }
  finishReload() {
    const W = WEAPONS[this.cur], s = this.g.life.s;
    const need = W.clip - (s.clip[this.cur] || 0), take = Math.min(need, s.ammo[this.cur] || 0);
    s.clip[this.cur] = (s.clip[this.cur] || 0) + take; s.ammo[this.cur] -= take; this.click(1);
  }

  fire() {
    const g = this.g, W = WEAPONS[this.cur], s = g.life.s, P = g.player; this.cool = W.rate;
    P.yaw = P.camYaw + Math.PI; P.char.obj.rotation.y = P.yaw;
    if (W.melee) {
      this.shooting = false;
      P.char.play('talk', 0.05); this.swing();
      const fw = new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw));
      const hit = this.targets().find(t => t.pos.distanceTo(P.pos) < W.range + 0.5 && t.pos.clone().sub(P.pos).setY(0).normalize().dot(fw) > 0.35);
      if (hit) { hit.hit(fw); this.thud(); g.police.addWanted(this.cur === 'fists' ? 1 : 2, 'agression'); }
      return;
    }
    if (!s.clip[this.cur]) { this.click(0.3); this.shooting = false; this.reload(); return; }
    s.clip[this.cur]--;
    if (W.semi) this.shooting = false;
    // origine : bouche du canon ; direction : point visé par le centre de l'écran
    const m = this.models[this.cur];
    const muzzle = m ? m.localToWorld(new THREE.Vector3(W.muzzle[0] - W.grip[0], W.muzzle[1] - W.grip[1], 0)) : P.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
    const cam = g.R.camera; const ray = new THREE.Raycaster();
    const sk = 1.5 - Math.min(1, (s.skills ? s.skills.tir : 0) / 100); if (s.skills) s.skills.tir = Math.min(100, s.skills.tir + 0.3);
    ray.setFromCamera(new THREE.Vector2((Math.random() - 0.5) * W.spread * sk * (this.aiming ? 0.4 : 1) * 2, (Math.random() - 0.5) * W.spread * sk * 2), cam);
    let best = null, bd = W.range;
    for (const t of this.targets()) {
      const c = t.pos.clone().add(new THREE.Vector3(0, t.h || 1.0, 0));
      const d = ray.ray.distanceToPoint(c), along = c.clone().sub(ray.ray.origin).dot(ray.ray.direction);
      if (along > 1 && d < (t.r || 0.42) && along < bd) { bd = along; best = t; }
    }
    let end = ray.ray.origin.clone().addScaledVector(ray.ray.direction, best ? bd : W.range);
    const free = g.world.segmentFree(muzzle.x, muzzle.y, muzzle.z, end.x, end.y, end.z);
    if (free < 0.99) { best = null; end = muzzle.clone().lerp(end, free); this.impact(end); }
    else if (!best && end.y < 0.2) this.impact(end);
    if (best) best.hit(ray.ray.direction.clone());
    // effets
    this.flash.position.copy(muzzle); this.flash.intensity = 40;
    this.flashSprite.position.copy(muzzle); this.flashSprite.material.opacity = 1; this.flashSprite.material.rotation = Math.random() * 6;
    this.tracer.geometry.setFromPoints([muzzle, end]); this.tracer.material.opacity = 0.7;
    this.recoil = this.cur === 'rifle' ? 1 : 0.6;
    P.camPitch = Math.min(1.1, P.camPitch - (this.cur === 'rifle' ? 0.035 : 0.015));
    this.shell(muzzle);
    this.bang();
    g.police.addWanted(best ? 3 : 2, 'coups de feu');
    let sc = 0; for (const p of g.peds.list) if (p.state === 'walk' && p.pos.distanceTo(P.pos) < 50) { p.state = 'flee'; p.t = 0; p.fall = p.pos.clone().sub(P.pos).setY(0).normalize(); if (sc++ < 2 && g.audio) setTimeout(() => g.audio.scream(p.female, 0.1), 200 + Math.random() * 600); }
    for (const p of g.pop.people) if (p.char && p.pos.distanceTo(P.pos) < 40 && !p.hurt) { p.panicUntil = g.time + 10; }
  }
  impact(p) {
    const g = this.g;
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.05, 8), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    d.position.copy(p); d.lookAt(g.R.camera.position); g.R.scene.add(d); this.decals.push(d);
    if (this.decals.length > 40) g.R.scene.remove(this.decals.shift());
    // poussière
    for (let k = 0; k < 6; k++) { const sp = new THREE.Mesh(new THREE.SphereGeometry(0.02, 4, 3), new THREE.MeshBasicMaterial({ color: 0x9a948a })); sp.position.copy(p); g.R.scene.add(sp); this.shells.push({ m: sp, v: new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3), t: 5.4 }); }
  }
  shell(muzzle) {
    const g = this.g; const m = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.022, 6), new THREE.MeshStandardMaterial({ color: 0xc9a13a, metalness: 1, roughness: 0.3 }));
    m.position.copy(muzzle); g.R.scene.add(m);
    const right = new THREE.Vector3().crossVectors(this.aimDir(), UP).normalize();
    this.shells.push({ m, v: right.multiplyScalar(2 + Math.random()).add(new THREE.Vector3(0, 2.5, 0)), t: 0 });
  }
  targets() {
    const g = this.g, out = [];
    for (const p of g.peds.list) if (p.state !== 'down') out.push({ pos: p.pos, hit: (dir) => { g.peds.knock(p, dir, 30); } });
    for (const p of g.pop.people) if (p.char && !p.hurt) out.push({ pos: p.pos, hit: (dir) => {
      p.hurt = true; p.knockT = g.time; p.knockDir = dir.clone().setY(0).normalize(); p.resume = 'walk'; p.state = 'talk'; p.talkUntil = g.time + 7;
      setTimeout(() => { p.hurt = false; }, 7000); g.pop.remember(p, `s'est fait agresser par ${g.profile.first}`); p.playerOpinion = -1;
    } });
    for (const u of g.police.units) out.push({ pos: u.ai.pos, h: 0.9, r: 1.3, hit: () => { u.hp = (u.hp || 6) - (this.cur === 'rifle' ? 3 : 1); if (u.hp <= 0) { g.police.removeUnit(u); g.police.addWanted(1, 'policier neutralisé', true); } } });
    for (const ai of g.traffic.cars) if ((ai.state === 'drive' || ai.state === 'thief') && ai.pos.distanceTo(g.player.pos) < 80) out.push({ pos: ai.pos, h: 0.8, r: 1.2, hit: () => { ai.v *= 0.3; ai.shotT = g.time; } });
    if (g.npcCrime) for (const c of g.npcCrime.targets()) out.push(c);
    return out;
  }
  damage(n, why) { if (this.g.admin && this.g.admin.god) return; this.health -= n; if (why && !this._dw) { this._dw = true; setTimeout(() => this._dw = false, 2000); this.g.life.notify('❤ −' + Math.max(1, Math.round(n)) + ' (' + why + ')', 'warn'); } }
  ko() {
    const g = this.g, L = g.life; this.health = 100;
    const bill = Math.round(Math.min(L.s.money, 300 + L.s.money * 0.1)); L.s.money -= bill;
    g.police.wanted = 0; g.police.renderStars();
    if (g.veh) g.forceExit();
    L.notify(`K.O. — transporté·e à l’hôpital (frais : ${bill} €)`, 'warn');
    L.skip(4, () => { const d = window.__lwHospital || g.home.door.p; g.player.place(d.x + 1.5, d.z + 1.5, 0); });
  }
  // sons (Web Audio)
  ctx() { return this.ac || (this.ac = new (window.AudioContext || window.webkitAudioContext)()); }
  noise(dur, freq, gain, decay = 4) {
    try {
      const ctx = this.ctx(), len = dur * ctx.sampleRate, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      const src = ctx.createBufferSource(); src.buffer = b; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
      const gn = ctx.createGain(); gn.gain.value = gain; src.connect(f); f.connect(gn); gn.connect(ctx.destination); src.start();
    } catch (e) {}
  }
  bang() { this.noise(this.cur === 'rifle' ? 0.6 : 0.3, this.cur === 'rifle' ? 1400 : 2200, this.cur === 'rifle' ? 0.5 : 0.35, this.cur === 'rifle' ? 3 : 5); }
  click(g = 0.5) { this.noise(0.04, 5000, 0.12 * g, 8); }
  swing() { this.noise(0.18, 900, 0.06, 2); }
  thud() { this.noise(0.12, 400, 0.4, 6); }
}

function flashTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.3, 'rgba(255,190,90,.9)'); gr.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = gr; g.beginPath(); for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283, r = i % 2 ? 12 : 32; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
