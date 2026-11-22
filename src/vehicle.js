// Physique de conduite (modèle « bicyclette » à pneus non linéaires) : moteur à courbe de couple,
// boîte automatique à 6 rapports, freinage avec transfert de charge, frein à main, sous/survirage,
// direction progressive selon la vitesse, collisions avec la ville. Utilisé par le joueur.
import * as THREE from 'three';
import { poseCar } from './cars.js';
import { groundHeight } from './physics.js';

const GEARS = [3.4, 2.1, 1.45, 1.1, 0.88, 0.72], FINAL = 3.7, REV = 3.2;

export class Vehicle {
  constructor(car, world) {
    this.car = car; this.world = world; const s = car.tpl.spec;
    this.mass = s.mass; this.powerW = s.power * 735.5; this.top = s.top / 3.6;
    this.L = car.tpl.wheelbase; this.cgF = this.L * 0.48; this.cgR = this.L - this.cgF;
    this.inertia = this.mass * (this.L * this.L) * 0.45;
    this.pos = new THREE.Vector3(); this.heading = 0; this.vx = 0; this.vz = 0; this.yawRate = 0;
    this.steer = 0; this.spin = 0; this.gear = 1; this.rpm = 900; this.throttle = 0; this.brake = 0;
    this.fuel = s.fuel * 0.6; this.odo = 0; this.damage = 0; this.reverse = false;
    this.wheelR = car.tpl.wheelR || 0.33;
  }
  place(x, z, heading) { this.pos.set(x, 0, z); this.heading = heading; this.vx = this.vz = this.yawRate = 0; this.sync(); }
  get speed() { return this.vz; }
  get kmh() { return Math.abs(this.vz) * 3.6; }

  update(dt, ctl) {
    // ctl : {throttle 0..1, brake 0..1, steer -1..1, handbrake bool}
    const v = this.vz;
    // direction : rapide à basse vitesse, réduite à haute vitesse
    const maxSteer = 0.6 / (1 + Math.abs(v) / 14);
    const target = ctl.steer * maxSteer;
    this.steer += (target - this.steer) * Math.min(1, dt * (Math.abs(target) > Math.abs(this.steer) ? 5 : 8));
    // marche arrière automatique : frein maintenu à l'arrêt
    if (Math.abs(v) < 0.5 && ctl.brake > 0.5 && ctl.throttle < 0.1) this.reverse = true;
    if (ctl.throttle > 0.1 && this.reverse && v > -0.5) this.reverse = false;
    let thr = ctl.throttle, brk = ctl.brake;
    if (this.reverse) { thr = ctl.brake; brk = ctl.throttle; }
    if (this.fuel <= 0) thr = 0;
    // boîte auto
    const wheelRpm = Math.abs(v) / (2 * Math.PI * this.wheelR) * 60;
    const ratio = this.reverse ? REV : GEARS[this.gear - 1];
    this.rpm = Math.max(850, wheelRpm * ratio * FINAL);
    if (!this.reverse) {
      const up = 3800 + thr * 2400;
      if (this.rpm > up && this.gear < 6) this.gear++;
      else if (this.rpm < 1500 + thr * 900 && this.gear > 1) this.gear--;
    }
    const r = Math.min(this.rpm, 6800) / 6800;
    const torqueCurve = 0.62 + 0.55 * Math.sin(Math.PI * Math.min(1, r * 1.05)) - (this.rpm > 6600 ? 0.6 : 0);
    const peakTorque = this.powerW / (5200 * 2 * Math.PI / 60);
    let Fdrive = thr * peakTorque * torqueCurve * ratio * FINAL * 0.9 / this.wheelR;
    Fdrive = Math.min(Fdrive, this.mass * 9.81 * 0.95); // limite d'adhérence (antipatinage)
    if (this.reverse) Fdrive = -Math.min(Fdrive, this.mass * 3);
    const Fbrake = brk * this.mass * 9.81 * 1.0 * Math.sign(v || 0.0001);
    const Fdrag = 0.42 * v * Math.abs(v) + 12 * v + (Math.abs(v) > 0.05 ? Math.sign(v) * this.mass * 0.11 : 0);
    let ax = (Fdrive - Fbrake - Fdrag) / this.mass;
    if (Math.abs(v) < 0.4 && brk > 0 && !thr) { ax = 0; this.vz *= 0.8; }
    if (ctl.handbrake) ax -= Math.sign(v) * 4.5;
    // pneus latéraux (Pacejka simplifié)
    const vzs = Math.max(Math.abs(v), 1.2) * Math.sign(v || 1);
    const slipF = Math.atan2(this.vx + this.yawRate * this.cgF, Math.abs(vzs)) - this.steer * Math.sign(vzs);
    const slipR = Math.atan2(this.vx - this.yawRate * this.cgR, Math.abs(vzs));
    const load = this.mass * 9.81 / 2;
    const tire = (a, mu) => -mu * load * Math.sin(1.45 * Math.atan(9.5 * a - 0.9 * (9.5 * a - Math.atan(9.5 * a))));
    const transfer = THREE.MathUtils.clamp(-ax * 0.04, -0.25, 0.25);
    const muR = ctl.handbrake ? 0.45 : 1.0;
    const FyF = tire(slipF, 1.05 * (1 + transfer)), FyR = tire(slipR, 1.0 * (1 - transfer) * muR);
    const ay = (FyF * Math.cos(this.steer) + FyR) / this.mass - this.yawRate * v;
    const yawAcc = (FyF * this.cgF * Math.cos(this.steer) - FyR * this.cgR) / this.inertia;
    this.vz += ax * dt; this.vx += ay * dt; this.yawRate += yawAcc * dt;
    if (Math.abs(this.vz) < 0.3 && !thr) { this.vx *= 0.9; this.yawRate *= 0.9; }
    this.vx *= Math.pow(0.2, dt); // amortissement résiduel
    this.heading += this.yawRate * dt;
    const fw = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const rt = new THREE.Vector3(fw.z, 0, -fw.x);
    const vel = fw.clone().multiplyScalar(this.vz).addScaledVector(rt, this.vx); // rt = gauche (repère y à gauche)
    this.pos.addScaledVector(vel, dt);
    this.odo += Math.abs(this.vz) * dt;
    this.fuel = Math.max(0, this.fuel - (this.car.tpl.spec.cons / 100000) * Math.abs(this.vz) * dt * (0.5 + thr));
    // collisions : 3 cercles le long de la caisse
    const half = this.car.tpl.size.z / 2 - 0.5, rad = this.car.tpl.size.x / 2;
    let hit = null;
    for (const o of [-half, 0, half]) {
      const cx = this.pos.x + fw.x * o, cz = this.pos.z + fw.z * o;
      const res = this.world.resolve(cx, cz, rad);
      if (res.hit) { this.pos.x += res.x - cx; this.pos.z += res.z - cz; hit = res; }
    }
    // autres véhicules (cercles dynamiques)
    if (this.dyn) for (const o of [-half, 0, half]) {
      const cx = this.pos.x + fw.x * o, cz = this.pos.z + fw.z * o;
      for (const c of this.dyn(this.pos)) {
        const dx = cx - c.x, dz = cz - c.z, d = Math.hypot(dx, dz), m = rad + c.r;
        if (d < m && d > 1e-4) { const push = m - d; this.pos.x += dx / d * push; this.pos.z += dz / d * push; hit = { nx: dx / d, nz: dz / d }; }
      }
    }
    if (hit) {
      const impact = Math.abs(this.vz);
      const n = new THREE.Vector3(hit.nx, 0, hit.nz);
      const along = fw.dot(n);
      this.vz *= along * Math.sign(this.vz) < -0.3 ? -0.25 : 0.7;
      this.yawRate *= 0.5;
      if (impact > 6) this.damage = Math.min(100, this.damage + impact * 0.8);
      this.lastHit = impact;
    }
    this.spin += this.vz / this.wheelR * dt;
    this.sync(ctl);
  }

  sync(ctl = {}) {
    const o = this.car.obj;
    const gh = groundHeight(this.pos.x, this.pos.z);
    this.pos.y += (gh - this.pos.y) * 0.5;
    o.position.copy(this.pos);
    o.rotation.set(0, this.heading, 0);
    // roulis / tangage légers (transfert de charge)
    o.rotateZ(THREE.MathUtils.clamp(this.vx * 0.012 + this.yawRate * this.vz * 0.004, -0.06, 0.06));
    o.rotateX(THREE.MathUtils.clamp(-(ctl.throttle || 0) * 0.012 + (ctl.brake || 0) * 0.02 * Math.sign(this.vz), -0.03, 0.03));
    poseCar(this.car, { spin: this.spin, steer: this.steer, brake: (ctl.brake > 0.1 && !this.reverse) || (this.reverse && ctl.throttle > 0.1), reverse: this.reverse, head: this.headlights || 0 });
  }
}
