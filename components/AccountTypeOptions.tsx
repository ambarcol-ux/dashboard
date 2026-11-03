import {KEY_TYPES} from '@/lib/bank-keys';

/** Options of a "Tipo de cuenta o llave" select: account types, then Bre-B keys; keeps an old value that is in neither. */
export default function AccountTypeOptions({base,current}:{base:string[];current?:string|null}){
 const cuentas=base.filter(t=>!KEY_TYPES.includes(t));
 const otro=current&&!cuentas.includes(current)&&!KEY_TYPES.includes(current)?current:null;
 return <>{otro&&<option>{otro}</option>}<optgroup label="Cuenta">{cuentas.map(t=><option key={t}>{t}</option>)}</optgroup><optgroup label="Llave Bre-B">{KEY_TYPES.map(t=><option key={t}>{t}</option>)}</optgroup></>;
}
