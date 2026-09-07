// A gritty skate-punk loop for the run: down-picked distorted power chords, a driving root bass and
// a fast punk kit, all synthesised from scratch. The guitars share two amp chains rather than getting
// per-note distortion, so the notes clip into each other the way a real cab does, and the whole kit
// feeds a short concrete room. Sixteen bars at 172 BPM: eight of a palm-muted E minor verse riff,
// eight of an open i-VI-III-VII chorus with a pentatonic hook over the second half.
export class SkateMusic {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.bus = ctx.createGain(); this.bus.gain.value = 0.62; this.bus.connect(destination);
    this.beat = 60 / 172;
    this.step = this.beat / 4;       // one sixteenth: the grid every pattern string below is written on
    this.barDuration = this.beat * 4;

    this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const noise = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;

    // A short, bright concrete slap. Skateparks are hard rooms, and this is what glues the kit and the
    // guitars together instead of the tidy tempo-locked delay a cleaner track would use.
    const length = Math.floor(ctx.sampleRate * 0.85);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const fade = Math.pow(1 - i / length, 2.6);
        data[i] = (Math.random() * 2 - 1) * fade * Math.min(1, i / 240);
      }
    }
    this.room = ctx.createConvolver(); this.room.buffer = impulse;
    this.roomGain = ctx.createGain(); this.roomGain.gain.value = 0.5;
    this.room.connect(this.roomGain).connect(this.bus);

    this.curve = this.makeCurve(2.6);
    // Two rhythm cabs hard left and right with slightly different tone and tuning: that spread is what
    // makes doubled punk guitars sound wide instead of like one buzzy synth in the middle.
    this.rhythmL = this.makeAmp(-0.55, 7.5, 3400, 0.30, -7);
    this.rhythmR = this.makeAmp(0.55, 7.0, 3000, 0.30, 8);
    this.leadAmp = this.makeAmp(0.1, 11, 4200, 0.16, 0);
    this.bassAmp = this.makeBassAmp();

    this.drums = ctx.createGain(); this.drums.gain.value = 0.9; this.drums.connect(destination);
    const drumSend = ctx.createGain(); drumSend.gain.value = 0.1;
    this.drums.connect(drumSend).connect(this.room);

    this.nextBar = ctx.currentTime + 0.6;
    this.bar = 0;

    // Guitar parts. Each bar is a list of [root MIDI, pattern] segments whose patterns tile the bar's
    // sixteen steps: 'X' accented palm mute, 'x' palm mute, 'O' open ringing power chord, '.' rest.
    const verse = [[40, 'X.x.X.x.'], [40, 'X.x.X.xx']];
    const verseB = [[40, 'X.x.X.x.'], [43, 'X.x.'], [50, 'X.x.']];
    this.song = [
      { guitar: verse,  drums: 'verse', crash: true },
      { guitar: verseB, drums: 'verse' },
      { guitar: verse,  drums: 'verse' },
      { guitar: [[43, 'O...O...'], [45, 'O...O.O.']], drums: 'verse' },
      { guitar: verse,  drums: 'verse', crash: true },
      { guitar: verseB, drums: 'verse' },
      { guitar: verse,  drums: 'verse' },
      { guitar: [[43, 'O...O...'], [45, 'O.O.O.OO']], drums: 'verse', fill: true },

      { guitar: [[40, 'O.O.O.O.'], [40, 'O.O.O.O.']], drums: 'chorus', crash: true },
      { guitar: [[48, 'O.O.O.O.'], [48, 'O.O.O.O.']], drums: 'chorus' },
      { guitar: [[43, 'O.O.O.O.'], [43, 'O.O.O.O.']], drums: 'chorus' },
      { guitar: [[50, 'O.O.O.O.'], [50, 'O.O.O.OO']], drums: 'chorus' },
      // The hook only lands on the second half of the chorus, so the loop still has somewhere to go.
      { guitar: [[40, 'O.O.O.O.'], [40, 'O.O.O.O.']], drums: 'chorus', crash: true,
        lead: [[0, 76, 3], [4, 79, 2], [6, 76, 2], [8, 71, 4], [12, 74, 4]] },
      { guitar: [[48, 'O.O.O.O.'], [48, 'O.O.O.O.']], drums: 'chorus',
        lead: [[0, 76, 3], [4, 83, 3], [8, 79, 6]] },
      { guitar: [[43, 'O.O.O.O.'], [43, 'O.O.O.O.']], drums: 'chorus',
        lead: [[0, 79, 3], [4, 76, 2], [6, 74, 2], [8, 71, 6]] },
      { guitar: [[50, 'O.O.O.O.'], [50, 'O.O.OOOO']], drums: 'chorus', fill: true,
        lead: [[0, 74, 3], [4, 76, 3], [8, 78, 6]] },
    ];

    // Drum grids on the same sixteenths. 'X' is an accent; 'o' on the hats is an open hat.
    this.kits = {
      verse:  { kick: 'x..x....x..x..x.', snare: '....x.......x...', hat: 'X.x.X.x.X.x.X.x.' },
      chorus: { kick: 'x..x....x..x....', snare: '....x.......x...', hat: 'X.x.X.x.X.x.X.o.' },
    };
  }

  hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  makeCurve(amount) {
    // Soft asymmetric clipping: tanh for the body, a slight bias for the even harmonics that make a
    // valve amp sound dirty rather than fizzy.
    const n = 2048, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = Math.tanh(x * amount + 0.12) / Math.tanh(amount + 0.12);
    }
    return curve;
  }

  makeAmp(pan, drive, tone, level, detune) {
    const c = this.ctx;
    const input = c.createGain(); input.gain.value = drive;
    const shaper = c.createWaveShaper(); shaper.curve = this.curve; shaper.oversample = '4x';
    // Cabinet: no real speaker passes the sub or the fizz, and the presence bump is where the bite is.
    const high = c.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 120; high.Q.value = 0.7;
    const presence = c.createBiquadFilter(); presence.type = 'peaking';
    presence.frequency.value = 2200; presence.Q.value = 1.1; presence.gain.value = 6;
    const low = c.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = tone; low.Q.value = 0.9;
    const out = c.createGain(); out.gain.value = level;
    input.connect(shaper).connect(high).connect(presence).connect(low).connect(out);
    if (c.createStereoPanner) {
      const panner = c.createStereoPanner(); panner.pan.value = pan; out.connect(panner).connect(this.bus);
    } else out.connect(this.bus);
    const send = c.createGain(); send.gain.value = 0.14; out.connect(send).connect(this.room);
    return { input, detune };
  }

  makeBassAmp() {
    const c = this.ctx;
    const input = c.createGain(); input.gain.value = 3.2;
    const shaper = c.createWaveShaper(); shaper.curve = this.makeCurve(1.5); shaper.oversample = '2x';
    const high = c.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 45;
    const low = c.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 1400; low.Q.value = 0.6;
    const out = c.createGain(); out.gain.value = 0.34;
    input.connect(shaper).connect(high).connect(low).connect(out).connect(this.bus);
    return { input, detune: 0 };
  }

  pick(amp, when, volume) {
    // The scrape of a plectrum across a wound string. It hits the amp input, so it distorts with the note.
    const c = this.ctx, source = c.createBufferSource(); source.buffer = this.noiseBuffer;
    const filter = c.createBiquadFilter(); filter.type = 'bandpass';
    filter.frequency.value = 2600; filter.Q.value = 0.8;
    const gain = c.createGain(); gain.gain.setValueAtTime(volume, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.02);
    source.connect(filter).connect(gain).connect(amp.input);
    source.start(when, Math.random() * 0.8); source.stop(when + 0.04);
  }

  string(amp, midi, when, duration, volume, muted) {
    const c = this.ctx, end = when + duration;
    const osc = c.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.value = this.hz(midi);
    osc.detune.value = amp.detune + (Math.random() - 0.5) * 4;
    const tone = c.createBiquadFilter(); tone.type = 'lowpass'; tone.Q.value = 0.8;
    // Palm muting is mostly a treble roll-off plus a fast decay; open strings stay bright and ring on.
    tone.frequency.setValueAtTime(muted ? 2000 : 5200, when);
    tone.frequency.exponentialRampToValueAtTime(muted ? 700 : 2200, end);
    const gain = c.createGain(); gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(volume, when + 0.004);
    if (muted) gain.gain.exponentialRampToValueAtTime(0.0001, end);
    else {
      gain.gain.exponentialRampToValueAtTime(volume * 0.55, when + duration * 0.5);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
    }
    osc.connect(tone).connect(gain).connect(amp.input);
    osc.start(when); osc.stop(end + 0.02);
  }

  power(root, when, duration, volume, muted) {
    // Root, fifth and octave: the only chord punk rhythm guitar needs, and the only one that survives
    // this much gain without turning to mud.
    for (const amp of [this.rhythmL, this.rhythmR]) {
      this.pick(amp, when, volume * 0.5);
      this.string(amp, root, when, duration, volume, muted);
      this.string(amp, root + 7, when, duration, volume * 0.85, muted);
      this.string(amp, root + 12, when, duration, volume * 0.6, muted);
    }
  }

  bass(midi, when, duration, volume) {
    const c = this.ctx, end = when + duration;
    const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = this.hz(midi - 12);
    const sub = c.createOscillator(); sub.type = 'square'; sub.frequency.value = this.hz(midi - 24);
    const subGain = c.createGain(); subGain.gain.value = 0.5;
    const gain = c.createGain(); gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(volume, when + 0.008);
    gain.gain.exponentialRampToValueAtTime(volume * 0.6, when + duration * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain); sub.connect(subGain).connect(gain); gain.connect(this.bassAmp.input);
    osc.start(when); sub.start(when); osc.stop(end + 0.02); sub.stop(end + 0.02);
  }

  hit(when, frequency, type, q, duration, volume, pan) {
    const c = this.ctx, source = c.createBufferSource(); source.buffer = this.noiseBuffer;
    const filter = c.createBiquadFilter(); filter.type = type;
    filter.frequency.value = frequency; filter.Q.value = q;
    const gain = c.createGain(); gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(volume, when + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    source.connect(filter).connect(gain);
    if (c.createStereoPanner && pan) {
      const panner = c.createStereoPanner(); panner.pan.value = pan; gain.connect(panner).connect(this.drums);
    } else gain.connect(this.drums);
    source.start(when, Math.random() * 0.8); source.stop(when + duration + 0.02);
  }

  kick(when, volume) {
    const c = this.ctx, osc = c.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(150, when); osc.frequency.exponentialRampToValueAtTime(48, when + 0.055);
    const gain = c.createGain(); gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(volume, when + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.17);
    osc.connect(gain).connect(this.drums); osc.start(when); osc.stop(when + 0.2);
    this.hit(when, 2400, 'bandpass', 1.2, 0.02, volume * 0.3, 0);   // beater click
  }

  snare(when, volume) {
    // Crack over a tuned shell. Punk snares are cranked tight and fairly dry, so the decay is short.
    const c = this.ctx;
    this.hit(when, 1900, 'bandpass', 0.5, 0.13, volume, 0.05);
    this.hit(when + 0.001, 5000, 'highpass', 0.5, 0.06, volume * 0.5, -0.05);
    for (const [frequency, level] of [[196, 0.5], [278, 0.3]]) {
      const osc = c.createOscillator(); osc.type = 'triangle'; osc.frequency.value = frequency;
      const gain = c.createGain(); gain.gain.setValueAtTime(volume * level, when);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.08);
      osc.connect(gain).connect(this.drums); osc.start(when); osc.stop(when + 0.1);
    }
  }

  hat(when, volume, open) {
    this.hit(when, open ? 7000 : 8200, 'highpass', 0.5, open ? 0.24 : 0.035, volume, 0.22);
  }

  crash(when, volume) {
    this.hit(when, 4200, 'highpass', 0.4, 1.5, volume, -0.3);
    this.hit(when, 900, 'bandpass', 0.4, 0.6, volume * 0.4, -0.25);
  }

  tom(when, frequency, volume) {
    const c = this.ctx, osc = c.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, when);
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.72, when + 0.16);
    const gain = c.createGain(); gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(volume, when + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.19);
    osc.connect(gain).connect(this.drums); osc.start(when); osc.stop(when + 0.22);
    this.hit(when, frequency * 4, 'bandpass', 0.8, 0.09, volume * 0.25, 0);
  }

  scheduleGuitar(bar, when) {
    let step = 0;
    for (const [root, pattern] of bar.guitar) {
      for (const symbol of pattern) {
        if (symbol !== '.') {
          // Down-picking is human: a few milliseconds of push and pull, and an accent on the beat.
          const at = when + step * this.step + (Math.random() - 0.5) * 0.008;
          const muted = symbol !== 'O';
          const accent = symbol === 'X' || (symbol === 'O' && step % 4 === 0);
          const volume = 0.088 * (accent ? 1 : 0.78);
          this.power(root, at, muted ? 0.1 : this.step * 2.6, volume, muted);
          this.bass(root, at, this.step * (muted ? 1.4 : 2.2), 0.16 * (accent ? 1 : 0.8));
        }
        step++;
      }
    }
  }

  scheduleDrums(bar, when) {
    const kit = this.kits[bar.drums];
    for (let i = 0; i < 16; i++) {
      // The fill takes over the last beat of the bar, so the steady pattern stops short of it.
      if (bar.fill && i >= 12) break;
      const at = when + i * this.step;
      if (kit.kick[i] !== '.') this.kick(at, i === 0 ? 0.62 : 0.52);
      if (kit.snare[i] !== '.') this.snare(at + 0.003, i === 4 ? 0.34 : 0.31);
      const symbol = kit.hat[i];
      if (symbol !== '.') this.hat(at, symbol === 'X' ? 0.085 : 0.055, symbol === 'o');
    }
    if (bar.fill) {
      // Snare into descending toms: the standard kick out of a punk section.
      this.snare(when + 12 * this.step, 0.3);
      this.snare(when + 13 * this.step, 0.26);
      this.tom(when + 14 * this.step, 210, 0.34);
      this.tom(when + 15 * this.step, 150, 0.38);
    }
    if (bar.crash) { this.crash(when, 0.13); this.kick(when, 0.62); }
  }

  scheduleBar(index, when) {
    const bar = this.song[index % this.song.length];
    this.scheduleGuitar(bar, when);
    this.scheduleDrums(bar, when);
    if (bar.lead) for (const [step, midi, length] of bar.lead) {
      const at = when + step * this.step + (Math.random() - 0.5) * 0.01;
      this.pick(this.leadAmp, at, 0.05);
      this.string(this.leadAmp, midi, at, length * this.step, 0.12, false);
    }
  }

  update(now) {
    if (this.nextBar < now - 0.5) this.nextBar = now + 0.1;
    if (this.nextBar <= now + 0.55) {
      this.scheduleBar(this.bar, this.nextBar);
      this.nextBar += this.barDuration;
      this.bar = (this.bar + 1) % this.song.length;
    }
  }
}
