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
    if (mode === 'goals' && !this.focusUnfinished()) mode = 'free';
    this.lastMode = mode;
    this.onStart?.(mode, mode === 'goals' ? this.selectedGoal : null);
  }
  unfinishedGoals(progress = this.progress) {
    const completed = new Set(progress.completed || []);
    return this.goals.filter(goal => !completed.has(goal.id));
  }
  availableIds(state) {
    if (state?.mode === 'free') return new Set();
    if (Array.isArray(state?.availableGoals)) return new Set(state.availableGoals);
    return new Set((state?.goals || this.goals).filter(goal => goal.available !== false).map(goal => goal.id));
  }
  focusUnfinished(progress = this.progress) {
    this.progress = progress;
    const unfinished = this.unfinishedGoals(progress);
    const next = unfinished.find(goal => goal.id === this.selectedGoal) || unfinished[0] || null;
    if (next) this.selectGoal(next.id);
    else {
      this.selectedGoal = null;
      this.renderMission(null);
    }
    return next;
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
    this.focusUnfinished(progress);
    $('overlay-msg').focus({ preventScroll: true });
  }
  renderProgress(progress) {
    const completed = new Set(this.goals.filter(goal => (progress.completed || []).includes(goal.id)).map(goal => goal.id));
    const remaining = this.goals.length - completed.size;
    $('board-completed').innerHTML = `${completed.size}<span>/ ${this.goals.length}</span>`;
    $('board-completion-fill').style.width = `${completed.size / this.goals.length * 100}%`;
    $('board-best-score').textContent = progress.bestScore ? fmt(progress.bestScore) : '—';
    $('board-best-combo').textContent = progress.bestCombo ? fmt(progress.bestCombo) : '—';
    for (const goal of this.goals) {
      const button = this.goalButtons.get(goal.id);
      const done = completed.has(goal.id);
      button.disabled = done;
      button.classList.toggle('complete', done);
      if (done) { button.classList.remove('selected'); button.setAttribute('aria-pressed', 'false'); }
      button.querySelector('.goal-check').textContent = done ? '✓' : '↗';
      button.setAttribute('aria-label', `${goal.title}, ${targetLabel(goal)}, ${done ? 'completed achievement' : 'unfinished goal'}`);
    }
    $('goal-board-subtitle').textContent = remaining ? 'SELECT AN UNFINISHED GOAL' : 'YOUR ACHIEVEMENT RECORD';
    $('goal-board-note').textContent = remaining ? 'Every unfinished goal is active in your next run. Completed goals stay on your record.' : 'All warehouse goals complete. Your achievements are saved.';
  }
  selectGoal(id) {
    const goal = this.goals.find(entry => entry.id === id);
    if (!goal || (this.progress.completed || []).includes(goal.id)) return false;
    this.selectedGoal = goal.id;
    this.renderMission(goal);
    return true;
  }
  renderMission(goal) {
    const remaining = this.unfinishedGoals().length;
    for (const [goalId, button] of this.goalButtons) {
      button.classList.toggle('selected', goalId === goal?.id && !button.disabled);
      button.setAttribute('aria-pressed', String(goalId === goal?.id && !button.disabled));
    }
    document.querySelector('.mission-panel').classList.toggle('career-complete', !goal);
    $('free-skate').hidden = !goal;
    $('mission-status').classList.toggle('done', !goal);
    $('mission-session-time').textContent = goal ? '02:00' : '∞';
    $('mission-session-label').textContent = goal ? `ONE RUN. ${remaining} UNFINISHED ${remaining === 1 ? 'GOAL' : 'GOALS'}.` : 'FREE SKATE';
    $('mission-session-note').textContent = goal ? 'Complete your remaining goals in any order.' : 'No timer. Skate at your own pace.';
    $('overlay-msg').innerHTML = goal ? 'START GOAL RUN <span>START →</span>' : 'FREE SKATE <span>DROP IN →</span>';
    $('mission-tip-label').textContent = goal ? 'FIND YOUR LINE' : 'KEEP ROLLING';
    if (!goal) {
      $('mission-category').textContent = 'WAREHOUSE COMPLETE';
      $('mission-status').textContent = '✓ ALL GOALS LANDED';
      $('mission-icon').innerHTML = icon({ type: 'score' });
      $('mission-title').textContent = 'The warehouse is yours.';
      $('mission-target').textContent = `${this.goals.length} / ${this.goals.length}`;
      const unit = document.createElement('span');
      unit.textContent = 'GOALS COMPLETE';
      $('mission-target').append(' ', unit);
      $('mission-description').textContent = 'Every Genesee goal is complete. Your place on the board is earned.';
      $('mission-tip').textContent = 'Find a fresh line, practice your favorite tricks, and enjoy the warehouse in Free Skate.';
      return;
    }
    $('mission-category').textContent = category(goal);
    $('mission-status').textContent = 'TO DO';
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
    const free = result.mode === 'free';
    const previousFocus = this.selectedGoal;
    const nextGoal = this.focusUnfinished(progress);
    const remaining = this.unfinishedGoals(progress).length;
    const careerComplete = !nextGoal;
    this.lastMode = free || careerComplete ? 'free' : 'goals';
    this.display = 'results';
    this.clearNotifications();
    $('overlay').classList.remove('hidden');
    $('goal-board').classList.add('hidden');
    $('run-results').classList.remove('hidden');
    $('best-runs-details').open = false;
    $('level-eyebrow').textContent = free ? 'A LITTLE TIME WELL SPENT.' : careerComplete ? 'EVERY GOAL. ALL YOURS.' : 'TWO MINUTES. YOUR MARK.';
    $('level-title').innerHTML = !free && careerComplete ? 'WAREHOUSE <span>COMPLETE</span>' : 'SESSION <span>COMPLETE</span>';
    $('results-score').textContent = fmt(result.score);
    $('results-combo').textContent = fmt(result.bestCombo);
    const available = this.availableIds(result);
    const newlyCompleted = new Set((result.newlyCompleted || []).filter(id => available.has(id)));
    const results = this.goals.filter(goal => newlyCompleted.has(goal.id));
    $('results-goals-label').textContent = free ? 'FREE SKATE' : 'GOALS THIS RUN';
    $('results-goals').innerHTML = free ? '—' : `${results.length} <small>/ ${available.size}</small>`;
    $('results-goal-heading').textContent = newlyCompleted.size ? 'FRESH INK ON THE BOARD' : careerComplete ? 'YOUR WAREHOUSE. YOUR LINES.' : free ? 'THE WAREHOUSE IS OPEN' : 'THE NEXT LINE IS WAITING';
    $('results-new-count').textContent = newlyCompleted.size ? `${newlyCompleted.size} NEW` : '';
    $('results-list').replaceChildren();
    for (const goal of results) {
      const row = document.createElement('div');
      row.className = 'result-goal';
      row.innerHTML = `<span class="result-check">✓</span><b></b><span class="result-badge"></span>`;
      row.querySelector('b').textContent = goal.title;
      row.querySelector('.result-badge').textContent = 'NEW';
      $('results-list').append(row);
    }
    const nextPanel = document.querySelector('.results-next');
    nextPanel.classList.toggle('career-complete', careerComplete);
    nextPanel.querySelector('.level-eyebrow').textContent = careerComplete ? 'EVERY GOAL COMPLETE' : free ? 'NEXT GOAL RUN · UNFINISHED' : 'UP NEXT · UNFINISHED GOAL';
    nextPanel.querySelector('h2').textContent = nextGoal ? nextGoal.title : 'THE WAREHOUSE IS YOURS.';
    nextPanel.querySelector('p').textContent = nextGoal ? nextGoal.description : 'You earned every goal. Keep rolling, find new lines, and enjoy Free Skate.';
    $('retry-run').innerHTML = careerComplete ? 'FREE SKATE <span>DROP IN →</span>' : free ? 'KEEP FREE SKATING <span>DROP IN →</span>' : previousFocus !== nextGoal.id ? 'START NEXT RUN <span>START →</span>' : 'TRY AGAIN <span>RETRY →</span>';
    $('results-board').innerHTML = careerComplete ? 'GOAL BOARD <span>VIEW YOUR ACHIEVEMENTS →</span>' : 'GOAL BOARD <span>CHOOSE YOUR NEXT GOAL →</span>';
    $('results-note').textContent = careerComplete ? 'All warehouse goals are complete and saved. Free Skate is yours whenever you want another session.'
      : free ? `${remaining} ${remaining === 1 ? 'goal remains' : 'goals remain'} on your board. Start a goal run whenever you’re ready; Free Skate stays untimed.`
      : newlyCompleted.size ? `Your new achievements are saved. ${remaining} ${remaining === 1 ? 'goal remains' : 'goals remain'} for your next run.`
      : 'No new goals this time. Keep working on your focus, or choose another unfinished goal from the board.';
    this.renderProgress(progress);
    $('retry-run').focus({ preventScroll: true });
  }
  update(state) {
    const available = this.availableIds(state);
    const showTracker = state?.mode === 'goals' && state.active !== false && available.size > 0;
    $('goal-tracker').classList.toggle('hidden', !showTracker);
    if (!showTracker) return;
    const requested = state.focusGoal || this.selectedGoal;
    const id = available.has(requested) ? requested : available.values().next().value;
    const goal = state.goals?.find(entry => entry.id === id) || this.goals.find(entry => entry.id === id);
    if (!goal) return;
    const letters = new Set(state.letters || []);
    const current = goal.current ?? (goal.type === 'score' ? state.score : goal.type === 'combo' ? state.bestCombo : goal.id === 'skate' ? letters.size : goal.id === 'caps' ? state.caps : state.tape ? 1 : 0) ?? 0;
    const complete = goal.complete || (state.completed || []).includes(id);
    const completedCount = (state.completed || []).filter(goalId => available.has(goalId)).length;
    const key = [id, current, complete, completedCount, [...available].join(','), [...letters].join(''), state.caps, state.tape, state.overtime].join('|');
    if (key === this.lastTrackerKey) return;
    this.lastTrackerKey = key;
    $('tracker-name').textContent = goal.title;
    $('tracker-count').textContent = complete ? '✓ COMPLETE' : `${fmt(current)} / ${fmt(goal.target)}`;
    $('tracker-completed').textContent = `${completedCount} / ${available.size} GOALS`;
    $('tracker-fill').style.width = `${Math.min(1, current / goal.target) * 100}%`;
    $('goal-tracker').classList.toggle('complete', complete);
    const remaining = available.size - completedCount;
    $('tracker-hint').textContent = state.overtime ? 'LAST CHANCE — LAND YOUR COMBO' : complete ? remaining ? `Focus complete. ${remaining} ${remaining === 1 ? 'goal' : 'goals'} still to go.` : 'Every goal in this run is complete. Keep skating!' : goal.id === 'tape' ? 'Ride the bank to the raised loading deck.' : goal.id === 'caps' ? 'Follow the teal bottle caps.' : goal.id === 'skate' ? 'Five gold letters. Any order.' : goal.type === 'combo' ? 'Link your tricks. Land the whole combo.' : 'Land tricks to bank your points.';
    $('skate-tracker').classList.toggle('hidden', !available.has('skate'));
    $('caps-tracker').classList.toggle('hidden', !available.has('caps'));
    $('tape-tracker').classList.toggle('hidden', !available.has('tape'));
    document.querySelector('.pickup-tracker').classList.toggle('hidden', !['skate', 'caps', 'tape'].some(goalId => available.has(goalId)));
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
