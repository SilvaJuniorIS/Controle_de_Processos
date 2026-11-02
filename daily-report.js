import PDFDocument from 'pdfkit';
import {fileURLToPath} from 'node:url';
const zone='America/Sao_Paulo';
const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
export const eventDay=at=>{const d=new Date(at);return Number.isNaN(d.getTime())?'':dayFormatter.format(d);};
export function validDay(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export function buildDailyReport(processes,notes,day,user,generatedAt=new Date().toISOString()){
 if(!validDay(day))throw new Error('Informe uma data válida para o controle diário.');
 const movements=processes.flatMap(p=>(p.history||[]).filter(h=>h.type!=='Entrada'&&eventDay(h.at)===day).map(h=>({processId:p.id,number:p.number,year:p.year,title:p.title,...h}))).sort((a,b)=>a.at.localeCompare(b.at));
 const completions=movements.filter(h=>h.changes?.some(c=>c.field==='status'&&c.after==='Concluído'));
 const entries=processes.filter(p=>p.receivedAt===day).sort((a,b)=>a.number.localeCompare(b.number,'pt-BR'));
 const due=processes.filter(p=>p.dueAt===day);
 const overdue=processes.filter(p=>p.status!=='Concluído'&&p.dueAt&&p.dueAt<day&&p.receivedAt<=day).sort((a,b)=>a.dueAt.localeCompare(b.dueAt));
 const diary=notes.filter(n=>n.entryDate===day);
 return {day,generatedAt,timeZone:zone,user:{name:user.name,email:user.email},summary:{entries:entries.length,movements:movements.length,completions:completions.length,due:due.length,overdue:overdue.length,notes:diary.length},entries,movements,completions,due,overdue,notes:diary};
}
export async function dailyPdf(report){
 const regular=fileURLToPath(new URL('./assets/fonts/DejaVuSans.ttf',import.meta.url));const bold=fileURLToPath(new URL('./assets/fonts/DejaVuSans-Bold.ttf',import.meta.url));
 const doc=new PDFDocument({font:regular,size:'A4',margin:48,bufferPages:true,info:{Title:'AtlasNex Fluxo — Relatório diário',Author:report.user.name,Subject:'Controle diário de '+report.day}});
 const chunks=[];const result=new Promise((resolve,reject)=>{doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 doc.registerFont('Body',regular);doc.registerFont('Bold',bold);doc.font('Body');
 const formatDay=value=>value?value.split('-').reverse().join('/'):'Sem prazo';
 const formatTime=value=>new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:zone}).format(new Date(value));
 const room=height=>{if(doc.y+height>doc.page.height-70)doc.addPage();};
 function section(title){room(85);doc.moveDown(0.8).font('Bold').fontSize(13).fillColor('#174c3f').text(title).moveDown(.5);}
 function text(value,size=10,color='#405548'){doc.font('Body').fontSize(size).fillColor(color).text(String(value||'Não informado'),{lineGap:4});}
 function item(title,body){room(80);doc.font('Bold').fontSize(10).fillColor('#243b35').text(title,{lineGap:3});text(body);doc.moveDown(.7);}
 doc.font('Bold').fontSize(11).fillColor('#174c3f').text('ATLASNEX FLUXO');
 doc.moveDown().fontSize(23).text('Relatório diário');doc.fontSize(14).text(formatDay(report.day));doc.moveDown();
 text('Conta: '+report.user.name+' · '+report.user.email);
 text('Emitido em '+formatTime(report.generatedAt)+' · horário de São Paulo',9);
 doc.moveDown();text('Resumo elaborado com os registros disponíveis no momento da emissão. Situações, prazos e providências refletem os dados atuais; não é uma fotografia histórica ou uma trilha de auditoria. Registros excluídos não são recuperados neste relatório.',9,'#77816d');
 section('Resumo do dia');
 const labels={entries:'Entradas informadas',movements:'Movimentações registradas',completions:'Conclusões registradas',due:'Processos com prazo na data',overdue:'Pendências atuais vencidas antes da data',notes:'Entradas do diário'};
 for(const [key,label]of Object.entries(labels))text(`${label}: ${report.summary[key]}`);
 section('1. Entradas informadas na data');
 if(!report.entries.length)text('Nenhuma entrada informada nesta data.');
 for(const p of report.entries)item(`${p.number}/${p.year} — ${p.title}`,`Origem: ${p.origin||'Não informada'}\nMotivo: ${p.reason}\nSituação atual: ${p.status}\nPróxima providência: ${p.nextAction||'Não definida'}`);
 section('2. Movimentações registradas na data');
 if(!report.movements.length)text('Nenhuma movimentação registrada nesta data.');
 for(const h of report.movements){let details=`${h.type} · ${formatTime(h.at)}${h.actor?.name?' · '+h.actor.name:''}\n${h.text}`;if(h.changes?.length)details+='\n'+h.changes.map(c=>`${fieldLabels[c.field]||c.field}: ${c.before||'Não informado'} → ${c.after||'Não informado'}`).join('\n');item(`${h.number}/${h.year} — ${h.title}`,details);}
 section('3. Providências com prazo na data');
 if(!report.due.length)text('Nenhum processo com prazo nesta data.');
 for(const p of report.due)item(`${p.number}/${p.year} — ${p.title}`,`Situação atual: ${p.status} · Prioridade: ${p.priority}\nProvidência: ${p.nextAction||'Não definida'}`);
 section('4. Pendências atuais vencidas antes da data');
 if(!report.overdue.length)text('Nenhuma pendência atual vencida antes desta data.');
 for(const p of report.overdue)item(`${p.number}/${p.year} — ${p.title}`,`Prazo: ${formatDay(p.dueAt)} · Situação atual: ${p.status}\nProvidência: ${p.nextAction||'Não definida'}`);
 section('5. Diário de campo da data');
 if(!report.notes.length)text('Nenhuma anotação para esta data.');
 for(const note of report.notes)item(note.title,`${note.content}\n\nÚltima gravação: ${formatTime(note.updatedAt)}`);
 const range=doc.bufferedPageRange();
 for(let page=range.start;page<range.start+range.count;page++){
  doc.switchToPage(page);doc.save();const bottom=doc.page.margins.bottom;doc.page.margins.bottom=0;
  doc.font('Body').fontSize(8).fillColor('#859079').text(`AtlasNex Fluxo · ${formatDay(report.day)} · Página ${page+1} de ${range.count}`,48,doc.page.height-35,{width:doc.page.width-96,align:'center',lineBreak:false});doc.page.margins.bottom=bottom;doc.restore();
 }
 doc.end();return result;
}
const fieldLabels={number:'Número',year:'Ano',title:'Objeto',origin:'Origem',reason:'Motivo da entrada',owner:'Responsável',category:'Categoria',notes:'Observações',nextAction:'Próxima providência',status:'Situação',priority:'Prioridade',receivedAt:'Data de entrada',dueAt:'Prazo'};
