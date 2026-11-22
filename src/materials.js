// Bibliothèque de matériaux de la ville (PBR Poly Haven + matériaux procéduraux).
import * as THREE from 'three';
import { pbr, canvasTex } from './assets.js';

// Variation macro anti-répétition + salissures en pied de mur (coordonnées monde).
export function grime(m, { macro = 0.16, base = 0.0, wet = 0 } = {}) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh) => {
    prev && prev(sh);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPg;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        { vec4 wpg = vec4(transformed,1.);
          #ifdef USE_INSTANCING
            wpg = instanceMatrix * wpg;
          #endif
          vWPg = (modelMatrix * wpg).xyz; }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vWPg;
        float gn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          float a=fract(sin(dot(i,vec2(127.1,311.7)))*43758.5453), b=fract(sin(dot(i+vec2(1,0),vec2(127.1,311.7)))*43758.5453);
          float c=fract(sin(dot(i+vec2(0,1),vec2(127.1,311.7)))*43758.5453), d=fract(sin(dot(i+vec2(1,1),vec2(127.1,311.7)))*43758.5453);
          return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
        float fbm(vec2 p){ return gn(p)*.5 + gn(p*2.03)*.3 + gn(p*4.1)*.2; }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        { vec2 q = vWPg.xz + vec2(vWPg.y*.7, -vWPg.y*.3);
          float n = fbm(q*.045) * .7 + fbm(q*.31) * .3;
          diffuseColor.rgb *= 1. + (n - .5) * ${(macro * 2).toFixed(3)};
          ${base > 0 ? `float gr = smoothstep(1.6, 0.0, vWPg.y) * ${base.toFixed(3)} * (.6 + .4*fbm(vWPg.xz*.8 + vWPg.y));
          diffuseColor.rgb *= 1. - gr;` : ''}
        }`);
  };
  const key = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
  m.customProgramCacheKey = () => key + '|grime' + macro + base;
  return m;
}

export function buildMaterials() {
  const M = {};
  M.asphalt = grime(pbr('asphalt_02', { scale: 4.5, color: 0xd8d8d8 }), { macro: 0.22 });
  M.sidewalk = grime(pbr('square_concrete_pavers', { scale: 2.2 }), { macro: 0.18 });
  M.curb = grime(pbr('concrete_floor_02', { scale: 1.6, color: 0xdedbd4 }), { macro: 0.1 });
  M.plaza = grime(pbr('concrete_floor_02', { scale: 3, color: 0xcfc8bc }), { macro: 0.2 });
  M.grass = grime(pbr('leafy_grass', { scale: 2.6, color: 0xc8d6b0 }), { macro: 0.3 });
  M.gravel = grime(pbr('gravel_floor', { scale: 2.5, color: 0xb9b4ac }), { macro: 0.2 });

  M.brick = grime(pbr('red_brick_03', { scale: 2.0 }), { macro: 0.12, base: 0.25 });
  M.brickDark = grime(pbr('brick_wall_10', { scale: 2.4 }), { macro: 0.12, base: 0.25 });
  M.plasterW = grime(pbr('white_plaster_02', { scale: 3, color: 0xf0ece4 }), { macro: 0.14, base: 0.3 });
  M.plasterY = grime(pbr('yellow_plaster', { scale: 3, color: 0xf2e2c4 }), { macro: 0.14, base: 0.3 });
  M.plasterG = grime(pbr('grey_plaster', { scale: 3, color: 0xd7d3cc }), { macro: 0.14, base: 0.3 });
  M.painted = grime(pbr('painted_concrete', { scale: 3, color: 0xe7d8c8 }), { macro: 0.14, base: 0.3 });
  M.concTile = grime(pbr('concrete_tile_facade', { scale: 4, color: 0xe6e2da }), { macro: 0.1, base: 0.2 });
  M.facadeTile = grime(pbr('rectangular_facade_tiles_02', { scale: 3 }), { macro: 0.1, base: 0.2 });
  M.stone = grime(pbr('white_plaster_02', { scale: 2, color: 0xe9e1d2 }), { macro: 0.1, base: 0.2 });
  M.stoneDark = grime(pbr('grey_plaster', { scale: 2, color: 0xa9a49b }), { macro: 0.1 });
  M.roof = grime(pbr('gravel_floor', { scale: 2, color: 0x9d9993 }), { macro: 0.25 });
  M.bark = pbr('bark_willow_02', { scale: 1.2 });

  const std = (color, rough, metal, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  // Campagne, quartiers, maisons, industrie
  M.field = grime(pbr('aerial_grass_rock', { scale: 14, color: 0xd2d8c0 }), { macro: 0.35 });
  M.asphaltRural = grime(pbr('asphalt_02', { scale: 4.5, color: 0xc4c4c4 }), { macro: 0.25 });
  M.gravelShoulder = grime(pbr('gravel_floor', { scale: 2, color: 0xa8a197 }), { macro: 0.2 });
  M.parkingLot = grime(pbr('asphalt_02', { scale: 4.5, color: 0xcfcfcf }), { macro: 0.28 });
  M.concreteYard = grime(pbr('garage_floor', { scale: 4, color: 0xc9c5bd }), { macro: 0.3 });
  M.drive = grime(pbr('concrete_floor_02', { scale: 2, color: 0xd8d2c6 }), { macro: 0.15 });
  M.showroomFloor = pbr('marble_tiles', { scale: 2.5 });
  M.whiteBrick = grime(pbr('white_bricks', { scale: 2 }), { macro: 0.1, base: 0.25 });
  M.roofClay = grime(pbr('clay_roof_tiles_02', { scale: 2.2 }), { macro: 0.18 });
  M.roofGrey = grime(pbr('grey_roof_tiles_02', { scale: 2.2 }), { macro: 0.18 });
  M.ridgeClay = std(0x8a4a32, 0.8, 0); M.ridgeGrey = std(0x3c3f44, 0.75, 0);
  M.metalSheet = grime(pbr('box_profile_metal_sheet', { scale: 2.5, color: 0xc9ced3, metalness: 1 }), { macro: 0.18, base: 0.2 });
  M.metalSheet.metalness = 0.6; M.metalSheet.metalnessMap = M.metalSheet.roughnessMap;
  M.garageDoor = pbr('painted_metal_shutter', { scale: 2.4, color: 0xe8e8e8 });
  M.fence = grime(pbr('plank_flooring_02', { scale: 1.5, color: 0xf0ece4 }), { macro: 0.1 });
  M.curbMat = M.curb;
  M.pitch = grime(pbr('leafy_grass', { scale: 2, color: 0x9cc27a }), { macro: 0.12 });
  M.skylight = std(0xa9c4d6, 0.15, 0.2, { envMapIntensity: 1.4 });
  M.mailbox = std(0x2b4a6b, 0.4, 0.5);
  M.flag = std(0xf2c14e, 0.8, 0, { side: THREE.DoubleSide });
  M.canopy = std(0xf2f2f0, 0.5, 0.1);
  M.canopyRed = std(0x0b7a3a, 0.45, 0.1);
  M.pumpBody = std(0xf4f4f2, 0.35, 0.2);
  M.pumpScreen = std(0x101418, 0.2, 0.3, { emissive: 0x2a8f5a, emissiveIntensity: 0.6 });
  M.signalPole = std(0x3a3d40, 0.45, 0.8);
  M.signalBody = std(0x15171a, 0.5, 0.3);
  for (const [k, c] of [['containerBlue', 0x2c5a8c], ['containerRed', 0x8c2c22], ['containerGreen', 0x2f6b47], ['containerOrange', 0xc0662a]]) {
    M[k] = grime(pbr('box_profile_metal_sheet', { scale: 2.5, color: c }), { macro: 0.2 }); M[k].metalness = 0.4; M[k].metalnessMap = M[k].roughnessMap;
  }
  M.metalDark = std(0x1d1f22, 0.42, 0.85);
  M.iron = std(0x121314, 0.55, 0.7);
  M.alu = std(0x8f969d, 0.32, 1.0);
  M.aluDark = std(0x34383d, 0.36, 0.9);
  M.frameWhite = std(0xe6e3dc, 0.45, 0.0);
  M.frameGreen = std(0x1f3a2f, 0.42, 0.0);
  M.frameBlack = std(0x18191b, 0.4, 0.2);
  M.frameWood = std(0x5a3a24, 0.55, 0.0);
  M.spandrel = std(0x22272d, 0.18, 0.6, { envMapIntensity: 1.3 });
  M.tank = std(0x7d8186, 0.5, 0.8);
  M.rubber = std(0x151515, 0.9, 0.0);
  M.water = new THREE.MeshPhysicalMaterial({ color: 0x0d2a33, roughness: 0.03, metalness: 0, transmission: 0, envMapIntensity: 1.4, clearcoat: 1 });

  // Peinture routière usée (masque procédural).
  const wear = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const a = Math.random(); g.fillStyle = `rgba(0,0,0,${a * 0.5})`; const s = Math.random() * 6 + 1; g.fillRect(Math.random() * w, Math.random() * h, s, s * 0.6); }
  }, false);
  wear.wrapS = wear.wrapT = THREE.RepeatWrapping; wear.repeat.set(0.25, 0.25);
  const paint = (c) => { const m = std(c, 0.62, 0, { alphaMap: wear, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }); m.userData.noShadow = true; return m; };
  M.paintW = paint(0xe9e7df); M.paintY = paint(0xe0b13a);

  // Portes en bois à panneaux.
  const doorTex = canvasTex(256, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#4a2c1a'); gr.addColorStop(.5, '#5e3a22'); gr.addColorStop(1, '#4a2c1a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) { g.strokeStyle = `rgba(30,15,5,${Math.random() * .25})`; g.beginPath(); const x = Math.random() * w; g.moveTo(x, 0); g.lineTo(x + Math.random() * 6 - 3, h); g.stroke(); }
    const panel = (x, y, pw, ph) => { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x, y, pw, ph); g.fillStyle = 'rgba(255,220,180,.08)'; g.fillRect(x + 6, y + 6, pw - 12, ph - 12); g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 3; g.strokeRect(x + 6, y + 6, pw - 12, ph - 12); };
    panel(26, 30, w - 52, h * .42); panel(26, h * .52, w - 52, h * .42);
    g.fillStyle = '#c9a45a'; g.beginPath(); g.arc(w - 40, h * .5, 9, 0, 7); g.fill();
  });
  M.door = std(0xffffff, 0.5, 0, { map: doorTex });
  doorTex.wrapS = doorTex.wrapT = THREE.ClampToEdgeWrapping;

  // Volets à persiennes.
  const louver = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 10) { const gr = g.createLinearGradient(0, y, 0, y + 10); gr.addColorStop(0, '#fff'); gr.addColorStop(.7, '#cfcfcf'); gr.addColorStop(1, '#7a7a7a'); g.fillStyle = gr; g.fillRect(6, y, w - 12, 10); }
    g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, 6, h); g.fillRect(w - 6, 0, 6, h); g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6); g.fillRect(0, h / 2 - 3, w, 6);
  });
  louver.wrapS = louver.wrapT = THREE.ClampToEdgeWrapping;
  M.shutterGreen = std(0x3f6b55, 0.55, 0, { map: louver });
  M.shutterBlue = std(0x6f8796, 0.55, 0, { map: louver });
  M.shutterWhite = std(0xe9e6de, 0.55, 0, { map: louver });

  // Grille d'arbre / plaque d'égout.
  const grate = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#2a2b2c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#111'; g.lineWidth = 5;
    for (let r = 30; r < 128; r += 16) { g.beginPath(); g.arc(128, 128, r, 0, 7); g.stroke(); }
    for (let a = 0; a < 24; a++) { g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a / 24 * 6.283) * 128, 128 + Math.sin(a / 24 * 6.283) * 128); g.stroke(); }
    g.fillStyle = '#3b2a1c'; g.beginPath(); g.arc(128, 128, 30, 0, 7); g.fill();
  });
  M.treeGrate = std(0xffffff, 0.6, 0.7, { map: grate, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const manhole = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3a3b3c'; g.beginPath(); g.arc(128, 128, 126, 0, 7); g.fill();
    g.strokeStyle = '#1b1b1c'; g.lineWidth = 4;
    for (let i = -120; i < 120; i += 14) { g.beginPath(); g.moveTo(128 + i, 20); g.lineTo(128 + i, 236); g.stroke(); g.beginPath(); g.moveTo(20, 128 + i); g.lineTo(236, 128 + i); g.stroke(); }
    g.lineWidth = 8; g.beginPath(); g.arc(128, 128, 118, 0, 7); g.stroke();
    g.fillStyle = '#4a4b4c'; g.font = 'bold 26px Inter, sans-serif'; g.textAlign = 'center'; g.fillText('LUMEN', 128, 137);
  });
  M.manhole = std(0xffffff, 0.45, 0.85, { map: manhole, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const mk = canvasTex(4, 4, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 4, 4); });
  M.manhole.alphaMap = manhole; mk.dispose();
  return M;
}

// Enseigne de commerce (texte peint) — un matériau par commerce.
export function signMaterial(text, { bg = '#1d2a24', fg = '#f3e6c8', font = 'Inter', sub = '' } = {}) {
  const t = canvasTex(1024, 160, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,.10)'); gr.addColorStop(1, 'rgba(0,0,0,.25)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 4; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${sub ? 70 : 84}px ${font}, sans-serif`;
    g.fillText(text, w / 2, sub ? h * 0.42 : h / 2 + 4);
    if (sub) { g.font = `500 30px ${font}, sans-serif`; g.globalAlpha = .8; g.fillText(sub, w / 2, h * 0.78); }
  });
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, metalness: 0.1, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0 });
  m.userData.sign = true;
  return m;
}

// Store / auvent rayé.
export function awningMaterial(c1, c2) {
  const t = canvasTex(256, 64, (g, w, h) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? c2 : c1; g.fillRect(i * w / 8, 0, w / 8, h); }
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * .06})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 1); }
  });
  t.wrapS = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
}
