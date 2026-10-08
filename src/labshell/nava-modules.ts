import { navaPackedRows } from "./nava-lines.ts";
import { normalizeNavaLine } from "./nava-short.ts";
export type NavaLine = { text: string; line: number };

/**
 * Named recipes are expanded before parsing; they never execute JavaScript.
 * «پایان» outside a recipe is passed through (it closes the core language's blocks: اگر، تکرار، کنش، …).
 * Inside a recipe, `opensBlock` tells which lines open such a block so their «پایان» is not mistaken for the recipe's end.
 */
export function expandNava(source: string, opensBlock: (text: string) => boolean = () => false): { lines: NavaLine[]; error?: string } {
  if (source.length > 1_000_000) return { lines: [], error: "برنامه بیش از یک میلیون نویسه دارد." };
  const rows = navaPackedRows(source);
  const recipes = new Map<string, NavaLine[]>();
  const top: NavaLine[] = [];
  let current: { name: string; body: NavaLine[]; line: number; depth: number } | null = null;
  for (let i = 0; i < rows.length; i++) {
    const text = normalizeNavaLine(rows[i].text.trim());
    const head = /^تعریف\s+"([^"\n]+)"\s*:?$/.exec(text);
    if (head) {
      if (current || recipes.has(head[1])) return { lines: [], error: `خط ${rows[i].line}: تعریف تو در تو یا نام تکراری است.` };
      current = { name: head[1], body: [], line: rows[i].line, depth: 0 };
    } else if (current && current.depth === 0 && /^پایان(?:\s|$)/.test(text)) {
      recipes.set(current.name, current.body); current = null;
    } else {
      if (current) {
        if (/^پایان(?:\s|$)/.test(text)) current.depth--;
        else if (opensBlock(text)) current.depth++;
      }
      (current ? current.body : top).push({ text, line: rows[i].line });
    }
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
