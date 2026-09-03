// Gamepad-first input. Produces one flat InputState per frame that the skater consumes.
// Analog values stay analog; keyboard is smoothed to emulate a stick.

const DEADZONE = 0.14;

function makeState() {
  return {
    steer: 0,        // -1..1, right positive (left stick X)
    stickY: 0,       // -1..1, up positive
    push: 0,         // 0..1
    brake: 0,        // 0..1
    ollie: false, olliePressed: false, ollieReleased: false,
    flipPressed: false,
    grab: false, grabPressed: false,
    grind: false, grindPressed: false,
    spinLeft: false, spinRight: false,
    camX: 0,
    startPressed: false, selectPressed: false,
    dir8: 'C',       // stick direction: C N NE E SE S SW W NW
  };
}

function radialDeadzone(x, y) {
  const m = Math.hypot(x, y);
  if (m < DEADZONE) return [0, 0];
  const s = Math.min(1, (m - DEADZONE) / (1 - DEADZONE)) / m;
  return [x * s, y * s];
}

export function dir8FromStick(x, y) {
  // y is up-positive. Threshold generous so trick inputs read reliably.
  if (Math.hypot(x, y) < 0.45) return 'C';
  const a = Math.atan2(y, x); // 0 = right, pi/2 = up
  const sector = Math.round(a / (Math.PI / 4)) & 7;
  return ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'][sector];
}

export class Input {
  constructor() {
    this.state = makeState();
    this.keys = new Set();
    this.latched = new Set(); // keys tapped since the last poll (so short taps never fall between frames)
    this.prevButtons = [];
    this.gamepadIndex = -1;
    this.gamepadId = '';
    this.onGamepadChange = null;
    this.kbSteer = 0; this.kbY = 0;
    this._prevKeys = {};
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        this.keys.add(e.code); this.latched.add(e.code);
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      });
      window.addEventListener('keyup', (e) => this.keys.delete(e.code));
      window.addEventListener('blur', () => this.keys.clear());
      window.addEventListener('gamepadconnected', (e) => this._setGamepad(e.gamepad));
      window.addEventListener('gamepaddisconnected', (e) => {
        if (e.gamepad.index === this.gamepadIndex) {
          this.gamepadIndex = -1; this.gamepadId = '';
          this.onGamepadChange?.(false, e.gamepad.id);
          this._scanGamepads();
        }
      });
    }
  }

  _setGamepad(gp) {
    if (!gp) return;
    if (this.gamepadIndex === gp.index) return;
    this.gamepadIndex = gp.index; this.gamepadId = gp.id;
    this.prevButtons = [];
    this.onGamepadChange?.(true, gp.id);
  }

  _scanGamepads() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) if (gp && gp.connected) { this._setGamepad(gp); return gp; }
    return null;
  }

  get hasGamepad() { return this.gamepadIndex >= 0; }

  poll(dt) {
    const s = this.state;
    const prev = { ollie: s.ollie, grab: s.grab, grind: s.grind };
    // reset edges
    s.olliePressed = s.ollieReleased = s.flipPressed = s.grabPressed = s.grindPressed = false;
    s.startPressed = s.selectPressed = false;

    let gp = null;
    if (typeof navigator !== 'undefined' && navigator.getGamepads) {
      const pads = navigator.getGamepads();
      gp = this.gamepadIndex >= 0 ? pads[this.gamepadIndex] : null;
      if (!gp || !gp.connected) { this.gamepadIndex = -1; gp = this._scanGamepads(); }
    }

    // --- keyboard (smoothed digital → pseudo-analog) ---
    const L = this.latched, K = this.keys;
    const k = { has: (c) => K.has(c) || L.has(c) };
    const kx = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
    const ky = (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0) - (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0);
    const rate = dt * 9; // reaches full deflection in ~0.11s, returns to center faster
    this.kbSteer += Math.max(-rate, Math.min(rate, kx - this.kbSteer)) * (kx === 0 ? 1.6 : 1);
    this.kbY += Math.max(-rate, Math.min(rate, ky - this.kbY)) * (ky === 0 ? 1.6 : 1);
    this.kbSteer = Math.max(-1, Math.min(1, this.kbSteer));
    this.kbY = Math.max(-1, Math.min(1, this.kbY));

    let steer = this.kbSteer, sy = this.kbY, push = ky > 0 ? 1 : 0, brake = ky < 0 ? 1 : 0;
    let ollie = k.has('Space'), flip = k.has('KeyJ'), grab = k.has('KeyK'), grind = k.has('KeyL');
    let spinL = k.has('KeyQ'), spinR = k.has('KeyE');
    let start = k.has('Enter'), select = k.has('Tab');
    let camX = 0;
    let dirX = kx, dirY = ky;

    // --- gamepad (standard mapping) ---
    if (gp) {
      const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
      const bv = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0);
      let [ax, ay] = radialDeadzone(gp.axes[0] || 0, -(gp.axes[1] || 0));
      // d-pad mirrors the stick
      const dx = (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
      const dy = (b(12) ? 1 : 0) - (b(13) ? 1 : 0);
      if (dx || dy) { ax = dx; ay = dy; }
      if (Math.abs(ax) > 0 || Math.abs(ay) > 0) { steer = ax; sy = ay; dirX = ax; dirY = ay; }
      const rt = Math.max(bv(7), b(7) ? 1 : 0), lt = Math.max(bv(6), b(6) ? 1 : 0);
      push = Math.max(push, rt, ay > 0.3 ? Math.min(1, (ay - 0.3) / 0.6) : 0);
      brake = Math.max(brake, lt, ay < -0.4 ? Math.min(1, (-ay - 0.4) / 0.5) : 0);
      ollie = ollie || b(0);
      grab = grab || b(1);
      flip = flip || b(2);
      grind = grind || b(3);
      spinL = spinL || b(4); spinR = spinR || b(5);
      select = select || b(8); start = start || b(9);
      const [cx] = radialDeadzone(gp.axes[2] || 0, gp.axes[3] || 0);
      camX = cx;
      this._gpFlip = flip;
    }

    // edges
    const e = this._prevKeys;
    s.olliePressed = ollie && !prev.ollie;
    s.ollieReleased = !ollie && prev.ollie;
    s.flipPressed = flip && !e.flip;
    s.grabPressed = grab && !prev.grab;
    s.grindPressed = grind && !prev.grind;
    s.startPressed = start && !e.start;
    s.selectPressed = select && !e.select;
    e.flip = flip; e.start = start; e.select = select;

    s.steer = steer; s.stickY = sy; s.push = push; s.brake = brake;
    s.ollie = ollie; s.grab = grab; s.grind = grind;
    s.spinLeft = spinL; s.spinRight = spinR; s.camX = camX;
    s.dir8 = dir8FromStick(dirX, dirY);
    L.clear();
    s.anyPressed = s.olliePressed || s.flipPressed || s.grabPressed || s.grindPressed || s.startPressed;
    return s;
  }
}

export { makeState };
