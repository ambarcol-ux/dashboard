'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {supabase} from '@/lib/supabase';

type Cuota={id:string;concepto:string;sede:string;vence:string;valor:number;estado:'pendiente'|'pagada';dias:number};
const KEY='avisos-pagos-fijos-pospuestos';
const SNOOZE_MS=30*60000;
const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}') as Record<string,number>;}catch{return {};}};
const cop=(n:number)=>`$${Math.round(n).toLocaleString('es-CO')}`;

/** Pop-up of Pagos fijos de sede (administration, accounting and franchisees, only their stores): installments due within
 *  their notice days, overdue ones and paid ones still waiting for administration to turn them off. A small button that opens
 *  the list. Upcoming and paid ones can be hidden for 30 minutes («Más tarde»); overdue ones cannot. Only administration
 *  turns an alert off. Not shown inside Pagos fijos, where the list already is. */
export default function FixedPaymentsAlert(){
 const path=usePathname();
 const [cuotas,setCuotas]=useState<Cuota[]>([]),[pospuestos,setPospuestos]=useState<Record<string,number>>({}),[now,setNow]=useState(()=>Date.now()),[abierto,setAbierto]=useState(false),[admin,setAdmin]=useState(false);
 useEffect(()=>{
  let live=true;
  void supabase.rpc('es_admin').then(({data})=>{if(live)setAdmin(data===true);});
  const load=()=>void supabase.rpc('pagos_fijos_alertas').then(({data})=>{if(live){setPospuestos(read());setCuotas((data||[]) as Cuota[]);setNow(Date.now());}});
  load();const t=setInterval(load,300000);return()=>{live=false;clearInterval(t);};
 },[]);
 const vencida=(c:Cuota)=>c.estado==='pendiente'&&c.dias<0;
 const lista=cuotas.filter(c=>vencida(c)||!(pospuestos[c.id]>now));
 if(!lista.length||path?.startsWith('/dashboard/pagos-fijos'))return null;
 const posponer=(id:string)=>{const v={...read(),[id]:now+SNOOZE_MS};for(const [k,t] of Object.entries(v))if(t<now)delete v[k];try{localStorage.setItem(KEY,JSON.stringify(v));}catch{}setPospuestos(v);};
 const apagar=async(id:string)=>{const {error}=await supabase.rpc('pagos_fijos_alerta_apagar',{p_id:id});if(!error)setCuotas(cs=>cs.filter(c=>c.id!==id));};
 const vencidas=lista.filter(vencida).length;
 const cuando=(c:Cuota)=>c.estado==='pagada'?'Pagada · falta visto bueno de administración':c.dias<0?`Vencida hace ${-c.dias} ${c.dias===-1?'día':'días'}`:c.dias===0?'Vence hoy':`Vence en ${c.dias} ${c.dias===1?'día':'días'}`;
 return <div className="fixed bottom-16 left-4 z-[90] w-[min(22rem,calc(100vw-2rem))]">
  {abierto&&<div className="mb-2 max-h-[55vh] overflow-y-auto space-y-2 rounded-2xl">
   {lista.map(c=><div key={c.id} className={`rounded-2xl border bg-white p-3 shadow-xl ${vencida(c)?'border-red-400':c.estado==='pagada'?'border-emerald-300':'border-amber-300'}`}>
    <div className="flex items-start justify-between gap-2">
     <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{c.sede}</p>
     {!vencida(c)&&<button type="button" onClick={()=>posponer(c.id)} className="text-[11px] font-bold text-gray-400 hover:text-gray-700 whitespace-nowrap">Más tarde</button>}
    </div>
    <p className="font-black text-gray-900 text-sm mt-0.5">{c.concepto} · {cop(c.valor)}</p>
    <p className={`text-xs font-bold ${vencida(c)?'text-red-700':c.estado==='pagada'?'text-emerald-700':'text-amber-700'}`}>{cuando(c)} · {new Date(c.vence+'T12:00:00').toLocaleDateString('es-CO',{day:'numeric',month:'short'})}</p>
    {admin&&<button type="button" onClick={()=>void apagar(c.id)} className="mt-2 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-black">Apagar alerta</button>}
   </div>)}
   <Link href="/dashboard/pagos-fijos" onClick={()=>setAbierto(false)} className="block text-center text-xs font-black text-red-700 bg-white rounded-xl py-2 shadow">Ver calendario de pagos</Link>
  </div>}
  <button type="button" onClick={()=>setAbierto(v=>!v)} aria-expanded={abierto}
   className={`rounded-full ${vencidas?'bg-red-600':'bg-amber-500'} text-white pl-3 pr-4 py-2 shadow-xl text-xs font-black flex items-center gap-2 ${vencidas&&!abierto?'animate-pulse':''}`}>
   <span>🧾</span><span>{vencidas?`${vencidas} ${vencidas===1?'pago vencido':'pagos vencidos'}`:`${lista.length} ${lista.length===1?'pago por revisar':'pagos por revisar'}`}</span><span aria-hidden>{abierto?'▾':'▴'}</span>
  </button>
 </div>;
}
