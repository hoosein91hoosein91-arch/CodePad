const FONT_FACE = `
@font-face {
  font-family: Vazirmatn;
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fonts/vazirmatn-arabic-400.woff2") format("woff2");
  unicode-range: U+0600-06FF, U+0750-077F, U+200C-200E, U+FB50-FDFF, U+FE70-FEFC;
}
@font-face {
  font-family: Vazirmatn;
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("/fonts/vazirmatn-arabic-700.woff2") format("woff2");
  unicode-range: U+0600-06FF, U+0750-077F, U+200C-200E, U+FB50-FDFF, U+FE70-FEFC;
}
@font-face {
  font-family: Vazirmatn;
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fonts/vazirmatn-latin-400.woff2") format("woff2");
  unicode-range: U+0000-00FF;
}
`;

const BASE = `
html, body { margin: 0; min-height: 100%; }
*, *::before, *::after { box-sizing: border-box; }
body {
  background: #101410;
  color: #e7f0e4;
  font-family: Vazirmatn, Tahoma, sans-serif;
}
.card {
  margin: 0.75rem;
  padding: 1rem;
  border: 1px solid #314038;
  border-radius: 1.25rem;
  background: #1a211c;
}
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}
.mark {
  color: #c6f135;
  letter-spacing: 0.08em;
  font-weight: 700;
}
.brand { color: #8d9b90; font-size: 0.85rem; }
h1 { margin: 0; font-size: 1.35rem; font-weight: 700; line-height: 1.45; }
.lead { margin: 0.6rem 0 0; color: #8d9b90; line-height: 1.7; }
.langs, .out {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0.9rem 0 0;
  padding: 0;
  list-style: none;
}
.langs li, .out li {
  border: 1px solid #314038;
  border-radius: 999px;
  padding: 0.3rem 0.7rem;
  color: #c6f135;
  font-size: 0.85rem;
  line-height: 1.6;
}
.out { flex-direction: column; }
.out li {
  border-radius: 0.75rem;
  color: #e7f0e4;
}
.foot { margin: 0.8rem 0 0; color: #ff6a3d; font-size: 0.8rem; }
`;

export type StageCopy = {
  title?: string;
  text?: string;
  mark?: string;
  lines?: string[];
};

function esc(value: string): string {
  return value.replace(/[&<>"]/g, (ch) => {
    if (ch === "&") return "\u0026amp;";
    if (ch === "<") return "\u0026lt;";
    if (ch === ">") return "\u0026gt;";
    return "\u0026quot;";
  });
}

export function stageSrcDoc(css: string, page?: StageCopy): string {
  const safe = css.replace(/<\/(style|script)/gi, "<\\/$1");
  const title = page?.title || "Jib";
  const text = page?.text || "Write a program in English, then press Run.";
  const mark = page?.mark || "JIB";
  const lines = page?.lines?.filter((line) => line.length) ?? [];
  const list = lines.length
    ? `<ul class="out">${lines.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>`
    : `<ul class="langs"><li>let</li><li>if</li><li>fn</li><li>list</li><li>machine</li></ul><p class="foot">Press Run</p>`;
  const markup = `<article class="card"><header class="top"><span class="mark">${esc(mark)}</span><span class="brand">Jibcode</span></header><h1>${esc(title)}</h1><p class="lead">${esc(text)}</p>${list}</article>`;
  return `<!DOCTYPE html><html lang="en" dir="ltr"><head><meta charset="utf-8"><style>${FONT_FACE}${BASE}${safe}</style></head><body>${markup}</body></html>`;
}