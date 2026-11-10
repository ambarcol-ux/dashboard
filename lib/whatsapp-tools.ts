import type Anthropic from '@anthropic-ai/sdk';
import type {SupabaseClient} from '@supabase/supabase-js';
import {availabilityAnswer} from './dress-availability';
import {generateBlockedRanges,rangesOverlap} from './availability';
import {isPublicCatalogDress,type CatalogDress} from './catalog-public';

/** Tools the WhatsApp AI can call to answer with live ERP data: dress availability for a date and free first-visit slots. */
const CANCELLED='("cancelado","rechazado","anulado","borrador","CANCELADO","RECHAZADO","ANULADO","BORRADOR")';
const DATE={type:'string',description:'Fecha AAAA-MM-DD'};
export const WHATSAPP_TOOLS:Anthropic.Tool[]=[
 {name:'disponibilidad_vestido',description:'Dice si un vestido (por su código del catálogo) está libre para la fecha del evento de la clienta.',strict:true,
  input_schema:{type:'object',additionalProperties:false,required:['codigo','fecha'],properties:{codigo:{type:'string'},fecha:DATE}}},
 {name:'vestidos_libres',description:'Lista vestidos del catálogo visible de una sede y tipo que están libres para la fecha del evento; filtra por talla o color si la clienta los dijo (cadena vacía si no).',strict:true,
  input_schema:{type:'object',additionalProperties:false,required:['sede','tipo','fecha','talla','color'],properties:{sede:{type:'string',description:'Nombre de la sede'},tipo:{type:'string',description:'XV Años, Gala, Novia, Pajecita o Vestido de cambio'},fecha:DATE,talla:{type:'string'},color:{type:'string'}}}},
 {name:'cupos_cita',description:'Horas libres para la primera cita en una sede (presencial o virtual) desde una fecha, para los próximos días.',strict:true,
  input_schema:{type:'object',additionalProperties:false,required:['sede','modalidad','desde','dias'],properties:{sede:{type:'string',description:'Nombre de la sede'},modalidad:{type:'string',enum:['presencial','virtual']},desde:DATE,dias:{type:'integer',description:'Cuántos días revisar (1 a 7)'}}}},
];

const norm=(s:string)=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
const okDate=(d:unknown)=>/^\d{4}-\d{2}-\d{2}$/.test(String(d))&&String(d)>=new Date().toISOString().slice(0,10);

export async function runWhatsappTool(db:SupabaseClient,sites:{id:string;nombre:string}[],name:string,input:Record<string,unknown>):Promise<string>{
 const sede=(n:unknown)=>sites.find(s=>norm(s.nombre)===norm(String(n||'')));
 if(name==='disponibilidad_vestido'){
  if(!okDate(input.fecha))return 'Fecha no válida o ya pasó.';
  const r=await availabilityAnswer(db as never,{fecha:String(input.fecha),codigo:String(input.codigo||'').trim().toUpperCase()});
  return 'error' in r?r.error:r.disponible?`${String(input.codigo).toUpperCase()} está LIBRE para el ${input.fecha}.`:`${String(input.codigo).toUpperCase()} está OCUPADO para el ${input.fecha}.`;
 }
 if(name==='vestidos_libres'){
  const s=sede(input.sede);if(!s)return 'Sede no encontrada.';
  if(!okDate(input.fecha))return 'Fecha no válida o ya pasó.';
  const {data:types}=await db.from('clasificaciones_vestido').select('id,nombre');
  const t=(types||[]).find(x=>norm(String(x.nombre))===norm(String(input.tipo))||(norm(String(input.tipo)).includes('xv')&&norm(String(x.nombre)).includes('xv')));
  if(!t)return 'Tipo de vestido no encontrado.';
  const {data}=await db.from('vestidos').select('id,codigo,categoria,talla,color,stock_total,foto_frente,foto_espalda,foto_detalle,imagen_url,precio_sugerido,para_alquiler,estado').eq('archivado',false).eq('sede_actual_id',s.id).eq('clasificacion_id',t.id).order('precio_sugerido');
  const talla=norm(String(input.talla||'')),color=norm(String(input.color||''));
  const list=((data||[]) as (CatalogDress&{id:string;codigo:string;categoria:string|null;talla:string|null;color:string|null;stock_total:number|null})[])
   .filter(d=>isPublicCatalogDress(d)&&(!talla||norm(d.talla||'').includes(talla))&&(!color||norm(d.color||'').includes(color)));
  if(!list.length)return 'No hay vestidos visibles con esos filtros en esa sede.';
  // Same blocking rules as the contract form, applied to the event date.
  const [wanted]=generateBlockedRanges([{id:'consulta',numero_contrato:'',cliente_nombre:'',estado:'',tipo_evento:'Evento',fecha_evento:String(input.fecha)}]);
  const {data:items}=await db.from('contrato_items_vestidos').select('vestido_id,contratos!inner(id,numero_contrato,cliente_nombre,estado,tipo_evento,fecha_evento,fecha_pre_xv,fechas_bloqueo_especial,bloqueo_especial_fecha,bloqueo_especial_vestido_id)').in('vestido_id',list.map(d=>d.id)).not('contratos.estado','in',CANCELLED);
  const free=list.filter(d=>generateBlockedRanges((items||[]).filter(i=>i.vestido_id===d.id)).filter(b=>rangesOverlap(b,wanted)).length<Math.max(1,Number(d.stock_total)||1));
  if(!free.length)return `Ninguno de los ${list.length} vestidos que cumplen está libre para el ${input.fecha}.`;
  return `Libres para el ${input.fecha} (${free.length} de ${list.length}):\n`+free.slice(0,8).map(d=>`${d.codigo} · ${d.categoria||'—'} · talla ${d.talla||'—'} · ${d.color||'—'} · $${Number(d.precio_sugerido).toLocaleString('es-CO')}`).join('\n');
 }
 if(name==='cupos_cita'){
  const s=sede(input.sede);if(!s)return 'Sede no encontrada.';
  if(!okDate(input.desde))return 'Fecha no válida o ya pasó.';
  const dias=Math.min(7,Math.max(1,Number(input.dias)||1)),hasta=new Date(Date.parse(String(input.desde)+'T12:00:00Z')+(dias-1)*86400000).toISOString().slice(0,10);
  const modalidad=input.modalidad==='virtual'?'virtual':'presencial';
  const {data:cal}=await db.rpc('dias_primera_cita',{p_modalidad:modalidad,p_sede:s.id,p_desde:input.desde,p_hasta:hasta});
  const out:string[]=[];
  for(const d of ((cal as {dias?:{fecha:string;disponible:boolean;motivo:string|null}[]}|null)?.dias||[])){
   if(!d.disponible){out.push(`${d.fecha}: sin citas${d.motivo?` (${d.motivo})`:''}`);continue;}
   const {data:slots}=await db.rpc('disponibilidad_primera_cita',{p_fecha:d.fecha,p_modalidad:modalidad,p_sede:s.id});
   const libres=((slots||[]) as {hora:string;cupos:number}[]).filter(x=>x.cupos>0).map(x=>x.hora);
   out.push(`${d.fecha}: ${libres.length?libres.join(', '):'lleno'}`);
  }
  return out.length?`Cupos de primera cita ${modalidad} en ${s.nombre}:\n${out.join('\n')}`:'Sin información de cupos.';
 }
 return 'Herramienta desconocida.';
}
