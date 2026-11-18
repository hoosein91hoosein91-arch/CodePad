// Presentation only: Python positions, colors, matrices and particle count are preserved.
const presets = {
  light: { density: 1, pixels: 1300000, glow: false },
  balanced: { density: 1.5, pixels: 2200000, glow: true },
  high: { density: 2, pixels: 3200000, glow: true },
};
const vertexSource = `
attribute vec3 position;
attribute vec4 color;
uniform mat4 projection, model;
uniform float pointSize, pixelScale, pixelRatio, maxPoint;
uniform mediump float enhanced, halo;
varying mediump vec4 vColor;
void main() {
  vec4 view = model * vec4(position, 1.0);
  gl_Position = projection * view;
  float depthScale = clamp(pow(12.0 / max(1.0, -view.z), 0.32), 0.7, 1.7);
  float base = pointSize * pixelScale;
  float styled = max(base * 1.16 * depthScale, 1.65 * pixelRatio);
  gl_PointSize = min(maxPoint, mix(base, styled, enhanced) * mix(1.0, 4.2, halo));
  vColor = color;
}`;
const fragmentSource = `
precision mediump float;
varying mediump vec4 vColor;
uniform float enhanced, halo;
void main() {
  if (enhanced < 0.5) { gl_FragColor = vColor; return; }
  vec2 xy = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(xy, xy);
  if (r2 >= 1.0) discard;
  if (halo > 0.5) {
    float alpha = exp(-5.0*r2) * (1.0-smoothstep(0.65,1.0,r2)) * 0.14;
    gl_FragColor = vec4(vColor.rgb, alpha * vColor.a);
  } else {
    float edge = 1.0-smoothstep(0.48,1.0,r2);
    float core = exp(-6.5*r2);
    vec3 light = mix(vColor.rgb * 0.86, vec3(1.0), core*0.38);
    gl_FragColor = vec4(light, edge * vColor.a);
  }
}`;
const backgroundVertex = `attribute vec2 position; varying mediump vec2 uv; void main(){uv=position*0.5+0.5;gl_Position=vec4(position,0.0,1.0);}`;
const backgroundFragment = `
precision mediump float;
varying mediump vec2 uv;
uniform vec2 resolution;
uniform vec4 clearColor;
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
void main() {
  vec2 p=uv-0.5;
  float vignette=1.0-smoothstep(0.12,0.76,length(p));
  vec3 sky=vec3(0.009,0.017,0.033)*vignette;
  vec2 cell=uv*resolution/46.0;
  vec2 id=floor(cell), local=fract(cell);
  vec2 center=vec2(hash(id+3.0),hash(id+17.0))*0.7+0.15;
  float star=(1.0-smoothstep(0.0,0.045,length(local-center)))*step(0.83,hash(id));
  float edge=smoothstep(0.0,0.25,length(p));
  sky+=vec3(0.18,0.24,0.34)*star*edge;
  gl_FragColor=vec4(clearColor.rgb+sky,clearColor.a);
}`;

export class PointRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas; this.sourceWidth = 1000; this.sourceHeight = 700;
    this.quality = presets[options.quality] ? options.quality : 'balanced';
    this.effects = options.effects !== false; this.disposed = false;
    const gl = this.gl = canvas.getContext('webgl', {alpha:false, antialias:true, preserveDrawingBuffer:false});
    if (!gl) throw Error('WebGL در این دستگاه فعال نیست.');
    const program = (vertex, fragment) => {
      const shaders = [];
      const result = gl.createProgram();
      try {
        for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
          const shader=gl.createShader(type); shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);
          if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
          gl.attachShader(result,shader);
        }
        gl.linkProgram(result);
        if (!gl.getProgramParameter(result,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(result));
        return result;
      } catch(error) {gl.deleteProgram(result);throw error;}
      finally {for(const shader of shaders) gl.deleteShader(shader);}
    };
    this.program=program(vertexSource,fragmentSource);
    this.skyProgram=program(backgroundVertex,backgroundFragment);
    this.buffer=gl.createBuffer();this.capacity=0;
    this.skyBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.skyBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    this.attributes={position:gl.getAttribLocation(this.program,'position'),color:gl.getAttribLocation(this.program,'color')};
    this.uniforms=Object.fromEntries(['projection','model','pointSize','pixelScale','pixelRatio','maxPoint','enhanced','halo'].map(key=>[key,gl.getUniformLocation(this.program,key)]));
    this.skyPosition=gl.getAttribLocation(this.skyProgram,'position');
    this.skyResolution=gl.getUniformLocation(this.skyProgram,'resolution');this.skyClear=gl.getUniformLocation(this.skyProgram,'clearColor');
    this.maxPoint=gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1];
    this.maxSize=Math.min(4096,gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
    this.lost=event=>{event.preventDefault();options.onContextLost?.();};
    canvas.addEventListener('webglcontextlost',this.lost);
    this.resizeObserver=new ResizeObserver(()=>this.redraw());this.resizeObserver.observe(canvas);
    this.setSourceSize(1000,700);
  }
  setSourceSize(width,height) {
    this.sourceWidth=Math.max(1,Math.min(8192,Math.round(width)));
    this.sourceHeight=Math.max(1,Math.min(8192,Math.round(height)));
    this.canvas.style.aspectRatio=`${this.sourceWidth} / ${this.sourceHeight}`;
    this.redraw();
  }
  setOptions({quality=this.quality,effects=this.effects}) {
    this.quality=presets[quality]?quality:'balanced';this.effects=!!effects;this.redraw();
  }
  resize() {
    const config=presets[this.quality], bounds=this.canvas.getBoundingClientRect();
    const aspect=this.sourceWidth/this.sourceHeight;
    const width=Math.max(1,Math.min(bounds.width||this.sourceWidth,(bounds.height||this.sourceHeight)*aspect));
    let ratio=Math.min(window.devicePixelRatio||1,config.density);
    ratio=Math.min(ratio,Math.sqrt(config.pixels/(width*width/aspect)),this.maxSize/width,this.maxSize/(width/aspect));
    const w=Math.max(1,Math.round(width*ratio)),h=Math.max(1,Math.round(w/aspect));
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
    this.pixelRatio=ratio;
    this.canvas.dataset.renderQuality=this.quality;this.canvas.dataset.renderEffects=String(this.effects);
  }
  redraw() { if(this.lastFrame&&!this.disposed&&!this.gl.isContextLost())this.draw(this.lastFrame); }
  draw(frame) {
    if(this.disposed||this.gl.isContextLost())return;
    this.lastFrame=frame;this.resize();
    const gl=this.gl,count=frame.data.byteLength/28;
    gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.depthMask(true);
    gl.clearColor(...frame.clear);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const enhanced=this.effects;
    if(enhanced&&this.quality!=='light'&&Math.max(...frame.clear.slice(0,3))<0.025){
      gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.useProgram(this.skyProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.skyBuffer);gl.enableVertexAttribArray(this.skyPosition);
      gl.vertexAttribPointer(this.skyPosition,2,gl.FLOAT,false,0,0);
      // Attribute locations may be shared between programs; disable stale ones.
      for(const location of Object.values(this.attributes))if(location!==this.skyPosition)gl.disableVertexAttribArray(location);
      gl.uniform2f(this.skyResolution,this.canvas.width,this.canvas.height);gl.uniform4fv(this.skyClear,frame.clear);
      gl.drawArrays(gl.TRIANGLES,0,6);
    }
    gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    if(frame.data.byteLength>this.capacity){this.capacity=Math.max(256,2**Math.ceil(Math.log2(frame.data.byteLength)));gl.bufferData(gl.ARRAY_BUFFER,this.capacity,gl.DYNAMIC_DRAW);}
    gl.bufferSubData(gl.ARRAY_BUFFER,0,frame.data);
    gl.enableVertexAttribArray(this.attributes.position);gl.vertexAttribPointer(this.attributes.position,3,gl.FLOAT,false,28,0);
    gl.enableVertexAttribArray(this.attributes.color);gl.vertexAttribPointer(this.attributes.color,4,gl.FLOAT,false,28,12);
    const u=this.uniforms;
    gl.uniformMatrix4fv(u.projection,false,new Float32Array(frame.projection.buffer,frame.projection.byteOffset,16));
    gl.uniformMatrix4fv(u.model,false,new Float32Array(frame.model.buffer,frame.model.byteOffset,16));
    gl.uniform1f(u.pointSize,frame.pointSize);gl.uniform1f(u.pixelScale,this.canvas.width/this.sourceWidth);
    gl.uniform1f(u.pixelRatio,this.pixelRatio);gl.uniform1f(u.maxPoint,this.maxPoint);gl.uniform1f(u.enhanced,enhanced?1:0);
    frame.depth?gl.enable(gl.DEPTH_TEST):gl.disable(gl.DEPTH_TEST);
    if(enhanced&&presets[this.quality].glow&&frame.blend){
      gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.depthMask(false);gl.uniform1f(u.halo,1);
      gl.drawArrays(gl.POINTS,0,count);
    }
    gl.uniform1f(u.halo,0);gl.depthMask(!!frame.depth);
    frame.blend?gl.enable(gl.BLEND):gl.disable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.POINTS,0,count);gl.depthMask(true);
  }
  dispose() {
    if(this.disposed)return;this.disposed=true;this.lastFrame=null;this.resizeObserver.disconnect();
    this.canvas.removeEventListener('webglcontextlost',this.lost);
    for(const buffer of [this.buffer,this.skyBuffer])this.gl.deleteBuffer(buffer);
    for(const program of [this.program,this.skyProgram])this.gl.deleteProgram(program);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
