import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { storage } from './storage.js';
import { authRequired, authConfigured, authenticated, passwordMatches, sessionCookie } from './auth.js';

const root = dirname(fileURLToPath(import.meta.url));
const statuses = ['A analisar', 'Em andamento', 'Aguardando retorno', 'Concluído'];
const priorities = ['Baixa', 'Normal', 'Alta', 'Urgente'];
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
function validDate(value) { return typeof value === 'string' && datePattern.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }
async function clean(input, old) {
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
  const duplicate = await (await storage()).duplicate(result.number, result.year, old?.id || '');
  if (duplicate) throw new Error('Já existe um processo com esse número e ano.');
  return { ...result, version: randomUUID(), id: old?.id || randomUUID(), createdAt: old?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), history: old?.history || [], demo: old?.demo || false };
}
const get = async id => (await storage()).get(id);
const all = async () => (await storage()).all();
const save = async (p,old) => (await storage()).save(p,old);
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
async function seed() {
  if ((await all()).length) throw new Error('Use a demonstração apenas em uma base vazia.');
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
    const p = await clean({number,title,origin,nextAction,priority,status,category,year:Number(today.slice(0,4)),reason:'Encaminhado para análise e manifestação da unidade.',owner:'Minha mesa',receivedAt:offset(-8),dueAt:offset(days),notes:'Registro fictício para conhecer o AtlasNex Fluxo.'});
    p.demo=true; p.history=[{id:randomUUID(),at:new Date().toISOString(),type:'Entrada',text:'Processo de demonstração recebido para análise.'}]; records.push(p);
  }
  await (await storage()).seed(records);
}
const files = { '/': ['index.html','text/html'], '/app.js': ['app.js','text/javascript'], '/style.css': ['style.css','text/css'], '/favicon.svg':['favicon.svg','image/svg+xml'] };
export async function handler(req,res) {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try {
    const url = new URL(req.url,'http://localhost');
    // Same-origin writes and HttpOnly sessions protect the private workspace.
    if (!['GET','HEAD'].includes(req.method) && req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) return send(res,403,{error:'Origem não permitida.'});
    if (url.pathname.startsWith('/api/')) {
      if(authRequired() && !authConfigured()) return send(res,503,{error:'Configure APP_PASSWORD com pelo menos 16 caracteres para ativar o acesso privado.'});
      if(url.pathname==='/api/login' && req.method==='POST') {
        const input=await body(req);
        if(!passwordMatches(input?.password)) return send(res,401,{error:'Senha incorreta.'});
        res.setHeader('Set-Cookie',sessionCookie()); return send(res,200,{ok:true});
      }
      if(!authenticated(req))return send(res,401,{error:'Entre com a senha do seu espaço para continuar.',loginRequired:true});
      if(url.pathname==='/api/logout' && req.method==='POST') { res.setHeader('Set-Cookie',sessionCookie(true));return send(res,200,{ok:true}); }
    }
    if (url.pathname === '/api/health') { const db=await storage(); await db.all(); return send(res,200,{status:'ok',storage:db.kind,private:authRequired()}); }
    if (url.pathname === '/api/processes' && req.method === 'GET') return send(res,200,await all());
    if (url.pathname === '/api/demo' && req.method === 'POST') { await seed(); return send(res,201,await all()); }
    if (url.pathname === '/api/demo' && req.method === 'DELETE') { await (await storage()).removeDemo(); return send(res,200,{ok:true}); }
    if (url.pathname === '/api/processes' && req.method === 'POST') {
      const p=await clean(await body(req)); p.history.push({id:randomUUID(),at:p.createdAt,type:'Entrada',text:'Entrada registrada: '+p.reason}); await save(p); return send(res,201,p);
    }
    const match=url.pathname.match(/^\/api\/processes\/([\w-]+)(\/history)?$/);
    if (match) {
      const old=await get(match[1]); if(!old) return send(res,404,{error:'Processo não encontrado.'});
      if(req.method==='GET') return send(res,200,old);
      if(req.method==='DELETE' && !match[2]) { await (await storage()).remove(old.id); return send(res,200,{ok:true}); }
      if(req.method==='PUT' && !match[2]) {
        const input=await body(req);
        if(input.version && input.version!==old.version) return send(res,409,{error:'Este processo mudou desde a última leitura. Reabra-o antes de editar.'});
        const p=await clean(input,old);
        const changes=Object.keys(p).filter(k=>!['history','updatedAt','createdAt','demo','id','version'].includes(k) && p[k]!==old[k]);
        if(changes.length) p.history.push({id:randomUUID(),at:p.updatedAt,type:'Atualização',text: old.status!==p.status ? `Situação alterada de “${old.status}” para “${p.status}”.` : 'Dados do processo atualizados.',changes:changes.map(field=>({field,before:old[field] ?? '',after:p[field]}))});
        await save(p,old); return send(res,200,p);
      }
      if(req.method==='POST' && match[2]) {
        const b=await body(req); if(typeof b.text!=='string' || !b.text.trim() || b.text.length>10000) throw new Error('Descreva o andamento (até 10.000 caracteres).');
        const previous=structuredClone(old); old.updatedAt=new Date().toISOString(); old.version=randomUUID(); old.history.push({id:randomUUID(),at:old.updatedAt,type:'Andamento',text:b.text.trim()}); await save(old,previous); return send(res,201,old);
      }
    }
    if(req.method==='GET' && files[url.pathname]) { const [file,type]=files[url.pathname]; res.writeHead(200,{'Content-Type':type+'; charset=utf-8'}); return res.end(readFileSync(join(root,'public',file))); }
    send(res,404,{error:'Rota não encontrada.'});
  } catch(error) {
    if(error.code==='23505' || error.code?.startsWith('SQLITE_CONSTRAINT')) return send(res,409,{error:'Já existe um processo com esse número e ano.'});
    if(error.message?.startsWith('Este processo')) return send(res,409,{error:error.message});
    if(error.name==='NeonDbError' || error.message?.includes('fetch failed')) { console.error('Falha de conexão com o banco.');return send(res,503,{error:'O banco de dados está indisponível. Tente novamente em instantes.'}); }
    console.error(error.message); send(res,400,{error:error.message});
  }
}
export const server = http.createServer(handler);
if (process.argv[1] === fileURLToPath(import.meta.url)) server.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', ()=>console.log('AtlasNex Fluxo iniciado na porta '+(process.env.PORT || 3000)));
