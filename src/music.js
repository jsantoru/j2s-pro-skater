// An original, sparse ambient score. It is intentionally small and generative: no samples, no
// borrowed melodies, and enough silence for skating sounds to remain the focus.
export class AmbientMusic {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.bus = ctx.createGain(); this.bus.gain.value = 0.16; this.bus.connect(destination);
    this.snareBus = ctx.createGain(); this.snareBus.gain.value = 0.34; this.snareBus.connect(destination);
    this.drumNoise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const drumData = this.drumNoise.getChannelData(0);
    for (let i = 0; i < drumData.length; i++) drumData[i] = Math.random() * 2 - 1;
    this.beat = 60 / 90;
    this.barDuration = this.beat * 4;

    // A half-beat echo stays on the 90 BPM grid while giving the piano some space.
    this.delay = ctx.createDelay(1); this.delay.delayTime.value = this.beat * 0.5;
    this.feedback = ctx.createGain(); this.feedback.gain.value = 0.2;
    this.delayWet = ctx.createGain(); this.delayWet.gain.value = 0.16;
    this.delay.connect(this.feedback).connect(this.delay);
    this.delay.connect(this.delayWet).connect(destination);

    this.nextBar = ctx.currentTime + 1.8;
    this.bar = 0;

    // Eight continuously looping bars. Notes are MIDI numbers and beat positions within each bar.
    this.phrase = [
      { chord: [48, 55, 59, 64], notes: [[0.5, 67, 1.25], [2.5, 64, 0.75]], counter: [[1.5, 76, 0.65]] },
      { chord: [45, 52, 55, 60], notes: [[1, 60, 1], [3, 64, 0.75]], counter: [[0.5, 72, 0.75], [2.5, 76, 0.5]] },
      { chord: [41, 48, 52, 57], notes: [[0.5, 69, 1.25], [2.5, 67, 0.75]], counter: [[1.5, 72, 0.75]] },
      { chord: [43, 50, 55, 60], notes: [[1, 62, 0.75], [3, 60, 1]], counter: [[0.5, 74, 0.75], [2.25, 71, 0.5]] },
      { chord: [50, 57, 60, 65], notes: [[0.5, 65, 1], [2, 69, 1.25]], counter: [[1.5, 77, 0.65]] },
      { chord: [43, 50, 55, 59], notes: [[1, 67, 0.75], [3, 62, 0.75]], counter: [[0.5, 74, 0.75], [2.5, 79, 0.5]] },
      { chord: [48, 55, 59, 64], notes: [[0.5, 64, 1.5]], counter: [[2.5, 76, 0.75]] },
      // A restrained dominant bar creates motion back into the opening C-major color.
      { chord: [43, 50, 55, 59], notes: [[0.5, 62, 1], [2.5, 59, 0.75]], counter: [[1.5, 74, 0.65], [3.5, 71, 0.4]] },
    ];
  }

  hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  route(node, echo = 0.22, output = this.bus) {
    node.connect(output);
    if (echo > 0) { const send = this.ctx.createGain(); send.gain.value = echo; node.connect(send).connect(this.delay); }
  }

  piano(midi, when, duration, volume = 0.12) {
    const c = this.ctx, end = when + duration;
    const fundamental = c.createOscillator(); fundamental.type = 'triangle'; fundamental.frequency.value = this.hz(midi);
    const overtone = c.createOscillator(); overtone.type = 'sine'; overtone.frequency.value = this.hz(midi) * 2.01;
    const overtoneGain = c.createGain(); overtoneGain.gain.value = 0.16;
    const filter = c.createBiquadFilter(); filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200, when); filter.frequency.exponentialRampToValueAtTime(620, end);
    const gain = c.createGain(); gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(volume, when + 0.018);
    gain.gain.exponentialRampToValueAtTime(volume * 0.28, Math.min(end - 0.08, when + 0.42));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    fundamental.connect(filter); overtone.connect(overtoneGain).connect(filter);
    filter.connect(gain); this.route(gain, 0.28);
    fundamental.start(when); overtone.start(when);
    fundamental.stop(end + 0.03); overtone.stop(end + 0.03);
  }

  upperPiano(midi, when, duration, pan = 0.22) {
    const c = this.ctx, end = when + duration;
    const fundamental = c.createOscillator(); fundamental.type = 'sine'; fundamental.frequency.value = this.hz(midi);
    const overtone = c.createOscillator(); overtone.type = 'triangle'; overtone.frequency.value = this.hz(midi) * 2.98;
    const overtoneGain = c.createGain(); overtoneGain.gain.value = 0.09;
    const filter = c.createBiquadFilter(); filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3600, when); filter.frequency.exponentialRampToValueAtTime(1100, end);
    const gain = c.createGain(); gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.058, when + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.012, Math.min(end - 0.06, when + 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    fundamental.connect(filter); overtone.connect(overtoneGain).connect(filter); filter.connect(gain);
    if (c.createStereoPanner) {
      const panner = c.createStereoPanner(); panner.pan.value = pan; gain.connect(panner); this.route(panner, 0.34);
    } else this.route(gain, 0.34);
    fundamental.start(when); overtone.start(when);
    fundamental.stop(end + 0.03); overtone.stop(end + 0.03);
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
    if (part.chord) {
      this.pad(part.chord, when, this.barDuration * 0.94);
      this.scheduleBeat(when, index);
    }
    for (const [beat, midi, length] of part.notes) {
      // Tiny timing and velocity differences keep repetitions from feeling sequenced to a grid.
      const human = (Math.random() - 0.5) * 0.024;
      this.piano(midi, when + beat * this.beat + human, length * this.beat, 0.1 + Math.random() * 0.025);
    }
    part.counter.forEach(([beat, midi, length], i) => {
      const human = (Math.random() - 0.5) * 0.03;
      const pan = (index + i) % 2 ? 0.24 : -0.24;
      this.upperPiano(midi, when + beat * this.beat + human, length * this.beat, pan);
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
