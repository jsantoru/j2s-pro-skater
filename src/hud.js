// DOM HUD: score, timer, combo readout, controller status, toasts, overlays.
const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('en-US');

export class HUD {
  constructor() {
    this.el = {
      score: $('score'), timer: $('timer'), pad: $('pad-status'), comboPts: $('combo-points'), comboMult: $('combo-mult'),
      trick: $('trick-text'), landed: $('landed-text'), toast: $('toast'), controls: $('controls-panel'),
      overlay: $('overlay'), overlayMsg: $('overlay-msg'), finalScore: $('final-score'), speed: $('speed-fill'),
    };
    this.shownScore = 0; this.landedTimer = 0; this.toastTimer = 0; this.trickTimer = 0;
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
