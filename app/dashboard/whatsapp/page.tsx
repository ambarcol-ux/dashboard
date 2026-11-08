'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {MessageCircle,RefreshCw,Sparkles,Send,ArrowLeft} from 'lucide-react';
import SupplierShell from '@/components/suppliers/SupplierShell';
import {supabase} from '@/lib/supabase';
import styles from '@/app/dashboard/caja/caja.module.css';

type Conv={id:string;telefono:string;nombre:string|null;sede_id:string|null;ultimo_mensaje:string|null;ultimo_at:string;ultimo_entrante_at:string|null;no_leidos:number;etiqueta:string|null;ia_resumen:string|null;ia_sugerencia:string|null;ia_at:string|null;ia_error:string|null;ia_atender:boolean;ia_motivo:string|null;ia_pausada:boolean;ia_pausada_at:string|null;anuncio_id:string|null;anuncio_titulo:string|null};
type Msg={id:string;direccion:'entrante'|'saliente';origen:'clienta'|'erp'|'celular'|'ia';texto:string|null;estado:string|null;created_at:string};
type Ficha={nombre:string|null;citas:{id:string;fecha:string;hora:string;estado:string;modalidad:string;sede:string|null;tipo_vestido:string|null}[];contratos:{id:string;numero_contrato:string;estado:string;fecha_evento:string|null;sede:string|null}[]};
const WINDOW_MS=24*3600*1000;
// List: time only for today, date only for earlier days, so it always fits next to the name.
const horaCorta=(iso:string)=>{const d=new Date(iso),dia=(x:Date)=>x.toLocaleDateString('es-CO',{timeZone:'America/Bogota'});return dia(d)===dia(new Date())?d.toLocaleTimeString('es-CO',{timeZone:'America/Bogota',hour:'numeric',minute:'2-digit'}):d.toLocaleDateString('es-CO',{timeZone:'America/Bogota',day:'numeric',month:'numeric'});};
const hora=(iso:string)=>{const d=new Date(iso),hoy=new Date().toDateString()===d.toDateString();return d.toLocaleString('es-CO',{timeZone:'America/Bogota',...(hoy?{timeStyle:'short'}:{dateStyle:'short',timeStyle:'short'})});};
const tel=(t:string)=>t.startsWith('57')&&t.length===12?`+57 ${t.slice(2,5)} ${t.slice(5,8)} ${t.slice(8)}`:`+${t}`;
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
 const [tab,setTab]=useState<'chats'|'ia'|'anuncios'>('chats');
 return <>
  {admin&&<div className={styles.toolbar} style={{marginBottom:12}}>{([['chats','Chats'],['ia','IA de WhatsApp'],['anuncios','Anuncios']] as const).map(([k,l])=><button key={k} type="button" className={tab===k?styles.primary:undefined} onClick={()=>setTab(k)}>{l}</button>)}</div>}
  {tab==='chats'?<Inbox/>:tab==='ia'?<IaSettings/>:<AdsPanel/>}
 </>;
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
function IaSettings(){
 const [cfg,setCfg]=useState<IaCfg>({conocimientos:'',instrucciones:'',escalamiento:''}),[saved,setSaved]=useState<IaCfg|null>(null),[meta,setMeta]=useState('');
 const [hist,setHist]=useState<(IaCfg&{id:number;created_at:string})[]>([]),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 type Cambio={seccion:keyof IaCfg;operacion:'agregar'|'reemplazar'|'quitar';antes:string;despues:string};
 const [chat,setChat]=useState<{id:number;rol:'admin'|'ia';texto:string;propuesta:Cambio[]|null;estado:string|null;created_at:string}[]>([]),[pedido,setPedido]=useState('');
 const [auto,setAuto]=useState<{activa:boolean;horas:number}|null>(null);
 type Turno={rol:'clienta'|'ambar';texto:string;info?:{etiqueta:string;resumen:string;atender_persona:boolean;motivo:string;sede:string}};
 const [prueba,setPrueba]=useState(''),[simulacion,setSimulacion]=useState<Turno[]>([]);
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
 const ajustar=()=>{const texto=pedido.trim();if(texto)void conversar({accion:'conocimiento',texto},texto);};
 const SECCION:Record<string,string>={conocimientos:'Conocimientos',instrucciones:'Instrucciones y tono',escalamiento:'Reglas de paso a una persona'};
 // Simulated chat: you write as the customer, the AI answers as Ámbar with the settings above (saved or not).
 const probar=async()=>{
  const texto=prueba.trim();if(!texto)return;
  const turnos:Turno[]=[...simulacion,{rol:'clienta',texto}];
  setSimulacion(turnos);setPrueba('');setBusy('probar');setError('');
  try{
   const r=await api({accion:'probar',conversacion:turnos.map(t=>({rol:t.rol,texto:t.texto})),...cfg}) as {etiqueta:string;resumen:string;respuesta:string;atender_persona:boolean;motivo:string;sede:string};
   setSimulacion([...turnos,{rol:'ambar',texto:r.respuesta,info:r}]);
  }catch(e){setSimulacion(simulacion);setPrueba(texto);setError(e instanceof Error?e.message:'Error');}finally{setBusy('');}
 };
 return <div style={{display:'grid',gap:16}}>
  {auto&&<section className={styles.card} style={{display:'grid',gap:8,borderColor:auto.activa?'#10b981':undefined}}>
   <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
    <h2 style={{margin:0,flex:1}}>Respuesta automática: {auto.activa?'ENCENDIDA':'APAGADA'}</h2>
    <button className={`${styles.button} ${auto.activa?styles.danger:styles.primary}`} disabled={!!busy} onClick={()=>void guardarAuto({...auto,activa:!auto.activa})}>{busy==='auto'?'Guardando…':auto.activa?'Apagar para todos los chats':'Encender para todos los chats'}</button>
   </div>
   <p className={styles.help}>{auto.activa?'La IA contesta sola en los chats activos.':'La IA solo deja sugerencias; las asesoras envían.'} Nunca responde sola los chats marcados «Atender persona». Cuando una asesora escribe en un chat (desde el ERP o el celular), la IA se pausa en ese chat; la asesora la reactiva con su botón o vuelve sola después de:
    {' '}<select value={auto.horas} disabled={!!busy} onChange={e=>void guardarAuto({...auto,horas:Number(e.target.value)})}>{[1,2,4,6,8,12,24,48,72].map(h=><option key={h} value={h}>{h} hora{h===1?'':'s'}</option>)}</select> sin que la asesora escriba.</p>
  </section>}
  <section className={styles.card} style={{display:'grid',gap:10}}>
   <h2>Conocimientos de la IA</h2>
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
    <button className={`${styles.button} ${styles.primary}`} disabled={!pedido.trim()||!!busy} onClick={ajustar}><Send size={14} style={{display:'inline',verticalAlign:'-2px'}}/> Enviar</button></div>
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
    <button className={`${styles.button} ${styles.primary}`} disabled={!prueba.trim()||!!busy} onClick={()=>void probar()}><Send size={14} style={{display:'inline',verticalAlign:'-2px'}}/> Enviar</button></div>
  </section>
  {hist.length>0&&<section className={styles.card}><h2>Historial de cambios</h2><div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Fecha</th><th>Resumen</th><th></th></tr></thead>
   <tbody>{hist.map(h=><tr key={h.id}><td>{hora(h.created_at)}</td><td><small>{h.conocimientos.length} car. de conocimientos · {h.instrucciones.length} de instrucciones · {h.escalamiento.length} de reglas</small></td>
    <td><button className={styles.button} onClick={()=>setCfg({conocimientos:h.conocimientos,instrucciones:h.instrucciones,escalamiento:h.escalamiento})}>Cargar esta versión</button></td></tr>)}</tbody></table></div>
   <p className={styles.help}>«Cargar esta versión» la pone en los campos de arriba; se aplica al tocar «Guardar cambios».</p></section>}
 </div>;
}

function Inbox(){
 const [convs,setConvs]=useState<Conv[]>([]),[sedes,setSedes]=useState<{id:string;nombre:string}[]>([]),[sel,setSel]=useState<string|null>(null);
 const [filtro,setFiltro]=useState('todas'),[q,setQ]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true),[auto,setAuto]=useState(false);
 const load=useCallback(async()=>{
  const {data,error:e}=await supabase.from('whatsapp_conversaciones').select('*').order('ultimo_at',{ascending:false}).limit(300);
  if(e)setError(e.message);else{setConvs((data||[]) as Conv[]);setError('');}
  setLoading(false);
 },[]);
 useEffect(()=>{
  void supabase.from('sedes').select('id,nombre').eq('activo',true).order('nombre').then(({data})=>setSedes(data||[]));
  void supabase.rpc('whatsapp_ia_auto_estado').then(({data})=>setAuto(!!(data as {activa?:boolean}|null)?.activa));
  // Real time: any change in the chats the user can see (RLS) reloads the list at once; a slow poll stays as a safety net.
  let pending:ReturnType<typeof setTimeout>|null=null;
  const soon=()=>{if(pending)return;pending=setTimeout(()=>{pending=null;void load();},300);};
  const channel=supabase.channel('wa-conversaciones').on('postgres_changes',{event:'*',schema:'public',table:'whatsapp_conversaciones'},soon).subscribe();
  const first=setTimeout(()=>void load(),0),t=setInterval(()=>{if(document.visibilityState==='visible')void load();},30000);
  return()=>{clearTimeout(first);clearInterval(t);if(pending)clearTimeout(pending);void supabase.removeChannel(channel);};
 },[load]);
 const sedeName=(id:string|null)=>sedes.find(s=>s.id===id)?.nombre||'Sin sede';
 const lista=useMemo(()=>convs.filter(c=>(filtro==='todas'||(filtro==='sin_leer'&&c.no_leidos>0)||(filtro==='atender'&&c.ia_atender)||(filtro==='sin_sede'&&!c.sede_id)||c.sede_id===filtro)
  &&`${c.nombre||''} ${c.telefono}`.toLowerCase().includes(q.trim().toLowerCase())),[convs,filtro,q]);
 const current=convs.find(c=>c.id===sel)||null;
 return <>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <div style={{display:'grid',gridTemplateColumns:'minmax(0,360px) minmax(0,1fr)',gap:16,alignItems:'start'}} className="wa-grid">
   <style>{`@media(max-width:860px){.wa-grid{grid-template-columns:minmax(0,1fr)!important}.wa-grid>.wa-hide{display:none}}`}</style>
   <section className={`${styles.card} ${sel?'wa-hide':''}`} style={{padding:12}}>
    <div style={{display:'flex',gap:8,marginBottom:8}}>
     <input aria-label="Buscar chat" placeholder="Buscar nombre o celular" value={q} onChange={e=>setQ(e.target.value)} style={{flex:1,minWidth:0}}/>
     <button className={styles.button} onClick={()=>void load()} aria-label="Actualizar"><RefreshCw size={14}/></button>
    </div>
    <select aria-label="Filtrar chats" value={filtro} onChange={e=>setFiltro(e.target.value)} style={{width:'100%',marginBottom:8}}>
     <option value="todas">Todos los chats</option><option value="atender">Atender persona</option><option value="sin_leer">Sin leer</option><option value="sin_sede">Sin sede</option>
     {sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}
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
      <small style={{display:'block',minWidth:0,color:'#94a3b8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sedeName(c.sede_id)}{c.etiqueta?` · ${c.etiqueta}`:''}{c.ia_atender&&<b style={{color:'#b91c1c'}}> · ● Atender persona</b>}{auto&&c.ia_pausada&&<b style={{color:'#b45309'}}> · IA pausada</b>}</small>
     </button>)}
    </div>}
   </section>
   {current?<Chat key={current.id} conv={current} auto={auto} sedes={sedes} onBack={()=>setSel(null)} onChange={load}/>:<section className={`${styles.card} wa-hide`}><p className={styles.empty}>Elige un chat para verlo.</p></section>}
  </div>
 </>;
}

function Chat({conv,auto,sedes,onBack,onChange}:{conv:Conv;auto:boolean;sedes:{id:string;nombre:string}[];onBack:()=>void;onChange:()=>Promise<void>}){
 const [msgs,setMsgs]=useState<Msg[]>([]),[ficha,setFicha]=useState<Ficha|null>(null),[texto,setTexto]=useState(''),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const end=useRef<HTMLDivElement>(null);
 const loadMsgs=useCallback(async()=>{
  const {data}=await supabase.from('whatsapp_mensajes').select('id,direccion,origen,texto,estado,created_at').eq('conversacion_id',conv.id).order('created_at',{ascending:true}).limit(500);
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
 const abierta=!!conv.ultimo_entrante_at&&Date.now()-Date.parse(conv.ultimo_entrante_at)<WINDOW_MS;
 const run=async(name:string,body:Record<string,unknown>,after?:()=>void)=>{setBusy(name);setError('');try{await api({...body,conversacion_id:conv.id});after?.();await Promise.all([onChange(),loadMsgs()]);}catch(e){setError(e instanceof Error?e.message:'Error');}finally{setBusy('');}};
 return <section className={styles.card} style={{padding:12,display:'grid',gap:10}}>
  <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
   <button className={styles.button} onClick={onBack} aria-label="Volver a la lista"><ArrowLeft size={14}/></button>
   <div style={{flex:1,minWidth:160}}><strong>{conv.nombre||tel(conv.telefono)}</strong><br/><small>{tel(conv.telefono)} · <a href={`https://wa.me/${conv.telefono}`} target="_blank" rel="noreferrer">abrir en WhatsApp</a>{conv.anuncio_id&&<><br/>📣 Llegó por anuncio{conv.anuncio_titulo?`: ${conv.anuncio_titulo}`:''}</>}</small></div>
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
    <div style={{whiteSpace:'pre-wrap',fontSize:14,overflowWrap:'anywhere'}}>{m.texto||'—'}</div>
    <small style={{color:'#64748b'}}>{hora(m.created_at)}{ORIGEN[m.origen]?` · ${ORIGEN[m.origen]}`:''}{m.direccion==='saliente'&&m.estado?` · ${ESTADO[m.estado]||m.estado}`:''}</small>
   </div>)}
   <div ref={end}/>
  </div>
  <div style={{border:'1px solid #ddd6fe',background:'#f5f3ff',borderRadius:12,padding:10,display:'grid',gap:6}}>
   <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><Sparkles size={15} color="#7c3aed"/><strong style={{fontSize:13}}>IA</strong>{conv.etiqueta&&<span className={styles.badge}>{conv.etiqueta}</span>}<small style={{color:'#6d28d9',flex:1}}>{conv.ia_resumen||''}</small>
    <button className={styles.button} disabled={!!busy} onClick={()=>void run('ia',{accion:'ia'})}>{busy==='ia'?'Pensando…':'Volver a sugerir'}</button></div>
   {conv.ia_atender&&<p role="alert" style={{margin:0,color:'#b91c1c',fontWeight:800,fontSize:13}}>Atender persona: {conv.ia_motivo||'la IA recomienda que la atienda una asesora'}</p>}
   {conv.ia_error&&<small style={{color:'#b91c1c'}}>La IA no pudo responder: {conv.ia_error}</small>}
   {conv.ia_sugerencia?<><div style={{whiteSpace:'pre-wrap',fontSize:14}}>{conv.ia_sugerencia}</div>
    <div><button className={styles.button} onClick={()=>setTexto(conv.ia_sugerencia||'')}>Usar sugerencia</button></div></>
    :!conv.ia_error&&<small style={{color:'#64748b'}}>Sin sugerencia pendiente. Aparece cuando la clienta escribe.</small>}
  </div>
  {!abierta&&<p className={styles.help}>Pasaron más de 24 horas desde el último mensaje de la clienta: Meta solo deja escribirle con una plantilla. Respóndele desde el celular del 304.</p>}
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <div style={{display:'flex',gap:8,alignItems:'flex-end'}}>
   <textarea aria-label="Mensaje" rows={3} maxLength={4000} value={texto} onChange={e=>setTexto(e.target.value)} disabled={!abierta||!!busy} placeholder={abierta?'Escribe la respuesta…':'Ventana de 24 h cerrada'} style={{flex:1,minWidth:0,resize:'vertical'}}/>
   <button className={`${styles.button} ${styles.primary}`} disabled={!abierta||!texto.trim()||!!busy} onClick={()=>void run('enviar',{accion:'enviar',texto:texto.trim()},()=>setTexto(''))}><Send size={14} style={{display:'inline',verticalAlign:'-2px'}}/> {busy==='enviar'?'Enviando…':'Enviar'}</button>
  </div>
 </section>;
}
