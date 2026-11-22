'use client';
import {useEffect,useMemo,useState} from 'react';
import {supabase} from '@/lib/supabase';

type Linea={sede_id:string|null;sede:string;grupo:'ingreso'|'gasto';concepto:string;valor:number};
type Sede={sede:string;ingresos:Linea[];gastos:Linea[];ti:number;tg:number};
const cop=(n:number)=>`${n<0?'−':''}$${Math.round(Math.abs(n)).toLocaleString('es-CO')}`;
const pct=(u:number,i:number)=>i>0?`${Math.round(u/i*100)}%`:'—';

/** Finanzas › Gastos › Estado de resultados: income, expenses and profit per store for the chosen period (public.estado_resultados). */
export default function EstadoResultados({desde,hasta}:{desde:string;hasta:string}){
 const [rows,setRows]=useState<Linea[]|null>(null),[error,setError]=useState(''),[abierta,setAbierta]=useState<string|null>(null);
 useEffect(()=>{let live=true;void supabase.rpc('estado_resultados',{p_desde:desde,p_hasta:hasta}).then(({data,error:e})=>{if(!live)return;if(e){setError(e.message);setRows([]);}else{setError('');setRows((data||[]) as Linea[]);}});return()=>{live=false;};},[desde,hasta]);
 const sedes=useMemo(()=>{const m=new Map<string,Sede>();for(const l of rows||[]){const s=m.get(l.sede)||{sede:l.sede,ingresos:[],gastos:[],ti:0,tg:0};
  if(l.grupo==='ingreso'){s.ingresos.push(l);s.ti+=Number(l.valor);}else{s.gastos.push(l);s.tg+=Number(l.valor);}m.set(l.sede,s);}return [...m.values()];},[rows]);
 const ti=sedes.reduce((a,s)=>a+s.ti,0),tg=sedes.reduce((a,s)=>a+s.tg,0);
 if(rows===null)return <p className="text-sm text-gray-400">Cargando…</p>;
 return <div className="space-y-4">
  {error&&<p role="alert" className="text-red-600 text-sm font-bold">{error}</p>}
  <div className="grid sm:grid-cols-3 gap-3">
   <div className="bg-white rounded-2xl border p-4"><p className="text-xs font-bold text-gray-500">Ingresos</p><p className="text-2xl font-black text-emerald-700">{cop(ti)}</p></div>
   <div className="bg-white rounded-2xl border p-4"><p className="text-xs font-bold text-gray-500">Gastos</p><p className="text-2xl font-black text-red-600">{cop(tg)}</p></div>
   <div className="bg-white rounded-2xl border p-4"><p className="text-xs font-bold text-gray-500">Utilidad</p><p className={`text-2xl font-black ${ti-tg<0?'text-red-600':'text-gray-900'}`}>{cop(ti-tg)}</p><p className="text-xs text-gray-400">Margen {pct(ti-tg,ti)}</p></div>
  </div>
  <div className="bg-white rounded-2xl border p-4 overflow-x-auto">
   <table className="w-full text-sm"><thead><tr className="text-left text-xs text-gray-500"><th className="py-1">Sede</th><th className="text-right">Ingresos</th><th className="text-right">Gastos</th><th className="text-right">Utilidad</th><th className="text-right">Margen</th></tr></thead>
    <tbody>{sedes.map(s=><tr key={s.sede} className="border-t cursor-pointer hover:bg-gray-50" onClick={()=>setAbierta(abierta===s.sede?null:s.sede)}>
     <td className="py-2 font-bold">{s.sede} <span className="text-xs text-gray-400">{abierta===s.sede?'▲':'▼'}</span></td><td className="text-right text-emerald-700">{cop(s.ti)}</td><td className="text-right text-red-600">{cop(s.tg)}</td>
     <td className={`text-right font-black ${s.ti-s.tg<0?'text-red-600':''}`}>{cop(s.ti-s.tg)}</td><td className="text-right">{pct(s.ti-s.tg,s.ti)}</td></tr>)}
     {!sedes.length&&<tr><td colSpan={5} className="py-3 text-gray-400">Sin movimientos en el periodo.</td></tr>}</tbody></table>
  </div>
  {sedes.filter(s=>s.sede===abierta).map(s=><div key={s.sede} className="bg-white rounded-2xl border p-4 grid sm:grid-cols-2 gap-6">
   <div><p className="text-xs font-black text-emerald-700 mb-1">Ingresos · {s.sede}</p>{s.ingresos.length?s.ingresos.map(l=><p key={l.concepto} className="text-sm flex justify-between border-b py-1"><span>{l.concepto}</span><b>{cop(Number(l.valor))}</b></p>):<p className="text-sm text-gray-400">—</p>}</div>
   <div><p className="text-xs font-black text-red-600 mb-1">Gastos · {s.sede}</p>{s.gastos.length?s.gastos.map(l=><p key={l.concepto} className="text-sm flex justify-between border-b py-1"><span>{l.concepto}</span><b>{cop(Number(l.valor))}</b></p>):<p className="text-sm text-amber-700 font-bold">No hay gastos registrados: la utilidad sale inflada.</p>}</div>
  </div>)}
  <p className="text-xs text-gray-500">Toca una sede para ver el detalle. Ingresos: pagos de contratos, ventas y demás ingresos de caja, más lo retenido de depósitos por daños (sin depósitos en garantía, base de caja ni dinero entre sedes o socios). Gastos: egresos de caja, gastos registrados, pagos fijos y pagos a proveedores (sin devoluciones de depósito, consignaciones al banco ni retiros de utilidades). Es lo registrado en el ERP: si una sede no carga sus gastos, su utilidad sale más alta de lo real.</p>
 </div>;
}
