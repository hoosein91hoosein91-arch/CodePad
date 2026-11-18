function safeProjectPath(value){
 if(typeof value!=='string'||!value||value.length>240||value.startsWith('/')||value.includes('\\')||/[\x00-\x1f\x7f:]/.test(value)||value.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('مسیر فایل پروژه نامعتبر است.');
 return value;
}
export function termuxStatusText(status){
 if(!status?.installed)return 'Termux نصب نیست. آن را نصب و یک بار باز کن.';
 if(status.serviceAvailable===false)return 'سرویس اجرای فرمان Termux در دسترس نیست؛ نصب و فعال‌بودن Termux را بررسی کن.';
 if(!status.permission)return 'Termux نصب است؛ مجوز «Run commands in Termux» برای CodePad لازم است.';
 return `Termux ${status.version||''} · مجوز Android آماده است. برای تأیید تنظیمات داخلی، «آزمون اتصال» را بزن.`;
}
function base64(text){const bytes=new TextEncoder().encode(text);let result='';for(let i=0;i<bytes.length;i+=16384)result+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(result);}
export function nativeProjectCommand(project,entry,stdin=''){
 if(!project?.files?.some(f=>f.name===entry)||!entry?.toLowerCase().endsWith('.py'))throw Error('فایل شروع Python پیدا نشد.');
 const seen=new Set(),files=project.files.map(f=>{
  const name=safeProjectPath(f.name);if(seen.has(name)||typeof f.content!=='string')throw Error('فایل پروژه تکراری یا نامعتبر است.');seen.add(name);return {name,content:f.content};
 });
 const assets=(project.assets||[]).map(a=>{const name=safeProjectPath(a.name);if(seen.has(name)||typeof a.b64!=='string')throw Error('پیوست پروژه تکراری یا نامعتبر است.');seen.add(name);return {name,b64:a.b64};});
 const payload=JSON.stringify({id:String(project.id||'project').replace(/[^\w-]/g,'_').slice(0,100),files,assets,entry,stdin:String(stdin)});
 const command=`python - <<'CODEPAD_NATIVE_PROJECT'
import base64,json,pathlib,subprocess,sys,os
p=json.loads(base64.b64decode('${base64(payload)}'))
root=(pathlib.Path.home()/'.codepad'/'projects'/p['id']).resolve()
root.mkdir(parents=True,exist_ok=True)
def target(name):
 relative=pathlib.PurePosixPath(name)
 if relative.is_absolute() or any(v in ('','.', '..') for v in name.split('/')): raise ValueError('Invalid project path')
 path=(root/name).resolve()
 if not path.is_relative_to(root): raise ValueError('Project path leaves workspace')
 path.parent.mkdir(parents=True,exist_ok=True)
 return path
for f in p['files']: target(f['name']).write_text(f['content'],encoding='utf-8')
for a in p['assets']: target(a['name']).write_bytes(base64.b64decode(a['b64'],validate=True))
environment=dict(os.environ,PYTHONPATH=str(root)+os.pathsep+os.environ.get('PYTHONPATH',''))
r=subprocess.run([sys.executable,'-B',str(target(p['entry']))],cwd=str(root),input=p['stdin'],text=True,env=environment)
sys.exit(r.returncode)
CODEPAD_NATIVE_PROJECT`;
 // Linux limits the UTF-8 size of one argument, not JavaScript string length.
 if(new TextEncoder().encode(command).length>120000)throw Error('حجم پروژه برای ارسال مستقیم به Termux زیاد است؛ پروژه را به‌صورت ZIP در خود Termux باز کن.');
 return command;
}
