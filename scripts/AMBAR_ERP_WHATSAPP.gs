/**
 * ÁMBAR — WhatsApp de primeras citas del ERP, enviado desde Apps Script.
 * Pegar como archivo nuevo en el MISMO proyecto que tiene las credenciales de Meta
 * y la aplicación web /exec configurada como webhook (configurarWebhookMetaDefinitivoV2).
 *
 * Propiedades del script necesarias:
 *   ERP_ORIGIN         = https://erp.ambarcouture.com
 *   ERP_WORKER_SECRET  = el mismo valor que FIRST_VISIT_WORKER_SECRET en Vercel
 *   META_WA_TOKEN      = ya existe en este proyecto
 *   META_WA_PHONE_NUMBER_ID (o META_WA_PHONE_ID) = ID del número que envía
 * Opcionales:
 *   META_GRAPH_VERSION      = v26.0 por defecto
 *   META_WA_TEMPLATE_LANG   = idioma aprobado de ambar_post_cita_asistencia (es_CO por defecto)
 *   ERP_CORREO_INTERNO      = correos para el aviso interno de nueva cita, separados por coma,
 *                             o JSON {"<sede_id>": ["a@x.com"]}. Sin esta propiedad el aviso se omite.
 *
 * En la función doPost(e) existente, agrega como PRIMERA línea:
 *   ambarReenviarWebhookERP_(e);
 */
function ambarWaConfig_() {
  var p = PropertiesService.getScriptProperties();
  var origin = String(p.getProperty('ERP_ORIGIN') || '').replace(/\/$/, '');
  var secret = String(p.getProperty('ERP_WORKER_SECRET') || '');
  // Evita enviar la clave privada a otro servidor o a una URL redirigida.
  if (origin !== 'https://erp.ambarcouture.com') throw new Error('ERP_ORIGIN debe ser https://erp.ambarcouture.com');
  if (!secret) throw new Error('Falta ERP_WORKER_SECRET en Propiedades del script.');
  return {
    origin: origin,
    secret: secret,
    token: String(p.getProperty('META_WA_TOKEN') || ''),
    phone: String(p.getProperty('META_WA_PHONE_NUMBER_ID') || p.getProperty('META_WA_PHONE_ID') || ''),
    version: String(p.getProperty('META_GRAPH_VERSION') || 'v26.0'),
    lang: String(p.getProperty('META_WA_TEMPLATE_LANG') || 'es_CO'),
    interno: String(p.getProperty('ERP_CORREO_INTERNO') || '')
  };
}

function ambarWaERP_(payload) {
  var c = ambarWaConfig_();
  var response = UrlFetchApp.fetch(c.origin + '/api/primeras-citas/whatsapp-script', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: {Authorization: 'Bearer ' + c.secret},
    muteHttpExceptions: true,
    followRedirects: false
  });
  var code = response.getResponseCode(), text = response.getContentText();
  if (code === 401 || code === 403) throw new Error('ERP rechazó la clave. Revisa ERP_WORKER_SECRET y FIRST_VISIT_WORKER_SECRET.');
  if (code < 200 || code >= 300) throw new Error('ERP respondió HTTP ' + code + ': ' + text.substring(0, 200));
  return JSON.parse(text);
}

function ambarCorreoInterno_(c, sedeId) {
  if (!c.interno) return [];
  if (c.interno.charAt(0) === '{') { var map = JSON.parse(c.interno); return map[sedeId] || []; }
  return c.interno.split(',').map(function(x) { return x.trim(); }).filter(String);
}

function enviarWhatsAppERP() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return {omitido: true, motivo: 'Otra ejecución activa'};
  try {
    var c = ambarWaConfig_();
    if (!c.token || !c.phone) throw new Error('Faltan META_WA_TOKEN o META_WA_PHONE_NUMBER_ID en Propiedades del script.');
    var mensajes = ambarWaERP_({accion: 'tomar', limite: 5, idioma_post_cita: c.lang}).mensajes || [];
    var resumen = {enviados: 0, errores: 0, revisar: 0};
    mensajes.forEach(function(m) {
      var r = {accion: 'resultado', id: m.id, estado: 'revisar'};
      try {
        if (m.canal === 'correo') {
          var para = ambarCorreoInterno_(c, m.sede_id);
          if (!para.length) { r.estado = 'omitido'; r.error = 'Sin ERP_CORREO_INTERNO para esta sede'; }
          else { GmailApp.sendEmail(para.join(','), m.asunto, m.texto, {name: 'ERP Ámbar Couture'}); r.estado = 'enviado'; }
        } else {
          var res = UrlFetchApp.fetch('https://graph.facebook.com/' + c.version + '/' + c.phone + '/messages', {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify(m.payload),
            headers: {Authorization: 'Bearer ' + c.token},
            muteHttpExceptions: true
          });
          var code = res.getResponseCode(), d = {};
          try { d = JSON.parse(res.getContentText()); } catch (_) {}
          if (code >= 200 && code < 300 && d.messages && d.messages[0] && d.messages[0].id) { r.estado = 'enviado'; r.provider_id = d.messages[0].id; }
          // 4xx: Meta rechazó (plantilla, número, ventana 24 h); el ERP reintenta en 10 min, máximo 3 veces.
          else if (code >= 400 && code < 500) { r.estado = 'error'; r.error = 'WhatsApp rechazó el envío (' + code + '): ' + String((d.error && d.error.message) || '').substring(0, 200); }
          // 5xx o respuesta incompleta: no se reintenta a ciegas, queda para revisar.
          else { r.error = 'Respuesta incierta de Meta (' + code + ')'; }
        }
      } catch (e) { r.error = 'Resultado incierto: ' + String(e && e.message || e).substring(0, 200); }
      resumen[r.estado === 'enviado' ? 'enviados' : r.estado === 'error' ? 'errores' : 'revisar']++;
      ambarWaERP_(r);
    });
    if (mensajes.length) console.log(JSON.stringify(resumen));
    return resumen;
  } finally { lock.releaseLock(); }
}

/** Llamar al inicio de doPost(e): reenvía al ERP estados y respuestas de botones de WhatsApp. */
function ambarReenviarWebhookERP_(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.object !== 'whatsapp_business_account') return;
    // Solo estados de entrega y respuestas a mensajes; el resto lo sigue manejando este script.
    var relevante = (body.entry || []).some(function(entry) {
      return (entry.changes || []).some(function(ch) {
        var v = ch.value || {};
        return (v.statuses || []).length || (v.messages || []).some(function(m) { return m.context && m.context.id; });
      });
    });
    if (relevante) ambarWaERP_({accion: 'webhook', evento: body});
  } catch (err) {
    // Nunca romper el flujo actual del webhook por una falla del ERP.
    console.warn('No se pudo reenviar el webhook al ERP: ' + (err && err.message));
  }
}

function activarWhatsAppERP() {
  // Primera ejecución manual: valida claves y permisos antes de programar.
  console.log(JSON.stringify(enviarWhatsAppERP()));
  var existing = ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === 'enviarWhatsAppERP'; });
  if (!existing.length) ScriptApp.newTrigger('enviarWhatsAppERP').timeBased().everyMinutes(1).create();
  existing.slice(1).forEach(function(t) { ScriptApp.deleteTrigger(t); });
  console.log('WhatsApp del ERP activo: revisa la cola cada minuto.');
  return {activo: true};
}

function pausarWhatsAppERP() {
  ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === 'enviarWhatsAppERP'; }).forEach(function(t) { ScriptApp.deleteTrigger(t); });
  return {whatsappPausado: true};
}
