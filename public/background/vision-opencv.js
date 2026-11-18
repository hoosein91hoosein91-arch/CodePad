let loading, loadedCV, inputMat, outputMat;
export function loadOpenCV(){
 return loading ||= (async()=>{
  globalThis.Module ||= {};
  await import('../vision/opencv/opencv.js');
  // This pinned OpenCV build has a legacy thenable that resolves to itself.
  // Resolve a wrapper so Promise assimilation cannot recurse indefinitely.
  return new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('بارگذاری OpenCV بیش از حد طول کشید.')),60000);
   const ready=cv=>{clearTimeout(timeout);loadedCV=cv;resolve({cv});};
   if(globalThis.cv instanceof Promise)globalThis.cv.then(ready,reject);
   else if(typeof globalThis.cv?.then==='function')globalThis.cv.then(ready);
   else if(globalThis.cv?.Mat)ready(globalThis.cv);
   else {clearTimeout(timeout);reject(Error('OpenCV آماده نشد.'));}
  });
 })().catch(error=>{loading=null;throw error;});
}
export function openCVOperation(op,source,destination,json){
 // Borrowed Python buffers stay in this synchronous call. Reuse allocations
 // rather than creating/destroying two full-frame Mats for every operation.
 const cv=loadedCV,objects=[],buffers=[];
 if(!cv)throw Error('OpenCV هنوز آماده نیست.');
 try {
  const p=JSON.parse(json),keep=value=>(objects.push(value),value);
  const polygon=(points,floating=false)=>keep(cv.matFromArray(points.length/2,1,floating?cv.CV_32FC2:cv.CV_32SC2,points));
  if(op==='boundingRect'){const r=cv.boundingRect(polygon(p.points,p.floating));return [r.x,r.y,r.width,r.height];}
  const read=proxy=>{const buffer=proxy.getBuffer('u8');buffers.push(buffer);return buffer.data.subarray(buffer.offset||0);};
  if(!Number.isInteger(p.width)||!Number.isInteger(p.height)||p.width<1||p.height<1||p.width*p.height*p.channels>33554432)throw Error('اندازهٔ تصویر نامعتبر است.');
  const input=read(source),output=read(destination);
  inputMat ||= new cv.Mat();inputMat.create(p.height,p.width,cv['CV_8UC'+p.channels]);inputMat.data.set(input);
  const mat=inputMat;
  let result=mat;
  if(op==='fillPoly'||op==='polylines'||op==='ellipse'){
   const contours=keep(new cv.MatVector());for(const points of p.polygons)contours.push_back(polygon(points));
   const color=new cv.Scalar(...p.color);
   if(op==='fillPoly')cv.fillPoly(mat,contours,color,p.lineType,p.shift,new cv.Point(...p.offset));
   else if(op==='polylines')cv.polylines(mat,contours,p.closed,color,p.thickness,p.lineType,p.shift);
   else cv.ellipse(mat,new cv.Point(...p.center),new cv.Size(...p.axes),p.angle,p.startAngle,p.endAngle,color,p.thickness,p.lineType,p.shift);
  }else{
   result=outputMat ||= new cv.Mat();
   if(op==='GaussianBlur')cv.GaussianBlur(mat,result,new cv.Size(...p.ksize),p.sigmaX,p.sigmaY,p.borderType);
   else if(op==='resize')cv.resize(mat,result,new cv.Size(...p.dsize),0,0,p.interpolation);
   else if(op==='cvtColor')cv.cvtColor(mat,result,p.code);
   else if(op==='applyColorMap')cv.applyColorMap(mat,result,p.colormap);
   else if(op==='transform'){const matrix=keep(cv.matFromArray(p.rows,p.columns,cv.CV_64FC1,p.matrix));cv.transform(mat,result,matrix);}
   else throw Error('عملیات OpenCV ناشناخته است.');
  }
  if(result.data.length!==output.length)throw Error('اندازهٔ خروجی OpenCV با مقصد یکسان نیست.');
  output.set(result.data);return true;
 }finally{
  for(const value of buffers)value.release();for(const object of objects.reverse())object.delete();
 }
}
