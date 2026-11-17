'use client';
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {useLists} from '@/lib/module-config';

let financePromise:Promise<boolean>|null=null;
/** Administration and accounting add and rename list values (checked again in the database). */
const canEditLists=()=>financePromise??=Promise.resolve(supabase.rpc('es_finanzas')).then(({data})=>data===true).catch(()=>false);

/** Dropdown of a Configuración list (Configuración › Listas): its active values plus the current one, «+ Agregar…» to add a value
 *  and «Editar» to rename the chosen one (the records that use it take the new name). `fijos` are values the ERP needs that are not
 *  editable (e.g. «Base de caja»). Without permission it is a plain dropdown. */
export default function ConfigSelect({lista,value,onChange,placeholder='Selecciona…',fijos=[],className,style,required,disabled,editable=true}:{
 lista:string;value:string;onChange:(v:string)=>void;placeholder?:string|null;fijos?:readonly string[];className?:string;style?:React.CSSProperties;required?:boolean;disabled?:boolean;editable?:boolean}){
 const [version,setVersion]=useState(0),[puede,setPuede]=useState(false),[error,setError]=useState(''),[extra,setExtra]=useState<string[]>([]);
 const valores=useLists([lista,`__v${version}`])[lista]||[];
 useEffect(()=>{let live=true;void canEditLists().then(v=>{if(live)setPuede(v);});return()=>{live=false;};},[]);
 const opciones=Array.from(new Set([...fijos,...valores,...extra,...(value?[value]:[])]));
 const run=async(fn:()=>Promise<string|null>)=>{setError('');try{const v=await fn();if(v){setExtra(l=>[...l,v]);onChange(v);setVersion(n=>n+1);}}catch(e){setError(e instanceof Error?e.message:'No se pudo guardar.');}};
 const agregar=async()=>{
  const v=window.prompt('Nombre de la nueva opción:')?.replace(/\s+/g,' ').trim();if(!v)return null;
  const {data,error:e}=await supabase.rpc('lista_agregar',{p_lista:lista,p_valor:v});if(e)throw Error(e.message);return String(data);
 };
 const renombrar=async()=>{
  const v=window.prompt(`Nuevo nombre para «${value}» (cambia también en los registros que ya lo usan):`,value)?.replace(/\s+/g,' ').trim();if(!v||v===value)return null;
  const {data,error:e}=await supabase.rpc('lista_renombrar',{p_lista:lista,p_viejo:value,p_nuevo:v});if(e)throw Error(e.message);
  setExtra(l=>l.filter(x=>x!==value));return String(data);
 };
 const editarVisible=puede&&editable&&!!value&&!fijos.includes(value)&&valores.includes(value);
 return <span style={{display:'flex',flexDirection:'column',gap:4,width:'100%'}}>
  <span style={{display:'flex',gap:6,alignItems:'center',width:'100%'}}>
   <select className={className} style={{flex:1,minWidth:0,...style}} value={value} required={required} disabled={disabled}
    onChange={e=>e.target.value==='__agregar'?void run(agregar):onChange(e.target.value)}>
    {placeholder!==null&&<option value="">{placeholder}</option>}
    {opciones.map(o=><option key={o} value={o}>{o}</option>)}
    {puede&&<option value="__agregar">+ Agregar…</option>}
   </select>
   {editarVisible&&<button type="button" title="Cambiar el nombre de esta opción" disabled={disabled} onClick={()=>void run(renombrar)}
    style={{fontSize:12,fontWeight:800,whiteSpace:'nowrap',padding:'6px 10px',border:'1px solid #e5e7eb',borderRadius:10,background:'#fff',color:'#374151'}}>Editar</button>}
  </span>
  {error&&<small role="alert" style={{color:'#dc2626',fontWeight:700}}>{error}</small>}
 </span>;
}
