import { SkateMusic } from './music.js';

// Layered procedural skateboard audio. Shaped noise provides the wood, urethane, concrete and
// steel character; short oscillators only reinforce physical resonances and quiet UI feedback.
export class Audio {
  constructor() {
    this.ctx = null; this.enabled = false; this.lastUpdate = 0;
    this.rollDistance = 0; this.nextWheelClick = 0.8;
    this.musicOn = false; // off until the player switches the stereo on in settings
    this.paused = false;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.72;
    this.compressor = c.createDynamicsCompressor();
    this.compressor.threshold.value = -16; this.compressor.knee.value = 12;
    this.compressor.ratio.value = 4; this.compressor.attack.value = 0.003; this.compressor.release.value = 0.16;
    this.master.connect(this.compressor).connect(c.destination);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = 0.78; this.sfxBus.connect(this.master);
    this.worldBus = c.createGain(); this.worldBus.gain.value = 0.72; this.worldBus.connect(this.master);
    // The score gets its own bus so it can be faded in and out without touching the skating audio.
    this.musicBus = c.createGain(); this.musicBus.gain.value = this.musicOn ? 1 : 0; this.musicBus.connect(this.master);
    this.music = new SkateMusic(c, this.musicBus);

    const impulse = c.createBuffer(2, Math.floor(c.sampleRate * 0.3), c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const fade = Math.pow(1 - i / data.length, 3.2);
        data[i] = (Math.random() * 2 - 1) * fade * Math.min(1, i / 80);
      }
    }
    this.reverb = c.createConvolver(); this.reverb.buffer = impulse;
    this.reverbGain = c.createGain(); this.reverbGain.gain.value = 0.11;
    this.reverb.connect(this.reverbGain).connect(this.master);

    this.noise = {
      white: this.makeNoise(3, 0), pink: this.makeNoise(3, 0.72), brown: this.makeNoise(3, 0.965),
      road: this.makeRoadNoise(3), scrape: this.makeScrapeNoise(3),
    };
    // Road noise is deliberately mid-focused. Low-passed brown noise sounds like wind or surf;
    // sparse micro-impacts read as hard urethane vibrating over concrete instead.
    [this.rollDeckFilter, this.rollDeckGain] = this.loopNoise('road', 'bandpass', 340, 1.35);
    [this.rollBodyFilter, this.rollBodyGain] = this.loopNoise('road', 'bandpass', 720, 0.7);
    [this.rollGritFilter, this.rollGritGain] = this.loopNoise('road', 'bandpass', 2100, 0.9);
    // A separate, light bearing/wheel voice remains after ground contact drops away during an ollie.
    [this.wheelWhirFilter, this.wheelWhirGain] = this.loopNoise('pink', 'bandpass', 2500, 1.4);
    [this.grindFilter, this.grindGain] = this.loopNoise('scrape', 'bandpass', 1900, 1.05);
    [this.grindChatterFilter, this.grindChatterGain] = this.loopNoise('scrape', 'bandpass', 3900, 0.8);
    [this.grindBodyFilter, this.grindBodyGain] = this.loopNoise('road', 'bandpass', 460, 0.9);
    this.lastUpdate = c.currentTime; this.enabled = true;
    this.setPaused(this.paused); c.resume();
  }

  // Switching the score on and off mid-run. Scheduling stops immediately; the bus fades over a
  // beat or so, which both avoids a click and lets bars already queued ahead die away naturally.
  // `update` re-anchors the bar clock after a silence, so turning it back on picks up right away.
  setMusic(on) {
    this.musicOn = !!on;
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(this.musicOn ? 1 : 0, this.ctx.currentTime, 0.12);
  }

  setPaused(paused) {
    this.paused = paused;
    if (!this.enabled) return;
    // Keep the stereo editable/audible in settings; silence skating and its reverb.
    for (const [bus, volume] of [[this.worldBus, .72], [this.sfxBus, .78], [this.reverbGain, .11]]) {
      bus.gain.cancelScheduledValues(this.ctx.currentTime);
      bus.gain.setTargetAtTime(paused ? 0 : volume, this.ctx.currentTime, .015);
    }
    this.lastUpdate = this.ctx.currentTime;
  }

  makeNoise(seconds, memory) {
    const c = this.ctx, buffer = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate), data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = last * memory + (Math.random() * 2 - 1) * (1 - memory);
      data[i] = memory ? last * (memory > 0.9 ? 5.5 : 2.2) : last;
    }
    return buffer;
  }

  makeRoadNoise(seconds) {
    const c = this.ctx, buffer = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate), data = buffer.getChannelData(0);
    let smooth = 0, pebble = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      smooth += (white - smooth) * 0.075;
      if (Math.random() < 0.0007) pebble += (Math.random() * 2 - 1) * 0.75;
      pebble *= 0.91;
      data[i] = (white - smooth) * 0.28 + pebble;
    }
    return buffer;
  }

  makeScrapeNoise(seconds) {
    const c = this.ctx, buffer = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate), data = buffer.getChannelData(0);
    let smooth = 0, pressure = 0.4, target = 0.4, catchHit = 0, nextShift = 0;
    for (let i = 0; i < data.length; i++) {
      if (i >= nextShift) {
        target = 0.12 + Math.pow(Math.random(), 1.7) * 0.88;
        nextShift = i + 120 + Math.floor(Math.random() * 1100);
      }
      pressure += (target - pressure) * 0.004;
      const white = Math.random() * 2 - 1;
      smooth += (white - smooth) * 0.11;
      if (Math.random() < 0.00035) catchHit += (Math.random() * 2 - 1) * 0.9;
      catchHit *= 0.89;
      data[i] = (white - smooth) * (0.1 + pressure * 0.42) + catchHit;
    }
    return buffer;
  }

  loopNoise(kind, type, frequency, q) {
    const c = this.ctx, source = c.createBufferSource(); source.buffer = this.noise[kind]; source.loop = true;
    const filter = c.createBiquadFilter(); filter.type = type; filter.frequency.value = frequency; filter.Q.value = q;
    const gain = c.createGain(); gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(this.worldBus); source.start();
    return [filter, gain];
  }

  route(node, wet = 0.04) {
    node.connect(this.sfxBus);
    if (wet > 0) { const send = this.ctx.createGain(); send.gain.value = wet; node.connect(send).connect(this.reverb); }
  }

  burst(freq, dur, vol, type = 'lowpass', q = 1, delay = 0, kind = 'white', wet = 0.035) {
    if (!this.enabled) return;
    const c = this.ctx, when = c.currentTime + delay, source = c.createBufferSource();
    source.buffer = this.noise[kind] || this.noise.white; source.playbackRate.value = 0.92 + Math.random() * 0.16;
    const filter = c.createBiquadFilter(); filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
    const gain = c.createGain(); gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(vol, when + Math.min(0.004, dur * 0.15));
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    source.connect(filter).connect(gain); this.route(gain, wet);
    source.start(when, Math.random() * Math.max(0, source.buffer.duration - dur - 0.02));
    source.stop(when + dur + 0.03);
  }

  tone(freq, dur, vol, type = 'sine', slide = 1, delay = 0, wet = 0.025) {
    if (!this.enabled) return;
    const c = this.ctx, when = c.currentTime + delay, osc = c.createOscillator(); osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), when);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), when + dur);
    const gain = c.createGain(); gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(vol, when + Math.min(0.003, dur * 0.12));
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(gain); this.route(gain, wet); osc.start(when); osc.stop(when + dur + 0.03);
  }

  pop(charge = 0) {
    const power = 0.75 + charge * 0.25;
    this.burst(2100 + charge * 350, 0.035, 0.62 * power, 'bandpass', 0.75, 0, 'white', 0.025);
    this.burst(760, 0.075, 0.32 * power, 'lowpass', 0.8, 0.006, 'pink', 0.06);
    this.tone(145 + charge * 24, 0.055, 0.23 * power, 'triangle', 0.58, 0.002, 0.04);
    this.burst(3900, 0.045, 0.1, 'highpass', 0.5, 0.02, 'pink', 0.01);
  }

  land(hard = 0.5) {
    const force = Math.max(0.25, Math.min(1, hard));
    this.tone(72 - force * 12, 0.16, 0.34 + force * 0.34, 'sine', 0.48, 0, 0.075);
    this.burst(720 + force * 260, 0.12, 0.27 + force * 0.3, 'lowpass', 0.7, 0, 'brown', 0.065);
    const gap = 0.012 + (1 - force) * 0.009;
    for (let axle = 0; axle < 2; axle++) {
      const at = axle * gap;
      this.burst(2500 + Math.random() * 900, 0.025 + force * 0.018, 0.18 + force * 0.18, 'bandpass', 1.2, at, 'white', 0.035);
      this.tone(410 + Math.random() * 85, 0.034, 0.065 + force * 0.075, 'triangle', 0.72, at + 0.002, 0.03);
    }
    if (force > 0.72) this.burst(4300, 0.085, (force - 0.65) * 0.25, 'highpass', 0.45, 0.018, 'pink', 0.025);
  }

  trickStart(name = '') {
    const grab = /Indy|Melon|grab|Method|Stalefish|Judo|Airwalk/i.test(name);
    this.burst(grab ? 1700 : 3300, grab ? 0.075 : 0.045, grab ? 0.055 : 0.075,
      grab ? 'bandpass' : 'highpass', 0.55, 0, 'pink', 0.02);
  }

  trick(name = '') {
    if (/Indy|Melon|Nosegrab|Tailgrab|Method|Stalefish|Judo|Airwalk/i.test(name)) {
      this.burst(1250, 0.055, 0.11, 'bandpass', 0.9, 0, 'pink', 0.035);
      this.tone(360, 0.03, 0.055, 'triangle', 0.8, 0.006, 0.02); return;
    }
    const heavy = /360|Hardflip|Impossible|Inward/i.test(name) ? 1.18 : 1;
    this.burst(1550, 0.052, 0.24 * heavy, 'bandpass', 1.1, 0, 'pink', 0.045);
    this.tone(455 + Math.random() * 45, 0.043, 0.11 * heavy, 'triangle', 0.68, 0.002, 0.035);
    this.burst(4400, 0.022, 0.09, 'highpass', 0.7, 0.009, 'white', 0.015);
  }

  grindStart(material = 'metal', speed = 7, slide = false) {
    const metal = material !== 'ledge';
    if (!metal) {
      this.burst(900, 0.085, 0.36, 'bandpass', 0.75, 0, 'road', 0.055);
      this.tone(185, 0.065, 0.075, 'triangle', 0.58, 0.002, 0.045); return;
    }
    this.burst(slide ? 1250 : 2450, 0.055, slide ? 0.31 : 0.38, 'bandpass', 1.15, 0, 'scrape', 0.065);
    this.tone(slide ? 290 : 520 + speed * 7, 0.075, slide ? 0.085 : 0.105, 'triangle', 0.7, 0.002, 0.075);
    if (!slide) this.metalPing(speed, 0.042, 0.006);
  }

  grindEnd(material = 'metal', slide = false) {
    const metal = material !== 'ledge';
    this.burst(metal ? (slide ? 1400 : 2650) : 820, 0.045, 0.15, 'bandpass', metal ? 1.1 : 0.7,
      0, metal ? 'scrape' : 'road', 0.04);
    if (metal && !slide) this.metalPing(5, 0.014, 0.004);
  }

  metalPing(speed, volume = 0.025, delay = 0) {
    // Tubular steel rings at several imperfectly related modes, rather than one musical pitch.
    const base = 610 + speed * 18 + Math.random() * 130;
    this.tone(base, 0.105, volume, 'sine', 0.985, delay, 0.13);
    this.tone(base * 2.27, 0.072, volume * 0.48, 'sine', 0.965, delay + 0.0015, 0.15);
    this.tone(base * 3.63, 0.045, volume * 0.22, 'sine', 0.94, delay + 0.003, 0.12);
  }

  grindCatch(metal, slide, speed) {
    if (!metal) {
      this.burst(650 + Math.random() * 450, 0.016, 0.024, 'bandpass', 0.8, 0, 'road', 0.008); return;
    }
    this.burst((slide ? 1700 : 3300) + Math.random() * 900, 0.012 + Math.random() * 0.014,
      slide ? 0.027 : 0.04, 'bandpass', 1.25, 0, 'scrape', 0.012);
    if (!slide && Math.random() < 0.42) this.metalPing(speed, 0.018);
  }

  manualStart() {
    this.burst(680, 0.055, 0.12, 'bandpass', 0.8, 0, 'brown', 0.035);
    this.tone(285, 0.04, 0.055, 'triangle', 0.75, 0.004, 0.025);
  }

  revert(speed = 7) {
    const force = Math.min(1, speed / 10);
    this.burst(1900, 0.22, 0.12 + force * 0.12, 'bandpass', 1.8, 0, 'road', 0.025);
    this.burst(3100, 0.12, 0.05 + force * 0.06, 'bandpass', 2.5, 0.035, 'pink', 0.02);
  }

  bail() {
    this.tone(58, 0.32, 0.58, 'sine', 0.42, 0, 0.09);
    this.burst(520, 0.34, 0.58, 'lowpass', 0.65, 0, 'brown', 0.09);
    this.burst(1750, 0.13, 0.48, 'bandpass', 0.85, 0.018, 'pink', 0.08);
    this.tone(390, 0.075, 0.16, 'triangle', 0.62, 0.08, 0.07);
    this.burst(3400, 0.055, 0.17, 'bandpass', 1.5, 0.155, 'white', 0.06);
    this.tone(310, 0.06, 0.1, 'triangle', 0.72, 0.21, 0.05);
  }

  score() {
    this.tone(587, 0.105, 0.07, 'sine', 1.01, 0.17, 0.12);
    this.tone(880, 0.14, 0.055, 'sine', 1.005, 0.25, 0.14);
  }

  wheelClick(speed) {
    const v = Math.min(1, speed / 12);
    this.burst(1600 + speed * 55, 0.014, 0.018 + v * 0.026, 'bandpass', 0.9, 0, 'white', 0.008);
  }

  update(sk) {
    if (!this.enabled) return;
    const c = this.ctx, t = c.currentTime;
    if (c.state === 'suspended') return;
    if (this.musicOn) this.music.update(t);
    const dt = Math.max(0, Math.min(0.05, t - this.lastUpdate)); this.lastUpdate = t;
    if (this.paused) return;
    const speed = Math.max(0, sk.speed || 0), onGround = sk.state === 'ride', inAir = sk.state === 'air';
    const rolling = onGround ? Math.min(1, speed / 11) : 0, steer = Math.min(1, Math.abs(sk.steer || 0));
    // Pavement contact trails off rather than being gated. The quieter high wheel whir then carries
    // across the air until the landing transient and rolling bed take over again.
    this.rollDeckGain.gain.setTargetAtTime(rolling * (0.032 + steer * 0.006), t, onGround ? 0.055 : 0.14);
    this.rollBodyGain.gain.setTargetAtTime(rolling * (0.075 + steer * 0.012), t, onGround ? 0.045 : 0.13);
    this.rollGritGain.gain.setTargetAtTime(rolling * rolling * (0.04 + steer * 0.026), t, onGround ? 0.04 : 0.1);
    this.rollDeckFilter.frequency.setTargetAtTime(285 + speed * 13, t, 0.075);
    this.rollBodyFilter.frequency.setTargetAtTime(480 + speed * 34, t, 0.06);
    this.rollGritFilter.frequency.setTargetAtTime(1400 + speed * 92 + steer * 280, t, 0.055);
    const freewheel = inAir ? Math.min(1, speed / 11) * Math.exp(-(sk.airTime || 0) * 0.45) : 0;
    this.wheelWhirGain.gain.setTargetAtTime(freewheel * freewheel * 0.028, t, inAir ? 0.08 : 0.035);
    this.wheelWhirFilter.frequency.setTargetAtTime(1750 + speed * 115, t, 0.07);
    if (onGround && speed > 1.4) {
      this.rollDistance += speed * dt;
      if (this.rollDistance >= this.nextWheelClick) {
        this.rollDistance = 0; this.nextWheelClick = 0.62 + Math.random() * 0.7; this.wheelClick(speed);
      }
    } else if (!onGround) this.rollDistance = 0;

    const grinding = sk.state === 'grind' && sk.grind, g = grinding ? Math.min(1, speed / 10) : 0;
    const metal = grinding && sk.grind.rail.kind !== 'ledge', slide = grinding && sk.grind.slide;
    this.grindGain.gain.setTargetAtTime(g * (metal ? (slide ? 0.105 : 0.13) : 0.085), t, 0.025);
    this.grindChatterGain.gain.setTargetAtTime(g * (metal ? (slide ? 0.018 : 0.045) : 0.008), t, 0.02);
    this.grindBodyGain.gain.setTargetAtTime(g * (metal ? (slide ? 0.075 : 0.04) : 0.13), t, 0.03);
    if (grinding) {
      this.grindFilter.frequency.setTargetAtTime((metal ? (slide ? 1150 : 1750) : 620) + speed * (metal ? 62 : 24), t, 0.045);
      this.grindFilter.Q.setTargetAtTime(metal ? 1.05 : 0.68, t, 0.04);
      this.grindChatterFilter.frequency.setTargetAtTime((slide ? 2800 : 3650) + speed * 54, t, 0.035);
      this.grindBodyFilter.frequency.setTargetAtTime((metal ? (slide ? 330 : 440) : 260) + speed * 11, t, 0.055);
      if (Math.random() < dt * speed * (metal ? 0.72 : 0.46)) this.grindCatch(metal, slide, speed);
    }
  }
}
