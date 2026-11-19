import {mountLesson} from './lesson-player.js';
export const MEDIA_LIMITS={file:256*1024*1024,export:128*1024*1024,total:512*1024*1024};
export function mediaPath(value){
 if(typeof value!=='string'||!value||value.length>200||value.startsWith('/')||/^[a-z]+:/i.test(value)||value.includes('\\')||/[\x00-\x1f\x7f]/.test(value)||value.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('مسیر رسانه باید داخل پروژه باشد.');
 return value;
}
export function validateLesson(input){
 const title=String(input?.title||'').trim();if(!title||title.length>80)throw Error('عنوان درس باید بین ۱ تا ۸۰ نویسه باشد.');
 const checkpoints=input?.checkpoints;if(!Array.isArray(checkpoints)||checkpoints.length<1||checkpoints.length>100)throw Error('درس باید بین ۱ تا ۱۰۰ سؤال داشته باشد.');
 const seen=new Set(),clean=checkpoints.map((q,i)=>{
  const time=Number(q.time),question=String(q.question||'').trim(),options=Array.isArray(q.options)?q.options.map(s=>String(s).trim()):[],correct=Number(q.correct),id=String(q.id||'q'+(i+1));
  if(!Number.isFinite(time)||time<0||time>604800||!question||question.length>600||options.length<2||options.length>4||options.some(s=>!s||s.length>300)||!Number.isInteger(correct)||correct<0||correct>=options.length||seen.has(id))throw Error('زمان، متن سؤال، گزینه‌ها یا پاسخ درست معتبر نیست.');
  seen.add(id);return {id,time,question,options,correct,explanation:String(q.explanation||'').slice(0,1200)};
 }).sort((a,b)=>a.time-b.time);
 return {format:'codepad-lesson-1',title,subject:String(input.subject||'').slice(0,80),description:String(input.description||'').slice(0,1000),video:mediaPath(input.video),poster:input.poster?mediaPath(input.poster):'',font:input.font?mediaPath(input.font):'',requireCorrect:input.requireCorrect!==false,checkpoints:clean};
}
export function readLesson(files){
 const file=files.find(f=>f.name==='lesson-data.js');if(!file)return null;
 const match=/window\.CODEPAD_LESSON\s*=\s*([\s\S]+?);?\s*$/.exec(file.content);if(!match)return null;
 try{return validateLesson(JSON.parse(match[1].replace(/;\s*$/,'')));}catch{return null;}
}
export const LESSON_CSS=`
:root{color-scheme:dark;--bg:#11131c;--panel:#1b1e2b;--raised:#242838;--line:#2f3449;--fg:#f1f3fa;--muted:#adb4c7;--accent:#b7a1ff;--ink:#1a1230;--error:#ff7f96;font-family:Vazirmatn,Tahoma,sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);line-height:1.8}button{font:inherit;color:inherit;cursor:pointer;touch-action:manipulation;min-height:48px}button:focus-visible{outline:2px solid #67d8ef;outline-offset:3px}button:disabled{cursor:default;opacity:.5}[hidden]{display:none!important}
.lesson-app{max-width:1280px;margin:auto;padding:24px}.lesson-top{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.lesson-brand{font-size:18px;font-weight:700}.lesson-badge{font-size:12px;color:var(--muted);padding:4px 12px;border:1px solid var(--line);border-radius:24px}.lesson-heading{padding:24px 0}.lesson-heading h1{font-size:clamp(24px,4vw,36px);margin:0;line-height:1.5}.lesson-eyebrow{font-size:14px;color:var(--accent);letter-spacing:0;margin:0 0 8px}.lesson-description{color:var(--muted);max-width:65ch;margin:12px 0 0}
.lesson-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:24px;align-items:start}.lesson-main,.lesson-outline{min-width:0}.lesson-stage{background:#000;border-radius:16px;overflow:hidden}.lesson-video{width:100%;aspect-ratio:16/9;display:block;background:#000}.lesson-playback{display:flex;align-items:center;gap:16px;padding:16px 0}.lesson-clock{direction:ltr;unicode-bidi:isolate;font-size:14px;color:var(--muted)}.lesson-progress{flex:1;min-width:0;height:6px;accent-color:var(--accent)}
.lesson-outline{padding:24px;background:var(--panel);border-radius:16px}.lesson-outline h2{font-size:18px;margin:0}.lesson-count,.lesson-local-note{font-size:14px;color:var(--muted)}.lesson-stops{list-style:none;padding:0;margin:16px 0;display:grid;gap:8px}.lesson-stop{display:flex;align-items:center;gap:12px;width:100%;text-align:start;border:1px solid transparent;border-radius:12px;padding:12px;background:transparent}.lesson-stop[aria-current=true]{background:var(--raised);border-color:var(--accent)}.lesson-stop-number{color:var(--muted);font-size:14px}.lesson-stop[data-complete=true] .lesson-stop-number{color:var(--accent)}.lesson-stop-info{display:grid;gap:4px}.lesson-stop-info strong{font-size:14px;font-weight:600}.lesson-stop-info small{font-size:12px;color:var(--muted);direction:ltr;text-align:start}
.lesson-reset,.lesson-continue{padding:12px 16px;border-radius:12px;border:1px solid var(--line);background:var(--raised);width:100%}.lesson-question,.lesson-result{padding:24px;margin-top:16px;border-radius:16px;background:var(--panel)}.lesson-question h2,.lesson-result h2{font-size:20px;margin:0 0 16px;line-height:1.8}.lesson-choices{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}.lesson-choice{display:flex;gap:12px;align-items:center;text-align:start;border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--bg);overflow-wrap:anywhere}.lesson-choice-letter{color:var(--muted)}.lesson-choice[data-answer=correct]{border-color:var(--accent)}.lesson-choice[data-answer=wrong]{border-color:var(--error)}.lesson-feedback{min-height:24px;margin:16px 0;color:var(--muted)}.lesson-feedback[data-correct=true]{color:var(--accent)}.lesson-continue{background:var(--accent);color:var(--ink);font-weight:700}.lesson-warning{color:var(--error);padding:16px;border:1px solid var(--error);border-radius:12px}.lesson-result p{color:var(--muted)}
@media(max-width:900px){.lesson-grid{grid-template-columns:1fr}.lesson-app{padding:16px}.lesson-outline{order:2}.lesson-choices{grid-template-columns:1fr}.lesson-question,.lesson-result,.lesson-outline{padding:16px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
`;
export function lessonFiles(input){
 const config=validateLesson(input),json=JSON.stringify(config,null,2).replaceAll('<','\\u003c');
 const fontCSS=config.font?`@font-face{font-family:Vazirmatn;src:url(${JSON.stringify(config.font.split("/").map(encodeURIComponent).join("/"))}) format("woff2");font-display:swap;}`:"";
 const html=`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>درس تعاملی</title><style>${fontCSS}${LESSON_CSS}</style></head><body><div id="lesson-root"></div><script src="lesson-data.js"></script><script>(${mountLesson.toString()})(window.CODEPAD_LESSON);<\/script></body></html>`;
 return [{name:'lesson.html',lang:'html',content:html},{name:'lesson-data.js',lang:'javascript',content:'window.CODEPAD_LESSON = '+json+';\n'}];
}
