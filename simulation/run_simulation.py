"""Run the AeroFlame simulations and save figures + a CSV dataset.
Usage:  python simulation/run_simulation.py
"""
import csv
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

sys.path.insert(0, os.path.dirname(__file__))
from aeroflame_model import HabitatSim, risk_index, spread_rate_mm_s, ENVIRONMENTS  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "figures")
os.makedirs(OUT, exist_ok=True)
SMOKE_ALARM_RAW = 700   # single photoelectric-style detector threshold (illustrative)
plt.rcParams.update({"figure.dpi": 130, "font.size": 10, "axes.spines.top": False, "axes.spines.right": False})
WM = "SI-generated simulation · simplified model"


def run(sim, seconds, ignite_at=None, dust_at=None):
    hist, risk = [], []
    for s in range(seconds):
        if ignite_at is not None and s == ignite_at:
            sim.ignite()
        if dust_at is not None and s == dust_at:
            sim.dust_event(25)
        r = sim.step(1.0)
        risk.append(risk_index(r, hist, sim.o2))
        hist.append(r)
    return hist, risk


def first_cross(hist, key, thr):
    for h in hist:
        if h[key] >= thr:
            return h["t"]
    return None


# 1) Detection delay: Earth vs microgravity ---------------------------------
cases = [("Earth (buoyant plume, ceiling detector)", dict(env="Space station", earth_reference=True), "#888888"),
         ("Microgravity, cabin airflow 0.10 m/s", dict(env="Space station", air_speed_m_s=0.10), "#2f6fde"),
         ("Microgravity, stagnant corner 0.03 m/s", dict(env="Space station", air_speed_m_s=0.03), "#d9534f")]
fig, ax = plt.subplots(figsize=(7.2, 3.8))
for label, kw, c in cases:
    h, _ = run(HabitatSim(**kw), 240, ignite_at=10)
    t_det = first_cross(h, "smoke_raw", SMOKE_ALARM_RAW)
    ax.plot([x["t"] for x in h], [x["smoke_raw"] for x in h], color=c,
            label=f"{label} -> alarm at {t_det - 10:.0f} s" if t_det else f"{label} -> no alarm")
ax.axhline(SMOKE_ALARM_RAW, ls="--", color="k", lw=0.8)
ax.text(5, SMOKE_ALARM_RAW + 30, "smoke alarm threshold", fontsize=8)
ax.axvline(10, color="orange", lw=0.8)
ax.text(12, 3200, "ignition", color="orange", fontsize=8)
ax.set(xlabel="time (s)", ylabel="smoke sensor (raw)", title="Same fire, later alarm: smoke transport without buoyancy")
ax.legend(fontsize=7.5, loc="upper left", bbox_to_anchor=(0, 0.93))
fig.text(0.99, 0.01, WM, ha="right", fontsize=6, color="gray")
fig.tight_layout(); fig.savefig(os.path.join(OUT, "1_detection_delay.png")); plt.close(fig)

# 2) Flame spread vs oxygen -------------------------------------------------
fig, ax = plt.subplots(figsize=(7.2, 3.6))
for name, c in [("Space station", "#2f6fde"), ("Lunar base", "#f0a030"), ("Spacesuit / EVA", "#d9534f")]:
    o2 = ENVIRONMENTS[name]["o2"]
    v = spread_rate_mm_s(o2)
    ts = list(range(0, 121))
    ax.plot(ts, [min(150, v * t) for t in ts], color=c, label=f"{name}: {o2:.0%} O2 -> {v:.1f} mm/s")
ax.set(xlabel="time after ignition (s)", ylabel="flame front radius (mm)",
       title="More oxygen, faster spread (thin fabric, simplified)")
ax.legend(fontsize=8)
fig.text(0.99, 0.01, WM, ha="right", fontsize=6, color="gray")
fig.tight_layout(); fig.savefig(os.path.join(OUT, "2_spread_vs_oxygen.png")); plt.close(fig)

# 3) Lunar base scenario: dust event then real fire -------------------------
sim = HabitatSim(env="Lunar base", air_speed_m_s=0.10)
hist, risk = run(sim, 300, ignite_at=150, dust_at=40)
t = [h["t"] for h in hist]
fig, axs = plt.subplots(3, 1, figsize=(7.2, 6.4), sharex=True)
axs[0].plot(t, [h["smoke_raw"] for h in hist], color="#555")
axs[0].axhline(SMOKE_ALARM_RAW, ls="--", color="k", lw=0.8)
axs[0].axvspan(40, 65, color="#ccc", alpha=0.5); axs[0].text(42, 2600, "dust (vacuuming)", fontsize=8)
axs[0].set_ylabel("smoke raw")
axs[1].plot(t, [h["temperature_c"] for h in hist], color="#d9534f")
axs[1].fill_between(t, 21.5, [22 + 1.5 * h["flame_detected"] for h in hist], color="orange", alpha=0.25, step="mid")
axs[1].set_ylabel("temp (°C)\n+ IR flame")
axs[2].plot(t, [r["score"] for r in risk], color="#2f6fde", lw=2)
for y, c in [(25, "#e6c200"), (50, "#f0a030"), (75, "#d9534f")]:
    axs[2].axhline(y, color=c, lw=0.8, ls=":")
axs[2].set(ylabel="SI risk index", xlabel="time (s)", ylim=(0, 105))
single = first_cross(hist, "smoke_raw", SMOKE_ALARM_RAW)
fused = next((r_t for r_t, r in zip(t, risk) if r["score"] >= 50), None)
single_real = next((h["t"] for h in hist if h["t"] > 150 and h["smoke_raw"] >= SMOKE_ALARM_RAW), None)
axs[0].set_title("Lunar base (30% O2, 10.2 psi): single smoke detector vs AeroFlame sensor fusion")
axs[2].text(5, 84, f"Single smoke detector: false alarm at t={single:.0f} s (dust), real fire at t={single_real:.0f} s\n"
                   f"AeroFlame fusion: no alarm for dust, WARNING at t={fused:.0f} s (ignition at t=150 s)", fontsize=8)
fig.text(0.99, 0.005, WM, ha="right", fontsize=6, color="gray")
fig.tight_layout(); fig.savefig(os.path.join(OUT, "3_lunar_scenario_fusion.png")); plt.close(fig)

with open(os.path.join(OUT, "lunar_scenario_telemetry.csv"), "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["t_s", "flame_detected", "temperature_c", "pressure_hpa", "smoke_raw", "si_risk", "level", "cause"])
    for h, r in zip(hist, risk):
        w.writerow([h["t"], int(h["flame_detected"]), h["temperature_c"], h["pressure_hpa"], h["smoke_raw"],
                    r["score"], r["level"], r["cause"]])
print("saved figures + CSV to", OUT)
print("single-detector first alarm:", single, "| fused WARNING:", fused)
