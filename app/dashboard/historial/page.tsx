'use client';
import {useCallback,useEffect,useState} from 'react';
import {History} from 'lucide-react';
import SupplierShell from '@/components/suppliers/SupplierShell';
import {supabase} from '@/lib/supabase';

type Fila={fecha:string|null;area:string;tabla:string;registro:string|null;accion:string|null;detalle:string|null;usuario:string|null;fuente:string};
const AREAS=['Contratos','Depósitos','Inventario','Primeras visitas','Aliados','Marketing','Finanzas','Proveedores','Operaciones','Metas','Equipo y permisos','WhatsApp e IA','Configuración'];
const POR_PAGINA=100;
const input='border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white';
const verFecha=(f:string|null)=>f?new Date(f).toLocaleString('es-CO',{timeZone:'America/Bogota',day:'numeric',month:'short',year:'2-digit',hour:'numeric',minute:'2-digit'}):'—';

/** Configuración › Historial y auditoría (administration): every change of the ERP in one place — the existing logs plus the automatic history of the tables that had none. */
export default function HistorialPage(){
 return <SupplierShell activePage="historial" adminOnly crumb="Configuración / Historial y auditoría" title="Historial y auditoría" icon={<History/>}
  description="Qué cambió, cuándo y quién lo hizo, en todo el ERP: contratos, depósitos, inventario, primeras visitas, aliados, permisos y configuración. Busca por número de contrato, código de vestido o persona.">
  {()=><Historial/>}
 </SupplierShell>;
}

function Historial(){
 const [f,setF]=useState({area:'',registro:'',texto:'',desde:'',hasta:''}),[filas,setFilas]=useState<Fila[]|null>(null),[pagina,setPagina]=useState(0),[error,setError]=useState('');
 const buscar=useCallback(async(p:number,filtro:typeof f)=>{
  setFilas(null);setError('');
  const {data,error:e}=await supabase.rpc('historial_buscar',{p_area:filtro.area||null,p_tabla:null,p_registro:filtro.registro.trim()||null,p_texto:filtro.texto.trim()||null,
   p_desde:filtro.desde||null,p_hasta:filtro.hasta||null,p_limite:POR_PAGINA,p_offset:p*POR_PAGINA});
  if(e){setError(e.message);setFilas([]);}else setFilas((data||[]) as Fila[]);setPagina(p);
 },[]);
 useEffect(()=>{const t=setTimeout(()=>void buscar(0,{area:'',registro:'',texto:'',desde:'',hasta:''}),0);return()=>clearTimeout(t);},[buscar]);
 return <div className="space-y-4">
  <form onSubmit={e=>{e.preventDefault();void buscar(0,f);}} className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap gap-2 items-end">
   <label className="text-xs font-bold text-gray-600">Área<br/><select className={input} value={f.area} onChange={e=>setF({...f,area:e.target.value})}><option value="">Todas</option>{AREAS.map(a=><option key={a}>{a}</option>)}</select></label>
   <label className="text-xs font-bold text-gray-600">Contrato, vestido o registro<br/><input className={input} value={f.registro} placeholder="Ej: 1234 o V-045" onChange={e=>setF({...f,registro:e.target.value})}/></label>
   <label className="text-xs font-bold text-gray-600">Texto o persona<br/><input className={input} value={f.texto} placeholder="Ej: depósito, Laura" onChange={e=>setF({...f,texto:e.target.value})}/></label>
   <label className="text-xs font-bold text-gray-600">Desde<br/><input type="date" className={input} value={f.desde} onChange={e=>setF({...f,desde:e.target.value})}/></label>
   <label className="text-xs font-bold text-gray-600">Hasta<br/><input type="date" className={input} value={f.hasta} onChange={e=>setF({...f,hasta:e.target.value})}/></label>
   <button type="submit" className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-black">Buscar</button>
  </form>
  {error&&<p className="text-red-600 font-bold text-sm">{error}</p>}
  {!filas?<p className="text-gray-400 font-bold">Cargando…</p>:!filas.length?<p className="text-sm text-gray-500">No hay cambios con esos filtros.</p>:
  <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
   <table className="w-full text-sm"><thead><tr className="text-left text-xs text-gray-500 border-b">
    <th className="p-3">Fecha</th><th className="p-3">Área</th><th className="p-3">Registro</th><th className="p-3">Acción</th><th className="p-3">Detalle</th><th className="p-3">Quién</th></tr></thead>
    <tbody>{filas.map((r,i)=><tr key={`${r.fuente}-${r.fecha}-${i}`} className="border-b last:border-0 align-top">
     <td className="p-3 whitespace-nowrap text-gray-600">{verFecha(r.fecha)}</td>
     <td className="p-3 whitespace-nowrap"><span className="text-[11px] font-black bg-gray-100 rounded-full px-2 py-0.5">{r.area}</span></td>
     <td className="p-3 font-bold whitespace-nowrap">{r.registro||'—'}</td>
     <td className="p-3">{r.accion}</td>
     <td className="p-3 text-gray-600 break-words max-w-xl">{r.detalle}</td>
     <td className="p-3 whitespace-nowrap text-gray-600">{r.usuario||'—'}</td>
    </tr>)}</tbody></table>
  </div>}
  <div className="flex gap-2 items-center">
   <button type="button" disabled={!pagina} onClick={()=>void buscar(pagina-1,f)} className="px-3 py-1.5 rounded-lg border text-xs font-black disabled:opacity-40">Anteriores</button>
   <span className="text-xs text-gray-500">Página {pagina+1}</span>
   <button type="button" disabled={!filas||filas.length<POR_PAGINA} onClick={()=>void buscar(pagina+1,f)} className="px-3 py-1.5 rounded-lg border text-xs font-black disabled:opacity-40">Siguientes</button>
  </div>
 </div>;
}
