import { prexvFields, prexvServices } from './prexv';
import { bogotaDay, milestoneTypes } from './contract-calendar';
export const editableDateFields = milestoneTypes.map(t=>t.field).filter(f=>!['fecha_entrega_prexv','fecha_entrega_evento'].includes(f));
export const timestampFields = ['fecha_maquillaje','fecha_fotografia'];
export const contactFields=['cliente_nombre','quinceanera_name','cliente_email','cliente_whatsapp','cliente_direccion','observaciones_vestido'] as const;
export const specialBlockFields=['fechas_bloqueo_especial'] as const;
export function dateInput(value:string|null|undefined){
 if(!value)return '';
 const day=bogotaDay(value);if(!day)return '';
 if(!value.includes('T')&&!value.includes(' '))return day;
 const time=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Bogota',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
 return `${day}T${time}`;
}
export function validateCalendarPatch(input:unknown):Record<string,string|string[]|boolean|null>{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Datos de edición inválidos.');
 const out:Record<string,string|string[]|boolean|null>={};
 for(const [key,value] of Object.entries(input)){
  if(![...editableDateFields,...contactFields,...specialBlockFields,...prexvFields].includes(key as never))throw new Error('Ese campo no se puede editar desde el calendario.');
  if(key==='prexv_componentes') {
   if(!Array.isArray(value)||value.some(v=>!prexvServices.some(s=>s.id===v))||new Set(value).size!==value.length)throw new Error('Componentes PRE-XV inválidos.');
   out[key]=value;continue;
  }
  if(key==='fechas_bloqueo_especial') {
   if(!Array.isArray(value))throw new Error('Las fechas especiales deben ser una lista.');
   const dates=value.filter((v):v is string=>typeof v==='string'&&v.length>0);
   if(dates.length!==value.length||new Set(dates).size!==dates.length)throw new Error('Revisa las fechas especiales: no pueden estar vacías ni repetidas.');
   if(dates.some(v=>!/^\d{4}-\d{2}-\d{2}$/.test(v)||!bogotaDay(v)))throw new Error('Hay una fecha especial inválida.');
   out[key]=[...dates].sort();
   continue;
  }
  if(prexvServices.some(s=>s.confirmed===key)) {if(typeof value!=='boolean')throw new Error('Confirmación inválida.');out[key]=value;continue;}
  if(value!==null&&typeof value!=='string')throw new Error('Valor de campo inválido.');
  if(editableDateFields.includes(key as never)){
   if(value===null||value===''){if(key==='fecha_evento')throw new Error('La fecha del evento es obligatoria.');out[key]=null;continue;}
   if(timestampFields.includes(key)){
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)||!bogotaDay(value.slice(0,10))||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.slice(11)))throw new Error('Fecha y hora inválidas.');
    out[key]=new Date(value+':00-05:00').toISOString();
   }else{if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!bogotaDay(value))throw new Error('Fecha inválida.');out[key]=value;}
  }else{
   const text=(value||'').trim();if(text.length>4000)throw new Error('El texto es demasiado largo.');
   if(key==='cliente_nombre'&&!text)throw new Error('El nombre del cliente es obligatorio.');
   if(key==='cliente_email'&&text&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))throw new Error('Revisa el correo del cliente.');
   out[key]=text;
  }
 }
 if(!Object.keys(out).length)throw new Error('No hay cambios para guardar.');
 return out;
}

