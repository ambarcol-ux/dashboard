import {createClient} from '@supabase/supabase-js';
import {authorizedVisitWorker} from '@/lib/first-visit-worker-config';
import {suggestWhatsappReply} from '@/lib/whatsapp-ai';
export const dynamic='force-dynamic';
export const maxDuration=60;

/** Every 5 minutes (Supabase cron): the AI answers chats scheduled to be picked up again (whatsapp_conversaciones.ia_retomar_at), oldest first. */
export async function POST(request:Request){
 if(!authorizedVisitWorker(request))return Response.json({error:'No autorizado'},{status:401});
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.from('whatsapp_conversaciones').select('id').lte('ia_retomar_at',new Date().toISOString()).order('ultimo_entrante_at',{ascending:true}).limit(6);
 if(error)return Response.json({error:'No se pudo consultar los chats'},{status:503});
 const ids=(data||[]).map(c=>c.id as string);
 if(!ids.length)return Response.json({retomados:0});
 // Claim first so a slow run is never repeated by the next one; suggestWhatsappReply skips chats already answered or paused.
 await db.from('whatsapp_conversaciones').update({ia_retomar_at:null}).in('id',ids);
 await Promise.all(ids.map(id=>suggestWhatsappReply(db,id)));
 return Response.json({retomados:ids.length});
}
