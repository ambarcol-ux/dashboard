'use client';
import {useRef,useState} from 'react';
import {supabase} from '@/lib/supabase';
import styles from '@/app/agendar-primera-cita/visits.module.css';

/** Printable QR per store: at the entrance the customer registers her arrival with the appointment code, ID number or phone. */
export default function ArrivalQr(){
 const dialog=useRef<HTMLDialogElement>(null);
 const [qrs,setQrs]=useState<{nombre:string;url:string;img:string}[]>([]),[error,setError]=useState('');
 async function open(){
  dialog.current?.showModal();setError('');
  try{
   const {data,error:e}=await supabase.from('sedes').select('id,nombre').eq('activo',true).order('nombre');if(e)throw e;
   const QR=(await import('qrcode')).default;
   setQrs(await Promise.all((data||[]).map(async s=>{const url=`${window.location.origin}/llegue?s=${s.id}`;return {nombre:String(s.nombre),url,img:await QR.toDataURL(url,{width:600,margin:1,errorCorrectionLevel:'M'})};})));
  }catch(err){setError(err instanceof Error?err.message:'No se pudieron generar los QR.');}
 }
 return <><button type="button" onClick={()=>void open()}>QR de llegada</button>
  <dialog ref={dialog} className={styles.dialog} onClick={e=>{if(e.target===dialog.current)dialog.current?.close();}}>
   <h3>QR de llegada por sede</h3>
   <p className={styles.notice}>Imprímelo y ponlo en la entrada. Con cita: escribe el código, su cédula o su celular y la asistencia queda registrada sola. Sin cita: se registra ella misma como vitrina y la sede recibe el aviso.</p>
   {error&&<p className={styles.error}>{error}</p>}
   <div className={styles.grid2}>{qrs.map(q=><figure key={q.url} style={{textAlign:'center'}}><img src={q.img} alt={`QR ${q.nombre}`} style={{width:'100%'}}/><figcaption><strong>{q.nombre}</strong><br/><a href={q.img} download={`QR-llegada-${q.nombre}.png`} style={{color:'#d62f65',fontWeight:700}}>Descargar</a></figcaption></figure>)}</div>
   <div className={styles.actions}><button type="button" onClick={()=>dialog.current?.close()}>Cerrar</button></div>
  </dialog></>;
}
