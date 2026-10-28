import {randomBytes,randomUUID,createHash,timingSafeEqual,scrypt as scryptCallback} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback),COOKIE='fluxo_session',TTL=8*60*60;
export const digest=value=>createHash('sha256').update(String(value)).digest('hex');
export const publicUser=u=>u?{id:u.id,email:u.email,name:u.name,role:u.role}:null;
const equal=(a,b)=>timingSafeEqual(Buffer.from(digest(a),'hex'),Buffer.from(digest(b),'hex'));
export function sessionToken(req){const entry=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='));const value=entry?.slice(COOKIE.length+1)||'';return /^[a-f0-9]{64}$/.test(value)?value:'';}
export function cookie(value='',logout=false){return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${logout?0:TTL}${process.env.VERCEL?'; Secure':''}`;}
export async function currentUser(req,db){const token=sessionToken(req);return token?db.accounts.session(digest(token)):null;}
export async function hashPassword(password){if(typeof password!=='string'||password.length<12||password.length>128)throw new Error('Use uma senha entre 12 e 128 caracteres.');const salt=randomBytes(16).toString('hex');const hash=await scrypt(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});return `scrypt:${salt}:${hash.toString('hex')}`;}
export async function verifyPassword(password,encoded){
 if(typeof password!=='string'||password.length>128)return false;
 const parts=encoded?.split(':');const valid=parts?.length===3&&parts[0]==='scrypt'&&/^[a-f0-9]{64}$/.test(parts[2]);
 const salt=valid?parts[1]:'invalid-user-dummy-salt';const actual=await scrypt(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
 return !!valid&&timingSafeEqual(actual,Buffer.from(parts[2],'hex'));
}
function identity(input){
 const name=typeof input.name==='string'?input.name.trim():'';const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
 if(!name||name.length>100)throw new Error('Informe seu nome, com até 100 caracteres.');
 if(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Informe um e-mail válido.');
 return {id:randomUUID(),name,email};
}
async function startSession(db,user,res){const token=randomBytes(32).toString('hex');await db.accounts.addSession(digest(token),user.id,Date.now()+TTL*1000,user.password_hash);res.setHeader('Set-Cookie',cookie(token));}
export async function authRoute(req,res,url,db,body,send){
 const path=url.pathname;
 if(path==='/api/auth/status'&&req.method==='GET'){
  const setupRequired=!(await db.accounts.count());return send(res,200,{setupRequired,configurationRequired:setupRequired&&!(process.env.APP_PASSWORD?.length>=16),user:publicUser(await currentUser(req,db))}),true;
 }
 const publicRoutes=['/api/setup','/api/login','/api/register','/api/invitation','/api/recover'];
 if(!publicRoutes.includes(path)||req.method!=='POST')return false;
 const input=await body(req);if(!input||typeof input!=='object')throw new Error('Preencha os campos de acesso.');
 const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
 const address=process.env.VERCEL?(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown'):(req.socket?.remoteAddress||'local');
 const key=digest(`${path}:${address}:${email.slice(0,254)}`);
 if(!await db.accounts.attempt(digest(`${path}:address:${address}`),30)||!await db.accounts.attempt(key)){res.setHeader('Retry-After','900');send(res,429,{error:'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.'});return true;}
 if(path==='/api/setup'){
  if(await db.accounts.count()){send(res,409,{error:'A primeira conta já foi criada. Entre com seu e-mail e senha.'});return true;}
  if(!process.env.APP_PASSWORD||process.env.APP_PASSWORD.length<16){send(res,503,{error:'Configure a senha de ativação APP_PASSWORD no ambiente.'});return true;}
  if(typeof input.setupPassword!=='string'||!equal(input.setupPassword,process.env.APP_PASSWORD)){send(res,401,{error:'Senha de ativação incorreta.'});return true;}
  const user=identity(input);user.password_hash=await hashPassword(input.password);user.role='admin';
  const codes=Array.from({length:4},()=>randomBytes(16).toString('hex'));
  await db.accounts.bootstrap(user,codes.map(digest));await startSession(db,user,res);await db.accounts.clearAttempts(key);
  send(res,201,{user:publicUser(user),recoveryCodes:codes});return true;
 }
 if(path==='/api/invitation'){
  const invite=typeof input.token==='string'&&/^[a-f0-9]{64}$/.test(input.token)?await db.accounts.invitation(digest(input.token)):null;
  if(!invite){send(res,400,{error:'Convite inválido ou expirado. Peça um novo convite ao administrador.'});return true;}
  send(res,200,{email:invite.email});return true;
 }
 if(path==='/api/register'){
  const invite=typeof input.token==='string'?await db.accounts.invitation(digest(input.token)):null;
  if(!invite||invite.email!==email){send(res,400,{error:'Convite inválido, expirado ou destinado a outro e-mail.'});return true;}
  const user=identity(input);if(await db.accounts.byEmail(user.email)){send(res,409,{error:'Este convite não pode ser usado. Entre na sua conta ou solicite outro convite.'});return true;}
  user.password_hash=await hashPassword(input.password);user.role='member';const codes=Array.from({length:4},()=>randomBytes(16).toString('hex'));
  await db.accounts.register(user,digest(input.token),codes.map(digest));await startSession(db,user,res);await db.accounts.clearAttempts(key);send(res,201,{user:publicUser(user),recoveryCodes:codes});return true;
 }
 if(path==='/api/login'){
  const user=await db.accounts.byEmail(email);const valid=await verifyPassword(input.password,user?.password_hash);
  if(!valid){send(res,401,{error:'E-mail ou senha incorretos.'});return true;}
  await startSession(db,user,res);await db.accounts.clearAttempts(key);send(res,200,{user:publicUser(user)});return true;
 }
 if(path==='/api/recover'){
  const user=await db.accounts.byEmail(email);const hash=await hashPassword(input.password);
  const ok=user&&typeof input.code==='string'&&await db.accounts.reset(user.id,digest(input.code.trim()),hash);
  if(!ok){send(res,400,{error:'E-mail ou código de recuperação inválido.'});return true;}
  res.setHeader('Set-Cookie',cookie('',true));await db.accounts.clearAttempts(key);send(res,200,{ok:true});return true;
 }
 return false;
}
export async function privateAuthRoute(req,res,url,db,user,body,send){
 if(url.pathname==='/api/logout'&&req.method==='POST'){await db.accounts.logout(digest(sessionToken(req)));res.setHeader('Set-Cookie',cookie('',true));send(res,200,{ok:true});return true;}
 if(url.pathname==='/api/me'&&req.method==='GET'){send(res,200,{user:publicUser(user)});return true;}
 if(url.pathname==='/api/invitations'&&req.method==='POST'){
  if(user.role!=='admin'){send(res,403,{error:'Somente o administrador pode gerar convites.'});return true;}
  const input=await body(req);const email=typeof input?.email==='string'?input.email.trim().toLowerCase():'';
  if(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Informe um e-mail válido para o convite.');
  if(await db.accounts.byEmail(email)){send(res,409,{error:'Já existe uma conta para este e-mail.'});return true;}
  const token=randomBytes(32).toString('hex');const expiresAt=Date.now()+7*24*60*60*1000;await db.accounts.invite(digest(token),email,user.id,expiresAt);
  send(res,201,{token,email,expiresAt});return true;
 }
 if(url.pathname==='/api/password'&&req.method==='POST'){
  const input=await body(req);if(!await verifyPassword(input?.currentPassword,user.password_hash)){send(res,400,{error:'Senha atual incorreta.'});return true;}
  const hash=await hashPassword(input.password);if(!await db.accounts.changePassword(user.id,user.password_hash,hash)){send(res,409,{error:'A conta mudou em outra sessão. Entre novamente.'});return true;}
  await startSession(db,{...user,password_hash:hash},res);send(res,200,{ok:true});return true;
 }
 return false;
}
