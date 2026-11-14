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


_LAST_OK = {}   # remembers the last model that answered, so the next call starts there


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
    import time
    from google import genai
    client = genai.Client(api_key=key, http_options={"timeout": 40000})   # ms; never hang the app
    log_path = os.path.join(ROOT, "si_debug.log")

    def log(msg):
        try:
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(time.strftime("%H:%M:%S ") + msg + "\n")
        except OSError:
            pass
    def available_flash_models():
        names = []
        try:
            for m in client.models.list():
                n = m.name.split("/")[-1]
                acts = getattr(m, "supported_actions", None) or []
                if ("generateContent" in acts and "flash" in n
                        and not any(x in n for x in ("image", "tts", "live", "audio", "embed"))):
                    names.append(n)
        except Exception as ex:
            log(f"list models failed: {ex}")
        return sorted(names, reverse=True)

    preferred = [_LAST_OK.get("model", ""), os.getenv("GEMINI_MODEL", "").strip(), "gemini-3.8-flash"]
    tried, last_err, listed = set(), None, None
    queue = [m for m in dict.fromkeys(preferred) if m]
    while len(tried) < 5:
        if not queue:
            if listed is not None:
                break
            listed = available_flash_models()          # any flash model this key can use
            log(f"available flash models: {listed[:8]}")
            queue = [m for m in listed if m not in tried]
            continue
        model = queue.pop(0)
        if model in tried:
            continue
        tried.add(model)
        for attempt in (1, 2):                      # one retry on "high demand" (503)
            t0 = time.time()
            try:
                resp = client.models.generate_content(model=model, contents=prompt)
                log(f"OK {model} in {time.time()-t0:.1f}s")
                _LAST_OK["model"] = model
                return (resp.text or "(empty answer)") + f"\n\n*SI model: {model}*"
            except Exception as ex:
                last_err = ex
                log(f"FAIL {model} (try {attempt}) after {time.time()-t0:.1f}s: {type(ex).__name__}: {str(ex)[:200]}")
                if "503" in str(ex) and attempt == 1:
                    time.sleep(2)
                    continue
                break
    return f"SI call failed: {last_err}\n\nCheck the key at https://aistudio.google.com/apikey (and GEMINI_MODEL in .env)."


