import { useEffect } from "react";

// The guided tour: each step explains one idea and, where useful, triggers it in the live simulation.
export const TOUR = [
  { target: "module", title: "A fire where nothing rises",
    text: "This is one module of a lunar base, seen from the side. On Earth smoke rises to the ceiling. In low gravity it mostly goes where the ventilation takes it.",
    run: (m) => { m.useSimulation(); m.setEnv("Lunar base"); m.setSpeed(1); m.setPaused(false); m.reset(); } },
  { target: "settings", title: "More oxygen, faster fire",
    text: "Planned lunar habitats use about 30% oxygen at lower pressure. In this model a thin fabric burns 2.5 times faster than in Earth air, so the risk index is scaled by an oxygen factor." },
  { target: "single", title: "First, a false alarm",
    text: "Dust is now in the air. A single smoke detector alarms. AeroFlame sees smoke with no heat and no flame, calls it possible dust and holds.",
    run: (m) => { m.setSpeed(4); m.dust(); } },
  { target: "index", title: "Now a real fire",
    text: "The fabric is burning. Watch the smoke drift to the node at the air return. Flame, smoke and heat agree, and the index climbs through watch and warning to fire.",
    run: (m) => { m.setSpeed(4); m.ignite(); } },
  { target: "findings", title: "Every alert comes with NASA's evidence",
    text: "Each level pulls the NASA findings for its pillar. During a fire that is suppression: in BASS-II a thin plastic flame went out below about 2 cm/s of airflow and blew off above about 40 cm/s.",
    run: (m) => { m.setSpeed(1); } },
  { target: "si", title: "Ask the SI what to do",
    text: "The SI gets the live readings and only these findings. It must name the experiment behind each claim and say when microgravity data is being applied to lunar gravity." },
  { target: "source", title: "The same page reads the real node",
    text: "Plug the ESP32 node in by USB and this page reads its sensors directly in Chrome or Edge. The tour is over: reset the run and try your own habitat.",
    run: (m) => { m.setSpeed(1); } },
];

export default function Tour({ step, setStep, monitor }) {
  const s = TOUR[step];
  useEffect(() => {
    if (!s) return undefined;
    s.run?.(monitor);
    const el = document.querySelector(`[data-tour="${s.target}"]`);
    if (!el) return undefined;
    el.classList.add("tour-focus");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    return () => el.classList.remove("tour-focus");
    // The step's action must run once per step, not on every telemetry tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  if (!s) return null;
  const last = step === TOUR.length - 1;
  return (
    <aside className="tour" role="dialog" aria-label="Guided tour">
      <p className="tour-count">Step {step + 1} of {TOUR.length}</p>
      <h2>{s.title}</h2>
      <p>{s.text}</p>
      <div className="tour-nav">
        <button type="button" className="btn ghost small" onClick={() => setStep(null)}>End tour</button>
        <span>
          <button type="button" className="btn ghost small" onClick={() => setStep(step - 1)} disabled={step === 0}>Back</button>
          <button type="button" className="btn primary small" onClick={() => setStep(last ? null : step + 1)}>{last ? "Finish" : "Next"}</button>
        </span>
      </div>
    </aside>
  );
}
