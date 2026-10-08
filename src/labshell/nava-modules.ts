import { normalizeNavaLine } from "./nava-short.ts";
export type NavaLine = { text: string; line: number };

/** Named recipes are expanded before parsing; they never execute JavaScript. */
export function expandNava(source: string): { lines: NavaLine[]; error?: string } {
  if (source.length > 1_000_000) return { lines: [], error: "برنامه بیش از یک میلیون نویسه دارد." };
  const rows = source.replace(/\r\n?/g, "\n").split("\n");
  const recipes = new Map<string, NavaLine[]>();
  const top: NavaLine[] = [];
  let current: { name: string; body: NavaLine[]; line: number } | null = null;
  for (let i = 0; i < rows.length; i++) {
    const text = normalizeNavaLine(rows[i].trim());
    const head = /^تعریف\s+"([^"\n]+)"\s*:?$/.exec(text);
    if (head) {
      if (current || recipes.has(head[1])) return { lines: [], error: `خط ${i + 1}: تعریف تو در تو یا نام تکراری است.` };
      current = { name: head[1], body: [], line: i + 1 };
    } else if (text === "پایان") {
      if (!current) return { lines: [], error: `خط ${i + 1}: «end» بدون تعریف است.` };
      recipes.set(current.name, current.body); current = null;
    } else (current ? current.body : top).push({ text, line: i + 1 });
  }
  if (current) return { lines: [], error: `خط ${current.line}: تعریف «${current.name}» به «end» نیاز دارد.` };
  const lines: NavaLine[] = [];
  let failure = "";
  const expand = (items: NavaLine[], stack: string[]) => {
    for (const row of items) {
      if (failure) return;
      const use = /^استفاده\s+"([^"\n]+)"$/.exec(row.text);
      if (use) {
        const name = use[1], body = recipes.get(name);
        if (!body) { failure = `خط ${row.line}: بستهٔ «${name}» تعریف نشده است.`; return; }
        if (stack.includes(name) || stack.length >= 32) { failure = `خط ${row.line}: استفادهٔ حلقه‌ای از بسته‌ها مجاز نیست.`; return; }
        expand(body, [...stack, name]);
      } else {
        lines.push(row);
        if (lines.length > 10_000) { failure = `خط ${row.line}: گسترش برنامه از ۱۰٬۰۰۰ دستور بیشتر شد.`; return; }
      }
    }
  };
  expand(top, []);
  return failure ? { lines: [], error: failure } : { lines };
}
