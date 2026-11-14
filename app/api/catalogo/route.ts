import {createHmac} from 'node:crypto';
import {isPublicCatalogDress} from '@/lib/catalog-public';
import {publicServerClient,publicReply,UUID_RE} from '@/lib/public-db';
import {allySlug} from '@/lib/ally-validation';
import {PROMO_FIELDS,promoApplies,promoBenefit,type Promotion} from '@/lib/promotions';
export const dynamic='force-dynamic';

/** Public catalog link (/c/[token] or fixed /[sede]/[tipo]): dresses of the saved filter with photo, size, color and rental price only, plus active promotions. */
export async function GET(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 const sp=new URL(request.url).searchParams,token=String(sp.get('t')||''),ruta=`${sp.get('s')||''}/${sp.get('k')||''}`;
 const fixed=/^[a-z0-9-]{1,60}\/[a-z0-9-]{1,60}$/.test(ruta)&&!token;
 if(!fixed&&!UUID_RE.test(token))return publicReply({error:'El enlace del catálogo no es válido.'},404);
 try{
  const db=publicServerClient();
  const ip=(request.headers.get('x-vercel-forwarded-for')||request.headers.get('x-forwarded-for')||'local').split(',')[0].trim();
  const {data:allowed}=await db.rpc('consumir_limite_publico',{p_clave:'cat:'+createHmac('sha256',process.env.SUPABASE_SERVICE_ROLE_KEY!).update(ip).digest('hex'),p_max:60,p_segundos:600});
  if(allowed!==true)return publicReply({error:'Has realizado muchas consultas. Intenta en unos minutos.'},429);
  let {data:c}=await (fixed?db.from('catalogos_publicos').select('titulo,clasificacion_id,categoria,sede_id,activo').eq('ruta',ruta):db.from('catalogos_publicos').select('titulo,clasificacion_id,categoria,sede_id,activo').eq('token',token)).maybeSingle();
  // Fixed link /[sede]/[tipo]: created on first visit from the sede and type names; it can be deactivated like any public link.
  if(!c&&fixed){
   const [{data:sedes},{data:tipos}]=await Promise.all([db.from('sedes').select('id,nombre').eq('activo',true),db.from('clasificaciones_vestido').select('id,nombre').eq('activo',true)]);
   const sede=(sedes||[]).find(x=>allySlug(x.nombre)===sp.get('s')),tipo=(tipos||[]).find(x=>allySlug(x.nombre)===sp.get('k'));
   if(sede&&tipo){const {data:n}=await db.from('catalogos_publicos').upsert({ruta,titulo:`${tipo.nombre} · ${sede.nombre}`,clasificacion_id:tipo.id,sede_id:sede.id},{onConflict:'ruta',ignoreDuplicates:true}).select('titulo,clasificacion_id,categoria,sede_id,activo').maybeSingle();
    c=n||(await db.from('catalogos_publicos').select('titulo,clasificacion_id,categoria,sede_id,activo').eq('ruta',ruta).maybeSingle()).data;}
  }
  if(!c||!c.activo)return publicReply({error:'Este catálogo ya no está disponible.'},404);
  let q=db.from('vestidos').select('codigo,nombre,talla,color,precio_sugerido,precio_venta,para_alquiler,categoria,estado,foto_frente,foto_espalda,foto_detalle,imagen_url,clasificaciones_vestido(nombre)').eq('archivado',false).order('precio_sugerido');
  if(c.clasificacion_id)q=q.eq('clasificacion_id',c.clasificacion_id);
  if(c.categoria)q=q.eq('categoria',c.categoria);
  if(c.sede_id)q=q.eq('sede_actual_id',c.sede_id);
  const {data,error}=await q;
  if(error)return publicReply({error:'El servicio no está disponible.'},503);
  // Only dresses ready to rent: with photo, rental price and marked for rent (see lib/catalog-public).
  // The internal description is not sent to customers (only code, type, size, color, rental and sale price, and photos).
  const vestidos=(data||[]).filter(isPublicCatalogDress).map(v=>({codigo:String(v.codigo).trim(),nombre:null,talla:v.talla,color:v.color,precio:v.precio_sugerido,venta:Number(v.precio_venta)>0?Number(v.precio_venta):null,
   tipo:(v.clasificaciones_vestido as {nombre?:string}|null)?.nombre||null,categoria:v.categoria,foto:v.foto_frente||v.imagen_url||v.foto_espalda||v.foto_detalle||null,fotos:[v.foto_frente||v.imagen_url||null,v.foto_espalda||null,v.foto_detalle||null]}));
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota'}).format(new Date());
  const {data:promos}=await db.from('promociones').select(PROMO_FIELDS).eq('activo',true).lte('desde',today).gte('hasta',today);
  const promociones=((promos||[]) as Promotion[]).filter(p=>promoApplies(p,{sede:c!.sede_id,tipos:[c!.clasificacion_id],categorias:[c!.categoria]},today))
   .map(p=>({nombre:p.nombre,beneficio:promoBenefit(p),hasta:p.hasta,codigo:p.codigo,condiciones:p.condiciones,categorias:p.categorias}));
  return Response.json({titulo:c.titulo,sede_id:c.sede_id,vestidos,promociones},{headers:{'Cache-Control':'public, max-age=60, s-maxage=60','Referrer-Policy':'no-referrer'}});
 }catch{return publicReply({error:'El servicio no está disponible.'},503);}
}
