import {visitManagementLink,whatsappPhone} from './first-visit-links';

export type CrmEventRow={id:string;cita_id:string;evento:'BOOKING_CREATED'|'BOOKING_RESCHEDULED'|'BOOKING_CANCELLED';revision:number;datos:{
 fecha:string;hora:string;modalidad:string;sede_id:string;sede:string|null;nombre:string;email:string;telefono:string;documento?:string|null;
 tipo_vestido?:string;fecha_evento?:string|null;motivo?:string;enlace_virtual?:string;
}};

/** ERP links the CRM must use instead of Cal.com: booking page per site, private management/reschedule link per visit. */
export function erpVisitLinks(origin:string,visitId:string,date:string,siteId:string,secret:string){
 const manage=visitManagementLink(origin,visitId,Date.parse(date+'T23:59:59-05:00')+30*86400000,secret);
 return {
  enlaceGestion:manage,
  enlaceReprogramacion:manage.replace('/agendar-primera-cita/gestionar#','/agendar-primera-cita/gestionar?accion=reprogramar#'),
  enlaceAgenda:`${origin}/agendar-primera-cita?sede=${encodeURIComponent(siteId)}`,
  enlaceReprogramarPorCedula:`${origin}/reprogramar-primera-cita`,
 };
}

/**
 * Converts a queued ERP change into the Cal.com webhook shape the CRM Apps Script already processes
 * (procesarWebhookCal_). The CRM row keeps the ERP visit id as its primary ID: a reschedule sends
 * rescheduleUid = that id and a new uid per revision; a cancellation targets the primary id.
 */
export function crmBookingEvent(row:CrmEventRow,origin:string,secret:string){
 const d=row.datos,mode=d.modalidad==='virtual'?'VIRTUAL':'PRESENCIAL';
 const start=`${d.fecha}T${d.hora.slice(0,5)}:00-05:00`,end=`${d.fecha}T${String(Number(d.hora.slice(0,2))+1).padStart(2,'0')}:00:00-05:00`;// visits start on the hour, 09:00–18:00
 const links=erpVisitLinks(origin,row.cita_id,d.fecha,d.sede_id,secret);
 const payload:Record<string,unknown>={
  uid:row.evento==='BOOKING_RESCHEDULED'?`${row.cita_id}-r${row.revision}`:row.cita_id,
  startTime:start,endTime:end,
  title:`Primera cita Ámbar Couture ${d.sede||''} · ${mode}`.trim(),
  sede:d.sede,sedeId:d.sede_id,
  attendees:[{name:d.nombre,email:d.email||'',phoneNumber:whatsappPhone(d.telefono),timeZone:'America/Bogota'}],
  responses:{'Tipo-de-vestido':d.tipo_vestido||'','Fecha-evento-cliente':d.fecha_evento||'',modalidad:mode,sede:d.sede,documento:d.documento||''},
  // Fields the CRM must read instead of building Cal.com URLs.
  erp:{origen:'ERP',citaId:row.cita_id,revision:row.revision,duracionMin:60,enlaceVirtual:d.enlace_virtual||'',...links},
 };
 if(row.evento==='BOOKING_RESCHEDULED')payload.rescheduleUid=row.cita_id;
 if(row.evento==='BOOKING_CANCELLED')payload.cancellationReason=d.motivo||'';
 return {triggerEvent:row.evento,createdAt:new Date().toISOString(),payload};
}
