import {createClient} from '@supabase/supabase-js';
import {visitManagementLink} from '@/lib/first-visit-links';
import {confirmationPayload,isTemplateError,whatsappPayload,reminderConfirmPayload,postVisitPayload,reviewPayload,rescheduleChoices,todayReminderPayload,TODAY_REMINDER_TEMPLATE,REVIEW_TEMPLATE,VISIT_SURVEY_TEMPLATE,POST_VISIT_V2_TEMPLATE,openWindowPayload,inboxCopy,REMINDER_CONFIRM_TEMPLATE,REMINDER_CONFIRM_V2_TEMPLATE,RECOVERY_TEMPLATE} from '@/lib/first-visit-messaging';
import {whatsappPhone} from '@/lib/first-visit-links';
import {claimVisitEmails,deliverVisitEmails} from '@/lib/first-visit-email';
import {Resend} from 'resend';
import {capiEvent,capiMessagingEvent,DEFAULT_CAPI_DATASET,type CapiJob} from '@/lib/meta-capi';
import {authorizedVisitWorker,visitWorkerConfiguration} from '@/lib/first-visit-worker-config';
import {loadWhatsappSettings} from '@/lib/whatsapp-config';
import {loadVisitSites} from '@/lib/first-visit-sites';
export const dynamic='force-dynamic';
export const maxDuration=60;
/** The 2 nearest free times for a visit (same modality and store), from 3 hours from now and within 10 days. */
async function nearestSlots(db:{rpc:(f:string,a:Record<string,unknown>)=>PromiseLike<{data:unknown}>},c:{modalidad:string;sede_id:string}){
 const out:{fecha:string;hora:string}[]=[],limit=Date.now()+3*3600000;
 for(let i=0;i<10&&out.length<2;i++){
  const fecha=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota'}).format(new Date(Date.now()+i*86400000));
  const {data}=await db.rpc('disponibilidad_primera_cita',{p_fecha:fecha,p_modalidad:c.modalidad,p_sede:c.sede_id});
  for(const s of (Array.isArray(data)?data:[]) as {hora:string;cupos:number}[])if(s.cupos>0&&Date.parse(`${fecha}T${s.hora}:00-05:00`)>limit&&out.length<2)out.push({fecha,hora:s.hora});
 }
 return out;
}
export async function GET(request:Request){
 if(!authorizedVisitWorker(request))return Response.json({error:'No autorizado'},{status:401});
 const config=visitWorkerConfiguration();
 if(!config.configuracion.base_datos)return Response.json({...config,listo:false},{headers:{'Cache-Control':'no-store'}});
 try{
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})}});
  const {count,error}=await db.from('primeras_citas_mensajes').select('id',{count:'exact',head:true}).in('estado',['pendiente','error']).lte('programado_at',new Date().toISOString()).lt('intentos',3);
  if(error)return Response.json({...config,listo:false,error:'No se pudo consultar la cola'},{status:503,headers:{'Cache-Control':'no-store'}});
  return Response.json({...config,listo:config.activo&&config.faltantes.length===0,pendientes:count||0,meta_capi:process.env.META_CAPI_ACCESS_TOKEN?'token_capi':process.env.META_WA_TOKEN?'token_whatsapp':false},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({...config,listo:false,error:'La base de datos no respondió'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
export async function POST(request:Request){
 if(!authorizedVisitWorker(request))return Response.json({error:'No autorizado'},{status:401});
 if(process.env.FIRST_VISIT_MESSAGES_ENABLED!=='true')return Response.json({activo:false,motivo:'Automatización desactivada'});
 const configuration=visitWorkerConfiguration();
 if(configuration.faltantes.length)return Response.json({error:'Completa la configuración antes de enviar mensajes.',faltantes:configuration.faltantes},{status:503});
 const {META_GRAPH_VERSION:version,FIRST_VISIT_PUBLIC_ORIGIN:origin,SUPABASE_SERVICE_ROLE_KEY:key}=process.env;
 if(!version||!/^v\d+\.0$/.test(version)||!origin||!origin.startsWith('https://')||!key)return Response.json({error:'Falta configurar la versión de Meta u origen público.'},{status:503});
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,key,{auth:{persistSession:false,autoRefreshToken:false}});
 // Number and token: Configuración › Integraciones › WhatsApp once tested, else the Vercel variables. Store contacts: Configuración › Sedes.
 const wa=await loadWhatsappSettings(db),{token,phoneNumberId:phone}=wa;
 if(!token||!phone)return Response.json({error:'Falta configurar WhatsApp.'},{status:503});
 const sites=await loadVisitSites(db);
 let sent=0,review=0;
 for(let i=0;i<5;i++){
  const {data:job,error}=await db.rpc('tomar_mensaje_primera_cita');if(error)return Response.json({error:'No se pudo consultar la cola'},{status:503});if(!job)break;if(job.omitido)continue;
  const {mensaje:m,cita:c,sede}=job;
  let state='revisar',providerId:string|null=null,issue:string|null=null,template:string|null=null,copy:string|null=null;
  try{
   if(m.tipo==='correo_interno'){
    const recipients:Record<string,string[]>=JSON.parse(process.env.FIRST_VISIT_INTERNAL_RECIPIENTS||'{}');
    const to=recipients[c.sede_id],from=process.env.FIRST_VISIT_EMAIL_FROM;
    if(!to?.length||!from||!process.env.RESEND_API_KEY){state='error';issue='Correo interno sin configurar';}
    else{
     const r=await new Resend(process.env.RESEND_API_KEY).emails.send({from,to,subject:`Primera cita · ${sede} · ${c.fecha}`,text:`${c.cliente_nombre}\n${c.fecha} ${c.hora} · ${c.modalidad}\nGestionar en ${origin}/dashboard/primeras-citas`},{idempotencyKey:m.id});
     if(r.error){state='error';issue='Proveedor de correo rechazó el envío';}else{state='enviado';providerId=r.data!.id;}
    }
   }else{
    const link=visitManagementLink(origin,c.id,Date.parse(c.fecha+'T23:59:59-05:00')+30*86400000,process.env.FIRST_VISIT_LINK_SECRET||key);
    // If the customer wrote to the 304 in the last 24 hours, reminders go as normal messages (they also show in the inbox).
    const tel=whatsappPhone(c.telefono);
    const {data:conv}=['recordatorio24','recordatorio2','recuperar','resena','post_cita','confirmacion','encuesta_visita'].includes(m.tipo)?await db.from('whatsapp_conversaciones').select('id,ultimo_entrante_at').eq('telefono',tel).maybeSingle():{data:null};
    // Answers to a button she just tapped («No puedo» → «¿Cancelamos?») always go inside her open 24 hours.
    const RESPUESTA=['confirmar_cancelacion','cita_cancelada_wa','cita_mantenida_wa','satisfaccion','satisfaccion_falla','satisfaccion_gracias','ubicacion','reagendar_otro_dia','reagendar_ocupado','reagendar'].includes(m.tipo);
    const open=RESPUESTA||(!!conv?.ultimo_entrante_at&&Date.now()-Date.parse(conv.ultimo_entrante_at)<23.5*3600000);
    // Google review request after «Asistí»: a normal message while her 24 hours are open (no template), with her store's review link.
    let resena:string|null=null;
    if(m.tipo==='resena'){const {data:s}=await db.from('sedes').select('resena_url').eq('id',c.sede_id).maybeSingle();resena=s?.resena_url||null;}
    // Review: button «⭐ Dejar reseña» inside her 24 hours; outside, the ambar_resena template (Dejar reseña · Ahora no).
    const direct:{texto:string;payload:Record<string,unknown>}|null=m.tipo==='resena'?(resena?reviewPayload(c,resena,open,wa.templateLang):null)
     :m.tipo==='reagendar'?rescheduleChoices(c,await nearestSlots(db,c),link)
     :open?openWindowPayload(m.tipo,c,sede,link,sites):null;
    // Confirmations use the detailed per-store template; the 24-hour reminder asks to confirm. While Meta has not approved a template, the next one goes out.
    const payloads=m.tipo==='resena'?(direct?.payload?[direct.payload]:[]):[direct?.payload??null,m.tipo==='confirmacion'?confirmationPayload(c,sede,wa.confirmationLang,sites,true):null,m.tipo==='confirmacion'?confirmationPayload(c,sede,wa.confirmationLang,sites):null,m.tipo==='recordatorio2'?todayReminderPayload(c,sede,wa.templateLang,sites):null,m.tipo==='recordatorio2'?todayReminderPayload(c,sede,wa.templateLang):null,m.tipo==='recordatorio24'?reminderConfirmPayload(c,sede,wa.templateLang,true,sites):null,m.tipo==='recordatorio24'?reminderConfirmPayload(c,sede,wa.templateLang,true):null,m.tipo==='recordatorio24'?reminderConfirmPayload(c,sede,wa.templateLang):null,m.tipo==='post_cita'?postVisitPayload(c,sede,wa.templateLang):null,
     // The 24-hour reminder always goes with buttons: no plain template as last option.
     m.tipo==='recordatorio24'||RESPUESTA?null:whatsappPayload(m.tipo,c,sede,link,wa.templateLang)].filter(p=>p!==null);
    if(!payloads.length){state='omitido';issue='Sin las 24 horas abiertas o sin enlace de reseña de la sede';}
    for(const [n,payload] of payloads.entries()){
     const r=await fetch(`https://graph.facebook.com/${version}/${phone}/messages`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});
     const d=await r.json();if(r.ok&&d.messages?.[0]?.id){state='enviado';providerId=d.messages[0].id;issue=null;template=(payload as {template?:{name?:string}}).template?.name||null;
      copy=direct&&payload===direct.payload?direct.texto:inboxCopy(m.tipo,c,sede,payload as Record<string,unknown>);
      break;}
     if(r.status>=400&&r.status<500){state='error';
      const name=(payload as {template?:{name?:string}}).template?.name;
      issue=isTemplateError(d.error?.code)&&(name===REMINDER_CONFIRM_TEMPLATE||name===REMINDER_CONFIRM_V2_TEMPLATE||name===POST_VISIT_V2_TEMPLATE||name===REVIEW_TEMPLATE||name===VISIT_SURVEY_TEMPLATE||name===TODAY_REMINDER_TEMPLATE||String(name).endsWith('_v2')||String(name).endsWith('_v3')||name===RECOVERY_TEMPLATE)?`Falta aprobar en Meta la plantilla ${name} (ver docs/plantillas-whatsapp.md).`:`WhatsApp rechazó el envío (${r.status})`;
      if(n<payloads.length-1&&(isTemplateError(d.error?.code)||(direct&&payload===direct.payload)))continue;}
     else issue='Respuesta incierta del proveedor; revisar antes de reintentar';
     break;
    }
   }
  }catch{issue='Resultado incierto; revisar proveedor antes de reintentar';}
  if(state==='enviado'&&m.tipo==='resena')await db.from('resenas_solicitudes').insert({telefono:String(c.telefono).replace(/\D/g,'').slice(-10),email:c.email||null,canal:'whatsapp',origen:'visita',cita_id:c.id,sede_id:c.sede_id});
  // The same message shows in the customer's 304 chat in the ERP (only if she already has one), as sent by the ERP.
  if(state==='enviado'&&copy&&providerId){try{
   const {data:chat}=await db.from('whatsapp_conversaciones').select('id').eq('telefono',whatsappPhone(c.telefono)).maybeSingle();
   if(chat){const at=new Date().toISOString();await db.from('whatsapp_mensajes').insert({conversacion_id:chat.id,wa_id:providerId,direccion:'saliente',origen:'erp',tipo:'automatico',texto:copy.slice(0,4000),estado:'sent',created_at:at});
    await db.from('whatsapp_conversaciones').update({ultimo_mensaje:copy.slice(0,200),ultimo_at:at}).eq('id',chat.id);}
  }catch{/* the chat copy is informative: never blocks the queue */}}
  const {error:saveError}=await db.from('primeras_citas_mensajes').update({estado:state,provider_id:providerId,error:issue,...(template?{plantilla:template}:{}),updated_at:new Date().toISOString(),...(state==='error'?{programado_at:new Date(Date.now()+10*60000).toISOString()}: {})}).eq('id',m.id).eq('estado','enviando');
  if(saveError)return Response.json({error:'No se pudo registrar el resultado; requiere revisión'},{status:503});
  if(state==='enviado')sent++;else review++;
 }
 // Customer change emails (reserva, reprogramación, cancelación…) go out through Resend from the ERP.
 let emails={sent:0,failed:0};
 try{
  const resend=new Resend(process.env.RESEND_API_KEY),from=process.env.FIRST_VISIT_EMAIL_FROM!;
  const claimed=await claimVisitEmails(db,origin,process.env.FIRST_VISIT_LINK_SECRET||key,10);
  emails=await deliverVisitEmails(db,claimed,async e=>{const r=await resend.emails.send({from,to:[e.para],subject:e.asunto,text:e.texto,html:e.html},{idempotencyKey:e.id});return r.error?{ok:false,error:'Resend rechazó el envío'}:{ok:true};});
 }catch{return Response.json({enviados:sent,requieren_revision:review,error:'No se pudieron procesar los correos a clientes'},{status:503});}
 // Meta Conversions API (Schedule, AppointmentAttended, Purchase) — replaces the CRM Apps Script.
 const capi={enviados:0,errores:0};
 const capiToken=process.env.META_CAPI_ACCESS_TOKEN||process.env.META_WA_TOKEN,dataset=process.env.META_CAPI_DATASET_ID||DEFAULT_CAPI_DATASET;
 if(capiToken&&/^\d+$/.test(dataset)){
  // Every signed contract with marketing data authorization also goes to Meta as a sale (with or without a first visit).
  await db.rpc('capi_contratos_encolar',{p_dias:7});
  // Events of chats that came from a WhatsApp ad also go as Business Messaging events with the ad click, so Meta credits that ad.
  // They go to the dataset of the WhatsApp Business account (asked once per run; the usual dataset if Meta does not return one).
  const waToken=wa.token||capiToken;let bmDataset:string|null|undefined,bmMotivo='';
  const metaError=(st:number,d:{error?:{message?:string;error_user_msg?:string;error_subcode?:number}})=>
   `Meta rechazó el evento (${st}) ${[d.error?.message,d.error?.error_user_msg,d.error?.error_subcode].filter(Boolean).join(' · ').slice(0,280)}`;
  // Business Messaging events only go to the dataset of the WhatsApp Business account: read it, or create it when the account has none.
  const datasetDeWhatsapp=async()=>{
   if(bmDataset!==undefined)return bmDataset;
   bmDataset=null;
   for(const method of ['GET','POST']){
    try{
     const r=await fetch(`https://graph.facebook.com/${version}/${wa.wabaId}/dataset`,{method,headers:{Authorization:`Bearer ${waToken}`},signal:AbortSignal.timeout(8000)});
     const d=await r.json().catch(()=>({}));const id=String(d.id||d.data?.[0]?.id||d.data?.[0]?.dataset_id||'');
     if(/^\d+$/.test(id)){bmDataset=id;break;}
     bmMotivo=`sin dataset de la cuenta de WhatsApp: ${metaError(r.status,d)}`;
    }catch{bmMotivo='sin dataset de la cuenta de WhatsApp: Meta no respondió';}
   }
   return bmDataset;
  };
  const enviar=async(target:string,token:string,evento:unknown)=>{
   const r=await fetch(`https://graph.facebook.com/${version}/${target}/events`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({data:[evento]}),signal:AbortSignal.timeout(8000)});
   const d=await r.json().catch(()=>({}));
   return r.ok&&d.events_received>=1?'':metaError(r.status,d);
  };
  for(let i=0;i<10;i++){
   const {data:job,error}=await db.rpc('tomar_capi_primera_cita');if(error||!job)break;if(job.omitido)continue;
   let estado='error',respuesta='',nota='';
   // A retry does not resend the WhatsApp-ad event already accepted (Meta does not de-duplicate those).
   const yaWa=String((job as {evento:{respuesta?:string|null}}).evento.respuesta||'').includes('Anuncio de WhatsApp: enviado');
   const bm=yaWa?null:capiMessagingEvent(job as CapiJob,wa.wabaId);
   if(yaWa)nota='Anuncio de WhatsApp: enviado';
   // A rental in the same dataset goes once: as the WhatsApp-ad sale when it came from an ad, else as before.
   let reemplaza=false;
   if(bm){
    try{
     const target=await datasetDeWhatsapp(),err=target?await enviar(target,waToken,bm):bmMotivo;
     nota=err?`Anuncio de WhatsApp: ${err}`:'Anuncio de WhatsApp: enviado';
     reemplaza=!err&&target===dataset&&(job as CapiJob).evento.evento==='Purchase';
    }catch{nota='Anuncio de WhatsApp: sin respuesta de Meta';}
   }
   if(reemplaza)estado='enviado';
   else try{
    const err=await enviar(dataset,capiToken,capiEvent(job as CapiJob));
    if(!err)estado='enviado';else respuesta=err;
   }catch{respuesta='Sin respuesta de Meta; se reintentará';}
   respuesta=[respuesta,nota].filter(Boolean).join(' · ');
   await db.from('primeras_citas_capi').update({estado,respuesta:respuesta||null,updated_at:new Date().toISOString()}).eq('id',(job as CapiJob).evento.id).eq('estado','enviando');
   if(estado==='enviado')capi.enviados++;else capi.errores++;
  }
 }
 return Response.json({enviados:sent,requieren_revision:review,correos_enviados:emails.sent,correos_con_error:emails.failed,capi_enviados:capi.enviados,capi_errores:capi.errores});
}
