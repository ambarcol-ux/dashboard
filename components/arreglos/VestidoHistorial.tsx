'use client';
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import ArregloFotos from '@/components/arreglos/ArregloFotos';

type Resumen={alquileres:number;arreglos:number;lavanderias:number;costo_arreglos:number;arreglos_6_meses:number;traslados:number;ingresos:number};
type Evento={tipo:'alquiler'|'arreglo'|'lavanderia'|'traslado'|'cambio';fecha:string;titulo:string;detalle:string|null;valor?:number|null;fotos_antes?:string[]|null;fotos_despues?:string[]|null;estado_pago?:string|null};
const cop=(n:number)=>`$${Math.round(Number(n)||0).toLocaleString('es-CO')}`;
const ICONO:Record<Evento['tipo'],string>={alquiler:'👗',arreglo:'✂️',lavanderia:'🧼',traslado:'🚚',cambio:'📝'};
const fecha=(d:string)=>{const t=new Date(d.length===10?d+'T12:00:00':d);return isNaN(+t)?d:t.toLocaleDateString('es-CO',{day:'numeric',month:'short',year:'numeric'});};

/** Full history of a dress (rentals, repairs, laundry, transfers and changes) with its summary; used in the inventory file and in Adaptaciones. */
export default function VestidoHistorial({vestidoId}:{vestidoId:string}){
 const [data,setData]=useState<{resumen:Resumen;eventos:Evento[]}|null>(null),[error,setError]=useState(''),[filtro,setFiltro]=useState<'todo'|Evento['tipo']>('todo');
 useEffect(()=>{let live=true;void supabase.rpc('vestido_historial',{p_vestido:vestidoId}).then(({data:d,error:e})=>{if(!live)return;if(e)setError(e.message);else setData(d as {resumen:Resumen;eventos:Evento[]});});return()=>{live=false;};},[vestidoId]);
 if(error)return <p role="alert" className="text-red-600 text-sm font-bold">{error}</p>;
 if(!data)return <p role="status" className="text-gray-400 text-sm">Cargando historial…</p>;
 const r=data.resumen,eventos=data.eventos.filter(e=>filtro==='todo'||e.tipo===filtro);
 const tarjeta=(l:string,v:string|number)=><div className="bg-white rounded-2xl border border-gray-100 p-3 text-center"><p className="text-[10px] font-black uppercase text-gray-400">{l}</p><p className="text-lg font-black text-gray-900">{v}</p></div>;
 return <div className="space-y-4">
  {r.arreglos_6_meses>3&&<p role="alert" className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-sm font-bold text-amber-800">⚠️ Este vestido lleva {r.arreglos_6_meses} arreglos en los últimos 6 meses: revisa si conviene seguir alquilándolo, venderlo o darlo de baja.</p>}
  <div className="grid grid-cols-3 gap-2">
   {tarjeta('Alquileres',r.alquileres)}{tarjeta('Ingresos',cop(r.ingresos))}{tarjeta('Traslados',r.traslados)}
   {tarjeta('Arreglos',r.arreglos)}{tarjeta('Lavanderías',r.lavanderias)}{tarjeta('Costo arreglos',cop(r.costo_arreglos))}
  </div>
  <div className="flex gap-1 flex-wrap">{(['todo','alquiler','arreglo','lavanderia','traslado','cambio'] as const).map(k=><button key={k} type="button" onClick={()=>setFiltro(k)}
   className={`px-3 py-1 rounded-full text-xs font-black ${filtro===k?'bg-rose-600 text-white':'bg-white border text-gray-600'}`}>{k==='todo'?'Todo':`${ICONO[k]} ${{alquiler:'Alquileres',arreglo:'Arreglos',lavanderia:'Lavandería',traslado:'Traslados',cambio:'Cambios'}[k]}`}</button>)}</div>
  {!eventos.length?<p className="text-sm text-gray-400 text-center py-6">Sin registros.</p>:<ol className="space-y-2">{eventos.map((e,i)=><li key={i} className="bg-white rounded-2xl border border-gray-100 p-3 flex gap-3">
   <span className="text-xl" aria-hidden>{ICONO[e.tipo]}</span>
   <div className="flex-1 min-w-0 space-y-1">
    <div className="flex justify-between gap-2"><b className="text-sm text-gray-900">{e.titulo}</b><span className="text-[11px] text-gray-400 whitespace-nowrap">{fecha(e.fecha)}</span></div>
    {e.detalle&&<p className="text-xs text-gray-600">{e.detalle}</p>}
    {e.valor!=null&&Number(e.valor)>0&&<p className="text-xs font-bold text-gray-700">{cop(Number(e.valor))}{e.estado_pago?` · pago a proveedor: ${e.estado_pago}`:''}</p>}
    <ArregloFotos antes={e.fotos_antes} despues={e.fotos_despues}/>
   </div></li>)}</ol>}
 </div>;
}
