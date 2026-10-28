import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if(process.env.VERCEL && (!process.env.APP_PASSWORD || process.env.APP_PASSWORD.length<16))throw new Error('Defina APP_PASSWORD com pelo menos 16 caracteres nas variáveis do projeto Vercel.');
if(process.env.VERCEL && !process.env.DATABASE_URL)throw new Error('Conecte um banco Neon e defina DATABASE_URL no projeto Vercel.');
for(const path of ['server.js','storage.js','auth.js','api/index.js','public/app.js','public/diary.js']) {
  const r=spawnSync(process.execPath,['--check',path],{stdio:'inherit'});
  if(r.status!==0)process.exit(r.status||1);
}
for(const path of ['public/index.html','public/app.js','public/diary.js','public/style.css','public/favicon.svg'])if(!existsSync(path))throw new Error('Arquivo ausente: '+path);
console.log('Build validado: frontend estático e função Node.js.');
