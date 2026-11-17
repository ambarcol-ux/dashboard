'use client';
import MoneyInput from '@/components/MoneyInput';
import {useState} from 'react';
import {DEPOSIT_TABLE,suggestedDeposit} from '@/lib/deposit-rules';
import {money} from '@/lib/deposits';
import styles from '@/app/dashboard/devoluciones-depositos/deposits.module.css';

const range=(desde:number,hasta:number|null)=>hasta===null?`De ${money(desde)} en adelante`:`De ${money(desde)} a ${money(hasta)}`;

/** Ámbar deposit table (Gala / XV) with a quick calculator for advisors. */
export default function DepositTable(){
 const [categoria,setCategoria]=useState<string>(DEPOSIT_TABLE[0].categoria),[precio,setPrecio]=useState('');
 const result=suggestedDeposit(categoria,precio.replace(/\D/g,''));
 return <section className={styles.card}>
  <div className={styles.historyHeader}><div><h2>Tabla de depósitos – Ámbar Couture</h2><p>Depósito que se debe cobrar según la categoría y el valor del vestido.</p></div></div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:16,padding:'0 22px 18px'}}>
   {DEPOSIT_TABLE.map(t=><div key={t.categoria} className={styles.tableScroll} style={{border:'1px solid #e7e8eb',borderRadius:10}}>
    <table><thead><tr><th colSpan={2} style={{color:'#222',fontWeight:600}}>{t.titulo}</th></tr><tr><th>Valor del vestido</th><th>Depósito requerido</th></tr></thead>
     <tbody>{t.tramos.map(r=><tr key={r.desde}><td>{range(r.desde,r.hasta)}</td><td className={styles.balance}>{money(r.deposito)}</td></tr>)}</tbody></table>
   </div>)}
  </div>
  <div className={styles.filters} style={{borderTop:'1px solid #eee'}}>
   <select aria-label="Categoría del vestido" value={categoria} onChange={e=>setCategoria(e.target.value)}>{DEPOSIT_TABLE.map(t=><option key={t.categoria} value={t.categoria}>{t.titulo}</option>)}</select>
   <label><MoneyInput aria-label="Valor del vestido" inputMode="numeric" placeholder="Valor del vestido" value={precio} onChange={e=>setPrecio(e.target.value)}/></label>
   <span style={{marginLeft:0,color:'#237251',fontWeight:600}}>{result!==null?`Depósito a cobrar: ${money(result)}`:'Escribe el valor del vestido'}</span>
  </div>
 </section>;
}
