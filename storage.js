import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
let storePromise;
const conflict = () => new Error('Este processo foi atualizado em outra janela. Reabra o processo antes de editar.');

export function storage() {
  storePromise ??= createStorage().catch(() => { storePromise=undefined; throw new Error('Não foi possível inicializar o banco. Confira a configuração do banco no servidor.'); });
  return storePromise;
}

async function createStorage() {
  if (process.env.DATABASE_URL) {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    return {
      kind: 'postgres',
      // Schema is installed explicitly before deployment, never on a request.
      async all() { return (await sql`SELECT body FROM processes ORDER BY body->>'createdAt' DESC, id DESC`).map(r => r.body); },
      async get(id) { return (await sql`SELECT body FROM processes WHERE id=${id}`)[0]?.body || null; },
      async duplicate(number, year, id) { return (await sql`SELECT id FROM processes WHERE body->>'number'=${number} AND body->>'year'=${String(year)} AND id<>${id} LIMIT 1`).length > 0; },
      async save(p, old) {
        if (!old) await sql`INSERT INTO processes (id, body) VALUES (${p.id},${JSON.stringify(p)}::jsonb)`;
        else {
          const result = await sql`UPDATE processes SET body=${JSON.stringify(p)}::jsonb WHERE id=${p.id} AND COALESCE(body->>'version',body->>'updatedAt')=${old.version || old.updatedAt} RETURNING id`;
          if (!result.length) throw conflict();
        }
      },
      async remove(id) { await sql`DELETE FROM processes WHERE id=${id}`; },
      async removeDemo() { await sql`DELETE FROM processes WHERE body->>'demo'='true'`; },
      async seed(records) { await sql.transaction(records.map(p=>sql`INSERT INTO processes (id,body) VALUES (${p.id},${JSON.stringify(p)}::jsonb)`)); }
    };
  }
  if (process.env.VERCEL) throw new Error('Configure DATABASE_URL com um banco Neon antes de usar a aplicação na Vercel.');
  const { DatabaseSync } = await import('node:sqlite');
  const dbPath = process.env.DB_PATH || join(root, 'data', 'fluxo.sqlite');
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS processes (id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS processes_number_year ON processes(json_extract(body,'$.number'),json_extract(body,'$.year'));`);
  const insert=db.prepare('INSERT INTO processes (id,body) VALUES (?,?)');
  return {
    kind:'sqlite',
    async all() { return db.prepare('SELECT body FROM processes ORDER BY rowid DESC').all().map(r=>JSON.parse(r.body)); },
    async get(id) { const row=db.prepare('SELECT body FROM processes WHERE id=?').get(id); return row?JSON.parse(row.body):null; },
    async duplicate(number,year,id) { return !!db.prepare("SELECT id FROM processes WHERE json_extract(body,'$.number')=? AND json_extract(body,'$.year')=? AND id<>?").get(number,year,id); },
    async save(p,old) {
      if(!old)insert.run(p.id,JSON.stringify(p));
      else {
        const r=db.prepare("UPDATE processes SET body=? WHERE id=? AND COALESCE(json_extract(body,'$.version'),json_extract(body,'$.updatedAt'))=?").run(JSON.stringify(p),p.id,old.version||old.updatedAt);
        if(!r.changes)throw conflict();
      }
    },
    async remove(id) { db.prepare('DELETE FROM processes WHERE id=?').run(id); },
    async removeDemo() { db.prepare("DELETE FROM processes WHERE json_extract(body,'$.demo')=1").run(); },
    async seed(records) {
      db.exec('BEGIN IMMEDIATE');
      try { for(const p of records)insert.run(p.id,JSON.stringify(p));db.exec('COMMIT'); }
      catch(e) { db.exec('ROLLBACK');throw e; }
    }
  };
}
