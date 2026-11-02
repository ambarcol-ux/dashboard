/** Contact details each store shows in customer messages (address, map, phone and WhatsApp). */
export type VisitSite={nombre:string;direccion:string;mapa:string;mapaEtiqueta:string;telefono:string;whatsapp:string};

const SITES:VisitSite[]=[
 {nombre:'Bogotá',direccion:'Carrera 15 #106-76, segundo piso, Molinos Norte, Bogotá. Cerca de Unicentro.',mapa:'https://maps.app.goo.gl/bfZE7XW9rxfcV8vt7',mapaEtiqueta:'Cómo llegar en Google Maps',telefono:'305 807 3210',whatsapp:'573058073210'},
 {nombre:'Pereira',direccion:'Carrera 17 #9-70, local 101, barrio Pinares, Pereira, Risaralda.',mapa:'https://www.google.com/maps/search/?api=1&query=Carrera%2017%20%239-70%20Local%20101%20Pinares%20Pereira',mapaEtiqueta:'Cómo llegar en Google Maps',telefono:'321 347 3757',whatsapp:'573213473757'},
 {nombre:'Villavicencio',direccion:'Calle 15 #42-21, casa 7, Villavicencio, Meta. Una cuadra arriba del Centro Comercial Primavera Urbana.',mapa:'https://share.google/V1tpS2sfzzhFMq8bS',mapaEtiqueta:'Cómo llegar en Google',telefono:'321 489 3891',whatsapp:'573214893891'},
 {nombre:'Barranquilla',direccion:'Carrera 54 #84-95, Riomar, Barranquilla. Cerca del Centro Comercial Viva, frente al colegio Biffi La Salle.',mapa:'https://share.google/emQJr5NJI0YECOWzN',mapaEtiqueta:'Cómo llegar en Google',telefono:'310 211 9906',whatsapp:'573102119906'},
];

const key=(value:string)=>value.normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toLowerCase();

/** Store details by name ("Bogota", "bogotá" and "Bogotá" match), or null for an unknown store.
 * sites: the stores' current details from Configuración › Sedes (see siteRows); falls back to the built-in ones. */
export const visitSite=(name:string|null|undefined,sites:VisitSite[]=SITES)=>name?sites.find(s=>key(s.nombre)===key(name))||SITES.find(s=>key(s.nombre)===key(name))||null:null;
export type SiteRow={nombre:string;telefono:string|null;whatsapp:string|null;direccion_clientes:string|null;mapa_url:string|null;mapa_etiqueta:string|null};
export const SITE_COLUMNS='nombre,telefono,whatsapp,direccion_clientes,mapa_url,mapa_etiqueta';
type SiteDb={from:(t:string)=>{select:(c:string)=>PromiseLike<{data:unknown}>}};
/** Loads the stores' contact details; any failure keeps the built-in ones so messages always go out. */
export async function loadVisitSites(db:unknown):Promise<VisitSite[]>{
 try{const {data}=await (db as SiteDb).from('sedes').select(SITE_COLUMNS);return siteRows(data as SiteRow[]|null);}catch{return [];}
}
/** Stores with complete contact details in the database (others keep the built-in ones). */
export const siteRows=(rows:SiteRow[]|null|undefined):VisitSite[]=>(rows||[]).filter(r=>r.telefono&&r.whatsapp&&r.direccion_clientes&&r.mapa_url)
 .map(r=>({nombre:r.nombre,telefono:r.telefono!,whatsapp:r.whatsapp!,direccion:r.direccion_clientes!,mapa:r.mapa_url!,mapaEtiqueta:r.mapa_etiqueta||'Cómo llegar'}));

/** "2026-10-15" → "15 de octubre de 2026" */
export const visitDate=(day:string)=>new Date(day+'T12:00:00Z').toLocaleDateString('es-CO',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
/** "15:00" → "3:00 p. m." */
export function visitTime(hour:string){
 const [h,m]=hour.split(':').map(Number);
 return `${h%12||12}:${String(m||0).padStart(2,'0')} ${h<12?'a. m.':'p. m.'}`;
}
