import {createClient} from '@supabase/supabase-js';
import {randomInt} from 'node:crypto';
export const dynamic='force-dynamic';

const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const tempPassword=()=>Array.from({length:12},()=>ALPHABET[randomInt(ALPHABET.length)]).join('');

/** Creates the supplier's portal login (role 'proveedor') and links it on the supplier file. Admin only. */
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Solicitud no permitida.'},403);
 const bearer=request.headers.get('authorization')||'';
 if(!bearer.startsWith('Bearer '))return reply({error:'Inicia sesión.'},401);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,service=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!service)return reply({error:'El servidor no tiene configurada la llave de servicio.'},503);
 try{
  const body=await request.json().catch(()=>({}));
  const id=String(body?.proveedor_id||'');
  if(!/^[0-9a-f-]{36}$/i.test(id))return reply({error:'Proveedor no válido.'},400);
  // Read the supplier as the signed-in user: RLS only lets administration see it.
  const userDb=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:auth}=await userDb.auth.getUser(bearer.slice(7));
  if(!auth.user)return reply({error:'Inicia sesión.'},401);
  const {data:supplier}=await userDb.from('proveedores').select('id,nombre,correo,usuario_id,estado').eq('id',id).maybeSingle();
  if(!supplier)return reply({error:'Solo administración puede crear usuarios de proveedores.'},403);
  if(supplier.usuario_id)return reply({error:'Este proveedor ya tiene usuario.'},409);
  if(supplier.estado!=='Activo')return reply({error:'Activa el proveedor antes de crearle acceso.'},400);
  const email=String(supplier.correo||'').trim().toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return reply({error:'Guarda un correo válido en la ficha del proveedor.'},400);

  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:taken}=await db.from('profiles').select('id').ilike('email',email).maybeSingle();
  if(taken)return reply({error:'Ese correo ya pertenece a otro usuario del ERP. Usa un correo distinto para el proveedor.'},409);
  const password=tempPassword();
  const created=await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{nombre:supplier.nombre,rol:'proveedor'}});
  if(created.error||!created.data.user)return reply({error:created.error?.message?.includes('already')?'Ese correo ya tiene una cuenta. Usa otro correo.':'No se pudo crear la cuenta.'},400);
  const userId=created.data.user.id;
  const profile=await db.from('profiles').upsert({id:userId,email,nombre:supplier.nombre,rol:'proveedor',activo:true,sede_id:null});
  const link=profile.error?null:await db.from('proveedores').update({usuario_id:userId}).eq('id',id).is('usuario_id',null).select('id');
  if(profile.error||link?.error||!link?.data?.length){
   await db.auth.admin.deleteUser(userId); // roll back the half-created login
   return reply({error:'No se pudo enlazar el usuario. Intenta de nuevo.'},500);
  }
  return reply({ok:true,password});
 }catch{return reply({error:'No se pudo crear el usuario. Intenta de nuevo.'},503);}
}
