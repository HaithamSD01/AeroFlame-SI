// Reads the AeroFlame ESP32 node over USB with the Web Serial API (Chrome / Edge on desktop).
// The node prints one JSON line per second at 115200 baud, for example:
// {"flame_detected":false,"temperature_c":22.4,"pressure_hpa":1012.3,"humidity_pct":41,"smoke_raw":310}
export const serialSupported = typeof navigator !== "undefined" && "serial" in navigator;

export async function connectNode(onReading, onError) {
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate: 115200 });
  const decoder = new TextDecoderStream();
  const closed = port.readable.pipeTo(decoder.writable).catch(() => {});
  const reader = decoder.readable.getReader();
  let open = true;
  let buffer = "";
  (async () => {
    try {
      while (open) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let nl;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith("{")) continue;
          try { onReading(JSON.parse(line)); } catch { /* skip a broken line */ }
        }
      }
    } catch (err) {
      if (open) onError?.(err);
    }
  })();
  return async () => {
    open = false;
    try { await reader.cancel(); } catch { /* already closed */ }
    await closed;
    try { await port.close(); } catch { /* already closed */ }
  };
}
