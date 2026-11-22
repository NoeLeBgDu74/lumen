// Vie du joueur : argent, besoins, inventaire, logement, emploi, permis, véhicules possédés, sauvegarde.
// + interface : besoins, notifications, panneau d'interaction générique, mini-carte, téléphone.
import * as THREE from 'three';
import * as W from './world.js';
import { CATALOG } from './cars.js';

const $ = (id) => document.getElementById(id);
export const fmt = (n) => Math.round(n).toLocaleString('fr-FR') + ' €';

export class Life {
  constructor(game) {
    this.g = game;
    const def = {
      money: 1250, bank: 0, needs: { faim: 80, energie: 85, hygiene: 80, social: 60, moral: 75 },
      food: 2, home: null, rentDue: 0, job: null, jobPlace: null, xp: {}, license: { enrolled: false, code: false, lessons: 0, permis: false },
      cars: [], log: [], contacts: {}, day: 1, hour: 8, fines: 0, wanted: 0, stats: { worked: 0, earned: 0, km: 0 }
    };
    let s = null; try { s = JSON.parse(localStorage.getItem('lw.save') || 'null'); } catch (e) {}
    this.s = Object.assign(def, s || {});
    if (s) { game.day = this.s.day; game.hour = this.s.hour; }
    game.license = this.s.license.permis;
    this.lastSave = 0; this.lastPay = game.day;
    this.buildNeedsUI();
  }
  save() { const s = this.s; s.day = this.g.day; s.hour = this.g.hour; try { localStorage.setItem('lw.save', JSON.stringify(s)); } catch (e) {} }

  money(delta, why) {
    if (delta < 0 && this.s.money + delta < 0) { this.notify('Fonds insuffisants' + (why ? ' (' + why + ')' : ''), 'warn'); return false; }
    this.s.money += delta;
    if (why) this.notify((delta >= 0 ? '+' : '') + fmt(delta) + ' · ' + why, delta >= 0 ? 'ok' : '');
    this.s.log.push({ d: this.g.day, h: Math.round(this.g.hour * 10) / 10, v: delta, why });
    if (this.s.log.length > 80) this.s.log.shift();
    return true;
  }
  notify(text, kind = '') {
    const box = $('notifs'); const n = document.createElement('div'); n.className = 'nt ' + kind; n.textContent = text; box.prepend(n);
    setTimeout(() => n.classList.add('out'), 4200); setTimeout(() => n.remove(), 5000);
    while (box.children.length > 5) box.lastChild.remove();
  }

  // ---------- besoins ----------
  buildNeedsUI() {
    const N = { faim: 'Faim', energie: 'Énergie', hygiene: 'Hygiène', social: 'Social', moral: 'Moral' };
    $('needs').innerHTML = Object.entries(N).map(([k, l]) => `<div class="need"><span>${l}</span><div class="b"><i id="nd_${k}"></i></div></div>`).join('');
  }
  update(dt) {
    const g = this.g, n = this.s.needs, gh = dt * g.timeScale / 3600; // heures de jeu écoulées
    n.faim = Math.max(0, n.faim - gh * 4.2); n.energie = Math.max(0, n.energie - gh * 3.4 * (g.player.speed > 3 ? 1.6 : 1));
    n.hygiene = Math.max(0, n.hygiene - gh * 2.2); n.social = Math.max(0, n.social - gh * 1.8);
    const avg = (n.faim + n.energie + n.hygiene + n.social) / 4;
    n.moral += (avg - n.moral) * Math.min(1, gh * 0.4);
    for (const k in n) { const el = $('nd_' + k); if (el) { el.style.width = n[k] + '%'; el.style.background = n[k] > 50 ? '#8fe3a1' : n[k] > 25 ? '#f2c14e' : '#ef5b4b'; } }
    $('money').textContent = fmt(this.s.money);
    if (n.faim < 15 && !this._warnF) { this.notify('Vous avez faim : mangez quelque chose', 'warn'); this._warnF = true; } else if (n.faim > 30) this._warnF = false;
    if (n.energie < 12 && !this._warnE) { this.notify('Vous êtes épuisé·e : allez dormir', 'warn'); this._warnE = true; } else if (n.energie > 30) this._warnE = false;
    // loyer hebdomadaire
    if (this.s.home && this.s.home.rent && g.day >= (this.s.rentNext || 0)) {
      this.s.rentNext = g.day + 7;
      if (!this.money(-this.s.home.rent * 7 / 30 * 4.3 / 4.3, 'loyer de la semaine')) { this.s.rentDebt = (this.s.rentDebt || 0) + 1; if (this.s.rentDebt >= 2) { this.notify('Expulsé·e pour loyers impayés', 'warn'); this.s.home = null; } }
    }
    if (g.time - this.lastSave > 20) { this.lastSave = g.time; this.save(); }
  }
  feed(v) { this.s.needs.faim = Math.min(100, this.s.needs.faim + v); }

  // Saut temporel (dormir, travailler) : écran noir, l'horloge et la ville avancent.
  async skip(hours, during) {
    const g = this.g; const f = $('fade'); f.style.opacity = 1; g.paused = true;
    await new Promise(r => setTimeout(r, 650));
    g.hour += hours; while (g.hour >= 24) { g.hour -= 24; g.day++; }
    g.pop.skip(hours);
    during && during();
    await new Promise(r => setTimeout(r, 500));
    f.style.opacity = 0; g.paused = false; this.save();
  }

  // ---------- panneau générique ----------
  panel(title, html, buttons = []) {
    const p = $('panel'); p.hidden = false;
    $('panelT').textContent = title; $('panelB').innerHTML = html;
    const box = $('panelA'); box.innerHTML = '';
    for (const b of [...buttons, { label: 'Fermer', close: true }]) {
      const el = document.createElement('button'); el.textContent = b.label; if (b.disabled) el.disabled = true; if (b.primary) el.className = 'primary';
      el.onclick = () => { if (b.close) return this.closePanel(); const r = b.run && b.run(); if (r !== false && !b.keep) this.closePanel(); };
      box.appendChild(el);
    }
    this.g.input.enabled = false; document.exitPointerLock?.();
    this.panelOpen = true;
  }
  closePanel() { $('panel').hidden = true; this.g.input.enabled = true; this.panelOpen = false; }
}

// ---------- mini-carte ----------
export class Minimap {
  constructor(game) {
    this.g = game; this.c = $('minimap'); this.x = this.c.getContext('2d');
    this.size = 190; this.c.width = this.c.height = this.size * devicePixelRatio;
    this.scale = 0.42; // px par mètre
    // fond pré-rendu
    const S = 3200, k = 0.3; this.bgK = k;
    const bg = this.bg = document.createElement('canvas'); bg.width = bg.height = S * k;
    const b = bg.getContext('2d');
    b.fillStyle = '#2c3a2c'; b.fillRect(0, 0, bg.width, bg.height);
    const X = (x) => (x + S / 2) * k, Z = (z) => (z + S / 2) * k;
    for (let j = 0; j < W.NZ; j++) for (let i = 0; i < W.NX; i++) {
      const d = W.district(i, j);
      b.fillStyle = { S: '#47563f', R: '#5b5650', D: '#625c55', C: '#5d5a54', I: '#55524f', L: '#3f5a38' }[d] || '#555';
      const r = W.blockRect(i, j); b.fillRect(X(r.x0 - W.SW), Z(r.z0 - W.SW), (r.x1 - r.x0 + 2 * W.SW) * k, (r.z1 - r.z0 + 2 * W.SW) * k);
    }
    b.strokeStyle = '#d9d4c7'; b.lineCap = 'round';
    for (const e of W.edges) { const A = W.nodes[e.a], B = W.nodes[e.b]; b.lineWidth = (e.kind === 'rural' ? 8 : 14) * k; b.beginPath(); b.moveTo(X(A.x), Z(A.z)); b.lineTo(X(B.x), Z(B.z)); b.stroke(); }
    this.S = S;
  }
  draw() {
    const g = this.g, x = this.x, s = this.size * devicePixelRatio, sc = this.scale * devicePixelRatio;
    const p = g.veh ? g.veh.pos : g.player.pos;
    const yaw = g.veh ? g.veh.heading : g.player.camYaw + Math.PI;
    x.save(); x.clearRect(0, 0, s, s);
    x.beginPath(); x.arc(s / 2, s / 2, s / 2, 0, 7); x.clip();
    x.fillStyle = '#243024'; x.fillRect(0, 0, s, s);
    x.translate(s / 2, s / 2); x.rotate(yaw + Math.PI); // carte orientée selon la caméra
    const k = this.bgK, f = sc / k;
    x.drawImage(this.bg, (-(p.x + this.S / 2) * k) * f, (-(p.z + this.S / 2) * k) * f, this.bg.width * f, this.bg.height * f);
    const pt = (wx, wz) => [(wx - p.x) * sc, (wz - p.z) * sc];
    // itinéraire GPS
    if (g.gps && g.gps.pts) { x.strokeStyle = '#ffb547'; x.lineWidth = 4 * devicePixelRatio; x.beginPath(); g.gps.pts.forEach((q, i) => { const [a, b] = pt(q.x, q.z); i ? x.lineTo(a, b) : x.moveTo(a, b); }); x.stroke(); }
    // lieux
    for (const pl of W.places) { const ic = ICONS[pl.type]; if (!ic || !pl.door) continue; const [a, b] = pt(pl.door.p.x, pl.door.p.z); if (Math.abs(a) > s || Math.abs(b) > s) continue; x.save(); x.translate(a, b); x.rotate(-(yaw + Math.PI)); x.fillStyle = ic[1]; x.beginPath(); x.arc(0, 0, 6 * devicePixelRatio, 0, 7); x.fill(); x.fillStyle = '#fff'; x.font = `bold ${8 * devicePixelRatio}px Inter`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ic[0], 0, 0.5); x.restore(); }
    // véhicules du joueur
    for (const c of g.ownedAI || []) { const [a, b] = pt(c.pos.x, c.pos.z); x.fillStyle = '#6fb7ff'; x.fillRect(a - 3, b - 3, 6, 6); }
    // police
    for (const c of (g.police && g.police.units) || []) { const [a, b] = pt(c.ai.pos.x, c.ai.pos.z); x.fillStyle = (Math.floor(g.time * 4) % 2) ? '#ff3b3b' : '#3b7bff'; x.beginPath(); x.arc(a, b, 4 * devicePixelRatio, 0, 7); x.fill(); }
    // autres joueurs
    for (const r of (g.net && g.net.remotes ? Object.values(g.net.remotes) : [])) { const [a, b] = pt(r.pos.x, r.pos.z); x.fillStyle = '#c77dff'; x.beginPath(); x.arc(a, b, 5 * devicePixelRatio, 0, 7); x.fill(); }
    x.restore();
    // joueur
    x.save(); x.translate(s / 2, s / 2); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(0, -9 * devicePixelRatio); x.lineTo(6 * devicePixelRatio, 7 * devicePixelRatio); x.lineTo(0, 3 * devicePixelRatio); x.lineTo(-6 * devicePixelRatio, 7 * devicePixelRatio); x.closePath(); x.fill(); x.restore();
    $('district').textContent = districtAt(p.x, p.z);
  }
}
export const ICONS = {
  supermarket: ['S', '#d63b30'], gas_station: ['⛽', '#1f8a4c'], dealership: ['🚗', '#2a62c9'], driving_school: ['A', '#e08a1e'], restaurant: ['R', '#b8462b'],
  cafe: ['C', '#7a4f2b'], gunshop: ['🔫', '#8a1c1c'], bakery: ['B', '#a0702a'], office: ['O', '#4b5a73'], garage: ['G', '#5f6b70'], warehouse: ['L', '#6b5b45'], park: ['P', '#3b8a3f'], sports: ['⚽', '#3b8a3f'], pharmacy: ['+', '#1e9e6a'], bank: ['€', '#20406b'],
};
export function districtAt(x, z) {
  const i = Math.floor((x - W.OX) / W.P), j = Math.floor((z - W.OZ) / W.P);
  if (i < 0 || j < 0 || i >= W.NX || j >= W.NZ) return 'Campagne de Lumen';
  return W.DISTRICT_NAMES[W.district(i, j)] || 'Lumen';
}

// GPS : itinéraire routier jusqu'à un point.
export function gpsTo(game, target, label) {
  const from = game.veh ? game.veh.pos : game.player.pos;
  const a = W.nearestNode(from.x, from.z), b = W.nearestNode(target.x, target.z);
  const r = W.route(a, b) || [];
  game.gps = { target: target.clone(), label, pts: [from.clone(), ...r.map(n => new THREE.Vector3(W.nodes[n].x, 0, W.nodes[n].z)), target.clone()] };
  game.life.notify('GPS : ' + label);
}
export function catalogById(id) { return CATALOG.find(c => c.id === id); }
