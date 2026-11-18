/** Packed appearance codes use a closed palette and solid, repeatable details. */
export const NAVA_PALETTE = {
  Gi65: { color: "#e66464", name: "قرمز ملایم" },
  G72: { color: "#a5a7ae", name: "توسی" },
  B48: { color: "#5ca8f8", name: "آبی" },
  V36: { color: "#b29af5", name: "بنفش" },
  N24: { color: "#67f5a5", name: "سبز" },
  D08: { color: "#20262d", name: "زغالی" },
  W90: { color: "#f1f3f5", name: "سفید" },
  O52: { color: "#ffbd66", name: "نارنجی" },
} as const;

export type ButtonAppearance = {
  width: number; height: number; first: string; second: string;
  ink: string; layout: number; radius: number; relief: boolean;
};

export function parseAppearance(source: string): { value?: ButtonAppearance; error?: string } {
  const normalized = source.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
  const match = /^\((?:ru|Ru)([0-9]+)(?:rn|Rn)([0-9]+)(?:([yY])([A-Z][a-z]?[0-9]{2})([A-Z][a-z]?[0-9]{2}))?(Rr)?\)$/.exec(normalized);
  if (!match) return { error: "کد ظاهر معتبر نیست؛ نمونه‌های ساده: (Ru240Rn64)، رنگی: (Ru240Rn64YN24D08)، برجسته: (Ru240Rn64Rr)." };
  if (match[3] && (!match[4] || !match[5])) return { error: "بعد از Y باید دو کد رنگ بیاید؛ مثل YN24D08." };
  const width = Number(match[1]), height = Number(match[2]);
  if (width < 1 || width > 8192 || height < 1 || height > 2048) return { error: "ru باید بین ۱ تا ۸۱۹۲ و rn بین ۱ تا ۲۰۴۸ باشد." };
  const ratio = width / height;
  if (ratio < .8 || ratio > 8.2) return { error: "نسبت عرض و ارتفاع برای دکمهٔ خوش‌فرم باید بین ۰٫۸ و ۸٫۲ باشد." };
  const palette = NAVA_PALETTE as Record<string, { color: string; name: string }>;
  const firstCode = match[4] ?? "N24", secondCode = match[5] ?? "D08";
  for (const code of [firstCode, secondCode]) {
    if (!Object.hasOwn(palette, code)) return { error: `کد رنگ «${code}» تعریف نشده؛ رنگ‌های آماده: ${Object.keys(palette).join("، ")}` };
  }
  if (firstCode === secondCode) return { error: "برای جزئیات دو رنگ متفاوت انتخاب کن." };
  const first = palette[firstCode]!.color, second = palette[secondCode]!.color;
  const rgb = [1, 3, 5].map((at) => parseInt(first.slice(at, at + 2), 16) / 255).map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  const luminance = .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
  const ink = (luminance + .05) / .05 >= 1.05 / (luminance + .05) ? "#000000" : "#ffffff";
  return { value: { width, height, first, second, ink, layout: 0, radius: 16, relief: !!match[6] } };
}

export function appearanceAttributes(value: ButtonAppearance): string {
  return `data-nava-layout="${value.layout}" data-nava-relief="${value.relief ? "true" : "false"}" data-nava-size="${value.width}x${value.height}" style="--nv-width:${value.width}px;--nv-ratio:${value.width}/${value.height};--nv-first:${value.first};--nv-second:${value.second};--nv-ink:${value.ink};--nv-radius:${value.radius}px"`;
}

export const APPEARANCE_CSS = `
.nv-button.nv-packed{position:relative;isolation:isolate;overflow:hidden;align-self:center;width:min(100%,max(64px,var(--nv-width)));max-width:100%;min-width:0;aspect-ratio:var(--nv-ratio);height:auto;min-height:44px;flex-shrink:0;padding:12px 20px;border:2px solid var(--nv-second);border-radius:var(--nv-radius);background:var(--nv-first);color:var(--nv-ink);filter:none;transition:transform .15s}
.nv-packed .nv-button-label{position:relative;z-index:1;display:block;overflow-wrap:anywhere;line-height:1.5}
.nv-packed::before,.nv-packed::after{content:"";position:absolute;z-index:0;pointer-events:none;background:var(--nv-second)}
.nv-packed::before{width:6px;top:0;bottom:0;left:0}.nv-packed::after{width:24%;height:4px;right:14%;top:0}
.nv-packed[data-nava-layout="1"]::before{left:auto;right:0}.nv-packed[data-nava-layout="1"]::after{top:auto;bottom:0;right:auto;left:14%}
.nv-packed[data-nava-layout="2"]::before{width:12px;height:12px;left:6px;top:6px;bottom:auto;border-radius:50%}.nv-packed[data-nava-layout="2"]::after{top:auto;bottom:0;width:36%;right:14%}
.nv-packed[data-nava-layout="3"]::before{left:auto;right:0;width:10px;clip-path:polygon(0 0,100% 0,100% 100%,0 70%)}.nv-packed[data-nava-layout="3"]::after{left:14%;right:auto;width:28%}
.nv-button.nv-packed[data-nava-relief="true"]{box-shadow:inset 0 2px 0 #ffffff70,inset 0 -4px 0 #00000024,0 7px 0 #00000045,0 12px 26px #00000035;transform:translateY(-2px)}.nv-button.nv-packed[data-nava-relief="true"]:active{box-shadow:inset 0 2px 0 #ffffff70,inset 0 -2px 0 #00000024,0 2px 0 #00000045;transform:translateY(2px)}
.nv-button.nv-packed:active{filter:none;transform:scale(.98)}.nv-button:focus-visible{outline:3px solid #fff;outline-offset:4px}
.nv-message{margin:0;padding:12px 16px;border:1px solid #ffffff30;border-radius:12px;overflow-wrap:anywhere;color:#edf4ed;background:#101410}.nv-message[hidden]{display:none}
@media(max-width:360px){.nv-app{padding:12px}.nv-card{padding:18px}}
@media(prefers-reduced-motion:reduce){.nv-button{transition:none}.nv-button:active{transform:none}}
`;
