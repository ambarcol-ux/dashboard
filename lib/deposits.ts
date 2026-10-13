export type DepositContract={id:string;numero_contrato:string;numero_factura?:string|null;cliente_nombre:string;cliente_documento:string;valor_deposito:number|null;sede:string;sede_id:string|null;estado:string;cliente_whatsapp:string|null;whatsapp:string|null;created_at:string;banco_deposito?:string|null;tipo_cuenta_deposito?:string|null;numero_cuenta_deposito?:string|null;titular_cuenta_deposito?:string|null};
export type DepositReturn={id:string;contrato_id:string|null;monto_devuelto:number;monto_descuento:number|null;motivo_descuento:string|null;fecha_devolucion:string;fecha_pago_deposito:string|null;comprobante_path:string|null;comprobante_url:string|null;observaciones:string|null;estado:string|null;created_at:string};
export type DepositMovement={id:string;contrato_id:string;tipo:'ingreso'|'devolucion';monto:number;descuento:number;fecha:string;metodo:string;motivo:string|null;observaciones:string|null;comprobante_path:string|null;devolucion_id:string|null;created_at:string};
export const money=(value:number)=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:2}).format(value);
export const cents=(value:unknown)=>Math.round(Number(value||0)*100);
export function depositSummary(contract:DepositContract,returns:DepositReturn[]){
 const valid=returns.filter(r=>r.contrato_id===contract.id&&!['cancelado','anulado','rechazado'].includes((r.estado||'completado').toLowerCase()));
 const total=cents(contract.valor_deposito),returned=valid.reduce((n,r)=>n+cents(r.monto_devuelto),0),deducted=valid.reduce((n,r)=>n+cents(r.monto_descuento),0),available=total-returned-deducted;
 return {total:total/100,returned:returned/100,deducted:deducted/100,available:available/100,status:available<0?'Revisar saldo':total===0?'Sin depósito':available===0?'Liquidado':'Por devolver'};
}
export function movementHistory(contract:DepositContract,returns:DepositReturn[],movements:DepositMovement[]){
 const own=movements.filter(m=>m.contrato_id===contract.id);const linked=new Set(own.map(m=>m.devolucion_id));
 return [...own.map(m=>({id:m.id,type:m.tipo==='ingreso'?'Ingreso':'Devolución',date:m.fecha,amount:m.monto,deduction:m.descuento,method:m.metodo,note:[m.motivo,m.observaciones].filter(Boolean).join(' · '),path:m.comprobante_path,url:null as string|null,source:'movimiento' as string})),...returns.filter(r=>r.contrato_id===contract.id&&!linked.has(r.id)).map(r=>({id:r.id,type:`Devolución · ${r.estado||'completado'}`,date:r.fecha_devolucion,amount:r.monto_devuelto,deduction:r.monto_descuento||0,method:'Registro anterior',note:[r.motivo_descuento,r.observaciones].filter(Boolean).join(' · '),path:r.comprobante_path,url:r.comprobante_url,source:'anterior' as string}))].sort((a,b)=>b.date.localeCompare(a.date));
}


export function needsDepositReceipt(contract:DepositContract,movements:DepositMovement[],supports:{contrato_id:string}[]){
 if(supports.some(s=>s.contrato_id===contract.id))return false;
 const documented=movements.filter(m=>m.contrato_id===contract.id&&m.tipo==='ingreso'&&m.comprobante_path).reduce((n,m)=>n+cents(m.monto),0);
 return cents(contract.valor_deposito)>documented;
}
