"""AeroFlame SI - Flame in Freefall (NASA Space Apps 2026).
Run:  streamlit run app.py   (or double-click run.bat)
"""
import streamlit as st

st.set_page_config(page_title="AeroFlame SI", page_icon="🔥", layout="wide")
pg = st.navigation([
    st.Page("monitor.py", title="Live Habitat Monitor", icon="🛰️", default=True),
    st.Page("insights.py", title="NASA PSI Insights", icon="🔥"),
])
with st.sidebar:
    st.markdown("### 🔥 AeroFlame SI")
    st.caption("Flame in Freefall · NASA Space Apps 2026")
pg.run()
