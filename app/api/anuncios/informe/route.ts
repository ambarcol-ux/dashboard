import {createClient} from '@supabase/supabase-js';
import {authorizedVisitWorker} from '@/lib/first-visit-worker-config';
import {dailyAdsAnalysis} from '@/lib/ads-analysis';
export const dynamic='force-dynamic';
export const maxDuration=60;

/** Every day 7:10 a. m. (Supabase cron): AI report of the Meta ads, seen in WhatsApp 304 › Anuncios. */
export async function POST(request:Request){
 if(!authorizedVisitWorker(request))return Response.json({error:'No autorizado'},{status:401});
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 try{return Response.json(await dailyAdsAnalysis(db));}
 catch(e){return Response.json({error:e instanceof Error?e.message:'Error del informe'},{status:502});}
}
