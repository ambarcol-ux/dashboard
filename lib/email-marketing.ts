import {allySlug} from '@/lib/ally-validation';

/** Ventas y CRM › Correo: placeholders an automation or campaign text may use. */
export const MAIL_PLACEHOLDERS=['{nombre}','{sede}','{enlace_cita}','{catalogo}','{promocion}','{beneficio}','{condiciones}','{vigencia}','{fecha_evento}','{resena}'] as const;
/** One-time request for commercial authorization (no advertising): its own footer and the {enlace_autorizacion} link. */
export const AUTH_REQUEST_ID='solicitud_autorizacion';
export const MAIL_TRIGGER:Record<string,string>={visita:'horas después de la visita',no_asistio:'horas después de la cita no asistida',evento:'horas antes de la fecha del evento',contrato:'horas después de firmar el contrato',devolucion:'horas después de finalizar el contrato',solicitud:'Envío único desde Correo › Envíos'};
export const FUNNEL_STAGES:Record<string,string>={contacto:'Contacto autorizado',cita_agendada:'Cita agendada',no_asistio:'No asistió',asistio:'Asistió',seguimiento:'En seguimiento',contrato_creado:'Contrato creado',contrato_firmado:'Contrato firmado'};

/** Visit dress type (Quince, Gala, Novia…) → catalog type name. */
export const catalogType=(tipo:string|null|undefined)=>{const t=String(tipo||'').trim().toLowerCase();return ['quince','xv años','xv'].includes(t)?'XV Años':t?t.charAt(0).toUpperCase()+t.slice(1):'';};
export const catalogLink=(origin:string,sede:string|null|undefined,tipo:string|null|undefined,o:string)=>sede&&catalogType(tipo)?`${origin}/${allySlug(sede)}/${allySlug(catalogType(tipo))}?o=${o}`:'';

const esc=(v:string)=>v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fill=(text:string,values:Record<string,string>)=>text.replace(/\{(\w+)\}/g,(m,k:string)=>k in values?values[k]:m).replace(/\n{3,}/g,'\n\n').trim();

/** Subject, plain text and simple HTML of one email, with the unsubscribe link always at the end. */
export function renderMail(asunto:string,cuerpo:string,values:Record<string,string>,baja:string,solicitud=false){
 const subject=fill(asunto,values).replace(/\s+/g,' ').slice(0,160);
 const body=fill(cuerpo,values);
 const footer=solicitud?'Recibes este único correo porque agendaste una cita con Ámbar Couture. Si no autorizas, no te enviaremos publicidad.'
  :`Recibes este correo porque autorizaste comunicaciones de Ámbar Couture. Para dejar de recibirlos o cambiar tu autorización: ${baja}`;
 const html=`<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#111;max-width:560px;margin:0 auto;padding:16px">
<p style="font-size:11px;font-weight:bold;letter-spacing:.2em;color:#b45309;margin:0 0 16px">ÁMBAR COUTURE</p>
${body.split(/\n{2,}/).map(p=>`<p style="margin:0 0 14px">${esc(p).replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" style="color:#b45309;word-break:break-all">$1</a>').replace(/\n/g,'<br>')}</p>`).join('\n')}
<p style="font-size:11px;color:#777;border-top:1px solid #eee;padding-top:12px;margin-top:24px">${solicitud?esc(footer):`Recibes este correo porque autorizaste comunicaciones de Ámbar Couture. <a href="${esc(baja)}" style="color:#777">Dejar de recibirlos o cambiar tu autorización</a>.`}</p></div>`;
 return {asunto:subject,texto:`${body}\n\n—\n${footer}`,html};
}
