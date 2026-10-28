import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dir=mkdtempSync(join(tmpdir(),'fluxo-notes-'));
process.env.DB_PATH=join(dir,'notes.sqlite');
const {server}=await import('../server.js');
test('diário independente: entradas, validação, datas, persistência e conflitos',async t=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const call=async(path,method='GET',body)=>{const r=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 let first,second;
 const entry={title:'Reunião com a equipe',content:'Assunto um.\nSegunda linha com observações.',entryDate:'2026-10-28'};
 try {
  await t.test('permite anotar sem processos cadastrados',async()=>{assert.deepEqual((await call('/processes')).body,[]);const r=await call('/notes','POST',entry);assert.equal(r.status,201);first=r.body;assert.equal(first.content,entry.content);assert.equal(first.processId,undefined);});
  await t.test('mantém assuntos separados e ordenados por data',async()=>{const r=await call('/notes','POST',{...entry,title:'Visita de campo',entryDate:'2026-10-29',content:'Outro assunto.'});second=r.body;const list=(await call('/notes')).body;assert.deepEqual(list.map(n=>n.title),['Visita de campo','Reunião com a equipe']);});
  await t.test('recusa entradas vazias, datas inválidas e limites excedidos',async()=>{for(const item of [{...entry,title:' '},{...entry,content:''},{...entry,entryDate:'2026-02-30'},{...entry,content:'x'.repeat(20001)},{...entry,title:'x'.repeat(201)}])assert.equal((await call('/notes','POST',item)).status,400);});
  await t.test('edição mantém identidade e data de criação',async()=>{const r=await call('/notes/'+first.id,'PUT',{...first,content:'Texto revisado.'});assert.equal(r.status,200);assert.equal(r.body.createdAt,first.createdAt);assert.notEqual(r.body.version,first.version);const old=first;first=r.body;assert.equal((await call('/notes/'+first.id,'PUT',{...old,content:'Texto antigo'})).status,409);assert.equal((await call('/notes/'+first.id,'DELETE',{version:old.version})).status,409);assert.equal((await call('/notes/'+first.id)).body.content,'Texto revisado.');});
  await t.test('anotações são persistidas no banco',async()=>{const db=new DatabaseSync(process.env.DB_PATH,{readOnly:true});const note=JSON.parse(db.prepare('SELECT body FROM field_notes WHERE id=?').get(first.id).body);assert.equal(note.content,'Texto revisado.');db.close();});
  await t.test('remoção de exemplos e processos preserva o diário',async()=>{await call('/demo','POST',{});const processes=(await call('/processes')).body;assert.equal(processes.length,6);await call('/processes/'+processes[0].id,'DELETE');await call('/demo','DELETE');assert.equal((await call('/notes')).body.length,2);assert.deepEqual((await call('/processes')).body,[]);});
  await t.test('exclusão atinge somente a entrada selecionada',async()=>{assert.equal((await call('/notes/'+first.id,'DELETE',{version:first.version})).status,200);assert.equal((await call('/notes/'+first.id)).status,404);assert.deepEqual((await call('/notes')).body.map(n=>n.id),[second.id]);});
 }finally{await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}
});
