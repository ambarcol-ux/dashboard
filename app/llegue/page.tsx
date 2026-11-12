'use client';
import {useEffect,useState} from 'react';
import styles from '../agendar-primera-cita/visits.module.css';

/** Store-entrance QR: the customer registers her arrival with the appointment code, her ID number or her phone. */
export default function Arrival(){
 const [sede,setSede]=useState(''),[nombreSede,setNombreSede]=useState(''),[dato,setDato]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[ok,setOk]=useState<{nombre:string;hora:string}|null>(null);
 useEffect(()=>{const s=new URLSearchParams(window.location.search).get('s')||'';setSede(s);if(!s){setError('Escanea el QR de la entrada de la sede.');return;}void fetch('/api/primeras-citas').then(r=>r.json()).then(d=>setNombreSede((d.sedes||[]).find((x:{id:string})=>x.id===s)?.nombre||'')).catch(()=>{});},[]);
 async function send(e:React.FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');try{const r=await fetch('/api/primeras-citas/llegada',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sede,dato})});const d=await r.json();if(!r.ok)throw Error(d.error);setOk(d);}catch(err){setError(err instanceof Error?err.message:'No pudimos registrar tu llegada.');}finally{setBusy(false);}}
 return <main className={styles.publicPage}><section className={styles.card}>
  <p className={styles.brand}>ÁMBAR COUTURE</p><h1>Bienvenida{nombreSede?` a ${nombreSede}`:''} ✨</h1>
  {ok?<div className={styles.success}><h2>¡Hola, {ok.nombre}! 👋</h2><p>Registramos tu llegada para tu cita de las {ok.hora}. En un momento te atendemos.</p></div>
  :<form className={styles.form} onSubmit={send}><fieldset><p>Registra tu llegada a la cita. Escribe el <strong>código de la cita</strong> (llegó en tu correo, ej. CIT-BAR-0042), la <strong>cédula</strong> o el <strong>celular</strong> de quien agendó.</p>
   <label>Código, cédula o celular<input autoFocus required minLength={4} maxLength={40} value={dato} onChange={e=>setDato(e.target.value)} autoComplete="off"/></label>
   {error&&<p className={styles.error}>{error}</p>}</fieldset>
   <button className={styles.primary} type="submit" disabled={busy||!sede}>{busy?'Registrando…':'Registrar mi llegada'}</button></form>}
 </section></main>;
}
