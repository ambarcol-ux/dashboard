import {createHash} from 'node:crypto';

/** Meta dataset (pixel) that the CRM Apps Script used; keep it so ad optimisation keeps its history. */
export const DEFAULT_CAPI_DATASET='1420256452930635';

export type CapiJob={evento:{id:string;evento:'Schedule'|'AppointmentAttended'|'Purchase';event_id:string;event_time:string;valor?:number|string|null;action_source?:string|null};cita:{id:string;email:string;telefono:string;cliente_nombre:string};sede:string|null;ctwa_clid?:string|null};

const sha=(v:string)=>createHash('sha256').update(v,'utf8').digest('hex');
const plain=(v:string)=>v.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z]/g,'');

/** Colombian mobile in E.164 digits (57 + 3xxxxxxxxx); anything else is not sent. */
export function capiPhone(value:string){
 const d=String(value||'').replace(/\D/g,'');
 if(/^3\d{9}$/.test(d))return '57'+d;
 if(/^573\d{9}$/.test(d))return d;
 if(/^13\d{9}$/.test(d))return '57'+d.slice(1);// Cal.com saved some Colombian numbers with +1
 return '';
}

/** Server event for the Conversions API, user data hashed as Meta requires. */
export function capiEvent(job:CapiJob){
 const {evento:e,cita:c}=job,user:Record<string,string[]>={};
 const email=String(c.email||'').trim().toLowerCase(),phone=capiPhone(c.telefono);
 const [first='',...rest]=String(c.cliente_nombre||'').trim().split(/\s+/);
 if(email)user.em=[sha(email)];
 if(phone)user.ph=[sha(phone)];
 if(plain(first))user.fn=[sha(plain(first))];
 if(plain(rest.join('')))user.ln=[sha(plain(rest.join('')))];
 if(job.sede&&plain(job.sede))user.ct=[sha(plain(job.sede))];
 user.country=[sha('co')];
 user.external_id=[sha(c.id)];
 // Contracts go as store sales (accepted up to 62 days later) with the rental value in pesos.
 const valor=Number(e.valor||0);
 return {event_name:e.evento,event_time:Math.floor(Date.parse(e.event_time)/1000),event_id:e.event_id,action_source:e.action_source==='physical_store'?'physical_store':'system_generated',user_data:user,
  ...(valor>0?{custom_data:{value:valor,currency:'COP'}}:{})};
}

/** Names of the WhatsApp-ad (Business Messaging) events: a booked visit is a lead, an attended one a qualified lead, a rental a purchase. */
export const MESSAGING_EVENT:Record<CapiJob['evento']['evento'],string>={Schedule:'LeadSubmitted',AppointmentAttended:'QualifiedLead',Purchase:'Purchase'};

/** Same event for the WhatsApp ad that started the chat (Conversions API for Business Messaging): it carries the ad click
 *  («ctwa_clid») so Meta credits the appointment or rental to that ad. Only within 7 days of the event. */
export function capiMessagingEvent(job:CapiJob,wabaId:string,now=Date.now()){
 const e=job.evento,t=Date.parse(e.event_time);
 if(!job.ctwa_clid||!/^\d+$/.test(wabaId)||!(t>now-7*864e5))return null;
 const valor=Number(e.valor||0);
 return {event_name:MESSAGING_EVENT[e.evento],event_time:Math.floor(t/1000),event_id:`${e.event_id}_wa`,action_source:'business_messaging',messaging_channel:'whatsapp',
  user_data:{whatsapp_business_account_id:wabaId,ctwa_clid:job.ctwa_clid},...(valor>0?{custom_data:{value:valor,currency:'COP'}}:{})};
}
