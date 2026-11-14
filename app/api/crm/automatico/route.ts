import {createClient} from '@supabase/supabase-js';
import {authorizedVisitWorker} from '@/lib/first-visit-worker-config';
import {loadWhatsappSettings} from '@/lib/whatsapp-config';
import {sendBestFollowup} from '@/lib/whatsapp-inbox';
import {suggestWhatsappReply} from '@/lib/whatsapp-ai';
import {PROMO_FIELDS,promoForGreeting,type Promotion} from '@/lib/promotions';
export const dynamic='force-dynamic';
export const maxDuration=60;

type Lead={conv_id:string;telefono:string;nombre:string|null;sede:string|null;sede_id:string|null;intento:number;resumen:string|null};

/** Supabase cron. Self-managed «Interesada» leads (chats without a visit), only with the AI's automatic replies on:
 *  · empujon (every 30 min, 8 a. m.–8 p. m.): the AI writes one short message 16–23 h after her last message, while the 24 h window is open.
 *  · reactivacion (Mon–Sat 11:05 a. m. and 5:05 p. m.): follow-up template on day 2 and day 7 (40 per run); after two attempts
 *    without answer the lead closes by itself. When she answers, the AI continues the conversation. */
export async function POST(request:Request){
 if(!authorizedVisitWorker(request))return Response.json({error:'No autorizado'},{status:401});
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const {tipo}=await request.json().catch(()=>({})) as {tipo?:string};
 const {data:cfg}=await db.from('whatsapp_ia_config').select('auto_activa').eq('id',1).maybeSingle();
 if(!cfg?.auto_activa)return Response.json({activo:false,motivo:'Respuestas automáticas de la IA apagadas'});
 if(tipo==='empujon'){
  const {data,error}=await db.rpc('crm_empujon_tomar',{p_limite:12});
  if(error)return Response.json({error:error.message},{status:500});
  const ids=((data||[]) as (string|{crm_empujon_tomar:string})[]).map(x=>typeof x==='string'?x:x.crm_empujon_tomar);
  await Promise.all(ids.map(id=>suggestWhatsappReply(db,id,{empujon:true})));
  return Response.json({empujones:ids.length});
 }
 if(tipo!=='reactivacion')return Response.json({error:'Tipo no válido'},{status:400});
 const settings=await loadWhatsappSettings(db);
 if(!settings.token||!settings.phoneNumberId)return Response.json({activo:false,motivo:'WhatsApp sin configurar'});
 const [{data,error},{data:promos}]=await Promise.all([db.rpc('crm_reactivacion_tomar',{p_limite:40}),db.from('promociones').select(PROMO_FIELDS).eq('activo',true)]);
 if(error)return Response.json({error:error.message},{status:500});
 let enviados=0;const errores:string[]=[];
 for(const l of (data||[]) as Lead[]){
  const nombre=String(l.nombre||'').trim().split(/\s+/)[0]||'hola',sede=l.sede||'';
  try{
   // The dress type is read from the AI summary of the chat (e.g. «XV años»), to offer the promotion that applies.
   const promo=promoForGreeting((promos||[]) as Promotion[],l.sede_id,l.resumen);
   const {waId,texto}=await sendBestFollowup(settings,l.telefono,nombre,sede,promo),now=new Date().toISOString();
   await db.from('whatsapp_mensajes').insert({conversacion_id:l.conv_id,wa_id:waId,direccion:'saliente',origen:'ia',tipo:'template',texto,estado:'sent',created_at:now});
   await db.from('whatsapp_conversaciones').update({ultimo_mensaje:texto.slice(0,200),ultimo_at:now,ia_sugerencia:null}).eq('id',l.conv_id);
   enviados++;
  }catch(err){
   // Not sent (e.g. the number has no WhatsApp): the attempt counts anyway, so a dead number ends closed instead of blocking the queue.
   errores.push(err instanceof Error?err.message:'Error');
  }
 }
 return Response.json({enviados,errores:errores.slice(0,5)});
}
