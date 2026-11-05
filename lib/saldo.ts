/** Single balance rule: total with extras (valor_total + total_arreglos) minus the payments held in anticipo (non-annulled abonos). */
export type SaldoInput={valor_total?:unknown;total_arreglos?:unknown;anticipo?:unknown;saldo?:unknown;total_multas?:unknown};
const n=(v:unknown)=>Number(v)||0;

export const totalContrato=(c:SaldoInput)=>n(c.valor_total)+n(c.total_arreglos);

export function saldoContrato(c:SaldoInput){
 if(c.valor_total==null&&c.anticipo==null)return n(c.saldo);
 return Math.round((totalContrato(c)-n(c.anticipo))*100)/100;
}

/** What the client still owes: contract balance plus penalties (a penalty is paid as an abono, so it may leave the balance negative). */
export const porPagarContrato=(c:SaldoInput)=>Math.round((saldoContrato(c)+n(c.total_multas))*100)/100;
/** Registrar Abono is blocked only when there is nothing left to pay (balance and penalties). */
export const puedeAbonar=(c:SaldoInput)=>porPagarContrato(c)>0;
/** Registrar Entrega is allowed only when the balance is paid. */
export const puedeEntregar=(c:SaldoInput)=>saldoContrato(c)<=0;
