import {publicServerClient,publicReply,readJson,UUID_RE} from '@/lib/public-db';
import {availabilityAnswer} from '@/lib/dress-availability';
export const dynamic='force-dynamic';

/** Read-only availability for an Active ally (token): by dress code or category and date. No client, contract or price data; every query is logged. */
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 let body:Record<string,unknown>;
 try{body=await readJson(request,4096);}catch{return publicReply({error:'Datos no válidos.'},400);}
 const token=String(body.token||'');
 if(!UUID_RE.test(token))return publicReply({error:'El enlace no es válido.'},404);
 try{
  const db=publicServerClient();
  const {data:ally}=await db.from('aliados').select('id,nombre_completo').eq('token',token).eq('estado','activo').maybeSingle();
  if(!ally)return publicReply({error:'El enlace no es válido o el aliado no está activo.'},404);
  if(body.accion!=='consultar'){
   const {data}=await db.from('clasificaciones_vestido').select('id,nombre').eq('activo',true).order('orden');
   return publicReply({aliado:ally.nombre_completo,categorias:data||[]});
  }
  const fecha=String(body.fecha||''),codigo=String(body.vestido||'').trim().toUpperCase(),categoria=Number(body.categoria)||null;
  const r=await availabilityAnswer(db,{fecha,codigo,categoria});
  if('error' in r)return publicReply({error:r.error},r.status);
  const {disponible,nombreCategoria}=r;
  await db.from('aliado_consultas').insert({aliado_id:ally.id,vestido:codigo||null,categoria:codigo?null:nombreCategoria,fecha,disponible});
  return publicReply({disponible});
 }catch{return publicReply({error:'El servicio no está disponible.'},503);}
}
