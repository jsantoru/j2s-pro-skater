// DOM HUD: score, timer, combo readout, controller status, toasts, overlays.
const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('en-US');

const HOLD = 2.2; // seconds the trick names stay up after a land or a bail
const FADE = 0.35; // last stretch of the hold, where the readout dims out

export class HUD {
  constructor() {
    this.el = {
      score: $('score'), timer: $('timer'), pad: $('pad-status'), comboPts: $('combo-points'), comboMult: $('combo-mult'),
      trick: $('trick-text'), landed: $('landed-text'), toast: $('toast'), controls: $('controls-panel'),
      overlay: $('overlay'), overlayMsg: $('overlay-msg'), finalScore: $('final-score'), speed: $('speed-fill'),
      bottom: $('bottom'), balance: $('balance'), balanceNeedle: $('balance-needle'), balanceLabel: $('balance-label'),
    };
    this.shownScore = 0; this.holdTimer = 0; this.toastTimer = 0;
    this.balanceShown = false; this.balanceVertical = undefined;
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
  // live readout while the combo is still running
  combo(text, points, mult) {
    this.holdTimer = 0;
    this.el.bottom.classList.remove('fading', 'lost');
    this.el.trick.classList.remove('bail');
    this.el.landed.classList.remove('show', 'bail');
    this.setLine(text, points, mult);
  }
  // combo banked: keep the trick names and the maths up next to the payout
  landed(total, text, mult) {
    if (total <= 0) { this.combo('', 0, 0); return; }
    this.combo(text, Math.round(total / Math.max(1, mult)), mult);
    this.el.landed.textContent = '+' + fmt(total);
    this.el.landed.classList.add('show');
    this.holdTimer = HOLD;
  }
  // combo lost: same layout, red, so you can see what you threw away
  bailed(msg, text, points, mult) {
    this.combo(text, points, mult);
    this.el.trick.classList.add('bail');
    this.el.bottom.classList.add('lost'); // the points line is what you just threw away, not a payout
    this.el.landed.textContent = msg;
    this.el.landed.classList.add('show', 'bail');
    this.holdTimer = HOLD;
  }
  setLine(text, points, mult) {
    this.el.trick.textContent = text || '';
    if (mult > 0) { this.el.comboPts.textContent = fmt(points); this.el.comboMult.textContent = 'x' + mult; }
    else { this.el.comboPts.textContent = ''; this.el.comboMult.textContent = ''; }
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
  update(dt, score, timeLeft, speedFrac) {
    this.shownScore += (score - this.shownScore) * Math.min(1, dt * 6);
    if (Math.abs(score - this.shownScore) < 1) this.shownScore = score;
    this.el.score.textContent = fmt(Math.round(this.shownScore));
    const t = Math.max(0, timeLeft), m = Math.floor(t / 60), s = Math.floor(t % 60);
    this.el.timer.textContent = m + ':' + (s < 10 ? '0' : '') + s;
    this.el.timer.classList.toggle('low', t < 15);
    this.el.speed.style.width = Math.round(Math.min(1, speedFrac) * 100) + '%';
    if (this.toastTimer > 0) { this.toastTimer -= dt; if (this.toastTimer <= 0) this.el.toast.classList.remove('show'); }
    if (this.holdTimer > 0) {
      this.holdTimer -= dt;
      if (this.holdTimer <= FADE) this.el.bottom.classList.add('fading');
      if (this.holdTimer <= 0) {
        this.el.landed.classList.remove('show', 'bail');
        this.el.landed.textContent = '';
        this.el.trick.classList.remove('bail');
        this.el.bottom.classList.remove('fading', 'lost');
        this.setLine('', 0, 0);
      }
    }
  }
}
