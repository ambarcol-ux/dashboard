import {createHmac} from 'node:crypto';
import {isPublicCatalogDress} from '@/lib/catalog-public';
import {publicServerClient,publicReply,UUID_RE} from '@/lib/public-db';
export const dynamic='force-dynamic';

/** Catalog for allies.
 *  · ?t=<ally token> (private, active ally): every store, with rental and sale price and the ally's price (aliado_descuento_pct off),
 *    plus the link without prices to share with their clients.
 *  · ?c=<catalogo_token> (the ally's clients): photos, type, size and color only. No prices, no Ámbar brand or contact: the contact is the ally.
 *  ?s=<store id> and ?k=<type id> filter. */
export async function GET(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 const sp=new URL(request.url).searchParams,t=String(sp.get('t')||''),c=String(sp.get('c')||''),privado=!!t;
 if(!UUID_RE.test(privado?t:c))return publicReply({error:'El enlace del catálogo no es válido.'},404);
 const sede=sp.get('s')||'',tipo=Number(sp.get('k'))||null;
 try{
  const db=publicServerClient();
  const ip=(request.headers.get('x-vercel-forwarded-for')||request.headers.get('x-forwarded-for')||'local').split(',')[0].trim();
  const {data:allowed}=await db.rpc('consumir_limite_publico',{p_clave:'catal:'+createHmac('sha256',process.env.SUPABASE_SERVICE_ROLE_KEY!).update(ip).digest('hex'),p_max:60,p_segundos:600});
  if(allowed!==true)return publicReply({error:'Has realizado muchas consultas. Intenta en unos minutos.'},429);
  const {data:ally}=await db.from('aliados').select('id,nombre_completo,nombre_comercial,celular,catalogo_token').eq(privado?'token':'catalogo_token',privado?t:c).eq('estado','activo').maybeSingle();
  if(!ally)return publicReply({error:'Este catálogo ya no está disponible.'},404);
  const [{data:sedes},{data:tipos},{data:pct}]=await Promise.all([
   db.from('sedes').select('id,nombre').eq('activo',true).order('nombre'),
   db.from('clasificaciones_vestido').select('id,nombre').eq('activo',true).order('orden'),
   db.from('config_parametros').select('valor').eq('clave','aliado_descuento_pct').maybeSingle()]);
  let q=db.from('vestidos').select('codigo,talla,color,precio_sugerido,precio_venta,para_alquiler,categoria,estado,sede_actual_id,clasificacion_id,foto_frente,foto_espalda,foto_detalle,imagen_url').eq('archivado',false).order('precio_sugerido');
  if(UUID_RE.test(sede))q=q.eq('sede_actual_id',sede);
  if(tipo)q=q.eq('clasificacion_id',tipo);
  const {data,error}=await q;
  if(error)return publicReply({error:'El servicio no está disponible.'},503);
  const desc=Number(pct?.valor)||0,sedeNom=new Map((sedes||[]).map(s=>[s.id,s.nombre])),tipoNom=new Map((tipos||[]).map(x=>[x.id,x.nombre]));
  // Same rule as the public catalog: only dresses ready to rent (photo, rental price, marked for rent).
  const vestidos=(data||[]).filter(isPublicCatalogDress).map(v=>({codigo:String(v.codigo).trim(),talla:v.talla,color:v.color,tipo:tipoNom.get(v.clasificacion_id)||null,
   sede:sedeNom.get(v.sede_actual_id)||null,foto:v.foto_frente||v.imagen_url||v.foto_espalda||v.foto_detalle||null,fotos:[v.foto_frente||v.imagen_url||null,v.foto_espalda||null,v.foto_detalle||null],
   ...(privado?{categoria:v.categoria,precio:Number(v.precio_sugerido)||null,precio_aliado:Number(v.precio_sugerido)?Math.round(Number(v.precio_sugerido)*(100-desc)/100):null,venta:Number(v.precio_venta)>0?Number(v.precio_venta):null}:{})}));
  const base={sedes:sedes||[],tipos:tipos||[],vestidos};
  const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'};
  if(privado){
   const origin=new URL(request.url).origin;
   return Response.json({...base,aliado:ally.nombre_comercial||ally.nombre_completo,descuento:desc,enlace_clientas:`${origin}/catalogo/${ally.catalogo_token}`},{headers});
  }
  // The ally's clients: the ally's business name and WhatsApp, nothing from Ámbar.
  const cel=String(ally.celular||'').replace(/\D/g,'');
  return Response.json({...base,titulo:ally.nombre_comercial||'Catálogo de vestidos',whatsapp:cel.length===10?`57${cel}`:cel.length>=11?cel:null},{headers});
 }catch{return publicReply({error:'El servicio no está disponible.'},503);}
}
