import {createClient} from '@supabase/supabase-js';
import {deliverVisitEmails,visitEmailConfigured} from '@/lib/first-visit-email';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
// Staff changes are saved through RLS-protected RPCs; this sends the emails they queued.
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Solicitud no permitida.'},403);
 const bearer=request.headers.get('authorization')||'';
 if(!bearer.startsWith('Bearer '))return reply({error:'Inicia sesión.'},401);
 try{
  const body=JSON.parse((await request.text()).slice(0,1024));
  if(!/^[0-9a-f-]{36}$/i.test(String(body.id)))return reply({error:'Cita no válida.'},400);
  const userDb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:auth,error:authError}=await userDb.auth.getUser(bearer.slice(7));
  if(authError||!auth.user)return reply({error:'Inicia sesión.'},401);
  const {data,error}=await userDb.from('primeras_citas').select('id').eq('id',String(body.id)).single();
  if(error||!data)return reply({error:'No tienes acceso a esta cita.'},403);
  if(!visitEmailConfigured())return reply({configurado:false,enviados:0,fallidos:0});
  return reply({configurado:true,...await deliverVisitEmails(new URL(request.url).origin,{cita:data.id})});
 }catch{return reply({error:'No se pudo enviar la notificación por correo.'},503);}
}
