import { TouchInput, TOUCH_ACTIONS } from './touch-input.js';

// One owner per control, with independent captured pointers for stick and actions.
// The overlay is opt-in on desktop (?touch), and otherwise follows coarse pointers.
export class TouchControls {
  static available() {
    return !!(globalThis.matchMedia?.('(pointer: coarse)').matches
      || new URLSearchParams(globalThis.location?.search || '').has('touch'));
  }

  constructor({ root = globalThis.document?.getElementById('touch-controls'), source = new TouchInput() } = {}) {
    this.root = root;
    this.source = source;
    this.active = false;
    this.pointers = new Map();
    this.owners = new Map();
    this.listeners = [];
    this.stick = root?.querySelector('#touch-stick');
    this.knob = root?.querySelector('#touch-stick-knob');
    this.buttons = [...(root?.querySelectorAll('[data-touch-action]') || [])];
    this.unsubscribe = source.onReset(() => this.clearPointers());
    this.bind(this.stick, 'pointerdown', event => this.down(event, 'stick', this.stick));
    this.bind(this.stick, 'contextmenu', event => event.preventDefault());
    for (const button of this.buttons) {
      const action = button.dataset.touchAction;
      if (TOUCH_ACTIONS.includes(action)) this.bind(button, 'pointerdown', event => this.down(event, action, button));
      // These are physical controls, not menu buttons: suppress synthesized clicks.
      this.bind(button, 'click', event => event.preventDefault());
      this.bind(button, 'contextmenu', event => event.preventDefault());
    }
    this.bind(root, 'pointermove', event => this.move(event));
    this.bind(root, 'lostpointercapture', event => { if (this.pointers.has(event.pointerId)) this.source.reset(); });
    const view = root?.ownerDocument?.defaultView || globalThis.window;
    this.bind(view, 'pointerup', event => this.up(event));
    this.bind(view, 'pointercancel', event => { if (this.pointers.has(event.pointerId)) this.source.reset(); });
    this.bind(view, 'blur', () => this.source.reset());
    this.bind(view, 'resize', () => this.source.reset());
    this.bind(root?.ownerDocument || globalThis.document, 'visibilitychange', () => {
      if ((root?.ownerDocument || globalThis.document)?.hidden) this.source.reset();
    });
    this.setActive(false, true);
  }

  bind(target, type, handler) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler, { passive: false });
    this.listeners.push([target, type, handler]);
  }

  setActive(active, force = false) {
    active = !!active;
    if (!force && this.active === active) return;
    this.active = active;
    if (this.root) {
      this.root.hidden = !active; this.root.inert = !active;
      this.root.setAttribute('aria-hidden', String(!active));
    }
    this.source.setEnabled(active);
    if (!active) this.source.reset();
  }

  down(event, action, element) {
    if (!this.active || !this.source.enabled || this.owners.has(action) || this.pointers.has(event.pointerId)) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    this.pointers.set(event.pointerId, { action, element });
    this.owners.set(action, event.pointerId);
    try { element.setPointerCapture(event.pointerId); } catch { /* window pointerup still releases */ }
    if (action === 'stick') { element.classList.add('active'); this.updateStick(event); }
    else { element.classList.add('pressed'); this.source.press(action); }
  }

  move(event) {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    event.preventDefault();
    if (pointer.action === 'stick') this.updateStick(event);
  }

  updateStick(event) {
    const rect = this.stick.getBoundingClientRect();
    const radius = Math.max(1, Math.min(rect.width, rect.height) * 0.34);
    const x = (event.clientX - rect.left - rect.width / 2) / radius;
    const y = (rect.top + rect.height / 2 - event.clientY) / radius;
    this.source.setStick(x, y);
    const stick = this.source.stick;
    if (this.knob) this.knob.style.transform = `translate(${stick.x * radius}px, ${-stick.y * radius}px)`;
  }

  up(event) {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    event.preventDefault();
    this.pointers.delete(event.pointerId); this.owners.delete(pointer.action);
    if (pointer.action === 'stick') {
      this.source.setStick(0, 0, false); this.resetStickVisual();
    } else { this.source.release(pointer.action); pointer.element.classList.remove('pressed'); }
    // Delete ownership first: releasing capture emits lostpointercapture normally.
    try { pointer.element.releasePointerCapture(event.pointerId); } catch { /* already released */ }
  }

  resetStickVisual() {
    this.stick?.classList.remove('active');
    if (this.knob) this.knob.style.transform = 'translate(0px, 0px)';
  }

  clearPointers() {
    const pointers = [...this.pointers];
    this.pointers.clear(); this.owners.clear();
    for (const [id, pointer] of pointers) {
      pointer.element.classList.remove('pressed');
      try { pointer.element.releasePointerCapture(id); } catch { /* already released */ }
    }
    this.resetStickVisual();
    for (const button of this.buttons) button.classList.remove('pressed');
  }

  dispose() {
    this.setActive(false, true);
    this.unsubscribe();
    for (const [target, type, handler] of this.listeners) target.removeEventListener(type, handler);
    this.listeners.length = 0;
  }
}
