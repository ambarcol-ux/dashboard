'use client';
import {useEffect,useState} from 'react';
import styles from '../agendar-primera-cita/visits.module.css';

type Textos={tratamiento?:{texto:string}|null;comercial?:{texto:string}|null};
const vacio={nombre:'',telefono:'',documento:'',tipo:'',evento:'',entero:''};

/** Store-entrance QR: with an appointment she registers her arrival; without one she registers herself as a window visit. */
export default function Arrival(){
 const [sede,setSede]=useState(''),[nombreSede,setNombreSede]=useState(''),[modo,setModo]=useState<''|'cita'|'nueva'>('');
 const [dato,setDato]=useState(''),[f,setF]=useState(vacio),[consent,setConsent]=useState(false),[comercial,setComercial]=useState<boolean|null>(null),[website,setWebsite]=useState('');
 const [textos,setTextos]=useState<Textos>({}),[listas,setListas]=useState<{tipos:string[];entero:string[]}>({tipos:[],entero:[]});
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[ok,setOk]=useState<{nombre:string;hora?:string;cita?:boolean}|null>(null);
 useEffect(()=>{
  const s=new URLSearchParams(window.location.search).get('s')||'';setSede(s);
  if(!s){setError('Escanea el QR de la entrada de la sede.');return;}
  void fetch('/api/primeras-citas').then(r=>r.json()).then(d=>{setNombreSede((d.sedes||[]).find((x:{id:string})=>x.id===s)?.nombre||'');setTextos(d.textos||{});}).catch(()=>{});
  void fetch('/api/primeras-citas/llegada?listas=1').then(r=>r.json()).then(setListas).catch(()=>{});
 },[]);
 const set=(k:keyof typeof vacio)=>(e:{target:{value:string}})=>setF({...f,[k]:e.target.value});
 async function send(body:Record<string,unknown>){
  if(busy)return;setBusy(true);setError('');
  try{const r=await fetch('/api/primeras-citas/llegada',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sede,...body})});const d=await r.json();if(!r.ok)throw Error(d.error);setOk(d);}
  catch(err){setError(err instanceof Error?err.message:'No pudimos registrarte. Avísale a la asesora.');}
  finally{setBusy(false);}
 }
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota'}).format(new Date());
 return <main className={styles.publicPage}><section className={styles.card}>
  <p className={styles.brand}>ÁMBAR COUTURE</p><h1>Bienvenida{nombreSede?` a ${nombreSede}`:''} ✨</h1>
  {ok?<div className={styles.success}><h2>¡Hola, {ok.nombre}! 👋</h2><p>{ok.hora?`Registramos tu llegada para tu cita de las ${ok.hora}.`:'Ya quedaste registrada.'} En un momento te atendemos.</p></div>
  :!modo?<><p>Cuéntanos para atenderte:</p><div className={styles.choices}>
    <button type="button" disabled={!sede} onClick={()=>setModo('cita')}>Tengo cita</button>
    <button type="button" disabled={!sede} onClick={()=>setModo('nueva')}>No tengo cita</button></div>
    {error&&<p className={styles.error}>{error}</p>}</>
  :modo==='cita'?<form className={styles.form} onSubmit={e=>{e.preventDefault();void send({dato});}}><fieldset>
    <p>Escribe el <strong>código de la cita</strong> (llegó en tu correo, ej. CIT-BAR-0042), la <strong>cédula</strong> o el <strong>celular</strong> de quien agendó.</p>
    <label>Código, cédula o celular<input autoFocus required minLength={4} maxLength={40} value={dato} onChange={e=>setDato(e.target.value)} autoComplete="off"/></label>
    {error&&<><p className={styles.error}>{error}</p><button type="button" onClick={()=>{setError('');setModo('nueva');}}>No la encuentro: registrarme sin cita</button></>}
    <button className={styles.primary} type="submit" disabled={busy}>{busy?'Registrando…':'Registrar mi llegada'}</button>
    <button type="button" onClick={()=>{setError('');setModo('');}}>Volver</button></fieldset></form>
  :<form className={styles.form} onSubmit={e=>{e.preventDefault();if(comercial===null){setError('Elige si quieres recibir novedades y promociones.');return;}void send({accion:'vitrina',...f,tratamiento:consent,comercial,website});}}><fieldset>
    <p>Regístrate y en un momento una asesora te atiende.</p>
    <label>Nombre completo *<input autoFocus required minLength={2} maxLength={120} value={f.nombre} onChange={set('nombre')} autoComplete="name"/></label>
    <label>Celular (WhatsApp) *<input required inputMode="tel" maxLength={15} value={f.telefono} onChange={e=>setF({...f,telefono:e.target.value.replace(/\D/g,'')})} autoComplete="tel"/></label>
    <label>Cédula<input inputMode="numeric" maxLength={15} value={f.documento} onChange={e=>setF({...f,documento:e.target.value.replace(/\D/g,'')})}/></label>
    <label>¿Para qué evento buscas vestido? *<select required value={f.tipo} onChange={set('tipo')}><option value="">Elige…</option>{listas.tipos.map(t=><option key={t}>{t}</option>)}</select></label>
    <label>Fecha del evento<input type="date" min={today} value={f.evento} onChange={set('evento')}/></label>
    <label>¿Cómo te enteraste de nosotros?<select value={f.entero} onChange={set('entero')}><option value="">Elige…</option>{listas.entero.map(t=><option key={t}>{t}</option>)}</select></label>
    <input className={styles.trap} tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={e=>setWebsite(e.target.value)}/>
    {textos.tratamiento&&<p style={{fontSize:12,color:'#555'}}>{textos.tratamiento.texto}</p>}
    <label className={styles.check}><input type="checkbox" required checked={consent} onChange={e=>setConsent(e.target.checked)}/>Autorizo el tratamiento de mis datos personales (obligatorio)</label>
    {textos.comercial&&<p style={{fontSize:12,color:'#555'}}>{textos.comercial.texto}</p>}
    <div role="radiogroup" aria-label="Información comercial" style={{display:'grid',gap:6}}><strong style={{fontSize:14}}>¿Quieres recibir novedades, vestidos nuevos y promociones? (elige una)</strong>
     <label className={styles.check}><input type="radio" name="comercial" checked={comercial===true} onChange={()=>setComercial(true)}/>Sí, quiero recibirlas</label>
     <label className={styles.check}><input type="radio" name="comercial" checked={comercial===false} onChange={()=>setComercial(false)}/>No, gracias</label></div>
    {error&&<p className={styles.error}>{error}</p>}
    <button className={styles.primary} type="submit" disabled={busy}>{busy?'Registrando…':'Registrarme'}</button>
    <button type="button" onClick={()=>{setError('');setModo('');}}>Volver</button></fieldset></form>}
 </section></main>;
}
