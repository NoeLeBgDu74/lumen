// Cinématique d'introduction (premier lancement) : survol de Lumen au coucher du soleil, titres, puis descente sur le joueur.
// Espace ou Échap pour passer.
import * as THREE from 'three';
import * as W from './world.js';

const $ = (id) => document.getElementById(id);

export async function playIntro(game) {
  try { if (localStorage.getItem('lw.introSeen')) return; } catch (e) { return; }
  const cam = game.R.camera, P = game.player, home = P.pos.clone();
  const savedHour = game.hour; game.hour = 18.6; // lumière dorée
  const pts = [
    new THREE.Vector3(W.OX - 160, 120, W.OZ - 160), new THREE.Vector3(-150, 90, -240), new THREE.Vector3(60, 70, -120),
    new THREE.Vector3(200, 45, 40), new THREE.Vector3(home.x + 40, 25, home.z + 40), new THREE.Vector3(home.x + 6, 3, home.z + 6),
  ];
  const curve = new THREE.CatmullRomCurve3(pts);
  const look = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 10, 0), new THREE.Vector3(100, 0, 0), home.clone().add(new THREE.Vector3(-60, 0, -40)), home.clone(), home.clone().add(new THREE.Vector3(0, 1.4, 0))]);
  const cine = $('cine'); cine.classList.add('on'); document.body.classList.add('cinema');
  game.cineCam = true; game.input.enabled = false; game.introCam = true;
  const lines = [
    [0.02, '<b>LUMEN</b> — 220 habitants, une ville qui vit sa vie.'],
    [0.25, 'Chacun a son travail, ses amis, ses habitudes… et ses secrets.'],
    [0.5, 'Ici, personne ne vous attend. Tout reste à construire.'],
    [0.75, `Bienvenue, <b>${game.profile.first}</b>.`],
  ];
  const D = 22; let t = 0, skip = false, li = -1;
  const onKey = (e) => { if (e.code === 'Space' || e.code === 'Escape') skip = true; };
  addEventListener('keydown', onKey);
  $('chap').innerHTML = '<b>LIVING WORLD</b><span>Espace pour passer</span>'; $('chap').classList.add('on');
  setTimeout(() => $('chap').classList.remove('on'), 3500);
  await new Promise(res => {
    setTimeout(res, (D + 4) * 1000); // sécurité : la cinématique ne peut jamais bloquer le jeu
    const step = () => {
      const now = performance.now(); t += Math.min(0.1, (now - (step.last || now)) / 1000); step.last = now; const k = Math.min(1, t / D), e = k * k * (3 - 2 * k);
      game.camOverride = () => { cam.position.copy(curve.getPointAt(e)); cam.lookAt(look.getPointAt(Math.min(1, e * 1.02))); cam.userData.focus = cam.position.clone(); };
      const n = lines.filter(l => l[0] <= k).length - 1;
      if (n !== li) { li = n; $('sub').innerHTML = lines[n] ? lines[n][1] : ''; }
      if (k >= 1 || skip) return res();
      requestAnimationFrame(step);
    };
    step();
  });
  removeEventListener('keydown', onKey); game.camOverride = null;
  cine.classList.remove('on'); document.body.classList.remove('cinema'); $('sub').textContent = '';
  game.cineCam = false; game.introCam = false; game.input.enabled = true; game.hour = savedHour; P.camInit = false;
  try { localStorage.setItem('lw.introSeen', '1'); } catch (e) {}
}
