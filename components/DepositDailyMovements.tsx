'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {bogotaDay} from '@/lib/contract-calendar';
import {money} from '@/lib/deposits';
import {dailyTotals,filterDaily,type DailyFilters,type DailyMovement} from '@/lib/deposit-daily';
import DepositReceiptViewer,{type ReceiptTarget} from './DepositReceiptViewer';
import styles from '@/app/dashboard/devoluciones-depositos/deposits.module.css';

const time=(iso:string)=>new Date(iso).toLocaleTimeString('es-CO',{timeZone:'America/Bogota',hour:'2-digit',minute:'2-digit'});
const dayLabel=(day:string)=>new Date(day+'T12:00:00Z').toLocaleDateString('es-CO',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric'});

/** Statement of every deposit movement registered on a day, read-only, with the receipt one click away. */
export default function DepositDailyMovements({canChangeReceipts,canRemoveReceipts=false,onChanged}:{canChangeReceipts:boolean;canRemoveReceipts?:boolean;onChanged:()=>void}){
 const today=bogotaDay(new Date().toISOString())!;
 const [day,setDay]=useState(today),[rows,setRows]=useState<DailyMovement[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [filters,setFilters]=useState<DailyFilters>({sede:'',tipo:'',metodo:''}),[viewer,setViewer]=useState<ReceiptTarget|null>(null);
 const request=useRef(0);
 const load=useCallback(async()=>{
  const id=++request.current;
  try{
   const {data,error}=await supabase.rpc('movimientos_depositos_dia',{p_desde:day,p_hasta:day});
   if(error)throw error;
   if(id===request.current){setRows((data||[]) as DailyMovement[]);setError('');}
  }catch{if(id===request.current){setRows([]);setError('No se pudieron consultar los movimientos del día. Pulsa Actualizar para reintentar.');}}
  finally{if(id===request.current)setLoading(false);}
 },[day]);
 // New movements appear without waiting for the day to close: refresh while the page is visible.
 useEffect(()=>{void load();const refresh=()=>{if(document.visibilityState==='visible'&&!viewer)void load();};const timer=window.setInterval(refresh,60000);window.addEventListener('depositos-actualizados',refresh);return()=>{window.clearInterval(timer);window.removeEventListener('depositos-actualizados',refresh);};},[load,viewer]);
 const sites=useMemo(()=>Array.from(new Map(rows.filter(r=>r.sede_id).map(r=>[r.sede_id!,r.sede]))),[rows]);
 const methods=useMemo(()=>Array.from(new Set(rows.map(r=>r.metodo))).sort(),[rows]);
 const shown=filterDaily(rows,filters),totals=dailyTotals(shown);
 return <section className={styles.card} aria-labelledby="daily-title">
  <div className={styles.historyHeader}><div><h2 id="daily-title">Movimientos del día</h2><p>Ingresos y devoluciones registrados en el día, con su comprobante. Solo consulta: los valores no se editan aquí.</p></div><button onClick={()=>{setLoading(true);void load();}} disabled={loading}><RefreshCw size={16}/>{loading?'Actualizando…':'Actualizar'}</button></div>
  <div className={styles.filters}>
   <label className={styles.dateFilters}>Fecha<input type="date" max={today} value={day} onChange={e=>{if(e.target.value&&e.target.value!==day){setLoading(true);setDay(e.target.value);}}}/></label>
   <select aria-label="Sede del movimiento" value={filters.sede} onChange={e=>setFilters({...filters,sede:e.target.value})}><option value="">Todas las sedes disponibles</option>{sites.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
   <select aria-label="Tipo de movimiento" value={filters.tipo} onChange={e=>setFilters({...filters,tipo:e.target.value as DailyFilters['tipo']})}><option value="">Ingresos y salidas</option><option value="ingreso">Solo ingresos</option><option value="devolucion">Solo salidas (devoluciones)</option></select>
   <select aria-label="Medio de pago" value={filters.metodo} onChange={e=>setFilters({...filters,metodo:e.target.value})}><option value="">Todos los medios de pago</option>{methods.map(m=><option key={m}>{m}</option>)}</select>
   <span>{shown.length} movimientos</span>
  </div>
  <div className={styles.stats}>
   <div><span>Depósitos recibidos</span><strong className={styles.amountIn}>{money(totals.ingresos)}</strong></div>
   <div><span>Depósitos devueltos o pagados</span><strong className={styles.amountOut}>{money(totals.salidas)}</strong></div>
   <div><span>Saldo neto del día</span><strong>{money(totals.neto)}</strong></div>
   <div><span>Descuentos aplicados (no es efectivo)</span><strong>{money(totals.descuentos)}</strong></div>
  </div>
  {totals.sinComprobante>0&&<p className={styles.legacy}>{totals.sinComprobante} movimiento{totals.sinComprobante===1?'':'s'} sin comprobante en esta consulta.</p>}
  {error&&<p role="alert" className={styles.error}>{error}</p>}{notice&&<p role="status" className={styles.notice}>{notice}</p>}
  <div className={styles.tableScroll}><table><thead><tr><th>Fecha y hora</th><th>Tipo</th><th>Cliente / cédula</th><th>Contrato / factura</th><th>Valor</th><th>Medio de pago</th><th>Sede</th><th>Registró</th><th>Comprobante</th></tr></thead><tbody>
   {shown.map(r=><tr key={r.id}>
    <td><strong>{dayLabel(bogotaDay(r.registrado_at)!)} · {time(r.registrado_at)}</strong>{r.fecha!==bogotaDay(r.registrado_at)&&<small>Fecha del movimiento: {dayLabel(r.fecha)}</small>}</td>
    <td><span className={`${styles.badge} ${r.tipo==='ingreso'?styles.badgeIn:styles.badgeOut}`}>{r.tipo==='ingreso'?'Ingreso':'Salida · devolución'}</span></td>
    <td><strong>{r.cliente_nombre}</strong><small>C.C. {r.cliente_documento||'Sin cédula'}</small></td>
    <td><strong>{r.numero_contrato}</strong><small>Factura: {r.numero_factura||'Sin factura'}</small></td>
    <td className={r.tipo==='ingreso'?styles.amountIn:styles.amountOut}>{r.tipo==='ingreso'?'+':'−'}{money(r.monto)}{Number(r.descuento)>0&&<small>Descuento: {money(r.descuento)}{r.motivo?` · ${r.motivo}`:''}</small>}</td>
    <td>{r.metodo}</td><td>{r.sede}</td><td>{r.usuario}</td>
    <td>{r.comprobante_path?<button onClick={()=>setViewer({tipo:'movimiento',id:r.id,contratoId:r.contrato_id,path:r.comprobante_path,titulo:`${r.numero_contrato} · ${r.cliente_nombre} · ${r.tipo==='ingreso'?'Ingreso':'Devolución'} ${money(r.monto)}`})}>Ver comprobante</button>:canChangeReceipts?<button onClick={()=>setViewer({tipo:'movimiento',id:r.id,contratoId:r.contrato_id,path:null,titulo:`${r.numero_contrato} · ${r.cliente_nombre}`})}>Adjuntar</button>:'Sin comprobante'}</td>
   </tr>)}
  </tbody></table></div>
  {!shown.length&&<p className={styles.empty}>{loading?'Cargando movimientos…':'No hay movimientos registrados ese día con estos filtros.'}</p>}
  {viewer&&<DepositReceiptViewer key={viewer.id+String(viewer.path)} target={viewer} canChange={canChangeReceipts} canRemove={canRemoveReceipts} onClose={()=>setViewer(null)} onChanged={message=>{setViewer(null);setNotice(message);void load();onChanged();}}/>}
 </section>;
}
