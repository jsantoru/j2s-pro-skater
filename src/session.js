// Run timing is advanced after each physics step, so a landing at the buzzer banks
// its payout before the session closes. An unresolved final combo gets up to 20s.
const OVERTIME_LIMIT = 20;
const EPSILON = 1e-9;

export class SessionClock {
  constructor(duration = 120) {
    this.duration = typeof duration === 'number' && Number.isFinite(duration) && duration >= 0 ? duration : 120;
    this.mode = 'goals';
    this.remaining = this.duration;
    this.overtime = false;
    this.overtimeRemaining = OVERTIME_LIMIT;
    this.active = false;
  }

  start(mode = 'goals') {
    this.mode = mode === 'free' ? 'free' : 'goals';
    this.remaining = this.mode === 'free' ? Infinity : this.duration;
    this.overtime = false;
    this.overtimeRemaining = OVERTIME_LIMIT;
    this.active = true;
    return this;
  }

  // True only on the step that ends a session. Invalid/zero deltas are no-ops;
  // paused frames should never drain the clock or resolve a pending final combo.
  // `banked` records a positive land payout during this physics step, before the
  // controller may replace the settled combo with a fresh queued trick.
  advance(dt, skater, { banked = false } = {}) {
    if (!this.active || this.mode === 'free' || !Number.isFinite(dt) || dt <= 0) return false;
    let overtimeDelta = dt;
    if (this.remaining > 0) {
      const previous = this.remaining;
      this.remaining = Math.max(0, previous - dt);
      if (this.remaining > EPSILON) return false;
      this.remaining = 0;
      overtimeDelta = Math.max(0, dt - previous);
    }

    // A ramp landing can bank its old combo and pop a queued new trick in one
    // physics step. The completed combo ends overtime even if that new trick exists.
    const spinning = skater?.state === 'air' && Number.isFinite(skater.spinDeg) && Math.abs(skater.spinDeg) >= 150;
    const pendingCombo = !!(skater?.combo?.tricks?.length || skater?.trick || spinning);
    if (banked || !pendingCombo || skater?.state === 'bail') {
      this.finish();
      return true;
    }

    this.overtime = true;
    this.overtimeRemaining = Math.max(0, this.overtimeRemaining - overtimeDelta);
    if (this.overtimeRemaining <= EPSILON) {
      this.overtimeRemaining = 0;
      this.finish();
      return true;
    }
    return false;
  }

  finish() {
    this.active = false;
    this.overtime = false;
    return this;
  }
}
