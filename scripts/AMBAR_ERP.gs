/**
 * ÁMBAR — programador del calendario ERP y respaldo del CRM anterior.
 * Pegar en un PROYECTO NUEVO de Apps Script. No sustituye el script anterior.
 * No crear una implementación web: WhatsApp responde directamente al ERP.
 * Configurar en Propiedades del script:
 * ERP_ORIGIN = https://erp.ambarcouture.com
 * ERP_WORKER_SECRET = el mismo FIRST_VISIT_WORKER_SECRET privado de Vercel
 * CRM_SPREADSHEET_ID = ID del archivo histórico (opcional, solo exportación)
 */
function prepararConexionERP() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('ERP_ORIGIN')) p.setProperty('ERP_ORIGIN', 'https://erp.ambarcouture.com');
  if (!p.getProperty('ERP_WORKER_SECRET')) p.setProperty('ERP_WORKER_SECRET', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  console.log('Propiedades preparadas. Copia ERP_WORKER_SECRET desde Configuración del proyecto a FIRST_VISIT_WORKER_SECRET privado de Vercel. No publiques esta clave.');
}

function ambarConfiguracionERP_() {
  var p = PropertiesService.getScriptProperties();
  var origin = String(p.getProperty('ERP_ORIGIN') || '').replace(/\/$/, '');
  var secret = String(p.getProperty('ERP_WORKER_SECRET') || '');
  // Evita enviar la clave privada a otro servidor o a una URL redirigida.
  if (origin !== 'https://erp.ambarcouture.com') throw new Error('ERP_ORIGIN debe ser https://erp.ambarcouture.com');
  if (!secret) throw new Error('Falta ERP_WORKER_SECRET en Propiedades del script.');
  return {origin: origin, secret: secret};
}

function ambarLlamarERP_(method) {
  var c = ambarConfiguracionERP_();
  var response = UrlFetchApp.fetch(c.origin + '/api/primeras-citas/procesar', {
    method: method,
    headers: {Authorization: 'Bearer ' + c.secret},
    muteHttpExceptions: true,
    followRedirects: false
  });
  var code = response.getResponseCode();
  if (code === 401 || code === 403) throw new Error('ERP rechazó la clave. Revisa ERP_WORKER_SECRET y FIRST_VISIT_WORKER_SECRET.');
  if (code < 200 || code >= 300) throw new Error('ERP no disponible, HTTP ' + code + '. No se repite ningún envío desde este script.');
  try { return JSON.parse(response.getContentText()); }
  catch (_) { throw new Error('ERP devolvió una respuesta inesperada. Comprueba la publicación.'); }
}

function comprobarConexionERP() {
  var r = ambarLlamarERP_('get');
  // Solo imprime estado y nombres de configuración; nunca credenciales ni clientes.
  console.log(JSON.stringify(r));
  if (typeof r.listo !== 'boolean') throw new Error('Falta publicar la comprobación de conexión en el ERP.');
  return r;
}

function activarAutomatizacionesERP() {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var r = comprobarConexionERP();
    if (!r.listo) throw new Error('ERP aún no está listo. Faltantes: ' + (r.faltantes || []).join(', ') + '. Comprueba también la activación de mensajes.');
    var existing = ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === 'ejecutarAutomatizacionesERP'; });
    if (!existing.length) ScriptApp.newTrigger('ejecutarAutomatizacionesERP').timeBased().everyMinutes(1).create();
    existing.slice(1).forEach(function(t) { ScriptApp.deleteTrigger(t); });
    console.log('Programador ERP activo. WhatsApp y reservas deben apuntar al ERP antes del cambio definitivo.');
    return {activo: true};
  } finally { lock.releaseLock(); }
}

function ejecutarAutomatizacionesERP() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return {omitido: true, motivo: 'Otra ejecución activa'};
  try {
    // Una llamada: el ERP reclama hasta cinco trabajos de forma atómica.
    // Ante un resultado incierto, el ERP lo deja en revisión, sin envío a ciegas.
    var r = ambarLlamarERP_('post');
    if (r.activo === false) throw new Error('Mensajes desactivados en ERP. No se enviaron mensajes.');
    console.log(JSON.stringify(r));
    PropertiesService.getScriptProperties().setProperty('ERP_ULTIMA_EJECUCION_OK', new Date().toISOString());
    return r;
  } finally { lock.releaseLock(); }
}

function pausarAutomatizacionesERP() {
  ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === 'ejecutarAutomatizacionesERP'; }).forEach(function(t) { ScriptApp.deleteTrigger(t); });
  return {programadorPausado: true};
}

function exportarHistoricoCRM() {
  var p = PropertiesService.getScriptProperties();
  var id = p.getProperty('CRM_SPREADSHEET_ID') || '1L7fDM2rzrrxim1poXcX3rw34-Hy6iMQnW5_dTWQyYE4';
  var ss = SpreadsheetApp.openById(id);
  var result = {version: 1, origen: 'CRM_APPS_SCRIPT_AMBAR', archivoOrigen: id, exportadoEn: new Date().toISOString(), zonaHoraria: ss.getSpreadsheetTimeZone(), hojas: {}};
  // No exporta CONFIG_AUTOMATIZACION, propiedades ni logs de webhooks:
  // pueden contener credenciales o información ajena al histórico comercial.
  ['CITAS', 'VITRINA', 'POST_CITA', 'SEGUIMIENTO COMERCIAL'].forEach(function(name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) { result.hojas[name] = {ausente: true}; return; }
    var range = sheet.getDataRange();
    // Conserva encabezados duplicados, IDs, datos visibles y tipos/fechas originales.
    // Las matrices evitan perder campos por nombres de columna repetidos.
    result.hojas[name] = {valores: range.getValues(), valoresVisibles: range.getDisplayValues(), filas: range.getNumRows(), columnas: range.getNumColumns()};
  });
  var stamp = Utilities.formatDate(new Date(), 'America/Bogota', 'yyyyMMdd-HHmmss');
  var blob = Utilities.newBlob(JSON.stringify(result), 'application/json', 'AMBAR-historico-CRM-' + stamp + '.json');
  var file = DriveApp.createFile(blob);
  // Drive crea el archivo privado; este código no lo comparte.
  console.log('Respaldo histórico privado: ' + file.getUrl());
  return {archivo: file.getUrl(), nombre: file.getName()};
}
