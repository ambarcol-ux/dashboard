'use client';
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {accountLabel,type CashAccount} from '@/lib/cash';

/** Account or cash box of the store where a deposit payment came in or a return went out. Any account of the store (not only the
 *  deposits one), because customers sometimes pay into another account. Cash always uses the store's petty cash. */
export default function DepositAccountSelect({sedeId,medio,value,onChange}:{sedeId:string|null|undefined;medio:string;value:string;onChange:(v:string)=>void}){
 const [cuentas,setCuentas]=useState<CashAccount[]>([]);
 useEffect(()=>{let live=true;void supabase.rpc('cuentas_dinero_lista').then(({data})=>{if(live)setCuentas((data||[]) as CashAccount[]);});return()=>{live=false;};},[]);
 const efectivo=medio==='Efectivo';
 const opciones=cuentas.filter(c=>c.activo&&(c.sede_id===null||c.sede_id===sedeId)&&(efectivo?c.tipo==='efectivo':c.tipo!=='efectivo'));
 if(efectivo)return <p style={{fontSize:12,color:'#6b7280'}}>Queda en: <b>{opciones[0]?accountLabel(opciones[0]):'la caja menor de la sede'}</b></p>;
 return <label>Cuenta o caja de la sede donde se movió el dinero
  <select required={opciones.length>0} value={value} onChange={e=>onChange(e.target.value)}>
   <option value="">Elige la cuenta…</option>
   {opciones.map(c=><option key={c.id} value={c.id}>{accountLabel(c)}{c.solo_depositos?' (depósitos)':''}</option>)}
  </select></label>;
}
