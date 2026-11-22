'use client';
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import {toast} from 'sonner';
import {supabase} from '@/lib/supabase';

type Novedad={clave:string;tipo:string;sede:string;sede_id:string;titulo:string;detalle:string;href:string;responsable:string;resoluble:boolean;fecha:string|null};

/** Accounting alerts (public.novedades_contables): administración and contabilidad see every store, the franquiciado his own.
 *  Each one opens the process where it is solved; manual Siigo actions can be marked done. Shows nothing for other roles. */
export default function NovedadesContables({sedeId=null}:{sedeId?:string|null}){
 const [rows,setRows]=useState<Novedad[]|null>(null),[abierto,setAbierto]=useState<string|null>(null),[busy,setBusy]=useState('');
 const load=useCallback(async()=>{const {data,error}=await supabase.rpc('novedades_contables',{p_sede:sedeId});if(!error)setRows((data||[]) as Novedad[]);},[sedeId]);
 useEffect(()=>{const t=setTimeout(()=>void load(),0);const i=setInterval(()=>void load(),120000);return()=>{clearTimeout(t);clearInterval(i);};},[load]);
 if(!rows||!rows.length)return null;
 const grupos=Array.from(new Set(rows.map(r=>r.tipo))).map(t=>({tipo:t,items:rows.filter(r=>r.tipo===t)}));
 const resolver=async(r:Novedad)=>{setBusy(r.clave);const {error}=await supabase.rpc('novedad_resolver',{p_clave:r.clave});setBusy('');
  if(error){toast.error(error.message);return;}toast.success('Marcada como resuelta.');void load();};
 return <section aria-label="Novedades contables" className="bg-white rounded-2xl border border-amber-200 shadow-sm p-4 space-y-3">
  <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Novedades contables · {rows.length} · toca para ir a resolver</p>
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
   {grupos.map(g=><button key={g.tipo} type="button" onClick={()=>setAbierto(abierto===g.tipo?null:g.tipo)}
    className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left bg-amber-50 border-amber-200 text-amber-900 hover:shadow-md ${abierto===g.tipo?'ring-2 ring-amber-400':''}`}>
    <span className="text-2xl font-black leading-none">{g.items.length}</span><span className="text-xs font-bold leading-tight">{g.tipo}<br/><span className="font-medium opacity-70">Responsable: {g.items[0].responsable}</span></span></button>)}
  </div>
  {abierto&&<div className="max-h-80 overflow-y-auto rounded-xl border border-amber-100 divide-y divide-amber-50">
   {grupos.find(g=>g.tipo===abierto)?.items.map(r=><div key={r.clave} className="flex flex-wrap items-center gap-2 p-3 text-xs">
    <span className="font-black text-gray-800">{r.titulo}</span><span className="text-gray-500">{r.sede}</span>
    <span className="flex-1 min-w-[12rem] text-gray-600">{r.detalle}</span>
    <Link href={r.href} className="rounded-lg bg-amber-600 px-3 py-1.5 font-bold text-white">Ir a resolver</Link>
    {r.resoluble&&<button type="button" disabled={busy===r.clave} onClick={()=>void resolver(r)} className="rounded-lg border border-amber-300 px-3 py-1.5 font-bold text-amber-800 disabled:opacity-50">Ya lo hice en Siigo</button>}
   </div>)}
  </div>}
 </section>;
}
