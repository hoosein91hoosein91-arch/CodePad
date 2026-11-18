export function safeProjectPath(value){
 if(typeof value!=='string'||!value||value.length>240||value.startsWith('/')||value.includes('\\')||/[\x00-\x1f\x7f:]/.test(value)||value.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('مسیر فایل پروژه نامعتبر است.');
 return value;
}
export function mountProjectAssets(engine,assets,entryFile,code){
 const root='/home/pyodide',names=new Set();
 for(const asset of assets){const name=safeProjectPath(asset.name);names.add(name);if(!asset.buf)continue;const path=root+'/'+name;engine.FS.mkdirTree(path.slice(0,path.lastIndexOf('/')));engine.FS.writeFile(path,new Uint8Array(asset.buf));}
 const entry=safeProjectPath(entryFile||'main.py'),path=root+'/'+entry;
 engine.FS.mkdirTree(path.slice(0,path.lastIndexOf('/')));engine.FS.writeFile(path,code);engine.FS.chdir(root);
 engine.globals.set('_codepad_filename',path);engine.runPython('import sys,importlib\nimportlib.invalidate_caches()\n_entry_dir=_codepad_filename.rsplit("/",1)[0]\nsys.dont_write_bytecode=True\nsys.path[:]=[_entry_dir,"/home/pyodide"]+[p for p in sys.path if not str(p).startswith("/home/pyodide")]');
 return {names,path};
}
