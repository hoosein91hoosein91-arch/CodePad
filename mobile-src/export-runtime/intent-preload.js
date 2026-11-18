// Warm local navigation resources on intent. Never clicks, submits or runs code.
export function installIntentPreload(doc,scope){
 const base=new URL(scope),seen=new Set(),pending=new Set();let stopped=false;
 if(navigator.connection?.saveData)return ()=>{};
 const enter=event=>{
  const a=event.target?.closest?.('a[href]');if(!a||stopped||seen.size>=8||pending.size>=2||a.download)return;
  let url;try{url=new URL(a.href,doc.baseURI);}catch{return;}
  if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname)||url.search||!(/\.(html?|css|js)$/i.test(url.pathname)))return;
  url.hash='';if(seen.has(url.href))return;seen.add(url.href);
  const link=doc.createElement('link');link.rel='prefetch';link.href=url.href;link.dataset.codepadIntent='true';pending.add(link);
  link.onload=link.onerror=()=>pending.delete(link);doc.head.append(link);
 };
 for(const type of ['pointerover','focusin','touchstart'])doc.addEventListener(type,enter,{passive:true});
 return ()=>{stopped=true;for(const type of ['pointerover','focusin','touchstart'])doc.removeEventListener(type,enter);for(const link of pending)link.remove();pending.clear();};
}
