import {stdlib} from './python-stdlib.js';
// Standard imports should use real CPython even if another package was once
// installed in the compatible environment. Unknown dependencies stay compatible.
export function importedModules(source=''){
 const clean=source.replace(/'''[\s\S]*?'''|"""[\s\S]*?"""|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|#[^\n]*/g,' '),names=new Set();
 for(const m of clean.matchAll(/(?:^|[\n;])\s*(?:from\s+([\w.]+)\s+import\b|import\s+([^;\n]+))/g)){
  if(m[1]&&!m[1].startsWith('.'))names.add(m[1].split('.')[0]);
  if(m[2])for(const part of m[2].split(',')){const n=part.trim().split(/[.\s]/)[0];if(n)names.add(n);}
 }return names;
}
export function useNativePython(payload,mode,stdlib,modules=[]){
 if(payload.packageCommand || mode==='wasm')return false;
 if(mode==='native')return true;
 // Only code reachable from the entry file decides the engine: unused helpers and tests that import the entry
 // (or anything else) must not push a stdlib-only project back to WebAssembly.
 const allowed=new Set([...stdlib,'PIL','codepad']),local=new Map(),add=(name,module)=>{if(!local.has(name))local.set(name,[]);local.get(name).push(module);};
 for(const m of modules){const parts=m.name.split('/');add(parts.at(-1).replace(/\.py$/,''),m);if(parts.length>1)add(parts[0],m);}
 const entry=String(payload.entryFile||'').split('/').at(-1).replace(/\.py$/,'');
 const seen=new Set(),queue=[payload.code||''];
 while(queue.length){
  const source=queue.pop();
  if(/\b(?:__import__|import_module|exec|eval)\s*\(/.test(source))return false;
  for(const name of importedModules(source)){
   if(allowed.has(name)||name===entry)continue;
   const found=local.get(name);if(!found)return false;
   for(const module of found)if(!seen.has(module)){seen.add(module);queue.push(module.source||'');}
  }
 }
 return true;
}

if(typeof window!=='undefined')window.CodePadPythonRouting=(payload,mode)=>{
 const modules=(payload.assets||[]).filter(a=>/\.py$/i.test(a.name)&&a.b64!=null).map(a=>({name:a.name,source:new TextDecoder().decode(Uint8Array.from(atob(a.b64),c=>c.charCodeAt(0)))}));
 return useNativePython(payload,mode,stdlib,modules);
};
