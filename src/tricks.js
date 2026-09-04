// Trick tables, naming, combo and scoring (THPS1-style: sum of trick points × trick count).

export const FLIPS = {
  C: ['Kickflip', 100, 0.42], W: ['Kickflip', 100, 0.42], E: ['Heelflip', 100, 0.42],
  S: ['Pop Shove-it', 100, 0.38], N: ['Impossible', 200, 0.5],
  SW: ['360 Flip', 300, 0.55], SE: ['Varial Heelflip', 250, 0.5],
  NW: ['Hardflip', 250, 0.5], NE: ['Inward Heelflip', 250, 0.5],
};
export const GRABS = {
  C: ['Indy', 100], E: ['Indy', 100], W: ['Melon', 100], N: ['Nosegrab', 100], S: ['Tailgrab', 100],
  NW: ['Method', 200], NE: ['Stalefish', 200], SW: ['Judo', 250], SE: ['Airwalk', 250],
};
export const GRINDS = {
  C: ['50-50', 100], N: ['Nosegrind', 250], S: ['5-0', 250], W: ['Boardslide', 150], E: ['Lipslide', 150],
  NW: ['Crooked Grind', 350], NE: ['Overcrook', 350], SW: ['Smith Grind', 450], SE: ['Feeble Grind', 400],
};

// Manuals score modestly on entry and accrue while held — they are connective tissue between tricks,
// not a way to farm points by rolling in a straight line.
export const MANUALS = { tail: ['Manual', 100], nose: ['Nose Manual', 150] };

export function spinName(deg, dir) {
  const n = Math.round(Math.abs(deg) / 180) * 180;
  if (n < 180) return '';
  return (dir > 0 ? 'FS ' : 'BS ') + n;
}

export class Combo {
  constructor() { this.reset(); this.runCounts = {}; }
  reset() { this.tricks = []; this.points = 0; this.active = false; this.mult = 0; this.comboCounts = {}; }
  get multiplier() { return this.mult; }
  get total() { return this.points * this.multiplier; }
  get text() { return this.tricks.map((t) => t.name).join(' + '); }
  add(name, base) {
    // repeated tricks in a run degrade: 100%, 75%, 50%, 25% (min)
    const c = (this.runCounts[name] || 0);
    this.runCounts[name] = c + 1;
    const pts = Math.max(10, Math.round(base * Math.max(0.25, 1 - c * 0.25) / 10) * 10);
    // the same trick only grows the multiplier three times per combo (keeps rail-hop loops from exploding)
    const cc = (this.comboCounts[name] || 0); this.comboCounts[name] = cc + 1;
    if (cc < 3) this.mult++;
    this.tricks.push({ name, points: pts });
    this.points += pts; this.active = true;
    return pts;
  }
  addToLast(extra) { if (this.tricks.length) { this.tricks[this.tricks.length - 1].points += extra; this.points += extra; } }
  newRun() { this.reset(); this.runCounts = {}; }
}
