// One small time-series chart drawn as SVG. `bands` adds labelled threshold lines.
export default function Chart({ title, unit = "", points, color, min, max, bands = [], step = false, format = (v) => v, tickFormat }) {
  const W = 320, H = 120, L = 34, R = 8, T = 8, B = 18;
  const xs = points.map((p) => p.t);
  const ys = points.map((p) => p.v);
  const t0 = xs.length ? xs[0] : 0;
  const t1 = xs.length ? Math.max(xs[xs.length - 1], t0 + 60) : 60;
  let lo = min ?? Math.min(...ys, Infinity);
  let hi = max ?? Math.max(...ys, -Infinity);
  if (!ys.length) { lo = min ?? 0; hi = max ?? 1; }
  if (hi - lo < 1e-6) { hi = lo + 1; }
  if (min === undefined || max === undefined) {
    const padY = (hi - lo) * 0.12;
    if (min === undefined) lo -= padY;
    if (max === undefined) hi += padY;
  }
  const x = (t) => L + ((t - t0) / (t1 - t0)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  let d = "";
  points.forEach((p, i) => {
    const px = x(p.t).toFixed(1), py = y(p.v).toFixed(1);
    if (i === 0) d += `M${px},${py}`;
    else if (step) d += `H${px}V${py}`;
    else d += `L${px},${py}`;
  });
  const tick = tickFormat || format;
  const lastV = ys.length ? ys[ys.length - 1] : null;
  return (
    <figure className="chart">
      <figcaption>
        <span>{title}</span>
        <strong>{lastV === null ? "no data yet" : `${format(lastV)}${unit}`}</strong>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}, latest value ${lastV === null ? "none" : format(lastV) + unit}`}>
        <line x1={L} y1={H - B} x2={W - R} y2={H - B} className="axis" />
        <text x={L - 5} y={y(hi) + 4} className="tick" textAnchor="end">{tick(hi)}</text>
        <text x={L - 5} y={y(lo)} className="tick" textAnchor="end">{tick(lo)}</text>
        <text x={L} y={H - 4} className="tick">{Math.round(t0)} s</text>
        <text x={W - R} y={H - 4} className="tick" textAnchor="end">{Math.round(t1)} s</text>
        {bands.map((b) => (
          <g key={b.label}>
            <line x1={L} x2={W - R} y1={y(b.at)} y2={y(b.at)} stroke={b.color} strokeDasharray="3 4" strokeWidth="1" />
            <text x={W - R - 2} y={y(b.at) - 3} className="tick" textAnchor="end" fill={b.color}>{b.label}</text>
          </g>
        ))}
        {d && <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
      </svg>
    </figure>
  );
}
