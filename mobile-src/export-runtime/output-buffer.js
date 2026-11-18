// One bounded DOM update per display tick; input/stop/done flush explicitly.
export function outputBuffer(element,{limit=262144,schedule=cb=>requestAnimationFrame(cb),cancel=id=>cancelAnimationFrame(id)}={}){
 let chunks=[],size=0,tick=null,timer=null,updates=0;
 function flush(){if(tick!==null)cancel(tick);tick=null;clearTimeout(timer);timer=null;if(!size)return;const follow=element.scrollHeight-element.scrollTop-element.clientHeight<120;const tail=chunks.join('').slice(-limit);chunks=[];size=0;element.textContent=(element.textContent+tail).slice(-limit);updates++;if(follow)element.scrollTop=element.scrollHeight;}
 function write(text){if(!text)return;chunks.push(String(text));size+=String(text).length;if(size>limit*2){chunks=[chunks.join('').slice(-limit)];size=chunks[0].length;}if(tick===null){tick=schedule(flush);timer=setTimeout(flush,80);}}
 return {write,flush,clear(){flush();element.textContent='';},get updates(){return updates;}};
}
