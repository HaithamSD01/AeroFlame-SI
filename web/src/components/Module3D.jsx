import { useEffect, useRef } from "react";

// A small 3D view of one habitat module with the AeroFlame node, drawn on a 2D canvas with a hand-written
// perspective projection (no 3D library). It follows the same live state as the monitor. Drag to rotate.
const LENGTH = 6.5, RADIUS = 1.15;
const LEVEL_COLOR = { NOMINAL: "#3ecf8e", WATCH: "#f2c230", WARNING: "#ff8a3c", FIRE: "#ff4b55" };

export default function Module3D({ monitor }) {
  const canvasRef = useRef(null);
  const live = useRef(monitor);
  live.current = monitor;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let yaw = -0.4, pitch = 0.3, dragging = false, lastX = 0, lastY = 0;
    let w = 0, h = 0, raf = 0, last = performance.now();
    let smoke = [];

    const resize = () => {
      const r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

    const down = (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); };
    const move = (e) => {
      if (!dragging) return;
      yaw += (e.clientX - lastX) * 0.008; pitch = Math.max(-0.2, Math.min(1.1, pitch + (e.clientY - lastY) * 0.006));
      lastX = e.clientX; lastY = e.clientY;
    };
    const up = () => { dragging = false; };
    const key = (e) => {
      if (e.key === "ArrowLeft") yaw -= 0.12; else if (e.key === "ArrowRight") yaw += 0.12;
      else if (e.key === "ArrowUp") pitch = Math.min(1.1, pitch + 0.08); else if (e.key === "ArrowDown") pitch = Math.max(-0.2, pitch - 0.08);
    };
    canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up); canvas.addEventListener("keydown", key);

    // world (x along the module, y up, z across) -> screen
    const project = (x, y, z) => {
      const cx = x - LENGTH / 2;
      const x1 = cx * Math.cos(yaw) + z * Math.sin(yaw), z1 = -cx * Math.sin(yaw) + z * Math.cos(yaw);
      const y2 = y * Math.cos(pitch) - z1 * Math.sin(pitch), z2 = y * Math.sin(pitch) + z1 * Math.cos(pitch);
      const d = 16 + z2, f = Math.min(w, h * 1.9) * 1.72;
      return [w / 2 + (f * x1) / d, h / 2 - (f * y2) / d, d];
    };
    const line = (a, b, color, width = 1) => {
      const p = project(...a), q = project(...b);
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    };
    const label = (text, at, dy = -12, color = "#c7d1f3") => {
      const p = project(...at);
      ctx.font = "600 13px Archivo, system-ui, sans-serif"; ctx.fillStyle = color; ctx.textAlign = "center";
      ctx.fillText(text, p[0], p[1] + dy);
    };

    const draw = (now) => {
      const m = live.current;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const simDt = dt * (m.paused ? 0 : m.speed);
      if (!dragging && !reduce) yaw += dt * 0.06;
      const earth = Boolean(m.envInfo.earth), micro = m.envInfo.micro;
      const simMode = m.source === "sim";
      const area = simMode ? (m.reading?._source_area_cm2 || 0) : 0;
      const dusty = simMode && Boolean(m.reading?._dust);
      const level = m.risk?.level || "NOMINAL";
      const src = [0.7, -0.25, 0];
      const node = [Math.min(0.7 + m.dist, LENGTH - 0.3), earth ? RADIUS - 0.12 : -0.25, 0];

      ctx.clearRect(0, 0, w, h);
      // hull: rings and stringers, far side fainter
      for (let i = 0; i <= 13; i++) {
        const x = (i / 13) * LENGTH;
        for (let k = 0; k < 28; k++) {
          const a0 = (k / 28) * Math.PI * 2, a1 = ((k + 1) / 28) * Math.PI * 2;
          const p = [x, Math.cos(a0) * RADIUS, Math.sin(a0) * RADIUS], q = [x, Math.cos(a1) * RADIUS, Math.sin(a1) * RADIUS];
          const far = project(...p)[2] > 16;
          line(p, q, far ? "rgba(110,130,200,0.22)" : "rgba(150,170,235,0.5)", i === 0 || i === 13 ? 2 : 1);
        }
      }
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2, y = Math.cos(a) * RADIUS, z = Math.sin(a) * RADIUS;
        const far = project(LENGTH / 2, y, z)[2] > 16;
        line([0, y, z], [LENGTH, y, z], far ? "rgba(110,130,200,0.18)" : "rgba(150,170,235,0.4)");
      }
      // deck
      for (let i = 0; i <= 6; i++) line([(i / 6) * LENGTH, -0.75, -0.8], [(i / 6) * LENGTH, -0.75, 0.8], "rgba(120,140,205,0.25)");
      line([0, -0.75, -0.8], [LENGTH, -0.75, -0.8], "rgba(120,140,205,0.3)"); line([0, -0.75, 0.8], [LENGTH, -0.75, 0.8], "rgba(120,140,205,0.3)");

      // smoke and dust
      if (simMode && simDt > 0) {
        const emit = Math.min(10, area * 0.05) * simDt * 10;
        for (let i = 0; i < emit && smoke.length < 500; i++) smoke.push({ x: src[0], y: src[1], z: 0, life: 0, s1: Math.random() - 0.5, s2: Math.random() - 0.5, dust: false });
        if (dusty) for (let i = 0; i < 26 * simDt && smoke.length < 500; i++) smoke.push({ x: Math.random() * LENGTH, y: -0.7 + Math.random() * 1.4, z: (Math.random() - 0.5) * 1.4, life: 0, s1: Math.random() - 0.5, s2: Math.random() - 0.5, dust: true });
        for (const p of smoke) {
          p.life += simDt;
          if (p.dust) { p.x += m.air * 0.6 * simDt; p.y += Math.sin(p.life + p.s1 * 9) * 0.02 * simDt; }
          else if (earth) { if (p.y < RADIUS - 0.2) { p.y += 0.5 * simDt; p.z += p.s2 * 0.1 * simDt; } else p.x += 0.5 * simDt; }
          else { p.x += m.air * simDt; p.y += (p.s1 * 0.05 + (micro ? 0 : 0.012)) * simDt; p.z += p.s2 * 0.06 * simDt; }
        }
        smoke = smoke.filter((p) => p.x < node[0] + 0.05 && p.life < (p.dust ? 9 : 120));
      }
      if (!simMode) smoke = [];
      for (const p of smoke) {
        const q = project(p.x, p.y, p.z), r = (p.dust ? 18 : 24 + Math.min(50, p.life * 2)) / q[2];
        ctx.fillStyle = p.dust ? "rgba(214,190,150,0.5)" : "rgba(196,203,221,0.2)";
        ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, Math.PI * 2); ctx.fill();
      }

      // fabric sample and flame
      line([src[0], -0.6, 0], [src[0], 0.1, 0], "#aab4d6", 3);
      if (area > 0) {
        const q = project(...src), r = Math.min(70, 8 + Math.sqrt(area) * 3.2) * (16 / q[2]);
        const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], r);
        g.addColorStop(0, micro ? "rgba(215,235,255,0.95)" : "rgba(255,244,214,0.95)");
        g.addColorStop(0.4, micro ? "rgba(90,150,255,0.8)" : "rgba(255,190,90,0.8)");
        g.addColorStop(1, "rgba(40,80,240,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, Math.PI * 2); ctx.fill();
      }
      label("fabric sample", [src[0], 0.1, 0]);

      // the node: a box with three sensors, wired to the dashboard outside the hatch
      const [nx, ny] = [node[0], node[1]], s = 0.16;
      const c = [[-s, -s, -s], [s, -s, -s], [s, s, -s], [-s, s, -s], [-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s]].map(([a, b, d]) => [nx + a * 0.5, ny + b, d]);
      [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([a, b]) => line(c[a], c[b], "#dfe6ff", 1.6));
      const led = project(nx - 0.09, ny, 0);
      ctx.fillStyle = LEVEL_COLOR[level]; ctx.beginPath(); ctx.arc(led[0], led[1], 5, 0, Math.PI * 2); ctx.fill();
      label(earth ? "AeroFlame node on the ceiling" : "AeroFlame node at the air return", [nx, ny + s, 0], -14, "#ffffff");
      label("IR flame, MQ-2 smoke, BME280", [nx, ny - s, 0], 22);
      const dash = [LENGTH + 0.5, -0.2, 0];
      line([nx, ny - s, 0], [nx, -0.75, 0], "#8fb0ff", 1.5); line([nx, -0.75, 0], [LENGTH, -0.75, 0], "#8fb0ff", 1.5); line([LENGTH, -0.75, 0], dash, "#8fb0ff", 1.5);
      const dq = [[-0.35, -0.22], [0.35, -0.22], [0.35, 0.22], [-0.35, 0.22]].map(([a, b]) => project(dash[0], dash[1] + b + 0.25, a));
      ctx.fillStyle = LEVEL_COLOR[level]; ctx.globalAlpha = 0.9;
      ctx.beginPath(); dq.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      label(`dashboard: ${level}`, [dash[0], dash[1] + 0.5, 0], -8, "#ffffff");

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up); canvas.removeEventListener("keydown", key);
    };
  }, []);

  return (
    <canvas ref={canvasRef} className="module3d" tabIndex={0} role="img"
      aria-label={`3D view of a ${monitor.env} module: a fabric sample, the AeroFlame sensor node and its cable to the dashboard. Drag or use the arrow keys to rotate.`} />
  );
}
