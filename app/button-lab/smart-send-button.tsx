"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./smart-send-button.module.css";

type State = "idle" | "loading" | "success" | "error";
type Outcome = "success" | "failure";

const labels: Record<State, string> = {
  idle: "Send message", loading: "Sending...", success: "Sent!", error: "Try again",
};
const feedback: Record<State, string> = {
  idle: "Ready. Choose an outcome, then send a simulated message.",
  loading: "Sending a simulated message. Please wait.",
  success: "Sent! The simulation succeeded. Ready again shortly.",
  error: "Failed. The simulation did not send. Choose an outcome and try again, or reset.",
};

export default function SmartSendButton() {
  const [state, setState] = useState<State>("idle");
  const [outcome, setOutcome] = useState<Outcome>("success");
  // The synchronous lock also guards two clicks before React renders loading.
  const locked = useRef(false);
  const operationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (operationTimer.current !== null) clearTimeout(operationTimer.current);
    if (confirmationTimer.current !== null) clearTimeout(confirmationTimer.current);
    operationTimer.current = null;
    confirmationTimer.current = null;
  }

  useEffect(() => () => clearTimers(), []);

  function send() {
    if (locked.current) return;
    locked.current = true;
    // Capture this run's outcome; radio changes only affect the next send.
    const result = outcome;
    setState("loading");
    operationTimer.current = setTimeout(() => {
      operationTimer.current = null;
      if (result === "failure") {
        locked.current = false;
        setState("error");
        return;
      }
      setState("success");
      confirmationTimer.current = setTimeout(() => {
        confirmationTimer.current = null;
        locked.current = false;
        setState("idle");
      }, 1200);
    }, 1000);
  }

  function reset() {
    clearTimers();
    locked.current = false;
    setState("idle");
  }

  const unavailable = state === "loading" || state === "success";

  return (
    <div className="mt-8 rounded-card border border-border bg-surface p-4 sm:p-6">
      <fieldset aria-describedby="outcome-help" className="min-w-0">
        <legend className="font-semibold">Simulation outcome</legend>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
          {(["success", "failure"] as const).map((value) => (
            <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3">
              <input type="radio" name="outcome" value={value} checked={outcome === value}
                onChange={() => setOutcome(value)} className={styles.radio} />
              Simulate {value === "success" ? "Success" : "Failure"}
            </label>
          ))}
        </div>
        <p id="outcome-help" className="mt-2 text-sm leading-relaxed text-muted">You can change this while sending. It applies to the next run.</p>
      </fieldset>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="button" onClick={send} data-send-state={state}
          aria-disabled={unavailable} aria-busy={state === "loading"}
          aria-describedby="simulation-note send-feedback" className={styles.send}>
          <span key={state} className={styles.label}>
            {state === "loading" && <span aria-hidden="true" className={styles.spinner} />}
            {state === "success" && <span aria-hidden="true">✓</span>}
            {state === "error" && <span aria-hidden="true">!</span>}
            {labels[state]}
          </span>
        </button>
        <button type="button" onClick={reset} disabled={state === "idle"}
          className="min-h-11 rounded-card border border-border px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50">Reset</button>
      </div>
      <p id="send-feedback" role="status" aria-live="polite" aria-atomic="true"
        className="mt-4 min-h-24 text-sm leading-6 text-muted">{feedback[state]}</p>
    </div>
  );
}
