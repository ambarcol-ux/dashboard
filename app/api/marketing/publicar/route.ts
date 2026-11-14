import {authorizedVisitWorker} from '@/lib/first-visit-worker-config';
import {publicServerClient} from '@/lib/public-db';
import {publishPiece,type Pieza} from '@/lib/content-studio';
import {loadSocialSettings} from '@/lib/social-inbox';
export const dynamic='force-dynamic';
export const maxDuration=60;

/** Supabase cron every 5 minutes: publishes the approved pieces whose time came, and finishes the ones Meta was still processing (videos). */
export async function POST(request:Request){
 if(!authorizedVisitWorker(request))return Response.json({error:'No autorizado'},{status:401});
 const db=publicServerClient();
 const {data}=await db.from('contenido_piezas').select('id,formato,redes,sede_id,texto,medios,estado,resultado,error')
  .or(`and(estado.eq.aprobada,programada_at.lte.${new Date().toISOString()}),and(estado.eq.publicando,updated_at.lt.${new Date(Date.now()-120000).toISOString()})`).order('programada_at').limit(3);
 const piezas=(data||[]) as Pieza[];
 if(!piezas.length)return Response.json({piezas:0});
 const s=await loadSocialSettings(db);
 if(!s)return Response.json({error:'Redes no conectadas'},{status:503});
 const out:Record<string,string>={};
 for(const p of piezas){
  await db.from('contenido_piezas').update({estado:'publicando',updated_at:new Date().toISOString()}).eq('id',p.id);
  try{out[p.id]=await publishPiece(db,s,p);}catch(e){out[p.id]='error';await db.from('contenido_piezas').update({estado:'error',error:(e instanceof Error?e.message:'Error').slice(0,300)}).eq('id',p.id);}
 }
 return Response.json({piezas:piezas.length,resultado:out});
}
