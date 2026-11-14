import {cop} from '@/lib/rental-price';

export type Promotion={id:string;nombre:string;beneficio_tipo:'porcentaje'|'valor'|'incluido';beneficio_valor:number;beneficio_detalle:string;desde:string;hasta:string;
 sede_ids:string[]|null;clasificacion_ids:number[]|null;categorias:string[]|null;codigo:string|null;condiciones:string;activo:boolean};
export const PROMO_FIELDS='id,nombre,beneficio_tipo,beneficio_valor,beneficio_detalle,desde,hasta,sede_ids,clasificacion_ids,categorias,codigo,condiciones,activo';
export const bogotaToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota'}).format(new Date());
/** Dates decide: a promotion starts and ends by itself; «activo» only pauses it. */
export const promoState=(p:Pick<Promotion,'activo'|'desde'|'hasta'>,today=bogotaToday())=>!p.activo?'Pausada':today<p.desde?'Programada':today>p.hasta?'Terminada':'Vigente';
export const promoBenefit=(p:Pick<Promotion,'beneficio_tipo'|'beneficio_valor'|'beneficio_detalle'>)=>p.beneficio_tipo==='porcentaje'?`${Number(p.beneficio_valor)}% de descuento`:p.beneficio_tipo==='valor'?`${cop(Number(p.beneficio_valor))} de descuento`:`Incluido: ${p.beneficio_detalle}`;
/** Discount over the rental value; «incluido» gives no discount. */
export const promoDiscount=(p:Promotion|null|undefined,rental:number)=>!p||rental<=0?0:p.beneficio_tipo==='porcentaje'?Math.round(rental*Number(p.beneficio_valor)/100):p.beneficio_tipo==='valor'?Math.min(rental,Number(p.beneficio_valor)):0;
const any=<T,>(list:T[]|null|undefined,values:(T|null|undefined)[])=>!list?.length||!values.some(v=>v!=null)||values.some(v=>v!=null&&list.includes(v));
/** Active today and matching sede, types and categories (empty lists = all). */
export const promoApplies=(p:Promotion,f:{sede?:string|null;tipos?:(number|null|undefined)[];categorias?:(string|null|undefined)[]},today=bogotaToday())=>
 promoState(p,today)==='Vigente'&&(!p.sede_ids?.length||!f.sede||p.sede_ids.includes(f.sede))&&any(p.clasificacion_ids,f.tipos||[])&&any(p.categorias,f.categorias||[]);

const TIPO_ID:[RegExp,number][]=[[/xv|quince/i,2],[/novia/i,1],[/gala|grado/i,3],[/pajecita/i,4]];
/** Promotion for a follow-up greeting: the one in force for her store and dress type (read from any text that names it) that ends soonest,
 *  as «20% de descuento … hasta el 30 de noviembre»; null if none applies. */
export function promoForGreeting(promos:Promotion[]|null,sedeId:string|null,tipoVestido:string|null){
 const tipo=TIPO_ID.find(([re])=>re.test(String(tipoVestido||'')))?.[1];
 if(!promos||!tipo)return null;
 const p=promos.filter(x=>promoApplies(x,{sede:sedeId,tipos:[tipo]})).sort((a,b)=>a.hasta.localeCompare(b.hasta))[0];
 if(!p)return null;
 const fin=Date.parse(p.hasta+'T12:00:00Z')-Date.now()<90*86400000?` hasta el ${new Date(p.hasta+'T12:00:00Z').toLocaleDateString('es-CO',{day:'numeric',month:'long',timeZone:'UTC'})}`:'';
 return `${p.nombre.replace(/\s*\([^)]*\)\s*$/,'')}${fin}`;
}
