// Current-frame results only: no held or averaged fingertip positions.
(function(scope){
 const distance=(a,b,width,height)=>Math.hypot((a.x-b.x)*width,(a.y-b.y)*height);
 function describe(points,width,height){
  if(!Array.isArray(points)||points.length!==21||!points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)))return null;
  if(points.some(p=>p.x<-.5||p.x>1.5||p.y<-.5||p.y>1.5))return null;
  const palmWidth=distance(points[5],points[17],width,height),palmLength=distance(points[0],points[9],width,height);
  if(palmWidth<4||palmLength<4||palmWidth/palmLength<.1||palmWidth/palmLength>8)return null;
  const scale=Math.max(palmWidth,palmLength);
  for(const chain of [[0,1,2,3,4],[0,5,6,7,8],[0,9,10,11,12],[0,13,14,15,16],[0,17,18,19,20]])for(let i=1;i<chain.length;i++)if(distance(points[chain[i-1]],points[chain[i]],width,height)>scale*3)return null;
  const palm=[0,5,9,13,17].map(i=>points[i]);
  return {x:palm.reduce((s,p)=>s+p.x,0)/5,y:palm.reduce((s,p)=>s+p.y,0)/5,size:scale/Math.max(width,height)};
 }
 class HandValidation {
  constructor(){this.reset();}
  reset(){this.previous=[];this.lastTimestamp=-Infinity;}
  filter(landmarks,width,height,timestamp){
   const elapsed=timestamp-this.lastTimestamp;
   const previous=elapsed>0&&elapsed<=300?this.previous:[];
   const used=new Set(),next=[],accepted=[],indices=[];let index=-1;
   for(const points of landmarks||[]){
    index++;
    const current=describe(points,width,height);if(!current)continue;
    let match=-1,best=Infinity;
    for(let i=0;i<previous.length;i++){
     if(used.has(i))continue;
     const p=previous[i],d=Math.hypot(current.x-p.x,current.y-p.y);
     const ratio=current.size/p.size;
     // A time-based motion allowance avoids rejecting a moving hand just
     // because CPU inference delivered fewer frames. No old points are emitted.
     const motionAllowance=Math.min(.14,Math.max(0,elapsed-34)*.0006);
     const gate=Math.min(.32,Math.max(.08,Math.min(current.size,p.size)*1.25)+motionAllowance);
     if(ratio>.4&&ratio<2.5&&d<gate&&d<best){match=i;best=d;}
    }
    current.streak=match<0?1:Math.min(2,previous[match].streak+1);
    if(match>=0)used.add(match);
    next.push(current);if(current.streak>=2){accepted.push(points);indices.push(index);}
   }
   this.previous=next;this.lastTimestamp=timestamp;
   return {landmarks:accepted,indices,pending:next.length-accepted.length};
  }
 }
 scope.CodePadHandValidation=HandValidation;
})(globalThis);
