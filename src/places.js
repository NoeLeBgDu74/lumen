// Interactions avec les lieux : commerces, restaurants, station-service, logement, métiers, auto-école, concession, garage.
import * as THREE from 'three';
import * as W from './world.js';
import { CATALOG, PAINTS } from './cars.js';
import { fmt, gpsTo } from './life.js';
import { JOBS as NPCJOBS } from './npc.js';
import { WEAPONS } from './combat.js';

// Emplois accessibles au joueur.
export const PJOBS = {
  cashier:  { label: 'Caissier·ère', at: ['supermarket', 'gas_station'], pay: 13, start: 8, end: 17, act: 'cashier' },
  shelver:  { label: 'Employé·e de rayon', at: ['supermarket'], pay: 12, start: 6, end: 14, act: 'shift' },
  waiter:   { label: 'Serveur·se', at: ['restaurant', 'cafe'], pay: 12, start: 11, end: 20, act: 'shift', tips: true },
  office:   { label: 'Employé·e de bureau', at: ['office'], pay: 17, start: 9, end: 17, act: 'shift' },
  mechanic: { label: 'Mécanicien·ne', at: ['garage'], pay: 15, start: 8, end: 17, act: 'shift' },
  car_seller:{ label: 'Vendeur·se automobile', at: ['dealership'], pay: 14, start: 9, end: 18, act: 'shift', bonus: true },
  delivery: { label: 'Livreur·se', at: ['warehouse'], pay: 14, start: 7, end: 18, act: 'delivery', needLicense: true },
  taxi:     { label: 'Chauffeur·e de taxi', at: ['garage'], pay: 0, start: 0, end: 24, act: 'taxi', needLicense: true },
};
const pjobAt = (type) => Object.entries(PJOBS).filter(([, j]) => j.at.includes(type));

export class Places {
  constructor(game) { this.g = game; this.mission = null; }

  // Lieu interactif le plus proche (porte à moins de 3 m).
  nearest(pos) {
    let best = null, bd = 9;
    for (const p of W.places) {
      if (!p.door || !p.door.p) continue;
      const d = (p.door.p.x - pos.x) ** 2 + (p.door.p.z - pos.z) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  label(p) {
    const L = this.g.life.s;
    if (p.type === 'apartments') return L.home && L.home.id === p.id ? 'Rentrer chez moi' : 'Appartements : visiter / louer';
    if (p.type === 'house') return L.home && L.home.id === p.id ? 'Rentrer chez moi' : (p.name + ' · à vendre');
    return p.name;
  }
  hours(p) {
    return { bakery: [6, 20], supermarket: [8, 21], grocery: [8, 21], restaurant: [11, 23.5], cafe: [7, 22], bank: [9, 17], pharmacy: [9, 20], dealership: [9, 19], driving_school: [9, 18], gunshop: [10, 19], shop: [9, 19.5], garage: [8, 19] }[p.type] || null;
  }
  isOpen(p) { const h = this.hours(p); if (!h) return true; const t = this.g.hour; return t >= h[0] && t < h[1]; }
  open(p) {
    if (!this.isOpen(p)) {
      const h = this.hours(p), f = (x) => Math.floor(x) + 'h' + (x % 1 ? '30' : '');
      return this.g.life.panel(p.name + ' · FERMÉ', `<p>🔒 Ouvert de ${f(h[0])} à ${f(h[1])}. Revenez plus tard.</p>`, [
        { label: 'Forcer l’entrée (cambriolage) ⚠', run: () => { this.burgle(p); return false; } }]);
    }
    const fn = this['_' + p.type] || this._shop;
    fn.call(this, p);
  }
  jobButtons(p) {
    const L = this.g.life, s = L.s, out = [];
    for (const [k, j] of pjobAt(p.type)) {
      if (s.job === k && s.jobPlace === p.id) out.push({ label: `Travailler (${j.label.replace(/·\w+/, '')})`, primary: true, run: () => this.work(p, k) });
      else out.push({ label: `Postuler : ${j.label}${j.pay ? ' · ' + j.pay + ' €/h' : ''}`, run: () => this.apply(p, k) });
    }
    return out;
  }
  apply(p, k) {
    const j = PJOBS[k], L = this.g.life;
    if (j.needLicense && !L.s.license.permis) { L.notify('Il faut le permis de conduire pour ce poste', 'warn'); return; }
    L.s.job = k; L.s.jobPlace = p.id; L.notify(`Embauché·e : ${j.label} chez ${p.name}`, 'ok'); L.save();
  }
  async work(p, k) {
    const j = PJOBS[k], g = this.g, L = g.life; void 0;
    const h = g.hour;
    if (j.act === 'delivery') return this.startDelivery(p);
    if (j.act === 'taxi') return this.startTaxi();
    if (h < j.start - 0.5 || h > j.end - 1) { L.notify(`Horaires : ${j.start}h – ${j.end}h`, 'warn'); return; }
    if (L.s.needs.energie < 15) { L.notify('Trop fatigué·e pour travailler', 'warn'); return; }
    const hours = Math.min(j.end - h, 8);
    if (j.act === 'cashier') return this.cashierGame(p, j, hours);
    L.closePanel(); await g.actions.run({ arms: 'reach', dur: 1.2 });
    await L.skip(hours, () => {
      const pay = hours * j.pay + (j.tips ? 10 + Math.random() * 30 : 0) + (j.bonus && Math.random() < 0.35 ? 250 : 0);
      L.money(pay, `salaire (${hours.toFixed(1)} h)`);
      L.s.needs.energie = Math.max(0, L.s.needs.energie - hours * 6); L.s.needs.faim = Math.max(0, L.s.needs.faim - hours * 5); L.s.needs.social = Math.min(100, L.s.needs.social + 15);
      L.s.stats.worked += hours; L.s.stats.earned += pay;
    });
  }
  // Caisse : scanner les articles annoncés et rendre la monnaie juste.
  cashierGame(p, j, hours) {
    const L = this.g.life; let served = 0, errors = 0;
    const round = () => {
      const items = Array.from({ length: 2 + Math.floor(Math.random() * 3) }, () => PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)]);
      const total = items.reduce((a, b) => a + b[1], 0); const given = Math.ceil(total / 10) * 10 + (Math.random() < 0.5 ? 10 : 0);
      const change = Math.round((given - total) * 100) / 100;
      const opts = [change, Math.round((change + (Math.random() < 0.5 ? 1 : -1) * (0.5 + Math.random() * 2)) * 100) / 100, Math.round((change + 5) * 100) / 100].sort(() => Math.random() - 0.5);
      L.panel('Caisse · client ' + (served + errors + 1) + '/6', `<p>${items.map(i => `${i[0]} — ${i[1].toFixed(2)} €`).join('<br>')}</p><p><b>Total : ${total.toFixed(2)} €</b> · le client donne <b>${given} €</b>.</p><p>Quelle monnaie rendez-vous ?</p>`,
        opts.map(o => ({ label: o.toFixed(2) + ' €', keep: true, run: () => { if (Math.abs(o - change) < 0.01) served++; else errors++; if (served + errors < 6) round(); else finish(); } })));
    };
    const finish = async () => {
      L.closePanel();
      await L.skip(hours, () => { const pay = hours * j.pay * (0.6 + 0.4 * served / 6); L.money(pay, `salaire caisse (${served}/6 sans erreur)`); L.s.needs.energie -= hours * 5; L.s.needs.faim -= hours * 4; L.s.stats.worked += hours; });
    };
    round();
  }

  // ---------- commerces ----------
  _shop(p) {
    const L = this.g.life;
    if (/Mode/.test(p.name)) return this.clothes(p);
    L.panel(p.name, `<p>Un commerce du quartier.</p>`, [
      { label: 'Acheter un en-cas · 4 €', run: () => { if (L.money(-4, 'en-cas')) L.feed(18); } },
      { label: 'Cambrioler (la nuit) ⚠', run: () => { this.burgle(p); return false; } },
      ...this.jobButtons(p),
      ...this.robButton(p),
    ]);
  }
  _bakery(p) {
    const L = this.g.life;
    L.panel(p.name, `<p>Odeur de pain chaud.</p>`, [
      { label: 'Croissant & café · 3,50 €', run: () => { if (L.money(-3.5, 'petit-déjeuner')) { L.feed(25); L.s.needs.energie = Math.min(100, L.s.needs.energie + 8); } } },
      { label: 'Sandwich · 6 €', run: () => { if (L.money(-6, 'sandwich')) L.feed(45); } },
      ...this.robButton(p),
    ]);
  }
  _grocery(p) { this._supermarket(p); }
  _supermarket(p) {
    const L = this.g.life;
    L.panel(p.name, `<p>Courses pour la maison : <b>${L.s.food}</b> repas en stock chez vous.</p>`, [
      { label: 'Courses de la semaine (7 repas) · 48 €', run: () => { if (L.money(-48, 'courses')) L.s.food += 7; } },
      { label: 'Plat à emporter · 7 €', run: () => { if (L.money(-7, 'plat à emporter')) L.feed(40); } },
      { label: 'Boisson énergisante · 3 €', run: () => { if (L.money(-3, 'boisson')) L.s.needs.energie = Math.min(100, L.s.needs.energie + 15); } },
      ...this.jobButtons(p), ...this.robButton(p),
    ]);
  }
  _restaurant(p) {
    const L = this.g.life;
    L.panel(p.name, `<p>Une table vous attend.</p>`, [
      { label: 'Plat du jour · 16 €', run: () => { if (L.money(-16, 'restaurant')) { L.feed(70); L.s.needs.social = Math.min(100, L.s.needs.social + 12); L.s.needs.moral = Math.min(100, L.s.needs.moral + 8); } } },
      { label: 'Menu complet · 29 €', run: () => { if (L.money(-29, 'restaurant')) { L.feed(95); L.s.needs.social = Math.min(100, L.s.needs.social + 18); L.s.needs.moral = Math.min(100, L.s.needs.moral + 15); } } },
      ...this.jobButtons(p),
    ]);
  }
  _cafe(p) { this._restaurant(p); }
  _pharmacy(p) { const L = this.g.life; L.panel(p.name, '<p>Pharmacie.</p>', [{ label: 'Savon & soins · 9 €', run: () => { if (L.money(-9, 'pharmacie')) L.s.needs.hygiene = Math.min(100, L.s.needs.hygiene + 25); } }, ...this.robButton(p)]); }
  _bank(p) {
    const L = this.g.life;
    L.panel(p.name, `<p>Liquide : <b>${fmt(L.s.money)}</b> · Compte : <b>${fmt(L.s.bank)}</b><br><small>L'argent sur le compte est à l'abri en cas d'arrestation.</small></p>`, [
      { label: 'Déposer tout', run: () => { L.s.bank += L.s.money; L.s.money = 0; } },
      { label: 'Retirer 500 €', run: () => { const v = Math.min(500, L.s.bank); L.s.bank -= v; L.s.money += v; } },
    ]);
  }
  _gas_station(p) {
    const L = this.g.life;
    L.panel(p.name, `<p>Arrêtez-vous à une pompe en voiture et appuyez sur E pour faire le plein (1,85 €/L).</p>`, [
      { label: 'Café · 2 €', run: () => { if (L.money(-2, 'café')) L.s.needs.energie = Math.min(100, L.s.needs.energie + 6); } },
      { label: 'Bidon de 10 L · 22 €', run: () => { if (L.money(-22, 'bidon')) L.s.jerrycan = true; } },
      ...this.jobButtons(p), ...this.robButton(p),
    ]);
  }
  refuel(v) {
    const L = this.g.life; const spec = v.car.tpl.spec;
    const need = spec.fuel - v.fuel; if (need < 1) { L.notify('Réservoir plein'); return; }
    const liters = Math.min(need, L.s.money / 1.85); if (liters < 1) { L.notify('Pas assez d\'argent', 'warn'); return; }
    L.money(-liters * 1.85, `${liters.toFixed(0)} L de carburant`); v.fuel += liters;
  }
  _garage(p) {
    const L = this.g.life, v = this.g.veh;
    const btn = [];
    const owned = this.g.vehAI && this.g.vehAI.ownerIsPlayer;
    if (v) { const cost = Math.round(v.damage * 9); btn.push({ label: `Réparer la voiture · ${fmt(cost)}`, disabled: v.damage < 1, run: () => { if (L.money(-cost, 'réparation')) v.damage = 0; } }); }
    const ai = this.g.vehAI, own = ai && ai.ownedIdx !== undefined ? L.s.cars[ai.ownedIdx] : null;
    if (own) {
      own.mods = own.mods || {};
      btn.push({ label: `Moteur stage ${(own.mods.engine || 0) + 1} (+15 % puissance) · 1 500 €`, disabled: (own.mods.engine || 0) >= 3, keep: true, run: () => { if (L.money(-1500, 'préparation moteur')) { own.mods.engine = (own.mods.engine || 0) + 1; v.powerW *= 1.15 / (1 + 0.15 * (own.mods.engine - 1)) * (1 + 0.15 * (own.mods.engine - 1)); L.save(); this._garage(p); } } });
      btn.push({ label: 'Freins sport · 800 €', disabled: !!own.mods.brakes, keep: true, run: () => { if (L.money(-800, 'freins sport')) { own.mods.brakes = 1; v.brakeMul = 1.25; L.save(); this._garage(p); } } });
      btn.push({ label: 'Suspension sport · 700 €', disabled: !!own.mods.susp, keep: true, run: () => { if (L.money(-700, 'suspension sport')) { own.mods.susp = 1; v.gripMod = 1.08; L.save(); this._garage(p); } } });
      btn.push({ label: 'Vitres teintées · 300 €', disabled: !!own.mods.tint, keep: true, run: () => { if (L.money(-300, 'vitres teintées')) { own.mods.tint = 1; v.car.obj.traverse(o => { if (o.isMesh && o.material.transparent && o.material.opacity < 0.5) { o.material = o.material.clone(); o.material.opacity = 0.82; } }); L.save(); this._garage(p); } } });
      for (const col of ['#101114', '#f2f2f0', '#8a1c1c', '#1d3c78', '#2f5a3d', '#e0c341', '#b3541e', '#6b3f8c']) btn.push({ label: 'Peinture ' + col + ' · 450 €', keep: true, run: () => { if (L.money(-450, 'peinture')) { own.paint = col; if (v.car.paint) v.car.paint.color.set(col); L.save(); this._garage(p); } } });
    }
    L.panel(p.name, `<p>Garage et atelier.${v ? ' Dégâts : ' + Math.round(v.damage) + ' %' : ' Venez en voiture pour une réparation.'}${own ? '<br><b>Personnalisation de votre véhicule</b> (moteur stage ' + (own.mods.engine || 0) + '/3)' : v ? '<br><small>La personnalisation est réservée à vos véhicules.</small>' : ''}</p>`, [...btn, ...this.jobButtons(p)]);
    void owned;
  }
  _warehouse(p) { this.g.life.panel(p.name, '<p>Entrepôt de livraisons express.</p>', [...this.jobButtons(p), { label: 'Cambrioler l’entrepôt ⚠', run: () => { this.burgle(p); return false; } }]); }
  _factory(p) { this.g.life.panel(p.name, '<p>Usine — embauche sur place le matin.</p>', [{ label: 'Faire une journée d’intérim (6h-14h) · 11 €/h', run: () => this.temp(p, 11, 6, 14) }]); }
  _office(p) { this.g.life.panel(p.name, '<p>Tour de bureaux.</p>', [...this.jobButtons(p), { label: 'Cambrioler les bureaux ⚠', run: () => { this.burgle(p); return false; } }]); }
  _park(p) { const L = this.g.life; L.panel(p.name, '<p>Un coin de verdure.</p>', [{ label: 'Se détendre sur un banc (1 h)', run: () => L.skip(1, () => { L.s.needs.moral = Math.min(100, L.s.needs.moral + 15); L.s.needs.energie = Math.min(100, L.s.needs.energie + 5); }) }, { label: 'Faire un footing (1 h)', run: () => L.skip(1, () => { L.s.needs.moral = Math.min(100, L.s.needs.moral + 12); L.s.needs.energie -= 10; L.s.needs.hygiene -= 15; }) }]); }
  _sports(p) { this._park(p); }
  async temp(p, pay, a, b) { const L = this.g.life, h = this.g.hour; if (h > a + 1 || h < a - 1.5) { L.notify(`Présentez-vous vers ${a}h`, 'warn'); return; } await L.skip(b - h, () => { L.money((b - h) * pay, 'intérim'); L.s.needs.energie -= 40; }); }

  // ---------- boutique de vêtements ----------
  clothes(p) {
    const g = this.g, L = g.life, prof = g.profile;
    const tops = ['#3b5b8c', '#8c2f2f', '#2f6b47', '#e8e4da', '#1d1f24', '#c98a2b', '#6b3f8c', '#7d8a96', '#b85c7a', '#3c7d7a'];
    const pants = ['#2b2b30', '#3a4a66', '#5a4a3a', '#c9c2b4', '#1a1a1a', '#4b5b3b'];
    const apply = () => { try { localStorage.setItem('lw.profile', JSON.stringify(prof)); } catch (e) {} g.refreshPlayerChar && g.refreshPlayerChar(); };
    const sw = (c) => `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${c};vertical-align:middle;margin-right:6px"></span>`;
    L.panel(p.name, `<p>Prêt-à-porter. Essayez et achetez (les couleurs s'appliquent aussitôt).</p>`, [
      ...tops.map(c => ({ label: `${prof.top === c ? '✔ ' : ''}Haut ${c} · 60 €`, keep: true, run: () => { if (prof.top !== c && L.money(-60, 'vêtement')) { prof.top = c; apply(); this.clothes(p); } } })),
      ...pants.map(c => ({ label: `${prof.bottom === c ? '✔ ' : ''}Pantalon ${c} · 50 €`, keep: true, run: () => { if (prof.bottom !== c && L.money(-50, 'pantalon')) { prof.bottom = c; apply(); this.clothes(p); } } })),
      { label: prof.hat === false ? 'Remettre le chapeau · gratuit' : 'Enlever le chapeau', keep: true, run: () => { prof.hat = prof.hat === false; apply(); this.clothes(p); } },
    ]);
    void sw;
  }

  // ---------- armurerie ----------
  _gunshop(p) {
    const L = this.g.life, s = L.s;
    const btn = [];
    for (const [k, w] of Object.entries(WEAPONS)) {
      if (k === 'fists') continue;
      if (!s.weapons[k]) btn.push({ label: `Acheter : ${w.name} · ${fmt(w.price)}`, keep: true, run: () => { if (L.money(-w.price, w.name)) { s.weapons[k] = true; s.clip[k] = 0; L.notify(w.name + ' achetée — touche ' + w.key.slice(-1), 'ok'); this._gunshop(p); } } });
      else if (w.ammoPrice) btn.push({ label: `Munitions ${w.name} (+${w.clip * 3}) · ${fmt(w.ammoPrice)}`, keep: true, run: () => { if (L.money(-w.ammoPrice, 'munitions')) { s.ammo[k] = (s.ammo[k] || 0) + w.clip * 3; this._gunshop(p); } } });
    }
    L.panel(p.name, `<p>Armes : touches 1 à 5 · clic droit pour viser · clic gauche pour tirer · R pour recharger.<br>Munitions : pistolet ${s.ammo.pistol || 0} · fusil ${s.ammo.rifle || 0}</p>`, [...btn, ...this.robButton(p)]);
  }

  // ---------- cambriolage (immeubles, maisons, bureaux…) ----------
  burgle(p) {
    const g = this.g, L = g.life;
    if (p.robbedDay === g.day) { L.notify('Déjà cambriolé aujourd’hui', 'warn'); return; }
    const night = g.hour > 22 || g.hour < 5;
    const occupied = g.pop.people.some(q => q.at === p && q.state === 'inside');
    L.closePanel();
    L.notify('🔓 Crochetage de la serrure…');
    g.actions.run({ pose: 'crouch', arms: null, dur: 2.6, offsetY: -0.35 }).then(async () => {
      if (Math.random() < (night ? 0.12 : 0.35) + (occupied ? 0.3 : 0)) { L.notify('🚨 Repéré·e !', 'warn'); g.police.report(occupied ? 3 : 2, 'cambriolage', occupied ? 'L’occupant' : 'Un voisin', 3); return; }
      await L.skip(0.5, () => {
        p.robbedDay = g.day;
        const loot = Math.round((p.type === 'house' ? 300 + Math.random() * 1500 : p.type === 'office' || p.type === 'bank' ? 500 + Math.random() * 2500 : 120 + Math.random() * 700) * (night ? 1.2 : 0.8));
        L.money(loot, 'cambriolage · ' + p.name);
        if (Math.random() < 0.4) g.police.report(1, 'cambriolage', 'Un voisin', 20 + Math.random() * 30);
        for (const q of g.pop.people) if (q.home === p) g.pop.remember(q, 'a été cambriolé·e');
      });
    });
  }

  // ---------- logement ----------
  _apartments(p) {
    const L = this.g.life, s = L.s, mine = s.home && s.home.id === p.id;
    if (mine) return this.homeMenu();
    const rent = 520 + (p.floors || 5) * 25 + (p.district === 'D' ? 180 : 0);
    this._burgleBtn = { label: 'Cambrioler ⚠', run: () => { this.burgle(p); return false; } };
    L.panel(p.name, `<p>Appartement 2 pièces disponible.<br>Loyer : <b>${fmt(rent)}/mois</b> (prélevé chaque semaine) · caution ${fmt(rent)}.</p>${s.home ? '<p><small>Vous quitterez votre logement actuel.</small></p>' : ''}`, [
      this._burgleBtn,
      { label: 'Louer cet appartement', primary: true, run: () => { if (L.money(-rent, 'caution')) { s.home = { id: p.id, type: 'apartment', rent: rent / 4.3, name: p.name }; s.rentNext = this.g.day + 7; L.notify('Bienvenue chez vous !', 'ok'); L.save(); } } },
    ]);
  }
  _house(p) {
    const L = this.g.life, s = L.s, mine = s.home && s.home.id === p.id;
    if (mine) return this.homeMenu();
    const bb = { label: 'Cambrioler ⚠', run: () => { this.burgle(p); return false; } };
    L.panel(p.name, `<p>Maison individuelle avec jardin et garage.<br>Prix : <b>${fmt(p.price)}</b> · ou location <b>${fmt(p.rent * 4.3)}/mois</b>.</p>`, [
      bb,
      { label: 'Acheter (comptant)', disabled: s.money + s.bank < p.price, run: () => { let need = p.price; const fromCash = Math.min(s.money, need); s.money -= fromCash; need -= fromCash; s.bank -= need; s.home = { id: p.id, type: 'house', rent: 0, name: p.name, owned: true }; L.notify('Félicitations, vous êtes propriétaire !', 'ok'); L.save(); } },
      { label: 'Louer', run: () => { if (L.money(-p.rent * 4.3, 'caution')) { s.home = { id: p.id, type: 'house', rent: p.rent, name: p.name }; s.rentNext = this.g.day + 7; L.notify('Maison louée !', 'ok'); L.save(); } } },
    ]);
  }
  homeMenu() {
    const L = this.g.life, s = L.s, g = this.g;
    L.panel(s.home.name + ' · chez vous', `<p>Repas en stock : <b>${s.food}</b>.</p>`, [
      { label: '🚪 Entrer chez moi', primary: true, run: () => { g.homeInt.enter(); } },
      { label: 'Dormir jusqu’à 7h', run: () => { const h = g.hour; const dur = h < 7 ? 7 - h : 31 - h; L.skip(dur, () => { s.needs.energie = 100; s.needs.faim = Math.max(0, s.needs.faim - dur * 2); s.needs.hygiene -= 10; }); } },
      { label: 'Faire une sieste (2 h)', run: () => L.skip(2, () => { s.needs.energie = Math.min(100, s.needs.energie + 25); }) },
      { label: 'Cuisiner et manger', disabled: s.food < 1, run: () => { s.food--; L.feed(65); L.s.needs.moral = Math.min(100, L.s.needs.moral + 4); } },
      { label: 'Prendre une douche', run: () => L.skip(0.3, () => { s.needs.hygiene = 100; }) },
      { label: 'Regarder la télé (1 h)', run: () => L.skip(1, () => { s.needs.moral = Math.min(100, s.needs.moral + 12); }) },
    ]);
  }

  // ---------- concession ----------
  _dealership(p) {
    const L = this.g.life, s = L.s;
    const rows = CATALOG.map(c => `<div class="carrow"><b>${c.name}</b><span>${c.cls} · ${c.power} ch · ${c.top} km/h · ${c.cons} L/100</span><em>${fmt(c.price)}</em></div>`).join('');
    L.panel(p.name, `<p>Véhicules d’occasion révisés. ${s.license.permis ? '' : '<b>Permis requis pour l’immatriculation.</b>'}</p>${rows}<p>Vos véhicules : ${s.cars.length ? s.cars.map(c => CATALOG.find(x => x.id === c.id).name).join(', ') : 'aucun'}</p>`, [
      ...CATALOG.map(c => ({ label: 'Acheter ' + c.name.split(' ')[0], disabled: !s.license.permis || s.money + s.bank < c.price, run: () => this.buyCar(c) })),
      ...(s.cars.length ? [{ label: 'Revendre mon dernier véhicule', run: () => this.sellCar() }] : []),
      ...this.jobButtons(p),
    ]);
  }
  buyCar(c) {
    const L = this.g.life, s = L.s;
    let need = c.price; const fc = Math.min(s.money, need); s.money -= fc; need -= fc; s.bank -= need;
    const paint = PAINTS[Math.floor(Math.random() * PAINTS.length)];
    s.cars.push({ id: c.id, paint, fuel: c.fuel, damage: 0, km: 0 });
    L.notify(`${c.name} achetée ! Elle vous attend devant la concession.`, 'ok');
    this.g.spawnOwned(s.cars.length - 1, true); L.save();
  }
  sellCar() {
    const L = this.g.life, s = L.s; const c = s.cars.pop(); const spec = CATALOG.find(x => x.id === c.id);
    const val = Math.round(spec.price * 0.62 * (1 - (c.damage || 0) / 200));
    L.money(val, 'revente ' + spec.name); this.g.despawnOwned(s.cars.length); L.save();
  }

  // ---------- auto-école ----------
  _driving_school(p) {
    const L = this.g.life, lic = L.s.license;
    if (lic.permis) return L.panel(p.name, '<p>Vous avez déjà votre permis. Bonne route !</p>', []);
    const btn = [];
    if (!lic.enrolled) btn.push({ label: 'S’inscrire · 390 € (code + conduite)', primary: true, run: () => { if (L.money(-390, 'inscription auto-école')) { lic.enrolled = true; L.save(); } } });
    else {
      btn.push({ label: lic.code ? 'Code obtenu ✔' : 'Passer l’examen du code (40 questions → 10 ici)', disabled: lic.code, run: () => { this.codeExam(); return false; } });
      btn.push({ label: `Leçon de conduite (${lic.lessons}/2) · 45 €`, disabled: !lic.code, run: () => { if (L.money(-45, 'leçon de conduite')) this.startDriveTest(true); } });
      btn.push({ label: 'Examen pratique', disabled: !lic.code || lic.lessons < 2, run: () => this.startDriveTest(false) });
    }
    L.panel(p.name, `<p>Code : ${lic.code ? '✔' : '✘'} · Leçons : ${lic.lessons}/2 · Permis : ${lic.permis ? '✔' : '✘'}</p><p><small>L’examen pratique se fait dans la ville avec un moniteur : suivez les points, respectez les feux, les limitations (50 km/h) et évitez tout choc.</small></p>`, btn);
  }
  codeExam() {
    const L = this.g.life; const qs = CODE.slice().sort(() => Math.random() - 0.5).slice(0, 10); let i = 0, ok = 0;
    const ask = () => {
      const q = qs[i];
      L.panel(`Code de la route · question ${i + 1}/10`, `<p>${q.q}</p>`, q.a.map((a, k) => ({ label: a, keep: true, run: () => { if (k === q.c) ok++; i++; if (i < 10) ask(); else done(); } })));
    };
    const done = () => {
      const lic = L.s.license;
      if (ok >= 8) { lic.code = true; L.panel('Résultat', `<p><b>${ok}/10</b> — Code obtenu ! 🎉</p>`, []); }
      else L.panel('Résultat', `<p><b>${ok}/10</b> — Il faut au moins 8/10. Révisez et réessayez.</p>`, []);
      L.save();
    };
    ask();
  }
  startDriveTest(lesson) {
    const g = this.g, L = g.life;
    // voiture d'auto-école garée devant
    const school = W.places.find(p => p.type === 'driving_school');
    const ai = g.spawnTempCar('ace11', '#f2f2f0', school.door.p);
    const route = [];
    let n = W.nearestNode(school.door.p.x, school.door.p.z), prev = -1;
    for (let k = 0; k < 6; k++) { const opts = W.nodes[n].links.map(e => W.edges[e]).filter(e => e.b !== prev && e.kind === 'city'); const e = opts[Math.floor(Math.random() * opts.length)]; prev = n; n = e.b; route.push(new THREE.Vector3(W.nodes[n].x, 0, W.nodes[n].z).addScaledVector(e.dir, -W.RW - 8).add(new THREE.Vector3(-e.dir.z, 0, e.dir.x).multiplyScalar(W.LANE))); }
    this.mission = { type: lesson ? 'lesson' : 'exam', pts: route, i: 0, faults: [], car: ai, t: 0, maxSpeed: 0 };
    L.notify(lesson ? 'Leçon : montez dans la voiture blanche (F) et suivez les points' : 'Examen : montez dans la voiture (F), suivez les points. Fautes éliminatoires : feu rouge, choc, > 60 km/h', 'ok');
    g.checkpoint = route[0];
  }

  // ---------- livraisons / taxi / missions ----------
  startDelivery(p) {
    const g = this.g, L = g.life;
    const ai = g.spawnTempCar('lightbody90', '#e8e4da', p.door.p);
    const dests = W.places.filter(x => (x.type === 'house' || x.type === 'apartments' || x.type === 'shop') && x.door).sort(() => Math.random() - 0.5).slice(0, 3);
    this.mission = { type: 'delivery', dests, i: 0, car: ai, t: 0, start: g.time, pay: 0 };
    g.checkpoint = dests[0].door.p.clone(); gpsTo(g, g.checkpoint, 'Livraison 1/3 : ' + dests[0].name);
    L.notify('Livraisons : prenez l’utilitaire (F) et livrez 3 colis', 'ok');
  }
  startTaxi() {
    const g = this.g, L = g.life;
    if (!g.veh || g.veh.car.tpl.spec.id !== 'canyon75taxi') { L.notify('Il faut être au volant d’un taxi (Canyon ’75 Taxi)', 'warn'); return; }
    this.nextFare();
  }
  nextFare() {
    const g = this.g; const from = W.places.filter(p => p.door).sort(() => Math.random() - 0.5)[0], to = W.places.filter(p => p.door && p !== from).sort(() => Math.random() - 0.5)[0];
    this.mission = { type: 'taxi', from, to, stage: 'pickup', t: 0 };
    g.checkpoint = from.door.p.clone(); gpsTo(g, g.checkpoint, 'Client à prendre : ' + from.name);
  }

  // Robbing (GTA) : braquer la caisse d'un commerce → argent + recherche.
  robButton(p) {
    return [{ label: 'Braquer la caisse ⚠', run: () => {
      const g = this.g, L = g.life; if (g.lastRob && g.time - g.lastRob < 120) { L.notify('Trop tôt, la police surveille', 'warn'); return; }
      g.lastRob = g.time; const loot = 150 + Math.floor(Math.random() * 450); const armed = L.s.weapons && (L.s.weapons.pistol || L.s.weapons.rifle);
      L.closePanel(); L.notify(armed ? '🔫 « Le contenu de la caisse, vite ! »' : '✊ « La caisse, maintenant ! »', 'warn');
      g.actions.run({ arms: armed ? 'aimP' : 'reach', dur: 2.4 }).then(() => { L.money(armed ? loot : Math.round(loot * 0.5), 'braquage de ' + p.name); g.police.report(3, 'braquage de ' + p.name, 'Le commerçant'); });
      return false;
    } }];
  }

  update(dt) {
    const g = this.g, m = this.mission; if (!m) return;
    const pos = g.veh ? g.veh.pos : g.player.pos;
    const L = g.life;
    if (m.type === 'lesson' || m.type === 'exam') {
      if (!g.veh || g.vehAI !== m.car) { m.t += dt; if (m.t > 120 && !g.veh) { L.notify('Examen annulé'); this.endMission(); } return; }
      m.maxSpeed = Math.max(m.maxSpeed, g.veh.kmh);
      if (g.veh.kmh > 60 && !m.speedFault) { m.speedFault = true; m.faults.push('excès de vitesse'); L.notify('Faute : excès de vitesse', 'warn'); }
      if (g.veh.lastHit > 2) { g.veh.lastHit = 0; m.faults.push('choc'); L.notify('Faute : choc', 'warn'); }
      if (g.ranRed) { g.ranRed = false; m.faults.push('feu rouge grillé'); L.notify('Faute : feu rouge grillé', 'warn'); }
      const cp = m.pts[m.i]; g.checkpoint = cp;
      if (pos.distanceTo(cp) < 6) { m.i++; if (m.i >= m.pts.length) {
        const lic = L.s.license;
        if (m.type === 'lesson') { lic.lessons = Math.min(2, lic.lessons + 1); L.notify(`Leçon terminée (${m.faults.length} faute(s)). Leçons : ${lic.lessons}/2`, 'ok'); }
        else if (!m.faults.length) { lic.permis = true; g.license = true; L.notify('🎉 Permis de conduire obtenu !', 'ok'); }
        else L.notify('Examen échoué : ' + m.faults.join(', '), 'warn');
        L.save(); this.endMission();
      } }
    } else if (m.type === 'delivery') {
      const d = m.dests[m.i];
      if (pos.distanceTo(d.door.p) < 6 && g.veh && g.veh.kmh < 5) {
        L.money(38, `colis livré (${d.name})`); m.i++;
        if (m.i >= m.dests.length) { const bonus = g.time - m.start < 360 ? 60 : 0; if (bonus) L.money(bonus, 'prime de rapidité'); L.notify('Tournée terminée, rapportez l’utilitaire quand vous voulez', 'ok'); this.endMission(); }
        else { g.checkpoint = m.dests[m.i].door.p.clone(); gpsTo(g, g.checkpoint, `Livraison ${m.i + 1}/3 : ${m.dests[m.i].name}`); }
      }
    } else if (m.type === 'taxi') {
      if (!g.veh) return;
      if (m.stage === 'pickup' && pos.distanceTo(m.from.door.p) < 8 && g.veh.kmh < 4) { m.stage = 'ride'; m.t0 = g.time; g.checkpoint = m.to.door.p.clone(); gpsTo(g, g.checkpoint, 'Déposer le client : ' + m.to.name); L.notify('Client à bord'); }
      else if (m.stage === 'ride' && pos.distanceTo(m.to.door.p) < 8 && g.veh.kmh < 4) {
        const d = m.from.door.p.distanceTo(m.to.door.p); const fare = 4 + d * 0.012 + (g.time - m.t0 < d / 9 ? 5 : 0);
        L.money(fare, 'course de taxi'); this.nextFare();
      }
    }
  }
  endMission() { const g = this.g; const m = this.mission; this.mission = null; g.checkpoint = null; g.gps = null; if (m && m.car && g.vehAI !== m.car) g.removeCar(m.car); else if (m && m.car) m.car.temp = true; }
}

const PRODUCTS = [['Pain', 1.2], ['Lait', 1.05], ['Pâtes', 1.49], ['Café', 4.3], ['Pommes 1 kg', 2.6], ['Fromage', 3.75], ['Jus d’orange', 2.2], ['Poulet', 6.9], ['Yaourts', 1.8], ['Chocolat', 2.15], ['Riz', 1.95], ['Tomates', 2.4]];
const CODE = [
  { q: 'En agglomération, sauf indication contraire, la vitesse est limitée à :', a: ['30 km/h', '50 km/h', '70 km/h'], c: 1 },
  { q: 'Le feu passe à l’orange alors que je suis tout près de la ligne et ne peux pas m’arrêter sans danger :', a: ['Je m’arrête brutalement', 'Je passe prudemment', 'J’accélère fort'], c: 1 },
  { q: 'Un piéton est engagé sur un passage piéton :', a: ['Je klaxonne', 'Je le laisse traverser', 'Je passe derrière lui'], c: 1 },
  { q: 'Le taux d’alcool maximal autorisé pour un permis probatoire est :', a: ['0,2 g/L de sang', '0,5 g/L', '0,8 g/L'], c: 0 },
  { q: 'Sur route sèche, la distance de sécurité correspond environ à :', a: ['1 seconde', '2 secondes', '5 secondes'], c: 1 },
  { q: 'À une intersection sans panneau ni feu, la priorité est :', a: ['À gauche', 'À droite', 'Au plus rapide'], c: 1 },
  { q: 'Le téléphone tenu en main en conduisant est :', a: ['Autorisé à l’arrêt au feu', 'Interdit', 'Autorisé en kit'], c: 1 },
  { q: 'Sur autoroute par temps sec, la vitesse maximale (permis confirmé) est :', a: ['110 km/h', '130 km/h', '150 km/h'], c: 1 },
  { q: 'Les feux de croisement doivent être allumés :', a: ['La nuit et par mauvaise visibilité', 'Seulement en tunnel', 'Jamais en ville'], c: 0 },
  { q: 'Avant de changer de file, je dois :', a: ['Klaxonner', 'Contrôler rétroviseurs et angle mort, puis clignoter', 'Accélérer'], c: 1 },
  { q: 'Une ligne blanche continue :', a: ['Peut être franchie pour doubler', 'Ne doit pas être franchie', 'Signale un parking'], c: 1 },
  { q: 'Le permis probatoire compte au départ :', a: ['6 points', '12 points', '8 points'], c: 0 },
  { q: 'Par temps de pluie, la vitesse sur route (80 km/h) devient :', a: ['70 km/h', '80 km/h', '60 km/h'], c: 0 },
  { q: 'Un panneau triangulaire à bord rouge indique :', a: ['Une obligation', 'Un danger', 'Une indication'], c: 1 },
];
void NPCJOBS;
