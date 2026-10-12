import {createClient} from '@supabase/supabase-js';
import {claimVisitEmails} from '@/lib/first-visit-email';
import {authorizedVisitWorker} from '@/lib/first-visit-worker-config';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
function server(){
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key||key==='[SENSITIVE]'||!process.env.NEXT_PUBLIC_SUPABASE_URL)throw Error('No configurado');
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})}});
}
// Apps Script sends customer change emails from Gmail: it claims rendered emails here, then reports each result.
export async function POST(request:Request){
 if(!authorizedVisitWorker(request))return reply({error:'No autorizado'},401);
 try{
  const body=JSON.parse((await request.text()).slice(0,4096)||'{}');
  const db=server();
  if(body.accion==='tomar'){
   const origin=process.env.FIRST_VISIT_PUBLIC_ORIGIN||new URL(request.url).origin;
   const correos=await claimVisitEmails(db,origin,process.env.FIRST_VISIT_LINK_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY!,Math.min(20,Math.max(1,Number(body.limite)||10)));
   return reply({correos});
  }
  if(body.accion==='resultado'){
   if(!/^[0-9a-f-]{36}$/i.test(String(body.id)))return reply({error:'Correo no válido.'},400);
   const sent=body.enviado===true;
   const {error}=await db.from('primeras_citas_correos').update({estado:sent?'enviado':'error',error:sent?null:String(body.error||'Gmail no pudo enviar el correo.').slice(0,300),updated_at:new Date().toISOString()}).eq('id',String(body.id)).eq('estado','enviando');
   if(error)return reply({error:'No se pudo registrar el resultado.'},503);
   return reply({ok:true});
  }
  return reply({error:'Acción no permitida.'},400);
 }catch{return reply({error:'La cola de correos no está disponible.'},503);}
}
