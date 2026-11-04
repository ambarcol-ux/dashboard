'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import writeXlsxFile from 'write-excel-file';
import {RefreshCw} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {COBRO_EXCLUIDOS,COBRO_FIELDS,PLAZOS,diasParaEntrega,fechaEntrega,hoyBogota,porCobrar,plazoCobro,type Cobro,type Plazo} from '@/lib/cobros';
import styles from '@/app/dashboard/caja/caja.module.css';

const money=(n:number)=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n);
const ORDEN:Plazo[]=['vencido','tres','siete','despues','entregado'];
const COLOR:Record<Plazo,{background:string;color:string}>={vencido:{background:'#fef2f2',color:'#b91c1c'},tres:{background:'#fff7ed',color:'#c2410c'},siete:{background:'#fffbeb',color:'#a16207'},despues:{background:'#f1f5f9',color:'#475569'},entregado:{background:'#eef2ff',color:'#4338ca'}};

/** Finanzas › Cuentas por cobrar: contracts of the user's sites with a balance, filterable, with totals and Excel. */
export default function CobrosModule({userId}:{userId:string}){
 const [rows,setRows]=useState<Cobro[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [sede,setSede]=useState(''),[plazo,setPlazo]=useState<''|'urgentes'|Plazo>('urgentes'),[asesora,setAsesora]=useState(''),[q,setQ]=useState(''),[mios,setMios]=useState(false);
 const fetchRows=()=>supabase.from('contratos').select(COBRO_FIELDS).not('estado','in',`(${COBRO_EXCLUIDOS.join(',')})`).limit(3000);
 const apply=({data,error:e}:{data:unknown;error:unknown})=>{if(e)setError('No se pudieron cargar los contratos.');else{setRows(((data||[]) as Cobro[]).filter(c=>porCobrar(c)>0));setError('');}setLoading(false);};
 useEffect(()=>{let live=true;void fetchRows().then(r=>{if(live)apply(r);});return()=>{live=false;};},[]);
 const refresh=()=>{setLoading(true);void fetchRows().then(apply);};
 const hoy=hoyBogota();
 const asesoraDe=(c:Cobro)=>c.nombre_asesora||c.asesora||'Sin asesora';
 const sedes=[...new Set(rows.map(r=>r.sede||'Sin sede'))].sort();
 const asesoras=[...new Set(rows.map(asesoraDe))].sort();
 const list=useMemo(()=>rows.filter(c=>{const p=plazoCobro(c,hoy);const t=q.trim().toLowerCase();
  return (!sede||(c.sede||'Sin sede')===sede)&&(!asesora||asesoraDe(c)===asesora)&&(!mios||c.asesora_id===userId)
   &&(!plazo||(plazo==='urgentes'?['vencido','tres','siete'].includes(p):p===plazo))
   &&(!t||`${c.numero_contrato} ${c.cliente_nombre}`.toLowerCase().includes(t));})
  .sort((a,b)=>ORDEN.indexOf(plazoCobro(a,hoy))-ORDEN.indexOf(plazoCobro(b,hoy))||String(fechaEntrega(a)).localeCompare(String(fechaEntrega(b)))),[rows,sede,asesora,mios,plazo,q,hoy,userId]);
 const total=list.reduce((s,c)=>s+porCobrar(c),0);
 const resumen=ORDEN.map(p=>{const r=rows.filter(c=>plazoCobro(c,hoy)===p);return {p,n:r.length,v:r.reduce((s,c)=>s+porCobrar(c),0)};});
 const exportar=async()=>{const headers=['Contrato','Cliente','WhatsApp','Sede','Asesora','Estado','Entrega','Días','Plazo','Total contrato','Abonado','Multas','Por cobrar'];
  await writeXlsxFile([headers.map(value=>({value,fontWeight:'bold' as const})),...list.map(c=>[c.numero_contrato,c.cliente_nombre,c.cliente_whatsapp||c.whatsapp||'',c.sede,asesoraDe(c),c.estado,fechaEntrega(c)||'',diasParaEntrega(c,hoy)??'',PLAZOS[plazoCobro(c,hoy)],
   (Number(c.valor_total)||0)+(Number(c.total_arreglos)||0),Number(c.anticipo)||0,Number(c.total_multas)||0,porCobrar(c)].map(value=>({value:value??''})))],{fileName:`cuentas-por-cobrar-${hoy}.xlsx`});};
 return <>
  <div className={styles.stats}>{resumen.filter(r=>r.n).map(r=><div key={r.p} style={{cursor:'pointer',outline:plazo===r.p?'2px solid #e11d48':undefined}} onClick={()=>setPlazo(plazo===r.p?'':r.p)}><span>{PLAZOS[r.p]}</span><strong style={{color:COLOR[r.p].color}}>{money(r.v)}</strong><span>{r.n} contrato{r.n===1?'':'s'}</span></div>)}</div>
  <section className={styles.card}>
   <div className={styles.toolbar} style={{marginBottom:12}}>
    <label>Plazo<select value={plazo} onChange={e=>setPlazo(e.target.value as typeof plazo)}><option value="urgentes">Urgentes (7 días o vencidos)</option><option value="">Todos con saldo</option>{ORDEN.map(p=><option key={p} value={p}>{PLAZOS[p]}</option>)}</select></label>
    <label>Sede<select value={sede} onChange={e=>setSede(e.target.value)}><option value="">Todas mis sedes</option>{sedes.map(s=><option key={s}>{s}</option>)}</select></label>
    <label>Asesora<select value={asesora} onChange={e=>setAsesora(e.target.value)}><option value="">Todas</option>{asesoras.map(s=><option key={s}>{s}</option>)}</select></label>
    <label>Buscar<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Contrato o cliente"/></label>
    <label className={styles.check}><input type="checkbox" checked={mios} onChange={e=>setMios(e.target.checked)}/>Solo mis contratos</label>
    <button className={styles.button} onClick={refresh} disabled={loading}><RefreshCw size={14} style={{display:'inline',verticalAlign:'-2px'}}/> {loading?'Actualizando…':'Actualizar'}</button>
    <button className={styles.button} onClick={()=>void exportar()} disabled={!list.length}>Exportar Excel</button>
   </div>
   {error&&<p role="alert" className={styles.error}>{error}</p>}
   <p className={styles.help}><b>{list.length}</b> contrato{list.length===1?'':'s'} · por cobrar <b>{money(total)}</b>. El vestido no se puede entregar mientras el contrato tenga saldo.</p>
   {loading?<p className={styles.empty}>Cargando…</p>:list.length?<div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Contrato</th><th>Entrega</th><th>Sede / asesora</th><th>Total / abonado</th><th>Por cobrar</th><th/></tr></thead>
    <tbody>{list.map(c=>{const p=plazoCobro(c,hoy),d=diasParaEntrega(c,hoy);return <tr key={c.id}>
     <td><strong>{c.numero_contrato}</strong><small>{c.cliente_nombre}{(c.cliente_whatsapp||c.whatsapp)?` · ${c.cliente_whatsapp||c.whatsapp}`:''}</small></td>
     <td>{fechaEntrega(c)||'—'}<small><span className={styles.badge} style={COLOR[p]}>{p==='vencido'?`Vencido hace ${Math.abs(d||0)} día${Math.abs(d||0)===1?'':'s'}`:p==='entregado'?'Entregado':d==null?'Sin fecha':d===0?'Se entrega hoy':`En ${d} día${d===1?'':'s'}`}</span></small></td>
     <td>{c.sede||'—'}<small>{asesoraDe(c)}</small></td>
     <td>{money((Number(c.valor_total)||0)+(Number(c.total_arreglos)||0))}<small>Abonado {money(Number(c.anticipo)||0)}{Number(c.total_multas)?` · multas ${money(Number(c.total_multas))}`:''}</small></td>
     <td><strong style={{color:COLOR[p].color}}>{money(porCobrar(c))}</strong></td>
     <td><div className={styles.actions}><Link className={styles.primary} style={{padding:'6px 10px',borderRadius:10,fontSize:12,fontWeight:800}} href={`/dashboard/pago/${c.id}`}>Registrar abono</Link></div></td>
    </tr>;})}</tbody></table></div>:<p className={styles.empty}>No hay contratos con saldo para estos filtros.</p>}
  </section>
 </>;
}
