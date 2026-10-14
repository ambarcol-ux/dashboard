'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {RefreshCw,Lock,Unlock,Paperclip} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {bogotaDay} from '@/lib/contract-calendar';
import {money} from '@/lib/deposits';
import {CASH_CATEGORIES,CASH_METHODS,cashDifference,cashReceiptPath,expectedCash,parseCashAmount,siteTotals,type CashDay,type CashMovement,type CashSiteSummary,type CashSuggestion} from '@/lib/cash';
import styles from '@/app/dashboard/caja/caja.module.css';

type Profile={id:string;rol:string;sede_id:string|null};
const ALL='todas';
const time=(iso:string)=>new Date(iso).toLocaleTimeString('es-CO',{timeZone:'America/Bogota',hour:'2-digit',minute:'2-digit'});
const errorText=(e:unknown,fallback:string)=>e&&typeof e==='object'&&'message' in e&&typeof (e as {message:unknown}).message==='string'?(e as {message:string}).message:fallback;

/** Cash closings: daily income and expenses per site, the closing count, and a view of every site. */
export default function CashRegister({profile}:{profile:Profile}){
 const today=bogotaDay(new Date().toISOString())!;
 const role=profile.rol.toLowerCase(),seesAll=role==='admin'||role==='contabilidad',isAdmin=role==='admin';
 const [sites,setSites]=useState<CashSiteSummary[]>([]),[sede,setSede]=useState(seesAll?ALL:(profile.sede_id||'')),[fecha,setFecha]=useState(today),[desde,setDesde]=useState(today);
 const [day,setDay]=useState<CashDay|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const request=useRef(0);

 const load=useCallback(async()=>{
  const id=++request.current;
  try{
   const summary=await supabase.rpc('caja_resumen',{p_desde:sede===ALL?desde:fecha,p_hasta:fecha});
   if(summary.error)throw summary.error;
   const rows=(summary.data||[]) as CashSiteSummary[];
   if(id!==request.current)return;
   setSites(rows);
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
 return <>
  <div className={styles.toolbar} style={{marginBottom:18}}>
   <label>Sede<select value={sede} onChange={e=>{setLoading(true);setNotice('');setSede(e.target.value);}}>{seesAll&&<option value={ALL}>Todas las sedes</option>}{sites.map(s=><option key={s.sede_id} value={s.sede_id}>{s.sede}</option>)}</select></label>
   {sede===ALL&&<label>Desde<input type="date" max={fecha} value={desde} onChange={e=>{if(e.target.value){setLoading(true);setDesde(e.target.value);}}}/></label>}
   <label>{sede===ALL?'Hasta':'Fecha'}<input type="date" max={today} value={fecha} onChange={e=>{if(e.target.value){setLoading(true);setNotice('');setFecha(e.target.value);if(e.target.value<desde)setDesde(e.target.value);}}}/></label>
   <button className={styles.button} onClick={refresh} disabled={loading}><RefreshCw size={14} style={{display:'inline',verticalAlign:'-2px'}}/> {loading?'Actualizando…':'Actualizar'}</button>
  </div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {notice&&<p role="status" className={styles.notice}>{notice}</p>}
  {sede===ALL?<AllSites rows={sites} loading={loading} onPick={id=>{setLoading(true);setSede(id);}}/>:day?<SiteDay key={`${day.sede_id}:${day.fecha}`} day={day} siteName={siteName} isAdmin={isAdmin} onDone={done} onError={setError}/>:!error&&<p className={styles.empty}>{loading?'Cargando caja…':'No tienes una sede asignada para manejar caja.'}</p>}
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

function SiteDay({day,siteName,isAdmin,onDone,onError}:{day:CashDay;siteName:string;isAdmin:boolean;onDone:(m:string)=>void;onError:(m:string)=>void}){
 const open=!day.cierre,canWork=open&&day.puede_operar;
 const ie=Number(day.totales.ingresos_efectivo||0),ee=Number(day.totales.egresos_efectivo||0),esperado=expectedCash(day.saldo_inicial,ie,ee);
 const active=day.movimientos.filter(m=>!m.anulado_at);
 const openReceipt=async(path:string)=>{const {data,error}=await supabase.storage.from('comprobantes_caja').createSignedUrl(path,300);if(error||!data)onError('No se pudo abrir el comprobante.');else window.open(data.signedUrl,'_blank','noopener,noreferrer');};
 const annul=async(m:CashMovement)=>{const motivo=window.prompt(`Motivo para anular "${m.categoria} ${money(m.valor)}" (mínimo 5 caracteres)`);if(motivo===null)return;const {error}=await supabase.rpc('anular_movimiento_caja',{p_id:m.id,p_motivo:motivo});if(error)onError(error.message);else onDone('Movimiento anulado. Queda visible tachado con su motivo.');};
 return <>
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
  </div>
  <section className={styles.card}><h2>Movimientos del día</h2><p>{active.length} movimiento{active.length===1?'':'s'} · Por medio: {Object.entries(day.totales.por_medio||{}).map(([m,v])=>`${m} +${money(Number(v.ingresos||0))} / −${money(Number(v.egresos||0))}`).join(' · ')||'sin movimientos'}</p>
   <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Hora</th><th>Tipo</th><th>Categoría / detalle</th><th>Medio</th><th>Valor</th><th>Registró</th><th>Comprobante</th>{canWork&&<th></th>}</tr></thead>
    <tbody>{day.movimientos.map(m=><tr key={m.id} className={m.anulado_at?styles.annulled:''}>
     <td>{time(m.created_at)}</td>
     <td><span className={`${styles.badge} ${m.tipo==='ingreso'?styles.badgeIn:styles.badgeOut}`}>{m.tipo==='ingreso'?'Ingreso':'Egreso'}</span></td>
     <td><strong>{m.categoria}</strong>{m.numero_contrato&&<small>{m.numero_contrato} · {m.cliente}</small>}{m.descripcion&&<small>{m.descripcion}</small>}{m.anulado_at&&<small>Anulado por {m.anulado_por}: {m.motivo_anulacion}</small>}</td>
     <td>{m.medio}</td><td className={m.tipo==='ingreso'?styles.in:styles.out}>{m.tipo==='ingreso'?'+':'−'}{money(m.valor)}</td><td>{m.usuario}</td>
     <td>{m.comprobante_path?<button className={styles.button} onClick={()=>void openReceipt(m.comprobante_path!)}><Paperclip size={12} style={{display:'inline'}}/> Ver</button>:'—'}</td>
     {canWork&&<td>{!m.anulado_at&&<button className={`${styles.button} ${styles.danger}`} onClick={()=>void annul(m)}>Anular</button>}</td>}
    </tr>)}</tbody></table></div>
   {!day.movimientos.length&&<p className={styles.empty}>No hay movimientos registrados este día.</p>}
  </section>
  {canWork&&day.sugerencias.length>0&&<Suggestions day={day} onDone={onDone} onError={onError}/>}
  {canWork&&<div className={styles.grid2}><NewMovement day={day} onDone={onDone}/><CloseForm day={day} esperado={esperado} onDone={onDone}/></div>}
  {!open&&isAdmin&&<Reopen day={day} onDone={onDone}/>}
 </>;
}

function Suggestions({day,onDone,onError}:{day:CashDay;onDone:(m:string)=>void;onError:(m:string)=>void}){
 const [methods,setMethods]=useState<Record<string,string>>({}),[busy,setBusy]=useState('');
 const add=async(s:CashSuggestion)=>{
  const medio=s.medio||methods[s.origen_id];if(!medio){onError('Elige el medio de pago de ese movimiento.');return;}
  setBusy(s.origen_id);
  const {error}=await supabase.rpc('registrar_movimiento_caja',{p_datos:{sede_id:day.sede_id,fecha:day.fecha,tipo:s.tipo,categoria:s.categoria,medio,valor:s.valor,origen:s.origen,origen_id:s.origen_id,contrato_id:s.contrato_id,descripcion:`${s.numero_contrato} · ${s.cliente}`}});
  setBusy('');if(error)onError(error.message);else onDone('Movimiento del ERP agregado a la caja.');
 };
 return <section className={styles.card}><h2>Registrados hoy en el ERP</h2><p>Pagos y depósitos de contratos de esta sede que aún no están en la caja. Agrégalos sin volver a digitarlos; cada uno entra una sola vez.</p>
  <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Hora</th><th>Movimiento</th><th>Contrato</th><th>Valor</th><th>Medio</th><th></th></tr></thead>
   <tbody>{day.sugerencias.map(s=><tr key={s.origen+s.origen_id}><td>{time(s.hora)}</td><td><span className={`${styles.badge} ${s.tipo==='ingreso'?styles.badgeIn:styles.badgeOut}`}>{s.categoria}</span></td><td>{s.numero_contrato}<small>{s.cliente}</small></td>
    <td className={s.tipo==='ingreso'?styles.in:styles.out}>{money(s.valor)}</td>
    <td>{s.medio||<select value={methods[s.origen_id]||''} onChange={e=>setMethods({...methods,[s.origen_id]:e.target.value})}><option value="">¿Medio?</option>{CASH_METHODS.map(m=><option key={m}>{m}</option>)}</select>}</td>
    <td><button className={styles.button} disabled={busy===s.origen_id} onClick={()=>void add(s)}>{busy===s.origen_id?'Agregando…':'Agregar a la caja'}</button></td></tr>)}</tbody></table></div>
 </section>;
}

function NewMovement({day,onDone}:{day:CashDay;onDone:(m:string)=>void}){
 const [tipo,setTipo]=useState<'ingreso'|'egreso'>('ingreso'),[categoria,setCategoria]=useState<string>(CASH_CATEGORIES.ingreso[0]),[medio,setMedio]=useState('Efectivo'),[valor,setValor]=useState(''),[descripcion,setDescripcion]=useState('');
 const [file,setFile]=useState<File|null>(null),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const operation=useRef(crypto.randomUUID()),fileInput=useRef<HTMLInputElement>(null);
 const categories=useMemo(()=>CASH_CATEGORIES[tipo],[tipo]);
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();if(saving)return;setError('');
  const amount=parseCashAmount(valor);if(!amount){setError('Escribe un valor válido.');return;}
  if(tipo==='egreso'&&!file){setError('Adjunta el comprobante del egreso.');return;}
  if(tipo==='egreso'&&descripcion.trim().length<3){setError('Describe el egreso.');return;}
  setSaving(true);
  try{
   let path:string|null=null;
   if(file){
    if(file.size>10*1024*1024)throw Error('El comprobante supera 10 MB.');
    path=cashReceiptPath(day.sede_id,day.fecha,operation.current,file.type);
    const {error:ue}=await supabase.storage.from('comprobantes_caja').upload(path,file,{upsert:false});
    if(ue&&!/exists|duplicate/i.test(ue.message))throw Error('No se pudo subir el comprobante.');
   }
   const {error:re}=await supabase.rpc('registrar_movimiento_caja',{p_datos:{sede_id:day.sede_id,fecha:day.fecha,tipo,categoria,medio,valor:amount,descripcion:descripcion.trim(),comprobante_path:path}});
   if(re)throw Error(re.message);
   operation.current=crypto.randomUUID();setValor('');setDescripcion('');setFile(null);if(fileInput.current)fileInput.current.value='';
   onDone(`${tipo==='ingreso'?'Ingreso':'Egreso'} registrado.`);
  }catch(err){setError(errorText(err,'No se pudo registrar.'));}finally{setSaving(false);}
 };
 return <section className={styles.card}><h2>Nuevo movimiento</h2><p>Ingresos y egresos de la sede. Los egresos requieren comprobante.</p>
  <form className={styles.form} onSubmit={submit}><fieldset disabled={saving} style={{border:0,padding:0,margin:0,display:'grid',gap:12}}>
   <div className={styles.row}><label>Tipo<select value={tipo} onChange={e=>{const t=e.target.value as 'ingreso'|'egreso';setTipo(t);setCategoria(CASH_CATEGORIES[t][0]);}}><option value="ingreso">Ingreso</option><option value="egreso">Egreso</option></select></label>
    <label>Categoría<select value={categoria} onChange={e=>setCategoria(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></label></div>
   <div className={styles.row}><label>Medio<select value={medio} onChange={e=>setMedio(e.target.value)}>{CASH_METHODS.map(m=><option key={m}>{m}</option>)}</select></label>
    <label>Valor (COP)<input inputMode="decimal" placeholder="150.000" value={valor} onChange={e=>setValor(e.target.value)}/></label></div>
   <label>Descripción{tipo==='egreso'?' (obligatoria)':''}<input maxLength={500} value={descripcion} onChange={e=>setDescripcion(e.target.value)} placeholder={tipo==='egreso'?'Ej.: taxi para entrega de vestido':'Opcional'}/></label>
   <label>Comprobante{tipo==='egreso'?' (obligatorio)':' (opcional)'}<input ref={fileInput} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0]||null)}/><span className={styles.help}>PDF o imagen · Máximo 10 MB · Acceso privado</span></label>
   {error&&<p role="alert" className={styles.error}>{error}</p>}
   <button className={`${styles.button} ${styles.primary}`} type="submit">{saving?'Registrando…':'Registrar movimiento'}</button>
  </fieldset></form>
 </section>;
}

function CloseForm({day,esperado,onDone}:{day:CashDay;esperado:number;onDone:(m:string)=>void}){
 const [contado,setContado]=useState(''),[obs,setObs]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const counted=contado.trim()==='0'?0:parseCashAmount(contado),diff=counted===null?null:cashDifference(counted,esperado);
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();if(saving)return;setError('');
  if(counted===null){setError('Escribe el efectivo contado.');return;}
  if(diff!==0&&obs.trim().length<5){setError('Hay diferencia: explica el motivo en observaciones.');return;}
  if(!window.confirm(`¿Cerrar la caja del ${day.fecha} con ${money(counted)} contados? Después no se podrán registrar ni anular movimientos de ese día.`))return;
  setSaving(true);
  const {error:re}=await supabase.rpc('cerrar_caja',{p_sede:day.sede_id,p_fecha:day.fecha,p_contado:counted,p_observaciones:obs.trim()});
  setSaving(false);if(re)setError(re.message);else onDone('Caja cerrada. El efectivo contado es el saldo inicial del siguiente día.');
 };
 return <section className={styles.card}><h2>Cerrar caja</h2><p>Cuenta el efectivo físico y compáralo con lo esperado.</p>
  <form className={styles.form} onSubmit={submit}><fieldset disabled={saving} style={{border:0,padding:0,margin:0,display:'grid',gap:12}}>
   <p className={styles.help}>Esperado = saldo inicial {money(day.saldo_inicial)} + ingresos en efectivo − egresos en efectivo = <strong>{money(esperado)}</strong></p>
   <label>Efectivo contado (COP)<input inputMode="decimal" placeholder="0" value={contado} onChange={e=>setContado(e.target.value)}/></label>
   {diff!==null&&<p className={styles.help}>Diferencia: <span className={`${styles.diff} ${diff<0?styles.out:diff>0?styles.in:''}`}>{money(diff)}</span>{diff===0?' · Cuadra':diff<0?' · Falta dinero':' · Sobra dinero'}</p>}
   <label>Observaciones{diff!==null&&diff!==0?' (obligatorias)':''}<textarea maxLength={1000} value={obs} onChange={e=>setObs(e.target.value)}/></label>
   {error&&<p role="alert" className={styles.error}>{error}</p>}
   <button className={`${styles.button} ${styles.primary}`} type="submit">{saving?'Cerrando…':'Cerrar caja del día'}</button>
  </fieldset></form>
 </section>;
}

function Reopen({day,onDone}:{day:CashDay;onDone:(m:string)=>void}){
 const [error,setError]=useState('');
 const reopen=async()=>{const motivo=window.prompt('Motivo para reabrir esta caja (mínimo 5 caracteres)');if(motivo===null)return;const {error:re}=await supabase.rpc('reabrir_caja',{p_sede:day.sede_id,p_fecha:day.fecha,p_motivo:motivo});if(re)setError(re.message);else onDone('Caja reabierta. El cierre anterior queda guardado con el motivo.');};
 return <section className={styles.card}><h2>Reabrir caja</h2><p>Solo administradores. El cierre anterior queda en el historial con el motivo.</p>
  {error&&<p role="alert" className={styles.error}>{error}</p>}<button className={`${styles.button} ${styles.danger}`} onClick={()=>void reopen()}>Reabrir caja de este día</button></section>;
}
