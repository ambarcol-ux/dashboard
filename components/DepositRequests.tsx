'use client';
import {useState,useRef,useEffect} from 'react';
import writeXlsxFile from 'write-excel-file';
import {supabase} from '@/lib/supabase';
import {money,type DepositContract} from '@/lib/deposits';
import {bogotaDay} from '@/lib/contract-calendar';
import {canPay,isPending,requestLabels,type DepositRequest,type RequestEvent} from '@/lib/deposit-requests';
import styles from '@/app/dashboard/devoluciones-depositos/deposits.module.css';
export default function DepositRequests({requests,events,contracts,profile,onChange,openReceipt}:{requests:DepositRequest[];events:RequestEvent[];contracts:DepositContract[];profile:{id:string;rol:string};onChange:()=>Promise<unknown>;openReceipt:(path:string|null,url:string|null)=>Promise<void>}){
 const [filter,setFilter]=useState('pendientes'),[query,setQuery]=useState(''),[site,setSite]=useState(''),[selected,setSelected]=useState<string|null>(null),[error,setError]=useState(''),[saving,setSaving]=useState(false),[file,setFile]=useState<File|null>(null),[date,setDate]=useState(bogotaDay(new Date().toISOString())!),[reason,setReason]=useState(''),[editing,setEditing]=useState(false),[bank,setBank]=useState(''),[accountType,setAccountType]=useState(''),[account,setAccount]=useState(''),[holder,setHolder]=useState(''),[notes,setNotes]=useState('');
 const busy=useRef(false),uploaded=useRef<{id:string;path:string}|null>(null);
 const visibleRequests=requests;
 const rows=visibleRequests.filter(r=>{const c=contracts.find(c=>c.id===r.contrato_id);return (filter==='todos'||(filter==='pendientes'?isPending(r):r.estado===filter))&&(!site||c?.sede===site)&&`${c?.numero_contrato} ${c?.cliente_nombre}`.toLowerCase().includes(query.toLowerCase());}).sort((a,b)=>a.created_at.localeCompare(b.created_at));
 const current=visibleRequests.find(r=>r.id===selected);
 useEffect(()=>{const close=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!saving)setSelected(null);};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[saving]);
 async function exportPending(){const headers=['Contrato','Factura','Cliente','Cédula/documento','Sede','Monto del depósito','Método','Fecha de recepción','Fecha de solicitud','Estado','Banco','Tipo de cuenta','Número de cuenta','Titular','Observaciones'];const data=rows.filter(isPending).map(r=>{const c=contracts.find(c=>c.id===r.contrato_id);return [c?.numero_contrato,c?.numero_factura||'',c?.cliente_nombre,c?.cliente_documento||'',c?.sede,Number(r.monto),r.metodo,r.recibido_at,r.created_at,requestLabels[r.estado],r.banco||'',r.tipo_cuenta||'',r.cuenta||'',r.titular||'',r.observaciones||''].map(value=>({value:value??''}));});await writeXlsxFile([[...headers.map(value=>({value,fontWeight:'bold' as const}))],...data],{fileName:`depositos-pendientes-${bogotaDay(new Date().toISOString())}.xlsx`});}
 async function saveReturnData(r:DepositRequest){
  if(busy.current)return;busy.current=true;setSaving(true);setError('');
  try{
   const {error}=await supabase.rpc('editar_datos_devolucion',{p_datos:{id:r.id,banco:bank,tipo_cuenta:accountType,cuenta:account,titular:holder,observaciones:notes}});
   if(error)throw Error(error.message);
   await onChange();window.dispatchEvent(new Event('depositos-actualizados'));setEditing(false);
  }catch(e){setError(e instanceof Error?e.message:'No se pudieron guardar los datos de devolución.');}finally{busy.current=false;setSaving(false);}
 }
 async function retake(r:DepositRequest){
  const reason=window.prompt('Motivo para retomar esta solicitud de devolución:');
  if(reason===null)return;
  if(!reason.trim()){setError('Indica el motivo del cambio de responsable.');return;}
  if(!window.confirm('Confirma con la responsable anterior que la transferencia no se haya realizado. ¿Retomar el pago a tu nombre?'))return;
  if(busy.current)return;busy.current=true;setSaving(true);setError('');
  try{
   const {error}=await supabase.rpc('retomar_devolucion',{p_solicitud:r.id,p_responsable_esperado:r.responsable_id,p_motivo:reason.trim()});
   if(error)throw Error(error.message);
   uploaded.current=null;setFile(null);await onChange();window.dispatchEvent(new Event('depositos-actualizados'));
  }catch(e){setError(e instanceof Error?e.message:'No se pudo retomar la solicitud.');}finally{busy.current=false;setSaving(false);}
 }
 async function act(action:string,r:DepositRequest){
  if(busy.current)return;busy.current=true;setSaving(true);setError('');
  try{
   let path=uploaded.current?.id===r.id?uploaded.current.path:null;
   if(action==='pagar'){
    if(!path){if(!file)throw Error('Adjunta el comprobante de salida.');if(file.size>10485760||!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Usa un PDF o imagen de hasta 10 MB.');path=`${r.contrato_id}/${r.id}/salida-${crypto.randomUUID()}`;const {error}=await supabase.storage.from('comprobantes_depositos').upload(path,file);if(error)throw Error('No se pudo subir el comprobante.');uploaded.current={id:r.id,path};}
   }
   const {error}=await supabase.rpc('gestionar_deposito',{p_accion:action,p_datos:{id:r.id,fecha:date,comprobante_path:path,motivo:reason}});if(error)throw Error(error.message);
   await onChange();window.dispatchEvent(new Event('depositos-actualizados'));
  }catch(e){setError(e instanceof Error?e.message:'No se pudo actualizar la solicitud.');}finally{busy.current=false;setSaving(false);}
 }
 return <section id="pendientes" className={styles.card}>
  <div className={styles.historyHeader}><div><h2>Solicitudes e historial de devoluciones</h2><p>Contabilidad · {requests.filter(isPending).length} solicitudes pendientes · {money(requests.filter(isPending).reduce((n,r)=>n+Number(r.monto),0))} por pagar</p></div><button onClick={exportPending}>EXPORTAR PENDIENTES A EXCEL</button></div>
  <div className={styles.filters}><input aria-label="Buscar solicitud" placeholder="Cliente o contrato" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="Sede de la solicitud" value={site} onChange={e=>setSite(e.target.value)}><option value="">Todas las sedes</option>{[...new Set(contracts.map(c=>c.sede))].map(s=><option key={s}>{s}</option>)}</select><select aria-label="Estado de la solicitud" value={filter} onChange={e=>setFilter(e.target.value)}><option value="pendientes">Pendientes de pago</option><option value="todos">Todo el historial</option>{Object.entries(requestLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div>
  <div className={styles.tableScroll}><table><thead><tr><th>Sede / contrato</th><th>Cliente / documento</th><th>Factura</th><th>Valor</th><th>Solicitud</th><th>Estado / responsable</th><th>Gestión</th></tr></thead><tbody>{rows.map(r=>{const c=contracts.find(c=>c.id===r.contrato_id);const missing=r.metodo==='Transferencia'&&(!r.banco||!r.tipo_cuenta||!r.cuenta||!r.titular);return <tr key={r.id}><td>{c?.sede}<strong>{c?.numero_contrato}</strong></td><td>{c?.cliente_nombre}<small>{c?.cliente_documento||'Sin documento'}</small></td><td>{c?.numero_factura||'Sin factura'}</td><td>{money(r.monto)}<small>Descuento: {money(r.descuento)}</small></td><td>{new Date(r.created_at).toLocaleString('es-CO',{timeZone:'America/Bogota'})}<small>{r.solicitante_nombre}</small>{missing&&<strong className={styles.bankWarning}>⚠️ FALTA INFORMACIÓN DE CUENTA PARA REALIZAR LA DEVOLUCIÓN</strong>}</td><td>{requestLabels[r.estado]}<small>{r.responsable_nombre||'Contabilidad'}</small></td><td><button onClick={()=>{setSelected(r.id);setFile(null);setReason('');setError('');setEditing(false);setBank(r.banco||'');setAccountType(r.tipo_cuenta||'');setAccount(r.cuenta||'');setHolder(r.titular||'');setNotes(r.observaciones||'');}}>Ver solicitud</button></td></tr>;})}</tbody></table></div>
  {!rows.length&&<p className={styles.empty}>No hay solicitudes para estos filtros.</p>}
  {current&&<div className={styles.modalOverlay} onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setSelected(null);}}><div className={styles.requestDetail} role="dialog" aria-modal="true" aria-label="Ver solicitud"><button className={styles.modalClose} aria-label="Cerrar" onClick={()=>setSelected(null)}>X</button><h3>{contracts.find(c=>c.id===current.contrato_id)?.numero_contrato} · {requestLabels[current.estado]}</h3><p>{current.metodo} · {money(current.monto)} · Responsable: {current.responsable_nombre||'Contabilidad'}</p>{current.metodo==='Transferencia'&&<p>Banco: {current.banco||'Falta información'} · {current.tipo_cuenta||'Falta información'} · Cuenta: {current.cuenta||'Falta información'} · Titular: {current.titular||'Falta información'}</p>}<p>{current.motivo} {current.observaciones}</p>
   {canPay(profile.rol)&&(profile.rol.toLowerCase()==='admin'||!['pagado','devuelto','cancelado'].includes(current.estado))&&!editing&&<button onClick={()=>setEditing(true)}>Editar datos de devolución</button>}
   {editing&&<form onSubmit={e=>{e.preventDefault();void saveReturnData(current);}}>
    {current.metodo==='Transferencia'&&<><label>Banco<input required value={bank} onChange={e=>setBank(e.target.value)}/></label><label>Tipo de cuenta<input required value={accountType} onChange={e=>setAccountType(e.target.value)}/></label><label>Número de cuenta<input required value={account} onChange={e=>setAccount(e.target.value)}/></label><label>Titular de la cuenta<input required value={holder} onChange={e=>setHolder(e.target.value)}/></label></>}
    <label>Observaciones<input value={notes} onChange={e=>setNotes(e.target.value)}/></label>
    <button className={styles.primary} disabled={saving}>Guardar cambios</button><button type="button" disabled={saving} onClick={()=>setEditing(false)}>Cancelar edición</button>
   </form>}
   <ol>{events.filter(e=>e.solicitud_id===current.id).sort((a,b)=>a.created_at.localeCompare(b.created_at)).map(e=><li key={e.id}><strong>{requestLabels[e.estado]||e.estado}</strong> · {new Date(e.created_at).toLocaleString('es-CO',{timeZone:'America/Bogota'})} · {e.usuario_nombre}<small>{e.detalle}</small></li>)}</ol>
   {current.comprobante_path&&<button onClick={()=>void openReceipt(current.comprobante_path,null)}>Ver comprobante de salida</button>}
   {current.estado==='pendiente'&&canPay(profile.rol)&&<button disabled={saving} onClick={()=>void act('proceso',current)}>Tomar solicitud e iniciar pago</button>}
   {current.estado==='en_proceso'&&current.responsable_id!==profile.id&&canPay(profile.rol)&&<button disabled={saving} onClick={()=>void retake(current)}>Retomar pago a mi nombre</button>}
   {current.estado==='en_proceso'&&current.responsable_id===profile.id&&canPay(profile.rol)&&<form onSubmit={e=>{e.preventDefault();void act('pagar',current);}}><label>Fecha del pago<input type="date" required min={bogotaDay(current.created_at)!} max={bogotaDay(new Date().toISOString())!} value={date} onChange={e=>setDate(e.target.value)}/></label><label>Comprobante de salida obligatorio<input type="file" required={!uploaded.current||uploaded.current.id!==current.id} accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>{uploaded.current=null;setFile(e.target.files?.[0]||null);}}/></label><p>Registra aquí la transferencia ya realizada. Al guardar el comprobante, el depósito quedará devuelto.</p><button className={styles.primary} disabled={saving}>Registrar pago y comprobante</button></form>}
   {current.estado==='pendiente'&&(current.solicitante_id===profile.id||canPay(profile.rol))&&<form onSubmit={e=>{e.preventDefault();void act('cancelar',current);}}><label>Motivo de cancelación<input required value={reason} onChange={e=>setReason(e.target.value)}/></label><button disabled={saving}>Cancelar solicitud</button></form>}
   {error&&<p role="alert" className={styles.error}>{error}</p>}
   <button disabled={saving} onClick={()=>setSelected(null)}>Cerrar</button></div></div>}
 </section>;
}
