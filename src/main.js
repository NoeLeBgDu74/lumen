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

async function loadCharBase(id) { const b = await loadCharBase0(id); charCache[id] = b; return b; }
const $ = (id) => document.getElementById(id);
const setLoad = (p, t) => { $('loadbar').style.width = Math.round(p * 100) + '%'; if (t) $('loadtxt').textContent = t; };
const tick = () => new Promise(r => requestAnimationFrame(() => r()));

const game = window.game = { time: 0, hour: 8.0, day: 1, timeScale: 60 }; // 1 s réelle = 1 min de jeu

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
      player.update(dt, input);
      player.updateCamera(dt, player.pos);
    }
    sky.hour = game.hour; sky.update(dt, camera, game.time);
    windU.uTime.value = game.time;
    updateNight(city, sky);
    updateSignals(city, game.time);
    cull(city, camera, R.q.drawDist);
    if (input.pressed('Escape')) toggleMenu();
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
}
function toggleMenu() {
  const m = $('menu'); m.hidden = !m.hidden; game.paused = !m.hidden; game.input.enabled = m.hidden;
  $('tod').value = game.hour;
  if (!m.hidden) document.exitPointerLock?.();
}

start().catch(e => { console.error(e); $('loadtxt').textContent = 'Erreur : ' + e.message; });
