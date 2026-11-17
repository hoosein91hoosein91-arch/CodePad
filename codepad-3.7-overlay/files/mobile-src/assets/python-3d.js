// Python 3-D viewer: shows the scene that a Python program builds with `codepad3d` (see public/background/codepad3d.py).
// Python (Pyodide worker) <-> this page talk over a BroadcastChannel; the scene is drawn by three.js in a sandboxed iframe.
const CHANNEL = 'codepad3d';
let dialog = null, frame = null, channel = null, lastBeat = 0, watchdog = 0, current = null;
const send = (m) => { try { channel?.postMessage(JSON.stringify({ ...m, from: 'ui' })); } catch { /* channel closed */ } };

const VIEWER = String.raw`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
html,body{margin:0;height:100%;overflow:hidden;background:#000;touch-action:none;user-select:none;-webkit-user-select:none;font-family:system-ui,sans-serif}
canvas{display:block;width:100%;height:100%;outline:none}
#hud{position:fixed;left:10px;top:10px;color:#d9ffe9;text-shadow:0 1px 3px #000;white-space:pre;pointer-events:none;line-height:1.45}
#hint{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);color:#bfeedd;font-size:12px;text-shadow:0 1px 3px #000;pointer-events:none;opacity:.9;text-align:center}
#cross{position:fixed;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;pointer-events:none;display:none}
#cross:before,#cross:after{content:"";position:absolute;background:#fff;opacity:.85}#cross:before{left:6px;top:0;width:2px;height:14px}#cross:after{top:6px;left:0;height:2px;width:14px}
.stick{position:fixed;left:26px;bottom:26px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.1);border:2px solid rgba(255,255,255,.3);display:none;touch-action:none}
.stick i{position:absolute;left:36px;top:36px;width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,.35)}
.btn{position:fixed;right:26px;bottom:60px;width:70px;height:70px;border-radius:50%;background:rgba(0,255,150,.2);border:2px solid rgba(0,255,150,.5);color:#fff;display:none;align-items:center;justify-content:center;font:700 12px system-ui;touch-action:none}
</style></head><body>
<script src="lib:three"></script>
<canvas id="c"></canvas><div id="hud"></div><div id="hint"></div><div id="cross"></div>
<div class="stick" id="stick"><i id="knob"></i></div><div class="btn" id="jump">JUMP</div>
<script>
(function(){
'use strict';
var P=function(m){parent.postMessage(Object.assign({from:'viewer'},m),'*')};
var cfg=null,scene,camera,renderer,ctl=null,orbit=null,ents={},solids=[],lights=[];
var camP={mode:'orbit',pos:[0,3,8],target:[0,1,0],fov:70,speed:4.5,gravity:22,jump:7.4,height:1.7};
var keys={},mouse={x:0,y:0},joy={x:0,y:0},yaw=0,pitch=0,vel=new THREE.Vector3(),pos=new THREE.Vector3(0,3,8),grounded=false;
var touch=('ontouchstart' in window)||navigator.maxTouchPoints>0, locked=false;
var canvas=document.getElementById('c'),hudEl=document.getElementById('hud'),hint=document.getElementById('hint');
var ray=new THREE.Raycaster(),tmp=new THREE.Vector3();
function css(c){try{return new THREE.Color(c)}catch(e){return new THREE.Color('#cccccc')}}
function init(o){
  cfg=o;
  try{renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,powerPreference:'high-performance'});}catch(e){P({t:'error',msg:'WebGL is not available on this device.'});return}
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  scene=new THREE.Scene();scene.background=css(o.sky);
  if(o.fog>0)scene.fog=new THREE.FogExp2(css(o.sky),o.fog);
  camera=new THREE.PerspectiveCamera(70,1,0.05,500);
  var hemi=new THREE.HemisphereLight(0xffffff,0x334455,0.9);scene.add(hemi);
  var sun=new THREE.DirectionalLight(0xffffff,0.8);sun.position.set(6,12,8);scene.add(sun);
  if(o.shadows){renderer.shadowMap.enabled=true;sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);var s=30;sun.shadow.camera.left=-s;sun.shadow.camera.right=s;sun.shadow.camera.top=s;sun.shadow.camera.bottom=-s;}
  if(o.ground){var g=new THREE.Mesh(new THREE.PlaneGeometry(400,400),new THREE.MeshStandardMaterial({color:css(o.ground),roughness:1}));g.rotation.x=-Math.PI/2;g.receiveShadow=!!o.shadows;g.userData.ground=true;scene.add(g);}
  if(o.grid){var gh=new THREE.GridHelper(200,200,0x2a6,0x1a3b33);gh.position.y=0.01;scene.add(gh);}
  if(o.hud_font)hudEl.style.fontSize=o.hud_font+'px';
  window.__v={scene:scene,camera:camera,renderer:renderer,ents:ents,camP:camP};
  resize();window.addEventListener('resize',resize);
  setMode(camP.mode);bind();loop();P({t:'ready'});
}
function resize(){var w=window.innerWidth,h=window.innerHeight;if(!renderer)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
function makeMesh(k,p){
  var geo,mat;
  var m=function(){return new THREE.MeshStandardMaterial({color:css(p.color),roughness:0.7,metalness:0.05,transparent:p.opacity<1,opacity:p.opacity})};
  if(k==='box'){geo=new THREE.BoxGeometry(p.size[0],p.size[1],p.size[2]);}
  else if(k==='sphere'){geo=new THREE.SphereGeometry(p.r,32,20);}
  else if(k==='cylinder'){geo=new THREE.CylinderGeometry(p.r,p.r,p.h,32);}
  else if(k==='cone'){geo=new THREE.ConeGeometry(p.r,p.h,32);}
  else if(k==='torus'){geo=new THREE.TorusGeometry(p.r,p.tube,16,48);}
  else if(k==='plane'){geo=new THREE.PlaneGeometry(p.size[0],p.size[1]);geo.rotateX(-Math.PI/2);}
  else if(k==='text'){return textSprite(p);}
  else if(k==='light'){var L=new THREE.PointLight(css(p.color),p.intensity*40,60);return L;}
  var mesh=new THREE.Mesh(geo,m());mesh.castShadow=!!cfg.shadows;mesh.receiveShadow=!!cfg.shadows;
  if(k==='plane'||k==='box')mesh.material.side=THREE.DoubleSide;
  return mesh;
}
function textSprite(p){
  var c=document.createElement('canvas'),x=c.getContext('2d'),fs=64,txt=String(p.text);
  x.font='700 '+fs+'px system-ui,sans-serif';var w=Math.ceil(x.measureText(txt).width)+24;c.width=w;c.height=fs+24;
  x.font='700 '+fs+'px system-ui,sans-serif';x.textBaseline='middle';x.fillStyle=p.color||'#fff';x.strokeStyle='rgba(0,0,0,.75)';x.lineWidth=8;x.strokeText(txt,12,c.height/2);x.fillText(txt,12,c.height/2);
  var tex=new THREE.CanvasTexture(c);var sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));sp.userData.ratio=c.width/c.height;sp.userData.text=txt;sp.userData.color=p.color;
  sp.scale.set(p.size*sp.userData.ratio*2,p.size*2,1);return sp;
}
function apply(e,p){
  var o=e.obj;
  if(p.pos)o.position.set(p.pos[0],p.pos[1],p.pos[2]);
  if(p.rot){o.rotation.order='YXZ';o.rotation.set(p.rot[0]*Math.PI/180,p.rot[1]*Math.PI/180,p.rot[2]*Math.PI/180);}
  if(p.scale&&e.k!=='text')o.scale.set(p.scale[0],p.scale[1],p.scale[2]);
  if(p.visible!==undefined)o.visible=!!p.visible;
  if(p.color!==undefined&&o.material&&o.material.color&&e.k!=='text')o.material.color.copy(css(p.color));
  if(p.color!==undefined&&e.k==='light')o.color.copy(css(p.color));
  if(p.opacity!==undefined&&o.material&&e.k!=='text'){o.material.opacity=p.opacity;o.material.transparent=p.opacity<1;}
  if(p.solid!==undefined){e.solid=!!p.solid;rebuildSolids();}
  if(e.k==='text'&&(p.text!==undefined||p.color!==undefined)){var np=Object.assign({},e.p,p);var ns=textSprite(np);o.material.map.dispose();o.material.map=ns.material.map;o.userData.ratio=ns.userData.ratio;o.scale.set(np.size*ns.userData.ratio*2,np.size*2,1);}
  Object.assign(e.p,p);
  if(e.solid&&(p.pos||p.scale||p.size))rebuildSolids();
}
function rebuildSolids(){solids=[];for(var id in ents){var e=ents[id];if(e.solid&&e.k==='box'){e.obj.updateMatrixWorld(true);solids.push(new THREE.Box3().setFromObject(e.obj));}}if(camP.mode==='fps'&&camera){for(var n=0;n<40&&boxHit(pos.x,pos.y,pos.z);n++)pos.y+=0.5;}}
function handle(d){
  if(d.t==='frame'){lastFrame=performance.now();(d.ops||[]).forEach(op);return}
  if(d.t==='cam'){Object.assign(camP,d.p);applyCam(d.p);return}
}
var lastFrame=0;
function op(o){
  if(o.op==='add'){var obj=makeMesh(o.k,o.p);var e={id:o.id,k:o.k,obj:obj,p:Object.assign({},o.p),solid:false};ents[o.id]=e;scene.add(obj);apply(e,{pos:o.p.pos,rot:o.p.rot,scale:o.p.scale,visible:o.p.visible,solid:o.p.solid});}
  else if(o.op==='set'){var e=ents[o.id];if(e)apply(e,o.p);}
  else if(o.op==='del'){var e=ents[o.id];if(e){scene.remove(e.obj);if(e.obj.geometry)e.obj.geometry.dispose();delete ents[o.id];rebuildSolids();}}
  else if(o.op==='cam'){Object.assign(camP,o.p);applyCam(o.p);}
  else if(o.op==='hud'){hudEl.textContent=o.lines.join('\n');}
}
function applyCam(p){
  if(p.mode)setMode(p.mode);
  if(p.pos){pos.set(p.pos[0],p.pos[1],p.pos[2]);if(camP.mode!=='fps')camera.position.copy(pos);else{pos.y=Math.max(pos.y,camP.height);vel.set(0,0,0);for(var n=0;n<200&&boxHit(pos.x,pos.y,pos.z);n++)pos.y+=0.5;}}
  if(p.yaw!==undefined)yaw=p.yaw*Math.PI/180;
  if(p.pitch!==undefined)pitch=p.pitch*Math.PI/180;
  if(p.fov){camera.fov=p.fov;camera.updateProjectionMatrix();}
  if(camP.mode==='orbit'&&orbit&&(p.target||p.pos)){orbit.target.set(camP.target[0],camP.target[1],camP.target[2]);camera.position.set(camP.pos[0],camP.pos[1],camP.pos[2]);orbit.update();}
  if(camP.mode==='manual'&&(p.target||p.pos))camera.lookAt(camP.target[0],camP.target[1],camP.target[2]);
}
function setMode(m){
  camP.mode=m;
  if(orbit){orbit.dispose();orbit=null;}
  document.getElementById('cross').style.display=m==='fps'?'block':'none';
  document.getElementById('stick').style.display=(m==='fps'&&touch)?'block':'none';
  document.getElementById('jump').style.display=(m==='fps'&&touch)?'flex':'none';
  if(m==='orbit'){camera.position.set(camP.pos[0],camP.pos[1],camP.pos[2]);orbit=new THREE.OrbitControls(camera,canvas);orbit.target.set(camP.target[0],camP.target[1],camP.target[2]);orbit.enableDamping=true;orbit.update();hint.textContent=touch?'drag = look around · pinch = zoom':'drag = look around · wheel = zoom';}
  else if(m==='fps'){pos.set(camP.pos[0],Math.max(camP.pos[1],camP.height),camP.pos[2]);yaw=0;pitch=0;hint.textContent=touch?'left stick = move · drag right side = look':'click = capture mouse · WASD move · Space jump · Shift run · Esc release';}
  else{hint.textContent='';camera.position.set(camP.pos[0],camP.pos[1],camP.pos[2]);camera.lookAt(camP.target[0],camP.target[1],camP.target[2]);}
}
// ---- first-person controller (Minecraft style) ----
var R=0.3;
function boxHit(x,y,z){var fy=y-camP.height;for(var i=0;i<solids.length;i++){var b=solids[i];if(x+R>b.min.x&&x-R<b.max.x&&z+R>b.min.z&&z-R<b.max.z&&fy+camP.height>b.min.y+0.05&&fy<b.max.y-0.05)return b;}return null}
function stepFps(dt){
  var sp=camP.speed*((keys.shift||keys.shiftleft)?1.7:1);
  var fx=-Math.sin(yaw),fz=-Math.cos(yaw),rx=Math.cos(yaw),rz=-Math.sin(yaw);
  var f=(keys.w||keys.up?1:0)-(keys.s||keys.down?1:0)+joy.y,r=(keys.d||keys.right?1:0)-(keys.a||keys.left?1:0)+joy.x;
  var l=Math.hypot(f,r);if(l>1){f/=l;r/=l;}
  var mx=(fx*f+rx*r)*sp*dt,mz=(fz*f+rz*r)*sp*dt;
  if(!boxHit(pos.x+mx,pos.y,pos.z))pos.x+=mx;
  if(!boxHit(pos.x,pos.y,pos.z+mz))pos.z+=mz;
  vel.y-=camP.gravity*dt;
  if((keys.space||keys[' '])&&grounded){vel.y=camP.jump;grounded=false;}
  var ny=pos.y+vel.y*dt;grounded=false;
  var floor=camP.height;                       // eye height above y=0
  for(var i=0;i<solids.length;i++){var b=solids[i];
    if(pos.x+R>b.min.x&&pos.x-R<b.max.x&&pos.z+R>b.min.z&&pos.z-R<b.max.z){
      var top=b.max.y+camP.height;
      if(vel.y<=0&&pos.y>=top-0.35&&ny<=top){floor=Math.max(floor,top);}
      else if(vel.y>0&&pos.y+0.2<=b.min.y&&ny+0.2>b.min.y){ny=b.min.y-0.2;vel.y=0;}
    }}
  if(ny<=floor){ny=floor;if(vel.y<0)vel.y=0;grounded=true;}
  pos.y=ny;
  camera.position.copy(pos);camera.rotation.order='YXZ';camera.rotation.set(pitch,yaw,0);
}
// ---- input ----
function name(e){var k=(e.key||'').toLowerCase();if(k===' ')k='space';if(k.indexOf('arrow')===0)k=k.slice(5);return k}
function bind(){
  window.addEventListener('keydown',function(e){var k=name(e);if(!keys[k]){keys[k]=true;P({t:'key',k:k,down:true});}if(['space','up','down','left','right'].indexOf(k)>=0)e.preventDefault();});
  window.addEventListener('keyup',function(e){var k=name(e);keys[k]=false;P({t:'key',k:k,down:false});});
  window.addEventListener('blur',function(){keys={};});
  document.addEventListener('pointerlockchange',function(){locked=document.pointerLockElement===canvas;});
  window.addEventListener('mousemove',function(e){if(camP.mode==='fps'&&locked){yaw-=e.movementX*0.0022;pitch=Math.max(-1.5,Math.min(1.5,pitch-e.movementY*0.0022));mouse.x+=e.movementX;mouse.y+=e.movementY;}});
  var down=null;
  canvas.addEventListener('pointerdown',function(e){window.focus();down={x:e.clientX,y:e.clientY,t:performance.now(),id:e.pointerId,b:e.button};
    if(camP.mode==='fps'&&!touch&&!locked&&canvas.requestPointerLock){try{canvas.requestPointerLock();}catch(x){} }});
  canvas.addEventListener('pointerup',function(e){
    if(!down||down.id!==e.pointerId)return;var moved=Math.hypot(e.clientX-down.x,e.clientY-down.y),dt=performance.now()-down.t;var d=down;down=null;
    if(moved>8||dt>500)return;
    var nx,ny;if(camP.mode==='fps'&&(locked||touch&&false)){nx=0;ny=0;}else{nx=(e.clientX/window.innerWidth)*2-1;ny=-(e.clientY/window.innerHeight)*2+1;}
    pick(nx,ny,d.b);
  });
  // touch: left half = joystick, right half = look
  if(touch){
    var st=document.getElementById('stick'),kn=document.getElementById('knob'),sid=null,lid=null,lx=0,ly=0,ox=0,oy=0;
    st.addEventListener('touchstart',function(e){e.preventDefault();var t=e.changedTouches[0];sid=t.identifier;var r=st.getBoundingClientRect();ox=r.left+r.width/2;oy=r.top+r.height/2;},{passive:false});
    st.addEventListener('touchmove',function(e){e.preventDefault();for(var i=0;i<e.changedTouches.length;i++){var t=e.changedTouches[i];if(t.identifier!==sid)continue;var dx=Math.max(-1,Math.min(1,(t.clientX-ox)/48)),dy=Math.max(-1,Math.min(1,(t.clientY-oy)/48));joy.x=dx;joy.y=-dy;kn.style.transform='translate('+dx*34+'px,'+dy*34+'px)';}},{passive:false});
    var endS=function(e){for(var i=0;i<e.changedTouches.length;i++)if(e.changedTouches[i].identifier===sid){sid=null;joy.x=joy.y=0;kn.style.transform='';}};
    st.addEventListener('touchend',endS);st.addEventListener('touchcancel',endS);
    document.getElementById('jump').addEventListener('touchstart',function(e){e.preventDefault();keys.space=true;setTimeout(function(){keys.space=false},120);},{passive:false});
    canvas.addEventListener('touchstart',function(e){for(var i=0;i<e.changedTouches.length;i++){var t=e.changedTouches[i];if(lid===null){lid=t.identifier;lx=t.clientX;ly=t.clientY;}}},{passive:true});
    canvas.addEventListener('touchmove',function(e){if(camP.mode!=='fps')return;for(var i=0;i<e.changedTouches.length;i++){var t=e.changedTouches[i];if(t.identifier===lid){yaw-=(t.clientX-lx)*0.006;pitch=Math.max(-1.5,Math.min(1.5,pitch-(t.clientY-ly)*0.006));mouse.x+=t.clientX-lx;mouse.y+=t.clientY-ly;lx=t.clientX;ly=t.clientY;}}},{passive:true});
    var endL=function(e){for(var i=0;i<e.changedTouches.length;i++)if(e.changedTouches[i].identifier===lid)lid=null;};
    canvas.addEventListener('touchend',endL);canvas.addEventListener('touchcancel',endL);
  }
}
function pick(nx,ny,button){
  ray.setFromCamera({x:nx,y:ny},camera);
  var objs=[];for(var id in ents){if(ents[id].k!=='light')objs.push(ents[id].obj);}
  var hits=ray.intersectObjects(objs,false),h=hits[0];
  var gh=ray.intersectObjects(scene.children.filter(function(o){return o.userData&&o.userData.ground}),false)[0];
  if(gh&&(!h||gh.distance<h.distance)){P({t:'click',id:0,pt:[gh.point.x,gh.point.y,gh.point.z],n:[0,1,0],button:button||0});return}
  if(!h)return;
  var id=0;for(var k in ents){if(ents[k].obj===h.object){id=ents[k].id;break}}
  var n=h.face?h.face.normal.clone().transformDirection(h.object.matrixWorld):new THREE.Vector3(0,1,0);
  P({t:'click',id:id,pt:[h.point.x,h.point.y,h.point.z],n:[n.x,n.y,n.z],button:button||0});
}
// ---- loop ----
var last=performance.now(),acc=0,sendAt=0;
function loop(){
  requestAnimationFrame(loop);
  var now=performance.now(),dt=Math.min(0.05,(now-last)/1000);last=now;
  if(camP.mode==='fps')stepFps(dt);else if(orbit)orbit.update();
  if(camP.mode!=='fps'){pos.copy(camera.position);}
  renderer.render(scene,camera);
  if(now-sendAt>45){sendAt=now;var ks=[];for(var k in keys)if(keys[k])ks.push(k);var dir=new THREE.Vector3();camera.getWorldDirection(dir);
    var y=camP.mode==='fps'?yaw:Math.atan2(-dir.x,-dir.z),pt=camP.mode==='fps'?pitch:Math.asin(dir.y);
    P({t:'state',keys:ks,mouse:[mouse.x,mouse.y],joy:[joy.x,joy.y],cam:[camera.position.x,camera.position.y,camera.position.z,y,pt]});mouse.x=mouse.y=0;}
}
window.addEventListener('message',function(e){var d=e.data;if(!d)return;if(d.from==='host'&&d.t==='init')init(d.cfg);else if(d.from==='py')handle(d);});
P({t:'loaded'});
})();
</script></body></html>`;

function ensureDialog() {
  if (dialog) return;
  dialog = document.createElement('dialog');
  dialog.className = 'cp-py3d';
  dialog.dir = 'rtl';
  dialog.innerHTML = '<header><div><small>PYTHON / 3D</small><h2></h2></div><span class="cp-py3d-status" role="status"></span><button type="button" data-close>بستن</button></header><section></section>';
  document.body.append(dialog);
  dialog.querySelector('[data-close]').onclick = () => closeViewer(true);
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); closeViewer(true); });
  const style = document.createElement('style');
  style.textContent = `.cp-py3d{position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:#000;color:#d9ffe9;overflow:hidden}
.cp-py3d::backdrop{background:#000}.cp-py3d[open]{display:flex;flex-direction:column}
.cp-py3d header{display:flex;align-items:center;gap:12px;padding:8px 12px;background:#06120d;border-bottom:1px solid #12382a;z-index:2}
.cp-py3d header small{color:#53ffa8;letter-spacing:2px;font:600 10px ui-monospace,monospace}.cp-py3d header h2{margin:0;font-size:15px;color:#e8fff3}
.cp-py3d header div{flex:1}.cp-py3d .cp-py3d-status{font-size:12px;color:#ffd27a}
.cp-py3d header button{background:#12382a;color:#e8fff3;border:1px solid #1f6b4c;border-radius:8px;padding:7px 14px;font:inherit}
.cp-py3d section{flex:1;min-height:0;position:relative}.cp-py3d iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#000}`;
  document.head.append(style);
}
function openViewer(cfg) {
  closeViewer(false);
  ensureDialog();
  current = cfg;
  dialog.querySelector('h2').textContent = cfg.title || 'Python 3D';
  dialog.querySelector('.cp-py3d-status').textContent = '';
  const f = document.createElement('iframe');
  f.setAttribute('sandbox', 'allow-scripts allow-pointer-lock');
  f.setAttribute('allow', 'autoplay; fullscreen; accelerometer; gyroscope');
  f.srcdoc = VIEWER;
  dialog.querySelector('section').replaceChildren(f);
  frame = f;
  lastBeat = performance.now();
  if (!dialog.open) dialog.showModal();
  clearInterval(watchdog);
  watchdog = setInterval(() => {
    const idle = performance.now() - lastBeat;
    const status = dialog?.querySelector('.cp-py3d-status');
    if (idle > 6000 && status) status.textContent = 'برنامه Python متوقف شده است';
    else if (status) status.textContent = '';
  }, 1000);
}
function closeViewer(notifyPython) {
  clearInterval(watchdog);
  if (notifyPython) send({ t: 'closed' });
  if (dialog?.open) dialog.close();
  frame?.remove();
  frame = null;
  current = null;
}
window.addEventListener('message', (event) => {
  const d = event.data;
  if (!frame || event.source !== frame.contentWindow || !d || d.from !== 'viewer') return;
  if (d.t === 'loaded') { frame.contentWindow.postMessage({ from: 'host', t: 'init', cfg: current }, '*'); return; }
  if (d.t === 'error') { dialog.querySelector('.cp-py3d-status').textContent = d.msg; return; }
  const { from, ...msg } = d;
  send(msg);                         // ready / state / click / key  ->  Python
});
function start() {
  if (channel || typeof BroadcastChannel === 'undefined') return;
  channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (event) => {
    let d;
    try { d = JSON.parse(event.data); } catch { return; }
    if (!d || d.from !== 'py') return;
    if (d.t === 'open') { openViewer(d); return; }
    if (d.t === 'close') { closeViewer(false); return; }
    if (!frame) return;
    lastBeat = performance.now();
    frame.contentWindow?.postMessage(d, '*');       // frame / cam  ->  viewer
  };
}
start();
window.CodePadPython3D = { open: openViewer, close: () => closeViewer(true), isOpen: () => !!frame };
