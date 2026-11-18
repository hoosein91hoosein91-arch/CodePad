// Uses the same native document-picker bridge as CodePad's APK/PC exporter.
export async function saveVisionImage(name, bytes) {
  name=String(name).split(/[\\/]/).pop().replace(/[\x00-\x1f]/g,'_');
  const extension=name.toLowerCase().split('.').pop(),types={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',bmp:'image/bmp',tif:'image/tiff',tiff:'image/tiff',jp2:'image/jp2',hdr:'image/vnd.radiance',exr:'image/x-exr',pbm:'image/x-portable-bitmap',pgm:'image/x-portable-graymap',ppm:'image/x-portable-pixmap',pnm:'image/x-portable-anymap',pfm:'image/x-portable-floatmap',sr:'image/x-sun-raster',ras:'image/x-sun-raster'};
  if(!types[extension])throw Error('پسوند خروجی تصویر شناخته‌شده نیست.');
  const mime=types[extension];
  if(!(bytes instanceof Uint8Array)||bytes.byteLength<8||bytes.byteLength>64*1024*1024)throw Error('دادهٔ تصویر معتبر نیست یا بیش از حد بزرگ است.');
  const cap=window.Capacitor;
  if(cap?.getPlatform?.()==='android') {
    if(!cap.nativePromise||!cap.isPluginAvailable?.('ApkExport'))throw Error('پل ذخیرهٔ فایل در این نصب در دسترس نیست.');
    const call=(method,args)=>cap.nativePromise('ApkExport',method,args);
    const {id}=await call('begin',{});
    try {
      for(let offset=0;offset<bytes.length;offset+=524288){
        const chunk=bytes.subarray(offset,offset+524288);let binary='';
        for(let i=0;i<chunk.length;i+=8192)binary+=String.fromCharCode(...chunk.subarray(i,i+8192));
        await call('append',{id,base64:btoa(binary)});
      }
      return !!(await call('finish',{id,name,mime})).saved;
    } finally {await call('cancel',{id}).catch(()=>{});}
  }
  const url=URL.createObjectURL(new Blob([bytes.slice().buffer],{type:mime}));
  const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);return true;
}
