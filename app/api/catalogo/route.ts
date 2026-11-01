import {createHmac} from 'node:crypto';
import {publicServerClient,publicReply,UUID_RE} from '@/lib/public-db';
export const dynamic='force-dynamic';

/** Public catalog link (/c/[token]): dresses of the saved filter with photo, size, color and rental price only. */
export async function GET(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 const token=String(new URL(request.url).searchParams.get('t')||'');
 if(!UUID_RE.test(token))return publicReply({error:'El enlace del catálogo no es válido.'},404);
 try{
  const db=publicServerClient();
  const ip=(request.headers.get('x-vercel-forwarded-for')||request.headers.get('x-forwarded-for')||'local').split(',')[0].trim();
  const {data:allowed}=await db.rpc('consumir_limite_publico',{p_clave:'cat:'+createHmac('sha256',process.env.SUPABASE_SERVICE_ROLE_KEY!).update(ip).digest('hex'),p_max:60,p_segundos:600});
  if(allowed!==true)return publicReply({error:'Has realizado muchas consultas. Intenta en unos minutos.'},429);
  const {data:c}=await db.from('catalogos_publicos').select('titulo,clasificacion_id,categoria,sede_id,activo').eq('token',token).maybeSingle();
  if(!c||!c.activo)return publicReply({error:'Este catálogo ya no está disponible.'},404);
  let q=db.from('vestidos').select('codigo,nombre,talla,color,precio_sugerido,categoria,estado,foto_frente,foto_espalda,foto_detalle,imagen_url,clasificaciones_vestido(nombre)').eq('archivado',false).order('precio_sugerido');
  if(c.clasificacion_id)q=q.eq('clasificacion_id',c.clasificacion_id);
  if(c.categoria)q=q.eq('categoria',c.categoria);
  if(c.sede_id)q=q.eq('sede_actual_id',c.sede_id);
  const {data,error}=await q;
  if(error)return publicReply({error:'El servicio no está disponible.'},503);
  const vestidos=(data||[]).filter(v=>!/vendido|baja/i.test(String(v.estado||''))).map(v=>({codigo:String(v.codigo).trim(),nombre:v.nombre,talla:v.talla,color:v.color,precio:v.precio_sugerido,
   tipo:(v.clasificaciones_vestido as {nombre?:string}|null)?.nombre||null,categoria:v.categoria,foto:v.foto_frente||v.imagen_url||v.foto_espalda||v.foto_detalle||null,fotos:[v.foto_frente||v.imagen_url||null,v.foto_espalda||null,v.foto_detalle||null]}));
  return Response.json({titulo:c.titulo,vestidos},{headers:{'Cache-Control':'public, max-age=60, s-maxage=60','Referrer-Policy':'no-referrer'}});
 }catch{return publicReply({error:'El servicio no está disponible.'},503);}
}
