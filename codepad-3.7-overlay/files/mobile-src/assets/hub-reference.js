// «مرجع پایتون»: کتابخانهٔ مرجع سریع برای مرور سینتکس/کتابخانهٔ استاندارد حین کدنویسی.
// هر مدخل کدی واقعی و اجراشدنی دارد (از قبل با python3 واقعی صحت‌سنجی شده)، نه متن نمایشی.
import { REFERENCE_ITEMS, REFERENCE_CATEGORIES } from "./hub-reference-data.js";
import { isFavorite, toggleFavorite, favoriteCount } from "./hub-favorites.js";

const state = { cat: "all", q: "", favOnly: false };

function filterItems(list, { cat, q }) {
  const needle = String(q).trim().toLowerCase();
  return list.filter((x) => (cat === "all" || x.cat === cat) && (!needle || `${x.title} ${x.desc} ${x.code}`.toLowerCase().includes(needle)));
}

export function viewReference({ h, importSample }) {
  const root = h("div", { class: "hb-view" });
  const list = h("div", { class: "hb-list" });
  const count = h("span", { class: "hb-count" });

  const run = (item) => importSample({ title: item.title, file: item.id + ".py", ext: "py", code: item.code }, { run: true });
  const open = (item) => importSample({ title: item.title, file: item.id + ".py", ext: "py", code: item.code });

  const favStar = (item) => {
    const b = h("button", { type: "button", class: "hb-fav" + (isFavorite("ref", item.id) ? " on" : ""), "aria-label": "موردعلاقه", title: "موردعلاقه",
      onclick: () => { const on = toggleFavorite("ref", item.id); b.classList.toggle("on", on); b.textContent = on ? "⭐" : "☆"; favBtn.textContent = `⭐ موردعلاقه‌ها (${favoriteCount("ref")})`; if (state.favOnly) render(); } },
      isFavorite("ref", item.id) ? "⭐" : "☆");
    return b;
  };

  const itemCard = (item) =>
    h("article", { class: "hb-sample hb-ref-card" },
      h("div", { class: "hb-st" }, h("b", {}, item.title), h("span", { class: "hb-st-r" }, favStar(item))),
      h("p", {}, item.desc),
      h("pre", { class: "hb-ref-code" }, item.code.split("\n").slice(0, 4).join("\n") + (item.code.split("\n").length > 4 ? "\n…" : "")),
      h("div", { class: "hb-row" },
        h("button", { type: "button", class: "hb-btn pri", onclick: () => run(item) }, "▶ اجرا"),
        h("button", { type: "button", class: "hb-btn", onclick: () => open(item) }, "باز کردن در ویرایشگر")));

  const render = () => {
    list.replaceChildren();
    let items = filterItems(REFERENCE_ITEMS, state);
    if (state.favOnly) items = items.filter((x) => isFavorite("ref", x.id));
    if (!items.length) list.append(h("p", { class: "hb-empty" }, state.favOnly ? "هنوز مدخلی را موردعلاقه نکرده‌ای؛ روی ☆ کنار هر مدخل بزن." : "چیزی پیدا نشد."));
    for (const it of items) list.append(itemCard(it));
    count.textContent = `${items.length} مدخل`;
  };

  const search = h("input", { type: "search", dir: "auto", placeholder: "جست‌وجو در مرجع (مثلاً regex، دیکشنری، خطا)…", "aria-label": "جست‌وجوی مرجع", value: state.q });
  search.addEventListener("input", () => { state.q = search.value; render(); });
  const favBtn = h("button", { type: "button", class: "hb-btn", "aria-pressed": String(state.favOnly), onclick: () => { state.favOnly = !state.favOnly; favBtn.setAttribute("aria-pressed", String(state.favOnly)); render(); } }, `⭐ موردعلاقه‌ها (${favoriteCount("ref")})`);
  const chips = h("div", { class: "hb-chips", role: "group", "aria-label": "دسته" }, REFERENCE_CATEGORIES.map(([id, label]) => {
    const b = h("button", { type: "button", "aria-pressed": String(state.cat === id), onclick: () => { state.cat = id; [...chips.children].forEach((c) => c.setAttribute("aria-pressed", String(c === b))); render(); } }, label);
    return b;
  }));

  render();
  root.append(
    h("p", { class: "hb-lead" }, `مرور سریع سینتکس پایتون، کتابخانهٔ استاندارد و خطاهای رایج — ${REFERENCE_ITEMS.length} مدخل، همه کد واقعی و اجراشدنی. با «▶ اجرا» مستقیم در ویرایشگر باز و اجرا می‌شود.`),
    h("div", { class: "hb-bar" }, search, count), h("div", { class: "hb-row" }, favBtn), chips, list);
  return root;
}
