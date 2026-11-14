/** Owner (PRESTADOR/ARRENDADOR) of each store with the store's address and phone (Configuración › Sedes), shown in its contracts. Only Villavicencio has a scanned signature for now. */
export type ContractOwner={mujer?:boolean;nombre:string;cedula:string;ciudad:string;direccion:string;telefono:string;firma?:string};
const OWNERS:Record<string,ContractOwner>={
 villavicencio:{nombre:'Jorge Andrés Romero Díaz',cedula:'80.031.674',ciudad:'Villavicencio, Meta',direccion:'Calle 15 #42-21, casa 7',telefono:'321 489 3891',firma:'/assets/firma_representante.png'},
 bogota:{mujer:true,nombre:'Luz Jennifer Jiménez Gutiérrez',cedula:'1.121.841.162',ciudad:'Bogotá D.C.',direccion:'Carrera 15 #106-76, segundo piso, Molinos Norte',telefono:'305 807 3210'},
 barranquilla:{nombre:'Sergio Andrés Romero Bedoya',cedula:'1.027.152.098',ciudad:'Barranquilla, Atlántico',direccion:'Carrera 54 #84-95, Riomar',telefono:'310 211 9906'},
 pereira:{nombre:'Cristián Camilo Lesmes González',cedula:'80.027.156',ciudad:'Pereira, Risaralda',direccion:'Carrera 17 #9-70, local 101, Pinares',telefono:'321 347 3757'},
};
const key=(s:string|null|undefined)=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/^sede\s+/,'').trim();
/** Owner of the contract's store; unknown stores keep the Villavicencio owner (previous behaviour). */
export function contractOwner(sede:string|null|undefined):ContractOwner{
 const k=key(sede);
 return OWNERS[k]||Object.entries(OWNERS).find(([n])=>k.includes(n))?.[1]||OWNERS.villavicencio;
}

type Section={titulo:string;parrafos:string[];lista?:string[]};
/** Ally agreement (uploaded Word): the Villavicencio owner's data is replaced by the owner of the ally's store.
 *  The data-protection annex (ANEXO) keeps the company's single controller. */
export function ownerAgreement<T extends Section>(sections:T[],sede:string|null|undefined):T[]{
 const o=contractOwner(sede),v=OWNERS.villavicencio;
 if(!sede||o===v)return sections;
 const ciudad=o.ciudad.split(',')[0];
 const f=(s:string)=>s.replace(/JORGE ANDRÉS ROMERO DÍAZ/g,o.nombre.toUpperCase()).replace(/Jorge Andrés Romero Díaz/g,o.nombre).replace(/80\.031\.674/g,o.cedula)
  .replace(/Calle 15 # ?42-21, Casa 7, Bugambiles, barrio El Buque, Villavicencio, Meta/gi,`${o.direccion}, ${o.ciudad}`)
  .replace(/301 730 7411/g,o.telefono).replace(/identificado con cédula de ciudadanía/g,o.mujer?'identificada con cédula de ciudadanía':'identificado con cédula de ciudadanía').replace(/\b(en|conciliación en) Villavicencio\b/g,`$1 ${ciudad}`);
 return sections.map(s=>/^ANEXO/i.test(s.titulo)?s:({...s,titulo:f(s.titulo),parrafos:s.parrafos.map(f),...(s.lista?{lista:s.lista.map(f)}:{})}));
}
