import {deliveryPhotoUrls} from './delivery-photos';
import {supabase} from '@/lib/supabase';
export async function operationLink(contractId:string,type:'firma'|'entrega',deliveryId?:string){
 if(type==='entrega'&&deliveryId){
  const {data:act,error:readError}=await supabase.from('entregas_bitacora').select('fotos_paths').eq('id',deliveryId).eq('contrato_id',contractId).single();
  if(readError)throw new Error('No se pudieron consultar las fotos del acta.');
  if(act?.fotos_paths?.length){
   const urls=await deliveryPhotoUrls(act.fotos_paths);
   const {error:updateError}=await supabase.from('entregas_bitacora').update({fotos_uris:urls}).eq('id',deliveryId).eq('contrato_id',contractId);
   if(updateError)throw new Error('No se pudieron actualizar las fotos del enlace.');
  }
 }
 const {data,error}=await supabase.rpc('crear_enlace_operaciones',{p_contrato:contractId,p_tipo:type,p_entrega:deliveryId||null});
 if(error||typeof data!=='string')throw Error(error?.message||'No se pudo crear el enlace.');
 return `${window.location.origin}/${type}/${deliveryId||contractId}#token=${encodeURIComponent(data)}`;
}
export function operationToken(){return new URLSearchParams(window.location.hash.slice(1)).get('token')||'';}
