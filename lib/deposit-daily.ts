export type DailyMovement={id:string;tipo:'ingreso'|'devolucion';monto:number;descuento:number;fecha:string;registrado_at:string;metodo:string;motivo:string|null;observaciones:string|null;comprobante_path:string|null;
 contrato_id:string;numero_contrato:string;numero_factura:string|null;cliente_nombre:string;cliente_documento:string|null;sede:string;sede_id:string|null;usuario:string};
export type DailyFilters={sede:string;tipo:''|'ingreso'|'devolucion';metodo:string};
export const RECEIPT_TYPES:Record<string,string>={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
export const RECEIPT_MAX_BYTES=10*1024*1024;

export function filterDaily(rows:DailyMovement[],f:DailyFilters){
 return rows.filter(r=>(!f.sede||r.sede_id===f.sede)&&(!f.tipo||r.tipo===f.tipo)&&(!f.metodo||r.metodo===f.metodo));
}

/** Money in, money out (refunds actually paid) and the net of the day, in exact cents. Discounts are not cash and are reported apart. */
export function dailyTotals(rows:DailyMovement[]){
 const c=(v:unknown)=>Math.round(Number(v||0)*100);
 let ingresos=0,salidas=0,descuentos=0,sinComprobante=0;
 for(const r of rows){if(r.tipo==='ingreso')ingresos+=c(r.monto);else{salidas+=c(r.monto);descuentos+=c(r.descuento);}if(!r.comprobante_path)sinComprobante++;}
 return {ingresos:ingresos/100,salidas:salidas/100,neto:(ingresos-salidas)/100,descuentos:descuentos/100,movimientos:rows.length,sinComprobante};
}

/** Storage path for a receipt: always under the contract, as the database requires. */
export function receiptPath(contractId:string,operationId:string,type:string,name='comprobante'){
 const ext=RECEIPT_TYPES[type];
 if(!ext)throw Error('Adjunta un PDF, JPG, PNG o WebP de hasta 10 MB.');
 return `${contractId}/${operationId}/${name}.${ext}`;
}
export const receiptKind=(path:string)=>/\.pdf$/i.test(path)?'pdf':'image';
