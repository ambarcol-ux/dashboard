import {createClient} from '@supabase/supabase-js';
import {after} from 'next/server';
import {authorizedVisitWorker} from '@/lib/first-visit-worker-config';
import {loadSocialSettings,pollInstagramMessages} from '@/lib/social-inbox';
import {suggestWhatsappReply} from '@/lib/whatsapp-ai';
export const dynamic='force-dynamic';
export const maxDuration=60;

/** Supabase cron every 2 minutes: brings Instagram direct messages into the inbox (see pollInstagramMessages) and lets the AI answer. */
export async function POST(request:Request){
 if(!authorizedVisitWorker(request))return Response.json({error:'No autorizado'},{status:401});
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const s=await loadSocialSettings(db);
  if(!s)return Response.json({activo:false});
  const touched=await pollInstagramMessages(db,s);
  if(touched.length){console.log('Redes: Instagram sincronizado, chats con mensajes nuevos',touched.length);after(async()=>{for(const id of touched)await suggestWhatsappReply(db,id);});}
  return Response.json({ok:true,chats:touched.length});
 }catch(e){console.error('Redes: sincronizar Instagram',e);return Response.json({error:e instanceof Error?e.message:'error'},{status:500});}
}
