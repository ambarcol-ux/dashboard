import {publicServerClient,publicReply,readJson,UUID_RE,validSignature} from '@/lib/public-db';
import {signDeliveryPhotos} from '@/lib/delivery-photos';
export const dynamic='force-dynamic';
const DELIVERY='id,contrato_id,usuario_id,fotos_uris,firma_cliente,finalizado,tipo_entrega,anulada_at';

// Delivery act link: the client signs on the advisor's device or their own; all writes happen here.
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!UUID_RE.test(id))return publicReply({error:'Enlace inválido.'},400);
 try{
  const db=publicServerClient();
  const {data:bitacora,error}=await db.from('entregas_bitacora').select(DELIVERY).eq('id',id).maybeSingle();
  if(error)return publicReply({error:'No se pudo consultar la entrega.'},503);
  if(!bitacora||bitacora.anulada_at)return publicReply({error:'No se encontró el registro de entrega.'},404);
  const {data:contrato,error:contractError}=await db.from('contratos').select('*, vestidos:contrato_items_vestidos(id, vestido_id, vestido:vestidos(id, codigo))').eq('id',bitacora.contrato_id).maybeSingle();
  if(contractError||!contrato)return publicReply({error:'No se encontró el contrato de la entrega.'},404);
  // Private photos: the act shows them through temporary links (lib/delivery-photos.ts).
  return publicReply({bitacora:{...bitacora,fotos_uris:await signDeliveryPhotos(db,bitacora.fotos_uris)},contrato});
 }catch{return publicReply({error:'El servicio no está disponible.'},503);}
}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!UUID_RE.test(id))return publicReply({error:'Enlace inválido.'},400);
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 let body:{firma?:unknown;nombre?:unknown;documento?:unknown};
 try{body=await readJson(request);}catch{return publicReply({error:'Datos no válidos.'},400);}
 const nombre=String(body.nombre||'').trim(),documento=String(body.documento||'').trim();
 if(nombre.length<3||nombre.length>120||!/^[0-9A-Za-z.\-]{4,20}$/.test(documento))return publicReply({error:'Ingresa el nombre y documento de quien recibe.'},400);
 if(!validSignature(body.firma))return publicReply({error:'Firma no válida.'},400);
 try{
  const db=publicServerClient();
  const {data:bitacora,error}=await db.from('entregas_bitacora').select(DELIVERY).eq('id',id).maybeSingle();
  if(error)return publicReply({error:'No se pudo consultar la entrega.'},503);
  if(!bitacora||bitacora.anulada_at)return publicReply({error:'No se encontró el registro de entrega.'},404);
  if(bitacora.finalizado||bitacora.firma_cliente)return publicReply({error:'Esta entrega ya fue firmada.'},409);
  const {data:contrato,error:contractError}=await db.from('contratos').select('id,saldo,vestidos:contrato_items_vestidos(vestido_id)').eq('id',bitacora.contrato_id).maybeSingle();
  if(contractError||!contrato)return publicReply({error:'No se encontró el contrato de la entrega.'},404);
  // Financial lock: a contract with balance due is never marked delivered.
  if(Number(contrato.saldo)>0)return publicReply({error:`ACCIÓN BLOQUEADA: Pendiente pago de $${Number(contrato.saldo).toLocaleString('es-CO')}`},409);
  const now=new Date().toISOString();
  const {data:signed,error:signError}=await db.from('entregas_bitacora').update({firma_cliente:body.firma,finalizado:true,nombre_recibe:nombre,documento_recibe:documento}).eq('id',id).is('firma_cliente',null).select('id').maybeSingle();
  if(signError)return publicReply({error:'No se pudo guardar la firma.'},400);
  if(!signed)return publicReply({error:'Esta entrega ya fue firmada.'},409);
  const tipo=bitacora.tipo_entrega,payload:Record<string,unknown>={estado:'entregado'};
  if(tipo==='PREXV'||tipo==='AMBOS'){payload.entregado_prexv=true;payload.fecha_entrega_prexv=now;}
  if(tipo==='EVENTO'||tipo==='AMBOS'||!tipo){payload.entregado_evento=true;payload.fecha_entrega_evento=now;}
  const {error:contractUpdate}=await db.from('contratos').update(payload).eq('id',contrato.id);
  if(contractUpdate)return publicReply({error:contractUpdate.message||'La firma quedó guardada, pero no se pudo actualizar el contrato. Avisa a la sede.'},400);
  const dressIds=((contrato.vestidos||[]) as {vestido_id:string|null}[]).map(v=>v.vestido_id).filter(Boolean);
  if(dressIds.length)await db.from('vestidos').update({estado:'Alquilado'}).in('id',dressIds);
  return publicReply({ok:true});
 }catch{return publicReply({error:'El servicio no está disponible.'},503);}
}
