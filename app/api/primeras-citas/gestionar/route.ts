import {createClient} from '@supabase/supabase-js';
import {verifyVisitLink,verifyRescheduleLink,visitManagementLink} from '@/lib/first-visit-links';
import {scheduleVisitEmails} from '@/lib/first-visit-email';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
function key(){return process.env.FIRST_VISIT_LINK_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY||'';}
function server(){const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!secret||secret==='[SENSITIVE]')throw Error('No configurado');return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,secret,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(15000)})}});}
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Solicitud no permitida.'},403);
 try{
  const raw=await request.text();if(raw.length>4096)return reply({error:'Solicitud demasiado grande.'},413);
  const body=JSON.parse(raw);
  if(body.accion==='enlace'){
   // Verify user and enforce the existing site RLS before issuing a customer link.
   const bearer=request.headers.get('authorization')||'';
   if(!bearer.startsWith('Bearer '))return reply({error:'Inicia sesión.'},401);
   const userDb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
   const {data:auth,error:authError}=await userDb.auth.getUser(bearer.slice(7));
   if(authError||!auth.user)return reply({error:'Inicia sesión.'},401);
   const {data,error}=await userDb.from('primeras_citas').select('id,fecha').eq('id',String(body.id)).single();
   if(error||!data)return reply({error:'No tienes acceso a esta cita.'},403);
   const expires=Math.max(Date.now()+30*86400000,Date.parse(data.fecha+'T23:59:59-05:00')+30*86400000);
   return reply({enlace:visitManagementLink(new URL(request.url).origin,data.id,expires,key())});
  }
  const limited=verifyRescheduleLink(String(body.token||''),key());
  const token=limited||verifyVisitLink(String(body.token||''),key());
  if(limited&&!['consultar','reprogramar'].includes(body.accion))return reply({error:'Esta consulta solo permite reprogramar la cita.'},403);
  if(!token)return reply({error:'El enlace venció o no es válido. Solicita uno nuevo a la sede.'},403);
  if(!['consultar','confirmar','reprogramar','cancelar','respuesta'].includes(body.accion))return reply({error:'Acción no permitida.'},400);
  const {data,error}=await server().rpc('accion_cliente_primera_cita',{p_id:token.id,p_accion:body.accion,p_datos:body.datos||{}});
  if(error){
   // Only controlled PL/pgSQL business errors, never provider/internal diagnostics.
   return reply({error:error.code==='P0001'?error.message:'No se pudo actualizar. Revisa la fecha y el horario.'},400);
  }
  if(body.accion!=='consultar')scheduleVisitEmails(new URL(request.url).origin,token.id);
  if(limited&&body.accion==='consultar')return reply({fecha:data.fecha,hora:data.hora,modalidad:data.modalidad,sede_id:data.sede_id,sede:data.sede,estado:data.estado,version:data.version,solo_reprogramar:true});
  return reply(data);
 }catch{return reply({error:'No pudimos procesar la solicitud. Intenta nuevamente.'},503);}
}
