import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { storage } from './storage.js';
import {authRoute,privateAuthRoute,currentUser,publicUser} from './auth.js';

const root = dirname(fileURLToPath(import.meta.url));
const statuses = ['A analisar', 'Em andamento', 'Aguardando retorno', 'Concluído'];
const priorities = ['Baixa', 'Normal', 'Alta', 'Urgente'];
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
function validDate(value) { return typeof value === 'string' && datePattern.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }
async function clean(input, old, db) {
  if(!input || typeof input!=='object' || Array.isArray(input)) throw new Error('Dados do processo inválidos.');
  const result = {};
  for (const key of ['number', 'title', 'origin', 'reason', 'owner', 'category', 'notes', 'nextAction']) {
    if (input[key] !== undefined && typeof input[key] !== 'string') throw new Error('Campo inválido: ' + key);
    result[key] = (input[key] || '').trim();
    if (result[key].length > 10000) throw new Error('Texto muito longo.');
  }
  if (!result.number || !result.title || !result.reason) throw new Error('Preencha número, objeto e motivo da entrada.');
  result.year = Number(input.year);
  if (!Number.isInteger(result.year) || result.year < 1900 || result.year > 2200) throw new Error('Ano inválido.');
  if (!statuses.includes(input.status) || !priorities.includes(input.priority)) throw new Error('Situação ou prioridade inválida.');
  result.status = input.status; result.priority = input.priority;
  if (!validDate(input.receivedAt) || (input.dueAt && !validDate(input.dueAt))) throw new Error('Data inválida.');
  result.receivedAt = input.receivedAt; result.dueAt = input.dueAt || '';
  const duplicate = await db.duplicate(result.number, result.year, old?.id || '');
  if (duplicate) throw new Error('Já existe um processo com esse número e ano.');
  return { ...result, version: randomUUID(), id: old?.id || randomUUID(), createdAt: old?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), history: old?.history || [], demo: old?.demo || false };
}
function send(res, status, data) { res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}); res.end(JSON.stringify(data)); }
async function body(req) {
  // Vercel may parse JSON before handing the request to the function.
  if(req.body !== undefined) {
    if(typeof req.body==='object' && req.body!==null && !Buffer.isBuffer(req.body)) {
      if(Buffer.byteLength(JSON.stringify(req.body))>100000)throw new Error('Requisição muito grande.');
      return req.body;
    }
    const raw=Buffer.isBuffer(req.body)?req.body.toString('utf8'):String(req.body);
    if(Buffer.byteLength(raw)>100000)throw new Error('Requisição muito grande.');
    try{return JSON.parse(raw);}catch{throw new Error('JSON inválido.');}
  }
  let data = ''; for await (const chunk of req) { data += chunk; if (Buffer.byteLength(data) > 100000) throw new Error('Requisição muito grande.'); }
  try { return JSON.parse(data); } catch { throw new Error('JSON inválido.'); }
}
async function seed(db) {
  if ((await db.all()).length) throw new Error('Use a demonstração apenas em uma base vazia.');
  const today = new Date().toLocaleDateString('en-CA', {timeZone:'America/Sao_Paulo'});
  const offset = days => { const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); };
  const examples = [
    ['00482', 'Aquisição de equipamentos de informática', 'Secretaria de Administração', 'Analisar documentação e emitir parecer técnico.', 'Alta', 'Em andamento', -2, 'Compras'],
    ['00715', 'Renovação de contrato de manutenção predial', 'Departamento de Patrimônio', 'Conferir certidões atualizadas da contratada.', 'Urgente', 'A analisar', 0, 'Contratos'],
    ['00396', 'Solicitação de licença de funcionamento', 'Secretaria de Desenvolvimento', 'Aguardar complementação dos documentos.', 'Normal', 'Aguardando retorno', 4, 'Licenciamento'],
    ['00821', 'Prestação de contas do convênio de educação', 'Secretaria de Educação', 'Conciliar os comprovantes com o relatório financeiro.', 'Alta', 'Em andamento', 2, 'Prestação de contas'],
    ['00604', 'Revisão de procedimento de fiscalização', 'Coordenação de Fiscalização', 'Preparar minuta com as recomendações.', 'Normal', 'A analisar', 7, 'Fiscalização'],
    ['00218', 'Adesão à ata de registro de preços', 'Secretaria de Saúde', 'Parecer enviado e recebimento confirmado.', 'Baixa', 'Concluído', -5, 'Compras']
  ];
  const records=[];
  for (const [number,title,origin,nextAction,priority,status,days,category] of examples) {
    const p = await clean({number,title,origin,nextAction,priority,status,category,year:Number(today.slice(0,4)),reason:'Encaminhado para análise e manifestação da unidade.',owner:'Minha mesa',receivedAt:offset(-8),dueAt:offset(days),notes:'Registro fictício para conhecer o AtlasNex Fluxo.'},undefined,db);
    p.demo=true; p.history=[{id:randomUUID(),at:new Date().toISOString(),type:'Entrada',text:'Processo de demonstração recebido para análise.'}]; records.push(p);
  }
  await db.seed(records);
}
const files = { '/': ['index.html','text/html'], '/app.js': ['app.js','text/javascript'], '/diary.js':['diary.js','text/javascript'], '/accounts.js':['accounts.js','text/javascript'], '/style.css': ['style.css','text/css'], '/favicon.svg':['favicon.svg','image/svg+xml'] };
export async function handler(req,res) {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try {
    const url = new URL(req.url,'http://localhost');
    // Same-origin writes and HttpOnly sessions protect the private workspace.
    if (!['GET','HEAD'].includes(req.method) && req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) return send(res,403,{error:'Origem não permitida.'});
    let db,user,store;
    if(url.pathname.startsWith('/api/')){
      store=await storage();
      if(await authRoute(req,res,url,store,body,send))return;
      user=await currentUser(req,store);
      if(!user)return send(res,401,{error:'Entre com seu e-mail e senha para continuar.',loginRequired:true});
      if(await privateAuthRoute(req,res,url,store,user,body,send))return;
      db=store.forUser(user.id);
    }
    if(url.pathname==='/api/health'){await db.all();return send(res,200,{status:'ok',storage:store.kind,private:true,user:publicUser(user)});}
    if(url.pathname==='/api/notes' || /^\/api\/notes\/[\w-]+$/.test(url.pathname)) {
      const notes=db.notes;
      const id=url.pathname.split('/')[3];
      if(!id && req.method==='GET')return send(res,200,await notes.all());
      const old=id?await notes.get(id):null;
      if(id && !old)return send(res,404,{error:'Anotação não encontrada.'});
      if(id && req.method==='GET')return send(res,200,old);
      if((!id && req.method==='POST') || (id && req.method==='PUT')) {
        const input=await body(req);
        if(!input || typeof input.title!=='string' || !input.title.trim() || input.title.trim().length>200)throw new Error('Informe um assunto com até 200 caracteres.');
        if(typeof input.content!=='string' || !input.content.trim() || input.content.length>20000)throw new Error('Escreva sua anotação, com até 20.000 caracteres.');
        if(!validDate(input.entryDate))throw new Error('Informe uma data válida para a anotação.');
        if(old && input.version!==old.version)return send(res,409,{error:'Esta anotação mudou desde a última leitura. Reabra antes de editar.'});
        const now=new Date().toISOString();
        const note={id:old?.id||randomUUID(),title:input.title.trim(),content:input.content.trim(),entryDate:input.entryDate,createdAt:old?.createdAt||now,updatedAt:now,version:randomUUID()};
        await notes.save(note,old);return send(res,old?200:201,note);
      }
      if(id && req.method==='DELETE') {
        const input=await body(req);
        if(input?.version!==old.version)return send(res,409,{error:'Esta anotação mudou desde a última leitura. Reabra antes de excluir.'});
        await notes.remove(id,old.version);return send(res,200,{ok:true});
      }
      return send(res,405,{error:'Método não permitido.'});
    }
    if (url.pathname === '/api/processes' && req.method === 'GET') return send(res,200,await db.all());
    if (url.pathname === '/api/demo' && req.method === 'POST') { await seed(db); return send(res,201,await db.all()); }
    if (url.pathname === '/api/demo' && req.method === 'DELETE') { await db.removeDemo(); return send(res,200,{ok:true}); }
    if (url.pathname === '/api/processes' && req.method === 'POST') {
      const p=await clean(await body(req),undefined,db); p.history.push({id:randomUUID(),at:p.createdAt,type:'Entrada',text:'Entrada registrada: '+p.reason,actor:{id:user.id,name:user.name}}); await db.save(p); return send(res,201,p);
    }
    const match=url.pathname.match(/^\/api\/processes\/([\w-]+)(\/history)?$/);
    if (match) {
      const old=await db.get(match[1]); if(!old) return send(res,404,{error:'Processo não encontrado.'});
      if(req.method==='GET') return send(res,200,old);
      if(req.method==='DELETE' && !match[2]) { await db.remove(old.id); return send(res,200,{ok:true}); }
      if(req.method==='PUT' && !match[2]) {
        const input=await body(req);
        if(input.version && input.version!==old.version) return send(res,409,{error:'Este processo mudou desde a última leitura. Reabra-o antes de editar.'});
        const p=await clean(input,old,db);
        const changes=Object.keys(p).filter(k=>!['history','updatedAt','createdAt','demo','id','version'].includes(k) && p[k]!==old[k]);
        if(changes.length) p.history.push({id:randomUUID(),at:p.updatedAt,type:'Atualização',text: old.status!==p.status ? `Situação alterada de “${old.status}” para “${p.status}”.` : 'Dados do processo atualizados.',actor:{id:user.id,name:user.name},changes:changes.map(field=>({field,before:old[field] ?? '',after:p[field]}))});
        await db.save(p,old); return send(res,200,p);
      }
      if(req.method==='POST' && match[2]) {
        const b=await body(req); if(typeof b.text!=='string' || !b.text.trim() || b.text.length>10000) throw new Error('Descreva o andamento (até 10.000 caracteres).');
        const previous=structuredClone(old); old.updatedAt=new Date().toISOString(); old.version=randomUUID(); old.history.push({id:randomUUID(),at:old.updatedAt,type:'Andamento',text:b.text.trim(),actor:{id:user.id,name:user.name}}); await db.save(old,previous); return send(res,201,old);
      }
    }
    if(req.method==='GET' && files[url.pathname]) { const [file,type]=files[url.pathname]; res.writeHead(200,{'Content-Type':type+'; charset=utf-8'}); return res.end(readFileSync(join(root,'public',file))); }
    send(res,404,{error:'Rota não encontrada.'});
  } catch(error) {
    if(error.code==='23505' || error.code?.startsWith('SQLITE_CONSTRAINT')) return send(res,409,{error:'O registro já existe ou foi alterado por outra solicitação. Atualize a página e tente novamente.'});
    if(error.message?.startsWith('A conta mudou') || error.message?.startsWith('Este processo') || error.message?.startsWith('Esta anotação')) return send(res,409,{error:error.message});
    if(error.name==='NeonDbError' || error.message?.includes('fetch failed')) { console.error('Falha de conexão com o banco.');return send(res,503,{error:'O banco de dados está indisponível. Tente novamente em instantes.'}); }
    console.error(error.message); send(res,400,{error:error.message});
  }
}
export const server = http.createServer(handler);
if (process.argv[1] === fileURLToPath(import.meta.url)) server.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', ()=>console.log('AtlasNex Fluxo iniciado na porta '+(process.env.PORT || 3000)));
