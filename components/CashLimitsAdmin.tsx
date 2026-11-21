'use client';
import {useCallback,useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {money} from '@/lib/deposits';
import type {CashSiteSummary} from '@/lib/cash';
import styles from '@/app/dashboard/caja/caja.module.css';

/** Cierres de caja › Cuentas (administración y contabilidad): cash caps per store — cash in the drawer (above it, a bank deposit is
 *  required before the next closing) and cash deposits (above it, transfer or card). Empty = no cap. */
export default function CashLimitsAdmin({sites}:{sites:CashSiteSummary[]}){
 const [topes,setTopes]=useState<Record<string,{tope_efectivo:number|null;tope_deposito_efectivo:number|null}>>({}),[edit,setEdit]=useState<Record<string,{a:string;b:string}>>({}),[msg,setMsg]=useState(''),[error,setError]=useState('');
 const load=useCallback(async()=>{const {data}=await supabase.rpc('caja_topes');setTopes((data||{}) as typeof topes);},[]);
 useEffect(()=>{void Promise.resolve().then(load);},[load]);
 const guardar=async(id:string,nombre:string)=>{const e=edit[id];if(!e)return;setError('');setMsg('');
  const n=(v:string)=>v.trim()===''?null:Number(v.replace(/\D/g,''));
  const {error:re}=await supabase.rpc('caja_topes_guardar',{p_sede:id,p_tope:n(e.a),p_tope_deposito:n(e.b)});
  if(re)setError(re.message);else{setMsg(`Topes de ${nombre} guardados.`);setEdit(x=>{const y={...x};delete y[id];return y;});void load();}};
 return <section className={styles.card}><h2>Topes de efectivo por sede</h2>
  <p className={styles.help}>Cajón: si una caja cierra con más efectivo que el tope, al día siguiente hay que consignar el excedente antes de cerrar. Depósitos: por encima del tope, el depósito se recibe o se devuelve por transferencia o datáfono. Vacío = sin tope.</p>
  {msg&&<p role="status" className={styles.notice}>{msg}</p>}{error&&<p role="alert" className={styles.error}>{error}</p>}
  <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Sede</th><th>Tope del cajón</th><th>Tope depósitos en efectivo</th><th></th></tr></thead>
   <tbody>{sites.map(s=>{const t=topes[s.sede_id],e=edit[s.sede_id];return <tr key={s.sede_id}><td><strong>{s.sede}</strong></td>
    {e?<><td><input inputMode="numeric" value={e.a} onChange={x=>setEdit(v=>({...v,[s.sede_id]:{...e,a:x.target.value}}))}/></td><td><input inputMode="numeric" value={e.b} onChange={x=>setEdit(v=>({...v,[s.sede_id]:{...e,b:x.target.value}}))}/></td>
     <td><button className={`${styles.button} ${styles.primary}`} onClick={()=>void guardar(s.sede_id,s.sede)}>Guardar</button></td></>
    :<><td>{t?.tope_efectivo==null?'Sin tope':money(Number(t.tope_efectivo))}</td><td>{t?.tope_deposito_efectivo==null?'Sin tope':money(Number(t.tope_deposito_efectivo))}</td>
     <td><button className={styles.button} onClick={()=>setEdit(v=>({...v,[s.sede_id]:{a:t?.tope_efectivo==null?'':String(t.tope_efectivo),b:t?.tope_deposito_efectivo==null?'':String(t.tope_deposito_efectivo)}}))}>Cambiar</button></td></>}</tr>;})}</tbody></table></div>
 </section>;
}
