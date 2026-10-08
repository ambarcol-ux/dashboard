import {createClient} from '@supabase/supabase-js';
import {validMetaSignature} from '@/lib/first-visit-messaging';
export const dynamic='force-dynamic';
export async function GET(request:Request){const q=new URL(request.url).searchParams;if(process.env.META_WA_VERIFY_TOKEN&&q.get('hub.mode')==='subscribe'&&q.get('hub.verify_token')===process.env.META_WA_VERIFY_TOKEN)return new Response(q.get('hub.challenge'));return new Response('No autorizado',{status:403});}
export async function POST(request:Request){
 const raw=await request.text();if(raw.length>262144)return new Response('Demasiado grande',{status:413});
 if(!validMetaSignature(raw,request.headers.get('x-hub-signature-256')||'',process.env.META_APP_SECRET||''))return new Response('Firma inválida',{status:403});
 if(process.env.FIRST_VISIT_MESSAGES_ENABLED!=='true')return Response.json({activo:false});
 if(!process.env.META_WA_PHONE_NUMBER_ID||!process.env.SUPABASE_SERVICE_ROLE_KEY)return new Response('Sin configurar',{status:503});
 try{
  const data=JSON.parse(raw);const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  for(const entry of data.entry||[])for(const change of entry.changes||[]){const v=change.value;if(v?.metadata?.phone_number_id!==process.env.META_WA_PHONE_NUMBER_ID)continue;
   for(const status of v.statuses||[]){if(!['sent','delivered','read','failed'].includes(status.status)||!/^\d+$/.test(String(status.timestamp)))continue;const date=new Date(Number(status.timestamp)*1000);if(!Number.isFinite(date.getTime()))continue;const {error}=await db.rpc('estado_whatsapp_primera_cita',{p_provider_id:status.id,p_telefono:status.recipient_id,p_estado:status.status,p_fecha:date.toISOString()});if(error)return new Response('Reintentar',{status:503});}
   for(const message of v.messages||[]){const action=message.button?.payload||message.interactive?.button_reply?.id||message.interactive?.list_reply?.id;if(!action||!message.context?.id)continue;const {error}=await db.rpc('respuesta_whatsapp_primera_cita',{p_message_id:message.id,p_context_id:message.context.id,p_telefono:message.from,p_accion:action});if(error)return new Response('Reintentar',{status:503});}
  }
  return Response.json({recibido:true});
 }catch{return new Response('No se pudo procesar',{status:400});}
}
