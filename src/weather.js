// Météo dynamique : dégagé, nuageux, pluie, orage, brouillard. Transitions progressives ; pluie en particules,
// chaussée mouillée (reflets), vent sur la végétation, éclairs et tonnerre, adhérence réduite, habitants qui rentrent.
import * as THREE from 'three';
import { windU } from './trees.js';

const STATES = {
  clear:  { label: 'Dégagé', cloud: 0, rain: 0, fog: 1, wind: 0.5 },
  cloudy: { label: 'Nuageux', cloud: 0.55, rain: 0, fog: 1.3, wind: 0.8 },
  rain:   { label: 'Pluie', cloud: 0.8, rain: 0.7, fog: 2.0, wind: 1.1 },
  storm:  { label: 'Orage', cloud: 1, rain: 1, fog: 2.6, wind: 1.8 },
  fog:    { label: 'Brouillard', cloud: 0.5, rain: 0, fog: 5.5, wind: 0.2 },
};
const NEXT = { clear: ['clear', 'cloudy', 'cloudy', 'fog'], cloudy: ['clear', 'rain', 'cloudy', 'storm'], rain: ['cloudy', 'rain', 'storm'], storm: ['rain', 'cloudy'], fog: ['clear', 'cloudy'] };

export class Weather {
  constructor(game, M) {
    this.g = game; this.M = M; this.state = 'clear'; this.target = 'clear';
    this.cur = { ...STATES.clear }; this.wet = 0; this.nextT = game.time + 240 + Math.random() * 240; this.flash = 0;
    // pluie : segments instanciés autour de la caméra
    const N = 5000, pos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) { const x = (Math.random() - 0.5) * 60, y = Math.random() * 30, z = (Math.random() - 0.5) * 60; pos.set([x, y, z, x + 0.02, y - 0.55, z], i * 6); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaab4c4, transparent: true, opacity: 0, depthWrite: false }));
    this.rain.frustumCulled = false; game.R.scene.add(this.rain); this.rainY = 0;
    this.wetMats = ['asphalt', 'asphaltRural', 'parkingLot', 'sidewalk', 'plaza', 'curb', 'drive', 'roof'].map(k => M[k]).filter(Boolean).map(m => ({ m, r: m.roughness, c: m.color.clone() }));
    this.lightning = new THREE.DirectionalLight(0xdfe6ff, 0); game.R.scene.add(this.lightning);
    this.el = document.getElementById('weatherTag');
  }
  set(name) { this.target = name; this.state = name; }
  update(dt) {
    const g = this.g;
    if (g.time > this.nextT && (!g.net || !g.net.connected || g.net.host)) {
      const n = NEXT[this.target]; this.target = n[Math.floor(Math.random() * n.length)]; this.nextT = g.time + 200 + Math.random() * 300;
      if (this.target !== this.state) g.life.notify('🌦 Météo : ' + STATES[this.target].label);
      this.state = this.target;
    }
    const T = STATES[this.target], k = Math.min(1, dt * 0.08);
    for (const key of ['cloud', 'rain', 'fog', 'wind']) this.cur[key] += (T[key] - this.cur[key]) * k;
    const c = this.cur;
    // chaussée mouillée : sèche lentement
    this.wet = THREE.MathUtils.clamp(this.wet + (c.rain > 0.2 ? dt * 0.03 : -dt * 0.006), 0, 1);
    for (const w of this.wetMats) { w.m.roughness = THREE.MathUtils.lerp(w.r, 0.18, this.wet * 0.85); w.m.color.copy(w.c).multiplyScalar(1 - this.wet * 0.35); }
    // ciel / lumière
    const sky = g.sky; sky.sun.intensity *= 1 - c.cloud * 0.75;
    g.R.scene.fog.density *= c.fog;
    g.R.r.toneMappingExposure *= 1 - c.cloud * 0.18;
    windU.uWind.value = c.wind;
    // pluie autour de la caméra
    const cam = g.R.camera;
    this.rain.material.opacity = c.rain * 0.55;
    this.rain.visible = c.rain > 0.02 && !g.interiorRoom;
    this.rainY = (this.rainY - dt * 22) % 30; if (this.rainY > 0) this.rainY -= 30;
    this.rain.position.set(Math.floor(cam.position.x), cam.position.y - 8 + ((this.rainY % 30) + 30) % 30 - 15, Math.floor(cam.position.z));
    // orage : éclairs
    if (this.target === 'storm' && Math.random() < dt * 0.06) { this.flash = 1; setTimeout(() => this.thunder(), 600 + Math.random() * 2500); }
    this.lightning.intensity = this.flash * 6; this.flash = Math.max(0, this.flash - dt * 4);
    this.lightning.position.copy(cam.position).add(new THREE.Vector3(20, 80, 10));
    if (this.el) this.el.textContent = STATES[this.target].label;
  }
  get grip() { return 1 - this.wet * 0.28; }
  get raining() { return this.cur.rain > 0.3; }
  thunder() {
    try {
      const ctx = this.ac || (this.ac = new (window.AudioContext || window.webkitAudioContext)());
      const len = 2.5 * ctx.sampleRate, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
      let v = 0; for (let i = 0; i < len; i++) { v = v * 0.995 + (Math.random() * 2 - 1) * 0.05; d[i] = v * Math.pow(1 - i / len, 1.5) * 6; }
      const s = ctx.createBufferSource(); s.buffer = b; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
      const gn = ctx.createGain(); gn.gain.value = 0.5; s.connect(f); f.connect(gn); gn.connect(ctx.destination); s.start();
    } catch (e) {}
  }
}
