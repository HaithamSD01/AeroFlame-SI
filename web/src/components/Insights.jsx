import { useMemo, useState } from "react";
import { rank } from "../rank.js";
import FINDINGS from "../data/findings.json";
import AskSI from "./AskSI.jsx";

const ENVS = ["Spacecraft", "Space station", "Lunar base", "Mars base", "Rover"];
const PILLARS = ["Prevention", "Detection", "Suppression", "Fundamentals"];

function exportCsv(rows, env) {
  const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const head = "experiment,pillar,finding,conditions,basis,year,source_title,source_url,match";
  const lines = rows.map((f) => [f.experiment, f.pillar, f.finding, f.conditions, f.basis, f.year ?? "", f.sourceTitle,
    f.sourceUrl, f.score.toFixed(2)].map(esc).join(","));
  const url = URL.createObjectURL(new Blob([[head, ...lines].join("\n")], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = `flame_in_freefall_${env.replace(/ /g, "_")}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export default function Insights() {
  const [env, setEnv] = useState("Lunar base");
  const [pillars, setPillars] = useState(PILLARS);
  const [question, setQuestion] = useState("");
  const query = question.trim() || `fire safety risks and protection in a ${env}`;
  const ranked = useMemo(
    () => rank(FINDINGS.filter((f) => f.environments.includes(env) && pillars.includes(f.pillar)), query),
    [env, pillars, query],
  );
  const toggle = (p) => setPillars((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  return (
    <div className="insights">
      <header className="page-head">
        <h1>What NASA has learned about fire, by habitat</h1>
        <p>Findings from NASA microgravity combustion research, ranked for the place you choose. Each one links to its source,
          and says whether it comes from a flight experiment, a ground test, a model or the challenge report.</p>
      </header>
      <section className="settings" aria-label="Filter findings">
        <label className="field">
          <span>Habitat</span>
          <select value={env} onChange={(e) => setEnv(e.target.value)}>{ENVS.map((e) => <option key={e}>{e}</option>)}</select>
        </label>
        <div className="field">
          <span>Pillars</span>
          <div className="seg">
            {PILLARS.map((p) => (
              <button key={p} type="button" aria-pressed={pillars.includes(p)} className={pillars.includes(p) ? "on" : ""}
                onClick={() => toggle(p)}>{p}</button>
            ))}
          </div>
        </div>
        <label className="field grow">
          <span>Your question</span>
          <input type="text" value={question} placeholder="Which sensors catch a fire that makes little smoke?"
            onChange={(e) => setQuestion(e.target.value)} />
        </label>
      </section>
      <div className="grounding">
        <div>
          <div className="log-head">
            <h2>{ranked.length} findings for a {env.toLowerCase()}</h2>
            <button type="button" className="btn ghost small" disabled={!ranked.length} onClick={() => exportCsv(ranked, env)}>Export CSV</button>
          </div>
          {!ranked.length && <p className="empty">No findings match this filter. Turn a pillar back on.</p>}
          {ranked.map((f) => (
            <article key={f.id} className="finding">
              <h3>{f.experiment} <span className={`pill pill-${f.pillar}`}>{f.pillar}</span></h3>
              <p>{f.finding}</p>
              <div className="match" aria-label={`${Math.round(f.score * 100)} percent match`}><i style={{ width: `${Math.round(f.score * 100)}%` }} /></div>
              <p className="fine">{Math.round(f.score * 100)}% match. {f.basis}{f.year ? `, ${f.year}` : ""}. Conditions: {f.conditions}.{" "}
                <a href={f.sourceUrl} target="_blank" rel="noreferrer">{f.sourceTitle}</a></p>
            </article>
          ))}
        </div>
        <div className="alert-si sticky">
          <h2>Ask the SI</h2>
          <p className="fine">The SI reads the five best matches and answers for the reader you pick.</p>
          <AskSI env={env} findings={ranked.slice(0, 5)} situation="" question={query} buttonLabel="Explain these findings" />
        </div>
      </div>
    </div>
  );
}
