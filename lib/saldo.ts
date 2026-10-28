/** Single balance rule: total with extras (valor_total + total_arreglos) minus the payments held in anticipo (non-annulled abonos). */
export type SaldoInput={valor_total?:unknown;total_arreglos?:unknown;anticipo?:unknown;saldo?:unknown};
const n=(v:unknown)=>Number(v)||0;

export const totalContrato=(c:SaldoInput)=>n(c.valor_total)+n(c.total_arreglos);

export function saldoContrato(c:SaldoInput){
 if(c.valor_total==null&&c.anticipo==null)return n(c.saldo);
 return Math.round((totalContrato(c)-n(c.anticipo))*100)/100;
}

/** Registrar Abono is blocked only when there is nothing left to pay. */
export const puedeAbonar=(c:SaldoInput)=>saldoContrato(c)>0;
/** Registrar Entrega is allowed only when the balance is paid. */
export const puedeEntregar=(c:SaldoInput)=>saldoContrato(c)<=0;
