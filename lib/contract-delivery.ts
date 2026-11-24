import type {SupabaseClient} from '@supabase/supabase-js';
import {sendEmail,type EmailConnection} from './email-providers';
import {loadWhatsappSettings} from './whatsapp-config';
import {sendWhatsappText,WINDOW_MS} from './whatsapp-inbox';

/** When the client signs, her copy goes to her e-mail (free); only without e-mail, to her WhatsApp when the 24-hour window is open
 *  (free; outside it a paid template would be needed, so it is not sent). The invoice is e-mailed by Siigo. Recorded in bitacora_contratos. */
const fecha=(v:unknown)=>v?new Date(`${String(v).slice(0,10)}T12:00:00Z`).toLocaleDateString('es-CO',{day:'numeric',month:'long',year:'numeric'}):null;
const cop=(v:number)=>`$${Math.round(v).toLocaleString('es-CO')}`;
const esc=(v:unknown)=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));

export async function sendSignedContract(db:SupabaseClient,id:string,origin:string){
 const {data:k}=await db.from('contratos').select('numero_contrato,cliente_nombre,cliente_email,cliente_whatsapp,whatsapp,fecha_evento,fecha_cita_medidas,fecha_prueba_final,fecha_entrega_envio,valor_total,total_arreglos,anticipo,sedes(nombre)').eq('id',id).maybeSingle();
 if(!k)return;
 const link=`${origin.replace(/\/$/,'')}/firma/${id}`,nombre=String(k.cliente_nombre||'').split(' ')[0]||'hola',sede=String((k.sedes as unknown as {nombre?:string}|null)?.nombre||'');
 const saldo=Math.max(0,Number(k.valor_total||0)+Number(k.total_arreglos||0)-Number(k.anticipo||0));
 const fechas=[['Cita de medidas',fecha(k.fecha_cita_medidas)],['Prueba final',fecha(k.fecha_prueba_final)],['Entrega del vestido',fecha(k.fecha_entrega_envio)],['Tu evento',fecha(k.fecha_evento)]].filter(([,v])=>v) as [string,string][];
 const texto=`Hola ${nombre} 💛 Tu contrato ${k.numero_contrato} con Ámbar Couture ${sede} quedó firmado.\n\n${fechas.map(([a,b])=>`• ${a}: ${b}`).join('\n')}\n• Saldo pendiente: ${cop(saldo)}\n\nPuedes ver y descargar tu contrato aquí: ${link}`;
 let via='',detalle='';
 const email=String(k.cliente_email||'').trim();
 if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
  const {data:conn}=await db.rpc('integracion_correo_servidor');
  if(conn?.secreto&&conn.activo){
   const html=`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1f2937"><p style="font-size:12px;letter-spacing:.2em;color:#b45309;font-weight:bold">ÁMBAR COUTURE${sede?` · ${esc(sede).toUpperCase()}`:''}</p>
    <h2 style="margin:4px 0 12px">Tu contrato ${esc(k.numero_contrato)} quedó firmado</h2><p>Hola ${esc(nombre)}, gracias por elegirnos. Estas son tus fechas:</p>
    <ul>${fechas.map(([a,b])=>`<li><b>${esc(a)}:</b> ${esc(b)}</li>`).join('')}<li><b>Saldo pendiente:</b> ${cop(saldo)}</li></ul>
    <p><a href="${link}" style="display:inline-block;background:#e11d48;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:bold">Ver y descargar mi contrato</a></p>
    <p style="font-size:12px;color:#6b7280">Tu factura electrónica te llega aparte, desde nuestro sistema contable.</p></div>`;
   const r=await sendEmail(conn as EmailConnection,{to:email,nombre:String(k.cliente_nombre||''),asunto:`Tu contrato ${k.numero_contrato} con Ámbar Couture`,html,texto});
   via=r.ok?'correo':'';detalle=r.ok?email:`correo falló: ${r.error}`;
  }else detalle='sin conexión de correo';
 }
 if(!via){
  const tel=String(k.cliente_whatsapp||k.whatsapp||'').replace(/\D/g,'').slice(-10);
  const {data:conv}=tel?await db.from('whatsapp_conversaciones').select('id,telefono,ultimo_entrante_at').like('telefono',`%${tel}`).eq('canal','whatsapp').order('ultimo_at',{ascending:false}).limit(1).maybeSingle():{data:null};
  if(conv&&conv.ultimo_entrante_at&&Date.now()-Date.parse(conv.ultimo_entrante_at)<WINDOW_MS){
   const settings=await loadWhatsappSettings(db);
   if(settings.token&&settings.phoneNumberId){
    const waId=await sendWhatsappText(settings,conv.telefono,texto),at=new Date().toISOString();
    await db.from('whatsapp_mensajes').insert({conversacion_id:conv.id,wa_id:waId,direccion:'saliente',origen:'erp',tipo:'automatico',texto,estado:'sent',created_at:at});
    await db.from('whatsapp_conversaciones').update({ultimo_mensaje:texto.slice(0,200),ultimo_at:at}).eq('id',conv.id);
    via='whatsapp';
   }
  }
 }
 await db.from('bitacora_contratos').insert({contrato_id:id,accion:'Contrato enviado a la clienta',detalle:via?`Copia del contrato firmado enviada por ${via}${via==='correo'?` (${detalle})`:''}.`:`No se envió la copia (${detalle||'sin correo y sin WhatsApp abierto en las últimas 24 h'}): compártela desde el contrato.`});
}

export type FirmaPendiente={id:string;numero:string;nombre:string|null;email:string;sede:string|null;fecha_evento:string|null;valor:number;abono:number;envios:number};
/** Unsigned draft: the signing link goes to her e-mail when the contract is saved, then as a reminder at 24 h, 3 and 7 days
 *  (public.contratos_firma_por_enviar picks them; worker app/api/contratos/recibos with {"solo":"firma"}). Each send is logged in bitacora_contratos. */
export async function sendSigningRequest(db:SupabaseClient,conn:EmailConnection,k:FirmaPendiente,origin:string){
 const link=`${origin.replace(/\/$/,'')}/firma/${k.id}`,nombre=String(k.nombre||'').trim().split(/\s+/)[0]||'hola',sede=String(k.sede||'');
 const recordatorio=k.envios>0,saldo=Math.max(0,Number(k.valor||0)-Number(k.abono||0)),evento=fecha(k.fecha_evento);
 const datos:[string,string][]=[...(evento?[['Tu evento',evento] as [string,string]]:[]),['Valor del contrato',cop(Number(k.valor||0))],['Abono',cop(Number(k.abono||0))],['Saldo',cop(saldo)]];
 const intro=recordatorio?`Tu contrato ${k.numero} con Ámbar Couture ${sede} sigue pendiente de firma. Fírmalo para dejar tu vestido y tus fechas confirmados.`:`Tu contrato ${k.numero} con Ámbar Couture ${sede} está listo. Revísalo y fírmalo desde tu celular.`;
 const texto=`Hola ${nombre} 💛 ${intro}\n\n${datos.map(([a,b])=>`• ${a}: ${b}`).join('\n')}\n\nRevisar y firmar: ${link}\n\nAl firmar aceptas las condiciones del contrato, incluida la política de cancelación.`;
 const html=`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1f2937"><p style="font-size:12px;letter-spacing:.2em;color:#b45309;font-weight:bold">ÁMBAR COUTURE${sede?` · ${esc(sede).toUpperCase()}`:''}</p>
  <h2 style="margin:4px 0 12px">${recordatorio?'Tu contrato está pendiente de firma':'Tu contrato está listo para firmar'}</h2><p>Hola ${esc(nombre)}, ${esc(intro.replace(/^Tu/,'tu'))}</p>
  <ul>${datos.map(([a,b])=>`<li><b>${esc(a)}:</b> ${esc(b)}</li>`).join('')}</ul>
  <p><a href="${link}" style="display:inline-block;background:#e11d48;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:bold">Revisar y firmar mi contrato</a></p>
  <p style="font-size:12px;color:#6b7280">Al firmar aceptas las condiciones del contrato, incluida la política de cancelación. Si algo no está bien, responde a tu asesora antes de firmar.</p></div>`;
 const r=await sendEmail(conn,{to:k.email,nombre:String(k.nombre||''),asunto:recordatorio?`Recordatorio: firma tu contrato ${k.numero}`:`Firma tu contrato ${k.numero} con Ámbar Couture`,html,texto});
 if(!r.ok)throw Error(`correo a ${k.email} falló: ${r.error}`);
 await db.from('bitacora_contratos').insert({contrato_id:k.id,accion:'Contrato enviado para firma',detalle:`${recordatorio?`Recordatorio ${k.envios} de firma`:'Enlace de firma'} enviado al correo ${k.email}.`});
}
