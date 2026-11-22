// Piétons d'ambiance autour du joueur (figurants légers, en plus des habitants simulés) :
// marchent sur les trottoirs, traversent, s'écartent des voitures, peuvent être renversés (chute) ou volés (R).
import * as THREE from 'three';
import * as W from './world.js';
import { Character } from './chars.js';
import { groundY } from './npc.js';

const SWO = W.RW + 2.4;
const TOPS = [0x3b5b8c, 0x8c2f2f, 0x2f6b47, 0xe8e4da, 0x1d1f24, 0xc98a2b, 0x6b3f8c, 0x7d8a96, 0x4a6670, 0xb7b0a0];

export class Peds {
  constructor(game) { this.g = game; this.list = []; this.pool = []; this.max = 16; }

  corner(i, j, qx, qz) { return new THREE.Vector3(W.gx(i) + qx * SWO, 0.15, W.gz(j) + qz * SWO); }
  spawn(near) {
    // un point de trottoir aléatoire à 40-90 m du joueur
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * 6.283, d = 40 + Math.random() * 50;
      const x = near.x + Math.cos(a) * d, z = near.z + Math.sin(a) * d;
      const i = Math.round((x - W.OX) / W.P), j = Math.round((z - W.OZ) / W.P);
      if (i < 0 || j < 0 || i > W.NX || j > W.NZ) continue;
      const qx = Math.random() < 0.5 ? -1 : 1, qz = Math.random() < 0.5 ? -1 : 1;
      const p = this.corner(i, j, qx, qz);
      const female = Math.random() < 0.5;
      const ch = this.acquire(female);
      const ped = { ch, female, pos: p, i, j, qx, qz, target: null, heading: 0, speed: 1.15 + Math.random() * 0.5, state: 'walk', t: 0, money: 10 + Math.floor(Math.random() * 90) };
      this.pick(ped); this.list.push(ped); return ped;
    }
  }
  // prochain coin : le long du trottoir (même côté) ou traversée au passage piéton
  pick(p) {
    const r = Math.random();
    if (r < 0.7) { // longer l'îlot jusqu'au carrefour suivant
      if (Math.random() < 0.5) { const ni = p.i + p.qx; if (ni >= 0 && ni <= W.NX) { p.i = ni; p.qx = -p.qx; } }
      else { const nj = p.j + p.qz; if (nj >= 0 && nj <= W.NZ) { p.j = nj; p.qz = -p.qz; } }
    } else { if (Math.random() < 0.5) p.qx = -p.qx; else p.qz = -p.qz; } // traverser
    p.target = this.corner(p.i, p.j, p.qx, p.qz);
  }
  acquire(female) {
    let s = this.pool.find(x => !x.used && x.female === female);
    if (!s) {
      const base = this.g.charBases[female ? 'michelle' : 'rpm'];
      const tint = female ? null : { Outfit_Top: new THREE.Color(TOPS[Math.floor(Math.random() * TOPS.length)]).multiplyScalar(1.5), Outfit_Bottom: new THREE.Color(0x2b2b30).multiplyScalar(1.5) };
      s = { ch: new Character(base, { height: female ? 1.6 + Math.random() * 0.12 : 1.7 + Math.random() * 0.15, tint }), female, used: false };
      this.g.R.scene.add(s.ch.obj);
    }
    s.used = true; s.ch.obj.visible = true; s.ch.obj.rotation.set(0, 0, 0); return s.ch;
  }
  release(p) { const s = this.pool.find(x => x.ch === p.ch) || (this.pool.push({ ch: p.ch, female: p.female, used: false }), this.pool[this.pool.length - 1]); s.used = false; p.ch.obj.visible = false; p.ch.obj.rotation.set(0, 0, 0); }

  nearest(pos, r = 2.2) { let b = null, bd = r * r; for (const p of this.list) { if (p.state === 'down') continue; const d = p.pos.distanceToSquared(pos); if (d < bd) { bd = d; b = p; } } return b; }

  // Percuté : projeté selon la vitesse (par-dessus le capot au-delà de ~30 km/h), culbute, retombe, reste au sol puis se relève.
  knock(p, dir, kmh = 25) {
    const v = Math.max(3, kmh / 3.6);
    p.state = 'down'; p.t = 0; p.fall = dir.clone().setY(0).normalize();
    p.vel = p.fall.clone().multiplyScalar(v * (kmh > 30 ? 0.75 : 0.55)).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, kmh > 30 ? 2 + v * 0.22 : 1.2, (Math.random() - 0.5) * 1.5));
    p.spinV = (kmh > 30 ? 9 : 5) * (0.7 + Math.random() * 0.6); p.tumble = 0; p.airY = 0; p.landed = false;
    p.downFor = 4 + Math.min(10, kmh / 6);
    p.ch.play('idle', 0.1); p.ch.overlay(null);
    this.g.audio && (this.g.audio.burst(0.18, 380, 0.5), this.g.audio.scream(p.female));
  }
  rob(p) {
    const g = this.g; p.state = 'handsup'; p.t = 0; p.ch.play('idle', 0.1); p.ch.overlay('handsHead'); g.audio && g.audio.scream(p.female, 0.12);
    p.heading = Math.atan2(g.player.pos.x - p.pos.x, g.player.pos.z - p.pos.z);
    p.fall = p.pos.clone().sub(g.player.pos).setY(0).normalize();
    g.life.money(p.money, 'vol à l’arraché'); p.money = 0;
    if (Math.random() < 0.5) g.police.addWanted(1, 'vol');
  }

  update(dt) {
    const g = this.g, me = g.veh ? g.veh.pos : g.player.pos;
    while (this.list.length < this.max) if (!this.spawn(me)) break;
    for (const p of [...this.list]) {
      const dist = p.pos.distanceTo(me);
      if (dist > 140 && p.state !== 'down') { this.release(p); this.list.splice(this.list.indexOf(p), 1); continue; }
      p.t += dt;
      if (p.state === 'walk') {
        // s'écarter d'une voiture qui arrive
        if (g.veh && g.veh.kmh > 10) { const d = p.pos.distanceTo(g.veh.pos); if (d < 6) { const away = p.pos.clone().sub(g.veh.pos).setY(0).normalize(); p.pos.addScaledVector(away, dt * 3.5); } }
        const to = p.target.clone().sub(p.pos); to.y = 0; const d = to.length();
        if (d < 0.3) this.pick(p);
        else { const st = Math.min(d, p.speed * dt); p.pos.addScaledVector(to.normalize(), st); const h = Math.atan2(to.x, to.z); let dh = h - p.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); p.heading += dh * Math.min(1, dt * 8); }
        p.ch.play('walk', 0.3, p.speed / 1.4);
      } else if (p.state === 'handsup') {
        if (p.t > 1.6) { p.ch.overlay(null); p.state = 'flee'; p.t = 0; p.ch.play('run', 0.2); g.audio && g.audio.scream(p.female, 0.15); }
      } else if (p.state === 'flee') {
        const nx = p.pos.x + p.fall.x * 5 * dt, nz = p.pos.z + p.fall.z * 5 * dt; const r = g.world.resolve(nx, nz, 0.3); p.pos.set(r.x, 0, r.z); if (r.hit) p.fall.applyAxisAngle(new THREE.Vector3(0, 1, 0), 1);
        p.heading = Math.atan2(p.fall.x, p.fall.z); p.ch.play('run', 0.25);
        if (p.t > 8) { this.release(p); this.list.splice(this.list.indexOf(p), 1); continue; }
      } else if (p.state === 'down') {
        if (!p.vel) p.vel = new THREE.Vector3();
        if (!p.landed) { // vol balistique + culbute
          p.vel.y -= 9.8 * dt; p.airY = Math.max(0, p.airY + p.vel.y * dt);
          const r = g.world.resolve(p.pos.x + p.vel.x * dt, p.pos.z + p.vel.z * dt, 0.3); if (r.hit) { p.vel.x *= -0.3; p.vel.z *= -0.3; }
          p.pos.x = r.x; p.pos.z = r.z; p.tumble += p.spinV * dt;
          if (p.airY <= 0 && p.vel.y < 0) { if (Math.abs(p.vel.y) > 3) { p.vel.y = -p.vel.y * 0.25; p.vel.x *= 0.5; p.vel.z *= 0.5; this.g.audio && this.g.audio.burst(0.1, 300, 0.3); } else { p.landed = true; p.t = 0; p.lieYaw = Math.atan2(p.fall.x, p.fall.z); } }
          const k = (p.tumble % (Math.PI * 2));
          p.ch.obj.rotation.set(-k, p.heading, 0, 'YXZ');
        } else { // glisse puis allongé
          p.vel.multiplyScalar(Math.pow(0.02, dt)); p.pos.x += p.vel.x * dt; p.pos.z += p.vel.z * dt;
          const up = p.t > p.downFor ? Math.min(1, (p.t - p.downFor) / 0.8) : 0;
          p.ch.obj.rotation.set(-Math.PI / 2 * (1 - up), p.lieYaw, 0, 'YXZ');
          if (p.t > p.downFor + 0.8) { p.state = 'flee'; p.t = 0; p.ch.obj.rotation.set(0, p.heading, 0); p.vel = null; }
        }
      }
      p.pos.y = groundY(p.pos.x, p.pos.z) + (p.state === 'down' ? (p.landed ? 0.12 : 0.9 + (p.airY || 0)) : 0);
      p.ch.obj.position.copy(p.pos);
      if (p.state !== 'down') p.ch.obj.rotation.y = p.heading;
      p.ch.update(dt, dist);
      // percuté par la voiture du joueur
      if (g.veh && p.state !== 'down' && g.veh.kmh > 15 && p.pos.distanceTo(g.veh.pos) < 1.9) {
        this.knock(p, new THREE.Vector3(Math.sin(g.veh.heading), 0, Math.cos(g.veh.heading)), g.veh.kmh);
        g.veh.vz *= 0.85; g.police.addWanted(Math.random() < 0.6 ? 1 : 2, 'piéton renversé');
      }
    }
  }
  obstacles() { return this.list.filter(p => p.state !== 'down' || true).map(p => ({ x: p.pos.x, z: p.pos.z, len: 1 })); }
}
