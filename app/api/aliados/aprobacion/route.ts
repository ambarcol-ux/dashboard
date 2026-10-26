import {createClient} from '@supabase/supabase-js';
import {allyLinks} from '@/lib/direct-allies';
import {allyApprovedEmail,allyRejectedEmail,sendAllyEmail} from '@/lib/ally-emails';
export const dynamic='force-dynamic';

const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});

/** Administration: approve (code + links email), reject (notice email) or resend the links of an Active ally. */
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Solicitud no permitida.'},403);
 const bearer=request.headers.get('authorization')||'';
 if(!bearer.startsWith('Bearer '))return reply({error:'Inicia sesión.'},401);
 const body=await request.json().catch(()=>({})),id=String(body?.id||'');
 if(!/^[0-9a-f-]{36}$/i.test(id))return reply({error:'Aliado no válido.'},400);
 try{
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
  const [{data:isAdmin},{data:perms}]=await Promise.all([db.rpc('es_admin'),db.rpc('mis_permisos')]);
  const need=body.accion==='reenviar'?'aliados.gestionar':'aliados.aprobar';
  if(isAdmin!==true&&!(perms as string[]|null)?.includes(need))return reply({error:'No tienes permiso para esta acción.'},403);
  const origin=process.env.FIRST_VISIT_PUBLIC_ORIGIN?.replace(/\/$/,'')||new URL(request.url).origin;
  let a:{id:string;estado:string;codigo:string|null;token:string;nombre:string;correo:string;motivo:string|null};
  if(body.accion==='reenviar'){
   const {data,error}=await db.from('aliados').select('id,estado,codigo,token,nombre:nombre_completo,correo').eq('id',id).maybeSingle();
   if(error||!data)return reply({error:'Aliado no encontrado.'},404);
   if(data.estado!=='activo'||!data.codigo)return reply({error:'Los enlaces solo se envían a aliados Activos.'},409);
   a={...data,motivo:null};
  }else{
   const {data,error}=await db.rpc('resolver_aliado',{p_id:id,p_aprobar:body.aprobar===true,p_motivo:String(body.motivo||'').slice(0,300)});
   if(error)return reply({error:error.message},400);
   a=data;
  }
  const sent=a.estado==='activo'?await sendAllyEmail(a.correo,allyApprovedEmail({nombre:a.nombre,id:a.id,codigo:a.codigo!},allyLinks(origin,a.token))):await sendAllyEmail(a.correo,allyRejectedEmail(a.nombre,a.motivo));
  return reply({estado:a.estado,codigo:a.codigo,correo:sent});
 }catch{return reply({error:'El servicio no está disponible.'},503);}
}
