// Sons synthétisés (Web Audio, aucun fichier) : moteur, klaxon (K), pas, cris, ambiance urbaine, pluie.
export class Audio {
  constructor(game) { this.g = game; this.ctx = null; this.ready = false; addEventListener('pointerdown', () => this.init(), { once: true }); addEventListener('keydown', () => this.init(), { once: true }); }
  init() {
    if (this.ready) return; try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const c = this.ctx; this.master = c.createGain(); this.master.gain.value = 0.8; this.master.connect(c.destination);
    this.eng = c.createOscillator(); this.eng.type = 'sawtooth'; this.eng2 = c.createOscillator(); this.eng2.type = 'square';
    this.engF = c.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.frequency.value = 600; this.engG = c.createGain(); this.engG.gain.value = 0;
    this.eng.connect(this.engF); this.eng2.connect(this.engF); this.engF.connect(this.engG); this.engG.connect(this.master); this.eng.start(); this.eng2.start();
    const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this.noiseBuf = b;
    const amb = c.createBufferSource(); amb.buffer = b; amb.loop = true; const af = c.createBiquadFilter(); af.type = 'lowpass'; af.frequency.value = 380; this.ambG = c.createGain(); this.ambG.gain.value = 0.03; amb.connect(af); af.connect(this.ambG); this.ambG.connect(this.master); amb.start();
    const rain = c.createBufferSource(); rain.buffer = b; rain.loop = true; const rf = c.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 1500; this.rainG = c.createGain(); this.rainG.gain.value = 0; rain.connect(rf); rf.connect(this.rainG); this.rainG.connect(this.master); rain.start();
    this.ready = true; this.stepT = 0; this.hornT = 0;
  }
  burst(dur, freq, gain, type = 'lowpass') {
    if (!this.ready) return; const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(gain, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(); s.stop(c.currentTime + dur);
  }
  scream(female = Math.random() < 0.5, vol = 0.18) {
    if (!this.ready) return; const c = this.ctx, t = c.currentTime, dur = 0.9 + Math.random() * 0.5;
    const o = c.createOscillator(); o.type = 'sawtooth'; const base = female ? 520 + Math.random() * 120 : 280 + Math.random() * 80;
    o.frequency.setValueAtTime(base * 0.8, t); o.frequency.linearRampToValueAtTime(base * 1.25, t + 0.15); o.frequency.linearRampToValueAtTime(base * 0.7, t + dur);
    const lfo = c.createOscillator(); lfo.frequency.value = 7; const lg = c.createGain(); lg.gain.value = 18; lfo.connect(lg); lg.connect(o.frequency);
    const out = c.createGain(); out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(vol, t + 0.05); out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [f, q, g] of [[female ? 950 : 750, 8, 1], [female ? 1600 : 1250, 10, 0.6], [2900, 12, 0.25]]) { const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q; const gg = c.createGain(); gg.gain.value = g; o.connect(bp); bp.connect(gg); gg.connect(out); }
    out.connect(this.master); o.start(t); lfo.start(t); o.stop(t + dur); lfo.stop(t + dur);
  }
  horn() { if (!this.ready) return; const c = this.ctx, t = c.currentTime; for (const f of [415, 494]) { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f; const g = c.createGain(); g.gain.setValueAtTime(0.06, t); g.gain.setValueAtTime(0.06, t + 0.45); g.gain.linearRampToValueAtTime(0, t + 0.5); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; o.connect(lp); lp.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.5); } }
  update(dt) {
    if (!this.ready) return; const g = this.g, c = this.ctx, v = g.veh, inside = g.homeInt && g.homeInt.inside;
    if (v) { const f = 28 + v.rpm / 60; this.eng.frequency.setTargetAtTime(f, c.currentTime, 0.05); this.eng2.frequency.setTargetAtTime(f * 0.5, c.currentTime, 0.05); this.engF.frequency.setTargetAtTime(300 + v.rpm * 0.12, c.currentTime, 0.1); this.engG.gain.setTargetAtTime(0.035 + Math.min(0.05, v.kmh / 2500), c.currentTime, 0.1); }
    else this.engG.gain.setTargetAtTime(0, c.currentTime, 0.2);
    const P = g.player;
    if (!v && P.mode === 'foot' && P.speed > 0.5 && P.onGround) { this.stepT -= dt * (P.speed > 4 ? 1.7 : 1) * 1.9; if (this.stepT <= 0) { this.stepT = 1; this.burst(0.07, P.speed > 4 ? 900 : 650, 0.05); } }
    const wet = g.weather ? g.weather.cur.rain : 0; this.rainG.gain.setTargetAtTime(wet * 0.06 * (inside ? 0.3 : 1), c.currentTime, 0.5);
    this.ambG.gain.setTargetAtTime(inside ? 0.008 : 0.03 * (1 - (g.sky.night || 0) * 0.5), c.currentTime, 0.5);
    this.hornT = Math.max(0, this.hornT - dt);
    if (v && g.input.down('KeyK') && this.hornT <= 0) { this.horn(); this.hornT = 0.55; }
  }
}
