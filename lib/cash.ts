export type CashSupport={id:string;path:string;nombre:string;tipo:string;subido_at?:string;subido_por?:string|null};
export type CashMissingSupport={pago_id:string;numero_contrato:string;cliente:string;valor:number;medio:string;recibo:string|null};
export type CashMovement={pago_id?:string|null;soportes?:CashSupport[]|null;soporte_historico?:boolean|null;id:string;tipo:'ingreso'|'egreso';categoria:string;medio:string;valor:number;descripcion:string;contrato_id:string|null;numero_contrato:string|null;cliente:string|null;
 origen:string|null;comprobante_path:string|null;usuario:string;created_at:string;anulado_at:string|null;motivo_anulacion:string|null;anulado_por:string|null};
export type CashSuggestion={soportes?:CashSupport[];soporte_historico?:boolean;origen:'pago'|'deposito'|'devolucion';origen_id:string;tipo:'ingreso'|'egreso';categoria:string;medio:string;valor:number;contrato_id:string;numero_contrato:string;cliente:string;hora:string};
export type CashClosing={id:string;saldo_inicial:number;ingresos_efectivo:number;egresos_efectivo:number;esperado:number;contado:number;diferencia:number;observaciones:string;cerrado_at:string;cerrado_por_nombre:string};
export type CashDay={sede_id:string;fecha:string;saldo_inicial:number;movimientos:CashMovement[];
 totales:{ingresos:number;egresos:number;ingresos_efectivo:number;egresos_efectivo:number;por_medio:Record<string,{ingresos:number|null;egresos:number|null}>};
 cierre:CashClosing|null;sugerencias:CashSuggestion[];puede_operar:boolean;es_hoy:boolean;
 pagos_sin_soporte?:CashMissingSupport[];soportes?:{pagos:number;con_soporte:number}};
export type CashSiteSummary={sede_id:string;sede:string;ingresos:number;egresos:number;ingresos_efectivo:number;egresos_efectivo:number;dias_cerrados:number;diferencia:number;dias_con_movimientos_sin_cierre:number;saldo_actual:number};

export const CASH_METHODS=['Efectivo','Transferencia','Tarjeta','Otro'] as const;
export const CASH_CATEGORIES={
 ingreso:['Pago de contrato','Depósito en garantía','Venta de accesorios','Arreglos','Otro ingreso'],
 egreso:['Gasto operativo','Transporte','Compras e insumos','Nómina / anticipos','Consignación a banco','Devolución de depósito','Comisiones aliados','Otro egreso'],
} as const;
export const CASH_RECEIPT_TYPES:Record<string,string>={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'};

const cents=(v:unknown)=>Math.round(Number(v||0)*100);
/** Cash that should be in the drawer: opening balance + cash in − cash out (exact cents). */
export const expectedCash=(inicial:unknown,ingresos:unknown,egresos:unknown)=>(cents(inicial)+cents(ingresos)-cents(egresos))/100;
export const cashDifference=(contado:unknown,esperado:unknown)=>(cents(contado)-cents(esperado))/100;

/** Parses a typed amount ("150.000", "150000", "150000,50") into a positive number with at most 2 decimals. */
export function parseCashAmount(raw:string){
 const clean=raw.trim().replace(/\s|\$/g,'');
 let normalized:string;
 if(/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(clean))normalized=clean.replace(/\./g,'').replace(',','.'); // 1.250.000,50
 else if(/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(clean))normalized=clean.replace(/,/g,''); // 1,250,000.50
 else if(/^\d+([.,]\d{1,2})?$/.test(clean))normalized=clean.replace(',','.'); // 150000 / 150000,5
 else return null;
 const value=Number(normalized);
 return Number.isFinite(value)&&value>0&&value<1e12?value:null;
}

export function cashReceiptPath(sedeId:string,fecha:string,id:string,type:string){
 const ext=CASH_RECEIPT_TYPES[type];
 if(!ext)throw Error('Adjunta un PDF, JPG, PNG o WebP de hasta 10 MB.');
 return `${sedeId}/${fecha}/${id}.${ext}`;
}

export function siteTotals(rows:CashSiteSummary[]){
 return rows.reduce((t,r)=>({ingresos:(cents(t.ingresos)+cents(r.ingresos))/100,egresos:(cents(t.egresos)+cents(r.egresos))/100,diferencia:(cents(t.diferencia)+cents(r.diferencia))/100,pendientes:t.pendientes+Number(r.dias_con_movimientos_sin_cierre||0)}),{ingresos:0,egresos:0,diferencia:0,pendientes:0});
}
