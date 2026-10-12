/**
 * ÁMBAR CRM — Agenda del ERP como origen de reservas (reemplaza Cal.com).
 * Pegar como archivo nuevo en el proyecto del CRM (Script ID 1Tq11Olqj0PYjOewfkIIcG2r4x5xurk1GAwOBG619djuvrN5LaBPWXsCK).
 *
 * Cómo funciona: el script PIDE al ERP las reservas nuevas, reprogramaciones y cancelaciones
 * (cada minuto) y las pasa por el mismo procesarWebhookCal_ que hoy recibe Cal.com.
 * El ERP no hace POST al /exec público: no hay que aceptar webhooks sin autenticar.
 *
 * Propiedades del script:
 *   ERP_ORIGIN        = https://erp.ambarcouture.com
 *   ERP_WORKER_SECRET = el mismo valor que FIRST_VISIT_WORKER_SECRET en Vercel (no publicar)
 */

// Enlaces de agenda del ERP por sede (reemplazan CAL_LINK_*).
var AMBAR_ERP_SEDES = {
  'BARRANQUILLA': 'd0bf17fb-f046-4dba-a11c-7e3a1ebb588a',
  'BOGOTA': 'c5a8e454-b89f-417d-9f01-b74253b5a237',
  'PEREIRA': 'c5162e37-6ffa-4cf5-8f25-6104e7f10725',
  'VILLAVICENCIO': '011a56fd-a1bc-43a7-8bcc-4a7bb5a60457'
};

function ambarNormalizarSede_(nombre) {
  return String(nombre || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
}

/** Enlace público para reservar una primera cita en la sede indicada (o sin sede). */
function enlaceAgendaERP_(sede) {
  var id = AMBAR_ERP_SEDES[ambarNormalizarSede_(sede)];
  return 'https://erp.ambarcouture.com/agendar-primera-cita' + (id ? '?sede=' + id : '');
}

/** Enlace para que el cliente busque su cita por cédula y la reprograme (cuando no hay enlace privado). */
function enlaceReprogramarPorCedulaERP_() {
  return 'https://erp.ambarcouture.com/reprogramar-primera-cita';
}

/** true si la reserva viene del ERP. */
function esReservaERP_(payload) {
  return !!(payload && payload.erp && payload.erp.origen === 'ERP');
}

/** Enlace privado de reprogramación de ESA cita (vence 30 días después de la cita). Vacío si no es del ERP. */
function enlaceReprogramacionERP_(payload) {
  return esReservaERP_(payload) ? String(payload.erp.enlaceReprogramacion || '') : '';
}

/** Enlace privado para confirmar, cambiar o cancelar ESA cita. */
function enlaceGestionERP_(payload) {
  return esReservaERP_(payload) ? String(payload.erp.enlaceGestion || '') : '';
}

/** Sede explícita del ERP con el mismo nombre que usa CITAS (Bogotá, Pereira...), o '' si no viene del ERP. */
function sedeReservaERP_(payload) {
  return esReservaERP_(payload) ? String(payload.sede || '').trim() : '';
}

/** true si el enlace es del ERP (nunca de Cal.com). */
function esEnlaceERP_(url) {
  return String(url || '').indexOf('https://erp.ambarcouture.com/') === 0;
}

/** Duración de la cita en minutos según el ERP (60). Reemplaza CAL_EVENT_DURATION_MIN para reservas ERP. */
function duracionReservaERP_(payload) {
  return esReservaERP_(payload) ? Number(payload.erp.duracionMin) || 60 : 0;
}

/** Etiqueta de trazabilidad: 'ERP' para reservas nuevas; las de Cal.com conservan la suya. */
function origenReserva_(payload) {
  return esReservaERP_(payload) ? 'ERP' : 'CAL.COM';
}

function ambarAgendaERP_(body) {
  var p = PropertiesService.getScriptProperties();
  var origin = String(p.getProperty('ERP_ORIGIN') || '').replace(/\/$/, '');
  var secret = String(p.getProperty('ERP_WORKER_SECRET') || '');
  // Evita enviar la clave privada a otro servidor o a una URL redirigida.
  if (origin !== 'https://erp.ambarcouture.com') throw new Error('ERP_ORIGIN debe ser https://erp.ambarcouture.com');
  if (!secret) throw new Error('Falta ERP_WORKER_SECRET en Propiedades del script.');
  var response = UrlFetchApp.fetch(origin + '/api/primeras-citas/eventos-crm', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(body),
    headers: {Authorization: 'Bearer ' + secret},
    muteHttpExceptions: true,
    followRedirects: false
  });
  var code = response.getResponseCode();
  if (code === 401 || code === 403) throw new Error('ERP rechazó la clave. Revisa ERP_WORKER_SECRET y FIRST_VISIT_WORKER_SECRET.');
  if (code < 200 || code >= 300) throw new Error('Agenda ERP no disponible, HTTP ' + code + '.');
  return JSON.parse(response.getContentText());
}

/**
 * Pasa un evento del ERP por el receptor actual de Cal.com, sin duplicar su lógica.
 * Sergio: confirma que procesarWebhookCal_ recibe el objeto `e` de doPost. Si recibe otra cosa
 * (por ejemplo el JSON ya parseado), ajusta SOLO esta función.
 */
function ambarProcesarEventoERP_(evento) {
  var e = {postData: {contents: JSON.stringify(evento), type: 'application/json'}, parameter: {}, parameters: {}};
  var salida = procesarWebhookCal_(e);
  var texto = salida && typeof salida.getContent === 'function' ? salida.getContent() : JSON.stringify(salida || {});
  var r = {};
  try { r = JSON.parse(texto); } catch (_) { r = {ok: false, error: 'Respuesta no JSON: ' + String(texto).substring(0, 200)}; }
  return r;
}

/** Activador cada minuto: registra en CITAS las reservas del ERP y avisa al ERP el resultado. */
function sincronizarAgendaERP() {
  // Bloqueo de usuario, no de script: procesarWebhookCal_ toma su propio bloqueo de script por cada evento.
  var lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return {omitido: true, motivo: 'Otra ejecución activa'};
  try {
    var eventos = ambarAgendaERP_({accion: 'tomar', limite: 10}).eventos || [];
    var resumen = {procesados: 0, errores: 0};
    eventos.forEach(function(item) {
      var r;
      try { r = ambarProcesarEventoERP_(item.evento); }
      catch (err) { r = {ok: false, error: String(err && err.message || err)}; }
      // Solo se marca entregado si CITAS confirmó el registro; si no, el ERP lo reintenta (máximo 5 veces).
      var ok = r && r.ok === true;
      ambarAgendaERP_({accion: 'resultado', id: item.id, ok: ok, respuesta: JSON.stringify(r).substring(0, 500)});
      resumen[ok ? 'procesados' : 'errores']++;
    });
    if (eventos.length) console.log(JSON.stringify(resumen));
    return resumen;
  } finally { lock.releaseLock(); }
}

function activarAgendaERP() {
  console.log(JSON.stringify(sincronizarAgendaERP()));
  var existing = ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === 'sincronizarAgendaERP'; });
  if (!existing.length) ScriptApp.newTrigger('sincronizarAgendaERP').timeBased().everyMinutes(1).create();
  existing.slice(1).forEach(function(t) { ScriptApp.deleteTrigger(t); });
  console.log('Agenda ERP activa: el CRM recibe las reservas del ERP cada minuto.');
  return {activo: true};
}

function pausarAgendaERP() {
  ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === 'sincronizarAgendaERP'; }).forEach(function(t) { ScriptApp.deleteTrigger(t); });
  return {agendaERPPausada: true};
}
