/** Rental price shown in the dress agenda: the contract value when the date has a contract, otherwise the inventory list price. */
export type RentalPrice={label:'Precio contrato'|'Precio lista';value:number|null;text:string};
const cop=(v:number)=>'$'+Math.round(v).toLocaleString('es-CO').replace(/,/g,'.');
const positive=(v:unknown)=>{const n=Number(v);return v!==null&&v!==undefined&&v!==''&&Number.isFinite(n)&&n>0?n:null;};
export function rentalPrice(contractValue:unknown,listPrice:unknown,hasContract:boolean):RentalPrice{
 const value=positive(hasContract?contractValue:listPrice);
 return {label:hasContract?'Precio contrato':'Precio lista',value,text:value===null?'Sin precio':cop(value)};
}
/** Contract id inside an agenda block id. */
export const blockContractId=(blockId:string)=>blockId.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]||null;
