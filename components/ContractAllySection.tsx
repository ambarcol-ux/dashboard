'use client';
import {useEffect,useState} from 'react';
import {Handshake} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {lineCommission,type AllyLine,type AllySearchResult,type AllyType} from '@/lib/direct-allies';

export type ContractAllyValue={tiene:boolean;tipo:number|null;aliado:AllySearchResult|null;linea:number|null};
export const EMPTY_CONTRACT_ALLY:ContractAllyValue={tiene:false,tipo:null,aliado:null,linea:null};
const money=(v:number)=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(v);

/** "Aliado" section of the client contract: type, search (active allies only), read-only data and line 1-4. */
export default function ContractAllySection({value,onChange,valorTotal,disabled}:{value:ContractAllyValue;onChange:(v:ContractAllyValue)=>void;valorTotal:number;disabled?:boolean}){
 const [types,setTypes]=useState<AllyType[]>([]),[lines,setLines]=useState<AllyLine[]>([]),[q,setQ]=useState(''),[results,setResults]=useState<AllySearchResult[]>([]),[searching,setSearching]=useState(false);
 useEffect(()=>{void Promise.all([supabase.from('tipos_aliado').select('id,nombre,activo').eq('activo',true).order('nombre'),supabase.from('lineas_aliado').select('*').order('id')]).then(([t,l])=>{setTypes((t.data||[]) as AllyType[]);setLines((l.data||[]) as AllyLine[]);});},[]);
 useEffect(()=>{
  if(!value.tiene||!value.tipo||value.aliado)return;
  let live=true;
  const timer=setTimeout(()=>{void supabase.rpc('buscar_aliados_directos',{p_tipo:value.tipo,p_q:q}).then(({data})=>{if(live){setResults((data||[]) as AllySearchResult[]);setSearching(false);}});},250);
  return()=>{live=false;clearTimeout(timer);};
 },[q,value.tiene,value.tipo,value.aliado]);
 const line=lines.find(l=>l.id===value.linea);
 const box='w-full bg-white border border-gray-200 text-gray-900 rounded-xl px-4 py-3';
 return <div className="bg-violet-50/40 p-6 rounded-2xl border border-violet-100 shadow-sm space-y-4">
  <div className="flex items-center gap-2 text-gray-800 border-b border-violet-100 pb-2"><Handshake className="w-5 h-5 text-violet-600"/><h3 className="font-bold">Aliado</h3></div>
  <div className="flex items-center gap-3"><span className="text-sm font-semibold text-gray-700">¿Viene por un aliado?</span>
   {[true,false].map(v=><button key={String(v)} type="button" disabled={disabled} onClick={()=>onChange(v?{...value,tiene:true}:{tiene:false,tipo:null,aliado:null,linea:null})} className={`px-5 py-2 rounded-xl border text-sm font-bold ${value.tiene===v?'bg-violet-600 border-violet-600 text-white':'bg-white border-gray-200 text-gray-600'}`}>{v?'Sí':'No'}</button>)}
  </div>
  {value.tiene&&<>
   <div className="grid md:grid-cols-2 gap-4">
    <label className="text-sm font-semibold text-gray-700">1. Tipo de aliado
     <select className={box+' mt-1'} disabled={disabled} value={value.tipo??''} onChange={e=>{setQ('');setResults([]);onChange({...value,tipo:e.target.value?Number(e.target.value):null,aliado:null});}}><option value="">Selecciona…</option>{types.map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}</select></label>
    <div className="text-sm font-semibold text-gray-700">2. Buscar aliado por nombre o cédula
     {value.aliado?<div className="mt-1 flex items-center justify-between gap-2 bg-white border border-violet-200 rounded-xl px-4 py-3"><span>{value.aliado.nombre} · C.C. {value.aliado.cedula}</span>{!disabled&&<button type="button" className="text-xs font-bold text-violet-700 underline" onClick={()=>onChange({...value,aliado:null})}>Cambiar</button>}</div>
     :<><input className={box+' mt-1'} disabled={disabled||!value.tipo} placeholder={value.tipo?'Escribe el nombre o la cédula':'Primero elige el tipo'} value={q} onChange={e=>{setSearching(true);setQ(e.target.value);}}/>
      {value.tipo&&<ul className="mt-1 max-h-48 overflow-y-auto rounded-xl border border-gray-100 bg-white divide-y divide-gray-50">{results.map(r=><li key={r.id}><button type="button" className="w-full text-left px-4 py-2 hover:bg-violet-50 text-sm" onClick={()=>onChange({...value,aliado:r})}>{r.nombre} · C.C. {r.cedula} · {r.tipo} · Activo</button></li>)}
       {!results.length&&<li className="px-4 py-2 text-xs text-gray-400">{searching?'Buscando…':'No hay aliados activos de este tipo con esa búsqueda.'}</li>}</ul>}</>}
    </div>
   </div>
   {value.aliado&&<div><p className="text-sm font-semibold text-gray-700 mb-1">3. Datos del aliado (se llenan solos, solo lectura)</p>
    <dl className="grid md:grid-cols-3 gap-3 bg-gray-100 rounded-xl p-4 text-sm">{([['Nombre',value.aliado.nombre],['Cédula',value.aliado.cedula],['Celular',value.aliado.celular],['Correo',value.aliado.correo],['Dirección',value.aliado.direccion]] as [string,string][]).map(([l,v])=><div key={l}><dt className="text-xs text-gray-500">{l}</dt><dd className="font-semibold text-gray-900 break-words">{v}</dd></div>)}</dl></div>}
   <div><p className="text-sm font-semibold text-gray-700 mb-1">4. Línea que escogió el cliente</p>
    <div className="flex flex-wrap items-center gap-2">{lines.map(l=><button key={l.id} type="button" disabled={disabled} onClick={()=>onChange({...value,linea:l.id})} className={`px-5 py-2 rounded-xl border text-sm font-bold ${value.linea===l.id?'bg-violet-600 border-violet-600 text-white':'bg-white border-gray-200 text-gray-700'}`}>{l.nombre}</button>)}
     {line&&<span className="ml-auto text-sm text-gray-600">Comisión estimada: <b>{money(lineCommission(line,valorTotal))}</b></span>}</div></div>
   <p className="text-xs text-gray-500">Con Aliado = Sí, tipo, aliado y línea son obligatorios. El contrato guarda una copia de los datos del aliado.</p>
  </>}
 </div>;
}
