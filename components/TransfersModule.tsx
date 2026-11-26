'use client';
import MoneyInput from '@/components/MoneyInput';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {RefreshCw} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {can,usePermissions} from '@/lib/use-permissions';
import styles from '@/app/dashboard/caja/caja.module.css';

/** Inventario › Traslados: request → approval (owner site or administration) → shipping → reception, and the return of loans. */
type Transfer={id:string;tipo:'definitivo'|'prestamo'|'devolucion'|'directo';estado:string;vestido_id:string;codigo:string;nombre:string|null;talla:string|null;color:string|null;
 sede_origen_id:string;sede_origen:string|null;sede_destino_id:string;sede_destino:string|null;motivo:string|null;fecha_devolucion:string|null;contrato:string|null;
 transportadora:string|null;guia:string|null;costo_envio:number|null;observacion:string|null;solicitado_por:string|null;aprobado_por:string|null;enviado_por:string|null;recibido_por:string|null;
 created_at:string;aprobado_at:string|null;fecha_envio:string|null;fecha_recepcion:string|null;en_origen:boolean;en_destino:boolean};
type Dress={id:string;codigo:string;nombre:string|null;talla:string|null;color:string|null;sede_actual_id:string|null};
type Action={kind:'aprobar'|'rechazar'|'enviar'|'recibir'|'devolver'|'cancelar';t:Transfer};

const TIPO:Record<string,string>={definitivo:'Definitivo',prestamo:'Préstamo',devolucion:'Devolución',directo:'Directo (inventario)'};
const ESTADO:Record<string,string>={solicitado:'Por aprobar',aprobado:'Aprobado · por enviar',enviado:'En camino',recibido:'Recibido',en_devolucion:'Devolviéndose',devuelto:'Devuelto',rechazado:'Rechazado',cancelado:'Cancelado',directo:'Hecho en inventario'};
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'});
const when=(v:string|null)=>v?new Date(v).toLocaleString('es-CO',{timeZone:'America/Bogota',dateStyle:'short',timeStyle:'short'}):'—';
const money=(n:number|null)=>n==null?'':new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n);
const errText=(e:unknown)=>(e as {message?:string})?.message||'No se pudo completar.';

export default function TransfersModule({profile}:{profile:{id:string;sede_id:string|null}}){
 const perms=usePermissions(profile.id);
 const params=useSearchParams();
 const [rows,setRows]=useState<Transfer[]>([]),[sedes,setSedes]=useState<{id:string;nombre:string}[]>([]),[loading,setLoading]=useState(true);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[tab,setTab]=useState<'pendientes'|'nuevo'|'historial'>(params.get('vestido')?'nuevo':'pendientes');
 const [action,setAction]=useState<Action|null>(null),[busy,setBusy]=useState(false),[filtro,setFiltro]=useState('');
 const load=useCallback(async()=>{
  const [l,s]=await Promise.all([supabase.rpc('traslados_lista'),supabase.from('sedes').select('id,nombre').eq('activo',true).order('nombre')]);
  if(l.error)setError(errText(l.error));else{setRows((l.data||[]) as Transfer[]);setError('');}
  setSedes(s.data||[]);setLoading(false);
 },[]);
 useEffect(()=>{void load();},[load]);
 const done=(msg:string)=>{setNotice(msg);setAction(null);setLoading(true);void load();};

 const hoy=today();
 const buckets=useMemo(()=>{const flow=rows.filter(r=>r.estado!=='directo');return [
  {title:'Por aprobar (vestidos de tu sede)',help:'Otra sede pide un vestido que está en tu tienda.',rows:flow.filter(r=>r.estado==='solicitado'&&r.en_origen)},
  {title:'Tus solicitudes esperando aprobación',help:'',rows:flow.filter(r=>r.estado==='solicitado'&&!r.en_origen&&r.en_destino)},
  {title:'Por enviar',help:'Aprobados: empácalos y márcalos como enviados.',rows:flow.filter(r=>r.estado==='aprobado'&&r.en_origen)},
  {title:'Por recibir',help:'Vienen en camino a tu sede.',rows:flow.filter(r=>r.estado==='enviado'&&r.en_destino)},
  {title:'Enviados por tu sede',help:'',rows:flow.filter(r=>r.estado==='enviado'&&r.en_origen&&!r.en_destino)},
  {title:'Préstamos por devolver',help:'En rojo los que ya pasaron su fecha de devolución.',rows:flow.filter(r=>r.tipo==='prestamo'&&(r.estado==='recibido'||r.estado==='en_devolucion'))},
 ];},[rows]);
 const pendientes=buckets.reduce((n,b)=>n+b.rows.length,0);

 const actionsFor=(t:Transfer)=>{const a:Action['kind'][]=[];
  if(t.estado==='solicitado'&&t.en_origen&&can(perms,'traslados.aprobar'))a.push('aprobar','rechazar');
  if(t.estado==='aprobado'&&t.en_origen&&can(perms,'traslados.mover'))a.push('enviar');
  if(t.estado==='enviado'&&t.en_destino&&can(perms,'traslados.mover'))a.push('recibir');
  if(t.tipo==='prestamo'&&t.estado==='recibido'&&can(perms,'traslados.mover'))a.push('devolver');
  if((t.estado==='solicitado'||t.estado==='aprobado')&&can(perms,'traslados.solicitar'))a.push('cancelar');
  return a;};
 const LABEL:Record<Action['kind'],string>={aprobar:'Aprobar',rechazar:'Rechazar',enviar:'Marcar enviado',recibir:'Marcar recibido',devolver:'Iniciar devolución',cancelar:'Cancelar'};

 const table=(list:Transfer[],withActions=true)=><div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Vestido</th><th>Tipo</th><th>De → A</th><th>Estado</th><th>Detalle</th>{withActions&&<th/>}</tr></thead>
  <tbody>{list.map(t=>{const vencido=t.tipo==='prestamo'&&t.estado==='recibido'&&!!t.fecha_devolucion&&t.fecha_devolucion<hoy;return <tr key={t.id}>
   <td><strong>{t.codigo}</strong><small>{[t.nombre,t.talla&&`Talla ${t.talla}`,t.color].filter(Boolean).join(' · ')}</small></td>
   <td>{TIPO[t.tipo]||t.tipo}{t.contrato&&<small>Contrato {t.contrato}</small>}</td>
   <td>{t.sede_origen||'—'} → {t.sede_destino||'—'}</td>
   <td><span className={styles.badge} style={vencido?{background:'#fef2f2',color:'#b91c1c'}:undefined}>{vencido?'Préstamo vencido':ESTADO[t.estado]||t.estado}</span>
    {t.fecha_devolucion&&<small>Devolver el {t.fecha_devolucion}</small>}</td>
   <td className={styles.help}>{t.motivo}{t.solicitado_por&&<small>Pidió {t.solicitado_por} · {when(t.created_at)}</small>}{t.aprobado_por&&<small>{t.estado==='rechazado'?'Rechazó':'Aprobó'} {t.aprobado_por}</small>}
    {t.fecha_envio&&<small>Envió {t.enviado_por||'—'} · {when(t.fecha_envio)}{t.transportadora?` · ${t.transportadora}`:''}{t.guia?` · guía ${t.guia}`:''}{t.costo_envio!=null?` · ${money(t.costo_envio)}`:''}</small>}
    {t.fecha_recepcion&&<small>Recibió {t.recibido_por||'—'} · {when(t.fecha_recepcion)}</small>}{t.observacion&&<small>Nota: {t.observacion}</small>}</td>
   {withActions&&<td><div className={styles.actions}>{actionsFor(t).map(k=><button key={k} className={k==='aprobar'||k==='enviar'||k==='recibir'?styles.primary:k==='rechazar'||k==='cancelar'?styles.danger:''} onClick={()=>{setNotice('');setAction({kind:k,t});}}>{LABEL[k]}</button>)}</div></td>}
  </tr>;})}</tbody></table></div>;

 const visibles=rows.filter(r=>!filtro.trim()||`${r.codigo} ${r.sede_origen} ${r.sede_destino} ${r.contrato||''}`.toLowerCase().includes(filtro.trim().toLowerCase()));
 return <>
  <div className={styles.tabs} role="tablist">
   {([['pendientes',`Pendientes${pendientes?` (${pendientes})`:''}`],...(can(perms,'traslados.solicitar')?[['nuevo','Nueva solicitud']]:[]),['historial','Historial']] as [typeof tab,string][]).map(([k,l])=>
    <button key={k} role="tab" aria-selected={tab===k} className={`${styles.tab} ${tab===k?styles.tabActive:''}`} onClick={()=>setTab(k)}>{l}</button>)}
   <button className={styles.button} onClick={()=>{setLoading(true);void load();}} disabled={loading}><RefreshCw size={14} style={{display:'inline',verticalAlign:'-2px'}}/> {loading?'Actualizando…':'Actualizar'}</button>
  </div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {notice&&<p role="status" className={styles.notice}>{notice}</p>}
  {tab==='pendientes'&&(loading?<p className={styles.empty}>Cargando…</p>:pendientes?buckets.filter(b=>b.rows.length).map(b=><section key={b.title} className={styles.card} style={{marginBottom:16}}><h2>{b.title} ({b.rows.length})</h2>{b.help&&<p>{b.help}</p>}{table(b.rows)}</section>)
   :<p className={styles.empty}>No tienes traslados pendientes.</p>)}
  {tab==='nuevo'&&<NewTransfer sedes={sedes} defaultSede={params.get('destino')||profile.sede_id} initialDress={params.get('vestido')} onDone={m=>{setTab('pendientes');done(m);}} onError={setError}/>}
  {tab==='historial'&&<section className={styles.card}><div className={styles.toolbar} style={{marginBottom:12}}><label>Buscar<input value={filtro} onChange={e=>setFiltro(e.target.value)} placeholder="Código, sede o contrato"/></label></div>
   {visibles.length?table(visibles.slice(0,300),false):<p className={styles.empty}>Sin traslados.</p>}</section>}
  {action&&<ActionDialog action={action} busy={busy} onClose={()=>setAction(null)} onRun={async(fields)=>{setBusy(true);setError('');try{
   const id=action.t.id;let r:{error:unknown}|null=null;
   if(action.kind==='aprobar'||action.kind==='rechazar')r=await supabase.rpc('traslado_aprobar',{p_id:id,p_aprobar:action.kind==='aprobar',p_motivo:fields.nota||null});
   if(action.kind==='enviar')r=await supabase.rpc('traslado_enviar',{p_id:id,p_datos:{transportadora:fields.transportadora||'',guia:fields.guia||'',costo_envio:fields.costo||''}});
   if(action.kind==='recibir')r=await supabase.rpc('traslado_recibir',{p_id:id,p_observacion:fields.nota||null});
   if(action.kind==='devolver')r=await supabase.rpc('traslado_devolver',{p_id:id});
   if(action.kind==='cancelar')r=await supabase.rpc('traslado_cancelar',{p_id:id,p_motivo:fields.nota||null});
   if(r?.error)throw r.error;
   done({aprobar:'Traslado aprobado: ya se puede enviar.',rechazar:'Solicitud rechazada.',enviar:'Marcado como enviado: el vestido queda «En traslado».',recibir:'Recibido: el vestido ya está en tu sede.',devolver:'Devolución creada: márcala como enviada cuando salga.',cancelar:'Traslado cancelado.'}[action.kind]);
  }catch(e){setError(errText(e));setAction(null);}finally{setBusy(false);}}}/>}
 </>;
}

function ActionDialog({action,busy,onClose,onRun}:{action:Action;busy:boolean;onClose:()=>void;onRun:(f:Record<string,string>)=>void}){
 const [f,setF]=useState<Record<string,string>>({});
 const {kind,t}=action;
 const title={aprobar:'Aprobar traslado',rechazar:'Rechazar solicitud',enviar:'Marcar como enviado',recibir:'Marcar como recibido',devolver:'Iniciar devolución del préstamo',cancelar:'Cancelar traslado'}[kind];
 const needsNote=kind==='rechazar';
 return <div className={styles.overlay} onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><div className={styles.dialog} role="dialog" aria-modal="true" aria-label={title}>
  <h2>{title}</h2><p className={styles.help}>{t.codigo} · {t.sede_origen} → {t.sede_destino} · {TIPO[t.tipo]}</p>
  <div className={styles.form} style={{marginTop:12}}>
   {kind==='enviar'&&<><label>Transportadora (opcional)<input maxLength={80} value={f.transportadora||''} onChange={e=>setF({...f,transportadora:e.target.value})} placeholder="Ej.: Servientrega o la persona que lo lleva"/></label>
    <div className={styles.row}><label>Guía (opcional)<input maxLength={80} value={f.guia||''} onChange={e=>setF({...f,guia:e.target.value})}/></label>
    <label>Costo del envío (opcional)<MoneyInput inputMode="numeric" value={f.costo||''} onChange={e=>setF({...f,costo:e.target.value.replace(/\D/g,'')})} placeholder="0"/></label></div></>}
   {(kind==='rechazar'||kind==='recibir'||kind==='cancelar')&&<label>{kind==='recibir'?'¿En qué estado llegó? (opcional)':kind==='rechazar'?'Motivo del rechazo':'Motivo (opcional)'}<textarea rows={3} maxLength={500} value={f.nota||''} onChange={e=>setF({...f,nota:e.target.value})}/></label>}
   {kind==='devolver'&&<p className={styles.help}>Se crea el envío de regreso a {t.sede_origen}, ya aprobado. Luego márcalo como enviado y {t.sede_origen} lo recibe.</p>}
   {kind==='aprobar'&&<p className={styles.help}>{t.sede_origen} enviará el vestido a {t.sede_destino}.{t.fecha_devolucion?` Debe volver el ${t.fecha_devolucion}.`:''}</p>}
  </div>
  <div className={styles.actions} style={{marginTop:16}}><button className={styles.primary} disabled={busy||(needsNote&&!(f.nota||'').trim())} onClick={()=>onRun(f)}>{busy?'Guardando…':'Confirmar'}</button><button disabled={busy} onClick={onClose}>Volver</button></div>
 </div></div>;
}

function NewTransfer({sedes,defaultSede,initialDress,onDone,onError}:{sedes:{id:string;nombre:string}[];defaultSede:string|null;initialDress:string|null;onDone:(m:string)=>void;onError:(m:string)=>void}){
 const [q,setQ]=useState(''),[found,setFound]=useState<Dress[]>([]),[dress,setDress]=useState<Dress|null>(null);
 const [f,setF]=useState({tipo:'prestamo',sede_destino_id:defaultSede||'',fecha_devolucion:'',numero_contrato:'',motivo:''}),[busy,setBusy]=useState(false);
 const FIELDS='id,codigo,nombre,talla,color,sede_actual_id';
 useEffect(()=>{if(!initialDress)return;let live=true;void supabase.from('vestidos').select(FIELDS).eq('id',initialDress).maybeSingle().then(({data})=>{if(live&&data)setDress(data as Dress);});return()=>{live=false;};},[initialDress]);
 const search=async()=>{const term=q.trim();if(term.length<2)return;const {data}=await supabase.from('vestidos').select(FIELDS).ilike('codigo',`%${term}%`).eq('archivado',false).order('codigo').limit(15);setFound((data||[]) as Dress[]);};
 const sedeName=(id:string|null)=>sedes.find(s=>s.id===id)?.nombre||'sin sede';
 const submit=async()=>{if(!dress)return onError('Elige el vestido.');setBusy(true);
  const {error}=await supabase.rpc('traslado_solicitar',{p_datos:{vestido_id:dress.id,...f}});setBusy(false);
  if(error)onError(errText(error));else onDone(`Solicitud creada: ${dress.codigo} de ${sedeName(dress.sede_actual_id)} a ${sedeName(f.sede_destino_id)}. Queda esperando aprobación.`);};
 return <section className={styles.card}><h2>Nueva solicitud de traslado</h2><p>Pide un vestido que está en otra sede. Lo aprueba la sede donde está el vestido o administración.</p>
  <div className={styles.form}>
   {!dress?<><div className={styles.toolbar}><label>Código del vestido<input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void search();}} placeholder="Ej.: 1445"/></label><button className={styles.button} onClick={()=>void search()}>Buscar</button></div>
    {found.length>0&&<div className={styles.actions}>{found.map(d=><button key={d.id} onClick={()=>setDress(d)}>{d.codigo} · {sedeName(d.sede_actual_id)}</button>)}</div>}</>
   :<p><strong>{dress.codigo}</strong> {[dress.nombre,dress.talla&&`Talla ${dress.talla}`,dress.color].filter(Boolean).join(' · ')} · hoy en <strong>{sedeName(dress.sede_actual_id)}</strong> <button className={styles.button} onClick={()=>{setDress(null);setFound([]);}}>Cambiar</button></p>}
   <div className={styles.row}>
    <label>Tipo<select value={f.tipo} onChange={e=>setF({...f,tipo:e.target.value})}><option value="prestamo">Préstamo (vuelve a su sede)</option><option value="definitivo">Definitivo (pasa a la otra sede)</option></select></label>
    <label>Sede que lo recibe<select value={f.sede_destino_id} onChange={e=>setF({...f,sede_destino_id:e.target.value})}><option value="">Elige…</option>{sedes.filter(s=>s.id!==dress?.sede_actual_id).map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
   </div>
   <div className={styles.row}>
    {f.tipo==='prestamo'&&<label>Fecha de devolución<input type="date" min={today()} value={f.fecha_devolucion} onChange={e=>setF({...f,fecha_devolucion:e.target.value})}/></label>}
    <label>Contrato (opcional)<input value={f.numero_contrato} onChange={e=>setF({...f,numero_contrato:e.target.value.toUpperCase()})} placeholder="Ej.: VILL-2026-0144"/></label>
   </div>
   <label>Motivo<textarea rows={2} maxLength={500} value={f.motivo} onChange={e=>setF({...f,motivo:e.target.value})} placeholder="Ej.: Clienta de Villavicencio lo alquiló para el 20 de noviembre"/></label>
   <div className={styles.actions}><button className={styles.primary} disabled={busy||!dress||!f.sede_destino_id||!f.motivo.trim()||(f.tipo==='prestamo'&&!f.fecha_devolucion)} onClick={()=>void submit()}>{busy?'Enviando…':'Enviar solicitud'}</button></div>
  </div>
 </section>;
}
