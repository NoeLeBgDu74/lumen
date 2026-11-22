// Jeu à deux et vie sociale façon GTA 6 :
//  - Lumen Live : réseau social (posts des habitants, événements, exploits « filmés » par des témoins, posts des joueurs)
//  - Courses de rue entre joueurs (défi, compte à rebours synchronisé, points de passage, vainqueur)
//  - Braquage en duo (présence des deux joueurs requise, hold-up, fuite, partage du butin)
//  - Envoi d'argent entre joueurs
import * as THREE from 'three';
import * as W from './world.js';
import { gpsTo, districtAt } from './life.js';

const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const fmtN = (n) => n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',') + ' k' : String(n);

export class Coop {
  constructor(game) {
    this.g = game; this.feed = []; this.race = null; this.heist = null; this.nextPost = game.time + 20;
    this.seed();
  }
  // ---------- Lumen Live ----------
  post(author, text, { likes = 0, viral = false, mine = false, icon = '' } = {}) {
    const p = { author, text, likes: likes || Math.floor(Math.random() * 60), viral, mine, icon, day: this.g.day, h: this.g.hour };
    this.feed.unshift(p); if (this.feed.length > 60) this.feed.pop();
    if (viral) this.g.life.notify(`📱 Lumen Live : « ${text.slice(0, 60)}${text.length > 60 ? '…' : ''} »`, 'warn');
    return p;
  }
  seed() {
    const P = this.g.pop.people;
    for (let k = 0; k < 6; k++) this.npcPost(rnd(P));
  }
  npcPost(p) {
    if (!p) return;
    const name = p.first + ' ' + p.last[0] + '.';
    const m = p.memory[p.memory.length - 1];
    const T = [
      () => m ? `Journée chargée : ${m.text}. 😅` : null,
      () => p.workplace ? `Encore une journée chez ${p.workplace.name}… vivement le week-end 🙃` : null,
      () => `Rien de mieux que ${p.hobby} pour décompresser ❤️`,
      () => this.g.weather && this.g.weather.raining ? 'Il pleut ENCORE sur Lumen 🌧️ #météo' : 'Grand soleil sur Lumen ☀️ #bonnejournée',
      () => { const r = this.g.living && this.g.living.rumorsOf(p).slice(-1)[0]; return r ? `Vous avez entendu ? ${r.text} 😳` : null; },
      () => p.car ? `Ma ${p.car.tpl.spec.name} commence à fatiguer… quelqu'un connaît un bon garage ? 🔧` : 'Le bus est encore en retard… ah non, il n’y a pas de bus 🙄',
    ];
    let text = null; for (let i = 0; i < 6 && !text; i++) text = rnd(T)();
    if (text) this.post(name, text);
  }
  // exploit du joueur filmé par des témoins → post viral
  viral(what) {
    const g = this.g, P = g.pop.people;
    const who = rnd(P); const where = districtAt(g.player.pos.x, g.player.pos.z);
    const car = g.veh ? ` en ${g.veh.car.tpl.spec.name}` : '';
    const likes = 800 + Math.floor(Math.random() * 6000);
    this.post(who.first + ' ' + who.last[0] + '.', `🎥 VIDÉO : un individu${car} ${what} à ${where} !! Quelqu'un le connaît ?? #Lumen #choc`, { likes, viral: true, icon: '🎥' });
  }
  update(dt) {
    const g = this.g;
    if (g.time > this.nextPost) { this.nextPost = g.time + 25 + Math.random() * 40; this.npcPost(rnd(g.pop.people)); }
    for (const p of this.feed) if (p.viral && Math.random() < dt * 0.5) p.likes += Math.floor(Math.random() * 40);
    this.raceUpdate(dt); this.heistUpdate(dt);
  }
  myPost(text) { text = (text || '').trim(); if (!text) return; this.post(this.g.profile.first + ' (vous)', text, { mine: true, likes: 0 }); this.g.net.send({ t: 'coop', k: 'post', name: this.g.profile.first, text }); }

  // ---------- réseau ----------
  onNet(m, from) {
    const g = this.g, r = g.net.remotes[from], name = r ? r.name : (m.name || 'Joueur');
    if (m.k === 'post') this.post(m.name + ' 🟣', m.text, { likes: 3 });
    if (m.k === 'pay') { g.life.money(m.amount, 'virement de ' + name); }
    if (m.k === 'raceInvite') this.g.onRaceInvite && this.g.onRaceInvite(name, from, m);
    if (m.k === 'raceAccept' && this.race && this.race.host) { this.race.rival = from; this.startRace(Date.now() + 5000); g.net.send({ t: 'coop', k: 'raceStart', at: Date.now() + 5000 }); }
    if (m.k === 'raceStart' && this.race && !this.race.host) this.startRace(m.at);
    if (m.k === 'raceCp' && this.race) this.race.rivalCp = m.i;
    if (m.k === 'raceWin' && this.race) { this.endRace(false, name); }
    if (m.k === 'heistInvite') this.g.onHeistInvite && this.g.onHeistInvite(name, from);
    if (m.k === 'heistAccept' && this.heist) { this.heist.partner = from; this.heist.ready = true; g.life.notify(`🤝 ${name} est partant·e pour le braquage !`, 'ok'); }
    if (m.k === 'heistStage' && this.heist) { this.heist.stage = m.stage; if (m.stage === 'escape') this.heistEscape(); if (m.stage === 'done') this.heistDone(); }
    if (m.k === 'heistStage' && !this.heist && m.stage === 'go') { this.joinHeist(m); }
  }

  // ---------- envoi d'argent ----------
  pay(id, amount) {
    const g = this.g; amount = Math.floor(amount);
    if (!(amount > 0) || !g.life.money(-amount, 'virement à un joueur')) return false;
    g.net.send({ t: 'coop', k: 'pay', amount, to: id }); return true;
  }

  // ---------- courses de rue ----------
  inviteRace(bet = 500) {
    const g = this.g; if (!g.net.connected || !Object.keys(g.net.remotes).length) return g.life.notify('Aucun autre joueur connecté', 'warn');
    const start = g.veh ? g.veh.pos : g.player.pos;
    let n = W.nearestNode(start.x, start.z), prev = -1; const cps = [];
    for (let k = 0; k < 7; k++) { const opts = W.nodes[n].links.map(e => W.edges[e]).filter(e => e.b !== prev); const e = rnd(opts); prev = n; n = e.b; const N = W.nodes[n]; cps.push([N.x, N.z]); }
    this.race = { host: true, cps, bet, i: 0, rivalCp: 0, started: false };
    g.net.send({ t: 'coop', k: 'raceInvite', cps, bet, sx: start.x, sz: start.z });
    g.life.notify(`🏁 Défi envoyé (mise ${bet} €). En attente de réponse…`);
  }
  acceptRace(from, m) {
    const g = this.g; if (!g.life.money(-m.bet, 'mise de course')) return;
    this.race = { host: false, cps: m.cps, bet: m.bet, i: 0, rivalCp: 0, started: false };
    g.net.send({ t: 'coop', k: 'raceAccept' });
    g.life.notify('🏁 Défi accepté : rejoignez la ligne de départ !');
    g.checkpoint = new THREE.Vector3(m.sx, 0, m.sz); gpsTo(g, g.checkpoint, 'Départ de la course');
  }
  startRace(at) {
    const g = this.g, R = this.race; if (!R) return;
    if (R.host) g.life.money(-R.bet, 'mise de course');
    R.at = at; R.started = false; g.checkpoint = new THREE.Vector3(R.cps[0][0], 0, R.cps[0][1]);
  }
  raceUpdate(dt) {
    const g = this.g, R = this.race; if (!R || !R.at) return;
    const el = document.getElementById('mission'); el.hidden = false;
    const left = (R.at - Date.now()) / 1000;
    if (!R.started) { el.textContent = left > 0 ? `🏁 Départ dans ${Math.ceil(left)}…` : 'GO !'; if (left <= 0) { R.started = true; g.life.notify('🏁 GO !', 'ok'); } return; }
    const cp = R.cps[R.i], p = g.veh ? g.veh.pos : g.player.pos;
    g.checkpoint = new THREE.Vector3(cp[0], 0, cp[1]);
    el.textContent = `🏁 Course · point ${R.i + 1}/${R.cps.length} · adversaire ${R.rivalCp}/${R.cps.length} · mise ${R.bet} €`;
    if (p.distanceTo(g.checkpoint) < 12) {
      R.i++; g.net.send({ t: 'coop', k: 'raceCp', i: R.i }); g.audio && g.audio.burst(0.1, 2000, 0.1);
      if (R.i >= R.cps.length) { g.net.send({ t: 'coop', k: 'raceWin' }); this.endRace(true); }
    }
  }
  endRace(won, rival) {
    const g = this.g, R = this.race; if (!R) return; this.race = null; g.checkpoint = null;
    if (won) { g.life.money(R.bet * 2, 'victoire en course'); g.life.notify('🏆 Victoire !', 'ok'); this.viral('a remporté une course de rue sauvage'); }
    else g.life.notify(`😤 ${rival} a gagné la course`, 'warn');
  }

  // ---------- braquage en duo ----------
  inviteHeist() {
    const g = this.g; if (!g.net.connected || !Object.keys(g.net.remotes).length) return g.life.notify('Aucun autre joueur connecté', 'warn');
    const target = W.places.find(p => p.type === 'bank' && p.door) || W.places.find(p => p.type === 'supermarket');
    const hide = W.places.filter(p => p.type === 'warehouse' && p.door).sort((a, b) => b.door.p.distanceTo(target.door.p) - a.door.p.distanceTo(target.door.p))[0];
    this.heist = { host: true, target: target.id, hide: hide.id, stage: 'meet', ready: false };
    g.net.send({ t: 'coop', k: 'heistInvite' });
    g.life.notify('💰 Proposition de braquage envoyée…');
  }
  acceptHeist(from) { this.g.net.send({ t: 'coop', k: 'heistAccept' }); this.g.life.notify('💰 Rendez-vous devant la cible (marqueur)'); }
  joinHeist(m) { this.heist = { host: false, target: m.target, hide: m.hide, stage: 'meet', ready: true }; }
  heistUpdate(dt) {
    const g = this.g, H = this.heist; if (!H) return;
    const target = W.places[H.target], hide = W.places[H.hide];
    const el = document.getElementById('mission');
    if (H.host && H.ready && !H.sent) { H.sent = true; g.net.send({ t: 'coop', k: 'heistStage', stage: 'go', target: H.target, hide: H.hide }); }
    if (H.stage === 'meet' && H.ready) {
      g.checkpoint = target.door.p.clone(); el.hidden = false;
      const me = g.player.pos.distanceTo(target.door.p) < 7;
      const partner = Object.values(g.net.remotes).find(r => r.pos.distanceTo(target.door.p) < 9);
      el.textContent = `💰 Braquage en duo · ${target.name} · vous : ${me ? '✔' : 'en route'} · partenaire : ${partner ? '✔' : 'en route'}`;
      if (H.host && me && partner && !H.robbing) {
        H.robbing = true; g.net.send({ t: 'coop', k: 'heistStage', stage: 'rob' }); H.stage = 'rob'; H.t = 0;
      }
    }
    if (H.stage === 'rob') {
      H.t = (H.t || 0) + dt; el.hidden = false; el.textContent = `💰 Hold-up en cours… ${Math.max(0, Math.ceil(12 - H.t))} s — tenez la position !`;
      if (!H.anim) { H.anim = true; g.actions.run({ arms: g.life.s.weapons && g.life.s.weapons.pistol ? 'aimP' : 'reach', dur: 3 }); g.audio && g.audio.scream(true); }
      if (H.host && H.t > 12) { g.net.send({ t: 'coop', k: 'heistStage', stage: 'escape' }); this.heistEscape(); }
    }
    if (H.stage === 'escape') {
      el.hidden = false; el.textContent = `🚨 Fuyez jusqu'à la planque (${hide.name}) et semez la police !`;
      g.checkpoint = hide.door.p.clone();
      const p = g.veh ? g.veh.pos : g.player.pos;
      if (p.distanceTo(hide.door.p) < 10 && g.police.wanted <= 1 && !H.arrived) { H.arrived = true; g.net.send({ t: 'coop', k: 'heistStage', stage: 'done' }); this.heistDone(); }
    }
  }
  heistEscape() {
    const g = this.g, H = this.heist; H.stage = 'escape';
    g.police.addWanted(3, 'braquage en duo', true);
    gpsTo(g, W.places[H.hide].door.p, 'Planque');
    this.viral('et son complice ont braqué ' + W.places[H.target].name);
  }
  heistDone() {
    const g = this.g, H = this.heist; if (!H || H.stage === 'over') return; H.stage = 'over';
    g.life.money(7500, 'part du braquage en duo'); g.life.notify('💰 Braquage réussi : 7 500 € chacun !', 'ok');
    g.checkpoint = null; g.gps = null; document.getElementById('mission').hidden = true; this.heist = null;
  }
}
