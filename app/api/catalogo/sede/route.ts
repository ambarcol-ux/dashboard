import {createHmac} from 'node:crypto';
import {isPublicCatalogDress,type CatalogDress} from '@/lib/catalog-public';
import {publicServerClient,publicReply} from '@/lib/public-db';
import {allySlug} from '@/lib/ally-validation';
export const dynamic='force-dynamic';

/** Public page /[sede]: dress types of a store with dresses visible to customers (same rule as the catalog), with a cover photo and how many there are. */
export async function GET(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 const slug=String(new URL(request.url).searchParams.get('s')||'').toLowerCase();
 if(!/^[a-z0-9-]{1,60}$/.test(slug))return publicReply({error:'El enlace del catálogo no es válido.'},404);
 try{
  const db=publicServerClient();
  const ip=(request.headers.get('x-vercel-forwarded-for')||request.headers.get('x-forwarded-for')||'local').split(',')[0].trim();
  const {data:allowed}=await db.rpc('consumir_limite_publico',{p_clave:'cat:'+createHmac('sha256',process.env.SUPABASE_SERVICE_ROLE_KEY!).update(ip).digest('hex'),p_max:60,p_segundos:600});
  if(allowed!==true)return publicReply({error:'Has realizado muchas consultas. Intenta en unos minutos.'},429);
  const [{data:sedes},{data:tipos}]=await Promise.all([db.from('sedes').select('id,nombre').eq('activo',true),db.from('clasificaciones_vestido').select('id,nombre').eq('activo',true).order('nombre')]);
  const sede=(sedes||[]).find(s=>allySlug(s.nombre)===slug);
  if(!sede)return publicReply({error:'No encontramos esa sede.'},404);
  const {data,error}=await db.from('vestidos').select('clasificacion_id,precio_sugerido,para_alquiler,estado,foto_frente,foto_espalda,foto_detalle,imagen_url').eq('archivado',false).eq('sede_actual_id',sede.id).order('precio_sugerido',{ascending:false});
  if(error)return publicReply({error:'El servicio no está disponible.'},503);
  const visibles=((data||[]) as (CatalogDress&{clasificacion_id:number|null})[]).filter(isPublicCatalogDress);
  const lista=(tipos||[]).map(t=>{const del=visibles.filter(v=>v.clasificacion_id===t.id);const p=del[0];
   return {nombre:t.nombre,slug:allySlug(t.nombre),cantidad:del.length,portada:p?(p.foto_frente||p.imagen_url||p.foto_espalda||p.foto_detalle||null):null};}).filter(t=>t.cantidad>0).sort((a,b)=>b.cantidad-a.cantidad);
  return Response.json({sede:{id:sede.id,nombre:sede.nombre},tipos:lista},{headers:{'Cache-Control':'public, max-age=60, s-maxage=60','Referrer-Policy':'no-referrer'}});
 }catch{return publicReply({error:'El servicio no está disponible.'},503);}
}
