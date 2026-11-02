export const firstVisitDressTypes=['Gala','Quince','Novia'] as const;
export const visitStates:Record<string,string>={agendada:'Agendada',confirmada:'Confirmada',asistio:'Asistió',seguimiento:'En seguimiento',no_asistio:'No asistió',no_cerro:'No cerró',cancelada:'Cancelada'};
export type FirstVisit={codigo?:string|null;promocion_id?:string|null;origen_enlace?:string|null;registrada_al_contratar?:boolean;tipo_seguimiento?:string|null;cierre_seguimiento?:string|null;alquilo?:boolean|null;posible_seguimiento?:boolean|null;origen?:'cita'|'vitrina';como_se_entero?:string|null;asesora_id?:string|null;asesora_nombre?:string|null;resultado_visita?:string|null;crm_origen_id?:string|null;crm_mensajes_activos?:boolean;cliente_documento?:string|null;nueva_cita_id?:string|null;fecha_evento?:string|null;tipo_vestido?:string;enlace_virtual?:string;respuesta_asistencia?:boolean|null;respuesta_alquiler?:boolean|null;motivo_no_alquiler?:string;resultado_comercial?:string;id:string;updated_at:string;fecha:string;hora:string;modalidad:'presencial'|'virtual';sede_id:string;sede:string;cliente_nombre:string;telefono:string;email:string;estado:string;motivo:string;responsable:string|null;contrato_id:string|null;numero_contrato:string|null;contrato_estado:string|null};
const ACTIVE_CONTRACT=(v:FirstVisit)=>!!v.contrato_id&&!['cancelado','anulado','rechazado'].includes((v.contrato_estado||'').toLowerCase());
/** Contract state of the visit (used by the CRM analysis): signed contract, draft, or the visit state. */
export function visitOutcome(v:FirstVisit){
 const state=(v.contrato_estado||'').toLowerCase();
 if(v.contrato_id&&['firmado','pagado totalmente','entregado','mantenimiento','finalizado'].includes(state))return 'cerrado';
 if(ACTIVE_CONTRACT(v))return 'contrato_pendiente';
 return v.estado;
}
export const visitOrigin=(v:FirstVisit)=>v.origen==='vitrina'?'vitrina':'cita';

export type Attendance='asistio'|'no_asistio'|'sin_registrar'|'por_atender'|'cancelada';
/** Asistencia registrada por la asesora. Las vitrinas siempre asistieron; una cita pasada sin marcar queda «sin registrar». */
export function visitAttendance(v:FirstVisit,now=Date.now()):Attendance{
 if(v.estado==='cancelada')return 'cancelada';
 if(visitOrigin(v)==='vitrina'||['asistio','seguimiento','no_cerro'].includes(v.estado)||ACTIVE_CONTRACT(v)||v.alquilo===true)return 'asistio';
 if(v.estado==='no_asistio')return 'no_asistio';
 return Date.parse(`${v.fecha}T${v.hora.slice(0,5)}:00-05:00`)>now?'por_atender':'sin_registrar';
}
/** Alquiló (= cerró): un contrato vinculado o lo que marcó la asesora. null = asistió pero aún no se registró. */
export function visitRented(v:FirstVisit,now=Date.now()):boolean|null{
 const a=visitAttendance(v,now);
 if(a!=='asistio')return a==='no_asistio'?false:null;
 if(ACTIVE_CONTRACT(v)||v.alquilo===true)return true;
 return v.alquilo===false?false:null;
}
const pct=(a:number,b:number)=>b?Math.round(a/b*100):0;
/** Simple statistics: each visit counts once in attendance and once in rental. */
export function visitMetrics(rows:FirstVisit[],now=Date.now()){
 const m={total:0,citas:0,vitrinas:0,canceladas:0,porAtender:0,asistieron:0,noAsistieron:0,sinAsistencia:0,alquilaron:0,noAlquilaron:0,sinResultado:0,seguimiento:0,conversion:0,conversionCitas:0,conversionVitrinas:0};
 const by={cita:{a:0,r:0},vitrina:{a:0,r:0}};
 for(const v of rows){
  const a=visitAttendance(v,now),o=visitOrigin(v);
  m.total++;if(o==='vitrina')m.vitrinas++;else m.citas++;
  if(a==='cancelada'){m.canceladas++;continue;}
  if(a==='por_atender'){m.porAtender++;continue;}
  if(a==='sin_registrar'){m.sinAsistencia++;continue;}
  if(a==='no_asistio'){m.noAsistieron++;if(v.posible_seguimiento)m.seguimiento++;continue;}
  m.asistieron++;by[o].a++;
  const r=visitRented(v,now);
  if(r===true){m.alquilaron++;by[o].r++;}
  else if(r===false){m.noAlquilaron++;if(v.posible_seguimiento)m.seguimiento++;}
  else m.sinResultado++;
 }
 m.conversion=pct(m.alquilaron,m.asistieron);m.conversionCitas=pct(by.cita.r,by.cita.a);m.conversionVitrinas=pct(by.vitrina.r,by.vitrina.a);
 return m;
}
export const VISIT_STATUS:Record<string,string>={por_atender:'Por atender',sin_registrar:'Sin registrar asistencia',alquilo:'Asistió · Alquiló',no_alquilo:'Asistió · No alquiló',sin_resultado:'Asistió · falta registrar si alquiló',no_asistio:'No asistió',cancelada:'Cancelada'};
/** Key of VISIT_STATUS for filtering the list. */
export function visitStatus(v:FirstVisit,now=Date.now()){
 const a=visitAttendance(v,now);
 if(a!=='asistio')return a;
 const r=visitRented(v,now);
 return r===true?'alquilo':r===false?'no_alquilo':'sin_resultado';
}
export function outcomeLabel(v:FirstVisit,now=Date.now()){
 const a=visitAttendance(v,now),r=visitRented(v,now);
 if(a==='cancelada')return 'Cancelada';
 if(a==='por_atender')return v.estado==='confirmada'?'Confirmada · por atender':'Por atender';
 if(a==='sin_registrar')return 'Sin registrar asistencia';
 const seg=v.posible_seguimiento?' · Posible seguimiento':'';
 if(a==='no_asistio')return `No asistió${seg}`;
 if(r===true)return ACTIVE_CONTRACT(v)&&v.numero_contrato?`Asistió · Alquiló · contrato ${v.numero_contrato}`:'Asistió · Alquiló';
 if(r===false)return `Asistió · No alquiló${seg}`;
 return 'Asistió · falta registrar si alquiló';
}

// Vitrina: clienta que llega a la tienda sin cita.
export const noRentalReasons=['Precio','No encontré vestido','Visitaré otras tiendas','Debo consultarlo','Fecha del evento','Talla / diseño / ajuste','Otro'];
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
  if(typeof b.comercial!=='boolean')throw Error('Elige si autorizas o no recibir información comercial.');
 const origenEnlace=/^[A-Za-z0-9._-]{1,60}$/.test(String(b.origen||''))?String(b.origen):null;
 return {documento,fechaEvento,tipoVestido,origenEnlace,comercial:b.comercial===true,id:String(b.id),fecha:String(b.fecha),hora:String(b.hora),modalidad:String(b.modalidad),sede:String(b.sede),nombre:name,telefono:phone,email};
}
