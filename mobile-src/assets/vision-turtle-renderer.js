// Retained vector scene: resizing and PNG export never stretch the drawing.
export class TurtleRenderer {
 constructor(canvas){this.canvas=canvas;this.context=canvas.getContext('2d',{alpha:false});this.items=[];this.cursors=[];this.width=800;this.height=480;this.background='white';}
 apply(batch,present=true){
  this.width=batch.width;this.height=batch.height;this.background=batch.background;this.cursors=batch.cursors;
  for(const item of batch.commands){
   if(item[0]==='clear-all')this.items=[];
   else if(item[1]==='clear')this.items=this.items.filter(value=>value[0]!==item[0]);
   else if(item[1]==='fill'){this.items=this.items.filter(value=>value[0]!==item[0]||value[1]!=='preview-path');this.items.push(item);}
   else this.items.push(item);
  }
  if(present)this.draw();
 }
 path(points){const c=this.context;c.beginPath();if(points.length){c.moveTo(...points[0]);for(let i=1;i<points.length;i++)c.lineTo(...points[i]);}}
 stroke(color,width,points){const c=this.context;this.path(points);c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke();}
 draw(){
  const ratio=Math.min(window.devicePixelRatio||1,2,Math.sqrt(3200000/(this.width*this.height)),8192/Math.max(this.width,this.height));
  const w=Math.max(1,Math.round(this.width*ratio)),h=Math.max(1,Math.round(this.height*ratio));
  if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
  this.canvas.style.aspectRatio=`${this.width} / ${this.height}`;
  const c=this.context;c.setTransform(1,0,0,1,0,0);c.fillStyle=this.background;c.fillRect(0,0,w,h);
  c.setTransform(ratio,0,0,-ratio,w/2,h/2);
  for(const [,type,...args] of this.items){
   if(type==='path'||type==='preview-path')this.stroke(...args);
   else if(type==='fill'){
    const [color,points,strokes]=args;this.path(points);c.closePath();c.fillStyle=color;c.fill('evenodd');for(const stroke of strokes)this.stroke(...stroke);
   } else if(type==='dot'){
    const [x,y,size,color]=args;c.beginPath();c.arc(x,y,size/2,0,2*Math.PI);c.fillStyle=color;c.fill();
   } else if(type==='text'){
    const [x,y,text,align,[family,size,style],color]=args;c.save();c.translate(x,y);c.scale(1,-1);c.font=`${/bold/.test(style)?'bold ':''}${/italic/.test(style)?'italic ':''}${size*4/3}px ${family}`;c.textAlign=align;c.textBaseline='bottom';c.fillStyle=color;c.fillText(text,0,0);c.restore();
   }
  }
  for(const [x,y,heading,color,visible,shape] of this.cursors){
   if(!visible||shape==='blank')continue;
   c.save();c.translate(x,y);c.rotate(heading*Math.PI/180);c.fillStyle=color;c.strokeStyle=color;c.lineWidth=1;c.beginPath();
   if(shape==='circle')c.arc(0,0,5,0,2*Math.PI);
   else if(shape==='square')c.rect(-5,-5,10,10);
   else {c.moveTo(10,0);c.lineTo(-6,5);c.lineTo(-3,0);c.lineTo(-6,-5);c.closePath();}
   c.fill();c.restore();
  }
  this.canvas.dataset.items=String(this.items.length);this.canvas.dataset.logicalSize=`${this.width}×${this.height}`;
  this.canvas.dataset.previewPaths=String(this.items.filter(item=>item[1]==='preview-path').length);
  this.canvas.dataset.fills=String(this.items.filter(item=>item[1]==='fill').length);
 }
 png(){this.draw();return new Promise((resolve,reject)=>this.canvas.toBlob(blob=>blob?resolve(blob):reject(Error('ذخیرهٔ نقاشی ممکن نشد.')),'image/png'));}
}
