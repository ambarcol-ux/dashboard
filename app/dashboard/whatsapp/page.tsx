'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {MessageCircle,RefreshCw,Sparkles,Send,ArrowLeft} from 'lucide-react';
import SupplierShell from '@/components/suppliers/SupplierShell';
import {supabase} from '@/lib/supabase';
import styles from '@/app/dashboard/caja/caja.module.css';

type Conv={id:string;telefono:string;nombre:string|null;sede_id:string|null;ultimo_mensaje:string|null;ultimo_at:string;ultimo_entrante_at:string|null;no_leidos:number;etiqueta:string|null;ia_resumen:string|null;ia_sugerencia:string|null;ia_at:string|null;ia_error:string|null};
type Msg={id:string;direccion:'entrante'|'saliente';origen:'clienta'|'erp'|'celular';texto:string|null;estado:string|null;created_at:string};
type Ficha={nombre:string|null;citas:{id:string;fecha:string;hora:string;estado:string;modalidad:string;sede:string|null;tipo_vestido:string|null}[];contratos:{id:string;numero_contrato:string;estado:string;fecha_evento:string|null;sede:string|null}[]};
const WINDOW_MS=24*3600*1000;
const hora=(iso:string)=>{const d=new Date(iso),hoy=new Date().toDateString()===d.toDateString();return d.toLocaleString('es-CO',{timeZone:'America/Bogota',...(hoy?{timeStyle:'short'}:{dateStyle:'short',timeStyle:'short'})});};
const tel=(t:string)=>t.startsWith('57')&&t.length===12?`+57 ${t.slice(2,5)} ${t.slice(5,8)} ${t.slice(8)}`:`+${t}`;
const ORIGEN:Record<string,string>={erp:'ERP',celular:'Celular',clienta:''};
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
  {()=><Inbox/>}
 </SupplierShell>;
}

function Inbox(){
 const [convs,setConvs]=useState<Conv[]>([]),[sedes,setSedes]=useState<{id:string;nombre:string}[]>([]),[sel,setSel]=useState<string|null>(null);
 const [filtro,setFiltro]=useState('todas'),[q,setQ]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const load=useCallback(async()=>{
  const {data,error:e}=await supabase.from('whatsapp_conversaciones').select('*').order('ultimo_at',{ascending:false}).limit(300);
  if(e)setError(e.message);else{setConvs((data||[]) as Conv[]);setError('');}
  setLoading(false);
 },[]);
 useEffect(()=>{
  void supabase.from('sedes').select('id,nombre').eq('activo',true).order('nombre').then(({data})=>setSedes(data||[]));
  const first=setTimeout(()=>void load(),0),t=setInterval(()=>{if(document.visibilityState==='visible')void load();},15000);return()=>{clearTimeout(first);clearInterval(t);};
 },[load]);
 const sedeName=(id:string|null)=>sedes.find(s=>s.id===id)?.nombre||'Sin sede';
 const lista=useMemo(()=>convs.filter(c=>(filtro==='todas'||(filtro==='sin_leer'&&c.no_leidos>0)||(filtro==='sin_sede'&&!c.sede_id)||c.sede_id===filtro)
  &&`${c.nombre||''} ${c.telefono}`.toLowerCase().includes(q.trim().toLowerCase())),[convs,filtro,q]);
 const current=convs.find(c=>c.id===sel)||null;
 return <>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <div style={{display:'grid',gridTemplateColumns:'minmax(0,340px) minmax(0,1fr)',gap:16,alignItems:'start'}} className="wa-grid">
   <style>{`@media(max-width:860px){.wa-grid{grid-template-columns:minmax(0,1fr)!important}.wa-grid>.wa-hide{display:none}}`}</style>
   <section className={`${styles.card} ${sel?'wa-hide':''}`} style={{padding:12}}>
    <div style={{display:'flex',gap:8,marginBottom:8}}>
     <input aria-label="Buscar chat" placeholder="Buscar nombre o celular" value={q} onChange={e=>setQ(e.target.value)} style={{flex:1,minWidth:0}}/>
     <button className={styles.button} onClick={()=>void load()} aria-label="Actualizar"><RefreshCw size={14}/></button>
    </div>
    <select aria-label="Filtrar chats" value={filtro} onChange={e=>setFiltro(e.target.value)} style={{width:'100%',marginBottom:8}}>
     <option value="todas">Todos los chats</option><option value="sin_leer">Sin leer</option><option value="sin_sede">Sin sede</option>
     {sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}
    </select>
    {loading?<p className={styles.empty}>Cargando chats…</p>:!lista.length?<p className={styles.empty}>{convs.length?'Ningún chat con ese filtro.':'Aún no hay chats. Llegan aquí desde que una clienta escriba al 304.'}</p>:
    <div style={{display:'grid',gap:4,maxHeight:'70vh',overflowY:'auto'}}>
     {lista.map(c=><button key={c.id} type="button" onClick={()=>setSel(c.id)} style={{textAlign:'left',padding:'10px 12px',borderRadius:12,border:'1px solid',borderColor:sel===c.id?'#10b981':'#f1f5f9',background:sel===c.id?'#ecfdf5':'#fff',cursor:'pointer'}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:8}}><strong style={{fontSize:14,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.nombre||tel(c.telefono)}</strong><small style={{color:'#64748b',whiteSpace:'nowrap'}}>{hora(c.ultimo_at)}</small></div>
      <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}>
       <small style={{color:'#475569',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.ultimo_mensaje||'—'}</small>
       {c.no_leidos>0&&<span style={{background:'#10b981',color:'#fff',borderRadius:999,fontSize:11,fontWeight:800,padding:'1px 7px'}}>{c.no_leidos}</span>}
      </div>
      <small style={{color:'#94a3b8'}}>{sedeName(c.sede_id)}{c.etiqueta?` · ${c.etiqueta}`:''}</small>
     </button>)}
    </div>}
   </section>
   {current?<Chat key={current.id} conv={current} sedes={sedes} onBack={()=>setSel(null)} onChange={load}/>:<section className={`${styles.card} wa-hide`}><p className={styles.empty}>Elige un chat para verlo.</p></section>}
  </div>
 </>;
}

function Chat({conv,sedes,onBack,onChange}:{conv:Conv;sedes:{id:string;nombre:string}[];onBack:()=>void;onChange:()=>Promise<void>}){
 const [msgs,setMsgs]=useState<Msg[]>([]),[ficha,setFicha]=useState<Ficha|null>(null),[texto,setTexto]=useState(''),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const end=useRef<HTMLDivElement>(null);
 const loadMsgs=useCallback(async()=>{
  const {data}=await supabase.from('whatsapp_mensajes').select('id,direccion,origen,texto,estado,created_at').eq('conversacion_id',conv.id).order('created_at',{ascending:true}).limit(500);
  setMsgs((data||[]) as Msg[]);
 },[conv.id]);
 useEffect(()=>{
  void loadMsgs();void supabase.rpc('whatsapp_ficha',{p_conversacion:conv.id}).then(({data})=>setFicha(data as Ficha|null));
  const t=setInterval(()=>{if(document.visibilityState==='visible')void loadMsgs();},10000);return()=>clearInterval(t);
 },[conv.id,loadMsgs]);
 useEffect(()=>{if(conv.no_leidos>0)void api({accion:'leido',conversacion_id:conv.id}).then(onChange).catch(()=>{});},[conv.id,conv.no_leidos,onChange]);
 useEffect(()=>{end.current?.scrollIntoView({block:'end'});},[msgs.length]);
 const abierta=!!conv.ultimo_entrante_at&&Date.now()-Date.parse(conv.ultimo_entrante_at)<WINDOW_MS;
 const run=async(name:string,body:Record<string,unknown>,after?:()=>void)=>{setBusy(name);setError('');try{await api({...body,conversacion_id:conv.id});after?.();await Promise.all([onChange(),loadMsgs()]);}catch(e){setError(e instanceof Error?e.message:'Error');}finally{setBusy('');}};
 return <section className={styles.card} style={{padding:12,display:'grid',gap:10}}>
  <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
   <button className={styles.button} onClick={onBack} aria-label="Volver a la lista"><ArrowLeft size={14}/></button>
   <div style={{flex:1,minWidth:160}}><strong>{conv.nombre||tel(conv.telefono)}</strong><br/><small>{tel(conv.telefono)} · <a href={`https://wa.me/${conv.telefono}`} target="_blank" rel="noreferrer">abrir en WhatsApp</a></small></div>
   <label style={{fontSize:12}}>Sede <select value={conv.sede_id||''} disabled={!!busy} onChange={e=>void run('sede',{accion:'sede',sede_id:e.target.value||null})}><option value="">Sin sede</option>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
  </div>
  {ficha&&(ficha.citas.length>0||ficha.contratos.length>0)&&<div style={{display:'flex',gap:6,flexWrap:'wrap',fontSize:12}}>
   {ficha.contratos.map(c=><Link key={c.id} href={`/dashboard?contratoId=${encodeURIComponent(c.id)}`} className={styles.badge}>Contrato {c.numero_contrato} · {c.estado}{c.fecha_evento?` · evento ${c.fecha_evento}`:''}</Link>)}
   {ficha.citas.map(c=><Link key={c.id} href={`/dashboard/primeras-citas?dia=${c.fecha}`} className={styles.badge}>Cita {c.fecha} {String(c.hora||'').slice(0,5)} · {c.estado}{c.sede?` · ${c.sede}`:''}</Link>)}
  </div>}
  <div style={{background:'#f8fafc',borderRadius:12,padding:10,maxHeight:'50vh',overflowY:'auto',display:'grid',gap:6}}>
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
