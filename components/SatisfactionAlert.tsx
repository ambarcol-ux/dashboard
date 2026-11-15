'use client';
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';

type Caso={id:string;cliente:string;telefono:string;sede:string|null;fecha:string;asesora:string;falla:string|null;respondida:string};

/** Administration only: customers who answered «Puede mejorar» after their visit (not shown to the adviser who attended them).
 *  «Caso atendido» closes it after talking with her; then her Google review request goes out. */
export default function SatisfactionAlert(){
 const [casos,setCasos]=useState<Caso[]>([]),[abierto,setAbierto]=useState(false);
 useEffect(()=>{let live=true;
  const load=()=>void supabase.rpc('satisfaccion_casos').then(({data})=>{if(live)setCasos((data||[]) as Caso[]);});
  load();const t=setInterval(load,300000);return()=>{live=false;clearInterval(t);};},[]);
 if(!casos.length)return null;
 const cerrar=async(c:Caso)=>{const nota=window.prompt('¿Qué se habló con la clienta? (opcional)','');if(nota===null)return;
  const {error}=await supabase.rpc('satisfaccion_cerrar',{p_id:c.id,p_nota:nota});if(!error)setCasos(cs=>cs.filter(x=>x.id!==c.id));};
 const tel=(t:string)=>{const d=t.replace(/\D/g,'');return d.length===10?`57${d}`:d;};
 return <div className="fixed bottom-28 left-4 z-[90] w-[min(22rem,calc(100vw-2rem))]">
  {abierto&&<div className="mb-2 max-h-[55vh] overflow-y-auto space-y-2 rounded-2xl">
   {casos.map(c=><div key={c.id} className="rounded-2xl border border-purple-300 bg-white p-3 shadow-xl">
    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{c.sede||'Sin sede'} · cita del {new Date(c.fecha+'T12:00:00').toLocaleDateString('es-CO',{day:'numeric',month:'short'})} · asesora {c.asesora}</p>
    <p className="font-black text-gray-900 text-sm mt-0.5">{c.cliente}</p>
    <p className="text-xs font-bold text-purple-700">Puede mejorar{c.falla?`: ${c.falla}`:' (aún no dice qué)'}</p>
    <div className="flex gap-2 mt-2"><a href={`/dashboard/whatsapp?tel=${tel(c.telefono)}`} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-black">Escribirle</a>
     <a href={`tel:${c.telefono}`} className="px-3 py-1.5 rounded-lg border text-xs font-black">Llamar</a>
     <button type="button" onClick={()=>void cerrar(c)} className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-black">Caso atendido</button></div>
   </div>)}
  </div>}
  <button type="button" onClick={()=>setAbierto(v=>!v)} aria-expanded={abierto} className="rounded-full bg-purple-600 text-white pl-3 pr-4 py-2 shadow-xl text-xs font-black flex items-center gap-2">
   <span>💬</span><span>{casos.length} {casos.length===1?'clienta dice':'clientas dicen'} «puede mejorar»</span><span aria-hidden>{abierto?'▾':'▴'}</span>
  </button>
 </div>;
}
