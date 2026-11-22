// Multijoueur — UN SEUL MONDE PUBLIC : chaque joueur rejoint automatiquement la même partie (sans code).
// Topologie en étoile (PeerJS) : le premier arrivé devient l'hôte et relaie ; s'il part, un autre joueur reprend le rôle.
// Synchronisés : joueurs (position, animation, voiture), heure du monde, cycle des feux, chat, radio CB au micro (touche V).
// Limite : chaque joueur simule les habitants localement (même génération et même horloge, mais pas leurs positions exactes).
import * as THREE from 'three';
import { Character } from './chars.js';
import { makeCar, poseCar, loadCarTemplate } from './cars.js';

const NET_VERSION = 3; // à incrémenter quand le protocole change : les versions ne se mélangent pas
const WORLD_ID = 'livingworld-lumen-monde-public-v' + NET_VERSION;
const MAX = 16;
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }, { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' }] };
const $ = (id) => document.getElementById(id);

export class Net {
  constructor(game) {
    this.g = game; this.peer = null; this.host = false; this.conn = null; this.conns = new Map(); this.remotes = {}; this.chat = [];
    this.sendT = 0; this.connected = false; this.pms = []; this.phoneCall = null; this.myId = null; this.stream = null; this.calls = new Map(); this.enabled = true;
    try { this.enabled = localStorage.getItem('lw.online') !== '0'; } catch (e) {}
  }
  get active() { return !!this.peer; }
  get count() { return Object.keys(this.remotes).length + 1; }

  async lib() {
    if (window.Peer) return true;
    try { await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); return true; }
    catch (e) { this.status('Mode en ligne indisponible'); return false; }
  }
  setEnabled(on) { this.enabled = on; try { localStorage.setItem('lw.online', on ? '1' : '0'); } catch (e) {} if (on) this.start(); else this.stop(); }

  // Rejoindre le monde ; s'il n'existe pas encore, on le crée.
  async start() {
    if (!this.enabled || this.peer) return;
    if (!(await this.lib())) return;
    this.status('Connexion au monde public…');
    this.tryJoin();
  }
  stop() {
    for (const id in this.remotes) this.drop(id);
    try { this.peer && this.peer.destroy(); } catch (e) {}
    this.peer = null; this.conn = null; this.conns.clear(); this.host = false; this.connected = false; this.status(null);
  }
  tryJoin() {
    const peer = this.peer = new window.Peer({ debug: 0, config: ICE });
    peer.on('open', (id) => {
      this.myId = id;
      const c = peer.connect(WORLD_ID, { reliable: true });
      const timer = setTimeout(() => { if (!this.connected) { try { peer.destroy(); } catch (e) {} this.peer = null; this.becomeHost(); } }, 6000);
      c.on('open', () => { clearTimeout(timer); this.conn = c; this.connected = true; this.host = false; c.send(this.hello()); this.status(); this.g.life.notify('Connecté·e au monde public', 'ok'); });
      c.on('data', (m) => this.onData(m, c));
      c.on('close', () => this.hostLost());
    });
    peer.on('call', (call) => this.onCall(call));
    peer.on('error', (e) => {
      if (e.type === 'peer-unavailable') { try { peer.destroy(); } catch (x) {} this.peer = null; this.becomeHost(); }
      else if (!this.connected) this.retry(e.type);
    });
  }
  becomeHost() {
    const peer = this.peer = new window.Peer(WORLD_ID, { debug: 0, config: ICE });
    peer.on('open', (id) => { this.myId = id; this.host = true; this.connected = true; this.status(); });
    peer.on('connection', (c) => {
      c.on('open', () => {
        if (this.conns.size >= MAX - 1) { try { c.send({ t: 'full' }); } catch (e) {} setTimeout(() => c.close(), 300); return; }
        this.conns.set(c.peer, c);
        const roster = [this.hello(), ...Object.values(this.remotes).map(r => r.hello).filter(Boolean)];
        c.send({ t: 'welcome', roster, hour: this.g.hour, day: this.g.day, lights: this.g.traffic.time, wx: this.g.weather && this.g.weather.target });
      });
      c.on('data', (m) => { if (!m || !m.t) return; m.from = c.peer; this.onData(m, c); this.relay(m, c.peer); });
      c.on('close', () => { this.conns.delete(c.peer); this.drop(c.peer); this.relay({ t: 'leave', id: c.peer }); this.status(); });
      c.on('error', () => { this.conns.delete(c.peer); this.drop(c.peer); });
    });
    peer.on('call', (call) => this.onCall(call));
    peer.on('error', (e) => {
      if (e.type === 'unavailable-id') { try { peer.destroy(); } catch (x) {} this.peer = null; setTimeout(() => this.tryJoin(), 400 + Math.random() * 800); }
      else this.status('Réseau : ' + e.type);
    });
  }
  hostLost() {
    if (this.host || !this.peer) return;
    this.g.life.notify('L’hôte est parti : reconnexion…');
    for (const id in this.remotes) this.drop(id);
    try { this.peer.destroy(); } catch (e) {}
    this.peer = null; this.conn = null; this.connected = false;
    setTimeout(() => this.start(), 500 + Math.random() * 2500); // l'un des joueurs reprendra le rôle d'hôte
  }
  retry(why) { try { this.peer.destroy(); } catch (e) {} this.peer = null; this.status('Réseau : ' + why + ' — nouvel essai…'); setTimeout(() => this.start(), 4000); }

  hello() { const g = this.g; return { t: 'hello', id: this.myId, name: g.profile.first + ' ' + g.profile.last[0] + '.', model: g.profile.model, tint: g.profile.model === 'rpm' ? { Outfit_Top: g.profile.top, Outfit_Bottom: g.profile.bottom } : null }; }
  send(m) {
    if (!this.connected) return;
    if (this.host) { m.from = this.myId; for (const c of this.conns.values()) if (c.open) try { c.send(m); } catch (e) {} }
    else if (this.conn && this.conn.open) try { this.conn.send(m); } catch (e) {}
  }
  relay(m, except) { for (const [id, c] of this.conns) if (id !== except && c.open) try { c.send(m); } catch (e) {} }

  onData(m, c) {
    if (!m || !m.t) return;
    const from = m.from || m.id;
    switch (m.t) {
      case 'welcome':
        this.g.hour = m.hour; this.g.day = m.day; this.g.traffic.time = m.lights; if (m.wx && this.g.weather) this.g.weather.set(m.wx);
        this.g.traffic.mirror = true; // la circulation de l'hôte fait foi
        for (const h of m.roster || []) this.addPlayer(h);
        this.status(); this.voiceSync(); break;
      case 'full': this.g.life.notify('Le monde est complet (16 joueurs)', 'warn'); this.stop(); break;
      case 'hello': this.addPlayer(Object.assign({}, m, { id: from })); this.status(); this.voiceSync(); break;
      case 'leave': this.drop(m.id); this.status(); break;
      case 'clock': if (!this.host) { this.g.hour = m.hour; this.g.day = m.day; this.g.traffic.time = m.lights; if (m.wx && this.g.weather && this.g.weather.target !== m.wx) this.g.weather.set(m.wx); } break;
      case 'cars': if (!this.host) this.applyCars(m.a); break;
      case 'take': { const ai = this.carById(m.id); if (ai && ai !== this.g.vehAI) { if (ai.spot) { ai.spot.taken = null; ai.spot = null; } ai.state = 'remote'; ai.remoteBy = from; } } break;
      case 'drop': { const ai = this.carById(m.id); if (ai && ai.state === 'remote') { ai.state = 'parked'; ai.pos.set(m.x, 0, m.z); ai.heading = m.h; ai.net = null; this.g.traffic.sync(ai); } } break;
      case 'emote': { const r = this.remotes[from]; if (r) { r.emoteUntil = performance.now() + 2500; r.emote = m.e; } } break;
      case 's': this.applyState(from, m); break;
      case 'chat': this.pushChat(m.name + ' : ' + m.text); break;
      case 'pm': if (m.to === this.myId) { this.pms.push({ from: from, name: m.name, text: m.text, me: false }); this.g.life.notify('📩 ' + m.name + ' : ' + m.text, 'ok'); this.g.onPM && this.g.onPM(from); } break;
      case 'hang': if (m.to === this.myId) this.hangup(true); break;
    }
  }
  addPlayer(h) {
    if (!h || !h.id || h.id === this.myId) return null;
    let r = this.remotes[h.id];
    if (!r) {
      r = this.remotes[h.id] = { id: h.id, pos: new THREE.Vector3(), yaw: 0, name: h.name, model: h.model, char: null, car: null, carId: null, hello: h, fresh: true };
      const base = this.g.charBases[h.model] || this.g.charBases.rpm;
      r.char = new Character(base, { tint: h.tint ? Object.fromEntries(Object.entries(h.tint).map(([k, v]) => [k, new THREE.Color(v).multiplyScalar(1.6)])) : null });
      r.char.obj.visible = false; this.g.R.scene.add(r.char.obj);
      r.tag = document.createElement('div'); r.tag.className = 'nametag'; r.tag.textContent = h.name; document.body.appendChild(r.tag);
      this.g.life.notify(`🤝 ${h.name} a rejoint la ville`, 'ok');
    }
    r.hello = h; return r;
  }
  async applyState(id, m) {
    const r = this.remotes[id] || (m.hello ? this.addPlayer(Object.assign({ id }, m.hello)) : null);
    if (!r) return;
    r.target = new THREE.Vector3(m.x, m.y, m.z); r.tyaw = m.yaw; r.anim = m.anim; r.wanted = m.w; r.visible = m.v !== 0;
    if (r.fresh) { r.pos.copy(r.target); r.yaw = m.yaw; r.fresh = false; r.char.obj.visible = true; }
    if (m.car && m.car.tid !== undefined && this.carById(m.car.tid)) {
      // le joueur conduit une voiture de la ville : on pilote cette même voiture
      const ai = this.carById(m.car.tid); if (ai.spot) { ai.spot.taken = null; ai.spot = null; }
      ai.state = 'remote'; ai.remoteBy = id; r.carState = m.car; r.cityCar = ai;
      if (r.car) { this.g.R.scene.remove(r.car.obj); r.car = null; r.carId = null; }
    } else if (m.car) {
      const key = m.car.id + m.car.paint;
      if (r.carId !== key && !r.loading) {
        r.loading = true;
        const tpl = await loadCarTemplate(m.car.id);
        if (r.car) this.g.R.scene.remove(r.car.obj);
        r.car = makeCar(tpl, m.car.paint); this.g.R.scene.add(r.car.obj); r.carId = key; r.loading = false;
        r.car.obj.position.set(m.car.x, 0, m.car.z);
      }
      r.carState = m.car;
    } else if (r.car) { this.g.R.scene.remove(r.car.obj); r.car = null; r.carId = null; r.carState = null; }
  }
  drop(id) {
    const r = this.remotes[id]; if (!r) return;
    this.g.R.scene.remove(r.char.obj); if (r.car) this.g.R.scene.remove(r.car.obj); r.tag.remove();
    this.g.life.notify(`📴 ${r.name} a quitté la ville`);
    delete this.remotes[id]; this.endCall(id);
  }

  pushChat(line) { this.chat.push(line); if (this.chat.length > 40) this.chat.shift(); this.g.life.notify('💬 ' + line); }
  say(text) { text = (text || '').trim(); if (!text) return; this.send({ t: 'chat', name: this.g.profile.first, text }); this.pushChat('Moi : ' + text); }

  status(msg) {
    const el = $('lobby'); if (!el) return;
    if (msg === null || (!this.enabled && !msg)) { el.hidden = true; return; }
    el.hidden = false;
    if (msg) { el.innerHTML = '🌐 ' + msg; return; }
    el.innerHTML = `🌐 Monde public · <b>${this.count}</b> joueur${this.count > 1 ? 's' : ''} en ligne${this.host ? ' (vous hébergez)' : ''} <button id="bInvite">📋 Inviter</button>${this.stream ? ' · 📻 Maintenez V pour parler' : ' <button id="bTalk">📻 Radio CB (micro)</button>'}`;
    const bi = $('bInvite'); if (bi) bi.onclick = () => { const u = location.href.split('?')[0]; try { navigator.clipboard.writeText(u); this.g.life.notify('🔗 Lien copié : envoyez-le à vos amis, ils arriveront dans la même ville', 'ok'); } catch (e) { this.g.life.notify(u); } };
    const bt = $('bTalk'); if (bt) bt.onclick = () => this.enableVoice();
  }

  // ---------- radio CB (voix) ----------
  async enableVoice() {
    try { this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { this.g.life.notify('Micro refusé', 'warn'); return; }
    this.stream.getAudioTracks().forEach(t => t.enabled = false);
    this.status(); this.voiceSync();
  }
  voiceSync() {
    if (!this.stream || !this.peer) return;
    for (const id in this.remotes) if (!this.calls.has(id) && this.myId < id) { const call = this.peer.call(id, this.stream); this.hookCall(id, call); }
  }
  onCall(call) {
    if (call.metadata && call.metadata.direct) { // appel téléphonique d'un joueur
      this.incoming = call; this.g.onIncomingCall && this.g.onIncomingCall(call.metadata.name, call);
      return;
    }
    if (!this.stream) { call.answer(); } else call.answer(this.stream); this.hookCall(call.peer, call);
  }
  async mic() { if (this.micStream) return this.micStream; this.micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); return this.micStream; }
  async callPlayer(id) {
    try { const st = await this.mic(); const call = this.peer.call(id, st, { metadata: { direct: true, name: this.g.profile.first } }); this.attachPhone(call, id); this.g.life.notify('📞 Appel en cours…'); }
    catch (e) { this.g.life.notify('Micro refusé : appel impossible', 'warn'); }
  }
  async answer() {
    const call = this.incoming; if (!call) return; this.incoming = null;
    try { const st = await this.mic(); call.answer(st); this.attachPhone(call, call.peer); } catch (e) { call.close(); this.g.life.notify('Micro refusé', 'warn'); }
  }
  decline() { if (this.incoming) { try { this.incoming.close(); } catch (e) {} this.incoming = null; } }
  attachPhone(call, id) {
    this.phoneCall = { call, id, t0: performance.now() };
    call.on('stream', (s) => { const a = new Audio(); a.srcObject = s; a.autoplay = true; a.play().catch(() => {}); this.phoneCall && (this.phoneCall.audio = a); this.g.life.notify('📞 En communication', 'ok'); });
    call.on('close', () => this.hangup(true));
  }
  hangup(remote) {
    if (!this.phoneCall) return; const pc = this.phoneCall; this.phoneCall = null;
    try { pc.call.close(); } catch (e) {} if (pc.audio) pc.audio.srcObject = null;
    if (!remote) this.send({ t: 'hang', to: pc.id });
    this.g.life.notify('📞 Appel terminé');
  }
  pm(id, text) { text = (text || '').trim(); if (!text) return; this.send({ t: 'pm', to: id, name: this.g.profile.first, text }); this.pms.push({ from: id, name: 'Moi', text, me: true }); }
  hookCall(id, call) {
    this.calls.set(id, call);
    call.on('stream', (s) => { const a = new Audio(); a.srcObject = s; a.autoplay = true; a.play().catch(() => {}); this.calls.get(id).audio = a; });
    call.on('close', () => this.calls.delete(id));
  }
  endCall(id) { const c = this.calls.get(id); if (c) { try { c.close(); } catch (e) {} this.calls.delete(id); } }
  ptt(on) { if (this.stream) this.stream.getAudioTracks().forEach(t => t.enabled = on); }

  update(dt) {
    if (!this.connected) return;
    const g = this.g;
    this.sendT += dt; this.clockT = (this.clockT || 0) + dt;
    if (this.host && this.clockT > 5) { this.clockT = 0; this.send({ t: 'clock', hour: g.hour, day: g.day, lights: g.traffic.time, wx: g.weather && g.weather.target }); }
    this.carsT = (this.carsT || 0) + dt;
    if (this.host && this.conns.size && this.carsT > 0.15) { this.carsT = 0; this.sendCars(); }
    if (this.sendT > 0.08) {
      this.sendT = 0;
      const pl = g.player, v = g.veh, o = pl.char.obj;
      const m = { t: 's', id: this.myId, x: o.position.x, y: o.position.y, z: o.position.z, yaw: o.rotation.y, anim: pl.char.cur ? pl.char.cur.getClip().name : 'idle', w: g.police.wanted, v: o.visible || v ? 1 : 0 };
      if (!this._helloSent || this._helloT++ > 50) { m.hello = this.hello(); this._helloSent = true; this._helloT = 0; }
      if (v) m.car = { tid: g.vehAI && g.vehAI.id, id: v.car.tpl.spec.id, paint: v.car.paint ? '#' + v.car.paint.color.getHexString() : '#ffffff', x: v.pos.x, z: v.pos.z, h: v.heading, st: v.steer, sp: v.spin, b: v.brake ? 1 : 0 };
      this.send(m);
    }
    const cam = g.R.camera;
    for (const id in this.remotes) {
      const r = this.remotes[id]; if (!r.target) continue;
      r.pos.lerp(r.target, Math.min(1, dt * 12)); let d = r.tyaw - r.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); r.yaw += d * Math.min(1, dt * 12);
      r.char.obj.position.copy(r.pos); r.char.obj.rotation.y = r.yaw;
      if (r.anim) r.char.play(r.anim, 0.25);
      r.char.update(dt, r.pos.distanceTo(cam.position));
      if (r.cityCar && r.carState && r.cityCar.state === 'remote') {
        const s = r.carState, ai = r.cityCar;
        ai.pos.x += (s.x - ai.pos.x) * Math.min(1, dt * 12); ai.pos.z += (s.z - ai.pos.z) * Math.min(1, dt * 12);
        let dh = s.h - ai.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); ai.heading += dh * Math.min(1, dt * 12);
        ai.car.obj.position.set(ai.pos.x, 0, ai.pos.z); ai.car.obj.rotation.set(0, ai.heading, 0); ai.car.obj.visible = true;
        poseCar(ai.car, { spin: s.sp, steer: s.st, brake: !!s.b, head: g.sky.night > 0.45 ? 1 : 0 });
      }
      if (!r.carState) r.cityCar = null;
      if (r.emoteUntil && performance.now() < r.emoteUntil) r.char.play(r.emote || 'wave', 0.2);
      if (r.car && r.carState) {
        const s = r.carState, o = r.car.obj;
        o.position.lerp(new THREE.Vector3(s.x, 0, s.z), Math.min(1, dt * 12));
        let dh = s.h - o.rotation.y; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); o.rotation.y += dh * Math.min(1, dt * 12);
        poseCar(r.car, { spin: s.sp, steer: s.st, brake: !!s.b, head: g.sky.night > 0.45 ? 1 : 0 });
      }
      const p = r.pos.clone().add(new THREE.Vector3(0, 2.15, 0)).project(cam);
      const vis = p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1 && r.pos.distanceTo(cam.position) < 150;
      r.tag.style.display = vis ? 'block' : 'none';
      if (vis) { r.tag.style.left = ((p.x + 1) / 2 * innerWidth) + 'px'; r.tag.style.top = ((1 - p.y) / 2 * innerHeight) + 'px'; r.tag.textContent = r.name + (r.wanted ? ' ' + '★'.repeat(r.wanted) : ''); }
    }
  }
  carById(id) { return this.g.traffic.cars.find(c => c.id === id); }
  // Hôte : diffuse l'état des voitures (circulation, voitures garées qui changent, police, voleurs).
  sendCars() {
    const a = [], T = this.g.traffic;
    for (const ai of T.cars) {
      if (ai.state === 'player' && ai === this.g.vehAI) continue;
      const moving = ai.state !== 'parked' && ai.state !== 'remote';
      if (!moving && ai._netParked) continue;
      ai._netParked = !moving;
      const paint = ai.car.paint ? ai.car.paint.color.getHexString() : 'ffffff';
      a.push([ai.id, ai.tpl.spec.id, paint, moving ? 1 : 0, +ai.pos.x.toFixed(2), +ai.pos.z.toFixed(2), +ai.heading.toFixed(3), +(ai.v || 0).toFixed(1), +(ai.steer || 0).toFixed(2), (ai.brake ? 1 : 0) | (ai.blink ? 2 : 0)]);
    }
    if (a.length) this.send({ t: 'cars', a });
  }
  async applyCars(a) {
    const T = this.g.traffic;
    for (const e of a) {
      let ai = this.carById(e[0]);
      if (!ai) { ai = T.newCar(e[1], '#' + e[2], e[0]); ai.state = 'drive'; ai.pos.set(e[4], 0, e[5]); ai.heading = e[6]; }
      if (ai === this.g.vehAI || ai.state === 'remote') continue;
      if (e[3]) { ai.state = 'drive'; ai.net = { x: e[4], z: e[5], h: e[6], v: e[7], st: e[8], fl: e[9] }; }
      else { ai.state = 'parked'; ai.net = null; ai.pos.set(e[4], 0, e[5]); ai.heading = e[6]; T.sync(ai); }
    }
  }
  emote(e) { this.send({ t: 'emote', e }); }
  // Autres joueurs comme obstacles (collisions).
  circles(pos) {
    const out = [];
    for (const id in this.remotes) {
      const r = this.remotes[id]; if (!r.target) continue;
      if (r.car && r.carState) { const s = r.carState, fw = new THREE.Vector3(Math.sin(s.h), 0, Math.cos(s.h)); for (const o of [-1.4, 0, 1.4]) out.push({ x: s.x + fw.x * o, z: s.z + fw.z * o, r: 0.95 }); }
      else if (r.pos.distanceTo(pos) < 20) out.push({ x: r.pos.x, z: r.pos.z, r: 0.35 });
    }
    return out;
  }
}
