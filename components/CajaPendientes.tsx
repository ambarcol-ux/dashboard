'use client';
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import styles from '@/app/dashboard/caja/caja.module.css';

type Pendiente={nivel:'alta'|'media'|'baja';texto:string;fecha?:string};

/** Cierres de caja › top of the store's day: what the store still has to do (public.caja_pendientes), so the advisor does not guess. */
export default function CajaPendientes({sedeId,version,onIr}:{sedeId:string;version:string;onIr?:(fecha:string)=>void}){
 const [items,setItems]=useState<Pendiente[]|null>(null);
 useEffect(()=>{let live=true;void supabase.rpc('caja_pendientes',{p_sede:sedeId}).then(({data})=>{if(live)setItems((data||[]) as Pendiente[]);});return()=>{live=false;};},[sedeId,version]);
 if(!items)return null;
 if(!items.length)return <section className={styles.card}><p role="status" className={styles.notice}>✅ Sin pendientes en la caja de esta sede.</p></section>;
 return <section className={styles.card}><h2>Pendientes de la sede ({items.length})</h2>
  <ul style={{display:'grid',gap:8,paddingLeft:0,listStyle:'none'}}>{items.map((x,i)=><li key={i} className={x.nivel==='alta'?styles.error:x.nivel==='media'?styles.banner:styles.help}>
   {x.nivel==='alta'?'🔴 ':x.nivel==='media'?'🟠 ':'⚪ '}{x.texto}{x.fecha&&onIr&&<> <button className={styles.button} onClick={()=>onIr(x.fecha!)}>Ir al {x.fecha.slice(8,10)}/{x.fecha.slice(5,7)}</button></>}</li>)}</ul>
 </section>;
}
