import {createAccounts} from './accounts.js';
import { createDiary } from './diary.js';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const paths={notebook:'M5 3h14v18H5z M3 7h4 M3 12h4 M3 17h4 M10 8h5 M10 12h5',dashboard:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',folder:'M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z',check:'M9 11l3 3 8-8 M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10',history:'M3 11a9 9 0 1 1 2 7 M3 4v7h7 M12 7v5l3 2',spark:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',settings:'M9 4h6l1 3 3 1 1 5-2 2v4l-5 2-3-2-4 1-3-5 2-3-1-4 5-2V4Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',plus:'M12 5v14 M5 12h14',search:'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',download:'M12 3v12 m-5-5 5 5 5-5 M4 15v5h16v-5',clock:'M12 7v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',alert:'m12 3 10 18H2L12 3Z M12 9v5 M12 17v1',info:'M12 11v6 M12 7v1 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',arrow:'M5 12h14 m-5-5 5 5-5 5'};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.folder}"/></svg>`;
function icons(){ $$('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon)); }
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
const date = value => value ? new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')) : 'Sem prazo';
const timestamp = value => new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value));
const days = value => Math.round((Date.parse(value)-Date.parse(today()))/86400000);
const active = p => p.status !== 'Concluído';
const overdue = p => active(p) && p.dueAt && p.dueAt < today();
const statusClass = value => ({'A analisar':'analisar','Em andamento':'andamento','Aguardando retorno':'aguardando','Concluído':'concluido'}[value]);
const badge = p => `<span class="badge status-${statusClass(p.status)}"><i></i>${esc(p.status)}</span>`;
const priority = p => `<span class="priority priority-${esc(p.priority)}"><i></i>${esc(p.priority)}</span>`;
const fields={number:'Número',year:'Ano',title:'Objeto',origin:'Origem',reason:'Motivo da entrada',owner:'Responsável',category:'Categoria',notes:'Observações',nextAction:'Próxima providência',status:'Situação',priority:'Prioridade',receivedAt:'Data de entrada',dueAt:'Prazo'};
let processes=[],view='overview',status='',query='',priorityFilter='',special='',detailId=null,toastTimer,cloud=false,privateSpace=false;
async function api(path,options={}) {
  const response=await fetch('/api'+path,{...options,headers:{'Content-Type':'application/json',...options.headers}});
  const result=await response.json();
  if(response.status===401 && result.loginRequired)showLogin();
  if(!response.ok) throw new Error(result.error||'Não foi possível completar a operação.'); return result;
}
function toast(message,error=false){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').classList.toggle('error',error);$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,4500);}
async function refresh(){processes=await api('/processes');render();}
function showLogin(){
  processes=[];diary.clear();render();$$('dialog[open]').forEach(d=>d.close());$('#detail-content').innerHTML='';$('#process-form').reset();detailId=null;
  accounts.open();
}
const accounts=createAccounts({api,toast,esc,info,onLogin:loadWorkspace});
const diary=createDiary({api,toast,confirmAction,esc,date,timestamp,today,icon});
$('#new-note').onclick=()=>diary.newEntry();
async function loadWorkspace(){
  const health=await api('/health');cloud=health.storage==='postgres';privateSpace=health.private;
  $('.local-status').innerHTML='<i></i> '+(cloud?'Banco na nuvem':'Armazenamento local');
  accounts.updateUser(health.user);$('.profile small').textContent='Conta individual · v0.4';$('.profile>span:nth-child(2)').firstChild.textContent=health.user.name;$$('.avatar').forEach(el=>el.textContent=health.user.name.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase());
  await refresh();if(view==='diary')await diary.load();
}
function dueMarkup(p){
  if(!p.dueAt)return '<span class="due">Sem prazo</span>';
  const n=days(p.dueAt); let label='',cls='';
  if(active(p)){if(n<0){label=`${Math.abs(n)} dia${n===-1?'':'s'} em atraso`;cls='overdue';}else if(n===0){label='Vence hoje';cls='today';}else if(n===1)label='Amanhã';else if(n<=7)label=`Em ${n} dias`;}
  return `<span class="due ${cls}">${date(p.dueAt)}${label?`<small>${label}</small>`:''}</span>`;
}
function stats(){
  const open=processes.filter(active),late=open.filter(overdue),waiting=open.filter(p=>p.status==='Aguardando retorno'),finished=processes.filter(p=>!active(p));
  const entries=[['Processos ativos',open.length,'folder','Em acompanhamento','active'],['Precisam de atenção',late.length,'alert',late.length?'Com prazo vencido':'Nenhum prazo vencido','overdue'],['Aguardando retorno',waiting.length,'clock','Acompanhe os próximos passos','waiting'],['Concluídos',finished.length,'check','Cada entrega conta','finished']];
  $('#stats').innerHTML=entries.map(([label,n,ic,caption,filter],i)=>`<button class="stat ${i===1?'alert':''}" data-stat="${filter}" aria-label="${esc(label)}: ${n}. Filtrar"><span class="stat-label">${label}</span><span class="stat-icon">${icon(ic)}</span><span class="stat-number">${String(n).padStart(2,'0')}</span><span class="stat-caption">${caption}</span></button>`).join('');
  const urgent=open.filter(p=>p.dueAt && days(p.dueAt)<=2).length;
  if(urgent){$('#focus-title').innerHTML=`${urgent} processo${urgent>1?'s pedem':' pede'}<br>seu olhar hoje.`;$('#focus-text').textContent='Comece pelos prazos mais próximos. Um próximo passo claro faz toda a diferença.';$('#focus-button').innerHTML='Ver minhas prioridades <span><svg viewBox=0,0,24,24 aria-hidden=true><path d=M5,19L19,5M5,5H19V19 /></svg></span>';}
  else if(open.length){$('#focus-title').innerHTML='Mais clareza.<br>Um passo de cada vez.';$('#focus-text').textContent=`Você tem ${open.length} processo${open.length>1?'s':''} em acompanhamento. Mantenha as próximas providências atualizadas.`;$('#focus-button').innerHTML='Ver minhas providências <span><svg viewBox=0,0,24,24 aria-hidden=true><path d=M5,19L19,5M5,5H19V19 /></svg></span>';}
  else{$('#focus-title').innerHTML='O próximo passo<br>começa aqui.';$('#focus-text').textContent='Reúna seus processos e transforme pendências em próximas ações.';$('#focus-button').innerHTML='Organizar minha mesa <span><svg viewBox=0,0,24,24 aria-hidden=true><path d=M5,19L19,5M5,5H19V19 /></svg></span>';}
}
function radar(){
 const items=processes.filter(p=>active(p)&&p.dueAt).sort((a,b)=>a.dueAt.localeCompare(b.dueAt)).slice(0,3);
 $('#radar-list').innerHTML=items.length?items.map(p=>{const d=new Date(p.dueAt+'T12:00:00Z');return `<button class="radar-item" data-open="${p.id}"><span class="date-box ${overdue(p)?'overdue':''}"><strong>${d.getUTCDate().toString().padStart(2,'0')}</strong><small>${new Intl.DateTimeFormat('pt-BR',{month:'short',timeZone:'UTC'}).format(d).replace('.','')}</small></span><span class="radar-body"><span class="radar-title">${esc(p.nextAction||p.title)}</span><span class="radar-meta">${esc(p.number)}/${p.year}<span>·</span>${overdue(p)?'Prazo vencido':days(p.dueAt)===0?'Vence hoje':`Em ${days(p.dueAt)} dia${days(p.dueAt)===1?'':'s'}`}</span></span><span class="radar-arrow"><svg viewBox=0,0,24,24 aria-hidden=true><path d=M5,19L19,5M5,5H19V19 /></svg></span></button>`;}).join(''):'<div class="radar-empty">Nenhum prazo no radar.<br>Defina uma próxima providência e um prazo ao cadastrar seu processo.</div>';
}
function filtered(){
 const needle=query.toLocaleLowerCase('pt-BR');
 let result=processes.filter(p=>(!status||p.status===status)&&(!priorityFilter||p.priority===priorityFilter)&&(!needle||[p.number,p.year,p.title,p.origin,p.category,p.nextAction,p.owner,p.reason,p.notes].join(' ').toLocaleLowerCase('pt-BR').includes(needle)));
 if(special==='active')result=result.filter(active); if(special==='overdue')result=result.filter(overdue); if(special==='waiting')result=result.filter(p=>p.status==='Aguardando retorno');if(special==='finished')result=result.filter(p=>!active(p));
 if(view==='actions')result=result.filter(active).sort((a,b)=>(a.dueAt||'9999').localeCompare(b.dueAt||'9999')||(['Urgente','Alta','Normal','Baixa'].indexOf(a.priority)-['Urgente','Alta','Normal','Baixa'].indexOf(b.priority)));
 return result;
}
function table(){
 const result=filtered();$('#results-count').textContent=`${result.length} de ${processes.length} processo${processes.length===1?'':'s'}`;
 $('#process-rows').innerHTML=result.map(p=>`<tr data-open="${p.id}"><td><div class="process-number">${icon('folder')}${esc(p.number)}/${p.year}${p.demo?' · Exemplo':''}</div><div class="process-title">${esc(p.title)}</div><div class="process-origin">${esc(p.origin||'Origem não informada')}</div></td><td>${badge(p)}</td><td>${priority(p)}</td><td><span class="action-text">${esc(p.nextAction||'Definir próxima providência')}</span></td><td>${dueMarkup(p)}</td><td><button class="open-arrow" aria-label="Abrir processo ${esc(p.number)}"><svg viewBox=0,0,24,24 aria-hidden=true><path d=M5,19L19,5M5,5H19V19 /></svg></button></td></tr>`).join('');
 $('#empty-state').hidden=!!result.length;
 if(!result.length){const empty=!processes.length;$('#empty-state').innerHTML=`<span>${icon(empty?'folder':'search')}</span><h3>${empty?'Sua mesa merece mais clareza.':'Nenhum processo nesta seleção.'}</h3><p>${empty?'Cadastre seu primeiro processo para acompanhar cada etapa.<br>Ou explore a ferramenta com uma mesa de demonstração.':'Experimente outro termo ou remova os filtros para ver mais processos.'}</p>${empty?'<button class="button primary" data-new>Cadastrar primeiro processo</button><button class="button secondary" id="load-demo">Explorar demonstração</button>':'<button class="button secondary" id="clear-filters">Limpar filtros</button>'}`;}
 $('#list-title').innerHTML=`${view==='actions'?'Providências a acompanhar':special?({active:'Processos ativos',overdue:'Processos com prazo vencido',waiting:'Aguardando retorno',finished:'Processos concluídos'}[special]):'Processos na sua mesa'} <span class="count-pill">${result.length}</span>`;
 $('#list-description').textContent=view==='actions'?'Priorize por prazo. Registre o andamento ao abrir o processo.':'Cada processo com seu contexto e próximo passo.';
}
function activity(){
 const entries=processes.flatMap(p=>p.history.map(h=>({p,h}))).sort((a,b)=>b.h.at.localeCompare(a.h.at)).slice(0,50);
 $('#activity-list').innerHTML=entries.length?entries.map(({p,h})=>`<button class="activity-row" data-open="${p.id}"><time>${timestamp(h.at)}</time><div><strong>${esc(p.number)}/${p.year} · ${esc(p.title)}</strong><p>${esc(h.type)} — ${esc(h.text)}</p></div><span class="radar-arrow"><svg viewBox=0,0,24,24 aria-hidden=true><path d=M5,19L19,5M5,5H19V19 /></svg></span></button>`).join(''):'<div class="empty-state"><h3>Uma história que começa na entrada.</h3><p>Cadastre um processo. As movimentações serão exibidas aqui.</p><button class="button primary" data-new>Novo processo</button></div>';
}
function render(){stats();radar();table();activity();$('#nav-count').textContent=processes.filter(active).length;$('#demo-notice').hidden=view==='diary'||!processes.some(p=>p.demo);}
function setView(next){view=next;special='';status='';query='';priorityFilter='';$('#search').value='';$('#priority-filter').value='';$$('[data-status]').forEach(b=>b.classList.toggle('active',!b.dataset.status));$$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));const titles={diary:['Seu dia também merece registro','Anotações livres, com uma entrada para cada assunto.','Diário de campo'],overview:['Sua mesa, sob controle','Clareza para decidir. Tranquilidade para seguir em frente.','Visão geral'],processes:['Cada processo, no lugar certo','Contexto, histórico e próximos passos em uma única mesa.','Meus processos'],actions:['O próximo passo está aqui','Transforme pendências em ações. Comece pelo que precisa de você.','Providências'],history:['Nada se perde no caminho','Acompanhe as entradas e movimentações dos seus processos.','Atividade recente']};const t=titles[view];$('#page-title').innerHTML=esc(t[0])+'<span>.</span>';$('#page-subtitle').textContent=t[1];$('#breadcrumb').textContent=t[2];$('#overview-section').hidden=view!=='overview';$('#process-section').hidden=['history','diary'].includes(view);$('#activity-section').hidden=view!=='history';$('#stats').hidden=['history','diary'].includes(view);$('#diary-section').hidden=view!=='diary';$('#new-note').hidden=view!=='diary';$('#new-process').hidden=view==='diary';if(view==='diary')diary.load();$('.sidebar').classList.remove('open');render();}
function openForm(p){
 const form=$('#process-form');form.reset();$('#form-error').textContent='';$('#form-title').textContent=p?'Editar processo':'Novo processo';
 const defaults={id:'',year:Number(today().slice(0,4)),receivedAt:today(),status:'A analisar',priority:'Normal',owner:'Minha mesa',...p};
 form.dataset.version=p?.version||'';
 for(const [name,value]of Object.entries(defaults)){const field=form.elements.namedItem(name);if(field)field.value=value;}
 if($('#detail-dialog').open)$('#detail-dialog').close();$('#process-dialog').showModal();
}
function detail(p){
 detailId=p.id;
 $('#detail-content').innerHTML=`<div class="modal-header"><div><div class="detail-heading">${icon('folder')} Processo ${esc(p.number)}/${p.year}${p.demo?' · Demonstração':''}</div><h2 class="detail-title">${esc(p.title)}</h2></div><button class="icon-button" data-close="detail-dialog" aria-label="Fechar">×</button></div><div class="detail-body"><div class="detail-badges">${badge(p)}${priority(p)}</div><div class="detail-summary"><div><label>Entrada na mesa</label><p>${date(p.receivedAt)}</p></div><div><label>Origem</label><p>${esc(p.origin||'Não informada')}</p></div><div><label>Responsável</label><p>${esc(p.owner||'Não definido')}</p></div><div><label>Categoria</label><p>${esc(p.category||'Não definida')}</p></div><div><label>Prazo</label><p>${dueMarkup(p)}</p></div><div><label>Última atualização</label><p>${timestamp(p.updatedAt)}</p></div></div><div class="detail-block"><label>Por que chegou à sua mesa</label><p>${esc(p.reason)}</p></div><div class="detail-block next-action-card"><label>Próxima providência</label><p>${esc(p.nextAction||'Nenhuma providência definida. Edite o processo para registrar o próximo passo.')}</p></div>${p.notes?`<div class="detail-block"><label>Observações</label><p>${esc(p.notes)}</p></div>`:''}<div class="history-heading"><h3>Histórico do processo</h3><span class="count-pill">${p.history.length} registro${p.history.length===1?'':'s'}</span></div><div class="timeline">${[...p.history].reverse().map(h=>`<div class="timeline-item"><strong>${esc(h.type)}${h.actor?.name?' · '+esc(h.actor.name):''}</strong><time>${timestamp(h.at)}</time><p>${esc(h.text)}</p>${h.changes?.length?`<details><summary>Ver alterações</summary>${h.changes.map(c=>`<p><b>${esc(fields[c.field]||c.field)}:</b> ${esc(c.before||'Não informado')} → ${esc(c.after||'Não informado')}</p>`).join('')}</details>`:''}</div>`).join('')}</div><form class="history-form" id="history-form"><label for="history-text">Registrar novo andamento</label><textarea id="history-text" name="text" required maxlength="10000" placeholder="O que aconteceu? Qual foi o encaminhamento?"></textarea><p class="form-error" id="history-error" role="alert"></p><button class="button primary" type="submit">${icon('plus')} Registrar andamento</button></form></div><div class="modal-footer detail-footer"><button class="danger-text" id="delete-process">Excluir processo</button><div>${active(p)?'<button class="button secondary" id="complete-process">'+icon('check')+' Concluir</button>':''}<button class="button primary" id="edit-process">Editar processo</button></div></div>`;
 if(!$('#detail-dialog').open)$('#detail-dialog').showModal();
}
async function openDetail(id){try{detail(await api('/processes/'+id));}catch(e){toast(e.message,true);}}
function confirmAction(title,text,callback,label='Excluir'){$('#confirm-ok').textContent=label;$('#confirm-title').textContent=title;$('#confirm-text').textContent=text;$('#confirm-dialog').showModal();$('#confirm-ok').onclick=async()=>{$('#confirm-ok').disabled=true;try{await callback();$('#confirm-dialog').close();}catch(e){toast(e.message,true);}finally{$('#confirm-ok').disabled=false;}};}
function info(title,html){$('#info-title').textContent=title;$('#info-content').innerHTML=html;$('#info-dialog').showModal();}
document.addEventListener('click',async event=>{
 const close=event.target.closest('[data-close]');if(close){$('#'+close.dataset.close).close();return;}
 const nav=event.target.closest('[data-view]');if(nav){setView(nav.dataset.view);return;}
 const open=event.target.closest('[data-open]');if(open){openDetail(open.dataset.open);return;}
 if(event.target.closest('[data-new]')){openForm();return;}
 const tab=event.target.closest('[data-status]');if(tab){status=tab.dataset.status;special='';$$('[data-status]').forEach(b=>b.classList.toggle('active',b===tab));table();return;}
 const stat=event.target.closest('[data-stat]');if(stat){setView('processes');special=stat.dataset.stat;table();$('#process-section').scrollIntoView({behavior:'smooth',block:'start'});return;}
 if(event.target.closest('#clear-filters')){setView(view);return;}
 if(event.target.closest('#load-demo')){const b=$('#load-demo');b.disabled=true;try{await api('/demo',{method:'POST',body:'{}'});await refresh();toast('Demonstração carregada. Todos os exemplos são fictícios.');}catch(e){toast(e.message,true);b.disabled=false;}return;}
 if(event.target.closest('#edit-process')){openForm(processes.find(p=>p.id===detailId));return;}
 if(event.target.closest('#delete-process')){const id=detailId;confirmAction('Excluir este processo?','O processo e todo o histórico serão removidos permanentemente. Exporte uma cópia antes de continuar, se necessário.',async()=>{await api('/processes/'+id,{method:'DELETE'});$('#detail-dialog').close();await refresh();toast('Processo excluído.');});return;}
 if(event.target.closest('#complete-process')){const b=$('#complete-process');b.disabled=true;try{const p=await api('/processes/'+detailId);const saved=await api('/processes/'+detailId,{method:'PUT',body:JSON.stringify({...p,status:'Concluído'})});await refresh();detail(saved);toast('Processo concluído. O histórico foi preservado.');}catch(e){b.disabled=false;toast(e.message,true);}return;}
});
$('#process-form').addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;$('#form-error').textContent='';const data=Object.fromEntries(new FormData(event.currentTarget));const id=data.id;delete data.id;if(id)data.version=event.currentTarget.dataset.version;try{const p=await api('/processes'+(id?'/'+id:''),{method:id?'PUT':'POST',body:JSON.stringify(data)});await refresh();$('#process-dialog').close();detail(p);toast(id?'Processo atualizado.':'Processo cadastrado. Sua mesa ganhou mais clareza.');}catch(e){$('#form-error').textContent=e.message;}finally{button.disabled=false;}});
document.addEventListener('submit',async event=>{if(event.target.id!=='history-form')return;event.preventDefault();const button=event.submitter;button.disabled=true;try{const p=await api('/processes/'+detailId+'/history',{method:'POST',body:JSON.stringify({text:new FormData(event.target).get('text')})});await refresh();detail(p);toast('Andamento registrado no histórico.');}catch(e){const target=$('#history-error');if(target)target.textContent=e.message;else toast(e.message,true);button.disabled=false;}});
$('#new-process').onclick=()=>openForm();
$('#search').oninput=e=>{query=e.target.value;table();};
$('#priority-filter').onchange=e=>{priorityFilter=e.target.value;table();};
$('#see-actions').onclick=()=>setView('actions');
$('#focus-button').onclick=()=>{if(!processes.some(active))openForm();else{setView('actions');$('#process-section').scrollIntoView({behavior:'smooth'});}};
$('#remove-demo').onclick=()=>confirmAction('Remover dados de demonstração?','Somente os registros identificados como exemplo serão removidos, incluindo alterações feitas nesses exemplos. Os processos que você cadastrou serão preservados.',async()=>{await api('/demo',{method:'DELETE'});await refresh();toast('Exemplos removidos. Sua mesa está pronta para os seus processos.');});
$('#confirm-cancel').onclick=()=>$('#confirm-dialog').close();
$('#menu-toggle').onclick=()=>$('.sidebar').classList.toggle('open');
document.addEventListener('click',e=>{if(!e.target.closest('.sidebar')&&!e.target.closest('#menu-toggle'))$('.sidebar').classList.remove('open');});
$('#integrations').onclick=()=>info('Um universo. Mais possibilidades.',`<span class="integration-status">Visão de produto · Integrações futuras</span><h3>AtlasNex Fluxo</h3><p>O ponto de partida para organizar processos, preservar contexto e dar clareza a cada providência.</p><h3>FiscalBot + Fluxo</h3><p>A integração planejada permitirá vincular análises do FiscalBot aos processos e sugerir providências para revisão humana. Esta versão ainda não se conecta ao FiscalBot.</p><h3>Feito para evoluir</h3><p>Equipes, permissões, múltiplas organizações e integrações por API fazem parte da evolução comercial. Hoje, você tem uma edição local funcional para validar o seu fluxo de trabalho.</p>`);
$('#about').onclick=()=>accounts.profile();
document.addEventListener('click',async event=>{if(!event.target.closest('#logout'))return;try{await api('/logout',{method:'POST',body:'{}'});showLogin();}catch(e){toast(e.message,true);}});
$('#export').onclick=()=>{
 const rows=filtered();if(!rows.length)return toast('Não há processos nesta seleção para exportar.');
 const keys=['number','year','title','status','priority','receivedAt','origin','reason','owner','category','nextAction','dueAt','notes'];
 const cell=value=>{let s=String(value??'');if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 const csv='\uFEFF'+[keys.map(k=>cell(fields[k])).join(';'),...rows.map(p=>keys.map(k=>cell(p[k])).join(';'))].join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));const link=document.createElement('a');link.href=url;link.download=`atlasnex-fluxo-${today()}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`${rows.length} processo${rows.length===1?'':'s'} exportado${rows.length===1?'':'s'}.`);
};
$('#date-label').textContent=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'numeric',month:'long',timeZone:'America/Sao_Paulo'}).format(new Date()).toLocaleUpperCase('pt-BR');
icons();
try{const status=await api('/auth/status');if(status.user&&!location.hash.startsWith('#convite='))await loadWorkspace();else showLogin();}catch(e){$('#empty-state').hidden=false;$('#empty-state').innerHTML='<h3>Não foi possível carregar sua mesa.</h3><p>Verifique se o servidor está em execução e recarregue a página.</p>';toast(e.message,true);}
