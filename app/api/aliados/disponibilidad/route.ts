import {publicServerClient,publicReply,readJson,UUID_RE} from '@/lib/public-db';
import {generateBlockedRanges,rangesOverlap} from '@/lib/availability';
export const dynamic='force-dynamic';

const CANCELLED='("cancelado","rechazado","anulado","borrador","CANCELADO","RECHAZADO","ANULADO","BORRADOR")';

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
  if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha))return publicReply({error:'Elige la fecha.'},400);
  if(!codigo&&!categoria)return publicReply({error:'Escribe la referencia del vestido o elige una categoría.'},400);
  let q=db.from('vestidos').select('id,codigo,stock_total,estado').eq('archivado',false);
  q=codigo?q.ilike('codigo',codigo):q.eq('clasificacion_id',categoria!);
  const {data:dresses}=await q;
  const usable=(dresses||[]).filter(d=>!/baja/i.test(String(d.estado||'')));
  if(codigo&&!usable.length)return publicReply({error:'No encontramos esa referencia.'},404);
  // Same blocking rules as the contract form (lib/availability), applied to the requested event date.
  const [wanted]=generateBlockedRanges([{id:'consulta',numero_contrato:'',cliente_nombre:'',estado:'',tipo_evento:'Evento',fecha_evento:fecha}]);
  let disponible=false;
  if(usable.length){
   const {data:items}=await db.from('contrato_items_vestidos').select('vestido_id,contratos!inner(id,numero_contrato,cliente_nombre,estado,tipo_evento,fecha_evento,fecha_pre_xv,fechas_bloqueo_especial,bloqueo_especial_fecha,bloqueo_especial_vestido_id)').in('vestido_id',usable.map(d=>d.id)).not('contratos.estado','in',CANCELLED);
   disponible=usable.some(d=>{const busy=generateBlockedRanges((items||[]).filter(i=>i.vestido_id===d.id)).filter(b=>rangesOverlap(b,wanted)).length;return busy<Math.max(1,Number(d.stock_total)||1);});
  }
  const nombreCategoria=categoria?(await db.from('clasificaciones_vestido').select('nombre').eq('id',categoria).maybeSingle()).data?.nombre||null:null;
  await db.from('aliado_consultas').insert({aliado_id:ally.id,vestido:codigo||null,categoria:codigo?null:nombreCategoria,fecha,disponible});
  return publicReply({disponible});
 }catch{return publicReply({error:'El servicio no está disponible.'},503);}
}
