'use client';
import {useCallback,useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {AUTH_REQUEST_ID,FUNNEL_STAGES,MAIL_PLACEHOLDERS,MAIL_TRIGGER} from '@/lib/email-marketing';
import styles from '@/app/dashboard/caja/caja.module.css';

type Sede={id:string;nombre:string};
type Auto={id:string;nombre:string;disparador:string;activo:boolean;asunto:string;cuerpo:string;momento_horas:number;sede_ids:string[]|null;orden:number};
type Rules={max_semana:number;max_dia:number;hora_desde:number;hora_hasta:number;sin_domingos_festivos:boolean;cupo_diario:number;ventana_dias:number};
const box={border:'1px solid #eee',borderRadius:14,padding:12,display:'grid',gap:8} as const;
const toggle=<T,>(list:T[],v:T)=>list.includes(v)?list.filter(x=>x!==v):[...list,v];
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota'}).format(new Date());

function useSedes(){const [s,set]=useState<Sede[]>([]);useEffect(()=>{void supabase.from('sedes').select('id,nombre').eq('activo',true).order('nombre').then(({data})=>set(data||[]));},[]);return s;}
const Help=()=><p style={{fontSize:12,color:'#666'}}>Puedes usar: {MAIL_PLACEHOLDERS.join(' ')}. Al final de cada correo se agrega siempre el enlace para dejar de recibirlos.</p>;

/** Automations: switch, text, timing and sedes (admin edits; the 10-minute clock sends them). */
export function MailAutomations({canEdit}:{canEdit:boolean}){
 const sedes=useSedes();
 const [rows,setRows]=useState<Auto[]>([]),[edit,setEdit]=useState<Auto|null>(null),[msg,setMsg]=useState('');
 const load=useCallback(()=>supabase.from('correo_automatizaciones').select('*').order('orden').then(({data})=>setRows((data||[]) as Auto[])),[]);
 useEffect(()=>{void load();},[load]);
 const save=async(a:Auto)=>{setMsg('');
  const {error}=await supabase.from('correo_automatizaciones').update({activo:a.activo,asunto:a.asunto.trim(),cuerpo:a.cuerpo.trim(),momento_horas:Math.max(0,Math.round(a.momento_horas)),sede_ids:a.sede_ids?.length?a.sede_ids:null,updated_at:new Date().toISOString()}).eq('id',a.id);
  if(error){setMsg('No se pudo guardar: revisa el asunto y el texto.');return;}setEdit(null);setMsg('Automatización guardada.');void load();};
 return <div style={{display:'grid',gap:10}}>
  <p style={{fontSize:13,color:'#555'}}>Solo reciben quienes tienen autorización comercial vigente. Se detienen si la persona alquila, se da de baja o su seguimiento se cierra con «No contactar». Solo se envían citas de los últimos días (ver Reglas), nunca historial viejo.</p>
  {msg&&<p role="status" style={{fontWeight:700}}>{msg}</p>}
  {rows.map(a=>edit?.id===a.id?<fieldset key={a.id} style={box}>
   <b>{a.nombre}</b>
   {a.id===AUTH_REQUEST_ID?<p style={{fontSize:12}}>Se envía una sola vez desde Correo › Envíos. Usa {'{enlace_autorizacion}'} para el botón de autorizar; no incluyas promociones.</p>:<>
   <label><input type="checkbox" checked={edit.activo} onChange={e=>setEdit({...edit,activo:e.target.checked})}/> Encendida</label>
   <label>Momento: <input type="number" min={0} max={8760} value={edit.momento_horas} onChange={e=>setEdit({...edit,momento_horas:Number(e.target.value)})} style={{width:90}}/> {MAIL_TRIGGER[a.disparador]}</label></>}
   <p style={{fontSize:12}}><b>Sedes</b> (ninguna = todas): {sedes.map(s=><label key={s.id} style={{marginRight:10}}><input type="checkbox" checked={(edit.sede_ids||[]).includes(s.id)} onChange={()=>setEdit({...edit,sede_ids:toggle(edit.sede_ids||[],s.id)})}/> {s.nombre}</label>)}</p>
   <label>Asunto<input value={edit.asunto} maxLength={160} onChange={e=>setEdit({...edit,asunto:e.target.value})}/></label>
   <label>Texto<textarea rows={9} value={edit.cuerpo} maxLength={5000} onChange={e=>setEdit({...edit,cuerpo:e.target.value})}/></label>
   <Help/>
   <div className={styles.toolbar}><button type="button" onClick={()=>setEdit(null)}>Cancelar</button><button type="button" className={styles.primary} disabled={edit.asunto.trim().length<2||edit.cuerpo.trim().length<10} onClick={()=>void save(edit)}>Guardar</button></div>
  </fieldset>:<article key={a.id} style={{...box,opacity:a.activo?1:.6}}>
   <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}><b>{a.id===AUTH_REQUEST_ID?'':`${a.orden}. `}{a.nombre}</b>{a.id!==AUTH_REQUEST_ID&&<b style={{color:a.activo?'#047857':'#6b7280'}}>{a.activo?'Encendida':'Apagada'}</b>}</div>
   <span style={{fontSize:13}}>{a.id===AUTH_REQUEST_ID?'':a.momento_horas} {MAIL_TRIGGER[a.disparador]} · Sedes: {a.sede_ids?.length?a.sede_ids.map(id=>sedes.find(s=>s.id===id)?.nombre||'—').join(', '):'Todas'}</span>
   <span style={{fontSize:13}}><b>Asunto:</b> {a.asunto}</span>
   {canEdit&&<div className={styles.toolbar}><button type="button" onClick={()=>setEdit(a)}>Editar</button>{a.id!==AUTH_REQUEST_ID&&<button type="button" onClick={()=>void save({...a,activo:!a.activo})}>{a.activo?'Apagar':'Encender'}</button>}</div>}
  </article>)}
 </div>;
}

type Seg={sede:string;tipo:string;etapa:string;origen:string;promocion:string;evento_desde:string;evento_hasta:string;visita_desde:string;visita_hasta:string};
const EMPTY_SEG:Seg={sede:'',tipo:'',etapa:'',origen:'',promocion:'',evento_desde:'',evento_hasta:'',visita_desde:'',visita_hasta:''};

/** Manual sends by segment: count first, then send (the clock sends them respecting the rules and the daily quota). */
export function MailCampaigns({canEdit}:{canEdit:boolean}){
 const sedes=useSedes();
 const [seg,setSeg]=useState<Seg>(EMPTY_SEG),[f,setF]=useState({nombre:'',asunto:'',cuerpo:''}),[count,setCount]=useState<{total:number;excluidos:number}|null>(null);
 const [promos,setPromos]=useState<{id:string;nombre:string}[]>([]),[hist,setHist]=useState<{id:string;nombre:string;total:number;created_at:string}[]>([]),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false);
 const loadHist=useCallback(()=>supabase.from('correo_campanas').select('id,nombre,total,created_at').order('created_at',{ascending:false}).limit(20).then(({data})=>setHist(data||[])),[]);
 useEffect(()=>{void loadHist();void supabase.from('promociones').select('id,nombre').order('desde',{ascending:false}).then(({data})=>setPromos(data||[]));},[loadHist]);
 const calc=async()=>{setBusy(true);setMsg('');const {data,error}=await supabase.rpc('correo_segmento',{p_segmento:seg});setBusy(false);
  if(error){setMsg('No se pudo calcular el segmento.');return;}const list=(data||[]) as {excluido:boolean}[];setCount({total:list.length,excluidos:list.filter(x=>x.excluido).length});};
 const send=async()=>{if(!count||!window.confirm(`¿Enviar a ${count.total} personas? Saldrán poco a poco, dentro del horario y del cupo diario.`))return;
  setBusy(true);const {data,error}=await supabase.rpc('correo_crear_campana',{p_nombre:f.nombre,p_asunto:f.asunto,p_cuerpo:f.cuerpo,p_segmento:seg});setBusy(false);
  if(error){setMsg('No se pudo crear el envío: revisa nombre, asunto y texto.');return;}setMsg(`Envío creado para ${data?.total||0} personas.`);setCount(null);setF({nombre:'',asunto:'',cuerpo:''});void loadHist();};
 const set=(k:keyof Seg)=>(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement>)=>{setSeg({...seg,[k]:e.target.value});setCount(null);};
 return <div style={{display:'grid',gap:12}}>
  {canEdit&&<AuthRequest/>}
  {canEdit&&<fieldset disabled={busy} style={box}>
   <b>Segmento</b>
   <div className={styles.toolbar}>
    <label>Sede<select value={seg.sede} onChange={set('sede')}><option value="">Todas</option>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
    <label>Tipo de vestido<select value={seg.tipo} onChange={set('tipo')}><option value="">Todos</option>{['Quince','Gala','Novia','Grado','Otro'].map(t=><option key={t}>{t}</option>)}</select></label>
    <label>Etapa<select value={seg.etapa} onChange={set('etapa')}><option value="">Todas</option>{Object.entries(FUNNEL_STAGES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    <label>Origen (o=)<input value={seg.origen} onChange={set('origen')} placeholder="instagram"/></label>
    <label>Promoción<select value={seg.promocion} onChange={set('promocion')}><option value="">Cualquiera</option>{promos.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
    <label>Evento desde<input type="date" value={seg.evento_desde} onChange={set('evento_desde')}/></label>
    <label>Evento hasta<input type="date" value={seg.evento_hasta} onChange={set('evento_hasta')}/></label>
    <label>Última visita desde<input type="date" value={seg.visita_desde} onChange={set('visita_desde')}/></label>
    <label>Última visita hasta<input type="date" value={seg.visita_hasta} max={today()} onChange={set('visita_hasta')}/></label>
   </div>
   <div className={styles.toolbar}><button type="button" onClick={()=>void calc()}>Calcular destinatarios</button>
    {count&&<b>{count.total} personas con autorización comercial{count.excluidos?` · ${count.excluidos} esperarán por la regla de frecuencia`:''}</b>}</div>
   <label>Nombre del envío<input value={f.nombre} maxLength={120} onChange={e=>setF({...f,nombre:e.target.value})} placeholder="Promoción noviembre Gala"/></label>
   <label>Asunto<input value={f.asunto} maxLength={160} onChange={e=>setF({...f,asunto:e.target.value})}/></label>
   <label>Texto<textarea rows={8} value={f.cuerpo} maxLength={5000} onChange={e=>setF({...f,cuerpo:e.target.value})}/></label>
   <Help/>
   <div className={styles.toolbar}><button type="button" className={styles.primary} disabled={!count?.total||f.nombre.trim().length<2||f.asunto.trim().length<2||f.cuerpo.trim().length<10} onClick={()=>void send()}>Enviar</button></div>
  </fieldset>}
  {msg&&<p role="status" style={{fontWeight:700}}>{msg}</p>}
  <b>Envíos recientes</b>
  {hist.map(h=><p key={h.id} style={{fontSize:13}}>{new Date(h.created_at).toLocaleDateString('es-CO')} · <b>{h.nombre}</b> · {h.total} personas</p>)}
  {!hist.length&&<p className={styles.empty}>Aún no hay envíos manuales.</p>}
 </div>;
}

/** One-time request for commercial authorization to people who booked and did not attend, or attended and did not rent. */
function AuthRequest(){
 const [c,setC]=useState<{no_asistio:number;asistio:number;total:number}|null>(null),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false);
 const count=useCallback(()=>supabase.rpc('correo_solicitud_autorizacion',{p_enviar:false}).then(({data,error})=>{if(!error)setC(data);}),[]);
 useEffect(()=>{void count();},[count]);
 const send=async()=>{if(!c?.total||!window.confirm(`¿Enviar la solicitud de autorización a ${c.total} personas? Es un único correo por persona, sin publicidad.`))return;
  setBusy(true);const {data,error}=await supabase.rpc('correo_solicitud_autorizacion',{p_enviar:true});setBusy(false);
  setMsg(error?'No se pudo crear el envío.':`Solicitud en cola para ${data?.encolados||0} personas. Saldrá dentro del horario y del cupo diario.`);void count();};
 return <fieldset disabled={busy} style={{...box,background:'#fffbeb',borderColor:'#fde68a'}}>
  <b>Solicitud de autorización comercial (envío único)</b>
  <p style={{fontSize:13}}>Un solo correo, sin publicidad, con el enlace para autorizar novedades y promociones. Va a quienes agendaron y no asistieron, o asistieron y no alquilaron, y aún no han respondido. Nunca a quien alquiló o pidió no contactar. Quien autoriza entra a las automatizaciones; quien no, no vuelve a recibir publicidad. El texto se edita en Automatizaciones.</p>
  {c&&<p style={{fontSize:13}}><b>{c.total}</b> personas: {c.no_asistio} agendaron y no asistieron · {c.asistio} asistieron y no alquilaron</p>}
  <div className={styles.toolbar}><button type="button" className={styles.primary} disabled={!c?.total} onClick={()=>void send()}>Enviar solicitud</button></div>
  {msg&&<p role="status" style={{fontWeight:700}}>{msg}</p>}
 </fieldset>;
}

/** Frequency rules (one row). */
export function MailRules({canEdit}:{canEdit:boolean}){
 const [r,setR]=useState<Rules|null>(null),[msg,setMsg]=useState('');
 useEffect(()=>{void supabase.from('correo_reglas').select('max_semana,max_dia,hora_desde,hora_hasta,sin_domingos_festivos,cupo_diario,ventana_dias').eq('id',true).single().then(({data})=>setR(data as Rules));},[]);
 if(!r)return <p>Cargando…</p>;
 const num=(k:keyof Rules,label:string,min:number,max:number)=><label>{label}<input type="number" min={min} max={max} value={Number(r[k])} disabled={!canEdit} onChange={e=>setR({...r,[k]:Number(e.target.value)})} style={{width:90}}/></label>;
 const save=async()=>{const {error}=await supabase.from('correo_reglas').update({...r,updated_at:new Date().toISOString()}).eq('id',true);setMsg(error?'No se pudo guardar: revisa los valores.':'Reglas guardadas.');};
 return <div style={box}>
  <div className={styles.toolbar}>{num('max_semana','Máximo por persona por semana',1,14)}{num('max_dia','Máximo por persona por día',1,5)}{num('hora_desde','Enviar desde (hora)',0,23)}{num('hora_hasta','Hasta (hora)',1,24)}{num('cupo_diario','Cupo diario total',1,100000)}{num('ventana_dias','Solo citas de los últimos (días)',1,30)}</div>
  <label><input type="checkbox" checked={r.sin_domingos_festivos} disabled={!canEdit} onChange={e=>setR({...r,sin_domingos_festivos:e.target.checked})}/> No enviar domingos ni festivos</label>
  <p style={{fontSize:12,color:'#666'}}>Hora de Colombia. Lo que no cabe en el cupo o en el horario queda en cola para el siguiente turno. A quien tiene contrato vigente solo le llegan la bienvenida y el agradecimiento.</p>
  {canEdit&&<div className={styles.toolbar}><button type="button" className={styles.primary} onClick={()=>void save()}>Guardar reglas</button></div>}
  {msg&&<p role="status" style={{fontWeight:700}}>{msg}</p>}
 </div>;
}

type Funnel={etapas:Record<string,number>;automatizaciones:{id:string;nombre:string;enviados:number;contratos:number}[];campanas:{nombre:string;total:number;enviados:number;contratos:number}[]};
/** Funnel to contract and what each automation and campaign brought (contracts within 30 days of the email). */
export function MailFunnel(){
 const y=today().slice(0,4);
 const [from,setFrom]=useState(`${y}-01-01`),[to,setTo]=useState(today()),[d,setD]=useState<Funnel|null>(null),[err,setErr]=useState('');
 useEffect(()=>{void supabase.rpc('correo_embudo',{p_desde:from,p_hasta:to}).then(({data,error})=>{if(error){setErr('No se pudo cargar el embudo.');return;}setErr('');setD(data as Funnel);});},[from,to]);
 const stages:[string,string][]=[['contactos','Contactos con autorización comercial'],['citas','Citas agendadas'],['asistieron','Asistieron'],['seguimiento','En seguimiento'],['contrato_creado','Contrato creado'],['contrato_firmado','Contrato firmado']];
 const th={padding:6,textAlign:'left' as const};
 return <div style={{display:'grid',gap:12}}>
  <div className={styles.toolbar}><label>Desde<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Hasta<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div>
  {err&&<p role="alert" className={styles.error}>{err}</p>}
  {d&&<><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10}}>{stages.map(([k,l])=><div key={k} style={box}><b style={{fontSize:22}}>{d.etapas[k]??0}</b><span style={{fontSize:12}}>{l}</span></div>)}</div>
   <div style={{overflowX:'auto'}}><table style={{width:'100%',fontSize:13,borderCollapse:'collapse'}}><caption style={{textAlign:'left',fontWeight:700,padding:'6px 0'}}>Automatizaciones · contratos dentro de 30 días después del correo</caption>
    <thead><tr><th style={th}>Automatización</th><th style={th}>Enviados</th><th style={th}>Contratos</th><th style={th}>Conversión</th></tr></thead>
    <tbody>{d.automatizaciones.map(a=><tr key={a.id} style={{borderTop:'1px solid #eee'}}><td style={th}>{a.nombre}</td><td style={th}>{a.enviados}</td><td style={th}>{a.contratos}</td><td style={th}>{a.enviados?Math.round(1000*a.contratos/a.enviados)/10:0}%</td></tr>)}</tbody></table></div>
   {d.campanas.length>0&&<div style={{overflowX:'auto'}}><table style={{width:'100%',fontSize:13,borderCollapse:'collapse'}}><caption style={{textAlign:'left',fontWeight:700,padding:'6px 0'}}>Envíos manuales</caption>
    <thead><tr><th style={th}>Envío</th><th style={th}>Destinatarios</th><th style={th}>Enviados</th><th style={th}>Contratos</th></tr></thead>
    <tbody>{d.campanas.map((c,i)=><tr key={i} style={{borderTop:'1px solid #eee'}}><td style={th}>{c.nombre}</td><td style={th}>{c.total}</td><td style={th}>{c.enviados}</td><td style={th}>{c.contratos}</td></tr>)}</tbody></table></div>}</>}
 </div>;
}
