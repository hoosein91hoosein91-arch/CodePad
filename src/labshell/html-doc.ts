// Build shim: lab-shell.tsx in this version imports buildHtmlDoc/buildWebDoc but the file was
// missing from the zip. Restored from the previous version (HTML preview) + buildWebDoc.
// token = null builds a standalone page (no console bridge), used by the export button.
import type { LabFile } from "@/labshell/types";

// ساخت سندی که داخل iframe اجرا می‌شود:
// - link/script که به فایل‌های همین پروژه اشاره می‌کنند درون سند گذاشته می‌شوند
// - console و خطاها با postMessage و یک توکن یک‌بارمصرف به صفحهٔ اصلی می‌رسند
// - CSP جلوی درخواست‌های شبکه به جز تصویر، فونت و استایل امن می‌گیرد

const CSP =
  "default-src 'none'; img-src data: blob: https:; media-src data: blob: https:; font-src data: https:; style-src 'unsafe-inline' https:; script-src 'unsafe-inline'";

function bridge(token: string): string {
  return `<script>(function(){var T=${JSON.stringify(token)};
function s(k,a){try{parent.postMessage({jib:T,k:k,t:a.map(function(x){if(typeof x==="string")return x;try{var r=JSON.stringify(x);return r===undefined?String(x):r}catch(e){return String(x)}}).join(" ")},"*")}catch(e){}}
["log","info","warn","error"].forEach(function(m){var o=console[m];console[m]=function(){s(m,[].slice.call(arguments));o.apply(console,arguments)}});
window.addEventListener("error",function(e){s("error",[e.message+(e.lineno?" (line "+e.lineno+")":"")])});
window.addEventListener("unhandledrejection",function(e){s("error",["Unhandled: "+(e.reason&&e.reason.message||e.reason)])});
})();</script>`;
}

const noCloseTag = (text: string, tag: "script" | "style") => text.replace(new RegExp(`</${tag}`, "gi"), `<\\/${tag}`);

export function buildHtmlDoc(html: string, files: LabFile[], token: string | null): string {
  const byName = new Map(files.map((item) => [item.name, item]));
  const find = (ref: string) => byName.get(ref.replace(/^\.?\//, ""));

  let doc = html.replace(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi, (tag, href: string) => {
    const file = find(href);
    return file && file.lang === "css" ? `<style>${noCloseTag(file.content, "style")}</style>` : tag;
  });
  doc = doc.replace(/<script\b([^>]*)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (tag, _a: string, src: string) => {
    const file = find(src);
    return file && file.lang === "javascript" ? `<script>${noCloseTag(file.content, "script")}</script>` : tag;
  });

  const head = `<meta http-equiv="Content-Security-Policy" content="${CSP}">${token ? bridge(token) : ""}`;
  if (/<head\b[^>]*>/i.test(doc)) return doc.replace(/<head\b[^>]*>/i, (open) => `${open}${head}`);
  if (/<html\b[^>]*>/i.test(doc)) return doc.replace(/<html\b[^>]*>/i, (open) => `${open}<head>${head}</head>`);
  return `<!doctype html><html><head>${head}</head><body>${doc}</body></html>`;
}

export function buildWebDoc(web: { html: string; css: string; js: string }, token: string | null): string {
  const css = web.css ? `<style>${noCloseTag(web.css, "style")}</style>` : "";
  const js = web.js ? `<script>${noCloseTag(web.js, "script")}</script>` : "";
  return buildHtmlDoc(`${css}${web.html}${js}`, [], token);
}
