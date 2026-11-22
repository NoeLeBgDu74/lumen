// Mobilier et objets (modèles Poly Haven) rendus en instances, regroupés par secteurs pour le culling.
import * as THREE from 'three';
import { glb } from './assets.js';

const CELL = 240;
export const lampGlass = [];

export async function buildProps(scene, list, onProgress) {
  const byName = new Map();
  for (const p of list) { if (!byName.has(p.name)) byName.set(p.name, []); byName.get(p.name).push(p); }
  let done = 0;
  const out = [];
  await Promise.all([...byName].map(async ([name, items]) => {
    let g;
    try { g = await glb('assets/props/' + name + '.glb'); } catch (e) { console.warn('prop', name, e); return; }
    const root = g.scene; root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const parts = [];
    root.traverse(o => {
      if (!o.isMesh) return;
      const mat = o.material;
      if (/glass/i.test(mat.name) && /lamp/i.test(name)) {
        mat.emissive = new THREE.Color(1.0, 0.78, 0.5); mat.emissiveIntensity = 0; lampGlass.push(mat);
      }
      mat.envMapIntensity = 1;
      parts.push({ geo: o.geometry, mat, m: o.matrixWorld.clone() });
    });
    // secteurs
    const cells = new Map();
    for (const it of items) { const k = Math.floor(it.x / CELL) + ',' + Math.floor(it.z / CELL); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(it); }
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Pv = new THREE.Vector3();
    const hgt = box.max.y - box.min.y;
    for (const [, its] of cells) {
      for (const part of parts) {
        const im = new THREE.InstancedMesh(part.geo, part.mat, its.length);
        its.forEach((it, k) => {
          const s = it.h ? it.h / hgt : (it.s || 1);
          Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.ry || 0);
          M.compose(Pv.set(it.x, (it.y || 0) - box.min.y * s, it.z), Q, S.set(s, s, s)).multiply(part.m);
          im.setMatrixAt(k, M);
        });
        im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
        scene.add(im); out.push(im);
      }
    }
    onProgress && onProgress(++done / byName.size);
  }));
  return out;
}
