import './front-end.css';
import { LEVELS } from './levels.js';
import { CHARACTERS, DEFAULT_CHARACTER_ID, getCharacter } from './characters.js';

const format = value => Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-US');
const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 12h15M12 5l7 7-7 7"/></svg>';
const ordinal = value => String(value).padStart(2, '0');
const cardId = level => level.id === 'genesee-warehouse' ? 'fe-level-genesee' : `fe-level-${level.id}`;
const levelCard = level => `<button id="${cardId(level)}" class="fe-level-card" data-level="${level.id}" type="button"><div class="fe-card-image"><img src="${level.thumbnail}" alt="" width="1000" height="560" draggable="false"/><span class="fe-card-number">${ordinal(level.order)}</span><span class="fe-card-status">READY TO SKATE</span></div><div class="fe-card-body"><span class="fe-card-location">${level.location.toUpperCase()}</span><h2>${level.title.toUpperCase()}</h2><p class="fe-card-description">${level.description}</p><div class="fe-card-bottom"><div class="fe-card-career"><span class="fe-card-career-label">YOUR GOALS <b class="fe-level-progress"${level.id === 'genesee-warehouse' ? ' id="fe-level-progress"' : ''}>0 / ${level.goalCount}</b></span><span class="fe-progress-track" aria-hidden="true">${Array.from({ length: level.goalCount }, () => '<i></i>').join('')}</span></div><span class="fe-card-enter">ENTER SPOT ${arrow}</span></div></div></button>`;
const characterCard = character => `<button id="fe-character-${character.id}" class="fe-character-card" data-character="${character.id}" type="button" aria-pressed="false" style="--character-accent:${character.accent}"><span class="fe-character-portrait"><span class="fe-character-number" aria-hidden="true">${ordinal(character.order)}</span><span class="fe-character-monogram" aria-hidden="true">${character.name.slice(0, 1).toUpperCase()}</span><img src="${character.portrait}" alt="" width="800" height="1000" draggable="false"/><span class="fe-character-choice" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="m4 10 4 4 8-8"/></svg></span></span><span class="fe-character-card-copy"><span class="fe-character-affiliation">${character.affiliation}</span><span class="fe-character-card-name">${character.name.split(' ')[0].toUpperCase()}</span>${character.placeholder ? '<span class="fe-character-wip">WORK IN PROGRESS</span>' : '<span class="fe-character-homegrown">THE ORIGINAL</span>'}</span></button>`;

export class FrontEnd {
  constructor({ onLevels, onHome, onLevel, onControls, onSettings, onCharacters, onCharacter, onCharacterBack } = {}) {
    this.callbacks = { onLevels, onHome, onLevel, onControls, onSettings, onCharacters, onCharacter, onCharacterBack };
    this.display = null;
    this.progress = {};
    this.playableLevels = LEVELS.filter(level => level.playable);
    this.level = this.playableLevels[0];
    this.activeLevelId = this.level.id;
    this.selectedCharacterId = DEFAULT_CHARACTER_ID;
    this.draftCharacterId = DEFAULT_CHARACTER_ID;
    this.characterReturnScreen = 'home';
    this.root = document.createElement('div');
    this.root.id = 'front-end';
    this.root.className = 'hidden';
    this.root.innerHTML = `<div class="fe-shell">
      <header class="fe-header"><div class="fe-mark" aria-label="J2S Pro Skater">J2S<span>PRO SKATER</span></div><nav class="fe-utility" aria-label="Game menus"><button id="fe-controls" type="button">CONTROLS</button><button id="fe-settings" type="button">SETTINGS</button></nav></header>
      <section id="fe-home" class="fe-home" aria-label="J2S Pro Skater home">
        <div class="fe-home-main"><div class="fe-home-brand"><p class="fe-overline">FIND YOUR LINE.</p><h1 class="fe-title"><span class="fe-title-main">J2S</span><span class="fe-title-sub">PRO SKATER</span></h1></div><div class="fe-home-start"><p class="fe-home-description">Your board. Your spot.<br/>Make every run count.</p><button id="fe-play" class="fe-primary" type="button"><span><b>PLAY</b><small>CHOOSE A LEVEL</small></span><span class="fe-button-arrow">${arrow}</span></button><button id="fe-skater" class="fe-skater-link" type="button"><span>SKATER <b class="fe-selected-character">JOE</b></span><span class="fe-change-label">CHANGE ${arrow}</span></button><p class="fe-play-note">Score big. Find everything. Keep rolling.</p></div></div>
        <aside class="fe-live-caption"><span class="fe-scene-line"></span><p>YOUR SPOT <span>${ordinal(this.level.order)}</span></p><h2>${this.level.title.toUpperCase().replace(' ', '<br/>')}</h2><span class="fe-location">${this.level.location.toUpperCase()}</span></aside>
      </section>
      <section id="fe-levels" class="fe-levels hidden" aria-label="Choose a level">
        <div class="fe-level-heading"><div><button id="fe-back" class="fe-back" type="button"><span aria-hidden="true">←</span> HOME</button><h1>PICK YOUR <span>SPOT.</span></h1></div><div class="fe-level-tools"><button id="fe-level-skater" class="fe-skater-link" type="button"><span>SKATER <b class="fe-selected-character">JOE</b></span><span class="fe-change-label">CHANGE ${arrow}</span></button><p class="fe-level-count">${ordinal(this.playableLevels.length)} <span>${this.playableLevels.length === 1 ? 'SPOT' : 'SPOTS'} TO SKATE</span></p></div></div>
        <div class="fe-spots">${this.playableLevels.map(levelCard).join('')}
          <aside id="fe-future-level" class="fe-future"><span class="fe-future-line" aria-hidden="true"></span><span class="fe-overline">KEEP EXPLORING</span><h2>MORE ROOM<br/>TO ROLL.</h2><p>The next spot is<br/>still taking shape.</p><span class="fe-future-note">TO BE CONTINUED</span></aside></div>
      </section>
      <section id="fe-characters" class="fe-characters hidden" aria-label="Choose a skater">
        <div class="fe-character-heading"><div><button id="fe-character-back" class="fe-back" type="button"><span aria-hidden="true">←</span> BACK</button><h1>PICK YOUR <span>SKATER.</span></h1></div><p class="fe-character-heading-note">SAME PARKS.<br/>YOUR STYLE.</p></div>
        <div class="fe-character-roster" role="group" aria-label="Skater roster">${CHARACTERS.map(characterCard).join('')}</div>
        <div class="fe-character-bottom"><div class="fe-character-detail"><p><span id="fe-character-name">JOE</span><span id="fe-character-affiliation"></span></p><p id="fe-character-description"></p></div><button id="fe-character-confirm" class="fe-primary" type="button"><span><b>SELECT SKATER</b><small>JOE · J2S</small></span><span class="fe-button-arrow">${arrow}</span></button></div>
        <p class="fe-character-save-note">Your skater is saved on this device. Your level progress stays with you.</p>
      </section>
      <footer class="fe-footer"><div class="fe-career-label"><span class="fe-save-dot"></span><span><b id="fe-career-name">GENESEE CAREER</b><small>Saved on this device</small></span></div><div class="fe-records"><div><span>GOALS</span><b id="fe-career-goals">0 <small>/ 7</small></b></div><div><span>BEST RUN</span><b id="fe-best-score">—</b></div><div><span>BEST COMBO</span><b id="fe-best-combo">—</b></div></div><span class="fe-input-note">KEYBOARD / CONTROLLER / TOUCH</span></footer>
    </div>`;
    document.body.append(this.root);
    this.home = this.root.querySelector('#fe-home');
    this.levels = this.root.querySelector('#fe-levels');
    this.characters = this.root.querySelector('#fe-characters');
    this.play = this.root.querySelector('#fe-play');
    this.levelButtons = new Map(this.playableLevels.map(level => [level.id, this.root.querySelector(`#${cardId(level)}`)]));
    this.levelButton = this.levelButtons.get(this.level.id);
    this.back = this.root.querySelector('#fe-back');
    this.characterButtons = new Map(CHARACTERS.map(character => [character.id, this.root.querySelector(`#fe-character-${character.id}`)]));
    this.characterConfirm = this.root.querySelector('#fe-character-confirm');
    this.characterBack = this.root.querySelector('#fe-character-back');
    this.play.addEventListener('click', () => this.callbacks.onLevels ? this.callbacks.onLevels() : this.showLevels(this.progress));
    this.back.addEventListener('click', () => this.callbacks.onHome ? this.callbacks.onHome() : this.showHome(this.progress));
    for (const [id, button] of this.levelButtons) button.addEventListener('click', () => this.callbacks.onLevel?.(id));
    this.root.querySelector('#fe-controls').addEventListener('click', () => this.callbacks.onControls?.());
    this.root.querySelector('#fe-settings').addEventListener('click', () => this.callbacks.onSettings?.());
    const openCharacters = () => this.callbacks.onCharacters ? this.callbacks.onCharacters() : this.showCharacters(this.progress, this.activeLevelId, this.selectedCharacterId, this.display);
    this.root.querySelector('#fe-skater').addEventListener('click', openCharacters);
    this.root.querySelector('#fe-level-skater').addEventListener('click', openCharacters);
    for (const [id, button] of this.characterButtons) {
      button.addEventListener('click', () => this.previewCharacter(id));
      const portrait = button.querySelector('img');
      portrait.addEventListener('load', () => button.classList.add('portrait-loaded'));
      portrait.addEventListener('error', () => { portrait.hidden = true; });
      if (portrait.complete && portrait.naturalWidth) button.classList.add('portrait-loaded');
    }
    this.characterConfirm.addEventListener('click', () => {
      if (this.callbacks.onCharacter) this.callbacks.onCharacter(this.draftCharacterId);
      else { this.setCharacter(this.draftCharacterId); this.show(this.characterReturnScreen); }
    });
    this.characterBack.addEventListener('click', () => this.callbacks.onCharacterBack ? this.callbacks.onCharacterBack() : this.show(this.characterReturnScreen));
    this.setCharacter(DEFAULT_CHARACTER_ID);
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
      else if (this.display === 'characters') this.characterBack.click();
      return;
    }
    if (input.startPressed) {
      const focused = document.activeElement;
      if (this.display === 'characters') {
        const focusedId = [...this.characterButtons].find(([, button]) => button === focused)?.[0];
        if (focusedId) this.previewCharacter(focusedId);
        this.characterConfirm.click(); return;
      }
      const selectedCard = [...this.levelButtons.values()].includes(focused) ? focused : this.levelButton;
      (this.display === 'home' ? this.play : selectedCard).click(); return;
    }
    if (input.menuMove) this.moveFocus(input.menuMove);
    if (input.menuConfirm) {
      const focused = document.activeElement;
      if (this.buttons().includes(focused)) focused.click();
      else (this.display === 'home' ? this.play : this.display === 'characters' ? this.characterConfirm : this.levelButton).click();
    }
  }
  setCharacter(id) {
    const character = getCharacter(id) || getCharacter(DEFAULT_CHARACTER_ID);
    this.selectedCharacterId = character.id;
    for (const label of this.root.querySelectorAll('.fe-selected-character')) label.textContent = character.name.split(' ')[0].toUpperCase();
    for (const button of [this.root.querySelector('#fe-skater'), this.root.querySelector('#fe-level-skater')]) button.setAttribute('aria-label', `Skater: ${character.name}. Change skater.`);
    this.previewCharacter(character.id);
  }
  previewCharacter(id) {
    const character = getCharacter(id) || getCharacter(DEFAULT_CHARACTER_ID);
    this.draftCharacterId = character.id;
    for (const [cardId, button] of this.characterButtons) {
      const selected = cardId === character.id;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
      const cardCharacter = getCharacter(cardId);
      button.setAttribute('aria-label', `${cardCharacter.name}, ${cardCharacter.affiliation}${cardCharacter.placeholder ? ', work in progress' : ''}. Preview skater.`);
    }
    this.root.querySelector('#fe-character-name').textContent = character.name.toUpperCase();
    this.root.querySelector('#fe-character-affiliation').textContent = character.affiliation;
    this.root.querySelector('#fe-character-description').textContent = character.description;
    this.characterConfirm.querySelector('small').textContent = `${character.name.toUpperCase()} · ${character.affiliation.toUpperCase()}`;
    this.characterConfirm.setAttribute('aria-label', `Select ${character.name} and return to ${this.characterReturnScreen === 'levels' ? 'level selection' : 'home'}`);
  }
  renderProgress(progress = {}) {
    this.progress = progress;
    const byLevel = Array.isArray(progress.completed) ? { [this.activeLevelId]: progress } : progress;
    const current = byLevel[this.activeLevelId] || {};
    const count = Math.min(this.level.goalCount, new Set(current.completed || []).size);
    this.root.querySelector('#fe-career-name').textContent = `${this.level.title.toUpperCase()} CAREER`;
    this.root.querySelector('#fe-career-goals').innerHTML = `${count} <small>/ ${this.level.goalCount}</small>`;
    this.root.querySelector('#fe-best-score').textContent = current.bestScore ? format(current.bestScore) : '—';
    this.root.querySelector('#fe-best-combo').textContent = current.bestCombo ? format(current.bestCombo) : '—';
    const caption = this.root.querySelector('.fe-live-caption');
    caption.querySelector('p span').textContent = ordinal(this.level.order);
    caption.querySelector('h2').innerHTML = this.level.titleLines.join('<br/>');
    caption.querySelector('.fe-location').textContent = this.level.location.toUpperCase();
    for (const level of this.playableLevels) {
      const saved = byLevel[level.id] || {};
      const earned = Math.min(level.goalCount, new Set(saved.completed || []).size);
      const card = this.levelButtons.get(level.id);
      card.classList.toggle('current', level.id === this.activeLevelId);
      card.querySelector('.fe-level-progress').textContent = `${earned} / ${level.goalCount}`;
      card.querySelector('.fe-card-status').textContent = earned === level.goalCount ? 'SPOT CLEARED' : earned ? 'KEEP IT GOING' : 'READY TO SKATE';
      [...card.querySelectorAll('.fe-progress-track i')].forEach((segment, index) => segment.classList.toggle('complete', index < earned));
      card.setAttribute('aria-label', `${level.title}, level ${level.order}, ${level.location}. ${earned} of ${level.goalCount} goals complete. Enter spot.`);
    }
  }
  showHome(progress, activeLevelId) { this.show('home', progress, activeLevelId); }
  showLevels(progress, activeLevelId) { this.show('levels', progress, activeLevelId); }
  showCharacters(progress, activeLevelId, selectedCharacterId = this.selectedCharacterId, returnScreen = 'home') {
    this.characterReturnScreen = returnScreen === 'levels' ? 'levels' : 'home';
    this.setCharacter(selectedCharacterId);
    this.show('characters', progress, activeLevelId);
  }
  show(screen, progress = this.progress, activeLevelId = this.activeLevelId) {
    this.level = this.playableLevels.find(level => level.id === activeLevelId) || this.playableLevels[0];
    this.activeLevelId = this.level.id;
    this.levelButton = this.levelButtons.get(this.level.id);
    this.renderProgress(progress);
    this.display = screen;
    this.root.dataset.screen = screen;
    this.root.classList.remove('hidden');
    this.home.classList.toggle('hidden', screen !== 'home');
    this.levels.classList.toggle('hidden', screen !== 'levels');
    this.characters.classList.toggle('hidden', screen !== 'characters');
    this.root.scrollTop = 0;
    const focus = screen === 'home' ? this.play : screen === 'characters' ? this.characterButtons.get(this.draftCharacterId) : this.levelButton;
    focus.focus({ preventScroll: true });
    if (screen === 'levels') this.levelButton.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  hide() {
    this.display = null;
    this.root.classList.add('hidden');
    if (this.root.contains(document.activeElement)) document.activeElement.blur();
  }
  dispose() { this.hide(); window.removeEventListener('keydown', this.onKeyDown); this.root.remove(); }
}
