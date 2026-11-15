import { useMemo } from "react";
import { actionFor, ENVIRONMENTS, spreadRateMmS } from "../sim.js";
import { rank } from "../rank.js";
import { serialSupported } from "../serial.js";
import FINDINGS from "../data/findings.json";
import ModuleView from "./ModuleView.jsx";
import Chart from "./Chart.jsx";
import AskSI from "./AskSI.jsx";

const PSI_ENV = { "Spacesuit / EVA": "Spacecraft", "Earth (reference)": "Earth" }; // no findings are tagged for EVA yet
const SPEEDS = [1, 4, 10];

export function findingsForAlert(env, risk) {
  const tag = PSI_ENV[env] || env;
  const pool = FINDINGS.filter((f) => f.environments.includes(tag));
  let focus = pool.filter((f) => f.pillar === risk.pillar);
  let note = "";
  if (!focus.length) {
    focus = FINDINGS.filter((f) => f.pillar === risk.pillar);
    note = `No ${risk.pillar.toLowerCase()} findings are tagged for ${env} yet, so these come from other environments.`;
  }
  const query = `${risk.pillar} of a fire in a ${env}: ${risk.cause} ${risk.smokeOnly ? "dust nuisance alarm" : ""}`;
  return { top: rank(focus.length ? focus : pool, query).slice(0, 3), note };
}

function downloadCsv(hist, risks) {
  const head = "t_s,si_risk,level,flame_detected,smoke_raw,temperature_c,pressure_hpa";
  const rows = hist.map((h, i) => [h.t, risks[i].score, risks[i].level, h.flame_detected ? 1 : 0, h.smoke_raw,
    h.temperature_c, h.pressure_hpa ?? ""].join(","));
  const url = URL.createObjectURL(new Blob([[head, ...rows].join("\n")], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = "aeroflame_telemetry.csv"; a.click();
  URL.revokeObjectURL(url);
}

export default function Monitor({ monitor: m }) {
  const { reading, risk, hist, risks, envInfo } = m;
  const level = risk?.level || "NOMINAL";
  const simMode = m.source === "sim";
  // Re-rank only when the alert itself changes, so the list does not jump every second.
  const alert = useMemo(
    () => (risk ? findingsForAlert(m.env, risk) : { top: [], note: "" }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [m.env, risk?.pillar, risk?.cause],
  );
  const series = (pick) => hist.map((h, i) => ({ t: h.t, v: pick(h, risks[i]) }));
  const situation = risk && reading
    ? `Level ${risk.level} (SI risk ${risk.score.toFixed(0)}/100), cause: ${risk.cause}. IR flame: ${reading.flame_detected}, ` +
      `smoke raw ${reading.smoke_raw}, temperature ${reading.temperature_c} C, trend ${(risk.tempRate * 60).toFixed(1)} C/min, ` +
      `atmosphere ${(envInfo.o2 * 100).toFixed(0)}% O2 at ${envInfo.pPsi} psi.`
    : "";
  const single = risk?.singleDetectorAlarm;
  const falseAlarm = single && simMode && Boolean(reading?._dust) && !reading.flame_detected;

  return (
    <div className="monitor">
      <section className="settings" data-tour="settings" aria-label="Habitat settings">
        <label className="field">
          <span>Habitat</span>
          <select value={m.env} onChange={(e) => m.setEnv(e.target.value)}>
            {Object.keys(ENVIRONMENTS).map((e) => <option key={e}>{e}</option>)}
          </select>
          <small>{(envInfo.o2 * 100).toFixed(0)}% O₂ at {envInfo.pPsi} psi, {envInfo.gravity}</small>
        </label>
        <label className="field">
          <span>Cabin airflow at the node</span>
          <input type="range" min="0.02" max="0.30" step="0.01" value={m.air} disabled={!simMode || envInfo.earth}
            onChange={(e) => m.setAir(Number(e.target.value))} />
          <small>{envInfo.earth ? "On Earth the buoyant plume carries the smoke" : `${m.air.toFixed(2)} m/s`}</small>
        </label>
        <label className="field">
          <span>Distance from fire to node</span>
          <input type="range" min="0.5" max="5" step="0.5" value={m.dist} disabled={!simMode}
            onChange={(e) => m.setDist(Number(e.target.value))} />
          <small>{m.dist.toFixed(1)} m</small>
        </label>
        <div className="field" data-tour="source">
          <span>Telemetry</span>
          <div className="seg">
            <button type="button" className={simMode ? "on" : ""} onClick={m.useSimulation}>Simulation</button>
            <button type="button" className={!simMode ? "on" : ""} onClick={m.connect}
              disabled={!serialSupported || m.nodeState === "connecting"}>
              {m.nodeState === "on" ? "ESP32 node connected" : m.nodeState === "connecting" ? "Connecting" : "Connect ESP32 node"}
            </button>
          </div>
          <small>{!serialSupported ? "USB needs Chrome or Edge on a computer."
            : m.nodeState === "error" ? "The node stopped sending. Reconnect it, or close the Arduino Serial Monitor."
              : m.nodeState === "on" ? "Reading one JSON line per second at 115200 baud."
                : "Plug the node in by USB to read real sensors."}</small>
        </div>
        <div className="field">
          <span>Clock</span>
          <div className="seg">
            {SPEEDS.map((s) => (
              <button key={s} type="button" className={m.speed === s && !m.paused ? "on" : ""} disabled={!simMode}
                onClick={() => { m.setSpeed(s); m.setPaused(false); }}>{s}×</button>
            ))}
            <button type="button" className={m.paused ? "on" : ""} disabled={!simMode}
              onClick={() => m.setPaused(!m.paused)}>{m.paused ? "Paused" : "Pause"}</button>
          </div>
          <small>t = {reading ? Math.round(reading.t) : 0} s</small>
        </div>
      </section>

      <section className="stage">
        <div className="module" data-tour="module">
          <ModuleView monitor={m} />
          <div className="module-actions" data-tour="actions">
            <button type="button" className="btn fire" onClick={m.ignite} disabled={!simMode || m.ignited}>
              {m.ignited ? "Fabric is burning" : "Ignite fabric"}
            </button>
            <button type="button" className="btn dust" onClick={m.dust} disabled={!simMode}>Start dust event</button>
            <button type="button" className="btn ghost" onClick={m.reset} disabled={!simMode}>Reset run</button>
          </div>
        </div>

        <div className={`annunciator level-${level}`} data-tour="index" aria-live="polite">
          <p className="ann-label">SI risk index</p>
          <p className="ann-level">{level}</p>
          <p className="ann-score"><b>{risk ? risk.score.toFixed(0) : "0"}</b> / 100</p>
          <dl>
            <div><dt>Cause</dt><dd>{risk?.cause || "none"}</dd></div>
            <div><dt>Oxygen factor</dt><dd>×{(risk?.o2Factor ?? 1).toFixed(2)} against Earth air</dd></div>
            <div><dt>Action</dt><dd>{actionFor(level, envInfo.micro)}</dd></div>
          </dl>
          <p className={`single ${single ? (falseAlarm ? "false" : "true") : ""}`} data-tour="single">
            <span>A single smoke detector would be</span>
            <strong>{single ? (falseAlarm ? "alarming: false alarm" : "alarming") : "quiet"}</strong>
          </p>
        </div>
      </section>

      <section className="readouts" aria-label="Sensor readings">
        <div><span>IR flame</span><b className={reading?.flame_detected ? "hot" : ""}>{reading?.flame_detected ? "Detected" : "Clear"}</b></div>
        <div><span>Smoke sensor</span><b>{reading?.smoke_raw ?? 0}</b><small>raw, 0 to 4095</small></div>
        <div><span>Temperature</span><b>{reading ? reading.temperature_c.toFixed(1) : "0.0"} °C</b>
          <small>{risk ? `${risk.tempRate * 60 >= 0 ? "+" : ""}${(risk.tempRate * 60).toFixed(1)} °C per minute` : ""}</small></div>
        <div><span>Pressure</span><b>{reading?.pressure_hpa ? reading.pressure_hpa.toFixed(0) : "n/a"} hPa</b></div>
      </section>

      <section className="telemetry">
        <div className="charts" data-tour="charts">
          <Chart title="SI risk index" points={series((h, r) => r.score)} color="var(--flame)" min={0} max={100}
            format={(v) => Math.round(v)}
            bands={[{ at: 25, label: "watch", color: "#8a6a00" }, { at: 50, label: "warning", color: "#b44a06" }, { at: 75, label: "fire", color: "#b81422" }]} />
          <Chart title="Smoke sensor" points={series((h) => h.smoke_raw)} color="#5b6677" min={0}
            format={(v) => Math.round(v)} bands={[{ at: 800, label: "single-detector alarm", color: "#8a6a00" }]} />
          <Chart title="Temperature" unit=" °C" points={series((h) => h.temperature_c)} color="#b44a06"
            format={(v) => v.toFixed(1)} />
          <Chart title="IR flame" points={series((h) => (h.flame_detected ? 1 : 0))} color="#b81422" min={0} max={1} step
            format={(v) => (v >= 0.5 ? "detected" : "clear")} tickFormat={(v) => (v >= 0.5 ? "yes" : "no")} />
        </div>
        <div className="log" data-tour="log">
          <div className="log-head">
            <h2>Event log</h2>
            <button type="button" className="btn ghost small" onClick={() => downloadCsv(hist, risks)} disabled={!hist.length}>
              Export telemetry CSV
            </button>
          </div>
          {m.log.length === 0
            ? <p className="empty">Nothing has happened yet. Start a dust event or ignite the fabric.</p>
            : <ol>{m.log.map((e, i) => (
              <li key={`${e.t}-${i}`} className={`log-${e.kind}`}><time>{Math.round(e.t)} s</time><span>{e.text}</span></li>
            ))}</ol>}
        </div>
      </section>

      <section className="grounding">
        <div className="alert-findings" data-tour="findings">
          <h2>NASA findings for this alert: {risk?.pillar.toLowerCase() || "prevention"}</h2>
          {alert.note && <p className="fine">{alert.note}</p>}
          {alert.top.map((f) => (
            <article key={f.id} className="finding">
              <h3>{f.experiment}</h3>
              <p>{f.finding}</p>
              <p className="fine">{f.basis}{f.year ? `, ${f.year}` : ""}. <a href={f.sourceUrl} target="_blank" rel="noreferrer">{f.sourceTitle}</a></p>
            </article>
          ))}
        </div>
        <div className="alert-si" data-tour="si">
          <h2>Ask the SI about this alert</h2>
          <p className="fine">The SI gets the live readings and only the findings on the left.</p>
          <AskSI env={m.env} findings={alert.top} situation={situation} buttonLabel="Explain this alert"
            question="What should the crew do now, and why?" fallbackAction={actionFor(level, envInfo.micro)} />
        </div>
      </section>

      <p className="fine model-note">
        At {(envInfo.o2 * 100).toFixed(0)}% O₂ the model's thin-fabric flame spreads at {spreadRateMmS(envInfo.o2).toFixed(1)} mm/s,
        against 1.0 mm/s in Earth air. The model is simplified and its assumptions are listed under How it works.
      </p>
    </div>
  );
}
