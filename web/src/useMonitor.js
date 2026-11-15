import { useCallback, useEffect, useRef, useState } from "react";
import { ENVIRONMENTS, HabitatSim, makeLevelHold, riskIndex } from "./sim.js";
import { connectNode } from "./serial.js";

const MAX_POINTS = 300;

// Owns the live telemetry: either the built-in simulation or the ESP32 node over USB.
export function useMonitor() {
  const [env, setEnv] = useState("Lunar base");
  const [air, setAir] = useState(0.1);
  const [dist, setDist] = useState(2.0);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [source, setSource] = useState("sim");       // "sim" | "node"
  const [nodeState, setNodeState] = useState("off"); // off | connecting | on | error
  const [, setTick] = useState(0);

  const sim = useRef(null);
  const hist = useRef([]);
  const risks = useRef([]);
  const log = useRef([]);
  const disconnect = useRef(null);
  const hold = useRef(makeLevelHold());
  const alertT = useRef(null);   // when AeroFlame first reached WARNING in this run

  const o2 = ENVIRONMENTS[env].o2;

  const push = useCallback((reading) => {
    const r = hold.current(riskIndex(reading, hist.current, o2));
    const prev = risks.current[risks.current.length - 1];
    const s = sim.current;
    const note = (text, kind = "info") => log.current.unshift({ t: reading.t, text, kind });
    if (prev && prev.level !== r.level) {
      const since = s && s.ignitionT !== null && source === "sim" ? `, ${Math.round(reading.t - s.ignitionT)} s after ignition` : "";
      note(`${r.level}: ${r.cause}${r.level !== "NOMINAL" ? since : ""}`, r.level);
    }
    if (alertT.current === null && (r.level === "WARNING" || r.level === "FIRE")) alertT.current = reading.t;
    if (prev && !prev.singleDetectorAlarm && r.singleDetectorAlarm) {
      const lag = alertT.current !== null ? Math.round(reading.t - alertT.current) : 0;
      note(r.smokeOnly || r.level === "NOMINAL"
        ? "A single smoke detector would alarm now. AeroFlame sees no heat and no flame, so it holds."
        : lag > 0 ? `A single smoke detector would alarm only now, ${lag} s after AeroFlame's warning.`
          : "A single smoke detector would alarm now.", "single");
    }
    hist.current.push(reading);
    risks.current.push(r);
    if (hist.current.length > MAX_POINTS) { hist.current.shift(); risks.current.shift(); }
    if (log.current.length > 40) log.current.length = 40;
    setTick((n) => n + 1);
  }, [o2, source]);

  const reset = useCallback(() => {
    sim.current = new HabitatSim({ env, airSpeedMS: air, distanceM: dist });
    hist.current = [];
    risks.current = [];
    log.current = [];
    alertT.current = null;
    hold.current = makeLevelHold();
    setTick((n) => n + 1);
  }, [env, air, dist]);

  // A new habitat or geometry starts a new run, as in the Streamlit version.
  useEffect(() => { reset(); }, [reset]);

  useEffect(() => {
    if (source !== "sim" || paused) return undefined;
    const id = setInterval(() => push(sim.current.step(1)), 1000 / speed);
    return () => clearInterval(id);
  }, [source, paused, speed, push]);

  const pushRef = useRef(push);
  pushRef.current = push;

  const connect = useCallback(async () => {
    setNodeState("connecting");
    try {
      disconnect.current = await connectNode((raw) => {
        const last = hist.current[hist.current.length - 1];
        const reading = {
          t: last ? last.t + 1 : 1,
          flame_detected: Boolean(raw.flame_detected),
          temperature_c: typeof raw.temperature_c === "number" ? raw.temperature_c : (last?.temperature_c ?? 22),
          pressure_hpa: typeof raw.pressure_hpa === "number" ? raw.pressure_hpa : null,
          humidity_pct: raw.humidity_pct ?? null,
          smoke_raw: Number(raw.smoke_raw) || 0,
        };
        pushRef.current(reading);
      }, () => setNodeState("error"));
      hist.current = []; risks.current = []; log.current = []; alertT.current = null; hold.current = makeLevelHold();
      setSource("node");
      setNodeState("on");
    } catch {
      setNodeState("off");
    }
  }, []);

  const useSimulation = useCallback(async () => {
    if (disconnect.current) { await disconnect.current(); disconnect.current = null; }
    setNodeState("off");
    setSource("sim");
    reset();
  }, [reset]);

  const ignite = useCallback(() => {
    const s = sim.current;
    if (s.ignitionT === null) {
      s.ignite();
      log.current.unshift({ t: s.t, text: "Fabric ignited at the source.", kind: "event" });
      setTick((n) => n + 1);
    }
  }, []);

  const dust = useCallback(() => {
    const s = sim.current;
    s.dustEvent(25);
    log.current.unshift({ t: s.t, text: "Dust event started (25 s of airborne dust, no fire).", kind: "event" });
    setTick((n) => n + 1);
  }, []);

  const reading = hist.current[hist.current.length - 1] || null;
  const risk = risks.current[risks.current.length - 1] || null;

  return {
    env, setEnv, air, setAir, dist, setDist, speed, setSpeed, paused, setPaused,
    source, nodeState, connect, useSimulation,
    ignite, dust, reset,
    sim: sim.current, hist: hist.current, risks: risks.current, log: log.current,
    reading, risk, envInfo: ENVIRONMENTS[env],
    ignited: Boolean(sim.current && sim.current.ignitionT !== null),
  };
}
