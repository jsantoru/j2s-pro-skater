// Trick tables, naming, combo and scoring.
//
// Point values and the combo maths follow THPS-SCORING-SYSTEM.md, which is the reference for
// Tony Hawk's Pro Skater 1+2:
//
//   Final Score = Σ(base × stance × degradation) × combo multiplier
//
// The tables below only re-price the tricks this game already has — no trick is added here.

// Flip tricks all share one base value in THPS; variety matters through degradation, not through
// picking a "better" direction. Third field is the animation duration in seconds.
export const FLIPS = {
  C: ['Kickflip', 100, 0.42], W: ['Kickflip', 100, 0.42], E: ['Heelflip', 100, 0.42],
  S: ['Pop Shove-it', 100, 0.38], N: ['Impossible', 100, 0.5],
  SW: ['360 Flip', 100, 0.55], SE: ['Varial Heelflip', 100, 0.5],
  NW: ['Hardflip', 100, 0.5], NE: ['Inward Heelflip', 100, 0.5],
};
// Grabs: standard 300, advanced 350, weak 50. Airwalk is a weak grab in the source tables.
export const GRABS = {
  C: ['Indy', 300], E: ['Indy', 300], W: ['Melon', 300], N: ['Nosegrab', 300], S: ['Tailgrab', 300],
  NW: ['Method', 300], NE: ['Stalefish', 300], SW: ['Judo', 350], SE: ['Airwalk', 50],
};
// Grinds: basic 100, advanced (crook / feeble / smith / overcrook) 125, slides 200.
export const GRINDS = {
  C: ['50-50', 100], N: ['Nosegrind', 100], S: ['5-0', 100], W: ['Boardslide', 200], E: ['Lipslide', 200],
  NW: ['Crooked Grind', 125], NE: ['Overcrook', 125], SW: ['Smith Grind', 125], SE: ['Feeble Grind', 125],
};

// Manuals are connective tissue: they hold a combo open for almost no points of their own.
export const MANUALS = { tail: ['Manual', 100], nose: ['Nose Manual', 100] };

// Points accrued for holding something, per 0.1 s. Grinds pay for length, manuals barely pay at all,
// grabs pay only past the minimum tuck.
export const HOLD = { grind: 10, manual: 5, grab: 10 };

// Riding switch is worth 1.2× and counts as a different trick for degradation purposes.
export const SWITCH_BONUS = 1.2;
// 1st use full, then 75%, 50%, 25%, 10% for the 5th and every later use in the same combo.
export const DEGRADE = [1, 0.75, 0.5, 0.25, 0.1];
export function degradeFactor(uses) { return DEGRADE[Math.min(uses, DEGRADE.length - 1)]; }

// Rotation pays into the base score, escalating hard with every extra half-turn, and into the
// multiplier (one extra x per completed 360). Index is the number of 180s.
const SPIN_POINTS = [0, 100, 250, 450, 700, 1000, 1350];
const SPIN_STEP = 400; // each half-turn past the table
export function spinPoints(halfTurns) {
  if (halfTurns < 1) return 0;
  if (halfTurns < SPIN_POINTS.length) return SPIN_POINTS[halfTurns];
  return SPIN_POINTS[SPIN_POINTS.length - 1] + (halfTurns - SPIN_POINTS.length + 1) * SPIN_STEP;
}
export function spinMult(halfTurns) { return Math.floor(halfTurns / 2); }

export function spinName(deg, dir) {
  const n = Math.round(Math.abs(deg) / 180) * 180;
  if (n < 180) return '';
  return (dir > 0 ? 'FS ' : 'BS ') + n;
}

// Display name of a banked trick: "BS 360 Switch Kickflip".
export function trickLabel(t) {
  return (t.spin ? t.spin + ' ' : '') + (t.switch ? 'Switch ' : '') + t.name;
}

export class Combo {
  constructor() { this.reset(); }
  // Degradation is scoped to the combo, as in THPS: banking clears the counts.
  reset() { this.tricks = []; this.points = 0; this.active = false; this.mult = 0; this.counts = {}; }
  get multiplier() { return this.mult; }
  get total() { return Math.round(this.points * this.multiplier); }
  get text() { return this.tricks.map(trickLabel).join(' + '); }

  // opts.switch applies the stance bonus and gives the trick its own degradation slot.
  // opts.key keeps naming (spin prefixes) out of the degradation bookkeeping.
  add(name, base, opts = {}) {
    const sw = !!opts.switch;
    const key = (opts.key || name) + (sw ? ' [switch]' : '');
    const uses = this.counts[key] || 0;
    this.counts[key] = uses + 1;
    const pts = Math.round(base * (sw ? SWITCH_BONUS : 1) * degradeFactor(uses));
    const trick = { name, points: pts, spin: '', switch: sw };
    this.tricks.push(trick);
    this.points += pts;
    this.mult++;           // every trick in the chain is worth one more x
    this.active = true;
    return trick;
  }
  // Hold points (grind length, manual time): flat, undegraded, folded into the trick they belong to.
  addToLast(extra) { if (this.tricks.length) { this.tricks[this.tricks.length - 1].points += extra; this.points += extra; } }
  addMult(n) { if (n > 0) this.mult += n; }
  attachSpin(index, name, bonus) {
    const t = this.tricks[index];
    if (!t) return;
    t.spin = name; t.points += bonus; this.points += bonus;
  }
  newRun() { this.reset(); }
}
