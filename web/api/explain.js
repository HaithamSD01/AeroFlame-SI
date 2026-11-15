// AeroFlame SI endpoint (Vercel function). The Gemini key never reaches the browser:
// set GEMINI_API_KEY (and optionally GEMINI_MODEL) in the Vercel project's environment variables.
// The prompt is built here from the request's structured fields and the findings stored in the repo,
// so a visitor cannot send an arbitrary prompt through this key.
import { createRequire } from "node:module";
import { SI_CORE_PROMPT } from "./_prompt.js";

const require = createRequire(import.meta.url);
const FINDINGS = require("../src/data/findings.json");

export const config = { maxDuration: 60 };

const ENVS = ["Spacecraft", "Space station", "Lunar base", "Mars base", "Rover", "Spacesuit / EVA"];
const LEVELS = {
  Student: "Explain in plain words for a first-year student. No jargon, 3-4 short sentences.",
  Engineer: "Explain for an aerospace engineer choosing materials, detectors and suppressants. Be concrete and practical.",
  Researcher: "Explain for a combustion researcher. Mention conditions, limits and open questions.",
};
const API = "https://generativelanguage.googleapis.com/v1beta";
const lastOk = { model: "" };          // remembers the last model that answered
const hits = new Map();                // simple per-instance rate limit

function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 2000) hits.clear();
  return list.length > 8;
}

const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f]+/g, " ").slice(0, max);

async function callModel(key, model, prompt) {
  const res = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 900 },
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const err = new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
  if (!text) throw new Error("empty answer");
  return text;
}

async function flashModels(key) {
  try {
    const res = await fetch(`${API}/models?pageSize=200`, {
      headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json();
    return (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => m.name.split("/").pop())
      .filter((n) => n.includes("flash") && !/image|tts|live|audio|embed/.test(n))
      .sort().reverse();
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = (process.env.GEMINI_API_KEY || "").trim();
  if (!key) return res.status(503).json({ error: "no_key" });
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (limited(ip)) return res.status(429).json({ error: "rate_limited" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const env = ENVS.includes(body.env) ? body.env : "Lunar base";
  const level = LEVELS[body.level] ? body.level : "Engineer";
  const ids = Array.isArray(body.findingIds) ? body.findingIds.slice(0, 6).map(String) : [];
  const findings = FINDINGS.filter((f) => ids.includes(f.id));
  if (!findings.length) return res.status(400).json({ error: "no_findings" });
  const question = clean(body.question, 300) || "What should the crew do now, and why?";
  const situation = clean(body.situation, 500);

  const context = findings
    .map((f) => `- [${f.experiment}, ${f.pillar}] ${f.finding} (conditions: ${f.conditions}; basis: ${f.basis})`)
    .join("\n");
  const prompt = SI_CORE_PROMPT +
    (situation ? `\n\n## Live situation from the AeroFlame edge node\n${situation}` : "") +
    `\n\n## Request\nEnvironment: ${env}\nReading level: ${level} - ${LEVELS[level]}\nQuestion: ${question}\n` +
    `\nFINDINGS:\n${context}`;

  const tried = new Set();
  let queue = [...new Set([lastOk.model, (process.env.GEMINI_MODEL || "").trim(), "gemini-3.8-flash"])].filter(Boolean);
  let listed = false;
  let lastErr = null;
  while (tried.size < 5) {
    if (!queue.length) {
      if (listed) break;
      listed = true;
      queue = (await flashModels(key)).filter((m) => !tried.has(m));
      continue;
    }
    const model = queue.shift();
    if (tried.has(model)) continue;
    tried.add(model);
    for (let attempt = 1; attempt <= 2; attempt++) {   // one retry on "high demand" (503)
      try {
        const text = await callModel(key, model, prompt);
        lastOk.model = model;
        return res.status(200).json({ text, model });
      } catch (err) {
        lastErr = err;
        if (err.status === 503 && attempt === 1) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        break;
      }
    }
  }
  console.error("SI call failed:", lastErr?.message);
  return res.status(502).json({ error: "si_failed" });
}
