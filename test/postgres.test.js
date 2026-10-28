import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { neonConfig } from '@neondatabase/serverless';
import { randomUUID } from 'node:crypto';

// Execute the real adapter queries against a local Postgres WASM engine.
// This validates SQL and the HTTP SDK contract, not access to a live Neon account.
process.env.DATABASE_URL='postgresql://test:test@unit-test.neon.tech/test';
const pg=new PGlite();
neonConfig.fetchFunction=async (_url,options)=>{
 const body=JSON.parse(options.body);
 const run=async (db,q)=>{
  const r=await db.query(q.query,q.params);
  return {fields:r.fields.map(f=>({name:f.name,dataTypeID:f.dataTypeID})),rows:r.rows.map(row=>r.fields.map(f=>row[f.name]==null?null:typeof row[f.name]==='object'?JSON.stringify(row[f.name]):String(row[f.name]))),rowCount:r.affectedRows};
 };
 try {
  const result=body.queries?{results:await pg.transaction(async tx=>{const results=[];for(const q of body.queries)results.push(await run(tx,q));return results;})}:await run(pg,body);
  return new Response(JSON.stringify(result),{status:200});
 }catch(e){return new Response(JSON.stringify({message:e.message,code:e.code}),{status:400});}
};

test('Postgres: migração, CRUD, unicidade, concorrência e transação de exemplos',async()=>{
 try {
  await pg.exec('CREATE TABLE processes(id TEXT PRIMARY KEY,body JSONB NOT NULL);CREATE TABLE field_notes(id TEXT PRIMARY KEY,body JSONB NOT NULL)');
  await pg.query('INSERT INTO processes VALUES ($1,$2::jsonb)',['migrated-process',JSON.stringify({number:'LEGACY',year:2026,title:'Legado preservado'})]);
  await pg.query('INSERT INTO field_notes VALUES ($1,$2::jsonb)',['migrated-note',JSON.stringify({title:'Legado do diário',version:'legacy'})]);
  await import('../scripts/migrate.js');
  const {postgresSchema}=await import('../schema.js');await pg.transaction(async tx=>{for(const text of postgresSchema)await tx.exec(text);});
  assert.equal((await pg.query("SELECT to_regclass('processes') AS table_name")).rows[0].table_name,null);
  assert.equal((await pg.query("SELECT to_regclass('field_notes') AS table_name")).rows[0].table_name,null);
  const {storage}=await import('../storage.js');const store=await storage();assert.equal(store.kind,'postgres');const user={id:randomUUID(),email:'postgres@example.test',name:'Postgres',password_hash:'test-hash'};await store.accounts.bootstrap(user,['test-recovery-digest']);const db=store.forUser(user.id);
  assert.equal((await db.all())[0].title,'Legado preservado');assert.equal((await db.notes.all())[0].title,'Legado do diário');await db.remove('migrated-process');await db.notes.remove('migrated-note','legacy');assert.deepEqual(await db.all(),[]);
  const p={id:randomUUID(),number:'001',year:2026,title:'Contrato',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),version:randomUUID(),demo:false};
  await db.save(p);assert.deepEqual(await db.get(p.id),p);
  const other={id:randomUUID(),name:'Outra pessoa',email:'other@example.test',password_hash:'test-hash'};await store.accounts.invite('invite-digest',other.email,user.id,Date.now()+100000);await store.accounts.register(other,'invite-digest',['other-recovery-digest']);const otherDb=store.forUser(other.id);
  assert.equal(await otherDb.get(p.id),null);const otherProcess={...p,id:randomUUID()};await otherDb.save(otherProcess);assert.equal((await otherDb.all()).length,1);assert.equal((await db.all()).length,1);await otherDb.remove(p.id);assert.ok(await db.get(p.id));
  assert.equal(await db.duplicate('001',2026,''),true);assert.equal(await db.duplicate('001',2026,p.id),false);
  await assert.rejects(()=>db.save({...p,id:randomUUID()}),e=>e.code==='23505');
  const updated={...p,title:'Contrato atualizado',version:randomUUID()};await db.save(updated,p);assert.equal((await db.get(p.id)).title,updated.title);
  await assert.rejects(()=>db.save({...p,title:'Edição desatualizada'},p),/mudou em outra janela/);
  const demo={...p,id:randomUUID(),number:'002',demo:true};await db.seed([demo]);assert.equal((await db.all()).length,2);
  await assert.rejects(()=>db.seed([{...demo,id:randomUUID(),number:'003'},{...demo,id:randomUUID()}]));assert.equal(await db.duplicate('003',2026,''),false);
  const note={id:randomUUID(),title:'Reunião',content:'Anotação independente.',entryDate:'2026-10-28',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),version:randomUUID()};
  await db.notes.save(note);assert.deepEqual(await db.notes.get(note.id),note);assert.equal(await otherDb.notes.get(note.id),null);await assert.rejects(()=>otherDb.notes.save({...note,content:'invasão'},note),/mudou em outra janela/);
  const edited={...note,content:'Texto revisado.',version:randomUUID()};await db.notes.save(edited,note);await assert.rejects(()=>db.notes.save(note,note),/mudou em outra janela/);await assert.rejects(()=>db.notes.remove(note.id,note.version),/mudou em outra janela/);
  await db.removeDemo();assert.deepEqual(await db.all(),[updated]);await db.remove(p.id);assert.deepEqual(await db.all(),[]);
  assert.deepEqual(await db.notes.all(),[edited]);await db.notes.remove(edited.id,edited.version);assert.deepEqual(await db.notes.all(),[]);
  await store.accounts.addSession('test-session',other.id,Date.now()+100000,other.password_hash);assert.equal((await store.accounts.session('test-session')).id,other.id);
  assert.equal(await store.accounts.reset(other.id,'other-recovery-digest','reset-hash'),true);assert.equal(await store.accounts.session('test-session'),null);assert.equal(await store.accounts.reset(other.id,'other-recovery-digest','replay-hash'),false);assert.equal((await store.accounts.byEmail(other.email)).password_hash,'reset-hash');
  await assert.rejects(()=>store.accounts.addSession('stale-session',other.id,Date.now()+100000,other.password_hash),/conta mudou/);
  assert.equal(await store.accounts.changePassword(other.id,'reset-hash','changed-hash'),true);assert.equal(await store.accounts.changePassword(other.id,'reset-hash','outdated'),false);
 }finally{await pg.close();}
});
