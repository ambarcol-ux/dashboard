import {createClient} from '@supabase/supabase-js';
import {allyContractToken,missingConfig} from '@/lib/ally-contract';
export const dynamic='force-dynamic';

const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const DAYS=30;

/** Private signing link for one ally (admin only, valid 30 days). */
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Solicitud no permitida.'},403);
 const bearer=request.headers.get('authorization')||'';
 if(!bearer.startsWith('Bearer '))return reply({error:'Inicia sesión.'},401);
 const body=await request.json().catch(()=>({}));
 const id=String(body?.referidor_id||'');
 if(!/^[0-9a-f-]{36}$/i.test(id))return reply({error:'Aliado no válido.'},400);
 const key=process.env.FIRST_VISIT_LINK_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY||'';
 if(!key)return reply({error:'El servidor no tiene configurados los enlaces privados.'},503);
 try{
  const userDb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:auth}=await userDb.auth.getUser(bearer.slice(7));
  if(!auth.user)return reply({error:'Inicia sesión.'},401);
  // Only administration can read the AMBAR contract data (RLS), which doubles as the permission check.
  const [{data:config},{data:ally}]=await Promise.all([userDb.from('aliados_contrato_config').select('*').eq('id',1).maybeSingle(),userDb.from('referidores').select('id').eq('id',id).maybeSingle()]);
  if(!config)return reply({error:'Solo administración puede generar el enlace del contrato.'},403);
  if(!ally)return reply({error:'Aliado no encontrado.'},404);
  const missing=missingConfig(config);
  if(missing.length)return reply({error:`Completa primero los datos de Ámbar para el contrato: ${missing.join(', ')}.`},409);
  const origin=process.env.FIRST_VISIT_PUBLIC_ORIGIN?.replace(/\/$/,'')||new URL(request.url).origin;
  return reply({link:`${origin}/aliado-contrato#${allyContractToken(id,Date.now()+DAYS*86400000,key)}`,dias:DAYS});
 }catch{return reply({error:'El servicio no está disponible.'},503);}
}
