import {createClient} from '@supabase/supabase-js';
import {applyWhatsappEvents,validMetaSignature} from '@/lib/first-visit-messaging';
import {loadWhatsappSettings} from '@/lib/whatsapp-config';
export const dynamic='force-dynamic';
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
  if(!await applyWhatsappEvents(db,JSON.parse(raw),acceptedPhoneIds))return new Response('Reintentar',{status:503});
  return Response.json({recibido:true});
 }catch{return new Response('No se pudo procesar',{status:400});}
}
