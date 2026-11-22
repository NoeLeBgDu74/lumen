// LIVING WORLD — point d'entrée : chargement progressif, construction du monde, boucle de jeu.
import * as THREE from 'three';
import { Renderer } from './render.js';
import { Sky } from './sky.js';
import { manager } from './assets.js';
import { buildMaterials } from './materials.js';
import { buildCity, updateSignals } from './city.js';
import { Trees, windU } from './trees.js';
import { buildProps, lampGlass } from './props.js';
import { StaticWorld } from './physics.js';
import { loadCharBase as loadCharBase0, Character } from './chars.js';
import { Player } from './player.js';
import { Input } from './input.js';
import * as W from './world.js';
import { Traffic } from './traffic.js';
import { Vehicle } from './vehicle.js';
import { Population, walkPath as walkPathTo } from './npc.js';
import { groundHeight } from './physics.js';
import { Peds } from './peds.js';
import { Markers } from './markers.js';
import { Combat } from './combat.js';
import { Admin } from './admin.js';
import { Living } from './living.js';
import { Talk, getKey, setKey, gender } from './talk.js';
import { Life, Minimap, gpsTo, fmt, ICONS } from './life.js';
import { Places, PJOBS } from './places.js';
import { Police } from './police.js';
import { Net } from './net.js';
import { CATALOG } from './cars.js';
import { signalState } from './city.js';

async function loadCharBase(id) { const b = await loadCharBase0(id); charCache[id] = b; return b; }
const $ = (id) => document.getElementById(id);
const setLoad = (p, t) => { $('loadbar').style.width = Math.round(p * 100) + '%'; if (t) $('loadtxt').textContent = t; };
const tick = () => new Promise(r => requestAnimationFrame(() => r()));

const game = window.game = { time: 0, hour: 8.0, day: 1, timeScale: 30 }; // 1 s réelle = 30 s de jeu (une journée = 48 min)

async function start() {
  const R = game.R = new Renderer($('c'));
  const scene = R.scene, camera = R.camera;
  let q = 'low'; try { q = localStorage.getItem('lumen.quality') || 'low'; } catch (e) {}
  game.autoQ = true; try { game.autoQ = localStorage.getItem('lumen.autoq') !== '0'; } catch (e) {}
  const sky = game.sky = new Sky(R.r, scene);
  R.setQuality(q, sky.sun); sky.envEvery = R.q.envEvery || 0.25;

  setLoad(0.03, 'Chargement des ciels HDRI…');
  await sky.load(p => setLoad(0.03 + p * 0.2));
  setLoad(0.25, 'Matériaux PBR…'); await tick();
  const M = game.M = buildMaterials();
  const trees = new Trees(scene, M.bark);
  setLoad(0.3, 'Construction de la ville…'); await tick();
  const city = game.city = buildCity(scene, M, trees);
  trees.build();
  setLoad(0.5, 'Mobilier urbain…'); await tick();
  await buildProps(scene, city.props, p => setLoad(0.5 + p * 0.2));
  const world = game.world = new StaticWorld(city.colliders);
  setLoad(0.66, 'Véhicules…');
  const traffic = game.traffic = new Traffic(scene);
  await traffic.load();
  // voitures garées (≈ 30 % des places) + circulation permanente
  const spots = W.parkingSpots.slice().sort(() => Math.random() - 0.5).slice(0, 60);
  for (const sp of spots) traffic.parkAt(traffic.newCar(), sp);
  for (let k = 0; k < R.q.traffic + 18; k++) {
    const e = W.edges[Math.floor(Math.random() * W.edges.length)];
    const ai = traffic.newCar(); ai.edge = e; ai.t = W.RW + 2 + Math.random() * (e.len - 2 * W.RW - 10); ai.state = 'drive'; ai.v = 8; traffic.wander(ai);
  }

  setLoad(0.72, 'Habitants…');
  await Promise.all([loadCharBase('rpm'), loadCharBase('michelle'), loadCharBase('soldier')]);
  const input = game.input = new Input($('c'));
  const home = W.places.find(p => p.homeBlock && p.door) || W.places.find(p => p.type === 'apartments' && p.door);
  game.home = home;
  const player = game.player = new Player(null, world, camera);
  const d = home.door; player.place(d.p.x + d.nrm.x * 1.5, d.p.z + d.nrm.z * 1.5, Math.atan2(d.nrm.x, d.nrm.z));
  player.camYaw = Math.atan2(d.nrm.x, d.nrm.z) + Math.PI * 0.85;
  let saved = null; try { saved = JSON.parse(localStorage.getItem('lw.profile') || 'null'); } catch (e) {}
  game.profile = saved || { model: 'rpm', first: 'Lucas', last: 'Moreau', top: '#3b5b8c', bottom: '#2b2b30' };
  setPlayerChar(scene, player, game.profile);
  player.dyn = (p) => traffic.circles(p, 8).concat(game.net ? game.net.circles(p) : []);
  setLoad(0.85, 'Habitants : emplois du temps, relations…'); await tick();
  const pop = game.pop = new Population(scene, traffic, charCache, game);
  pop.maxVisible = R.q.npc;
  // population déterministe : mêmes habitants à chaque partie (mémoire des conversations cohérente)
  const mr = Math.random; let seed = 777; Math.random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) % 1e9) / 1e9; };
  try { pop.generate(220); } finally { Math.random = mr; }
  game.talk = new Talk(game);
  game.charBases = charCache;
  game.life = new Life(game); game.places = new Places(game); game.police = new Police(game); game.net = new Net(game);
  game.minimap = new Minimap(game);
  game.peds = new Peds(game); game.peds.max = Math.max(6, R.q.npc - 4);
  game.markers = new Markers(scene);
  game.combat = new Combat(game); game.admin = new Admin(game); game.living = new Living(game); game.npcCrime = game.living;
  { const ph = W.places.find(p => p.type === 'pharmacy'); window.__lwHospital = ph ? ph.door.p : null; }
  const off = W.places.find(p => p.type === 'office'); game.policeStation = off ? off.door.p : null;
  game.ownedAI = [];
  game.life.s.cars.forEach((c, i) => game.spawnOwned(i, false));
  const cpm = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 40, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  cpm.visible = false; scene.add(cpm); game.cpMarker = cpm;
  setLoad(0.9, 'Compilation des shaders…'); await tick();
  sky.hour = game.hour; sky.update(0, camera, 0);
  player.update(0.016, input); player.updateCamera(1, player.pos);
  R.r.compile(scene, camera);
  setLoad(1, 'Prêt'); await tick();
  $('loading').style.opacity = 0; setTimeout(() => $('loading').remove(), 900);
  setupMenu(R, sky);
  game.net.start();
  const ob = $('onlineBtn'); const om = () => ob.textContent = 'Monde public : ' + (game.net.enabled ? 'activé' : 'désactivé (solo)');
  om(); ob.onclick = () => { game.net.setEnabled(!game.net.enabled); om(); };
  addEventListener('keydown', e => { if (e.code === 'KeyV' && !e.repeat) game.net.ptt(true); });
  addEventListener('keyup', e => { if (e.code === 'KeyV') game.net.ptt(false); });
  if (!saved) createCharacter(scene, player, camera).then(() => { $('hud').hidden = false; });
  else $('hud').hidden = false;

  let last = performance.now(), fpsAcc = 0, fpsN = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    game.time += dt;
    if (game.creating) {
      const c = player.char; c.play('idle'); c.update(dt);
      const fw = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
      const rt = new THREE.Vector3(fw.z, 0, -fw.x);
      camera.position.copy(player.pos).addScaledVector(fw, 3.4).addScaledVector(rt, -1.5).setY(player.pos.y + 1.4);
      camera.lookAt(player.pos.clone().addScaledVector(rt, -1.55).setY(player.pos.y + 1.0));
      camera.userData.focus = player.pos;
    } else if (!game.paused) {
      game.hour += dt * game.timeScale * (input.down('KeyT') ? 30 : 1) / 3600;
      if (game.hour >= 24) { game.hour -= 24; game.day++; }
      if (input.pressed('KeyF')) toggleCar();
      if (input.pressed('KeyE')) handleE();
      if (input.pressed('KeyP')) togglePhone();
      gameplayUpdate(dt); fxUpdate(dt); game.combat.update(dt); game.living.update(dt); if (!game.admin.fly) game.admin.update(dt); game.peds.update(dt); game.markers.update(camera, game.time);
      if (input.pressed('KeyG')) robNearest();
      if (game.seq) seqUpdate(dt);
      else if (game.veh) driveUpdate(dt);
      else if (game.admin && game.admin.fly) { game.admin.update(dt); player.update(dt, input); player.updateCamera(dt, player.pos); }
      else { player.update(dt, input); player.updateCamera(dt, player.pos); }
      const obst = [{ x: (game.veh ? game.veh.pos : player.pos).x, z: (game.veh ? game.veh.pos : player.pos).z, len: game.veh ? 3 : 1.2 }];
      for (const p of pop.people) if (p.char) obst.push({ x: p.pos.x, z: p.pos.z, len: 1 });
      for (const o of game.peds.obstacles()) obst.push(o);
      pop.update(dt, camera.position);
      traffic.update(dt, { obstacles: obst, night: sky.night > 0.45 ? 1 : 0 });
      traffic.cull(camera.position, Math.min(R.q.drawDist, 260));
      interactPrompt();
    }
    sky.hour = game.hour; sky.update(dt, camera, game.time);
    windU.uTime.value = game.time;
    updateNight(city, sky);
    updateSignals(city, game.time);
    cull(city, camera, R.q.drawDist);
    if (input.pressed('Escape') || (game.talk && game.talk.open && game.escTalk)) { if (game.talk && game.talk.open) game.talk.close(); else toggleMenu(); }
    R.render(game.time);
    input.endFrame();
    hud(); fpsAcc += dt; fpsN++;
    if (fpsAcc > 1) { game.fps = Math.round(fpsN / fpsAcc); autoQuality(R, sky); fpsAcc = 0; fpsN = 0; $('stats').textContent = `${game.fps} i/s · ${R.r.info.render.calls} appels · ${(R.r.info.render.triangles / 1e6).toFixed(2)} M triangles`; }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

const TOPS = ['#3b5b8c', '#8c2f2f', '#2f6b47', '#e8e4da', '#1d1f24', '#c98a2b', '#6b3f8c', '#7d8a96'];
const BOTS = ['#2b2b30', '#3a4a66', '#5a4a3a', '#c9c2b4', '#1a1a1a', '#4b5b3b'];
function setPlayerChar(scene, player, prof) {
  if (player.char) scene.remove(player.char.obj);
  const tint = prof.model === 'rpm' ? { Outfit_Top: prof.top, Outfit_Bottom: prof.bottom } : null;
  // les couleurs RPM sont multiplicatives sur une texture claire : on éclaircit pour garder la teinte voulue
  const ch = new Character(bases(prof.model), { tint: tint && Object.fromEntries(Object.entries(tint).map(([k, v]) => [k, lift(v)])) });
  scene.add(ch.obj); player.char = ch;
  ch.obj.position.copy(player.pos); ch.obj.rotation.y = player.yaw;
}
function lift(hex) { return new THREE.Color(hex).multiplyScalar(1.6); }
function bases(id) { return charCache[id]; }
const charCache = {};
function createCharacter(scene, player, camera) {
  return new Promise(res => {
    const p = game.profile; const el = $('create'); el.hidden = false;
    game.creating = true;
    const sw = (id, list, key) => { const box = $(id); box.innerHTML = ''; list.forEach(c => { const i = document.createElement('i'); i.style.background = c; i.classList.toggle('on', p[key] === c); i.onclick = () => { p[key] = c; [...box.children].forEach(x => x.classList.toggle('on', x === i)); setPlayerChar(scene, player, p); }; box.appendChild(i); }); };
    sw('ctop', TOPS, 'top'); sw('cbot', BOTS, 'bottom');
    [...document.querySelectorAll('#sexrow .card')].forEach(b => b.onclick = () => {
      p.model = b.dataset.m; document.querySelectorAll('#sexrow .card').forEach(x => x.classList.toggle('on', x === b));
      if (p.model === 'michelle' && p.first === 'Lucas') { p.first = 'Léa'; $('cfirst').value = 'Léa'; }
      if (p.model === 'rpm' && p.first === 'Léa') { p.first = 'Lucas'; $('cfirst').value = 'Lucas'; }
      setPlayerChar(scene, player, p);
    });
    $('cgo').onclick = () => {
      p.first = $('cfirst').value.trim() || 'Lucas'; p.last = $('clast').value.trim() || 'Moreau';
      try { localStorage.setItem('lw.profile', JSON.stringify(p)); } catch (e) {}
      el.hidden = true; game.creating = false; res();
    };
  });
}

// ---------- conduite ----------
const SEAT = new THREE.Vector3(0.37, 0.52, -0.12), HEAD = new THREE.Vector3(0.36, 1.13, -0.2);
function nearestCar(r = 3.6) {
  const p = game.player.pos; let best = null, bd = r;
  for (const ai of game.traffic.cars) { if (ai.state !== 'parked') continue; const d = ai.pos.distanceTo(p); if (d < bd) { bd = d; best = ai; } }
  return best;
}
function doorPoint(car) { const t = car.tpl; return car.obj.localToWorld(new THREE.Vector3(t.size.x / 2 + 0.55, 0, 0.15)); }
function toggleCar() {
  if (game.seq) return;
  const pl = game.player;
  if (game.veh) {
    if (game.veh.kmh > 6) return toast('Ralentissez pour descendre');
    game.seq = { type: 'exit', t: 0 };
    game.veh.vz = 0; game.veh.vx = 0;
    return;
  }
  let ai = nearestCar(), jack = false;
  if (!ai) { // car-jacking : voiture en circulation, lente ou arrêtée
    let bd = 4.5;
    for (const c of game.traffic.cars) { if (c.state !== 'drive' || c.v > 7) continue; const d = c.pos.distanceTo(pl.pos); if (d < bd) { bd = d; ai = c; } }
    if (!ai) return; jack = true;
    ai.prevState = ai.state; ai.state = 'jacked'; ai.v = 0;
  }
  game.seq = { type: 'enter', ai, t: 0, phase: 'walk', jack, steal: !ai.ownerIsPlayer };
  pl.mode = 'seq';
}
// Conducteur éjecté : il sort du siège, trébuche puis s'enfuit en courant (ou rentre chez lui s'il s'agit d'un habitant).
const fx = [];
function ejectDriver(ai) {
  const owner = ai.owner && ai.owner.memory ? ai.owner : null;
  const base = owner ? game.charBases[owner.model] : game.charBases.rpm;
  const ch = new Character(base, { tint: owner ? owner.tint : { Outfit_Top: new THREE.Color().setHSL(Math.random(), 0.4, 0.4), Outfit_Bottom: new THREE.Color(0x2b2b30) } });
  seatPose(ai.car, ch); ch.play('sit', 0); game.R.scene.add(ch.obj);
  fx.push({ ch, ai, owner, t: 0, from: ch.obj.position.clone(), door: doorPoint(ai.car) });
  if (owner) { game.pop.remember(owner, `s'est fait arracher de sa voiture par ${game.profile.first}`); owner.playerOpinion = -1; owner.car = null; }
}
function fxUpdate(dt) {
  for (const f of [...fx]) {
    f.t += dt; const ch = f.ch;
    if (f.t < 0.9) { const k = f.t / 0.9; ch.obj.position.lerpVectors(f.from, f.door.clone().setY(0.0), k * k); ch.obj.rotation.y = f.ai.car.obj.rotation.y + Math.PI / 2 * k; if (k > 0.4) ch.play('idle', 0.3); }
    else {
      if (!f.away) { f.away = ch.obj.position.clone().sub(f.ai.pos).setY(0).normalize(); ch.play('run', 0.25); }
      const nx = ch.obj.position.x + f.away.x * 5.2 * dt, nz = ch.obj.position.z + f.away.z * 5.2 * dt;
      const r = game.world.resolve(nx, nz, 0.3); ch.obj.position.set(r.x, groundHeight(r.x, r.z), r.z); if (r.hit) f.away.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.8);
      ch.obj.rotation.y = Math.atan2(f.away.x, f.away.z);
      if (f.t > 1.6 && f.owner) { // l'habitant reprend sa vie : il rentre à pied
        const p = f.owner; p.pos.copy(ch.obj.position); p.state = 'walk'; p.path = walkPathTo(p.pos, p.home.door.p); p.pi = 0; p.task = { go: p.home, why: 'rentrer après le vol', stay: 12 };
        p.onArrive = () => game.pop.arrive(p, p.task);
        game.R.scene.remove(ch.obj); fx.splice(fx.indexOf(f), 1); continue;
      }
      if (f.t > 7) { game.R.scene.remove(ch.obj); fx.splice(fx.indexOf(f), 1); continue; }
    }
    ch.update(dt);
  }
}

// Siège et tête du conducteur déduits du volant de chaque modèle (sinon valeurs par défaut).
function seatOf(car) { const sw = car.steeringWheel; return sw ? new THREE.Vector3(sw.position.x, sw.position.y - 0.5, sw.position.z - 0.62) : SEAT.clone(); }
function headOf(car) { const sw = car.steeringWheel; return sw ? new THREE.Vector3(sw.position.x, sw.position.y + 0.3, sw.position.z - 0.62) : HEAD.clone(); }
function seatPose(car, ch) {
  const ls = seatOf(car); const p = car.obj.localToWorld(ls.clone());
  ch.obj.position.set(p.x, p.y - ch.hipH + 0.05, p.z);
  ch.obj.rotation.set(0, car.obj.rotation.y, 0);
}
function seqUpdate(dt) {
  const s = game.seq, pl = game.player, ch = pl.char;
  if (s.type === 'enter') {
    const car = s.ai.car;
    if (s.phase === 'walk') {
      const dp = doorPoint(car); dp.y = pl.pos.y;
      const d = dp.clone().sub(pl.pos); d.y = 0; const dist = d.length();
      if (dist > 0.12) {
        const step = Math.min(dist, 1.7 * dt); pl.pos.addScaledVector(d.normalize(), step);
        pl.yaw = Math.atan2(d.x, d.z); ch.play('walk', 0.25);
      }
      s.walkT = (s.walkT || 0) + dt;
      if (dist <= 0.12 || s.walkT > 3) {
        s.t = 0; s.from = pl.pos.clone(); s.fromYaw = pl.yaw;
        if (s.jack) { s.phase = 'pull'; ch.play('talk', 0.2); ejectDriver(s.ai); }
        else if (s.steal) { s.phase = 'break'; ch.play('talk', 0.25); pl.yaw = car.obj.rotation.y - Math.PI / 2; }
        else { s.phase = 'sit'; ch.play('sit', 0.7); }
      }
      ch.obj.position.copy(pl.pos); ch.obj.rotation.y = pl.yaw;
    } else if (s.phase === 'break' || s.phase === 'pull') {
      // forcer la portière / arracher le conducteur, face à la voiture
      s.t += dt; const face = car.obj.rotation.y - Math.PI / 2;
      let dy = face - pl.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); pl.yaw += dy * Math.min(1, dt * 10);
      ch.obj.rotation.y = pl.yaw; ch.obj.position.copy(pl.pos);
      if (s.phase === 'pull' && s.t > 0.35) pl.pos.addScaledVector(new THREE.Vector3(Math.sin(face), 0, Math.cos(face)), -dt * 0.6); // recul en tirant
      if (s.t > (s.phase === 'break' ? 1.6 : 1.1)) { if (s.phase === 'break' && Math.random() < 0.3) { game.life.notify('🚨 Alarme !'); game.police.addWanted(1, 'alarme de voiture'); } s.phase = 'sit'; s.t = 0; s.from = pl.pos.clone(); s.fromYaw = pl.yaw; ch.play('sit', 0.7); }
    } else {
      s.t += dt; const k = Math.min(1, s.t / 1.2), e = k * k * (3 - 2 * k);
      const seat = car.obj.localToWorld(seatOf(car)); seat.y -= ch.hipH - 0.05;
      // se tourner dos au siège, puis glisser à l'intérieur
      const yawIn = car.obj.rotation.y;
      let dy = yawIn - s.fromYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      ch.obj.rotation.y = s.fromYaw + dy * Math.min(1, k * 1.6);
      const turnK = Math.max(0, (k - 0.25) / 0.75);
      ch.obj.position.lerpVectors(s.from, seat, turnK * turnK * (3 - 2 * turnK));
      if (k >= 1) startDriving(s.ai);
    }
    ch.update(dt);
    pl.updateCamera(dt, pl.pos);
  } else { // sortie
    const v = game.veh, car = v.car; s.t += dt;
    if (!s.from) { s.from = ch.obj.position.clone(); s.dp = doorPoint(car); s.dp.y = pl.groundAt ? pl.groundAt : v.pos.y; ch.obj.visible = true; game.interior = false; }
    const k = Math.min(1, s.t / 1.1), e = k * k * (3 - 2 * k);
    ch.obj.position.lerpVectors(s.from, s.dp, e);
    if (k > 0.35) ch.play('idle', 0.6);
    ch.obj.rotation.y = car.obj.rotation.y + Math.PI / 2 * Math.max(0, (k - 0.4) / 0.6);
    ch.update(dt);
    pl.updateCamera(dt, v.pos, Math.max(pl.camDist, car.tpl.size.z * 1.25 + 1.5), 1.25);
    if (k >= 1) endDriving();
  }
}
function startDriving(ai) {
  const pl = game.player;
  if (ai.spot) { ai.spot.taken = null; ai.spot = null; }
  if (ai.owner && ai.owner !== 'player' && ai.owner.memory) { game.pop.remember(ai.owner, `s'est fait voler sa voiture par ${game.profile.first}`); ai.owner.car = null; }
  if (!ai.ownerIsPlayer && (game.seq && game.seq.jack ? Math.random() < 0.85 : Math.random() < 0.4)) game.police.addWanted(game.seq && game.seq.jack ? 2 : 1, game.seq && game.seq.jack ? 'car-jacking' : 'vol de véhicule');
  if (ai.target) { ai.target.taken = null; ai.target = null; } ai.route = []; ai.turn = null; ai.wander = false;
  ai.state = 'player';
  const v = game.veh = new Vehicle(ai.car, game.world); game.vehAI = ai;
  v.dyn = (p) => game.traffic.circles(p).concat(game.net.circles(p));
  v.place(ai.pos.x, ai.pos.z, ai.heading); v.spin = ai.spin;
  pl.mode = 'car'; game.seq = null;
  pl.camYaw = v.heading + Math.PI; pl.camPitch = 0.16; pl.camInit = false;
  $('speedo').hidden = false;
  if (!game.license) toast('Attention : vous conduisez sans permis');
}
function endDriving() {
  const pl = game.player, v = game.veh, ai = game.vehAI, ch = pl.char;
  pl.place(ch.obj.position.x, ch.obj.position.z, ch.obj.rotation.y);
  pl.mode = 'foot'; game.seq = null;
  ai.state = 'parked'; ai.pos.copy(v.pos); ai.heading = v.heading; ai.edge = null; ai.spot = null;
  game.veh = null; game.vehAI = null; $('speedo').hidden = true;
  pl.camYaw = v.heading + Math.PI / 2 + Math.PI; pl.camInit = false;
}
function driveUpdate(dt) {
  const v = game.veh, inp = game.input, pl = game.player;
  const { f, s } = inp.move();
  if (inp.pressed('KeyC')) game.interior = !game.interior;
  v.headlights = game.sky.night > 0.45 ? 1 : 0;
  v.update(dt, { throttle: Math.max(0, f), brake: Math.max(0, -f), steer: -s, handbrake: inp.down('Space') });
  const ai = game.vehAI; ai.pos.copy(v.pos); ai.heading = v.heading; ai.v = Math.abs(v.vz);
  // conducteur visible, assis, mains au volant
  const ch = pl.char; ch.play('sit', 0.3); ch.update(dt); seatPose(v.car, ch);
  ch.obj.visible = !game.interior;
  const [mx, my, wh] = inp.consumeMouse();
  if (game.interior) {
    // vue intérieure : tête du conducteur, regard libre à la souris
    game.lookYaw = THREE.MathUtils.clamp((game.lookYaw || 0) - mx * 0.003, -2.2, 2.2);
    game.lookPitch = THREE.MathUtils.clamp((game.lookPitch || 0) - my * 0.003, -0.6, 0.5);
    if (!mx && !my) { game.lookYaw *= Math.pow(0.15, dt * (Math.abs(v.vz) > 3 ? 1 : 0)); }
    const cam = game.R.camera;
    const head = v.car.obj.localToWorld(headOf(v.car));
    cam.position.copy(head);
    const yaw = v.heading + game.lookYaw;
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(game.lookPitch), Math.sin(game.lookPitch) - 0.05, Math.cos(yaw) * Math.cos(game.lookPitch));
    cam.lookAt(head.clone().add(dir));
    cam.userData.focus = v.pos;
    if (cam.near !== 0.05) { cam.near = 0.05; cam.updateProjectionMatrix(); }
  } else {
    const cam = game.R.camera; if (cam.near !== 0.1) { cam.near = 0.1; cam.updateProjectionMatrix(); }
    pl.camYaw -= mx * 0.0024; pl.camPitch = THREE.MathUtils.clamp(pl.camPitch + my * 0.002, -0.1, 0.9);
    game.camIdle = (mx || my) ? 0 : (game.camIdle || 0) + dt;
    if (game.camIdle > 1.2 && Math.abs(v.vz) > 1) {
      const behind = v.heading + (v.vz < -1 ? 0 : Math.PI);
      let d = behind - pl.camYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); pl.camYaw += d * Math.min(1, dt * 2.5);
      pl.camPitch += (0.14 - pl.camPitch) * Math.min(1, dt * 1.5);
    }
    pl.camDist = THREE.MathUtils.clamp(pl.camDist + wh * 0.5, 2.2, 12);
    pl.updateCamera(dt, v.pos, Math.max(pl.camDist, v.car.tpl.size.z * 1.25 + 1.5), 1.25);
  }
  pl.pos.copy(v.pos);
  $('kmh').textContent = Math.round(v.kmh); $('gear').textContent = v.reverse ? 'R' : 'D' + v.gear;
}
function interactPrompt() {
  const el = $('prompt');
  if ((game.talk && game.talk.open) || game.life.panelOpen) { el.hidden = true; return; }
  if (!game.veh && !game.seq) { const n = game.pop.nearestTo(game.player.pos, 2.6); if (n) { el.hidden = false; el.innerHTML = '<kbd>E</kbd>Parler à ' + (n.metPlayer ? n.first : 'cet habitant') + ' &nbsp; <kbd>G</kbd>Voler'; return; } }
  if (!game.veh && !game.seq) { const pd = game.peds.nearest(game.player.pos); if (pd) { el.hidden = false; el.innerHTML = '<kbd>G</kbd>Voler ce passant'; return; } }
  if (!game.veh && !game.seq) { const pl = game.places.nearest(game.player.pos); if (pl) { el.hidden = false; el.innerHTML = '<kbd>E</kbd>' + game.places.label(pl); return; } }
  if (game.veh && nearPump()) { el.hidden = false; el.innerHTML = '<kbd>E</kbd>Faire le plein'; return; }
  if (!game.veh) { const ai = nearestCar(); if (ai) { el.hidden = false; el.innerHTML = '<kbd>F</kbd>Monter dans ' + ai.tpl.spec.name; return; } }
  el.hidden = true;
}
// ---------- vol à l'arraché ----------
function robNearest() {
  if (game.veh || game.seq) return;
  const pd = game.peds.nearest(game.player.pos, 2.4);
  if (pd) { game.player.char.play('talk', 0.1); return game.peds.rob(pd); }
  const n = game.pop.nearestTo(game.player.pos, 2.4);
  if (n) {
    const loot = 15 + Math.floor(Math.random() * 70); game.life.money(loot, 'vol à l’arraché');
    game.pop.remember(n, `s'est fait voler ${loot} € par ${game.profile.first}`); n.playerOpinion = -1;
    n.resume = n.state === 'talk' ? 'walk' : n.state; n.state = 'talk'; n.talkUntil = game.time + 3;
    if (Math.random() < 0.6) game.police.addWanted(1, 'vol');
  }
}

// ---------- gameplay ----------
function nearPump() {
  const st = W.places.find(p => p.type === 'gas_station'); if (!st || !game.veh) return false;
  return st.pumps.some(pp => (pp.x - game.veh.pos.x) ** 2 + (pp.z - game.veh.pos.z) ** 2 < 9) && game.veh.kmh < 3;
}
function handleE() {
  if (game.seq || game.life.panelOpen) return;
  if (game.veh) { if (nearPump()) game.places.refuel(game.veh); return; }
  const n = game.pop.nearestTo(game.player.pos, 2.6); if (n) return game.talk.start(n);
  const pl = game.places.nearest(game.player.pos); if (pl) return game.places.open(pl);
}
function freeSpotNear(ref, curbOnly) {
  let best = null, bd = Infinity;
  for (const s of W.parkingSpots) { if (s.taken !== null || (curbOnly && s.edge === undefined)) continue; const d = (s.x - ref.x) ** 2 + (s.z - ref.z) ** 2; if (d < bd) { bd = d; best = s; } }
  return best;
}
game.spawnOwned = (idx, atDealer) => {
  const c = game.life.s.cars[idx]; const T = game.traffic;
  const ref = atDealer ? W.places.find(p => p.type === 'dealership').door.p : (game.life.s.home ? W.places[game.life.s.home.id].door.p : game.home.door.p);
  const ai = T.newCar(c.id, c.paint); ai.ownerIsPlayer = true; ai.owner = 'player'; ai.ownedIdx = idx; T.parkAt(ai, freeSpotNear(ref));
  game.ownedAI[idx] = ai;
};
game.despawnOwned = (idx) => { const ai = game.ownedAI[idx]; if (ai) { if (game.vehAI === ai) game.forceExit(); game.removeCar(ai); } game.ownedAI.splice(idx, 1); };
game.spawnTempCar = (id, paint, near) => { const ai = game.traffic.newCar(id, paint); ai.temp = true; ai.ownerIsPlayer = true; game.traffic.parkAt(ai, freeSpotNear(near, true)); return ai; };
game.removeCar = (ai) => game.traffic.remove(ai);
game.forceExit = () => { if (!game.veh) return; const ch = game.player.char; ch.obj.position.copy(doorPoint(game.veh.car)); ch.obj.visible = true; game.interior = false; endDriving(); };

let pedHitT = 0;
function gameplayUpdate(dt) {
  const L = game.life; L.update(dt); game.places.update(dt); game.police.update(dt); game.net.update(dt);
  game.minimapT = (game.minimapT || 0) + dt; if (game.minimapT > 0.05) { game.minimapT = 0; game.minimap.draw(); }
  const v = game.veh; $('fuel').hidden = !v;
  if (v) {
    $('fuelbar').style.width = (v.fuel / v.car.tpl.spec.fuel * 100) + '%';
    if (v.fuel <= 0 && !game._noFuel) { game._noFuel = true; L.notify('Panne sèche ! Trouvez une station-service', 'warn'); } else if (v.fuel > 0) game._noFuel = false;
    // feu rouge grillé : passage de la ligne d'arrêt au rouge
    const n = W.nodes[W.nearestNode(v.pos.x, v.pos.z)];
    const dx = n.x - v.pos.x, dz = n.z - v.pos.z, d = Math.hypot(dx, dz);
    if (n.signal && d < W.RW + 3 && d > W.RW - 1 && v.kmh > 12) {
      const fw = new THREE.Vector3(Math.sin(v.heading), 0, Math.cos(v.heading));
      if ((dx * fw.x + dz * fw.z) / d > 0.85) {
        const axis = Math.abs(fw.x) > 0.7 ? 'x' : 'z';
        if (signalState(n, axis, game.traffic.time) === 'R' && game.time - (game._redT || 0) > 4) { game._redT = game.time; game.ranRed = true; if (game.police.units.length || Math.random() < 0.15) game.police.addWanted(1, 'feu rouge grillé'); }
      }
    }
    // piétons : ils s'écartent ; renversés si percutés
    if (v.kmh > 14) for (const p of game.pop.people) {
      if (!p.char || p.hurt) continue;
      const dd = p.pos.distanceTo(v.pos);
      if (dd < 7 && dd > 1.8) { const away = p.pos.clone().sub(v.pos).setY(0).normalize(); p.pos.addScaledVector(away, dt * 4); }
      else if (dd <= 1.8 && game.time - pedHitT > 1) {
        pedHitT = game.time; p.hurt = true; p.knockT = game.time; p.knockDir = new THREE.Vector3(Math.sin(v.heading), 0, Math.cos(v.heading)); p.resume = p.state === 'talk' ? 'walk' : p.state; p.state = 'talk'; p.talkUntil = game.time + 7;
        setTimeout(() => { p.hurt = false; }, 7000);
        game.pop.remember(p, `s'est fait renverser par ${game.profile.first}`); p.playerOpinion = -1; v.vz *= 0.7;
        game.police.addWanted(2, 'piéton renversé');
      }
    }
  }
  const cp = game.checkpoint;
  game.cpMarker.visible = !!cp; if (cp) { game.cpMarker.position.set(cp.x, 20, cp.z); game.cpMarker.material.opacity = 0.16 + Math.sin(game.time * 3) * 0.06; }
  const m = game.places.mission;
  $('mission').hidden = !m && !game.gps;
  if (m || game.gps) $('mission').textContent = m ? missionText(m) : 'GPS : ' + game.gps.label;
  if (game.gps && !m && (game.veh ? game.veh.pos : game.player.pos).distanceTo(game.gps.target) < 10) { game.gps = null; L.notify('Vous êtes arrivé·e'); }
}
function missionText(m) {
  if (m.type === 'lesson' || m.type === 'exam') return `${m.type === 'exam' ? 'Examen pratique' : 'Leçon de conduite'} · point ${Math.min(m.i + 1, m.pts.length)}/${m.pts.length} · fautes : ${m.faults.length}`;
  if (m.type === 'delivery') return `Livraisons · ${m.i}/${m.dests.length} · ${m.dests[m.i] ? m.dests[m.i].name : ''}`;
  if (m.type === 'taxi') return m.stage === 'pickup' ? 'Taxi : allez chercher le client' : 'Taxi : déposez le client à ' + m.to.name;
  return '';
}

// ---------- téléphone ----------
function togglePhone() {
  const ph = $('phone'); ph.hidden = !ph.hidden;
  if (!ph.hidden) { phoneHome(); document.exitPointerLock?.(); }
}
const JLAB = { cashier: 'caissier·ère', shelver: 'employé·e de rayon', office: 'employé·e de bureau', mechanic: 'mécanicien·ne', delivery: 'livreur·se', worker: 'ouvrier·ère', waiter: 'serveur·se', baker: 'boulanger·ère', seller: 'vendeur·se', car_seller: 'vendeur·se auto', instructor: 'moniteur·rice', retired: 'retraité·e', student: 'étudiant·e' };
const APPS = [['🗺️', 'GPS', '#2a62c9', () => phoneGPS()], ['👥', 'Contacts', '#2f6b47', () => phoneContacts()], ['🏦', 'Banque', '#20406b', () => phoneBank()], ['🚗', 'Véhicules', '#8a1c1c', () => phoneCars()], ['💼', 'Emploi', '#6b5b45', () => phoneJob()], ['🪪', 'Permis', '#e08a1e', () => phoneLicense()], ['🌐', 'Multijoueur', '#6b3f8c', () => phoneNet()], ['🏠', 'Logement', '#4b5a73', () => phoneHousing()], ['⚙️', 'Réglages', '#444', () => { togglePhone(); toggleMenu(); }]];
function phoneHome() {
  $('phClock').textContent = $('clock').textContent;
  $('phBody').innerHTML = `<div class="phh">Bonjour ${game.profile.first}</div><div class="apps">${APPS.map((a, i) => `<button class="app" data-i="${i}"><i style="background:${a[2]}">${a[0]}</i>${a[1]}</button>`).join('')}</div>`;
  $('phBody').querySelectorAll('.app').forEach(b => b.onclick = () => APPS[+b.dataset.i][3]());
}
$('phHome').onclick = () => phoneHome();
function phList(title, items) {
  $('phBody').innerHTML = `<div class="phh">${title}</div>` + items.map((it, i) => `<div class="phl" data-i="${i}"><b>${it.t}</b><small>${it.s || ''}</small></div>`).join('');
  $('phBody').querySelectorAll('.phl').forEach(el => el.onclick = () => { const it = items[+el.dataset.i]; it.run && it.run(); });
}
const goGPS = (p, label) => { gpsTo(game, p, label); togglePhone(); };
function phoneGPS() {
  const types = [['supermarket', 'Supermarché'], ['gas_station', 'Station-service'], ['dealership', 'Concession automobile'], ['driving_school', 'Auto-école'], ['restaurant', 'Restaurant'], ['bakery', 'Boulangerie'], ['office', 'Bureaux'], ['garage', 'Garage'], ['warehouse', 'Entrepôt'], ['park', 'Parc'], ['bank', 'Banque'], ['pharmacy', 'Pharmacie'], ['house', 'Maisons à vendre'], ['apartments', 'Appartements']];
  const items = types.map(([t, l]) => { const pl = W.places.find(p => p.type === t && p.door); return { t: (ICONS[t] ? ICONS[t][0] + ' ' : '') + l, s: pl ? pl.name : '', run: () => pl && goGPS(pl.door.p, pl.name) }; });
  if (game.life.s.home) items.unshift({ t: '🏠 Domicile', s: game.life.s.home.name, run: () => goGPS(W.places[game.life.s.home.id].door.p, 'Domicile') });
  phList('GPS', items);
}
function phoneContacts() {
  const n = game.net, items = [];
  for (const id in n.remotes) { const r = n.remotes[id]; items.push({ t: '🟣 ' + r.name, s: 'Joueur en ligne · toucher pour appeler / écrire', run: () => phonePlayer(id) }); }
  const met = game.pop.people.filter(p => p.metPlayer).sort((a, b) => b.playerOpinion - a.playerOpinion);
  for (const p of met) items.push({ t: p.first + ' ' + p.last, s: `${p.age} ans · ${gender(JLAB[p.job] || p.job, p.female)} · ${p.playerOpinion > 0.5 ? 'ami·e' : p.playerOpinion < 0 ? 'vous en veut' : 'connaissance'}`, run: () => phoneNPC(p) });
  phList('Contacts', items.length ? items : [{ t: 'Aucun contact', s: 'Parlez aux habitants (E) ; les joueurs connectés apparaissent ici.' }]);
}
function phoneThread(title, msgs, onSend, extra = '') {
  $('phBody').innerHTML = `<div class="phh">${title}</div>${extra}<div id="thr" style="display:flex;flex-direction:column;gap:5px;max-height:300px;overflow:auto">${msgs.map(m => `<div class="ln ${m.me ? 'me' : 'npc'}">${m.text.replace(/</g, '&lt;')}</div>`).join('')}</div><input class="phin" id="pmIn" placeholder="Votre message"><button class="phbtn" id="pmGo">Envoyer</button>`;
  const thr = $('thr'); thr.scrollTop = 1e6;
  const go = () => { const v = $('pmIn').value; if (v.trim()) onSend(v); };
  $('pmIn').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') go(); });
  $('pmGo').onclick = go;
}
function phonePlayer(id) {
  const n = game.net, r = n.remotes[id]; if (!r) return phoneContacts();
  const msgs = n.pms.filter(m => m.from === id);
  const extra = `<button class="phbtn" id="callBtn">${n.phoneCall && n.phoneCall.id === id ? '📴 Raccrocher' : '📞 Appeler'}</button>`;
  phoneThread(r.name, msgs, (t) => { n.pm(id, t); phonePlayer(id); }, extra);
  $('callBtn').onclick = () => { if (n.phoneCall) n.hangup(); else n.callPlayer(id); setTimeout(() => phonePlayer(id), 300); };
  game.onPM = (from) => { if (from === id && !$('phone').hidden) phonePlayer(id); };
}
// SMS aux habitants : réponse de l'IA (ou hors ligne) selon leur personnalité et leur journée.
function phoneNPC(p) {
  p.sms = p.sms || [];
  phoneThread(p.first + ' ' + p.last, p.sms, async (t) => {
    p.sms.push({ me: true, text: t }); phoneNPC(p);
    const T = game.talk; T.conv = T.conv && T.npc === p ? T.conv : []; const prevNpc = T.npc; T.npc = p;
    T.conv.push({ role: 'user', text: '(par SMS) ' + t, day: game.day });
    let reply = null; const key = getKey();
    if (key) { try { reply = await T.llm(p, key); } catch (e) {} }
    if (!reply) reply = gender(T.offline(p, t), p.female);
    T.npc = prevNpc;
    setTimeout(() => { p.sms.push({ me: false, text: reply }); game.life.notify('📩 ' + p.first + ' : ' + reply); if (!$('phone').hidden) phoneNPC(p); }, 1200 + Math.random() * 2500);
  }, `<button class="phbtn" id="npcGps">📍 Le/la rejoindre</button>`);
  $('npcGps').onclick = () => goGPS(p.pos.clone(), 'Rejoindre ' + p.first);
}
game.onIncomingCall = (name, call) => {
  const ph = $('phone'); ph.hidden = false;
  $('phBody').innerHTML = `<div class="phh" style="text-align:center;margin-top:60px">📞 ${name}</div><p style="text-align:center;color:#bbb">appel entrant…</p><button class="phbtn" id="acc">Décrocher</button><button class="phbtn" id="dec" style="background:#c0392b;color:#fff">Refuser</button>`;
  $('acc').onclick = () => { game.net.answer(); phoneHome(); };
  $('dec').onclick = () => { game.net.decline(); ph.hidden = true; };
};
function phoneBank() { const s = game.life.s; phList(`${fmt(s.money)} · compte ${fmt(s.bank)}`, s.log.slice(-14).reverse().map(l => ({ t: (l.v >= 0 ? '+' : '') + fmt(l.v), s: `Jour ${l.d} · ${l.why || ''}` }))); }
function phoneCars() {
  const s = game.life.s;
  phList('Mes véhicules', s.cars.length ? s.cars.map((c, i) => ({ t: CATALOG.find(x => x.id === c.id).name, s: 'Toucher pour la localiser', run: () => { const ai = game.ownedAI[i]; if (ai) goGPS(ai.pos.clone(), 'Ma voiture'); } })) : [{ t: 'Aucun véhicule', s: 'Passez le permis puis allez à la concession (ou « empruntez »… à vos risques).' }]);
}
function phoneJob() {
  const s = game.life.s, j = s.job && PJOBS[s.job];
  phList('Emploi', j ? [{ t: j.label, s: `${W.places[s.jobPlace].name} · ${j.start}h-${j.end}h${j.pay ? ' · ' + j.pay + ' €/h' : ''} · heures : ${Math.round(s.stats.worked)}`, run: () => goGPS(W.places[s.jobPlace].door.p, 'Travail') }]
    : [{ t: 'Sans emploi', s: 'Postulez à l’entrée d’un commerce, bureau, garage, entrepôt… (E).' }]);
}
function phoneLicense() { const l = game.life.s.license; phList('Permis de conduire', [{ t: l.permis ? '✔ Permis B obtenu' : 'En cours', s: `Inscription ${l.enrolled ? '✔' : '✘'} · Code ${l.code ? '✔' : '✘'} · Leçons ${l.lessons}/2`, run: () => { const p = W.places.find(x => x.type === 'driving_school'); if (p) goGPS(p.door.p, 'Auto-école'); } }]); }
function phoneHousing() { const h = game.life.s.home; phList('Logement', h ? [{ t: h.name, s: h.owned ? 'Propriétaire' : 'Locataire · ' + fmt(h.rent * 4.3) + '/mois', run: () => goGPS(W.places[h.id].door.p, 'Domicile') }] : [{ t: 'Sans logement', s: 'Allez à la porte d’un immeuble ou d’une maison (E) pour louer ou acheter.' }]); }
function phoneNet() {
  const n = game.net;
  $('phBody').innerHTML = `<div class="phh">Multijoueur</div>${n.active ? `<div class="phl"><b>Salon ${n.code}</b><small>${n.conns.length} joueur(s) connecté(s)</small></div><input class="phin" id="chatIn" placeholder="Message aux joueurs"><button class="phbtn" id="chatGo">Envoyer</button><div>${n.chat.slice(-8).map(c => `<div class="phl"><small>${c}</small></div>`).join('')}</div>`
    : `<p style="font-size:12.5px;color:#bbb">Jouez avec vos amis : l’un crée un salon, les autres entrent le code.</p><button class="phbtn" id="netHost">Créer un salon</button><input class="phin" id="netCode" placeholder="Code du salon (4 lettres)" maxlength="4"><button class="phbtn" id="netJoin">Rejoindre</button>`}`;
  const stop = (e) => e.stopPropagation();
  if (n.active) { $('chatIn').addEventListener('keydown', e => { stop(e); if (e.key === 'Enter') { n.say($('chatIn').value); phoneNet(); } }); $('chatGo').onclick = () => { n.say($('chatIn').value); phoneNet(); }; }
  else { $('netCode').addEventListener('keydown', stop); $('netHost').onclick = async () => { await n.hostRoom(); setTimeout(phoneNet, 1500); }; $('netJoin').onclick = () => { n.join($('netCode').value); setTimeout(phoneNet, 2500); }; }
}

let toastT = 0;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 3200); }
game.toast = toast;

// Qualité adaptative : on baisse d'un cran si le jeu tourne sous 28 i/s pendant ~5 s.
const QORDER = ['potato', 'low', 'medium', 'high', 'ultra'];
function autoQuality(R, sky) {
  if (!game.autoQ || game.creating || game.paused || document.hidden) return;
  game.lowFps = game.fps < 28 ? (game.lowFps || 0) + 1 : 0;
  if (game.lowFps >= 5) {
    game.lowFps = -6; const i = QORDER.indexOf(R.quality);
    if (i > 0) { R.setQuality(QORDER[i - 1], sky.sun); game.pop.maxVisible = R.q.npc; game.life.notify('Qualité ajustée automatiquement : ' + ['Très basse', 'Basse', 'Moyenne', 'Haute', 'Ultra'][i - 1]); markQ(); sky.envEvery = R.q.envEvery || 0.25; }
  }
}
let markQ = () => {};

function updateNight(city, sky) {
  const n = sky.night;
  const u = city.glassMat.userData.uniforms;
  u.uDay.value = 0.12 + (1 - n) * 0.9;
  const h = game.hour;
  u.uLit.value = h > 18 || h < 1 ? 0.55 : h < 6 ? 0.08 : h < 8 ? 0.35 : 0.05 + n * 0.3;
  u.uShop.value = (h > 7.5 && h < 21) ? 1 : 0.05;
  u.uOffice.value = (h > 7.5 && h < 19.5) ? 0.85 : 0.12;
  for (const m of lampGlass) m.emissiveIntensity = n * 14;
  for (const k in game.M) { const m = game.M[k]; if (m && m.userData && m.userData.sign) m.emissiveIntensity = n * 0.9; }
}

function cull(city, camera, dist) {
  const p = camera.position;
  for (const g of city.chunks) g.visible = g.userData.center.distanceTo(p) < dist + 90;
}

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
function hud() {
  const h = Math.floor(game.hour), m = Math.floor((game.hour - h) * 60);
  $('clock').textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  $('day').textContent = DAYS[(game.day - 1) % 7] + ' · Jour ' + game.day;
}

function setupMenu(R, sky) {
  const btns = [...document.querySelectorAll('#qrow button')];
  const mark = () => btns.forEach(b => b.classList.toggle('on', b.dataset.q === R.quality));
  markQ = mark;
  btns.forEach(b => b.onclick = () => { R.setQuality(b.dataset.q, sky.sun); sky.envEvery = R.q.envEvery || 0.25; game.pop.maxVisible = R.q.npc; game.autoQ = false; try { localStorage.setItem('lumen.autoq', '0'); } catch (e) {} mark(); });
  mark();
  $('tod').oninput = (e) => { game.hour = +e.target.value; };
  $('resume').onclick = toggleMenu;
  $('groqKey').value = getKey() ? '••••••••••••' : '';
  $('groqSave').onclick = () => { const v = $('groqKey').value; if (v && !v.startsWith('•')) { setKey(v); toast('Clé Groq enregistrée dans ce navigateur'); } if (!v) setKey(''); };
  $('groqKey').addEventListener('keydown', e => e.stopPropagation());
}
function toggleMenu() {
  const m = $('menu'); m.hidden = !m.hidden; game.paused = !m.hidden; game.input.enabled = m.hidden;
  $('tod').value = game.hour;
  if (!m.hidden) document.exitPointerLock?.();
}

start().catch(e => { console.error(e); $('loadtxt').textContent = 'Erreur : ' + e.message; });
