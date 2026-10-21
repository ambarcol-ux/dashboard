import {commercialResults} from './first-visit-followup';
export const firstVisitDressTypes=['Gala','Quince','Novia'] as const;
export const visitStates:Record<string,string>={agendada:'Agendada',confirmada:'Confirmada',asistio:'Asistió',seguimiento:'En seguimiento',no_asistio:'No asistió',no_cerro:'No cerró',cancelada:'Cancelada'};
export type FirstVisit={origen?:'cita'|'vitrina';como_se_entero?:string|null;asesora_id?:string|null;asesora_nombre?:string|null;resultado_visita?:string|null;crm_origen_id?:string|null;crm_mensajes_activos?:boolean;cliente_documento?:string|null;nueva_cita_id?:string|null;fecha_evento?:string|null;tipo_vestido?:string;enlace_virtual?:string;respuesta_asistencia?:boolean|null;respuesta_alquiler?:boolean|null;motivo_no_alquiler?:string;resultado_comercial?:string;id:string;updated_at:string;fecha:string;hora:string;modalidad:'presencial'|'virtual';sede_id:string;sede:string;cliente_nombre:string;telefono:string;email:string;estado:string;motivo:string;responsable:string|null;contrato_id:string|null;numero_contrato:string|null;contrato_estado:string|null};
const LOST_RESULTS=['DESISTIÓ','CERRADO SIN RESPUESTA','NO CONTACTAR','EVENTO FINALIZADO'];
const ATTENDED_STATES=['asistio','seguimiento','no_cerro'];
/** Outcome of a visit: an active contract wins; otherwise the commercial result chosen in the dropdowns (cita: resultado comercial; vitrina: resultado de la visita) completes the state. */
export function visitOutcome(v:FirstVisit){
 const state=(v.contrato_estado||'').toLowerCase();
 if(v.contrato_id&&['firmado','pagado totalmente','entregado','mantenimiento','finalizado'].includes(state))return 'cerrado';
 if(v.contrato_id&&!['cancelado','anulado','rechazado'].includes(state))return 'contrato_pendiente';
 if(v.estado==='cancelada')return 'cancelada';
 const result=v.resultado_comercial||'',walkIn=v.origen==='vitrina'?v.resultado_visita||'':'';
 if(result==='ALQUILÓ'||walkIn==='Cerrado')return 'alquilo';
 if(walkIn==='Contrato pendiente')return 'contrato_pendiente';
 if(v.estado==='no_asistio')return 'no_asistio';
 if(v.estado==='no_cerro'||walkIn==='No cerró'||(LOST_RESULTS.includes(result)&&ATTENDED_STATES.includes(v.estado)))return 'no_cerro';
 if(result==='AGENDÓ NUEVA CITA'&&ATTENDED_STATES.includes(v.estado))return 'nueva_cita';
 return v.estado;
}
export const visitOrigin=(v:FirstVisit)=>v.origen==='vitrina'?'vitrina':'cita';
const ATTENDED=['asistio','seguimiento','no_cerro','cerrado','contrato_pendiente','alquilo','nueva_cita'];
const CLOSED=['cerrado','alquilo'];
const conversionOf=(rows:FirstVisit[])=>{const attended=rows.filter(v=>ATTENDED.includes(visitOutcome(v))).length,closed=rows.filter(v=>CLOSED.includes(visitOutcome(v))).length;return attended?Math.round(closed/attended*100):0;};
export function visitMetrics(rows:FirstVisit[]){
 const count=(s:string)=>rows.filter(v=>visitOutcome(v)===s).length;
 const closed=count('cerrado')+count('alquilo'),attended=rows.filter(v=>ATTENDED.includes(visitOutcome(v))).length;
 const citas=rows.filter(v=>visitOrigin(v)==='cita'),vitrinas=rows.filter(v=>visitOrigin(v)==='vitrina');
 return {total:rows.length,reservas:citas.length,vitrinas:vitrinas.length,closed,closedNoContract:count('alquilo'),attended,drafts:count('contrato_pendiente'),lost:count('no_cerro'),noShow:count('no_asistio'),
  pending:count('asistio')+count('seguimiento')+count('nueva_cita'),newVisit:count('nueva_cita'),upcoming:count('agendada')+count('confirmada'),cancelled:count('cancelada'),
  conversion:attended?Math.round(closed/attended*100):0,conversionCitas:conversionOf(citas),conversionVitrinas:conversionOf(vitrinas)};
}

export type BreakdownItem={label:string;total:number;attended:number;closed:number;conversion:number};
export type Breakdown={id:string;title:string;items:BreakdownItem[]};
/** Per option of each dropdown filled in the visits: totals, attended, closed (contract or "Alquiló") and conversion. Only the dropdown's own options are listed. */
export function visitBreakdowns(rows:FirstVisit[]):Breakdown[]{
 const group=(id:string,title:string,options:readonly string[],pick:(v:FirstVisit)=>string|null|undefined,only:(v:FirstVisit)=>boolean=()=>true):Breakdown=>{
  const items=new Map(options.map(label=>[label,{label,total:0,attended:0,closed:0,conversion:0}]));
  for(const v of rows){
   if(!only(v))continue;
   const item=items.get((pick(v)||'').trim());if(!item)continue;
   const o=visitOutcome(v);item.total++;if(ATTENDED.includes(o))item.attended++;if(CLOSED.includes(o))item.closed++;
  }
  return {id,title,items:[...items.values()].map(i=>({...i,conversion:i.attended?Math.round(i.closed/i.attended*100):0}))};
 };
 const cita=(v:FirstVisit)=>visitOrigin(v)==='cita',vitrina=(v:FirstVisit)=>visitOrigin(v)==='vitrina';
 const sites=[...new Set(rows.map(v=>v.sede).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
 return [
  group('estado','Estado de la cita',Object.values(visitStates),v=>visitStates[v.estado]),
  group('resultado','Resultado comercial (citas)',commercialResults,v=>v.resultado_comercial,cita),
  group('vestido','Tipo de vestido (citas)',firstVisitDressTypes,v=>v.tipo_vestido,cita),
  group('evento','Tipo de evento (vitrinas)',walkInEventTypes,v=>v.tipo_vestido,vitrina),
  group('fuente','Cómo se enteró (vitrinas)',walkInSources,v=>v.como_se_entero,vitrina),
  group('modalidad','Modalidad',['Presencial','Virtual'],v=>v.modalidad==='virtual'?'Virtual':'Presencial'),
  group('sede','Sede',sites,v=>v.sede),
  group('motivo','Motivo de no alquiler',noRentalReasons,v=>v.motivo_no_alquiler),
 ];
}
export const outcomeLabel=(v:FirstVisit)=>({cerrado:'Cerró · contrato activo',contrato_pendiente:'Contrato creado · pendiente de cierre',alquilo:'Alquiló · sin contrato vinculado',nueva_cita:'Agendó nueva cita'}[visitOutcome(v)]
 ||(visitOrigin(v)==='vitrina'?`Atendida · ${v.resultado_visita||visitStates[v.estado]||v.estado}`:'')||visitStates[v.estado]||v.estado);

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
 return {documento,fechaEvento,tipoVestido,id:String(b.id),fecha:String(b.fecha),hora:String(b.hora),modalidad:String(b.modalidad),sede:String(b.sede),nombre:name,telefono:phone,email};
}
