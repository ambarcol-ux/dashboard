'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useAprobadorSedes} from '@/lib/aprobador-contable';
import DepositAccountSelect from '@/components/DepositAccountSelect';
import {supabase} from '@/lib/supabase';
import {money} from '@/lib/deposits';
import {CASH_METHODS,cashReceiptPath} from '@/lib/cash';
import {liquidarDesistimiento} from '@/lib/desistimiento';
import styles from '@/app/dashboard/devoluciones-depositos/deposits.module.css';

type Fila={contrato_id:string;numero:string;cliente:string|null;sede_id:string;sede:string;fecha:string;pagado:number;liquidado:boolean;id:string|null;citas:number|null;
 arreglos:number|null;retencion:number|null;devolver:number|null;estado:'pendiente'|'devuelto'|'sin_devolucion'|null;fecha_devolucion:string|null;medio:string|null;historico:boolean|null};
const hoy=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota'}).format(new Date());
const ESTADO={pendiente:'Devolución pendiente',devuelto:'Devuelto',sin_devolucion:'Sin devolución (todo retenido)'};

/** Depósitos y devoluciones › Desistimientos: cancelled contracts with payments, their settlement (paid − retention = return, per the
 *  contract clause) and the registered return (cash-register expense «Devolución por desistimiento» with receipt). */
export default function Desistimientos({finanzas}:{finanzas:boolean}){
 const aprueba=useAprobadorSedes();
 const [rows,setRows]=useState<Fila[]|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[devolver,setDevolver]=useState<Fila|null>(null);
 const load=useCallback(async()=>{const {data,error:e}=await supabase.rpc('desistimientos_listar');if(e)setError(e.message);else setRows((data||[]) as Fila[]);},[]);
 useEffect(()=>{const t=setTimeout(()=>void load(),0);return()=>clearTimeout(t);},[load]);
 const liquidar=async(f:Fila)=>{setError('');try{if(await liquidarDesistimiento(f.contrato_id,'Liquidación de desistimiento')){setNotice(`Liquidación de ${f.numero} guardada.`);await load();}}catch(e){setError(e instanceof Error?e.message:'No se pudo liquidar.');}};
 if(!rows)return null;
 const t=rows.reduce((a,r)=>({pagado:a.pagado+Number(r.pagado),ret:a.ret+Number(r.retencion||0),dev:a.dev+(r.estado==='devuelto'?Number(r.devolver||0):0),pend:a.pend+(r.estado==='pendiente'?Number(r.devolver||0):0)}),{pagado:0,ret:0,dev:0,pend:0});
 return <section id="desistimientos" className={styles.card}>
  <h2>Desistimientos</h2>
  <p className={styles.note}>Contratos cancelados con abonos. Según el contrato se retiene un valor por cada cita usada (primera vez, medidas, prueba final) más los arreglos hechos; el resto se devuelve a la clienta con su comprobante. La devolución sale de la caja o cuenta de la sede y no es un gasto: baja el ingreso.</p>
  <p className={styles.note}>Pagado {money(t.pagado)} · Retenido {money(t.ret)} · Devuelto {money(t.dev)} · Por devolver {money(t.pend)}</p>
  {error&&<p role="alert" className={styles.error}>{error}</p>}{notice&&<p role="status" className={styles.notice}>{notice}</p>}
  <div className={styles.tableScroll}><table><thead><tr><th>Contrato / clienta</th><th>Pagado</th><th>Retención</th><th>A devolver</th><th>Estado</th><th></th></tr></thead><tbody>
   {rows.map(r=><tr key={r.contrato_id}><td><strong>{r.numero}</strong><br/>{r.cliente||'—'} · {r.sede}</td><td>{money(Number(r.pagado))}</td>
    <td>{r.liquidado?<>{money(Number(r.retencion))}<br/><small>{r.citas} cita(s) + arreglos {money(Number(r.arreglos))}</small></>:'—'}</td>
    <td>{r.liquidado?money(Number(r.devolver)):'—'}</td>
    <td>{!r.liquidado?'Sin liquidar':ESTADO[r.estado!]}{r.estado==='devuelto'&&<><br/><small>{r.fecha_devolucion} · {r.medio}{r.historico?' · histórico':''}</small></>}</td>
    <td><div className={styles.rowActions}>{!r.liquidado?<button onClick={()=>void liquidar(r)}>Liquidar</button>:r.estado==='pendiente'?<button onClick={()=>{setNotice('');setDevolver(r);}}>Registrar devolución</button>:null}</div></td></tr>)}
  </tbody></table></div>
  {!rows.length&&<p className={styles.empty}>No hay contratos cancelados con abonos.</p>}
  {devolver&&<FormDevolucion fila={devolver} finanzas={finanzas||aprueba.includes(devolver.sede_id)} onClose={()=>setDevolver(null)} onDone={async()=>{setDevolver(null);setNotice('Devolución registrada en la caja de la sede.');await load();}}/>}
 </section>;
}

function FormDevolucion({fila,finanzas,onClose,onDone}:{fila:Fila;finanzas:boolean;onClose:()=>void;onDone:()=>Promise<void>}){
 const [fecha,setFecha]=useState(hoy),[medio,setMedio]=useState('Transferencia'),[cuenta,setCuenta]=useState(''),[file,setFile]=useState<File|null>(null),[historico,setHistorico]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const op=useRef(crypto.randomUUID());
 const guardar=async()=>{
  setError('');
  if(!historico&&!file){setError('Adjunta el comprobante de la devolución.');return;}
  setBusy(true);
  try{
   let path:string|null=null;
   if(file){
    if(file.size>10*1024*1024)throw Error('El comprobante supera 10 MB.');
    path=cashReceiptPath(fila.sede_id,fecha,op.current,file.type);
    const {error:ue}=await supabase.storage.from('comprobantes_caja').upload(path,file,{upsert:false});
    if(ue&&!/exists|duplicate/i.test(ue.message))throw Error('No se pudo subir el comprobante.');
   }
   const {error:e}=await supabase.rpc('desistimiento_devolver',{p_id:fila.id,p_fecha:fecha,p_medio:medio,p_cuenta:medio==='Efectivo'?null:(cuenta||null),p_comprobante:path,p_historico:historico});
   if(e)throw Error(e.message);
   await onDone();
  }catch(e){setError(e instanceof Error?e.message:'No se pudo registrar.');}finally{setBusy(false);}
 };
 return <div className={styles.card}>
  <h2>Devolución {fila.numero} · {money(Number(fila.devolver))}</h2>
  <div className={styles.formGrid}><label>Fecha<input type="date" value={fecha} max={hoy()} onChange={e=>setFecha(e.target.value)}/></label>
  <label>Medio<select value={medio} onChange={e=>setMedio(e.target.value)}>{CASH_METHODS.map(m=><option key={m}>{m}</option>)}</select></label>
  <DepositAccountSelect sedeId={fila.sede_id} medio={medio} value={cuenta} onChange={setCuenta}/>
  <label>Comprobante (foto o PDF){historico?' — opcional':''}<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
  {finanzas&&<label><input type="checkbox" checked={historico} onChange={e=>setHistorico(e.target.checked)}/> Devolución histórica (hecha antes de la caja o hace más de 31 días): no crea movimiento en la caja</label>}
  </div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <div className={styles.modalFooter}><button onClick={onClose} disabled={busy}>Cancelar</button><button onClick={()=>void guardar()} disabled={busy}>{busy?'Guardando…':'Registrar devolución'}</button></div>
 </div>;
}
