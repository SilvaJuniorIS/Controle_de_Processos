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
  await import('../scripts/migrate.js');
  const {storage}=await import('../storage.js');const db=await storage();assert.equal(db.kind,'postgres');
  assert.deepEqual(await db.all(),[]);
  const p={id:randomUUID(),number:'001',year:2026,title:'Contrato',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),version:randomUUID(),demo:false};
  await db.save(p);assert.deepEqual(await db.get(p.id),p);assert.equal(await db.duplicate('001',2026,''),true);assert.equal(await db.duplicate('001',2026,p.id),false);
  await assert.rejects(()=>db.save({...p,id:randomUUID()}),e=>e.code==='23505');
  const updated={...p,title:'Contrato atualizado',version:randomUUID()};await db.save(updated,p);assert.equal((await db.get(p.id)).title,updated.title);
  await assert.rejects(()=>db.save({...p,title:'Edição desatualizada'},p),/atualizado em outra janela/);
  const demo={...p,id:randomUUID(),number:'002',demo:true};await db.seed([demo]);assert.equal((await db.all()).length,2);
  await assert.rejects(()=>db.seed([{...demo,id:randomUUID(),number:'003'},{...demo,id:randomUUID()}]));assert.equal(await db.duplicate('003',2026,''),false);
  await db.removeDemo();assert.deepEqual(await db.all(),[updated]);await db.remove(p.id);assert.deepEqual(await db.all(),[]);
 }finally{await pg.close();}
});
