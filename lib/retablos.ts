export type RetabloEstado='PENDIENTE'|'PENDIENTE_RECOGER'|'ENTREGADO'|'ANULADO';
export type RetabloTipo={id:string;nombre:string;ancho_cm:number;alto_cm:number;valor:number|null;valor_cliente:number;valor_empresa:number|null;activo:boolean;usos:number};
export type Retablo={id:string;contrato_id:string;numero_contrato:string|null;tipo_id:string;tipo:string;cliente_nombre:string;cliente_cedula:string;numero_factura:string|null;
 valor_cliente:number;valor_empresa:number|null;estado:RetabloEstado;asesora_id:string|null;asesora:string|null;sede:string|null;observaciones:string;creado_en:string;entregado_en:string|null};
export type RetabloPanel={puede_cambiar:boolean;ve_todos:boolean;ve_empresa:boolean;catalogo:boolean;retablos:Retablo[]};
export type RetabloHistorial={fecha:string;estado_anterior:string|null;estado_nuevo:string;nota:string;usuario:string|null};

export const RETABLO_ESTADOS:Record<RetabloEstado,{label:string;bg:string;fg:string}>={
 PENDIENTE:{label:'Pendiente',bg:'#fef9c3',fg:'#854d0e'},
 PENDIENTE_RECOGER:{label:'Pendiente por recoger',bg:'#dbeafe',fg:'#1e40af'},
 ENTREGADO:{label:'Entregado',bg:'#dcfce7',fg:'#166534'},
 ANULADO:{label:'Anulado',bg:'#f1f5f9',fg:'#64748b'},
};
/** Allowed moves: Pendiente → Pendiente por recoger → Entregado; from «por recoger» it can go back to Pendiente. Entregado is final. */
export const RETABLO_TRANSICIONES:Record<RetabloEstado,RetabloEstado[]>={PENDIENTE:['PENDIENTE_RECOGER'],PENDIENTE_RECOGER:['ENTREGADO','PENDIENTE'],ENTREGADO:[],ANULADO:[]};
export const canMove=(from:RetabloEstado,to:RetabloEstado)=>RETABLO_TRANSICIONES[from].includes(to);
export const tipoLabel=(t:Pick<RetabloTipo,'nombre'|'valor_cliente'>,money:(n:number)=>string)=>`${t.nombre} — ${money(Number(t.valor_cliente))}`;

export type RetabloFiltro={q:string;estado:RetabloEstado|'';tipo:string;desde:string;hasta:string;asesora:string};
const norm=(s:string)=>s.toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g,'');
const digits=(s:string)=>s.replace(/\D/g,'');
/** Filters the panel: name (partial), ID or invoice (exact, ignoring dots), status, type, date range (Bogotá) and advisor. */
export function filterRetablos(rows:Retablo[],f:RetabloFiltro){
 const q=f.q.trim(),qn=norm(q),qd=digits(q);
 return rows.filter(r=>{
  if(f.estado&&r.estado!==f.estado)return false;
  if(f.tipo&&r.tipo_id!==f.tipo)return false;
  if(f.asesora&&(r.asesora||'')!==f.asesora)return false;
  const day=new Date(new Date(r.creado_en).getTime()-5*3600000).toISOString().slice(0,10);
  if(f.desde&&day<f.desde)return false;
  if(f.hasta&&day>f.hasta)return false;
  if(!q)return true;
  return norm(r.cliente_nombre).includes(qn)||(qd.length>=3&&digits(r.cliente_cedula)===qd)||norm(r.numero_factura||'')===qn||norm(r.numero_contrato||'')===qn;
 });
}
export function countByEstado(rows:Retablo[]){
 const c:Record<RetabloEstado,number>={PENDIENTE:0,PENDIENTE_RECOGER:0,ENTREGADO:0,ANULADO:0};
 for(const r of rows)c[r.estado]++;
 return c;
}
