'use client';
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {errorText} from '@/lib/suppliers';
import {openSupplierFile} from './SupplierShell';
import styles from '@/app/dashboard/caja/caja.module.css';

type Doc={id:string;tipo:string;titulo:string;archivo_path:string;vence_el:string|null};

/** Supplier documents an advisor may read (visibility «Asesora»): conditions, portfolio, rules. */
export default function SupplierConditions({supplier,onClose}:{supplier:{id:string;nombre:string};onClose:()=>void}){
 const [docs,setDocs]=useState<Doc[]|null>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;void supabase.rpc('documentos_proveedor_asesora',{p_proveedor:supplier.id}).then(({data,error})=>{if(!live)return;if(error)setError(error.message);else setDocs(data as Doc[]);});return()=>{live=false;};},[supplier.id]);
 return <div className={styles.overlay} onClick={onClose}><div className={styles.dialog} onClick={e=>e.stopPropagation()}>
  <h2>Condiciones de {supplier.nombre}</h2>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {docs===null&&!error&&<p className={styles.empty}>Cargando documentos…</p>}
  {docs?.length===0&&<p className={styles.empty}>Este proveedor no tiene documentos para asesoras.</p>}
  <ul className={styles.alertList} style={{padding:0}}>{docs?.map(d=><li key={d.id} style={{background:'#f8fafc',borderColor:'#e2e8f0',display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
   <span><b>{d.titulo}</b><br/><span className={styles.help}>{d.tipo}{d.vence_el?` · vence ${d.vence_el}`:''}</span></span>
   <button className={styles.button} onClick={()=>void openSupplierFile('documentos_proveedores',d.archivo_path).catch(e=>setError(errorText(e,'')))}>Abrir</button></li>)}</ul>
  <div className={styles.actions} style={{marginTop:14}}><button className={styles.button} onClick={onClose}>Cerrar</button></div>
 </div></div>;
}
