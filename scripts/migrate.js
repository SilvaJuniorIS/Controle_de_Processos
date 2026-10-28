import { neon } from '@neondatabase/serverless';

if(!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL com a conexão Neon. Não compartilhe a URL no chat.');
const sql=neon(process.env.DATABASE_URL);
await sql`CREATE TABLE IF NOT EXISTS processes (id TEXT PRIMARY KEY, body JSONB NOT NULL)`;
await sql`CREATE UNIQUE INDEX IF NOT EXISTS processes_number_year ON processes ((body->>'number'),(body->>'year'))`;
console.log('Schema de processos preparado no Postgres.');
