// Panneaux flottants au-dessus des lieux importants (visibles de loin) + anneau lumineux devant l'entrée.
import * as THREE from 'three';
import * as W from './world.js';

const KEY = {
  driving_school: ['🚗', 'AUTO-ÉCOLE', '#e08a1e'], dealership: ['🚙', 'CONCESSION AUTO', '#2a62c9'], supermarket: ['🛒', 'SUPERMARCHÉ', '#d63b30'],
  gas_station: ['⛽', 'STATION-SERVICE', '#1f8a4c'], garage: ['🔧', 'GARAGE · TAXI', '#5f6b70'], warehouse: ['📦', 'LIVRAISONS', '#8a6b45'],
  office: ['🏢', 'BUREAUX', '#4b5a73'], bank: ['€', 'BANQUE', '#20406b'], restaurant: ['🍽', 'RESTAURANT', '#b8462b'], cafe: ['☕', 'CAFÉ', '#7a4f2b'],
  bakery: ['🥖', 'BOULANGERIE', '#a0702a'], lake: ['🏖', 'LAC & PLAGE', '#1e8fb0'], gunshop: ['🔫', 'ARMURERIE', '#8a1c1c'], apartments_home: ['🏠', 'MON DOMICILE', '#2f6b47'], pharmacy: ['✚', 'PHARMACIE', '#1e9e6a'], factory: ['🏭', 'USINE (intérim)', '#55524f'],
};

function sprite(icon, label, name, color) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 160; const g = c.getContext('2d');
  g.fillStyle = 'rgba(12,14,18,.82)'; roundRect(g, 4, 4, 504, 152, 34); g.fill();
  g.fillStyle = color; roundRect(g, 4, 4, 140, 152, 34); g.fill(); g.fillRect(110, 4, 34, 152);
  g.font = '84px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(icon, 74, 84);
  g.textAlign = 'left'; g.font = '800 46px Inter, sans-serif'; g.fillText(label, 168, 62);
  g.font = '500 30px Inter, sans-serif'; g.fillStyle = 'rgba(255,255,255,.75)'; g.fillText(name.length > 24 ? name.slice(0, 23) + '…' : name, 168, 112);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true, fog: false, toneMapped: false });
  const s = new THREE.Sprite(m); s.scale.set(9, 2.8, 1); s.renderOrder = 10;
  return s;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

export class Markers {
  constructor(scene) {
    this.items = [];
    const seen = {};
    for (const p of W.places) {
      const k = KEY[p.type]; if (!k || !p.door || !p.door.p) continue;
      seen[p.type] = (seen[p.type] || 0) + 1;
      if (['restaurant', 'bakery', 'bank', 'pharmacy', 'cafe'].includes(p.type) && seen[p.type] > 4) continue;
      const s = sprite(k[0], k[1], p.name, k[2]);
      const h = Math.min((p.height || 8) + 3, 14);
      s.position.set(p.door.p.x, h, p.door.p.z);
      scene.add(s);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: k[2], transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false }));
      ring.position.set(p.door.p.x, 0.17, p.door.p.z); scene.add(ring);
      this.items.push({ s, ring, p });
    }
  }
  update(cam, t) {
    for (const it of this.items) {
      const d = it.s.position.distanceTo(cam.position);
      it.s.visible = d < 260;
      const k = THREE.MathUtils.clamp(d / 60, 0.7, 3.2); it.s.scale.set(9 * k, 2.8 * k, 1);
      it.ring.material.opacity = 0.45 + Math.sin(t * 3) * 0.25; it.ring.visible = d < 80;
    }
  }
}
