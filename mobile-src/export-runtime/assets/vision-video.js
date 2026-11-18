// Bounded local video decoder. Samples the browser timeline at the requested FPS;
// it does not claim to expose the container's source frame count or native codecs.
export class ProjectVideoDecoder {
 constructor(){this.sources=new Map();this.next=0;this.disposed=false;}
 async call(data){
  if(this.disposed)throw Error('پخش ویدیو بسته شده است.');
  if(data.action==='open'){
   if(this.sources.size>=4)throw Error('حداکثر چهار فایل ویدیو هم‌زمان پشتیبانی می‌شود.');
   const bytes=data.data;if(!(bytes instanceof Uint8Array)||bytes.byteLength>256*1024*1024)throw Error('فایل ویدیو نامعتبر یا بزرگ‌تر از ۲۵۶ مگابایت است.');
   const video=document.createElement('video'),url=URL.createObjectURL(new Blob([bytes],{type:/\.webm$/i.test(data.name)?'video/webm':/\.(mp4|m4v)$/i.test(data.name)?'video/mp4':''}));
   const item={video,url,canvas:document.createElement('canvas')};video.preload='auto';video.muted=true;video.playsInline=true;
   const id=++this.next;this.sources.set(id,item);
   try{
    await this.event(item,'loadeddata',()=>{video.src=url;video.load();},()=>video.readyState>=2);
    if(this.disposed||!this.sources.has(id))throw Error('پخش ویدیو لغو شد.');
    if(!Number.isFinite(video.duration)||video.duration<=0||!video.videoWidth||video.videoWidth*video.videoHeight>16777216)throw Error('ویدیو باید مدت مشخص و اندازهٔ پشتیبانی‌شده داشته باشد.');
    item.canvas.width=video.videoWidth;item.canvas.height=video.videoHeight;item.context=item.canvas.getContext('2d',{willReadFrequently:true});
    return {id,width:video.videoWidth,height:video.videoHeight,duration:video.duration};
   }catch(e){this.close(id);throw e;}
  }
  const item=this.sources.get(data.id);if(!item)throw Error('فایل ویدیو باز نیست.');
  if(data.action==='close'){this.close(data.id);return true;}
  if(data.action!=='read')throw Error('عملیات ویدیو ناشناخته است.');
  if(!Number.isFinite(data.time)||data.time<0||data.time>=item.video.duration)return null;
  if(Math.abs(item.video.currentTime-data.time)>0.00001){
   await this.event(item,'seeked',()=>{item.video.currentTime=data.time;},()=>!item.video.seeking&&Math.abs(item.video.currentTime-data.time)<.00001);
  }
  if(this.disposed||!this.sources.has(data.id))throw Error('خواندن ویدیو لغو شد.');
  const {video,canvas,context}=item;context.drawImage(video,0,0);const rgba=context.getImageData(0,0,canvas.width,canvas.height).data;
  return {rgba,width:canvas.width,height:canvas.height};
 }
 event(item,type,action,ready){if(item.cancel)return Promise.reject(Error('خواندن هم‌زمان از یک فایل ویدیو پشتیبانی نمی‌شود.'));return new Promise((resolve,reject)=>{
  const video=item.video;let timer,settled=false;
  const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);video.removeEventListener(type,done);video.removeEventListener('error',failed);item.cancel=null;error?reject(error):resolve();};
  const done=()=>finish(),failed=()=>finish(Error('خواندن ویدیو انجام نشد؛ کُدک یا فایل سازگار نیست.'));
  item.cancel=()=>finish(Error('خواندن ویدیو لغو شد.'));video.addEventListener(type,done);video.addEventListener('error',failed);
  timer=setTimeout(()=>finish(Error('زمان خواندن ویدیو تمام شد.')),20000);
  try{action();if(ready())done();}catch(e){finish(e);}
 });}
 close(id){const item=this.sources.get(id);if(!item)return;this.sources.delete(id);item.cancel?.();item.video.pause();item.video.removeAttribute('src');item.video.load();URL.revokeObjectURL(item.url);item.canvas.width=item.canvas.height=1;}
 dispose(){this.disposed=true;for(const id of [...this.sources.keys()])this.close(id);}
}
