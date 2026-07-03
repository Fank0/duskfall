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
let musicFilters: BiquadFilterNode[] = [];
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
  osc.type = mood === "combat" ? "triangle" : "sine";
  osc.frequency.value = freq;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = mood === "peace" ? 2000 : mood === "combat" ? 1200 : 800;
  filter.Q.value = 1;

  const gain = ctx.createGain();
  const duration = mood === "peace" ? 2.5 : mood === "combat" ? 0.8 : 1.8;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.3, now + 0.3);
  gain.gain.linearRampToValueAtTime(0, now + duration);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(musicGain);

  osc.start(now);
  osc.stop(now + duration);

  // Bell-like harmonic for peace mood
  if (mood === "peace" && Math.random() > 0.5) {
    const bell = ctx.createOscillator();
    bell.type = "sine";
    bell.frequency.value = freq * 2;
    const bellGain = ctx.createGain();
    bellGain.gain.setValueAtTime(0, now);
    bellGain.gain.linearRampToValueAtTime(0.1, now + 0.1);
    bellGain.gain.linearRampToValueAtTime(0, now + 1.5);
    bell.connect(bellGain);
    bellGain.connect(musicGain);
    bell.start(now);
    bell.stop(now + 1.5);
  }
}

function stopMusicNodes() {
  for (const osc of musicNodes) {
    try { osc.stop(); } catch {}
  }
  musicNodes = [];
  musicFilters = [];
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

/** Dice roll — wooden clatter (BG3-style). */
export function sfxDiceRoll() {
  if (!ensureCtx()) return;
  // 3-4 quick low clicks
  const count = 3 + Math.floor(Math.random() * 2);
  for (let i = 0; i < count; i++) {
    setTimeout(() => playTone("triangle", 180 + Math.random() * 80, 0.05, 0.2, 1000), i * 60);
  }
}

/** Attack hit — short low thud. */
export function sfxHit() {
  playTone("triangle", 120, 0.2, 0.4, 600);
}

/** Critical hit — ascending chord. */
export function sfxCrit() {
  playTone("sine", 440, 0.15, 0.3);
  setTimeout(() => playTone("sine", 554, 0.15, 0.3), 80);
  setTimeout(() => playTone("sine", 659, 0.25, 0.3), 160);
}

/** Miss — soft whoosh. */
export function sfxMiss() {
  if (!ensureCtx() || !sfxGain || !ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(400, now);
  osc.frequency.exponentialRampToValueAtTime(150, now + 0.3);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  osc.connect(gain);
  gain.connect(sfxGain);
  osc.start(now);
  osc.stop(now + 0.3);
}

/** Heal — ascending bell. */
export function sfxHeal() {
  playTone("sine", 523, 0.3, 0.25);
  setTimeout(() => playTone("sine", 659, 0.4, 0.2), 100);
}

/** Level up — triumphant chord. */
export function sfxLevelUp() {
  playTone("sine", 523, 0.2, 0.3);
  setTimeout(() => playTone("sine", 659, 0.2, 0.3), 100);
  setTimeout(() => playTone("sine", 784, 0.2, 0.3), 200);
  setTimeout(() => playTone("sine", 1047, 0.5, 0.3), 300);
}

/** Condition applied — soft chime. */
export function sfxConditionApply() {
  playTone("sine", 880, 0.2, 0.15);
  setTimeout(() => playTone("sine", 1109, 0.3, 0.1), 80);
}

/** Monster death — low descending tone. */
export function sfxMonsterDeath() {
  if (!ensureCtx() || !sfxGain || !ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(200, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.6);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
  osc.connect(gain);
  gain.connect(sfxGain);
  osc.start(now);
  osc.stop(now + 0.6);
}

/** UI click — short tick. */
export function sfxClick() {
  playTone("square", 800, 0.03, 0.08, 2000);
}

/** Error — dissonant. */
export function sfxError() {
  playTone("sawtooth", 200, 0.15, 0.15, 500);
  setTimeout(() => playTone("sawtooth", 180, 0.2, 0.15, 500), 100);
}

/** Combat start — dramatic. */
export function sfxCombatStart() {
  playTone("triangle", 110, 0.5, 0.3, 400);
  setTimeout(() => playTone("triangle", 146, 0.5, 0.25, 400), 150);
}

/** Turn change — soft notification. */
export function sfxTurnChange() {
  playTone("sine", 660, 0.1, 0.12);
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

export function initAudio() {
  ensureCtx();
}

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
