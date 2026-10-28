import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
export const setupPassword=randomBytes(24).toString('hex');
process.env.APP_PASSWORD=setupPassword;
export async function setupClient(base){
 const r=await fetch(base+'/api/setup',{method:'POST',body:JSON.stringify({name:'Pessoa de teste',email:'teste@example.test',password:randomBytes(24).toString('hex'),setupPassword})});
 assert.equal(r.status,201,await r.clone().text());
 const cookie=r.headers.get('set-cookie').split(';')[0];
 return async(path,method='GET',body)=>{const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
}
