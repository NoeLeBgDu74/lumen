// Entrées clavier/souris (architecture prête pour manette et tactile : tout passe par `axes` et `pressed`).
export class Input {
  constructor(canvas) {
    this.keys = new Set(); this.once = new Set();
    this.mdx = 0; this.mdy = 0; this.wheel = 0; this.locked = false;
    addEventListener('keydown', e => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (!this.keys.has(e.code)) this.once.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('click', () => {
      if (this.enabled && !this.locked) { try { const p = canvas.requestPointerLock?.(); p && p.catch && p.catch(() => {}); } catch (e) {} }
    });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    // repli : glisser avec le bouton gauche si le verrouillage du pointeur est indisponible
    this.drag = false;
    canvas.addEventListener('mousedown', () => { this.drag = true; });
    addEventListener('mouseup', () => { this.drag = false; });
    addEventListener('mousemove', e => { if (this.locked || this.drag) { this.mdx += e.movementX; this.mdy += e.movementY; } });
    addEventListener('wheel', e => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    this.enabled = true;
  }
  down(...codes) { return this.enabled && codes.some(c => this.keys.has(c)); }
  pressed(code) { if (!this.enabled) return false; if (this.once.has(code)) { this.once.delete(code); return true; } return false; }
  // Axes de déplacement compatibles AZERTY (ZQSD) et QWERTY (WASD).
  move() {
    const f = (this.down('KeyW', 'KeyZ', 'ArrowUp') ? 1 : 0) - (this.down('KeyS', 'ArrowDown') ? 1 : 0);
    const s = (this.down('KeyD', 'ArrowRight') ? 1 : 0) - (this.down('KeyA', 'KeyQ', 'ArrowLeft') ? 1 : 0);
    return { f, s };
  }
  consumeMouse() { const r = [this.mdx, this.mdy, this.wheel]; this.mdx = this.mdy = this.wheel = 0; return r; }
  endFrame() { this.once.clear(); }
}
