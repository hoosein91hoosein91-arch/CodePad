// Match actual import statements, ignoring comments and quoted Python strings.
function pythonCode(source=''){return source.replace(/'''[\s\S]*?'''|"""[\s\S]*?"""|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|#[^\n]*/g,' ');}
function graphicsImports(source='') {
 const clean=pythonCode(source),names=new Set();
 for(const match of clean.matchAll(/(?:^|[\n;])\s*(?:from\s+([\w.]+)\s+import\b|import\s+([^;\n]+))/g)){
  if(match[1])names.add(match[1].split('.')[0]);
  if(match[2])for(const item of match[2].split(','))names.add(item.trim().split(/[.\s]/)[0]);
 }
 return names;
}
export function needsCameraGraphics(source,modules=[]){return [source,...modules].some(code=>[...graphicsImports(code)].some(name=>['cv2','pygame','mediapipe','OpenGL','codepad_tracking'].includes(name)));}
export function needsHandTracking(source,modules=[]){return [source,...modules].some(code=>graphicsImports(code).has('codepad_tracking')||(graphicsImports(code).has('mediapipe')&&(!needsPoseTracking(code)||/\b(?:hands|Hands|holistic|Holistic)\b/.test(pythonCode(code)))));}
export function needsPoseTracking(source,modules=[]){return [source,...modules].some(code=>{
 const clean=pythonCode(code),names=graphicsImports(code);
 if(names.has('codepad_tracking')){const calls=[...clean.matchAll(/\bTracker\s*\(([^)]*)\)/g)];return !calls.length||calls.some(c=>!/\bbody\s*=\s*False\b/.test(c[1]));}
 return names.has('mediapipe')&&/\b(?:pose|Pose|holistic|Holistic)\b/.test(clean);
});}
export function needsTurtle(source,modules=[]){return [source,...modules].some(code=>graphicsImports(code).has('turtle'));}
export function needsVision(source,modules=[]){return needsTurtle(source,modules)||needsCameraGraphics(source,modules);}
