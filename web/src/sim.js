// AeroFlame - simplified habitat fire model + SI risk index.
// JavaScript port of simulation/aeroflame_model.py (same equations, same constants).
// A transparent, simplified engineering model for a hackathon demo. It is NOT a
// certified fire-safety model. Every assumption is listed in ASSUMPTIONS.

// O2 fraction and total pressure from the Flame in Freefall challenge report.
export const ENVIRONMENTS = {
  "Spacecraft": { o2: 0.21, pPsi: 14.7, gravity: "microgravity", micro: true },
  "Space station": { o2: 0.21, pPsi: 14.7, gravity: "microgravity", micro: true },
  "Lunar base": { o2: 0.30, pPsi: 10.2, gravity: "lunar gravity (1/6 g)", micro: false },
  "Mars base": { o2: 0.30, pPsi: 10.2, gravity: "Mars gravity (0.38 g)", micro: false },
  "Rover": { o2: 0.30, pPsi: 10.2, gravity: "lunar gravity (1/6 g)", micro: false },
  "Spacesuit / EVA": { o2: 1.0, pPsi: 4.3, gravity: "varies", micro: true },
};
export const PSI_TO_HPA = 68.9476;

export const ASSUMPTIONS = [
  "Atmospheres (O2 %, psi) come from the challenge report; the Mars base is assumed equal to the lunar base.",
  "Flame spread over a thin fabric: v = k (X_O2 - X_lim), with X_lim = 0.15 and k chosen so v = 1 mm/s at 21% O2.",
  "Microgravity: no buoyant plume, so smoke reaches the node only with the cabin airflow (delay = distance / air speed).",
  "Earth reference: a buoyant plume carries smoke to a ceiling detector at about 0.5 m/s.",
  "Smoke and heat mix in one well-ventilated module (single-zone model).",
  "The IR flame sensor needs a larger flame in microgravity, because flames there are dimmer and bluer (less soot).",
  "The SI risk index is a heuristic: sensor evidence x oxygen factor, capped at 100. Thresholds are illustrative.",
];

export function spreadRateMmS(o2, xLim = 0.15) {
  const k = 1.0 / (0.21 - xLim);
  return Math.max(0, k * (o2 - xLim));
}

export function oxygenFactor(o2) {
  return Math.min(2.5, o2 / 0.21);
}

// Small seeded generator so a run can be repeated exactly (mulberry32 + Box-Muller).
function makeGauss(seed) {
  let a = seed >>> 0;
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => {
    const u = Math.max(uniform(), 1e-12);
    const v = uniform();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

export class HabitatSim {
  constructor({ env = "Lunar base", distanceM = 2.0, airSpeedMS = 0.1, volumeM3 = 30.0,
    earthReference = false, seed = 7, noise = true } = {}) {
    this.env = env;
    this.distanceM = distanceM;
    this.airSpeedMS = airSpeedMS;
    this.volumeM3 = volumeM3;
    this.earthReference = earthReference;
    this.t = 0;
    this.ignitionT = null;
    this.dustUntil = -1;
    this.t0C = 22.0;
    this.smoke = 0;
    this.heat = 0;
    this.gauss = noise ? makeGauss(seed) : () => 0;
    const e = ENVIRONMENTS[env];
    this.o2 = e.o2;
    this.pHpa = e.pPsi * PSI_TO_HPA;
    this.micro = e.micro;
  }

  ignite() {
    if (this.ignitionT === null) this.ignitionT = this.t;
  }

  dustEvent(seconds = 25) {
    this.dustUntil = this.t + seconds;
  }

  get delayS() {
    const speed = this.earthReference ? 0.5 : this.airSpeedMS;
    return this.distanceM / Math.max(speed, 1e-3);
  }

  burnedAreaCm2(t) {
    if (this.ignitionT === null || t < this.ignitionT) return 0;
    let rMm = spreadRateMmS(this.o2) * (t - this.ignitionT);
    rMm = Math.min(rMm, 150.0); // sample size limit
    return Math.PI * (rMm / 10) ** 2;
  }

  step(dt = 1.0) {
    this.t += dt;
    const srcArea = this.burnedAreaCm2(this.t - this.delayS); // what the node "sees"
    const airChanges = (this.airSpeedMS * 0.5 / this.volumeM3) * 60;
    this.smoke += dt * (srcArea * 0.02 - this.smoke * airChanges * 0.05);
    this.heat += dt * (srcArea * 0.0005 - this.heat * 0.02);
    const dust = this.t < this.dustUntil;
    const noise = this.gauss();
    const smokeRaw = Math.trunc(Math.min(4095, 300 + 8 * noise + this.smoke * 40 + (dust ? 900 : 0)));
    const temp = this.t0C + this.heat + 0.05 * noise;
    const pressure = this.pHpa * (1 + this.heat / (273.15 + this.t0C)) + 0.05 * noise;
    const irThreshold = this.micro ? 40.0 : 20.0; // cm2 of flame needed for IR pickup
    return {
      t: this.t,
      flame_detected: srcArea > irThreshold,
      temperature_c: Math.round(temp * 100) / 100,
      pressure_hpa: Math.round(pressure * 100) / 100,
      humidity_pct: 40.0,
      smoke_raw: smokeRaw,
      // Not sensor data: the true state at the source, used only to draw the module view.
      _source_area_cm2: this.burnedAreaCm2(this.t),
      _dust: dust,
    };
  }
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Fuse IR flame + smoke + temperature trend, scaled by the oxygen factor.
export function riskIndex(reading, history, o2) {
  const smokeN = clamp01((reading.smoke_raw - 350) / 1500);
  const temps = history.slice(-10).map((h) => h.temperature_c).concat([reading.temperature_c]);
  const rate = temps.length >= 6 ? (temps[temps.length - 1] - temps[0]) / (temps.length - 1) : 0; // deg C per s
  const rateN = clamp01(rate / 0.08);
  const flame = reading.flame_detected ? 1 : 0;
  let evidence = 0.5 * flame + 0.3 * smokeN + 0.2 * rateN;

  // Nuisance rejection: a smoke-only signal with no heat and no flame for a while.
  const recent = history.slice(-15);
  const smokeOnly = smokeN > 0.3 && flame === 0 && rateN < 0.25 &&
    recent.length >= 10 && recent.every((h) => !h.flame_detected);
  if (smokeOnly) evidence *= 0.25;

  const score = Math.min(100, 100 * evidence * oxygenFactor(o2));
  const level = score >= 75 ? "FIRE" : score >= 50 ? "WARNING" : score >= 25 ? "WATCH" : "NOMINAL";
  const cause = flame && smokeN > 0.3 ? "flame + smoke + heat"
    : flame ? "flame (IR)"
      : smokeOnly ? "possible dust / nuisance aerosol"
        : smokeN > 0.3 ? "smoke rising"
          : rateN > 0.3 ? "heat rising" : "none";
  const pillar = level === "FIRE" ? "Suppression"
    : level === "WARNING" || level === "WATCH" ? "Detection" : "Prevention";
  return {
    score: Math.round(score * 10) / 10, level, cause, pillar,
    smokeN, tempRate: rate, o2Factor: oxygenFactor(o2), smokeOnly,
    // What a single light-scattering smoke detector would do with the same smoke reading.
    singleDetectorAlarm: smokeN > 0.3,
  };
}

// Alarm hold for the display: the level rises at once, but steps down only after the index has stayed
// 10 points under that level's threshold for 5 readings. The index itself is not changed.
const ORDER = ["NOMINAL", "WATCH", "WARNING", "FIRE"];
const THRESHOLD = { WATCH: 25, WARNING: 50, FIRE: 75 };
const PILLAR = { NOMINAL: "Prevention", WATCH: "Detection", WARNING: "Detection", FIRE: "Suppression" };

export function makeLevelHold(margin = 10, readings = 5) {
  let held = "NOMINAL";
  let below = 0;
  return (risk) => {
    if (ORDER.indexOf(risk.level) >= ORDER.indexOf(held)) {
      held = risk.level;
      below = 0;
    } else {
      below = risk.score < THRESHOLD[held] - margin ? below + 1 : 0;
      if (below >= readings) { held = risk.level; below = 0; }
    }
    return { ...risk, rawLevel: risk.level, level: held, pillar: PILLAR[held] };
  };
}

export const ACTIONS = {
  NOMINAL: "Keep monitoring. Check that stowed fabrics and plastics are rated for this atmosphere.",
  WATCH: "Cross-check the sensors. Smoke without heat or flame can be dust (vacuuming, regolith).",
  WARNING: "Isolate power to the suspected rack, reduce ventilation flow, crew to fire stations.",
  FIRE: "Activate suppression, isolate the module, don masks.",
};

export function actionFor(level, micro) {
  return level === "FIRE" && micro
    ? `${ACTIONS.FIRE} Microgravity flames can be dim and blue, so do not wait to see one.`
    : ACTIONS[level];
}
