'use client';
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';

type Fila={sede:string;mes:string;contratos:number;valor:number;promedio:number;promedio_3m:number|null;alerta:boolean|null};
const money=(n:number)=>n>=1e6?`$${(n/1e6).toLocaleString('es-CO',{maximumFractionDigits:1})} M`:`$${Math.round(n/1e3).toLocaleString('es-CO')} mil`;
const mesLabel=(m:string)=>new Date(m+'T12:00:00').toLocaleDateString('es-CO',{month:'short',year:'2-digit'});

/** Contracts per store and month (count, value, average value) with an alert when the average falls below 75 % of the previous 3 months. */
export default function SalesBySite(){
 const [meses,setMeses]=useState(6),[filas,setFilas]=useState<Fila[]|null>(null),[error,setError]=useState('');
 useEffect(()=>{let vivo=true;void supabase.rpc('ventas_sede_mensual',{p_meses:meses}).then(({data,error:e})=>{if(!vivo)return;if(e)setError(e.message);else{setError('');setFilas((data||[]) as Fila[]);}});return()=>{vivo=false;};},[meses]);
 const lista=filas||[],mesesCol=[...new Set(lista.map(f=>f.mes))].sort(),sedes=[...new Set(lista.map(f=>f.sede))].sort();
 const celda=(s:string,m:string)=>lista.find(f=>f.sede===s&&f.mes===m);
 const enCurso=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota'}).format(new Date()).slice(0,7)+'-01';
 const totalMes=(m:string)=>lista.filter(f=>f.mes===m).reduce((a,f)=>({c:a.c+f.contratos,v:a.v+f.valor}),{c:0,v:0});
 const alertas=lista.filter(f=>f.alerta);
 return <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 space-y-6">
  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
   <div><h2 className="text-2xl font-black text-gray-900 tracking-tight">Contratos por sede</h2>
    <p className="text-sm text-gray-500 mt-1">Valor total de los contratos creados cada mes (sin anulados, cancelados ni borradores), cantidad y valor promedio por contrato.</p></div>
   <div className="flex rounded-xl bg-gray-100 p-1 text-xs font-black uppercase tracking-widest">{[3,6,12].map(n=><button key={n} type="button" onClick={()=>setMeses(n)} className={`px-3 py-2 rounded-lg ${meses===n?'bg-white shadow text-rose-600':'text-gray-500'}`}>{n} meses</button>)}</div>
  </div>
  {error?<p className="text-red-600 font-bold">No se pudo cargar: {error}</p>:!filas?<p className="text-gray-400 font-bold">Cargando…</p>:<>
   {!!alertas.length&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 font-bold space-y-1">{alertas.map(a=><p key={a.sede+a.mes}>⚠️ {a.sede} · {mesLabel(a.mes)}{a.mes===enCurso?' (mes en curso)':''}: valor promedio {money(a.promedio)}, {Math.round(100-a.promedio*100/(a.promedio_3m||1))} % menos que el promedio de los 3 meses anteriores ({money(a.promedio_3m||0)}).</p>)}</div>}
   <div className="overflow-x-auto rounded-2xl border border-gray-100"><table className="w-full text-sm">
    <thead className="bg-gray-50"><tr className="text-left text-[10px] uppercase tracking-widest text-gray-500"><th className="py-3 px-4">Sede</th>{mesesCol.map(m=><th key={m} className="py-3 px-3 text-right whitespace-nowrap">{mesLabel(m)}{m===enCurso?' *':''}</th>)}</tr></thead>
    <tbody>{sedes.map(s=><tr key={s} className="border-t border-gray-100 text-gray-700"><td className="py-3 px-4 font-black">{s}</td>{mesesCol.map(m=>{const c=celda(s,m);return <td key={m} className={`py-3 px-3 text-right whitespace-nowrap ${c?.alerta?'bg-red-50':''}`}>{c?<><p className="font-black text-gray-900">{money(c.valor)}</p><p className="text-[11px] font-bold text-gray-500">{c.contratos} contr. · prom. <span className={c.alerta?'text-red-600':''}>{money(c.promedio)}</span></p></>:<span className="text-gray-300">—</span>}</td>;})}</tr>)}
     <tr className="border-t border-gray-100 bg-rose-50/60 font-black text-gray-900"><td className="py-3 px-4">Total</td>{mesesCol.map(m=>{const t=totalMes(m);return <td key={m} className="py-3 px-3 text-right whitespace-nowrap"><p>{money(t.v)}</p><p className="text-[11px] text-gray-500">{t.c} contr.</p></td>;})}</tr></tbody>
   </table></div>
   <p className="text-xs text-gray-400">* Mes en curso (incompleto). En rojo: el valor promedio por contrato cayó más del 25 % frente al promedio de los 3 meses anteriores. Los costos fijos (arriendo, nómina) no están en el ERP, así que esto no muestra la utilidad.</p>
  </>}
 </div>;
}
