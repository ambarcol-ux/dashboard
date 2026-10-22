'use client';
import {useEffect,useState} from 'react';
import {Frame} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {RETABLO_ESTADOS,tipoLabel,type Retablo,type RetabloTipo} from '@/lib/retablos';

export type ContractRetabloValue={incluye:boolean;tipo:string};
export const EMPTY_CONTRACT_RETABLO:ContractRetabloValue={incluye:false,tipo:''};
const money=(v:number)=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(v);
export const retabloError=(v:ContractRetabloValue)=>v.incluye&&!v.tipo?'Elige el tipo de retablo.':null;
/** The only call the contract makes to the Retablos module: create, change or remove the contract's retablo. */
export async function saveContractRetablo(contractId:string,v:ContractRetabloValue,hadRetablo:boolean){
 if(!v.incluye&&!hadRetablo)return null;
 const {error}=await supabase.rpc('guardar_retablo_contrato',{p_contrato:contractId,p_tipo:v.incluye?v.tipo:null});
 return error?error.message:null;
}

/** «¿Incluye retablo?» in the contract form. In edit mode it loads the contract's current retablo. */
export default function ContractRetabloSection({contractId,value,onChange,onLoaded,disabled}:{contractId:string|null;value:ContractRetabloValue;onChange:(v:ContractRetabloValue)=>void;onLoaded?:(had:boolean)=>void;disabled?:boolean}){
 const [tipos,setTipos]=useState<RetabloTipo[]>([]),[current,setCurrent]=useState<Retablo|null>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;void supabase.rpc('retablo_tipos_lista',{p_todos:false}).then(({data,error:re})=>{if(!live)return;if(re)setError('No se pudo cargar el catálogo de retablos.');else setTipos((data||[]) as RetabloTipo[]);});return()=>{live=false;};},[]);
 useEffect(()=>{
  if(!contractId)return;let live=true;
  void supabase.rpc('retablo_de_contrato',{p_contrato:contractId}).then(({data})=>{if(!live)return;const r=(data||null) as Retablo|null;setCurrent(r);onLoaded?.(!!r);if(r)onChange({incluye:true,tipo:r.tipo_id});});
  return()=>{live=false;};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[contractId]);
 const locked=disabled||(current!==null&&current.estado!=='PENDIENTE');
 const box='w-full bg-white border border-gray-200 text-gray-900 rounded-xl px-4 py-3';
 return <div className="bg-amber-50/40 p-6 rounded-2xl border border-amber-100 shadow-sm space-y-4">
  <div className="flex items-center gap-2 text-gray-800 border-b border-amber-100 pb-2"><Frame className="w-5 h-5 text-amber-600"/><h3 className="font-bold">Retablo</h3></div>
  <div className="flex items-center gap-3"><span className="text-sm font-semibold text-gray-700">¿Incluye retablo?</span>
   {[true,false].map(v=><button key={String(v)} type="button" disabled={locked} onClick={()=>onChange(v?{...value,incluye:true}:{incluye:false,tipo:''})} className={`px-5 py-2 rounded-xl text-sm font-bold border ${value.incluye===v?'bg-amber-500 text-white border-amber-500':'bg-white text-gray-600 border-gray-200'} disabled:opacity-60`}>{v?'Sí':'No'}</button>)}
  </div>
  {value.incluye&&<label className="block text-sm font-semibold text-gray-700">Tipo de retablo (obligatorio)
   <select className={`${box} mt-1`} value={value.tipo} disabled={locked} required onChange={e=>onChange({incluye:true,tipo:e.target.value})}>
    <option value="">Selecciona el tipo</option>
    {tipos.map(t=><option key={t.id} value={t.id}>{tipoLabel(t,money)}</option>)}
    {current&&!tipos.some(t=>t.id===current.tipo_id)&&<option value={current.tipo_id}>{current.tipo} — {money(current.valor_cliente)}</option>}
   </select>
   {!tipos.length&&!error&&<span className="text-xs text-gray-500">No hay tipos de retablo activos. El administrador los crea en Retablos › Tipos.</span>}
  </label>}
  {current&&<p className="text-xs text-gray-600">Estado del retablo: <strong style={{color:RETABLO_ESTADOS[current.estado].fg}}>{RETABLO_ESTADOS[current.estado].label}</strong>{current.estado!=='PENDIENTE'&&' · ya no se puede cambiar desde el contrato.'}</p>}
  <p className="text-xs text-gray-500">Al guardar el contrato se crea el retablo en estado Pendiente en el panel de Retablos.</p>
  {error&&<p className="text-xs text-rose-600">{error}</p>}
 </div>;
}
