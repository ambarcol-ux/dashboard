/** Contact data of a customer (first visit booking and its edition): the same rules in the browser and on the server. */

/** Full name: letters only (accents, ñ, hyphen, apostrophe), at least name and surname of 2+ letters, no digits. */
export function personNameError(value:string){
 const v=value.trim().replace(/\s+/g,' ');
 if(!v)return 'Escribe tu nombre completo.';
 if(/\d/.test(v))return 'El nombre no puede tener números. Escribe tu nombre y apellido, por ejemplo: María Gómez.';
 if(!/^[\p{L}][\p{L}'’ -]*$/u.test(v))return 'Escribe tu nombre solo con letras, por ejemplo: María Gómez.';
 const partes=v.split(' ').filter(p=>p.replace(/['’-]/g,'').length>=2);
 if(partes.length<2)return 'Escribe tu nombre y apellido, por ejemplo: María Gómez.';
 if(v.length>120)return 'El nombre es demasiado largo (máximo 120 caracteres).';
 return null;
}
export const cleanPersonName=(value:string)=>value.trim().replace(/\s+/g,' ');

/** Colombian mobile: 10 digits starting with 3; +57 / 57 is removed. Returns the 10 digits or null. */
export function colombianMobile(value:string){
 let d=String(value||'').replace(/\D/g,'');
 if(d.length===12&&d.startsWith('57'))d=d.slice(2);
 return /^3\d{9}$/.test(d)?d:null;
}
export const MOBILE_ERROR='Revisa tu celular: deben ser 10 números y empezar por 3. Ejemplo: 3001234567.';
/** «311 860 4783» for confirmations. */
export const formatMobile=(d:string)=>`${d.slice(0,3)} ${d.slice(3,6)} ${d.slice(6)}`;

/** Colombian ID number: digits only, 6 to 10. */
export function cedula(value:string){const d=String(value||'').replace(/[.\s-]/g,'');return /^\d{6,10}$/.test(d)?d:null;}
export const CEDULA_ERROR='Revisa la cédula: solo números, entre 6 y 10 dígitos.';

const DOMAINS:Record<string,string>={'gmial.com':'gmail.com','gmai.com':'gmail.com','gamil.com':'gmail.com','gmail.co':'gmail.com','gmal.com':'gmail.com','gmail.con':'gmail.com','hotmial.com':'hotmail.com','hotmal.com':'hotmail.com','hotmail.co':'hotmail.com','hotmail.con':'hotmail.com','yaho.com':'yahoo.com','yahoo.co':'yahoo.com','outlok.com':'outlook.com','outlook.co':'outlook.com','iclod.com':'icloud.com'};
/** The corrected email when the domain looks mistyped (e.g. gmial.com → gmail.com), otherwise null. */
export function emailTypo(value:string){
 const [user,domain]=value.trim().toLowerCase().split('@');
 return user&&domain&&DOMAINS[domain]?`${user}@${DOMAINS[domain]}`:null;
}
export const validEmail=(v:string)=>v.length<=160&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
