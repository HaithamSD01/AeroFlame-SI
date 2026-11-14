"""AeroFlame - simplified habitat fire model + SI risk index.

Everything here is a transparent, simplified engineering model for a hackathon demo.
Each assumption is listed in ASSUMPTIONS so judges can check it. It is NOT a certified
fire-safety model.
"""
from dataclasses import dataclass, field
import math
import random

# ---------------------------------------------------------------- environments
# O2 fraction and total pressure from the Flame in Freefall challenge report.
ENVIRONMENTS = {
    "Spacecraft":      {"o2": 0.21, "p_psi": 14.7, "gravity": "microgravity", "micro": True},
    "Space station":   {"o2": 0.21, "p_psi": 14.7, "gravity": "microgravity", "micro": True},
    "Lunar base":      {"o2": 0.30, "p_psi": 10.2, "gravity": "lunar (1/6 g)", "micro": False},
    "Mars base":       {"o2": 0.30, "p_psi": 10.2, "gravity": "Mars (0.38 g)", "micro": False},
    "Rover":           {"o2": 0.30, "p_psi": 10.2, "gravity": "lunar (1/6 g)", "micro": False},
    "Spacesuit / EVA": {"o2": 1.00, "p_psi": 4.3,  "gravity": "varies", "micro": True},
}
PSI_TO_HPA = 68.9476

ASSUMPTIONS = [
    "Atmospheres (O2 %, psi) come from the challenge report; Mars base assumed equal to the lunar base.",
    "Flame spread over a thin fabric: v = k * (X_O2 - X_lim), X_lim = 0.15, k chosen so v = 1 mm/s at 21% O2.",
    "Microgravity: no buoyant plume, so smoke reaches the detector only with the cabin airflow (delay = distance / air speed).",
    "Earth reference: buoyant plume carries smoke to a ceiling detector at about 0.5 m/s.",
    "Smoke and heat mix in one well-ventilated module (single-zone model).",
    "IR flame sensor needs a larger flame in microgravity because flames there are dimmer and bluer (less soot).",
    "SI risk index is a heuristic: sensor evidence x oxygen factor, capped at 100. Thresholds are illustrative.",
]


def spread_rate_mm_s(o2: float, x_lim: float = 0.15) -> float:
    """Thin-fabric flame spread rate (mm/s), linear in O2 above a limiting value."""
    k = 1.0 / (0.21 - x_lim)
    return max(0.0, k * (o2 - x_lim))


def oxygen_factor(o2: float) -> float:
    """How much more oxygen than Earth air (21%), capped so the index stays readable."""
    return min(2.5, o2 / 0.21)


# ---------------------------------------------------------------- scenario
@dataclass
class HabitatSim:
    env: str = "Lunar base"
    distance_m: float = 2.0          # source -> detector / return vent
    air_speed_m_s: float = 0.10      # cabin ventilation speed (assumed)
    volume_m3: float = 30.0          # module free volume (assumed)
    earth_reference: bool = False    # True = buoyant plume to ceiling detector
    seed: int = 7
    t: float = 0.0
    ignition_t: float | None = None
    dust_until: float = -1.0
    t0_c: float = 22.0
    _smoke: float = 0.0              # relative smoke concentration (0..)
    _heat: float = 0.0               # relative excess heat
    _hist: list = field(default_factory=list)

    def __post_init__(self):
        self.rng = random.Random(self.seed)
        e = ENVIRONMENTS[self.env]
        self.o2, self.p_hpa = e["o2"], e["p_psi"] * PSI_TO_HPA
        self.micro = e["micro"]

    # events ------------------------------------------------------------
    def ignite(self):
        if self.ignition_t is None:
            self.ignition_t = self.t

    def dust_event(self, seconds: float = 25):
        self.dust_until = self.t + seconds

    # physics -----------------------------------------------------------
    @property
    def delay_s(self) -> float:
        speed = 0.5 if self.earth_reference else self.air_speed_m_s
        return self.distance_m / max(speed, 1e-3)

    def burned_area_cm2(self, t: float) -> float:
        if self.ignition_t is None or t < self.ignition_t:
            return 0.0
        r_mm = spread_rate_mm_s(self.o2) * (t - self.ignition_t)
        r_mm = min(r_mm, 150.0)                         # sample size limit
        return math.pi * (r_mm / 10) ** 2

    def step(self, dt: float = 1.0) -> dict:
        self.t += dt
        src_area = self.burned_area_cm2(self.t - self.delay_s)   # what the detector "sees"
        air_changes = self.air_speed_m_s * 0.5 / self.volume_m3 * 60  # crude exchange per s
        self._smoke += dt * (src_area * 0.02 - self._smoke * air_changes * 0.05)
        self._heat += dt * (src_area * 0.0005 - self._heat * 0.02)
        dust = self.t < self.dust_until
        noise = self.rng.gauss(0, 1)
        smoke_raw = int(min(4095, 300 + 8 * noise + self._smoke * 40 + (900 if dust else 0)))
        temp = self.t0_c + self._heat + 0.05 * noise
        pressure = self.p_hpa * (1 + self._heat / (273.15 + self.t0_c)) + 0.05 * noise
        ir_threshold = 40.0 if self.micro else 20.0      # cm2 of flame needed for IR pickup
        flame = src_area > ir_threshold
        return {"t": self.t, "flame_detected": flame, "temperature_c": round(temp, 2),
                "pressure_hpa": round(pressure, 2), "humidity_pct": 40.0, "smoke_raw": smoke_raw}


# ---------------------------------------------------------------- SI risk index
def risk_index(reading: dict, history: list, o2: float) -> dict:
    """Fuse IR flame + smoke + temperature trend, scaled by the oxygen factor."""
    smoke_n = max(0.0, min(1.0, (reading["smoke_raw"] - 350) / 1500))
    temps = [h["temperature_c"] for h in history[-10:]] + [reading["temperature_c"]]
    rate = (temps[-1] - temps[0]) / (len(temps) - 1) if len(temps) >= 6 else 0.0   # deg C per s
    rate_n = max(0.0, min(1.0, rate / 0.08))
    flame = 1.0 if reading["flame_detected"] else 0.0
    evidence = 0.5 * flame + 0.3 * smoke_n + 0.2 * rate_n

    # nuisance rejection: smoke-only signal with no heat and no flame for a while
    recent = history[-15:]
    smoke_only = (smoke_n > 0.3 and flame == 0 and rate_n < 0.25
                  and len(recent) >= 10 and all(not h["flame_detected"] for h in recent))
    if smoke_only:
        evidence *= 0.25

    score = min(100.0, 100 * evidence * oxygen_factor(o2))
    level = ("FIRE" if score >= 75 else "WARNING" if score >= 50 else
             "WATCH" if score >= 25 else "NOMINAL")
    cause = ("flame + smoke + heat" if flame and smoke_n > 0.3 else "flame (IR)" if flame else
             "possible dust / nuisance aerosol" if smoke_only else "smoke rising" if smoke_n > 0.3 else
             "heat rising" if rate_n > 0.3 else "none")
    pillar = ("Suppression" if level == "FIRE" else "Detection" if level in ("WARNING", "WATCH") else "Prevention")
    return {"score": round(score, 1), "level": level, "cause": cause, "pillar": pillar,
            "smoke_n": smoke_n, "temp_rate": rate, "o2_factor": oxygen_factor(o2)}
