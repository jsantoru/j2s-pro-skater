// Genesee's career goals are independent of rendering. Only banked landings count toward
// score goals; collecting and saving happen exclusively in timed goal runs.
// A new run activates only goals that were unfinished when it started.
export const GOALS = Object.freeze([
  { id: 'high-score', title: 'High Score', description: 'Bank 2,500 points in one run.', type: 'score', target: 2500, category: 'Score' },
  { id: 'pro-score', title: 'Pro Score', description: 'Bank 10,000 points in one run.', type: 'score', target: 10000, category: 'Score' },
  { id: 'sick-score', title: 'Sick Score', description: 'Bank 25,000 points in one run.', type: 'score', target: 25000, category: 'Score' },
  { id: 'combo', title: 'Big Combo', description: 'Land a single 3,000-point combo.', type: 'combo', target: 3000, category: 'Score' },
  { id: 'skate', title: 'Collect S-K-A-T-E', description: 'Find all five letters in one run.', type: 'collection', target: 5, category: 'Collect' },
  { id: 'caps', title: 'Bottle Cap Hunt', description: 'Collect five Genesee bottle caps in one run.', type: 'collection', target: 5, category: 'Collect' },
  { id: 'tape', title: 'Secret Tape', description: 'Reach the secret tape on the loading deck.', type: 'collection', target: 1, category: 'Explore' },
].map(Object.freeze));

// World-space token centres. The rider collects with the centre of their body, 0.85m
// above the board. Keeping these definitions here lets collision tests run without WebGL.
export const PICKUPS = Object.freeze([
  { id: 'letter-s', goalId: 'skate', type: 'letter', label: 'S', position: [0, 0.95, 14], surfaceY: 0, hint: 'Straight ahead from the roll-in' },
  { id: 'letter-k', goalId: 'skate', type: 'letter', label: 'K', position: [20, 0.95, 5], surfaceY: 0, hint: 'Beside the stair-set landing' },
  { id: 'letter-a', goalId: 'skate', type: 'letter', label: 'A', position: [14, 0.95, -17.5], surfaceY: 0, hint: 'East end of the half pipe' },
  { id: 'letter-t', goalId: 'skate', type: 'letter', label: 'T', position: [-15, 0.95, -13.5], surfaceY: 0, hint: 'West end of the half pipe' },
  { id: 'letter-e', goalId: 'skate', type: 'letter', label: 'E', position: [-18, 2.1, 4], surfaceY: 0, hint: 'Ollie off the west kicker toward the flat rail' },
  { id: 'cap-1', goalId: 'caps', type: 'cap', label: 'Bottle Cap', position: [-13, 0.95, 15], surfaceY: 0, hint: 'Southwest open floor' },
  { id: 'cap-2', goalId: 'caps', type: 'cap', label: 'Bottle Cap', position: [-24, 0.95, -6], surfaceY: 0, hint: 'West quarter-pipe lane' },
  { id: 'cap-3', goalId: 'caps', type: 'cap', label: 'Bottle Cap', position: [17, 0.95, -20], surfaceY: 0, hint: 'Behind the half pipe' },
  { id: 'cap-4', goalId: 'caps', type: 'cap', label: 'Bottle Cap', position: [2, 1.95, 3.1], surfaceY: 1, hint: 'Top of the center pyramid' },
  { id: 'cap-5', goalId: 'caps', type: 'cap', label: 'Bottle Cap', position: [29, 0.95, 3], surfaceY: 0, hint: 'East open floor' },
  { id: 'secret-tape', goalId: 'tape', type: 'tape', label: 'Secret Tape', position: [28, 2.55, 17], surfaceY: 1.6, hint: 'Ride the bank up to the southeast loading deck' },
].map(pickup => Object.freeze({ ...pickup, position: Object.freeze(pickup.position), radius: 1.05 })));

export const GOAL_STORAGE_KEY = 'j2s-pro-skater.genesee.goals.v1';
const BODY_HEIGHT = 0.85;
const MAX_SWEEP = 4;

function points(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.round(value))) : 0;
}

function defaultStorage() {
  // Accessing localStorage itself can throw in blocked/embedded browser contexts.
  try { return globalThis.localStorage; } catch { return null; }
}

function bodyPosition(skater) {
  const pos = skater?.pos;
  if (!pos || ![pos.x, pos.y, pos.z].every(Number.isFinite)) return null;
  return [pos.x, pos.y + BODY_HEIGHT, pos.z];
}

function distanceSquared(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

function touchesSegment(start, end, pickup) {
  const dx = end[0] - start[0], dy = end[1] - start[1], dz = end[2] - start[2];
  const px = pickup.position[0] - start[0], py = pickup.position[1] - start[1], pz = pickup.position[2] - start[2];
  const lengthSquared = dx * dx + dy * dy + dz * dz;
  const along = lengthSquared > 0 ? Math.max(0, Math.min(1, (dx * px + dy * py + dz * pz) / lengthSquared)) : 0;
  return (dx * along - px) ** 2 + (dy * along - py) ** 2 + (dz * along - pz) ** 2 <= (pickup.radius ?? 1.05) ** 2;
}

export class GoalProgress {
  constructor(storage, { key = GOAL_STORAGE_KEY, goals = GOALS } = {}) {
    this.storage = storage === undefined ? defaultStorage() : storage;
    this.key = key;
    this.goals = goals;
    this.goalIds = new Set(goals.map(goal => goal.id));
    this.completed = new Set();
    this.bestScore = 0;
    this.bestCombo = 0;
    try {
      const data = JSON.parse(this.storage?.getItem(this.key) || 'null');
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        if (Array.isArray(data.completed)) {
          for (const id of data.completed) if (this.goalIds.has(id)) this.completed.add(id);
        }
        this.bestScore = points(data.bestScore);
        this.bestCombo = points(data.bestCombo);
      }
    } catch { /* Invalid or inaccessible storage starts a fresh in-memory career. */ }
  }

  has(id) { return this.completed.has(id); }

  snapshot() {
    return {
      completed: this.goals.filter(goal => this.has(goal.id)).map(goal => goal.id),
      bestScore: this.bestScore,
      bestCombo: this.bestCombo,
    };
  }

  // Saves only improvements. A blocked/full store never prevents in-memory progress.
  record({ completed = [], score = 0, bestCombo = 0 } = {}) {
    let changed = false;
    for (const id of completed) {
      if (this.goalIds.has(id) && !this.has(id)) { this.completed.add(id); changed = true; }
    }
    const nextScore = Math.max(this.bestScore, points(score));
    const nextCombo = Math.max(this.bestCombo, points(bestCombo));
    changed ||= nextScore !== this.bestScore || nextCombo !== this.bestCombo;
    this.bestScore = nextScore;
    this.bestCombo = nextCombo;
    if (changed) {
      try { this.storage?.setItem(this.key, JSON.stringify(this.snapshot())); } catch { /* memory fallback */ }
    }
    return this.snapshot();
  }
}

export class GoalRun {
  constructor(progress = new GoalProgress(), configuration = PICKUPS) {
    this.progress = progress;
    // The pickup-array form remains compatible with the warehouse simulations.
    this.pickups = Array.isArray(configuration) ? configuration : configuration.pickups ?? PICKUPS;
    this.definitions = Array.isArray(configuration) ? progress.goals : configuration.goals ?? progress.goals;
    this.reset();
  }

  reset() {
    this.mode = 'goals';
    this.active = false;
    this.score = 0;
    this.bestCombo = 0;
    this.availableGoals = new Set();
    this.collected = new Set();
    this.completed = new Set();
    this.newlyCompleted = new Set();
    this.previousPosition = null;
    return this;
  }

  start({ mode = 'goals', skater = null } = {}) {
    this.reset();
    this.mode = mode === 'free' ? 'free' : 'goals';
    if (this.mode === 'goals') {
      this.availableGoals = new Set(this.definitions.filter(goal => !this.progress.has(goal.id)).map(goal => goal.id));
    }
    this.active = true;
    this.previousPosition = skater?.state === 'bail' ? null : bodyPosition(skater);
    return this;
  }

  count(goalId) {
    return this.pickups.filter(pickup => pickup.goalId === goalId && this.collected.has(pickup.id)).length;
  }

  current(goal) {
    if (goal.type === 'score') return this.score;
    if (goal.type === 'combo') return this.bestCombo;
    return this.count(goal.id);
  }

  evaluate() {
    if (!this.active || this.mode !== 'goals') return [];
    const events = [];
    for (const goal of this.definitions) {
      if (this.availableGoals.has(goal.id) && !this.completed.has(goal.id) && this.current(goal) >= goal.target) {
        this.completed.add(goal.id);
        const newCareer = !this.progress.has(goal.id);
        if (newCareer) this.newlyCompleted.add(goal.id);
        events.push({ type: 'goal', goal, newCareer });
      }
    }
    this.progress.record({ completed: this.completed, score: this.score, bestCombo: this.bestCombo });
    return events;
  }

  // Call from the skater's land event, never from its live combo total. This remains
  // enabled during last-combo overtime; finish() closes score and pickup intake.
  bankCombo(value) {
    const banked = points(value);
    if (!this.active || banked === 0) return [];
    this.score = points(this.score + banked);
    this.bestCombo = Math.max(this.bestCombo, banked);
    return this.evaluate();
  }

  // Call after a fixed simulation step. Set collect:false once the timer expires.
  // The swept body path catches fast passes while bails and respawn teleports cannot
  // sweep up a trail of collectibles across the warehouse.
  update(skater, { collect = true } = {}) {
    const end = bodyPosition(skater);
    if (!this.active || this.mode !== 'goals' || !collect || skater?.state === 'bail' || !end) {
      this.previousPosition = null;
      return [];
    }
    const start = this.previousPosition || end;
    this.previousPosition = end;
    if (distanceSquared(start, end) > MAX_SWEEP ** 2) return [];
    const events = [];
    for (const pickup of this.pickups) {
      if (this.availableGoals.has(pickup.goalId) && !this.collected.has(pickup.id) && touchesSegment(start, end, pickup)) {
        this.collected.add(pickup.id);
        events.push({ type: 'pickup', pickup });
      }
    }
    if (events.length) events.push(...this.evaluate());
    return events;
  }

  finish() {
    this.active = false;
    this.previousPosition = null;
    return this.snapshot();
  }

  snapshot() {
    return {
      mode: this.mode,
      active: this.active,
      score: this.score,
      bestCombo: this.bestCombo,
      // Keep the initial goal set through results; completion does not remove a
      // goal midway through its run or change the run's completion denominator.
      availableGoals: [...this.availableGoals],
      collected: [...this.collected],
      completed: [...this.completed],
      newlyCompleted: [...this.newlyCompleted],
      letters: this.pickups.filter(pickup => pickup.goalId === 'skate' && this.collected.has(pickup.id)).map(pickup => pickup.label),
      caps: this.count('caps'),
      tape: this.count('tape') > 0,
      goals: this.definitions.map(goal => ({ ...goal, current: this.current(goal), available: this.availableGoals.has(goal.id), complete: this.completed.has(goal.id), careerComplete: this.progress.has(goal.id) })),
    };
  }
}
