/** Owner (PRESTADOR/ARRENDADOR) of each store, shown in its contracts. Only Villavicencio has a scanned signature for now. */
export type ContractOwner={nombre:string;cedula:string;ciudad:string;firma?:string};
const OWNERS:Record<string,ContractOwner>={
 villavicencio:{nombre:'Jorge Andrés Romero Díaz',cedula:'80.031.674',ciudad:'Villavicencio, Meta',firma:'/assets/firma_representante.png'},
 bogota:{nombre:'Luz Jennifer Jiménez Gutiérrez',cedula:'1.121.841.162',ciudad:'Bogotá D.C.'},
 barranquilla:{nombre:'Sergio Andrés Romero Bedoya',cedula:'1.027.152.098',ciudad:'Barranquilla, Atlántico'},
 pereira:{nombre:'Cristián Camilo Lesmes González',cedula:'80.027.156',ciudad:'Pereira, Risaralda'},
};
const key=(s:string|null|undefined)=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/^sede\s+/,'').trim();
/** Owner of the contract's store; unknown stores keep the Villavicencio owner (previous behaviour). */
export function contractOwner(sede:string|null|undefined):ContractOwner{
 const k=key(sede);
 return OWNERS[k]||Object.entries(OWNERS).find(([n])=>k.includes(n))?.[1]||OWNERS.villavicencio;
}
