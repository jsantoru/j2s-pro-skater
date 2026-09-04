// DOM HUD: score, timer, combo readout, controller status, toasts, overlays.
const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('en-US');

export class HUD {
  constructor() {
    this.el = {
      score: $('score'), timer: $('timer'), pad: $('pad-status'), comboPts: $('combo-points'), comboMult: $('combo-mult'),
      trick: $('trick-text'), landed: $('landed-text'), toast: $('toast'), controls: $('controls-panel'),
      overlay: $('overlay'), overlayMsg: $('overlay-msg'), finalScore: $('final-score'), speed: $('speed-fill'),
      balance: $('balance'), balanceNeedle: $('balance-needle'), balanceLabel: $('balance-label'),
    };
    this.balanceVertical = undefined;
    this.shownScore = 0; this.landedTimer = 0; this.toastTimer = 0; this.trickTimer = 0;
    this.balanceShown = false;
  }
  setPad(connected, id) {
    this.el.pad.textContent = connected ? '🎮 ' + (id || 'GAMEPAD').replace(/\(.*\)/, '').trim().slice(0, 28).toUpperCase() : '⌨ KEYBOARD (no gamepad)';
    this.el.pad.classList.toggle('connected', connected);
  }
  toast(msg) { this.el.toast.textContent = msg; this.el.toast.classList.add('show'); this.toastTimer = 2.6; }
  toggleControls(force) { this.el.controls.classList.toggle('hidden', force === undefined ? undefined : !force); }
  get controlsOpen() { return !this.el.controls.classList.contains('hidden'); }
  overlay(show, msg, score) {
    this.el.overlay.classList.toggle('hidden', !show);
    if (msg) this.el.overlayMsg.textContent = msg;
    this.el.finalScore.textContent = score !== undefined ? 'FINAL SCORE  ' + fmt(score) : '';
  }
  combo(text, points, mult, bail) {
    this.el.trick.textContent = text;
    this.el.trick.classList.toggle('bail', !!bail);
    if (mult > 0) { this.el.comboPts.textContent = fmt(points); this.el.comboMult.textContent = 'x' + mult; }
    else { this.el.comboPts.textContent = ''; this.el.comboMult.textContent = ''; }
    this.trickTimer = bail ? 1.6 : 0;
  }
  // Balance meter: only on screen while it matters, so it never becomes wallpaper. Grinds tip
  // side-to-side and get a horizontal bar; manuals tip fore-aft and get a vertical one, so the meter
  // always moves the same way the stick does.
  balance(show, x, vertical, label) {
    const el = this.el.balance, n = this.el.balanceNeedle;
    if (show !== this.balanceShown) { el.classList.toggle('hidden', !show); this.balanceShown = show; }
    if (!show) return;
    const v = Math.max(-1, Math.min(1, x));
    if (vertical !== this.balanceVertical) {
      el.classList.toggle('vertical', !!vertical);
      n.style.left = ''; n.style.top = '';               // clear whichever axis we are no longer driving
      this.el.balanceLabel.textContent = label;
      this.balanceVertical = vertical;
    }
    if (vertical) n.style.top = (50 - v * 50) + '%';      // +x is nose-high, which reads as up
    else n.style.left = (50 + v * 50) + '%';
    el.classList.toggle('danger', Math.abs(v) > 0.62);
  }
  landed(points) {
    this.el.landed.textContent = '+' + fmt(points); this.el.landed.classList.add('show'); this.landedTimer = 1.4;
    this.el.trick.textContent = ''; this.el.comboPts.textContent = ''; this.el.comboMult.textContent = '';
  }
  update(dt, score, timeLeft, speedFrac) {
    this.shownScore += (score - this.shownScore) * Math.min(1, dt * 6);
    if (Math.abs(score - this.shownScore) < 1) this.shownScore = score;
    this.el.score.textContent = fmt(Math.round(this.shownScore));
    const t = Math.max(0, timeLeft), m = Math.floor(t / 60), s = Math.floor(t % 60);
    this.el.timer.textContent = m + ':' + (s < 10 ? '0' : '') + s;
    this.el.timer.classList.toggle('low', t < 15);
    this.el.speed.style.width = Math.round(Math.min(1, speedFrac) * 100) + '%';
    if (this.landedTimer > 0) { this.landedTimer -= dt; if (this.landedTimer <= 0) this.el.landed.classList.remove('show'); }
    if (this.toastTimer > 0) { this.toastTimer -= dt; if (this.toastTimer <= 0) this.el.toast.classList.remove('show'); }
    if (this.trickTimer > 0) { this.trickTimer -= dt; if (this.trickTimer <= 0) { this.el.trick.textContent = ''; this.el.trick.classList.remove('bail'); } }
  }
}
