import { clamp } from "./misc";

export function createAudioCtx() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;
  return new AudioContextCtor();
}

export function ensureAudioContext(ctxRef) {
  if (!ctxRef) return null;
  if (!ctxRef.current || ctxRef.current.state === "closed") {
    ctxRef.current = createAudioCtx();
  }
  if (!ctxRef.current) {
    console.log("[Audio] ensureAudioContext: failed to create AudioContext");
  }
  return ctxRef.current;
}

export function playChime(ctxRef, { type = "ping", volume = 0.7 } = {}, attempt = 0) {
  const ctx = ensureAudioContext(ctxRef);
  console.log("[Audio] playChime invoked", {
    hasCtxRef: Boolean(ctxRef),
    hasCtx: Boolean(ctx),
    ctxState: ctx?.state,
    type,
    volume,
    attempt,
  });
  if (!ctx) return;
  if (ctx.state !== "running") {
    console.log("[Audio] AudioContext not running, attempting resume", {
      state: ctx.state,
      attempt,
    });
    if (attempt > 2) return;
    try {
      const resumeResult = ctx.resume?.();
      if (resumeResult && typeof resumeResult.then === "function") {
        resumeResult
          .then(() => {
            console.log("[Audio] AudioContext resume success");
            playChime(ctxRef, { type, volume }, attempt + 1);
          })
          .catch((error) => {
            console.log("[Audio] AudioContext resume rejected", error);
          });
      } else {
        console.log("[Audio] AudioContext resume returned sync", typeof resumeResult);
        playChime(ctxRef, { type, volume }, attempt + 1);
      }
    } catch {
      // Ignore resume errors; if resume fails we simply bail for this attempt.
    }
    return;
  }
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
    console.log("[Audio] tone scheduled", { frequency, duration, waveform, detune, ctxTime: start });
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
      console.log("[Audio] playing bell chime");
      tone(660, 0.8, "sine");
      tone(1320, 0.9, "sine", -5);
      break;
    case "alarm":
      console.log("[Audio] playing alarm chime");
      tone(880, 0.18, "square");
      setTimeout(() => {
        if (ctx.state !== "closed") {
          console.log("[Audio] alarm follow-up tone fired", { ctxState: ctx.state });
          tone(880, 0.18, "square");
        } else {
          console.log("[Audio] alarm follow-up tone skipped - ctx closed");
        }
      }, 220);
      break;
    case "wood":
      console.log("[Audio] playing wood chime");
      tone(520, 0.12, "triangle");
      tone(780, 0.08, "triangle");
      break;
    case "ping":
    default:
      console.log("[Audio] playing ping chime");
      tone(880, 0.25, "sine");
      break;
  }
}
