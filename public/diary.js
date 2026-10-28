export function createDiary({api,toast,confirmAction,esc,date,timestamp,today,icon}) {
  const $=s=>document.querySelector(s);
  const form=$('#note-form'),dialog=$('#note-dialog');
  let notes=[],selected=null,baseline='',generation=0,loading=false;
  const snapshot=()=>JSON.stringify(Object.fromEntries(new FormData(form)));
  const dirty=()=>dialog.open && snapshot()!==baseline;
  const characters=()=>$('#note-characters').textContent=`${form.elements.content.value.length.toLocaleString('pt-BR')} / 20.000`;
  function render(){
    const query=$('#note-search').value.trim().toLocaleLowerCase('pt-BR');
    const day=$('#note-date-filter').value;
    const filtered=notes.filter(n=>(!day||n.entryDate===day)&&(!query||`${n.title} ${n.content}`.toLocaleLowerCase('pt-BR').includes(query)));
    $('#notes-count').textContent=`${filtered.length} de ${notes.length} anotaç${notes.length===1?'ão':'ões'}`;
    $('#clear-note-filters').hidden=!query&&!day;
    if(loading){$('#notes-list').innerHTML='<div class="empty-state"><p>Carregando seu diário...</p></div>';return;}
    if(!filtered.length){$('#notes-list').innerHTML=`<div class="empty-state diary-empty"><span>${icon('notebook')}</span><h3>${notes.length?'Nenhuma anotação nesta seleção.':'Um novo assunto. Uma nova entrada.'}</h3><p>${notes.length?'Busque outra palavra ou limpe os filtros.':'Ideias, reuniões, visitas e lembretes do dia a dia.<br>Comece seu diário com a primeira anotação.'}</p>${notes.length?'':'<button class="button primary" data-new-note>Escrever primeira anotação</button>'}</div>`;return;}
    const groups=Map.groupBy(filtered,n=>n.entryDate);
    $('#notes-list').innerHTML=[...groups].map(([day,entries])=>`<section class="diary-day"><div class="diary-day-heading"><span>${day===today()?'Hoje':date(day)}</span><span class="diary-day-line"></span><span>${entries.length} entrada${entries.length===1?'':'s'}</span></div><div class="note-grid">${entries.map(n=>`<button type="button" class="note-card" data-note-id="${n.id}"><span class="note-card-top"><span>${icon('notebook')} ANOTAÇÃO</span><span>${timestamp(n.createdAt).split(', ').at(-1).split(' ').at(-1)}</span></span><h3>${esc(n.title)}</h3><p>${esc(n.content)}</p><span class="note-card-footer"><span>${n.updatedAt!==n.createdAt?'Editada '+timestamp(n.updatedAt):'Registrada '+date(n.entryDate)}</span><span>Ler e editar ${icon('arrow')}</span></span></button>`).join('')}</div></section>`).join('');
  }
  async function load(){
    const ticket=++generation;loading=true;render();
    try{const result=await api('/notes');if(ticket!==generation)return;notes=result;loading=false;render();}
    catch(e){if(ticket!==generation)return;loading=false;$('#notes-list').innerHTML='<div class="empty-state"><h3>Não foi possível carregar o diário.</h3><p>Suas anotações não foram alteradas.</p><button class="button secondary" data-retry-notes>Tentar novamente</button></div>';toast(e.message,true);}
  }
  function open(note){
    selected=note||null;form.reset();$('#note-form-error').textContent='';
    form.elements.title.value=note?.title||'';form.elements.entryDate.value=note?.entryDate||today();form.elements.content.value=note?.content||'';
    $('#note-form-title').textContent=note?'Sua anotação':'Nova anotação';$('#delete-note').hidden=!note;
    $('#note-save-info').textContent=note?'Última gravação: '+timestamp(note.updatedAt):'Ainda não salva';
    characters();baseline=snapshot();dialog.showModal();
  }
  function close(){if(dirty())confirmAction('Descartar alterações?','O texto que você ainda não salvou será descartado.',()=>dialog.close(),'Descartar');else dialog.close();}
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  document.addEventListener('click',async e=>{
    if(e.target.closest('[data-new-note]'))open();
    if(e.target.closest('[data-note-close]'))close();
    if(e.target.closest('[data-retry-notes]'))load();
    const card=e.target.closest('[data-note-id]');if(card){try{const note=await api('/notes/'+card.dataset.noteId);open(note);}catch(error){toast(error.message,true);}}
  });
  form.addEventListener('input',()=>{characters();$('#note-save-info').textContent=snapshot()!==baseline?'Alterações ainda não salvas':selected?'Última gravação: '+timestamp(selected.updatedAt):'Ainda não salva';});
  form.addEventListener('submit',async e=>{
    e.preventDefault();const button=e.submitter;button.disabled=true;$('#note-form-error').textContent='';
    const payload={...Object.fromEntries(new FormData(form)),...(selected?{version:selected.version}:{})};
    try{await api('/notes'+(selected?'/'+selected.id:''),{method:selected?'PUT':'POST',body:JSON.stringify(payload)});baseline=snapshot();dialog.close();toast('Anotação salva no diário.');await load();}
    catch(error){$('#note-form-error').textContent=error.message;}finally{button.disabled=false;}
  });
  $('#delete-note').onclick=()=>{const note=selected;confirmAction('Excluir esta anotação?','Esta entrada será removida permanentemente. As outras anotações e os processos serão preservados.',async()=>{await api('/notes/'+note.id,{method:'DELETE',body:JSON.stringify({version:note.version})});dialog.close();toast('Anotação excluída.');await load();});};
  $('#note-search').addEventListener('input',render);$('#note-date-filter').addEventListener('change',render);
  $('#clear-note-filters').onclick=()=>{$('#note-search').value='';$('#note-date-filter').value='';render();};
  window.addEventListener('beforeunload',e=>{if(dirty()){e.preventDefault();e.returnValue='';}});
  return {load,newEntry:()=>open(),clear:()=>{generation++;notes=[];selected=null;loading=false;form.reset();baseline=snapshot();$('#note-search').value='';$('#note-date-filter').value='';render();}};
}
