import {Resend} from 'resend';

// Ally (Red VIP) emails, built on the server only. Every value typed by a visitor is escaped.
const esc=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

export function allyWelcomeEmail(contacto:string,link:string){
 return {subject:'¡Bienvenido a la Red VIP de Aliados de Ámbar Couture! 👗✨',html:`
      <div style="background-color: #faf8f5; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #18181b;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 24px; border: 1px solid #fce7f3; box-shadow: 0 10px 40px rgba(0,0,0,0.03);">
          
          <div style="text-align: center; margin-bottom: 30px;">
            <p style="color: #d97706; font-size: 11px; font-weight: bold; letter-spacing: 0.2em; text-transform: uppercase; margin-bottom: 10px;">💎 Red de Aliados VIP</p>
            <h1 style="font-size: 24px; font-weight: normal; margin: 0; color: #18181b; font-family: Georgia, serif;">¡Bienvenido, ${esc(contacto)}!</h1>
          </div>

          <p style="font-size: 15px; line-height: 1.6; color: #52525b; text-align: center; margin-bottom: 30px;">
            Estimado ${esc(contacto)}, es un honor darte la bienvenida a nuestra exclusiva red de socios comerciales de <strong>Ámbar Couture</strong>. A partir de este momento, tu cuenta se encuentra activa en nuestro ERP Central.
          </p>

          <p style="font-size: 15px; line-height: 1.6; color: #52525b; text-align: center; margin-bottom: 30px;">
            Tu enlace exclusivo de recomendación para registrar quinceañeras y acumular comisiones es:
          </p>

          <div style="background: linear-gradient(135deg, #18181b 0%, #27272a 100%); padding: 30px; border-radius: 16px; text-align: center; margin-bottom: 35px; border: 1px solid #3f3f46; box-shadow: 0 10px 25px rgba(24, 24, 27, 0.2);">
            <p style="color: #fef3c7; font-size: 16px; font-weight: 500; letter-spacing: 0.05em; margin: 0; word-break: break-all;">
              <a href="${esc(link)}" style="color: #fef3c7; text-decoration: none;">${esc(link)}</a>
            </p>
          </div>

          <div style="border-top: 1px solid #e4e4e7; margin: 40px 0 20px 0; padding-top: 20px; text-align: justify; font-size: 11px; color: #71717a; line-height: 1.6;">
            <h3 style="font-weight: bold; font-size: 13px; color: #18181b; text-align: center; margin-bottom: 15px;">ACUERDO DE VINCULACIÓN AL PROGRAMA DE ALIADOS ÁMBAR COUTURE</h3>
            
            <p><strong>1. Objeto del Programa:</strong> El presente acuerdo regula la vinculación comercial e independiente entre Ámbar Couture y el Aliado, cuyo objetivo principal es la referenciación activa de clientas a nuestras instalaciones para el cierre de contratos.</p>
            <p><strong>2. ¿Quién es un Aliado Ámbar?:</strong> Se define como Aliado a toda persona natural o jurídica que se registre voluntariamente en nuestra plataforma y obtenga un enlace único de referenciación.</p>
            <p><strong>3. Beneficio para el Cliente Referido:</strong> Toda clienta que agende su cita utilizando el enlace del Aliado recibirá beneficios especiales según la campaña vigente.</p>
            <p><strong>4. Beneficio para el Aliado:</strong> El Aliado se hace acreedor a un incentivo económico (comisión) única y exclusivamente cuando la clienta referida consolide la separación formal del vestido y finalice el pago del 100%.</p>
            <p><strong>5. Valor de los Bonos e Incentivos:</strong> La comisión aplicable dependerá del valor final del contrato firmado por la clienta, estableciendo un límite máximo de compensación de <strong>$200.000 COP</strong> por contrato liquidado.</p>
            <p><strong>6. Condiciones para la Validación:</strong> La clienta debe agendar su cita inicial empleando exclusivamente el enlace personalizado (URL) asignado al Aliado y su registro debe quedar en Supabase antes del contrato. La clienta no debe estar previamente registrada.</p>
            <p><strong>7. Condiciones para el Pago del Incentivo:</strong> Culminación satisfactoria del evento, retorno de la prenda a tienda, inspección de calidad aprobada, cierre y liquidación total. La mera recomendación o abono inicial no causa el derecho al cobro.</p>
            <p><strong>8. Forma y Fecha de Pago:</strong> El desembolso se realizará exclusivamente durante los primeros diez (10) días calendario del mes siguiente al cierre.</p>
            <p><strong>9. Restricciones:</strong> No habrá pago en caso de cancelaciones, desistimientos, fraudes, suplantación de identidad o auto-referenciación.</p>
            <p><strong>10. Verificación de Referidos:</strong> Ámbar Couture se reserva el derecho de auditoría interna a través de su CRM. Los registros del ERP central tendrán carácter definitivo.</p>
            <p><strong>11. Modificaciones:</strong> Ámbar Couture podrá suspender, modificar o terminar el Programa de Aliados VIP en cualquier momento.</p>
            <p><strong>12. Aceptación:</strong> Al registrarte, has declarado conocer, entender y aceptar en su integridad estos términos.</p>
          </div>

          <p style="font-size: 12px; color: #a1a1aa; text-align: center; margin-top: 20px; line-height: 1.5;">
            Este correo fue generado automáticamente por Ámbar Couture ERP.
          </p>
        </div>
      </div>
    `};
}

export function vipPassEmail(nombreQuinceanera:string,codigoVip:string,nombreAliado:string){
 return {subject:'✨ Tu Pase VIP Dorado de Alta Costura - Regalo de '+nombreAliado,html:`
      <div style="background-color: #faf8f5; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #18181b;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 24px; border: 1px solid #fce7f3; box-shadow: 0 10px 40px rgba(0,0,0,0.03);">
          
          <div style="text-align: center; margin-bottom: 30px;">
            <p style="color: #d97706; font-size: 11px; font-weight: bold; letter-spacing: 0.2em; text-transform: uppercase; margin-bottom: 10px;">✨ Beneficio VIP Exclusivo</p>
            <h1 style="font-size: 24px; font-weight: normal; margin: 0; color: #18181b; font-family: Georgia, serif;">¡Felicidades ${esc(nombreQuinceanera)}!</h1>
          </div>

          <p style="font-size: 15px; line-height: 1.6; color: #52525b; text-align: center; margin-bottom: 30px;">
            Has recibido un bono de regalo válido por hasta <strong style="color: #18181b;">$200.000</strong> para el alquiler de tu vestido de 15 años ideal, gracias a la alianza exclusiva con nuestro socio comercial <strong style="color: #18181b;">${esc(nombreAliado)}</strong>.
          </p>

          <div style="background: linear-gradient(135deg, #18181b 0%, #27272a 100%); padding: 30px; border-radius: 16px; text-align: center; margin-bottom: 35px; border: 1px solid #3f3f46; box-shadow: 0 10px 25px rgba(24, 24, 27, 0.2);">
            <p style="color: #a1a1aa; font-size: 10px; font-weight: bold; letter-spacing: 0.3em; text-transform: uppercase; margin: 0 0 10px 0;">Tu Código Exclusivo</p>
            <p style="color: #fef3c7; font-size: 32px; font-weight: 300; letter-spacing: 0.1em; margin: 0; font-family: 'Courier New', Courier, monospace;">${esc(codigoVip)}</p>
          </div>

          <div style="text-align: center;">
            <a href="https://wa.me/573017307411?text=Hola,%20tengo%20un%20Pase%20VIP%20Dorado%20(${encodeURIComponent(codigoVip)})%20gracias%20a%20${encodeURIComponent(nombreAliado)}.%20Quiero%20agendar%20mi%20cita!" 
               style="display: inline-block; background: linear-gradient(to right, #fbbf24, #f59e0b); color: #451a03; padding: 16px 36px; border-radius: 12px; font-weight: bold; font-size: 14px; text-decoration: none; letter-spacing: 0.05em; text-transform: uppercase; box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3);">
              ✨ Agendar mi Cita VIP
            </a>
          </div>

          <p style="font-size: 12px; color: #a1a1aa; text-align: center; margin-top: 40px; line-height: 1.5;">
            Presenta este código durante tu primera visita a Ámbar Couture para hacer válido tu beneficio exclusivo.<br/>
            Este correo fue generado automáticamente.
          </p>
        </div>
      </div>
    `};
}

/** Sends one ally email; failures are reported, never thrown, so a registration is never lost. */
export async function sendAllyEmail(to:string|string[],message:{subject:string;html:string},attachments?:{filename:string;content:Buffer}[]){
 if(!process.env.RESEND_API_KEY||!to.length)return false;
 try{const {error}=await new Resend(process.env.RESEND_API_KEY).emails.send({from:'Ámbar Couture VIP <vip@ambarcouture.com>',to,subject:message.subject,html:message.html,...(attachments?{attachments}:{})});return !error;}catch{return false;}
}

// Aliados Directos (vinculación): short emails with the same look.
const box=(title:string,body:string)=>`<div style="background:#faf8f5;padding:32px 16px;font-family:Arial,sans-serif;color:#18181b"><div style="max-width:560px;margin:0 auto;background:#fff;padding:32px;border-radius:20px;border:1px solid #fce7f3"><p style="color:#d97706;font-size:11px;font-weight:bold;letter-spacing:.2em;text-transform:uppercase">Ámbar Couture · Aliados</p><h1 style="font-size:20px;font-family:Georgia,serif;font-weight:normal">${title}</h1>${body}</div></div>`;
export const allySignedEmail=(nombre:string)=>({subject:'Recibimos tu solicitud de aliado – Ámbar Couture',html:box(`Gracias, ${esc(nombre)}`,'<p>Recibimos tus datos y tu firma del acuerdo de vinculación. Adjuntamos el PDF firmado.</p><p>Tu solicitud queda <b>Pendiente</b>: te escribiremos cuando sea aprobada.</p>')});
export const allyAdminNoticeEmail=(nombre:string,tipo:string,cedula:string,panel:string)=>({subject:`Nuevo aliado pendiente de aprobación: ${nombre}`,html:box('Nuevo aliado por aprobar',`<p><b>${esc(nombre)}</b> · ${esc(tipo)} · C.C. ${esc(cedula)} firmó el acuerdo y espera aprobación.</p><p><a href="${panel}">Abrir Aliados</a></p>`)});
/** Store of the ally: contact and catalogs to show to their clients (optional). */
export type AllyStore={nombre:string;telefono:string|null;whatsapp:string|null;catalogos:{titulo:string;url:string}[]};
export const allyApprovedEmail=(a:{nombre:string;id:string;codigo:string},links:{clientas:string;disponibilidad:string;catalogo?:string},sede?:AllyStore|null)=>({subject:`¡Bienvenido! Tu código de aliado es ${a.codigo}`,html:box(`¡Aprobado, ${esc(a.nombre)}!`,`<p>Ya eres aliado activo de Ámbar Couture.</p><p>ID: <b>${esc(a.id)}</b><br>Código: <b>${esc(a.codigo)}</b></p><p><b>Registro de clientas:</b><br><a href="${links.clientas}">${links.clientas}</a></p><p><b>Disponibilidad de vestidos:</b><br><a href="${links.disponibilidad}">${links.disponibilidad}</a></p>${links.catalogo?`<p><b>Catálogo de todas las sedes con tus precios</b> (ahí también sacas el enlace sin precios para tus clientas):<br><a href="${links.catalogo}">${links.catalogo}</a></p>`:''}${sede?`<p><b>Tu sede: Ámbar Couture ${esc(sede.nombre)}</b>${sede.telefono?`<br>Teléfono: ${esc(sede.telefono)}`:''}${sede.whatsapp?`<br>WhatsApp: <a href="https://wa.me/${esc(sede.whatsapp)}">https://wa.me/${esc(sede.whatsapp)}</a>`:''}</p>${sede.catalogos.length?`<p><b>Catálogos para mostrar a tus clientas:</b>${sede.catalogos.map(c=>`<br>${esc(c.titulo)}: <a href="${c.url}">${c.url}</a>`).join('')}</p>`:''}`:''}<p style="color:#71717a;font-size:12px">Estos enlaces son personales y solo funcionan mientras estés activo.</p>`)});
export const allyCertificateEmail=(nombre:string,link:string)=>({subject:'Falta tu certificación bancaria – Ámbar Couture',html:box(`Hola, ${esc(nombre)}`,`<p>Para aprobar tu vinculación como aliado de Ámbar Couture necesitamos tu <b>certificación bancaria</b> (de la cuenta donde recibes los pagos).</p><p>Súbela aquí en PDF o foto (máximo 10 MB):</p><p><a href="${link}" style="display:inline-block;background:#be123c;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:bold">Subir certificación bancaria</a></p><p>Mientras no la recibamos, tu solicitud queda en espera.</p>`)});
export const allyRejectedEmail=(nombre:string,motivo:string|null)=>({subject:'Tu solicitud de aliado – Ámbar Couture',html:box(`Hola, ${esc(nombre)}`,`<p>Revisamos tu solicitud de vinculación como aliado y en este momento no fue aprobada.</p>${motivo?`<p>Motivo: ${esc(motivo)}</p>`:''}<p>Si tienes preguntas, comunícate con nosotros.</p>`)});

export const allyClientConfirmEmail=(nombre:string,id:string,aliado:string,citas:string,autorizacion?:string|null)=>({subject:`Registro confirmado ${id} – Ámbar Couture`,html:box(`¡Registro confirmado!`,`<p>Registramos a <b>${esc(nombre)}</b> con el ID <b>${esc(id)}</b>, por medio del aliado <b>${esc(aliado)}</b>.</p>${autorizacion?`<p>Acepta la autorización de tratamiento de tus datos aquí:<br><a href="${autorizacion}">${autorizacion}</a></p>`:''}<p>Agenda tu cita aquí:<br><a href="${citas}">${citas}</a></p>`)});
export const allyClientNoticeEmail=(aliado:string,clienta:string,categoria:string)=>({subject:`Nueva clienta registrada: ${clienta}`,html:box(`Hola, ${esc(aliado)}`,`<p>Se registró tu clienta <b>${esc(clienta)}</b> en la categoría <b>${esc(categoria)}</b>.</p>`)});
export const allyClientDuplicateEmail=(clienta:string,documento:string,original:string,intento:string)=>({subject:`Clienta ya registrada: ${clienta}`,html:box('Registro duplicado',`<p>El aliado <b>${esc(intento)}</b> intentó registrar a <b>${esc(clienta)}</b> (documento ${esc(documento)}), que ya estaba vinculada al aliado <b>${esc(original)}</b>. Se conservó el aliado original.</p>`)});
const link=(url:string)=>`<p><a href="${url}">${url}</a></p>`;
export const allyMeasuresEmail=(aliado:string,clienta:string,categoria:string,fecha:string,url:string)=>({subject:`Medidas de ${clienta} – Ámbar Couture`,html:box(`Hola, ${esc(aliado)}`,`<p>Llena las medidas de <b>${esc(clienta)}</b> (${esc(categoria)}, evento ${esc(fecha)}) en este enlace:</p>${link(url)}`)});
export const allyMeasuresFixEmail=(aliado:string,clienta:string,nota:string,url:string)=>({subject:`Corrección de medidas de ${clienta}`,html:box(`Hola, ${esc(aliado)}`,`<p>Necesitamos que corrijas las medidas de <b>${esc(clienta)}</b>:</p><p><i>${esc(nota)}</i></p>${link(url)}`)});
export const allyMeasuresReminderEmail=(aliado:string,clienta:string,dias:number,url:string)=>({subject:`Faltan las medidas de ${clienta}`,html:box(`Hola, ${esc(aliado)}`,`<p>Faltan <b>${dias}</b> días para el evento de <b>${esc(clienta)}</b> y aún no tenemos sus medidas.</p>${link(url)}`)});
export const allyRenewedEmail=(aliado:string,hasta:string)=>({subject:'Tu acuerdo de aliado se renovó',html:box(`Hola, ${esc(aliado)}`,`<p>Tu acuerdo de aliado con Ámbar Couture se renovó automáticamente hasta el <b>${esc(hasta)}</b>.</p>`)});
export const allyInactiveEmail=(aliado:string)=>({subject:'Tu acuerdo de aliado venció',html:box(`Hola, ${esc(aliado)}`,'<p>Tu acuerdo de aliado venció sin contratos en el último año y quedó <b>Inactivo</b>. Tus contratos vigentes continúan; los enlaces dejan de funcionar. Escríbenos para reactivarlo.</p>')});
