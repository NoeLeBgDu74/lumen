// Petits systèmes de vie : radio de voiture (musique générée), mode photo/selfie (publié sur Lumen Live),
// effets de fatigue/faim (vision, démarche), boutique de vêtements.
import * as THREE from 'three';

const $ = (id) => document.getElementById(id);

// ---------- radio : musique générée en temps réel (aucun fichier) ----------
const STATIONS = [
  { name: 'Lumen FM — Lo-fi', bpm: 78, chords: [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]], wave: 'triangle', drums: 'soft' },
  { name: 'Nuit Électrique — Synthwave', bpm: 104, chords: [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59], [40, 47, 52, 55]], wave: 'sawtooth', drums: 'four' },
  { name: 'Radio Soleil — Funk', bpm: 112, chords: [[50, 57, 60, 65], [55, 59, 62, 65], [48, 55, 58, 64], [53, 57, 60, 64]], wave: 'square', drums: 'funk' },
];
export class Radio {
  constructor(game) { this.g = game; this.idx = -1; this.next = 0; this.step = 0; }
  get on() { return this.idx >= 0; }
  cycle() {
    this.idx = this.idx + 1 >= STATIONS.length ? -1 : this.idx + 1;
    this.g.life.notify(this.on ? '📻 ' + STATIONS[this.idx].name : '📻 Radio éteinte');
    const a = this.g.audio; if (a && a.ready && !this.out) { this.out = a.ctx.createGain(); this.out.gain.value = 0.22; this.out.connect(a.master); }
    this.next = 0;
  }
  note(f, t, dur, type, vol) {
    const c = this.g.audio.ctx, o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o.type = type; o.frequency.value = 440 * Math.pow(2, (f - 69) / 12); lp.type = 'lowpass'; lp.frequency.value = type === 'triangle' ? 1800 : 1200;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.05);
  }
  hit(t, kind) {
    const a = this.g.audio, c = a.ctx;
    if (kind === 'kick') { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2); o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.22); return; }
    const s = c.createBufferSource(); s.buffer = a.noiseBuf; const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = kind === 'hat' ? 7000 : 1500;
    const g = c.createGain(); g.gain.setValueAtTime(kind === 'hat' ? 0.08 : 0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'hat' ? 0.05 : 0.18));
    s.connect(f); f.connect(g); g.connect(this.out); s.start(t); s.stop(t + 0.2);
  }
  update() {
    const g = this.g, a = g.audio; if (!this.on || !a || !a.ready || !this.out) return;
    const playing = !!g.veh || (g.taxi && g.taxi.phase === 'ride');
    this.out.gain.setTargetAtTime(playing ? 0.22 : 0, a.ctx.currentTime, 0.3);
    if (!playing) return;
    const S = STATIONS[this.idx], c = a.ctx, beat = 60 / S.bpm / 2; // croches
    if (!this.next || this.next < c.currentTime) this.next = c.currentTime + 0.05;
    while (this.next < c.currentTime + 0.25) {
      const t = this.next, st = this.step % 32, ch = S.chords[Math.floor(this.step / 32) % S.chords.length];
      if (st === 0) ch.forEach(n => this.note(n, t, beat * 15, S.wave, 0.035));
      if (st % 4 === 0) this.note(ch[0] - 12, t, beat * 1.8, 'sine', 0.12);
      if (S.wave !== 'triangle' && st % 2 === 0) this.note(ch[(st / 2) % 4] + 12, t, beat * 0.9, S.wave, 0.025);
      if (S.wave === 'triangle' && st % 6 === 3) this.note(ch[(st % 4)] + 12, t, beat * 2, 'triangle', 0.04);
      if (S.drums === 'four' && st % 4 === 0) this.hit(t, 'kick');
      if (S.drums !== 'four' && (st % 16 === 0 || st % 16 === 10)) this.hit(t, 'kick');
      if (st % 8 === 4) this.hit(t, 'snare');
      if (st % 2 === 1 || S.drums === 'funk') this.hit(t, 'hat');
      this.next += beat; this.step++;
    }
  }
}

// ---------- mode photo / selfie ----------
export class PhotoMode {
  constructor(game) { this.g = game; this.on = false; this.selfie = true; this.yaw = 0; }
  toggle() {
    const g = this.g; this.on = !this.on; document.body.classList.toggle('photo', this.on);
    if (this.on) { this.yaw = g.player.yaw; g.life.notify('📸 Mode photo : souris pour cadrer · Clic gauche pour photographier · J pour quitter'); }
  }
  camera() {
    if (!this.on) return; const g = this.g, P = g.player, cam = g.R.camera;
    const [mx, my] = g.input.consumeMouse(); this.yaw -= mx * 0.003; this.pitch = THREE.MathUtils.clamp((this.pitch || 0) + my * 0.002, -0.4, 0.6);
    const base = P.char.obj.getWorldPosition(new THREE.Vector3());
    const d = 1.6; cam.position.set(base.x + Math.sin(this.yaw) * d, base.y + 1.55 + this.pitch, base.z + Math.cos(this.yaw) * d);
    cam.lookAt(base.x, base.y + 1.45, base.z);
    if (!g.veh) P.char.obj.rotation.y = this.yaw; // regarde l'objectif
  }
  shoot() {
    const g = this.g; g.R.render(g.time);
    const url = g.R.r.domElement.toDataURL('image/jpeg', 0.9);
    const f = $('flash'); f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 150);
    g.audio && g.audio.burst(0.08, 3000, 0.15);
    this.last = url;
    g.coop && g.coop.post(g.profile.first + ' (vous)', '📸 Nouvelle photo à ' + (document.getElementById('district').textContent || 'Lumen') + ' #selfie', { mine: true, likes: 5 + Math.floor(Math.random() * 40), icon: '📸' });
    const a = document.createElement('a'); a.href = url; a.download = 'lumen-photo.jpg'; a.textContent = 'Télécharger la photo';
    g.life.panel('📸 Photo prise', `<img src="${url}" style="width:100%;border-radius:10px">`, [{ label: 'Télécharger', primary: true, run: () => a.click() }]);
  }
}

// ---------- effets de fatigue et de faim ----------
export function needsEffects(game) {
  const n = game.life.s.needs, c = game.R.r.domElement;
  const tired = n.energie < 15, hungry = n.faim < 10;
  const blur = tired ? (15 - n.energie) / 15 * 1.6 : 0;
  const desat = hungry ? 0.35 : 0;
  c.style.filter = blur || desat ? `blur(${blur.toFixed(2)}px) saturate(${1 - desat})` : '';
  game.player.weak = tired || hungry; // démarche ralentie (voir player.js)
}

// ---------- boutique de vêtements ----------
export const OUTFITS = ['#3b5b8c', '#8c2f2f', '#2f6b47', '#e8e4da', '#1d1f24', '#c98a2b', '#6b3f8c', '#7d8a96', '#b85c7a', '#3c7d7a'];
export const PANTS = ['#2b2b30', '#3a4a66', '#5a4a3a', '#c9c2b4', '#1a1a1a', '#4b5b3b'];
