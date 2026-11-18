import {VERSION} from './version.js';
export const updateNative=()=>window.Capacitor?.getPlatform?.()==='android'&&window.Capacitor?.nativePromise&&window.Capacitor?.isPluginAvailable?.('CodePadUpdates');
export const updateCall=(method,args={})=>window.Capacitor.nativePromise('CodePadUpdates',method,args);
// This module does not replace the editor's DOM or touch projects/IndexedDB.
if(updateNative()){
 let tries=0;const confirm=()=>{if(document.querySelector('[data-studio-launch]'))updateCall('status').then(s=>{if(s.version===VERSION)return updateCall('ready',{build:s.build});}).catch(()=>{});else if(++tries<120)setTimeout(confirm,200);};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',confirm,{once:true});else confirm();
}
