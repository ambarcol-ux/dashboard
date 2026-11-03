export type DepositRequest = {
 id:string;contrato_id:string;monto:number;descuento:number;metodo:string;motivo:string|null;observaciones:string|null;
 estado:'pendiente'|'en_proceso'|'pagado'|'devuelto'|'cancelado';solicitante_id:string;solicitante_nombre:string;
 responsable_id:string|null;responsable_nombre:string|null;created_at:string;recibido_at:string;pago_at:string|null;
 comprobante_path:string|null;banco:string|null;tipo_cuenta:string|null;cuenta:string|null;titular:string|null;titular_cedula?:string|null;
};
export type RequestEvent={id:string;solicitud_id:string;estado:string;usuario_nombre:string;detalle:string|null;created_at:string};
export const requestLabels:Record<string,string>={pendiente:'Pendiente de devolución',en_proceso:'En proceso de pago',pagado:'Pagado',devuelto:'Depósito devuelto',cancelado:'Cancelado'};
export const isPending=(r:DepositRequest)=>['pendiente','en_proceso','pagado'].includes(r.estado);
/** Banks for refund transfers (dropdown). */
export const BANKS=['Bancolombia','Davivienda','Banco de Bogotá','BBVA','Banco de Occidente','Banco Popular','Banco AV Villas','Banco Caja Social','Banco Agrario','Scotiabank Colpatria','Itaú','Banco Falabella','Banco Pichincha','Bancoomeva','Banco GNB Sudameris','Banco W','Banco Finandina','Lulo Bank','Nu','Nequi','Daviplata','Otro'];
/** Bre-B keys (llaves): the refund can go to a key instead of an account number. Same list and rules in private.editar_datos_devolucion. */
export const KEY_TYPES=['Llave: celular','Llave: cédula','Llave: correo','Llave: alfanumérica (@)','Llave: código de comercio'];
export const ACCOUNT_TYPES=['Ahorros','Corriente',...KEY_TYPES];
export const isKeyType=(t:string)=>KEY_TYPES.includes(t);
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
/** Error message when the account or key does not match its type; null when valid. */
export const accountError=(t:string,v:string)=>{const r=KEY_RULES[t];if(r)return r[0].test(v.trim())?null:r[2];return /^[0-9][0-9 -]{3,29}$/.test(v.trim())?null:'El número de cuenta solo lleva números (y guiones).';};
export const digitsOnly=(v:string)=>v.replace(/[^0-9-]/g,'');
export const canPay=(role:string)=>['admin','contabilidad'].includes(role.toLowerCase());
