'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {MessageCircle,RefreshCw,Sparkles,Send,ArrowLeft,Paperclip} from 'lucide-react';
import {prepareAttachments,ACCEPT_ADJUNTOS,type AdjuntoCliente} from '@/lib/attach-client';
import SupplierShell from '@/components/suppliers/SupplierShell';
import {supabase} from '@/lib/supabase';
import styles from '@/app/dashboard/caja/caja.module.css';

type Conv={id:string;telefono:string;canal?:string|null;nombre:string|null;sede_id:string|null;ultimo_mensaje:string|null;ultimo_at:string;ultimo_entrante_at:string|null;no_leidos:number;etiqueta:string|null;ia_resumen:string|null;ia_sugerencia:string|null;ia_at:string|null;ia_error:string|null;ia_atender:boolean;ia_motivo:string|null;ia_pausada:boolean;ia_pausada_at:string|null;anuncio_id:string|null;anuncio_titulo:string|null;plan_ahorro_at?:string|null};
type Msg={id:string;direccion:'entrante'|'saliente';origen:'clienta'|'erp'|'celular'|'ia';texto:string|null;estado:string|null;created_at:string;media_id?:string|null};
type Ficha={nombre:string|null;citas:{id:string;fecha:string;hora:string;estado:string;modalidad:string;sede:string|null;tipo_vestido:string|null}[];contratos:{id:string;numero_contrato:string;estado:string;fecha_evento:string|null;sede:string|null}[]};
const WINDOW_MS=24*3600*1000;
// List: time only for today, date only for earlier days, so it always fits next to the name.
const horaCorta=(iso:string)=>{const d=new Date(iso),dia=(x:Date)=>x.toLocaleDateString('es-CO',{timeZone:'America/Bogota'});return dia(d)===dia(new Date())?d.toLocaleTimeString('es-CO',{timeZone:'America/Bogota',hour:'numeric',minute:'2-digit'}):d.toLocaleDateString('es-CO',{timeZone:'America/Bogota',day:'numeric',month:'numeric'});};
const hora=(iso:string)=>{const d=new Date(iso),hoy=new Date().toDateString()===d.toDateString();return d.toLocaleString('es-CO',{timeZone:'America/Bogota',...(hoy?{timeStyle:'short'}:{dateStyle:'short',timeStyle:'short'})});};
const CANAL:Record<string,string>={instagram:'Instagram',messenger:'Messenger'};
const tel=(t:string)=>t.startsWith('ig:')?'Instagram':t.startsWith('fb:')?'Messenger':t.startsWith('57')&&t.length===12?`+57 ${t.slice(2,5)} ${t.slice(5,8)} ${t.slice(8)}`:`+${t}`;
const ORIGEN:Record<string,string>={erp:'ERP',celular:'Celular',ia:'IA',clienta:''};
const ESTADO:Record<string,string>={sent:'✓',delivered:'✓✓',read:'✓✓ leído',failed:'⚠ no entregado'};

async function api(body:Record<string,unknown>){
 const {data}=await supabase.auth.getSession();
 const r=await fetch('/api/whatsapp',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session?.access_token||''}`},body:JSON.stringify(body)});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudo completar la acción.');return d;
}

/** Ventas y CRM › WhatsApp 304: chats of the 304 joined to each customer's file, with the AI's suggested reply. */
export default function WhatsappPage(){
 return <SupplierShell activePage="whatsapp" crumb="Ventas y CRM / WhatsApp 304" title="WhatsApp 304" icon={<MessageCircle/>}
  description="Chats del 304 unidos a la ficha de cada clienta. La IA etiqueta, detecta la sede y deja una respuesta sugerida: la asesora la revisa antes de enviarla.">
  {profile=><Tabs admin={profile.rol==='admin'}/>}
 </SupplierShell>;
}

function Tabs({admin}:{admin:boolean}){
 const [tab,setTab]=useState<'chats'|'comentarios'|'ia'|'anuncios'>('chats');
 // ?tab=anuncios from the Marketing menu.
 useEffect(()=>{const t=new URLSearchParams(window.location.search).get('tab');if(t==='anuncios'||t==='comentarios'||t==='ia')setTimeout(()=>setTab(t),0);},[]);
 const [faltan,setFaltan]=useState(0);
 useEffect(()=>{if(!admin)return;void supabase.from('whatsapp_ia_faltantes').select('id',{count:'exact',head:true}).eq('estado','pendiente').then(({count})=>setFaltan(count||0));},[admin,tab]);
 const tabs=([['chats','Chats'],['comentarios','Comentarios de redes'],['ia','IA de WhatsApp'],['anuncios','Anuncios']] as const).filter(([k])=>admin||k==='chats'||k==='comentarios');
 return <>
  {admin&&faltan>0&&tab!=='ia'&&<button type="button" onClick={()=>setTab('ia')} style={{width:'100%',textAlign:'left',marginBottom:10,padding:'10px 14px',borderRadius:12,border:'1px solid #fcd34d',background:'#fffbeb',color:'#92400e',fontWeight:700,cursor:'pointer'}}>
   📝 La IA necesita {faltan} dato{faltan===1?'':'s'} para responder sola sin pasar chats a una persona. Tócame para completarlos.</button>}
  <div className={styles.toolbar} style={{marginBottom:12}}>{tabs.map(([k,l])=><button key={k} type="button" className={tab===k?styles.primary:undefined} onClick={()=>setTab(k)}>{l}</button>)}</div>
  {tab==='chats'?<Inbox/>:tab==='comentarios'?<Comments/>:tab==='ia'?<IaSettings/>:<AdsPanel/>}
 </>;
}

type Faltante={id:number;falta:string;pregunta:string|null;veces:number;ultima_at:string};
/** «IA de WhatsApp»: what the AI could not answer (it passed the chat to a person). Administration answers once and it is added to the knowledge. */
function Faltantes({onChange}:{onChange:()=>void}){
 const [rows,setRows]=useState<Faltante[]>([]),[resp,setResp]=useState<Record<number,string>>({}),[aprender,setAprender]=useState<boolean|null>(null),[busy,setBusy]=useState(0),[error,setError]=useState(''),[parecidas,setParecidas]=useState<{descartar:boolean;lista:string[]}|null>(null);
 const load=useCallback(async()=>{const [{data},{data:c}]=await Promise.all([supabase.from('whatsapp_ia_faltantes').select('id,falta,pregunta,veces,ultima_at').eq('estado','pendiente').order('veces',{ascending:false}).order('ultima_at',{ascending:false}).limit(50),
  supabase.from('whatsapp_ia_config').select('auto_aprender').eq('id',1).maybeSingle()]);setRows((data||[]) as Faltante[]);setAprender(c?.auto_aprender!==false);},[]);
 useEffect(()=>{const t=setTimeout(()=>void load(),0);return()=>clearTimeout(t);},[load]);
 const completar=async(f:Faltante,descartar=false)=>{setBusy(f.id);setError('');const {error:e}=await supabase.rpc('completar_dato_ia',{p_id:f.id,p_respuesta:resp[f.id]||'',p_descartar:descartar});
  if(e){setBusy(0);setError(e.message);return;}
  // Same-meaning pending questions get the same answer (or «No aplica») at once.
  setParecidas(null);const {data:ses}=await supabase.auth.getSession();
  const r=await fetch('/api/whatsapp',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${ses.session?.access_token||''}`},body:JSON.stringify({accion:'faltantes_parecidos',faltante_id:f.id})}).catch(()=>null);
  const d=r?await r.json().catch(()=>({})):{};if(r?.ok&&d.resueltas?.length)setParecidas({descartar,lista:d.resueltas});
  setBusy(0);await load();if(!descartar)onChange();};
 const toggle=async()=>{const next=!aprender;setBusy(-1);const {error:e}=await supabase.rpc('guardar_whatsapp_ia_aprender',{p_activa:next});setBusy(0);if(e)setError(e.message);else setAprender(next);};
 return <section className={styles.card} style={{display:'grid',gap:10,borderColor:rows.length?'#f59e0b':undefined}}>
  <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
   <h2 style={{margin:0,flex:1}}>Lo que le falta a la IA {rows.length>0&&<span className={styles.badge} style={{background:'#fef3c7',color:'#92400e'}}>{rows.length}</span>}</h2>
   {aprender!==null&&<button type="button" className={`${styles.button} ${aprender?styles.primary:''}`} disabled={busy!==0} onClick={()=>void toggle()}>Aprende sola cada día: {aprender?'ENCENDIDO':'APAGADO'}</button>}
  </div>
  <p className={styles.help}>Cada mañana (7:40 a. m.) la IA analiza los chats de los últimos 7 días y aplica sola sus mejoras para agendar más citas y sonar más humana (el historial de abajo guarda cada versión para volver atrás). Aquí aparecen las preguntas que no pudo responder porque le falta información del negocio: respóndelas una vez y se agregan a sus conocimientos, así la próxima vez responde sola.</p>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {parecidas&&<div style={{border:'1px solid #a7f3d0',background:'#ecfdf5',borderRadius:12,padding:10,color:'#065f46'}}><strong>✅ {parecidas.descartar?'También se marcaron «No aplica»':'También quedaron respondidas'} {parecidas.lista.length} pregunta{parecidas.lista.length===1?'':'s'} con el mismo sentido:</strong><ul style={{margin:'6px 0 0 18px'}}>{parecidas.lista.map(t=><li key={t}>{t}</li>)}</ul></div>}
  {!rows.length&&<p className={styles.empty}>No le falta ningún dato por ahora. 🎉</p>}
  {rows.map(f=><div key={f.id} style={{border:'1px solid #fde68a',borderRadius:12,padding:10,display:'grid',gap:6}}>
   <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}><strong>{f.falta}</strong><small style={{color:'#92400e'}}>{f.veces} {f.veces===1?'vez':'veces'} · {hora(f.ultima_at)}</small></div>
   {f.pregunta&&<small style={{color:'#64748b'}}>Ejemplo de lo que preguntó la clienta: «{f.pregunta}»</small>}
   <textarea rows={2} value={resp[f.id]||''} onChange={e=>setResp(r=>({...r,[f.id]:e.target.value}))} placeholder="Escribe la respuesta tal como quieres que la IA la sepa" style={{width:'100%'}}/>
   <div className={styles.toolbar}><button type="button" className={`${styles.button} ${styles.primary}`} disabled={busy!==0||(resp[f.id]||'').trim().length<2} onClick={()=>void completar(f)}>{busy===f.id?'Guardando y buscando parecidas…':'Enseñar a la IA'}</button>
    <button type="button" className={styles.button} disabled={busy!==0} onClick={()=>void completar(f,true)}>No aplica</button></div>
  </div>)}
 </section>;
}

type Comentario={id:string;canal:string;comentario_id:string;publicacion_url:string|null;publicacion_texto:string|null;padre_id:string|null;autor_nombre:string|null;texto:string|null;created_at:string;estado:string;ia_sugerencia:string|null;ia_error:string|null;respuesta:string|null;respondido_at:string|null;ia_tipo:string|null;ia_privado:string|null;respuesta_publica:string|null};
const TIPO_COM:Record<string,[string,string]>={interes:['Interés en alquilar','#047857'],elogio:['Elogio','#7c3aed'],negativo:['Queja: atiende una persona','#b91c1c'],otro:['Otro','#64748b']};
const ESTADO_COM:Record<string,string>={pendiente:'Pendientes',respondido:'Respondidos en público',privado:'Respondidos por privado',ignorado:'Sin responder (descartados)',eliminado:'Eliminados en Meta'};
/** WhatsApp 304 › Comentarios de Instagram: what customers comment on our posts, with the AI's suggested reply; a person answers in public or by private message. */
function Comments(){
 const [estado,setEstado]=useState('pendiente'),[rows,setRows]=useState<Comentario[]|null>(null),[error,setError]=useState('');
 const load=useCallback(async()=>{setError('');const {data,error:e}=await supabase.from('redes_comentarios').select('id,canal,comentario_id,publicacion_url,publicacion_texto,padre_id,autor_nombre,texto,created_at,estado,ia_sugerencia,ia_error,respuesta,respondido_at,ia_tipo,ia_privado,respuesta_publica').eq('estado',estado).order('created_at',{ascending:false}).limit(100);
  if(e)setError(e.message);else setRows((data||[]) as Comentario[]);},[estado]);
 useEffect(()=>{const t=setTimeout(()=>void load(),0);const ch=supabase.channel('redes_comentarios').on('postgres_changes',{event:'*',schema:'public',table:'redes_comentarios'},()=>void load()).subscribe();return()=>{clearTimeout(t);void supabase.removeChannel(ch);};},[load]);
 return <section className={styles.card} style={{display:'grid',gap:10}}>
  <h2>Comentarios de Instagram y Facebook</h2>
  <p className={styles.help}>Lo que comentan en las publicaciones de Instagram (@ambarcouture) y de la página de Facebook. Con las respuestas automáticas de la IA encendidas: si hay interés en alquilar, la IA le escribe por mensaje privado (el chat sigue en Chats y la IA lo atiende) y responde corto en público; los elogios reciben un agradecimiento. Las quejas y lo demás quedan aquí pendientes para una persona. Meta permite un mensaje privado por comentario, dentro de los 7 días.</p>
  <div className={styles.toolbar}>{Object.entries(ESTADO_COM).map(([k,l])=><button key={k} type="button" className={estado===k?styles.primary:undefined} onClick={()=>setEstado(k)}>{l}</button>)}
   <button type="button" className={styles.button} onClick={()=>void load()}><RefreshCw size={14} style={{display:'inline',verticalAlign:'-2px'}}/> Actualizar</button></div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {rows&&!rows.length&&<p className={styles.empty}>{estado==='pendiente'?'No hay comentarios pendientes.':'Nada por aquí.'}</p>}
  {rows?.map(c=><CommentCard key={c.id} c={c} onDone={()=>void load()}/>)}
 </section>;
}
function CommentCard({c,onDone}:{c:Comentario;onDone:()=>void}){
 const [texto,setTexto]=useState(c.ia_sugerencia||''),[privado,setPrivado]=useState(c.ia_privado||''),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const run=async(accion:string,extra:Record<string,unknown>={})=>{setBusy(accion);setError('');try{await api({accion,comentario_id:c.id,...extra});onDone();}catch(e){setError(e instanceof Error?e.message:'Error');}finally{setBusy('');}};
 const pendiente=c.estado==='pendiente',dias=(Date.now()-Date.parse(c.created_at))/86400000;
 return <article style={{border:'1px solid #f1e4e8',borderRadius:14,padding:12,display:'grid',gap:8}}>
  <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}><strong><small style={{marginRight:6,color:c.canal==='facebook'?'#1d4ed8':'#be185d'}}>{c.canal==='facebook'?'Facebook':'Instagram'}</small>{c.canal==='facebook'?'':'@'}{c.autor_nombre||'cliente'}{c.padre_id?' · respuesta a otro comentario':''}{c.ia_tipo&&<small style={{marginLeft:8,color:TIPO_COM[c.ia_tipo]?.[1]}}>● {TIPO_COM[c.ia_tipo]?.[0]}</small>}</strong><small>{hora(c.created_at)}</small></div>
  <p style={{margin:0,whiteSpace:'pre-wrap'}}>{c.texto}</p>
  {(c.publicacion_texto||c.publicacion_url)&&<small style={{color:'#6b7280'}}>En la publicación: {c.publicacion_texto?`«${c.publicacion_texto.slice(0,120)}${c.publicacion_texto.length>120?'…':''}»`:''} {c.publicacion_url&&<a href={c.publicacion_url} target="_blank" rel="noreferrer">Ver publicación</a>}</small>}
  {pendiente?<>
   {c.ia_error&&<small style={{color:'#b91c1c'}}>La IA no pudo sugerir: {c.ia_error}</small>}
   <label style={{display:'grid',gap:4}}><small>Respuesta pública</small><textarea value={texto} onChange={e=>setTexto(e.target.value)} rows={2} placeholder={c.ia_sugerencia?'':'Escribe la respuesta o pide una sugerencia a la IA'} style={{width:'100%'}}/></label>
   <label style={{display:'grid',gap:4}}><small>Mensaje privado (abre el chat en Chats)</small><textarea value={privado} onChange={e=>setPrivado(e.target.value)} rows={3} placeholder="Opcional: primer mensaje directo a la persona" style={{width:'100%'}}/></label>
   <div className={styles.toolbar}>
    <button type="button" className={styles.primary} disabled={!!busy||!texto.trim()} onClick={()=>void run('comentario_responder',{texto,modo:'publico'})}><Send size={14} style={{display:'inline',verticalAlign:'-2px'}}/> {busy==='comentario_responder'?'Enviando…':'Responder en público'}</button>
    <button type="button" className={styles.button} disabled={!!busy||!privado.trim()||dias>7} title={dias>7?'Pasaron más de 7 días: Meta ya no deja escribirle por privado.':undefined} onClick={()=>void run('comentario_responder',{texto:privado,modo:'privado'})}>Responder por privado</button>
    <button type="button" className={styles.button} disabled={!!busy} onClick={()=>void run('comentario_ia')}><Sparkles size={14} style={{display:'inline',verticalAlign:'-2px'}}/> {busy==='comentario_ia'?'Pensando…':'Sugerir con IA'}</button>
    <button type="button" className={styles.button} disabled={!!busy} onClick={()=>void run('comentario_ignorar')}>No responder</button>
   </div></>
  :<>{c.respuesta&&<p style={{margin:0,color:'#047857'}}><strong>{c.estado==='privado'?'Mensaje privado':c.estado==='ignorado'?'Descartado':'Respuesta pública'}:</strong> {c.respuesta}</p>}
   {c.respuesta_publica&&c.respuesta_publica!==c.respuesta&&<p style={{margin:0,color:'#047857'}}><strong>Respuesta pública:</strong> {c.respuesta_publica}</p>}</>}
  {error&&<p role="alert" className={styles.error}>{error}</p>}
 </article>;
}

type PortRow={cuenta:string;moneda:string;campana_id:string;campana:string;campana_estado:string;objetivo:string;conjunto_id:string;conjunto:string;conjunto_estado:string;presupuesto_en:'conjunto'|'campana';presupuesto_diario:number|null;presupuesto_total:number|null;
 anuncio_id:string;anuncio:string;gasto:number;alcance:number;impresiones:number;clics:number;ctr:number;cpm:number;conversaciones:number;leads:number;chats:number;citas:number;asistieron:number;contratos:number};
const ESTADO_AD:Record<string,string>={ACTIVE:'Activa',PAUSED:'Pausada',CAMPAIGN_PAUSED:'Campaña pausada',ADSET_PAUSED:'Conjunto pausado',ARCHIVED:'Archivada',DELETED:'Eliminada',WITH_ISSUES:'Con problemas',IN_PROCESS:'En revisión',DISAPPROVED:'Rechazada'};
const OBJETIVO:Record<string,string>={OUTCOME_ENGAGEMENT:'Interacción',OUTCOME_LEADS:'Clientes potenciales',OUTCOME_TRAFFIC:'Tráfico',OUTCOME_AWARENESS:'Reconocimiento',OUTCOME_SALES:'Ventas',MESSAGES:'Mensajes'};
/** Anuncios fase 1: the whole Meta portfolio by campaign, with Meta's metrics and the ERP results of each ad. Read only. */
function Portafolio({desde,hasta}:{desde:string;hasta:string}){
 const [rows,setRows]=useState<PortRow[]|null>(null),[errores,setErrores]=useState<string[]>([]),[busy,setBusy]=useState(false),[abiertas,setAbiertas]=useState<Record<string,boolean>>({});
 const load=useCallback(async()=>{setBusy(true);try{const r=await api({accion:'anuncios_portafolio',desde,hasta}) as {filas:PortRow[];errores:string[]};setRows(r.filas);setErrores(r.errores||[]);}catch(e){setErrores([e instanceof Error?e.message:'Error']);setRows([]);}finally{setBusy(false);}},[desde,hasta]);
 useEffect(()=>{const t=setTimeout(()=>void load(),0);return()=>clearTimeout(t);},[load]);
 const camps=useMemo(()=>{const m=new Map<string,PortRow[]>();for(const r of rows||[])m.set(r.campana_id,[...(m.get(r.campana_id)||[]),r]);
  return [...m.values()].map(l=>({c:l[0],l,t:l.reduce((a,r)=>({gasto:a.gasto+r.gasto,alcance:a.alcance+r.alcance,clics:a.clics+r.clics,conv:a.conv+r.conversaciones+r.leads,chats:a.chats+r.chats,citas:a.citas+r.citas,asis:a.asis+r.asistieron,con:a.con+r.contratos}),{gasto:0,alcance:0,clics:0,conv:0,chats:0,citas:0,asis:0,con:0})})).sort((a,b)=>b.t.gasto-a.t.gasto);},[rows]);
 const tot=camps.reduce((a,x)=>({gasto:a.gasto+x.t.gasto,conv:a.conv+x.t.conv,citas:a.citas+x.t.citas,con:a.con+x.t.con}),{gasto:0,conv:0,citas:0,con:0});
 const n=(v:number)=>v.toLocaleString('es-CO');
 // Anuncios fase 2: each change is confirmed here and checked again on the server against the caps of Configuración.
 const cambiar=async(e:{stopPropagation:()=>void},id:string,tipo:'pausar'|'activar'|'presupuesto',nombre:string,actual?:number|null)=>{
  e.stopPropagation();let valor:number|undefined;
  if(tipo==='presupuesto'){const t=window.prompt(`Nuevo presupuesto diario para «${nombre}» (hoy ${cop(actual||0)}). Solo números:`,String(actual||''));if(t===null)return;
   valor=Number(t.replace(/\D/g,''));if(!valor){window.alert('Escribe un valor válido.');return;}}
  if(!window.confirm(tipo==='presupuesto'?`¿Cambiar el presupuesto diario de «${nombre}» de ${cop(actual||0)} a ${cop(valor||0)}?`:`¿${tipo==='pausar'?'Pausar':'Activar'} «${nombre}» en Meta?`))return;
  setBusy(true);try{await api({accion:'anuncios_cambiar',id,tipo,valor});await load();}catch(x){window.alert(x instanceof Error?x.message:'No se pudo cambiar.');setBusy(false);}
 };
 const btn={fontSize:12,padding:'2px 8px',marginRight:4,borderRadius:8,border:'1px solid #d1d5db',background:'#fff',cursor:'pointer'};
 const acciones=(id:string,estado:string,nombre:string,budget:boolean,actual:number|null)=><>
  {estado==='ACTIVE'&&<button style={btn} disabled={busy} onClick={e=>void cambiar(e,id,'pausar',nombre)}>Pausar</button>}
  {estado==='PAUSED'&&<button style={btn} disabled={busy} onClick={e=>void cambiar(e,id,'activar',nombre)}>Activar</button>}
  {budget&&actual!=null&&<button style={btn} disabled={busy} onClick={e=>void cambiar(e,id,'presupuesto',nombre,actual)}>Presupuesto</button>}</>;
 return <div style={{display:'grid',gap:8}}>
  <h2>Portafolio de anuncios en Meta {busy&&<small>· cargando…</small>}</h2>
  <p className={styles.help}>Todas tus campañas con su estado, presupuesto y resultados en Meta, y lo que trajeron al ERP (chats, citas, asistencias y contratos). Puedes pausar, activar o ajustar el presupuesto diario; cada cambio pide confirmación, respeta los topes de Configuración y queda en el historial.</p>
  {errores.length>0&&<p className={styles.help} style={{color:'#b45309'}}>{errores.join(' · ')}</p>}
  {rows&&camps.length>0&&<p className={styles.help}><strong>Total del periodo:</strong> gasto {cop(tot.gasto)} · {n(tot.conv)} conversaciones o clientes potenciales en Meta · {n(tot.citas)} citas · {n(tot.con)} contratos{tot.citas?` · ${cop(tot.gasto/tot.citas)} por cita`:''}{tot.con?` · ${cop(tot.gasto/tot.con)} por contrato`:''}</p>}
  {rows&&!camps.length&&!busy&&<p className={styles.empty}>No hay campañas con entrega en estas fechas.</p>}
  {camps.length>0&&<div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Campaña</th><th>Estado</th><th>Presupuesto</th><th>Gasto</th><th>Alcance</th><th>Clics</th><th>Conversaciones</th><th>Chats ERP</th><th>Citas</th><th>Asistieron</th><th>Contratos</th><th>Costo por cita</th><th>Costo por contrato</th><th>Acciones</th></tr></thead>
   <tbody>{camps.map(({c,l,t})=>[<tr key={c.campana_id} onClick={()=>setAbiertas(a=>({...a,[c.campana_id]:!a[c.campana_id]}))} style={{cursor:'pointer'}}>
     <td><strong>{abiertas[c.campana_id]?'▾':'▸'} {c.campana}</strong><small>{OBJETIVO[c.objetivo]||c.objetivo} · {c.cuenta}</small></td><td>{ESTADO_AD[c.campana_estado]||c.campana_estado}</td>
     <td>{c.presupuesto_diario?`${cop(c.presupuesto_diario)}/día`:c.presupuesto_total?`${cop(c.presupuesto_total)} total`:'—'}</td><td>{cop(t.gasto)}</td><td>{n(t.alcance)}</td><td>{n(t.clics)}</td><td>{n(t.conv)}</td>
     <td>{t.chats}</td><td>{t.citas}</td><td>{t.asis}</td><td>{t.con}</td><td>{t.citas?cop(t.gasto/t.citas):'—'}</td><td>{t.con?cop(t.gasto/t.con):'—'}</td><td>{acciones(c.campana_id,c.campana_estado,c.campana,c.presupuesto_en==='campana'&&!!c.presupuesto_diario,c.presupuesto_diario)}</td></tr>,
    ...(abiertas[c.campana_id]?l.map((r,i)=><tr key={`${c.campana_id}-${r.anuncio_id||r.conjunto}`} style={{background:'#fafafa'}}>
     <td style={{paddingLeft:24}}>{r.anuncio}<small>{r.conjunto}{r.conjunto_estado?` · ${ESTADO_AD[r.conjunto_estado]||r.conjunto_estado}`:''}</small></td><td></td>
     <td>{r.presupuesto_diario?`${cop(r.presupuesto_diario)}/día`:r.presupuesto_total?`${cop(r.presupuesto_total)} total`:''}</td><td>{cop(r.gasto)}</td><td>{n(r.alcance)}</td><td>{n(r.clics)} <small>CTR {r.ctr.toFixed(1)}% · CPM {cop(r.cpm)}</small></td>
     <td>{n(r.conversaciones+r.leads)}</td><td>{r.chats}</td><td>{r.citas}</td><td>{r.asistieron}</td><td>{r.contratos}</td><td>{r.citas?cop(r.gasto/r.citas):'—'}</td><td>{r.contratos?cop(r.gasto/r.contratos):'—'}</td>
     <td>{r.conjunto_id&&l.findIndex(x=>x.conjunto_id===r.conjunto_id)===i&&acciones(r.conjunto_id,r.conjunto_estado,r.conjunto,r.presupuesto_en==='conjunto'&&!!r.presupuesto_diario,r.presupuesto_diario)}</td></tr>):[])])}</tbody></table></div>}
 </div>;
}

type AdRow={anuncio_id:string;nombre:string|null;campana:string|null;sede:string|null;chats:number;citas:number;citas_virtuales:number;citas_presenciales:number;asistieron:number;contratos:number;gasto:number|null};
const cop=(n:number)=>n.toLocaleString('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0});
const pct=(a:number,b:number)=>b?`${Math.round(100*a/b)}%`:'—';
const bogota=(offsetDays=0)=>new Date(Date.now()-5*3600000+offsetDays*86400000).toISOString().slice(0,10);

/** WhatsApp 304 › Anuncios: which Meta ads bring chats, visits (virtual / in person), attendance and contracts, and at what cost. */
function AdsPanel(){
 const [desde,setDesde]=useState(()=>bogota(-30)),[hasta,setHasta]=useState(()=>bogota()),[rows,setRows]=useState<AdRow[]|null>(null),[token,setToken]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=useCallback(async()=>{setBusy(true);setError('');try{const r=await api({accion:'anuncios',desde,hasta}) as {token:boolean;filas:AdRow[]};setRows(r.filas.map(f=>({...f,chats:Number(f.chats),citas:Number(f.citas),citas_virtuales:Number(f.citas_virtuales),citas_presenciales:Number(f.citas_presenciales),asistieron:Number(f.asistieron),contratos:Number(f.contratos)})));setToken(r.token);}catch(e){setError(e instanceof Error?e.message:'Error');}finally{setBusy(false);}},[desde,hasta]);
 useEffect(()=>{const t=setTimeout(()=>void load(),0);return()=>clearTimeout(t);},[load]);
 const tot=(rows||[]).reduce((a,r)=>({chats:a.chats+r.chats,citas:a.citas+r.citas,v:a.v+r.citas_virtuales,p:a.p+r.citas_presenciales,asis:a.asis+r.asistieron,con:a.con+r.contratos,gasto:a.gasto+(r.gasto||0)}),{chats:0,citas:0,v:0,p:0,asis:0,con:0,gasto:0});
 return <section className={styles.card} style={{display:'grid',gap:10}}>
  <Portafolio desde={desde} hasta={hasta}/>
  <h2>Efectividad de los anuncios</h2>
  <p className={styles.help}>Chats que llegaron por un anuncio de Meta con botón de WhatsApp, y lo que pasó después con esa clienta (por su celular): agendó primera cita (virtual o presencial), asistió y firmó contrato. La sede sale del nombre del anuncio.</p>
  {!token&&<p className={styles.help} style={{color:'#b45309'}}>Falta conectar la lectura de anuncios de Meta (META_ADS_TOKEN): por ahora se ven los ID de los anuncios, sin su nombre ni el gasto.</p>}
  <div className={styles.toolbar}><label>Desde<input type="date" value={desde} max={hasta} onChange={e=>setDesde(e.target.value)}/></label><label>Hasta<input type="date" value={hasta} min={desde} onChange={e=>setHasta(e.target.value)}/></label>
   <button className={styles.button} disabled={busy} onClick={()=>void load()}><RefreshCw size={14} style={{display:'inline',verticalAlign:'-2px'}}/> {busy?'Calculando…':'Actualizar'}</button></div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {rows&&!rows.length&&<p className={styles.empty}>Aún no hay chats que hayan llegado por anuncios en estas fechas. Se empiezan a contar desde hoy.</p>}
  {rows&&rows.length>0&&<div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Anuncio</th><th>Sede</th><th>Chats</th><th>Citas</th><th>Virtual / presencial</th><th>Asistieron</th><th>Contratos</th><th>Gasto</th><th>Costo por cita</th><th>Costo por contrato</th></tr></thead>
   <tbody>{rows.map(r=><tr key={r.anuncio_id}><td><strong>{r.nombre||`Anuncio ${r.anuncio_id}`}</strong>{r.campana&&<small>{r.campana}</small>}</td><td>{r.sede||'—'}</td><td>{r.chats}</td>
    <td>{r.citas} <small>{pct(r.citas,r.chats)} de los chats</small></td><td>{r.citas_virtuales} / {r.citas_presenciales}</td><td>{r.asistieron} <small>{pct(r.asistieron,r.citas)} de las citas</small></td><td>{r.contratos}</td>
    <td>{r.gasto==null?'—':cop(r.gasto)}</td><td>{r.gasto&&r.citas?cop(r.gasto/r.citas):'—'}</td><td>{r.gasto&&r.contratos?cop(r.gasto/r.contratos):'—'}</td></tr>)}
    <tr><td><strong>Total</strong></td><td></td><td><strong>{tot.chats}</strong></td><td><strong>{tot.citas}</strong> <small>{pct(tot.citas,tot.chats)}</small></td><td>{tot.v} / {tot.p}</td><td><strong>{tot.asis}</strong> <small>{pct(tot.asis,tot.citas)}</small></td><td><strong>{tot.con}</strong></td>
     <td>{token?cop(tot.gasto):'—'}</td><td>{token&&tot.citas?cop(tot.gasto/tot.citas):'—'}</td><td>{token&&tot.con?cop(tot.gasto/tot.con):'—'}</td></tr></tbody></table></div>}
 </section>;
}

type IaCfg={conocimientos:string;instrucciones:string;escalamiento:string};
const IA_FIELDS:[keyof IaCfg,string,string,string][]=[
 ['conocimientos','Conocimientos','Lo que la IA puede decir con seguridad. Lo que no esté aquí ni en los datos del ERP, no lo dice.','Ej.:\n- Horario: lunes a sábado 9 a. m. a 7 p. m.; domingos con cita.\n- El alquiler incluye arreglos básicos y lavado.\n- Depósito de garantía: se devuelve hasta 72 h después de devolver el vestido.\n- Alquiler de XV desde $400.000 (solo si quieres que diga precios «desde»).'],
 ['instrucciones','Instrucciones y tono','Cómo saluda, qué ofrece primero y qué no debe decir nunca.','Ej.:\n- Saluda con el nombre de la clienta si lo sabes.\n- Ofrece siempre la primera cita presencial; la virtual solo si vive en otra ciudad.\n- Nunca hables mal de otras tiendas.'],
 ['escalamiento','Reglas de paso a una persona','Cuándo marcar el chat como «Atender persona», además de reclamos, pagos y cambios de contrato.','Ej.:\n- Si es una novia, márcalo para que lo atienda la líder.\n- Si dice que su evento es en menos de 15 días, márcalo urgente.\n- Si pregunta por venta de vestidos, márcalo.'],
];

/** «IA de WhatsApp» (administration): knowledge, instructions and hand-off rules, with a test box and history. */
const FUNCION_IA:Record<string,string>={whatsapp_respuesta:'Respuestas de WhatsApp (incluye empujones)',comentarios_redes:'Comentarios de redes',fotos_describir:'Describir fotos del inventario',fotos_comparar:'Comparar fotos de clientas',faltantes_parecidos:'Faltantes parecidos',ia_chat_conocimientos:'Chat de conocimientos de la IA',documentos_resumen:'Resumen de documentos de la marca',analisis_embudo:'Análisis del embudo',analisis_whatsapp:'Análisis diario de WhatsApp'};
/** IA de WhatsApp › Consumo: what the AI of the ERP costs (estimated from the tokens of each call), by function and day. */
function IaConsumo(){
 type Row={dia:string;funcion:string;llamadas:number;entrada:number;salida:number;cache_lectura:number;cache_escritura:number;costo_usd:number};
 const [rows,setRows]=useState<Row[]|null>(null),[dias,setDias]=useState(7),[error,setError]=useState('');
 useEffect(()=>{void supabase.rpc('ia_consumo_resumen',{p_dias:dias}).then(({data,error:e})=>{if(e)setError(e.message);else{setError('');setRows((data||[]) as Row[]);}});},[dias]);
 const usd=(n:number)=>`US$ ${Number(n).toFixed(n<1?3:2)}`;
 const total=(rows||[]).reduce((a,r)=>a+Number(r.costo_usd),0),llamadas=(rows||[]).reduce((a,r)=>a+Number(r.llamadas),0);
 const porFuncion=Object.entries((rows||[]).reduce((m,r)=>{const x=m[r.funcion]||{c:0,l:0};x.c+=Number(r.costo_usd);x.l+=Number(r.llamadas);m[r.funcion]=x;return m;},{} as Record<string,{c:number;l:number}>)).sort((a,b)=>b[1].c-a[1].c);
 const diasConDatos=new Set((rows||[]).map(r=>r.dia)).size||1;
 return <section className={styles.card}>
  <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap',alignItems:'center'}}><h3 style={{margin:0}}>Consumo de IA</h3>
   <select value={dias} onChange={e=>setDias(Number(e.target.value))}><option value={1}>Hoy</option><option value={7}>Últimos 7 días</option><option value={30}>Últimos 30 días</option></select></div>
  {error?<p className={styles.error}>{error}</p>:!rows?<p className={styles.empty}>Cargando…</p>:!rows.length?<p className={styles.empty}>Aún no hay llamadas medidas. La medición empezó con esta versión; los datos aparecen a medida que la IA trabaja.</p>:<>
   <p style={{fontSize:22,fontWeight:900,margin:'8px 0 0'}}>{usd(total)}</p>
   <p className={styles.help}>{llamadas} llamadas · promedio {usd(total/diasConDatos)} por día · proyección {usd(total/diasConDatos*30)} al mes. Costo estimado con los precios de lista de Claude (la factura real está en Claude Platform).</p>
   <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Función</th><th>Llamadas</th><th>Costo</th><th>%</th></tr></thead>
    <tbody>{porFuncion.map(([f,x])=><tr key={f}><td>{FUNCION_IA[f]||f}</td><td>{x.l}</td><td>{usd(x.c)}</td><td>{total?Math.round(x.c*100/total):0} %</td></tr>)}</tbody></table></div>
  </>}
 </section>;
}

function IaSettings(){
 const [cfg,setCfg]=useState<IaCfg>({conocimientos:'',instrucciones:'',escalamiento:''}),[saved,setSaved]=useState<IaCfg|null>(null),[meta,setMeta]=useState('');
 const [hist,setHist]=useState<(IaCfg&{id:number;created_at:string})[]>([]),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 type Cambio={seccion:keyof IaCfg;operacion:'agregar'|'reemplazar'|'quitar';antes:string;despues:string};
 const [chat,setChat]=useState<{id:number;rol:'admin'|'ia';texto:string;propuesta:Cambio[]|null;estado:string|null;created_at:string}[]>([]),[pedido,setPedido]=useState('');
 const [auto,setAuto]=useState<{activa:boolean;horas:number}|null>(null);
 type Turno={rol:'clienta'|'ambar';texto:string;info?:{etiqueta:string;resumen:string;atender_persona:boolean;motivo:string;sede:string}};
 const [prueba,setPrueba]=useState(''),[simulacion,setSimulacion]=useState<Turno[]>([]);
 // Files attached to the next message of each chat (images, PDF, Word, text).
 const [adjK,setAdjK]=useState<AdjuntoCliente[]>([]),[adjP,setAdjP]=useState<AdjuntoCliente[]>([]);
 const elegir=async(files:FileList|null,set:(f:(a:AdjuntoCliente[])=>AdjuntoCliente[])=>void)=>{if(!files?.length)return;setError('');try{const nuevos=await prepareAttachments(files);set(a=>[...a,...nuevos].slice(0,4));}catch(e){setError(e instanceof Error?e.message:'No se pudo leer el archivo.');}};
 const load=useCallback(async()=>{
  const [{data:c,error:e},{data:h}]=await Promise.all([supabase.from('whatsapp_ia_config').select('conocimientos,instrucciones,escalamiento,actualizado_at,auto_activa,reactivar_horas').eq('id',1).maybeSingle(),
   supabase.from('whatsapp_ia_historial').select('id,conocimientos,instrucciones,escalamiento,created_at').order('id',{ascending:false}).limit(10)]);
  if(e){setError(e.message);return;}
  const v={conocimientos:c?.conocimientos||'',instrucciones:c?.instrucciones||'',escalamiento:c?.escalamiento||''};
  const {data:k}=await supabase.from('whatsapp_ia_conocimiento_chat').select('id,rol,texto,propuesta,estado,created_at').order('id',{ascending:false}).limit(60);
  setChat(((k||[]) as typeof chat).reverse());
  setCfg(v);setSaved(v);setAuto({activa:!!c?.auto_activa,horas:Number(c?.reactivar_horas)||12});setMeta(c?.actualizado_at?`Última actualización: ${hora(c.actualizado_at)}`:'');setHist((h||[]) as (IaCfg&{id:number;created_at:string})[]);
 },[]);
 useEffect(()=>{const t=setTimeout(()=>void load(),0);return()=>clearTimeout(t);},[load]);
 const dirty=!!saved&&(cfg.conocimientos!==saved.conocimientos||cfg.instrucciones!==saved.instrucciones||cfg.escalamiento!==saved.escalamiento);
 const guardar=async()=>{setBusy('guardar');setError('');setNotice('');const {error:e}=await supabase.rpc('guardar_whatsapp_ia',{p_conocimientos:cfg.conocimientos,p_instrucciones:cfg.instrucciones,p_escalamiento:cfg.escalamiento});setBusy('');if(e)setError(e.message);else{setNotice('Guardado. La IA usa estos cambios desde el próximo mensaje.');await load();}};
 const guardarAuto=async(next:{activa:boolean;horas:number})=>{
  if(next.activa&&!auto?.activa&&!window.confirm('¿Encender la respuesta automática? La IA contestará sola en los chats que no estén pausados. Antes, apaga la IA del proveedor de WhatsApp para que no respondan las dos.'))return;
  setBusy('auto');setError('');setNotice('');const {error:e}=await supabase.rpc('guardar_whatsapp_ia_auto',{p_activa:next.activa,p_horas:next.horas});setBusy('');
  if(e)setError(e.message);else{setAuto(next);setNotice(next.activa?'Respuesta automática encendida.':'Respuesta automática apagada: la IA vuelve a solo sugerir.');}
 };
 // Knowledge chat: every message goes to the server, which answers, proposes exact changes or applies a confirmed one.
 const conversar=async(body:Record<string,unknown>,texto?:string)=>{
  setBusy('ajustar');setError('');setNotice('');
  if(texto){setChat(c=>[...c,{id:-Date.now(),rol:'admin',texto,propuesta:null,estado:null,created_at:new Date().toISOString()}]);setPedido('');}
  try{await api(body);await load();}
  catch(e){if(texto){setChat(c=>c.filter(m=>m.id>=0));setPedido(texto);}setError(e instanceof Error?e.message:'Error');}finally{setBusy('');}
 };
 const ajustar=()=>{const texto=pedido.trim();if(!texto&&!adjK.length)return;const adj=adjK;setAdjK([]);void conversar({accion:'conocimiento',texto,adjuntos:adj},[texto||'Analiza el archivo adjunto.',adj.length?`📎 ${adj.map(a=>a.nombre).join(', ')}`:''].filter(Boolean).join('\n'));};
 const SECCION:Record<string,string>={conocimientos:'Conocimientos',instrucciones:'Instrucciones y tono',escalamiento:'Reglas de paso a una persona'};
 // Simulated chat: you write as the customer, the AI answers as Ámbar with the settings above (saved or not).
 const probar=async()=>{
  const adj=adjP,escrito=prueba.trim();if(!escrito&&!adj.length)return;
  const texto=[escrito||'(envió un archivo)',adj.length?`📎 ${adj.map(a=>a.nombre).join(', ')}`:''].filter(Boolean).join('\n');
  const turnos:Turno[]=[...simulacion,{rol:'clienta',texto}];
  setSimulacion(turnos);setPrueba('');setAdjP([]);setBusy('probar');setError('');
  try{
   const r=await api({accion:'probar',conversacion:turnos.map(t=>({rol:t.rol,texto:t.texto})),adjuntos:adj,...cfg}) as {etiqueta:string;resumen:string;respuesta:string;atender_persona:boolean;motivo:string;sede:string};
   setSimulacion([...turnos,{rol:'ambar',texto:r.respuesta,info:r}]);
  }catch(e){setSimulacion(simulacion);setPrueba(escrito);setAdjP(adj);setError(e instanceof Error?e.message:'Error');}finally{setBusy('');}
 };
 return <div style={{display:'grid',gap:16}}>
  <IaConsumo/>
  {auto&&<section className={styles.card} style={{display:'grid',gap:8,borderColor:auto.activa?'#10b981':undefined}}>
   <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
    <h2 style={{margin:0,flex:1}}>Respuesta automática: {auto.activa?'ENCENDIDA':'APAGADA'}</h2>
    <button className={`${styles.button} ${auto.activa?styles.danger:styles.primary}`} disabled={!!busy} onClick={()=>void guardarAuto({...auto,activa:!auto.activa})}>{busy==='auto'?'Guardando…':auto.activa?'Apagar para todos los chats':'Encender para todos los chats'}</button>
   </div>
   <p className={styles.help}>{auto.activa?'La IA contesta sola en los chats activos.':'La IA solo deja sugerencias; las asesoras envían.'} Nunca responde sola los chats marcados «Atender persona». Cuando una asesora escribe en un chat (desde el ERP o el celular), la IA se pausa en ese chat; la asesora la reactiva con su botón o vuelve sola después de:
    {' '}<select value={auto.horas} disabled={!!busy} onChange={e=>void guardarAuto({...auto,horas:Number(e.target.value)})}>{[1,2,4,6,8,12,24,48,72].map(h=><option key={h} value={h}>{h} hora{h===1?'':'s'}</option>)}</select> sin que la asesora escriba.</p>
  </section>}
  <Faltantes onChange={()=>void load()}/>
  <section className={styles.card} style={{display:'grid',gap:10}}>
   <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><h2 style={{margin:0,flex:1}}>Conocimientos de la IA</h2>
    <button className={styles.button} disabled={!!busy} title="Compara los chats que terminaron en cita con los que no y propone mejoras. También se hace solo cada lunes." onClick={()=>void conversar({accion:'analisis'})}>{busy==='ajustar'?'Analizando…':'📊 Analizar la última semana'}</button></div>
   <p className={styles.help}>Conversa con ella como con una persona: pregúntale qué sabe («¿qué sabes del depósito?»), enséñale algo nuevo o corrígela. Antes de cambiar algo te muestra el antes y el después y te pide confirmar; nada se guarda sin tu «sí».</p>
   <div style={{background:'#f8fafc',borderRadius:12,padding:10,display:'grid',gap:6,maxHeight:'55vh',overflowY:'auto'}}>
    {!chat.length&&<p className={styles.empty}>Escribe tu primera pregunta o lo que quieres que aprenda.</p>}
    {chat.map(m=><div key={m.id} style={{justifySelf:m.rol==='admin'?'end':'start',maxWidth:'90%',background:m.rol==='admin'?'#dcfce7':'#f5f3ff',border:'1px solid #e2e8f0',borderRadius:12,padding:'6px 10px',display:'grid',gap:6}}>
     <div style={{whiteSpace:'pre-wrap',fontSize:14}}>{m.texto}</div>
     {m.propuesta&&m.propuesta.length>0&&<div style={{display:'grid',gap:6}}>
      {m.propuesta.map((c,i)=><div key={i} style={{background:'#fff',border:'1px solid #e9d5ff',borderRadius:10,padding:8,fontSize:13}}>
       <strong>{SECCION[c.seccion]||c.seccion} · {c.operacion==='agregar'?'Agregar':c.operacion==='quitar'?'Quitar':'Corregir'}</strong>
       {c.antes&&<div style={{whiteSpace:'pre-wrap',color:'#b91c1c',textDecoration:c.operacion==='agregar'?'none':'line-through'}}>Antes: {c.antes}</div>}
       {c.despues&&<div style={{whiteSpace:'pre-wrap',color:'#047857'}}>{c.operacion==='agregar'?'Nuevo':'Después'}: {c.despues}</div>}
      </div>)}
      {m.estado==='pendiente'?<div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
       <button className={`${styles.button} ${styles.primary}`} disabled={!!busy} onClick={()=>void conversar({accion:'conocimiento_decidir',aplicar:true})}>Sí, ajústalo</button>
       <button className={styles.button} disabled={!!busy} onClick={()=>void conversar({accion:'conocimiento_decidir',aplicar:false})}>No, déjalo así</button></div>
      :<small style={{fontWeight:700,color:m.estado==='aplicada'?'#047857':'#64748b'}}>{m.estado==='aplicada'?'✓ Aplicado':'Descartado'}</small>}
     </div>}
     <small style={{color:'#94a3b8'}}>{hora(m.created_at)}</small>
    </div>)}
    {busy==='ajustar'&&<small className={styles.help}>La IA está pensando… (puede tardar hasta un minuto)</small>}
   </div>
   <div style={{display:'flex',gap:8,alignItems:'flex-end'}}><textarea rows={2} value={pedido} onChange={e=>setPedido(e.target.value)} maxLength={4000} placeholder="Ej.: ¿Qué sabes del depósito? · Agrega que los domingos solo atendemos con cita" style={{flex:1,minWidth:0,resize:'vertical'}}/>
    <Adjuntar archivos={adjK} disabled={!!busy} onElegir={f=>void elegir(f,setAdjK)} onQuitar={i=>setAdjK(a=>a.filter((_,j)=>j!==i))}/>
    <button className={`${styles.button} ${styles.primary}`} disabled={(!pedido.trim()&&!adjK.length)||!!busy} onClick={ajustar}><Send size={14} style={{display:'inline',verticalAlign:'-2px'}}/> Enviar</button></div>
   <AdjuntosLista archivos={adjK} onQuitar={i=>setAdjK(a=>a.filter((_,j)=>j!==i))}/>
   {error&&<p role="alert" className={styles.error}>{error}</p>}{notice&&<p role="status" className={styles.notice}>{notice}</p>}
   <small className={styles.help}>{meta}</small>
  </section>
  <details className={styles.card}><summary style={{cursor:'pointer',fontWeight:800}}>Ver o editar el texto completo</summary><div style={{display:'grid',gap:12,marginTop:10}}>
   <p className={styles.help}>Escribe en español normal. La IA ya sabe sola las direcciones, WhatsApp, mapas y enlaces de agenda de cada sede, y las citas y contratos de cada clienta. Nunca inventa precios ni disponibilidad, y nunca envía nada sola: la asesora revisa cada respuesta.</p>
   {IA_FIELDS.map(([k,l,h,ph])=><label key={k} style={{display:'grid',gap:4}}><strong>{l}</strong><small className={styles.help}>{h}</small>
    <textarea rows={k==='conocimientos'?10:6} value={cfg[k]} onChange={e=>setCfg({...cfg,[k]:e.target.value})} placeholder={ph} style={{width:'100%',resize:'vertical'}}/></label>)}
   <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><button className={`${styles.button} ${styles.primary}`} disabled={!dirty||!!busy} onClick={()=>void guardar()}>{busy==='guardar'?'Guardando…':'Guardar cambios'}</button>
    {dirty&&<button className={styles.button} disabled={!!busy} onClick={()=>saved&&setCfg(saved)}>Descartar</button>}{dirty&&<small style={{color:'#b45309',fontWeight:700}}>Hay cambios sin guardar</small>}</div>
  </div></details>
  <section className={styles.card} style={{display:'grid',gap:8}}>
   <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><h2 style={{margin:0,flex:1}}>Probar como clienta</h2>{simulacion.length>0&&<button className={styles.button} disabled={!!busy} onClick={()=>setSimulacion([])}>Nueva conversación</button>}</div>
   <p className={styles.help}>Chatea como si fueras una clienta: la IA responde como Ámbar con lo que está escrito arriba, aunque no lo hayas guardado. Así ves cómo lleva una conversación completa. No se envía nada por WhatsApp.</p>
   {simulacion.length>0&&<div style={{background:'#f8fafc',borderRadius:12,padding:10,display:'grid',gap:6,maxHeight:'55vh',overflowY:'auto'}}>
    {simulacion.map((t,i)=><div key={i} style={{justifySelf:t.rol==='clienta'?'start':'end',maxWidth:'85%',background:t.rol==='clienta'?'#fff':'#dcfce7',border:'1px solid #e2e8f0',borderRadius:12,padding:'6px 10px',display:'grid',gap:4}}>
     <div style={{whiteSpace:'pre-wrap',fontSize:14}}>{t.texto}</div>
     {t.info&&<div style={{display:'flex',gap:4,flexWrap:'wrap',alignItems:'center'}}><span className={styles.badge}>{t.info.etiqueta}</span>{t.info.sede&&<span className={styles.badge}>{t.info.sede}</span>}
      {t.info.atender_persona&&<span className={styles.badge} style={{background:'#fee2e2',color:'#b91c1c'}}>Atender persona: {t.info.motivo}</span>}<small style={{color:'#6d28d9'}}>{t.info.resumen}</small></div>}
    </div>)}
    {busy==='probar'&&<small className={styles.help} style={{justifySelf:'end'}}>Ámbar está escribiendo…</small>}
   </div>}
   <div style={{display:'flex',gap:8,alignItems:'flex-end'}}><textarea rows={2} value={prueba} onChange={e=>setPrueba(e.target.value)} maxLength={2000} placeholder={simulacion.length?'Responde como la clienta…':'Ej.: Hola, quiero ver el catálogo de XV'} style={{flex:1,minWidth:0,resize:'vertical'}}/>
    <Adjuntar archivos={adjP} disabled={!!busy} onElegir={f=>void elegir(f,setAdjP)} onQuitar={i=>setAdjP(a=>a.filter((_,j)=>j!==i))}/>
    <button className={`${styles.button} ${styles.primary}`} disabled={(!prueba.trim()&&!adjP.length)||!!busy} onClick={()=>void probar()}><Send size={14} style={{display:'inline',verticalAlign:'-2px'}}/> Enviar</button></div>
   <AdjuntosLista archivos={adjP} onQuitar={i=>setAdjP(a=>a.filter((_,j)=>j!==i))}/>
  </section>
  {hist.length>0&&<section className={styles.card}><h2>Historial de cambios</h2><div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Fecha</th><th>Resumen</th><th></th></tr></thead>
   <tbody>{hist.map(h=><tr key={h.id}><td>{hora(h.created_at)}</td><td><small>{h.conocimientos.length} car. de conocimientos · {h.instrucciones.length} de instrucciones · {h.escalamiento.length} de reglas</small></td>
    <td><button className={styles.button} onClick={()=>setCfg({conocimientos:h.conocimientos,instrucciones:h.instrucciones,escalamiento:h.escalamiento})}>Cargar esta versión</button></td></tr>)}</tbody></table></div>
   <p className={styles.help}>«Cargar esta versión» la pone en los campos de arriba; se aplica al tocar «Guardar cambios».</p></section>}
 </div>;
}

/** Paperclip button: images, PDF, Word or text for the AI to analyze (audio and video are not supported yet). */
function Adjuntar({archivos,disabled,onElegir}:{archivos:AdjuntoCliente[];disabled:boolean;onElegir:(f:FileList|null)=>void;onQuitar:(i:number)=>void}){
 return <label className={styles.button} title="Adjuntar foto, PDF o Word" style={{cursor:disabled||archivos.length>=4?'default':'pointer',opacity:disabled||archivos.length>=4?.5:1}}>
  <Paperclip size={14} style={{display:'inline',verticalAlign:'-2px'}}/><input type="file" multiple accept={ACCEPT_ADJUNTOS} disabled={disabled||archivos.length>=4} hidden onChange={e=>{onElegir(e.target.files);e.target.value='';}}/></label>;
}
function AdjuntosLista({archivos,onQuitar}:{archivos:AdjuntoCliente[];onQuitar:(i:number)=>void}){
 if(!archivos.length)return null;
 return <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{archivos.map((a,i)=><span key={i} className={styles.badge} style={{display:'inline-flex',gap:6,alignItems:'center'}}>📎 {a.nombre}<button type="button" onClick={()=>onQuitar(i)} aria-label={`Quitar ${a.nombre}`} style={{border:0,background:'none',cursor:'pointer'}}>×</button></span>)}
  <small className={styles.help}>La IA puede leer fotos, PDF, Word y texto. Audios y videos todavía no.</small></div>;
}

function Inbox(){
 const [convs,setConvs]=useState<Conv[]>([]),[sedes,setSedes]=useState<{id:string;nombre:string}[]>([]),[sel,setSel]=useState<string|null>(null);
 const [filtro,setFiltro]=useState('todas'),[q,setQ]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true),[auto,setAuto]=useState(false);
 // ?tel=57…: opened from a customer's file (Primeras visitas › WhatsApp): open her 304 chat, or say she has none yet.
 const [iniciando,setIniciando]=useState(false);
 const iniciar=async(t:string)=>{setIniciando(true);setError('');try{const d=await api({accion:'iniciar',telefono:t});setSinChat('');await load();if(d.conversacion_id)setSel(d.conversacion_id);}catch(e){setError(e instanceof Error?e.message:'No se pudo enviar.');}finally{setIniciando(false);}};
 const [abrirTel,setAbrirTel]=useState(''),[sinChat,setSinChat]=useState('');
 useEffect(()=>{const p=new URLSearchParams(window.location.search),t=p.get('tel')?.replace(/\D/g,'')||'';if(t.length>=10)setTimeout(()=>setAbrirTel(t),0);
  // ?filtro=atender: from the «Atención de una persona» pop-up.
  if(p.get('filtro')==='atender')setTimeout(()=>setFiltro('atender'),0);},[]);
 useEffect(()=>{if(!abrirTel||loading)return;const t=abrirTel;setTimeout(()=>setAbrirTel(''),0);
  // Older chats may be beyond the 300 loaded: look the phone up directly.
  void (async()=>{const c=convs.find(x=>x.telefono.slice(-10)===t.slice(-10))||((await supabase.from('whatsapp_conversaciones').select('*').like('telefono',`%${t.slice(-10)}`).limit(1).maybeSingle()).data as Conv|null);
   if(c){setConvs(l=>l.some(x=>x.id===c.id)?l:[c,...l]);setSel(c.id);setSinChat('');}else setSinChat(t);})();},[abrirTel,loading,convs]);
 // The open chat stays open even if it is not among the 300 most recent (opened from a customer's file or the Pipeline).
 const selRef=useRef<string|null>(null);
 useEffect(()=>{selRef.current=sel;},[sel]);
 const load=useCallback(async()=>{
  const {data,error:e}=await supabase.from('whatsapp_conversaciones').select('*').order('ultimo_at',{ascending:false}).limit(300);
  if(e)setError(e.message);else{
   let list=(data||[]) as Conv[];const open=selRef.current;
   if(open&&!list.some(c=>c.id===open)){const {data:c}=await supabase.from('whatsapp_conversaciones').select('*').eq('id',open).maybeSingle();if(c)list=[c as Conv,...list];}
   setConvs(list);setError('');}
  setLoading(false);
 },[]);
 useEffect(()=>{
  void supabase.from('sedes').select('id,nombre').eq('activo',true).order('nombre').then(({data})=>setSedes(data||[]));
  void supabase.rpc('whatsapp_ia_auto_estado').then(({data})=>setAuto(!!(data as {activa?:boolean}|null)?.activa));
  // Real time: any change in the chats the user can see (RLS) reloads the list at once; a slow poll stays as a safety net.
  let pending:ReturnType<typeof setTimeout>|null=null;
  const soon=()=>{if(pending)return;pending=setTimeout(()=>{pending=null;void load();},300);};
  // A changed chat arrives whole in the event: only that one is updated (the 300 are reloaded only for new or removed chats).
  const cambio=(e:{eventType:string;new:Record<string,unknown>})=>{
   const c=e.new as Conv|undefined;
   if(e.eventType!=='UPDATE'||!c?.id){soon();return;}
   setConvs(l=>{if(!l.some(x=>x.id===c.id)){soon();return l;}return l.map(x=>x.id===c.id?{...x,...c}:x).sort((a,b)=>Date.parse(b.ultimo_at||'')-Date.parse(a.ultimo_at||''));});
  };
  const channel=supabase.channel('wa-conversaciones').on('postgres_changes',{event:'*',schema:'public',table:'whatsapp_conversaciones'},cambio).subscribe();
  const first=setTimeout(()=>void load(),0),t=setInterval(()=>{if(document.visibilityState==='visible')void load();},30000);
  return()=>{clearTimeout(first);clearInterval(t);if(pending)clearTimeout(pending);void supabase.removeChannel(channel);};
 },[load]);
 const sedeName=(id:string|null)=>sedes.find(s=>s.id===id)?.nombre||'Sin sede';
 const lista=useMemo(()=>convs.filter(c=>(filtro==='todas'||(filtro==='sin_leer'&&c.no_leidos>0)||(filtro==='atender'&&c.ia_atender)||(filtro.startsWith('atender:')&&c.ia_atender&&c.sede_id===filtro.slice(8))||(filtro==='sin_sede'&&!c.sede_id)||(filtro==='plan_ahorro'&&!!c.plan_ahorro_at)||c.sede_id===filtro)
  &&`${c.nombre||''} ${c.telefono}`.toLowerCase().includes(q.trim().toLowerCase())),[convs,filtro,q]);
 const current=convs.find(c=>c.id===sel)||null;
 return <>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {sinChat&&<p role="status" className={styles.notice}>Esta clienta todavía no ha escrito al 304. Puedes iniciar la conversación con un saludo aprobado por Meta; cuando responda, sigues escribiéndole normal desde aquí. <button type="button" className={`${styles.button} ${styles.primary}`} disabled={iniciando} onClick={()=>void iniciar(sinChat)}>{iniciando?'Enviando…':'Enviarle un saludo desde el ERP'}</button> · <a href={`https://wa.me/${sinChat}`} target="_blank" rel="noopener noreferrer">o desde el celular del 304</a> · <button type="button" onClick={()=>setSinChat('')}>Cerrar</button></p>}
  <div style={{display:'grid',gridTemplateColumns:'minmax(0,360px) minmax(0,1fr)',gap:16,alignItems:'start'}} className="wa-grid">
   <style>{`@media(max-width:860px){.wa-grid{grid-template-columns:minmax(0,1fr)!important}.wa-grid>.wa-hide{display:none}}`}</style>
   <section className={`${styles.card} ${sel&&current?'wa-hide':''}`} style={{padding:12}}>
    <div style={{display:'flex',gap:8,marginBottom:8}}>
     <input aria-label="Buscar chat" placeholder="Buscar nombre o celular" value={q} onChange={e=>setQ(e.target.value)} style={{flex:1,minWidth:0}}/>
     <button className={styles.button} onClick={()=>void load()} aria-label="Actualizar"><RefreshCw size={14}/></button>
    </div>
    <select aria-label="Filtrar chats" value={filtro} onChange={e=>setFiltro(e.target.value)} style={{width:'100%',marginBottom:8}}>
     <option value="todas">Todos los chats</option><option value="atender">Atender persona</option><option value="sin_leer">Sin leer</option><option value="sin_sede">Sin sede</option><option value="plan_ahorro">Interesadas en Plan Ahorro XV</option>
     {sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}
     {sedes.map(s=><option key={`a-${s.id}`} value={`atender:${s.id}`}>Atender persona · {s.nombre}</option>)}
    </select>
    {loading?<p className={styles.empty}>Cargando chats…</p>:!lista.length?<p className={styles.empty}>{convs.length?'Ningún chat con ese filtro.':'Aún no hay chats. Llegan aquí desde que una clienta escriba al 304.'}</p>:
    <div style={{display:'grid',gap:4,gridAutoRows:'max-content',alignContent:'start',height:'calc(100vh - 300px)',minHeight:320,overflowY:'auto',overflowX:'hidden'}}>
     {lista.map(c=><button key={c.id} type="button" onClick={()=>setSel(c.id)} style={{display:'grid',gap:2,flexShrink:0,minHeight:64,width:'100%',minWidth:0,boxSizing:'border-box',overflow:'hidden',textAlign:'left',padding:'8px 10px',borderRadius:12,border:'1px solid',borderColor:sel===c.id?'#10b981':'#f1f5f9',background:sel===c.id?'#ecfdf5':'#fff',cursor:'pointer'}}>
      <span style={{display:'flex',alignItems:'center',gap:6,minWidth:0}}>
       <strong style={{flex:1,minWidth:0,fontSize:14,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.nombre||tel(c.telefono)}</strong>
       <small style={{flexShrink:0,color:c.no_leidos>0?'#047857':'#64748b',fontWeight:c.no_leidos>0?800:400}}>{horaCorta(c.ultimo_at)}</small>
       {c.no_leidos>0&&<span style={{flexShrink:0,background:'#10b981',color:'#fff',borderRadius:999,fontSize:11,fontWeight:800,padding:'1px 7px'}}>{c.no_leidos}</span>}
      </span>
      <small style={{display:'block',minWidth:0,color:'#475569',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.ultimo_mensaje||'—'}</small>
      <small style={{display:'block',minWidth:0,color:'#94a3b8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.canal&&CANAL[c.canal]&&<b style={{color:'#9333ea'}}>{CANAL[c.canal]} · </b>}{sedeName(c.sede_id)}{c.etiqueta?` · ${c.etiqueta}`:''}{c.ia_atender&&<b style={{color:'#b91c1c'}}> · ● Atender persona</b>}{c.plan_ahorro_at&&<b style={{color:'#0f766e'}}> · Plan Ahorro</b>}{auto&&c.ia_pausada&&<b style={{color:'#b45309'}}> · IA pausada</b>}</small>
     </button>)}
    </div>}
   </section>
   {current?<Chat key={current.id} conv={current} auto={auto} sedes={sedes} onBack={()=>setSel(null)} onChange={load}/>:<section className={`${styles.card} wa-hide`}><p className={styles.empty}>Elige un chat para verlo.</p></section>}
  </div>
 </>;
}

const FOTOS=new Map<string,string>();
/** Customer photo inside the chat: saved in the ERP the first time; loaded when visible; tap to see it large. */
function Foto({conversacion,mensaje}:{conversacion:string;mensaje:string}){
 const [src,setSrc]=useState(()=>FOTOS.get(mensaje)||''),[error,setError]=useState(''),[grande,setGrande]=useState(false),[visible,setVisible]=useState(false);
 const caja=useRef<HTMLDivElement>(null);
 // Loaded only when it scrolls into view; the link is remembered while the page is open (reopening the chat is instant).
 useEffect(()=>{const el=caja.current;if(!el||src)return;const o=new IntersectionObserver(e=>{if(e.some(x=>x.isIntersecting)){setVisible(true);o.disconnect();}},{rootMargin:'200px'});o.observe(el);return()=>o.disconnect();},[src]);
 useEffect(()=>{if(!visible||src)return;let vivo=true;api({accion:'foto',conversacion_id:conversacion,mensaje_id:mensaje}).then(d=>{const u=d.url||`data:${d.tipo};base64,${d.datos}`;FOTOS.set(mensaje,u);if(vivo)setSrc(u);}).catch(e=>{if(vivo)setError(e instanceof Error?e.message:'No se pudo cargar la foto.');});return()=>{vivo=false;};},[visible,src,conversacion,mensaje]);
 if(!src&&!error)return <div ref={caja}><small style={{color:'#64748b'}}>Cargando foto…</small></div>;;
 if(error)return <small style={{color:'#64748b'}}>{error}</small>;
 if(!src)return <small style={{color:'#64748b'}}>Cargando foto…</small>;
 return <>
  {/* eslint-disable-next-line @next/next/no-img-element */}
  <img src={src} alt="Foto enviada por la clienta" onClick={()=>setGrande(true)} style={{display:'block',maxWidth:'100%',maxHeight:220,borderRadius:8,cursor:'zoom-in',marginBottom:4}}/>
  {grande&&<div role="dialog" aria-label="Foto" onClick={()=>setGrande(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',display:'grid',placeItems:'center',zIndex:1000,padding:16,cursor:'zoom-out'}}>
   {/* eslint-disable-next-line @next/next/no-img-element */}
   <img src={src} alt="Foto enviada por la clienta" style={{maxWidth:'100%',maxHeight:'100%',borderRadius:8}}/>
  </div>}
 </>;
}

function Chat({conv,auto,sedes,onBack,onChange}:{conv:Conv;auto:boolean;sedes:{id:string;nombre:string}[];onBack:()=>void;onChange:()=>Promise<void>}){
 const [msgs,setMsgs]=useState<Msg[]>([]),[ficha,setFicha]=useState<Ficha|null>(null),[texto,setTexto]=useState(''),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const end=useRef<HTMLDivElement>(null);
 const loadMsgs=useCallback(async()=>{
  const {data}=await supabase.from('whatsapp_mensajes').select('id,direccion,origen,texto,estado,created_at,media_id').eq('conversacion_id',conv.id).order('created_at',{ascending:true}).limit(500);
  setMsgs((data||[]) as Msg[]);
 },[conv.id]);
 useEffect(()=>{
  void loadMsgs();void supabase.rpc('whatsapp_ficha',{p_conversacion:conv.id}).then(({data})=>setFicha(data as Ficha|null));
  // Real time: new messages and delivery statuses of this chat appear at once; a slow poll stays as a safety net.
  const channel=supabase.channel(`wa-mensajes-${conv.id}`).on('postgres_changes',{event:'*',schema:'public',table:'whatsapp_mensajes',filter:`conversacion_id=eq.${conv.id}`},()=>void loadMsgs()).subscribe();
  const t=setInterval(()=>{if(document.visibilityState==='visible')void loadMsgs();},30000);
  return()=>{clearInterval(t);void supabase.removeChannel(channel);};
 },[conv.id,loadMsgs]);
 useEffect(()=>{if(conv.no_leidos>0)void api({accion:'leido',conversacion_id:conv.id}).then(onChange).catch(()=>{});},[conv.id,conv.no_leidos,onChange]);
 useEffect(()=>{end.current?.scrollIntoView({block:'end'});},[msgs.length]);
 const abierta=!!conv.ultimo_entrante_at&&Date.now()-Date.parse(conv.ultimo_entrante_at)<WINDOW_MS,social=/^(fb|ig):/.test(conv.telefono);
 const run=async(name:string,body:Record<string,unknown>,after?:()=>void)=>{setBusy(name);setError('');try{await api({...body,conversacion_id:conv.id});after?.();await Promise.all([onChange(),loadMsgs()]);}catch(e){setError(e instanceof Error?e.message:'Error');}finally{setBusy('');}};
 return <section className={styles.card} style={{padding:12,display:'grid',gap:10}}>
  <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
   <button className={styles.button} onClick={onBack} aria-label="Volver a la lista"><ArrowLeft size={14}/></button>
   <div style={{flex:1,minWidth:160}}><strong>{conv.nombre||tel(conv.telefono)}</strong><br/><small>{social?`Chat de ${tel(conv.telefono)}`:<>{tel(conv.telefono)} · <a href={`https://wa.me/${conv.telefono}`} target="_blank" rel="noreferrer">abrir en WhatsApp</a></>}{conv.anuncio_id&&<><br/>📣 Llegó por anuncio{conv.anuncio_titulo?`: ${conv.anuncio_titulo}`:''}</>}</small></div>
   {auto&&<button className={`${styles.button} ${conv.ia_pausada?'':styles.primary}`} disabled={!!busy} title={conv.ia_pausada?'La IA no contesta sola en este chat':'La IA contesta sola en este chat'} onClick={()=>void run('pausa',{accion:'pausa',pausada:!conv.ia_pausada})}>{conv.ia_pausada?'IA pausada · Reactivar':'IA activa · Pausar'}</button>}
   <label style={{fontSize:12}}>Sede <select value={conv.sede_id||''} disabled={!!busy} onChange={e=>void run('sede',{accion:'sede',sede_id:e.target.value||null})}><option value="">Sin sede</option>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
  </div>
  {ficha&&(ficha.citas.length>0||ficha.contratos.length>0)&&<div style={{display:'flex',gap:6,flexWrap:'wrap',fontSize:12}}>
   {ficha.contratos.map(c=><Link key={c.id} href={`/dashboard?contratoId=${encodeURIComponent(c.id)}`} className={styles.badge}>Contrato {c.numero_contrato} · {c.estado}{c.fecha_evento?` · evento ${c.fecha_evento}`:''}</Link>)}
   {ficha.citas.map(c=><Link key={c.id} href={`/dashboard/primeras-citas?dia=${c.fecha}`} className={styles.badge}>Cita {c.fecha} {String(c.hora||'').slice(0,5)} · {c.estado}{c.sede?` · ${c.sede}`:''}</Link>)}
  </div>}
  <div style={{background:'#f8fafc',borderRadius:12,padding:10,height:'calc(100vh - 520px)',minHeight:260,overflowY:'auto',overflowX:'hidden',display:'grid',gap:6,alignContent:'start'}}>
   {!msgs.length&&<p className={styles.empty}>Sin mensajes.</p>}
   {msgs.map(m=><div key={m.id} style={{justifySelf:m.direccion==='entrante'?'start':'end',maxWidth:'85%',background:m.direccion==='entrante'?'#fff':'#dcfce7',border:'1px solid #e2e8f0',borderRadius:12,padding:'6px 10px'}}>
    {m.media_id&&<Foto conversacion={conv.id} mensaje={m.id}/>}
    <div style={{whiteSpace:'pre-wrap',fontSize:14,overflowWrap:'anywhere'}}>{m.texto||'—'}</div>
    <small style={{color:'#64748b'}}>{hora(m.created_at)}{ORIGEN[m.origen]?` · ${ORIGEN[m.origen]}`:''}{m.direccion==='saliente'&&m.estado?` · ${ESTADO[m.estado]||m.estado}`:''}</small>
   </div>)}
   <div ref={end}/>
  </div>
  <div style={{border:'1px solid #ddd6fe',background:'#f5f3ff',borderRadius:12,padding:10,display:'grid',gap:6}}>
   <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><Sparkles size={15} color="#7c3aed"/><strong style={{fontSize:13}}>IA</strong>{conv.etiqueta&&<span className={styles.badge}>{conv.etiqueta}</span>}<small style={{color:'#6d28d9',flex:1}}>{conv.ia_resumen||''}</small>
    <button className={styles.button} disabled={!!busy} onClick={()=>void run('ia',{accion:'ia'})}>{busy==='ia'?'Pensando…':'Volver a sugerir'}</button></div>
   {conv.ia_atender&&<p role="alert" style={{margin:0,color:'#b91c1c',fontWeight:800,fontSize:13}}>Atender persona: {conv.ia_motivo||'la IA recomienda que la atienda una asesora'}</p>}
   {conv.plan_ahorro_at&&<p style={{margin:0,display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',fontSize:13,color:'#0f766e',fontWeight:800}}>Interesada en el Plan Ahorro XV<a className={`${styles.button} ${styles.primary}`} href={`/dashboard/plan-ahorro?nuevo=1&tel=${encodeURIComponent(conv.telefono)}&nombre=${encodeURIComponent(conv.nombre||'')}${conv.sede_id?`&sede=${conv.sede_id}`:''}`}>Inscribir en el plan</a></p>}
   {conv.ia_error&&<small style={{color:'#b91c1c'}}>La IA no pudo responder: {conv.ia_error}</small>}
   {conv.ia_sugerencia?<><div style={{whiteSpace:'pre-wrap',fontSize:14}}>{conv.ia_sugerencia}</div>
    <div><button className={styles.button} onClick={()=>setTexto(conv.ia_sugerencia||'')}>Usar sugerencia</button></div></>
    :!conv.ia_error&&<small style={{color:'#64748b'}}>Sin sugerencia pendiente. Aparece cuando la clienta escribe.</small>}
  </div>
  {!abierta&&social&&<p className={styles.help}>Pasaron más de 24 horas desde el último mensaje de la clienta: Meta no deja responderle por aquí. Escríbele desde Meta Business Suite.</p>}
  {!abierta&&!social&&<p className={styles.help}>Pasaron más de 24 horas desde el último mensaje de la clienta: Meta solo deja escribirle con una plantilla. <button type="button" className={styles.button} disabled={!!busy} onClick={()=>void run('iniciar',{accion:'iniciar',telefono:conv.telefono})}>{busy==='iniciar'?'Enviando…':'Enviarle un saludo para retomar'}</button> Cuando responda, le escribes normal.</p>}
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <div style={{display:'flex',gap:8,alignItems:'flex-end'}}>
   <textarea aria-label="Mensaje" rows={3} maxLength={4000} value={texto} onChange={e=>setTexto(e.target.value)} disabled={!abierta||!!busy} placeholder={abierta?'Escribe la respuesta…':'Ventana de 24 h cerrada'} style={{flex:1,minWidth:0,resize:'vertical'}}/>
   <button className={`${styles.button} ${styles.primary}`} disabled={!abierta||!texto.trim()||!!busy} onClick={()=>void run('enviar',{accion:'enviar',texto:texto.trim()},()=>setTexto(''))}><Send size={14} style={{display:'inline',verticalAlign:'-2px'}}/> {busy==='enviar'?'Enviando…':'Enviar'}</button>
  </div>
 </section>;
}
