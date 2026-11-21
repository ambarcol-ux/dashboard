'use client';
import {useEffect,useState} from 'react';
import {Plus,Trash2} from 'lucide-react';
import {supabase} from '@/lib/supabase';

export type Concepto={id:string;nombre:string;tipo:string;precio_sugerido:number|null};
export type LineaConcepto={concepto_id:string;descripcion:string;cantidad:number;valor_unitario:number};
export const totalConceptos=(l:LineaConcepto[])=>l.reduce((t,x)=>t+(Number(x.cantidad)||0)*(Number(x.valor_unitario)||0),0);

/** Saves the concepts of a contract (replaces the previous ones). Each one becomes its own line in the Siigo invoice. */
export async function guardarConceptosContrato(contratoId:string,lineas:LineaConcepto[]){
 const validas=lineas.filter(x=>x.concepto_id&&Number(x.valor_unitario)>0&&Number(x.cantidad)>0);
 const {error:d}=await supabase.from('contrato_conceptos').delete().eq('contrato_id',contratoId);if(d)throw d;
 if(!validas.length)return;
 const {error}=await supabase.from('contrato_conceptos').insert(validas.map(x=>({contrato_id:contratoId,concepto_id:x.concepto_id,descripcion:x.descripcion.trim()||null,cantidad:Number(x.cantidad),valor_unitario:Number(x.valor_unitario)})));
 if(error)throw error;
}
export async function leerConceptosContrato(contratoId:string):Promise<LineaConcepto[]>{
 const {data}=await supabase.from('contrato_conceptos').select('concepto_id,descripcion,cantidad,valor_unitario').eq('contrato_id',contratoId).order('created_at');
 return ((data||[]) as {concepto_id:string;descripcion:string|null;cantidad:number;valor_unitario:number}[]).map(x=>({concepto_id:x.concepto_id,descripcion:x.descripcion||'',cantidad:Number(x.cantidad),valor_unitario:Number(x.valor_unitario)}));
}

const cop=(n:number)=>'$ '+Math.round(n).toLocaleString('es-CO');
const digits=(t:string)=>Number(t.replace(/\D/g,''))||0;

/** Contract › «Qué incluye además del vestido»: Pre XV, laundry, bows, accessories… from Configuración › Facturación por sede. */
export default function ContratoConceptos({lineas,onChange}:{lineas:LineaConcepto[];onChange:(l:LineaConcepto[])=>void}){
 const [conceptos,setConceptos]=useState<Concepto[]>([]);
 useEffect(()=>{void supabase.from('conceptos_contrato').select('id,nombre,tipo,precio_sugerido').eq('activo',true).order('orden').order('nombre').then(({data})=>setConceptos((data||[]) as Concepto[]));},[]);
 const set=(i:number,p:Partial<LineaConcepto>)=>onChange(lineas.map((x,k)=>k===i?{...x,...p}:x));
 const otro=(id:string)=>conceptos.find(c=>c.id===id)?.tipo==='otro';
 return <div className="space-y-2">
  <label className="text-sm font-semibold text-gray-700">Qué incluye además del vestido (cada concepto sale en la factura)</label>
  {lineas.map((x,i)=><div key={i} className="grid grid-cols-12 gap-2 items-center">
   <select className="col-span-12 sm:col-span-4 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm" value={x.concepto_id}
    onChange={e=>{const c=conceptos.find(k=>k.id===e.target.value);set(i,{concepto_id:e.target.value,valor_unitario:x.valor_unitario||Number(c?.precio_sugerido||0)});}}>
    <option value="">Concepto…</option>{conceptos.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
   </select>
   <input className="col-span-12 sm:col-span-3 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm" placeholder={otro(x.concepto_id)?'¿Qué es? (obligatorio)':'Detalle (opcional)'} value={x.descripcion} maxLength={200} onChange={e=>set(i,{descripcion:e.target.value})}/>
   <input className="col-span-3 sm:col-span-1 bg-gray-50 border border-gray-200 rounded-xl px-2 py-2 text-sm" inputMode="numeric" title="Cantidad" value={x.cantidad||''} onChange={e=>set(i,{cantidad:digits(e.target.value)})}/>
   <input className="col-span-7 sm:col-span-3 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm" inputMode="numeric" placeholder="Valor" value={x.valor_unitario?cop(x.valor_unitario):''} onChange={e=>set(i,{valor_unitario:digits(e.target.value)})}/>
   <button type="button" title="Quitar" className="col-span-2 sm:col-span-1 text-rose-500 flex justify-center" onClick={()=>onChange(lineas.filter((_,k)=>k!==i))}><Trash2 className="w-4 h-4"/></button>
  </div>)}
  <div className="flex justify-between items-center">
   <button type="button" className="text-sm font-bold text-emerald-700 flex items-center gap-1" onClick={()=>onChange([...lineas,{concepto_id:'',descripcion:'',cantidad:1,valor_unitario:0}])}><Plus className="w-4 h-4"/>Agregar concepto</button>
   <span className="text-sm font-black text-gray-800">Total adicionales: {cop(totalConceptos(lineas))}</span>
  </div>
 </div>;
}

/** Validation before saving: every line needs its concept and value; «Otro» needs what it is. */
export function errorConceptos(lineas:LineaConcepto[],conceptos?:Concepto[]){
 for(const x of lineas){
  if(!x.concepto_id)return 'Elige el concepto de cada adicional o quita la línea vacía.';
  if(!(Number(x.valor_unitario)>0))return 'Escribe el valor de cada adicional.';
  if(conceptos?.find(c=>c.id===x.concepto_id)?.tipo==='otro'&&x.descripcion.trim().length<3)return 'Escribe qué es el adicional «Otro».';
 }
 return '';
}
