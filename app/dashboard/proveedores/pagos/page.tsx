'use client';
import {Suspense,useCallback,useEffect,useMemo,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {Banknote} from 'lucide-react';
import SupplierShell,{openSupplierFile} from '@/components/suppliers/SupplierShell';
import {supabase} from '@/lib/supabase';
import {money} from '@/lib/deposits';
import {bogotaDay} from '@/lib/contract-calendar';
import {SUPPLIER_PAYMENT_METHODS,bogotaDateTime,errorText,supplierFilePath,sumMoney} from '@/lib/suppliers';
import styles from '@/app/dashboard/caja/caja.module.css';

type Pending={id:string;proveedor_id:string;proveedor:string;servicio:string;descripcion:string;fecha_servicio:string;estado:string;valor_empresa:number;numero_contrato:string;cliente:string;sede_id:string;realizado_at:string|null;banco:string|null;tipo_cuenta:string|null;numero_cuenta:string|null};
type Payment={id:string;proveedor_id:string;proveedor:string;fecha_pago:string;valor_total:number;medio_pago:string;referencia:string|null;comprobante_path:string|null;registrado_por:string|null;anulado_at:string|null;motivo_anulacion:string|null;servicios:number};

export default function SupplierPaymentsPage(){
 return <SupplierShell activePage="proveedores-pagos" crumb="Proveedores / Pagos" title="Pagos a proveedores" icon={<Banknote/>} adminOnly
  description="Servicios realizados pendientes de pago. Marca los que vas a pagar, adjunta el comprobante y guarda: todo queda en una sola operación.">
  {()=><Suspense fallback={<p className={styles.empty}>Cargando…</p>}><Payments/></Suspense>}
 </SupplierShell>;
}

function Payments(){
 const params=useSearchParams();
 const today=bogotaDay(new Date().toISOString())!;
 const [sedes,setSedes]=useState<{id:string;nombre:string}[]>([]),[sede,setSede]=useState(''),[proveedor,setProveedor]=useState(params.get('proveedor')||'');
 const [pending,setPending]=useState<Pending[]>([]),[payments,setPayments]=useState<Payment[]>([]),[picked,setPicked]=useState<string[]>([]);
 const [form,setForm]=useState({fecha_pago:today,medio_pago:'Transferencia',referencia:''}),[file,setFile]=useState<File|null>(null),[fileKey,setFileKey]=useState(0);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');

 const load=useCallback(async()=>{
  const [r,s]=await Promise.all([supabase.rpc('servicios_por_pagar',{p_sede:sede||null,p_proveedor:proveedor||null}),supabase.from('sedes').select('id,nombre').order('nombre')]);
  if(r.error)setError(r.error.message);else{setPending(r.data.pendientes||[]);setPayments(r.data.pagos||[]);setError('');}
  setSedes(s.data||[]);setLoading(false);
 },[sede,proveedor]);
 useEffect(()=>{void load();},[load]);

 const suppliers=useMemo(()=>[...new Map(pending.map(p=>[p.proveedor_id,p.proveedor])).entries()].sort((a,b)=>a[1].localeCompare(b[1])),[pending]);
 const payable=(p:Pending)=>p.estado==='Realizado';
 const chosen=pending.filter(p=>picked.includes(p.id));
 const chosenSupplier=chosen[0]?.proveedor_id;
 const total=sumMoney(chosen.map(p=>p.valor_empresa));
 const toggle=(p:Pending)=>{
  if(!payable(p))return;
  if(chosenSupplier&&chosenSupplier!==p.proveedor_id)return setError('Un pago es para un solo proveedor. Termina este pago o desmarca los servicios del otro proveedor.');
  setError('');setPicked(picked.includes(p.id)?picked.filter(x=>x!==p.id):[...picked,p.id]);
 };

 const pay=async()=>{
  if(!chosen.length||!chosenSupplier)return;
  setBusy(true);setError('');setNotice('');
  try{
   let comprobante_path:string|null=null;
   if(file){
    if(file.size>10*1024*1024)throw Error('El comprobante supera 10 MB.');
    comprobante_path=supplierFilePath(chosenSupplier,file.type);
    const up=await supabase.storage.from('comprobantes_proveedores').upload(comprobante_path,file,{contentType:file.type});
    if(up.error)throw up.error;
   }
   const {error}=await supabase.rpc('registrar_pago_proveedor',{p_datos:{proveedor_id:chosenSupplier,servicios:picked,...form,comprobante_path}});
   if(error)throw error;
   setNotice(`Pago de ${money(total)} a ${chosen[0].proveedor} registrado.`);setPicked([]);setFile(null);setFileKey(k=>k+1);setForm({...form,referencia:''});void load();
  }catch(e){setError(errorText(e,'No se pudo registrar el pago.'));}
  finally{setBusy(false);}
 };
 const annul=async(p:Payment)=>{
  const motivo=prompt(`Motivo para anular el pago de ${money(p.valor_total)} a ${p.proveedor}. Sus servicios vuelven a Pendiente.`);
  if(motivo===null)return;
  const {error}=await supabase.rpc('anular_pago_proveedor',{p_id:p.id,p_motivo:motivo});
  if(error)setError(error.message);else{setNotice('Pago anulado; los servicios volvieron a Pendiente.');void load();}
 };

 const first=chosen[0];
 return <>
  <div className={styles.toolbar} style={{marginBottom:16}}>
   <label>Sede<select value={sede} onChange={e=>{setLoading(true);setPicked([]);setSede(e.target.value);}}><option value="">Todas</option>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
   <label>Proveedor<select value={proveedor} onChange={e=>{setLoading(true);setPicked([]);setProveedor(e.target.value);}}><option value="">Todos</option>{suppliers.map(([id,n])=><option key={id} value={id}>{n}</option>)}{proveedor&&!suppliers.some(([id])=>id===proveedor)&&<option value={proveedor}>Proveedor seleccionado</option>}</select></label>
  </div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {notice&&<p role="status" className={styles.notice}>{notice}</p>}
  <div className={styles.grid2}>
   <section className={styles.card}>
    <h2>Servicios por pagar</h2>
    <p>Solo se pagan servicios marcados como Realizados. Los demás aparecen para que sepas lo que viene.</p>
    <div className={styles.tableScroll}><table className={styles.table}>
     <thead><tr><th></th><th>Proveedor</th><th>Servicio</th><th>Contrato</th><th>Valor</th><th>Estado</th></tr></thead>
     <tbody>{pending.map(p=><tr key={p.id} className={payable(p)?styles.clickable:''} onClick={()=>toggle(p)}>
      <td><input type="checkbox" checked={picked.includes(p.id)} disabled={!payable(p)} readOnly/></td>
      <td><b>{p.proveedor}</b></td><td>{p.servicio}<small>{bogotaDateTime(p.fecha_servicio)}</small></td><td>{p.numero_contrato}<small>{p.cliente}</small></td>
      <td>{money(p.valor_empresa)}</td><td><span className={`${styles.badge} ${payable(p)?styles.badgeWarn:''}`}>{payable(p)?'Realizado · pendiente':p.estado}</span></td></tr>)}</tbody>
    </table></div>
    {!pending.length&&!loading&&<p className={styles.empty}>No hay servicios pendientes de pago.</p>}
   </section>
   <section className={styles.card}>
    <h2>Registrar pago</h2>
    {!first?<p>Marca uno o varios servicios del mismo proveedor.</p>:<div className={styles.form}>
     <p><b>{first.proveedor}</b> · {chosen.length} servicio(s)<br/><span className={styles.help}>{first.banco?`${first.banco} ${first.tipo_cuenta||''} ${first.numero_cuenta||''}`:'Sin datos bancarios en la ficha'}</span></p>
     <div className={styles.stats} style={{marginBottom:0}}><div><span>Total a pagar</span><strong>{money(total)}</strong></div></div>
     <div className={styles.row}><label>Fecha del pago<input type="date" max={today} value={form.fecha_pago} onChange={e=>setForm({...form,fecha_pago:e.target.value})}/></label>
      <label>Medio<select value={form.medio_pago} onChange={e=>setForm({...form,medio_pago:e.target.value})}>{SUPPLIER_PAYMENT_METHODS.map(m=><option key={m}>{m}</option>)}</select></label></div>
     <label>Referencia (número de transacción)<input value={form.referencia} onChange={e=>setForm({...form,referencia:e.target.value})}/></label>
     <label>Comprobante (PDF o imagen)<input key={fileKey} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
     <div className={styles.actions}><button className={styles.button} onClick={()=>setPicked([])} disabled={busy}>Limpiar</button><button className={`${styles.button} ${styles.primary}`} onClick={pay} disabled={busy}>{busy?'Guardando…':'Guardar pago'}</button></div>
    </div>}
   </section>
  </div>
  <section className={styles.card}>
   <h2>Pagos registrados</h2>
   <div className={styles.tableScroll}><table className={styles.table}>
    <thead><tr><th>Fecha</th><th>Proveedor</th><th>Valor</th><th>Servicios</th><th>Medio</th><th>Referencia</th><th>Registró</th><th></th></tr></thead>
    <tbody>{payments.map(p=><tr key={p.id} className={p.anulado_at?styles.annulled:''}>
     <td>{p.fecha_pago}</td><td>{p.proveedor}</td><td>{money(p.valor_total)}</td><td>{p.servicios}</td><td>{p.medio_pago}</td><td>{p.referencia||'—'}{p.anulado_at&&<small>Anulado: {p.motivo_anulacion}</small>}</td><td>{p.registrado_por||'—'}</td>
     <td><div className={styles.actions}>{p.comprobante_path&&<button onClick={()=>void openSupplierFile('comprobantes_proveedores',p.comprobante_path!).catch(e=>setError(errorText(e,'')))}>Comprobante</button>}
      {!p.anulado_at&&<button className={styles.danger} onClick={()=>void annul(p)}>Anular</button>}</div></td></tr>)}</tbody>
   </table></div>
   {!payments.length&&<p className={styles.empty}>Aún no hay pagos.</p>}
  </section>
 </>;
}
