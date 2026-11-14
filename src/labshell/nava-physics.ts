/** Portable arcade physics: swept axis-aligned boxes, mass, gravity and impulse.
 * Fixed 1/120 s integration; colliders do not rotate with the visual model.
 * No external dependencies: embedded verbatim into Nava HTML / APK / PC output.
 */
export function navaPhysics(objects:any[]):any {
  const bodies=new Map<string,any>();let gravity=[0,-9.81,0],enabled=true,accumulator=0;
  const STEP=1/120,EPS=1e-7;
  const number=(v:any,min:number,max:number)=>{const n=Number(v);if(!Number.isFinite(n)||n<min||n>max)throw Error('Physics value outside '+min+'..'+max);return n};
  const object=(name:string)=>{const o=objects.find(o=>o.name===name);if(!o)throw Error('Object is missing: '+name);return o};
  const half=(b:any)=>b.size.map((v:number,i:number)=>v*b.o.scale[i]/2);
  function pairs(list:any[],time:number){const bounds=list.map(b=>{const h=half(b),lo=b.o.pos.map((p:number,i:number)=>Math.min(p,p+b.v[i]*time)-h[i]),hi=b.o.pos.map((p:number,i:number)=>Math.max(p,p+b.v[i]*time)+h[i]);return {b,lo,hi}}).sort((a,b)=>a.lo[0]-b.lo[0]);const result:any[]=[];
    for(let i=0;i<bounds.length;i++)for(let j=i+1;j<bounds.length&&bounds[j].lo[0]<=bounds[i].hi[0]+EPS;j++){const a=bounds[i],b=bounds[j];if(a.b.inv+b.b.inv>0&&[1,2].every(k=>a.lo[k]<=b.hi[k]+EPS&&a.hi[k]+EPS>=b.lo[k]))result.push([a.b,b.b]);}return result;
  }
  function response(a:any,b:any,axis:number,sign:number){const relative=(a.v[axis]-b.v[axis])*sign;if(relative>=0)return;const bounce=Math.abs(relative)<.15?0:Math.min(a.bounce,b.bounce),impulse=-(1+bounce)*relative/(a.inv+b.inv);
    a.v[axis]+=impulse*a.inv*sign;b.v[axis]-=impulse*b.inv*sign;
    if(axis===1){for(const k of [0,2]){if(a.inv)a.v[k]*=.995;if(b.inv)b.v[k]*=.995}}
  }
  function fixed(dt:number){const list=[...bodies.values()];for(const b of list){b.previous=b.o.pos.slice();if(b.inv)for(let k=0;k<3;k++)b.v[k]+=gravity[k]*dt;}
    // Resolve initial penetration before swept motion (teleport / newly created body).
    for(let iteration=0;iteration<4;iteration++)for(const[a,b]of pairs(list,0)){const ha=half(a),hb=half(b),d=a.o.pos.map((p:number,k:number)=>p-b.o.pos[k]),depth=d.map((v:number,k:number)=>ha[k]+hb[k]-Math.abs(v));if(depth.some((v:number)=>v<=EPS))continue;let axis=depth.indexOf(Math.min(...depth)),sign=d[axis]<0?-1:1,total=a.inv+b.inv;
      a.o.pos[axis]+=(depth[axis]+EPS)*a.inv/total*sign;b.o.pos[axis]-=(depth[axis]+EPS)*b.inv/total*sign;response(a,b,axis,sign);}
    let remaining=dt;
    for(let iteration=0;remaining>EPS&&iteration<64;iteration++){
      let hit:any=null,first=remaining;
      for(const[a,b]of pairs(list,remaining)){const ha=half(a),hb=half(b);let enter=-Infinity,exit=Infinity,axis=-1,sign=0,valid=true;
        for(let k=0;k<3;k++){const d=a.o.pos[k]-b.o.pos[k],v=a.v[k]-b.v[k],radius=ha[k]+hb[k];if(Math.abs(v)<EPS){if(Math.abs(d)>radius+EPS){valid=false;break}}else{const t1=(-radius-d)/v,t2=(radius-d)/v,near=Math.min(t1,t2),far=Math.max(t1,t2);if(near>enter){enter=near;axis=k;sign=v>0?-1:1}exit=Math.min(exit,far)}}
        if(valid&&axis>=0&&enter>=-EPS&&enter<=exit+EPS&&exit>=0&&enter<=first&&(a.v[axis]-b.v[axis])*sign<0){first=Math.max(0,enter);hit={a,b,axis,sign};}
      }
      for(const b of list)if(b.inv)for(let k=0;k<3;k++)b.o.pos[k]+=b.v[k]*first;
      remaining-=first;if(!hit)break;
      const{a,b,axis,sign}=hit;response(a,b,axis,sign);const total=a.inv+b.inv;a.o.pos[axis]+=EPS*a.inv/total*sign;b.o.pos[axis]-=EPS*b.inv/total*sign;
    }
  }
  return {
    get active(){return enabled&&[...bodies.values()].some(b=>b.inv>0)},
    body(name:string,args:any[]){const o=object(name);if(bodies.size>=128&&!bodies.has(name))throw Error('Maximum 128 colliders');const mass=number(args[0],0,100000),size=[1,2,3].map(i=>number(args[i],.001,10000)),bounce=number(args[4]??.2,0,1);const previous=bodies.get(name);bodies.set(name,{o,size,bounce,inv:mass?1/mass:0,v:mass?(previous?.v||[0,0,0]):[0,0,0],previous:o.pos.slice()});},
    velocity(name:string,args:any[]){const b=bodies.get(name);if(!b||!b.inv)throw Error('Velocity needs a dynamic Body: '+name);b.v=args.map(v=>number(v,-10000,10000));},
    impulse(name:string,args:any[]){const b=bodies.get(name);if(!b)throw Error('Use Body before Impulse: '+name);args.forEach((v,i)=>b.v[i]+=number(v,-100000,100000)*b.inv)},
    gravity(args:any[]){gravity=args.map(v=>number(v,-1000,1000))},
    enable(value:boolean){enabled=value;accumulator=0},
    step(seconds:number){if(!enabled)return;accumulator+=Math.max(0,Math.min(.1,Number(seconds)||0));while(accumulator>=STEP){fixed(STEP);accumulator-=STEP;}},
    state(name:string){const b=bodies.get(name);return b?{position:b.o.pos.slice(),velocity:b.v.slice(),mass:b.inv?1/b.inv:0,dimensions:b.size.slice()}:null},
    renderPosition(name:string){const b=bodies.get(name);if(!b||!b.inv||!enabled)return object(name).pos;const alpha=accumulator/STEP;return b.o.pos.map((p:number,i:number)=>b.previous[i]*(1-alpha)+p*alpha)},
    resetInterpolation(name:string){const b=bodies.get(name);if(b)b.previous=b.o.pos.slice()},
    dispose(){bodies.clear();accumulator=0}
  };
}
