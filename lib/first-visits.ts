export const firstVisitDressTypes=['Gala','Quince','Novia'] as const;
export const visitStates:Record<string,string>={agendada:'Agendada',confirmada:'Confirmada',asistio:'Asistió',seguimiento:'En seguimiento',no_asistio:'No asistió',no_cerro:'No cerró',cancelada:'Cancelada'};
export type FirstVisit={origen?:'cita'|'vitrina';como_se_entero?:string|null;asesora_id?:string|null;asesora_nombre?:string|null;resultado_visita?:string|null;crm_origen_id?:string|null;crm_mensajes_activos?:boolean;cliente_documento?:string|null;nueva_cita_id?:string|null;fecha_evento?:string|null;tipo_vestido?:string;enlace_virtual?:string;respuesta_asistencia?:boolean|null;respuesta_alquiler?:boolean|null;motivo_no_alquiler?:string;resultado_comercial?:string;id:string;updated_at:string;fecha:string;hora:string;modalidad:'presencial'|'virtual';sede_id:string;sede:string;cliente_nombre:string;telefono:string;email:string;estado:string;motivo:string;responsable:string|null;contrato_id:string|null;numero_contrato:string|null;contrato_estado:string|null};
export function visitOutcome(v:FirstVisit){
 const state=(v.contrato_estado||'').toLowerCase();
 if(v.contrato_id&&['firmado','pagado totalmente','entregado','mantenimiento','finalizado'].includes(state))return 'cerrado';
 if(v.contrato_id&&!['cancelado','anulado','rechazado'].includes(state))return 'contrato_pendiente';
 if(v.estado==='no_cerro')return 'no_cerro';
 return v.estado;
}
export const visitOrigin=(v:FirstVisit)=>v.origen==='vitrina'?'vitrina':'cita';
const ATTENDED=['asistio','seguimiento','no_cerro','cerrado','contrato_pendiente'];
const conversionOf=(rows:FirstVisit[])=>{const attended=rows.filter(v=>ATTENDED.includes(visitOutcome(v))).length,closed=rows.filter(v=>visitOutcome(v)==='cerrado').length;return attended?Math.round(closed/attended*100):0;};
export function visitMetrics(rows:FirstVisit[]){
 const count=(s:string)=>rows.filter(v=>visitOutcome(v)===s).length;
 const closed=count('cerrado'),attended=rows.filter(v=>ATTENDED.includes(visitOutcome(v))).length;
 const citas=rows.filter(v=>visitOrigin(v)==='cita'),vitrinas=rows.filter(v=>visitOrigin(v)==='vitrina');
 return {total:rows.length,reservas:citas.length,vitrinas:vitrinas.length,closed,attended,drafts:count('contrato_pendiente'),lost:count('no_cerro'),noShow:count('no_asistio'),pending:count('asistio')+count('seguimiento'),
  conversion:attended?Math.round(closed/attended*100):0,conversionCitas:conversionOf(citas),conversionVitrinas:conversionOf(vitrinas)};
}
export const outcomeLabel=(v:FirstVisit)=>({cerrado:'Cerró · contrato activo',contrato_pendiente:'Contrato creado · pendiente de cierre'}[visitOutcome(v)]
 ||(visitOrigin(v)==='vitrina'?`Atendida · ${v.resultado_visita||visitStates[v.estado]||v.estado}`:'')||visitStates[v.estado]||v.estado);

// Vitrina: clienta que llega a la tienda sin cita.
export const walkInEventTypes=['XV años','Grado','Gala','Otro'] as const;
export const walkInSources=['Instagram','Recomendación','Pasaba por la tienda','Otro'] as const;
export const walkInResults=['Cerrado','Contrato pendiente','En seguimiento','No cerró'] as const;
export const walkInStates=['asistio','seguimiento','no_cerro'];
/** datetime-local value (Bogotá) → ISO instant; Colombia has no DST. */
export const bogotaLocalToIso=(value:string)=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)?new Date(`${value}:00-05:00`).toISOString():null;
export const nowBogotaLocal=(now=new Date())=>new Date(now.getTime()-5*3600000).toISOString().slice(0,16);
export function validateVisitInput(b:Record<string,unknown>){
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const name=String(b.nombre||'').trim(),phone=String(b.telefono||'').replace(/[\s().+-]/g,''),email=String(b.email||'').trim().toLowerCase();
 if(!uuid.test(String(b.id)))throw Error('Recarga la página e intenta reservar nuevamente.');
 if(!uuid.test(String(b.sede)))throw Error('Selecciona la sede de tu cita.');
 if(!['presencial','virtual'].includes(String(b.modalidad)))throw Error('Selecciona la modalidad de tu cita.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(b.fecha)))throw Error('Selecciona una fecha válida para tu cita.');
 if(!/^(09|1[0-8]):00$/.test(String(b.hora)))throw Error('Selecciona una hora disponible para tu cita.');
 if(name.length<2||name.length>120)throw Error('Escribe tu nombre completo, entre 2 y 120 caracteres.');
 if(!/^\d{10,15}$/.test(phone))throw Error('Revisa el teléfono: escribe entre 10 y 15 números, incluyendo el indicativo si corresponde. Ejemplo: 3001234567.');
 if(email.length>160||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Escribe un correo electrónico válido. Te enviaremos ahí la confirmación y cualquier cambio de tu cita.');
 if(b.consentimiento!==true)throw Error('Marca la casilla de autorización de uso de datos para reservar.');
 if(b.website)throw Error('No se pudo validar el formulario. Recarga la página y completa los campos visibles manualmente.');
 const documento=String(b.documento||'').replace(/[.\s-]/g,'');
 if(!/^\d{5,15}$/.test(documento))throw Error('Ingresa la cédula de la persona que reserva, solo números.');
 const fechaEvento=String(b.fechaEvento||''),tipoVestido=String(b.tipoVestido||'').trim();
 if((fechaEvento&&!/^\d{4}-\d{2}-\d{2}$/.test(fechaEvento))||!firstVisitDressTypes.includes(tipoVestido as typeof firstVisitDressTypes[number]))throw Error('Revisa la fecha del evento y tipo de vestido.');
 return {documento,fechaEvento,tipoVestido,id:String(b.id),fecha:String(b.fecha),hora:String(b.hora),modalidad:String(b.modalidad),sede:String(b.sede),nombre:name,telefono:phone,email};
}
