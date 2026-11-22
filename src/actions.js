// Actions animées du joueur : se rendre à un point, se tourner, prendre une pose (complète ou des bras), attendre, enchaîner.
import * as THREE from 'three';

export class Actions {
  constructor(game) { this.g = game; this.cur = null; }
  get busy() { return !!this.cur; }
  // opts : { to: Vector3, face: yaw, pose: 'crouch'|'relax'|..., arms: 'reach'|..., dur: s, lie: {y, yaw}, offsetY }
  run(opts) {
    if (this.cur) return Promise.resolve();
    const g = this.g, P = g.player;
    return new Promise(res => {
      this.cur = { ...opts, phase: opts.to ? 'walk' : 'pose', t: 0, res, from: null };
      P.mode = 'action'; g.input.enabled = false;
    });
  }
  update(dt) {
    const a = this.cur; if (!a) return;
    const g = this.g, P = g.player, ch = P.char; a.t += dt;
    if (a.phase === 'walk') {
      const d = a.to.clone().sub(P.pos); d.y = 0; const dist = d.length();
      if (dist > 0.1 && a.t < 4) { P.pos.addScaledVector(d.normalize(), Math.min(dist, 1.6 * dt)); P.yaw = Math.atan2(d.x, d.z); ch.play('walk', 0.25); }
      else { a.phase = 'turn'; a.t = 0; }
    } else if (a.phase === 'turn') {
      const face = a.face ?? P.yaw; let dy = face - P.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); P.yaw += dy * Math.min(1, dt * 8);
      ch.play('idle', 0.3);
      if (Math.abs(dy) < 0.05 || a.t > 0.8) { a.phase = 'pose'; a.t = 0; }
    } else if (a.phase === 'pose') {
      if (a.pose) ch.play(a.pose, 0.4); else ch.play('idle', 0.3);
      if (a.arms) ch.overlay(a.arms);
      if (a.onStart && !a.started) { a.started = true; a.onStart(); }
      if (a.t > (a.dur || 1.2)) { a.phase = 'end'; a.t = 0; ch.overlay(null); }
    } else if (a.phase === 'end') {
      ch.play('idle', 0.4);
      if (a.t > 0.35) { this.finish(); return; }
    }
    // position du corps (pose allongée / assise)
    ch.obj.position.copy(P.pos);
    if (a.offsetY && (a.phase === 'pose')) ch.obj.position.y += a.offsetY * Math.min(1, a.t / 0.4);
    if (a.lie && a.phase === 'pose') { const k = Math.min(1, a.t / 0.6); ch.obj.position.y += a.lie.y * k; ch.obj.rotation.set(-Math.PI / 2 * k, P.yaw, 0, 'YXZ'); }
    else ch.obj.rotation.set(0, P.yaw, 0);
    ch.update(dt);
    if (a.onStart && a.started) ch.obj.visible = ch.obj.visible; // (visibilité gérée par l'action)
    P.updateCamera(dt, P.pos, a.camDist || 3.2, 1.3);
  }
  finish() {
    const a = this.cur; const g = this.g, P = g.player;
    this.cur = null; P.mode = 'foot'; g.input.enabled = true; P.char.obj.rotation.set(0, P.yaw, 0);
    a.res && a.res();
  }
}
