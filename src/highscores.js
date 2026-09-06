// Persistent high-score table, kept in localStorage so a session's best runs survive a reload.
// Storage can be unavailable (private mode, blocked cookies, a file:// open) — every access is
// guarded and the table simply falls back to living in memory for the session.

const KEY = 'j2s-pro-skater.highscores.v1';
export const MAX_ENTRIES = 10;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function today() { return new Date().toISOString().slice(0, 10); }

// Anything read back from storage is untrusted: coerce scores to positive integers and keep only
// dates in the exact shape we wrote, so the HUD can render entries without escaping.
function sanitise(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((e) => ({
      score: Math.round(Number(e && e.score)) || 0,
      date: e && DATE.test(e.date) ? e.date : '',
    }))
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ENTRIES);
}

export class HighScores {
  constructor(storage) {
    this.storage = storage !== undefined ? storage : globalThis.localStorage;
    this.list = this.load();
  }
  load() {
    try {
      const raw = this.storage && this.storage.getItem(KEY);
      return raw ? sanitise(JSON.parse(raw)) : [];
    } catch { return []; }
  }
  save() {
    try { if (this.storage) this.storage.setItem(KEY, JSON.stringify(this.list)); } catch { /* full or blocked */ }
  }
  get best() { return this.list.length ? this.list[0].score : 0; }
  // Records a finished run. Returns its 1-based place on the table, or 0 if it did not make it.
  submit(score) {
    const entry = { score: Math.round(score) || 0, date: today() };
    if (entry.score <= 0) return 0;
    this.list.push(entry);
    this.list.sort((a, b) => b.score - a.score);
    this.list = this.list.slice(0, MAX_ENTRIES);
    this.save();
    return this.list.indexOf(entry) + 1;
  }
  clear() { this.list = []; try { if (this.storage) this.storage.removeItem(KEY); } catch { /* ignore */ } }
}
