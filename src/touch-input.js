// Pointer-independent touch state. Press/release edges survive a complete tap
// between render frames; cancellation deliberately discards both edges.
export const TOUCH_ACTIONS = Object.freeze(['ollie', 'flip', 'grab', 'grind', 'revert']);

export class TouchInput {
  constructor() {
    this.enabled = true;
    this.stick = { x: 0, y: 0, active: false };
    this.held = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.resetListeners = new Set();
  }

  setEnabled(enabled) {
    if (this.enabled === !!enabled) return;
    this.enabled = !!enabled;
    this.reset();
  }

  setStick(x, y, active = true) {
    if (!this.enabled) return;
    x = Number.isFinite(x) ? x : 0; y = Number.isFinite(y) ? y : 0;
    const length = Math.max(1, Math.hypot(x, y));
    this.stick = active ? { x: x / length, y: y / length, active: true } : { x: 0, y: 0, active: false };
  }

  press(action) {
    if (!this.enabled || !TOUCH_ACTIONS.includes(action) || this.held.has(action)) return;
    this.held.add(action); this.pressed.add(action);
  }

  release(action) {
    if (!this.held.delete(action)) return;
    this.released.add(action);
  }

  consume() {
    const state = {
      stick: { ...this.stick },
      held: new Set(this.held), pressed: new Set(this.pressed), released: new Set(this.released),
    };
    this.pressed.clear(); this.released.clear();
    return state;
  }

  onReset(listener) {
    this.resetListeners.add(listener);
    return () => this.resetListeners.delete(listener);
  }

  reset() {
    const active = this.stick.active || this.held.size > 0 || this.pressed.size > 0 || this.released.size > 0;
    const ollie = this.held.has('ollie') || this.pressed.has('ollie') || this.released.has('ollie');
    this.stick = { x: 0, y: 0, active: false };
    this.held.clear(); this.pressed.clear(); this.released.clear();
    for (const listener of this.resetListeners) listener({ active, ollie });
  }
}
