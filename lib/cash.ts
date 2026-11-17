export type CashSupport={id:string;path:string;nombre:string;tipo:string;subido_at?:string;subido_por?:string|null};
export type CashMissingSupport={pago_id:string;numero_contrato:string;cliente:string;valor:number;medio:string;recibo:string|null};
export type CashAccount={id:string;nombre:string;tipo:'efectivo'|'banco'|'billetera';banco:string|null;numero:string|null;titular:string|null;tipo_cuenta?:'ahorros'|'corriente'|null;llave?:string|null;sede_id:string|null;sede:string|null;activo:boolean;orden:number};
export type CashEdit={anterior:Record<string,unknown>;nuevo:Record<string,unknown>;motivo:string;usuario:string;created_at:string};
export type CashMovement={cuenta_id?:string|null;cuenta?:string|null;ediciones?:CashEdit[];pago_id?:string|null;soportes?:CashSupport[]|null;soporte_historico?:boolean|null;id:string;tipo:'ingreso'|'egreso';categoria:string;medio:string;valor:number;descripcion:string;contrato_id:string|null;numero_contrato:string|null;cliente:string|null;
 origen:string|null;comprobante_path:string|null;usuario:string;created_at:string;anulado_at:string|null;motivo_anulacion:string|null;anulado_por:string|null};
export type CashSuggestion={soportes?:CashSupport[];soporte_historico?:boolean;origen:'pago'|'deposito'|'devolucion';origen_id:string;tipo:'ingreso'|'egreso';categoria:string;medio:string;valor:number;contrato_id:string;numero_contrato:string;cliente:string;hora:string};
export type CashClosing={id:string;saldo_inicial:number;ingresos_efectivo:number;egresos_efectivo:number;esperado:number;contado:number;diferencia:number;observaciones:string;cerrado_at:string;cerrado_por_nombre:string};
export type CashDay={sede_id:string;fecha:string;saldo_inicial:number;movimientos:CashMovement[];
 totales:{ingresos:number;egresos:number;ingresos_efectivo:number;egresos_efectivo:number;base?:number;por_medio:Record<string,{ingresos:number|null;egresos:number|null}>;
  por_cuenta?:{cuenta_id:string|null;cuenta:string;tipo:CashAccount['tipo']|null;ingresos:number;egresos:number}[]};
 cuentas?:CashAccount[];inicio?:string|null;
 cierre:CashClosing|null;sugerencias:CashSuggestion[];puede_operar:boolean;es_hoy:boolean;
 pagos_sin_soporte?:CashMissingSupport[];soportes?:{pagos:number;con_soporte:number}};
export type CashSiteSummary={inicio?:string|null;base?:number;sede_id:string;sede:string;ingresos:number;egresos:number;ingresos_efectivo:number;egresos_efectivo:number;dias_cerrados:number;diferencia:number;dias_con_movimientos_sin_cierre:number;saldo_actual:number};

export type MoneyAccountRow={cuenta_id:string|null;nombre:string;tipo:CashAccount['tipo']|'sin_cuenta';banco:string|null;numero:string|null;sede:string|null;activo:boolean|null;
 ingresos:number;egresos:number;neto:number;pagos:number;depositos:number;devoluciones:number;otros_ingresos:number;otros_egresos:number;movimientos:number;por_sede:Record<string,number>;efectivo_en_caja:number|null};
export type MoneyPending={sede_id:string;sede:string;pagos:number;valor_pagos:number};
export type DepositSummaryRow={sede_id:string;sede:string;metodo:string;recibidos:number;n_recibidos:number;devueltos:number;n_devueltos:number;retenidos:number;neto:number};
export type DepositSummary={filas:DepositSummaryRow[];recibidos:number;devueltos:number;retenidos:number};
export type CashStart={sede_id:string;sede:string;fecha_inicio:string|null;saldo_inicio:number;actualizado_por:string|null;updated_at:string|null};
export type WhereIsMoney={desde:string;hasta:string;cuentas:MoneyAccountRow[];sin_registrar:MoneyPending[];depositos:DepositSummary};

export const CASH_METHODS=['Efectivo','Transferencia','Tarjeta','Otro'] as const;
export const CASH_CATEGORIES={
 ingreso:['Pago de contrato','Base de caja','Venta de accesorios','Arreglos','Otro ingreso'],
 egreso:['Gasto operativo','Transporte','Compras e insumos','Nómina / anticipos','Consignación a banco','Otro egreso'],
} as const;
/** Opening float added during the day: cash put in the drawer with no sale behind it; it counts for the expected cash but not as income. */
export const CASH_BASE='Base de caja';
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

export const ACCOUNT_TYPES:Record<CashAccount['tipo'],string>={efectivo:'Caja menor (efectivo)',banco:'Cuenta bancaria',billetera:'Billetera digital'};

/** Accounts where money paid by this method can land: cash goes to the site's petty cash; the rest to an active bank or wallet of the site or general. */
export function accountsFor(medio:string,cuentas:CashAccount[]|undefined,sedeId:string){
 return (cuentas||[]).filter(c=>c.activo&&(c.sede_id===null||c.sede_id===sedeId)&&(medio==='Efectivo'?c.tipo==='efectivo':c.tipo!=='efectivo'));
}
/** Transfers and card payments must say which account received them once any bank or wallet is configured. */
export const needsAccount=(medio:string,options:CashAccount[])=>(medio==='Transferencia'||medio==='Tarjeta')&&options.length>0;
export const accountLabel=(c:Pick<CashAccount,'nombre'|'banco'|'numero'>)=>[c.nombre,c.banco&&!c.nombre.toLowerCase().includes(c.banco.toLowerCase())?c.banco:null,c.numero?`****${c.numero.slice(-4)}`:null].filter(Boolean).join(' · ');

const FIELD_LABELS:Record<string,string>={medio:'Medio',valor:'Valor',categoria:'Categoría',descripcion:'Descripción',cuenta:'Cuenta'};
/** Human summary of what an admin changed in a movement ("Medio: Transferencia → Efectivo"). */
export function editSummary(e:Pick<CashEdit,'anterior'|'nuevo'>,format:(v:number)=>string=String){
 return Object.keys(FIELD_LABELS).filter(k=>String(e.anterior[k]??'')!==String(e.nuevo[k]??'')).map(k=>{
  const show=(v:unknown)=>v===null||v===undefined||v===''?'—':k==='valor'?format(Number(v)):String(v);
  return `${FIELD_LABELS[k]}: ${show(e.anterior[k])} → ${show(e.nuevo[k])}`;
 });
}
