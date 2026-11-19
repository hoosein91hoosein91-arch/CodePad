// «مرجع پایتون»: کتابخانهٔ مرجع سریع برای مرور سینتکس/کتابخانهٔ استاندارد حین کدنویسی.
// هر مدخل کدی واقعی و اجراشدنی دارد (از قبل با python3 واقعی صحت‌سنجی شده)، نه متن نمایشی.
import { REFERENCE_ITEMS, REFERENCE_CATEGORIES } from "./hub-reference-data.js";
import { isFavorite, toggleFavorite, favoriteCount } from "./hub-favorites.js";
import { h, icon, btn, chip, state as uiState } from "./ui-dom.js";

const state = { cat: "all", q: "", favOnly: false };

function filterItems(list, { cat, q }) {
  const needle = String(q).trim().toLowerCase();
  return list.filter((x) => (cat === "all" || x.cat === cat) && (!needle || `${x.title} ${x.desc} ${x.code}`.toLowerCase().includes(needle)));
}

export function viewReference({ importSample }) {
  const root = h("div", { class: "ui-stack" });
  const list = h("div", { class: "ui-stack" });
  const count = h("span", { class: "ui-caption" });

  const run = (item) => importSample({ title: item.title, file: item.id + ".py", ext: "py", code: item.code }, { run: true });
  const open = (item) => importSample({ title: item.title, file: item.id + ".py", ext: "py", code: item.code });

  const favStar = (item, onToggle) => {
    const b = btn("", { icon: "star", kind: "tool", aria: "موردعلاقه" });
    b.style.color = isFavorite("ref", item.id) ? "var(--ui-secondary)" : "";
    b.addEventListener("click", (e) => { e.stopPropagation(); const on = toggleFavorite("ref", item.id); b.style.color = on ? "var(--ui-secondary)" : ""; onToggle?.(on); });
    return b;
  };

  const itemCard = (item) =>
    h("article", { class: "ui-card ui-stack" },
      h("div", { style: { display: "flex", gap: "8px", alignItems: "flex-start", justifyContent: "space-between" } },
        h("strong", { class: "ui-h2", style: { margin: 0 } }, item.title), favStar(item, () => { favBtn.firstChild.nextSibling.textContent = `موردعلاقه‌ها (${favoriteCount("ref")})`; if (state.favOnly) render(); })),
      h("p", { class: "ui-caption", style: { margin: 0 } }, item.desc),
      h("pre", { class: "ui-code-block", style: { maxHeight: "120px", overflow: "hidden" } }, item.code.split("\n").slice(0, 4).join("\n") + (item.code.split("\n").length > 4 ? "\n…" : "")),
      h("div", { class: "ui-actions" },
        btn("اجرا", { icon: "play", kind: "primary", onclick: () => run(item) }),
        btn("باز کردن در ویرایشگر", { kind: "line", onclick: () => open(item) })));

  const render = () => {
    list.replaceChildren();
    let items = filterItems(REFERENCE_ITEMS, state);
    if (state.favOnly) items = items.filter((x) => isFavorite("ref", x.id));
    if (!items.length) list.append(uiState({ icon: "search", title: "چیزی پیدا نشد", text: state.favOnly ? "هنوز مدخلی را موردعلاقه نکرده‌ای." : "عبارت یا دستهٔ دیگری را امتحان کن." }));
    for (const it of items) list.append(itemCard(it));
    count.textContent = `${items.length} مدخل`;
  };

  const search = h("input", { type: "search", class: "ui-input", dir: "auto", placeholder: "جست‌وجو در مرجع (مثلاً regex، دیکشنری، خطا)…", "aria-label": "جست‌وجوی مرجع", value: state.q });
  search.addEventListener("input", () => { state.q = search.value; render(); });
  const favBtn = btn(`موردعلاقه‌ها (${favoriteCount("ref")})`, { icon: "star", kind: "line", onclick: () => { state.favOnly = !state.favOnly; favBtn.setAttribute("aria-pressed", String(state.favOnly)); render(); } });
  const chips = h("div", { class: "ui-chiprow", style: { padding: 0 }, role: "group", "aria-label": "دسته" }, REFERENCE_CATEGORIES.map(([id, label]) => {
    const b = h("button", { type: "button", class: "ui-seg", "aria-pressed": String(state.cat === id), onclick: () => { state.cat = id; [...chips.children].forEach((c) => c.setAttribute("aria-pressed", String(c === b))); render(); } }, label);
    return b;
  }));

  render();
  root.append(
    h("p", { class: "ui-caption", style: { margin: 0 } }, `مرور سریع سینتکس پایتون، کتابخانهٔ استاندارد و خطاهای رایج — ${REFERENCE_ITEMS.length} مدخل، همه کد واقعی و اجراشدنی.`),
    search, h("div", { style: { display: "flex", justifyContent: "space-between" } }, count), h("div", { class: "ui-actions" }, favBtn), chips, list);
  return root;
}
