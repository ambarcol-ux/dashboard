'use client';
import {useEffect,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {money} from '@/lib/deposits';
import {ACCOUNT_TYPES,CASH_CATEGORIES,CASH_METHODS,accountLabel,accountsFor,needsAccount,parseCashAmount,type CashAccount,type CashDay,type CashMovement,type WhereIsMoney} from '@/lib/cash';
import styles from '@/app/dashboard/caja/caja.module.css';

const TYPE_ICON:Record<string,string>={efectivo:'💵',banco:'🏦',billetera:'📱',sin_cuenta:'❔'};

/** Destination selector for a payment method: shows the site's petty cash for cash, or the banks and wallets for the rest. */
export function AccountSelect({medio,cuentas,sedeId,value,onChange}:{medio:string;cuentas?:CashAccount[];sedeId:string;value:string;onChange:(id:string)=>void}){
 const options=accountsFor(medio,cuentas,sedeId);
 if(medio==='Efectivo')return <span className={styles.help}>Queda en: <strong>{options[0]?.nombre||'Caja menor de la sede'}</strong></span>;
 if(!options.length)return <span className={styles.help}>Sin cuentas configuradas</span>;
 return <select value={value} onChange={e=>onChange(e.target.value)} aria-label="Cuenta donde llegó el dinero">
  <option value="">{needsAccount(medio,options)?'¿A qué cuenta llegó?':'Sin cuenta'}</option>
  {options.map(c=><option key={c.id} value={c.id}>{accountLabel(c)}</option>)}
 </select>;
}

/** Admin-only editor: method, destination account, amount, category and description, with a mandatory reason. */
export function EditMovement({day,movement,onClose,onDone}:{day:CashDay;movement:CashMovement;onClose:()=>void;onDone:(m:string)=>void}){
 const fromErp=movement.origen==='pago'||movement.origen==='deposito'||movement.origen==='devolucion',deposit=movement.origen==='deposito'||movement.origen==='devolucion';
 const [medio,setMedio]=useState(movement.medio),[cuenta,setCuenta]=useState(movement.medio==='Efectivo'?'':movement.cuenta_id||''),[valor,setValor]=useState(String(movement.valor));
 const [categoria,setCategoria]=useState(movement.categoria),[descripcion,setDescripcion]=useState(movement.descripcion||''),[motivo,setMotivo]=useState('');
 const [saving,setSaving]=useState(false),[error,setError]=useState('');
 const categories:readonly string[]=CASH_CATEGORIES[movement.tipo].includes(movement.categoria as never)?CASH_CATEGORIES[movement.tipo]:[movement.categoria,...CASH_CATEGORIES[movement.tipo]];
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();if(saving)return;setError('');
  const amount=Number(valor)===Number(movement.valor)?Number(movement.valor):parseCashAmount(valor);
  if(!amount){setError('Escribe un valor válido.');return;}
  if(needsAccount(medio,accountsFor(medio,day.cuentas,day.sede_id))&&!cuenta){setError('Elige la cuenta o banco donde llegó el dinero.');return;}
  if(motivo.trim().length<5){setError('Escribe el motivo del cambio (mínimo 5 caracteres).');return;}
  setSaving(true);
  const {error:re}=await supabase.rpc('editar_movimiento_caja',{p_id:movement.id,p_datos:{medio,cuenta_id:medio==='Efectivo'?null:(cuenta||null),valor:amount,categoria,descripcion:descripcion.trim()},p_motivo:motivo.trim()});
  setSaving(false);
  if(re)setError(re.message);else onDone(movement.origen==='pago'&&amount!==Number(movement.valor)?'Movimiento editado. El pago y el saldo del contrato se ajustaron.':'Movimiento editado. El cambio queda en el historial.');
 };
 return <div className={styles.overlay} role="dialog" aria-modal="true" onClick={e=>{if(e.target===e.currentTarget&&!saving)onClose();}}>
  <form className={styles.dialog} onSubmit={submit}><h2>Editar movimiento</h2>
   <fieldset disabled={saving} style={{border:0,padding:0,margin:0,display:'grid',gap:12}}>
    <p className={styles.help}>{movement.tipo==='ingreso'?'Ingreso':'Egreso'} · {movement.categoria}{movement.numero_contrato?` · ${movement.numero_contrato} · ${movement.cliente}`:''}</p>
    <div className={styles.row}><label>Medio<select value={medio} onChange={e=>{setMedio(e.target.value);setCuenta('');}}>{CASH_METHODS.map(m=><option key={m}>{m}</option>)}</select></label>
     <label>Cuenta donde está el dinero<AccountSelect medio={medio} cuentas={day.cuentas} sedeId={day.sede_id} value={cuenta} onChange={setCuenta}/></label></div>
    <div className={styles.row}><label>Valor (COP)<input inputMode="decimal" value={valor} disabled={deposit} onChange={e=>setValor(e.target.value)}/>{deposit&&<span className={styles.help}>El valor de un depósito se cambia en Depósitos → Modificar valor.</span>}{movement.origen==='pago'&&<span className={styles.help}>Cambia también el pago y el saldo del contrato.</span>}</label>
     <label>Categoría<select value={categoria} disabled={fromErp} onChange={e=>setCategoria(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></label></div>
    <label>Descripción<input maxLength={500} value={descripcion} onChange={e=>setDescripcion(e.target.value)}/></label>
    <label>Motivo del cambio (obligatorio)<textarea maxLength={500} value={motivo} onChange={e=>setMotivo(e.target.value)} placeholder="Ej.: la clienta pagó en efectivo, no por transferencia"/></label>
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.actions} style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
     <button type="button" className={styles.button} onClick={onClose}>Cancelar</button>
     <button type="submit" className={`${styles.button} ${styles.primary}`}>{saving?'Guardando…':'Guardar cambio'}</button>
    </div>
   </fieldset>
  </form>
 </div>;
}

/** "¿Dónde está la plata?": where the money of the period is (each site's petty cash, each bank, each wallet) and what is still not in the cash register. */
export function WhereIsMoneyView({today}:{today:string}){
 const [desde,setDesde]=useState(today.slice(0,8)+'01'),[hasta,setHasta]=useState(today),[data,setData]=useState<WhereIsMoney|null>(null),[error,setError]=useState(''),[version,setVersion]=useState(0);
 const loading=!error&&(data===null||data.desde!==desde||data.hasta!==hasta);
 useEffect(()=>{
  let live=true;
  void (async()=>{
   const {data:res,error:re}=await supabase.rpc('donde_esta_la_plata',{p_desde:desde,p_hasta:hasta});
   if(!live)return;
   if(re){setError(re.message);setData(null);}else{setError('');setData(res as WhereIsMoney);}
  })();
  return()=>{live=false;};
 },[desde,hasta,version]);
 const rows=data?.cuentas||[],sum=(k:'ingresos'|'egresos'|'neto')=>rows.reduce((t,r)=>t+Number(r[k]||0),0);
 const cash=rows.filter(r=>r.tipo==='efectivo'),banks=rows.filter(r=>r.tipo==='banco'||r.tipo==='billetera'),unassigned=rows.filter(r=>r.tipo==='sin_cuenta');
 const neto=(list:typeof rows)=>list.reduce((t,r)=>t+Number(r.neto||0),0);
 return <>
  <div className={styles.toolbar} style={{marginBottom:18}}>
   <label>Desde<input type="date" max={hasta} value={desde} onChange={e=>{if(e.target.value){setError('');setDesde(e.target.value);}}}/></label>
   <label>Hasta<input type="date" max={today} value={hasta} onChange={e=>{if(e.target.value){setError('');setHasta(e.target.value);if(e.target.value<desde)setDesde(e.target.value);}}}/></label>
   <button className={styles.button} onClick={()=>{setData(null);setVersion(v=>v+1);}} disabled={loading}><RefreshCw size={14} style={{display:'inline',verticalAlign:'-2px'}}/> {loading?'Actualizando…':'Actualizar'}</button>
  </div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <div className={styles.stats}>
   <div><span>Entró (todas las cuentas)</span><strong className={styles.in}>{money(sum('ingresos'))}</strong></div>
   <div><span>Salió (todas las cuentas)</span><strong className={styles.out}>{money(sum('egresos'))}</strong></div>
   <div><span>💵 Neto en cajas menores</span><strong>{money(neto(cash))}</strong></div>
   <div><span>🏦 Neto en bancos y billeteras</span><strong>{money(neto(banks))}</strong></div>
   {unassigned.length>0&&<div><span>❔ Sin cuenta asignada</span><strong className={styles.out}>{money(neto(unassigned))}</strong><span>Asígnala con “Editar” en la caja del día</span></div>}
   <div><span>Depósitos en garantía recibidos / devueltos</span><strong>{money(Number(data?.depositos.recibidos||0))} / {money(Number(data?.depositos.devueltos||0))}</strong><span>Se deben a las clientas</span></div>
  </div>
  <section className={styles.card}><h2>¿Dónde está la plata?</h2><p>Por cada cuenta: lo que entró y salió en el periodo y de dónde vino. Solo cuenta lo registrado en los cierres de caja.</p>
   <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Cuenta</th><th>Entró</th><th>Salió</th><th>Neto</th><th>Pagos de contratos</th><th>Depósitos (recibidos / devueltos)</th><th>Otros (ingresos / egresos)</th><th>Por sede</th><th>Efectivo en caja (último cierre)</th></tr></thead>
    <tbody>{rows.map(r=><tr key={r.cuenta_id||r.nombre}>
     <td><strong>{TYPE_ICON[r.tipo]} {r.nombre}</strong>{(r.banco||r.numero)&&<small>{[r.banco,r.numero&&`****${r.numero.slice(-4)}`].filter(Boolean).join(' · ')}</small>}{r.activo===false&&<small>Inactiva</small>}<small>{r.movimientos} movimiento{r.movimientos===1?'':'s'}</small></td>
     <td className={styles.in}>{money(r.ingresos)}</td><td className={styles.out}>{money(r.egresos)}</td><td><strong>{money(r.neto)}</strong></td>
     <td>{money(r.pagos)}</td><td>{money(r.depositos)} / {money(r.devoluciones)}</td><td>{money(r.otros_ingresos)} / {money(r.otros_egresos)}</td>
     <td>{Object.entries(r.por_sede||{}).map(([s,v])=><small key={s}>{s}: {money(v)}</small>)}</td>
     <td>{r.efectivo_en_caja===null?'—':money(r.efectivo_en_caja)}</td></tr>)}</tbody></table></div>
   {!rows.length&&<p className={styles.empty}>{loading?'Cargando…':'No hay movimientos de caja en este periodo.'}</p>}
  </section>
  {!!data?.sin_registrar.length&&<section className={styles.card}><h2>Registrado en el ERP pero no en la caja</h2><p>Pagos y depósitos del periodo que nadie ha agregado a la caja de su sede: hasta que se agreguen no se sabe a qué cuenta llegaron.</p>
   <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Sede</th><th>Pagos sin registrar</th><th>Depósitos sin registrar</th></tr></thead>
    <tbody>{data.sin_registrar.map(p=><tr key={p.sede_id}><td><strong>{p.sede}</strong></td><td>{p.pagos} · {money(p.valor_pagos)}</td><td>{p.depositos} · {money(p.valor_depositos)}</td></tr>)}</tbody></table></div>
  </section>}
 </>;
}

type Site={sede_id:string;sede:string};
const EMPTY={id:'',nombre:'',tipo:'banco' as CashAccount['tipo'],banco:'',numero:'',titular:'',sede_id:'',activo:true,orden:0};

/** Accounts and petty cash: admins add banks and wallets, rename the petty cash of each site and deactivate old accounts. */
export function AccountsAdmin({sites,isAdmin}:{sites:Site[];isAdmin:boolean}){
 const [rows,setRows]=useState<CashAccount[]|null>(null),[form,setForm]=useState(EMPTY),[error,setError]=useState(''),[notice,setNotice]=useState(''),[saving,setSaving]=useState(false),[version,setVersion]=useState(0);
 useEffect(()=>{
  let live=true;
  void (async()=>{const {data,error:re}=await supabase.rpc('cuentas_dinero_lista');if(!live)return;if(re)setError(re.message);else setRows((data||[]) as CashAccount[]);})();
  return()=>{live=false;};
 },[version]);
 const edit=(c:CashAccount)=>{setNotice('');setError('');setForm({id:c.id,nombre:c.nombre,tipo:c.tipo,banco:c.banco||'',numero:c.numero||'',titular:c.titular||'',sede_id:c.sede_id||'',activo:c.activo,orden:c.orden});};
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();if(saving)return;setError('');
  if(form.nombre.trim().length<2){setError('Escribe el nombre de la cuenta.');return;}
  if(form.tipo==='efectivo'&&!form.sede_id){setError('La caja menor debe pertenecer a una sede.');return;}
  if(form.tipo==='banco'&&!form.banco.trim()){setError('Escribe el banco.');return;}
  setSaving(true);
  const {error:re}=await supabase.rpc('guardar_cuenta_dinero',{p_datos:{...form,id:form.id||null,sede_id:form.sede_id||null}});
  setSaving(false);
  if(re){setError(re.message);return;}
  setNotice(form.id?'Cuenta actualizada.':'Cuenta creada.');setForm(EMPTY);setVersion(v=>v+1);
 };
 const set=(k:keyof typeof EMPTY,v:string|boolean|number)=>setForm(f=>({...f,[k]:v}));
 return <>
  {notice&&<p role="status" className={styles.notice}>{notice}</p>}
  <section className={styles.card}><h2>Cuentas y caja menor</h2><p>El efectivo de cada sede queda en su caja menor. Las transferencias y pagos con tarjeta se asignan a la cuenta bancaria o billetera donde llegaron. Una cuenta sin sede sirve para todas las sedes.</p>
   <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Cuenta</th><th>Tipo</th><th>Banco / número</th><th>Titular</th><th>Sede</th><th>Estado</th>{isAdmin&&<th></th>}</tr></thead>
    <tbody>{(rows||[]).map(c=><tr key={c.id} className={c.activo?'':styles.annulled}><td><strong>{TYPE_ICON[c.tipo]} {c.nombre}</strong></td><td>{ACCOUNT_TYPES[c.tipo]}</td><td>{[c.banco,c.numero].filter(Boolean).join(' · ')||'—'}</td><td>{c.titular||'—'}</td><td>{c.sede||'Todas las sedes'}</td>
     <td>{c.activo?<span className={`${styles.badge} ${styles.badgeIn}`}>Activa</span>:<span className={styles.badge}>Inactiva</span>}</td>
     {isAdmin&&<td><button className={styles.button} onClick={()=>edit(c)}>Editar</button></td>}</tr>)}</tbody></table></div>
   {!rows?.length&&<p className={styles.empty}>{rows?'No hay cuentas configuradas.':'Cargando…'}</p>}
  </section>
  {isAdmin&&<section className={styles.card}><h2>{form.id?'Editar cuenta':'Nueva cuenta'}</h2>
   <form className={styles.form} onSubmit={submit}><fieldset disabled={saving} style={{border:0,padding:0,margin:0,display:'grid',gap:12}}>
    <div className={styles.row}><label>Tipo<select value={form.tipo} onChange={e=>set('tipo',e.target.value)}>{Object.entries(ACCOUNT_TYPES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
     <label>Nombre<input maxLength={80} value={form.nombre} onChange={e=>set('nombre',e.target.value)} placeholder={form.tipo==='efectivo'?'Caja menor Bogotá':form.tipo==='banco'?'Bancolombia ahorros principal':'Nequi Pereira'}/></label></div>
    {form.tipo!=='efectivo'&&<div className={styles.row}><label>Banco o plataforma{form.tipo==='banco'?' (obligatorio)':''}<input maxLength={60} value={form.banco} onChange={e=>set('banco',e.target.value)} placeholder="Bancolombia, Davivienda, Nequi…"/></label>
     <label>Número de cuenta<input maxLength={40} value={form.numero} onChange={e=>set('numero',e.target.value)}/></label></div>}
    <div className={styles.row}>{form.tipo!=='efectivo'&&<label>Titular<input maxLength={120} value={form.titular} onChange={e=>set('titular',e.target.value)}/></label>}
     <label>Sede<select value={form.sede_id} onChange={e=>set('sede_id',e.target.value)}>{form.tipo!=='efectivo'&&<option value="">Todas las sedes</option>}{form.tipo==='efectivo'&&<option value="">Elige la sede</option>}{sites.map(s=><option key={s.sede_id} value={s.sede_id}>{s.sede}</option>)}</select></label></div>
    <label className={styles.check}><input type="checkbox" checked={form.activo} onChange={e=>set('activo',e.target.checked)}/> Activa (se puede elegir al registrar movimientos)</label>
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    <div style={{display:'flex',gap:8}}>
     <button type="submit" className={`${styles.button} ${styles.primary}`}>{saving?'Guardando…':form.id?'Guardar cambios':'Crear cuenta'}</button>
     {form.id&&<button type="button" className={styles.button} onClick={()=>{setForm(EMPTY);setError('');}}>Cancelar</button>}
    </div>
   </fieldset></form>
  </section>}
  {!isAdmin&&error&&<p role="alert" className={styles.error}>{error}</p>}
 </>;
}
