'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {RefreshCw,Undo2} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {bogotaDay} from '@/lib/contract-calendar';
import {CUPOS,DAY_COLORS,HOURS,WEEKDAYS,WEEKDAYS_SHORT,auditCsv,dayState,exceptionLabel,groupByDay,hhmm,monthDays,slotState,validateRule,
 type AgendaAudit,type AgendaBase,type AgendaConfig,type AgendaMode,type AgendaModeRow,type AgendaPreview,type AgendaSlot} from '@/lib/agenda';
import styles from '@/app/dashboard/caja/caja.module.css';

type Tab='estado'|'horario'|'calendario'|'cupos'|'historial';
const TABS:[Tab,string][]=[['estado','1. Estado general'],['horario','2. Horario base'],['calendario','3. Calendario'],['cupos','4. Cupos'],['historial','5. Historial']];
const MODES:AgendaMode[]=['presencial','virtual'];
const modeName=(m:string)=>m==='virtual'?'Virtual':'Presencial';
const errorText=(e:unknown,fallback:string)=>e&&typeof e==='object'&&'message' in e&&typeof (e as {message:unknown}).message==='string'?(e as {message:string}).message:fallback;
const today=()=>bogotaDay(new Date().toISOString())!;
const addDays=(d:string,n:number)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const fmtDate=(d:string)=>new Date(d+'T12:00:00Z').toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'});

/** Panel de control de la Agenda de Primeras Citas: estado por modalidad, horario base, calendario, cupos e historial. */
export default function AgendaPanel(){
 const [config,setConfig]=useState<AgendaConfig|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[tab,setTab]=useState<Tab>('calendario'),[version,setVersion]=useState(0);
 const [mode,setMode]=useState<AgendaMode>('presencial'),[site,setSite]=useState('');
 useEffect(()=>{
  let live=true;
  void (async()=>{const {data,error:re}=await supabase.rpc('agenda_config');if(!live)return;if(re){setError(re.message);return;}const c=data as AgendaConfig;setConfig(c);setSite(s=>s||(c.mi_sede&&c.sedes.some(x=>x.id===c.mi_sede)?c.mi_sede:c.sedes[0]?.id)||'');})();
  return()=>{live=false;};
 },[version]);
 const done=(m:string)=>{setNotice(m);setError('');setVersion(v=>v+1);};
 if(!config)return error?<p role="alert" className={styles.error}>{error}</p>:<p className={styles.empty}>Cargando agenda…</p>;
 return <>
  <div className={styles.tabs} role="tablist">{TABS.map(([k,l])=><button key={k} role="tab" aria-selected={tab===k} className={`${styles.tab} ${tab===k?styles.tabActive:''}`} onClick={()=>{setTab(k);setNotice('');setError('');}}>{l}</button>)}</div>
  {!config.puede_excepciones&&<p className={styles.notice}>Solo consulta: el Propietario, las administradoras de tienda y los franquiciados pueden cambiar la agenda de su sede.</p>}
  {notice&&<p role="status" className={styles.notice}>{notice}</p>}
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {tab!=='historial'&&<div className={styles.toolbar} style={{marginBottom:16}}>
   <label>Sede<select value={site} onChange={e=>setSite(e.target.value)}>{config.sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}{config.propietario||config.sedes_editables.includes(s.id)?'':' (solo consulta)'}</option>)}</select></label>
   {tab!=='estado'&&<label>Modalidad<select value={mode} onChange={e=>setMode(e.target.value as AgendaMode)}>{MODES.map(m=><option key={m} value={m}>{modeName(m)}</option>)}</select></label>}
   <span className={styles.help}>Cada sede tiene su propia agenda presencial y virtual.</span>
  </div>}
  {tab==='estado'&&<StatusTab key={site+version} config={config} site={site} onDone={done} onError={setError}/>}
  {tab==='horario'&&<BaseTab key={site+mode+version} config={config} site={site} mode={mode} onDone={done} onError={setError}/>}
  {tab==='calendario'&&<CalendarTab config={config} mode={mode} site={site} version={version} onDone={done} onError={setError}/>}
  {tab==='cupos'&&<RuleForm key={'cupos'+mode} config={config} mode={mode} site={site} initial={{accion:'HABILITAR',cupo:2}} title="Cambiar cupo por hora (1, 2 o 3)" onDone={done}/>}
  {tab==='historial'&&<HistoryTab/>}
 </>;
}

const canEditSite=(config:AgendaConfig,site:string)=>config.propietario||config.sedes_editables.includes(site);
function StatusTab({config,site,onDone,onError}:{config:AgendaConfig;site:string;onDone:(m:string)=>void;onError:(m:string)=>void}){
 const siteName=config.sedes.find(s=>s.id===site)?.nombre||'';
 const rows=config.sede_modalidad.filter(r=>r.sede_id===site);
 const saveSite=(m:string)=>async(activa:boolean,motivo:string,reapertura:string|null)=>supabase.rpc('agenda_guardar_estado_sede',{p_sede:site,p_modalidad:m,p_activa:activa,p_motivo:motivo,p_reapertura:reapertura});
 const saveAll=(m:string)=>async(activa:boolean,motivo:string,reapertura:string|null)=>supabase.rpc('agenda_guardar_modalidad',{p_modalidad:m,p_activa:activa,p_motivo:motivo,p_reapertura:reapertura});
 return <>
  <div className={styles.grid2}>{rows.map(r=><ModeCard key={r.modalidad+r.actualizado_en} title={`${modeName(r.modalidad)} · ${siteName}`} row={r} canEdit={canEditSite(config,site)} onSave={saveSite(r.modalidad)} lockedMsg="Solo el Propietario o quien administra esta sede puede abrirla o cerrarla." onDone={onDone} onError={onError}/>)}</div>
  {config.propietario&&<><h3 style={{fontWeight:900,margin:'18px 0 8px'}}>Todas las sedes (solo Propietario)</h3><p className={styles.help} style={{marginBottom:8}}>Cierra la modalidad en las 4 sedes a la vez, por encima del estado de cada sede.</p>
   <div className={styles.grid2}>{config.modalidades.map(m=><ModeCard key={m.modalidad+m.actualizado_en} title={`${modeName(m.modalidad)} · todas las sedes`} row={m} canEdit onSave={saveAll(m.modalidad)} lockedMsg="" onDone={onDone} onError={onError}/>)}</div></>}
 </>;
}
type SaveFn=(activa:boolean,motivo:string,reapertura:string|null)=>PromiseLike<{error:{message:string}|null}>;
function ModeCard({title,row,canEdit,onSave,lockedMsg,onDone,onError}:{title:string;row:Pick<AgendaModeRow,'modalidad'|'bloqueada'|'motivo_bloqueo'|'reapertura_programada'|'actualizado_por_nombre'|'actualizado_en'>;canEdit:boolean;onSave:SaveFn;lockedMsg:string;onDone:(m:string)=>void;onError:(m:string)=>void}){
 const [activa,setActiva]=useState(!row.bloqueada),[motivo,setMotivo]=useState(row.motivo_bloqueo),[reapertura,setReapertura]=useState(''),[saving,setSaving]=useState(false);
 const save=async()=>{
  if(!activa&&motivo.trim().length<3){onError('Escribe el motivo del bloqueo.');return;}
  setSaving(true);
  const {error}=await onSave(activa,motivo,!activa&&reapertura?new Date(`${reapertura}:00-05:00`).toISOString():null);
  setSaving(false);if(error)onError(error.message);else onDone(`${title}: ${activa?'activa':'bloqueada'}.`);
 };
 return <section className={styles.card}><h2>{title}</h2>
  <p><span className={`${styles.badge} ${row.bloqueada?styles.badgeOut:styles.badgeIn}`}>{row.bloqueada?'Bloqueada':'Activa'}</span>{row.bloqueada&&row.motivo_bloqueo&&` · ${row.motivo_bloqueo}`}{row.reapertura_programada&&row.bloqueada&&` · Reabre el ${new Date(row.reapertura_programada).toLocaleString('es-CO',{timeZone:'America/Bogota'})}`}</p>
  {row.actualizado_por_nombre&&<p className={styles.help}>Último cambio: {row.actualizado_por_nombre} · {new Date(row.actualizado_en).toLocaleString('es-CO',{timeZone:'America/Bogota'})}</p>}
  {canEdit?<div className={styles.form}><fieldset disabled={saving} style={{border:0,padding:0,margin:0,display:'grid',gap:12}}>
   <label>Estado<select value={activa?'si':'no'} onChange={e=>setActiva(e.target.value==='si')}><option value="si">Activa</option><option value="no">Bloqueada</option></select></label>
   {!activa&&<><label>Motivo (obligatorio)<input maxLength={300} value={motivo} onChange={e=>setMotivo(e.target.value)} placeholder="Ej.: capacitación del personal"/></label>
    <label>Reapertura automática (opcional)<input type="datetime-local" value={reapertura} onChange={e=>setReapertura(e.target.value)}/></label></>}
   <span className={styles.help}>Bloquear no cancela las citas ya agendadas; se gestionan desde Primeras visitas.</span>
   <button className={`${styles.button} ${styles.primary}`} onClick={()=>void save()}>{saving?'Guardando…':'Guardar'}</button>
  </fieldset></div>:<p className={styles.help}>{lockedMsg}</p>}
 </section>;
}

function BaseTab({config,site,mode,onDone,onError}:{config:AgendaConfig;site:string;mode:AgendaMode;onDone:(m:string)=>void;onError:(m:string)=>void}){
 const initial=useMemo(()=>[1,2,3,4,5,6,7].map(d=>config.horario.find(h=>h.sede_id===site&&h.modalidad===mode&&h.dia_semana===d)||{sede_id:site,modalidad:mode,dia_semana:d,hora_inicio:'09:00',hora_fin:'19:00',cupo_defecto:1,activo:false}),[config,site,mode]);
 const [rows,setRows]=useState<AgendaBase[]>(initial),[cupo,setCupo]=useState(config.sede_modalidad.find(m=>m.sede_id===site&&m.modalidad===mode)?.cupo_defecto||1),[festivos,setFestivos]=useState(config.sede_modalidad.find(m=>m.sede_id===site&&m.modalidad===mode)?.cerrar_lunes_festivos??true),[motivo,setMotivo]=useState(''),[saving,setSaving]=useState(false);
 const siteName=config.sedes.find(s=>s.id===site)?.nombre||'',can=canEditSite(config,site),set=(i:number,patch:Partial<AgendaBase>)=>setRows(r=>r.map((x,j)=>j===i?{...x,...patch}:x));
 const save=async()=>{
  if(rows.some(r=>r.activo&&hhmm(r.hora_fin)<=hhmm(r.hora_inicio))){onError('La hora final de cada día debe ser posterior a la inicial.');return;}
  setSaving(true);
  const {error}=await supabase.rpc('agenda_guardar_horario_sede',{p_sede:site,p_modalidad:mode,p_cupo_defecto:cupo,p_cerrar_festivos:festivos,p_motivo:motivo,p_dias:rows.map(r=>({dia_semana:r.dia_semana,hora_inicio:hhmm(r.hora_inicio),hora_fin:hhmm(r.hora_fin),cupo_defecto:r.cupo_defecto,activo:r.activo}))});
  setSaving(false);if(error)onError(error.message);else onDone(`Horario base ${modeName(mode).toLowerCase()} de ${siteName} guardado.`);
 };
 return <section className={styles.card}><h2>Horario base · {modeName(mode)} · {siteName}</h2><p>Plantilla semanal de esta sede: citas de 60 minutos. La última cita empieza una hora antes de la hora de cierre.</p>
  <fieldset disabled={!can||saving} style={{border:0,padding:0,margin:0}}>
  <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Día</th><th>Atiende</th><th>Desde</th><th>Hasta</th><th>Cupo por hora</th><th>Horas</th></tr></thead>
   <tbody>{rows.map((r,i)=><tr key={r.dia_semana}><td><strong>{WEEKDAYS[r.dia_semana-1]}</strong></td>
    <td><input type="checkbox" checked={r.activo} onChange={e=>set(i,{activo:e.target.checked})} aria-label={`Atiende ${WEEKDAYS[r.dia_semana-1]}`}/></td>
    <td><select value={hhmm(r.hora_inicio)} onChange={e=>set(i,{hora_inicio:e.target.value})}>{HOURS.slice(0,-1).map(h=><option key={h}>{h}</option>)}</select></td>
    <td><select value={hhmm(r.hora_fin)} onChange={e=>set(i,{hora_fin:e.target.value})}>{HOURS.slice(1).map(h=><option key={h}>{h}</option>)}</select></td>
    <td><select value={r.cupo_defecto} onChange={e=>set(i,{cupo_defecto:Number(e.target.value)})}>{CUPOS.map(c=><option key={c} value={c}>{c}</option>)}</select></td>
    <td>{r.activo?`${Math.max(0,Number(hhmm(r.hora_fin).slice(0,2))-Number(hhmm(r.hora_inicio).slice(0,2)))} citas`:'Cerrado'}</td></tr>)}</tbody></table></div>
  <div className={styles.form} style={{marginTop:12}}>
   <div className={styles.row}><label>Cupo por defecto de la agenda {modeName(mode).toLowerCase()}<select value={cupo} onChange={e=>setCupo(Number(e.target.value))}>{CUPOS.map(c=><option key={c} value={c}>{c} cliente{c>1?'s':''} por hora</option>)}</select><span className={styles.help}>Se usa en los días habilitados por excepción sin cupo propio.</span></label>
    <label>Motivo del cambio<input maxLength={300} value={motivo} onChange={e=>setMotivo(e.target.value)}/></label></div>
   <label className={styles.check}><input type="checkbox" checked={festivos} onChange={e=>setFestivos(e.target.checked)}/> Cerrar los lunes festivos en esta sede</label>
   {can?<button className={`${styles.button} ${styles.primary}`} onClick={()=>void save()}>{saving?'Guardando…':'Guardar horario base'}</button>:<p className={styles.help}>Solo el Propietario o quien administra esta sede puede editar su horario.</p>}
  </div></fieldset>
 </section>;
}

function Legend(){
 return <div style={{display:'flex',flexWrap:'wrap',gap:8,margin:'8px 0 12px'}}>{(['libre','parcial','lleno','bloqueado','excepcion'] as const).map(k=><span key={k} className={styles.badge} style={{background:DAY_COLORS[k].bg,color:DAY_COLORS[k].fg}}>{DAY_COLORS[k].label}</span>)}</div>;
}

function CalendarTab({config,mode,site,version,onDone,onError}:{config:AgendaConfig;mode:AgendaMode;site:string;version:number;onDone:(m:string)=>void;onError:(m:string)=>void}){
 const t=today();
 const [month,setMonth]=useState({y:Number(t.slice(0,4)),m:Number(t.slice(5,7))-1}),[slots,setSlots]=useState<{key:string;rows:AgendaSlot[]}>({key:'',rows:[]}),[day,setDay]=useState(''),[range,setRange]=useState<{accion:'BLOQUEAR'|'HABILITAR';hora_inicio?:string;hora_fin?:string;fecha_inicio:string}|null>(null),[pick,setPick]=useState<string[]>([]);
 const days=monthDays(month.y,month.m),desde=days.find(Boolean)!,hasta=days[days.length-1]!;
 const key=`${mode}:${site}:${desde}:${version}`;
 const load=useCallback(async()=>{
  const {data,error}=await supabase.rpc('agenda_calendario',{p_modalidad:mode,p_sede:site,p_desde:desde,p_hasta:hasta});
  if(error)onError(error.message);else setSlots({key,rows:(data||[]) as AgendaSlot[]});
 },[mode,site,desde,hasta,key,onError]);
 useEffect(()=>{if(!site)return;let live=true;void (async()=>{if(live)await load();})();return()=>{live=false;};},[load,mode,site]);
 const byDay=useMemo(()=>groupByDay(slots.rows),[slots.rows]),loading=slots.key!==key;
 const shift=(n:number)=>setMonth(({y,m})=>({y:y+Math.floor((m+n)/12),m:((m+n)%12+12)%12}));
 const title=new Date(Date.UTC(month.y,month.m,1)).toLocaleDateString('es-CO',{month:'long',year:'numeric',timeZone:'UTC'});
 const undo=async()=>{if(!window.confirm('¿Quitar la última regla que creaste?'))return;const {data,error}=await supabase.rpc('agenda_deshacer');if(error)onError(error.message);else onDone(`Deshecho${(data as {sede?:string}).sede?` (${(data as {sede?:string}).sede})`:''}: ${exceptionLabel(data as never)}.`);};
 const daySlots=day?(byDay.get(day)||[]):[];
 const togglePick=(h:string)=>setPick(p=>p.includes(h)?p.filter(x=>x!==h):[...p,h].sort());
 const pickRange=()=>{if(!pick.length)return null;const end=`${String(Number(pick[pick.length-1].slice(0,2))+1).padStart(2,'0')}:00`;return {hora_inicio:pick[0],hora_fin:end};};
 const can=canEditSite(config,site);
 return <>
  <section className={styles.card}>
   <div className={styles.toolbar} style={{justifyContent:'space-between'}}>
    <div style={{display:'flex',gap:8,alignItems:'center'}}><button className={styles.button} onClick={()=>shift(-1)} aria-label="Mes anterior">‹</button><strong style={{textTransform:'capitalize',minWidth:150,textAlign:'center'}}>{title}</strong><button className={styles.button} onClick={()=>shift(1)} aria-label="Mes siguiente">›</button>
     <button className={styles.button} onClick={()=>void load()} disabled={loading}><RefreshCw size={13} style={{display:'inline'}}/> {loading?'Cargando…':'Actualizar'}</button></div>
    {can&&<div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button className={`${styles.button} ${styles.danger}`} onClick={()=>{setDay('');setRange({accion:'BLOQUEAR',fecha_inicio:t});}}>Bloquear rango</button><button className={styles.button} onClick={()=>{setDay('');setRange({accion:'HABILITAR',fecha_inicio:t});}}>Habilitar rango</button><button className={styles.button} onClick={()=>void undo()}><Undo2 size={13} style={{display:'inline'}}/> Deshacer último cambio</button></div>}
   </div>
   <Legend/>
   <div style={{display:'grid',gridTemplateColumns:'repeat(7,minmax(0,1fr))',gap:6}}>
    {WEEKDAYS_SHORT.map(w=><span key={w} style={{textAlign:'center',fontSize:11,fontWeight:800,color:'#64748b'}}>{w}</span>)}
    {days.map((d,i)=>{if(!d)return <span key={'e'+i}/>;const list=byDay.get(d)||[],st=d<t?'pasado':dayState(list),c=DAY_COLORS[st];
     const open=list.filter(s=>s.habilitado&&!s.pasado),free=open.reduce((a,s)=>a+s.libres,0),cap=open.reduce((a,s)=>a+s.cupo,0);
     const reason=list.find(s=>!s.habilitado&&s.motivo)?.motivo;
     return <button key={d} onClick={()=>{setDay(d);setPick([]);setRange(null);}} title={`${c.label}${reason?` · ${reason}`:''}`}
      style={{background:c.bg,color:c.fg,border:day===d?'2px solid #e11d48':'1px solid #e2e8f0',borderRadius:10,padding:'6px 4px',minHeight:58,textAlign:'left',cursor:'pointer'}}>
      <strong style={{fontSize:13}}>{Number(d.slice(8))}</strong>{open.length>0&&<small style={{display:'block',fontSize:10}}>{cap-free}/{cap} reservas</small>}{st==='bloqueado'&&<small style={{display:'block',fontSize:10}}>Bloqueado</small>}
     </button>;})}
   </div>
  </section>
  {day&&<section className={styles.card}><h2 style={{textTransform:'capitalize'}}>{fmtDate(day)}</h2>
   {!daySlots.length&&<p className={styles.empty}>Sin horario este día.</p>}
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))',gap:8}}>
    {daySlots.map(s=>{const st=slotState(s),c=DAY_COLORS[st],sel=pick.includes(s.hora);
     return <button key={s.hora} disabled={s.pasado||!can} onClick={()=>togglePick(s.hora)} title={s.motivo||c.label}
      style={{background:c.bg,color:c.fg,border:sel?'2px solid #e11d48':'1px solid #e2e8f0',borderRadius:10,padding:8,textAlign:'left',cursor:can&&!s.pasado?'pointer':'default'}}>
      <strong>{s.hora}</strong><small style={{display:'block'}}>{s.habilitado?`${s.reservadas}/${s.cupo} reservas`:s.motivo||'Bloqueado'}</small>{s.origen==='excepcion'&&<small style={{display:'block'}}>Por excepción</small>}
     </button>;})}
   </div>
   {can&&<div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}>
    <span className={styles.help}>{pick.length?`Seleccionadas: ${pick.join(', ')}`:'Toca las horas para seleccionarlas, o actúa sobre todo el día.'}</span>
    <button className={`${styles.button} ${styles.danger}`} onClick={()=>setRange({accion:'BLOQUEAR',fecha_inicio:day,...(pickRange()||{})})}>{pick.length?'Bloquear franja':'Bloquear día'}</button>
    <button className={styles.button} onClick={()=>setRange({accion:'HABILITAR',fecha_inicio:day,...(pickRange()||{})})}>{pick.length?'Habilitar franja / cambiar cupo':'Habilitar día / cambiar cupo'}</button>
    <span className={styles.help}>Una franja usa desde la primera hasta la última hora seleccionada.</span>
   </div>}
  </section>}
  {range&&<RuleForm key={JSON.stringify(range)} config={config} mode={mode} site={site} initial={range} title={range.accion==='BLOQUEAR'?'Bloquear':'Habilitar o cambiar cupo'} onDone={m=>{setRange(null);setPick([]);onDone(m);}} onCancel={()=>setRange(null)}/>}
  <ActiveRules config={config} mode={mode} site={site} onDone={onDone} onError={onError}/>
 </>;
}

type RuleInitial={accion:'BLOQUEAR'|'HABILITAR';fecha_inicio?:string;hora_inicio?:string;hora_fin?:string;cupo?:number};
function RuleForm({config,mode,site,initial,title,onDone,onCancel}:{config:AgendaConfig;mode:AgendaMode;site:string;initial:RuleInitial;title:string;onDone:(m:string)=>void;onCancel?:()=>void}){
 const t=today();
 const [accion,setAccion]=useState(initial.accion),[modes,setModes]=useState<'actual'|'ambas'>('actual'),[sede,setSede]=useState(canEditSite(config,site)?site:(config.sedes_editables[0]||'')),[alcance,setAlcance]=useState<'dia'|'rango'|'recurrente'>('dia');
 const [desde,setDesde]=useState(initial.fecha_inicio||t),[hasta,setHasta]=useState(''),[dias,setDias]=useState<number[]>([]),[franja,setFranja]=useState(!!initial.hora_inicio),[hi,setHi]=useState(initial.hora_inicio||'12:00'),[hf,setHf]=useState(initial.hora_fin||'14:00');
 const [cupo,setCupo]=useState<string>(initial.cupo?String(initial.cupo):''),[motivo,setMotivo]=useState(''),[citas,setCitas]=useState<'mantener'|'cancelar'>('mantener');
 const [preview,setPreview]=useState<{key:string;data:Record<AgendaMode,AgendaPreview>}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const targets:AgendaMode[]=modes==='ambas'?['presencial','virtual']:[mode];
 const payload=(m:AgendaMode)=>({modalidad:m,sede_id:sede||null,fecha_inicio:desde,fecha_fin:alcance==='dia'?null:hasta||null,dias_semana:alcance==='recurrente'?dias:null,
  hora_inicio:franja?hi:null,hora_fin:franja?hf:null,accion,cupo:accion==='HABILITAR'&&cupo?Number(cupo):null,motivo,citas});
 const key=JSON.stringify(targets.map(payload));
 const check=()=>validateRule({accion,fecha_inicio:desde,fecha_fin:alcance==='dia'?undefined:hasta,hora_inicio:franja?hi:undefined,hora_fin:franja?hf:undefined,cupo:accion==='HABILITAR'&&cupo?Number(cupo):null,motivo,alcance,dias_semana:dias},t)
  ||(alcance==='rango'&&!hasta?'Elige la fecha final.':null);
 const runPreview=async()=>{
  const bad=check();if(bad){setError(bad);return;}
  setBusy(true);setError('');
  try{const out={} as Record<AgendaMode,AgendaPreview>;for(const m of targets){const {data,error:re}=await supabase.rpc('agenda_vista_previa',{p_datos:payload(m)});if(re)throw re;out[m]=data as AgendaPreview;}setPreview({key,data:out});}
  catch(e){setError(errorText(e,'No se pudo calcular la vista previa.'));}finally{setBusy(false);}
 };
 const save=async()=>{
  if(preview?.key!==key){await runPreview();return;}
  setBusy(true);setError('');
  try{let canceled=0;for(const m of targets){const {data,error:re}=await supabase.rpc('agenda_crear_excepcion',{p_datos:payload(m)});if(re)throw re;canceled+=Number((data as {citas_canceladas?:number})?.citas_canceladas||0);}
   onDone(`Agenda actualizada.${canceled?` ${canceled} cita(s) cancelada(s) con aviso al cliente.`:''}`);}
  catch(e){setError(errorText(e,'No se pudo guardar.'));}finally{setBusy(false);}
 };
 const shown=preview?.key===key?preview.data:null,affected=shown?Object.values(shown).flatMap(p=>p.citas):[];
 if(!config.puede_excepciones)return <section className={styles.card}><h2>{title}</h2><p className={styles.help}>Solo el Propietario, las administradoras de tienda y los franquiciados pueden cambiar la agenda de su sede.</p></section>;
 return <section className={styles.card}><h2>{title}</h2>
  <div className={styles.form}><fieldset disabled={busy} style={{border:0,padding:0,margin:0,display:'grid',gap:12}}>
   <div className={styles.row}>
    <label>Acción<select value={accion} onChange={e=>setAccion(e.target.value as 'BLOQUEAR'|'HABILITAR')}><option value="BLOQUEAR">Bloquear</option><option value="HABILITAR">Habilitar / cambiar cupo</option></select></label>
    <label>Aplica a<select value={modes} onChange={e=>setModes(e.target.value as 'actual'|'ambas')}><option value="actual">Solo {modeName(mode).toLowerCase()}</option><option value="ambas">Virtual y presencial</option></select></label>
   </div>
   <label>Sede<select value={sede} onChange={e=>setSede(e.target.value)}>{config.propietario&&<option value="">Todas las sedes</option>}{config.sedes.filter(x=>canEditSite(config,x.id)).map(x=><option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>
   <div className={styles.row}>
    <label>Alcance<select value={alcance} onChange={e=>setAlcance(e.target.value as 'dia'|'rango'|'recurrente')}><option value="dia">Un día</option><option value="rango">Rango de fechas</option><option value="recurrente">Días que se repiten</option></select></label>
    <label>{alcance==='dia'?'Fecha':'Desde'}<input type="date" min={t} value={desde} onChange={e=>setDesde(e.target.value)}/></label>
    {alcance!=='dia'&&<label>{alcance==='rango'?'Hasta':'Hasta (opcional)'}<input type="date" min={desde} value={hasta} onChange={e=>setHasta(e.target.value)}/></label>}
   </div>
   {alcance==='recurrente'&&<div><span className={styles.help}>Repetir cada:</span><div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:6}}>{WEEKDAYS.map((w,i)=><label key={w} className={styles.check}><input type="checkbox" checked={dias.includes(i+1)} onChange={e=>setDias(d=>e.target.checked?[...d,i+1].sort():d.filter(x=>x!==i+1))}/> {w}</label>)}</div></div>}
   <label className={styles.check}><input type="checkbox" checked={franja} onChange={e=>setFranja(e.target.checked)}/> Solo una franja de horas (si no, todo el día)</label>
   {franja&&<div className={styles.row}><label>Desde la hora<select value={hi} onChange={e=>setHi(e.target.value)}>{HOURS.slice(0,-1).map(h=><option key={h}>{h}</option>)}</select></label><label>Hasta la hora<select value={hf} onChange={e=>setHf(e.target.value)}>{HOURS.slice(1).map(h=><option key={h}>{h}</option>)}</select></label></div>}
   {accion==='HABILITAR'&&<label>Cupo por hora<select value={cupo} onChange={e=>setCupo(e.target.value)}><option value="">El del horario base</option>{CUPOS.map(c=><option key={c} value={c}>{c} cliente{c>1?'s':''}</option>)}</select></label>}
   <label>Motivo{accion==='BLOQUEAR'?' (obligatorio)':''}<input maxLength={300} value={motivo} onChange={e=>setMotivo(e.target.value)} placeholder={accion==='BLOQUEAR'?'Ej.: festivo, vacaciones, capacitación':'Ej.: jornada especial'}/></label>
   {accion==='BLOQUEAR'&&<label>Citas ya agendadas en esas horas<select value={citas} onChange={e=>setCitas(e.target.value as 'mantener'|'cancelar')}><option value="mantener">Mantenerlas (se atienden igual o se reprograman desde Primeras visitas)</option><option value="cancelar">Cancelarlas y avisar al cliente por correo</option></select></label>}
   {shown&&<div className={`${styles.banner} ${styles.open}`} style={{display:'block'}}>
    <strong>Vista previa:</strong> {Object.entries(shown).map(([m,p])=>`${modeName(m)}: ${p.slots_bloqueados} hora(s) se bloquean, ${p.slots_habilitados} se habilitan, ${p.cupo_cambia} cambian de cupo`).join(' · ')}.
    {affected.length>0?<><br/><strong>{affected.length} cita(s) agendada(s) afectada(s):</strong><ul style={{margin:'6px 0 0 18px'}}>{affected.slice(0,20).map(c=><li key={c.id}>{c.fecha} {c.hora} · {c.cliente} · {c.telefono}{c.sede?` · ${c.sede}`:''}</li>)}</ul>{affected.length>20&&<span className={styles.help}>…y {affected.length-20} más.</span>}</>:<><br/>No hay citas agendadas afectadas.</>}
   </div>}
   {error&&<p role="alert" className={styles.error}>{error}</p>}
   <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
    <button className={styles.button} onClick={()=>void runPreview()}>Vista previa</button>
    <button className={`${styles.button} ${styles.primary}`} onClick={()=>void save()}>{busy?'Guardando…':shown?'Confirmar y guardar':'Revisar y guardar'}</button>
    {onCancel&&<button className={styles.button} onClick={onCancel}>Cancelar</button>}
   </div>
  </fieldset></div>
 </section>;
}

function ActiveRules({config,mode,site,onDone,onError}:{config:AgendaConfig;mode:AgendaMode;site:string;onDone:(m:string)=>void;onError:(m:string)=>void}){
 const rules=config.excepciones.filter(x=>x.modalidad===mode&&(!x.sede_id||x.sede_id===site));
 const siteName=config.sedes.find(s=>s.id===site)?.nombre||'';
 const remove=async(id:string)=>{const motivo=window.prompt('Motivo para quitar esta regla');if(motivo===null)return;const {error}=await supabase.rpc('agenda_anular_excepcion',{p_id:id,p_motivo:motivo});if(error)onError(error.message);else onDone('Regla quitada.');};
 return <section className={styles.card}><h2>Reglas activas · {modeName(mode)} · {siteName}</h2><p>Bloqueos, habilitaciones y cambios de cupo vigentes. La regla más específica manda (hora › franja › día › rango › recurrente); entre iguales, la más reciente.</p>
  <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Regla</th><th>Sede</th><th>Motivo</th><th>Creó</th>{config.puede_excepciones&&<th></th>}</tr></thead>
   <tbody>{rules.map(x=><tr key={x.id}><td><span className={`${styles.badge} ${x.accion==='BLOQUEAR'?styles.badgeOut:styles.badgeIn}`}>{x.accion==='BLOQUEAR'?'Bloqueo':'Habilita'}</span> {exceptionLabel(x)}</td><td>{x.sede||'Todas las sedes'}</td><td>{x.motivo||'—'}</td>
    <td>{x.creado_por_nombre||'—'}<small>{new Date(x.creado_en).toLocaleString('es-CO',{timeZone:'America/Bogota'})}</small></td>
    {config.puede_excepciones&&<td>{x.editable&&<button className={`${styles.button} ${styles.danger}`} onClick={()=>void remove(x.id)}>Quitar</button>}</td>}</tr>)}</tbody></table></div>
  {!rules.length&&<p className={styles.empty}>No hay reglas activas: rige el horario base.</p>}
 </section>;
}

function HistoryTab(){
 const t=today();
 const [desde,setDesde]=useState(addDays(t,-30)),[hasta,setHasta]=useState(t),[user,setUser]=useState(''),[mod,setMod]=useState(''),[sede,setSede]=useState(''),[rows,setRows]=useState<{key:string;data:AgendaAudit[]}>({key:'',data:[]}),[error,setError]=useState('');
 const key=`${desde}:${hasta}`;
 useEffect(()=>{let live=true;void (async()=>{const {data,error:re}=await supabase.rpc('agenda_historial',{p_desde:desde,p_hasta:hasta});if(!live)return;if(re)setError(re.message);else{setError('');setRows({key:`${desde}:${hasta}`,data:(data||[]) as AgendaAudit[]});}})();return()=>{live=false;};},[desde,hasta]);
 const modOf=(r:AgendaAudit)=>String(r.valor_nuevo?.modalidad||r.valor_anterior?.modalidad||(r.tabla==='agenda_excepcion'?'':r.registro_id)||'');
 const list=rows.data.filter(r=>(!user||r.usuario===user)&&(!mod||modOf(r)===mod)&&(!sede||r.sede===sede));
 const sedes=[...new Set(rows.data.map(r=>r.sede).filter(Boolean))] as string[];
 const users=[...new Set(rows.data.map(r=>r.usuario).filter(Boolean))] as string[];
 const download=()=>{const url=URL.createObjectURL(new Blob([auditCsv(list)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`historial-agenda-${desde}-a-${hasta}.csv`;a.click();URL.revokeObjectURL(url);};
 const describe=(r:AgendaAudit)=>r.tabla==='agenda_excepcion'?exceptionLabel((r.valor_nuevo||r.valor_anterior) as never):(r.tabla==='agenda_modalidad'||r.tabla==='agenda_sede_modalidad')?`Agenda ${modeName(String(r.registro_id))}: ${String(r.valor_anterior?.estado||'')} → ${String(r.valor_nuevo?.estado||'')}`:`Horario base ${modeName(String(r.registro_id))}`;
 return <section className={styles.card}><h2>Historial de cambios</h2><p>Quién cambió qué, cuándo, el valor anterior y el nuevo. No se puede editar ni borrar.</p>
  <div className={styles.toolbar} style={{marginBottom:12}}>
   <label>Desde<input type="date" value={desde} max={hasta} onChange={e=>e.target.value&&setDesde(e.target.value)}/></label>
   <label>Hasta<input type="date" value={hasta} max={t} onChange={e=>e.target.value&&setHasta(e.target.value)}/></label>
   <label>Usuario<select value={user} onChange={e=>setUser(e.target.value)}><option value="">Todos</option>{users.map(u=><option key={u}>{u}</option>)}</select></label>
   <label>Modalidad<select value={mod} onChange={e=>setMod(e.target.value)}><option value="">Todas</option>{MODES.map(m=><option key={m} value={m}>{modeName(m)}</option>)}</select></label>
   <label>Sede<select value={sede} onChange={e=>setSede(e.target.value)}><option value="">Todas</option>{sedes.map(x=><option key={x}>{x}</option>)}</select></label>
   <button className={styles.button} disabled={!list.length} onClick={download}>Exportar a Excel</button>
  </div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Fecha</th><th>Sede</th><th>Usuario</th><th>Acción</th><th>Cambio</th><th>Motivo</th></tr></thead>
   <tbody>{list.map(r=><tr key={r.id}><td>{new Date(r.fecha).toLocaleString('es-CO',{timeZone:'America/Bogota'})}</td><td>{r.sede||'Todas las sedes'}</td><td>{r.usuario||'—'}</td><td>{r.accion}</td><td>{describe(r)}</td><td>{r.motivo||'—'}</td></tr>)}</tbody></table></div>
  {!list.length&&<p className={styles.empty}>{rows.key!==key?'Cargando…':'Sin cambios en este periodo.'}</p>}
 </section>;
}
