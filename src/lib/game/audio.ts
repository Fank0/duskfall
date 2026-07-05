"use client";

// Procedural audio engine — Web Audio API.
// No external audio files. All sounds are synthesized.

type Mood = "peace" | "combat" | "tension";

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let currentMood: Mood | null = null;
let musicNodes: OscillatorNode[] = [];
let musicInterval: ReturnType<typeof setInterval> | null = null;
let weatherNodes: { osc: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;

let musicVolume = 0.4;
let sfxVolume = 0.5;
let musicEnabled = true;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.8;
      masterGain.connect(ctx.destination);

      musicGain = ctx.createGain();
      musicGain.gain.value = musicVolume;
      musicGain.connect(masterGain);

      sfxGain = ctx.createGain();
      sfxGain.gain.value = sfxVolume;
      sfxGain.connect(masterGain);
    } catch {
      return null;
    }
  }
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

// ---------- Background music ----------

function noteFreq(mood: Mood, step: number): number {
  // Base frequencies for each mood (pentatonic-ish for pleasantness)
  const bases = {
    peace: [220, 246.94, 277.18, 329.63, 369.99], // A minor pentatonic
    combat: [146.83, 164.81, 196, 220, 246.94], // D minor, lower tense
    tension: [110, 123.47, 130.81, 146.83, 164.81], // A, very low
  };
  const scale = bases[mood];
  return scale[step % scale.length] * (step >= scale.length ? 2 : 1);
}

function playMusicNote(mood: Mood) {
  if (!ctx || !musicGain || !musicEnabled) return;
  const now = ctx.currentTime;
  const step = Math.floor(Math.random() * 5);
  const freq = noteFreq(mood, step);

  const osc = ctx.createOscillator();
  // BG3-style: warm pad sounds for peace, sharper for combat, deep drone for tension
  osc.type = mood === "combat" ? "sawtooth" : mood === "tension" ? "triangle" : "sine";
  osc.frequency.value = freq;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  // Softer filter for peace, brighter for combat
  filter.frequency.value = mood === "peace" ? 1500 : mood === "combat" ? 1000 : 600;
  filter.Q.value = mood === "peace" ? 0.5 : 1.5;

  const gain = ctx.createGain();
  // Longer, smoother fades for peace (BG3 ambient style)
  const duration = mood === "peace" ? 3.5 : mood === "combat" ? 1.0 : 2.5;
  const attack = mood === "peace" ? 0.8 : 0.15;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(mood === "peace" ? 0.15 : 0.2, now + attack);
  gain.gain.linearRampToValueAtTime(0, now + duration);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(musicGain);

  osc.start(now);
  osc.stop(now + duration);

  // Harmonic layer for peace mood (BG3-style ethereal pad)
  if (mood === "peace") {
    // Fifth above for harmony
    const harm = ctx.createOscillator();
    harm.type = "sine";
    harm.frequency.value = freq * 1.5;
    const harmGain = ctx.createGain();
    harmGain.gain.setValueAtTime(0, now);
    harmGain.gain.linearRampToValueAtTime(0.06, now + 1.0);
    harmGain.gain.linearRampToValueAtTime(0, now + duration);
    harm.connect(harmGain);
    harmGain.connect(musicGain);
    harm.start(now);
    harm.stop(now + duration);

    // Bell-like high harmonic (occasional)
    if (Math.random() > 0.6) {
      const bell = ctx.createOscillator();
      bell.type = "sine";
      bell.frequency.value = freq * 2;
      const bellGain = ctx.createGain();
      bellGain.gain.setValueAtTime(0, now + 0.5);
      bellGain.gain.linearRampToValueAtTime(0.05, now + 0.6);
      bellGain.gain.linearRampToValueAtTime(0, now + 2.5);
      bell.connect(bellGain);
      bellGain.connect(musicGain);
      bell.start(now + 0.5);
      bell.stop(now + 2.5);
    }
  }

  // Combat: occasional rhythmic pulse (BG3-style battle drums)
  if (mood === "combat" && Math.random() > 0.5) {
    const drum = ctx.createOscillator();
    drum.type = "triangle";
    drum.frequency.value = 55;
    const drumGain = ctx.createGain();
    drumGain.gain.setValueAtTime(0.15, now);
    drumGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    drum.connect(drumGain);
    drumGain.connect(musicGain);
    drum.start(now);
    drum.stop(now + 0.2);
  }
}

function stopMusicNodes() {
  for (const osc of musicNodes) {
    try { osc.stop(); } catch {}
  }
  musicNodes = [];
  if (musicInterval) {
    clearInterval(musicInterval);
    musicInterval = null;
  }
}

export function startMusic(mood: Mood) {
  if (!ensureCtx() || !musicEnabled) return;
  if (currentMood === mood) return;
  currentMood = mood;
  stopMusicNodes();

  const interval = mood === "peace" ? 2000 : mood === "combat" ? 600 : 1200;
  playMusicNote(mood);
  musicInterval = setInterval(() => playMusicNote(mood), interval);
}

export function stopMusic() {
  stopMusicNodes();
  currentMood = null;
}

export function setMusicVolume(v: number) {
  musicVolume = Math.max(0, Math.min(1, v));
  if (musicGain) musicGain.gain.value = musicVolume;
}

export function setSfxVolume(v: number) {
  sfxVolume = Math.max(0, Math.min(1, v));
  if (sfxGain) sfxGain.gain.value = sfxVolume;
}

export function setMusicEnabled(enabled: boolean) {
  musicEnabled = enabled;
  if (!enabled) stopMusic();
}

// ---------- SFX ----------

function playTone(
  type: OscillatorType,
  freq: number,
  duration: number,
  volume: number = 0.3,
  filterFreq?: number
) {
  if (!ensureCtx() || !sfxGain) return;
  const now = ctx!.currentTime;
  const osc = ctx!.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;

  let node: AudioNode = osc;
  if (filterFreq) {
    const filter = ctx!.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterFreq;
    osc.connect(filter);
    node = filter;
  }

  const gain = ctx!.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  node.connect(gain);
  gain.connect(sfxGain);
  osc.start(now);
  osc.stop(now + duration);
}

/** Play a noise burst (for impacts, whooshes). */
function playNoise(
  duration: number,
  volume: number = 0.2,
  filterType: BiquadFilterType = "lowpass",
  filterFreq: number = 1000,
  freqEnd?: number
) {
  if (!ensureCtx() || !sfxGain || !ctx) return;
  const now = ctx.currentTime;
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(filterFreq, now);
  if (freqEnd) filter.frequency.exponentialRampToValueAtTime(freqEnd, now + duration);
  filter.Q.value = 1;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(sfxGain);
  source.start(now);
  source.stop(now + duration);
}

/** Dice roll — wooden clatter (BG3-style). */
export function sfxDiceRoll() {
  if (!ensureCtx()) return;
  // 3-4 quick wooden clicks with slight pitch variation
  const count = 3 + Math.floor(Math.random() * 2);
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      playTone("triangle", 180 + Math.random() * 80, 0.05, 0.2, 1000);
      playNoise(0.04, 0.1, "bandpass", 2000);
    }, i * 60);
  }
}

/** Attack hit — meaty impact with low thud + high crunch (BG3-style). */
export function sfxHit() {
  // Low thud
  playTone("triangle", 80, 0.15, 0.4, 400);
  // Mid crunch
  setTimeout(() => playNoise(0.1, 0.25, "lowpass", 800, 200), 10);
  // High metallic ring
  setTimeout(() => playTone("sine", 1200, 0.08, 0.1, 3000), 20);
}

/** Critical hit — dramatic ascending chord with shimmer (BG3-style). */
export function sfxCrit() {
  // Impact
  playTone("triangle", 60, 0.2, 0.5, 300);
  playNoise(0.15, 0.3, "lowpass", 600, 100);
  // Ascending chord
  setTimeout(() => playTone("sine", 523, 0.2, 0.3), 50);
  setTimeout(() => playTone("sine", 659, 0.2, 0.3), 120);
  setTimeout(() => playTone("sine", 784, 0.3, 0.3), 190);
  // Shimmer
  setTimeout(() => playTone("sine", 1568, 0.4, 0.15), 250);
}

/** Miss — soft whoosh (sword cutting air). */
export function sfxMiss() {
  if (!ensureCtx() || !sfxGain || !ctx) return;
  playNoise(0.25, 0.15, "bandpass", 1500, 400);
}

/** Heal — warm ascending bell with harmonic (BG3-style). */
export function sfxHeal() {
  playTone("sine", 523, 0.3, 0.2);
  setTimeout(() => playTone("sine", 659, 0.3, 0.18), 80);
  setTimeout(() => playTone("sine", 784, 0.5, 0.15), 160);
  // Sparkle
  setTimeout(() => playTone("sine", 1568, 0.3, 0.08), 240);
}

/** Level up — triumphant fanfare (BG3-style). */
export function sfxLevelUp() {
  playTone("triangle", 392, 0.15, 0.25);
  setTimeout(() => playTone("triangle", 523, 0.15, 0.25), 100);
  setTimeout(() => playTone("triangle", 659, 0.15, 0.25), 200);
  setTimeout(() => playTone("triangle", 784, 0.3, 0.25), 300);
  setTimeout(() => playTone("sine", 1047, 0.6, 0.2), 400);
  // Shimmer
  setTimeout(() => playTone("sine", 2093, 0.5, 0.1), 500);
}

/** Condition applied — soft magical chime. */
export function sfxConditionApply() {
  playTone("sine", 880, 0.15, 0.12);
  setTimeout(() => playTone("sine", 1109, 0.2, 0.1), 60);
  setTimeout(() => playTone("sine", 1319, 0.3, 0.08), 120);
}

/** Monster death — low descending growl with impact. */
export function sfxMonsterDeath() {
  if (!ensureCtx() || !sfxGain || !ctx) return;
  // Impact
  playTone("triangle", 150, 0.1, 0.3, 500);
  // Descending growl
  setTimeout(() => {
    const now = ctx!.currentTime;
    const osc = ctx!.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.8);
    const filter = ctx!.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 400;
    const gain = ctx!.createGain();
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(sfxGain!);
    osc.start(now);
    osc.stop(now + 0.8);
  }, 50);
}

/** UI click — soft wooden tick. */
export function sfxClick() {
  playTone("triangle", 600, 0.03, 0.08, 2000);
}

/** Error — soft dissonant. */
export function sfxError() {
  playTone("sawtooth", 200, 0.12, 0.12, 500);
  setTimeout(() => playTone("sawtooth", 180, 0.15, 0.12, 500), 80);
}

/** Combat start — dramatic drum + horn (BG3-style). */
export function sfxCombatStart() {
  // Low drum
  playTone("triangle", 55, 0.4, 0.4, 200);
  playNoise(0.2, 0.2, "lowpass", 300);
  // Horn
  setTimeout(() => playTone("sawtooth", 110, 0.5, 0.2, 600), 100);
  setTimeout(() => playTone("sawtooth", 165, 0.5, 0.15, 600), 150);
}

/** Turn change — soft notification bell. */
export function sfxTurnChange() {
  playTone("sine", 660, 0.08, 0.1);
  setTimeout(() => playTone("sine", 880, 0.12, 0.08), 40);
}

/** Move — soft footstep (BG3-style). */
export function sfxMove() {
  playNoise(0.08, 0.12, "lowpass", 400, 150);
}

/** Target select — magical lock-on sound (BG3-style). */
export function sfxTargetSelect() {
  playTone("sine", 880, 0.06, 0.1);
  setTimeout(() => playTone("sine", 1319, 0.1, 0.08), 30);
}

/** Target cancel — soft descending tone. */
export function sfxTargetCancel() {
  playTone("sine", 660, 0.05, 0.08);
  setTimeout(() => playTone("sine", 440, 0.08, 0.06), 30);
}

/** Spell cast — magical whoosh + chime (BG3-style). */
export function sfxSpellCast() {
  playNoise(0.2, 0.12, "bandpass", 2000, 800);
  setTimeout(() => playTone("sine", 1047, 0.15, 0.12), 50);
  setTimeout(() => playTone("sine", 1568, 0.2, 0.08), 100);
}

/** Ability use — short magical burst. */
export function sfxAbilityUse() {
  playTone("sine", 659, 0.08, 0.12);
  setTimeout(() => playTone("sine", 880, 0.1, 0.1), 40);
  setTimeout(() => playNoise(0.1, 0.08, "highpass", 3000, 1000), 30);
}

// ---------- Weather ambient ----------

export function startWeatherAmbient(weather: "rain" | "storm" | "clear" | "fog" | "snow") {
  if (!ensureCtx() || !musicGain || !ctx) return;
  stopWeatherAmbient();
  if (weather === "clear" || weather === "fog" || weather === "snow") return;

  // Rain/storm = filtered noise loop
  const bufferSize = 2 * ctx.sampleRate;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }
  const noise = ctx!.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;

  const filter = ctx!.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = weather === "storm" ? 800 : 1200;
  filter.Q.value = 0.5;

  const gain = ctx!.createGain();
  gain.gain.value = weather === "storm" ? 0.15 : 0.08;

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(musicGain);
  noise.start();

  weatherNodes = { osc: noise as any, gain, filter };

  // Storm: occasional thunder
  if (weather === "storm") {
    const thunderInterval = setInterval(() => {
      if (Math.random() > 0.6) {
        playTone("triangle", 60, 1.0, 0.4, 200);
      }
    }, 4000);
    (weatherNodes as any).thunder = thunderInterval;
  }
}

export function stopWeatherAmbient() {
  if (weatherNodes) {
    try { weatherNodes.osc.stop(); } catch {}
    if ((weatherNodes as any).thunder) clearInterval((weatherNodes as any).thunder);
    weatherNodes = null;
  }
}

// ---------- Init ----------

export function resumeAudio() {
  ensureCtx();
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
}

/** Pick a music mood based on game state. */
export function moodForState(opts: { combatActive: boolean; timeOfDay: string; weather: string }): Mood {
  if (opts.combatActive) return "combat";
  if (opts.timeOfDay === "night") return "tension";
  if (opts.weather === "storm") return "tension";
  return "peace";
}
