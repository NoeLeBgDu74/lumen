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
import { Population } from './npc.js';
import { Talk, getKey, setKey } from './talk.js';

async function loadCharBase(id) { const b = await loadCharBase0(id); charCache[id] = b; return b; }
const $ = (id) => document.getElementById(id);
const setLoad = (p, t) => { $('loadbar').style.width = Math.round(p * 100) + '%'; if (t) $('loadtxt').textContent = t; };
const tick = () => new Promise(r => requestAnimationFrame(() => r()));

const game = window.game = { time: 0, hour: 8.0, day: 1, timeScale: 30 }; // 1 s réelle = 30 s de jeu (une journée = 48 min)

async function start() {
  const R = game.R = new Renderer($('c'));
  const scene = R.scene, camera = R.camera;
  let q = 'high'; try { q = localStorage.getItem('lumen.quality') || 'high'; } catch (e) {}
  const sky = game.sky = new Sky(R.r, scene);
  R.setQuality(q, sky.sun);

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
  for (let k = 0; k < R.q.traffic; k++) {
    const e = W.edges[Math.floor(Math.random() * W.edges.length)];
    const ai = traffic.newCar(); ai.edge = e; ai.t = W.RW + 2 + Math.random() * (e.len - 2 * W.RW - 10); ai.state = 'drive'; ai.v = 8; traffic.wander(ai);
  }

  setLoad(0.72, 'Habitants…');
  await Promise.all([loadCharBase('rpm'), loadCharBase('michelle')]);
  const input = game.input = new Input($('c'));
  const home = W.places.find(p => p.homeBlock && p.door) || W.places.find(p => p.type === 'apartments' && p.door);
  game.home = home;
  const player = game.player = new Player(null, world, camera);
  const d = home.door; player.place(d.p.x + d.nrm.x * 1.5, d.p.z + d.nrm.z * 1.5, Math.atan2(d.nrm.x, d.nrm.z));
  player.camYaw = Math.atan2(d.nrm.x, d.nrm.z) + Math.PI * 0.85;
  let saved = null; try { saved = JSON.parse(localStorage.getItem('lw.profile') || 'null'); } catch (e) {}
  game.profile = saved || { model: 'rpm', first: 'Lucas', last: 'Moreau', top: '#3b5b8c', bottom: '#2b2b30' };
  setPlayerChar(scene, player, game.profile);
  player.dyn = (p) => traffic.circles(p, 8);
  setLoad(0.85, 'Habitants : emplois du temps, relations…'); await tick();
  const pop = game.pop = new Population(scene, traffic, charCache, game);
  pop.maxVisible = R.q.npc;
  // population déterministe : mêmes habitants à chaque partie (mémoire des conversations cohérente)
  const mr = Math.random; let seed = 777; Math.random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) % 1e9) / 1e9; };
  try { pop.generate(170); } finally { Math.random = mr; }
  game.talk = new Talk(game);
  setLoad(0.9, 'Compilation des shaders…'); await tick();
  sky.hour = game.hour; sky.update(0, camera, 0);
  player.update(0.016, input); player.updateCamera(1, player.pos);
  R.r.compile(scene, camera);
  setLoad(1, 'Prêt'); await tick();
  $('loading').style.opacity = 0; setTimeout(() => $('loading').remove(), 900);
  setupMenu(R, sky);
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
      if (input.pressed('KeyE') && !game.veh && !game.seq) { const n = pop.nearestTo(player.pos, 2.6); if (n) game.talk.start(n); }
      if (game.seq) seqUpdate(dt);
      else if (game.veh) driveUpdate(dt);
      else { player.update(dt, input); player.updateCamera(dt, player.pos); }
      const obst = [{ x: (game.veh ? game.veh.pos : player.pos).x, z: (game.veh ? game.veh.pos : player.pos).z, len: game.veh ? 3 : 1.2 }];
      for (const p of pop.people) if (p.char) obst.push({ x: p.pos.x, z: p.pos.z, len: 1 });
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
    if (fpsAcc > 1) { game.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; $('stats').textContent = `${game.fps} i/s · ${R.r.info.render.calls} appels · ${(R.r.info.render.triangles / 1e6).toFixed(2)} M triangles`; }
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
  const ai = nearestCar(); if (!ai) return;
  if (ai.owner && ai.owner !== 'player' && !game.stealOk) { /* voiture d'un habitant : on autorise, mais il s'en souviendra */ }
  game.seq = { type: 'enter', ai, t: 0, phase: 'walk' };
  pl.mode = 'seq';
}
function seatPose(car, ch) {
  const p = car.obj.localToWorld(SEAT.clone());
  ch.obj.position.set(p.x, car.obj.position.y + SEAT.y - ch.hipH + 0.02, p.z);
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
      if (dist <= 0.12 || s.walkT > 3) { s.phase = 'sit'; s.t = 0; s.from = pl.pos.clone(); s.fromYaw = pl.yaw; ch.play('sit', 0.7); }
      ch.obj.position.copy(pl.pos); ch.obj.rotation.y = pl.yaw;
    } else {
      s.t += dt; const k = Math.min(1, s.t / 1.2), e = k * k * (3 - 2 * k);
      const seat = car.obj.localToWorld(SEAT.clone()); seat.y = car.obj.position.y + SEAT.y - ch.hipH + 0.02;
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
  if (ai.owner && ai.owner !== 'player' && ai.owner.memory) game.pop.remember(ai.owner, `s'est fait prendre sa voiture par ${game.profile.first}`);
  ai.state = 'player';
  const v = game.veh = new Vehicle(ai.car, game.world); game.vehAI = ai;
  v.dyn = (p) => game.traffic.circles(p);
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
    const head = v.car.obj.localToWorld(HEAD.clone());
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
  if (game.talk && game.talk.open) { el.hidden = true; return; }
  if (!game.veh && !game.seq) { const n = game.pop.nearestTo(game.player.pos, 2.6); if (n) { el.hidden = false; el.innerHTML = '<kbd>E</kbd>Parler à ' + (n.metPlayer ? n.first : 'cet habitant'); return; } }
  if (!game.veh) { const ai = nearestCar(); if (ai) { el.hidden = false; el.innerHTML = '<kbd>F</kbd>Monter dans ' + ai.tpl.spec.name; return; } }
  el.hidden = true;
}
let toastT = 0;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 3200); }
game.toast = toast;

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
  btns.forEach(b => b.onclick = () => { R.setQuality(b.dataset.q, sky.sun); mark(); });
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
