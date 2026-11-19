import {publicServerClient,publicReply} from '@/lib/public-db';
import {authorizedVisitWorker} from '@/lib/first-visit-worker-config';
import {siigoEnviarDocumento} from '@/lib/siigo-queue';
export const dynamic='force-dynamic';
export const maxDuration=60;

/** Called every 10 minutes by Supabase (pg_cron «siigo-facturacion»): queues new sales and signed contracts of sites with automatic billing and sends them to Siigo. */
export async function POST(request:Request){
 if(!authorizedVisitWorker(request))return publicReply({error:'No autorizado'},401);
 const db=publicServerClient(),inicio=Date.now();
 const {data:encolados,error}=await db.rpc('siigo_encolar_automatico');
 if(error)return publicReply({error:error.message},500);
 // New ones first; failed ones are retried every 30 minutes, up to 5 attempts.
 const hace30=new Date(Date.now()-30*60_000).toISOString();
 const {data:docs}=await db.from('siigo_documentos').select('id').eq('tipo','factura')
  .or(`estado.eq.pendiente,and(estado.eq.error,intentos.lt.5,updated_at.lt.${hace30})`).order('created_at').limit(15);
 const res={encolados,enviados:0,errores:[] as string[]};
 for(const d of docs||[]){
  if(Date.now()-inicio>45_000)break;
  const r=await siigoEnviarDocumento(db,d.id);
  if(r.ok)res.enviados++;else if(r.status!==409)res.errores.push(r.error);
 }
 return publicReply(res);
}
