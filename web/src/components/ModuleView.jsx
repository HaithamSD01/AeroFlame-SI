import { useEffect, useRef } from "react";

// Side view of one habitat module: the fire source, the cabin airflow and the AeroFlame node
// at the air return vent. This is an illustration driven by the model's state, not a CFD result.
const MODULE_LENGTH_M = 6.5;
const LEVEL_COLOR = { NOMINAL: "#3ecf8e", WATCH: "#f2c230", WARNING: "#ff8a3c", FIRE: "#ff4b55" };

export default function ModuleView({ monitor }) {
  const canvasRef = useRef(null);
  const live = useRef(monitor);
  live.current = monitor;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let particles = [];
    let raf = 0;
    let last = performance.now();
    let phase = 0;
    let w = 0, h = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width; h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const draw = (now) => {
      const m = live.current;
      const dt = Math.min(0.1, (now - last) / 1000) * (m.paused ? 0 : m.speed);
      last = now;
      phase += dt;
      const pad = Math.max(18, w * 0.035);
      const top = h * 0.2, bottom = h * 0.84;
      const hullL = pad, hullR = w - pad;
      const pxPerM = (hullR - hullL) / MODULE_LENGTH_M;
      const srcX = hullL + 0.7 * pxPerM;
      const midY = (top + bottom) / 2;
      const simMode = m.source === "sim";
      const micro = m.envInfo.micro;
      const nodeX = srcX + m.dist * pxPerM;
      const area = simMode ? (m.reading?._source_area_cm2 || 0) : 0;
      const dusty = simMode && Boolean(m.reading?._dust);
      const level = m.risk?.level || "NOMINAL";

      ctx.clearRect(0, 0, w, h);

      // hull
      const r = (bottom - top) / 2;
      ctx.beginPath();
      ctx.roundRect(hullL, top, hullR - hullL, bottom - top, r * 0.55);
      ctx.fillStyle = "#101a3a";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#3a4a7a";
      ctx.stroke();
      ctx.save();
      ctx.clip();

      // racks: quiet vertical divisions
      ctx.strokeStyle = "rgba(120,140,200,0.14)";
      ctx.lineWidth = 1;
      for (let x = hullL + pxPerM; x < hullR; x += pxPerM) {
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
      }

      // airflow chevrons, moving at the cabin air speed
      if (simMode) {
        const gap = 46;
        const shift = (phase * m.air * pxPerM) % gap;
        ctx.strokeStyle = "rgba(150,175,255,0.22)";
        ctx.lineWidth = 1.5;
        for (let x = hullL - gap + shift; x < hullR; x += gap) {
          for (const y of [top + (bottom - top) * 0.3, top + (bottom - top) * 0.7]) {
            ctx.beginPath(); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x, y); ctx.lineTo(x - 5, y + 5); ctx.stroke();
          }
        }
      }

      // smoke: carried by the airflow; it only rises where there is some gravity
      if (simMode && dt > 0) {
        const emit = Math.min(10, area * 0.05) * dt * 14;
        for (let i = 0; i < emit && particles.length < 900; i++) {
          particles.push({ x: srcX, y: midY + (Math.random() - 0.5) * 10, life: 0, dust: false, seed: Math.random() });
        }
        if (dusty) {
          for (let i = 0; i < 40 * dt && particles.length < 900; i++) {
            particles.push({ x: hullL + Math.random() * (hullR - hullL), y: bottom - Math.random() * (bottom - top) * 0.9,
              life: 0, dust: true, seed: Math.random() });
          }
        }
        const rise = micro ? 0 : (m.env === "Mars base" ? 3.6 : 1.8);
        for (const p of particles) {
          p.life += dt;
          if (p.dust) {
            p.x += (m.air * pxPerM * 0.6 + (p.seed - 0.5) * 6) * dt;
            p.y += (Math.sin(p.life * 1.3 + p.seed * 9) * 3 + (micro ? 0 : 1.2)) * dt;
          } else {
            p.x += m.air * pxPerM * dt;
            p.y += ((p.seed - 0.5) * 7 - rise) * dt;
          }
          p.y = Math.max(top + 4, Math.min(bottom - 4, p.y));
        }
        particles = particles.filter((p) => p.x < nodeX + 6 && p.life < (p.dust ? 9 : 120));
      }
      if (!simMode) particles = [];
      for (const p of particles) {
        const fade = p.dust ? Math.max(0, 1 - p.life / 9) : Math.min(1, 0.25 + p.life / 6);
        ctx.fillStyle = p.dust ? `rgba(214,190,150,${0.5 * fade})` : `rgba(190,198,215,${0.34 * fade})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.dust ? 1.4 : 2 + Math.min(3, p.life * 0.1), 0, Math.PI * 2);
        ctx.fill();
      }

      // fabric sample and flame
      ctx.fillStyle = "#8b96b8";
      ctx.fillRect(srcX - 2, midY - 26, 4, 52);
      if (area > 0) {
        const fr = Math.min(r * 0.62, 5 + Math.sqrt(area) * 2.2);
        const flick = reduce ? 1 : 1 + Math.sin(phase * 9) * 0.04;
        const stretch = micro ? 1 : (m.env === "Mars base" ? 1.75 : 1.4);
        ctx.save();
        ctx.translate(srcX, midY - (stretch - 1) * fr * 0.6);
        ctx.scale(1, stretch);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, fr * flick);
        if (micro) {
          g.addColorStop(0, "rgba(215,235,255,0.95)");
          g.addColorStop(0.35, "rgba(90,150,255,0.85)");
          g.addColorStop(0.75, "rgba(40,80,240,0.35)");
          g.addColorStop(1, "rgba(40,80,240,0)");
        } else {
          g.addColorStop(0, "rgba(255,244,214,0.95)");
          g.addColorStop(0.3, "rgba(255,190,90,0.85)");
          g.addColorStop(0.65, "rgba(90,140,255,0.45)");
          g.addColorStop(1, "rgba(40,80,240,0)");
        }
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, fr * flick, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      // the node at the return vent
      const nx = Math.min(nodeX, hullR - 16);
      ctx.fillStyle = "#1b2850";
      ctx.strokeStyle = "#7f93d6";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(nx - 9, midY - 20, 18, 40, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = LEVEL_COLOR[level];
      ctx.beginPath(); ctx.arc(nx, midY - 9, 4, 0, Math.PI * 2); ctx.fill();
      if (level === "FIRE" && !reduce) {
        ctx.strokeStyle = `rgba(255,75,85,${0.5 + 0.4 * Math.sin(phase * 6)})`;
        ctx.beginPath(); ctx.arc(nx, midY - 9, 9, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.strokeStyle = "#7f93d6";
      for (let i = 0; i < 3; i++) { // vent slats
        ctx.beginPath(); ctx.moveTo(nx - 5, midY + 3 + i * 5); ctx.lineTo(nx + 5, midY + 3 + i * 5); ctx.stroke();
      }

      // labels
      ctx.font = "500 12px Archivo, system-ui, sans-serif";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#b9c4ea";
      ctx.textAlign = "left";
      ctx.fillText(simMode ? "fabric sample" : "live node, no source model", srcX - 6, top - 9);
      ctx.textAlign = nx > w * 0.7 ? "right" : "left";
      ctx.fillText("AeroFlame node at the air return", nx > w * 0.7 ? nx + 9 : nx - 9, top - 9);

      if (simMode) {
        const y = bottom + 17;
        ctx.strokeStyle = "#7c88ad";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(srcX, y - 4); ctx.lineTo(srcX, y + 4);
        ctx.moveTo(srcX, y); ctx.lineTo(nx, y);
        ctx.moveTo(nx, y - 4); ctx.lineTo(nx, y + 4);
        ctx.stroke();
        ctx.fillStyle = "#b9c4ea";
        ctx.textAlign = "center";
        const delay = m.sim ? Math.round(m.sim.delayS) : 0;
        ctx.fillText(`${m.dist.toFixed(1)} m at ${m.air.toFixed(2)} m/s: smoke needs about ${delay} s to arrive`,
          Math.max(srcX + 120, Math.min((srcX + nx) / 2, w - 150)), y + 19);
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); };
  }, []);

  const m = monitor;
  const description = m.source === "sim"
    ? `Side view of a ${m.env} module. A fabric sample on the left, the AeroFlame node ${m.dist} metres away at the air return vent. Risk level ${m.risk?.level || "nominal"}.`
    : "Side view of the module with the live AeroFlame node.";
  return <canvas ref={canvasRef} className="module-canvas" role="img" aria-label={description} />;
}
