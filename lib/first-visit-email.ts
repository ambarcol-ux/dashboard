import {after} from 'next/server';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {Resend} from 'resend';
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

function serviceClient(){
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key||key==='[SENSITIVE]'||!process.env.NEXT_PUBLIC_SUPABASE_URL)return null;
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})}});
}
export const visitEmailConfigured=()=>Boolean(process.env.RESEND_API_KEY);

/** Sends queued change emails (optionally for one appointment). Unsent rows stay queued for the worker. */
export async function deliverVisitEmails(origin:string,{cita,limit=5,db=serviceClient()}:{cita?:string;limit?:number;db?:SupabaseClient|null}={}){
 let sent=0,failed=0;
 const apiKey=process.env.RESEND_API_KEY,secret=process.env.FIRST_VISIT_LINK_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY||'';
 if(!apiKey||!db)return {enviados:sent,fallidos:failed};
 const resend=new Resend(apiKey),from=process.env.FIRST_VISIT_EMAIL_FROM||'Ámbar Couture <citas@ambarcouture.com>';
 for(let i=0;i<limit;i++){
  const {data:job,error}=await db.rpc('tomar_correo_primera_cita',{p_cita:cita??null});
  if(error||!job)break;if(job.omitido)continue;
  const {correo,cita:c}=job as {correo:{id:string;evento:VisitEmailEvent;detalle:VisitEmailDetail};cita:{id:string;fecha:string;cliente_nombre:string;email:string}};
  let update:Record<string,unknown>;
  try{
   const link=correo.evento==='cancelacion'?`${origin}/agendar-primera-cita`:visitManagementLink(origin,c.id,Date.parse(c.fecha+'T23:59:59-05:00')+30*86400000,secret);
   const message=visitChangeEmail(correo.evento,correo.detalle,c.cliente_nombre,link);
   const r=await resend.emails.send({from,to:c.email,...message},{idempotencyKey:correo.id});
   update=r.error?{estado:'error',error:'El proveedor de correo rechazó el envío.'}:{estado:'enviado',provider_id:r.data?.id||null,error:null};
  }catch{update={estado:'error',error:'No se pudo contactar al proveedor de correo.'};}
  if(update.estado==='enviado')sent++;else failed++;
  await db.from('primeras_citas_correos').update({...update,updated_at:new Date().toISOString()}).eq('id',correo.id).eq('estado','enviando');
 }
 return {enviados:sent,fallidos:failed};
}

/** Sends this appointment's change emails after the response, so the customer never waits on the provider. */
export function scheduleVisitEmails(origin:string,cita:string){
 if(!visitEmailConfigured())return;
 const work=()=>deliverVisitEmails(origin,{cita}).catch(()=>undefined);
 try{after(work);}catch{void work();}
}
