import {readFileSync, writeFileSync} from 'node:fs';
import ts from 'typescript';
import {parse} from 'acorn';

// The recovered editor keeps its compiler interface. New portable rendering
// functions have readable TypeScript sources and are regenerated from those.
export function syncNavaModels(path='mobile-src/assets/runtime.js') {
  let source=readFileSync(path,'utf8');
  for(const [name,file] of [['navaPhysics','src/labshell/nava-physics.ts'],['navaScene3d','src/labshell/nava-scene.ts'],['navaModel','src/labshell/nava-model.ts']]) {
    const compiled=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
    const declaration=parse(compiled,{ecmaVersion:'latest',sourceType:'module'}).body.find(n=>n.type==='ExportNamedDeclaration' && n.declaration?.id?.name===name)?.declaration;
    if(!declaration)throw Error('Portable function not found: '+name);
    const body=compiled.slice(declaration.start,declaration.end);
    const original=parse(source,{ecmaVersion:'latest',sourceType:'module'}).body.find(n=>n.type==='FunctionDeclaration' && n.id.name===name);
    source=original?source.slice(0,original.start)+body+source.slice(original.end):body+'\n'+source;
  }
  if(!source.includes('CodePad model declaration')) {
    const marker='    if (t === `حالت بازی`) {';
    if(!source.includes(marker))throw Error('Nava parser entrypoint has changed');
    source=source.replace(marker,`    // CodePad model declaration: one attached model, one named scene object.
    if ((r = re("^(?:مدل|model|mdl)\\\\s+ID\\\\s+(.+)$").exec(t))) {
      const file = quoted(r[2]);
      if (!file) oops(n, 'مدل را این‌طور بنویس: mdl car "car.glb"');
      const format = file.split('.').pop().toLowerCase();
      if (!['glb','gltf','obj','stl'].includes(format)) oops(n, 'فرمت مدل باید GLB، glTF، OBJ یا STL باشد.');
      if (this.P.shapes.length >= 512 || this.P.shapes.some(s => s.n === r[1])) oops(n, 'نام مدل تکراری است یا صحنه پر شده است.');
      this.P.shapes.push({n:r[1],kind:'@model:'+r[1],color:'#ffffff',file,format,line:n});
      this.P.images.push(file);
      return;
    }
${marker}`);
    const emission='const navaEngine=(${navaEngine.toString()});';
    if(!source.includes(emission))throw Error('Nava runtime emission has changed');
    source=source.replace(emission,'const navaModel=(${navaModel.toString()});'+emission);
  }
  if(!source.includes('const navaPhysics=(${navaPhysics.toString()});')) source=source.replace('const navaModel=(${navaModel.toString()});','const navaPhysics=(${navaPhysics.toString()});const navaModel=(${navaModel.toString()});');
  const registry=parse(source,{ecmaVersion:'latest',sourceType:'module'}).body.flatMap(n=>n.type==='VariableDeclaration'?n.declarations:[]).find(n=>n.id.name==='NAVA_GLYPH_WORDS')?.init;
  if(!registry)throw Error('Nava Latin registry is missing');
  if(!registry.properties.some(p=>p.key.name==='Model')) source=source.slice(0,registry.start+1)+'Model: "مدل", Mdl: "مدل",\n'+source.slice(registry.start+1);
  source=source.replace('Three-dimensional work remains WebGL primitives, not a full physics engine, model importer or AAA game engine.', 'Model Name "file.glb" loads an attached static model. Supported: GLB 2, self-contained glTF 2, OBJ geometry and STL. Embedded PNG/JPEG textures and scene hierarchy are supported; skinning and TRS animation are supported; compressed meshes, morph targets and external glTF files are not supported. Three-dimensional work is not an AAA or full physics engine.');
  writeFileSync(path,source);
}
