import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir=mkdtempSync(join(tmpdir(),'fluxo-auth-'));
process.env.DB_PATH=join(dir,'test.sqlite');
process.env.APP_PASSWORD=randomBytes(24).toString('base64url');
const {server}=await import('../server.js');
let base;
before(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});});
test('espaço privado: login, cookies, bloqueio de dados e logout',async t=>{
 let cookie;
 await t.test('consultas e alterações exigem sessão',async()=>{
  for(const [path,method]of [['processes','GET'],['processes','POST'],['demo','DELETE'],['health','GET']]){const r=await fetch(`${base}/api/${path}`,{method});assert.equal(r.status,401);assert.equal((await r.json()).loginRequired,true);}
 });
 await t.test('senha incorreta e login de outra origem são recusados',async()=>{
  const r=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:'errada'})});assert.equal(r.status,401);assert.equal(r.headers.get('set-cookie'),null);
  assert.equal((await fetch(base+'/api/login',{method:'POST',headers:{Origin:'https://outro.invalid'},body:JSON.stringify({password:process.env.APP_PASSWORD})})).status,403);
 });
 await t.test('sessão assinada permite acesso e utiliza HttpOnly',async()=>{
  const r=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:process.env.APP_PASSWORD})});assert.equal(r.status,200);cookie=r.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/Max-Age=28800/);cookie=cookie.split(';')[0];
  const health=await fetch(base+'/api/health',{headers:{Cookie:cookie}});assert.equal(health.status,200);assert.equal((await health.json()).private,true);
 });
 await t.test('cookie adulterado não autentica',async()=>{const r=await fetch(base+'/api/processes',{headers:{Cookie:cookie+'adulterado'}});assert.equal(r.status,401);});
 await t.test('logout remove cookie do navegador',async()=>{const r=await fetch(base+'/api/logout',{method:'POST',headers:{Cookie:cookie}});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);assert.equal((await fetch(base+'/api/processes')).status,401);});
 await t.test('configuração sem senha segura falha sem expor a base',async()=>{const original=process.env.APP_PASSWORD;process.env.APP_PASSWORD='curta';const r=await fetch(base+'/api/processes');assert.equal(r.status,503);process.env.APP_PASSWORD=original;});
});
