import type {publicServerClient} from '@/lib/public-db';
import {generateBlockedRanges,rangesOverlap} from '@/lib/availability';

const CANCELLED='("cancelado","rechazado","anulado","borrador","CANCELADO","RECHAZADO","ANULADO","BORRADOR")';

export type AvailabilityAnswer={error:string;status:number}|{disponible:boolean;nombreCategoria:string|null};

/** Availability answer shared by the ally link and the dress QR: by dress code, category or dress id, for one event date. */
export async function availabilityAnswer(db:ReturnType<typeof publicServerClient>,input:{fecha:string;codigo?:string;categoria?:number|null;vestidoId?:string}):Promise<AvailabilityAnswer>{
 const {fecha,codigo='',categoria=null,vestidoId}=input;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha))return {error:'Elige la fecha.',status:400};
 if(!vestidoId&&!codigo&&!categoria)return {error:'Escribe la referencia del vestido o elige una categoría.',status:400};
 let q=db.from('vestidos').select('id,codigo,stock_total,estado').eq('archivado',false);
 q=vestidoId?q.eq('id',vestidoId):codigo?q.ilike('codigo',codigo):q.eq('clasificacion_id',categoria!);
 const {data:dresses}=await q;
 const usable=(dresses||[]).filter(d=>!/baja/i.test(String(d.estado||'')));
 if((codigo||vestidoId)&&!usable.length)return {error:'No encontramos esa referencia.',status:404};
 // Same blocking rules as the contract form (lib/availability), applied to the requested event date.
 const [wanted]=generateBlockedRanges([{id:'consulta',numero_contrato:'',cliente_nombre:'',estado:'',tipo_evento:'Evento',fecha_evento:fecha}]);
 let disponible=false;
 if(usable.length){
  const {data:items}=await db.from('contrato_items_vestidos').select('vestido_id,contratos!inner(id,numero_contrato,cliente_nombre,estado,tipo_evento,fecha_evento,fecha_pre_xv,fechas_bloqueo_especial,bloqueo_especial_fecha,bloqueo_especial_vestido_id)').in('vestido_id',usable.map(d=>d.id)).not('contratos.estado','in',CANCELLED);
  disponible=usable.some(d=>{const busy=generateBlockedRanges((items||[]).filter(i=>i.vestido_id===d.id)).filter(b=>rangesOverlap(b,wanted)).length;return busy<Math.max(1,Number(d.stock_total)||1);});
 }
 const nombreCategoria=categoria?(await db.from('clasificaciones_vestido').select('nombre').eq('id',categoria).maybeSingle()).data?.nombre||null:null;
 return {disponible,nombreCategoria};
}
