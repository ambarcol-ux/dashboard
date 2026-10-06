export type GuaranteeFields={valor_deposito:string;deposito_banco:string;deposito_tipo_cuenta:string;deposito_numero:string;deposito_titular:string};
export function guaranteeError(data:GuaranteeFields):string|null{
 const amount=Number(data.valor_deposito);
 if(!data.valor_deposito.trim()||!Number.isFinite(amount)||amount<=0||amount>9999999999.99||Math.abs(amount*100-Math.round(amount*100))>0.0001)return 'Indica un valor de garantía mayor que cero, con máximo dos decimales.';
 for(const [field,label] of [['deposito_banco','banco'],['deposito_tipo_cuenta','tipo de cuenta'],['deposito_numero','número de cuenta'],['deposito_titular','titular de la cuenta']] as const){if(!data[field].trim())return `Completa el ${label} para la devolución de la garantía.`;}
 return null;
}
