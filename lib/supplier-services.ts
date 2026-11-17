import {supabase} from '@/lib/supabase';

const LISTA='prov_tipos_servicio';

/** «+ Nuevo servicio…» in the supplier forms: adds a service type to the Configuración list (or reactivates it) and returns it. */
export async function crearServicioProveedor():Promise<string|null>{
 const v=window.prompt('Nombre del nuevo tipo de servicio:')?.replace(/\s+/g,' ').trim();
 if(!v)return null;
 if(v.length<2||v.length>60)throw Error('El nombre debe tener entre 2 y 60 caracteres.');
 const {data,error}=await supabase.from('listas_contrato').select('valor,orden').eq('lista',LISTA);
 if(error)throw error;
 const igual=(data||[]).find(r=>String(r.valor).toLowerCase()===v.toLowerCase());
 if(igual){await supabase.from('listas_contrato').update({activo:true}).eq('lista',LISTA).eq('valor',igual.valor);return String(igual.valor);}
 const orden=Math.max(0,...(data||[]).map(r=>Number(r.orden)||0))+1;
 const {error:e}=await supabase.from('listas_contrato').insert({lista:LISTA,valor:v,orden,activo:true});
 if(e)throw e;
 return v;
}

/** «Editar» next to the service: renames it in the list and wherever it is used (suppliers, rates, packages, contracts). */
export async function renombrarServicioProveedor(actual:string):Promise<string|null>{
 const v=window.prompt(`Nuevo nombre para «${actual}» (cambia en todos los proveedores y tarifas que lo usan):`,actual)?.replace(/\s+/g,' ').trim();
 if(!v||v===actual)return null;
 const {data,error}=await supabase.rpc('prov_servicio_renombrar',{p_viejo:actual,p_nuevo:v});
 if(error)throw error;
 return String(data);
}
