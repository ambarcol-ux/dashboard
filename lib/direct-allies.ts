/** Aliados Directos: types and display rules of the module page (no commissions). */
export type AllyType={id:number;nombre:string;activo:boolean};
export type DirectAlly={id:string;nombre:string;cedula:string;celular:string;correo:string;direccion:string;tipo_aliado_id:number;tipo:string;sede_principal:string|null;sede:string|null;
 estado:'pendiente_firma'|'activo'|'inactivo';banco:string|null;tipo_cuenta:string|null;numero_cuenta:string|null;cuenta_mascara:string|null;titular_cuenta:string|null;cuenta_validada:boolean;certificacion_path:string|null;
 cambio_pendiente:{id:number;banco:string;tipo_cuenta:string;numero_cuenta:string;titular_cuenta:string;solicitado_at:string}|null;
 firma:{fecha:string;version:string;codigo:string}|null;contratos:number;ventas:number};
export type AllySearchResult={id:string;nombre:string;cedula:string;celular:string;correo:string;direccion:string;tipo_aliado_id:number;tipo:string};

export const ALLY_STATUS:Record<DirectAlly['estado'],{label:string;cls:string}>={
 pendiente_firma:{label:'Pendiente de firma',cls:'bg-gray-100 text-gray-600 border-gray-300'},
 activo:{label:'Activo',cls:'bg-emerald-50 text-emerald-700 border-emerald-300'},
 inactivo:{label:'Inactivo',cls:'bg-rose-50 text-rose-700 border-rose-200'},
};

export const onlyDigits=(v:string)=>v.replace(/\D/g,'');
