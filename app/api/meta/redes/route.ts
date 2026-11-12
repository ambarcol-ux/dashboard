import {createClient} from '@supabase/supabase-js';
import {after} from 'next/server';
import {validMetaSignature} from '@/lib/first-visit-messaging';
import {loadSocialSettings,storeSocialEvents,storeSocialComments} from '@/lib/social-inbox';
import {suggestWhatsappReply,handleComment} from '@/lib/whatsapp-ai';
export const dynamic='force-dynamic';
export const maxDuration=60;

const service=()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});

/** Meta webhook for Messenger (object «page») and Instagram (object «instagram»): verification with the token shown in Integraciones. */
export async function GET(request:Request){
 const q=new URL(request.url).searchParams;
 try{const s=await loadSocialSettings(service());
  if(s&&q.get('hub.mode')==='subscribe'&&q.get('hub.verify_token')===s.verifyToken)return new Response(q.get('hub.challenge'));}catch{/* falls through */}
 return new Response('No autorizado',{status:403});
}
export async function POST(request:Request){
 const raw=await request.text();if(raw.length>262144)return new Response('Demasiado grande',{status:413});
 console.log('Redes: aviso recibido',raw.slice(0,300));
 if(!validMetaSignature(raw,request.headers.get('x-hub-signature-256')||'',process.env.META_APP_SECRET||'')){console.warn('Redes: firma inválida (¿la app de Meta no es la de META_APP_SECRET?)');return new Response('Firma inválida',{status:403});}
 try{
  const db=service(),s=await loadSocialSettings(db);
  if(!s){console.warn('Redes: sin conexión activa en Integraciones');return Response.json({activo:false});}
  const payload=JSON.parse(raw);
  if(payload.object!=='page'&&payload.object!=='instagram')return Response.json({ignorado:true});
  const touched=await storeSocialEvents(db,s,payload);
  console.log('Redes: chats con mensajes nuevos',touched.length);
  const comentarios=await storeSocialComments(db,s,payload);
  if(comentarios.length)console.log('Redes: comentarios nuevos',comentarios.length);
  if(touched.length||comentarios.length)after(async()=>{for(const id of touched)await suggestWhatsappReply(db,id);for(const id of comentarios)await handleComment(db,id);});
  return Response.json({recibido:true});
 }catch(e){console.error('Redes:',e);return new Response('No se pudo procesar',{status:500});}
}
