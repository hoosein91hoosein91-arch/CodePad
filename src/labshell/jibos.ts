// «JibOS»: API کوچکی که برنامه‌های نصب‌شده در لانچر (داخل iframe محدود) می‌بینند: window.jibos
// صدا (Web Audio) همیشه داخل خود قاب کار می‌کند. بقیه با postMessage از لانچر خواسته می‌شوند
// و لانچر فقط پیام همان قاب (با رمز یک‌بارمصرف) را جواب می‌دهد. کارهای کنترل لانچر فقط در «حالت توسعه‌دهنده».
// هیچ‌کدام دسترسی سیستم‌عامل اندروید نیست؛ همه در حد WebView و خود لانچر است.

/** فرمان‌هایی که بدون حالت توسعه‌دهنده هم مجازند */
export const JIBOS_OPEN = new Set(["toast", "info", "vibrate", "speak", "storage.get", "storage.set", "storage.remove", "storage.keys", "ai"]);
/** «ai»: پرسش از Gemini با کلید خود کاربر؛ میزبان قبل از اولین استفادهٔ هر برنامه از کاربر اجازه می‌گیرد */
/** فرمان‌هایی که «حالت توسعه‌دهنده»ٔ لانچر لازم دارند */
export const JIBOS_DEV = new Set(["clipboard", "apps", "launch", "wallpaper", "accent"]);

const safeJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

export function jibosClient(nonce: string, appName: string): string {
  return `<script>(function(){var N=${safeJson(nonce)},q={},n=0;
function call(c,a){return new Promise(function(res,rej){var id=++n;q[id]=[res,rej];try{parent.postMessage({jibos:N,id:id,cmd:c,args:a===undefined?null:a},"*")}catch(e){delete q[id];rej(e);return}setTimeout(function(){if(q[id]){delete q[id];rej(new Error("jibos: no answer"))}},c==="ai"?120000:20000)})}
addEventListener("message",function(e){var d=e.data;if(!d||d.jibosReply!==N||!q[d.id])return;var p=q[d.id];delete q[d.id];if(d.ok)p[0](d.value);else p[1](new Error(d.error))});
var ac=null;function ctx(){var A=window.AudioContext||window.webkitAudioContext;if(!A)return null;if(!ac)ac=new A();if(ac.state==="suspended")ac.resume();return ac}
function tone(f,ms,type,vol){ms=ms||150;var c=ctx();if(!c)return Promise.resolve(false);var o=c.createOscillator(),g=c.createGain(),t=c.currentTime;o.type=type||"square";o.frequency.value=f||880;g.gain.setValueAtTime(vol==null?0.15:vol,t);g.gain.exponentialRampToValueAtTime(0.0001,t+ms/1000);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+ms/1000+0.03);return new Promise(function(r){setTimeout(function(){r(true)},ms)})}
window.jibos={version:"2.0",app:${safeJson(appName)},
beep:function(f,ms,type,vol){return tone(f,ms,type,vol)},
melody:function(notes,ms,type){var p=Promise.resolve();(notes||[]).forEach(function(f){p=p.then(function(){return f?tone(f,ms||170,type||"triangle"):new Promise(function(r){setTimeout(r,ms||170)})})});return p},
play:function(src){var a=new Audio(src);return a.play().then(function(){return a})},
toast:function(t){return call("toast",String(t))},
info:function(){return call("info")},
storage:{get:function(k){return call("storage.get",String(k))},set:function(k,v){return call("storage.set",[String(k),v])},remove:function(k){return call("storage.remove",String(k))},keys:function(){return call("storage.keys")}},
vibrate:function(p){return call("vibrate",p==null?200:p)},
clipboard:function(t){return call("clipboard",String(t))},
speak:function(t,lang){return call("speak",[String(t),lang||""])},
ask:function(t){return call("ai",String(t))},
apps:function(){return call("apps")},
launch:function(name){return call("launch",String(name))},
setWallpaper:function(v){return call("wallpaper",String(v))},
setAccent:function(c){return call("accent",String(c))},
call:call};
try{dispatchEvent(new Event("jibos-ready"))}catch(e){}})();</script>`;
}

/** اسکریپت را اول سند می‌گذارد تا هر کد دیگری window.jibos را ببیند */
export function injectHead(doc: string, snippet: string): string {
  if (/<head\b[^>]*>/i.test(doc)) return doc.replace(/<head\b[^>]*>/i, (open) => `${open}${snippet}`);
  if (/<html\b[^>]*>/i.test(doc)) return doc.replace(/<html\b[^>]*>/i, (open) => `${open}<head>${snippet}</head>`);
  if (/<!doctype[^>]*>/i.test(doc)) return doc.replace(/<!doctype[^>]*>/i, (open) => `${open}${snippet}`);
  return snippet + doc;
}

export type JibosStore = Record<string, unknown>;
const STORE_PREFIX = "jibos-app-";
const STORE_LIMIT = 200_000;

export function readAppStore(appName: string): JibosStore {
  try {
    const raw = localStorage.getItem(STORE_PREFIX + appName);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" && !Array.isArray(v) ? (v as JibosStore) : {};
  } catch {
    return {};
  }
}

export function writeAppStore(appName: string, store: JibosStore): void {
  const text = JSON.stringify(store);
  if (text.length > STORE_LIMIT) throw new Error("حافظهٔ این برنامه پر است (حداکثر ۲۰۰ هزار نویسه).");
  localStorage.setItem(STORE_PREFIX + appName, text);
}

export function dropAppStore(appName: string): void {
  try {
    localStorage.removeItem(STORE_PREFIX + appName);
  } catch {
    /* مهم نیست */
  }
}
