import type {SupabaseClient} from '@supabase/supabase-js';
import {visitManagementLink} from './first-visit-links';

export type VisitEmailEvent='reserva'|'reprogramacion'|'cancelacion'|'confirmacion'|'enlace_virtual';
type Slot={fecha:string;hora:string;modalidad:string;sede:string|null};
export type VisitEmailDetail=Slot&{motivo?:string;enlace_virtual?:string;anterior?:Slot|null};

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
type Job={omitido?:boolean;correo:{id:string;evento:VisitEmailEvent;detalle:VisitEmailDetail};cita:{id:string;fecha:string;cliente_nombre:string;email:string}};

/** Claims queued change emails and renders them for the Apps Script sender. */
export async function claimVisitEmails(db:SupabaseClient,origin:string,linkSecret:string,limit=10){
 const emails:ClaimedVisitEmail[]=[];
 for(let i=0;i<limit;i++){
  const {data,error}=await db.rpc('tomar_correo_primera_cita',{p_cita:null});
  if(error)throw Error('No se pudo consultar la cola de correos.');
  if(!data)break;
  const job=data as Job;if(job.omitido)continue;
  const {correo,cita}=job;
  const link=correo.evento==='cancelacion'?`${origin}/agendar-primera-cita`:visitManagementLink(origin,cita.id,Date.parse(cita.fecha+'T23:59:59-05:00')+30*86400000,linkSecret);
  const message=visitChangeEmail(correo.evento,correo.detalle,cita.cliente_nombre,link);
  emails.push({id:correo.id,para:cita.email,asunto:message.subject,texto:message.text,html:message.html});
 }
 return emails;
}
