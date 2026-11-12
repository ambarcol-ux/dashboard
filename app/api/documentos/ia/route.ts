import {createClient} from '@supabase/supabase-js';
import {authorizedVisitWorker} from '@/lib/first-visit-worker-config';
import {readDocumentForAI,type DocPendiente} from '@/lib/doc-ia';
import {publicReply,UUID_RE} from '@/lib/public-db';
export const dynamic='force-dynamic';
export const maxDuration=60;

/** Documentos de la marca → IA: the daily task (7:20 a. m.) reads new documents; after an upload the screen asks for that document right away. */
export async function POST(request:Request){
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 if(!process.env.ANTHROPIC_API_KEY)return publicReply({error:'Falta ANTHROPIC_API_KEY en Vercel.'},503);
 const {data:pend,error}=await db.rpc('documentos_ia_pendientes',{p_limite:20});
 if(error)return publicReply({error:error.message},500);
 let lista=(pend||[]) as DocPendiente[];
 if(!authorizedVisitWorker(request)){
  // From the screen: only a document the user can see (RLS), and only if it is pending.
  if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
  const bearer=request.headers.get('authorization')||'';if(!bearer.startsWith('Bearer '))return publicReply({error:'Inicia sesión.'},401);
  const body=await request.json().catch(()=>({})) as {archivo_id?:string};
  if(!UUID_RE.test(String(body.archivo_id||'')))return publicReply({error:'Documento no válido.'},400);
  const userDb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:visible}=await userDb.from('doc_archivos').select('id').eq('id',body.archivo_id!).maybeSingle();
  if(!visible)return publicReply({error:'No tienes acceso a este documento.'},403);
  lista=lista.filter(d=>d.id===body.archivo_id);
 }
 const resultados:Record<string,string>={};const inicio=Date.now();
 for(const d of lista){if(Date.now()-inicio>40000)break;resultados[d.nombre]=await readDocumentForAI(db,d);}
 return publicReply({leidos:Object.keys(resultados).length,resultados});
}
