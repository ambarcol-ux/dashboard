'use client';
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import FirstVisitWalkIn from './FirstVisitWalkIn';

type Visit={id:string;codigo:string|null;cliente:string;telefono:string;documento:string|null;fecha:string;sede:string;origen:string;estado:string};

/** Direct contracts need their visit: search it (code, name, phone or ID) or register the walk-in. */
export default function ContractVisitPicker({onPick}:{onPick:(id:string)=>void}){
 const [q,setQ]=useState(''),[list,setList]=useState<Visit[]>([]),[walkIn,setWalkIn]=useState<{id:string;sede_id:string|null}|null>(null);
 useEffect(()=>{
  if(q.trim().length<3)return;
  let live=true;
  const t=setTimeout(()=>{void supabase.rpc('buscar_visitas_contrato',{p_q:q.trim()}).then(({data})=>{if(live)setList((data||[]) as Visit[]);});},350);
  return()=>{live=false;clearTimeout(t);};
 },[q]);
 const openWalkIn=async()=>{
  const {data:{user}}=await supabase.auth.getUser();if(!user)return;
  const {data:us}=await supabase.from('usuario_sedes').select('sede_id').eq('usuario_id',user.id).eq('activo',true).limit(1);
  setWalkIn({id:user.id,sede_id:us?.[0]?.sede_id||null});
 };
 return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 space-y-3">
  <p className="text-sm font-black text-gray-900">Visita de origen *</p>
  <p className="text-xs text-gray-600">Todo contrato directo sale de una cita o vitrina. Busca la visita o registra la vitrina; al guardar el contrato queda como Alquiló.</p>
  <div className="flex flex-wrap gap-2">
   <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Código, nombre, teléfono o cédula" className="flex-1 min-w-[220px] px-3 py-2 border border-gray-200 rounded-xl text-sm"/>
   <button type="button" onClick={()=>void openWalkIn()} className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-bold">Registrar vitrina</button>
  </div>
  {q.trim().length>=3&&<ul className="divide-y divide-rose-100 bg-white rounded-xl border border-rose-100">
   {list.map(v=><li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"><span><b>{v.codigo||'—'}</b> · {v.cliente} · {v.telefono} · {v.sede} · {v.fecha.split('-').reverse().join('/')} · {v.origen==='vitrina'?'Vitrina':'Cita'} ({v.estado})</span>
    <button type="button" onClick={()=>onPick(v.id)} className="px-3 py-1 rounded-lg border border-rose-300 text-rose-700 font-bold">Usar</button></li>)}
   {!list.length&&<li className="px-3 py-2 text-sm text-gray-500">Sin visitas disponibles. Registra la vitrina.</li>}
  </ul>}
  {walkIn&&<FirstVisitWalkIn profile={walkIn} alContratar onClose={()=>setWalkIn(null)} onSaved={()=>setWalkIn(null)} onCreated={id=>{setWalkIn(null);onPick(id);}}/>}
 </div>;
}
