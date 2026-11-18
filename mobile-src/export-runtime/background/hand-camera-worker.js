self.exports = {};
importScripts('./hand-validation.js');
let FilesetResolver,HandLandmarker,PoseLandmarker;
const baseURL = new URL('../', self.location.href);

// MediaPipe Tasks 0.10.32 + full float16 HandLandmarker, bundled offline.
// Do not raise the caller's tracking thresholds: high IoU thresholds repeatedly
// restart palm detection during fast motion and make the hand flicker.
let hands, surface, context, maxEdge=640, delegate='CPU', options={numHands:1,minHandDetectionConfidence:0.55,minHandPresenceConfidence:0.5,minTrackingConfidence:0.5};
let fileset,trackHands=true,trackPose=false,pose,poseDelegate='CPU',pixelsSurface,pixelsContext;
let poseOptions={numPoses:1,minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minTrackingConfidence:.5};
async function createPose(backend){
 const response=await fetch(new URL('./vision-pose-model.json',self.location.href));if(!response.ok)throw Error('مدل بدن همراه برنامه پیدا نشد.');
 const model=await response.json(),bytes=Uint8Array.from(atob(model.base64),c=>c.charCodeAt(0));
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 if(digest!==model.sha256||digest!=='59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a')throw Error('مدل بدن خراب است.');
 return PoseLandmarker.createFromOptions(fileset,{baseOptions:{modelAssetBuffer:bytes,delegate:backend},runningMode:'VIDEO',outputSegmentationMasks:false,...poseOptions});
}
function cameraRGBA(bitmap,width,height,rgba){
 if(rgba)return rgba;
 if(!pixelsSurface||pixelsSurface.width!==width||pixelsSurface.height!==height){pixelsSurface=new OffscreenCanvas(width,height);pixelsContext=pixelsSurface.getContext('2d',{willReadFrequently:true});}
 pixelsContext.drawImage(bitmap,0,0,width,height);return pixelsContext.getImageData(0,0,width,height).data;
}
const validator=new CodePadHandValidation();
let queue=Promise.resolve();
async function createHands(backend) {
 return HandLandmarker.createFromOptions(fileset, {
  baseOptions:{modelAssetPath:new URL('vision/hand_landmarker.task',baseURL).href,delegate:backend},
  runningMode:'VIDEO',...options,
 });
}
function gpuAvailable() {
 let gl;
 try {
  gl=new OffscreenCanvas(1,1).getContext('webgl2');
  if(!gl)return false;
  const ext=gl.getExtension('WEBGL_debug_renderer_info');
  return !/swiftshader|software|llvmpipe/i.test(ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'');
 } catch{return false;}finally{gl?.getExtension('WEBGL_lose_context')?.loseContext();}
}
async function handle(data) {
  try {
    if (data.init) {
      maxEdge=data.processing==='full'?1280:640;
      trackHands=data.trackHands!==false;
      trackPose=data.trackPose===true;
      if(!trackHands&&!trackPose){self.postMessage({ready:true,delegate:'none'});return;}
      importScripts('../vision/mediapipe/vision_bundle.js');
      ({FilesetResolver,HandLandmarker,PoseLandmarker}=self.exports);
      fileset = await FilesetResolver.forVisionTasks(new URL('vision/mediapipe/wasm', baseURL).href);
      if(trackHands&&gpuAvailable()) {
        try{hands=await createHands('GPU');delegate='GPU';}
        catch{hands=await createHands('CPU');}
      } else if(trackHands)hands=await createHands('CPU');
      if(trackPose){if(gpuAvailable()){try{pose=await createPose('GPU');poseDelegate='GPU';}catch{pose=await createPose('CPU');}}else pose=await createPose('CPU');}
      self.postMessage({ ready: true, delegate:trackHands?delegate:'none',poseDelegate:trackPose?poseDelegate:'none' }); return;
    }
    if (data.options) {
      options={...options,...data.options};
      if(hands)await hands.setOptions(options); validator.reset(); return;
    }
    if(data.poseOptions){poseOptions={...poseOptions,...data.poseOptions};if(pose)await pose.setOptions(poseOptions);return;}
    if (data.frame) {
      const { bitmap, rgba, width, height, timestamp } = data.frame;
      if(!trackHands&&!trackPose){let pixels;try{pixels=cameraRGBA(bitmap,width,height,rgba);}finally{bitmap.close();}self.postMessage({frame:{rgba:pixels,width,height,landmarks:[],handedness:[],worldLandmarks:[],poseLandmarks:[],poseWorldLandmarks:[],pendingHands:0,timestamp,inferenceMs:0,delegate:'none'}},[pixels.buffer]);return;}
      const scale=Math.min(1,maxEdge/Math.max(width,height));
      const detectWidth=Math.max(1,Math.round(width*scale)),detectHeight=Math.max(1,Math.round(height*scale));
      let detectorInput=bitmap;
      if(detectWidth!==width||detectHeight!==height){
        if (!surface || surface.width !== detectWidth || surface.height !== detectHeight) {
          surface = new OffscreenCanvas(detectWidth, detectHeight); context = surface.getContext('2d');
        }
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.drawImage(bitmap, 0, 0, detectWidth, detectHeight);detectorInput=surface;
      }
      const started=performance.now();let result={landmarks:[]},poseResult={landmarks:[],worldLandmarks:[]},pixels;
      try{
       if(trackHands){try{result=hands.detectForVideo(detectorInput,timestamp);}
      catch(error){
        if(delegate!=='GPU')throw error;
        try{hands.close();}catch{}
        hands=await createHands('CPU');delegate='CPU';validator.reset();
        result=hands.detectForVideo(detectorInput,timestamp);
       }}
       if(trackPose){try{poseResult=pose.detectForVideo(detectorInput,timestamp);}catch(error){if(poseDelegate!=='GPU')throw error;try{pose.close();}catch{}pose=await createPose('CPU');poseDelegate='CPU';poseResult=pose.detectForVideo(detectorInput,timestamp);}}
       pixels=cameraRGBA(bitmap,width,height,rgba);
      }finally{bitmap.close();}
      const inferenceMs=performance.now()-started;
      const validated=validator.filter(result.landmarks,width,height,timestamp);
      const body=poseResult.landmarks?.[0]||[],world=poseResult.worldLandmarks?.[0]||[];
      const validPose=body.length===33&&body.every(p=>[p.x,p.y,p.z,p.visibility??1].every(Number.isFinite));
      self.postMessage({ frame: { rgba:pixels, width, height, landmarks: validated.landmarks, handedness: validated.indices.map(i=>(result.handedness||result.handednesses||[])[i]||[]), worldLandmarks: validated.indices.map(i=>(result.worldLandmarks||[])[i]||[]),poseLandmarks:validPose?body:[],poseWorldLandmarks:validPose?world:[],poseDelegate:trackPose?poseDelegate:'none', pendingHands: validated.pending, timestamp, inferenceMs, delegate:trackHands?delegate:'none' } }, [pixels.buffer]);
    }
  } catch (error) { self.postMessage({ error: error.message || String(error) }); }
}
self.onmessage = ({data}) => (queue=queue.then(()=>handle(data)));
