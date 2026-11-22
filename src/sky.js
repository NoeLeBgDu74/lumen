// Cycle jour/nuit piloté par de vrais ciels HDRI (Poly Haven, série Qwantani).
// - le fond du ciel fond enchaîné entre deux HDRI voisines,
// - l'éclairage d'environnement (reflets PBR) est régénéré à partir du ciel mélangé (PMREM),
// - la direction et la couleur du soleil sont mesurées dans chaque HDRI puis orientées sur une course est → sud → ouest.
import * as THREE from 'three';
import { hdr } from './assets.js';

const KEYS = [
  { h: 0.0,  f: 'qwantani_night_puresky',          sky: 0.035, sun: 0.10, exp: 1.65, kind: 'moon' },
  { h: 5.2,  f: 'qwantani_dusk_2_puresky',         sky: 0.16,  sun: 0.25, exp: 1.35 },
  { h: 7.2,  f: 'qwantani_morning_puresky',        sky: 0.85,  sun: 2.6,  exp: 1.0 },
  { h: 12.5, f: 'qwantani_noon_puresky',           sky: 1.0,   sun: 3.4,  exp: 0.92 },
  { h: 16.6, f: 'qwantani_late_afternoon_puresky', sky: 0.9,   sun: 3.0,  exp: 0.96 },
  { h: 19.1, f: 'qwantani_sunset_puresky',         sky: 0.5,   sun: 1.7,  exp: 1.08 },
  { h: 20.5, f: 'qwantani_dusk_2_puresky',         sky: 0.16,  sun: 0.25, exp: 1.35 },
  { h: 22.0, f: 'qwantani_night_puresky',          sky: 0.035, sun: 0.10, exp: 1.65, kind: 'moon' },
];

const vert = `varying vec3 vDir; void main(){ vDir = position; vec4 p = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w; }`;
const frag = `
  uniform sampler2D tA, tB; uniform float uMix, gA, gB, rA, rB, uClamp;
  varying vec3 vDir;
  vec3 look(sampler2D t, vec3 d, float rot){
    float th = atan(d.z, d.x) + rot; float ph = asin(clamp(d.y,-1.,1.));
    vec2 uv = vec2(fract(th/6.2831853 + .5), ph/3.1415926 + .5);
    return texture2D(t, uv).rgb;
  }
  void main(){
    vec3 d = normalize(vDir);
    vec3 dd = d; dd.y = max(dd.y, 0.004);  // sous l'horizon : on prolonge l'horizon (la ville cache le sol de l'HDRI)
    vec3 c = mix(look(tA, dd, rA)*gA, look(tB, dd, rB)*gB, uMix);
    c = min(c, vec3(uClamp));
    gl_FragColor = vec4(c, 1.);
  }`;

export class Sky {
  constructor(renderer, scene) {
    this.r = renderer; this.scene = scene;
    this.hour = 8.5; this.night = 0; this.sunDir = new THREE.Vector3(0.4, 0.8, 0.3);
    this.data = new Map();
    const mk = (clamp) => new THREE.ShaderMaterial({
      uniforms: { tA: { value: null }, tB: { value: null }, uMix: { value: 0 }, gA: { value: 1 }, gB: { value: 1 }, rA: { value: 0 }, rB: { value: 0 }, uClamp: { value: clamp } },
      vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: false
    });
    this.bgMat = mk(60000); this.envMat = mk(12);
    const geo = new THREE.SphereGeometry(500, 48, 24);
    this.mesh = new THREE.Mesh(geo, this.bgMat); this.mesh.frustumCulled = false; this.mesh.renderOrder = -1000;
    scene.add(this.mesh);
    this.envScene = new THREE.Scene(); this.envScene.add(new THREE.Mesh(geo, this.envMat));
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null; this.lastEnvKey = -1; this.lastEnvTime = -10;

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.00025; this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 900;
    scene.add(this.sun, this.sun.target);
    scene.fog = new THREE.FogExp2(0xb8c4d0, 0.0016);
    this.fogColor = new THREE.Color();
  }

  async load(onProgress) {
    const files = [...new Set(KEYS.map(k => k.f))];
    let n = 0;
    await Promise.all(files.map(async f => {
      const t = await hdr('assets/hdri/' + f + '_2k.hdr');
      t.mapping = THREE.UVMapping; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
      t.wrapS = THREE.RepeatWrapping;
      this.data.set(f, { tex: t, ...analyse(t) });
      onProgress && onProgress(++n / files.length);
    }));
  }

  // Azimut cible du soleil selon l'heure (est = +x, sud = +z, ouest = -x).
  targetAz(h) { const hh = ((h % 24) + 24) % 24; const k = THREE.MathUtils.clamp((hh - 5) / 16, 0, 1); return -0.25 + k * (Math.PI + 0.5) + (hh < 5 || hh > 21 ? Math.PI * 0.5 : 0); }

  update(dt, camera, time) {
    const h = ((this.hour % 24) + 24) % 24;
    let i = 0; while (i < KEYS.length - 1 && KEYS[i + 1].h <= h) i++;
    const A = KEYS[i], B = KEYS[(i + 1) % KEYS.length];
    const span = ((B.h - A.h) + 24) % 24 || 24;
    let m = (((h - A.h) + 24) % 24) / span;
    m = m * m * (3 - 2 * m);
    const dA = this.data.get(A.f), dB = this.data.get(B.f);
    const tAz = this.targetAz(h);
    for (const mat of [this.bgMat, this.envMat]) {
      const u = mat.uniforms;
      u.tA.value = dA.tex; u.tB.value = dB.tex; u.uMix.value = m;
      u.gA.value = A.sky / dA.avg; u.gB.value = B.sky / dB.avg;
      u.rA.value = dA.sunAz - tAz; u.rB.value = dB.sunAz - tAz;
    }
    // Soleil : élévation interpolée entre les deux HDRI, azimut imposé.
    const el = THREE.MathUtils.lerp(dA.sunEl, dB.sunEl, m);
    const isMoon = (A.kind === 'moon' && m < 0.5) || (B.kind === 'moon' && m >= 0.5);
    const elev = Math.max(el, 0.06);
    this.sunDir.set(Math.cos(tAz) * Math.cos(elev), Math.sin(elev), Math.sin(tAz) * Math.cos(elev));
    const col = new THREE.Color().copy(dA.sunCol).lerp(dB.sunCol, m);
    this.sun.color.copy(col);
    this.sun.intensity = THREE.MathUtils.lerp(A.sun, B.sun, m) * THREE.MathUtils.smoothstep(el, -0.02, 0.08 + (isMoon ? 0 : 0.0)) + (isMoon ? 0.0 : 0);
    if (isMoon) { this.sun.intensity = THREE.MathUtils.lerp(A.sun, B.sun, m); this.sun.color.set(0x9fb4ff); }
    this.night = THREE.MathUtils.clamp(1 - (THREE.MathUtils.lerp(A.sky, B.sky, m) - 0.05) / 0.4, 0, 1);
    this.exposure = THREE.MathUtils.lerp(A.exp, B.exp, m);
    this.r.toneMappingExposure = this.exposure;

    // Ombres : la caméra d'ombre suit le joueur, alignée sur la grille des texels (pas de scintillement).
    const target = camera.userData.focus || camera.position;
    const sc = this.sun.shadow.camera; const res = this.sun.shadow.mapSize.x;
    const texel = (sc.right - sc.left) / res;
    const sd = this.sunDir;
    const lookM = new THREE.Matrix4().lookAt(new THREE.Vector3(), sd.clone().negate(), new THREE.Vector3(0, 1, 0));
    const inv = lookM.clone().invert();
    const p = target.clone().applyMatrix4(inv); p.x = Math.round(p.x / texel) * texel; p.y = Math.round(p.y / texel) * texel;
    p.applyMatrix4(lookM);
    this.sun.target.position.copy(p);
    this.sun.position.copy(p).addScaledVector(sd, 400);
    this.sun.target.updateMatrixWorld();

    // Brouillard atmosphérique : teinte de l'horizon.
    this.fogColor.copy(dA.horizon).multiplyScalar(A.sky / dA.avg).lerp(dB.horizon.clone().multiplyScalar(B.sky / dB.avg), m);
    this.scene.fog.color.copy(this.fogColor);

    this.mesh.position.copy(camera.position);

    // Régénère l'environnement PMREM quand le ciel a changé.
    const key = Math.round(h * 20);
    if (key !== this.lastEnvKey && time - this.lastEnvTime > 0.25) {
      this.lastEnvKey = key; this.lastEnvTime = time;
      const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 1000);
      this.scene.environment = rt.texture;
      if (this.envRT) this.envRT.dispose();
      this.envRT = rt;
    }
  }
}

// Analyse d'une HDRI : direction/couleur du point le plus lumineux (soleil ou lune), luminance moyenne du ciel, couleur d'horizon.
function analyse(t) {
  const { width: w, height: h, data } = t.image;
  const half = data instanceof Uint16Array; const ch = data.length / (w * h);
  const get = (i) => half ? THREE.DataUtils.fromHalfFloat(data[i]) : data[i];
  let best = -1, bx = 0, by = 0, sum = 0, cnt = 0; const hz = new THREE.Color(0, 0, 0); let hn = 0;
  const step = 4;
  for (let y = 0; y < h / 2; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * ch; const r = get(i), g = get(i + 1), b = get(i + 2);
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (l > best) { best = l; bx = x; by = y; }
      sum += Math.min(l, 4); cnt++;
      if (y > h * 0.42) { hz.r += Math.min(r, 4); hz.g += Math.min(g, 4); hz.b += Math.min(b, 4); hn++; }
    }
  }
  // affine autour du maximum
  for (let y = Math.max(0, by - step); y < Math.min(h / 2, by + step); y++) for (let x = Math.max(0, bx - step); x < Math.min(w, bx + step); x++) {
    const i = (y * w + x) * ch; const l = 0.2126 * get(i) + 0.7152 * get(i + 1) + 0.0722 * get(i + 2);
    if (l > best) { best = l; bx = x; by = y; }
  }
  const i = (by * w + bx) * ch; const sc = new THREE.Color(get(i), get(i + 1), get(i + 2));
  const mx = Math.max(sc.r, sc.g, sc.b) || 1; sc.multiplyScalar(1 / mx);
  const u = (bx + 0.5) / w, v = 1 - (by + 0.5) / h;
  // L'image est retournée (flipY) : la ligne 0 est le zénith, donc v = 1 - y/h.
  return { sunAz: (u - 0.5) * Math.PI * 2, sunEl: (v - 0.5) * Math.PI, sunCol: sc, avg: sum / cnt, horizon: hz.multiplyScalar(1 / Math.max(1, hn)) };
}
