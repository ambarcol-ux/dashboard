'use client';
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';

type Estado={activa:boolean;pendientes:number;errores:number;enviados:number;detalle:{tipo:string;estado:string;error:string|null}[]};
const TIPO:Record<string,string>={factura:'factura',recibo_caja:'recibo de caja',anticipo:'anticipo',devolucion_anticipo:'devolución de depósito',nota_credito:'nota crédito',correccion_factura:'corrección de factura',gasto:'gasto',soporte_gasto:'documento soporte',soporte_producto:'documento soporte',comprobante:'comprobante'};

/** Cierres de caja › one store and day: whether everything of that day already reached Siigo (only stores with «Enviar a Siigo» on). */
export default function SiigoAlDia({sedeId,fecha}:{sedeId:string;fecha:string}){
 const [e,setE]=useState<Estado|null>(null);
 useEffect(()=>{let live=true;void supabase.rpc('siigo_estado_dia',{p_sede:sedeId,p_fecha:fecha}).then(({data})=>{if(live)setE(data as Estado);});return()=>{live=false;};},[sedeId,fecha]);
 if(!e?.activa)return null;
 const ok=!e.pendientes&&!e.errores;
 return <p role="status" style={{margin:'0 0 12px',padding:'10px 14px',borderRadius:12,fontSize:13,fontWeight:700,background:ok?'#ecfdf5':e.errores?'#fff1f2':'#fffbeb',color:ok?'#047857':e.errores?'#be123c':'#b45309'}}>
  {ok?`Siigo al día ✅ · ${e.enviados} documento(s) de este día ya están en Siigo.`
   :`Siigo: ${e.pendientes} pendiente(s) y ${e.errores} con error de este día${e.detalle.length?` (${e.detalle.slice(0,6).map(d=>`${TIPO[d.tipo]||d.tipo}${d.error?`: ${d.error}`:''}`).join(' · ')})`:''}. Se envían solos cada 10 minutos; los errores se corrigen en Configuración › Facturación por sede.`}
 </p>;
}
