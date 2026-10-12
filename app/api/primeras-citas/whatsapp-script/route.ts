import {createClient} from '@supabase/supabase-js';
import {visitManagementLink} from '@/lib/first-visit-links';
import {applyWhatsappEvents,whatsappPayload} from '@/lib/first-visit-messaging';
import {authorizedVisitWorker} from '@/lib/first-visit-worker-config';
export const dynamic='force-dynamic';
export const maxDuration=60;
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
function server(){
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key||key==='[SENSITIVE]'||!process.env.NEXT_PUBLIC_SUPABASE_URL)throw Error('No configurado');
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})}});
}
type Job={omitido?:boolean;mensaje:{id:string;tipo:string};cita:{id:string;fecha:string;hora:string;cliente_nombre:string;telefono:string;sede_id:string;modalidad:string};sede:string};

// The Meta credentials and webhook live in Apps Script. It claims rendered WhatsApp jobs here,
// sends them with its own token, reports each result and forwards Meta webhook events.
export async function POST(request:Request){
 if(!authorizedVisitWorker(request))return reply({error:'No autorizado'},401);
 try{
  const raw=await request.text();if(raw.length>262144)return reply({error:'Solicitud demasiado grande.'},413);
  const body=JSON.parse(raw||'{}'),db=server();
  if(body.accion==='tomar'){
   // Never let two senders share the queue.
   if(process.env.FIRST_VISIT_MESSAGES_ENABLED==='true')return reply({error:'El ERP ya envía WhatsApp directamente; desactiva uno de los dos.'},409);
   const origin=process.env.FIRST_VISIT_PUBLIC_ORIGIN||new URL(request.url).origin,secret=process.env.FIRST_VISIT_LINK_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY!;
   const lang=/^[a-z]{2}(_[A-Z]{2})?$/.test(String(body.idioma_post_cita))?String(body.idioma_post_cita):process.env.META_WA_TEMPLATE_LANG||'es_CO';
   const mensajes:Record<string,unknown>[]=[];
   for(let i=0,limit=Math.min(10,Math.max(1,Number(body.limite)||5));i<limit;i++){
    const {data,error}=await db.rpc('tomar_mensaje_primera_cita');if(error)return reply({error:'No se pudo consultar la cola.'},503);if(!data)break;
    const job=data as Job;if(job.omitido)continue;
    const {mensaje:m,cita:c,sede}=job;
    if(m.tipo==='correo_interno'){mensajes.push({id:m.id,canal:'correo',sede_id:c.sede_id,sede,asunto:`Primera cita · ${sede} · ${c.fecha}`,texto:`${c.cliente_nombre}\n${c.fecha} ${c.hora.slice(0,5)} · ${c.modalidad}\nGestionar en ${origin}/dashboard/primeras-citas`});continue;}
    try{
     const link=visitManagementLink(origin,c.id,Date.parse(c.fecha+'T23:59:59-05:00')+30*86400000,secret);
     mensajes.push({id:m.id,canal:'whatsapp',tipo:m.tipo,payload:whatsappPayload(m.tipo,c,sede,link,lang)});
    }catch{await db.from('primeras_citas_mensajes').update({estado:'revisar',error:'Tipo de mensaje no soportado',updated_at:new Date().toISOString()}).eq('id',m.id).eq('estado','enviando');}
   }
   return reply({mensajes});
  }
  if(body.accion==='resultado'){
   const state=String(body.estado);
   if(!/^[0-9a-f-]{36}$/i.test(String(body.id))||!['enviado','error','revisar','omitido'].includes(state))return reply({error:'Resultado no válido.'},400);
   const now=new Date();
   const {error}=await db.from('primeras_citas_mensajes').update({estado:state,provider_id:state==='enviado'?String(body.provider_id||'').slice(0,250)||null:null,error:state==='enviado'?null:String(body.error||'').slice(0,300)||null,updated_at:now.toISOString(),...(state==='error'?{programado_at:new Date(now.getTime()+10*60000).toISOString()}:{})}).eq('id',String(body.id)).eq('estado','enviando');
   if(error)return reply({error:'No se pudo registrar el resultado.'},503);
   return reply({ok:true});
  }
  if(body.accion==='webhook'){
   // Apps Script cannot read Meta's signature header; the worker secret authenticates the relay instead.
   if(!body.evento||typeof body.evento!=='object')return reply({error:'Evento no válido.'},400);
   return await applyWhatsappEvents(db,body.evento,null)?reply({recibido:true}):reply({error:'Reintentar'},503);
  }
  return reply({error:'Acción no permitida.'},400);
 }catch{return reply({error:'La cola de WhatsApp no está disponible.'},503);}
}
