export type AgendaMode='presencial'|'virtual';
export type AgendaSlot={fecha:string;hora:string;habilitado:boolean;cupo:number;reservadas:number;libres:number;origen:'base'|'excepcion'|'bloqueo'|'festivo'|'modalidad'|'fuera';motivo:string;en_base:boolean;pasado:boolean;excepcion_id:string|null};
export type AgendaModeRow={modalidad:AgendaMode;estado:'ACTIVA'|'BLOQUEADA';bloqueada:boolean;motivo_bloqueo:string;reapertura_programada:string|null;cupo_defecto:number;actualizado_por_nombre:string|null;actualizado_en:string};
export type AgendaBase={modalidad:AgendaMode;dia_semana:number;hora_inicio:string;hora_fin:string;cupo_defecto:number;activo:boolean};
export type AgendaException={id:string;modalidad:AgendaMode;sede_id:string|null;sede:string|null;fecha_inicio:string;fecha_fin:string|null;dias_semana:number[]|null;hora_inicio:string|null;hora_fin:string|null;accion:'HABILITAR'|'BLOQUEAR';cupo:number|null;motivo:string;creado_por_nombre:string|null;creado_en:string};
export type AgendaConfig={puede_configurar:boolean;puede_excepciones:boolean;modalidades:AgendaModeRow[];horario:AgendaBase[];excepciones:AgendaException[];sedes:{id:string;nombre:string}[]};
export type AgendaPreview={slots_bloqueados:number;slots_habilitados:number;cupo_cambia:number;sobrecupo:number;citas:{id:string;fecha:string;hora:string;cliente:string;telefono:string;sede:string|null;estado:string}[]};
export type AgendaAudit={id:string;usuario:string|null;tabla:string;registro_id:string|null;accion:string;valor_anterior:Record<string,unknown>|null;valor_nuevo:Record<string,unknown>|null;motivo:string;fecha:string};

export const WEEKDAYS=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
export const WEEKDAYS_SHORT=['L','M','X','J','V','S','D'];
export const HOURS=Array.from({length:17},(_,i)=>`${String(i+6).padStart(2,'0')}:00`);
export const CUPOS=[1,2,3] as const;
export const hhmm=(t:string|null|undefined)=>(t||'').slice(0,5);

export type DayState='bloqueado'|'lleno'|'parcial'|'libre'|'excepcion'|'cerrado'|'pasado';
export const DAY_COLORS:Record<DayState,{bg:string;fg:string;label:string}>={
 libre:{bg:'#dcfce7',fg:'#166534',label:'Habilitado con cupos'},
 parcial:{bg:'#fef9c3',fg:'#854d0e',label:'Cupos parcialmente ocupados'},
 lleno:{bg:'#fee2e2',fg:'#991b1b',label:'Lleno'},
 bloqueado:{bg:'#e5e7eb',fg:'#374151',label:'Bloqueado'},
 excepcion:{bg:'#dbeafe',fg:'#1e40af',label:'Habilitado por excepción'},
 cerrado:{bg:'#f8fafc',fg:'#94a3b8',label:'Sin atención'},
 pasado:{bg:'#f8fafc',fg:'#cbd5e1',label:'Pasado'},
};
/** Color of one hour: grey blocked, red full, yellow partly booked, blue enabled outside the base schedule, green free. */
export function slotState(s:AgendaSlot):DayState{
 if(s.pasado)return 'pasado';
 if(!s.habilitado)return s.en_base||s.origen==='bloqueo'||s.origen==='modalidad'?'bloqueado':'cerrado';
 if(s.libres<=0)return 'lleno';
 if(!s.en_base)return 'excepcion';
 return s.reservadas>0?'parcial':'libre';
}
/** Color of a day from its hours. */
export function dayState(slots:AgendaSlot[]):DayState{
 const live=slots.filter(s=>!s.pasado);
 if(!slots.length)return 'cerrado';
 if(!live.length)return 'pasado';
 const open=live.filter(s=>s.habilitado);
 if(!open.length)return live.some(s=>s.en_base||s.origen==='bloqueo'||s.origen==='modalidad')?'bloqueado':'cerrado';
 const free=open.reduce((t,s)=>t+s.libres,0),booked=open.reduce((t,s)=>t+s.reservadas,0);
 if(free<=0)return 'lleno';
 if(open.some(s=>!s.en_base))return 'excepcion';
 return booked>0?'parcial':'libre';
}
export function groupByDay(slots:AgendaSlot[]){
 const map=new Map<string,AgendaSlot[]>();
 for(const s of slots){const list=map.get(s.fecha)||[];list.push(s);map.set(s.fecha,list);}
 return map;
}
/** Days of a month grid starting on Monday (null = padding). */
export function monthDays(year:number,month:number){
 const first=new Date(Date.UTC(year,month,1)),days=new Date(Date.UTC(year,month+1,0)).getUTCDate(),offset=(first.getUTCDay()+6)%7;
 return [...Array.from({length:offset},()=>null),...Array.from({length:days},(_,i)=>`${year}-${String(month+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`)];
}
const fmt=(d:string)=>d?`${d.slice(8,10)}/${d.slice(5,7)}/${d.slice(0,4)}`:'';
/** Human description of a rule: when, which hours, what it does. */
export function exceptionLabel(x:Pick<AgendaException,'fecha_inicio'|'fecha_fin'|'dias_semana'|'hora_inicio'|'hora_fin'|'accion'|'cupo'>){
 const days=x.dias_semana?.length?`Cada ${x.dias_semana.map(d=>WEEKDAYS[d-1].toLowerCase()).join(', ')} desde el ${fmt(x.fecha_inicio)}${x.fecha_fin?` hasta el ${fmt(x.fecha_fin)}`:''}`
  :x.fecha_fin&&x.fecha_fin!==x.fecha_inicio?`Del ${fmt(x.fecha_inicio)} al ${fmt(x.fecha_fin)}`:`El ${fmt(x.fecha_inicio)}`;
 const hours=x.hora_inicio?` · ${hhmm(x.hora_inicio)}–${hhmm(x.hora_fin)}`:' · todo el día';
 const what=x.accion==='BLOQUEAR'?'Bloqueado':x.cupo?`Habilitado con cupo ${x.cupo}`:'Habilitado';
 return `${what} · ${days}${hours}`;
}
/** Validates the rule form before sending it (the database checks again). */
export function validateRule(r:{accion:string;fecha_inicio:string;fecha_fin?:string;hora_inicio?:string;hora_fin?:string;cupo?:number|null;motivo:string;alcance:'dia'|'rango'|'recurrente';dias_semana?:number[]},today:string){
 if(!r.fecha_inicio)return 'Elige la fecha.';
 if(r.fecha_inicio<today)return 'No se pueden modificar fechas pasadas.';
 if(r.alcance==='rango'&&(!r.fecha_fin||r.fecha_fin<r.fecha_inicio))return 'La fecha final debe ser igual o posterior a la inicial.';
 if(r.alcance==='recurrente'&&!r.dias_semana?.length)return 'Elige los días de la semana que se repiten.';
 if(r.alcance==='recurrente'&&r.fecha_fin&&r.fecha_fin<r.fecha_inicio)return 'La fecha final debe ser igual o posterior a la inicial.';
 if((r.hora_inicio&&!r.hora_fin)||(!r.hora_inicio&&r.hora_fin)||(r.hora_inicio&&r.hora_fin&&r.hora_fin<=r.hora_inicio))return 'La hora final debe ser posterior a la inicial.';
 if(r.cupo!=null&&![1,2,3].includes(r.cupo))return 'El cupo solo puede ser 1, 2 o 3.';
 if(r.accion==='BLOQUEAR'&&r.motivo.trim().length<3)return 'El motivo es obligatorio para bloquear.';
 return null;
}
const cell=(v:unknown)=>{const t=v==null?'':typeof v==='object'?JSON.stringify(v):String(v);return /[";\n]/.test(t)?`"${t.replace(/"/g,'""')}"`:t;};
/** History as CSV (semicolon, opens in Excel). */
export function auditCsv(rows:AgendaAudit[]){
 const head=['Fecha','Usuario','Tabla','Registro','Acción','Valor anterior','Valor nuevo','Motivo'];
 return '﻿'+[head,...rows.map(r=>[new Date(r.fecha).toLocaleString('es-CO',{timeZone:'America/Bogota'}),r.usuario,r.tabla,r.registro_id,r.accion,r.valor_anterior,r.valor_nuevo,r.motivo])].map(r=>r.map(cell).join(';')).join('\n');
}
/** Public label for a closed day (internal reasons are not shown to clients). */
export const publicClosedLabel=(motivo:string|null|undefined)=>motivo==='Lunes festivo'?'Festivo':motivo==='Sin cupos'?'Lleno':'Cerrado';
