// Run once; keep this file private. Never add the output to source control.
import {webcrypto} from 'node:crypto';import{writeFileSync,existsSync}from'node:fs';
const path=process.argv[2];if(!path)throw Error('Provide a private output path');if(existsSync(path))throw Error('Refusing to overwrite an existing release identity');
const pair=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:3072,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
writeFileSync(path,JSON.stringify(await webcrypto.subtle.exportKey('jwk',pair.privateKey),null,2)+'\n',{mode:0o600});console.log('Release identity created; retain the private file for every future update.');
