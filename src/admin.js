// Menu administrateur caché : tapez « admin » en jeu (hors champ de texte) pour l'ouvrir / le fermer.
// Argent, police, invincibilité, téléportation, heure, véhicules, armes, vol libre, habitants, joueurs en ligne.
import * as THREE from 'three';
import * as W from './world.js';
import { CATALOG, PAINTS } from './cars.js';
import { WEAPONS } from './combat.js';

const SECRET = 'admin';
const $ = (id) => document.getElementById(id);

export class Admin {
  constructor(game) {
    this.g = game; this.buf = ''; this.open = false; this.god = false; this.noPolice = false; this.fly = false; this.speed = 1;
    addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key.length === 1) { this.buf = (this.buf + e.key.toLowerCase()).slice(-SECRET.length); if (this.buf === SECRET) { this.buf = ''; this.toggle(); } }
    });
    const el = document.createElement('div'); el.id = 'admin'; el.hidden = true; document.body.appendChild(el); this.el = el;
  }
  toggle() { this.open = !this.open; this.el.hidden = !this.open; if (this.open) { this.render(); document.exitPointerLock?.(); } this.g.input.enabled = !this.open; }
  btn(label, fn, on) { return { label, fn, on }; }
  render(tab = this.tab || 'joueur') {
    this.tab = tab; const g = this.g;
    const tabs = ['joueur', 'monde', 'véhicules', 'téléport', 'habitants', 'en ligne'];
    let rows = [];
    if (tab === 'joueur') rows = [
      this.btn('+10 000 €', () => g.life.money(10000, 'admin')), this.btn('+100 000 €', () => g.life.money(100000, 'admin')),
      this.btn('Besoins au maximum', () => { for (const k in g.life.s.needs) g.life.s.needs[k] = 100; }),
      this.btn('Invincible : ' + (this.god ? 'OUI' : 'non'), () => { this.god = !this.god; }, this.god),
      this.btn('Super vitesse : x' + this.speed, () => { this.speed = this.speed >= 4 ? 1 : this.speed * 2; }),
      this.btn('Vol libre (noclip) : ' + (this.fly ? 'OUI' : 'non') + ' — ZQSD, Espace/Ctrl', () => { this.fly = !this.fly; }, this.fly),
      this.btn('Toutes les armes + munitions', () => { const s = g.life.s; for (const k in WEAPONS) s.weapons[k] = true; s.ammo.pistol = 999; s.ammo.rifle = 999; s.clip = s.clip || {}; s.clip.pistol = 15; s.clip.rifle = 5; }),
      this.btn('Permis de conduire obtenu', () => { const l = g.life.s.license; l.enrolled = l.code = true; l.lessons = 2; l.permis = true; g.license = true; }),
      this.btn('Effacer la sauvegarde (nouvelle vie)', () => { if (confirm('Effacer la partie ?')) { localStorage.removeItem('lw.save'); localStorage.removeItem('lw.profile'); location.reload(); } }),
    ];
    if (tab === 'monde') rows = [
      ...[6, 9, 12, 15, 18, 20, 22, 0].map(h => this.btn(String(h).padStart(2, '0') + 'h00', () => { g.hour = h; })),
      this.btn('Police désactivée : ' + (this.noPolice ? 'OUI' : 'non'), () => { this.noPolice = !this.noPolice; if (this.noPolice) { g.police.wanted = 0; g.police.renderStars(); } }, this.noPolice),
      this.btn('Recherché ★★★★★', () => g.police.addWanted(5, 'admin', true)), this.btn('Effacer les étoiles', () => { g.police.wanted = 0; g.police.renderStars(); }),
      this.btn('+15 voitures en circulation', () => { for (let k = 0; k < 15; k++) { const e = W.edges[Math.floor(Math.random() * W.edges.length)]; const ai = g.traffic.newCar(); ai.edge = e; ai.t = W.RW + 3; ai.state = 'drive'; ai.v = 8; g.traffic.wander(ai); } }),
      this.btn('🔥 Déclencher un incendie proche', () => g.living.startFire()),
      this.btn('🚗 Déclencher un vol de voiture (PNJ)', () => g.living.startCarTheft()),
      this.btn('🌧 Météo : orage', () => g.weather.set('storm')), this.btn('☀ Météo : dégagé', () => g.weather.set('clear')),
      this.btn('Temps x10 : ' + (g.timeScale > 30 ? 'OUI' : 'non'), () => { g.timeScale = g.timeScale > 30 ? 30 : 300; }, g.timeScale > 30),
    ];
    if (tab === 'véhicules') rows = CATALOG.map(c => this.btn('Faire apparaître : ' + c.name, () => {
      const P = g.player.pos, fw = new THREE.Vector3(Math.sin(g.player.yaw), 0, Math.cos(g.player.yaw));
      const ai = g.traffic.newCar(c.id, PAINTS[Math.floor(Math.random() * PAINTS.length)]); ai.ownerIsPlayer = true; ai.state = 'parked';
      ai.pos.set(P.x + fw.x * 4, 0, P.z + fw.z * 4); ai.heading = g.player.yaw + Math.PI / 2; g.traffic.sync(ai);
    })).concat([this.btn('Réparer + plein du véhicule actuel', () => { if (g.veh) { g.veh.damage = 0; g.veh.fuel = g.veh.car.tpl.spec.fuel; } })]);
    if (tab === 'téléport') {
      const seen = new Set();
      rows = W.places.filter(p => p.door && p.door.p && !['apartments', 'house'].includes(p.type) && !seen.has(p.type) && seen.add(p.type)).map(p => this.btn(p.name, () => this.tp(p.door.p)));
      rows.push(this.btn('Domicile', () => this.tp((g.life.s.home ? W.places[g.life.s.home.id] : g.home).door.p)), this.btn('Campagne (route en anneau)', () => this.tp(new THREE.Vector3(W.RING_BOX.X0, 0, 0))));
    }
    if (tab === 'habitants') rows = g.pop.people.slice(0, 60).map(p => this.btn(`${p.first} ${p.last} · ${p.state}${p.task ? ' · ' + p.task.why : ''}`, () => { this.tp(p.pos.clone().add(new THREE.Vector3(1.5, 0, 1.5))); }));
    if (tab === 'en ligne') { rows = Object.values(g.net.remotes).map(r => this.btn('Rejoindre ' + r.name, () => this.tp(r.pos.clone().add(new THREE.Vector3(2, 0, 2))))); if (!rows.length) rows = [this.btn('Aucun autre joueur connecté', () => {})]; }
    this.el.innerHTML = `<div class="adm"><div class="admh"><b>⚙ ADMIN</b><span>tapez « ${SECRET} » pour fermer</span><button id="admX">✕</button></div>
      <div class="admt">${tabs.map(t => `<button data-t="${t}" class="${t === tab ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="admb">${rows.map((r, i) => `<button data-i="${i}" class="${r.on ? 'on' : ''}">${r.label}</button>`).join('')}</div></div>`;
    this.el.querySelectorAll('.admt button').forEach(b => b.onclick = () => this.render(b.dataset.t));
    this.el.querySelectorAll('.admb button').forEach(b => b.onclick = () => { rows[+b.dataset.i].fn(); this.render(); });
    $('admX').onclick = () => this.toggle();
  }
  tp(p) { const g = this.g; if (g.veh) { g.veh.place(p.x + 3, p.z + 3, g.veh.heading); } else g.player.place(p.x + 1.5, p.z + 1.5, g.player.yaw); g.player.camInit = false; }
  update(dt) {
    const g = this.g;
    if (this.god && g.combat) { g.combat.health = 100; if (g.veh) g.veh.damage = 0; }
    if (this.noPolice && g.police.wanted) { g.police.wanted = 0; g.police.renderStars(); }
    if (this.fly && !g.veh && g.input.enabled) {
      const { f, s } = g.input.move(); const P = g.player; const yaw = P.camYaw;
      const fw = new THREE.Vector3(-Math.sin(yaw) * Math.cos(P.camPitch), -Math.sin(P.camPitch), -Math.cos(yaw) * Math.cos(P.camPitch));
      const rt = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const sp = (g.input.down('ShiftLeft') ? 60 : 18) * dt;
      P.pos.addScaledVector(fw, f * sp).addScaledVector(rt, s * sp);
      if (g.input.down('Space')) P.pos.y += sp; if (g.input.down('ControlLeft')) P.pos.y = Math.max(0, P.pos.y - sp);
      P.vy = 0; P.onGround = true; P.char.obj.position.copy(P.pos);
    }
  }
}
