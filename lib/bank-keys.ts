/** Bre-B keys (llaves): wherever a bank account is registered, a key can be used instead of an account number.
 * Same list and rules in private.editar_datos_devolucion (deposit refunds). */
export const KEY_TYPES=['Llave: celular','Llave: cédula','Llave: correo','Llave: alfanumérica (@)','Llave: código de comercio'];
export const isKeyType=(t:string|null|undefined)=>KEY_TYPES.includes(String(t||''));
export const digitsOnly=(v:string)=>v.replace(/[^0-9-]/g,'');
const KEY_RULES:Record<string,[RegExp,string,string]>={
 'Llave: celular':[/^3\d{9}$/,'3001234567','La llave celular tiene 10 números y empieza por 3.'],
 'Llave: cédula':[/^\d{5,15}$/,'1234567890','La llave cédula tiene entre 5 y 15 números.'],
 'Llave: correo':[/^[^@\s]+@[^@\s]+\.[^@\s]+$/,'nombre@correo.com','Escribe un correo válido como llave.'],
 'Llave: alfanumérica (@)':[/^@?[A-Za-z0-9._-]{3,30}$/,'@MiLlave123','La llave alfanumérica lleva letras, números y . _ - (puede empezar con @).'],
 'Llave: código de comercio':[/^[A-Za-z0-9]{3,20}$/,'0012345678','El código de comercio lleva solo letras y números.'],
};
/** Keeps what each type allows: accounts only numbers and dashes; keys their own characters. */
export const cleanAccount=(t:string,v:string)=>!isKeyType(t)?digitsOnly(v):['Llave: celular','Llave: cédula'].includes(t)?v.replace(/\D/g,''):v.replace(/\s/g,'');
export const accountPlaceholder=(t:string)=>KEY_RULES[t]?.[1]||'Solo números';
export const accountLabel=(t:string|null|undefined,fallback='Número de cuenta')=>isKeyType(t)?'Llave':fallback;
export const accountInputMode=(t:string|null|undefined):'numeric'|'text'=>isKeyType(t)&&!['Llave: celular','Llave: cédula'].includes(String(t))?'text':'numeric';
/** Error when a key does not match its type; null when valid or when the type is an account. */
export const keyError=(t:string|null|undefined,v:string)=>{const r=KEY_RULES[String(t||'')];return r&&!r[0].test(v.trim())?r[2]:null;};
/** Error when the account or key does not match its type; null when valid. */
export const accountError=(t:string,v:string)=>isKeyType(t)?keyError(t,v):/^[0-9][0-9 -]{3,29}$/.test(v.trim())?null:'El número de cuenta solo lleva números (y guiones).';
