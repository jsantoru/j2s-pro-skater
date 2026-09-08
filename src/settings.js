// Player preferences that outlive a session, kept in localStorage beside the high-score table.
// Music ships off: the run should open on wheels and concrete unless the player asks for the stereo.
// Storage can be unavailable (private mode, blocked cookies, a file:// open), so every access is
// guarded and the settings simply live in memory for the session.

const KEY = 'j2s-pro-skater.settings.v1';

export class Settings {
  constructor(storage) {
    this.storage = storage !== undefined ? storage : globalThis.localStorage;
    this.music = this.load().music;
    this.onChange = null;
  }
  // Anything read back is untrusted, and a missing or malformed record means the defaults.
  load() {
    try {
      const raw = this.storage && this.storage.getItem(KEY);
      const data = raw ? JSON.parse(raw) : null;
      return { music: !!(data && data.music) };
    } catch { return { music: false }; }
  }
  save() {
    try { if (this.storage) this.storage.setItem(KEY, JSON.stringify({ music: this.music })); } catch { /* full or blocked */ }
  }
  setMusic(on) {
    this.music = !!on;
    this.save();
    this.onChange?.(this);
    return this.music;
  }
  toggleMusic() { return this.setMusic(!this.music); }
}
