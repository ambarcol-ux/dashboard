'use client';
import {useEffect,useMemo,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {money} from '@/lib/deposits';
import type {CashSiteSummary} from '@/lib/cash';
import styles from '@/app/dashboard/caja/caja.module.css';

type Row={concepto:string;fecha:string;contrato:string|null;valor:number;medio:string|null;caja:string|null;siigo:string|null;siigo_estado:string|null;siigo_error:string|null;siigo_valor:number|null;aplica_siigo:boolean;nota:string|null};

/** Cierres de caja › «Cuadre con Siigo»: every money event of a store (payments, deposits, returns, invoices, purchases) with its
 * place in the cash register and its Siigo document; what does not match is listed first. */
export default function SiigoConciliacion({sites,sede:inicial,today}:{sites:CashSiteSummary[];sede:string;today:string}){
 const [sede,setSede]=useState(inicial||sites[0]?.sede_id||''),[desde,setDesde]=useState(()=>new Date(Date.parse(today+'T12:00:00Z')-6*86400000).toISOString().slice(0,10)),[hasta,setHasta]=useState(today);
 const [rows,setRows]=useState<Row[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false),[solo,setSolo]=useState(true);
 useEffect(()=>{if(!sede)return;let live=true;
  void (async()=>{setLoading(true);const {data,error:e}=await supabase.rpc('siigo_conciliacion',{p_sede:sede,p_desde:desde,p_hasta:hasta});
   if(!live)return;setLoading(false);if(e){setError(e.message);setRows([]);}else{setError('');setRows((data||[]) as Row[]);}})();
  return ()=>{live=false;};},[sede,desde,hasta]);
 const novedades=useMemo(()=>rows.filter(r=>r.nota),[rows]);
 const resumen=useMemo(()=>{const by=new Map<string,{n:number;valor:number;nov:number}>();
  for(const r of rows){const k=by.get(r.concepto)||{n:0,valor:0,nov:0};k.n++;k.valor+=Number(r.valor)||0;if(r.nota)k.nov++;by.set(r.concepto,k);}return [...by.entries()];},[rows]);
 const ver=solo?novedades:rows;
 return <section className={styles.card}>
  <h2>Cuadre con Siigo</h2>
  <p className={styles.help}>Cada movimiento de dinero del ERP con su lugar en la caja y su documento en Siigo. Lo que no cuadra sale con la novedad.</p>
  <div className={styles.toolbar} style={{marginBottom:12}}>
   <label>Sede<select value={sede} onChange={e=>setSede(e.target.value)}>{sites.map(s=><option key={s.sede_id} value={s.sede_id}>{s.sede}</option>)}</select></label>
   <label>Desde<input type="date" value={desde} max={hasta} onChange={e=>setDesde(e.target.value)}/></label>
   <label>Hasta<input type="date" value={hasta} min={desde} max={today} onChange={e=>setHasta(e.target.value)}/></label>
   <label style={{display:'flex',alignItems:'center',gap:6}}><input type="checkbox" checked={solo} onChange={e=>setSolo(e.target.checked)}/>Solo novedades</label>
  </div>
  {error&&<p className={styles.error}>{error}</p>}
  {loading?<p className={styles.empty}>Cargando…</p>:<>
   <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Concepto</th><th>Movimientos</th><th>Valor</th><th>Novedades</th></tr></thead>
    <tbody>{resumen.map(([k,v])=><tr key={k}><td>{k}</td><td>{v.n}</td><td>{money(v.valor)}</td><td>{v.nov?<span className={`${styles.badge} ${styles.badgeWarn}`}>{v.nov}</span>:'✓'}</td></tr>)}</tbody></table></div>
   {ver.length===0?<p className={styles.empty}>{solo?'Todo cuadra en este rango.':'Sin movimientos en este rango.'}</p>:
   <div className={styles.tableScroll} style={{marginTop:12}}><table className={styles.table}><thead><tr><th>Día</th><th>Concepto</th><th>Contrato</th><th>Valor</th><th>Caja</th><th>Siigo</th><th>Novedad</th></tr></thead>
    <tbody>{ver.map((r,i)=><tr key={i}><td>{r.fecha}</td><td>{r.concepto}{r.medio?` · ${r.medio}`:''}</td><td>{r.contrato||'—'}</td><td>{money(Number(r.valor))}</td>
     <td>{r.concepto==='Factura'?'—':r.caja?'✓':'Falta'}</td>
     <td>{r.siigo?`${r.siigo}${r.siigo_estado&&r.siigo_estado!=='enviado'?` (${r.siigo_estado})`:''}`:r.aplica_siigo?'Falta':'No aplica'}</td>
     <td>{r.nota?<span className={`${styles.badge} ${styles.badgeWarn}`}>{r.nota}</span>:'✓'}</td></tr>)}</tbody></table></div>}
  </>}
 </section>;
}
