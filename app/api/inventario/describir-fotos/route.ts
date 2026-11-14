import {createClient} from '@supabase/supabase-js';
import {authorizedVisitWorker} from '@/lib/first-visit-worker-config';
import {describeDressPhotos} from '@/lib/dress-photo-match';
export const dynamic='force-dynamic';
export const maxDuration=60;

/** Every 15 minutes (Supabase cron): describes with AI the photos of visible dresses that are new or changed, so the WhatsApp AI recognizes them. */
export async function POST(request:Request){
 if(!authorizedVisitWorker(request))return Response.json({error:'No autorizado'},{status:401});
 if(!process.env.ANTHROPIC_API_KEY)return Response.json({activo:false});
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 return Response.json(await describeDressPhotos(db,25));
}
