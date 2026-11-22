// Multijoueur pair-à-pair (PeerJS) : un joueur héberge un salon (code à 4 lettres), les autres le rejoignent.
// Synchronise les joueurs (position, animation, voiture conduite, niveau de recherche) et un chat.
// Limite : chaque joueur simule sa propre population (même génération déterministe, mais les PNJ ne sont pas synchronisés).
import * as THREE from 'three';
import { Character } from './chars.js';
import { makeCar, poseCar, loadCarTemplate } from './cars.js';

const PREFIX = 'livingworld-lumen-';
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] };

export class Net {
  constructor(game) { this.g = game; this.peer = null; this.conns = []; this.remotes = {}; this.code = null; this.host = false; this.sendT = 0; this.chat = []; }
  get active() { return !!this.peer; }

  async lib() {
    if (window.Peer) return;
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }
  async hostRoom() {
    await this.lib();
    this.code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
    this.host = true;
    this.peer = new window.Peer(PREFIX + this.code, { debug: 0, config: ICE });
    this.peer.on('open', () => this.g.life.notify('Salon créé : code ' + this.code, 'ok'));
    this.peer.on('connection', c => this.attach(c));
    this.peer.on('error', e => { if (e.type === 'unavailable-id') { this.peer.destroy(); this.peer = null; this.hostRoom(); } else this.g.life.notify('Réseau : ' + e.type, 'warn'); });
    return this.code;
  }
  async join(code) {
    await this.lib();
    this.code = code.toUpperCase().trim(); this.host = false;
    this.peer = new window.Peer({ debug: 0, config: ICE });
    this.peer.on('open', () => { const c = this.peer.connect(PREFIX + this.code, { reliable: true }); this.attach(c); });
    this.peer.on('error', e => this.g.life.notify('Connexion impossible : ' + e.type, 'warn'));
  }
  attach(c) {
    c.on('open', () => { this.conns.push(c); this.g.life.notify('Joueur connecté', 'ok'); c.send({ t: 'hello', hour: this.g.hour, day: this.g.day, host: this.host }); });
    c.on('data', m => this.onData(m, c));
    c.on('close', () => { this.conns = this.conns.filter(x => x !== c); for (const id in this.remotes) if (this.remotes[id].conn === c) this.drop(id); });
  }
  broadcast(m, except) { for (const c of this.conns) if (c !== except && c.open) c.send(m); }
  onData(m, c) {
    if (!m || !m.t) return;
    if (this.host) this.broadcast(m, c); // relais
    if (m.t === 'hello' && m.host) { this.g.hour = m.hour; this.g.day = m.day; }
    else if (m.t === 's') this.applyState(m, c);
    else if (m.t === 'chat') { this.pushChat(m.name + ' : ' + m.text); }
    else if (m.t === 'bye') this.drop(m.id);
  }
  pushChat(line) { this.chat.push(line); if (this.chat.length > 30) this.chat.shift(); this.g.life.notify('💬 ' + line); }
  say(text) { const m = { t: 'chat', name: this.g.profile.first, text }; this.broadcast(m); this.pushChat('Moi : ' + text); }

  async applyState(m, c) {
    let r = this.remotes[m.id];
    if (!r) {
      r = this.remotes[m.id] = { id: m.id, conn: c, pos: new THREE.Vector3(m.x, m.y, m.z), yaw: m.yaw, name: m.name, model: m.model, char: null, car: null, carId: null };
      const base = this.g.charBases[m.model] || this.g.charBases.rpm;
      r.char = new Character(base, { tint: m.tint ? Object.fromEntries(Object.entries(m.tint).map(([k, v]) => [k, new THREE.Color(v).multiplyScalar(1.6)])) : null });
      this.g.R.scene.add(r.char.obj);
      r.tag = document.createElement('div'); r.tag.className = 'nametag'; r.tag.textContent = m.name; document.body.appendChild(r.tag);
    }
    r.target = new THREE.Vector3(m.x, m.y, m.z); r.tyaw = m.yaw; r.anim = m.anim; r.wanted = m.w;
    if (m.car) {
      if (r.carId !== m.car.id + m.car.paint) {
        if (r.car) this.g.R.scene.remove(r.car.obj);
        const tpl = await loadCarTemplate(m.car.id); r.car = makeCar(tpl, m.car.paint); this.g.R.scene.add(r.car.obj); r.carId = m.car.id + m.car.paint;
      }
      r.carState = m.car;
    } else if (r.car) { this.g.R.scene.remove(r.car.obj); r.car = null; r.carId = null; r.carState = null; }
  }
  drop(id) { const r = this.remotes[id]; if (!r) return; this.g.R.scene.remove(r.char.obj); if (r.car) this.g.R.scene.remove(r.car.obj); r.tag.remove(); delete this.remotes[id]; }

  update(dt) {
    if (!this.peer) return;
    const g = this.g;
    this.sendT += dt;
    if (this.sendT > 0.08 && this.conns.length) {
      this.sendT = 0;
      const pl = g.player, v = g.veh;
      const m = { t: 's', id: this.peer.id, name: g.profile.first, model: g.profile.model, tint: g.profile.model === 'rpm' ? { Outfit_Top: g.profile.top, Outfit_Bottom: g.profile.bottom } : null,
        x: pl.char.obj.position.x, y: pl.char.obj.position.y, z: pl.char.obj.position.z, yaw: pl.char.obj.rotation.y, anim: pl.char.cur ? pl.char.cur.getClip().name : 'idle', w: g.police.wanted };
      if (v) m.car = { id: v.car.tpl.spec.id, paint: v.car.paint ? '#' + v.car.paint.color.getHexString() : '#ffffff', x: v.pos.x, z: v.pos.z, h: v.heading, st: v.steer, sp: v.spin };
      this.broadcast(m);
    }
    const cam = g.R.camera;
    for (const id in this.remotes) {
      const r = this.remotes[id];
      if (r.target) { r.pos.lerp(r.target, Math.min(1, dt * 10)); let d = r.tyaw - r.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); r.yaw += d * Math.min(1, dt * 10); }
      r.char.obj.position.copy(r.pos); r.char.obj.rotation.y = r.yaw;
      if (r.anim) r.char.play(r.anim, 0.25);
      r.char.update(dt, r.pos.distanceTo(cam.position));
      if (r.car && r.carState) {
        const s = r.carState; const o = r.car.obj;
        o.position.lerp(new THREE.Vector3(s.x, 0, s.z), Math.min(1, dt * 10)); o.rotation.y = s.h;
        poseCar(r.car, { spin: s.sp, steer: s.st, head: g.sky.night > 0.45 ? 1 : 0 });
      }
      // étiquette de nom
      const p = r.pos.clone().add(new THREE.Vector3(0, 2.1, 0)).project(cam);
      const vis = p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1 && r.pos.distanceTo(cam.position) < 120;
      r.tag.style.display = vis ? 'block' : 'none';
      if (vis) { r.tag.style.left = ((p.x + 1) / 2 * innerWidth) + 'px'; r.tag.style.top = ((1 - p.y) / 2 * innerHeight) + 'px'; r.tag.textContent = r.name + (r.wanted ? ' ' + '★'.repeat(r.wanted) : ''); }
    }
  }
}
