export function createDaily({api,toast,esc,date,timestamp,today,icon,openProcess,newNote}){
 const $=s=>document.querySelector(s);let report=null,generation=0,loading=false;
 $('#daily-date').value=today();
 const labels={entries:'Entradas no dia',movements:'Movimentações',completions:'Conclusões registradas',due:'Prazos na data',overdue:'Pendências anteriores',notes:'Anotações do dia'};
 function processRows(items,empty){return items.length?items.map(p=>`<button class="daily-row" data-daily-process="${p.id}"><span><strong>${esc(p.number)}/${p.year} · ${esc(p.title)}</strong><span>${esc(p.nextAction||'Próxima providência não definida')}</span><small>${esc(p.status)} · ${esc(p.priority)}${p.dueAt?' · Prazo: '+date(p.dueAt):''}</small></span>${icon('arrow')}</button>`).join(''):`<p class="daily-empty">${empty}</p>`;}
 function render(){
  $('#daily-pdf').disabled=loading||!report;
  if(loading){$('#daily-content').innerHTML='<div class="empty-state"><p>Preparando o controle diário...</p></div>';return;}
  if(!report){$('#daily-content').innerHTML='';return;}
  const r=report;
  $('#daily-content').innerHTML=`<div class="daily-summary">${Object.entries(labels).map(([key,label])=>`<div class="daily-stat"><span>${label}</span><strong>${String(r.summary[key]).padStart(2,'0')}</strong></div>`).join('')}</div><div class="daily-grid"><section class="daily-panel"><h2>Entradas informadas em ${date(r.day)} <span class="count-pill">${r.entries.length}</span></h2>${processRows(r.entries,'Nenhuma entrada informada nesta data.')}</section><section class="daily-panel"><h2>Providências com prazo na data <span class="count-pill">${r.due.length}</span></h2>${processRows(r.due,'Nenhum processo com prazo nesta data.')}</section><section class="daily-panel daily-wide"><h2>Movimentações registradas no dia <span class="count-pill">${r.movements.length}</span></h2>${r.movements.length?r.movements.map(h=>`<button class="daily-row" data-daily-process="${h.processId}"><span><strong>${esc(h.number)}/${h.year} · ${esc(h.title)}</strong><span class="daily-note-text">${esc(h.text)}</span><small>${timestamp(h.at)} · ${esc(h.type)}${h.actor?.name?' · '+esc(h.actor.name):''}</small></span>${icon('arrow')}</button>`).join(''):'<p class="daily-empty">Nenhuma movimentação registrada nesta data.</p>'}</section><section class="daily-panel daily-wide"><h2>Pendências atuais vencidas antes da data <span class="count-pill">${r.overdue.length}</span></h2>${processRows(r.overdue,'Nenhuma pendência atual vencida antes desta data.')}</section><section class="daily-panel daily-wide"><h2>Diário de campo <span class="count-pill">${r.notes.length}</span></h2>${r.notes.length?r.notes.map(note=>`<article class="daily-note"><h3>${esc(note.title)}</h3><p>${esc(note.content)}</p><small>Última gravação: ${timestamp(note.updatedAt)}</small></article>`).join(''):'<p class="daily-empty">Nenhuma anotação nesta data. Use “Anotar neste dia” para registrar seu balanço, observações ou assuntos do dia.</p>'}</section></div><p class="daily-updated">Consulta de ${timestamp(r.generatedAt)} · Somente dados da sua conta</p>`;
 }
 async function load(){
  const day=$('#daily-date').value;const ticket=++generation;report=null;loading=true;render();
  if(!day){loading=false;render();toast('Selecione a data do controle.',true);return;}
  try{const result=await api('/daily?date='+encodeURIComponent(day));if(ticket!==generation)return;report=result;loading=false;render();}
  catch(e){if(ticket!==generation)return;loading=false;render();$('#daily-content').innerHTML='<div class="empty-state"><h3>Não foi possível carregar o controle diário.</h3><button class="button secondary" data-daily-retry>Tentar novamente</button></div>';toast(e.message,true);}
 }
 function shift(step){const value=$('#daily-date').value||today();const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+step);$('#daily-date').value=d.toISOString().slice(0,10);load();}
 $('#daily-date').onchange=load;$('#daily-previous').onclick=()=>shift(-1);$('#daily-next').onclick=()=>shift(1);$('#daily-today').onclick=()=>{$('#daily-date').value=today();load();};
 $('#daily-add-note').onclick=()=>{const day=$('#daily-date').value;if(day)newNote(day);else toast('Selecione a data antes de anotar.',true);};
 $('#daily-pdf').onclick=async()=>{
  const day=$('#daily-date').value,ticket=generation;const button=$('#daily-pdf');button.disabled=true;
  try{const blob=await api('/daily.pdf?date='+encodeURIComponent(day),{responseType:'blob'});if(ticket!==generation)return;const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`atlasnex-fluxo-diario-${day}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Relatório PDF gerado para '+date(day)+'.');}
  catch(e){toast(e.message,true);}finally{button.disabled=loading||!report;}
 };
 document.addEventListener('click',e=>{const row=e.target.closest('[data-daily-process]');if(row)openProcess(row.dataset.dailyProcess);if(e.target.closest('[data-daily-retry]'))load();});
 document.addEventListener('notes-changed',()=>{if(!$('#daily-section').hidden)load();});
 return {load,clear:()=>{generation++;report=null;loading=false;render();}};
}
