import {createClient} from '@supabase/supabase-js';
import {authorizedVisitWorker} from '@/lib/first-visit-worker-config';
import {weeklyChatAnalysis} from '@/lib/whatsapp-analysis';
export const dynamic='force-dynamic';
export const maxDuration=60;

/** Mondays 7:40 a. m. (Supabase cron): weekly analysis of the 304 chats, left in «IA de WhatsApp» › Conocimientos. */
export async function POST(request:Request){
 if(!authorizedVisitWorker(request))return Response.json({error:'No autorizado'},{status:401});
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 try{return Response.json(await weeklyChatAnalysis(db));}
 catch(e){return Response.json({error:e instanceof Error?e.message:'Error del análisis'},{status:502});}
}
