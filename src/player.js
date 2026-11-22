// Joueur à pied : déplacement relatif caméra, course, saut, collisions, caméra orbitale à la souris.
import * as THREE from 'three';
import { groundHeight } from './physics.js';

export class Player {
  constructor(char, world, camera) {
    this.char = char; this.world = world; this.cam = camera;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.vy = 0; this.onGround = true;
    this.yaw = 0; this.camYaw = 0; this.camPitch = 0.18; this.camDist = 4.2;
    this.speed = 0; this.mode = 'foot';
    this.camPos = new THREE.Vector3(); this.camInit = false;
  }
  place(x, z, yaw = 0) { this.pos.set(x, groundHeight(x, z), z); this.yaw = yaw; this.camYaw = yaw; this.camInit = false; }

  update(dt, input) {
    const [mx, my, wh] = input.consumeMouse();
    this.camYaw -= mx * 0.0024; this.camPitch = THREE.MathUtils.clamp(this.camPitch + my * 0.002, -0.35, 1.1);
    this.camDist = THREE.MathUtils.clamp(this.camDist + wh * 0.5, 2.2, 9);
    if (this.mode !== 'foot') return;
    const adm = window.game && window.game.admin;
    if (adm && adm.fly) { this.char.obj.position.copy(this.pos); this.char.play('idle'); this.char.update(dt); return; }
    const { f, s } = input.move();
    const run = input.down('ShiftLeft', 'ShiftRight');
    const want = new THREE.Vector3();
    if (f || s) {
      const fw = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
      const rt = new THREE.Vector3(-fw.z, 0, fw.x);
      want.addScaledVector(fw, f).addScaledVector(rt, s).normalize().multiplyScalar((run ? 5.6 : 1.6) * ((adm && adm.speed) || 1));
    }
    const acc = this.onGround ? 10 : 2;
    this.vel.x += (want.x - this.vel.x) * Math.min(1, acc * dt);
    this.vel.z += (want.z - this.vel.z) * Math.min(1, acc * dt);
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.aimLock) { let d = (this.camYaw + Math.PI) - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * Math.min(1, 14 * dt); }
    else if (this.speed > 0.2) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      let d = target - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, 10 * dt);
    }
    let nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    const r = this.world.resolve(nx, nz, 0.32);
    nx = r.x; nz = r.z;
    if (this.dyn) for (const c of this.dyn(this.pos)) { const dx = nx - c.x, dz = nz - c.z, d = Math.hypot(dx, dz), m = 0.32 + c.r; if (d < m && d > 1e-4) { nx = c.x + dx / d * m; nz = c.z + dz / d * m; } }
    // saut + gravité, marche des trottoirs
    const gh = groundHeight(nx, nz);
    const c = this.char;
    this.jumpT = Math.max(0, (this.jumpT || 0) - dt);
    if (input.pressed('Space') && this.onGround && this.jumpT <= 0) {
      // Saut piloté par l'animation (la hauteur vient de la capture de mouvement) ; repli physique sinon.
      const clip = this.speed > 3.2 ? 'jumpRun' : 'jumpWalk';
      if (c.has(clip)) { c.play(clip, 0.12); this.jumpT = c.actions[clip].getClip().duration * 0.92; this.jumpClip = clip; }
      else { this.vy = 4.2; this.onGround = false; }
    }
    this.vy -= 14 * dt;
    let y = this.pos.y + this.vy * dt;
    if (y <= gh + 0.001) { y = gh; this.vy = 0; this.onGround = true; }
    else if (this.onGround && y - gh < 0.25) { y = gh; this.vy = 0; }
    else this.onGround = false;
    this.pos.set(nx, y, nz);

    c.obj.position.copy(this.pos); c.obj.rotation.y = this.yaw;
    if (this.jumpT > 0) { /* animation de saut en cours */ }
    else if (!this.onGround) c.play(c.has('fall') ? 'fall' : 'idle', 0.2);
    else if (this.speed > 4.2) c.play('run', 0.3, this.speed / 5.6);
    else if (this.speed > 2.2 && c.has('jog')) c.play('jog', 0.3, this.speed / 3.6);
    else if (this.speed > 0.25) c.play('walk', 0.3, Math.max(0.7, this.speed / 1.6));
    else c.play('idle', 0.4);
    c.update(dt, 0);
  }

  updateCamera(dt, focus, dist = this.camDist, height = 1.55) {
    const cam = this.cam;
    const tgt = focus.clone().add(new THREE.Vector3(0, height, 0));
    const dir = new THREE.Vector3(Math.sin(this.camYaw) * Math.cos(this.camPitch), Math.sin(this.camPitch), Math.cos(this.camYaw) * Math.cos(this.camPitch));
    if (this.aimShoulder && this.mode === 'foot') { dist = 1.7; tgt.addScaledVector(new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw)), 0.55); tgt.y += 0.1; }
    const want = tgt.clone().addScaledVector(dir, dist);
    // ne pas traverser les bâtiments
    const free = this.world.segmentFree(tgt.x, tgt.y, tgt.z, want.x, want.y, want.z);
    if (free < 1) want.copy(tgt).addScaledVector(dir, Math.max(0.6, dist * free - 0.3));
    want.y = Math.max(want.y, focus.y + 0.3);
    if (!this.camInit) { this.camPos.copy(want); this.camInit = true; }
    this.camPos.lerp(want, 1 - Math.exp(-dt * 18));
    cam.position.copy(this.camPos);
    cam.lookAt(tgt);
    cam.userData.focus = focus;
  }
}
