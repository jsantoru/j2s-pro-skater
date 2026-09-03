// Tiny procedural sound set (WebAudio): rolling, pop, land, grind, bail, trick blip.
export class Audio {
  constructor() { this.ctx = null; this.enabled = false; }
  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.5; this.master.connect(c.destination);
    const noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = noiseBuf;
    // rolling loop
    const roll = c.createBufferSource(); roll.buffer = noiseBuf; roll.loop = true;
    this.rollFilter = c.createBiquadFilter(); this.rollFilter.type = 'lowpass'; this.rollFilter.frequency.value = 400;
    this.rollGain = c.createGain(); this.rollGain.gain.value = 0;
    roll.connect(this.rollFilter).connect(this.rollGain).connect(this.master); roll.start();
    // grind loop
    const gr = c.createBufferSource(); gr.buffer = noiseBuf; gr.loop = true;
    this.grindFilter = c.createBiquadFilter(); this.grindFilter.type = 'bandpass'; this.grindFilter.Q.value = 6; this.grindFilter.frequency.value = 2400;
    this.grindGain = c.createGain(); this.grindGain.gain.value = 0;
    gr.connect(this.grindFilter).connect(this.grindGain).connect(this.master); gr.start();
    const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 160;
    this.grindOsc = osc; this.grindOscGain = c.createGain(); this.grindOscGain.gain.value = 0;
    osc.connect(this.grindOscGain).connect(this.master); osc.start();
    this.enabled = true;
  }
  burst(freq, dur, vol, type = 'lowpass', q = 1) {
    if (!this.enabled) return;
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    s.connect(f).connect(g).connect(this.master); s.start(); s.stop(c.currentTime + dur + 0.05);
  }
  tone(freq, dur, vol, type = 'sine', slide = 1) {
    if (!this.enabled) return;
    const c = this.ctx, o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(freq * slide, c.currentTime + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g).connect(this.master); o.start(); o.stop(c.currentTime + dur + 0.05);
  }
  pop(charge) { this.burst(1800, 0.12, 0.5, 'highpass'); this.tone(180 + charge * 80, 0.08, 0.35, 'square', 0.5); }
  land(hard) { this.tone(70, 0.18, 0.5 + hard * 0.4, 'sine', 0.5); this.burst(600, 0.15, 0.35 + hard * 0.3); }
  bail() { this.burst(900, 0.5, 0.8); this.tone(90, 0.4, 0.5, 'sawtooth', 0.3); }
  trick() { this.tone(880, 0.07, 0.12, 'square', 1.5); }
  score() { this.tone(660, 0.12, 0.15, 'triangle', 1.5); setTimeout(() => this.tone(990, 0.15, 0.15, 'triangle', 1.2), 90); }
  update(sk) {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    const rolling = sk.state === 'ride' ? Math.min(1, sk.speed / 10) : 0;
    this.rollGain.gain.setTargetAtTime(rolling * 0.35, t, 0.05);
    this.rollFilter.frequency.setTargetAtTime(250 + sk.speed * 60, t, 0.05);
    const g = sk.state === 'grind' ? 1 : 0;
    this.grindGain.gain.setTargetAtTime(g * 0.4, t, 0.03);
    this.grindOscGain.gain.setTargetAtTime(g * 0.06, t, 0.03);
    if (g) this.grindOsc.frequency.setTargetAtTime(120 + sk.speed * 14, t, 0.05);
  }
}
