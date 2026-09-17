export type DepositRequest = {
 id:string;contrato_id:string;monto:number;descuento:number;metodo:string;motivo:string|null;observaciones:string|null;
 estado:'pendiente'|'en_proceso'|'pagado'|'devuelto'|'cancelado';solicitante_id:string;solicitante_nombre:string;
 responsable_id:string|null;responsable_nombre:string|null;created_at:string;recibido_at:string;pago_at:string|null;
 comprobante_path:string|null;banco:string|null;tipo_cuenta:string|null;cuenta:string|null;titular:string|null;
};
export type RequestEvent={id:string;solicitud_id:string;estado:string;usuario_nombre:string;detalle:string|null;created_at:string};
export const requestLabels:Record<string,string>={pendiente:'Pendiente de devolución',en_proceso:'En proceso de pago',pagado:'Pagado',devuelto:'Depósito devuelto',cancelado:'Cancelado'};
export const isPending=(r:DepositRequest)=>['pendiente','en_proceso','pagado'].includes(r.estado);
export const canPay=(role:string)=>['admin','contabilidad'].includes(role.toLowerCase());
