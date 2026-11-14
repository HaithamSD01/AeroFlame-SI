"""AeroFlame SI - NASA PSI insights page."""
import streamlit as st
from core import ENVIRONMENTS, PILLARS, LEVELS, load_findings, load_embedder, rank, explain

df = load_findings()

with st.sidebar:
    st.header("1 · Choose environment")
    env = st.radio("Environment", ENVIRONMENTS, index=2, label_visibility="collapsed")
    pillars = st.multiselect("Pillars", PILLARS, default=PILLARS)
    level = st.radio("Explain for", list(LEVELS), horizontal=True)
    question = st.text_input("Question (optional)", placeholder="Which materials are safest?")

st.title("🔥 NASA PSI Insights")
st.caption(f"SI-ranked fire-safety insights from NASA microgravity combustion research (PSI database) · embeddings: {load_embedder()[1]}")

mask = df["environments"].str.contains(env, regex=False) & df["pillar"].isin(pillars)
query = question or f"fire safety risks and protection in a {env}"
ranked = rank(df[mask], query)

left, right = st.columns([1.3, 1])
with left:
    st.subheader(f"2 · Ranked findings · {env}")
    if ranked.empty:
        st.info("No findings for this filter yet. Add rows to findings.csv.")
    for i, r in enumerate(ranked.head(8).itertuples(), 1):
        with st.container(border=True):
            st.markdown(f"**{i}. {r.experiment}** · `{r.pillar}`")
            st.write(r.finding)
            st.progress(float(r.score), text=f"{r.score:.0%} match")
            if r.source_url:
                st.caption(f"Source: [{r.source_title}]({r.source_url})")
with right:
    st.subheader("3 · SI explanation")
    if st.button("Explain these findings", type="primary", disabled=ranked.empty):
        with st.spinner("Thinking..."):
            st.markdown(explain(ranked.head(5), env, level, query))
    st.subheader("4 · Export")
    st.download_button("Export CSV", ranked.drop(columns=["text"]).to_csv(index=False), f"flame_in_freefall_{env.replace(' ', '_')}.csv", "text/csv")
