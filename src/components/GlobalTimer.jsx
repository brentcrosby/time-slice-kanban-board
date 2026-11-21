import React, { useEffect, useId, useRef, useState } from "react";
import { Clock, Pause, Play, RotateCcw } from "lucide-react";
import { MAX_SEGMENT_SEC, MIN_SEGMENT_SEC } from "../constants";
import { loadGlobalTimer, saveGlobalTimer } from "../utils/storage";
import { parseDurationToSeconds, secsToHMS } from "../utils/time";

export function GlobalTimer({ palette, onComplete }) {
  const [timer, setTimer] = useState(loadGlobalTimer);
  const [now, setNow] = useState(Date.now);
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState("");
  const [error, setError] = useState("");
  const container = useRef(null);
  const trigger = useRef(null);
  const completion = useRef(onComplete);
  const completedTimer = useRef(null);
  const panelId = useId();
  const running = timer.endsAt != null;
  const remaining = running ? Math.max(0, timer.endsAt - now) : timer.remainingMs;
  const finished = !running && remaining === 0;
  const paused = !running && !finished && remaining < timer.durationSec * 1000;
  const display = secsToHMS(Math.ceil(remaining / 1000));

  useEffect(() => { completion.current = onComplete; }, [onComplete]);
  useEffect(() => saveGlobalTimer(timer), [timer]);
  useEffect(() => {
    if (!running) return;
    const check = () => {
      if (completedTimer.current === timer) return;
      const time = Date.now();
      setNow(time);
      if (time < timer.endsAt) return;
      completedTimer.current = timer;
      setTimer((current) => current === timer ? { ...timer, endsAt: null, remainingMs: 0 } : current);
      completion.current();
    };
    check();
    const interval = window.setInterval(check, 250);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [running, timer]);

  useEffect(() => {
    if (!open) return;
    const outside = (event) => { if (!container.current?.contains(event.target)) setOpen(false); };
    const escape = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const toggleRun = () => {
    const time = Date.now();
    setNow(time);
    if (running) {
      if (time >= timer.endsAt) return; // Let the completion check ring the chime.
      setTimer({ ...timer, endsAt: null, remainingMs: timer.endsAt - time });
    } else {
      const remainingMs = timer.remainingMs || timer.durationSec * 1000;
      setTimer({ ...timer, remainingMs, endsAt: time + remainingMs });
    }
  };

  const setLimit = (event) => {
    event.preventDefault();
    const secondsOnly = duration.trim().match(/^(\d+)\s*(?:s|secs?|seconds?)$/i);
    const seconds = secondsOnly ? Number(secondsOnly[1]) : parseDurationToSeconds(duration);
    if (!Number.isFinite(seconds) || seconds < MIN_SEGMENT_SEC || seconds > MAX_SEGMENT_SEC) {
      setError("Enter a duration between 5 seconds and 24 hours.");
      return;
    }
    setTimer({ durationSec: seconds, remainingMs: seconds * 1000, endsAt: null });
    setDuration(secsToHMS(seconds));
    setError("");
  };

  const border = { borderColor: palette.border };
  const buttonClass = "header-action-button inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm";
  return <div ref={container} className="shrink-0">
    <button ref={trigger} type="button" aria-label={`Global timer, ${finished ? "finished" : `${display} remaining`}`}
      aria-expanded={open} aria-controls={open ? panelId : undefined} title="Global timer"
      className="header-action-button flex items-center gap-1 rounded-md border px-1.5 py-2 text-xs font-medium tabular-nums sm:px-2"
      style={{ ...border, color: finished ? palette.dangerText : palette.text, backgroundColor: finished ? palette.dangerBg : running ? palette.badge : undefined }}
      onClick={() => {
        if (!open) { setDuration(secsToHMS(timer.durationSec)); setError(""); }
        setOpen(!open);
      }}>
      <Clock aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span data-global-timer-display>{display}</span>
    </button>
    <span aria-live="polite" className="sr-only">{finished ? "Global timer finished" : ""}</span>
    {open && <section id={panelId} aria-label="Global timer controls"
      className="absolute right-3 top-full mt-2 w-72 max-w-[calc(100vw-1.5rem)] space-y-3 rounded-xl border p-3 shadow-lg sm:right-4"
      style={{ ...border, color: palette.text, backgroundColor: palette.surface }}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Global timer</h2>
        <span className="text-xs" style={{ color: finished ? palette.dangerText : palette.subtext }}>{finished ? "Time’s up" : running ? "Running" : paused ? "Paused" : "Ready"}</span>
      </div>
      <div className="flex gap-2">
        <button type="button" className={`${buttonClass} flex-1`} style={border} onClick={toggleRun}>
          {running ? <Pause size={15} /> : <Play size={15} />}{running ? "Pause" : paused ? "Resume" : "Start"}
        </button>
        <button type="button" className={buttonClass} style={border} onClick={() => setTimer({ ...timer, endsAt: null, remainingMs: timer.durationSec * 1000 })}><RotateCcw size={15} />Reset</button>
      </div>
      <form className="flex items-end gap-2" onSubmit={setLimit}>
        <label className="min-w-0 flex-1 text-xs">Duration
          <input className="mt-1 block w-full rounded-md border px-2 py-1.5 text-base md:text-sm" style={{ ...border, backgroundColor: palette.surface }}
            value={duration} placeholder="10m or 5:30" onChange={(event) => { setDuration(event.target.value); setError(""); }} />
        </label>
        <button type="submit" className={buttonClass} style={border}>Set</button>
      </form>
      {error && <p role="alert" className="text-xs" style={{ color: palette.dangerText }}>{error}</p>}
    </section>}
  </div>;
}
