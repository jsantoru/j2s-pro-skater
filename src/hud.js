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
      scoreToBeat: $('score-to-beat'), highScores: $('high-scores'),
      trick: $('trick-text'), landed: $('landed-text'), toast: $('toast'), controls: $('controls-panel'),
      overlay: $('overlay'), overlayMsg: $('overlay-msg'), finalScore: $('final-score'),
      bottom: $('bottom'), balance: $('balance'), balanceNeedle: $('balance-needle'),
      settings: $('settings-panel'), startBtn: $('start-btn'), settingsTitle: $('settings-title'),
      resume: $('resume-run'), restart: $('restart-run'), board: $('goals-menu'), menuStatus: $('menu-status'),
      levels: $('settings-levels'), home: $('settings-home'), menuLocation: $('settings-location'),
      musicToggle: $('music-toggle'), musicState: document.querySelector('#music-toggle .switch-state'),
    };
    this.onMusicToggle = null; // main wires this to the persisted setting + the audio bus
    this.onPauseChange = null; this.onRestart = null;
    this.bindSettings();
    this.shownScore = 0; this.holdTimer = 0; this.toastTimer = 0;
    this.shownBest = -1; this.shownRecord = null;
    this.balanceShown = false; this.balanceVertical = undefined;
    this.balanceHead = new THREE.Vector3(); this.balanceFeet = new THREE.Vector3();
  }
  // One pause/settings dialog for mouse, keyboard and controller.
  bindSettings() {
    this.bindSecondaryTouchMenus();
    const { settings, startBtn, resume, restart, musicToggle } = this.el;
    startBtn.addEventListener('click', () => this.toggleSettings());
    resume.addEventListener('click', () => this.toggleSettings(false));
    restart.addEventListener('click', () => this.onRestart?.());
    this.el.board.addEventListener('click', () => this.onBoard?.());
    this.el.levels.addEventListener('click', () => this.onLevels?.());
    this.el.home.addEventListener('click', () => this.onHome?.());
    musicToggle.addEventListener('click', () => this.onMusicToggle?.());
    $('controls-close').addEventListener('click', () => this.toggleControls(false));
    settings.addEventListener('click', (e) => { if (e.target === settings) this.toggleSettings(false); });
    window.addEventListener('keydown', (e) => {
      // A held Enter must not activate the newly focused button on the next
      // screen. Each menu transition requires a fresh press.
      if (e.repeat && ['Enter', 'Space'].includes(e.code) && e.target?.closest?.('button, summary')) {
        e.preventDefault(); return;
      }
      if (!this.settingsOpen) return;
      if (e.code === 'Escape') e.preventDefault();
      if (['Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) {
        e.preventDefault();
        this.moveMenuFocus(e.code === 'ArrowUp' || (e.code === 'Tab' && e.shiftKey) ? -1 : 1);
      }
    });
  }
  bindSecondaryTouchMenus() {
    // A held gameplay thumb is the primary pointer. Browsers may omit the
    // compatibility click when another finger taps Pause or a menu action.
    const touches = new Map();
    let activated = null;
    const target = event => event.target.closest?.('button, summary');
    document.addEventListener('pointerdown', event => {
      activated = null;
      if (event.pointerType !== 'touch' || event.isPrimary) return;
      const button = target(event);
      if (!button || button.disabled || button.closest('#touch-controls, [inert]')) return;
      touches.set(event.pointerId, { button, x: event.clientX, y: event.clientY });
    });
    document.addEventListener('pointerup', event => {
      const touch = touches.get(event.pointerId);
      touches.delete(event.pointerId);
      if (!touch || target(event) !== touch.button || touch.button.disabled || touch.button.closest('[inert]')) return;
      if (Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > 12) return;
      event.preventDefault();
      activated = touch.button;
      touch.button.click();
    }, { passive: false });
    document.addEventListener('click', event => {
      // Some engines also emit a trusted click. Keyboard activation (detail=0)
      // and the explicit click above remain native; a fresh pointerdown resets it.
      if (event.isTrusted && event.detail > 0 && target(event) === activated) {
        activated = null; event.preventDefault(); event.stopImmediatePropagation();
      }
    }, true);
    document.addEventListener('pointercancel', event => touches.delete(event.pointerId));
    window.addEventListener('blur', () => { touches.clear(); activated = null; });
  }
  menuButtons() { return [...this.el.settings.querySelectorAll('button')].filter(b => !b.hidden && !b.disabled); }
  moveMenuFocus(direction) {
    const buttons = this.menuButtons(), i = buttons.indexOf(document.activeElement);
    buttons[(i + direction + buttons.length) % buttons.length].focus();
  }
  updateMenuInput(inp) {
    if (inp.startPressed || inp.pausePressed || inp.menuCancel) this.toggleSettings(false);
    else {
      if (inp.menuMove) this.moveMenuFocus(inp.menuMove);
      if (inp.menuConfirm && this.menuButtons().includes(document.activeElement)) document.activeElement.click();
    }
  }
  setMode(mode) {
    this.mode = mode;
    this.el.startBtn.innerHTML = mode === 'playing' ? 'Ⅱ PAUSE <span>START / ESC</span>' : 'SETTINGS';
  }
  get settingsOpen() { return this.el.settings && !this.el.settings.classList.contains('hidden'); }
  syncModalInert() {
    const modal = this.settingsOpen || this.controlsOpen;
    for (const el of [this.el.overlay, $('front-end'), this.el.startBtn]) if (el) el.inert = modal;
    this.el.controls.inert = this.settingsOpen;
  }
  restoreFocus(target) {
    if (this.mode !== 'playing' && target?.isConnected && target !== document.body
      && !target.closest('.hidden, [hidden], [inert]') && target.getClientRects().length) {
      target.focus({ preventScroll: true });
    }
  }
  toggleSettings(force) {
    const open = force === undefined ? !this.settingsOpen : !!force;
    if (open === this.settingsOpen) return open;
    if (open) {
      this.returnFocus = document.activeElement;
      const playing = this.mode === 'playing';
      this.el.settingsTitle.textContent = playing ? 'SESSION PAUSED' : 'SETTINGS';
      this.el.resume.textContent = playing ? 'RESUME SESSION' : 'BACK TO MENU';
      this.el.restart.hidden = !playing;
      this.el.board.hidden = !playing;
      this.el.levels.hidden = ['home', 'levels', 'characters'].includes(this.mode);
      this.el.home.hidden = this.mode === 'home';
      this.el.menuLocation.innerHTML = ['home', 'levels', 'characters'].includes(this.mode)
        ? 'J2S PRO SKATER <span>GAME SETTINGS</span>' : 'GENESEE WAREHOUSE <span>LEVEL / 01</span>';
      this.el.menuStatus.textContent = playing ? 'Your run is on hold. Pick up where you left off.' : 'Set the soundtrack before you drop in.';
    }
    this.el.settings.classList.toggle('hidden', !open);
    this.el.startBtn.setAttribute('aria-expanded', String(open));
    this.syncModalInert();
    this.onPauseChange?.(open);
    if (open) this.el.resume.focus();
    else {
      document.activeElement?.blur();
      this.restoreFocus(this.returnFocus);
    }
    return open;
  }
  // Reflects the live setting; the switch itself never decides, it only shows.
  musicSetting(on) {
    this.el.musicToggle.classList.toggle('on', on);
    this.el.musicToggle.setAttribute('aria-checked', String(!!on));
    this.el.musicState.textContent = on ? 'ON' : 'OFF';
  }
  setPad(connected, id) {
    this.el.pad.textContent = connected ? '🎮 ' + (id || 'GAMEPAD').replace(/\(.*\)/, '').trim().slice(0, 28).toUpperCase() : '⌨ KEYBOARD (no gamepad)';
    this.el.pad.classList.toggle('connected', connected);
  }
  toast(msg) { this.el.toast.textContent = msg; this.el.toast.classList.add('show'); this.toastTimer = 2.6; }
  toggleControls(force) {
    const open = force === undefined ? !this.controlsOpen : !!force;
    if (open === this.controlsOpen) return;
    if (open) this.controlsReturnFocus = document.activeElement;
    this.el.controls.classList.toggle('hidden', !open);
    this.syncModalInert();
    this.onControlsChange?.(open);
    if (open) $('controls-close').focus({ preventScroll: true });
    else {
      document.activeElement?.blur();
      this.restoreFocus(this.controlsReturnFocus);
    }
  }
  get controlsOpen() { return !this.el.controls.classList.contains('hidden'); }
  overlay(show, msg, score) {
    this.el.overlay.classList.toggle('hidden', !show);
    if (msg) this.el.overlayMsg.textContent = msg;
    this.el.finalScore.textContent = score !== undefined ? 'FINAL SCORE  ' + fmt(score) : '';
  }
  // The target for this run, tucked under the score in small type. Once it is passed the line
  // flips to a record banner so you know the rest of the run is pure gravy.
  scoreToBeat(best, score) {
    const record = best > 0 && score > best;
    if (best === this.shownBest && record === this.shownRecord) return;
    this.shownBest = best; this.shownRecord = record;
    const el = this.el.scoreToBeat;
    if (!best) el.textContent = 'NO HIGH SCORE YET';
    else if (record) el.textContent = '\u2605 NEW RECORD \u00b7 BEAT ' + fmt(best);
    else el.textContent = 'SCORE TO BEAT  ' + fmt(best);
    el.classList.toggle('record', record);
  }
  // Best runs from localStorage, shown on the title and end-of-run overlay. `rank` is the 1-based
  // place the run that just finished took, or 0 when it did not make the table.
  highScores(list, rank) {
    const el = this.el.highScores;
    if (!list || !list.length) { el.textContent = ''; return; }
    el.textContent = '';
    const title = document.createElement('div');
    title.className = 'hs-title';
    title.textContent = rank === 1 ? 'NEW HIGH SCORE!' : 'BEST RUNS';
    el.appendChild(title);
    list.forEach((entry, i) => {
      const row = document.createElement('div');
      row.className = 'hs-row' + (i + 1 === rank ? ' you' : '');
      for (const [cls, text] of [['hs-rank', String(i + 1)], ['hs-score', fmt(entry.score)], ['hs-date', entry.date || '']]) {
        const span = document.createElement('span');
        span.className = cls; span.textContent = text;
        row.appendChild(span);
      }
      el.appendChild(row);
    });
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
  update(dt, score, timeLeft, best) {
    this.scoreToBeat(best || 0, score);
    this.shownScore += (score - this.shownScore) * Math.min(1, dt * 6);
    if (Math.abs(score - this.shownScore) < 1) this.shownScore = score;
    this.el.score.textContent = fmt(Math.round(this.shownScore));
    const t = Math.max(0, timeLeft), seconds = Math.ceil(t), m = Math.floor(seconds / 60), s = seconds % 60;
    this.el.timer.textContent = Number.isFinite(t) ? m + ':' + (s < 10 ? '0' : '') + s : '∞';
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
