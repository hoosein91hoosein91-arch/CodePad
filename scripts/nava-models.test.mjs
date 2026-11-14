import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const js=ts.transpileModule(readFileSync('src/labshell/nava-model.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const sandbox={exports:{},TextDecoder,ArrayBuffer,DataView,Uint8Array,atob};vm.runInNewContext(js,sandbox);const decode=sandbox.exports.navaModel;
const bytes=text=>new TextEncoder().encode(text).buffer;
function glb() {
 const binary=new Float32Array([0,0,0,1,0,0,0,1,0]);
 const doc={asset:{version:'2.0'},buffers:[{byteLength:36}],bufferViews:[{buffer:0,byteLength:36}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3'}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],nodes:[{mesh:0,translation:[2,3,4]}],scenes:[{nodes:[0]}],scene:0};
 let json=JSON.stringify(doc);while(json.length%4)json+=' ';
 const out=new ArrayBuffer(12+8+json.length+8+36),view=new DataView(out);view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,out.byteLength,true);view.setUint32(12,json.length,true);view.setUint32(16,0x4e4f534a,true);new Uint8Array(out,20,json.length).set(new TextEncoder().encode(json));const at=20+json.length;view.setUint32(at,36,true);view.setUint32(at+4,0x004e4942,true);new Uint8Array(out,at+8).set(new Uint8Array(binary.buffer));return out;
}
test('GLB hierarchy moves the actual triangle; truncated chunks reject',()=>{
 const result=decode(glb(),'glb');assert.deepEqual(Array.from(result[0].positions),[2,3,4,3,3,4,2,4,4]);assert.equal(result[0].normals.length,9);
 assert.throws(()=>decode(glb().slice(0,-1),'glb'),/header|chunk/);
});
test('OBJ polygons triangulate, negative indices resolve and invalid indices reject',()=>{
 const result=decode(bytes('v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf -4 -3 -2 -1'),'obj');assert.equal(result[0].positions.length,18);
 assert.throws(()=>decode(bytes('v 0 0 0\nf 1 2 3'),'obj'),/range/);
});
test('STL ASCII geometry loads; malformed and unsupported formats reject',()=>{
 const result=decode(bytes('solid a\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid a'),'stl');assert.equal(result[0].positions.length,9);
 assert.throws(()=>decode(bytes('bad'),'stl'),/geometry/);assert.throws(()=>decode(bytes('bad'),'fbx'),/Supported/);
});

function fixture({skin=false,mode='LINEAR',rotation=false,badJoint=false}={}) {
 const arrays=[],views=[],accessors=[];
 const data=(values,type,size='VEC3')=>{const buffer=type===5123?new Uint16Array(values):new Float32Array(values);const offset=arrays.reduce((s,a)=>s+a.byteLength,0);arrays.push(new Uint8Array(buffer.buffer));views.push({buffer:0,byteOffset:offset,byteLength:buffer.byteLength});accessors.push({bufferView:views.length-1,componentType:type,count:values.length/({SCALAR:1,VEC3:3,VEC4:4,MAT4:16}[size]),type:size});return accessors.length-1;};
 const position=data([0,0,0,1,0,0,0,1,0],5126),attributes={POSITION:position};
 if(skin){attributes.JOINTS_0=data(Array.from({length:12},(_,i)=>i%4===0&&badJoint?1:0),5123,'VEC4');attributes.WEIGHTS_0=data([1,0,0,0,1,0,0,0,1,0,0,0],5126,'VEC4');}
 const bind=skin?data([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],5126,'MAT4'):undefined;
 const times=data([0,1],5126,'SCALAR');
 const values=rotation?[0,0,0,1,0,0,1,0]:mode==='CUBICSPLINE'?[0,0,0,2,0,0,2,0,0,2,0,0,4,0,0,0,0,0]:[2,0,0,4,0,0];
 const output=data(values,5126,rotation?'VEC4':'VEC3'),binary=Buffer.concat(arrays.map(a=>Buffer.from(a)));
 const doc={asset:{version:'2.0'},buffers:[{byteLength:binary.length,uri:'data:application/octet-stream;base64,'+binary.toString('base64')}],bufferViews:views,accessors,meshes:[{primitives:[{attributes}]}],nodes:skin?[{mesh:0,skin:0,translation:[999,0,0]},{translation:[2,0,0]}]:[{mesh:0,translation:rotation?[0,0,0]:[2,0,0]}],scenes:[{nodes:skin?[0,1]:[0]}],animations:[{name:'walk',samplers:[{input:times,output,interpolation:mode}],channels:[{sampler:0,target:{node:skin?1:0,path:rotation?'rotation':'translation'}}]}]};
 if(skin)doc.skins=[{joints:[1],inverseBindMatrices:bind}];return bytes(JSON.stringify(doc));
}
test('joint skinning uses joint world transform rather than mesh-node translation',()=>{
 const parts=decode(fixture({skin:true}),'gltf');assert.deepEqual(Array.from(parts[0].positions).slice(0,3),[2,0,0]);parts.update(.5,'walk',false);assert.deepEqual(Array.from(parts[0].positions).slice(0,6),[3,0,0,4,0,0]);assert.throws(()=>decode(fixture({skin:true,badJoint:true}),'gltf'),/skin attributes/);
});
test('linear clips loop, stop at end, cubic interpolation and step sampling work',()=>{
 const parts=decode(fixture(),'gltf');parts.update(.5,'walk');assert.equal(parts[0].positions[0],3);parts.update(1.25,'walk');assert.equal(parts[0].positions[0],2.5);assert.equal(parts.update(2,'walk',false),true);assert.equal(parts[0].positions[0],4);
 const cubic=decode(fixture({mode:'CUBICSPLINE'}),'gltf');cubic.update(.5,0,false);assert.equal(cubic[0].positions[0],3);
 const step=decode(fixture({mode:'STEP'}),'gltf');step.update(.9,0,false);assert.equal(step[0].positions[0],2);assert.throws(()=>step.update(0,'missing'),/missing/);
});
test('quaternion interpolation rotates the actual vertices, preserving normalized normals',()=>{
 const parts=decode(fixture({rotation:true}),'gltf');parts.update(.5,0,false);assert.ok(Math.abs(parts[0].positions[3])<1e-6);assert.ok(Math.abs(parts[0].positions[4]-1)<1e-6);assert.ok(Math.abs(Math.hypot(...Array.from(parts[0].normals).slice(0,3))-1)<1e-6);
});
