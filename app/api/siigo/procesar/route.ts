import {createClient} from '@supabase/supabase-js';
import {authorizedVisitWorker} from '@/lib/first-visit-worker-config';
import {processSiigoQueue} from '@/lib/siigo';
export const dynamic='force-dynamic';
export const maxDuration=60;

/** Supabase cron every 10 minutes: sends the queued documents of the stores with «Enviar a Siigo» on (lib/siigo.ts). */
export async function POST(request:Request){
 if(!authorizedVisitWorker(request))return Response.json({error:'No autorizado'},{status:401});
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 try{return Response.json(await processSiigoQueue(db));}
 catch(e){return Response.json({error:e instanceof Error?e.message:'Error de Siigo'},{status:502});}
}
