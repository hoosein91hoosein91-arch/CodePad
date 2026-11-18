// تنظیم اجرای هر پروژهٔ Python: آرگومان‌های خط فرمان (sys.argv) و متغیرهای محیطی (os.environ).
// مثال: BALE_TOKEN=...  یا  --daily-at 09:30. مقدارها فقط روی همین دستگاه (localStorage) می‌مانند و وارد پشتیبان نمی‌شوند.
const KEY = "codepad-run-config";
const MAX = { args: 4000, items: 64, envName: 80, envValue: 4000, envCount: 64 };

const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; } };

/** رشتهٔ آرگومان‌ها را مثل یک shell ساده می‌شکند: فاصله، "…" و '…' و \ */
export function parseArgs(text) {
  const out = [];
  let cur = "", quote = "", has = false;
  const s = String(text ?? "");
  if (s.length > MAX.args) throw new Error("آرگومان‌ها بیش از حد طولانی‌اند.");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = "";
      else if (c === "\\" && quote === '"' && i + 1 < s.length) cur += s[++i];
      else cur += c;
    } else if (c === '"' || c === "'") { quote = c; has = true; }
    else if (c === "\\" && i + 1 < s.length) { cur += s[++i]; has = true; }
    else if (/\s/.test(c)) { if (has || cur) out.push(cur); cur = ""; has = false; }
    else cur += c;
  }
  if (quote) throw new Error("نقل‌قول بسته نشده است.");
  if (has || cur) out.push(cur);
  if (out.length > MAX.items) throw new Error("حداکثر ۶۴ آرگومان.");
  return out;
}

/** خط‌های KEY=value (خط خالی و # نادیده) → شیء */
export function parseEnv(text) {
  const env = {};
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    const name = (eq < 0 ? line : line.slice(0, eq)).trim();
    if (eq < 0 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || name.length > MAX.envName) throw new Error(`خط نامعتبر: «${line.slice(0, 40)}». قالب درست: NAME=value`);
    let value = line.slice(eq + 1).trim();
    if (/^(".*"|'.*')$/.test(value)) value = value.slice(1, -1);
    if (value.length > MAX.envValue) throw new Error(`مقدار ${name} بیش از حد طولانی است.`);
    env[name] = value;
  }
  if (Object.keys(env).length > MAX.envCount) throw new Error("حداکثر ۶۴ متغیر محیطی.");
  return env;
}

const BLOCKED = /^(LD_PRELOAD|LD_LIBRARY_PATH|PYTHONPATH|PYTHONHOME|PYTHONSTARTUP|PATH)$/i;

export function getRunConfigText(projectKey) {
  const c = read()[projectKey] ?? {};
  return { args: String(c.args ?? ""), env: String(c.env ?? "") };
}

export function setRunConfigText(projectKey, { args = "", env = "" } = {}) {
  parseArgs(args);
  const parsed = parseEnv(env);
  for (const name of Object.keys(parsed)) if (BLOCKED.test(name)) throw new Error(`${name} را نمی‌شود تغییر داد (امنیت مفسر).`);
  const all = read();
  if (!args.trim() && !env.trim()) delete all[projectKey];
  else all[projectKey] = { args, env };
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { throw new Error("ذخیرهٔ تنظیمات ممکن نیست (حافظهٔ محلی)."); }
}

/** آنچه همراه درخواست اجرا فرستاده می‌شود؛ خطا یعنی تنظیم نادرست، نه توقف اجرای بقیه */
export function readRunConfig(projectKey) {
  if (!projectKey) return undefined;
  const text = getRunConfigText(projectKey);
  if (!text.args.trim() && !text.env.trim()) return undefined;
  try {
    const env = parseEnv(text.env);
    for (const name of Object.keys(env)) if (BLOCKED.test(name)) delete env[name];
    return { argv: parseArgs(text.args), env };
  } catch {
    return undefined;
  }
}
