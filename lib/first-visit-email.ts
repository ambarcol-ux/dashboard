import type {SupabaseClient} from '@supabase/supabase-js';
import {visitManagementLink,visitVideoLink} from './first-visit-links';
import {visitDate as plainDate,visitSite,visitTime,loadVisitSites,type VisitSite} from './first-visit-sites';
export {visitTime} from './first-visit-sites';

export type VisitEmailEvent='reserva'|'reprogramacion'|'cancelacion'|'confirmacion'|'enlace_virtual';
type Slot={fecha:string;hora:string;modalidad:string;sede:string|null};
export type VisitEmailDetail=Slot&{motivo?:string;enlace_virtual?:string;codigo?:string;anterior?:Slot|null};

const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const longDate=(day:string)=>new Date(day+'T12:00:00Z').toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const slotText=(s:Slot)=>`${longDate(s.fecha)} · ${s.hora.slice(0,5)} a ${String(Number(s.hora.slice(0,2))+1).padStart(2,'0')}:00 (hora de Colombia) · ${s.modalidad==='virtual'?'Virtual':`Presencial en ${s.sede||'la sede'}`}`;

const headings:Record<VisitEmailEvent,[string,string]>={
 reserva:['Tu primera cita quedó reservada','Reservamos tu primera cita con Ámbar Couture.'],
 reprogramacion:['Tu primera cita cambió','Actualizamos la fecha u hora de tu primera cita.'],
 cancelacion:['Tu primera cita fue cancelada','Tu primera cita con Ámbar Couture quedó cancelada.'],
 confirmacion:['Tu primera cita está confirmada','Gracias por confirmar tu asistencia.'],
 enlace_virtual:['Enlace para tu cita virtual','Ya está disponible el enlace de tu cita virtual.'],
};

type Block={icon:string;label:string;value?:string;href?:string;note?:string};

/** Booking, confirmation and reschedule email with the store's address, map, phone, WhatsApp and the reschedule page. */
export function appointmentEmail(event:'reserva'|'confirmacion'|'reprogramacion',detail:VisitEmailDetail,name:string,rescheduleUrl:string,sites?:VisitSite[]){
 const virtual=detail.modalidad==='virtual',site=visitSite(detail.sede,sites),siteName=site?.nombre||detail.sede||'';
 const where=virtual?'virtual con Ámbar Couture':`presencial en Ámbar Couture${siteName?' '+siteName:''}`;
 const moved=event==='reprogramacion';
 const intro=moved?`Tu cita ${where} fue reprogramada. ✨`:`Tu cita ${where} está confirmada. ✨`;
 const blocks:Block[]=[{icon:'📅',label:'Fecha',value:plainDate(detail.fecha)},{icon:'🕒',label:'Hora',value:visitTime(detail.hora)}];
 if(moved&&detail.anterior)blocks.push({icon:'↩️',label:'Antes',value:`${plainDate(detail.anterior.fecha)}, ${visitTime(detail.anterior.hora)}`});
 if(virtual)blocks.push(detail.enlace_virtual?{icon:'💻',label:'Enlace de la videollamada',href:detail.enlace_virtual}:{icon:'📱',label:'Videollamada de WhatsApp',note:'A la hora de tu cita, la asesora te llama por videollamada de WhatsApp a tu número.'});
 else if(site)blocks.push({icon:'📍',label:'Dirección',value:site.direccion},{icon:'🗺️',label:site.mapaEtiqueta,href:site.mapa},...(site.parqueadero?[{icon:'🚗',label:'Parqueadero',value:site.parqueadero.replace(/^🚗\s*/,'')}]:[]));
 else if(siteName)blocks.push({icon:'📍',label:'Sede',value:siteName});
 if(site)blocks.push({icon:'📲',label:'¿Tienes alguna pregunta?',note:`Contacta a nuestra sede ${site.nombre}: ${site.telefono}`},{icon:'',label:'Escribir por WhatsApp',href:`https://wa.me/${site.whatsapp}`});
 if(detail.codigo)blocks.push({icon:'🔑',label:'Código de tu cita',value:virtual?detail.codigo:`${detail.codigo} (escríbelo en el QR de la entrada al llegar)`});
 blocks.push({icon:'🔄',label:'¿Necesitas cambiar la fecha o la hora de tu cita?',note:'Puedes reprogramarla fácilmente aquí:',href:rescheduleUrl});
 const closing='¡Te esperamos para ayudarte a encontrar el vestido ideal! 👗✨';
 const head=(b:Block)=>`${b.icon?b.icon+' ':''}${b.label}${b.label.endsWith('?')?'':':'}`;
 const text=[`Hola, ${name} 👋`,intro,...blocks.map(b=>b.value?`${head(b)} ${b.value}`:[head(b),b.note,b.href].filter(Boolean).join('\n')),closing].join('\n\n');
 const p='font-size:15px;line-height:1.6;margin:0 0 14px',a='color:#b45309;word-break:break-all';
 const row=(b:Block)=>b.value?`<p style="${p}">${escape(b.icon)} <strong>${escape(b.label)}:</strong> ${escape(b.value)}</p>`:`<p style="${p}">${b.icon?escape(b.icon)+' ':''}<strong>${escape(b.label)}${(b.note||b.href)&&!b.label.endsWith('?')?':':''}</strong>${b.note?'<br>'+escape(b.note):''}${b.href?`<br><a href="${escape(b.href)}" style="${a}">${escape(b.href)}</a>`:''}</p>`;
 const html=`<div style="background:#faf8f5;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#18181b"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #f4e4ea;border-radius:16px;padding:32px"><p style="margin:0 0 8px;font-size:11px;letter-spacing:.2em;color:#b45309;font-weight:bold">ÁMBAR COUTURE</p><p style="${p}">Hola, ${escape(name)} 👋</p><p style="${p}">Tu cita <strong>${escape(where)}</strong> ${moved?'fue reprogramada':'está confirmada'}. ✨</p>${blocks.map(row).join('')}<p style="${p};margin-top:22px">${escape(closing)}</p></div></div>`;
 const subject=`${moved?'Tu cita fue reprogramada':'Tu cita está confirmada'} · ${virtual?'Virtual':siteName||'Ámbar Couture'} · ${plainDate(detail.fecha)}, ${visitTime(detail.hora)}`;
 return {subject,text,html};
}

/** Customer email for one agenda change. `link` is the private management link, or the public booking page after a cancellation. */
export function visitChangeEmail(event:VisitEmailEvent,detail:VisitEmailDetail,name:string,link:string){
 const [title,intro]=headings[event];
 const lines=[`Hola, ${name}.`,intro];
 if(event==='reprogramacion'&&detail.anterior)lines.push(`Antes: ${slotText(detail.anterior)}`,`Ahora: ${slotText(detail)}`);
 else lines.push(`${event==='cancelacion'?'Cita cancelada':'Tu cita'}: ${slotText(detail)}`);
 if(event==='cancelacion'&&detail.motivo)lines.push(`Motivo: ${detail.motivo}`);
 if(detail.modalidad==='virtual'&&detail.enlace_virtual&&event!=='cancelacion')lines.push(`Entra a tu cita virtual aquí: ${detail.enlace_virtual}`);
 const action=event==='cancelacion'?'Reservar una nueva cita':'Confirmar, cambiar o cancelar mi cita';
 const text=[...lines,`${action}: ${link}`,'Si no solicitaste este cambio, responde a este correo o contacta a tu sede.','Ámbar Couture'].join('\n\n');
 const html=`<div style="background:#faf8f5;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#18181b"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #f4e4ea;border-radius:16px;padding:32px"><p style="margin:0 0 8px;font-size:11px;letter-spacing:.2em;color:#b45309;font-weight:bold">ÁMBAR COUTURE</p><h1 style="margin:0 0 20px;font-family:Georgia,serif;font-weight:normal;font-size:24px">${escape(title)}</h1>${lines.map(l=>`<p style="font-size:15px;line-height:1.6;margin:0 0 12px">${escape(l)}</p>`).join('')}<p style="margin:24px 0"><a href="${escape(link)}" style="display:inline-block;background:#18181b;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">${escape(action)}</a></p><p style="font-size:12px;color:#71717a;line-height:1.5">Si no solicitaste este cambio, responde a este correo o contacta a tu sede.</p></div></div>`;
 return {subject:`${title} · Ámbar Couture`,text,html};
}

export type ClaimedVisitEmail={id:string;para:string;asunto:string;texto:string;html:string};
type Job={omitido?:boolean;correo:{id:string;evento:VisitEmailEvent;detalle:VisitEmailDetail};cita:{id:string;fecha:string;cliente_nombre:string;email:string;codigo?:string|null;modalidad?:string}};

/** Claims queued change emails and renders them for the Apps Script sender. */
export async function claimVisitEmails(db:SupabaseClient,origin:string,linkSecret:string,limit=10){
 const emails:ClaimedVisitEmail[]=[];
 // Store phone, WhatsApp, address and map from Configuración › Sedes (built-in values when missing).
 const sites=await loadVisitSites(db);
 for(let i=0;i<limit;i++){
  const {data,error}=await db.rpc('tomar_correo_primera_cita',{p_cita:null});
  if(error)throw Error('No se pudo consultar la cola de correos.');
  if(!data)break;
  const job=data as Job;if(job.omitido)continue;
  const {correo,cita}=job;
  // The meeting link goes through the ERP so opening it registers attendance; the code is for the store QR.
  if(correo.detalle.enlace_virtual)correo.detalle={...correo.detalle,enlace_virtual:visitVideoLink(origin,cita.id,Date.parse(correo.detalle.fecha+'T23:59:59-05:00')+86400000,linkSecret)};
  if(cita.codigo)correo.detalle={...correo.detalle,codigo:cita.codigo};
  const link=correo.evento==='cancelacion'?`${origin}/agendar-primera-cita`:visitManagementLink(origin,cita.id,Date.parse(cita.fecha+'T23:59:59-05:00')+30*86400000,linkSecret);
  const message=correo.evento==='reserva'||correo.evento==='confirmacion'||correo.evento==='reprogramacion'
   ?appointmentEmail(correo.evento,correo.detalle,cita.cliente_nombre,`${origin}/reprogramar-primera-cita`,sites)
   :visitChangeEmail(correo.evento,correo.detalle,cita.cliente_nombre,link);
  emails.push({id:correo.id,para:cita.email,asunto:message.subject,texto:message.text,html:message.html});
 }
 return emails;
}

/** Sends claimed emails and records each result; a failure is retried by the queue later. */
export async function deliverVisitEmails(db:SupabaseClient,emails:ClaimedVisitEmail[],send:(email:ClaimedVisitEmail)=>Promise<{ok:boolean;error?:string}>){
 let sent=0,failed=0;
 for(const email of emails){
  let result:{ok:boolean;error?:string};
  try{result=await send(email);}catch{result={ok:false,error:'El proveedor de correo no respondió.'};}
  const {error}=await db.from('primeras_citas_correos').update({estado:result.ok?'enviado':'error',error:result.ok?null:String(result.error||'No se pudo enviar el correo.').slice(0,300),updated_at:new Date().toISOString()}).eq('id',email.id).eq('estado','enviando');
  if(error)throw Error('No se pudo registrar el resultado del correo.');
  if(result.ok)sent++;else failed++;
 }
 return {sent,failed};
}
