/* eslint-disable @typescript-eslint/no-explicit-any */
import type {SupabaseClient} from '@supabase/supabase-js';
import {siigoEnviarFactura,type SiigoCred,type SiigoParams} from '@/lib/siigo';

/** Sends one queued Siigo document (service-role client) and writes the invoice number back to the sale or contract. */
export async function siigoEnviarDocumento(db:SupabaseClient,id:string):Promise<{ok:true;numero:string}|{ok:false;error:string;status:number}>{
 const {data:d}=await db.from('siigo_documentos').select('id,sede_id,tipo,origen,origen_id,contrato_id,datos,estado,intentos,updated_at').eq('id',id).maybeSingle();
 if(!d)return {ok:false,error:'Documento no disponible.',status:404};
 if(d.tipo!=='factura')return {ok:false,error:'Por ahora solo se envían facturas.',status:400};
 if(d.estado==='enviado'||d.estado==='anulado')return {ok:false,error:d.estado==='enviado'?'Ya se envió a Siigo.':'Documento anulado.',status:409};
 // Claim it so two senders never create two invoices.
 const now=()=>new Date().toISOString();
 const {data:claim}=await db.from('siigo_documentos').update({intentos:d.intentos+1,updated_at:now()}).eq('id',d.id).eq('updated_at',d.updated_at).in('estado',['pendiente','error']).select('id');
 if(!claim?.length)return {ok:false,error:'Este documento se está enviando. Espera un momento.',status:409};
 const fail=async(msg:string)=>{await db.from('siigo_documentos').update({estado:'error',error:msg.slice(0,1000),updated_at:now()}).eq('id',d.id);
  if(d.origen==='venta')await db.from('ventas_vestidos').update({siigo_estado:'error'}).eq('id',d.origen_id);
  return {ok:false as const,error:msg,status:400};};
 const {data:c}=await db.rpc('siigo_credencial_servidor',{p_sede_id:d.sede_id});
 if(!c?.access_key)return fail('Esta sede no tiene credenciales de Siigo.');
 try{
  const r=await siigoEnviarFactura(c as SiigoCred,((c as any).parametros||{}) as SiigoParams,d as any);
  await db.from('siigo_documentos').update({estado:'enviado',error:null,siigo_id:r.id,siigo_numero:r.numero,respuesta:r.respuesta,enviado_at:now(),updated_at:now()}).eq('id',d.id);
  if(d.origen==='venta')await db.from('ventas_vestidos').update({siigo_estado:'enviada',numero_factura:r.numero.slice(0,40)||null}).eq('id',d.origen_id);
  if(d.contrato_id&&r.numero)await db.from('contratos').update({numero_factura:r.numero,factura_registrada_at:now()}).eq('id',d.contrato_id);
  return {ok:true,numero:r.numero};
 }catch(e){return fail(e instanceof Error?e.message:'No se pudo enviar a Siigo.');}
}
