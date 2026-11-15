import {createClient} from '@supabase/supabase-js';
import {applyWhatsappEvents,validMetaSignature} from '@/lib/first-visit-messaging';
import {loadWhatsappSettings} from '@/lib/whatsapp-config';
import {after} from 'next/server';
import {storeInboxEvents,handleCrmButtons} from '@/lib/whatsapp-inbox';
import {suggestWhatsappReply} from '@/lib/whatsapp-ai';
import {classifyFlowReply} from '@/lib/whatsapp-classify';
import {resolveAd} from '@/lib/meta-ads';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:Request){const q=new URL(request.url).searchParams;if(process.env.META_WA_VERIFY_TOKEN&&q.get('hub.mode')==='subscribe'&&q.get('hub.verify_token')===process.env.META_WA_VERIFY_TOKEN)return new Response(q.get('hub.challenge'));return new Response('No autorizado',{status:403});}
export async function POST(request:Request){
 const raw=await request.text();if(raw.length>262144)return new Response('Demasiado grande',{status:413});
 if(!validMetaSignature(raw,request.headers.get('x-hub-signature-256')||'',process.env.META_APP_SECRET||''))return new Response('Firma inválida',{status:403});
 if(process.env.FIRST_VISIT_MESSAGES_ENABLED!=='true')return Response.json({activo:false});
 if(!process.env.SUPABASE_SERVICE_ROLE_KEY)return new Response('Sin configurar',{status:503});
 try{
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  // Current and previous numbers: replies to messages sent before a number change are still recorded.
  const {acceptedPhoneIds}=await loadWhatsappSettings(db);
  if(!acceptedPhoneIds.length)return new Response('Sin configurar',{status:503});
  const payload=JSON.parse(raw);
  if(!await applyWhatsappEvents(db,payload,acceptedPhoneIds))return new Response('Reintentar',{status:503});
  // Ventas y CRM › WhatsApp 304: chats in the ERP. A failure here never blocks the visit notifications above.
  try{
   const {touched,ads,acciones,escritos}=await storeInboxEvents(db,payload,acceptedPhoneIds);
   if(acciones.length)after(async()=>{const settings=await loadWhatsappSettings(db);if(settings.token&&settings.phoneNumberId)await handleCrmButtons(db,settings,acciones);});
   if(touched.length||ads.length)after(async()=>{
    // First the ad (its name carries the store, which then assigns the chat if it has none), then the AI suggestion.
    for(const a of ads){try{const sede=await resolveAd(db,a.anuncio);if(sede)await db.from('whatsapp_conversaciones').update({sede_id:sede}).eq('id',a.conversacion).is('sede_id',null);}catch(e){console.error('Anuncio:',e);}}
    // Typed answers to an automatic message with buttons count as the button; then the chat AI does not answer that message.
    const resueltos=new Set<string>();
    for(const e of escritos){try{if(await classifyFlowReply(db,e.telefono,e.wa_id,e.texto))resueltos.add(e.conversacion);}catch(err){console.error('Clasificar respuesta:',err);}}
    for(const id of touched)if(!resueltos.has(id))await suggestWhatsappReply(db,id);
   });
  }
  catch(e){console.error('Bandeja WhatsApp:',e);}
  return Response.json({recibido:true});
 }catch{return new Response('No se pudo procesar',{status:400});}
}
