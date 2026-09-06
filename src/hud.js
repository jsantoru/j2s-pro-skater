// DOM HUD: score, timer, combo readout, controller status, toasts, overlays.
import * as THREE from 'three';
const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('en-US');

const HOLD = 2.2; // seconds the trick names stay up after a land or a bail
const FADE = 0.35; // last stretch of the hold, where the readout dims out

export class HUD {
  constructor() {
    this.el = {
      score: $('score'), timer: $('timer'), pad: $('pad-status'), comboPts: $('combo-points'), comboMult: $('combo-mult'),
      trick: $('trick-text'), landed: $('landed-text'), toast: $('toast'), controls: $('controls-panel'),
      overlay: $('overlay'), overlayMsg: $('overlay-msg'), finalScore: $('final-score'),
      bottom: $('bottom'), balance: $('balance'), balanceNeedle: $('balance-needle'),
    };
    this.shownScore = 0; this.holdTimer = 0; this.toastTimer = 0;
    this.balanceShown = false; this.balanceVertical = undefined;
    this.balanceHead = new THREE.Vector3(); this.balanceFeet = new THREE.Vector3();
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
  // A tapered arc follows the skater: overhead for rails, on the left for manuals.
  // The cyan pointer follows the actual curve, with no smoothing that could hide a dangerous lean.
  balance(show, x, vertical, character, camera) {
    const el = this.el.balance, n = this.el.balanceNeedle;
    if (show !== this.balanceShown) { el.classList.toggle('hidden', !show); this.balanceShown = show; }
    if (!show) return;
    const v = Math.max(-1, Math.min(1, x));
    if (vertical !== this.balanceVertical) {
      el.classList.toggle('vertical', !!vertical);
      el.setAttribute('aria-label', vertical ? 'Manual balance' : 'Grind balance');
      this.balanceVertical = vertical;
    }
    const t = (v + 1) / 2, px = 18 + 284 * t, py = 84 - 201 * t * (1 - t);
    const angle = Math.atan2(201 * (2 * t - 1), 284) * 180 / Math.PI;
    n.setAttribute('transform', `translate(${px} ${py}) rotate(${angle})`);
    el.setAttribute('aria-valuenow', Math.round(v * 100));
    el.classList.toggle('danger', Math.abs(v) > 0.62);
    if (!character || !camera) return;
    character.root.updateWorldMatrix(true, true); camera.updateMatrixWorld();
    this.balanceHead.set(0, 0.28, 0); character.head.localToWorld(this.balanceHead).project(camera);
    this.balanceFeet.set(0, 0.04, 0); character.root.localToWorld(this.balanceFeet).project(camera);
    const w = window.innerWidth, h = window.innerHeight;
    const headY = (1 - this.balanceHead.y) * h / 2, feetY = (1 - this.balanceFeet.y) * h / 2;
    const bodyHeight = Math.max(90, feetY - headY);
    const centerX = (this.balanceFeet.x + 1) * w / 2;
    const span = vertical ? Math.min(h * 0.36, Math.max(140, bodyHeight * 0.82))
      : Math.min(w * 0.42, 300, Math.max(150, bodyHeight * 1.05));
    const width = vertical ? span * 104 / 320 : span;
    const height = vertical ? span : span * 104 / 320;
    const left = vertical ? centerX - bodyHeight * 0.43 - width : centerX - width / 2;
    const top = vertical ? headY + bodyHeight * 0.035 : headY - height + 4;
    el.style.setProperty('--balance-span', `${span}px`);
    el.style.width = `${width}px`; el.style.height = `${height}px`;
    // Clamp to the safe viewport so a ramp, wall avoidance or a narrow screen cannot hide it.
    el.style.left = `${Math.max(12, Math.min(w - width - 12, left))}px`;
    el.style.top = `${Math.max(76, Math.min(h - height - 100, top))}px`;
  }
  update(dt, score, timeLeft) {
    this.shownScore += (score - this.shownScore) * Math.min(1, dt * 6);
    if (Math.abs(score - this.shownScore) < 1) this.shownScore = score;
    this.el.score.textContent = fmt(Math.round(this.shownScore));
    const t = Math.max(0, timeLeft), m = Math.floor(t / 60), s = Math.floor(t % 60);
    this.el.timer.textContent = m + ':' + (s < 10 ? '0' : '') + s;
    this.el.timer.classList.toggle('low', t < 15);
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
