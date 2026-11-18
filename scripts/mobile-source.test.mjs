import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {analyze} from 'eslint-scope';
import vm from 'node:vm';

// Exercise the real recovered mobile compiler, selecting its declarations by
// JavaScript scope rather than substituting the older React compiler.
const source=readFileSync('mobile-src/assets/runtime.js','utf8');
const ast=parse(source,{ecmaVersion:'latest',sourceType:'module',ranges:true});
const scopes=analyze(ast,{ecmaVersion:2022,sourceType:'module',optimistic:true,ignoreEval:true,impliedStrict:true});
const moduleScope=scopes.scopes.find(scope=>scope.type==='module');
const selected=new Set();
const rootOf=node=>ast.body.find(root=>root.start<=node.start && root.end>=node.end);
function select(name) {
 const variable=moduleScope.set.get(name);assert.ok(variable,`Missing mobile source definition: ${name}`);
 const declaration=variable.defs[0].node;
 const root=declaration.type==='VariableDeclarator'?declaration:rootOf(declaration);assert.notEqual(root.type,'ImportDeclaration',`Compiler relies on UI import ${name}`);
 if(selected.has(root))return;selected.add(root);
 for(const variable of moduleScope.variables) if(variable.references.some(ref=>ref.identifier.start>=root.start && ref.identifier.end<=root.end)) select(variable.name);
}
for(const name of ['compileNava','withAssets'])select(name);
const program=[...selected].sort((a,b)=>a.start-b.start).map(node=>node.type==='VariableDeclarator'?'var '+source.slice(node.start,node.end)+';':source.slice(node.start,node.end)).join('\n');
const context=vm.createContext({console,setTimeout,clearTimeout,setInterval,clearInterval,TextDecoder,ArrayBuffer,DataView,Uint8Array,Map,Set,URL,AbortController});
vm.runInContext(program,context);
test('actual mobile Nava compiler accepts model commands and embeds the renderer',()=>{
 const result=context.compileNava('Pg "Models"\nScene N320,N320\nModel Car "car.glb"\nCamera N6,N18,N20');
 assert.ok(result.web,result.error);assert.match(result.web.js,/function navaModel/);assert.match(result.web.js,/"file":"car.glb"/);
 const rewritten=context.withAssets(result.web,new Map([['car.glb','data:model/gltf-binary;base64,AAAA']]));assert.match(rewritten.js,/"file":"data:model\/gltf-binary;base64,AAAA"/);
 assert.doesNotThrow(()=>new vm.Script(rewritten.js));
});
test('model duplicate names, unsupported extensions and missing scenes report errors',()=>{
 assert.match(context.compileNava('Pg "a"\nScene N320,N320\nModel Car "a.glb"\nModel Car "b.obj"').error,/تکراری/);
 assert.match(context.compileNava('Pg "a"\nScene N320,N320\nModel Car "a.fbx"').error,/فرمت/);
 assert.ok(context.compileNava('Pg "a"\nModel Car "a.glb"').error);
});
test('delivered APK and Windows exporter implementations remain present',()=>{
 for(const name of ['buildProjectApk','buildProjectDesktop','compileNava','parsePack'])assert.ok(moduleScope.set.has(name),`Missing ${name}`);
 assert.ok(readFileSync('mobile-src/apk-template.bin').byteLength>1_000_000);
 assert.ok(readFileSync('mobile-src/desktop-template.bin').byteLength>1_000_000);
 assert.match(source,/codepad-runtime-stream/);
});
test('actual mobile Nava compiler embeds animation and swept physics in exported HTML',()=>{
 const result=context.compileNava('Pg "Physics"\nScene N320,N320\nCube Box "red"\nShift Box N0,N3,N0\nBody Box N1,N1d5,N1d5,N1d5,N0d2\nVelocity Box N0,N0,N0\nGravity N0,-N9d81,N0\nPhysics N1\nModel Robot "robot.glb"\nAnim Robot "walk",N1,N1\nPauseAnim Robot N0');assert.ok(result.web,result.error);assert.match(result.web.js,/function navaPhysics/);assert.match(result.web.js,/"op":"جسم"/);assert.match(result.web.js,/"op":"پویانمایی"/);assert.doesNotThrow(()=>new vm.Script(result.web.js));
});
