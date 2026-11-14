"""AeroFlame SI - Live Habitat Monitor (SI risk index from edge-node telemetry)."""
import json
import os
import sys

import pandas as pd
import streamlit as st

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "simulation"))
from aeroflame_model import ENVIRONMENTS, ASSUMPTIONS, HabitatSim, risk_index, spread_rate_mm_s  # noqa: E402
from core import load_findings, rank, explain, LEVELS  # noqa: E402

LEVEL_COLOR = {"NOMINAL": "🟢", "WATCH": "🟡", "WARNING": "🟠", "FIRE": "🔴"}
ACTIONS = {
    "NOMINAL": "Keep monitoring. Check that stowed fabrics and plastics are rated for this atmosphere.",
    "WATCH": "Cross-check sensors. Smoke without heat or flame can be dust (vacuuming, regolith).",
    "WARNING": "Isolate power to the suspected rack, reduce ventilation flow, crew to fire stations.",
    "FIRE": "Activate suppression, isolate the module, don masks. Microgravity flames can be dim and blue.",
}

# ------------------------------------------------------------------ sidebar
with st.sidebar:
    st.header("Habitat")
    env = st.selectbox("Environment", list(ENVIRONMENTS), index=2)
    e = ENVIRONMENTS[env]
    st.caption(f"{e['o2']:.0%} O₂ · {e['p_psi']} psi · {e['gravity']}")
    source = st.radio("Telemetry source", ["Simulation", "ESP32 over USB"])
    port = None
    if source == "ESP32 over USB":
        try:
            from serial.tools import list_ports
            ports = [p.device for p in list_ports.comports()]
        except Exception:
            ports = []
        port = st.selectbox("COM port", ports or ["(no port found - install pyserial / plug the ESP32)"])
    st.divider()
    air = st.slider("Cabin airflow at the node (m/s)", 0.02, 0.30, 0.10, 0.01)
    dist = st.slider("Distance fire -> node (m)", 0.5, 5.0, 2.0, 0.5)

key = (env, air, dist)
if st.session_state.get("sim_key") != key:
    st.session_state.sim = HabitatSim(env=env, air_speed_m_s=air, distance_m=dist)
    st.session_state.sim_key = key
    st.session_state.hist, st.session_state.risk = [], []

st.title("🛰️ AeroFlame SI · Live Habitat Monitor")
st.caption("Edge-node telemetry (IR flame · smoke · temperature/pressure) fused into an SI fire-risk index, "
           "grounded in NASA PSI findings")

c1, c2, c3, _ = st.columns([1, 1, 1, 3])
if c1.button("🔥 Ignite fabric", disabled=source != "Simulation"):
    st.session_state.sim.ignite()
if c2.button("🌫️ Dust event", disabled=source != "Simulation"):
    st.session_state.sim.dust_event(25)
if c3.button("↺ Reset"):
    st.session_state.sim_key = None
    st.rerun()


def read_serial(port_name):
    import serial
    if st.session_state.get("ser_port") != port_name:
        if st.session_state.get("ser"):
            st.session_state.ser.close()
        st.session_state.ser = serial.Serial(port_name, 115200, timeout=0.2)
        st.session_state.ser_port = port_name
    line, last = st.session_state.ser.readline(), None
    while line:
        try:
            last = json.loads(line.decode(errors="ignore"))
        except json.JSONDecodeError:
            pass
        line = st.session_state.ser.readline() if st.session_state.ser.in_waiting else b""
    if last is None:
        return None
    last["t"] = (st.session_state.hist[-1]["t"] + 1) if st.session_state.hist else 1
    last.setdefault("temperature_c", 22.0)
    if last.get("temperature_c") is None:
        last["temperature_c"] = st.session_state.hist[-1]["temperature_c"] if st.session_state.hist else 22.0
    return last


@st.fragment(run_every=1.0)
def live():
    hist, risks = st.session_state.hist, st.session_state.risk
    if source == "Simulation":
        reading = st.session_state.sim.step(1.0)
    else:
        try:
            reading = read_serial(port)
        except Exception as ex:
            st.error(f"Serial error: {ex}. Close the Arduino Serial Monitor, check the COM port, or use Simulation.")
            return
        if reading is None:
            st.info("Waiting for JSON from the ESP32…")
            return
    r = risk_index(reading, hist, e["o2"])
    hist.append(reading); risks.append(r)
    del hist[:-300], risks[:-300]

    m = st.columns(5)
    m[0].metric("SI risk index", f"{r['score']:.0f}/100", r["level"])
    m[1].metric("IR flame", "DETECTED" if reading["flame_detected"] else "clear")
    m[2].metric("Smoke (raw)", reading["smoke_raw"])
    m[3].metric("Temperature", f"{reading['temperature_c']:.1f} °C", f"{r['temp_rate']*60:+.1f} °C/min")
    m[4].metric("Pressure", f"{reading.get('pressure_hpa') or 0:.0f} hPa")

    box = {"NOMINAL": st.success, "WATCH": st.warning, "WARNING": st.warning, "FIRE": st.error}[r["level"]]
    box(f"{LEVEL_COLOR[r['level']]} **{r['level']}** · cause: {r['cause']} · "
        f"oxygen factor ×{r['o2_factor']:.2f} vs Earth air  \n**Action:** {ACTIONS[r['level']]}")

    df = pd.DataFrame(hist).set_index("t")
    df["SI risk"] = [x["score"] for x in risks]
    a, b = st.columns(2)
    a.caption("SI risk index"); a.line_chart(df[["SI risk"]], height=180)
    b.caption("Smoke sensor (raw)"); b.line_chart(df[["smoke_raw"]], height=180)
    a.caption("Temperature (°C)"); a.line_chart(df[["temperature_c"]], height=160)
    b.caption("IR flame (1 = detected)"); b.line_chart(df[["flame_detected"]].astype(int), height=160)
    st.download_button("Export telemetry CSV", df.to_csv(), "aeroflame_telemetry.csv", "text/csv",
                       key=f"dl{len(hist)}")


live()

# ------------------------------------------------------------------ NASA PSI link + SI explanation
PSI_ENV = {"Spacesuit / EVA": "Spacecraft"}            # findings.csv has no EVA tag yet
if st.session_state.risk:
    cur = st.session_state.risk[-1]
    last = st.session_state.hist[-1]
    findings = load_findings()
    env_tag = PSI_ENV.get(env, env)
    pool = findings[findings["environments"].str.contains(env_tag, regex=False)]
    focus = pool[pool["pillar"] == cur["pillar"]]
    note = ""
    if focus.empty:
        focus = findings[findings["pillar"] == cur["pillar"]]
        note = f"No {cur['pillar']} findings tagged for {env} yet: showing them from other environments."
    query = f"{cur['pillar']} of a fire in a {env}: {cur['cause']}"
    top = rank(focus if not focus.empty else pool, query).head(3)
    left, right = st.columns([1.2, 1])
    with left:
        st.subheader(f"NASA findings for this alert · {cur['pillar']}")
        st.caption(note or "Snapshot at the last refresh. Use the button to update.")
        for r in top.itertuples():
            st.markdown(f"**{r.experiment}** · `{r.pillar}` — {r.finding}  \n[source]({r.source_url})")
    with right:
        st.subheader("Ask the SI about this alert")
        level = st.radio("Explain for", list(LEVELS), horizontal=True, key="mon_level")
        if st.button("Explain current situation", type="primary"):
            situation = (f"Level {cur['level']} (SI risk {cur['score']:.0f}/100), cause: {cur['cause']}. "
                         f"IR flame: {last['flame_detected']}, smoke raw {last['smoke_raw']}, "
                         f"temperature {last['temperature_c']} C, trend {cur['temp_rate']*60:+.1f} C/min, "
                         f"atmosphere {e['o2']:.0%} O2 at {e['p_psi']} psi.")
            with st.spinner("SI is reading the NASA findings..."):
                st.markdown(explain(top, env, level, "What should the crew do now, and why?", situation))
        st.button("🔄 Refresh findings")

with st.expander("Why this works: NASA findings behind AeroFlame"):
    st.markdown(
        f"- **No buoyancy, no 'ceiling':** in microgravity smoke only reaches a detector with the cabin airflow, "
        f"so the node sits in the ventilation return path (SAME / SAME-R context). Current delay ≈ "
        f"**{st.session_state.sim.delay_s:.0f} s** for {dist} m at {air} m/s.\n"
        f"- **One sensor is not enough:** NASA's smoke experiments found a single light-scattering detector "
        f"missed some spacecraft materials' smoke and alarms on dust, so AeroFlame fuses flame + smoke + heat.\n"
        f"- **Oxygen-rich habitats:** at {e['o2']:.0%} O₂ the model's thin-fabric flame spread is "
        f"**{spread_rate_mm_s(e['o2']):.1f} mm/s** vs 1.0 mm/s at 21% (BASS / Saffire context).\n"
        f"- **Dust:** lunar and Martian regolith makes nuisance alarms likely (DAFT context); "
        f"smoke-only signals without heat or flame are down-weighted.")
with st.expander("Model assumptions (simplified, for demonstration)"):
    st.markdown("\n".join(f"- {a}" for a in ASSUMPTIONS))
