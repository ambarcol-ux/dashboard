/** Aliados Directos: types and display rules shared by the module page and the client-contract section. */
export type AllyType={id:number;nombre:string;activo:boolean};
export type AllyLine={id:number;nombre:string;tipo_comision:'porcentaje'|'valor';valor_comision:number};
export type DirectAlly={id:string;nombre:string;cedula:string;celular:string;correo:string;direccion:string;tipo_aliado_id:number;tipo:string;sede_principal:string|null;sede:string|null;
 estado:'pendiente_firma'|'activo'|'inactivo';banco:string|null;tipo_cuenta:string|null;numero_cuenta:string|null;cuenta_mascara:string|null;titular_cuenta:string|null;cuenta_validada:boolean;certificacion_path:string|null;
 cambio_pendiente:{id:number;banco:string;tipo_cuenta:string;numero_cuenta:string;titular_cuenta:string;solicitado_at:string}|null;
 firma:{fecha:string;version:string;codigo:string}|null;contratos:number;ventas:number;por_pagar:number;en_espera:number;pagado:number};
export type AllySearchResult={id:string;nombre:string;cedula:string;celular:string;correo:string;direccion:string;tipo_aliado_id:number;tipo:string};
export type AllyCommission={pago_id:string;contrato_id:string;numero_contrato:string;cliente:string;sede:string|null;fecha:string;linea:string|null;valor_contrato:number;saldo:number;comision:number;estado:'en_espera'|'por_pagar'|'pagado'|'anulado';fecha_pago:string|null;comprobante:string|null};

export const ALLY_STATUS:Record<DirectAlly['estado'],{label:string;cls:string}>={
 pendiente_firma:{label:'Pendiente de firma',cls:'bg-gray-100 text-gray-600 border-gray-300'},
 activo:{label:'Activo',cls:'bg-emerald-50 text-emerald-700 border-emerald-300'},
 inactivo:{label:'Inactivo',cls:'bg-rose-50 text-rose-700 border-rose-200'},
};
export const COMMISSION_STATUS:Record<AllyCommission['estado'],{label:string;cls:string}>={
 en_espera:{label:'En espera',cls:'bg-sky-50 text-sky-700 border-sky-200'},
 por_pagar:{label:'Por pagar',cls:'bg-amber-50 text-amber-700 border-amber-300'},
 pagado:{label:'Pagado',cls:'bg-emerald-50 text-emerald-700 border-emerald-300'},
 anulado:{label:'Anulado',cls:'bg-gray-50 text-gray-500 border-gray-200'},
};
/** Row status in "Contratos y pagos": unsigned allies first, then what is owed. */
export const allyRowStatus=(a:Pick<DirectAlly,'estado'|'por_pagar'>)=>a.estado==='pendiente_firma'?{label:'Pendiente de firma',cls:ALLY_STATUS.pendiente_firma.cls}:a.estado==='inactivo'?{label:'Inactivo',cls:ALLY_STATUS.inactivo.cls}:Number(a.por_pagar)>0?{label:'Por pagar',cls:COMMISSION_STATUS.por_pagar.cls}:{label:'Al día',cls:ALLY_STATUS.activo.cls};

/** Estimated commission for a line: percentage of the contract value or a fixed value. */
export function lineCommission(line:Pick<AllyLine,'tipo_comision'|'valor_comision'>|null|undefined,contractValue:unknown){
 if(!line)return 0;
 const v=Number(line.valor_comision)||0;
 return Math.round((line.tipo_comision==='porcentaje'?(Number(contractValue)||0)*v/100:v)*100)/100;
}
/** Validation of the client-contract section before saving. */
export function allySectionError(s:{tiene:boolean;tipo:number|null;aliado:string|null;linea:number|null}){
 if(!s.tiene)return null;
 if(!s.tipo)return 'Selecciona el tipo de aliado.';
 if(!s.aliado)return 'Busca y selecciona el aliado.';
 if(!s.linea)return 'Selecciona la línea que escogió el cliente.';
 return null;
}
export const onlyDigits=(v:string)=>v.replace(/\D/g,'');
