'use client';
import type {ChangeEvent,InputHTMLAttributes} from 'react';

/** Digits of a peso amount: a stored number («150000» or «150000.00») keeps its value; typed text keeps only its digits. */
export const moneyDigits=(v:unknown)=>{
 const t=String(v??'').trim();
 if(/^\d+(\.\d{1,2})?$/.test(t))return String(Math.round(Number(t)));
 return t.replace(/\D/g,'');
};
/** «1250000» → «1.250.000» (Colombian pesos, no cents). */
export const moneyDots=(v:unknown)=>moneyDigits(v).replace(/^0+(?=\d)/,'').replace(/\B(?=(\d{3})+(?!\d))/g,'.');

/** Money field in Colombian pesos: shows the thousands with dots while typing (1.250.000) and hands the page only the digits
 *  (1250000) through the usual onChange, so the page keeps working with plain numbers. */
export default function MoneyInput({value,onChange,type:_type,step:_step,...rest}:Omit<InputHTMLAttributes<HTMLInputElement>,'value'>&{value:unknown}){
 void _type;void _step;
 return <input {...rest} type="text" inputMode="numeric" autoComplete="off" value={moneyDots(value)}
  onChange={(e:ChangeEvent<HTMLInputElement>)=>{e.target.value=e.target.value.replace(/\D/g,'');onChange?.(e);}}/>;
}
