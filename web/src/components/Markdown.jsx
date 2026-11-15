// Renders the small subset of Markdown the SI uses (bold, bullets, short headings) as React elements.
function inline(text, keyBase) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean).map((part, i) => {
    if (part.startsWith("**")) return <strong key={`${keyBase}-${i}`}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.length > 2) return <em key={`${keyBase}-${i}`}>{part.slice(1, -1)}</em>;
    return part;
  });
}

// The model sometimes writes LaTeX-style fragments such as $O_2$ or $\ge$; show them as plain text.
function plain(text) {
  return text
    .replace(/\$([^$\n]{1,40})\$/g, "$1")
    .replace(/\\geq?(?![a-zA-Z])/g, "≥").replace(/\\leq?(?![a-zA-Z])/g, "≤").replace(/\\times(?![a-zA-Z])/g, "×")
    .replace(/([A-Za-z])_\{?(\d)\}?/g, "$1$2");
}

export default function Markdown({ text: raw }) {
  const text = plain(raw);
  const blocks = [];
  let list = null;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) { list = null; return; }
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      if (!list) { list = []; blocks.push({ type: "ul", items: list, key: i }); }
      list.push(bullet[1]);
      return;
    }
    list = null;
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    blocks.push({ type: heading ? "h" : "p", text: heading ? heading[1] : line, key: i });
  });
  return (
    <div className="md">
      {blocks.map((b) => b.type === "ul"
        ? <ul key={b.key}>{b.items.map((it, j) => <li key={j}>{inline(it, `${b.key}-${j}`)}</li>)}</ul>
        : b.type === "h" ? <h4 key={b.key}>{inline(b.text, b.key)}</h4>
          : <p key={b.key}>{inline(b.text, b.key)}</p>)}
    </div>
  );
}
