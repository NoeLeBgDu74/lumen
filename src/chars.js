// Personnages animés (squelettes Mixamo) : chargement, reciblage d'animations en espace monde
// (indépendant des poses de liaison de chaque modèle), variantes de tenues, LOD d'animation.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { glb } from './assets.js';

export const CHAR_MODELS = {
  michelle: { file: 'assets/chars/Michelle.glb', label: 'Femme', rest: 'TPose' },
  rpm: { file: 'assets/chars/readyplayer.me.glb', label: 'Homme', rest: null, rpm: true },
  soldier: { file: 'assets/chars/Soldier.glb', label: 'Agent de sécurité', rest: 'TPose' },
};
const CLIPS = [['idle', 'idle'], ['walk', 'walk'], ['run', 'run'], ['talk', 'agree'], ['shake', 'headShake'], ['sad', 'sad_pose']];

const key = (n) => n.replace(/^mixamorig:?/, '');
function bonesOf(root) { const m = new Map(); root.traverse(o => { if (o.isBone) m.set(key(o.name), o); }); return m; }

// Pose de repos (quaternions monde relatifs à la racine) après application éventuelle d'un clip de T-pose.
function restWorld(root, restClip) {
  if (restClip) { const mx = new THREE.AnimationMixer(root); const a = mx.clipAction(restClip); a.play(); mx.update(0); }
  root.updateMatrixWorld(true);
  const out = new Map(), q = new THREE.Quaternion();
  for (const [k, b] of bonesOf(root)) out.set(k, b.getWorldQuaternion(q).clone());
  return out;
}

let source = null;
async function loadSource() {
  if (source) return source;
  const x = await glb('assets/chars/Xbot.glb');
  const root = SkeletonUtils.clone(x.scene);
  source = { root, bones: bonesOf(root), rest: restWorld(root, null), clips: x.animations };
  return source;
}

function bakeRetarget(src, tgtRoot, tgtRest, clip, name) {
  const tb = bonesOf(tgtRoot);
  const mx = new THREE.AnimationMixer(src.root);
  const act = mx.clipAction(clip); act.play();
  const fps = 30, n = Math.max(2, Math.ceil(clip.duration * fps) + 1);
  const times = new Float32Array(n);
  const data = new Map(); for (const k of tb.keys()) if (src.bones.has(k)) data.set(k, new Float32Array(n * 4));
  const qs = new THREE.Quaternion(), wt = new Map(), inv = new THREE.Quaternion(), tmp = new THREE.Quaternion();
  // ordre parent → enfant
  const order = []; tgtRoot.traverse(o => { if (o.isBone && data.has(key(o.name))) order.push(o); });
  const restParentWorld = new Map();
  for (const b of order) { const p = b.parent; restParentWorld.set(b, p ? p.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion()); }
  for (let f = 0; f < n; f++) {
    const t = Math.min(clip.duration, f / fps); times[f] = t;
    act.time = t; mx.update(0); src.root.updateMatrixWorld(true);
    wt.clear();
    for (const b of order) {
      const k = key(b.name);
      src.bones.get(k).getWorldQuaternion(qs);
      // monde cible = (monde source × repos source⁻¹) × repos cible
      const w = qs.clone().multiply(inv.copy(src.rest.get(k)).invert()).multiply(tgtRest.get(k));
      wt.set(b, w);
      const pw = wt.get(b.parent) || restParentWorld.get(b);
      tmp.copy(pw).invert().multiply(w);
      data.get(k).set([tmp.x, tmp.y, tmp.z, tmp.w], f * 4);
    }
  }
  act.stop(); mx.uncacheRoot(src.root);
  const tracks = order.map(b => new THREE.QuaternionKeyframeTrack(b.name.replace(/[\[\]\.:\/]/g, '') + '.quaternion', times, data.get(key(b.name))));
  return new THREE.AnimationClip(name, clip.duration, tracks);
}

// Animations en capture de mouvement Ready Player Me (licence : utilisation avec des avatars Ready Player Me uniquement,
// sans redistribution) : chargées directement depuis le dépôt officiel, jamais copiées dans ce projet.
const RPM_URL = 'https://cdn.jsdelivr.net/gh/readyplayerme/animation-library@master/masculine/glb/';
const RPM_CLIPS = {
  idle: 'idle/M_Standing_Idle_001', idle2: 'idle/M_Standing_Idle_Variations_002', walk: 'locomotion/M_Walk_001', jog: 'locomotion/M_Jog_001', run: 'locomotion/M_Run_001',
  jumpWalk: 'locomotion/M_Walk_Jump_002', jumpRun: 'locomotion/M_Run_Jump_002', fall: 'locomotion/M_Falling_Idle_002',
  talk: 'expression/M_Talking_Variations_001', talk2: 'expression/M_Talking_Variations_005', wave: 'expression/M_Standing_Expressions_001',
};
async function loadRpmClips() {
  const out = {};
  await Promise.all(Object.entries(RPM_CLIPS).map(async ([n, f]) => {
    try {
      const g = await glb(RPM_URL + f + '.glb');
      const c = g.animations[0].clone(); c.name = n;
      const once = n.startsWith('jump');
      c.tracks = c.tracks.filter(t => t.name.endsWith('.quaternion') || t.name === 'Hips.position');
      for (const t of c.tracks) if (t.name === 'Hips.position') {
        // supprime la dérive horizontale (déplacement géré par le jeu), garde la hauteur (rebond, saut)
        const v = t.values, x0 = v[0], z0 = v[2];
        for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
      }
      c.userData = { once };
      out[n] = c;
    } catch (e) { console.warn('anim RPM', n, e); }
  }));
  return out;
}

// Pose assise de conduite construite à partir de la T-pose (orientation des os en espace monde).
function makeSitClip(work, rest) {
  const B = bonesOf(work); work.updateMatrixWorld(true);
  const wq = (b) => b.getWorldQuaternion(new THREE.Quaternion());
  const wp = (b) => b.getWorldPosition(new THREE.Vector3());
  const aim = (name, childName, dir) => {
    const b = B.get(name), c = B.get(childName); if (!b || !c) return;
    const cur = wp(c).sub(wp(b)).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(cur, dir.clone().normalize());
    const nw = q.multiply(wq(b));
    b.quaternion.copy(wq(b.parent).invert().multiply(nw)); work.updateMatrixWorld(true);
  };
  for (const s of ['Left', 'Right']) {
    const k = s === 'Left' ? 1 : -1;
    aim(s + 'UpLeg', s + 'Leg', new THREE.Vector3(0.1 * k, 0.12, 1));
    aim(s + 'Leg', s + 'Foot', new THREE.Vector3(0.02 * k, -1, 0.12));
    aim(s + 'Arm', s + 'ForeArm', new THREE.Vector3(0.28 * k, -0.55, 0.78));
    aim(s + 'ForeArm', s + 'Hand', new THREE.Vector3(-0.22 * k, 0.32, 0.92));
  }
  aim('Spine', 'Spine1', new THREE.Vector3(0, 1, -0.12));
  const tracks = [];
  for (const [k, b] of B) {
    const q = b.quaternion;
    tracks.push(new THREE.QuaternionKeyframeTrack(b.name.replace(/[\[\]\.:\/]/g, '') + '.quaternion', [0, 1], [q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w]));
  }
  const hips = B.get('Hips'); const hipY = wp(hips).y;
  const c = new THREE.AnimationClip('sit', 1, tracks); c.userData = { hipY };
  void rest; return c;
}

// Pose « menotté » : bras ramenés dans le dos, tête légèrement baissée (construite depuis la T-pose).
function makeCuffClip(work) {
  const B = bonesOf(work);
  // repartir de la T-pose : réinitialiser les os modifiés par la pose assise
  for (const [, b] of B) if (b.userData.rest) b.quaternion.copy(b.userData.rest);
  work.updateMatrixWorld(true);
  const wq = (b) => b.getWorldQuaternion(new THREE.Quaternion()), wp = (b) => b.getWorldPosition(new THREE.Vector3());
  const aim = (name, childName, dir) => {
    const b = B.get(name), c = B.get(childName); if (!b || !c) return;
    const cur = wp(c).sub(wp(b)).normalize();
    const nw = new THREE.Quaternion().setFromUnitVectors(cur, dir.clone().normalize()).multiply(wq(b));
    b.quaternion.copy(wq(b.parent).invert().multiply(nw)); work.updateMatrixWorld(true);
  };
  for (const sd of ['Left', 'Right']) {
    const k = sd === 'Left' ? 1 : -1;
    aim(sd + 'Arm', sd + 'ForeArm', new THREE.Vector3(0.25 * k, -0.85, -0.45));
    aim(sd + 'ForeArm', sd + 'Hand', new THREE.Vector3(-0.85 * k, 0.15, -0.35));
  }
  aim('Neck', 'Head', new THREE.Vector3(0, 1, 0.3));
  const tracks = [];
  for (const [, b] of B) { const q = b.quaternion; tracks.push(new THREE.QuaternionKeyframeTrack(b.name.replace(/[\[\]\.:\/]/g, '') + '.quaternion', [0, 1], [q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w])); }
  return new THREE.AnimationClip('cuffed', 1, tracks);
}

// Poses de visée (bras uniquement, jouées par-dessus la locomotion avec un poids fort).
function makeAimClip(work, kind) {
  const B = bonesOf(work);
  for (const [, b] of B) if (b.userData.rest) b.quaternion.copy(b.userData.rest);
  work.updateMatrixWorld(true);
  const wq = (b) => b.getWorldQuaternion(new THREE.Quaternion()), wp = (b) => b.getWorldPosition(new THREE.Vector3());
  const aim = (name, childName, dir) => {
    const b = B.get(name), c = B.get(childName); if (!b || !c) return;
    const cur = wp(c).sub(wp(b)).normalize();
    const nw = new THREE.Quaternion().setFromUnitVectors(cur, dir.clone().normalize()).multiply(wq(b));
    b.quaternion.copy(wq(b.parent).invert().multiply(nw)); work.updateMatrixWorld(true);
  };
  const names = ['RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand'];
  if (kind === 'pistol') {
    aim('RightArm', 'RightForeArm', new THREE.Vector3(-0.12, 0.02, 1));
    aim('RightForeArm', 'RightHand', new THREE.Vector3(-0.08, 0.03, 1));
    aim('LeftArm', 'LeftForeArm', new THREE.Vector3(0.3, -0.25, 0.9));
    aim('LeftForeArm', 'LeftHand', new THREE.Vector3(-0.7, 0.05, 0.7));
  } else {
    aim('RightArm', 'RightForeArm', new THREE.Vector3(-0.35, -0.55, 0.6));
    aim('RightForeArm', 'RightHand', new THREE.Vector3(0.35, 0.15, 0.95));
    aim('LeftArm', 'LeftForeArm', new THREE.Vector3(0.05, -0.25, 1));
    aim('LeftForeArm', 'LeftHand', new THREE.Vector3(-0.35, 0.12, 1));
  }
  const tracks = [];
  for (const n of names) { const b = B.get(n); if (!b) continue; const q = b.quaternion; tracks.push(new THREE.QuaternionKeyframeTrack(b.name.replace(/[\[\]\.:\/]/g, '') + '.quaternion', [0, 1], [q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w])); }
  for (const [, b] of B) if (b.userData.rest) b.quaternion.copy(b.userData.rest);
  return new THREE.AnimationClip('aim_' + kind, 1, tracks);
}

const bases = {};
export async function loadCharBase(id) {
  if (bases[id]) return bases[id];
  const def = CHAR_MODELS[id];
  const [g, src] = await Promise.all([glb(def.file), loadSource()]);
  const root = g.scene;
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; if (o.material) o.material.envMapIntensity = 0.8; } });
  // reciblage sur une copie posée en T
  const work = SkeletonUtils.clone(root);
  const restClip = def.rest ? g.animations.find(a => a.name === def.rest) : null;
  const tRest = restWorld(work, restClip);
  work.traverse(o => { if (o.isBone) o.userData.rest = o.quaternion.clone(); });
  let clips = {};
  if (def.rpm) clips = await loadRpmClips();
  for (const [n, srcName] of CLIPS) { if (clips[n]) continue; const c = src.clips.find(a => a.name === srcName); if (c) clips[n] = bakeRetarget(src, work, tRest, c, n); }
  clips.sit = makeSitClip(work, tRest);
  clips.cuffed = makeCuffClip(work);
  clips.aimP = makeAimClip(work, 'pistol'); clips.aimR = makeAimClip(work, 'rifle');
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  bases[id] = { root, scale: 1.72 / (box.max.y - box.min.y), minY: box.min.y, clips, def };
  return bases[id];
}

export class Character {
  constructor(base, { height = 1.72, tint = null } = {}) {
    this.obj = new THREE.Group();
    const m = SkeletonUtils.clone(base.root);
    const s = base.scale * height / 1.72;
    m.scale.setScalar(s); m.position.y = -base.minY * s;
    this.hipH = base.clips.sit ? (base.clips.sit.userData.hipY - base.minY) * s : 0.95;
    if (tint) m.traverse(o => {
      if (!o.isMesh) return;
      const k = Object.keys(tint).find(t => o.material.name.includes(t));
      if (k) { o.material = o.material.clone(); o.material.color.multiply(new THREE.Color(tint[k])); }
    });
    this.model = m; this.obj.add(m);
    this.mixer = new THREE.AnimationMixer(m);
    this.actions = {};
    for (const k in base.clips) this.actions[k] = this.mixer.clipAction(base.clips[k]);
    this.cur = null; this.play('idle', 0);
    this.animAcc = 0;
  }
  has(name) { return !!this.actions[name]; }
  // Couche de visée (bras) au-dessus de l'animation courante.
  overlay(name) {
    if (this.ovName === name) return;
    if (this.ov) this.ov.stop();
    this.ovName = name; this.ov = null;
    if (name && this.actions[name]) { const a = this.actions[name]; a.reset(); a.play(); a.setEffectiveWeight(8); this.ov = a; }
  }
  play(name, fade = 0.25, timeScale = 1) {
    const a = this.actions[name]; if (!a) return;
    a.timeScale = timeScale;
    if (this.cur === a) return;
    if (a.getClip().userData && a.getClip().userData.once) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    a.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (this.cur) this.cur.fadeOut(fade);
    this.cur = a;
  }
  update(dt, dist = 0) {
    const every = dist < 25 ? 0 : dist < 60 ? 1 / 30 : dist < 120 ? 1 / 15 : 1 / 6;
    this.animAcc += dt;
    if (this.animAcc >= every) { this.mixer.update(this.animAcc); this.animAcc = 0; }
  }
}
