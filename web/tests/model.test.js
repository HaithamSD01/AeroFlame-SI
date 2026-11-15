// Checks the JavaScript model against reference values produced by the Python model
// (simulation/aeroflame_model.py, noise switched off). Run: npm test
import assert from "node:assert/strict";
import { HabitatSim, makeLevelHold, riskIndex, spreadRateMmS, ENVIRONMENTS } from "../src/sim.js";

export function scenario(env, { dustAt = 10, igniteAt = 60, total = 200 } = {}) {
  const sim = new HabitatSim({ env, noise: false });
  const hist = [];
  const out = { firstWarning: null, firstFire: null, maxDuringDust: 0, last: null };
  for (let i = 0; i < total; i++) {
    if (sim.t === dustAt) sim.dustEvent(25);
    if (sim.t === igniteAt) sim.ignite();
    const r = sim.step(1);
    const k = riskIndex(r, hist, ENVIRONMENTS[env].o2);
    hist.push(r);
    if (r.t > dustAt && r.t <= dustAt + 25) out.maxDuringDust = Math.max(out.maxDuringDust, k.score);
    if (out.firstWarning === null && r.t > igniteAt && k.score >= 50) out.firstWarning = r.t - igniteAt;
    if (out.firstFire === null && r.t > igniteAt && k.score >= 75) out.firstFire = r.t - igniteAt;
    out.last = { smoke: r.smoke_raw, temp: r.temperature_c, p: r.pressure_hpa, score: k.score };
  }
  return out;
}

import { readFileSync } from "node:fs";
const REF = JSON.parse(readFileSync(new URL("./python_reference.json", import.meta.url), "utf8"));
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const envs = Object.keys(ENVIRONMENTS);
const got = Object.fromEntries(envs.map((e) => [e, scenario(e)]));
if (process.argv.includes("--print")) console.log(JSON.stringify(got));
for (const e of envs) {
  const a = got[e], b = REF[e];
  assert.equal(a.firstWarning, b.firstWarning, `time to WARNING, ${e}`);
  assert.equal(a.firstFire, b.firstFire, `time to FIRE, ${e}`);
  // Python rounds half to even, JavaScript rounds half up: allow one last-digit step.
  assert.ok(near(a.maxDuringDust, b.maxDuringDust, 0.1001), `dust peak, ${e}`);
  assert.equal(a.last.smoke, b.last.smoke, `smoke, ${e}`);
  assert.ok(near(a.last.temp, b.last.temp, 0.0101) && near(a.last.p, b.last.p, 0.0101), `temp/pressure, ${e}`);
}
console.log("JS model matches the Python reference for", envs.length, "environments");
assert.equal(spreadRateMmS(0.21).toFixed(2), "1.00");
assert.equal(spreadRateMmS(0.30).toFixed(2), "2.50");
assert.equal(spreadRateMmS(1.0).toFixed(1), "14.2");
console.log("spread-rate checks passed");

// Alarm hold: with sensor noise the displayed level must never step down and back up within a few seconds.
for (const env of envs) {
  const sim = new HabitatSim({ env, seed: 11 });
  const hold = makeLevelHold();
  const hist = [];
  let prev = "NOMINAL", changes = 0, drops = 0;
  for (let i = 0; i < 260; i++) {
    if (sim.t === 20) sim.ignite();
    const r = sim.step(1);
    const k = hold(riskIndex(r, hist, ENVIRONMENTS[env].o2));
    hist.push(r);
    if (k.level !== prev) { changes++; if (["NOMINAL", "WATCH", "WARNING", "FIRE"].indexOf(k.level) < ["NOMINAL", "WATCH", "WARNING", "FIRE"].indexOf(prev)) drops++; }
    prev = k.level;
  }
  assert.equal(prev, "FIRE", `ends in FIRE, ${env}`);
  assert.equal(drops, 0, `no step down during a growing fire, ${env}`);
  assert.ok(changes <= 3, `at most three level changes, ${env}`);
}
console.log("alarm-hold checks passed");
