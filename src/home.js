// Intérieur du logement du joueur : appartement meublé (mobilier Poly Haven), éclairage propre,
// collisions, points d'interaction (lit, télé, cuisine, douche, dressing, porte).
import * as THREE from 'three';
import { glb, pbr } from './assets.js';
import { StaticWorld } from './physics.js';

const ORIGIN = new THREE.Vector3(0, 0, 3200); // loin de la ville
const W_ = 11, D_ = 8, H_ = 2.8;

export class HomeInterior {
  constructor(game) {
    this.g = game; this.group = new THREE.Group(); this.group.position.copy(ORIGIN); this.group.visible = false;
    game.R.scene.add(this.group); this.inside = false; this.built = false;
    this.spots = [];
  }
  async build() {
    if (this.built) return; this.built = true;
    const G = this.group, M = this.g.M;
    const floor = pbr('wood_floor', { scale: 1.6 }), wall = pbr('grey_plaster', { scale: 2.5, color: 0xf1ece4 }), tile = pbr('marble_tiles', { scale: 1.2 });
    const plane = (w, h, mat, rotX, pos) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.rotation.x = rotX; m.position.copy(pos); m.receiveShadow = true; uvScale(m.geometry, w, h); G.add(m); return m; };
    plane(W_, D_, floor, -Math.PI / 2, new THREE.Vector3(0, 0, 0));
    plane(W_, D_, new THREE.MeshStandardMaterial({ color: 0xf4f2ee, roughness: 0.9 }), Math.PI / 2, new THREE.Vector3(0, H_, 0));
    plane(3, 2.6, tile, -Math.PI / 2, new THREE.Vector3(W_ / 2 - 1.5, 0.005, -D_ / 2 + 1.3));
    const wallM = (w, pos, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H_), wall); m.position.copy(pos); m.rotation.y = ry; uvScale(m.geometry, w, H_); m.receiveShadow = true; G.add(m); };
    wallM(W_, new THREE.Vector3(0, H_ / 2, -D_ / 2), 0); wallM(W_, new THREE.Vector3(0, H_ / 2, D_ / 2), Math.PI);
    wallM(D_, new THREE.Vector3(-W_ / 2, H_ / 2, 0), Math.PI / 2); wallM(D_, new THREE.Vector3(W_ / 2, H_ / 2, 0), -Math.PI / 2);
    // cloison salle de bain
    const part = new THREE.Mesh(new THREE.BoxGeometry(0.12, H_, 2.6), wall); part.position.set(W_ / 2 - 3, H_ / 2, -D_ / 2 + 1.3); G.add(part);
    // fenêtres lumineuses (jour/nuit)
    this.winMat = new THREE.MeshBasicMaterial({ color: 0xcfe2ff, toneMapped: true });
    for (const x of [-3, 0.5]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.5), this.winMat); w.position.set(x, 1.55, -D_ / 2 + 0.01); G.add(w);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.65, 0.06), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 })); fr.position.set(x, 1.55, -D_ / 2 + 0.005); fr.scale.z = 0.3; G.add(fr);
      const sheer = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 2.3), new THREE.MeshStandardMaterial({ color: 0xf6f1e6, transparent: true, opacity: 0.75, side: THREE.DoubleSide })); sheer.position.set(x - 1.05, 1.4, -D_ / 2 + 0.12); G.add(sheer); }
    // plinthes
    const sk = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    for (const [w, x, z, ry] of [[W_, 0, -D_ / 2 + 0.01, 0], [W_, 0, D_ / 2 - 0.01, 0], [D_, -W_ / 2 + 0.01, 0, Math.PI / 2], [D_, W_ / 2 - 0.01, 0, Math.PI / 2]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 0.02), sk); b.position.set(x, 0.05, z); b.rotation.y = ry; G.add(b); }
    // cuisine (meubles bas + plan de travail + crédence + frigo)
    const cab = new THREE.MeshStandardMaterial({ color: 0x2f3b45, roughness: 0.5 }), top = pbr('marble_tiles', { scale: 0.8, color: 0xf2f2f2 });
    const counter = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.88, 0.62), cab); counter.position.set(-W_ / 2 + 1.7, 0.44, D_ / 2 - 0.32); G.add(counter);
    const ct = new THREE.Mesh(new THREE.BoxGeometry(3.24, 0.04, 0.66), top); ct.position.set(-W_ / 2 + 1.7, 0.9, D_ / 2 - 0.33); G.add(ct);
    for (let k = 0; k < 5; k++) { const h = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.015, 0.02), new THREE.MeshStandardMaterial({ color: 0xbfc4c9, metalness: 1, roughness: 0.3 })); h.position.set(-W_ / 2 + 0.45 + k * 0.62, 0.75, D_ / 2 - 0.62); G.add(h); }
    const fridge = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.85, 0.66), new THREE.MeshStandardMaterial({ color: 0xd8dadd, metalness: 0.6, roughness: 0.25 })); fridge.position.set(-W_ / 2 + 3.7, 0.925, D_ / 2 - 0.34); G.add(fridge);
    // salle de bain : douche vitrée
    const glassM = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.05 });
    const sh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.02), glassM); sh.position.set(W_ / 2 - 1.2, 1.05, -D_ / 2 + 1.2); G.add(sh); this.showerGlass = glassM;
    this.steam = new THREE.Group(); for (let k = 0; k < 14; k++) { const sp = new THREE.Mesh(new THREE.SphereGeometry(0.25 + Math.random() * 0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })); sp.position.set(W_ / 2 - 1.2 + (Math.random() - 0.5) * 0.9, 0.8 + Math.random() * 1.6, -D_ / 2 + 0.6 + (Math.random() - 0.5) * 0.8); this.steam.add(sp); } G.add(this.steam);
    // lumières
    const amb = new THREE.HemisphereLight(0xfff4e6, 0x403528, 0.55); G.add(amb);
    for (const [x, z] of [[-2.5, 0], [2.2, 1.5], [-W_ / 2 + 1.7, D_ / 2 - 1]]) { const l = new THREE.PointLight(0xffd9a8, 5, 9, 1.6); l.position.set(x, H_ - 0.25, z); G.add(l);
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.2, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0xf2e6d0, emissive: 0xffd9a8, emissiveIntensity: 0.6, side: THREE.DoubleSide })); shade.position.set(x, H_ - 0.3, z); G.add(shade); }
    // mobilier
    const place = async (name, x, z, ry = 0, s = 1) => {
      try { const g = await glb('assets/props/' + name + '.glb'); const o = g.scene.clone(true); o.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
        const b = new THREE.Box3().setFromObject(o); o.scale.setScalar(s); o.position.set(x, -b.min.y * s, z); o.rotation.y = ry; G.add(o); } catch (e) {}
    };
    await Promise.all([
      place('Sofa_01', -2.6, 1.6, Math.PI, 1), place('modern_arm_chair_01', -0.6, 0.6, -Math.PI / 2 - 0.4), place('modern_coffee_table_01', -2.6, 0.4, 0),
      place('Television_01', -2.6, -1.0, 0, 1), place('Shelf_01', -W_ / 2 + 0.3, -1.6, Math.PI / 2), place('GothicBed_01', 3.0, 1.6, Math.PI, 1),
      place('dining_table', 0.6, 2.6, 0), place('WoodenChair_01', 0.0, 2.6, Math.PI / 2), place('WoodenChair_01', 1.2, 2.6, -Math.PI / 2),
      place('potted_plant_01', -W_ / 2 + 0.5, -D_ / 2 + 0.5), place('potted_plant_02', 1.6, -D_ / 2 + 0.6), place('bar_chair_round_01', -W_ / 2 + 2.6, D_ / 2 - 1.0),
    ]);
    // collisions (murs + gros meubles), en coordonnées monde
    const O = ORIGIN, c = [];
    const box = (x0, z0, x1, z1) => c.push({ x0: O.x + x0, z0: O.z + z0, x1: O.x + x1, z1: O.z + z1, h: 3 });
    box(-W_ / 2 - 1, -D_ / 2 - 1, W_ / 2 + 1, -D_ / 2); box(-W_ / 2 - 1, D_ / 2, W_ / 2 + 1, D_ / 2 + 1); box(-W_ / 2 - 1, -D_ / 2, -W_ / 2, D_ / 2); box(W_ / 2, -D_ / 2, W_ / 2 + 1, D_ / 2);
    box(W_ / 2 - 3.06, -D_ / 2, W_ / 2 - 2.94, -D_ / 2 + 2.6);
    box(-W_ / 2, D_ / 2 - 0.65, -W_ / 2 + 4.05, D_ / 2); box(-3.6, 1.2, -1.6, 2.1); box(2.0, 0.6, 4.0, 3.4); box(-0.2, 2.2, 1.4, 3.0);
    this.world = new StaticWorld(c);
    // points d'interaction
    const S = (x, z, label, act) => this.spots.push({ p: new THREE.Vector3(O.x + x, 0, O.z + z), label, act });
    S(3.0, 0.5, 'Dormir', 'sleep'); S(-2.6, 0.9, 'Regarder la télé', 'tv'); S(-W_ / 2 + 1.7, D_ / 2 - 1.0, 'Cuisiner et manger', 'cook');
    S(W_ / 2 - 1.2, -D_ / 2 + 1.9, 'Prendre une douche', 'shower'); S(-W_ / 2 + 0.8, -1.6, 'Dressing : changer de tenue', 'wardrobe'); S(0, -D_ / 2 + 0.9, 'Sortir', 'exit');
    const lk = { p: new THREE.Vector3(O.x + 0.9, 0, O.z - D_ / 2 + 0.9), label: 'Verrouiller', act: 'lock', labelFn: () => (this.g.life.s.homeLocked ? '🔒 Déverrouiller la porte' : '🔓 Verrouiller la porte à clé') }; this.spots.push(lk);
    this.door = new THREE.Vector3(O.x, 0, O.z - D_ / 2 + 0.9);
    // porte d'entrée battante (charnière à gauche) + poignée + serrure
    const frameM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const fr = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.2, 0.12), frameM); fr.position.set(0, 1.1, -D_ / 2 + 0.03); fr.scale.x = 1; G.add(fr);
    this.doorPivot = new THREE.Group(); this.doorPivot.position.set(-0.45, 0, -D_ / 2 + 0.08); G.add(this.doorPivot);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.08, 0.05), M.door || new THREE.MeshStandardMaterial({ color: 0x5a3a24 })); leaf.position.set(0.45, 1.04, 0.03); leaf.castShadow = true; this.doorPivot.add(leaf);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshStandardMaterial({ color: 0xc9a45a, metalness: 1, roughness: 0.3 })); knob.position.set(0.8, 1.0, 0.09); this.doorPivot.add(knob);
    this.lockLed = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.02), new THREE.MeshBasicMaterial({ color: 0x33ff66 })); this.lockLed.position.set(0.8, 1.2, 0.08); this.doorPivot.add(this.lockLed);
    this.doorAngle = 0; this.doorTarget = 0;
  }
  async enter() {
    await this.build();
    const g = this.g, f = document.getElementById('fade');
    // dehors : on pousse la porte de l'immeuble
    await g.actions.run({ arms: 'reach', dur: 0.7 }); this.click();
    f.style.opacity = 1; await wait(500);
    this.outside = g.player.pos.clone(); this.outsideYaw = g.player.yaw;
    this.cityWorld = g.player.world; g.player.world = this.world; g.world = this.world;
    this.group.visible = true; this.inside = true; g.interiorRoom = true;
    g.player.place(this.door.x, this.door.z + 0.5, 0); g.player.camYaw = Math.PI; g.player.camDist = 2.6;
    this.winMat.color.setHSL(0.6, 0.4, 0.25 + (1 - g.sky.night) * 0.6);
    this.doorAngle = this.doorTarget = -1.45; this.doorPivot.rotation.y = this.doorAngle;
    g.player.place(this.door.x, this.door.z - 0.6, 0);
    await wait(300); f.style.opacity = 0;
    await g.actions.run({ to: new THREE.Vector3(this.door.x, 0, this.door.z + 0.8), face: Math.PI, dur: 0.1 });
    this.doorTarget = 0; setTimeout(() => this.click(), 650); // la porte se referme derrière vous
  }
  async exit() {
    const g = this.g, f = document.getElementById('fade'); f.style.opacity = 1; await wait(500);
    g.player.world = this.cityWorld; g.world = this.cityWorld; this.group.visible = false; this.inside = false; g.interiorRoom = false; this.doorTarget = this.doorAngle = 0;
    g.player.place(this.outside.x, this.outside.z, this.outsideYaw + Math.PI); g.player.camDist = 4.2;
    await wait(300); f.style.opacity = 0;
  }
  update(dt) {
    if (!this.doorPivot) return;
    this.doorAngle += (this.doorTarget - this.doorAngle) * Math.min(1, dt * 5); this.doorPivot.rotation.y = this.doorAngle;
    this.lockLed.material.color.setHex(this.g.life.s.homeLocked ? 0xff3333 : 0x33ff66);
  }
  click() { try { const c = this.ac || (this.ac = new (window.AudioContext || window.webkitAudioContext)()); const o = c.createOscillator(), gn = c.createGain(); o.type = 'square'; o.frequency.value = 900; gn.gain.value = 0.05; gn.gain.setTargetAtTime(0, c.currentTime + 0.03, 0.02); o.connect(gn); gn.connect(c.destination); o.start(); o.stop(c.currentTime + 0.12); } catch (e) {} }
  nearest(pos) { let b = null, bd = 1.6; for (const s of this.spots) { const d = s.p.distanceTo(new THREE.Vector3(pos.x, 0, pos.z)); if (d < bd) { bd = d; b = s; } } return b; }
  async act(s) {
    const g = this.g, L = g.life, st = L.s, A = g.actions, O = ORIGIN;
    if (s.act === 'lock') { await A.run({ to: s.p.clone(), face: Math.PI, arms: 'reach', dur: 0.9 }); st.homeLocked = !st.homeLocked; this.click(); L.notify(st.homeLocked ? '🔒 Porte verrouillée à clé' : '🔓 Porte déverrouillée'); L.save(); return; }
    if (s.act === 'exit') {
      await A.run({ to: s.p.clone(), face: Math.PI, arms: 'reach', dur: 0.6 });
      if (st.homeLocked) { this.click(); st.homeLocked = false; L.notify('🔓 Vous déverrouillez la porte'); await new Promise(r => setTimeout(r, 400)); }
      this.doorTarget = -1.45; await new Promise(r => setTimeout(r, 700));
      await A.run({ to: new THREE.Vector3(O.x, 0, O.z - D_ / 2 - 0.3), face: Math.PI, dur: 0.1 });
      return this.exit();
    }
    if (s.act === 'sleep') await A.run({ to: new THREE.Vector3(O.x + 3.0, 0, O.z + 0.9), face: 0, pose: 'lie', lie: { y: 0.62 }, dur: 1.8, camDist: 3.5 });
    if (s.act === 'tv') await A.run({ to: new THREE.Vector3(O.x - 2.6, 0, O.z + 1.25), face: Math.PI, pose: 'relax', offsetY: -0.48, dur: 2.2 });
    if (s.act === 'cook') await A.run({ to: new THREE.Vector3(O.x - W_ / 2 + 1.7, 0, O.z + D_ / 2 - 0.95), face: 0, arms: 'reach', dur: 2.5 });
    if (s.act === 'shower') {
      // vitre embuée (silhouette floue) + vapeur ; tenue « torse nu, en caleçon » le temps de la douche
      const ch = g.player.char, saved = [];
      const undress = () => ch.model.traverse(o => { if (!o.isMesh || !/Outfit|Headwear/.test(o.material.name)) return; saved.push([o, o.material]);
        const m = new THREE.MeshStandardMaterial({ color: /Bottom/.test(o.material.name) ? 0x24262b : 0xc98f6c, roughness: 0.6 });
        if (/Headwear/.test(o.material.name)) o.visible = false; else o.material = m; });
      await A.run({ to: new THREE.Vector3(O.x + W_ / 2 - 1.2, 0, O.z - D_ / 2 + 0.8), face: Math.PI, arms: 'handsHead', dur: 4, camDist: 3.4, onStart: () => {
        undress(); this.showerGlass.opacity = 0.72; this.showerGlass.roughness = 1;
        this.steam.children.forEach(m => { m.material.opacity = 0.32; });
      } });
      for (const [o, m] of saved) { o.material = m; o.visible = true; }
      this.showerGlass.opacity = 0.25; this.showerGlass.roughness = 0.05;
      setTimeout(() => this.steam.children.forEach(m => m.material.opacity = 0), 2500);
    }
    if (s.act === 'wardrobe') await A.run({ to: s.p.clone(), face: -Math.PI / 2, arms: 'reach', dur: 0.8 });
    if (s.act === 'sleep') { const h = g.hour, dur = h < 7 ? 7 - h : 31 - h; return L.skip(dur, () => { st.needs.energie = 100; st.needs.faim = Math.max(0, st.needs.faim - dur * 2); }); }
    if (s.act === 'tv') return L.skip(1, () => { st.needs.moral = Math.min(100, st.needs.moral + 12); });
    if (s.act === 'cook') { if (st.food < 1) return L.notify('Frigo vide : faites des courses', 'warn'); st.food--; L.feed(65); return L.notify('Bon appétit ! (' + st.food + ' repas restants)'); }
    if (s.act === 'shower') return L.skip(0.3, () => { st.needs.hygiene = 100; });
    if (s.act === 'wardrobe') return g.openWardrobe && g.openWardrobe();
  }
}
function uvScale(g, w, h) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h); }
const wait = (ms) => new Promise(r => setTimeout(r, ms));
