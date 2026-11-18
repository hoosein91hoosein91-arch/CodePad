// Share filesystem export layout with the Windows builder.
export function exportPlan(project,platform='windows'){
 const enc=new TextEncoder(),out={};const path=name=>{if(typeof name!=='string'||!name||name.startsWith('/')||/[\\:\x00-\x1f]/.test(name)||name.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('مسیر فایل نامعتبر است.');return name;};
 const url=name=>'./project/'+path(name).split('/').map(encodeURIComponent).join('/');
 for(const f of project.files)out['app/project/'+path(f.name)]=enc.encode(f.content);
 const assets=(project.assets||[]).map(a=>{const bytes=a.buf?new Uint8Array(a.buf):Uint8Array.from(atob(a.b64),c=>c.charCodeAt(0));const key='app/project/'+path(a.name);if(out[key])throw Error('نام فایل تکراری است.');out[key]=bytes;return {name:a.name,type:a.type,url:url(a.name),size:bytes.length};});
 const settings=project.exportSettings||{},fast=/\.html?$/i.test(project.entryFile)&&settings.fastStart!==false&&!project.files.some(f=>/\b(?:(?:assetBytes|assetText)\s*\(|(?:jibos|jibOS|JibOS)\b)/.test(f.content));
 if(settings.loadingImage&&!assets.some(a=>a.name===settings.loadingImage&&a.type.startsWith('image/')))throw Error('تصویر شروع پیدا نشد.');
 const launch={format:'codepad-launch-1',name:project.name,platform,entry:url(project.entryFile),entryKind:/\.py$/i.test(project.entryFile)?'python':/\.mix$/i.test(project.entryFile)?'mix':'web',fast,nativePython:false,image:settings.loadingImage?url(settings.loadingImage):''};
 out['app/runtime.json']=enc.encode(JSON.stringify({...project,assets}));out['app/launch.json']=enc.encode(JSON.stringify(launch));return out;
}
