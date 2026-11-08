'use client';
import {useState} from 'react';
import {supabase} from '@/lib/supabase';
import {personNameError,colombianMobile,MOBILE_ERROR,cedula,CEDULA_ERROR,emailTypo,validEmail} from '@/lib/contact-validation';
import styles from '@/app/agendar-primera-cita/visits.module.css';

type Visit={id:string;cliente_nombre:string;telefono:string;email?:string|null;cliente_documento?:string|null};

/** Primeras visitas: correct the customer's name, mobile, email and ID of a booked visit (administration, leaders, franchisee). Asks for a reason; saved in the history. */
export default function FirstVisitContactEdit({visit,onSaved}:{visit:Visit;onSaved:(m:string)=>void}){
 const [open,setOpen]=useState(false),[f,setF]=useState({nombre:visit.cliente_nombre,telefono:visit.telefono,email:visit.email||'',documento:visit.cliente_documento||'',motivo:''}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const set=(k:keyof typeof f)=>(e:React.ChangeEvent<HTMLInputElement>)=>setF({...f,[k]:e.target.value});
 async function save(){
  setError('');
  const ne=personNameError(f.nombre);if(ne)return setError(ne);
  if(!colombianMobile(f.telefono))return setError(MOBILE_ERROR);
  const email=f.email.trim().toLowerCase();
  if(email&&!validEmail(email))return setError('Revisa el correo.');
  const typo=email&&emailTypo(email);if(typo)return setError(`Revisa el correo: ¿quisiste decir ${typo}?`);
  if(f.documento.trim()&&!cedula(f.documento))return setError(CEDULA_ERROR);
  if(f.motivo.trim().length<5)return setError('Escribe el motivo de la corrección (mínimo 5 caracteres).');
  setBusy(true);
  // Only the fields that changed are sent: the rest keep what is saved.
  const datos:Record<string,string>={};
  if(f.nombre.trim()!==visit.cliente_nombre)datos.nombre=f.nombre;
  if(f.telefono!==visit.telefono)datos.telefono=f.telefono;
  if(email!==(visit.email||'').toLowerCase())datos.email=email;
  if(f.documento.trim()!==(visit.cliente_documento||''))datos.documento=f.documento;
  if(!Object.keys(datos).length){setBusy(false);return setError('No hay cambios para guardar.');}
  const {error:e}=await supabase.rpc('editar_datos_primera_cita',{p_id:visit.id,p_datos:datos,p_motivo:f.motivo.trim()});
  setBusy(false);
  if(e)return setError(e.message);
  setOpen(false);onSaved('Datos de la clienta corregidos. El cambio queda en el historial de la cita.');
 }
 if(!open)return <p><button type="button" onClick={()=>setOpen(true)}>Corregir datos de la clienta</button></p>;
 return <section style={{border:'1px solid #e5e7eb',borderRadius:12,padding:12,display:'grid',gap:8,margin:'8px 0'}}>
  <h4 style={{margin:0}}>Corregir datos de la clienta</h4>
  <label>Nombre y apellido<input value={f.nombre} onChange={set('nombre')} maxLength={120}/></label>
  <label>Celular (WhatsApp)<input value={f.telefono} onChange={set('telefono')} inputMode="numeric" maxLength={16}/></label>
  <label>Correo<input value={f.email} onChange={set('email')} type="email" maxLength={160}/></label>
  <label>Cédula<input value={f.documento} onChange={set('documento')} inputMode="numeric" maxLength={14}/></label>
  <label>Motivo de la corrección<input value={f.motivo} onChange={set('motivo')} maxLength={500} placeholder="Ej.: la clienta escribió mal su celular"/></label>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <div style={{display:'flex',gap:8}}><button type="button" disabled={busy} onClick={()=>void save()}>{busy?'Guardando…':'Guardar corrección'}</button><button type="button" disabled={busy} onClick={()=>setOpen(false)}>Cancelar</button></div>
 </section>;
}
