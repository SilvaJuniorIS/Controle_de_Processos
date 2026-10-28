import {setupClient} from '../test-support/client.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const dir=mkdtempSync(join(tmpdir(),'fluxo-vercel-'));
process.env.DB_PATH=join(dir,'test.sqlite');
const {default:handler}=await import('../api/index.js');
test('entrada Vercel aceita corpo já interpretado pela plataforma',async()=>{
 const server=http.createServer(async(req,res)=>{if(req.method==='POST'){let raw='';for await(const chunk of req)raw+=chunk;req.body=JSON.parse(raw);}await handler(req,res);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try {
  const setup=await fetch(base+'/api/setup',{method:'POST',body:JSON.stringify({name:'Teste',email:'vercel@example.test',password:'password-for-vercel-test',setupPassword:process.env.APP_PASSWORD})});assert.equal(setup.status,201);const cookie=setup.headers.get('set-cookie').split(';')[0];
  const r=await fetch(base+'/api/processes',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({number:'VERCEL-1',year:2026,title:'Entrada pela função',reason:'Validar corpo JSON',receivedAt:'2026-10-28',status:'A analisar',priority:'Normal'})});
  assert.equal(r.status,201);const p=await r.json();assert.equal(p.number,'VERCEL-1');
  assert.equal((await (await fetch(base+'/api/processes',{headers:{Cookie:cookie}})).json()).length,1);
 }finally{await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}
});
test('Vercel nunca utiliza SQLite como fallback sem DATABASE_URL',()=>{
 const r=spawnSync(process.execPath,['--input-type=module','-e',"import {storage} from './storage.js';try{await storage();process.exit(1)}catch{process.exit(0)}"],{cwd:new URL('..',import.meta.url),env:{...process.env,VERCEL:'1',DATABASE_URL:''},encoding:'utf8'});
 assert.equal(r.status,0);
});
