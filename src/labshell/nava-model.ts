/** Portable model decoder, embedded verbatim in exported Nava pages.
 * GLB 2 / self-contained glTF 2, OBJ geometry and binary/ASCII STL.
 * Triangles, hierarchy, base colours, embedded PNG/JPEG, skins and TRS clips.
 * No external dependencies; compression and morph targets are explicit limits.
 * Basis: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
 */
export function navaModel(bytes: ArrayBuffer, extension: string): any[] {
  const limit = 1_000_000, parts: any[] = [];
  let vertices = 0;
  const push = (positions: number[], normals: number[] = [], uv: number[] = [], color = [1, 1, 1], image: any = null) => {
    if (positions.length % 9 || positions.some(v => !Number.isFinite(v))) throw Error('Invalid triangle coordinates');
    vertices += positions.length / 3;
    if (vertices > limit) throw Error('Model exceeds 1,000,000 expanded vertices; simplify the model first');
    if (!normals.length) for (let i=0; i<positions.length; i+=9) {
      const a=positions.slice(i,i+3), b=positions.slice(i+3,i+6), c=positions.slice(i+6,i+9);
      const u=b.map((v,k)=>v-a[k]!), v=c.map((n,k)=>n-a[k]!);
      const n=[u[1]!*v[2]!-u[2]!*v[1]!,u[2]!*v[0]!-u[0]!*v[2]!,u[0]!*v[1]!-u[1]!*v[0]!];
      const length=Math.hypot(...n)||1; for(let k=0;k<3;k++)normals.push(...n.map(v=>v/length));
    }
    if(normals.length!==positions.length || normals.some(v=>!Number.isFinite(v)))throw Error('Invalid model normals');
    if(uv.length && (uv.length!==positions.length/3*2 || uv.some(v=>!Number.isFinite(v))))throw Error('Invalid texture coordinates');
    parts.push({positions,normals,uv,color,image});
  };
  const text = () => new TextDecoder().decode(bytes);
  if(extension==='obj') {
    const positions: number[][]=[], normals: number[][]=[], tex: number[][]=[];
    const out: number[]=[], norm: number[]=[], uv: number[]=[];
    let hasNormals=true, hasUV=true;
    const idx=(s: string,n: number)=>{const k=Number(s); if(!Number.isInteger(k)||k===0)throw Error('Invalid OBJ index');const at=k>0?k-1:n+k;if(at<0||at>=n)throw Error('OBJ index out of range');return at;};
    for(const line of text().split(/\r?\n/)) {
      const [kind,...values]=line.trim().split(/\s+/);
      if(kind==='v')positions.push(values.slice(0,3).map(Number));
      if(kind==='vn')normals.push(values.slice(0,3).map(Number));
      if(kind==='vt')tex.push(values.slice(0,2).map(Number));
      if(kind==='f') {
        if(values.length<3)throw Error('OBJ face needs at least 3 vertices');
        for(let j=1;j<values.length-1;j++)for(const atom of [values[0]!,values[j]!,values[j+1]!]) {
          const indices=atom.split('/');out.push(...positions[idx(indices[0]!,positions.length)]!);
          if(indices[2])norm.push(...normals[idx(indices[2],normals.length)]!);else hasNormals=false;
          if(indices[1])uv.push(...tex[idx(indices[1],tex.length)]!);else hasUV=false;
          if(out.length>limit*3)throw Error('OBJ is too large');
        }
      }
    }
    push(out,hasNormals?norm:[],hasUV?uv:[]);
  } else if(extension==='stl') {
    const view=new DataView(bytes), out: number[]=[];
    const count=bytes.byteLength>=84?view.getUint32(80,true):0;
    if(bytes.byteLength>=84 && 84+count*50===bytes.byteLength) {
      if(count*3>limit)throw Error('STL is too large');
      for(let i=0;i<count;i++)for(let j=0;j<9;j++)out.push(view.getFloat32(84+i*50+12+j*4,true));
    } else for(const match of text().matchAll(/\bvertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g)) {
      out.push(Number(match[1]),Number(match[2]),Number(match[3]));if(out.length>limit*3)throw Error('STL is too large');
    }
    push(out);
  } else if(extension==='glb' || extension==='gltf') {
    let doc: any, binary: ArrayBuffer|undefined;
    if(extension==='glb') {
      const view=new DataView(bytes);
      if(bytes.byteLength<20 || view.getUint32(0,true)!==0x46546c67 || view.getUint32(4,true)!==2 || view.getUint32(8,true)!==bytes.byteLength)throw Error('Invalid GLB 2 header');
      let at=12;
      while(at<bytes.byteLength) {
        if(at+8>bytes.byteLength)throw Error('Truncated GLB chunk');
        const length=view.getUint32(at,true), type=view.getUint32(at+4,true);at+=8;
        if(length%4 || at+length>bytes.byteLength)throw Error('Invalid GLB chunk length');
        if(type===0x4e4f534a)doc=JSON.parse(new TextDecoder().decode(bytes.slice(at,at+length)).trim());
        if(type===0x004e4942)binary=bytes.slice(at,at+length);at+=length;
      }
    } else doc=JSON.parse(text());
    if(!doc || doc.asset?.version!=='2.0')throw Error('Only glTF 2.0 is supported');
    if(doc.extensionsRequired?.length)throw Error('Required glTF extensions are not supported: '+doc.extensionsRequired.join(', '));
    const fromURI=(uri: string)=>{if(!/^data:.*;base64,/i.test(uri))throw Error('glTF must embed its buffers and textures; use GLB');const raw=atob(uri.slice(uri.indexOf(',')+1));return Uint8Array.from(raw,c=>c.charCodeAt(0)).buffer;};
    const buffers=(doc.buffers||[]).map((b: any,i: number)=>{
      const result=b.uri?fromURI(b.uri):i===0?binary:undefined;
      if(!result || result.byteLength<b.byteLength)throw Error('glTF buffer is missing or truncated');return result;
    });
    const views=doc.bufferViews||[];
    const component: any={5120:[1,'getInt8'],5121:[1,'getUint8'],5122:[2,'getInt16'],5123:[2,'getUint16'],5125:[4,'getUint32'],5126:[4,'getFloat32']};
    const sizes: any={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
    const read=(id: number): number[]=>{
      const a=doc.accessors?.[id], c=component[a?.componentType], size=sizes[a?.type];
      if(!a || !c || !size || a.sparse)throw Error('Unsupported or sparse accessor');
      if(!Number.isInteger(a.count)||a.count<0||a.count>limit)throw Error('Invalid accessor count');
      const v=views[a.bufferView], buffer=buffers[v?.buffer];if(!v || !buffer)throw Error('Accessor buffer is missing');
      const start=(v.byteOffset||0)+(a.byteOffset||0), stride=v.byteStride||c[0]*size;
      if(stride<c[0]*size || start<0 || (a.count && start+(a.count-1)*stride+c[0]*size>(v.byteOffset||0)+v.byteLength) || (v.byteOffset||0)+v.byteLength>buffer.byteLength)throw Error('Accessor exceeds its buffer view');
      const data=new DataView(buffer), out: number[]=[];
      for(let i=0;i<a.count;i++)for(let k=0;k<size;k++) {
        let value=(data as any)[c[1]](start+i*stride+k*c[0],true);
        if(a.normalized) { const max: any={5120:127,5121:255,5122:32767,5123:65535}; if(max[a.componentType])value=Math.max(-1,value/max[a.componentType]); }
        out.push(value);
      }
      return out;
    };
    const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
    const multiply=(a: number[],b: number[])=>{const out=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]!*b[c*4+k]!;return out;};
    const local=(n: any)=>{
      if(n.matrix)return n.matrix;
      const [x,y,z,w]=n.rotation||[0,0,0,1], [a,b,c]=n.scale||[1,1,1], [tx,ty,tz]=n.translation||[0,0,0];
      return [(1-2*y*y-2*z*z)*a,(2*x*y+2*w*z)*a,(2*x*z-2*w*y)*a,0,(2*x*y-2*w*z)*b,(1-2*x*x-2*z*z)*b,(2*y*z+2*w*x)*b,0,(2*x*z+2*w*y)*c,(2*y*z-2*w*x)*c,(1-2*x*x-2*y*y)*c,0,tx,ty,tz,1];
    };
    const nodes=doc.nodes||[];
    if(nodes.length>4096)throw Error('Model exceeds 4096 nodes');
    const parents=new Array(nodes.length).fill(-1);
    nodes.forEach((n:any,id:number)=>{for(const child of n.children||[]){if(!Number.isInteger(child)||!nodes[child]||parents[child]!==-1)throw Error('Invalid glTF node parent');parents[child]=id;}});
    const skins=(doc.skins||[]).map((skin:any)=>{
      if(!Array.isArray(skin.joints)||!skin.joints.length||skin.joints.length>256||skin.joints.some((j:any)=>!Number.isInteger(j)||!nodes[j]))throw Error('Invalid skin joints (maximum 256)');
      const bind=skin.inverseBindMatrices===undefined?skin.joints.flatMap(()=>identity):read(skin.inverseBindMatrices);
      if(bind.length!==skin.joints.length*16||skin.inverseBindMatrices!==undefined&&doc.accessors[skin.inverseBindMatrices].type!=='MAT4')throw Error('Invalid inverse bind matrices');
      return {joints:skin.joints,bind};
    });
    const clips=(doc.animations||[]).map((animation:any,index:number)=>{
      const channels=(animation.channels||[]).map((channel:any)=>{
        const {node,path}=channel.target||{},sampler=animation.samplers?.[channel.sampler];
        if(!nodes[node]||!['translation','rotation','scale'].includes(path)||nodes[node].matrix||!sampler)throw Error('Animation requires a TRS node and translation, rotation or scale channel');
        const times=read(sampler.input),values=read(sampler.output),size=path==='rotation'?4:3,mode=sampler.interpolation||'LINEAR';
        if(doc.accessors[sampler.input].type!=='SCALAR'||doc.accessors[sampler.input].componentType!==5126||!times.length||times.some((t:number,i:number)=>!Number.isFinite(t)||t<0||i>0&&t<=times[i-1]!))throw Error('Animation times must increase');
        if(!['LINEAR','STEP','CUBICSPLINE'].includes(mode)||values.length!==times.length*size*(mode==='CUBICSPLINE'?3:1)||values.some((v:number)=>!Number.isFinite(v)))throw Error('Invalid animation sampler');
        return {node,path,times,values,size,mode};
      });
      return {name:animation.name||String(index),channels,duration:Math.max(0,...channels.map((c:any)=>c.times.at(-1)))};
    });
    const worlds=(overrides:Map<number,any>)=>{
      const result:any[]=new Array(nodes.length),visiting=new Set<number>();
      const get=(id:number):number[]=>{if(result[id])return result[id];if(visiting.has(id))throw Error('Cycle in glTF node hierarchy');visiting.add(id);const n={...nodes[id],...overrides.get(id)},m=local(n);if(m.length!==16||m.some((v:number)=>!Number.isFinite(v)))throw Error('Invalid node transform');result[id]=parents[id]<0?m:multiply(get(parents[id]),m);visiting.delete(id);return result[id];};
      for(let i=0;i<nodes.length;i++)get(i);return result;
    };
    const baseWorld=worlds(new Map());
    const transform=(m:number[],p:number[],normal=false)=>{
      if(!normal)return [0,1,2].map(r=>m[r]!*p[0]!+m[4+r]!*p[1]!+m[8+r]!*p[2]!+m[12+r]!);
      const x=m.slice(0,3),y=m.slice(4,7),z=m.slice(8,11),cross=(a:number[],b:number[])=>[a[1]!*b[2]!-a[2]!*b[1]!,a[2]!*b[0]!-a[0]!*b[2]!,a[0]!*b[1]!-a[1]!*b[0]!];
      const nx=cross(y,z),ny=cross(z,x),nz=cross(x,y),det=x.reduce((s,v,i)=>s+v*nx[i]!,0);
      if(Math.abs(det)<1e-12)return [0,1,0];return [0,1,2].map(r=>(nx[r]!*p[0]!+ny[r]!*p[1]!+nz[r]!*p[2]!)/det);
    };
    const descriptors:any[]=[];
    const visible=new Set<number>(),roots=doc.scenes?.[doc.scene??0]?.nodes||parents.map((p:number,i:number)=>p<0?i:-1).filter((i:number)=>i>=0);
    const visit=(id:number)=>{if(!nodes[id])throw Error('glTF scene node missing');if(visible.has(id))return;visible.add(id);for(const child of nodes[id].children||[])visit(child)};
    for(const root of roots)visit(root);
    for(const id of visible){const n=nodes[id];if(n.mesh===undefined)continue;
      const primitives=doc.meshes?.[n.mesh]?.primitives;if(!Array.isArray(primitives))throw Error('Mesh is missing');
      for(const primitive of primitives){
        if((primitive.mode??4)!==4||primitive.targets?.length)throw Error('Only triangle primitives are supported; bake morph targets first');
        if(primitive.extensions?.KHR_draco_mesh_compression)throw Error('Draco compression is not supported');
        const a=primitive.attributes||{},pos=read(a.POSITION),normal=a.NORMAL!==undefined?read(a.NORMAL):[],uv=a.TEXCOORD_0!==undefined?read(a.TEXCOORD_0):[];
        if(doc.accessors[a.POSITION].type!=='VEC3'||normal.length&&normal.length!==pos.length||uv.length&&uv.length!==pos.length/3*2)throw Error('Invalid mesh attributes');
        const indices=primitive.indices!==undefined?read(primitive.indices):Array.from({length:pos.length/3},(_,i)=>i);
        if(indices.length%3||indices.some(i=>!Number.isInteger(i)||i<0||i>=pos.length/3))throw Error('Triangle index out of bounds');
        const skin=n.skin!==undefined?skins[n.skin]:null;
        if(n.skin!==undefined&&!skin)throw Error('Skin is missing');
        if(skin && (!['VEC4'].includes(doc.accessors?.[a.JOINTS_0]?.type) || ![5121,5123].includes(doc.accessors?.[a.JOINTS_0]?.componentType) || doc.accessors?.[a.WEIGHTS_0]?.type!=='VEC4' || ![5121,5123,5126].includes(doc.accessors?.[a.WEIGHTS_0]?.componentType)))throw Error('Skin requires VEC4 JOINTS_0 (unsigned byte/short) and WEIGHTS_0');
        const joints=skin?read(a.JOINTS_0):[],weights=skin?read(a.WEIGHTS_0):[];
        if(skin&&(joints.length!==pos.length/3*4||weights.length!==joints.length||joints.some((j:number)=>!Number.isInteger(j)||j<0||j>=skin.joints.length)||weights.some((w:number)=>!Number.isFinite(w)||w<0)))throw Error('Invalid skin attributes');
        if(a.JOINTS_1!==undefined||a.WEIGHTS_1!==undefined)throw Error('Only four joint influences per vertex are supported');
        const out:number[]=[],normals:number[]=[],tex:number[]=[];
        const deform=(world:any[],output:number[],norm:number[])=>{
          const matrices=skin?skin.joints.map((j:number,i:number)=>multiply(world[j],skin.bind.slice(i*16,i*16+16))):null;
          output.length=0;norm.length=0;
          for(const index of indices){let m=world[id];
            if(skin){const sum=weights.slice(index*4,index*4+4).reduce((s:number,w:number)=>s+w,0);if(sum<=1e-12)throw Error('Skin weights sum to zero');m=new Array(16).fill(0);for(let k=0;k<4;k++){const w=weights[index*4+k]!/sum,mat=matrices![joints[index*4+k]!]!;for(let r=0;r<16;r++)m[r]+=w*mat[r]!}}
            output.push(...transform(m,pos.slice(index*3,index*3+3)));
            if(normal.length){const transformed=transform(m,normal.slice(index*3,index*3+3),true),length=Math.hypot(...transformed)||1;norm.push(...transformed.map(v=>v/length));}
          }
          if(!normal.length)for(let i=0;i<output.length;i+=9){const u=[0,1,2].map(r=>output[i+3+r]!-output[i+r]!),v=[0,1,2].map(r=>output[i+6+r]!-output[i+r]!),n=[u[1]!*v[2]!-u[2]!*v[1]!,u[2]!*v[0]!-u[0]!*v[2]!,u[0]!*v[1]!-u[1]!*v[0]!],len=Math.hypot(...n)||1;for(let k=0;k<3;k++)norm.push(...n.map(v=>v/len));}
        };
        deform(baseWorld,out,normals);for(const i of indices)if(uv.length)tex.push(...uv.slice(i*2,i*2+2));
        const material=doc.materials?.[primitive.material]?.pbrMetallicRoughness;
        let image=null;const texture=doc.textures?.[material?.baseColorTexture?.index];
        if(texture){if((material.baseColorTexture.texCoord??0)!==0)throw Error('Only TEXCOORD_0 is supported');const source=doc.images?.[texture.source];
          if(source?.uri)image={bytes:fromURI(source.uri),mime:source.mimeType||/^data:([^;]+)/.exec(source.uri)?.[1]};
          else if(source?.bufferView!==undefined){const v=views[source.bufferView];if(!v||!buffers[v.buffer])throw Error('Texture buffer is missing');image={bytes:buffers[v.buffer].slice(v.byteOffset||0,(v.byteOffset||0)+v.byteLength),mime:source.mimeType};}
          if(image&&!['image/png','image/jpeg'].includes(image.mime))throw Error('Texture must be PNG or JPEG');}
        push(out,normals,tex,(material?.baseColorFactor||[1,1,1]).slice(0,3),image);
        descriptors.push({part:parts.at(-1),deform});
      }
    }
    if(clips.length && vertices>100000)throw Error('Animated models are limited to 100,000 expanded vertices; simplify the model first');
    const normalize=(q:number[])=>{const l=Math.hypot(...q);if(l<1e-12)throw Error('Invalid animation quaternion');return q.map(v=>v/l)};
    const interpolate=(c:any,time:number)=>{
      const{times,values,size,mode}=c;let lo=0,hi=times.length-1;
      while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(times[mid]<=time)lo=mid;else hi=mid-1}
      const index=lo,next=Math.min(index+1,times.length-1),dt=times[next]-times[index],u=dt?Math.max(0,Math.min(1,(time-times[index])/dt)):0;
      const value=(i:number,slot=0)=>values.slice((i*(mode==='CUBICSPLINE'?3:1)+slot)*size,(i*(mode==='CUBICSPLINE'?3:1)+slot+1)*size);
      let result:number[];
      if(mode==='STEP')result=value(index);
      else if(mode==='CUBICSPLINE'){const a=value(index,1),b=value(next,1),out=value(index,2),input=value(next,0);result=a.map((v:number,k:number)=>(2*u**3-3*u*u+1)*v+(u**3-2*u*u+u)*dt*out[k]+(-2*u**3+3*u*u)*b[k]+(u**3-u*u)*dt*input[k]);}
      else{const a=value(index),b=value(next);if(c.path==='rotation'){let dot=a.reduce((s:number,v:number,k:number)=>s+v*b[k],0);if(dot<0){for(let k=0;k<4;k++)b[k]*=-1;dot=-dot}dot=Math.min(1,dot);if(dot<.9995){const angle=Math.acos(dot),sin=Math.sin(angle);result=a.map((v:number,k:number)=>(v*Math.sin((1-u)*angle)+b[k]*Math.sin(u*angle))/sin)}else result=a.map((v:number,k:number)=>v*(1-u)+b[k]*u)}else result=a.map((v:number,k:number)=>v*(1-u)+b[k]*u)}
      return c.path==='rotation'?normalize(result):result;
    };
    (parts as any).animations=clips.map((c:any)=>({name:c.name,duration:c.duration}));
    (parts as any).update=(seconds:number,clip:string|number=0,loop=true)=>{
      const animation=typeof clip==='string'?clips.find((c:any)=>c.name===clip):clips[clip];if(!animation)throw Error('Animation clip is missing: '+clip);
      const time=loop&&animation.duration>0?Math.max(0,seconds)%animation.duration:Math.max(0,Math.min(animation.duration,seconds)),overrides=new Map<number,any>();
      for(const c of animation.channels){const values=overrides.get(c.node)||{};values[c.path]=interpolate(c,time);overrides.set(c.node,values)}
      const world=worlds(overrides);for(const{part,deform}of descriptors)deform(world,part.positions,part.normals);
      return !loop&&seconds>=animation.duration;
    };
  } else throw Error('Supported formats: GLB, self-contained glTF, OBJ and STL');
  if(!parts.length || !vertices)throw Error('Model has no triangle geometry');
  return parts;
}
