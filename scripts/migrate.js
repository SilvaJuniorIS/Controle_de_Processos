import {neon} from '@neondatabase/serverless';
import {postgresSchema} from '../schema.js';
if(!process.env.DATABASE_URL)throw new Error('Configure DATABASE_URL com a conexão Neon.');
const sql=neon(process.env.DATABASE_URL);
await sql.transaction(postgresSchema.map(text=>sql.query(text,[])));
console.log('Migração de contas e propriedade de registros concluída. Dados existentes preservados.');
