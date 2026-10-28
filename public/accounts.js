export function createAccounts({api,toast,esc,info,onLogin}){
 const $=s=>document.querySelector(s);const dialog=$('#login-dialog'),form=$('#login-form');let mode='login',user=null,inviteToken='',codes=[],opening=0;
 function screen(next,status={}){
  mode=next;form.reset();$('#login-error').textContent='';
  const creating=['setup','register'].includes(mode),recover=mode==='recover';
  $('#access-name-field').hidden=!creating;$('#access-name').required=creating;
  $('#access-setup-field').hidden=mode!=='setup';$('#access-setup').required=mode==='setup';
  $('#access-code-field').hidden=!recover;$('#access-code').required=recover;
  $('#access-password').minLength=mode==='login'?1:12;$('#access-password').autocomplete=mode==='login'?'current-password':'new-password';
  $('#access-email').readOnly=mode==='register';if(mode==='register')$('#access-email').value=status.email;
  $('#access-title').textContent={login:'Entre na sua conta.',setup:'Ative sua conta individual.',register:'Seu próprio espaço começa aqui.',recover:'Recupere sua conta.'}[mode];
  $('#access-intro').textContent={login:'Seus processos e seu diário ficam disponíveis somente na sua conta.',setup:'Crie a primeira conta com sua senha de ativação. Os processos e anotações existentes serão preservados e vinculados a você.',register:'Você recebeu um convite. Crie uma senha pessoal com pelo menos 12 caracteres.',recover:'Informe seu e-mail, um dos códigos que você guardou e uma nova senha. As sessões anteriores serão encerradas.'}[mode];
  $('#access-submit').textContent={login:'Entrar',setup:'Criar minha conta',register:'Criar minha conta',recover:'Redefinir senha'}[mode];
  $('#access-recover').hidden=mode!=='login';$('#access-back').hidden=!recover&&mode!=='register';
  $('#access-footer').textContent=mode==='setup'?'Primeiro acesso · migração segura':creating?'Senha pessoal: mínimo de 12 caracteres':'Contas novas somente por convite';
  if(status.configurationRequired){$('#login-error').textContent='Configure APP_PASSWORD na Vercel antes de ativar sua conta.';$('#access-submit').disabled=true;}else $('#access-submit').disabled=false;
  if(!dialog.open)dialog.showModal();
 }
 async function open(){
  user=null;const ticket=++opening;clearSecrets();
  screen('login');
  try{
   const status=await api('/auth/status');if(ticket!==opening)return;
   const token=new URLSearchParams(location.hash.slice(1)).get('convite');
   if(token){inviteToken=token;const invitation=await api('/invitation',{method:'POST',body:JSON.stringify({token})});screen('register',invitation);}
   else screen(status.setupRequired?'setup':'login',status);
  }catch(e){$('#login-error').textContent=e.message;}
 }
 function clearSecrets(){codes=[];$('#recovery-codes').textContent='';$('#info-content').textContent='';if($('#recovery-dialog').open)$('#recovery-dialog').close();}
 function showCodes(values){codes=values;$('#recovery-codes').replaceChildren(...codes.map(value=>{const code=document.createElement('code');code.textContent=value;return code;}));$('#recovery-dialog').showModal();}
 dialog.addEventListener('cancel',e=>e.preventDefault());$('#recovery-dialog').addEventListener('cancel',e=>e.preventDefault());
 $('#saved-recovery').onclick=()=>{$('#recovery-dialog').close();codes=[];$('#recovery-codes').textContent='';};
 $('#download-recovery').onclick=()=>{const blob=new Blob(['AtlasNex Fluxo — códigos de recuperação de uso único\nConta: '+user.email+'\n\n'+codes.join('\n')+'\n\nGuarde em local seguro. Não compartilhe.'],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='atlasnex-codigos-recuperacao.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 $('#access-recover').onclick=()=>screen('recover');$('#access-back').onclick=()=>{history.replaceState(null,'',location.pathname+location.search);inviteToken='';screen('login');};
 form.addEventListener('submit',async e=>{
  e.preventDefault();const button=e.submitter;button.disabled=true;$('#login-error').textContent='';
  try{
   const payload=Object.fromEntries(new FormData(form));if(mode==='register')payload.token=inviteToken;
   const result=await api('/'+mode,{method:'POST',body:JSON.stringify(payload)});
   if(mode==='recover'){screen('login');toast('Senha redefinida. Entre com sua nova senha.');return;}
   history.replaceState(null,'',location.pathname+location.search);inviteToken='';form.reset();dialog.close();await onLogin();if(result.recoveryCodes)showCodes(result.recoveryCodes);toast('Bem-vindo ao seu espaço individual.');
  }catch(error){$('#login-error').textContent=error.message;}finally{button.disabled=false;}
 });
 function profile(){
  if(!user)return;
  info('Sua conta',`<span class="integration-status">Espaço individual</span><h3>${esc(user.name)}</h3><p>${esc(user.email)}</p><p>Seus processos e diário pertencem à sua conta. Outros usuários, inclusive o administrador de convites, não conseguem acessá-los pela aplicação.</p>${user.role==='admin'?'<div class="account-box"><h3>Convidar uma pessoa</h3><p>O convite cria outro espaço individual. Nenhum dos seus registros será compartilhado.</p><form id="invite-form"><label for="invite-email">E-mail da pessoa</label><input type="email" id="invite-email" name="email" required maxlength="254" placeholder="pessoa@exemplo.com"><button class="button primary" type="submit">Gerar convite</button><p id="invite-error" class="form-error" role="alert"></p></form><div id="invite-result" hidden><label for="invite-link">Link do convite · válido por 7 dias</label><input id="invite-link" readonly><p>Copie o link e envie à pessoa por um canal de sua confiança. A ferramenta não envia e-mails automaticamente.</p></div></div>':''}<details class="account-box"><summary>Alterar minha senha</summary><form id="password-form"><label>Senha atual<input name="currentPassword" type="password" required autocomplete="current-password" maxlength="128"></label><label>Nova senha<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label><button class="button secondary" type="submit">Salvar nova senha</button><p id="password-error" class="form-error" role="alert"></p></form></details><button class="button secondary" id="logout">Sair da conta</button>`);
 }
 document.addEventListener('submit',async e=>{
  if(!['invite-form','password-form'].includes(e.target.id))return;e.preventDefault();const button=e.submitter;button.disabled=true;const invite=e.target.id==='invite-form';const error=$(invite?'#invite-error':'#password-error');error.textContent='';
  try{const result=await api(invite?'/invitations':'/password',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});e.target.reset();
   if(invite){$('#invite-result').hidden=false;$('#invite-link').value=location.origin+'/#convite='+result.token;$('#invite-link').select();toast('Convite gerado para '+result.email+'.');}
   else toast('Senha atualizada. As outras sessões foram encerradas.');
  }catch(err){if(error.isConnected)error.textContent=err.message;}finally{button.disabled=false;}
 });
 return {open,profile,updateUser:value=>{user=value;}};
}
