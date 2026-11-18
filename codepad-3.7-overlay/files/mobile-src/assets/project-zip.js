import {inflateSync} from './vendor/fflate.js';
export const ZIP_LIMITS={compressed:64*1024*1024,expanded:128*1024*1024,entries:2000,files:500,sourceFiles:100,sourceBytes:5*1024*1024};
export function projectPath(name){
 if(typeof name!=='string'||!name||name.length>240||/[\x00-\x1f\x7f]/.test(name))throw Error('نام فایل ZIP نامعتبر است.');
 const path=name.replaceAll('\\','/');
 if(path.startsWith('/')||/^[a-z]:/i.test(path)||path.split('/').some(p=>p==='..')||path.split('/').length>20)throw Error('مسیر خارج از پروژه در ZIP پذیرفته نمی‌شود.');
 const result=path.split('/').filter(p=>p&&p!=='.').join('/');if(!result)throw Error('مسیر فایل خالی است.');return result;
}
const skip=name=>name.split('/').some(p=>['.git','.venv','venv','node_modules','__pycache__','__MACOSX'].includes(p))||/\.(pyc|pyo)$/i.test(name);
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function crc32(bytes){let value=0xffffffff;for(const b of bytes)value=crcTable[(value^b)&255]^(value>>>8);return (value^0xffffffff)>>>0;}
export function unpackProjectZIP(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input),length=bytes.length;
 if(length<22||length>ZIP_LIMITS.compressed)throw Error('ZIP باید حداکثر ۶۴ مگابایت باشد.');
 const view=new DataView(bytes.buffer,bytes.byteOffset,length),u16=o=>view.getUint16(o,true),u32=o=>view.getUint32(o,true);
 let end=length-22;for(;end>=Math.max(0,length-65557);end--)if(u32(end)===0x06054b50&&end+22+u16(end+20)===length)break;
 if(end<Math.max(0,length-65557))throw Error('ساختار ZIP معتبر نیست.');
 const count=u16(end+10),directory=u32(end+16),directorySize=u32(end+12);
 if(u16(end+4)||u16(end+6)||u16(end+8)!==count||count===65535||directory===0xffffffff||count>ZIP_LIMITS.entries||directory+directorySize>end)throw Error('ZIP چندبخشی، ZIP64 یا تعداد فایل بیش از حد پشتیبانی نمی‌شود.');
 let offset=directory,total=0,skipped=0;const records=[],names=new Set(),decoder=new TextDecoder('utf-8',{fatal:true});
 for(let i=0;i<count;i++){
  if(offset+46>directory+directorySize||u32(offset)!==0x02014b50)throw Error('فهرست فایل‌های ZIP خراب است.');
  const flags=u16(offset+8),method=u16(offset+10),crc=u32(offset+16),packed=u32(offset+20),size=u32(offset+24),nameLength=u16(offset+28),extra=u16(offset+30),comment=u16(offset+32),attrs=u32(offset+38),local=u32(offset+42);
  if(offset+46+nameLength+extra+comment>directory+directorySize)throw Error('نام فایل ZIP ناقص است.');
  let raw;try{raw=decoder.decode(bytes.subarray(offset+46,offset+46+nameLength));}catch{throw Error('نام فایل‌ها باید با UTF-8 ذخیره شده باشد.');}
  offset+=46+nameLength+extra+comment;
  if(flags&1||method!==0&&method!==8)throw Error('ZIP رمزدار یا روش فشرده‌سازی آن پشتیبانی نمی‌شود.');
  if(((attrs>>>16)&0xf000)===0xa000)throw Error('پیوند نمادین در ZIP پشتیبانی نمی‌شود.');
  const name=projectPath(raw);
  if(skip(name)||raw.endsWith('/')||raw.endsWith('\\')){skipped++;continue;}
  if(names.has(name))throw Error('نام فایل تکراری در ZIP: '+name);names.add(name);
  total+=size;if(total>ZIP_LIMITS.expanded||records.length>=ZIP_LIMITS.files)throw Error('محتوای ZIP از ۱۲۸ مگابایت یا ۵۰۰ فایل بیشتر است.');
  if(local+30>directory||u32(local)!==0x04034b50||u16(local+8)!==method)throw Error('سرآیند فایل ZIP خراب است.');
  const start=local+30+u16(local+26)+u16(local+28);
  if(start+packed>directory||size===0xffffffff||packed===0xffffffff)throw Error('دادهٔ فایل ZIP ناقص است.');
  if(decoder.decode(bytes.subarray(local+30,local+30+u16(local+26)))!==raw)throw Error('نام سرآیندهای ZIP یکسان نیست.');
  records.push({name,start,packed,size,crc,method});
 }
 if(!records.length)throw Error('ZIP فایل قابل استفاده‌ای ندارد.');
 let prefix='';const first=records[0].name.split('/')[0];
 if(records.every(r=>r.name.startsWith(first+'/'))&&!records.some(r=>r.name===first+'/__init__.py'))prefix=first+'/';
 const files=records.map(r=>{
  const data=r.method===0?bytes.slice(r.start,r.start+r.packed):inflateSync(bytes.subarray(r.start,r.start+r.packed),{out:new Uint8Array(r.size)});
  if(data.length!==r.size||crc32(data)!==r.crc)throw Error('فایل ZIP ناقص یا خراب است: '+r.name);
  return {name:r.name.slice(prefix.length),bytes:data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)};
 });
 return {files,prefix,skipped,total};
}
// Scripts with an `if __name__ == "__main__":` guard are runnable programs; tests and helpers are not.
export function guessPythonEntry(files){
 const runnable=files.filter(f=>/\.py$/i.test(f.name)&&!/(^|\/)(tests?|test_[^/]*|[^/]*_test)(\/|\.py$)/i.test(f.name)&&/^if\s+__name__\s*==\s*['"]__main__['"]\s*:/m.test(f.content));
 if(runnable.length===1)return runnable[0].name;
 const hint=runnable.filter(f=>/(^|\/)([^/]*_)?(bot|main|run|start|server|app|cli)[^/]*\.py$/i.test(f.name));
 return hint.length===1?hint[0].name:'';
}
export function prepareProjectFiles(unpacked,langFromName){
 const text=[],assets=[];let total=0;
 const code=/\.(py|pyi|js|mjs|jsx|ts|tsx|html?|css|nava|mix|fa|jib|bit|c|cpp|h|txt|md|json|ya?ml|toml|ini|cfg|csv|xml)$/i;
 for(const file of unpacked.files){
  const bytes=new Uint8Array(file.bytes);let content;
  if(code.test(file.name)&&bytes.length<=1024*1024&&!bytes.subarray(0,8192).includes(0))try{content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{}
  if(content===undefined){if(/\.py$/i.test(file.name))throw Error('فایل Python باید UTF-8 و حداکثر ۱ مگابایت باشد: '+file.name);assets.push(file);continue;}
  total+=bytes.length;if(total>ZIP_LIMITS.sourceBytes||text.length>=ZIP_LIMITS.sourceFiles)throw Error('سورس پروژه بیش از ۵ مگابایت یا ۱۰۰ فایل است.');
  text.push({name:file.name,content,lang:langFromName(file.name)});
 }
 if(!text.length)throw Error('هیچ فایل سورسی در ZIP پیدا نشد.');
 const candidates=text.filter(f=>/\.(py|html?|nava|mix|jib|fa|bit|js)$/i.test(f.name));
 const entry=['main.py','app.py','__main__.py','index.html'].find(name=>candidates.some(f=>f.name===name))||candidates.find(f=>/\/(main|app|__main__)\.py$/i.test(f.name))?.name||(candidates.length===1?candidates[0].name:'')||guessPythonEntry(text);
 return {files:text,assets,candidates:candidates.map(f=>f.name),entry,prefix:unpacked.prefix,skipped:unpacked.skipped,total:unpacked.total};
}
