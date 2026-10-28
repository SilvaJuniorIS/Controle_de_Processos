import {mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {migrateSqlite} from './schema.js';
let pending;
export function storage(){return pending??=createStorage().catch(()=>{pending=undefined;throw new Error('Não foi possível inicializar o banco. Confira a configuração no servidor.');});}
async function createStorage(){
 let query,batch,kind;
 if(process.env.DATABASE_URL){
  const {neon}=await import('@neondatabase/serverless');const sql=neon(process.env.DATABASE_URL);kind='postgres';
  query=(text,params=[])=>sql.query(text,params,{fullResults:true});
  batch=items=>sql.transaction(items.map(([text,params])=>sql.query(text,params,{fullResults:true})),{fullResults:true});
 }else{
  if(process.env.VERCEL)throw new Error('DATABASE_URL obrigatório na Vercel.');
  const {DatabaseSync}=await import('node:sqlite');const path=process.env.DB_PATH||join(dirname(fileURLToPath(import.meta.url)),'data','fluxo.sqlite');mkdirSync(dirname(path),{recursive:true});const db=new DatabaseSync(path);migrateSqlite(db);kind='sqlite';
  const execute=(text,params=[])=>{const values=[];const statement=db.prepare(text.replace(/\$(\d+)/g,(_,index)=>{values.push(params[Number(index)-1]);return '?';}));if(/^\s*(SELECT|WITH)|RETURNING/i.test(text)){const rows=statement.all(...values);return {rows,rowCount:rows.length};}const r=statement.run(...values);return {rows:[],rowCount:r.changes};};
  query=async(...args)=>execute(...args);
  batch=async items=>{db.exec('BEGIN IMMEDIATE');try{const results=items.map(([text,params])=>execute(text,params));db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}};
 }
 const json=(key)=>kind==='postgres'?`body->>'${key}'`:`json_extract(body,'$.${key}')`;
 const decode=row=>row?(typeof row.body==='string'?JSON.parse(row.body):row.body):null;
 const one=async(text,params)=>(await query(text,params)).rows[0]||null;
 const encode=kind==='postgres'?'$2::jsonb':'$2';
 const accounts={
  count:async()=>Number((await one('SELECT COUNT(*) AS count FROM users')).count),
  byEmail:email=>one('SELECT * FROM users WHERE email=$1',[email]),
  byId:id=>one('SELECT * FROM users WHERE id=$1',[id]),
  async bootstrap(user,codes){
   await batch([
    ['INSERT INTO account_setup (id) VALUES (1)',[]],
    ['INSERT INTO users (id,email,name,password_hash,role,created_at) VALUES ($1,$2,$3,$4,$5,$6)',[user.id,user.email,user.name,user.password_hash,'admin',Date.now()]],
    ['UPDATE private_processes SET owner_id=$1 WHERE owner_id IS NULL',[user.id]],
    ['UPDATE private_field_notes SET owner_id=$1 WHERE owner_id IS NULL',[user.id]],
    ...codes.map(digest=>['INSERT INTO recovery_codes (digest,user_id) VALUES ($1,$2)',[digest,user.id]])
   ]);
  },
  async invite(digest,email,by,expires){await query('INSERT INTO invitations (digest,email,created_by,expires_at) VALUES ($1,$2,$3,$4)',[digest,email,by,expires]);},
  invitation:(digest)=>one('SELECT email,expires_at FROM invitations WHERE digest=$1 AND expires_at>$2',[digest,Date.now()]),
  async register(user,digest,codes){
   const results=await batch([
    ['INSERT INTO users (id,email,name,password_hash,role,created_at) SELECT $1,$2,$3,$4,\'member\',$5 FROM invitations WHERE digest=$6 AND email=$2 AND expires_at>$5',[user.id,user.email,user.name,user.password_hash,Date.now(),digest]],
    ...codes.map(code=>['INSERT INTO recovery_codes (digest,user_id) VALUES ($1,$2)',[code,user.id]]),
    ['DELETE FROM invitations WHERE digest=$1',[digest]]
   ]);return results[0].rowCount===1;
  },
  async addSession(digest,user,expires,hash){await query('DELETE FROM sessions WHERE expires_at<=$1',[Date.now()]);const r=await query('INSERT INTO sessions (digest,user_id,expires_at) SELECT $1,id,$3 FROM users WHERE id=$2 AND password_hash=$4 RETURNING digest',[digest,user,expires,hash]);if(!r.rowCount)throw new Error('A conta mudou durante o acesso. Entre novamente.');},
  session:digest=>one('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.digest=$1 AND sessions.expires_at>$2',[digest,Date.now()]),
  async logout(digest){await query('DELETE FROM sessions WHERE digest=$1',[digest]);},
  async attempt(key,limit=10){const now=Date.now();const row=await one(`INSERT INTO auth_limits (key,attempts,expires_at) VALUES ($1,1,$2) ON CONFLICT (key) DO UPDATE SET attempts=CASE WHEN auth_limits.expires_at<$3 THEN 1 ELSE auth_limits.attempts+1 END,expires_at=CASE WHEN auth_limits.expires_at<$3 THEN $2 ELSE auth_limits.expires_at END RETURNING attempts`,[key,now+15*60*1000,now]);return Number(row.attempts)<=limit;},
  async clearAttempts(key){await query('DELETE FROM auth_limits WHERE key=$1',[key]);},
  async reset(user,code,hash){
   const update=kind==='postgres'?`WITH consumed AS (DELETE FROM recovery_codes WHERE user_id=$1 AND digest=$2 RETURNING user_id) UPDATE users SET password_hash=$3 WHERE id IN (SELECT user_id FROM consumed) RETURNING id`:`UPDATE users SET password_hash=$3 WHERE id=$1 AND EXISTS(SELECT 1 FROM recovery_codes WHERE user_id=$1 AND digest=$2) RETURNING id`;
   const result=await batch([[update,[user,code,hash]],['DELETE FROM sessions WHERE user_id=$1 AND EXISTS(SELECT 1 FROM users WHERE id=$1 AND password_hash=$2)',[user,hash]],['DELETE FROM recovery_codes WHERE user_id=$1 AND digest=$2',[user,code]]]);return result[0].rowCount===1;
  },
  async changePassword(user,old,hash){const result=await batch([['UPDATE users SET password_hash=$3 WHERE id=$1 AND password_hash=$2 RETURNING id',[user,old,hash]],['DELETE FROM sessions WHERE user_id=$1 AND EXISTS(SELECT 1 FROM users WHERE id=$1 AND password_hash=$2)',[user,hash]]]);return result[0].rowCount===1;}
 };
 function forUser(owner){
  if(typeof owner!=='string'||!owner)throw new Error('Usuário obrigatório.');
  function records(table,note=false){
   return {
    all:async()=> (await query(`SELECT body FROM ${table} WHERE owner_id=$1 ORDER BY ${note?json('entryDate')+' DESC, ':''}${json('createdAt')} DESC,id DESC`,[owner])).rows.map(decode),
    get:async id=>decode(await one(`SELECT body FROM ${table} WHERE id=$1 AND owner_id=$2`,[id,owner])),
    async save(value,old){
     if(!old)await query(`INSERT INTO ${table} (id,body,owner_id) VALUES ($1,${encode},$3)`,[value.id,JSON.stringify(value),owner]);
     else {const r=await query(`UPDATE ${table} SET body=${encode} WHERE id=$1 AND owner_id=$3 AND COALESCE(${json('version')},${json('updatedAt')})=$4 RETURNING id`,[value.id,JSON.stringify(value),owner,old.version||old.updatedAt]);if(!r.rowCount)throw new Error(note?'Esta anotação mudou em outra janela. Reabra antes de editar.':'Este processo mudou em outra janela. Reabra antes de editar.');}
    },
    async remove(id,version){const r=await query(`DELETE FROM ${table} WHERE id=$1 AND owner_id=$2${note?` AND ${json('version')}=$3`:''} RETURNING id`,note?[id,owner,version]:[id,owner]);if(note&&!r.rowCount)throw new Error('Esta anotação mudou em outra janela. Reabra antes de excluir.');}
   };
  }
  return {...records('private_processes'),notes:records('private_field_notes',true),
   duplicate:async(number,year,id)=>!!await one(`SELECT id FROM private_processes WHERE owner_id=$1 AND ${json('number')}=$2 AND ${json('year')}=$3 AND id<>$4`,[owner,number,kind==='postgres'?String(year):year,id]),
   async removeDemo(){await query(`DELETE FROM private_processes WHERE owner_id=$1 AND ${json('demo')}=${kind==='postgres'?"'true'":'1'}`,[owner]);},
   async seed(values){await batch(values.map(v=>[`INSERT INTO private_processes (id,body,owner_id) VALUES ($1,${encode},$3)`,[v.id,JSON.stringify(v),owner]]));}
  };
 }
 return {kind,accounts,forUser};
}
