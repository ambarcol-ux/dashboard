/** Metas y Ventas: monthly goal per site, daily goal and receivables aging (guía 20/10/2026). */
export type SiteGoal={sede_id:string;sede:string;meta_id:string|null;meta:number|null;automatica:boolean;dias_operativos:number;dias_calculados:number;dias_restantes:number;vendido:number;vendido_hasta_ayer:number;contratos:number;recaudado_mes:number};
export type Receivable={id:string;numero_contrato:string;cliente:string;sede_id:string|null;sede:string|null;fecha:string;factura:string|null;recibo:string|null;valor:number;recaudado:number;saldo:number;dias:number;estado:string|null};
import {saldoContrato} from './saldo';
export type AgingBucket='al_dia'|'mas30'|'mas90'|'mas120'|'pagada';

const n=(v:unknown)=>Number(v)||0;
/** Base daily goal = monthly goal ÷ operating days. */
export const baseDailyGoal=(g:Pick<SiteGoal,'meta'|'dias_operativos'>)=>g.meta&&g.dias_operativos>0?Math.round(n(g.meta)/g.dias_operativos):null;
/** Today's goal = (monthly goal − sold until yesterday) ÷ operating days left (today included); never negative. */
export function todayGoal(g:Pick<SiteGoal,'meta'|'vendido_hasta_ayer'|'dias_restantes'>){
 if(!g.meta||g.dias_restantes<=0)return null;
 return Math.max(0,Math.round((n(g.meta)-n(g.vendido_hasta_ayer))/g.dias_restantes));
}
export const progress=(g:Pick<SiteGoal,'meta'|'vendido'>)=>g.meta?Math.round(n(g.vendido)/n(g.meta)*1000)/10:0;

/** 0–30 al día, 31–90 +30, 91–120 +90, >120 +120; zero balance = pagada. */
export function agingBucket(r:Pick<Receivable,'saldo'|'dias'>):AgingBucket{
 if(saldoContrato({saldo:r.saldo})<=0)return 'pagada';
 return r.dias>120?'mas120':r.dias>90?'mas90':r.dias>30?'mas30':'al_dia';
}
export const AGING:Record<AgingBucket,{label:string;chip:string;cls:string}>={
 al_dia:{label:'Al día',chip:'Al día',cls:'bg-emerald-50 text-emerald-700 border-emerald-300'},
 mas30:{label:'Vencida +30',chip:'+30 días',cls:'bg-amber-50 text-amber-700 border-amber-300'},
 mas90:{label:'Vencida +90',chip:'+90 días',cls:'bg-orange-50 text-orange-700 border-orange-300'},
 mas120:{label:'Vencida +120',chip:'+120 días',cls:'bg-rose-50 text-rose-700 border-rose-400 font-black'},
 pagada:{label:'Pagada',chip:'Pagadas',cls:'bg-gray-50 text-gray-500 border-gray-200'},
};
export const overdueBalance=(rows:Receivable[])=>rows.filter(r=>['mas30','mas90','mas120'].includes(agingBucket(r))).reduce((a,r)=>a+saldoContrato({saldo:r.saldo}),0);

const csvCell=(v:unknown)=>{const s=String(v??'');return /[",;\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;};
/** CSV (opens in Excel) of the receivables panel. */
export function receivablesCsv(rows:Receivable[]){
 const head=['Contrato','Cliente','Sede','Fecha','Factura / RC','Valor','Recaudado','Saldo','Días','Estado'];
 return '﻿'+[head,...rows.map(r=>[r.numero_contrato,r.cliente,r.sede||'',r.fecha,r.factura||r.recibo||'',n(r.valor),n(r.recaudado),n(r.saldo),r.dias,AGING[agingBucket(r)].label])].map(l=>l.map(csvCell).join(';')).join('\n');
}
