// The warehouse goal board, run focus, and results. Gameplay owns progression;
// this view renders snapshots and sends explicit launch/navigation callbacks.
const $ = (id) => document.getElementById(id);
const fmt = (value) => Math.round(Number(value) || 0).toLocaleString('en-US');
const TIPS = {
  'high-score': 'Start with a ramp. Hold Ollie to crouch, release to jump, then add a flip or grab.',
  'pro-score': 'Mix flips and grabs with grinds. Link landings with manuals to grow your multiplier.',
  'sick-score': 'Build a line across the warehouse. Variety, spins, and switch landings make every trick count.',
  combo: 'Link tricks with grinds and manuals. The goal counts only when you land the whole combo.',
  skate: 'Follow the amber letters through the warehouse. Collect all five in a single run, in any order.',
  caps: 'Look for teal bottle caps around the warehouse. Sweep the park and collect all five in one run.',
  tape: 'Take the bank to the raised loading deck. Look for the pink tape above the platform.',
};
const ICONS = {
  score: '<path d="m24 4 5.9 12 13.2 1.9-9.6 9.4 2.3 13.2L24 34.3l-11.8 6.2 2.3-13.2-9.6-9.4L18.1 16Z"/>',
  combo: '<path d="M28 4 10 27h13l-3 17 18-25H25Z"/>',
  skate: '<rect x="7" y="6" width="34" height="36" rx="3"/><path d="M30 15H20a5 5 0 0 0 0 10h8a5 5 0 0 1 0 10H17"/>',
  caps: '<path d="m24 4 5 4 6-1 2 6 6 3-2 6 3 5-5 4-1 7-7 1-7 5-5-4-6 1-2-6-6-3 2-6-3-5 5-4 1-7 7-1Z"/><circle cx="24" cy="24" r="10"/><path d="m19 24 3 3 7-7"/>',
  tape: '<rect x="4" y="10" width="40" height="29" rx="3"/><rect x="10" y="15" width="28" height="13" rx="5"/><circle cx="16" cy="21.5" r="2.5"/><circle cx="32" cy="21.5" r="2.5"/><path d="m14 39 3-7h14l3 7"/>',
};
const icon = (goal) => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[goal.type] || ICONS[goal.id] || ICONS.score}</svg>`;
const category = (goal) => goal.type === 'score' ? 'SCORE CHALLENGE' : goal.type === 'combo' ? 'COMBO CHALLENGE' : 'WAREHOUSE COLLECTIBLE';
const targetLabel = (goal) => goal.type === 'score' || goal.type === 'combo' ? fmt(goal.target) : goal.id === 'skate' ? 'S K A T E' : goal.id === 'caps' ? '5 CAPS' : 'SECRET TAPE';

export class LevelUI {
  constructor(goals, { onStart, onBoard } = {}) {
    this.goals = goals;
    this.onStart = onStart;
    this.onBoard = onBoard;
    this.selectedGoal = goals[0]?.id || 'high-score';
    this.progress = { completed: [], bestScore: 0, bestCombo: 0 };
    this.display = null;
    this.lastMode = 'goals';
    this.noticeQueue = [];
    this.noticeRemaining = 0;
    this.goalButtons = new Map();
    this.lastTrackerKey = '';

    for (const [index, goal] of goals.entries()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'goal-row';
      button.dataset.goal = goal.id;
      button.innerHTML = `<span class="goal-order">${String(index + 1).padStart(2, '0')}</span><span class="goal-icon">${icon(goal)}</span><span class="goal-name"></span><span class="goal-target"></span><span class="goal-check" aria-hidden="true"></span>`;
      button.querySelector('.goal-name').textContent = goal.title;
      button.querySelector('.goal-target').textContent = targetLabel(goal);
      button.addEventListener('click', () => this.selectGoal(goal.id));
      $('goal-list').append(button);
      this.goalButtons.set(goal.id, button);
    }
    $('overlay-msg').addEventListener('click', () => this.launch('goals'));
    $('free-skate').addEventListener('click', () => this.launch('free'));
    $('retry-run').addEventListener('click', () => this.launch(this.lastMode));
    $('results-board').addEventListener('click', () => {
      if (this.onBoard) this.onBoard();
      else this.showBoard(this.progress);
    });
    window.addEventListener('keydown', (event) => {
      if (!this.acceptsInput) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
        event.preventDefault();
        this.moveFocus(event.code === 'ArrowUp' || event.code === 'ArrowLeft' ? -1 : 1);
      }
    });
  }

  get isOpen() { return this.display !== null && !$('overlay').classList.contains('hidden'); }
  get acceptsInput() {
    return this.isOpen && $('settings-panel').classList.contains('hidden') && $('controls-panel').classList.contains('hidden');
  }
  buttons() {
    return [...$('overlay').querySelectorAll('button, summary')].filter(button => !button.disabled && !button.hidden && !button.closest('.hidden'));
  }
  moveFocus(direction) {
    const buttons = this.buttons();
    if (!buttons.length) return;
    const current = buttons.indexOf(document.activeElement);
    const next = current < 0 ? (direction > 0 ? 0 : buttons.length - 1) : (current + direction + buttons.length) % buttons.length;
    buttons[next].focus();
  }
  updateMenuInput(input) {
    if (!this.acceptsInput) return;
    if (input.menuMove) this.moveFocus(input.menuMove);
    if (input.menuConfirm) {
      const buttons = this.buttons();
      if (buttons.includes(document.activeElement)) document.activeElement.click();
      else $(this.display === 'results' ? 'retry-run' : 'overlay-msg').click();
    } else if (input.startPressed) {
      $(this.display === 'results' ? 'retry-run' : 'overlay-msg').click();
    } else if (input.menuCancel && this.display === 'results') {
      $('results-board').click();
    }
  }
  launch(mode) {
    this.lastMode = mode;
    this.onStart?.(mode, this.selectedGoal);
  }
  hide() {
    this.display = null;
    $('overlay').classList.add('hidden');
    this.clearNotifications();
    document.activeElement?.blur();
  }
  showBoard(progress = this.progress) {
    this.progress = progress;
    this.display = 'board';
    this.clearNotifications();
    $('overlay').classList.remove('hidden');
    $('goal-board').classList.remove('hidden');
    $('run-results').classList.add('hidden');
    $('level-eyebrow').textContent = progress.completed?.length === this.goals.length ? 'THE WAREHOUSE IS YOURS.' : 'CLOCK IN. DROP IN.';
    $('level-title').innerHTML = 'GENESEE <span>WAREHOUSE</span>';
    this.renderProgress(progress);
    this.selectGoal(this.selectedGoal);
    $('overlay-msg').focus({ preventScroll: true });
  }
  renderProgress(progress) {
    const completed = new Set(progress.completed || []);
    $('board-completed').innerHTML = `${completed.size}<span>/ ${this.goals.length}</span>`;
    $('board-completion-fill').style.width = `${completed.size / this.goals.length * 100}%`;
    $('board-best-score').textContent = progress.bestScore ? fmt(progress.bestScore) : '—';
    $('board-best-combo').textContent = progress.bestCombo ? fmt(progress.bestCombo) : '—';
    for (const goal of this.goals) {
      const button = this.goalButtons.get(goal.id);
      button.classList.toggle('complete', completed.has(goal.id));
      button.querySelector('.goal-check').textContent = completed.has(goal.id) ? '✓' : '↗';
      button.setAttribute('aria-label', `${goal.title}, ${targetLabel(goal)}, ${completed.has(goal.id) ? 'completed' : 'not completed'}`);
    }
  }
  selectGoal(id) {
    const goal = this.goals.find(entry => entry.id === id) || this.goals[0];
    if (!goal) return;
    this.selectedGoal = goal.id;
    for (const [goalId, button] of this.goalButtons) {
      button.classList.toggle('selected', goalId === goal.id);
      button.setAttribute('aria-pressed', String(goalId === goal.id));
    }
    $('mission-category').textContent = category(goal);
    const complete = (this.progress.completed || []).includes(goal.id);
    $('mission-status').textContent = complete ? '✓ COMPLETED' : 'TO DO';
    $('mission-status').classList.toggle('done', complete);
    $('mission-icon').innerHTML = icon(goal);
    $('mission-title').textContent = goal.title;
    $('mission-target').textContent = goal.type === 'score' || goal.type === 'combo' ? fmt(goal.target) : goal.id === 'skate' ? 'S K A T E' : goal.id === 'caps' ? '05' : '01';
    const unit = document.createElement('span');
    unit.textContent = goal.type === 'score' ? 'POINTS' : goal.type === 'combo' ? 'SINGLE COMBO' : goal.id === 'skate' ? 'FIVE LETTERS' : goal.id === 'caps' ? 'BOTTLE CAPS' : 'HIDDEN TAPE';
    $('mission-target').append(' ', unit);
    $('mission-description').textContent = goal.description;
    $('mission-tip').textContent = TIPS[goal.id] || 'Explore the warehouse and make every line count.';
  }
  showResults(result, progress = this.progress) {
    this.progress = progress;
    this.lastMode = result.mode || 'goals';
    this.display = 'results';
    this.clearNotifications();
    $('overlay').classList.remove('hidden');
    $('goal-board').classList.add('hidden');
    $('run-results').classList.remove('hidden');
    $('best-runs-details').open = false;
    $('level-eyebrow').textContent = result.mode === 'free' ? 'A LITTLE TIME WELL SPENT.' : 'TWO MINUTES. YOUR MARK.';
    $('level-title').innerHTML = 'SESSION <span>COMPLETE</span>';
    $('results-score').textContent = fmt(result.score);
    $('results-combo').textContent = fmt(result.bestCombo);
    $('results-goals').innerHTML = `${result.completed?.length || 0} <small>/ ${this.goals.length}</small>`;
    const newlyCompleted = new Set(result.newlyCompleted || []);
    const completed = new Set(result.completed || []);
    const results = this.goals.filter(goal => newlyCompleted.has(goal.id) || completed.has(goal.id));
    $('results-goal-heading').textContent = newlyCompleted.size ? 'FRESH INK ON THE BOARD' : results.length ? 'GOALS LANDED' : 'THE NEXT LINE IS WAITING';
    $('results-new-count').textContent = newlyCompleted.size ? `${newlyCompleted.size} NEW` : '';
    $('results-list').replaceChildren();
    for (const goal of results) {
      const row = document.createElement('div');
      row.className = 'result-goal';
      row.innerHTML = `<span class="result-check">✓</span><b></b><span class="result-badge"></span>`;
      row.querySelector('b').textContent = goal.title;
      row.querySelector('.result-badge').textContent = newlyCompleted.has(goal.id) ? 'NEW' : 'COMPLETE';
      $('results-list').append(row);
    }
    $('results-note').textContent = result.mode === 'free' ? 'Free skate is for exploring. Start a goal run when you’re ready to put your name on the board.' : !results.length ? 'No goals this time. Try the High Score goal or follow the glowing collectibles to learn the warehouse.' : newlyCompleted.size ? 'Your completed goals are saved. Pick another focus and keep building your warehouse record.' : 'You landed these again. Choose an unfinished goal to add something new to the board.';
    this.renderProgress(progress);
    $('retry-run').focus({ preventScroll: true });
  }
  update(state) {
    const showTracker = state?.mode === 'goals' && state.active !== false;
    $('goal-tracker').classList.toggle('hidden', !showTracker);
    if (!showTracker) return;
    const id = state.focusGoal || this.selectedGoal;
    const goal = state.goals?.find(entry => entry.id === id) || this.goals.find(entry => entry.id === id);
    if (!goal) return;
    const letters = new Set(state.letters || []);
    const current = goal.current ?? (goal.type === 'score' ? state.score : goal.type === 'combo' ? state.bestCombo : goal.id === 'skate' ? letters.size : goal.id === 'caps' ? state.caps : state.tape ? 1 : 0) ?? 0;
    const complete = goal.complete || (state.completed || []).includes(id);
    const key = [id, current, complete, (state.completed || []).length, [...letters].join(''), state.caps, state.tape, state.overtime].join('|');
    if (key === this.lastTrackerKey) return;
    this.lastTrackerKey = key;
    $('tracker-name').textContent = goal.title;
    $('tracker-count').textContent = complete ? '✓ COMPLETE' : `${fmt(current)} / ${fmt(goal.target)}`;
    $('tracker-completed').textContent = `${(state.completed || []).length} / ${this.goals.length} GOALS`;
    $('tracker-fill').style.width = `${Math.min(1, current / goal.target) * 100}%`;
    $('goal-tracker').classList.toggle('complete', complete);
    $('tracker-hint').textContent = state.overtime ? 'LAST CHANCE — LAND YOUR COMBO' : complete ? 'Focus complete. Every other goal is still active.' : goal.id === 'tape' ? 'Ride the bank to the raised loading deck.' : goal.id === 'caps' ? 'Follow the teal bottle caps.' : goal.id === 'skate' ? 'Five gold letters. Any order.' : goal.type === 'combo' ? 'Link your tricks. Land the whole combo.' : 'Land tricks to bank your points.';
    [...$('skate-tracker').children].forEach(letter => {
      letter.classList.toggle('collected', letters.has(letter.textContent));
      letter.setAttribute('aria-label', `${letter.textContent}: ${letters.has(letter.textContent) ? 'collected' : 'missing'}`);
    });
    $('caps-tracker').querySelector('b').textContent = `${state.caps || 0}/5`;
    $('tape-tracker').querySelector('b').textContent = `${state.tape ? 1 : 0}/1`;
    $('caps-tracker').classList.toggle('collected', state.caps >= 5);
    $('tape-tracker').classList.toggle('collected', !!state.tape);
  }
  notifyGoal(goal) {
    const entry = typeof goal === 'string' ? this.goals.find(item => item.id === goal) : goal;
    if (!entry) return;
    this.noticeQueue.push(entry);
    if (this.noticeRemaining <= 0) this.showNextNotification();
  }
  showNextNotification() {
    const goal = this.noticeQueue.shift();
    if (!goal) { this.noticeRemaining = 0; $('goal-notification').classList.add('hidden'); return; }
    $('goal-notification-title').textContent = goal.title;
    $('goal-notification').classList.remove('hidden');
    this.noticeRemaining = 2.5;
  }
  tick(dt) {
    if (this.noticeRemaining <= 0) return;
    this.noticeRemaining -= Math.max(0, dt || 0);
    if (this.noticeRemaining <= 0) this.showNextNotification();
  }
  clearNotifications() {
    this.noticeRemaining = 0;
    this.noticeQueue.length = 0;
    $('goal-notification').classList.add('hidden');
  }
}
