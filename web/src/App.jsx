import { useState } from "react";
import { useMonitor } from "./useMonitor.js";
import Monitor from "./components/Monitor.jsx";
import Insights from "./components/Insights.jsx";
import HowItWorks from "./components/HowItWorks.jsx";
import Tour from "./components/Tour.jsx";

const TABS = [["monitor", "Live monitor"], ["insights", "NASA findings"], ["how", "How it works"]];

export default function App() {
  const [tab, setTab] = useState("monitor");
  const [tourStep, setTourStep] = useState(null);
  const monitor = useMonitor();

  const startTour = () => { setTab("monitor"); setTourStep(0); };

  return (
    <>
      <header className="top">
        <a className="brand" href="/" aria-label="AeroFlame SI, home">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">AeroFlame SI</span>
        </a>
        <nav aria-label="Sections">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" className={tab === id ? "on" : ""} aria-current={tab === id ? "page" : undefined}
              onClick={() => { setTab(id); setTourStep(null); }}>{label}</button>
          ))}
        </nav>
        <button type="button" className="btn primary" onClick={startTour}>Take the guided tour</button>
      </header>

      <main>
        {tab === "monitor" && (
          <>
            <div className="lede">
              <h1>Fire safety for habitats where smoke does not rise</h1>
              <p>A small sensor node at the air return reads flame, smoke and heat. The SI fuses them into one risk index and
                backs each alert with NASA's microgravity fire research.</p>
            </div>
            <Monitor monitor={monitor} />
          </>
        )}
        {tab === "insights" && <Insights />}
        {tab === "how" && <HowItWorks />}
      </main>

      <footer className="foot">
        <p>Built by team AeroFlame in Casablanca for the NASA Space Apps Challenge 2026, challenge "Flame in Freefall".
          SI means Super Intelligence. The fire model is a simplified demonstration, not a certified safety tool.
          This project is not affiliated with NASA.</p>
        <p><a href="https://github.com/HaithamSD01/AeroFlame-SI" target="_blank" rel="noreferrer">Source code, firmware and simulation on GitHub</a></p>
      </footer>

      {tourStep !== null && <Tour step={tourStep} setStep={setTourStep} monitor={monitor} />}
    </>
  );
}
