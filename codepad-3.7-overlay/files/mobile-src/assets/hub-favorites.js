// موردعلاقه‌ها: نشان‌کردن نمونه‌های پایتون و مدخل‌های مرجع برای دسترسی سریع‌تر بعداً. فقط localStorage، چیزی به جایی فرستاده نمی‌شود.
const KEY = "codepad-hub-favorites-v1";
const ls = () => { try { return globalThis.localStorage; } catch { return null; } };

function load(storage = ls()) {
  try {
    const v = JSON.parse(storage?.getItem(KEY) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch { return {}; }
}
function save(v, storage = ls()) { try { storage?.setItem(KEY, JSON.stringify(v)); } catch { /* حافظه در دسترس نیست */ } }

const fullId = (kind, id) => `${kind}:${id}`;

export function isFavorite(kind, id, storage = ls()) { return !!load(storage)[fullId(kind, id)]; }

export function toggleFavorite(kind, id, storage = ls()) {
  const all = load(storage);
  const key = fullId(kind, id);
  if (all[key]) delete all[key];
  else all[key] = { kind, id, at: Date.now() };
  save(all, storage);
  return !!all[key];
}

export function listFavorites(kind, storage = ls()) {
  return Object.values(load(storage))
    .filter((x) => !kind || x.kind === kind)
    .sort((a, b) => b.at - a.at);
}

export function favoriteCount(kind, storage = ls()) { return listFavorites(kind, storage).length; }
