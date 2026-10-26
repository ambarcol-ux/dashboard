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
export const ACCOUNT_TYPES=['Ahorros','Corriente'];
export const digitsOnly=(v:string)=>v.replace(/[^0-9-]/g,'');
export const canPay=(role:string)=>['admin','contabilidad'].includes(role.toLowerCase());
