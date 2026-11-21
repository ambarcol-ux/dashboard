'use client';
/** Inventario › style of a dress (what customers ask on WhatsApp): silhouette, bodice, neckline, sleeves and details. Required. */
import {CORPINOS,DETALLES,ESCOTES,MANGAS,SILUETAS,type Estilo} from '@/lib/dress-style';
export {estiloDe,estiloFalta,estiloVacio,estiloTexto,type Estilo} from '@/lib/dress-style';

export default function EstiloVestido({value,onChange,input,label}:{value:Estilo;onChange:(e:Estilo)=>void;input:string;label:string}){
 const sel=(k:'silueta'|'corpino'|'escote'|'mangas',t:string,ops:readonly string[])=><label className={label}>{t} *<select className={input} value={value[k]} onChange={e=>onChange({...value,[k]:e.target.value})}><option value="">Selecciona…</option>{ops.map(o=><option key={o}>{o}</option>)}</select></label>;
 return <div className="col-span-full space-y-2">
  <div className="grid grid-cols-2 gap-3">{sel('silueta','Silueta',SILUETAS)}{sel('corpino','Corpiño',CORPINOS)}{sel('escote','Escote',ESCOTES)}{sel('mangas','Mangas',MANGAS)}</div>
  <div className={label}>Detalles * (marca todos los que tenga)
   <div className="flex flex-wrap gap-2 mt-1 normal-case tracking-normal">{DETALLES.map(d=>{const on=value.detalles.includes(d);return <button type="button" key={d} onClick={()=>onChange({...value,detalles:on?value.detalles.filter(x=>x!==d):[...value.detalles,d]})}
    className={`px-3 py-1.5 rounded-full border text-xs font-bold ${on?'bg-rose-500 text-white border-rose-500':'bg-white text-gray-600'}`}>{d}</button>;})}</div></div>
 </div>;
}
