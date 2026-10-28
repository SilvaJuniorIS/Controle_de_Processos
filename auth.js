import { createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto';

const COOKIE='fluxo_session';
const ttl=8*60*60;
export const authRequired=()=>!!(process.env.APP_PASSWORD || process.env.VERCEL);
export const authConfigured=()=>!!process.env.APP_PASSWORD && process.env.APP_PASSWORD.length>=16;
const equal=(a,b)=>timingSafeEqual(createHash('sha256').update(String(a)).digest(),createHash('sha256').update(String(b)).digest());
export const passwordMatches=value=>authConfigured() && typeof value==='string' && equal(value,process.env.APP_PASSWORD);
const sign=data=>createHmac('sha256',process.env.APP_PASSWORD).update(data).digest('base64url');
export function sessionCookie(logout=false) {
  const data=Buffer.from(JSON.stringify({exp:Date.now()+ttl*1000,nonce:randomBytes(16).toString('hex')})).toString('base64url');
  const value=logout?'':data+'.'+sign(data);
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${logout?0:ttl}${process.env.VERCEL?'; Secure':''}`;
}
export function authenticated(req) {
  if(!authRequired())return true;
  if(!authConfigured())return false;
  const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='));
  if(!cookie)return false;
  const parts=cookie.slice(COOKIE.length+1).split('.');
  if(parts.length!==2)return false;
  try { const [data,signature]=parts;const p=JSON.parse(Buffer.from(data,'base64url'));return equal(signature,sign(data)) && typeof p.exp==='number' && p.exp>Date.now() && p.exp<=Date.now()+ttl*1000; }
  catch { return false; }
}
