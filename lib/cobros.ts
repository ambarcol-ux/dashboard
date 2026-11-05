import {saldoContrato} from '@/lib/saldo';

/** Cuentas por cobrar: active contracts with a balance, by how soon the dress is delivered (alerts at 7 and 3 days). */
export const COBRO_FIELDS='id,numero_contrato,cliente_nombre,cliente_whatsapp,whatsapp,sede,sede_id,estado,fecha_evento,fecha_entrega_envio,valor_total,total_arreglos,anticipo,saldo,total_multas,nombre_asesora,asesora,asesora_id,entregado_evento';
/** States that no longer collect money (or never did). */
export const COBRO_EXCLUIDOS=['cancelado','cancelada','anulado','anulada','rechazado','borrador','finalizado','liquidado','historial'];
export type Cobro={id:string;numero_contrato:string|null;cliente_nombre:string|null;cliente_whatsapp?:string|null;whatsapp?:string|null;sede:string|null;sede_id:string|null;estado:string|null;
 fecha_evento:string|null;fecha_entrega_envio:string|null;valor_total:number|null;total_arreglos:number|null;anticipo:number|null;saldo:number|null;total_multas:number|null;
 nombre_asesora?:string|null;asesora?:string|null;asesora_id?:string|null;entregado_evento?:boolean|null};
export type Plazo='vencido'|'tres'|'siete'|'despues'|'entregado';
export const PLAZOS:Record<Plazo,string>={vencido:'Vencido (ya pasó la entrega)',tres:'Se entrega en 3 días o menos',siete:'Se entrega en 4 a 7 días',despues:'Más adelante',entregado:'Ya entregado'};

export const hoyBogota=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'});
/** Delivery date: the shipping date when there is one, otherwise the event. */
export const fechaEntrega=(c:Pick<Cobro,'fecha_entrega_envio'|'fecha_evento'>)=>(c.fecha_entrega_envio||c.fecha_evento||'').slice(0,10)||null;
export function diasParaEntrega(c:Cobro,hoy=hoyBogota()){const f=fechaEntrega(c);if(!f)return null;return Math.round((Date.parse(f)-Date.parse(hoy))/86400000);}
export function plazoCobro(c:Cobro,hoy=hoyBogota()):Plazo{
 const est=String(c.estado||'').toLowerCase();
 if(c.entregado_evento||est==='entregado'||est==='mantenimiento')return 'entregado';
 const d=diasParaEntrega(c,hoy);
 if(d==null)return 'despues';
 return d<0?'vencido':d<=3?'tres':d<=7?'siete':'despues';
}
/** Balance to collect: contract balance plus penalties. */
// A paid penalty leaves the balance negative by the same amount, so both are added before clamping.
export const porCobrar=(c:Cobro)=>Math.max(0,saldoContrato(c)+Math.max(0,Number(c.total_multas)||0));
/** Same rule everywhere: active contracts only (not cancelled, annulled, draft, finished…). */
export const cobroActivo=(estado:unknown)=>!COBRO_EXCLUIDOS.includes(String(estado||'').trim().toLowerCase());
/** Total to collect over any list of contracts, with the Cuentas por cobrar rule. */
export const totalPorCobrar=(rows:Cobro[])=>rows.filter(c=>cobroActivo(c.estado)).reduce((a,c)=>a+porCobrar(c),0);
/** Needs attention now: not delivered and due within 7 days (or overdue). */
export const urgente=(c:Cobro,hoy=hoyBogota())=>porCobrar(c)>0&&['vencido','tres','siete'].includes(plazoCobro(c,hoy));
