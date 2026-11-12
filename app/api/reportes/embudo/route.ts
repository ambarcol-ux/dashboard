import {createClient} from '@supabase/supabase-js';
import {authorizedVisitWorker} from '@/lib/first-visit-worker-config';
import {weeklyFunnelReport} from '@/lib/funnel-analysis';
export const dynamic='force-dynamic';
export const maxDuration=60;

/** Mondays 7:20 a. m. (Supabase cron) or «Generar ahora» from Reportes (administrators only). */
export async function POST(request:Request){
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 if(!authorizedVisitWorker(request)){
  const bearer=request.headers.get('authorization')||'';
  if(!bearer.startsWith('Bearer '))return Response.json({error:'No autorizado'},{status:401});
  const userDb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:admin}=await userDb.rpc('es_admin');
  if(admin!==true)return Response.json({error:'Solo administración puede generar el reporte.'},{status:403});
 }
 try{return Response.json(await weeklyFunnelReport(db));}
 catch(e){return Response.json({error:e instanceof Error?e.message:'Error del reporte'},{status:502});}
}
