import {createClient} from '@supabase/supabase-js';
import {visitManagementLink} from '@/lib/first-visit-links';
import {whatsappPayload} from '@/lib/first-visit-messaging';
import {Resend} from 'resend';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function POST(request:Request){
 if(!process.env.FIRST_VISIT_WORKER_SECRET||request.headers.get('authorization')!==`Bearer ${process.env.FIRST_VISIT_WORKER_SECRET}`)return Response.json({error:'No autorizado'},{status:401});
 if(process.env.FIRST_VISIT_MESSAGES_ENABLED!=='true')return Response.json({activo:false,motivo:'Automatización desactivada'});
 const {META_WA_TOKEN:token,META_WA_PHONE_NUMBER_ID:phone,META_GRAPH_VERSION:version,FIRST_VISIT_PUBLIC_ORIGIN:origin,SUPABASE_SERVICE_ROLE_KEY:key}=process.env;
 if(!token||!phone||!version||!/^v\d+\.0$/.test(version)||!origin||!origin.startsWith('https://')||!key)return Response.json({error:'Falta configurar WhatsApp, versión de Meta u origen público.'},{status:503});
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,key,{auth:{persistSession:false,autoRefreshToken:false}});
 let sent=0,review=0;
 for(let i=0;i<5;i++){
  const {data:job,error}=await db.rpc('tomar_mensaje_primera_cita');if(error)return Response.json({error:'No se pudo consultar la cola'},{status:503});if(!job)break;if(job.omitido)continue;
  const {mensaje:m,cita:c,sede}=job;
  let state='revisar',providerId:string|null=null,issue:string|null=null;
  try{
   if(m.tipo==='correo_interno'){
    const recipients:Record<string,string[]>=JSON.parse(process.env.FIRST_VISIT_INTERNAL_RECIPIENTS||'{}');
    const to=recipients[c.sede_id],from=process.env.FIRST_VISIT_EMAIL_FROM;
    if(!to?.length||!from||!process.env.RESEND_API_KEY){state='error';issue='Correo interno sin configurar';}
    else{
     const r=await new Resend(process.env.RESEND_API_KEY).emails.send({from,to,subject:`Primera cita · ${sede} · ${c.fecha}`,text:`${c.cliente_nombre}\n${c.fecha} ${c.hora} · ${c.modalidad}\nGestionar en ${origin}/dashboard/calendario`},{idempotencyKey:m.id});
     if(r.error){state='error';issue='Proveedor de correo rechazó el envío';}else{state='enviado';providerId=r.data!.id;}
    }
   }else{
    const link=visitManagementLink(origin,c.id,Date.parse(c.fecha+'T23:59:59-05:00')+30*86400000,process.env.FIRST_VISIT_LINK_SECRET||key);
    const r=await fetch(`https://graph.facebook.com/${version}/${phone}/messages`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(whatsappPayload(m.tipo,c,sede,link,process.env.META_WA_TEMPLATE_LANG||'es_CO')),signal:AbortSignal.timeout(8000)});
    const d=await r.json();if(r.ok&&d.messages?.[0]?.id){state='enviado';providerId=d.messages[0].id;}else if(r.status>=400&&r.status<500){state='error';issue=`WhatsApp rechazó el envío (${r.status})`;}else issue='Respuesta incierta del proveedor; revisar antes de reintentar';
   }
  }catch{issue='Resultado incierto; revisar proveedor antes de reintentar';}
  const {error:saveError}=await db.from('primeras_citas_mensajes').update({estado:state,provider_id:providerId,error:issue,updated_at:new Date().toISOString(),...(state==='error'?{programado_at:new Date(Date.now()+10*60000).toISOString()}: {})}).eq('id',m.id).eq('estado','enviando');
  if(saveError)return Response.json({error:'No se pudo registrar el resultado; requiere revisión'},{status:503});
  if(state==='enviado')sent++;else review++;
 }
 return Response.json({enviados:sent,requieren_revision:review});
}
