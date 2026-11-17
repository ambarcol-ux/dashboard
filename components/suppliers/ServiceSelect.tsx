'use client';
import {useState} from 'react';
import ListOptions from '@/components/ListOptions';
import {crearServicioProveedor,renombrarServicioProveedor} from '@/lib/supplier-services';

/** Service type of a supplier or rate: the Configuración list plus «+ Nuevo servicio…», and «Editar» to rename the chosen one. */
export default function ServiceSelect({value,onChange,placeholder='Selecciona…',editable=true}:{value:string;onChange:(v:string)=>void;placeholder?:string;editable?:boolean}){
 const [version,setVersion]=useState(0),[error,setError]=useState('');
 const run=async(fn:()=>Promise<string|null>)=>{setError('');try{const v=await fn();if(v){onChange(v);setVersion(n=>n+1);}}catch(e){setError(e instanceof Error?e.message:'No se pudo guardar el servicio.');}};
 return <>
  <span style={{display:'flex',gap:6,alignItems:'center'}}>
   <select style={{flex:1}} value={value} onChange={e=>e.target.value==='__nuevo'?void run(crearServicioProveedor):onChange(e.target.value)}>
    <option value="">{placeholder}</option><ListOptions key={version} lista="prov_tipos_servicio" keep={[value]}/><option value="__nuevo">+ Nuevo servicio…</option>
   </select>
   {editable&&value&&<button type="button" title="Cambiar el nombre de este servicio" onClick={()=>void run(()=>renombrarServicioProveedor(value))} style={{fontSize:12,fontWeight:800,whiteSpace:'nowrap',padding:'6px 10px',border:'1px solid #e5e7eb',borderRadius:10,background:'#fff'}}>Editar</button>}
  </span>
  {error&&<small role="alert" style={{color:'#dc2626',fontWeight:700}}>{error}</small>}
 </>;
}
