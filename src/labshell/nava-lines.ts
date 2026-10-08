/** Pack physical lines without changing quoted literals, comments or bracketed expressions. */
export function navaPackedRows(source: string): { text: string; line: number }[] {
  const rows: { text: string; line: number }[] = [];
  source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n").forEach((raw, i) => {
    let start = 0, quote = "", depth = 0, end = raw.length;
    for (let at = 0; at < raw.length; at++) {
      const c = raw[at]!;
      if (quote) { if (c === "\\" && quote !== "»") at++; else if (c === quote) quote = ""; continue; }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === "«") { quote = "»"; continue; }
      if (c === "#" && !/^#[\da-f]{3,8}\b/i.test(raw.slice(at)) || c === "/" && raw[at + 1] === "/") { end = at; break; }
      if ("([{".includes(c)) depth++;
      else if (")]}".includes(c)) depth--;
      else if (c === "|" && depth === 0 && raw[at - 1] !== "|" && raw[at + 1] !== "|") {
        rows.push({ text: raw.slice(start, at), line: i + 1 }); start = at + 1;
      }
    }
    rows.push({ text: raw.slice(start, end), line: i + 1 });
  });
  return rows;
}

/** Newlines become | separators. Comment lines remain separate; no source is discarded. */
export function packNavaSource(source: string): string {
  let output = "", previousCode = false;
  for (const line of source.replace(/\r\n?/g, "\n").split("\n")) {
    const raw = line.trim();
    if (!raw) continue;
    // A trailing comment consumes the rest of the physical line, so end that line.
    let comment = false, quote = "";
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i]!;
      if (quote) { if (c === "\\" && quote !== "»") i++; else if (c === quote) quote = ""; continue; }
      if (c === '"' || c === "'") quote = c;
      else if (c === "«") quote = "»";
      else if (c === "#" && !/^#[\da-f]{3,8}\b/i.test(raw.slice(i)) || c === "/" && raw[i + 1] === "/") { comment = true; break; }
    }
    output += (output ? previousCode && !/^(?:#|\/\/)/.test(raw) ? " | " : "\n" : "") + raw;
    previousCode = !comment;
  }
  return output;
}
