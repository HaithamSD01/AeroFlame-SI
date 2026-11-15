// Small TF-IDF ranking (same idea as the scikit-learn fallback in core.py).
const STOP = new Set(("a an and are as at be by for from has have how in is it its of on or that the this to was were what " +
  "when where which who why will with can do does should would about into than then there these those their our we you").split(" "));

const tokens = (s) => (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 1 && !STOP.has(w));

export function findingText(f) {
  return `${f.experiment}. ${f.pillar}. ${f.finding} ${f.conditions}`;
}

// Returns the findings with a 0-1 score, best first.
export function rank(findings, query) {
  if (!findings.length) return [];
  const docs = findings.map((f) => tokens(findingText(f)));
  const q = tokens(query);
  const all = docs.concat([q]);
  const df = new Map();
  for (const d of all) for (const w of new Set(d)) df.set(w, (df.get(w) || 0) + 1);
  const n = all.length;
  const vec = (d) => {
    const tf = new Map();
    for (const w of d) tf.set(w, (tf.get(w) || 0) + 1);
    let norm = 0;
    for (const [w, c] of tf) {
      const v = c * (Math.log((1 + n) / (1 + df.get(w))) + 1);
      tf.set(w, v);
      norm += v * v;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [w, v] of tf) tf.set(w, v / norm);
    return tf;
  };
  const qv = vec(q);
  const raw = docs.map((d) => {
    const dv = vec(d);
    let s = 0;
    for (const [w, v] of qv) if (dv.has(w)) s += v * dv.get(w);
    return s;
  });
  const lo = Math.min(...raw), hi = Math.max(...raw);
  return findings
    .map((f, i) => ({ ...f, score: hi > lo ? (raw[i] - lo) / (hi - lo) : 1 }))
    .sort((a, b) => b.score - a.score);
}
