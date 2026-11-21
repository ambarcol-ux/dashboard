'use client';
import {useCallback,useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {money} from '@/lib/deposits';
import styles from '@/app/dashboard/caja/caja.module.css';

type Solicitud={id:string;motivo:string;solicitado_at:string;solicitante:string|null;contrato:string;cliente:string|null;sede:string|null;valor:number;medio:string|null;fecha_pago:string};

/** Cierres de caja (administración y contabilidad): annulments of contract payments requested by the stores, to approve or reject. */
export default function AnulacionesPago(){
 const [rows,setRows]=useState<Solicitud[]>([]),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const load=useCallback(async()=>{const {data}=await supabase.rpc('anulaciones_pago_pendientes');setRows((data||[]) as Solicitud[]);},[]);
 useEffect(()=>{void Promise.resolve().then(load);},[load]);
 const resolver=async(s:Solicitud,aprobar:boolean)=>{
  const nota=window.prompt(aprobar?`¿Anular el abono de ${money(s.valor)} de ${s.contrato}? Nota opcional:`:'Motivo del rechazo (opcional):','');if(nota===null)return;
  setBusy(s.id);setError('');const {error:e}=await supabase.rpc('anulaciones_pago_resolver',{p_id:s.id,p_aprobar:aprobar,p_nota:nota});setBusy('');
  if(e)setError(e.message);else void load();};
 if(!rows.length)return null;
 return <section className={styles.card}><h2>Anulaciones de abonos por aprobar ({rows.length})</h2>
  <p className={styles.help}>Las sedes no pueden anular abonos: lo piden aquí. El abono sigue vigente hasta que lo apruebes.</p>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Sede</th><th>Contrato</th><th>Abono</th><th>Motivo</th><th>Pidió</th><th></th></tr></thead>
   <tbody>{rows.map(s=><tr key={s.id}><td>{s.sede||'—'}</td><td>{s.contrato}<br/><small>{s.cliente}</small></td><td>{money(s.valor)} · {s.medio||'—'}<br/><small>{s.fecha_pago}</small></td>
    <td>{s.motivo}</td><td>{s.solicitante||'—'}<br/><small>{new Date(s.solicitado_at).toLocaleString('es-CO')}</small></td>
    <td><button className={`${styles.button} ${styles.danger}`} disabled={busy===s.id} onClick={()=>void resolver(s,true)}>Aprobar</button> <button className={styles.button} disabled={busy===s.id} onClick={()=>void resolver(s,false)}>Rechazar</button></td></tr>)}</tbody></table></div>
 </section>;
}
