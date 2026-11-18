import { readFileSync } from 'node:fs';
import * as acorn from 'acorn';
const f = process.argv[2];
const src = readFileSync(f,'utf8');
const ast = acorn.parse(src,{ecmaVersion:'latest',sourceType:'module'});
const fa=/[؀-ۿ]/;
for (const n of ast.body){
  if(n.type==='ImportDeclaration')continue;
  const text=src.slice(n.start,n.end);
  const strs=new Set();
  acorn.parse; // noop
  const re=/`([^`$]{2,60})`|'([^'\n]{2,60})'|"([^"\n]{2,60})"/g; let m;
  while((m=re.exec(text))){const s=m[1]??m[2]??m[3]; if(fa.test(s)) strs.add(s.trim());}
  if(!strs.size) continue;
  const label=n.type==='FunctionDeclaration'?'fn '+n.id.name:n.type==='VariableDeclaration'?'var '+n.declarations.map(d=>d.id.name||'{}').slice(0,2).join(','):n.type;
  console.log('##',label,'('+(n.end-n.start)+')',[...strs].slice(0,30).join(' | '));
}
