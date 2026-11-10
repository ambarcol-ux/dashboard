import {createClient} from '@supabase/supabase-js';
import {after} from 'next/server';
import {validMetaSignature} from '@/lib/first-visit-messaging';
import {loadSocialSettings,storeSocialEvents} from '@/lib/social-inbox';
import {suggestWhatsappReply} from '@/lib/whatsapp-ai';
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
 if(!validMetaSignature(raw,request.headers.get('x-hub-signature-256')||'',process.env.META_APP_SECRET||''))return new Response('Firma inválida',{status:403});
 try{
  const db=service(),s=await loadSocialSettings(db);
  if(!s)return Response.json({activo:false});
  const payload=JSON.parse(raw);
  if(payload.object!=='page'&&payload.object!=='instagram')return Response.json({ignorado:true});
  const touched=await storeSocialEvents(db,s,payload);
  if(touched.length)after(async()=>{for(const id of touched)await suggestWhatsappReply(db,id);});
  return Response.json({recibido:true});
 }catch(e){console.error('Redes:',e);return new Response('No se pudo procesar',{status:500});}
}
