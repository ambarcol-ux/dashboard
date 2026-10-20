/** Ámbar deposit table: the guarantee deposit depends on the dress category and its price. */
export type DepositTier={desde:number;hasta:number|null;deposito:number};
export const DEPOSIT_TABLE:{categoria:'Gala'|'XV Años';titulo:string;tramos:DepositTier[]}[]=[
 {categoria:'Gala',titulo:'Vestidos de gala',tramos:[{desde:0,hasta:300000,deposito:150000},{desde:300001,hasta:null,deposito:300000}]},
 {categoria:'XV Años',titulo:'Vestidos de 15 años (XV)',tramos:[{desde:0,hasta:1800000,deposito:300000},{desde:1800001,hasta:3500000,deposito:500000},{desde:3500001,hasta:null,deposito:1000000}]},
];

/** Suggested deposit for one dress, or null when its category has no rule or the price is unknown. */
export function suggestedDeposit(categoria:string|null|undefined,precio:unknown){
 const table=DEPOSIT_TABLE.find(t=>t.categoria===categoria),value=Number(precio);
 if(!table||!Number.isFinite(value)||value<=0)return null;
 return table.tramos.find(t=>t.hasta===null||value<=t.hasta)!.deposito;
}

/** For several dresses the highest suggested deposit applies (one guarantee per contract). */
export function contractSuggestedDeposit(dresses:{categoria:string|null|undefined;precio:unknown}[]){
 const values=dresses.map(d=>suggestedDeposit(d.categoria,d.precio)).filter((v):v is number=>v!==null);
 return values.length?Math.max(...values):null;
}
