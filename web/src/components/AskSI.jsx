import { useState } from "react";
import Markdown from "./Markdown.jsx";

const LEVELS = ["Student", "Engineer", "Researcher"];

// Asks the SI endpoint to explain. If the SI is not reachable, says so and shows the findings it would have used.
export default function AskSI({ env, findings, situation, question, buttonLabel, fallbackAction }) {
  const [level, setLevel] = useState("Engineer");
  const [state, setState] = useState({ status: "idle" });

  const ask = async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ env, level, situation, question, findingIds: findings.map((f) => f.id) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.text) setState({ status: "done", text: data.text, model: data.model });
      else setState({ status: "offline", reason: data.error || String(res.status) });
    } catch {
      setState({ status: "offline", reason: "network" });
    }
  };

  const reasonText = {
    no_key: "The SI is not connected on this deployment yet.",
    rate_limited: "Too many SI requests in the last minute. Try again shortly.",
    si_failed: "The SI model did not answer. Try again in a moment.",
    network: "The SI endpoint could not be reached.",
  };

  return (
    <div className="ask">
      <div className="seg" role="radiogroup" aria-label="Explain for">
        {LEVELS.map((l) => (
          <button key={l} type="button" role="radio" aria-checked={level === l}
            className={level === l ? "on" : ""} onClick={() => setLevel(l)}>{l}</button>
        ))}
      </div>
      <button type="button" className="btn primary" onClick={ask}
        disabled={state.status === "loading" || !findings.length}>
        {state.status === "loading" ? "The SI is reading the findings" : buttonLabel}
      </button>
      {state.status === "done" && (
        <div className="answer" aria-live="polite">
          <Markdown text={state.text} />
          <p className="fine">SI model: {state.model}. It may only use the findings listed here and must name the experiment behind each claim.</p>
        </div>
      )}
      {state.status === "offline" && (
        <div className="answer" aria-live="polite">
          <p><strong>{reasonText[state.reason] || "The SI is unavailable right now."}</strong></p>
          {fallbackAction && <p>Standard action for this level: {fallbackAction}</p>}
          <p>Findings the SI would use:</p>
          <ul>{findings.map((f) => <li key={f.id}><strong>{f.experiment}:</strong> {f.finding}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
