// Mode histoire : « Lumen » — 6 missions enchaînées avec cinématiques (bandes noires, caméra de cinéma,
// personnages animés qui parlent, sous-titres), objectifs, marqueurs/GPS, réussite et échec.
import * as THREE from 'three';
import * as W from './world.js';
import { Character } from './chars.js';
import { gpsTo } from './life.js';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const place = (t) => W.places.find(p => p.type === t && p.door);

export class Story {
  constructor(game) {
    this.g = game; const s = game.life.s; s.story = s.story || { ch: 0, done: [] };
    this.actors = []; this.obj = null; this.cine = false;
    this.el = document.createElement('div'); this.el.id = 'cine'; this.el.innerHTML = '<div class="bar top"></div><div class="bar bot"></div><div id="sub"></div><div id="chap"></div>'; document.body.appendChild(this.el);
    setTimeout(() => this.offer(), 4000);
  }
  get ch() { return this.g.life.s.story.ch; }
  offer() {
    const C = CHAPTERS[this.ch]; if (!C) return;
    this.g.life.notify(`📖 Histoire — ${C.title} : ${C.hint}`, 'ok');
    this.g.storyMarker = C.start(this.g);
  }
  near(pos) { const m = this.g.storyMarker; return m && !this.running && m.distanceTo(new THREE.Vector3(pos.x, 0, pos.z)) < 3; }
  async start() {
    const C = CHAPTERS[this.ch]; if (!C || this.running) return;
    this.running = true; this.g.storyMarker = null;
    try { const ok = await C.run(this, this.g); if (ok !== false) { this.g.life.s.story.ch++; this.g.life.save(); await this.title('MISSION RÉUSSIE', C.title, 2600); if (C.reward) this.g.life.money(C.reward, 'mission : ' + C.title); } else await this.title('MISSION ÉCHOUÉE', 'Réessayez', 2200); }
    catch (e) { console.error(e); }
    this.cleanup(); this.running = false; this.g.checkpoint = null; this.g.gps = null;
    setTimeout(() => this.offer(), 3000);
  }
  // ---------- outils de mise en scène ----------
  actor(model, pos, yaw, tint) {
    const base = this.g.charBases[model] || this.g.charBases.rpm;
    const a = new Character(base, { tint }); a.obj.position.copy(pos); a.obj.rotation.y = yaw; a.play('idle', 0); this.g.R.scene.add(a.obj); this.actors.push(a); return a;
  }
  cleanup() { for (const a of this.actors) this.g.R.scene.remove(a.obj); this.actors = []; this.cineOff(); }
  async title(big, small, ms) { const c = $('chap'); c.innerHTML = `<b>${big}</b><span>${small}</span>`; c.classList.add('on'); await wait(ms); c.classList.remove('on'); }
  cineOn() { this.cine = true; this.el.classList.add('on'); this.g.input.enabled = false; this.g.cineCam = true; document.exitPointerLock?.(); }
  cineOff() { this.cine = false; this.el.classList.remove('on'); this.g.input.enabled = true; this.g.cineCam = false; $('sub').textContent = ''; }
  // plan de caméra : orbite lente autour d'un point
  shot(target, dist = 4, height = 1.6, yaw = 0, drift = 0.06) { this.camShot = { target: target.clone(), dist, height, yaw, drift, t: 0 }; }
  async say(who, text, actor, ms) {
    $('sub').innerHTML = `<b>${who}</b> ${text}`;
    if (actor) actor.play(actor.has('talk') ? 'talk' : 'idle', 0.3);
    await wait(ms || Math.max(2200, text.length * 55));
    if (actor) actor.play('idle', 0.3);
  }
  update(dt) {
    for (const a of this.actors) a.update(dt);
    if (this.g.cineCam && this.camShot) {
      const s = this.camShot; s.t += dt; const y = s.yaw + s.t * s.drift; const cam = this.g.R.camera;
      cam.position.set(s.target.x + Math.sin(y) * s.dist, s.target.y + s.height, s.target.z + Math.cos(y) * s.dist);
      cam.lookAt(s.target.x, s.target.y + 1.3, s.target.z); cam.userData.focus = s.target;
    }
  }
  // objectif : atteindre un point (à pied ou en voiture), avec échec optionnel
  goal(text, pos, { radius = 6, car = false, fail = null, timeout = 0 } = {}) {
    const g = this.g; g.checkpoint = pos.clone(); gpsTo(g, pos, text); g.life.notify('🎯 ' + text);
    const t0 = g.time;
    return new Promise(res => {
      const tick = () => {
        const p = g.veh ? g.veh.pos : g.player.pos;
        if (fail && fail()) return res(false);
        if (timeout && g.time - t0 > timeout) return res(false);
        if (p.distanceTo(pos) < radius && (!car || g.veh)) { g.checkpoint = null; g.gps = null; return res(true); }
        setTimeout(tick, 250);
      };
      tick();
    });
  }
}

// ---------- scénario ----------
const KARIM = { Outfit_Top: new THREE.Color(0x8c2f2f).multiplyScalar(1.5), Outfit_Bottom: new THREE.Color(0x2b2b30).multiplyScalar(1.5) };
const DIMA = { Outfit_Top: new THREE.Color(0x1d1f24).multiplyScalar(1.5), Outfit_Bottom: new THREE.Color(0x1a1a1a).multiplyScalar(1.5) };
const CHAPTERS = [
  { title: '1 · Nouveau départ', hint: 'retrouvez votre cousin Karim devant chez vous (marqueur jaune)', reward: 300,
    start: (g) => g.home.door.p.clone().add(g.home.door.nrm.clone().multiplyScalar(2.5)),
    run: async (S, g) => {
      const d = g.home.door, p0 = d.p.clone().add(d.nrm.clone().multiplyScalar(2.5));
      const k = S.actor('rpm', p0.clone().add(new THREE.Vector3(1.2, 0.15, 0)), Math.atan2(-1, 0), KARIM);
      g.player.place(p0.x - 0.4, p0.z, Math.atan2(1, 0));
      S.cineOn(); S.shot(p0, 4.5, 1.4, Math.atan2(d.nrm.x, d.nrm.z) + 0.6); await S.title('LUMEN', 'Chapitre 1 — Nouveau départ', 2800);
      await S.say('Karim :', `${g.profile.first} ! Enfin ! Bienvenue à Lumen, cousin.`, k);
      await S.say('Karim :', 'Ici, tout coûte cher. Il te faut un boulot, et vite. Le supermarché embauche.', k);
      await S.say('Karim :', 'Et passe ton permis : sans voiture, tu n’iras pas loin. Allez, je t’attends au boulot.', k);
      S.cineOff(); k.play('walk'); setTimeout(() => S.cleanup(), 3000);
      return S.goal('Allez au supermarché', place('supermarket').door.p);
    } },
  { title: '2 · Premier salaire', hint: 'travaillez une journée (n’importe quel emploi), puis revenez voir Karim', reward: 200,
    start: (g) => place('supermarket').door.p.clone().add(new THREE.Vector3(2, 0, 4)),
    run: async (S, g) => {
      const start = g.life.s.stats.worked;
      g.life.notify('💼 Postulez et travaillez (E à l’entrée d’un commerce, bureau, garage…)');
      while (g.life.s.stats.worked < start + 3) await wait(1000);
      const p = place('restaurant').door.p;
      return S.goal('Karim vous invite au restaurant pour fêter ça', p);
    } },
  { title: '3 · Mauvaises fréquentations', hint: 'Karim vous présente Dima, au restaurant', reward: 0,
    start: (g) => place('restaurant').door.p.clone().add(new THREE.Vector3(0, 0, 3)),
    run: async (S, g) => {
      const p0 = place('restaurant').door.p.clone().add(new THREE.Vector3(0, 0.15, 3));
      const k = S.actor('rpm', p0.clone().add(new THREE.Vector3(1.2, 0, 0)), -Math.PI / 2, KARIM);
      const dm = S.actor('soldier', p0.clone().add(new THREE.Vector3(0.4, 0, 1.4)), Math.PI, DIMA);
      g.player.place(p0.x - 0.6, p0.z, Math.PI / 2);
      S.cineOn(); S.shot(p0, 4.8, 1.5, 0.4); await S.title('', 'Chapitre 3 — Mauvaises fréquentations', 2200);
      await S.say('Dima :', 'Alors c’est toi le cousin. Karim me doit de l’argent. Beaucoup d’argent.', dm);
      await S.say('Karim :', 'Dima… je t’ai dit que je te rembourserai.', k);
      await S.say('Dima :', `Toi, ${g.profile.first}, tu vas m’aider. Une voiture, garée près de l’usine. Tu me l’amènes au garage.`, dm);
      S.cineOff();
      const target = g.traffic.cars.filter(c => c.state === 'parked' && !c.ownerIsPlayer).sort((a, b) => a.pos.distanceTo(place('factory') ? place('factory').door.p : a.pos) - b.pos.distanceTo(place('factory') ? place('factory').door.p : b.pos))[0];
      if (!target) return true;
      target.storyCar = true;
      const okGo = await S.goal('Volez la voiture désignée', target.pos.clone(), { radius: 4 });
      if (!okGo) return false;
      while (g.vehAI !== target) await wait(500);
      g.police.addWanted(2, 'vol de véhicule', true);
      const ok = await S.goal('Livrez la voiture au garage (semez la police si possible)', place('garage').door.p.clone().add(new THREE.Vector3(0, 0, 6)), { car: true, radius: 8 });
      if (ok) { g.life.notify('Dima : « Pas mal. On se reparle. »'); g.forceExit(); }
      return ok;
    }, reward2: 800 },
  { title: '4 · Le colis', hint: 'Dima vous attend à l’entrepôt', reward: 1500,
    start: (g) => place('warehouse').door.p.clone().add(new THREE.Vector3(0, 0, 3)),
    run: async (S, g) => {
      const p0 = place('warehouse').door.p.clone().add(new THREE.Vector3(0, 0.15, 3));
      const dm = S.actor('soldier', p0.clone().add(new THREE.Vector3(1, 0, 0)), -Math.PI / 2, DIMA);
      g.player.place(p0.x - 0.5, p0.z, Math.PI / 2);
      S.cineOn(); S.shot(p0, 4, 1.4, 1.2);
      await S.say('Dima :', 'Ce sac va de l’autre côté de la ville. Ne l’ouvre pas. Ne te fais pas prendre.', dm);
      await S.say('Dima :', 'Tu as trois minutes. Après, je considère que tu m’as volé.', dm);
      S.cineOff();
      const dest = W.places.filter(p => p.type === 'house' && p.door).sort((a, b) => b.door.p.distanceTo(p0) - a.door.p.distanceTo(p0))[0].door.p;
      setTimeout(() => g.police.addWanted(2, 'transport suspect', true), 25000);
      return S.goal('Livrez le colis (3 min)', dest, { timeout: 180, radius: 5 });
    } },
  { title: '5 · Le casse', hint: 'le grand coup : la banque du centre', reward: 0,
    start: (g) => place('bank').door.p.clone().add(new THREE.Vector3(0, 0, 4)),
    run: async (S, g) => {
      const p0 = place('bank').door.p.clone().add(new THREE.Vector3(0, 0.15, 4));
      const k = S.actor('rpm', p0.clone().add(new THREE.Vector3(1.2, 0, 0)), -Math.PI / 2, KARIM);
      g.player.place(p0.x - 0.5, p0.z, Math.PI / 2);
      S.cineOn(); S.shot(p0, 4.2, 1.5, 2.0);
      await S.say('Karim :', 'Dima veut qu’on braque la banque. Après ça, ma dette est effacée.', k);
      await S.say('Karim :', 'Moi j’ai peur. Mais si on ne le fait pas… Je compte sur toi.', k);
      S.cineOff();
      await g.actions.run({ to: place('bank').door.p.clone(), arms: (g.life.s.weapons.pistol ? 'aimP' : 'reach'), dur: 3 });
      g.life.money(18000, 'casse de la banque'); g.police.addWanted(4, 'braquage de banque', true);
      const hide = place('park') ? new THREE.Vector3(place('park').x, 0, place('park').z) : g.home.door.p;
      const ok = await S.goal('Fuyez et semez la police, puis rejoignez Karim au parc', hide, { fail: () => false, radius: 10 });
      while (g.police.wanted > 0) await wait(1000);
      return ok;
    } },
  { title: '6 · Le choix', hint: 'Karim vous attend au parc : décidez de votre avenir', reward: 5000,
    start: (g) => { const p = place('park'); return new THREE.Vector3(p.x, 0, p.z + 4); },
    run: async (S, g) => {
      const pk = place('park'); const p0 = new THREE.Vector3(pk.x, 0.15, pk.z + 4);
      const k = S.actor('rpm', p0.clone().add(new THREE.Vector3(1.2, 0, 0)), -Math.PI / 2, KARIM);
      g.player.place(p0.x - 0.5, p0.z, Math.PI / 2);
      S.cineOn(); S.shot(p0, 5, 1.6, 0.8);
      await S.say('Karim :', 'On l’a fait. Mais Dima ne s’arrêtera jamais. Il faut choisir.', k);
      S.cineOff();
      const choice = await new Promise(res => g.life.panel('Le choix', '<p>Dénoncer Dima à la police (vie honnête, prime) ou prendre sa place (respect de la rue, argent sale) ?</p>', [
        { label: 'Dénoncer Dima à la police', primary: true, run: () => res('police') }, { label: 'Prendre la place de Dima', run: () => res('gang') }]));
      S.cineOn(); S.shot(p0, 3.5, 1.5, 2.4);
      if (choice === 'police') { await S.say('Karim :', 'Tu as raison. On repart de zéro. Merci, cousin.', k); g.life.s.story.ending = 'honnête'; }
      else { await S.say('Karim :', 'Alors Lumen est à nous… Fais attention à toi.', k); g.life.s.story.ending = 'rue'; g.life.money(10000, 'part du gang'); }
      S.cineOff(); await S.title('FIN', choice === 'police' ? 'Une vie honnête vous attend' : 'La rue est à vous', 3200);
      return true;
    } },
];
