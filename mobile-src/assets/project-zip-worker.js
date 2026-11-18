import {unpackProjectZIP} from './project-zip.js';
self.onmessage=({data})=>{try{const result=unpackProjectZIP(data.bytes);self.postMessage({result},result.files.map(f=>f.bytes));}catch(error){self.postMessage({error:error.message});}};
