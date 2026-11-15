import { ASSUMPTIONS } from "../sim.js";

const STEPS = [
  ["Sense three things", "The node reads an IR flame sensor, an MQ-2 smoke sensor and a BME280 (temperature, pressure, humidity) once per second."],
  ["Send one line", "An ESP32 prints one JSON line per second over USB. This site reads it in the browser with Web Serial."],
  ["Fuse into one index", "Evidence = 0.5 × flame + 0.3 × smoke + 0.2 × temperature trend, multiplied by an oxygen factor (O₂ / 21%, capped at 2.5). The level rises at once and steps down only after the index has stayed 10 points under the threshold for 5 s."],
  ["Reject dust", "Smoke with no heat and no flame for 10 s is treated as dust and counts for a quarter."],
  ["Ground the alert", "Each alert level pulls the NASA findings for its pillar: prevention, detection or suppression."],
  ["Explain it", "The SI explains the alert for a student, an engineer or a researcher, using only those findings."],
];

const WIRING = [
  ["IR flame sensor", "GPIO 5"],
  ["MQ-2 smoke sensor", "GPIO 34, through a voltage divider"],
  ["BME280", "I²C on GPIO 21 (SDA) and 22 (SCL)"],
  ["Buzzer", "GPIO 13"],
  ["Output", "1 JSON line per second at 115200 baud"],
];

const RESULTS = [
  ["figures/1_detection_delay.png", "Smoke alarm delay",
    "A smoke alarm that takes 41 s on Earth takes 57 s in microgravity with 0.10 m/s airflow, and 103 s in stagnant air."],
  ["figures/2_spread_vs_oxygen.png", "Flame spread against oxygen",
    "The thin-fabric flame spreads at 1.0 mm/s in 21% O₂, 2.5 mm/s in 30% and 14.2 mm/s in 100%."],
  ["figures/3_lunar_scenario_fusion.png", "Lunar base scenario",
    "During a dust event a single detector false-alarms while AeroFlame stays nominal. After a real ignition AeroFlame reaches warning in 31 s."],
];

export default function HowItWorks() {
  return (
    <div className="how">
      <header className="page-head">
        <h1>From three cheap sensors to a reason the crew can act on</h1>
        <p>On Earth smoke rises to a detector on the ceiling. In orbit nothing rises, and NASA found that a single smoke detector
          misses some fires and alarms on dust. AeroFlame puts a small sensor node where the air goes and fuses three signals.</p>
      </header>

      <section>
        <h2>The chain, from sensor to explanation</h2>
        <ol className="chain">
          {STEPS.map(([title, text]) => <li key={title}><h3>{title}</h3><p>{text}</p></li>)}
        </ol>
      </section>

      <section className="two">
        <div>
          <h2>The node</h2>
          <table>
            <tbody>{WIRING.map(([a, b]) => <tr key={a}><th scope="row">{a}</th><td>{b}</td></tr>)}</tbody>
          </table>
          <p className="fine">Firmware and wiring are in the repository under <code>hardware/</code>.</p>
        </div>
        <div>
          <h2>What is measured and what is modelled</h2>
          <p>With the node plugged in, every number on the monitor is a real sensor reading. In simulation mode the readings
            come from a simplified single-zone model, so the public site works without hardware.</p>
          <p>The NASA findings are quoted from NASA sources and linked. Where a finding was measured in microgravity and we
            apply it to the Moon or Mars, the SI is told to say so and to lower its confidence.</p>
        </div>
      </section>

      <section>
        <h2>What the model predicts</h2>
        <div className="results">
          {RESULTS.map(([src, title, text]) => (
            <figure key={src}>
              <img src={src} alt={title} loading="lazy" />
              <figcaption><strong>{title}.</strong> {text}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section>
        <h2>Model assumptions</h2>
        <p>This is a transparent demonstration model, not a certified fire-safety model. These are its assumptions.</p>
        <ul className="assumptions">{ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
      </section>
    </div>
  );
}
