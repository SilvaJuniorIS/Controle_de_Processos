import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dir=mkdtempSync(join(tmpdir(),'fluxo-test-'));
process.env.DB_PATH=join(dir,'test.sqlite');
const {server}=await import('../server.js');
let base;
before(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true});});
const request=async(path,method='GET',data)=>{const r=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,body:await r.json()};};
const input=()=>({number:'123',year:2026,title:'Teste de contrato',reason:'Emitir parecer',receivedAt:'2026-10-28',dueAt:'2026-10-30',status:'A analisar',priority:'Alta',nextAction:'Conferir documentação',origin:'Administração',owner:'Minha mesa',category:'Contratos',notes:'Contexto de teste'});

test('fluxo completo: persistência, validação, histórico e exclusão',async t=>{
 let id;
 await t.test('base inicia vazia e servidor responde',async()=>{assert.equal((await request('/health')).body.status,'ok');assert.deepEqual((await request('/processes')).body,[]);});
 await t.test('campos obrigatórios e datas reais são validados',async()=>{assert.equal((await request('/processes','POST',{})).status,400);assert.equal((await request('/processes','POST',{...input(),receivedAt:'2026-02-30'})).status,400);assert.equal((await request('/processes','POST',{...input(),priority:'Inválida'})).status,400);assert.equal((await request('/processes','POST',{...input(),number:42})).status,400);});
 await t.test('cadastro mantém contexto e registra entrada',async()=>{const r=await request('/processes','POST',input());assert.equal(r.status,201);id=r.body.id;assert.equal(r.body.title,input().title);assert.equal(r.body.history.length,1);assert.equal(r.body.history[0].type,'Entrada');assert.equal(r.body.demo,false);});
 await t.test('impede número e ano duplicados',async()=>{assert.equal((await request('/processes','POST',input())).status,400);});
 await t.test('adição de andamento preserva registros anteriores',async()=>{const r=await request(`/processes/${id}/history`,'POST',{text:'Documentação conferida. Aguardando assinatura.'});assert.equal(r.status,201);assert.equal(r.body.history.length,2);assert.equal(r.body.history[1].type,'Andamento');assert.equal((await request(`/processes/${id}/history`,'POST',{text:' '})).status,400);});
 await t.test('edição registra diferenças e conclusão preserva histórico',async()=>{const r=await request(`/processes/${id}`,'PUT',{...input(),status:'Concluído',notes:'Finalizado'});assert.equal(r.status,200);assert.equal(r.body.history.length,3);assert.equal(r.body.status,'Concluído');assert.ok(r.body.history[2].changes.some(c=>c.field==='status'&&c.before==='A analisar'&&c.after==='Concluído'));});
 await t.test('dados foram gravados no SQLite, fora da memória do servidor',async()=>{const disk=new DatabaseSync(process.env.DB_PATH,{readOnly:true});const p=JSON.parse(disk.prepare('SELECT body FROM processes WHERE id=?').get(id).body);assert.equal(p.status,'Concluído');assert.equal(p.history.length,3);disk.close();});
 await t.test('não substitui dados reais por demonstração',async()=>{assert.equal((await request('/demo','POST',{})).status,400);assert.equal((await request('/processes')).body.length,1);});
 await t.test('rejeita escrita por outra origem e limita recursos desconhecidos',async()=>{const r=await fetch(base+'/api/processes',{method:'POST',headers:{Origin:'https://outro-site.invalid','Content-Type':'application/json'},body:JSON.stringify(input())});assert.equal(r.status,403);assert.equal((await request('/processes/inexistente')).status,404);});
 await t.test('exclusão é persistida',async()=>{assert.equal((await request(`/processes/${id}`,'DELETE')).status,200);assert.equal((await request(`/processes/${id}`)).status,404);assert.deepEqual((await request('/processes')).body,[]);});
 await t.test('exemplos são identificados e removidos sem apagar processos reais',async()=>{const demo=await request('/demo','POST',{});assert.equal(demo.status,201);assert.equal(demo.body.length,6);assert.ok(demo.body.every(p=>p.demo));await request('/processes','POST',input());await request('/demo','DELETE');const list=(await request('/processes')).body;assert.equal(list.length,1);assert.equal(list[0].demo,false);await request(`/processes/${list[0].id}`,'DELETE');});
 await t.test('aplicação e arquivos estáticos são servidos com proteção de conteúdo',async()=>{const r=await fetch(base);assert.equal(r.status,200);assert.match(await r.text(),/AtlasNex Fluxo/);assert.match(r.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);assert.equal((await fetch(base+'/app.js')).status,200);});
});
