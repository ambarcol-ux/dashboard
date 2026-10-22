import {createClient} from '@supabase/supabase-js';
import {visitManagementLink} from '@/lib/first-visit-links';
import {confirmationPayload,isTemplateError,whatsappPayload} from '@/lib/first-visit-messaging';
import {claimVisitEmails,deliverVisitEmails} from '@/lib/first-visit-email';
import {Resend} from 'resend';
import {capiEvent,DEFAULT_CAPI_DATASET,type CapiJob} from '@/lib/meta-capi';
import {authorizedVisitWorker,visitWorkerConfiguration} from '@/lib/first-visit-worker-config';
export const dynamic='force-dynamic';
export const maxDuration=60;
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
 const {META_WA_TOKEN:token,META_WA_PHONE_NUMBER_ID:phone,META_GRAPH_VERSION:version,FIRST_VISIT_PUBLIC_ORIGIN:origin,SUPABASE_SERVICE_ROLE_KEY:key}=process.env;
 if(!token||!phone||!version||!/^v\d+\.0$/.test(version)||!origin||!origin.startsWith('https://')||!key)return Response.json({error:'Falta configurar WhatsApp, versión de Meta u origen público.'},{status:503});
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,key,{auth:{persistSession:false,autoRefreshToken:false}});
 let sent=0,review=0;
 for(let i=0;i<5;i++){
  const {data:job,error}=await db.rpc('tomar_mensaje_primera_cita');if(error)return Response.json({error:'No se pudo consultar la cola'},{status:503});if(!job)break;if(job.omitido)continue;
  const {mensaje:m,cita:c,sede}=job;
  let state='revisar',providerId:string|null=null,issue:string|null=null,template:string|null=null;
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
    // Confirmations use the detailed per-store template; while Meta has not approved it, the short one goes out.
    const payloads=[m.tipo==='confirmacion'?confirmationPayload(c,sede,process.env.META_WA_CONFIRMATION_LANG||'es'):null,whatsappPayload(m.tipo,c,sede,link,process.env.META_WA_TEMPLATE_LANG||'es_CO')].filter(p=>p!==null);
    for(const [n,payload] of payloads.entries()){
     const r=await fetch(`https://graph.facebook.com/${version}/${phone}/messages`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});
     const d=await r.json();if(r.ok&&d.messages?.[0]?.id){state='enviado';providerId=d.messages[0].id;issue=null;template=(payload as {template?:{name?:string}}).template?.name||null;break;}
     if(r.status>=400&&r.status<500){state='error';issue=`WhatsApp rechazó el envío (${r.status})`;if(n<payloads.length-1&&isTemplateError(d.error?.code))continue;}
     else issue='Respuesta incierta del proveedor; revisar antes de reintentar';
     break;
    }
   }
  }catch{issue='Resultado incierto; revisar proveedor antes de reintentar';}
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
  for(let i=0;i<10;i++){
   const {data:job,error}=await db.rpc('tomar_capi_primera_cita');if(error||!job)break;if(job.omitido)continue;
   let estado='error',respuesta='';
   try{
    const r=await fetch(`https://graph.facebook.com/${version}/${dataset}/events`,{method:'POST',headers:{Authorization:`Bearer ${capiToken}`,'Content-Type':'application/json'},body:JSON.stringify({data:[capiEvent(job as CapiJob)]}),signal:AbortSignal.timeout(8000)});
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.events_received>=1)estado='enviado';else respuesta=`Meta rechazó el evento (${r.status}) ${String(d.error?.message||'').slice(0,200)}`;
   }catch{respuesta='Sin respuesta de Meta; se reintentará';}
   await db.from('primeras_citas_capi').update({estado,respuesta:respuesta||null,updated_at:new Date().toISOString()}).eq('id',(job as CapiJob).evento.id).eq('estado','enviando');
   if(estado==='enviado')capi.enviados++;else capi.errores++;
  }
 }
 return Response.json({enviados:sent,requieren_revision:review,correos_enviados:emails.sent,correos_con_error:emails.failed,capi_enviados:capi.enviados,capi_errores:capi.errores});
}
