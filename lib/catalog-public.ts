/** Rule of the public catalog (links sent to customers, including the AI's): only dresses ready to rent are shown. */
export type CatalogDress={foto_frente?:string|null;foto_espalda?:string|null;foto_detalle?:string|null;imagen_url?:string|null;precio_sugerido?:number|null;para_alquiler?:boolean|null;estado?:string|null};
export const RETIRED_RE=/vendido|baja/i;
/** Why a dress is not shown to customers (empty = it is shown). Sold or retired dresses are never listed, so they carry no reason. */
export function publicHiddenReasons(d:CatalogDress){
 const out:string[]=[];
 if(!(d.foto_frente||d.imagen_url||d.foto_espalda||d.foto_detalle))out.push('Sin foto');
 if(!(Number(d.precio_sugerido)>0))out.push('Sin precio de alquiler');
 if(d.para_alquiler===false)out.push('Solo venta');
 return out;
}
export const isPublicCatalogDress=(d:CatalogDress)=>!RETIRED_RE.test(String(d.estado||''))&&publicHiddenReasons(d).length===0;
