'use client';
import {useEffect} from 'react';

const FECHA=new Set(['date','datetime-local','month']);
const PERMITIDAS=new Set(['Tab','Escape','Enter','Backspace','Delete']);

/** Every date field of the ERP is chosen with the calendar: typing is blocked (a typed year like «0202» caused wrong dates) and a tap
 *  opens the picker. Backspace/Delete still clear an optional date. Applies to all pages at once. */
export default function DatePickerOnly(){
 useEffect(()=>{
  const esFecha=(t:EventTarget|null):t is HTMLInputElement=>t instanceof HTMLInputElement&&FECHA.has(t.type);
  const tecla=(e:KeyboardEvent)=>{if(esFecha(e.target)&&!PERMITIDAS.has(e.key)&&!e.ctrlKey&&!e.metaKey)e.preventDefault();};
  const abrir=(e:MouseEvent)=>{const t=e.target;if(esFecha(t)&&!t.disabled&&!t.readOnly){try{t.showPicker();}catch{/* older browsers open it on their own */}}};
  const pegar=(e:ClipboardEvent)=>{if(esFecha(e.target))e.preventDefault();};
  document.addEventListener('keydown',tecla,true);document.addEventListener('click',abrir,true);document.addEventListener('paste',pegar,true);
  return()=>{document.removeEventListener('keydown',tecla,true);document.removeEventListener('click',abrir,true);document.removeEventListener('paste',pegar,true);};
 },[]);
 return null;
}
