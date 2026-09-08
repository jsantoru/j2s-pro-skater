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
    revertLeftPressed: false, revertRightPressed: false,
    camX: 0,
    startPressed: false, selectPressed: false, pausePressed: false,
    menuMove: 0, menuConfirm: false, menuCancel: false,
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
    this.menuOpen = false;
    this.blockedKeys = new Set(); this.blockedButtons = new Set(); this.blockedAxes = new Set();
    this._menuPrev = {};
    this._hapticStrong = 0; this._hapticWeak = 0;
    this._pulseStrong = 0; this._pulseWeak = 0; this._pulseT = 0;
    this._hapticEmitT = 0; this._hapticPulseFresh = false;
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        // Native buttons own their activation keys; pressing Enter on a menu
        // must not also queue a run restart or Space-powered ollie.
        if (['Enter', 'Space'].includes(e.code) && e.target?.closest?.('button, input, select, textarea')) return;
        this.keys.add(e.code); this.latched.add(e.code);
        if (!this.menuOpen && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Escape'].includes(e.code)) e.preventDefault();
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

  setMenuOpen(open) {
    this.menuOpen = open;
    this.latched.clear(); this.kbSteer = this.kbY = 0;
    // A held menu button/stick must return to neutral before it can skate again.
    if (!open) {
      this.blockedKeys = new Set(this.keys);
      const gp = typeof navigator !== 'undefined' && navigator.getGamepads?.()[this.gamepadIndex];
      this.blockedButtons = new Set(gp ? gp.buttons.flatMap((b, i) => b.pressed || b.value > .14 ? [i] : []) : []);
      this.blockedAxes = new Set(gp ? gp.axes.flatMap((v, i) => Math.abs(v) > DEADZONE ? [i] : []) : []);
    }
    Object.assign(this.state, makeState());
  }

  stopHaptics() {
    this.rumbleSustainStop();
    this._pulseStrong = this._pulseWeak = this._pulseT = 0;
    this._hapticPulseFresh = false;
    const gp = typeof navigator !== 'undefined' && navigator.getGamepads?.()[this.gamepadIndex];
    try { gp?.vibrationActuator?.reset?.().catch(() => {}); } catch { /* unsupported actuator */ }
  }

  // Haptics (Chrome/Edge dual-rumble). `strong` is the low-frequency motor and `weak` is
  // the high-frequency motor. Everything is mixed once per frame so simultaneous feedback
  // (for example grind texture + ollie charge) reinforces instead of replacing itself.
  _playRumble(strong, weak, ms) {
    if (this.gamepadIndex < 0 || typeof navigator === 'undefined') return;
    const gp = navigator.getGamepads()[this.gamepadIndex];
    const act = gp && gp.vibrationActuator;
    if (!act || !act.playEffect) return;
    try { act.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {}); } catch { /* ignore */ }
  }

  hapticsBegin() { this._hapticStrong = 0; this._hapticWeak = 0; }

  // Queue an impact/tick envelope. The mixer re-issues it until its requested duration has elapsed.
  rumble(strong, weak, ms) {
    this._pulseStrong = Math.max(this._pulseStrong, Math.max(0, Math.min(1, strong)));
    this._pulseWeak = Math.max(this._pulseWeak, Math.max(0, Math.min(1, weak)));
    this._pulseT = Math.max(this._pulseT, ms / 1000);
    this._hapticPulseFresh = true;
  }

  rumbleSustain(strong, weak) {
    strong = Math.max(0, Math.min(1, strong)); weak = Math.max(0, Math.min(1, weak));
    // Saturating addition keeps distinct signals perceptible without exceeding the API's 0..1 range.
    this._hapticStrong = 1 - (1 - this._hapticStrong) * (1 - strong);
    this._hapticWeak = 1 - (1 - this._hapticWeak) * (1 - weak);
  }

  rumbleSustainStop() { this._hapticStrong = 0; this._hapticWeak = 0; this._hapticEmitT = 0; }

  hapticsCommit(dt) {
    const pulsing = this._pulseT > 0;
    const ps = pulsing ? this._pulseStrong : 0, pw = pulsing ? this._pulseWeak : 0;
    const strong = 1 - (1 - this._hapticStrong) * (1 - ps);
    const weak = 1 - (1 - this._hapticWeak) * (1 - pw);
    this._hapticEmitT -= dt;
    if ((strong > 0.005 || weak > 0.005) && (this._hapticEmitT <= 0 || this._hapticPulseFresh)) {
      this._playRumble(strong, weak, 120);
      this._hapticEmitT = 0.08;
      this._hapticPulseFresh = false;
    } else if (strong <= 0.005 && weak <= 0.005) {
      this._hapticEmitT = 0;
    }
    if (pulsing) {
      this._pulseT -= dt;
      if (this._pulseT <= 0) { this._pulseT = 0; this._pulseStrong = 0; this._pulseWeak = 0; }
    }
  }

  poll(dt) {
    const s = this.state;
    const prev = { ollie: s.ollie, grab: s.grab, grind: s.grind };
    // reset edges
    s.olliePressed = s.ollieReleased = s.flipPressed = s.grabPressed = s.grindPressed = false;
    s.startPressed = s.selectPressed = false;
    s.revertLeftPressed = s.revertRightPressed = false;

    let gp = null;
    if (typeof navigator !== 'undefined' && navigator.getGamepads) {
      const pads = navigator.getGamepads();
      gp = this.gamepadIndex >= 0 ? pads[this.gamepadIndex] : null;
      if (!gp || !gp.connected) { this.gamepadIndex = -1; gp = this._scanGamepads(); }
    }

    // --- keyboard (smoothed digital → pseudo-analog) ---
    const L = this.latched, K = this.keys;
    for (const code of this.blockedKeys) if (!K.has(code)) this.blockedKeys.delete(code);
    const rawKey = (c) => K.has(c) || L.has(c);
    const k = { has: (c) => !this.menuOpen && !this.blockedKeys.has(c) && rawKey(c) };
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
    let revertL = k.has('KeyZ'), revertR = k.has('KeyC');
    let start = rawKey('Enter'), select = rawKey('Tab'), pause = rawKey('Escape');
    let camX = 0;
    let dirX = kx, dirY = ky;

    // --- gamepad (standard mapping) ---
    const rawButton = (i) => !!gp?.buttons[i]?.pressed;
    const menuDir = rawButton(12) || (gp?.axes[1] || 0) < -.55 ? -1
      : rawButton(13) || (gp?.axes[1] || 0) > .55 ? 1 : 0;
    const confirm = rawButton(0), cancel = rawButton(1) || rawButton(8);
    s.menuMove = menuDir && menuDir !== this._menuPrev.dir ? menuDir : 0;
    s.menuConfirm = confirm && !this._menuPrev.confirm;
    s.menuCancel = cancel && !this._menuPrev.cancel;
    this._menuPrev = { dir: menuDir, confirm, cancel };
    if (gp) {
      for (const i of this.blockedButtons) if (!rawButton(i) && (gp.buttons[i]?.value || 0) <= .14) this.blockedButtons.delete(i);
      for (const i of this.blockedAxes) if (Math.abs(gp.axes[i] || 0) <= DEADZONE) this.blockedAxes.delete(i);
      const b = (i) => !this.menuOpen && !this.blockedButtons.has(i) && rawButton(i);
      const bv = (i) => !this.menuOpen && !this.blockedButtons.has(i) ? gp.buttons[i]?.value || 0 : 0;
      const axis = (i) => !this.menuOpen && !this.blockedAxes.has(i) ? gp.axes[i] || 0 : 0;
      let [ax, ay] = radialDeadzone(axis(0), -axis(1));
      // d-pad mirrors the stick
      const dx = (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
      const dy = (b(12) ? 1 : 0) - (b(13) ? 1 : 0);
      if (dx || dy) { ax = dx; ay = dy; }
      if (Math.abs(ax) > 0 || Math.abs(ay) > 0) { steer = ax; sy = ay; dirX = ax; dirY = ay; }
      const rt = Math.max(bv(7), b(7) ? 1 : 0), lt = Math.max(bv(6), b(6) ? 1 : 0);
      push = Math.max(push, ay > 0.3 ? Math.min(1, (ay - 0.3) / 0.6) : 0);
      brake = Math.max(brake, ay < -0.4 ? Math.min(1, (-ay - 0.4) / 0.5) : 0);
      revertL = revertL || lt > 0.5; revertR = revertR || rt > 0.5;
      ollie = ollie || b(0);
      grab = grab || b(1);
      flip = flip || b(2);
      grind = grind || b(3);
      spinL = spinL || b(4); spinR = spinR || b(5);
      select = select || rawButton(8); start = start || rawButton(9);
      const [cx] = radialDeadzone(axis(2), axis(3));
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
    s.pausePressed = pause && !e.pause;
    s.revertLeftPressed = revertL && !e.revertL;
    s.revertRightPressed = revertR && !e.revertR;
    e.revertL = revertL; e.revertR = revertR;
    e.flip = flip; e.start = start; e.select = select; e.pause = pause;

    s.steer = steer; s.stickY = sy; s.push = push; s.brake = brake;
    s.ollie = ollie; s.grab = grab; s.grind = grind;
    s.spinLeft = spinL; s.spinRight = spinR; s.camX = camX;
    s.dir8 = dir8FromStick(dirX, dirY);
    L.clear();
    s.anyPressed = s.olliePressed || s.flipPressed || s.grabPressed || s.grindPressed || s.startPressed || s.revertLeftPressed || s.revertRightPressed;
    return s;
  }
}

export { makeState };
