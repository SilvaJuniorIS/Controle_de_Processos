export const postgresSchema=[
 `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','member')), created_at BIGINT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS account_setup (id INTEGER PRIMARY KEY CHECK(id=1))`,
 `CREATE TABLE IF NOT EXISTS sessions (digest TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at BIGINT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS invitations (digest TEXT PRIMARY KEY, email TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id), expires_at BIGINT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS recovery_codes (digest TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE)`,
 `CREATE TABLE IF NOT EXISTS auth_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at BIGINT NOT NULL)`,
 `DO $$ BEGIN IF to_regclass('private_processes') IS NULL THEN IF to_regclass('processes') IS NOT NULL THEN ALTER TABLE processes RENAME TO private_processes; ELSE CREATE TABLE private_processes (id TEXT PRIMARY KEY,body JSONB NOT NULL); END IF; END IF; END $$`,
 `DO $$ BEGIN IF to_regclass('private_field_notes') IS NULL THEN IF to_regclass('field_notes') IS NOT NULL THEN ALTER TABLE field_notes RENAME TO private_field_notes; ELSE CREATE TABLE private_field_notes (id TEXT PRIMARY KEY,body JSONB NOT NULL); END IF; END IF; END $$`,
 `ALTER TABLE private_processes ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES users(id)`,
 `ALTER TABLE private_field_notes ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES users(id)`,
 `CREATE UNIQUE INDEX IF NOT EXISTS processes_owner_number_year ON private_processes (owner_id,(body->>'number'),(body->>'year')) WHERE owner_id IS NOT NULL`,
 `DROP INDEX IF EXISTS processes_number_year`,
 `CREATE INDEX IF NOT EXISTS field_notes_owner ON private_field_notes(owner_id)`,
 `CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)`
];
export function migrateSqlite(db){
 db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
 for(const query of postgresSchema.slice(0,6))db.exec(query.replaceAll('BIGINT','INTEGER'));
 for(const legacy of ['processes','field_notes']){
  const table='private_'+legacy;
  if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table) && db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(legacy))db.exec(`ALTER TABLE ${legacy} RENAME TO ${table}`);
  db.exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, body TEXT NOT NULL)`);
  if(!db.prepare(`PRAGMA table_info(${table})`).all().some(c=>c.name==='owner_id'))db.exec(`ALTER TABLE ${table} ADD COLUMN owner_id TEXT REFERENCES users(id)`);
 }
 db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS processes_owner_number_year ON private_processes(owner_id,json_extract(body,'$.number'),json_extract(body,'$.year')) WHERE owner_id IS NOT NULL; DROP INDEX IF EXISTS processes_number_year; CREATE INDEX IF NOT EXISTS field_notes_owner ON private_field_notes(owner_id); CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);`);
}
