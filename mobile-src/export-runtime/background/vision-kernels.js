// Work directly on contiguous NumPy buffers; release every view before returning.
function view(array) {
  if (array == null) return null;
  const buffer=array.getBuffer('u8');
  return {buffer,data:buffer.data.subarray(buffer.offset || 0)};
}
function rounded(value) {
  if(value<=0)return 0;if(value>=255)return 255;
  const floor=Math.floor(value),fraction=value-floor;
  return fraction===.5 ? floor+(floor&1) : Math.round(value);
}
const tables=new Map();
function table(op,a,b,c) {
 const key=op+':'+a+':'+b+':'+c;
 if(tables.has(key))return tables.get(key);
 const binary=['weighted','and','or','xor','add'].includes(op),out=new Uint8Array(binary?65536:256);
 for(let x=0;x<256;x++) {
  if(binary)for(let y=0;y<256;y++)out[(x<<8)|y]=op==='weighted'?rounded(x*a+y*b+c):op==='and'?x&y:op==='or'?x|y:op==='xor'?x^y:Math.min(255,x+y);
  else out[x]=op==='not'?255-x:a===0?(x>b?c:0):a===1?(x>b?0:c):a===2?Math.max(0,Math.min(x,b)):a===3?(x>b?x:0):(x>b?0:x);
 }
 // Bound dynamic coefficients and thresholds without losing hot entries to image sizes.
 if(tables.size>=16)tables.delete(tables.keys().next().value);
 tables.set(key,out);return out;
}
export function imageOp(op,src,other,dst,mask,channels,a=0,b=0,c=0) {
 const views=[];
 try {
  const get=array=>{const value=view(array);if(value)views.push(value);return value?.data;};
  const input=get(src),second=get(other),out=get(dst),selection=get(mask);
  if(op==='gray') {for(let i=0,j=0;j<out.length;i+=3,j++)out[j]=rounded(input[i]*.114+input[i+1]*.587+input[i+2]*.299);return;}
  const lut=table(op,a,b,c),n=out.length;
  if(second) {
   if(!selection) {for(let i=0;i<n;i++)out[i]=lut[(input[i]<<8)|second[i]];}
   else if(channels===3) {
    for(let i=0,m=0;i<n;i+=3,m++)if(selection[m]){out[i]=lut[(input[i]<<8)|second[i]];out[i+1]=lut[(input[i+1]<<8)|second[i+1]];out[i+2]=lut[(input[i+2]<<8)|second[i+2]];}
   } else {
    for(let i=0,m=0;i<n;i+=channels,m++)if(selection[m])for(let c=0;c<channels;c++)out[i+c]=lut[(input[i+c]<<8)|second[i+c]];
   }
  } else {
   if(!selection) {for(let i=0;i<n;i++)out[i]=lut[input[i]];}
   else for(let i=0,m=0;i<n;i+=channels,m++)if(selection[m])for(let c=0;c<channels;c++)out[i+c]=lut[input[i+c]];
  }
 } finally {for(const value of views)value.buffer.release();}
}
export function monitorPixels(frame,width,height) {
 const value=view(frame);
 try {
  const input=value.data,out=new Uint8ClampedArray(width*height*4);
  for(let i=0,j=0;j<out.length;i+=3,j+=4){out[j]=input[i+2];out[j+1]=input[i+1];out[j+2]=input[i];out[j+3]=255;}
  return out;
 } finally {value.buffer.release();}
}
export function cameraPixels(rgba,destination) {
 const out=view(destination);
 try {
  const data=out.data;
  if(rgba.length*3!==data.length*4)throw Error('Invalid camera buffer size');
  for(let i=0,j=0;j<data.length;i+=4,j+=3){data[j]=rgba[i+2];data[j+1]=rgba[i+1];data[j+2]=rgba[i];}
 }finally{out.buffer.release();}
}
