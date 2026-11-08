'use client';
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import styles from '@/app/agendar-primera-cita/visits.module.css';

type Visit={id:string;como_se_entero?:string|null;origen_enlace?:string|null;anuncio_id?:string|null};

/** Origin of a first visit: the Meta ad of the customer's chat (linked automatically), the link mark (?o=) and «Cómo se enteró», recorded with one click. */
export default function FirstVisitOrigin({visit,opciones,onSaved}:{visit:Visit;opciones:string[];onSaved:(m:string)=>void}){
 const [anuncio,setAnuncio]=useState(''),[valor,setValor]=useState(visit.como_se_entero||''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 // The ad name is visible to administration; other roles see that it came from an ad.
 useEffect(()=>{if(!visit.anuncio_id)return;void supabase.from('meta_anuncios').select('nombre').eq('id',visit.anuncio_id).maybeSingle().then(({data})=>setAnuncio(data?.nombre||''));},[visit.anuncio_id]);
 async function save(v:string){
  setValor(v);if(!v||v===visit.como_se_entero)return;setBusy(true);setError('');
  const {error:e}=await supabase.rpc('registrar_origen_primera_cita',{p_id:visit.id,p_origen:v});
  setBusy(false);if(e)setError(e.message);else onSaved(`Origen registrado: ${v}.`);
 }
 return <section style={{border:'1px solid #e5e7eb',borderRadius:12,padding:10,display:'grid',gap:6,margin:'8px 0'}}>
  <strong style={{fontSize:13}}>Origen de la cita</strong>
  {visit.anuncio_id&&<p style={{margin:0}}>📣 Llegó por un anuncio de WhatsApp{anuncio?`: ${anuncio}`:''}</p>}
  {visit.origen_enlace&&<p style={{margin:0}}>🔗 Agendó desde un enlace marcado «{visit.origen_enlace}»</p>}
  <label>Cómo se enteró<select value={valor} disabled={busy} onChange={e=>void save(e.target.value)}><option value="">{visit.como_se_entero?visit.como_se_entero:'Elegir…'}</option>{opciones.filter(o=>o!==visit.como_se_entero).map(o=><option key={o}>{o}</option>)}</select></label>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
 </section>;
}
