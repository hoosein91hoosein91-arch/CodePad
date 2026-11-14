/** Locally sign a CI APK with the retained identity. Private key never reaches CI. */
import {readFileSync,writeFileSync,mkdtempSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join,resolve}from'node:path';import{webcrypto,createHash}from'node:crypto';import{execFileSync}from'node:child_process';
const[input,output,keyPath,tools]=process.argv.slice(2);if(!input||!output||!keyPath||!tools)throw Error('Usage: node scripts/sign-release.mjs INPUT.apk OUTPUT.apk PRIVATE_KEY.json ANDROID_BUILD_TOOLS');
const work=mkdtempSync(join(tmpdir(),'codepad-sign-'));try{
 const jwk=JSON.parse(readFileSync(keyPath,'utf8')),key=await webcrypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},true,['sign']);writeFileSync(join(work,'key.pk8'),Buffer.from(await webcrypto.subtle.exportKey('pkcs8',key)),{mode:0o600});
 execFileSync('python3',['-c','import sys,json,importlib.util;spec=importlib.util.spec_from_file_location("builder",sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);open(sys.argv[3],"wb").write(m.Signer(json.load(open(sys.argv[2]))).certificate)',resolve('mobile-src/codepad_apk.py'),resolve(keyPath),join(work,'cert.der')]);
 execFileSync(join(tools,'zipalign'),['-f','-P','16','4',resolve(input),join(work,'aligned.apk')]);
 execFileSync('java',['-jar',join(tools,'lib/apksigner.jar'),'sign','--key',join(work,'key.pk8'),'--cert',join(work,'cert.der'),'--v4-signing-enabled','false','--out',resolve(output),join(work,'aligned.apk')]);
 execFileSync('java',['-jar',join(tools,'lib/apksigner.jar'),'verify',resolve(output)]);execFileSync(join(tools,'zipalign'),['-c','-P','16','4',resolve(output)]);
 console.log('Verified stable signed APK SHA-256: '+createHash('sha256').update(readFileSync(output)).digest('hex'));
 console.log('Stable signing certificate SHA-256: '+createHash('sha256').update(readFileSync(join(work,'cert.der'))).digest('hex'));
}finally{rmSync(work,{recursive:true,force:true})}
