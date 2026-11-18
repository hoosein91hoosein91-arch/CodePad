// Playback follows the actual Python drawing commands, with worker backpressure.
// Only one bounded batch is pending; replay history has a separate memory cap.
export class TurtlePlayback {
 constructor(renderer,onState=()=>{}){
  this.renderer=renderer;this.onState=onState;this.queue=[];this.history=[];
  this.speed=1;this.paused=false;this.sealed=false;this.disposed=false;this.replayAvailable=true;
  this.completed=0;this.wait=0;this.raf=0;this.last=0;
 }
 enqueue(batch,present=true){
  if(this.disposed)return Promise.resolve();
  const meta={width:batch.width,height:batch.height,background:batch.background,title:batch.title};
  const steps=present&&batch.frames?.length
   ? batch.frames.map(([command,cursors,ms])=>({meta,commands:command?[command]:[],cursors,ms,present:true}))
   : [{meta,commands:batch.commands,cursors:batch.cursors,ms:0,present}];
  // Final cursor changes (e.g. hide before done) must not be lost.
  steps.push({meta,commands:[],cursors:batch.cursors,ms:0,present});
  if(this.replayAvailable){
   if(this.history.length+steps.length<=50000)this.history.push(...steps);
   else {this.history=[];this.replayAvailable=false;}
  }
  return new Promise(resolve=>{this.queue.push(...steps,{resolve});this.schedule();this.notify();});
 }
 notify(){this.onState({paused:this.paused,playing:this.queue.length>0,completed:this.completed,total:this.sealed&&this.replayAvailable?this.history.length:null,sealed:this.sealed,replayAvailable:this.replayAvailable});}
 schedule(){if(!this.disposed&&!this.paused&&!this.raf&&this.queue.length)this.raf=requestAnimationFrame(t=>this.tick(t));}
 tick(time){
  this.raf=0;if(this.disposed||this.paused)return;
  let budget=this.speed===0?Infinity:Math.min(100,this.last?time-this.last:0)*this.speed;
  this.last=time;let dirty=false,count=0;const resolved=[];
  while(this.queue.length&&count++<1024){
   if(this.wait>budget){this.wait-=budget;break;}
   budget-=this.wait;this.wait=0;
   const step=this.queue.shift();
   if(step.resolve){resolved.push(step.resolve);continue;}
   this.renderer.apply({...step.meta,commands:step.commands,cursors:step.cursors},false);
   dirty ||= step.present;this.completed++;this.wait=step.ms;
  }
  if(dirty)this.renderer.draw();
  this.notify();for(const resolve of resolved)resolve();
  if(!this.queue.length){this.wait=0;this.last=0;}
  this.schedule();
 }
 togglePause(){this.paused=!this.paused;this.last=0;if(this.paused){cancelAnimationFrame(this.raf);this.raf=0;}else this.schedule();this.notify();}
 setSpeed(value){this.speed=[0,.5,1,2,4].includes(Number(value))?Number(value):1;this.last=0;this.schedule();}
 seal(){this.sealed=true;this.notify();}
 replay(){
  if(!this.sealed||!this.replayAvailable||this.disposed)return;
  cancelAnimationFrame(this.raf);this.raf=0;
  for(const step of this.queue)step.resolve?.();
  this.renderer.items=[];this.renderer.cursors=[];
  if(this.history[0])this.renderer.apply({...this.history[0].meta,commands:[],cursors:[]},true);
  this.queue=[...this.history];this.completed=0;this.wait=0;this.last=0;this.paused=false;
  this.notify();this.schedule();
 }
 dispose(){this.disposed=true;cancelAnimationFrame(this.raf);this.raf=0;for(const step of this.queue)step.resolve?.();this.queue=[];this.history=[];}
}
