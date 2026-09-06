// Balance meter for grinds. Modelled as an inverted pendulum: `x` is how far you are tipped
// (-1 hard left, 0 centred, +1 hard right) and the further you lean the harder it pulls you over.
// The stick applies acceleration rather than moving the needle directly, so the meter carries
// momentum and overcorrecting is a real mistake — mashing loses, feathering wins.

export const BALANCE = {
  tip: 6.2,          // instability: outward acceleration per unit of lean (1/s²)
  control: 8.4,      // player authority at full stick (1/s²)
  saveMargin: 0.75,  // everything tipping you over is capped at this fraction of `control`, so full stick
                     //   always out-muscles the meter however far difficulty has ramped. That makes the
                     //   clutch save an invariant rather than a tuning coincidence. It does NOT make every
                     //   state survivable: weight takes `shift` seconds to move, so if you are already at
                     //   the edge carrying speed outward you are gone. That point of no return is the
                     //   difference between a meter that is tense and one that is merely fiddly.
  damp: 2.4,         // velocity damping: enough weight to feel deliberate, not enough to feel sticky
  shift: 10.0,       // how fast your weight actually follows the stick (1/s). Shifting your weight is not
                     //   instant, and that lag is what makes slamming the stick back and forth overshoot
                     //   into a wobble you cannot outrun. Anticipating beats reacting.
  bias: 1.3,         // magnitude of the slow wander that makes you work even when centred
  ramp: 0.26,        // difficulty growth per second on the rail, so every grind builds tension
  rampMax: 0.6,
  comboStep: 0.05,   // and a little more for each trick already banked in this combo
  comboMax: 0.4,
  grace: 0.32,       // settle time on landing: the grind magnet must not drop you straight into a fight
  armDeadzone: 0.3,  // the stick has to pass through centre once before it steers the meter, so the
  armTimeout: 0.6,   //   direction you were holding to pick the grind does not immediately shove it
  slowSpeed: 4.0,    // creeping along a rail is harder to hold, the way it is on a real board
  slowFactor: 0.5,
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Manuals run the same pendulum on the pitch axis. Rolling on two wheels is twitchier than a rail but
// you have more leverage over it, and there is no wandering rail surface under you — so: quicker to run
// away, quicker to correct, less random wander, and it ramps faster so manuals stay a connector between
// tricks rather than somewhere you park.
export const MANUAL_BALANCE = Object.assign({}, BALANCE, {
  tip: 7.4,
  control: 9.6,
  bias: 0.95,
  ramp: 0.34,
  rampMax: 0.7,
  grace: 0.22,
  slowSpeed: 3.0,   // a manual dies when you run out of roll, and that is handled by the speed floor
  slowFactor: 0.7,
});

export class Balance {
  // rng is injectable so the sim can run this deterministically; tuning picks grind vs manual feel
  constructor(rng = Math.random, tuning = BALANCE) { this.rng = rng; this.B = tuning; this.reset(); }

  reset() {
    this.x = 0; this.v = 0; this.t = 0; this.applied = 0;
    this.bias = 0; this.biasTarget = 0; this.biasT = 0;
    this.armed = false; this.active = false; this.difficulty = 0;
  }

  start(difficulty = 0, previous = null) {
    if (previous) {
      // A combo owns one continuous balance challenge, even when the input axis changes.
      // Time is paused in the air, but hopping never erases drift, momentum or difficulty.
      for (const key of ['x', 'v', 't', 'applied', 'bias', 'biasTarget', 'biasT', 'armed']) this[key] = previous[key];
      this.difficulty = Math.max(difficulty, previous.difficulty);
    } else { this.reset(); this.difficulty = difficulty; }
    this.active = true;
  }
  stop() { this.active = false; }

  get error() { return Math.min(1, Math.abs(this.x)); }        // 0 centred → 1 about to fall
  get settling() { return this.t < this.B.grace; }

  // How hard the meter is fighting right now: grows along the rail and with the combo already banked.
  hardness(speed) {
    const B = this.B;
    let h = 1 + Math.min(B.rampMax, Math.max(0, this.t - B.grace) * B.ramp) + this.difficulty;
    if (speed < B.slowSpeed) h *= 1 + (1 - Math.max(0, speed) / B.slowSpeed) * B.slowFactor;
    return h;
  }

  // Returns false the frame you fall off. `input` is stick X: pushing a direction leans that way,
  // so you counter a tip by pressing away from it.
  update(dt, input, speed) {
    if (!this.active) return true;
    const B = this.B;
    this.t += dt;
    if (!this.armed && (Math.abs(input) < B.armDeadzone || this.t >= B.armTimeout)) this.armed = true;
    if (this.t < B.grace) return true;

    // slow wander, re-aimed every half second or so, so no two of them play out the same
    this.biasT -= dt;
    if (this.biasT <= 0) { this.biasTarget = this.rng() * 2 - 1; this.biasT = 0.4 + this.rng() * 0.5; }
    this.bias += (this.biasTarget - this.bias) * Math.min(1, dt * 3);

    const hard = this.hardness(speed);
    // The pendulum running away from you, plus the wander — capped together so full stick always beats
    // them (see saveMargin). Difficulty is then felt as the meter moving faster, never as a dead end.
    const lim = B.control * B.saveMargin;
    const disturb = clamp(B.tip * hard * this.x + B.bias * hard * this.bias, -lim, lim);
    this.v += disturb * dt;
    // your weight chases the stick rather than snapping to it
    this.applied += ((this.armed ? input : 0) - this.applied) * Math.min(1, dt * B.shift);
    this.v += B.control * this.applied * dt;
    this.v -= this.v * B.damp * dt;
    this.x += this.v * dt;

    if (Math.abs(this.x) >= 1) { this.x = Math.sign(this.x); this.v = 0; return false; }
    return true;
  }
}
