/** Arithmetic parser used both by tests and by the offline calculator widget. */
export function evaluateCalculator(source: string): number {
  const normalized = source.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/×/g, "*").replace(/[÷]/g, "/").replace(/−/g, "-").replace(/\s/g, "");
  if (!normalized || normalized.length > 400) throw new Error("عبارت را کامل بنویس");
  const tokens = normalized.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[()+\-*/%]/gi) ?? [];
  if (tokens.join("") !== normalized) throw new Error("عبارت نامعتبر است");
  let at = 0;
  const number = (): number => {
    const token = tokens[at++];
    if (token === "+" || token === "-") return (token === "-" ? -1 : 1) * number();
    let value: number;
    if (token === "(") { value = add(); if (tokens[at++] !== ")") throw new Error("پرانتز را ببند"); }
    else if (token !== undefined && /^(?:\d|\.)/.test(token)) value = Number(token);
    else throw new Error("عبارت را کامل بنویس");
    while (tokens[at] === "%") { at++; value /= 100; }
    return value;
  };
  const multiply = (): number => {
    let value = number();
    while (tokens[at] === "*" || tokens[at] === "/") {
      const op = tokens[at++], right = number();
      if (op === "/" && right === 0) throw new Error("تقسیم بر صفر ممکن نیست");
      value = op === "*" ? value * right : value / right;
    }
    return value;
  };
  const add = (): number => {
    let value = multiply();
    while (tokens[at] === "+" || tokens[at] === "-") {
      const op = tokens[at++], start = at;
      let right = multiply();
      // Mobile-style additive percent: 200 + 10% = 220. A full RHS percent
      // participates as a relative rate; multiplication keeps percent /100.
      const rightTokens = tokens.slice(start, at);
      if (rightTokens.length >= 2 && rightTokens[rightTokens.length - 1] === "%" && !rightTokens.some((t) => t === "*" || t === "/")) right *= value;
      value = op === "+" ? value + right : value - right;
    }
    return value;
  };
  const value = add();
  if (at !== tokens.length || !Number.isFinite(value)) throw new Error("نتیجه قابل محاسبه نیست");
  return Number(value.toPrecision(12));
}

function mountCalculator(id: string, evaluate: (source: string) => number) {
  const root = document.getElementById(id)!;
  const expression = root.querySelector<HTMLElement>(".nc-expression")!;
  const output = root.querySelector<HTMLElement>(".nc-output")!;
  const history = root.querySelector<HTMLElement>(".nc-history")!;
  let source = "", finished = false;
  const entries: { source: string; answer: number }[] = [];
  const fa = (s: string) => s.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]).replace(/\*/g, "×").replace(/\//g, "÷");
  const render = () => {
    expression.textContent = fa(source) || "۰";
    try { output.textContent = source ? fa(String(evaluate(source))) : "۰"; output.dataset.error = "false"; }
    catch { output.textContent = "…"; }
  };
  const press = (key: string) => {
    if (key === "AC") { source = ""; finished = false; }
    else if (key === "back") { source = source.slice(0, -1); finished = false; }
    else if (key === "sign") {
      const negative = /\(-((?:\d*\.?\d+)(?:e[+-]?\d+)?)\)(%?)$/i.exec(source);
      const positive = /(\d*\.?\d+(?:e[+-]?\d+)?)(%?)$/i.exec(source);
      if (negative) source = source.slice(0, negative.index) + negative[1] + negative[2];
      else if (positive) source = source.slice(0, positive.index) + "(-" + positive[1] + ")" + positive[2];
      else if (!source) source = "-";
      finished = false;
    } else if (key === "=") {
      try {
        const answer = evaluate(source);
        entries.unshift({ source, answer }); entries.splice(8);
        history.replaceChildren();
        for (const item of entries) { const row = document.createElement("div"); row.textContent = fa(item.source) + " = " + fa(String(item.answer)); history.append(row); }
        source = String(answer); finished = true;
      } catch (error) { output.textContent = error instanceof Error ? error.message : "خطای محاسبه"; output.dataset.error = "true"; return; }
    } else if (source.length < 240) {
      if (finished && /^[\d.(]$/.test(key)) source = "";
      finished = false;
      if (/^[+*/]$/.test(key) && /[+*/-]$/.test(source)) source = source.slice(0, -1);
      source += key;
    }
    render();
  };
  root.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-calc-key]");
    if (button) { root.focus({ preventScroll: true }); press(button.dataset.calcKey!); }
  });
  root.addEventListener("keydown", (event) => {
    const key = event.key === "Enter" ? "=" : event.key === "Backspace" ? "back" : event.key === "Escape" ? "AC" : event.key;
    if (/^[\d()+*/.=%-]$/.test(key) || ["back", "AC"].includes(key)) { event.preventDefault(); press(key); }
  });
  render();
}

export function calculatorKit(id: string) {
  const keys = [["AC", "AC"], ["( ", "("], [" )", ")"], ["÷", "/"], ["۷", "7"], ["۸", "8"], ["۹", "9"], ["×", "*"], ["۴", "4"], ["۵", "5"], ["۶", "6"], ["−", "-"], ["۱", "1"], ["۲", "2"], ["۳", "3"], ["+", "+"], ["±", "sign"], ["۰", "0"], [".", "."], ["=", "="], ["⌫", "back"], ["%", "%"]];
  return {
    html: `<section id="${id}" class="nc-calculator" tabindex="0" aria-label="ماشین‌حساب"><div class="nc-heading"><span>ماشین‌حساب</span><span class="nc-dot"></span></div><div class="nc-screen" aria-live="polite"><div class="nc-expression" dir="ltr">۰</div><div class="nc-output" dir="ltr">۰</div></div><div class="nc-keys" dir="ltr">${keys.map(([label, key]) => `<button type="button" data-calc-key="${key}" class="${/[+*/=-]/.test(key) ? "nc-op" : ""} ${key === "=" ? "nc-equals" : ""}" aria-label="${key === "back" ? "حذف آخرین نویسه" : label}">${label}</button>`).join("")}</div><details class="nc-log"><summary>تاریخچهٔ این نشست</summary><div class="nc-history" dir="ltr"></div></details></section>`,
    css: `.nc-calculator{outline:none;width:100%;font-family:inherit}.nc-heading{display:flex;justify-content:space-between;align-items:center;font-size:14px;color:#a2b0a8}.nc-dot{width:7px;height:7px;border-radius:50%;background:var(--nava-accent,#c6f135);box-shadow:0 0 14px var(--nava-accent,#c6f135)}.nc-screen{padding:38px 0 24px;text-align:right;overflow:auto;min-height:145px}.nc-expression{font-size:24px;color:#a2b0a8;white-space:nowrap;min-height:35px}.nc-output{font-size:48px;line-height:1.35;font-weight:500;overflow-wrap:anywhere}.nc-output[data-error=true]{font-size:16px;color:#ff9da8}.nc-keys{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.nc-keys button{height:60px;border:1px solid #ffffff0b;border-radius:20px;background:#27302b;color:#f0f7f1;font:inherit;font-size:23px;cursor:pointer;touch-action:manipulation;transition:transform .12s,background .12s}.nc-keys button:active{transform:scale(.93);background:#39463e}.nc-keys .nc-op{background:#303d2a;color:var(--nava-accent,#c6f135)}.nc-keys .nc-equals{background:var(--nava-accent,#c6f135);color:#101810;font-weight:700}.nc-log{font-size:12px;color:#a2b0a8;margin-top:22px}.nc-log summary{cursor:pointer}.nc-history{padding-top:12px;line-height:2;overflow-wrap:anywhere}@media(max-width:360px){.nc-keys button{height:51px;border-radius:16px}.nc-output{font-size:40px}}`,
    js: `(${mountCalculator.toString()})(${JSON.stringify(id)},${evaluateCalculator.toString()});`,
  };
}
