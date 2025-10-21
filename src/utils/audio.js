import { clamp } from "./misc";

export function createAudioCtx() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;
  return new AudioContextCtor();
}

export function playChime(ctxRef, { type = "ping", volume = 0.7 } = {}) {
  const ctx = ctxRef.current;
  if (!ctx) return;
  const start = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = clamp(volume, 0, 1);
  master.connect(ctx.destination);

  const envelope = (node, attack = 0.002, decay = 0.25) => {
    node.gain.setValueAtTime(0.0001, start);
    node.gain.exponentialRampToValueAtTime(1.0, start + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
  };

  const tone = (frequency, duration = 0.3, waveform = "sine", detune = 0) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = waveform;
    osc.frequency.setValueAtTime(frequency, start);
    if (detune) osc.detune.setValueAtTime(detune, start);
    envelope(gain, 0.002, duration);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  };

  switch (type) {
    case "bell":
      tone(660, 0.8, "sine");
      tone(1320, 0.9, "sine", -5);
      break;
    case "alarm":
      tone(880, 0.18, "square");
      setTimeout(() => {
        if (ctx.state !== "closed") tone(880, 0.18, "square");
      }, 220);
      break;
    case "wood":
      tone(520, 0.12, "triangle");
      tone(780, 0.08, "triangle");
      break;
    case "ping":
    default:
      tone(880, 0.25, "sine");
      break;
  }
}
