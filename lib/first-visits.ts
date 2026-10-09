export const firstVisitDressTypes=['Gala','Quince','Novia'] as const;
export const visitStates:Record<string,string>={agendada:'Agendada',confirmada:'Confirmada',asistio:'Asistió',seguimiento:'En seguimiento',no_asistio:'No asistió',no_cerro:'No cerró',cancelada:'Cancelada'};
export type FirstVisit={crm_origen_id?:string|null;crm_mensajes_activos?:boolean;cliente_documento?:string|null;nueva_cita_id?:string|null;fecha_evento?:string|null;tipo_vestido?:string;enlace_virtual?:string;respuesta_asistencia?:boolean|null;respuesta_alquiler?:boolean|null;motivo_no_alquiler?:string;resultado_comercial?:string;id:string;updated_at:string;fecha:string;hora:string;modalidad:'presencial'|'virtual';sede_id:string;sede:string;cliente_nombre:string;telefono:string;email:string;estado:string;motivo:string;responsable:string|null;contrato_id:string|null;numero_contrato:string|null;contrato_estado:string|null};
export function visitOutcome(v:FirstVisit){
 const state=(v.contrato_estado||'').toLowerCase();
 if(v.contrato_id&&['firmado','pagado totalmente','entregado','mantenimiento','finalizado'].includes(state))return 'cerrado';
 if(v.contrato_id&&!['cancelado','anulado','rechazado'].includes(state))return 'contrato_pendiente';
 if(v.estado==='no_cerro')return 'no_cerro';
 return v.estado;
}
export function visitMetrics(rows:FirstVisit[]){
 const count=(s:string)=>rows.filter(v=>visitOutcome(v)===s).length;
 const closed=count('cerrado'),attended=rows.filter(v=>['asistio','seguimiento','no_cerro','cerrado','contrato_pendiente'].includes(visitOutcome(v))).length;
 return {total:rows.length,closed,attended,drafts:count('contrato_pendiente'),lost:count('no_cerro'),noShow:count('no_asistio'),pending:count('asistio')+count('seguimiento'),conversion:attended?Math.round(closed/attended*100):0};
}
export const outcomeLabel=(v:FirstVisit)=>({cerrado:'Cerró · contrato activo',contrato_pendiente:'Contrato creado · pendiente de cierre'}[visitOutcome(v)]||visitStates[v.estado]||v.estado);
export function validateVisitInput(b:Record<string,unknown>){
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const name=String(b.nombre||'').trim(),phone=String(b.telefono||'').replace(/[\s()+-]/g,''),email=String(b.email||'').trim().toLowerCase();
 if(!uuid.test(String(b.id))||!uuid.test(String(b.sede))||!['presencial','virtual'].includes(String(b.modalidad))||!/^\d{4}-\d{2}-\d{2}$/.test(String(b.fecha))||!/^(09|1[0-8]):00$/.test(String(b.hora))||name.length<2||name.length>120||!/^\d{10,15}$/.test(phone)||email.length>160||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))||b.consentimiento!==true||b.website)throw new Error('Revisa tu nombre, teléfono, sede y horario, y acepta el uso de tus datos para la cita.');
 const documento=String(b.documento||'').replace(/[.\s-]/g,'');
 if(!/^\d{5,15}$/.test(documento))throw Error('Ingresa la cédula de la persona que reserva, solo números.');
 const fechaEvento=String(b.fechaEvento||''),tipoVestido=String(b.tipoVestido||'').trim();
 if((fechaEvento&&!/^\d{4}-\d{2}-\d{2}$/.test(fechaEvento))||!firstVisitDressTypes.includes(tipoVestido as typeof firstVisitDressTypes[number]))throw Error('Revisa la fecha del evento y tipo de vestido.');
 return {documento,fechaEvento,tipoVestido,id:String(b.id),fecha:String(b.fecha),hora:String(b.hora),modalidad:String(b.modalidad),sede:String(b.sede),nombre:name,telefono:phone,email};
}
