/** Owner (PRESTADOR/ARRENDADOR) of each store with the store's address and phone (Configuración › Sedes), shown in its contracts. Only Villavicencio has a scanned signature for now. */
export type ContractOwner={nombre:string;cedula:string;ciudad:string;direccion:string;telefono:string;firma?:string};
const OWNERS:Record<string,ContractOwner>={
 villavicencio:{nombre:'Jorge Andrés Romero Díaz',cedula:'80.031.674',ciudad:'Villavicencio, Meta',direccion:'Calle 15 #42-21, casa 7',telefono:'321 489 3891',firma:'/assets/firma_representante.png'},
 bogota:{nombre:'Luz Jennifer Jiménez Gutiérrez',cedula:'1.121.841.162',ciudad:'Bogotá D.C.',direccion:'Carrera 15 #106-76, segundo piso, Molinos Norte',telefono:'305 807 3210'},
 barranquilla:{nombre:'Sergio Andrés Romero Bedoya',cedula:'1.027.152.098',ciudad:'Barranquilla, Atlántico',direccion:'Carrera 54 #84-95, Riomar',telefono:'310 211 9906'},
 pereira:{nombre:'Cristián Camilo Lesmes González',cedula:'80.027.156',ciudad:'Pereira, Risaralda',direccion:'Carrera 17 #9-70, local 101, Pinares',telefono:'321 347 3757'},
};
const key=(s:string|null|undefined)=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/^sede\s+/,'').trim();
/** Owner of the contract's store; unknown stores keep the Villavicencio owner (previous behaviour). */
export function contractOwner(sede:string|null|undefined):ContractOwner{
 const k=key(sede);
 return OWNERS[k]||Object.entries(OWNERS).find(([n])=>k.includes(n))?.[1]||OWNERS.villavicencio;
}
