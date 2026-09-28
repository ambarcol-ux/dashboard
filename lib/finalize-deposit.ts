import {cents} from './deposits';
export function closingAmounts(available:number, raw:string, reason:string) {
 const discount=Number(raw);
 if(raw.trim()==='' || !Number.isFinite(discount) || discount<0 || cents(discount)>cents(available) || Math.abs(discount*100-Math.round(discount*100))>0.000001)
  throw new Error('Ingresa un descuento entre cero y el saldo disponible, con máximo dos decimales.');
 if(discount>0&&!reason.trim())throw new Error('Escribe el motivo del descuento.');
 return {discount:cents(discount)/100,refund:(cents(available)-cents(discount))/100};
}
