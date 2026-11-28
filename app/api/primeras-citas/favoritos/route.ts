import {createClient} from '@supabase/supabase-js';
import {publicServerClient,publicReply,UUID_RE} from '@/lib/public-db';
import {favoritesLink,verifyFavoritesLink} from '@/lib/first-visit-links';
import {availabilityAnswer} from '@/lib/dress-availability';
export const dynamic='force-dynamic';

const key=()=>process.env.FIRST_VISIT_LINK_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const DIAS=45;

/** Seguimiento experto (fase 2 · D): favorites of a visit for whoever decides.
 *  · {id} with the advisor's session: signed link (45 days) to share. The visit must be visible to her (same access as Primeras visitas).
 *  · {token}: public read of that visit's favorite dresses (photo, price, availability for her event date). Nothing else of the ERP. */
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 const body=await request.json().catch(()=>({})) as {id?:string;token?:string};
 try{
  if(body.id){
   const bearer=request.headers.get('authorization')||'';if(!bearer.startsWith('Bearer ')||!UUID_RE.test(body.id))return publicReply({error:'Inicia sesión.'},401);
   const userDb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
   const {data:c}=await userDb.from('primeras_citas').select('id,favoritos').eq('id',body.id).maybeSingle();
   if(!c)return publicReply({error:'No tienes acceso a esta visita.'},403);
   if(!(c.favoritos as string[]|null)?.length)return publicReply({error:'Primero registra los vestidos que se midió.'},400);
   return publicReply({enlace:favoritesLink(new URL(request.url).origin,c.id as string,Date.now()+DIAS*86400000,key())});
  }
  const v=verifyFavoritesLink(String(body.token||''),key());
  if(!v)return publicReply({error:'El enlace no es válido o ya venció. Pídele uno nuevo a tu asesora.'},404);
  const db=publicServerClient();
  const {data:c}=await db.from('primeras_citas').select('id,cliente_nombre,sede_id,fecha_evento,favoritos,tipo_vestido').eq('id',v.id).maybeSingle();
  if(!c)return publicReply({error:'El enlace no es válido.'},404);
  const cods=((c.favoritos||[]) as string[]).slice(0,3);
  const [{data:s},{data:ves}]=await Promise.all([
   db.from('sedes').select('nombre').eq('id',c.sede_id).maybeSingle(),
   cods.length?db.from('vestidos').select('id,codigo,nombre,color,talla,precio_sugerido,foto_frente,imagen_url,foto_espalda,foto_detalle,sede_actual_id,sede_principal_id,archivado,estado').or(`sede_actual_id.eq.${c.sede_id},sede_principal_id.eq.${c.sede_id}`).or(cods.map(x=>`codigo.ilike.${x.replace(/[^A-Za-z0-9-]/g,'')}`).join(',')):Promise.resolve({data:[]}),
  ]);
  type V={id:string;codigo:string;nombre:string|null;color:string|null;talla:string|null;precio_sugerido:number|null;foto_frente:string|null;imagen_url:string|null;foto_espalda:string|null;foto_detalle:string|null;archivado:boolean|null;estado:string|null};
  const lista=((ves||[]) as V[]).filter(x=>cods.includes(String(x.codigo).trim().toUpperCase())&&!x.archivado);
  const fecha=c.fecha_evento as string|null;
  const vestidos=await Promise.all(cods.map(async cod=>{
   const x=lista.find(y=>String(y.codigo).trim().toUpperCase()===cod);if(!x)return null;
   const foto=[x.foto_frente,x.imagen_url,x.foto_espalda,x.foto_detalle].find(u=>u&&/^https:\/\//.test(u))||null;
   let disponible:boolean|null=null;
   if(/vendido|baja/i.test(String(x.estado||'')))disponible=false;
   else if(fecha){const r=await availabilityAnswer(db,{fecha,vestidoId:x.id});disponible='error' in r?null:r.disponible;}
   return {codigo:x.codigo,nombre:x.nombre,color:x.color,talla:x.talla,precio:x.precio_sugerido,foto,disponible};
  }));
  return publicReply({nombre:String(c.cliente_nombre||'').trim().split(/\s+/)[0]||'',sede:s?.nombre||'',sede_id:c.sede_id,fecha,vestidos:vestidos.filter(Boolean)});
 }catch{return publicReply({error:'El servicio no está disponible.'},503);}
}
