/** Clientas del aliado (paso 4): categories, states and validation of the public form. */
export const CLIENT_CATEGORIES={XV:['Esencial','Clásica','Premium','Exclusiva'],GALA:['Clásica','Premium']} as const;
export const CLIENT_STATES=['Registrada','Cita agendada','Asistió','Contrató','No contrató'] as const;
export type AllyClient={id:string;numero:number;aliado_id:string;tipo_evento:'XV'|'GALA';categoria:string;clienta_menor:boolean;rep_nombre:string|null;rep_cedula:string|null;rep_parentesco:string|null;rep_celular:string|null;rep_correo:string|null;
 clienta_nombre:string;clienta_documento:string;clienta_celular:string|null;clienta_correo:string|null;fecha_evento:string;uso_imagen:boolean;publicidad:boolean;autoriza_datos_at:string;estado:(typeof CLIENT_STATES)[number];creado_en:string};
export const clientId=(n:number)=>`CLI-${String(n).padStart(5,'0')}`;

/** Validates the public form; throws a message for the visitor. today = YYYY-MM-DD (Bogotá). */
export function allyClientSignup(input:Record<string,unknown>,today:string){
 const t=(k:string,max=140)=>String(input[k]??'').trim().slice(0,max);
 const digits=(k:string)=>t(k,20).replace(/\D/g,'');
 const tipo=t('tipo_evento') as 'XV'|'GALA';
 if(tipo!=='XV'&&tipo!=='GALA')throw Error('Elige si es XV años o Gala.');
 const categoria=t('categoria');
 if(!(CLIENT_CATEGORIES[tipo] as readonly string[]).includes(categoria))throw Error('Elige la categoría.');
 const menor=tipo==='XV'||input.clienta_menor===true;
 const email=(v:string)=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
 const phone=(v:string)=>/^[0-9+ ()-]{7,20}$/.test(v);
 const d={tipo_evento:tipo,categoria,clienta_menor:menor,clienta_nombre:t('clienta_nombre'),clienta_documento:digits('clienta_documento'),fecha_evento:t('fecha_evento',10),
  rep_nombre:menor?t('rep_nombre'):null,rep_cedula:menor?digits('rep_cedula'):null,rep_parentesco:menor?t('rep_parentesco',60):null,rep_celular:menor?t('rep_celular',20):null,rep_correo:menor?t('rep_correo',120).toLowerCase():null,
  clienta_celular:menor?null:t('clienta_celular',20),clienta_correo:menor?null:t('clienta_correo',120).toLowerCase(),
  uso_imagen:input.uso_imagen==='si'?true:input.uso_imagen==='no'?false:null,publicidad:input.publicidad===true};
 if(menor&&(String(d.rep_nombre).length<3||!/^[0-9]{5,15}$/.test(String(d.rep_cedula))||!d.rep_parentesco||!phone(String(d.rep_celular))||!email(String(d.rep_correo))))throw Error('Completa los datos del representante: nombre, cédula, parentesco, celular y correo.');
 if(!menor&&(!phone(String(d.clienta_celular))||!email(String(d.clienta_correo))))throw Error('Escribe tu celular y correo.');
 if(d.clienta_nombre.length<3)throw Error(tipo==='XV'?'Escribe el nombre de la quinceañera.':'Escribe el nombre de la clienta.');
 if(!/^[0-9]{5,15}$/.test(d.clienta_documento))throw Error(menor?'Escribe el número de tarjeta de identidad.':'Escribe tu número de cédula.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha_evento)||d.fecha_evento<today)throw Error('La fecha del evento debe ser hoy o posterior.');
 if(input.autoriza_datos!==true)throw Error('Debes autorizar el tratamiento de datos.');
 if(d.uso_imagen===null)throw Error('Responde Sí o No al uso de imagen en redes.');
 return d as typeof d&{uso_imagen:boolean};
}
