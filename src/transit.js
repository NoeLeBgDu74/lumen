// Transports en commun : navettes sur une boucle d'arrêts (abribus), conduites par le système de circulation.
// Le joueur peut monter (F, 2 €) et descendre à un arrêt (F).
import * as THREE from 'three';
import * as W from './world.js';
import { Character } from './chars.js';

export class Transit {
  constructor(game) { this.g = game; this.stops = []; this.buses = []; this.built = false; }
  build() {
    const g = this.g; if (this.built) return; this.built = true;
    // arrêts : places de stationnement en bordure, réparties dans le centre et les quartiers voisins
    const spots = W.parkingSpots.filter(s => s.edge !== undefined && s.taken === null && Math.abs(s.x) < 300 && Math.abs(s.z) < 220);
    const picks = [];
    for (const s of spots.sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x))) { if (picks.every(p => Math.hypot(p.x - s.x, p.z - s.z) > 130)) picks.push(s); if (picks.length >= 6) break; }
    const glassM = new THREE.MeshPhysicalMaterial({ color: 0xbfd8e6, transparent: true, opacity: 0.35, roughness: 0.05 });
    const frame = new THREE.MeshStandardMaterial({ color: 0x2b3a4a, metalness: 0.7, roughness: 0.35 });
    const names = ['Gare centrale', 'Place du Marché', 'Belleville', 'Les Tilleuls', 'Zone du Lac', 'Mairie'];
    picks.forEach((s, k) => {
      s.taken = 'stop'; // réservée aux navettes
      const e = W.edges[s.edge], rgt = new THREE.Vector3(-e.dir.z, 0, e.dir.x);
      const p = new THREE.Vector3(s.x, 0.15, s.z).addScaledVector(rgt, 3.4); // sur le trottoir
      const grp = new THREE.Group(); grp.position.copy(p); grp.rotation.y = Math.atan2(e.dir.x, e.dir.z) + Math.PI / 2;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.08, 1.5), frame); roof.position.y = 2.4; grp.add(roof);
      const back = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.2, 0.03), glassM); back.position.set(0, 1.25, 0.65); grp.add(back);
      for (const x of [-1.75, 1.75]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 0.08), frame); post.position.set(x, 1.2, 0.65); grp.add(post); }
      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.45), new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.7 })); bench.position.set(0, 0.48, 0.35); grp.add(bench);
      const sign = signMesh('🚌 ' + names[k]); sign.position.set(-1.6, 2.9, 0.1); grp.add(sign);
      grp.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      g.R.scene.add(grp);
      this.stops.push({ spot: s, pos: p, name: names[k] });
    });
    // deux navettes, décalées sur la boucle
    for (let b = 0; b < 2; b++) this.spawnBus(b * 3);
  }
  spawnBus(startIdx) {
    const g = this.g; if (this.stops.length < 2) return;
    const st = this.stops[startIdx % this.stops.length];
    const ai = g.traffic.newCar('lightbody90', '#e9eef5'); ai.bus = true;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(ai.tpl.size.x + 0.02, 0.35, ai.tpl.size.z * 0.86), new THREE.MeshStandardMaterial({ color: 0x1f5fbf, roughness: 0.5 })); stripe.position.set(0, 0.95, 0); ai.car.obj.add(stripe);
    const driver = new Character(g.charBases.rpm, { tint: { Outfit_Top: new THREE.Color(0x1f5fbf).multiplyScalar(1.4), Outfit_Bottom: new THREE.Color(0x222222).multiplyScalar(1.4) } });
    const sw = ai.car.steeringWheel; ai.car.obj.add(driver.obj); driver.obj.position.set(sw ? sw.position.x : 0.4, (sw ? sw.position.y - 0.44 : 0.55) - driver.hipH + 0.05, sw ? sw.position.z - 0.68 : 0); driver.play('sit', 0);
    st.spot.taken = null; g.traffic.parkAt(ai, st.spot); st.spot.taken = 'stop';
    const bus = { ai, driver, idx: startIdx % this.stops.length, phase: 'dwell', t: 0 };
    this.buses.push(bus);
  }
  nextStop(bus) {
    const g = this.g; if (g.traffic.mirror) { bus.t = 0; return; } // invité : c'est l'hôte qui fait rouler les navettes bus.idx = (bus.idx + 1) % this.stops.length; const st = this.stops[bus.idx];
    st.spot.taken = null; // libère la place réservée pour que la navette puisse s'y garer
    const ok = g.traffic.drive(bus.ai, { door: { p: new THREE.Vector3(st.spot.x, 0, st.spot.z) }, name: st.name }, () => { bus.phase = 'dwell'; bus.t = 0; st.spot.taken = bus.ai.id; if (g.busRide && g.busRide.bus === bus) g.life.notify('🚌 Arrêt « ' + st.name + ' » — F pour descendre'); });
    bus.phase = ok ? 'drive' : 'dwell'; bus.t = 0;
  }
  nearBus(pos) { return this.buses.find(b => b.phase === 'dwell' && b.ai.pos.distanceTo(pos) < 6); }
  update(dt) {
    const g = this.g; if (!this.built) return;
    for (const b of this.buses) {
      b.t += dt; b.driver.update(dt);
      if (b.phase === 'dwell' && b.t > 10) this.nextStop(b);
      if (b.phase === 'drive' && b.t > 180) { g.traffic.finishTrip(b.ai); } // sécurité
    }
    const R = g.busRide;
    if (R) {
      const P = g.player, ch = P.char; ch.play('sit', 0.3); ch.update(dt);
      const wp = R.bus.ai.car.obj.getWorldPosition(new THREE.Vector3()); P.pos.copy(wp);
      const [mx, my] = g.input.consumeMouse(); P.camYaw -= mx * 0.0024; P.camPitch = THREE.MathUtils.clamp(P.camPitch + my * 0.002, -0.1, 0.9);
      P.updateCamera(dt, wp, 8, 1.4);
      const el = document.getElementById('mission'); el.hidden = false; el.textContent = R.bus.phase === 'dwell' ? `🚌 Arrêt « ${this.stops[R.bus.idx].name} » — F pour descendre` : `🚌 Navette en route vers « ${this.stops[R.bus.idx].name} »`;
    }
  }
  board(bus) {
    const g = this.g, P = g.player; if (!g.life.money(-2, 'ticket de navette')) return;
    g.busRide = { bus }; P.mode = 'bus';
    bus.ai.car.obj.add(P.char.obj); P.char.obj.position.set(-0.4, 0.6 - P.char.hipH + 0.05, -1.2); P.char.obj.rotation.set(0, 0, 0); P.char.play('sit', 0.3);
    g.life.notify('🚌 Bonne route ! Descente à n’importe quel arrêt (F)');
  }
  alight() {
    const g = this.g, P = g.player, R = g.busRide; if (!R || R.bus.phase !== 'dwell') return g.life.notify('Attendez le prochain arrêt', 'warn');
    g.R.scene.attach(P.char.obj); const st = this.stops[R.bus.idx];
    P.place(st.pos.x, st.pos.z, 0); P.mode = 'foot'; g.busRide = null; document.getElementById('mission').hidden = true;
  }
}

function signMesh(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#1f5fbf'; x.fillRect(0, 0, 256, 64); x.fillStyle = '#fff'; x.font = 'bold 26px Inter, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 128, 33);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
  return m;
}
