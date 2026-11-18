// Transfer video bytes once, then create its Blob URL inside the opaque preview.
// A Blob URL created by the editor cannot be loaded by an opaque sandbox origin.
const blobs=new Map(),tickets=new Map();
export function mediaBlobURL(blob){const url=URL.createObjectURL(blob);blobs.set(url,blob);return url;}
export function revokeMediaURL(url){blobs.delete(url);if(url?.startsWith('blob:'))URL.revokeObjectURL(url);}
window.addEventListener('message',async event=>{
 const id=event.data?.codepadMediaRequest,files=tickets.get(id);if(!files||!event.source)return;tickets.delete(id);
 try{const payload=await Promise.all(files.map(async f=>({url:f.url,type:f.blob.type,bytes:await f.blob.arrayBuffer()})));event.source.postMessage({codepadMediaReply:id,files:payload},'*',payload.map(f=>f.bytes));}
 catch{event.source.postMessage({codepadMediaReply:id,error:'رسانهٔ پیش‌نمایش بارگذاری نشد.'},'*');}
});
export function sandboxMediaDocument(html){
 const files=[...blobs].filter(([url])=>html.includes(url)).map(([url,blob])=>({url,blob}));if(!files.length)return html;
 const id=crypto.randomUUID();tickets.set(id,files);while(tickets.size>64)tickets.delete(tickets.keys().next().value);
 const payload=JSON.stringify({id,html}).replaceAll('<','\\u003c');
 return '<!doctype html><html><head><meta charset="utf-8"></head><body><script>('+function(config){
  const timer=setTimeout(()=>{document.body.textContent='آماده‌سازی ویدیو طول کشید؛ پیش‌نمایش را دوباره باز کن.';},30000);
  window.addEventListener('message',function receive(event){if(event.source!==parent||event.data?.codepadMediaReply!==config.id)return;window.removeEventListener('message',receive);clearTimeout(timer);if(event.data.error){document.body.textContent=event.data.error;return;}let html=config.html;
   for(const file of event.data.files){const url=URL.createObjectURL(new Blob([file.bytes],{type:file.type}));html=html.split(file.url).join(url);}
   document.open();document.write(html);document.close();
  });parent.postMessage({codepadMediaRequest:config.id},'*');
 }.toString()+')('+payload+');<\/script></body></html>';
}
