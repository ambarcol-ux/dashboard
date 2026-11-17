'use client';
import ConfigSelect from '@/components/ConfigSelect';

/** Service type of a supplier or rate: the Configuración list with «+ Agregar…» and «Editar» (renames it everywhere it is used). */
export default function ServiceSelect({value,onChange,placeholder='Selecciona…',editable=true}:{value:string;onChange:(v:string)=>void;placeholder?:string;editable?:boolean}){
 return <ConfigSelect lista="prov_tipos_servicio" value={value} onChange={onChange} placeholder={placeholder} editable={editable}/>;
}
