"""AeroFlame SI - shared data, ranking and SI explanation code."""
import os
import pandas as pd
import streamlit as st

ROOT = os.path.dirname(os.path.abspath(__file__))

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

ENVIRONMENTS = ["Spacecraft", "Space station", "Lunar base", "Mars base", "Rover"]
PILLARS = ["Prevention", "Detection", "Suppression", "Fundamentals"]
LEVELS = {
    "Student": "Explain in plain words for a first-year student. No jargon, 3-4 short sentences.",
    "Engineer": "Explain for an aerospace engineer choosing materials, detectors and suppressants. Be concrete and practical.",
    "Researcher": "Explain for a combustion researcher. Mention conditions, limits and open questions.",
}



@st.cache_data
def load_findings(path=os.path.join(ROOT, "findings.csv")):
    df = pd.read_csv(path).fillna("")
    df["text"] = df["experiment"] + ". " + df["pillar"] + ". " + df["finding"] + " " + df["conditions"]
    return df


@st.cache_resource
def load_embedder():
    """Prefer Intel OpenVINO for embeddings (fast on CPU); fall back to PyTorch, then TF-IDF."""
    try:
        from sentence_transformers import SentenceTransformer
    except Exception:
        return None, "TF-IDF"
    if os.getenv("USE_OPENVINO", "1") == "1":
        try:
            return SentenceTransformer("all-MiniLM-L6-v2", backend="openvino"), "Intel OpenVINO"
        except Exception:
            pass
    try:
        return SentenceTransformer("all-MiniLM-L6-v2"), "PyTorch"
    except Exception:
        return None, "TF-IDF"


def rank(df, query):
    """Return df with a 0-1 relevance score, best first."""
    if df.empty:
        return df.assign(score=[])
    model, _ = load_embedder()
    if model is not None:
        from sentence_transformers import util
        q = model.encode(query, convert_to_tensor=True)
        d = model.encode(df["text"].tolist(), convert_to_tensor=True)
        scores = util.cos_sim(q, d)[0].cpu().numpy()
    else:  # fallback: TF-IDF
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity
        vec = TfidfVectorizer(stop_words="english").fit(df["text"].tolist() + [query])
        scores = cosine_similarity(vec.transform([query]), vec.transform(df["text"]))[0]
    out = df.assign(score=scores)
    lo, hi = out["score"].min(), out["score"].max()
    out["score"] = (out["score"] - lo) / (hi - lo) if hi > lo else 1.0
    return out.sort_values("score", ascending=False)


@st.cache_data
def load_si_prompt(path=os.path.join(ROOT, "si_core_prompt.md")):
    try:
        return open(path, encoding="utf-8").read()
    except OSError:
        return "You are the SI layer of a NASA fire-safety dashboard. Use only the findings given and name the experiment for each claim."


def explain(findings, env, level, question, situation=""):
    try:  # re-read .env on every click so a key added while the app runs is picked up
        from dotenv import load_dotenv
        load_dotenv(os.path.join(ROOT, ".env"), override=True)
    except ImportError:
        pass
    key = (os.getenv("GEMINI_API_KEY") or "").strip().strip('"').strip("'")
    if not key:
        try:
            key = st.secrets.get("GEMINI_API_KEY")   # Streamlit Community Cloud secrets
        except Exception:
            key = None
    context = "\n".join(f"- [{r.experiment}, {r.pillar}] {r.finding} (conditions: {r.conditions})" for r in findings.itertuples())
    prompt = (
        load_si_prompt()
        + (f"\n\n## Live situation from the AeroFlame edge node\n{situation}" if situation else "")
        + f"\n\n## Request\nEnvironment: {env}\nReading level: {level} - {LEVELS[level]}\nQuestion: {question}\n"
        + "\nFINDINGS:\n" + context
    )
    if not key:
        return "Add GEMINI_API_KEY to .env to get SI explanations.\n\nTop findings used:\n" + context
    from google import genai
    client = genai.Client(api_key=key)
    models = [m for m in dict.fromkeys([os.getenv("GEMINI_MODEL", "").strip(), "gemini-3.8-flash", "gemini-flash-latest"]) if m]
    last_err = None
    for model in models:          # try the configured model, then current fallbacks
        try:
            resp = client.models.generate_content(model=model, contents=prompt)
            return resp.text + f"\n\n<sub>SI model: {model}</sub>"
        except Exception as ex:
            last_err = ex
    return f"SI call failed: {last_err}\n\nCheck the key at https://aistudio.google.com/apikey (and GEMINI_MODEL in .env)."


