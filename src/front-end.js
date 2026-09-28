import './front-end.css';
import { LEVELS } from './levels.js';

const format = value => Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-US');
const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 12h15M12 5l7 7-7 7"/></svg>';
const ordinal = value => String(value).padStart(2, '0');
const cardId = level => level.id === 'genesee-warehouse' ? 'fe-level-genesee' : `fe-level-${level.id}`;
const levelCard = level => `<button id="${cardId(level)}" class="fe-level-card" data-level="${level.id}" type="button"><div class="fe-card-image"><img src="${level.thumbnail}" alt="" width="1000" height="560" draggable="false"/><span class="fe-card-number">${ordinal(level.order)}</span><span class="fe-card-status">READY TO SKATE</span></div><div class="fe-card-body"><span class="fe-card-location">${level.location.toUpperCase()}</span><h2>${level.title.toUpperCase()}</h2><p class="fe-card-description">${level.description}</p><div class="fe-card-bottom"><div class="fe-card-career"><span class="fe-card-career-label">YOUR GOALS <b class="fe-level-progress"${level.id === 'genesee-warehouse' ? ' id="fe-level-progress"' : ''}>0 / ${level.goalCount}</b></span><span class="fe-progress-track" aria-hidden="true">${Array.from({ length: level.goalCount }, () => '<i></i>').join('')}</span></div><span class="fe-card-enter">ENTER SPOT ${arrow}</span></div></div></button>`;

export class FrontEnd {
  constructor({ onLevels, onHome, onLevel, onControls, onSettings } = {}) {
    this.callbacks = { onLevels, onHome, onLevel, onControls, onSettings };
    this.display = null;
    this.progress = {};
    this.playableLevels = LEVELS.filter(level => level.playable);
    this.level = this.playableLevels[0];
    this.root = document.createElement('div');
    this.root.id = 'front-end';
    this.root.className = 'hidden';
    this.root.innerHTML = `<div class="fe-shell">
      <header class="fe-header"><div class="fe-mark" aria-label="J2S Pro Skater">J2S<span>PRO SKATER</span></div><nav class="fe-utility" aria-label="Game menus"><button id="fe-controls" type="button">CONTROLS</button><button id="fe-settings" type="button">SETTINGS</button></nav></header>
      <section id="fe-home" class="fe-home" aria-label="J2S Pro Skater home">
        <div class="fe-home-main"><div class="fe-home-brand"><p class="fe-overline">FIND YOUR LINE.</p><h1 class="fe-title"><span class="fe-title-main">J2S</span><span class="fe-title-sub">PRO SKATER</span></h1></div><div class="fe-home-start"><p class="fe-home-description">Your board. Your spot.<br/>Make every run count.</p><button id="fe-play" class="fe-primary" type="button"><span><b>PLAY</b><small>CHOOSE A LEVEL</small></span><span class="fe-button-arrow">${arrow}</span></button><p class="fe-play-note">Score big. Find everything. Keep rolling.</p></div></div>
        <aside class="fe-live-caption"><span class="fe-scene-line"></span><p>FIRST SPOT <span>${ordinal(this.level.order)}</span></p><h2>${this.level.title.toUpperCase().replace(' ', '<br/>')}</h2><span class="fe-location">${this.level.location.toUpperCase()}</span></aside>
      </section>
      <section id="fe-levels" class="fe-levels hidden" aria-label="Choose a level">
        <div class="fe-level-heading"><div><button id="fe-back" class="fe-back" type="button"><span aria-hidden="true">←</span> HOME</button><h1>PICK YOUR <span>SPOT.</span></h1></div><p class="fe-level-count">${ordinal(this.playableLevels.length)} <span>${this.playableLevels.length === 1 ? 'SPOT' : 'SPOTS'} TO SKATE</span></p></div>
        <div class="fe-spots">${this.playableLevels.map(levelCard).join('')}
          <aside id="fe-future-level" class="fe-future"><span class="fe-future-line" aria-hidden="true"></span><span class="fe-overline">BEYOND THE WAREHOUSE</span><h2>MORE ROOM<br/>TO ROLL.</h2><p>The next spot is<br/>still taking shape.</p><span class="fe-future-note">TO BE CONTINUED</span></aside></div>
      </section>
      <footer class="fe-footer"><div class="fe-career-label"><span class="fe-save-dot"></span><span>GENESEE CAREER<small>Saved on this device</small></span></div><div class="fe-records"><div><span>GOALS</span><b id="fe-career-goals">0 <small>/ 7</small></b></div><div><span>BEST RUN</span><b id="fe-best-score">—</b></div><div><span>BEST COMBO</span><b id="fe-best-combo">—</b></div></div><span class="fe-input-note">KEYBOARD / CONTROLLER / TOUCH</span></footer>
    </div>`;
    document.body.append(this.root);
    this.home = this.root.querySelector('#fe-home');
    this.levels = this.root.querySelector('#fe-levels');
    this.play = this.root.querySelector('#fe-play');
    this.levelButtons = new Map(this.playableLevels.map(level => [level.id, this.root.querySelector(`#${cardId(level)}`)]));
    this.levelButton = this.levelButtons.get(this.level.id);
    this.back = this.root.querySelector('#fe-back');
    this.play.addEventListener('click', () => this.callbacks.onLevels ? this.callbacks.onLevels() : this.showLevels(this.progress));
    this.back.addEventListener('click', () => this.callbacks.onHome ? this.callbacks.onHome() : this.showHome(this.progress));
    for (const [id, button] of this.levelButtons) button.addEventListener('click', () => this.callbacks.onLevel?.(id));
    this.root.querySelector('#fe-controls').addEventListener('click', () => this.callbacks.onControls?.());
    this.root.querySelector('#fe-settings').addEventListener('click', () => this.callbacks.onSettings?.());
    this.onKeyDown = event => {
      if (!this.acceptsInput) return;
      if (['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(event.code)) {
        event.preventDefault();
        this.moveFocus(event.code === 'ArrowUp' || event.code === 'ArrowLeft' ? -1 : 1);
      } else if (event.code === 'Tab') {
        // Native Tab handles the middle of the sequence; wrap only its ends so
        // keyboard users stay on visible game controls in this full-screen menu.
        const buttons = this.buttons();
        const index = buttons.indexOf(document.activeElement);
        if ((!event.shiftKey && index === buttons.length - 1) || (event.shiftKey && index === 0)) {
          event.preventDefault(); this.moveFocus(event.shiftKey ? -1 : 1);
        }
      }
    };
    window.addEventListener('keydown', this.onKeyDown);
  }

  get isOpen() { return this.display !== null && !this.root.classList.contains('hidden'); }
  get acceptsInput() {
    return this.isOpen && !this.root.inert && ['settings-panel', 'controls-panel'].every(id => document.getElementById(id)?.classList.contains('hidden') !== false);
  }
  buttons() { return [...this.root.querySelectorAll('button')].filter(button => !button.disabled && !button.hidden && !button.closest('.hidden')); }
  moveFocus(direction) {
    const buttons = this.buttons();
    if (!buttons.length) return;
    const current = buttons.indexOf(document.activeElement);
    const next = current < 0 ? 0 : (current + direction + buttons.length) % buttons.length;
    buttons[next].focus({ preventScroll: false });
  }
  updateMenuInput(input) {
    if (!this.acceptsInput) return;
    if (input.menuCancel) {
      if (this.display === 'levels') this.back.click();
      return;
    }
    if (input.startPressed) { (this.display === 'home' ? this.play : this.levelButton).click(); return; }
    if (input.menuMove) this.moveFocus(input.menuMove);
    if (input.menuConfirm) {
      const focused = document.activeElement;
      if (this.buttons().includes(focused)) focused.click();
      else (this.display === 'home' ? this.play : this.levelButton).click();
    }
  }
  renderProgress(progress = {}) {
    this.progress = progress;
    const count = Math.min(this.level.goalCount, new Set(progress.completed || []).size);
    this.root.querySelector('#fe-career-goals').innerHTML = `${count} <small>/ ${this.level.goalCount}</small>`;
    this.root.querySelector('#fe-best-score').textContent = progress.bestScore ? format(progress.bestScore) : '—';
    this.root.querySelector('#fe-best-combo').textContent = progress.bestCombo ? format(progress.bestCombo) : '—';
    for (const level of this.playableLevels) {
      const saved = level.id === this.level.id ? progress : progress.levels?.[level.id] || {};
      const earned = Math.min(level.goalCount, new Set(saved.completed || []).size);
      const card = this.levelButtons.get(level.id);
      card.querySelector('.fe-level-progress').textContent = `${earned} / ${level.goalCount}`;
      card.querySelector('.fe-card-status').textContent = earned === level.goalCount ? 'SPOT CLEARED' : earned ? 'KEEP IT GOING' : 'READY TO SKATE';
      [...card.querySelectorAll('.fe-progress-track i')].forEach((segment, index) => segment.classList.toggle('complete', index < earned));
      card.setAttribute('aria-label', `${level.title}, level ${level.order}, ${level.location}. ${earned} of ${level.goalCount} goals complete. Enter spot.`);
    }
  }
  showHome(progress) { this.show('home', progress); }
  showLevels(progress) { this.show('levels', progress); }
  show(screen, progress = this.progress) {
    this.renderProgress(progress);
    this.display = screen;
    this.root.dataset.screen = screen;
    this.root.classList.remove('hidden');
    this.home.classList.toggle('hidden', screen !== 'home');
    this.levels.classList.toggle('hidden', screen !== 'levels');
    this.root.scrollTop = 0;
    (screen === 'home' ? this.play : this.levelButton).focus({ preventScroll: true });
  }
  hide() {
    this.display = null;
    this.root.classList.add('hidden');
    if (this.root.contains(document.activeElement)) document.activeElement.blur();
  }
  dispose() { this.hide(); window.removeEventListener('keydown', this.onKeyDown); this.root.remove(); }
}
