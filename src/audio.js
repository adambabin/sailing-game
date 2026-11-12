// All sound is made on the fly with the browser's Web Audio system, so there
// are no audio files: hiss shaped into surf, wind and rain, short tones for
// creaks and gulls, and a slow, sparse tune that writes itself as it plays.

const MODES = ['all', 'effects', 'off'];
export const MODE_LABELS = { all: 'Sound', effects: 'No music', off: 'Muted' };

const rand = (a, b) => a + Math.random() * (b - a);
const NOTE = (semitonesFromA4) => 440 * Math.pow(2, semitonesFromA4 / 12);
// D major pentatonic for the melody, and four gentle chords underneath.
const MELODY = [-7, -5, -3, 0, 2, 5, 7, 9].map(NOTE);
const CHORDS = [[-19, -12, -3], [-22, -15, -7], [-26, -19, -10], [-24, -17, -8]].map((c) => c.map(NOTE));

export function createAudio() {
  let ctx = null, mode = 'all';
  let master, fx, music, analyser, noiseBuf, echoIn;
  const layer = {};
  const t = { creak: 2, flap: 0, gull: 6, chord: 1, note: 4, chordIndex: 0, melodyIndex: 3, lastRoll: 0 };

  try { const saved = localStorage.getItem('tradewind-sound'); if (MODES.includes(saved)) mode = saved; } catch {}

  function noise(filterType, freq, q = 0.7) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(fx);
    src.start(0, Math.random() * 3);
    return { filter, gain };
  }

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    analyser = ctx.createAnalyser();
    const limiter = ctx.createDynamicsCompressor(); // keeps a gale from distorting
    master.connect(limiter).connect(analyser).connect(ctx.destination);
    fx = ctx.createGain();
    music = ctx.createGain();
    fx.connect(master);
    music.connect(master);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    layer.surf = noise('lowpass', 480);
    layer.wash = noise('bandpass', 1100, 0.5);
    layer.wind = noise('bandpass', 500, 0.9);
    layer.whistle = noise('bandpass', 1100, 14);
    layer.hull = noise('bandpass', 1900, 0.6);
    layer.rain = noise('highpass', 3200);

    // A soft echo that gives the music some space.
    echoIn = ctx.createGain();
    const dry = ctx.createGain();
    echoIn.connect(dry).connect(music);
    for (const [time, feedback] of [[0.37, 0.42], [0.53, 0.36]]) {
      const delay = ctx.createDelay(1);
      delay.delayTime.value = time;
      const fb = ctx.createGain();
      fb.gain.value = feedback;
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = 2200;
      echoIn.connect(delay);
      delay.connect(damp).connect(fb).connect(delay);
      damp.connect(music);
    }
    applyMode();
  }

  function applyMode() {
    if (!ctx) return;
    const now = ctx.currentTime;
    master.gain.setTargetAtTime(mode === 'off' ? 0 : 2, now, 0.1);
    music.gain.setTargetAtTime(mode === 'all' ? 1 : 0, now, 0.3);
  }

  // One note: a tone that fades in and out. `to` is the gain node it plays into.
  function tone(type, freq, peak, attack, release, to, when = ctx.currentTime, glideTo = 0) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, when + attack + release);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + attack + release);
    osc.connect(g).connect(to);
    osc.start(when);
    osc.stop(when + attack + release + 0.05);
    return osc;
  }

  // A short burst of filtered hiss (sail flaps, chain links, splashes).
  function burst(type, freq, peak, length, when = ctx.currentTime, q = 1) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + length * 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, when + length);
    src.connect(filter).connect(g).connect(fx);
    src.start(when, Math.random() * 3, length + 0.05);
  }

  function creak(loudness) {
    // Timber working: a low buzzy tone squeezed through a narrow filter, bending in pitch.
    const now = ctx.currentTime, length = rand(0.25, 0.7), f = rand(55, 110);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = rand(500, 1300);
    filter.Q.value = 9;
    const g = ctx.createGain();
    g.gain.value = loudness;
    filter.connect(g).connect(fx);
    tone('sawtooth', f, 1, length * 0.3, length * 0.7, filter, now, f * rand(0.75, 1.3));
  }

  function gull() {
    const calls = 2 + Math.floor(Math.random() * 3);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (pan.pan) pan.pan.value = rand(-0.8, 0.8);
    pan.connect(fx);
    const vol = rand(0.012, 0.03);
    for (let i = 0; i < calls; i++) {
      const when = ctx.currentTime + i * rand(0.28, 0.4);
      tone('triangle', rand(1500, 1800), vol, 0.06, 0.24, pan, when, rand(950, 1150));
    }
  }

  return {
    get mode() { return mode; },
    // Browsers only allow sound after a click, tap or key press, so this is called from those.
    start() {
      if (!ctx) build();
      else if (ctx.state === 'suspended' && !document.hidden) ctx.resume();
    },
    cycleMode() {
      mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
      try { localStorage.setItem('tradewind-sound', mode); } catch {}
      applyMode();
      return mode;
    },
    pause(hidden) {
      if (ctx) hidden ? ctx.suspend() : ctx.resume();
    },
    anchor(dropping) {
      if (!ctx) return;
      const now = ctx.currentTime;
      const links = dropping ? 16 : 12, gap = dropping ? 0.07 : 0.13;
      for (let i = 0; i < links; i++) {
        const when = now + i * gap + rand(0, 0.02);
        burst('highpass', 2500, 0.12, 0.05, when);
        tone('square', rand(1800, 3200), 0.012, 0.004, 0.06, fx, when);
      }
      if (dropping) {
        burst('lowpass', 900, 0.35, 0.9, now + links * gap);
        burst('bandpass', 2600, 0.12, 0.6, now + links * gap + 0.05, 0.6);
      }
    },
    footstep(onWood) {
      if (!ctx) return;
      if (onWood) burst('bandpass', rand(260, 340), 0.22, 0.07, ctx.currentTime, 3); // a hollow knock on the planks
      else burst('highpass', rand(1500, 2300), 0.035, 0.09); // a scuff of sand
    },
    // A splash, quieter the further away it is.
    splash(distance = 10) {
      if (!ctx) return;
      const vol = 0.2 / (1 + distance / 12);
      burst('lowpass', 1300, vol, 0.4);
      burst('bandpass', 3000, vol * 0.4, 0.3, ctx.currentTime + 0.03, 0.6);
    },
    // A bronze bell: a few ringing tones that die away slowly.
    bell() {
      if (!ctx) return;
      const now = ctx.currentTime;
      for (const [f, v, len] of [[392, 0.12, 4], [784, 0.06, 3], [1046, 0.04, 2.2], [1318, 0.025, 1.6]]) tone('sine', f, v, 0.005, len, fx, now);
    },
    // A spade going into sand.
    dig() {
      if (!ctx) return;
      burst('lowpass', 500, 0.3, 0.16);
      burst('highpass', 2200, 0.05, 0.22, ctx.currentTime + 0.05);
    },
    // Cannon fire, quieter and duller the further off it is.
    cannon(distance = 0) {
      if (!ctx) return;
      const near = 1 / (1 + distance / 90), now = ctx.currentTime;
      burst('lowpass', 900 - 500 * (1 - near), 0.9 * near, 0.35);
      tone('sine', 70, 0.5 * near, 0.005, 0.5, fx, now, 38);
      burst('lowpass', 260, 0.35 * near, 1.4, now + 0.05);
    },
    // A ball smashing into timber.
    crunch(distance = 0) {
      if (!ctx) return;
      const near = 1 / (1 + distance / 60);
      burst('bandpass', rand(700, 1200), 0.45 * near, 0.18, ctx.currentTime, 1.2);
      burst('lowpass', 300, 0.3 * near, 0.3);
    },
    // A ship going down: a long groan and rush of water.
    sink() {
      if (!ctx) return;
      const now = ctx.currentTime;
      tone('sawtooth', 90, 0.05, 0.4, 3.5, fx, now, 45);
      burst('lowpass', 500, 0.3, 4.5, now + 0.5);
    },
    coin() {
      if (!ctx) return;
      const now = ctx.currentTime;
      tone('sine', 2637, 0.05, 0.003, 0.25, fx, now);
      tone('sine', 3520, 0.04, 0.003, 0.3, fx, now + 0.07);
    },
    // Called every frame with what is happening in the world.
    update(dt, s) {
      if (!ctx || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      const set = (param, value, glide = 0.4) => param.setTargetAtTime(value, now, glide);
      const windN = Math.min(1.2, s.wind / 30); // 0 = still, 1 = gale
      const swell = 0.75 + 0.25 * Math.sin(now * 0.7) + 0.12 * Math.sin(now * 1.9);
      const gust = 0.8 + 0.2 * Math.sin(now * 0.31) + 0.15 * Math.sin(now * 0.83 + 1);

      set(layer.surf.gain.gain, (0.05 + 0.13 * s.sea) * swell);
      set(layer.surf.filter.frequency, 380 + 260 * s.sea);
      set(layer.wash.gain.gain, 0.012 * s.sea * s.sea * (1.6 - swell));
      set(layer.wind.gain.gain, Math.pow(windN, 1.5) * 0.3 * gust);
      set(layer.wind.filter.frequency, 280 + 700 * windN * gust);
      set(layer.whistle.gain.gain, Math.max(0, windN - 0.6) * 0.5 * gust);
      set(layer.whistle.filter.frequency, 900 + 500 * gust * windN, 0.8);
      set(layer.hull.gain.gain, Math.min(1, s.speed / 11) * 0.07);
      set(layer.rain.gain.gain, s.rain * 0.13);

      // Sails flapping when pointed into the wind.
      if (s.luffing && (t.flap -= dt) <= 0) {
        t.flap = rand(0.12, 0.38);
        burst('lowpass', rand(500, 1100), 0.1 + 0.15 * windN, rand(0.07, 0.14));
      }
      // Timbers creak as the hull rolls; more often in a seaway.
      const rollRate = Math.abs(s.roll - t.lastRoll) / Math.max(dt, 0.001);
      t.lastRoll = s.roll;
      if ((t.creak -= dt * (0.5 + s.sea + rollRate * 6)) <= 0) {
        t.creak = rand(1.5, 5);
        creak(rand(0.02, 0.045));
      }
      // Gulls by day near land.
      if (s.nearLand && s.night < 0.3 && s.rain < 0.2 && (t.gull -= dt) <= 0) {
        t.gull = rand(5, 18);
        gull();
      }

      // --- Music: slow chords with a wandering melody, quieter in rough weather and at night.
      if (mode !== 'all') return;
      const level = (1 - 0.6 * Math.max(0, windN - 0.5) * 2) * (1 - 0.3 * s.night);
      if ((t.chord -= dt) <= 0) {
        t.chord = 11;
        const chord = CHORDS[t.chordIndex++ % CHORDS.length];
        for (const f of chord) {
          tone('sine', f, 0.035 * level, 3.5, 9, echoIn);
          tone('triangle', f * 1.003, 0.012 * level, 4, 8, echoIn);
        }
      }
      if ((t.note -= dt) <= 0) {
        t.note = rand(1.2, 4.5) * (1 + s.night);
        t.melodyIndex = Math.max(0, Math.min(MELODY.length - 1, t.melodyIndex + Math.round(rand(-2.4, 2.4))));
        const f = MELODY[t.melodyIndex];
        tone('sine', f, 0.05 * level, 0.02, 2.6, echoIn);
        tone('triangle', f * 2, 0.008 * level, 0.01, 1.2, echoIn);
        if (Math.random() < 0.3) tone('sine', MELODY[Math.max(0, t.melodyIndex - 2)], 0.03 * level, 0.02, 2.2, echoIn, now + 0.45);
      }
    },
    // Loudness right now (0 = silence). Used for testing.
    level() {
      if (!ctx) return 0;
      const buf = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(buf);
      return Math.sqrt(buf.reduce((a, v) => a + v * v, 0) / buf.length);
    },
  };
}
