import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setupClient} from '../test-support/client.js';
import {buildDailyReport,eventDay} from '../daily-report.js';
const dir=mkdtempSync(join(tmpdir(),'fluxo-daily-'));process.env.DB_PATH=join(dir,'test.sqlite');
const {server}=await import('../server.js');const {storage}=await import('../storage.js');
const day='2026-11-02';
test('controle diário: fuso, conteúdo, PDF paginado e isolamento',async t=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const call=await setupClient(base);const user=(await call('/health')).body.user;const db=(await storage()).forUser(user.id);
  const process={id:'daily-process',number:'501',year:2026,title:'Aquisição de equipamentos',reason:'Manifestação técnica',origin:'Administração',receivedAt:day,dueAt:day,status:'Concluído',priority:'Alta',nextAction:'Confirmar recebimento',createdAt:day+'T10:00:00Z',updatedAt:day+'T16:00:00Z',version:'1',history:[
   {id:'entry',type:'Entrada',at:day+'T10:00:00Z',text:'Entrada'},
   {id:'late',type:'Andamento',at:'2026-11-03T02:59:59Z',text:'Registro no fim do dia de São Paulo'},
   {id:'next',type:'Andamento',at:'2026-11-03T03:00:00Z',text:'Registro do dia seguinte'},
   {id:'prior',type:'Andamento',at:'2026-11-02T02:59:59Z',text:'Registro do dia anterior'},
   {id:'complete',type:'Atualização',at:day+'T16:00:00Z',text:'Processo concluído',changes:[{field:'status',before:'Em andamento',after:'Concluído'}]}
  ]};
  await db.save(process);await db.save({...process,id:'overdue',number:'502',status:'Em andamento',receivedAt:'2026-10-31',dueAt:'2026-11-01',history:[]});
  const note={id:'daily-note',title:'Visita de João — fiscalização',entryDate:day,content:'INÍCIO DAS ANOTAÇÕES\n'+('Observação técnica: ação e avaliação.\n'.repeat(200))+'FIM DAS ANOTAÇÕES',createdAt:day+'T11:00:00Z',updatedAt:day+'T11:00:00Z',version:'n1'};
  await db.notes.save(note);await db.notes.save({...note,id:'another-day',title:'Assunto de outro dia',entryDate:'2026-11-01',content:'Não deve aparecer no dia escolhido'});
  await t.test('datas e limites de São Paulo são respeitados',async()=>{assert.equal(eventDay('2026-11-03T02:59:59Z'),day);assert.equal(eventDay('2026-11-03T03:00:00Z'),'2026-11-03');assert.equal(eventDay('inválida'),'');for(const suffix of ['', '?date=2026-02-30','?date=abc'])assert.equal((await call('/daily'+suffix)).status,400);assert.equal((await call('/daily?date='+day,'POST',{})).status,405);});
  await t.test('resumo distingue entradas, movimentações, conclusões e situação atual',async()=>{const r=await call('/daily?date='+day);assert.equal(r.status,200);assert.deepEqual(r.body.summary,{entries:1,movements:2,completions:1,due:1,overdue:1,notes:1});assert.deepEqual(r.body.movements.map(h=>h.id),['complete','late']);assert.equal(r.body.notes[0].id,note.id);});
  await t.test('PDF exige sessão e é um arquivo real com cabeçalhos privados',async()=>{assert.equal((await fetch(base+'/api/daily.pdf?date='+day)).status,401);const login=await call('/invitations','POST',{email:'pdf-test@example.test'});const register=await fetch(base+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Outra pessoa',email:'pdf-test@example.test',password:'long-test-password',token:login.body.token})});assert.equal(register.status,201);const cookie=register.headers.get('set-cookie').split(';')[0];const otherReport=await fetch(base+'/api/daily?date='+day,{headers:{Cookie:cookie}});const report=await otherReport.json();assert.equal(report.entries.length,0);assert.equal(report.notes.length,0);assert.equal(report.movements.length,0);assert.equal(report.user.email,'pdf-test@example.test');const otherPdf=await fetch(base+'/api/daily.pdf?date='+day,{headers:{Cookie:cookie}});assert.equal(otherPdf.status,200);assert.match(otherPdf.headers.get('content-type'),/application\/pdf/);assert.match(otherPdf.headers.get('cache-control'),/no-store/);assert.match(otherPdf.headers.get('content-disposition'),/atlasnex-fluxo-diario-2026-11-02.pdf/);assert.equal(Buffer.from(await otherPdf.arrayBuffer()).subarray(0,5).toString(),'%PDF-');});
  await t.test('PDF preserva texto longo em múltiplas páginas',async()=>{const {dailyPdf}=await import('../daily-report.js');const report=buildDailyReport(await db.all(),await db.notes.all(),day,user);const pdf=await dailyPdf(report);assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.match(pdf.subarray(-50).toString(),/%%EOF/);assert.ok((pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length>=3);writeFileSync('/tmp/atlasnex-daily-validation.pdf',pdf);});
 }finally{await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}
});
