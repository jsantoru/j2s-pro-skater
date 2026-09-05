// An original, driving loop for the run. It is intentionally small and generative: no samples, no
// borrowed melodies, just a four-bar minor climb (Am - C - Dm - E) under a steady eighth-note pulse.
export class SkateMusic {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.bus = ctx.createGain(); this.bus.gain.value = 0.16; this.bus.connect(destination);
    this.snareBus = ctx.createGain(); this.snareBus.gain.value = 0.34; this.snareBus.connect(destination);
    this.drumNoise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const drumData = this.drumNoise.getChannelData(0);
    for (let i = 0; i < drumData.length; i++) drumData[i] = Math.random() * 2 - 1;
    this.beat = 60 / 90;
    this.barDuration = this.beat * 4;

    // A half-beat echo stays on the 90 BPM grid, doubling the pulse rather than smearing it.
    this.delay = ctx.createDelay(1); this.delay.delayTime.value = this.beat * 0.5;
    this.feedback = ctx.createGain(); this.feedback.gain.value = 0.2;
    this.delayWet = ctx.createGain(); this.delayWet.gain.value = 0.14;
    this.delay.connect(this.feedback).connect(this.delay);
    this.delay.connect(this.delayWet).connect(destination);

    this.nextBar = ctx.currentTime + 1.8;
    this.bar = 0;

    // Four continuously looping bars, one chord each: A minor, C, D minor, E. `arp` is the eighth-note
    // pulse for the bar; `lead` is [beat, MIDI note, length in beats] and climbs with the harmony.
    this.phrase = [
      {
        chord: [45, 52, 57, 60], arp: [57, 64, 69, 64, 57, 64, 69, 72],
        lead: [[0, 69, 1.4], [1.5, 72, 0.9], [2.5, 76, 1.4]],
      },
      {
        chord: [48, 55, 60, 64], arp: [60, 67, 72, 67, 60, 67, 72, 76],
        lead: [[0, 72, 1.4], [1.5, 76, 0.9], [2.5, 79, 1.4]],
      },
      {
        chord: [50, 57, 62, 65], arp: [62, 69, 74, 69, 62, 69, 74, 77],
        lead: [[0, 74, 1.4], [1.5, 77, 0.9], [2.5, 81, 1.4]],
      },
      // The major dominant and a short turnaround pull the climb back down to the opening A.
      {
        chord: [52, 59, 64, 68], arp: [64, 71, 76, 71, 64, 71, 76, 80],
        lead: [[0, 76, 1.4], [1.5, 80, 0.9], [2.5, 83, 0.9], [3.5, 80, 0.5]],
      },
    ];
  }

  hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  route(node, echo = 0.22, output = this.bus) {
    node.connect(output);
    if (echo > 0) { const send = this.ctx.createGain(); send.gain.value = echo; node.connect(send).connect(this.delay); }
  }

  pulse(midi, when, duration, volume = 0.038) {
    // A short, filtered double saw. It carries the motor of the track, so it decays well inside its
    // eighth note and takes very little echo: the point is the grid, not the wash.
    const c = this.ctx, end = when + duration;
    const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = 5;
    filter.frequency.setValueAtTime(2800, when); filter.frequency.exponentialRampToValueAtTime(760, end);
    const gain = c.createGain(); gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(volume, when + 0.007);
    gain.gain.exponentialRampToValueAtTime(volume * 0.3, when + duration * 0.4);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    filter.connect(gain); this.route(gain, 0.06);
    for (const detune of [-6, 6]) {
      const osc = c.createOscillator(); osc.type = 'sawtooth';
      osc.frequency.value = this.hz(midi); osc.detune.value = detune;
      const voice = c.createGain(); voice.gain.value = 0.5;
      osc.connect(voice).connect(filter); osc.start(when); osc.stop(end + 0.03);
    }
  }

  lead(midi, when, duration, pan = 0.22) {
    // The upper voice: a warm sustained tone that holds the ascending line over the pulse.
    const c = this.ctx, end = when + duration;
    const fundamental = c.createOscillator(); fundamental.type = 'sawtooth'; fundamental.frequency.value = this.hz(midi);
    const body = c.createOscillator(); body.type = 'triangle'; body.frequency.value = this.hz(midi - 12);
    const bodyGain = c.createGain(); bodyGain.gain.value = 0.4;
    const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(1500, when); filter.frequency.linearRampToValueAtTime(2600, when + 0.12);
    filter.frequency.exponentialRampToValueAtTime(1200, end);
    const gain = c.createGain(); gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.05, when + 0.02);
    gain.gain.setValueAtTime(0.05, Math.max(when + 0.03, end - 0.12));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    fundamental.connect(filter); body.connect(bodyGain).connect(filter); filter.connect(gain);
    if (c.createStereoPanner) {
      const panner = c.createStereoPanner(); panner.pan.value = pan; gain.connect(panner); this.route(panner, 0.22);
    } else this.route(gain, 0.22);
    fundamental.start(when); body.start(when);
    fundamental.stop(end + 0.03); body.stop(end + 0.03);
  }

  pad(notes, when, duration) {
    const c = this.ctx, end = when + duration, filter = c.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 720;
    const gain = c.createGain(); gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.018, when + 1.0);
    gain.gain.setValueAtTime(0.018, end - 1.0);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    filter.connect(gain); this.route(gain, 0.1);
    notes.forEach((midi, i) => {
      const osc = c.createOscillator(); osc.type = 'sine'; osc.frequency.value = this.hz(midi - 12);
      osc.detune.value = (i - 1.5) * 2.5;
      const voice = c.createGain(); voice.gain.value = 1 / notes.length;
      osc.connect(voice).connect(filter); osc.start(when); osc.stop(end + 0.04);
    });
  }

  kick(when, volume = 0.4) {
    const c = this.ctx, osc = c.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(78, when); osc.frequency.exponentialRampToValueAtTime(43, when + 0.15);
    const gain = c.createGain(); gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(volume, when + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.2);
    osc.connect(gain); this.route(gain, 0.025); osc.start(when); osc.stop(when + 0.23);
  }

  drumHit(when, frequency, duration, volume, pan = 0, output = this.bus, echo = 0.035) {
    const c = this.ctx, source = c.createBufferSource(); source.buffer = this.drumNoise;
    const filter = c.createBiquadFilter(); filter.type = frequency > 3500 ? 'highpass' : 'bandpass';
    filter.frequency.value = frequency; filter.Q.value = frequency > 3500 ? 0.45 : 0.75;
    const gain = c.createGain(); gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(volume, when + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    source.connect(filter).connect(gain);
    if (c.createStereoPanner) {
      const panner = c.createStereoPanner(); panner.pan.value = pan; gain.connect(panner); this.route(panner, echo, output);
    } else this.route(gain, echo, output);
    source.start(when, Math.random() * 0.8); source.stop(when + duration + 0.02);
  }

  snare(when, volume, pan) {
    // A broad crack layered over a lower brushed body remains audible beside the rolling texture.
    this.drumHit(when, 1350, 0.1, volume, pan, this.snareBus, 0.018);
    this.drumHit(when + 0.002, 3600, 0.055, volume * 0.48, -pan * 0.5, this.snareBus, 0.012);
  }

  scheduleBeat(when, index) {
    const b = this.beat;
    this.kick(when + 0.012, 0.42);
    this.kick(when + 2 * b, index % 2 ? 0.27 : 0.3);
    this.snare(when + b, 0.19, -0.08);
    this.snare(when + 3 * b, 0.165, 0.08);
    for (const [beat, pan, volume] of [[0.5, -0.18, 0.052], [1.5, 0.16, 0.044], [2.5, -0.12, 0.052], [3.5, 0.18, 0.04]]) {
      this.drumHit(when + beat * b, 5200, 0.025, volume, pan);
    }
  }

  scheduleBar(index, when) {
    const part = this.phrase[index % this.phrase.length];
    this.pad(part.chord, when, this.barDuration * 0.94);
    this.scheduleBeat(when, index);
    // Straight eighths, deliberately locked to the grid: the pulse is what makes the loop drive.
    part.arp.forEach((midi, i) => {
      const accent = i % 4 === 0 ? 0.052 : 0.036;
      this.pulse(midi, when + i * this.beat * 0.5, this.beat * 0.44, accent);
    });
    part.lead.forEach(([beat, midi, length], i) => {
      // A touch of timing and placement drift keeps the repeating climb from sounding sequenced.
      const human = (Math.random() - 0.5) * 0.018;
      const pan = (index + i) % 2 ? 0.2 : -0.2;
      this.lead(midi, when + beat * this.beat + human, length * this.beat, pan);
    });
  }

  update(now) {
    if (this.nextBar < now - 0.5) this.nextBar = now + 0.1;
    if (this.nextBar <= now + 0.55) {
      this.scheduleBar(this.bar, this.nextBar);
      this.nextBar += this.barDuration;
      this.bar = (this.bar + 1) % this.phrase.length;
    }
  }
}
