'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {RefreshCw,Lock,Unlock,Paperclip} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {can,usePermissions} from '@/lib/use-permissions';
import {bogotaDay} from '@/lib/contract-calendar';
import {money} from '@/lib/deposits';
import {AccountSelect,AccountsAdmin,CashStartAdmin,DepositsView,EditMovement,WhereIsMoneyView} from '@/components/CashAccounts';
import {CASH_BASE,CASH_CATEGORIES,CASH_METHODS,accountsFor,cashDifference,cashReceiptPath,editSummary,expectedCash,needsAccount,parseCashAmount,siteTotals,type CashDay,type CashMissingSupport,type CashMovement,type CashSiteSummary,type CashSuggestion,type CashSupport} from '@/lib/cash';
import {SUPPORT_ACCEPT,SUPPORT_BUCKET,supportFileError,supportPath,supportType} from '@/lib/payment-support';
import styles from '@/app/dashboard/caja/caja.module.css';

type Profile={id:string;rol:string;sede_id:string|null};
const ALL='todas';
const time=(iso:string)=>new Date(iso).toLocaleTimeString('es-CO',{timeZone:'America/Bogota',hour:'2-digit',minute:'2-digit'});
const errorText=(e:unknown,fallback:string)=>e&&typeof e==='object'&&'message' in e&&typeof (e as {message:unknown}).message==='string'?(e as {message:string}).message:fallback;

const openSupport=async(path:string,onError:(m:string)=>void)=>{const {data,error}=await supabase.storage.from(SUPPORT_BUCKET).createSignedUrl(path,300);if(error||!data)onError('No se pudo abrir el soporte.');else window.open(data.signedUrl,'_blank','noopener,noreferrer');};

/** Payment support cell: links to each file, "Histórico" for payments from before supports were required, or a warning. */
function SupportCell({soportes,historico,onError}:{soportes?:CashSupport[]|null;historico?:boolean|null;onError:(m:string)=>void}){
 if(soportes?.length)return <>{soportes.map(s=><button key={s.id} className={styles.button} title={`${s.nombre}${s.subido_por?` · subido por ${s.subido_por}`:''}`} onClick={()=>void openSupport(s.path,onError)}><Paperclip size={12} style={{display:'inline'}}/> Ver soporte</button>)}</>;
 if(historico)return <span className={styles.help}>Histórico</span>;
 return <span className={`${styles.badge} ${styles.badgeWarn}`}>Sin soporte</span>;
}

/** Uploads a support for a payment that has none (only possible while the day is open). */
function AttachSupport({sedeId,pagoId,onDone,onError}:{sedeId:string;pagoId:string;onDone:(m:string)=>void;onError:(m:string)=>void}){
 const input=useRef<HTMLInputElement>(null),[busy,setBusy]=useState(false);
 const upload=async(file:File|undefined)=>{
  if(!file)return;
  const bad=supportFileError(file);if(bad){onError(bad);return;}
  setBusy(true);
  try{
   const path=supportPath(sedeId,file);
   const {error:ue}=await supabase.storage.from(SUPPORT_BUCKET).upload(path,file,{contentType:supportType(file),upsert:false});
   if(ue)throw Error('No se pudo subir el soporte.');
   const {error}=await supabase.rpc('agregar_soporte_pago',{p_pago:pagoId,p_soportes:[{path,nombre:file.name,tipo:supportType(file),tamano:file.size}],p_motivo:'Adjuntado desde el cierre de caja'});
   if(error)throw Error(error.message);
   onDone('Soporte adjuntado.');
  }catch(e){onError(errorText(e,'No se pudo adjuntar el soporte.'));}finally{setBusy(false);}
 };
 return <><button className={styles.button} disabled={busy} onClick={()=>input.current?.click()}>{busy?'Subiendo…':'+ Adjuntar'}</button>
  <input ref={input} type="file" accept={SUPPORT_ACCEPT} hidden onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/></>;
}

type PendingPayment={sede_id:string;sede:string;fecha:string;numero_contrato:string|null;cliente:string|null;valor:number;medio:string|null;cerrado:boolean};

/** Contract payments not yet in the cash register: one warning with the list and a button to open each day. */
function PendingPayments({rows,onOpen,abierto=false}:{rows:PendingPayment[];onOpen:(p:PendingPayment)=>void;abierto?:boolean}){
 if(!rows.length)return null;
 const total=rows.reduce((a,p)=>a+(Number(p.valor)||0),0);
 return <details open={abierto||undefined} className={styles.card} style={{borderColor:'#f59e0b',background:'#fffbeb',marginBottom:18}}>
  <summary style={{cursor:'pointer',fontWeight:800}}>⚠️ {rows.length} abonos de contratos sin pasar a caja · {money(total)} · Pulsa para ver y confirmar cada uno en su día</summary>
  <p style={{fontSize:12,margin:'8px 0'}}>Confírmalos desde la sugerencia del día; no los escribas a mano para no contarlos dos veces. Si el día ya está cerrado, reábrelo primero.</p>
  <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Día</th><th>Sede</th><th>Contrato</th><th>Valor</th><th>Medio</th><th></th></tr></thead>
   <tbody>{rows.map((p,i)=><tr key={i}><td>{p.fecha}</td><td>{p.sede}</td><td><strong>{p.numero_contrato}</strong><br/><small>{p.cliente}</small></td><td>{money(p.valor)}</td><td>{p.medio||'—'}</td>
    <td><button className={styles.button} onClick={()=>onOpen(p)}>{p.cerrado?'Ir al día (cerrado: reabrir)':'Ir al día'}</button></td></tr>)}</tbody></table></div>
 </details>;
}

/** Cash closings: daily income and expenses per site, the closing count, and a view of every site. */
export default function CashRegister({profile}:{profile:Profile}){
 const today=bogotaDay(new Date().toISOString())!;
 const role=profile.rol.toLowerCase(),seesAll=role==='admin'||role==='contabilidad',isAdmin=role==='admin';
 // Contabilidad has the same financial powers as administration; leaders and franchisees get them for their own site through Roles.
 const finanzas=seesAll,perms=usePermissions(profile.id),puedeCorregir=finanzas||can(perms,'caja.editar'),puedeReabrir=finanzas||can(perms,'caja.reabrir'),puedeCuentas=finanzas||can(perms,'caja.cuentas');
 const ver=typeof window==='undefined'?'':new URLSearchParams(window.location.search).get('ver')||'';
 const [sites,setSites]=useState<CashSiteSummary[]>([]),[sede,setSede]=useState(seesAll&&ver?ALL:seesAll?ALL:(profile.sede_id||'')),[fecha,setFecha]=useState(today),[desde,setDesde]=useState(()=>ver==='sedes'?new Date(Date.parse(today+'T12:00:00Z')-30*86400000).toISOString().slice(0,10):today);
 const [day,setDay]=useState<CashDay|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [pending,setPending]=useState<PendingPayment[]>([]);
 const request=useRef(0),[view,setView]=useState<'caja'|'plata'|'depositos'|'cuentas'>('caja');

 const load=useCallback(async()=>{
  const id=++request.current;
  try{
   const summary=await supabase.rpc('caja_resumen',{p_desde:sede===ALL?desde:fecha,p_hasta:fecha});
   if(summary.error)throw summary.error;
   const rows=(summary.data||[]) as CashSiteSummary[];
   if(id!==request.current)return;
   setSites(rows);
   void supabase.rpc('caja_abonos_pendientes').then(({data})=>{if(id===request.current)setPending((data||[]) as PendingPayment[]);});
   const target=sede===ALL?null:(sede||rows[0]?.sede_id||'');
   if(sede!==ALL&&!sede&&target){setSede(target);return;}
   if(target){
    const {data,error}=await supabase.rpc('caja_dia',{p_sede:target,p_fecha:fecha});
    if(error)throw error;
    if(id===request.current)setDay(data as CashDay);
   }else setDay(null);
   if(id===request.current)setError('');
  }catch(e){if(id===request.current){setError(errorText(e,'No se pudo cargar la caja.'));setDay(null);}}
  finally{if(id===request.current)setLoading(false);}
 },[sede,fecha,desde]);
 useEffect(()=>{void load();},[load]);
 const refresh=()=>{setLoading(true);void load();};
 const done=(message:string)=>{setNotice(message);refresh();};

 const siteName=sites.find(s=>s.sede_id===sede)?.sede||'';
 const tabs=<div className={styles.tabs} role="tablist">{([['caja','Caja del día'],['plata','¿Dónde está la plata?'],['depositos','Depósitos (aparte)'],...(seesAll||puedeCuentas?[['cuentas','Cuentas y caja menor']]:[])] as [typeof view,string][]).map(([k,label])=>
  <button key={k} role="tab" aria-selected={view===k} className={`${styles.tab} ${view===k?styles.tabActive:''}`} onClick={()=>setView(k)}>{label}</button>)}</div>;
 if(view==='plata')return <>{tabs}<WhereIsMoneyView today={today}/></>;
 if(view==='depositos')return <>{tabs}<DepositsView today={today}/></>;
 if(view==='cuentas')return <>{tabs}{seesAll&&<CashStartAdmin isAdmin={finanzas} today={today}/>}<AccountsAdmin sites={sites} isAdmin={finanzas} canManage={puedeCuentas}/></>;
 return <>
  {tabs}
  <div className={styles.toolbar} style={{marginBottom:18}}>
   <label>Sede<select value={sede} onChange={e=>{setLoading(true);setNotice('');setSede(e.target.value);}}>{seesAll&&<option value={ALL}>Todas las sedes</option>}{sites.map(s=><option key={s.sede_id} value={s.sede_id}>{s.sede}</option>)}</select></label>
   {sede===ALL&&<label>Desde<input type="date" max={fecha} value={desde} onChange={e=>{if(e.target.value){setLoading(true);setDesde(e.target.value);}}}/></label>}
   <label>{sede===ALL?'Hasta':'Fecha'}<input type="date" max={today} value={fecha} onChange={e=>{if(e.target.value){setLoading(true);setNotice('');setFecha(e.target.value);if(e.target.value<desde)setDesde(e.target.value);}}}/></label>
   <button className={styles.button} onClick={refresh} disabled={loading}><RefreshCw size={14} style={{display:'inline',verticalAlign:'-2px'}}/> {loading?'Actualizando…':'Actualizar'}</button>
  </div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {notice&&<p role="status" className={styles.notice}>{notice}</p>}
  <PendingPayments abierto={ver==='abonos'} rows={sede===ALL?pending:pending.filter(p=>p.sede_id===sede)} onOpen={p=>{setLoading(true);setNotice('');setSede(p.sede_id);setFecha(p.fecha);if(p.fecha<desde)setDesde(p.fecha);}}/>
  {sede===ALL?<AllSites rows={sites} loading={loading} onPick={id=>{setLoading(true);setSede(id);}}/>:day?<SiteDay key={`${day.sede_id}:${day.fecha}`} day={day} siteName={siteName} isAdmin={isAdmin} finanzas={finanzas} canFix={puedeCorregir} canReopen={puedeReabrir} onDone={done} onError={setError}/>:!error&&<p className={styles.empty}>{loading?'Cargando caja…':'No tienes una sede asignada para manejar caja.'}</p>}
 </>;
}

function AllSites({rows,loading,onPick}:{rows:CashSiteSummary[];loading:boolean;onPick:(id:string)=>void}){
 const t=siteTotals(rows);
 return <>
  <div className={styles.stats}>
   <div><span>Ingresos (todos los medios)</span><strong className={styles.in}>{money(t.ingresos)}</strong></div>
   <div><span>Egresos (todos los medios)</span><strong className={styles.out}>{money(t.egresos)}</strong></div>
   <div><span>Neto del periodo</span><strong>{money(t.ingresos-t.egresos)}</strong></div>
   <div><span>Diferencias en cierres</span><strong className={t.diferencia<0?styles.out:t.diferencia>0?styles.in:''}>{money(t.diferencia)}</strong></div>
   <div><span>Días sin cerrar</span><strong className={t.pendientes?styles.out:''}>{t.pendientes}</strong></div>
  </div>
  <section className={styles.card}><h2>Todas las sedes</h2><p>Pulsa una sede para ver sus movimientos y su cierre.</p>
   <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Sede</th><th>Ingresos</th><th>Egresos</th><th>Neto</th><th>Efectivo entró / salió</th><th>Efectivo en caja (último cierre)</th><th>Días cerrados</th><th>Sin cerrar</th><th>Diferencias</th></tr></thead>
    <tbody>{rows.map(r=><tr key={r.sede_id} className={styles.clickable} onClick={()=>onPick(r.sede_id)}>
     <td><strong>{r.sede}</strong></td><td className={styles.in}>{money(r.ingresos)}</td><td className={styles.out}>{money(r.egresos)}</td><td>{money(r.ingresos-r.egresos)}</td>
     <td>{money(r.ingresos_efectivo)} / {money(r.egresos_efectivo)}</td><td>{money(r.saldo_actual)}</td><td>{r.dias_cerrados}</td>
     <td>{r.dias_con_movimientos_sin_cierre?<span className={`${styles.badge} ${styles.badgeWarn}`}>{r.dias_con_movimientos_sin_cierre}</span>:'0'}</td>
     <td className={Number(r.diferencia)<0?styles.out:''}>{money(r.diferencia)}</td></tr>)}</tbody></table></div>
   {!rows.length&&<p className={styles.empty}>{loading?'Cargando…':'No hay sedes disponibles para tu usuario.'}</p>}
  </section>
 </>;
}

function SiteDay({day,siteName,isAdmin,finanzas,canFix,canReopen,onDone,onError}:{day:CashDay;siteName:string;isAdmin:boolean;finanzas:boolean;canFix:boolean;canReopen:boolean;onDone:(m:string)=>void;onError:(m:string)=>void}){
 const open=!day.cierre,canWork=open&&day.puede_operar;
 const ie=Number(day.totales.ingresos_efectivo||0),ee=Number(day.totales.egresos_efectivo||0),esperado=expectedCash(day.saldo_inicial,ie,ee);
 const active=day.movimientos.filter(m=>!m.anulado_at);
 const missing=day.pagos_sin_soporte||[];
 const [editing,setEditing]=useState<CashMovement|null>(null),canEdit=open&&canFix;
 const porCuenta=day.totales.por_cuenta||[];
 const openReceipt=async(path:string)=>{const {data,error}=await supabase.storage.from('comprobantes_caja').createSignedUrl(path,300);if(error||!data)onError('No se pudo abrir el comprobante.');else window.open(data.signedUrl,'_blank','noopener,noreferrer');};
 const annul=async(m:CashMovement)=>{const motivo=window.prompt(`Motivo para anular "${m.categoria} ${money(m.valor)}" (mínimo 5 caracteres)`);if(motivo===null)return;const {error}=await supabase.rpc('anular_movimiento_caja',{p_id:m.id,p_motivo:motivo});if(error)onError(error.message);else onDone('Movimiento anulado. Queda visible tachado con su motivo.');};
 return <>
  {day.inicio&&day.fecha<day.inicio&&<div className={`${styles.banner} ${styles.closed}`}>La caja de {siteName} empieza el {day.inicio}: este día es anterior y no cuenta.</div>}
  <div className={`${styles.banner} ${open?styles.open:styles.closed}`}>
   {open?<><Unlock size={16}/> <strong>Caja abierta</strong> · {siteName} · {day.fecha}{!day.puede_operar&&' · Solo consulta'}</>
    :<><Lock size={16}/> <strong>Caja cerrada</strong> · {siteName} · {day.fecha} · por {day.cierre!.cerrado_por_nombre} a las {time(day.cierre!.cerrado_at)} · Contado {money(day.cierre!.contado)} · Diferencia <span className={styles.diff}>{money(day.cierre!.diferencia)}</span>{day.cierre!.observaciones&&` · ${day.cierre!.observaciones}`}</>}
  </div>
  <div className={styles.stats}>
   <div><span>Saldo inicial en efectivo</span><strong>{money(day.saldo_inicial)}</strong></div>
   <div><span>Ingresos en efectivo</span><strong className={styles.in}>{money(ie)}</strong></div>
   <div><span>Egresos en efectivo</span><strong className={styles.out}>{money(ee)}</strong></div>
   <div><span>Efectivo esperado en caja</span><strong>{money(open?esperado:day.cierre!.esperado)}</strong></div>
   <div><span>Ingresos (todos los medios)</span><strong className={styles.in}>{money(day.totales.ingresos)}</strong></div>
   <div><span>Egresos (todos los medios)</span><strong className={styles.out}>{money(day.totales.egresos)}</strong></div>
   {Number(day.totales.base||0)>0&&<div><span>Base agregada hoy</span><strong>{money(Number(day.totales.base))}</strong><span>Cuenta en el efectivo esperado, no como venta</span></div>}
   {day.soportes&&day.soportes.pagos>0&&<div><span>Soportes de pagos</span><strong className={missing.length?styles.out:styles.in}>{day.soportes.con_soporte} de {day.soportes.pagos}</strong>{missing.length>0&&<span>{missing.length} pendiente{missing.length===1?'':'s'}</span>}</div>}
  </div>
  {porCuenta.length>0&&<section className={styles.card}><h2>¿Dónde quedó el dinero de este día?</h2>
   <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Cuenta</th><th>Entró</th><th>Salió</th><th>Neto</th></tr></thead>
    <tbody>{porCuenta.map(c=><tr key={c.cuenta_id||'sin'}><td><strong>{c.tipo==='efectivo'?'💵':c.tipo?'🏦':'❔'} {c.cuenta}</strong>{!c.cuenta_id&&<small>{canFix?'Usa “Editar” para indicar a qué cuenta llegó.':'Pide a un administrador que indique la cuenta.'}</small>}</td>
     <td className={styles.in}>{money(c.ingresos)}</td><td className={styles.out}>{money(c.egresos)}</td><td><strong>{money(Number(c.ingresos)-Number(c.egresos))}</strong></td></tr>)}</tbody></table></div>
  </section>}
  {missing.length>0&&<MissingSupports day={day} missing={missing} canAttach={open&&(day.puede_operar||isAdmin)} onDone={onDone} onError={onError}/>}
  <section className={styles.card}><h2>Movimientos del día</h2><p>{active.length} movimiento{active.length===1?'':'s'} · Por medio: {Object.entries(day.totales.por_medio||{}).map(([m,v])=>`${m} +${money(Number(v.ingresos||0))} / −${money(Number(v.egresos||0))}`).join(' · ')||'sin movimientos'}</p>
   <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Hora</th><th>Tipo</th><th>Categoría / detalle</th><th>Medio</th><th>Cuenta</th><th>Valor</th><th>Registró</th><th>Comprobante / soporte</th>{(canWork||canEdit)&&<th></th>}</tr></thead>
    <tbody>{day.movimientos.map(m=><tr key={m.id} className={m.anulado_at?styles.annulled:''}>
     <td>{time(m.created_at)}</td>
     <td><span className={`${styles.badge} ${m.tipo==='ingreso'?styles.badgeIn:styles.badgeOut}`}>{m.tipo==='ingreso'?'Ingreso':'Egreso'}</span></td>
     <td><strong>{m.categoria}</strong>{m.numero_contrato&&<small>{m.numero_contrato} · {m.cliente}</small>}{m.descripcion&&<small>{m.descripcion}</small>}{m.anulado_at&&<small>Anulado por {m.anulado_por}: {m.motivo_anulacion}</small>}{(m.ediciones||[]).map((e,i)=><small key={i} title={editSummary(e,money).join('\n')}>✎ Editado por {e.usuario} el {new Date(e.created_at).toLocaleString('es-CO',{timeZone:'America/Bogota',dateStyle:'short',timeStyle:'short'})}: {editSummary(e,money).join(' · ')} — {e.motivo}</small>)}</td>
     <td>{m.medio}</td><td>{m.cuenta||<span className={`${styles.badge} ${styles.badgeWarn}`}>Sin cuenta</span>}</td><td className={m.tipo==='ingreso'?styles.in:styles.out}>{m.tipo==='ingreso'?'+':'−'}{money(m.valor)}</td><td>{m.usuario}</td>
     <td>{m.origen==='pago'?<SupportCell soportes={m.soportes} historico={m.soporte_historico} onError={onError}/>:m.comprobante_path?<button className={styles.button} onClick={()=>void openReceipt(m.comprobante_path!)}><Paperclip size={12} style={{display:'inline'}}/> Ver</button>:'—'}</td>
     {(canWork||canEdit)&&<td>{!m.anulado_at&&<div style={{display:'flex',gap:6}}>{canEdit&&<button className={styles.button} onClick={()=>setEditing(m)}>Editar</button>}{canWork&&<button className={`${styles.button} ${styles.danger}`} onClick={()=>void annul(m)}>Anular</button>}</div>}</td>}
    </tr>)}</tbody></table></div>
   {!day.movimientos.length&&<p className={styles.empty}>No hay movimientos registrados este día.</p>}
  </section>
  {canWork&&day.sugerencias.length>0&&<Suggestions day={day} onDone={onDone} onError={onError}/>}
  {canWork&&<div className={styles.grid2}><NewMovement day={day} onDone={onDone}/><CloseForm day={day} esperado={esperado} pendingSupports={missing.length} onDone={onDone}/></div>}
  {!open&&canReopen&&<Reopen day={day} onDone={onDone}/>}
  {!open&&canReopen&&<p className={styles.help}>Para editar un movimiento de un día cerrado, primero reabre la caja de ese día.</p>}
  {editing&&<EditMovement soloCuenta={!finanzas} day={day} movement={editing} onClose={()=>setEditing(null)} onDone={m=>{setEditing(null);onDone(m);}}/>}
 </>;
}

function MissingSupports({day,missing,canAttach,onDone,onError}:{day:CashDay;missing:CashMissingSupport[];canAttach:boolean;onDone:(m:string)=>void;onError:(m:string)=>void}){
 return <section className={styles.card}>
  <div className={`${styles.banner} ${styles.open}`} style={{marginBottom:12}}><strong>{missing.length} ingreso{missing.length===1?'':'s'} sin soporte.</strong> Adjunta el soporte para poder confirmar el cierre.</div>
  <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Recibo</th><th>Contrato</th><th>Medio</th><th>Valor</th><th>Soporte</th></tr></thead>
   <tbody>{missing.map(p=><tr key={p.pago_id}><td>{p.recibo||'—'}</td><td>{p.numero_contrato}<small>{p.cliente}</small></td><td>{p.medio}</td><td className={styles.in}>{money(p.valor)}</td>
    <td>{canAttach?<AttachSupport sedeId={day.sede_id} pagoId={p.pago_id} onDone={onDone} onError={onError}/>:<span className={`${styles.badge} ${styles.badgeWarn}`}>Sin soporte</span>}</td></tr>)}</tbody></table></div>
 </section>;
}

function Suggestions({day,onDone,onError}:{day:CashDay;onDone:(m:string)=>void;onError:(m:string)=>void}){
 const [methods,setMethods]=useState<Record<string,string>>({}),[accounts,setAccounts]=useState<Record<string,string>>({}),[busy,setBusy]=useState('');
 const add=async(s:CashSuggestion)=>{
  const medio=s.medio||methods[s.origen_id];if(!medio){onError('Elige el medio de pago de ese movimiento.');return;}
  const cuenta=medio==='Efectivo'?null:(accounts[s.origen_id]||null);
  if(!cuenta&&needsAccount(medio,accountsFor(medio,day.cuentas,day.sede_id))){onError(`Elige a qué cuenta llegó el dinero de ${s.numero_contrato}.`);return;}
  setBusy(s.origen_id);
  const {error}=await supabase.rpc('registrar_movimiento_caja',{p_datos:{sede_id:day.sede_id,fecha:day.fecha,tipo:s.tipo,categoria:s.categoria,medio,valor:s.valor,origen:s.origen,origen_id:s.origen_id,contrato_id:s.contrato_id,cuenta_id:cuenta,descripcion:`${s.numero_contrato} · ${s.cliente}`}});
  setBusy('');if(error)onError(error.message);else onDone('Movimiento del ERP agregado a la caja.');
 };
 return <section className={styles.card}><h2>Registrados hoy en el ERP</h2><p>Pagos de contratos de esta sede que aún no están en la caja. Agrégalos sin volver a digitarlos; cada uno entra una sola vez. Los depósitos en garantía no entran a la caja: se llevan aparte en la pestaña Depósitos.</p>
  <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Hora</th><th>Movimiento</th><th>Contrato</th><th>Valor</th><th>Medio</th><th>Cuenta</th><th>Soporte</th><th></th></tr></thead>
   <tbody>{day.sugerencias.map(s=><tr key={s.origen+s.origen_id}><td>{s.origen==='pago'?'—':time(s.hora)}</td><td><span className={`${styles.badge} ${s.tipo==='ingreso'?styles.badgeIn:styles.badgeOut}`}>{s.categoria}</span></td><td>{s.numero_contrato}<small>{s.cliente}</small></td>
    <td className={s.tipo==='ingreso'?styles.in:styles.out}>{money(s.valor)}</td>
    <td>{s.medio||<select value={methods[s.origen_id]||''} onChange={e=>setMethods({...methods,[s.origen_id]:e.target.value})}><option value="">¿Medio?</option>{CASH_METHODS.map(m=><option key={m}>{m}</option>)}</select>}</td>
    <td>{(s.medio||methods[s.origen_id])?<AccountSelect medio={s.medio||methods[s.origen_id]} cuentas={day.cuentas} sedeId={day.sede_id} value={accounts[s.origen_id]||''} onChange={id=>setAccounts({...accounts,[s.origen_id]:id})}/>:'—'}</td>
    <td>{s.origen==='pago'?<SupportCell soportes={s.soportes} historico={s.soporte_historico} onError={onError}/>:'—'}</td>
    <td><button className={styles.button} disabled={busy===s.origen_id} onClick={()=>void add(s)}>{busy===s.origen_id?'Agregando…':'Agregar a la caja'}</button></td></tr>)}</tbody></table></div>
 </section>;
}

function NewMovement({day,onDone}:{day:CashDay;onDone:(m:string)=>void}){
 const [tipo,setTipo]=useState<'ingreso'|'egreso'>('ingreso'),[categoria,setCategoria]=useState<string>(CASH_CATEGORIES.ingreso[0]),[medio,setMedio]=useState('Efectivo'),[valor,setValor]=useState(''),[descripcion,setDescripcion]=useState('');
 const [file,setFile]=useState<File|null>(null),[saving,setSaving]=useState(false),[error,setError]=useState(''),[cuenta,setCuenta]=useState('');
 const operation=useRef(crypto.randomUUID()),fileInput=useRef<HTMLInputElement>(null);
 const categories=useMemo(()=>CASH_CATEGORIES[tipo],[tipo]);
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();if(saving)return;setError('');
  const amount=parseCashAmount(valor);if(!amount){setError('Escribe un valor válido.');return;}
  if(categoria===CASH_BASE&&medio!=='Efectivo'){setError('La base de caja es en efectivo.');return;}
  if(tipo==='egreso'&&!file){setError('Adjunta el comprobante del egreso.');return;}
  if(tipo==='egreso'&&descripcion.trim().length<3){setError('Describe el egreso.');return;}
  if(medio!=='Efectivo'&&!cuenta&&needsAccount(medio,accountsFor(medio,day.cuentas,day.sede_id))){setError('Elige la cuenta o banco donde llegó (o de donde salió) el dinero.');return;}
  setSaving(true);
  try{
   let path:string|null=null;
   if(file){
    if(file.size>10*1024*1024)throw Error('El comprobante supera 10 MB.');
    path=cashReceiptPath(day.sede_id,day.fecha,operation.current,file.type);
    const {error:ue}=await supabase.storage.from('comprobantes_caja').upload(path,file,{upsert:false});
    if(ue&&!/exists|duplicate/i.test(ue.message))throw Error('No se pudo subir el comprobante.');
   }
   const {error:re}=await supabase.rpc('registrar_movimiento_caja',{p_datos:{sede_id:day.sede_id,fecha:day.fecha,tipo,categoria,medio,valor:amount,descripcion:descripcion.trim(),comprobante_path:path,cuenta_id:medio==='Efectivo'?null:(cuenta||null)}});
   if(re)throw Error(re.message);
   operation.current=crypto.randomUUID();setValor('');setDescripcion('');setFile(null);if(fileInput.current)fileInput.current.value='';
   onDone(`${tipo==='ingreso'?'Ingreso':'Egreso'} registrado.`);
  }catch(err){setError(errorText(err,'No se pudo registrar.'));}finally{setSaving(false);}
 };
 return <section className={styles.card}><h2>Nuevo movimiento</h2><p>Ingresos y egresos de la sede. Los egresos requieren comprobante.</p>
  <button type="button" className={styles.button} style={{marginBottom:12}} onClick={()=>{setTipo('ingreso');setCategoria(CASH_BASE);setMedio('Efectivo');setCuenta('');}}>+ Agregar base de caja</button>
  {categoria===CASH_BASE&&<p className={styles.help}>Base de caja: efectivo que se pone en la caja para trabajar el día, aunque no se sepa de dónde salió. No necesita soporte y no cuenta como venta.</p>}
  <form className={styles.form} onSubmit={submit}><fieldset disabled={saving} style={{border:0,padding:0,margin:0,display:'grid',gap:12}}>
   <div className={styles.row}><label>Tipo<select value={tipo} onChange={e=>{const t=e.target.value as 'ingreso'|'egreso';setTipo(t);setCategoria(CASH_CATEGORIES[t][0]);}}><option value="ingreso">Ingreso</option><option value="egreso">Egreso</option></select></label>
    <label>Categoría<select value={categoria} onChange={e=>{setCategoria(e.target.value);if(e.target.value===CASH_BASE){setMedio('Efectivo');setCuenta('');}}}>{categories.map(c=><option key={c}>{c}</option>)}</select></label></div>
   <div className={styles.row}><label>Medio<select value={medio} disabled={categoria===CASH_BASE} onChange={e=>{setMedio(e.target.value);setCuenta('');}}>{CASH_METHODS.map(m=><option key={m}>{m}</option>)}</select></label>
    <label>{tipo==='ingreso'?'Cuenta donde llegó':'Cuenta de donde salió'}<AccountSelect medio={medio} cuentas={day.cuentas} sedeId={day.sede_id} value={cuenta} onChange={setCuenta}/></label></div>
   <div className={styles.row}><label>Valor (COP)<input inputMode="decimal" placeholder="150.000" value={valor} onChange={e=>setValor(e.target.value)}/></label></div>
   <label>Descripción{tipo==='egreso'?' (obligatoria)':''}<input maxLength={500} value={descripcion} onChange={e=>setDescripcion(e.target.value)} placeholder={tipo==='egreso'?'Ej.: taxi para entrega de vestido':'Opcional'}/></label>
   <label>Comprobante{tipo==='egreso'?' (obligatorio)':' (opcional)'}<input ref={fileInput} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0]||null)}/><span className={styles.help}>PDF o imagen · Máximo 10 MB · Acceso privado</span></label>
   {error&&<p role="alert" className={styles.error}>{error}</p>}
   <button className={`${styles.button} ${styles.primary}`} type="submit">{saving?'Registrando…':'Registrar movimiento'}</button>
  </fieldset></form>
 </section>;
}

function CloseForm({day,esperado,pendingSupports,onDone}:{day:CashDay;esperado:number;pendingSupports:number;onDone:(m:string)=>void}){
 const [contado,setContado]=useState(''),[obs,setObs]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const counted=contado.trim()==='0'?0:parseCashAmount(contado),diff=counted===null?null:cashDifference(counted,esperado);
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();if(saving)return;setError('');
  if(pendingSupports>0){setError(`Hay ${pendingSupports} ingreso(s) del día sin soporte. Adjunta el soporte para poder confirmar el cierre.`);return;}
  if(counted===null){setError('Escribe el efectivo contado.');return;}
  if(diff!==0&&obs.trim().length<5){setError('Hay diferencia: explica el motivo en observaciones.');return;}
  if(!window.confirm(`¿Cerrar la caja del ${day.fecha} con ${money(counted)} contados? Después no se podrán registrar ni anular movimientos de ese día.`))return;
  setSaving(true);
  const {error:re}=await supabase.rpc('cerrar_caja',{p_sede:day.sede_id,p_fecha:day.fecha,p_contado:counted,p_observaciones:obs.trim()});
  setSaving(false);if(re)setError(re.message);else onDone('Caja cerrada. El efectivo contado es el saldo inicial del siguiente día.');
 };
 return <section className={styles.card}><h2>Cerrar caja</h2><p>Cuenta el efectivo físico y compáralo con lo esperado.</p>
  <form className={styles.form} onSubmit={submit}><fieldset disabled={saving} style={{border:0,padding:0,margin:0,display:'grid',gap:12}}>
   <p className={styles.help}>Esperado = saldo inicial {money(day.saldo_inicial)} + ingresos en efectivo (incluida la base) − egresos en efectivo = <strong>{money(esperado)}</strong>. Los depósitos en garantía no se cuentan aquí.</p>
   <label>Efectivo contado (COP)<input inputMode="decimal" placeholder="0" value={contado} onChange={e=>setContado(e.target.value)}/></label>
   {diff!==null&&<p className={styles.help}>Diferencia: <span className={`${styles.diff} ${diff<0?styles.out:diff>0?styles.in:''}`}>{money(diff)}</span>{diff===0?' · Cuadra':diff<0?' · Falta dinero':' · Sobra dinero'}</p>}
   <label>Observaciones{diff!==null&&diff!==0?' (obligatorias)':''}<textarea maxLength={1000} value={obs} onChange={e=>setObs(e.target.value)}/></label>
   {pendingSupports>0&&<p className={styles.error}>{pendingSupports} ingreso{pendingSupports===1?'':'s'} sin soporte. Adjunta el soporte para poder confirmar el cierre.</p>}
   {error&&<p role="alert" className={styles.error}>{error}</p>}
   <button className={`${styles.button} ${styles.primary}`} type="submit" disabled={pendingSupports>0}>{saving?'Cerrando…':'Cerrar caja del día'}</button>
  </fieldset></form>
 </section>;
}

function Reopen({day,onDone}:{day:CashDay;onDone:(m:string)=>void}){
 const [error,setError]=useState('');
 const reopen=async()=>{const motivo=window.prompt('Motivo para reabrir esta caja (mínimo 5 caracteres)');if(motivo===null)return;const {error:re}=await supabase.rpc('reabrir_caja',{p_sede:day.sede_id,p_fecha:day.fecha,p_motivo:motivo});if(re)setError(re.message);else onDone('Caja reabierta. El cierre anterior queda guardado con el motivo.');};
 return <section className={styles.card}><h2>Reabrir caja</h2><p>Solo administradores. El cierre anterior queda en el historial con el motivo.</p>
  {error&&<p role="alert" className={styles.error}>{error}</p>}<button className={`${styles.button} ${styles.danger}`} onClick={()=>void reopen()}>Reabrir caja de este día</button></section>;
}
