import {publicServerClient,publicReply,readJson,UUID_RE,validSignature} from '@/lib/public-db';
import {INVOICE_REQUIRED_MESSAGE} from '@/lib/invoice-validation';
import {CONTRACT_EXTRAS_SELECT} from '@/lib/contract-extras';
export const dynamic='force-dynamic';
const CONTRACT=`*, quinceanera_name, arreglos(*), vestidos:contrato_items_vestidos(*, vestido:vestidos(*)), ${CONTRACT_EXTRAS_SELECT}`;

// The signing link carries the contract id; the browser no longer reads or writes contracts directly.
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!UUID_RE.test(id))return publicReply({error:'Enlace inválido.'},400);
 try{
  const db=publicServerClient();
  const [{data,error},{data:plantillas,error:templateError}]=await Promise.all([
   db.from('contratos').select(CONTRACT).eq('id',id).maybeSingle(),
   // The clauses are rendered with the contract, so they travel with it.
   db.from('plantillas_contratos').select('*').order('numero_orden',{ascending:true}),
  ]);
  if(error||templateError)return publicReply({error:'No se pudo consultar el contrato.'},503);
  if(!data)return publicReply({error:'Contrato no encontrado.'},404);
  return publicReply({...data,plantillas:plantillas||[]});
 }catch{return publicReply({error:'El servicio no está disponible.'},503);}
}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!UUID_RE.test(id))return publicReply({error:'Enlace inválido.'},400);
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 let firma:unknown;
 try{firma=(await readJson(request)).firma;}catch{return publicReply({error:'Firma no válida.'},400);}
 if(!validSignature(firma))return publicReply({error:'Firma no válida.'},400);
 try{
  const db=publicServerClient();
  const {data:contract,error}=await db.from('contratos').select('id,estado,numero_factura,fecha_disponibilidad_real').eq('id',id).maybeSingle();
  if(error)return publicReply({error:'No se pudo consultar el contrato.'},503);
  if(!contract)return publicReply({error:'Contrato no encontrado.'},404);
  if(String(contract.estado).toLowerCase()==='firmado')return publicReply({error:'El contrato ya fue firmado.'},409);
  if(!String(contract.numero_factura||'').trim())return publicReply({error:INVOICE_REQUIRED_MESSAGE},409);
  const signedAt=new Date().toISOString();
  // Only an unsigned contract changes, so two submissions cannot overwrite a signature.
  const {data:saved,error:updateError}=await db.from('contratos').update({estado:'firmado',firma_base64:firma,fecha_firma_cliente:signedAt}).eq('id',id).neq('estado','firmado').select('id').maybeSingle();
  if(updateError)return publicReply({error:updateError.message||'No se pudo guardar la firma.'},400);
  if(!saved)return publicReply({error:'El contrato ya fue firmado.'},409);
  await db.from('bitacora_contratos').insert({contrato_id:id,accion:'Bloqueo de Inventario',detalle:`Bloqueo de inventario programado hasta el ${contract.fecha_disponibilidad_real||'N/A'} por mantenimiento (Post-Firma).`});
  return publicReply({ok:true,firma_base64:firma,fecha_firma_cliente:signedAt});
 }catch{return publicReply({error:'El servicio no está disponible.'},503);}
}
