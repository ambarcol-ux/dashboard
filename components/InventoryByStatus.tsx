'use client';
import {useMemo, useState} from 'react';
import {Download} from 'lucide-react';
import {CLASSIFICATION_STYLES, STATUS_GROUPS, UNCLASSIFIED_STYLE, statusCrossTab, statusGroup, statusLabel, toExcelCsv, type DressClassification, type StatusGroupId} from '@/lib/inventory';

type Dress={id:string;codigo:string;nombre?:string|null;talla?:string|null;color?:string|null;estado?:string|null;sede_actual_id?:string|null;clasificacion_id?:number|null};
type Props={vestidos:Dress[];sedes:{id:string;nombre:string}[];clasificaciones:DressClassification[]};

const CARD_STYLES:Record<string,string>={disponible:'border-emerald-200 text-emerald-700',mantenimiento:'border-amber-200 text-amber-700',reservado:'border-indigo-200 text-indigo-700',
 vendido:'border-gray-300 text-gray-800',baja:'border-rose-200 text-rose-700',evento:'border-sky-200 text-sky-700',otro:'border-gray-200 text-gray-600'};

export default function InventoryByStatus({vestidos,sedes,clasificaciones}:Props){
 const [group,setGroup]=useState<StatusGroupId>('mantenimiento');
 const [sede,setSede]=useState('');
 const [clasificacion,setClasificacion]=useState('');
 const table=useMemo(()=>statusCrossTab(vestidos,sedes),[vestidos,sedes]);
 const groups=[...STATUS_GROUPS.map(g=>({id:g.id as StatusGroupId,label:g.label})),...(table.showOther?[{id:'otro' as StatusGroupId,label:'Otro estado'}]:[])];
 const sedeName=(id?:string|null)=>sedes.find(s=>s.id===id)?.nombre||'Sin sede asignada';
 const className=(id?:number|null)=>clasificaciones.find(c=>c.id===id)?.nombre||'Sin clasificar';
 const knownSede=(id?:string|null)=>!!id&&sedes.some(s=>s.id===id);
 const list=vestidos.filter(v=>statusGroup(v.estado)===group
  &&(sede===''||(sede==='none'?!knownSede(v.sede_actual_id):v.sede_actual_id===sede))
  &&(clasificacion===''||(clasificacion==='none'?!v.clasificacion_id:String(v.clasificacion_id)===clasificacion)))
  .sort((a,b)=>String(a.codigo).localeCompare(String(b.codigo),'es',{numeric:true}));
 const groupLabel=groups.find(g=>g.id===group)?.label||'';
 const pct=(n:number)=>table.totals.total?`${(n*100/table.totals.total).toFixed(1)}% del inventario`:'—';

 const exportExcel=()=>{
  const csv=toExcelCsv(['Código','Nombre','Clasificación','Talla','Color','Sede','Estado'],
   list.map(v=>[v.codigo,v.nombre,className(v.clasificacion_id),v.talla,v.color,sedeName(v.sede_actual_id),statusLabel(v.estado)]));
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=`inventario-${groupLabel.replace(/[^\p{L}\p{N}]+/gu,'-').toLowerCase()}.csv`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 };

 return <div className="space-y-6">
  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
   {groups.map(g=><button key={g.id} onClick={()=>setGroup(g.id)}
    className={`text-left bg-white rounded-3xl p-5 border-2 transition-all ${CARD_STYLES[g.id]} ${group===g.id?'shadow-lg ring-2 ring-rose-200':'border-opacity-60 hover:shadow-md'}`}>
    <p className="text-[10px] font-black uppercase tracking-widest">{g.label}</p>
    <p className="text-3xl font-black text-gray-900 mt-1">{table.totals.counts[g.id]}</p>
    <p className="text-[10px] font-bold text-gray-400 mt-1">{pct(table.totals.counts[g.id])}</p>
   </button>)}
  </div>

  <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
   <p className="px-6 pt-5 pb-3 text-xs font-black text-gray-500 uppercase tracking-widest">Estado por sede</p>
   <div className="overflow-x-auto"><table className="w-full text-sm">
    <thead><tr className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
     <th className="px-6 py-3 text-left">Sede</th>{groups.map(g=><th key={g.id} className="px-4 py-3 text-right">{g.label}</th>)}<th className="px-6 py-3 text-right">Total</th></tr></thead>
    <tbody className="divide-y divide-gray-100">
     {table.lines.map(l=><tr key={l.id||'none'}>
      <td className={`px-6 py-3 font-black ${l.id?'text-gray-800':'text-amber-700'}`}>{l.nombre}</td>
      {groups.map(g=><td key={g.id} className="px-4 py-3 text-right">
       {l.counts[g.id]?<button className="font-bold text-gray-700 hover:text-rose-600 underline-offset-2 hover:underline" onClick={()=>{setGroup(g.id);setSede(l.id||'none');}}>{l.counts[g.id]}</button>:<span className="text-gray-300">0</span>}
      </td>)}
      <td className="px-6 py-3 text-right font-black">{l.total}</td></tr>)}
     <tr className="bg-gray-50 font-black"><td className="px-6 py-3">Total</td>{groups.map(g=><td key={g.id} className="px-4 py-3 text-right">{table.totals.counts[g.id]}</td>)}<td className="px-6 py-3 text-right">{table.totals.total}</td></tr>
    </tbody>
   </table></div>
  </div>

  <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
   <div className="px-6 py-4 flex flex-wrap gap-3 items-center justify-between border-b border-gray-100">
    <p className="font-black text-gray-900">{groupLabel} · {sede===''?'Todas las sedes':sede==='none'?'Sin sede asignada':sedeName(sede)} <span className="text-gray-400">({list.length})</span></p>
    <div className="flex flex-wrap gap-2">
     <select value={sede} onChange={e=>setSede(e.target.value)} className="px-3 py-2 bg-gray-50 rounded-xl text-xs font-bold text-gray-700 border border-gray-100">
      <option value="">Todas las sedes</option>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}<option value="none">Sin sede asignada</option></select>
     <select value={clasificacion} onChange={e=>setClasificacion(e.target.value)} className="px-3 py-2 bg-gray-50 rounded-xl text-xs font-bold text-gray-700 border border-gray-100">
      <option value="">Todas las clasificaciones</option>{clasificaciones.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}<option value="none">Sin clasificar</option></select>
     <button onClick={exportExcel} disabled={!list.length} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-black flex items-center gap-2"><Download className="w-4 h-4"/>Exportar Excel</button>
    </div>
   </div>
   <div className="overflow-x-auto"><table className="w-full text-sm">
    <thead><tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
     {['Código','Nombre','Clasificación','Talla','Color','Sede','Estado'].map(h=><th key={h} className="px-6 py-3 text-left">{h}</th>)}</tr></thead>
    <tbody className="divide-y divide-gray-100">
     {list.map(v=>{const c=className(v.clasificacion_id);return <tr key={v.id}>
      <td className="px-6 py-3 font-black">{v.codigo}</td><td className="px-6 py-3">{v.nombre||'—'}</td>
      <td className="px-6 py-3"><span className={`px-2 py-0.5 rounded-full border text-[10px] font-black ${CLASSIFICATION_STYLES[c]||UNCLASSIFIED_STYLE}`}>{c}</span></td>
      <td className="px-6 py-3">{v.talla||'—'}</td><td className="px-6 py-3">{v.color||'—'}</td><td className="px-6 py-3">{sedeName(v.sede_actual_id)}</td><td className="px-6 py-3 text-gray-500">{v.estado||'Disponible'}</td>
     </tr>;})}
     {!list.length&&<tr><td colSpan={7} className="px-6 py-10 text-center text-gray-400 font-bold">No hay códigos en este estado con los filtros elegidos.</td></tr>}
    </tbody>
   </table></div>
  </div>
 </div>;
}
