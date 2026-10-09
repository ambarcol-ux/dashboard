import {visitOutcome,type FirstVisit} from './first-visits';
export type HistoricCRM={id:string;hoja:string;fila:number;id_externo:string;sede_id:string|null;fecha:string|null;nombre:string;asesora:string;asistencia:boolean|null;alquilo:boolean|null;recuperada:boolean;motivo:string;incidencia:string};
export type AnalysisVisit=FirstVisit&{crm_origen_id?:string|null;crm_mensajes_activos?:boolean};
export type CommercialRow={id:string;origen:string;sede_id:string|null;sede:string;fecha:string|null;nombre:string;asesora:string;asistio:boolean;alquilo:boolean;recuperada:boolean;contratoConfirmado:boolean;motivo:string;incidencia:string;fila?:number;calendarId?:string};
const attendedStates=new Set(['asistio','seguimiento','no_cerro']);
export function commercialRows(history:HistoricCRM[],visits:AnalysisVisit[],sites:Record<string,string>):CommercialRow[]{
 const bySource=new Map(visits.filter(v=>v.crm_origen_id).map(v=>[v.crm_origen_id!,v]));
 const rows:CommercialRow[]=history.filter(h=>h.hoja==='CITAS'||h.hoja==='VITRINA').map(h=>{
  const v=bySource.get(h.id),contract=v?visitOutcome(v)==='cerrado':false;
  return {id:h.id,origen:h.hoja==='CITAS'?'Cita importada':'Vitrina',sede_id:v?.sede_id||h.sede_id,sede:v?.sede||sites[h.sede_id||'']||'Sin sede',fecha:v?.fecha||h.fecha,nombre:v?.cliente_nombre||h.nombre,asesora:v?.responsable||h.asesora||'Sin responsable',asistio:v?(v.respuesta_asistencia===true||attendedStates.has(v.estado)||contract):h.asistencia===true,alquilo:v?(v.respuesta_alquiler===true||v.resultado_comercial==='ALQUILÓ'||contract):h.alquilo===true,recuperada:h.recuperada,contratoConfirmado:contract,motivo:v?.motivo_no_alquiler||h.motivo,incidencia:h.incidencia,fila:h.fila,calendarId:v?.id};
 });
 for(const v of visits){if(v.crm_origen_id)continue;const contract=visitOutcome(v)==='cerrado';rows.push({id:v.id,origen:'Cita ERP',sede_id:v.sede_id,sede:v.sede,fecha:v.fecha,nombre:v.cliente_nombre,asesora:v.responsable||'Sin responsable',asistio:v.respuesta_asistencia===true||attendedStates.has(v.estado)||contract,alquilo:v.respuesta_alquiler===true||v.resultado_comercial==='ALQUILÓ'||contract,recuperada:false,contratoConfirmado:contract,motivo:v.motivo_no_alquiler||'',incidencia:'',fila:undefined,calendarId:v.id});}
 return rows;
}
export function commercialMetrics(rows:CommercialRow[]){
 const valid=rows.filter(r=>!r.incidencia&&r.fecha),attended=valid.filter(r=>r.asistio),rented=attended.filter(r=>r.alquilo);
 return {registros:valid.length,atendidas:attended.length,alquileres:rented.length,recuperados:rented.filter(r=>r.recuperada).length,contratos:valid.filter(r=>r.contratoConfirmado).length,conversion:attended.length?Math.round(1000*rented.length/attended.length)/10:0};
}
