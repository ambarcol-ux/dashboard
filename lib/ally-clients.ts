/** Clientas del aliado (paso 4): categories, states and validation of the public form. */
/** Event types of an ally's client; categories come from Configuración › Categorías (public.categorias_aliado). */
export type AllyEventType='XV'|'GALA'|'NOVIA';
export const ALLY_EVENT_LABEL:Record<AllyEventType,string>={XV:'XV años',GALA:'Gala',NOVIA:'Novia'};
export type AllyCategory={tipo:AllyEventType;nombre:string;desde:number;hasta:number|null};
const pesos=(n:number)=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n);
/** «Clásica · $1.500.001 a $2.500.000» */
export const categoryRange=(c:AllyCategory)=>c.hasta==null?(c.desde>0?`más de ${pesos(c.desde)}`:'todos los precios'):`${c.desde>0?`${pesos(c.desde+1)} a `:'hasta '}${pesos(c.hasta)}`;
export const CLIENT_STATES=['Registrada','Cita agendada','Asistió','Contrató','No contrató'] as const;
export type AllyClient={id:string;numero:number;aliado_id:string;tipo_evento:AllyEventType;categoria:string;clienta_menor:boolean;rep_nombre:string|null;rep_cedula:string|null;rep_parentesco:string|null;rep_celular:string|null;rep_correo:string|null;
 clienta_nombre:string;clienta_documento:string;clienta_celular:string|null;clienta_correo:string|null;fecha_evento:string;uso_imagen:boolean;publicidad:boolean;autoriza_datos_at:string;estado:(typeof CLIENT_STATES)[number];creado_en:string};
export const clientId=(n:number)=>`CLI-${String(n).padStart(5,'0')}`;

/** Validates the public form; throws a message for the visitor. today = YYYY-MM-DD (Bogotá). */
export function allyClientSignup(input:Record<string,unknown>,today:string,categorias:AllyCategory[]){
 const t=(k:string,max=140)=>String(input[k]??'').trim().slice(0,max);
 const digits=(k:string)=>t(k,20).replace(/\D/g,'');
 const tipo=t('tipo_evento') as AllyEventType;
 if(!(tipo in ALLY_EVENT_LABEL))throw Error('Elige el tipo de evento: XV años, Gala o Novia.');
 const categoria=t('categoria');
 if(!categorias.some(c=>c.tipo===tipo&&c.nombre===categoria))throw Error('Elige la categoría.');
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

// Contract in Aliado mode (paso 5): the ally is the contract's client; 5% discount on the dress line; 50% minimum payment.
export type ContractAlly={id:string;nombre:string;cedula:string;codigo:string|null;celular:string;correo:string;direccion:string;tipo:string};
export type ContractAllyModeValue={tiene:boolean;aliado:ContractAlly|null;clienta:AllyClient|null;categoria:string};
export const EMPTY_ALLY_MODE:ContractAllyModeValue={tiene:false,aliado:null,clienta:null,categoria:''};
export const ALLY_DISCOUNT=0.05;
/** Columns saved on the contract for the Aliado mode (Cliente directo clears them in the database). */
export const allyModePayload=(v:ContractAllyModeValue,descuento:number)=>({tiene_aliado:v.tiene,aliado_id:v.tiene?v.aliado?.id??null:null,aliado_clienta_id:v.tiene?v.clienta?.id??null:null,categoria_aliado:v.tiene?v.categoria||null:null,descuento_aliado:v.tiene?descuento:0});
export function allyModeError(v:ContractAllyModeValue,total:number,anticipo:number){
 if(!v.tiene)return null;
 if(!v.aliado)return 'En modo Aliado busca y carga el aliado.';
 if(!v.clienta)return 'Carga la clienta del aliado (ID, tarjeta de identidad o cédula del representante).';
 if(anticipo<Math.round(total*0.5))return `En modo Aliado el pago mínimo para crear el contrato es el 50% (${new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Math.round(total*0.5))}).`;
 return null;
}
