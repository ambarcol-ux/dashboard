const SPREADSHEET_ID = '1L7fDM2rzrrxim1poXcX3rw34-Hy6iMQnW5_dTWQyYE4';
const SHEET_NAME = 'CITAS';
const SEDE = 'Villavicencio';
const TIMEZONE = 'America/Bogota';
const EVENT_TYPE_ID = 6601786;
const EVENT_TYPE_SEDES = {
  '6601786': 'Villavicencio',
  '6644131': 'Bogotá',
  '6644464': 'Barranquilla',
    '7322765': 'Virtual',
  '7234256': 'Pereira'
};
// La columna R conserva la modalidad elegida en Cal.com sin desplazar los
// campos operativos existentes ni los campos técnicos que comienzan en S.
const TOTAL_COLUMNAS = 18;


/* ================================================================
 * ÁMBAR COUTURE — ENTRADA ÚNICA DE WEBHOOKS
 * - Conserva Cal.com (crear, reprogramar, cancelar)
 * - Añade Meta WhatsApp Cloud API
 * - No guarda tokens en el código: los lee de Propiedades del script
 * ================================================================ */

// Envoltorio público e idempotente para crear únicamente las claves por sede.
function configurarCalificacionPorSede() {
  return instalarClavesCalificacionPorSede();
}

function configurarAdministradorasResponsables() {
  return instalarAdministradorasResponsablesPorSede();
}

function doGet(e) {
  // AMBAR_FINAL_BOOTSTRAP_START
  const __ambarFinalBootstrap = ambarMetaFinalizeStable_(e);
  if (__ambarFinalBootstrap) return __ambarFinalBootstrap;
  // AMBAR_FINAL_BOOTSTRAP_END





  const p = (e && e.parameter) ? e.parameter : {};

  // Respuestas de un solo toque desde el correo post-cita.
  if (p.pc_id && p.pc_action && p.pc_sig) {
    return procesarRespuestaEmailDirecta_(
      p.pc_id,
      p.pc_action,
      p.pc_sig
    );
  }
  const mode = String(p['hub.mode'] || '');
  const tokenRecibido = String(p['hub.verify_token'] || '');
  const challenge = String(p['hub.challenge'] || '');

  // Verificación del webhook de Meta.
  if (mode === 'subscribe' && challenge) {
    const tokenEsperado = obtenerVerifyTokenMeta_();

    if (tokenRecibido && tokenEsperado && tokenRecibido === tokenEsperado) {
      return ContentService
        .createTextOutput(challenge)
        .setMimeType(ContentService.MimeType.TEXT);
    }

    // Apps Script no permite fijar fácilmente un 403 con ContentService;
    // al no devolver el challenge, Meta considera fallida la verificación.
    return ContentService
      .createTextOutput('Token de verificación inválido')
      .setMimeType(ContentService.MimeType.TEXT);
  }

  return ContentService
    .createTextOutput('CRM CITAS ÁMBAR - Webhooks Cal.com + Meta activos')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Solicitud sin contenido POST.');
    }

    const data = JSON.parse(e.postData.contents);

    if (esWebhookMeta_(data)) {
      return procesarWebhookMeta_(data);
    }

    // Todo lo que no tenga estructura de WhatsApp se deja en el flujo
    // original de Cal.com para no romper lo que ya funciona.
    return procesarWebhookCal_(e);

  } catch (error) {
    console.error('ERROR EN ENRUTADOR doPost: ' + error.stack);
    registrarLogTecnico_('ROUTER_ERROR', {
      mensaje: error.message
    });

    return respuestaJson({
      ok: false,
      error: error.message
    });
  }
}

function procesarWebhookCal_(e) {
  const lock = LockService.getScriptLock();
  let lockTomado = false;

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Solicitud sin contenido POST.');
    }

    const data = JSON.parse(e.postData.contents);
const logSheet = SpreadsheetApp
  .openById(SPREADSHEET_ID)
  .getSheetByName('WEBHOOK_LOG');

if (logSheet) {
  logSheet.appendRow([
    new Date(),
    data.triggerEvent || '',
    JSON.stringify(data)
  ]);
}
    const trigger = String(
      data.triggerEvent || data.trigger || data.type || ''
    ).toUpperCase();

    const payload = data.payload || data;

    if (!trigger) {
      throw new Error('Cal.com no envió triggerEvent.');
    }

    const eventosPermitidos = [
      'BOOKING_CREATED',
      'BOOKING_RESCHEDULED',
      'BOOKING_CANCELLED'
    ];

    if (eventosPermitidos.indexOf(trigger) === -1) {
      return respuestaJson({
        ok: true,
        accion: 'IGNORADO',
        trigger: trigger
      });
    }

    lockTomado = lock.tryLock(10000);

    if (!lockTomado) {
      throw new Error('No se pudo obtener bloqueo para procesar el webhook.');
    }

    const sheet = SpreadsheetApp
      .openById(SPREADSHEET_ID)
      .getSheetByName(SHEET_NAME);

    if (!sheet) {
      throw new Error('No se encontró la hoja ' + SHEET_NAME + '.');
    }

    asegurarColumnaModalidad_(sheet);
    asegurarTrazabilidadFechasCitasVitrina_();

    const datos = extraerDatosReserva(payload);

    // Algunas versiones de Cal.com no exponen BOOKING_RESCHEDULED en el
    // selector de webhooks. En esos casos la nueva reserva llega como
    // BOOKING_CREATED, pero conserva el UID anterior en el payload.
    if (trigger === 'BOOKING_CREATED' && esCreacionPorReprogramacion_(payload)) {
      return procesarReprogramacion(sheet, datos, payload);
    }

    if (trigger === 'BOOKING_CREATED') {
      return procesarCreacion(sheet, datos);
    }

    if (trigger === 'BOOKING_RESCHEDULED') {
      return procesarReprogramacion(sheet, datos, payload);
    }

    return procesarCancelacion(sheet, datos, payload);

  } catch (error) {
    console.error('ERROR EN WEBHOOK CAL.COM: ' + error.stack);

    return respuestaJson({
      ok: false,
      error: error.message
    });

  } finally {
    if (lockTomado) {
      lock.releaseLock();
    }
  }
}

function esCreacionPorReprogramacion_(payload) {
  if (!payload) return false;

  const candidato =
    payload.rescheduleUid ||
    payload.rescheduleId ||
    payload.rescheduledFromUid ||
    payload.rescheduledFromBookingUid ||
    (payload.metadata && (
      payload.metadata.rescheduleUid ||
      payload.metadata.rescheduleId ||
      payload.metadata.rescheduledFromUid
    ));

  return String(candidato || '').trim() !== '';
}

function procesarCreacion(sheet, datos) {

  const filaExistente = datos.bookingId
    ? buscarFilaPorId(sheet, datos.bookingId)
    : 0;

  if (filaExistente) {

    actualizarFila(
      sheet,
      filaExistente,
      datos,
      'AGENDADA',
      {
        reiniciarSeguimiento: false,
        observacion:
          'Webhook BOOKING_CREATED repetido: se actualizó sin duplicar.'
      }
    );

    encolarCapiCitaAgendada_(datos);

    enviarEventoScheduleMeta_(datos);

    const whatsapp = enviarConfirmacionCitaSiPendiente_(
      sheet,
      filaExistente,
      datos
    );

    return respuestaJson({
      ok: true,
      accion: 'ACTUALIZADA_SIN_DUPLICAR',
      fila: filaExistente,
      idCita: datos.bookingId,
      whatsapp: whatsapp
    });
  }

  const fila = agregarFila(
    sheet,
    datos,
    'AGENDADA',
    'ESPERAR CITA',
    ''
  );

  encolarCapiCitaAgendada_(datos);

  // Aislado: un error de correo interno no afecta el webhook ni WhatsApp.
  try {
    notificarNuevaCitaInternaSiPendiente_(datos, false);
  } catch (error) {
    console.warn('Correo interno de nueva cita: ' + error.message);
  }

  enviarEventoScheduleMeta_(datos);

    const whatsapp = enviarConfirmacionCitaSiPendiente_(
    sheet,
    fila,
    datos
  );

  return respuestaJson({
    ok: true,
    accion: 'CREADA',
    fila: fila,
    idCita: datos.bookingId,
    whatsapp: whatsapp
  });
}

/* ------------------------- META CAPI: CITA AGENDADA ------------------------- */

function hashCapiSha256_(valor) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(valor || ''),
    Utilities.Charset.UTF_8
  ).map(function(byte) {
    const hexadecimal = (byte < 0 ? byte + 256 : byte).toString(16);
    return hexadecimal.length === 1 ? '0' + hexadecimal : hexadecimal;
  }).join('');
}

function normalizarTelefonoCapi_(valor) {
  const digitos = String(valor || '').replace(/\D/g, '');
  if (/^3\d{9}$/.test(digitos)) return '57' + digitos;
  if (/^57\d{10}$/.test(digitos)) return digitos;
  return '';
}

function enviarCapiCitaAgendada_(datos) {
  try {
    const bookingId = String(datos && datos.bookingId || '').trim();
    if (!bookingId) {
      console.warn('META CAPI omitido: cita sin bookingId estable.');
      return false;
    }

    const accessToken = PropertiesService
      .getScriptProperties()
      .getProperty('META_CAPI_ACCESS_TOKEN');

    if (!accessToken) {
      console.warn('META CAPI omitido: falta META_CAPI_ACCESS_TOKEN.');
      return false;
    }

    const userData = {};
    const correo = String(datos && datos.correo || '').trim().toLowerCase();
    const telefono = normalizarTelefonoCapi_(datos && datos.whatsapp);

    if (correo) userData.em = [hashCapiSha256_(correo)];
    if (telefono) userData.ph = [hashCapiSha256_(telefono)];

    const evento = {
      event_name: 'Schedule',
      event_time: Math.floor(Date.now() / 1000),
      event_id: 'cal_booking_created_' + bookingId,
      action_source: 'system_generated',
      user_data: userData
    };

    const respuesta = UrlFetchApp.fetch(
      'https://graph.facebook.com/v26.0/1420256452930635/events',
      {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ data: [evento] }),
        headers: { Authorization: 'Bearer ' + accessToken },
        muteHttpExceptions: true
      }
    );

    const codigo = respuesta.getResponseCode();
    if (codigo >= 200 && codigo < 300) {
      console.log('META CAPI Schedule enviado: ' + evento.event_id);
      registrarLogTecnico_('META_CAPI_SCHEDULE', { estado: 'ENVIADO', http: codigo });
      return true;
    } else {
      console.warn('META CAPI Schedule HTTP ' + codigo + ': ' + evento.event_id);
      let errorMeta = {};
      try {
        errorMeta = JSON.parse(respuesta.getContentText() || '{}').error || {};
      } catch (_) {}
      registrarLogTecnico_('META_CAPI_SCHEDULE', {
        estado: 'ERROR',
        http: codigo,
        codigoMeta: errorMeta.code || '',
        subcodigoMeta: errorMeta.error_subcode || ''
      });
      return false;
    }
  } catch (error) {
    console.warn('META CAPI Schedule error: ' + error.message);
    registrarLogTecnico_('META_CAPI_SCHEDULE', { estado: 'EXCEPCION' });
    return false;
  }
}

function encolarCapiCitaAgendada_(datos) {
  try {
    const bookingId = String(datos && datos.bookingId || '').trim();
    if (!bookingId) return;

    PropertiesService.getScriptProperties().setProperty(
      'META_CAPI_SCHEDULE_' + bookingId,
      JSON.stringify({
        bookingId: bookingId,
        correo: String(datos.correo || ''),
        whatsapp: String(datos.whatsapp || '')
      })
    );

    const existe = ScriptApp.getProjectTriggers().some(function(trigger) {
      return trigger.getHandlerFunction() === 'procesarColaCapiSchedule_';
    });
    if (!existe) {
      ScriptApp.newTrigger('procesarColaCapiSchedule_').timeBased().everyMinutes(1).create();
    }
  } catch (error) {
    console.warn('META CAPI Schedule no se pudo encolar: ' + error.message);
  }
}

function procesarColaCapiSchedule_() {
  const props = PropertiesService.getScriptProperties();
  const pendientes = props.getProperties();
  const clavesPendientes = Object.keys(pendientes).filter(function(clave) {
    return clave.indexOf('META_CAPI_SCHEDULE_') === 0;
  });
  if (!clavesPendientes.length) {
    ScriptApp.getProjectTriggers().filter(function(trigger) {
      return trigger.getHandlerFunction() === 'procesarColaCapiSchedule_';
    }).forEach(function(trigger) {
      ScriptApp.deleteTrigger(trigger);
    });
    return;
  }
  clavesPendientes.forEach(function(clave) {
    try {
      const datos = JSON.parse(pendientes[clave]);
      if (enviarCapiCitaAgendada_(datos)) props.deleteProperty(clave);
    } catch (error) {
      console.warn('META CAPI Schedule cola error: ' + error.message);
    }
  });
}

/* ------------------- META CAPI: RESPUESTAS POST-CITA ------------------- */

function enviarCapiEventoPostCita_(datos) {
  try {
    const bookingId = String(datos && datos.bookingId || '').trim();
    const etapa = String(datos && datos.etapa || '').trim().toUpperCase();
    const eventName = String(datos && datos.eventName || '').trim();
    if (!bookingId || !etapa || !eventName) return false;

    const accessToken = PropertiesService
      .getScriptProperties()
      .getProperty('META_CAPI_ACCESS_TOKEN');
    if (!accessToken) {
      console.warn('META CAPI ' + etapa + ' omitido: falta token.');
      return false;
    }

    const userData = {};
    const correo = String(datos.correo || '').trim().toLowerCase();
    const telefono = normalizarTelefonoCapi_(datos.whatsapp);
    if (correo) userData.em = [hashCapiSha256_(correo)];
    if (telefono) userData.ph = [hashCapiSha256_(telefono)];

    const respuesta = UrlFetchApp.fetch(
      'https://graph.facebook.com/v26.0/1420256452930635/events',
      {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ data: [{
          event_name: eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: 'capi_' + etapa.toLowerCase() + '_' + bookingId,
          action_source: 'system_generated',
          user_data: userData
        }] }),
        headers: { Authorization: 'Bearer ' + accessToken },
        muteHttpExceptions: true
      }
    );

    const codigo = respuesta.getResponseCode();
    if (codigo >= 200 && codigo < 300) {
      PropertiesService.getScriptProperties().setProperty(
        claveCapiPostCitaEnviado_(etapa, bookingId),
        String(Date.now())
      );
      console.log('META CAPI ' + etapa + ' enviado.');
      registrarLogTecnico_('META_CAPI_' + etapa, { estado: 'ENVIADO', http: codigo });
      return true;
    }
    console.warn('META CAPI ' + etapa + ' HTTP ' + codigo + '.');
    registrarLogTecnico_('META_CAPI_' + etapa, { estado: 'ERROR', http: codigo });
    return false;
  } catch (error) {
    console.warn('META CAPI ' + String(datos && datos.etapa || '') + ' error: ' + error.message);
    registrarLogTecnico_('META_CAPI_POST_CITA', { estado: 'EXCEPCION' });
    return false;
  }
}

function claveCapiPostCitaEnviado_(etapa, bookingId) {
  return 'META_CAPI_POST_ENVIADO_' + String(etapa || '').toUpperCase() + '_' + String(bookingId || '').trim();
}

function encolarCapiEventoPostCita_(bookingId, correo, whatsapp, etapa, eventName) {
  try {
    const id = String(bookingId || '').trim();
    if (!id) return;
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty(claveCapiPostCitaEnviado_(etapa, id))) return;
    const clave = 'META_CAPI_POST_' + String(etapa || '').toUpperCase() + '_' + id;
    props.setProperty(clave, JSON.stringify({
      bookingId: id,
      correo: String(correo || ''),
      whatsapp: String(whatsapp || ''),
      etapa: etapa,
      eventName: eventName
    }));

    const existe = ScriptApp.getProjectTriggers().some(function(trigger) {
      return trigger.getHandlerFunction() === 'procesarColaCapiPostCita_';
    });
    if (!existe) {
      ScriptApp.newTrigger('procesarColaCapiPostCita_').timeBased().everyMinutes(1).create();
    }
  } catch (error) {
    console.warn('META CAPI post-cita no se pudo encolar: ' + error.message);
  }
}

function procesarColaCapiPostCita_() {
  const props = PropertiesService.getScriptProperties();
  const pendientes = props.getProperties();
  const claves = Object.keys(pendientes).filter(function(clave) {
    return clave.indexOf('META_CAPI_POST_') === 0 &&
      clave.indexOf('META_CAPI_POST_ENVIADO_') !== 0;
  });
  if (!claves.length) {
    ScriptApp.getProjectTriggers().filter(function(trigger) {
      return trigger.getHandlerFunction() === 'procesarColaCapiPostCita_';
    }).forEach(function(trigger) {
      ScriptApp.deleteTrigger(trigger);
    });
    return;
  }
  claves.forEach(function(clave) {
    try {
      if (enviarCapiEventoPostCita_(JSON.parse(pendientes[clave]))) {
        props.deleteProperty(clave);
      }
    } catch (error) {
      console.warn('META CAPI post-cita cola error: ' + error.message);
    }
  });
}

function probarCapiScheduleTecnico_() {
  enviarCapiCitaAgendada_({
    bookingId: 'capi_tecnico_' + Date.now()
  });
}

function procesarReprogramacion(sheet, datos, payload) {

  const idAnterior = String(
    payload.rescheduleUid ||
    payload.rescheduleId ||
    ''
  ).trim();

  let fila = 0;

  // Primero busca el UID anterior.
  if (idAnterior) {
    fila = buscarFilaPorId(sheet, idAnterior);
  }

  // Si ya fue actualizada anteriormente, busca el UID nuevo.
  if (!fila && datos.bookingId) {
    fila = buscarFilaPorId(sheet, datos.bookingId);
  }

  // Respaldo: correo/teléfono + fecha/hora anterior.
  // ERP: el ERP envía rescheduleStartTime, así que el respaldo exige la hora anterior exacta.
  if (!fila) {
    fila = buscarFilaPorDatosReserva(
      sheet,
      datos,
      payload.rescheduleStartTime || ''
    );
  }

  const motivo = obtenerMotivoReprogramacion(payload);

  // ERP: el texto indica el origen real de la reprogramación.
  const observacion = motivo
    ? 'Reprogramada. Motivo: ' + motivo
    : 'Reprogramada desde ' + (datos.origen === 'ERP' ? 'el ERP' : 'Cal.com') + '.';

  if (fila) {

    const modalidadAnterior = String(sheet.getRange(fila, 18).getDisplayValue() || '').trim();

    actualizarFila(
      sheet,
      fila,
      datos,
      'REAGENDADA',
      {
        proximaAccion: 'ESPERAR CITA',
        reiniciarSeguimiento: true,
        conservarIdCita: true,
        observacion: observacion
      }
    );

    registrarTrazabilidadReprogramacion_(sheet, fila, idAnterior, datos, modalidadAnterior);

    // La nueva reserva necesita sus propias confirmaciones y seguimientos.
    sheet.getRange(fila, 19, 1, 6).clearContent();

    const notificacion = notificarReprogramacion_(sheet, fila, datos);

    return respuestaJson({
      ok: true,
      accion: 'REPROGRAMADA',
      fila: fila,
      idAnterior: idAnterior,
      idCita: datos.bookingId,
      notificacion: notificacion
    });
  }

  // Si por alguna razón no existe la cita anterior,
  // no perdemos el evento.
  const nuevaFila = agregarFila(
    sheet,
    datos,
    'REAGENDADA',
    'ESPERAR CITA',
    observacion +
      ' No se encontró la fila anterior; se creó registro de respaldo.'
  );

  registrarTrazabilidadReprogramacion_(sheet, nuevaFila, idAnterior, datos, '');

  return respuestaJson({
    ok: true,
    accion: 'REPROGRAMADA_CREADA_RESPALDO',
    fila: nuevaFila,
    idAnterior: idAnterior,
    idCita: datos.bookingId
  });
}

function procesarCancelacion(sheet, datos, payload) {

  let fila = datos.bookingId
    ? buscarFilaPorId(sheet, datos.bookingId)
    : 0;

  // Respaldo si no encontró el UID.
  if (!fila) {
    fila = buscarFilaPorDatosReserva(
      sheet,
      datos,
      payload.startTime || payload.start || ''
    );
  }

  const motivo = String(
    payload.cancellationReason || ''
  ).trim();

  // ERP: el texto indica el origen real de la cancelación.
  const observacion = motivo
    ? 'Cancelada. Motivo: ' + motivo
    : 'Cancelada desde ' + (datos.origen === 'ERP' ? 'el ERP' : 'Cal.com') + '.';

  if (fila) {

    actualizarFila(
      sheet,
      fila,
      datos,
      'CANCELADA',
      {
        proximaAccion: 'CITA CANCELADA',
        reiniciarSeguimiento: false,
        observacion: observacion
      }
    );

    return respuestaJson({
      ok: true,
      accion: 'CANCELADA',
      fila: fila,
      idCita: datos.bookingId
    });
  }

  const nuevaFila = agregarFila(
    sheet,
    datos,
    'CANCELADA',
    'CITA CANCELADA',
    observacion +
      ' No se encontró la fila anterior; se creó registro de respaldo.'
  );

  return respuestaJson({
    ok: true,
    accion: 'CANCELADA_CREADA_RESPALDO',
    fila: nuevaFila,
    idCita: datos.bookingId
  });
}

function obtenerSedeReserva_(payload) {
  // ERP: la sede llega explícita; una reserva del ERP nunca cae por defecto en Villavicencio.
  const sedeERP = sedeReservaERP_(payload);
  if (sedeERP) return sedeERP;

  const ids = [
    payload.eventTypeId,
    payload.event_type_id,
    payload.eventType && payload.eventType.id,
    payload.eventType && payload.eventType.eventTypeId,
    payload.booking && payload.booking.eventTypeId,
    payload.metadata && payload.metadata.eventTypeId
  ];

  for (let i = 0; i < ids.length; i++) {
    const id = String(ids[i] || '').trim();
    if (EVENT_TYPE_SEDES[id]) {
      return EVENT_TYPE_SEDES[id];
    }
    if (id && id === obtenerPropiedad_('EVENT_TYPE_ID_PEREIRA', '')) {
      return 'Pereira';
    }
  }

  const texto = [
    payload.title,
    payload.eventTitle,
    payload.type,
    payload.slug,
    payload.eventType && payload.eventType.title,
    payload.eventType && payload.eventType.slug,
    payload.organizer && payload.organizer.username
  ].filter(Boolean).join(' ').toLowerCase();

  if (texto.indexOf('barranquilla') !== -1) return 'Barranquilla';
  if (texto.indexOf('bogot') !== -1) return 'Bogotá';
  if (texto.indexOf('villavicencio') !== -1) return 'Villavicencio';
  if (texto.indexOf('pereira') !== -1) return 'Pereira';

  return SEDE;
}

function validarConfiguracionMultisedes() {
  const casos = [
    { payload: { eventTypeId: 6601786 }, esperado: 'Villavicencio' },
    { payload: { eventTypeId: 6644131 }, esperado: 'Bogotá' },
    { payload: { eventTypeId: 6644464 }, esperado: 'Barranquilla' },
    { payload: { title: 'Cita Ámbar Couture – Barranquilla' }, esperado: 'Barranquilla' },
    { payload: { eventType: { slug: 'cita-ambar-couture-bogota' } }, esperado: 'Bogotá' }
  ];

  const resultados = casos.map(function(caso) {
    const obtenido = obtenerSedeReserva_(caso.payload);
    if (obtenido !== caso.esperado) {
      throw new Error('Sede incorrecta: esperado ' + caso.esperado + ', obtenido ' + obtenido);
    }
    return obtenido;
  });

  console.log('VALIDACIÓN MULTISEDES OK: ' + resultados.join(' | '));
  return resultados;
}

function extraerDatosReserva(payload) {

  const attendee =
    (payload.attendees && payload.attendees[0]) ||
    payload.attendee ||
    {};

  const nombreCompleto =
    String(attendee.name || '').trim();

  const partes =
    nombreCompleto
      ? nombreCompleto.split(/\s+/)
      : [];

  const nombre =
    partes.length
      ? partes[0]
      : '';

  const apellido =
    partes.length > 1
      ? partes.slice(1).join(' ')
      : '';

  const fuentesRespuestas = [
    payload.responses,
    payload.bookingFieldsResponses,
    payload.userFieldsResponses,

    attendee.bookingSeat &&
    attendee.bookingSeat.data
      ? attendee.bookingSeat.data.responses
      : null,

    payload.metadata
  ];

  let whatsapp = obtenerRespuestaEnFuentes(
    fuentesRespuestas,
    [
      'attendeePhoneNumber',
      'phone',
      'telefono',
      'whatsapp',
      'numero_de_whatsapp'
    ]
  );

  if (!whatsapp && attendee.phoneNumber) {
    whatsapp = attendee.phoneNumber;
  }

  const tipoVestido =
    obtenerRespuestaEnFuentes(
      fuentesRespuestas,
      [
        'Tipo-de-vestido',
        'tipo_vestido',
        'tipo-de-vestido'
      ]
    );

  const fechaEvento =
    obtenerRespuestaEnFuentes(
      fuentesRespuestas,
      [
        'Fecha-evento-cliente',
        'fecha_evento_cliente',
        'fecha_evento',
        'fecha-evento-cliente'
      ]
    );

  const fechaHora =
    formatearFechaHora(
      payload.startTime ||
      payload.start ||
      ''
    );

  const bookingId = String(
    payload.uid ||
    payload.bookingUid ||
    payload.id ||
    ''
  ).trim();

  const seatReferenceUid = String(
    attendee.bookingSeat && attendee.bookingSeat.referenceUid ||
    payload.attendeeSeatId ||
    ''
  ).trim();

  // ERP: las reservas del ERP traen su propio enlace privado de reprogramación.
  // Nunca se construye una URL de Cal.com para ellas.
  const esERP = esReservaERP_(payload);
  const rescheduleUrl = esERP
    ? enlaceReprogramacionERP_(payload)
    : construirEnlaceReprogramacion_(
      bookingId,
      seatReferenceUid,
      attendee.email || ''
    );

  return {

    sede: obtenerSedeReserva_(payload),
        modalidad: obtenerModalidadReserva_(payload, fuentesRespuestas),

    bookingId: bookingId,

    nombre: nombre,
    apellido: apellido,

    whatsapp:
      normalizarTelefono(whatsapp),

    correo:
      String(attendee.email || '')
        .trim()
        .toLowerCase(),

    tipoVestido:
      String(tipoVestido || '').trim(),

    fechaEvento:
      formatearFechaEvento(fechaEvento),

    fechaCita:
      fechaHora.fecha,

    horaCita:
      fechaHora.hora,

    seatReferenceUid: seatReferenceUid,
    rescheduleUrl: rescheduleUrl,

    // ERP: origen de la reserva para trazabilidad y para no tocar Google Calendar.
    origen: esERP ? 'ERP' : 'CAL.COM'
  };
}

function agregarFila(
  sheet,
  datos,
  estado,
  proximaAccion,
  observacion
) {

  const filaDestino = obtenerSiguienteFilaReal_(sheet);
  sheet.getRange(filaDestino, 1, 1, TOTAL_COLUMNAS).setValues([[
    datos.bookingId,
    datos.sede || SEDE,
    datos.nombre,
    datos.apellido,
    datos.whatsapp,
    datos.correo,
    datos.tipoVestido,
    datos.fechaEvento,
    datos.fechaCita,
    datos.horaCita,
    estado,
    'PENDIENTE',
    'PENDIENTE',
    '',
    proximaAccion,
    '',
    observacion || '',
    datos.modalidad || ''
  ]]);

  asignarAdministradoraResponsableSiFalta_(sheet, filaDestino, datos.sede || SEDE);
  guardarEnlaceReprogramacion_(sheet, filaDestino, datos);
  registrarTrazabilidadNuevaCita_(sheet, filaDestino, datos);
  actualizarDashboardMetricas_();
  return filaDestino;
}

function obtenerSiguienteFilaReal_(sheet) {
  const primeraFilaDatos = 2;
  const ultimaFilaHoja = sheet.getMaxRows();
  const ids = sheet
    .getRange(primeraFilaDatos, 1, ultimaFilaHoja - primeraFilaDatos + 1, 1)
    .getDisplayValues();

  for (let i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0] || '').trim()) {
      return primeraFilaDatos + i + 1;
    }
  }
  return primeraFilaDatos;
}

function actualizarFila(
  sheet,
  fila,
  datos,
  estado,
  opciones
) {

  const rango =
    sheet.getRange(
      fila,
      1,
      1,
      TOTAL_COLUMNAS
    );

  const valores =
    rango.getValues()[0];

  // Solo reemplaza datos si Cal.com realmente los envió.
  if (!(opciones && opciones.conservarIdCita)) {
    asignarSiHay(
      valores,
      0,
      datos.bookingId
    );
  }

  valores[1] = datos.sede || valores[1] || SEDE;

  asignarSiHay(
    valores,
    2,
    datos.nombre
  );

  asignarSiHay(
    valores,
    3,
    datos.apellido
  );

  asignarSiHay(
    valores,
    4,
    datos.whatsapp
  );

  asignarSiHay(
    valores,
    5,
    datos.correo
  );

  asignarSiHay(
    valores,
    6,
    datos.tipoVestido
  );

  asignarSiHay(
    valores,
    7,
    datos.fechaEvento
  );

  asignarSiHay(
    valores,
    8,
    datos.fechaCita
  );

  asignarSiHay(
    valores,
    9,
    datos.horaCita
  );

  asignarSiHay(
    valores,
    17,
    datos.modalidad
  );

  valores[10] = estado;

  if (
    opciones &&
    opciones.reiniciarSeguimiento
  ) {

    valores[11] = 'PENDIENTE';
    valores[12] = 'PENDIENTE';
  }

  if (
    opciones &&
    opciones.proximaAccion
  ) {

    valores[14] =
      opciones.proximaAccion;
  }

  if (
    opciones &&
    opciones.observacion
  ) {

    valores[16] =
      anexarObservacion(
        valores[16],
        opciones.observacion
      );
  }

  rango.setValues([valores]);
  guardarEnlaceReprogramacion_(sheet, fila, datos);
  actualizarRevisionFechasCita_(sheet, fila);
  actualizarDashboardMetricas_();
}

// La hoja histórica tenía A:Q ocupadas por el flujo original y R disponible.
// Mantiene los datos existentes intactos y deja lista la columna para reservas
// nuevas y reprogramadas.
function asegurarColumnaModalidad_(sheet) {
  const columnaModalidad = 18; // R
  if (sheet.getMaxColumns() < columnaModalidad) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), columnaModalidad - sheet.getMaxColumns());
  }

  const encabezado = sheet.getRange(1, columnaModalidad);
  if (String(encabezado.getDisplayValue() || '').trim() !== 'MODALIDAD DE ATENCIÓN') {
    encabezado
      .setValue('MODALIDAD DE ATENCIÓN')
      .setFontWeight('bold')
      .setBackground('#5b1235')
      .setFontColor('#ffffff')
      .setWrap(true);
    sheet.setColumnWidth(columnaModalidad, 210);
  }
}

// Ejecutar una vez desde Apps Script para crear el encabezado antes de la
// siguiente cita; no envía mensajes ni modifica registros existentes.
function prepararColumnaModalidadCitas() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('No se encontró la hoja ' + SHEET_NAME + '.');
  asegurarColumnaModalidad_(sheet);
  return 'Columna MODALIDAD DE ATENCIÓN lista en CITAS.';
}

/* ---------------- FECHAS Y TRAZABILIDAD DE CITAS/VITRINA ---------------- */

const TRAZABILIDAD_CITAS_HEADERS_ = ['FECHA AGENDAMIENTO', 'REVISIÓN FECHAS', 'HISTORIAL MODALIDAD'];
const TRAZABILIDAD_VITRINA_HEADERS_ = [
  'ORIGEN', 'MODALIDAD', 'ID CITA ORIGEN', 'ID CITA NUEVA',
  'RECUPERADA', 'RESULTADO RECUPERACIÓN', 'REVISIÓN FECHAS'
];

function encabezadosTrazabilidad_(sheet) {
  const total = sheet.getLastColumn();
  const valores = total ? sheet.getRange(1, 1, 1, total).getDisplayValues()[0] : [];
  const mapa = {};
  valores.forEach(function(valor, indice) {
    const clave = String(valor || '').trim().toUpperCase();
    if (clave && !mapa[clave]) mapa[clave] = indice + 1;
  });
  return mapa;
}

function asegurarEncabezadosTrazabilidad_(sheet, headers) {
  let mapa = encabezadosTrazabilidad_(sheet);
  headers.forEach(function(header) {
    if (mapa[header]) return;
    const columna = sheet.getLastColumn() + 1;
    sheet.getRange(1, columna)
      .setValue(header)
      .setFontWeight('bold')
      .setBackground('#5b1235')
      .setFontColor('#ffffff')
      .setWrap(true);
    sheet.setColumnWidth(columna, header === 'HISTORIAL MODALIDAD' ? 230 : 165);
    mapa[header] = columna;
  });
  return mapa;
}

// Idempotente: solo añade al final los campos faltantes, sin tocar datos ni filtros existentes.
function asegurarTrazabilidadFechasCitasVitrina_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const citas = ss.getSheetByName('CITAS');
  const vitrina = ss.getSheetByName('VITRINA');
  if (!citas || !vitrina) throw new Error('Faltan CITAS o VITRINA para la trazabilidad.');
  return {
    CITAS: asegurarEncabezadosTrazabilidad_(citas, TRAZABILIDAD_CITAS_HEADERS_),
    VITRINA: asegurarEncabezadosTrazabilidad_(vitrina, TRAZABILIDAD_VITRINA_HEADERS_)
  };
}

// Función pública para preparar la estructura sin modificar registros existentes.
function prepararFechasYTrazabilidadCitasVitrina() {
  return asegurarTrazabilidadFechasCitasVitrina_();
}

function fechaTrazabilidadValida_(valor) {
  if (Object.prototype.toString.call(valor) === '[object Date]') return !isNaN(valor.getTime());
  const partes = String(valor || '').trim().match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (!partes) return false;
  const fecha = new Date(Number(partes[3]), Number(partes[2]) - 1, Number(partes[1]));
  return fecha.getFullYear() === Number(partes[3]) &&
    fecha.getMonth() === Number(partes[2]) - 1 &&
    fecha.getDate() === Number(partes[1]);
}

function actualizarRevisionFechasCita_(sheet, fila) {
  const mapa = encabezadosTrazabilidad_(sheet);
  const revision = mapa['REVISIÓN FECHAS'];
  if (!revision) return;
  const fechaCita = mapa['FECHA CITA'];
  const fechaEvento = mapa['FECHA EVENTO'];
  const errores = [];
  if (fechaCita && !fechaTrazabilidadValida_(sheet.getRange(fila, fechaCita).getValue())) errores.push('FECHA CITA');
  if (fechaEvento) {
    const valorEvento = sheet.getRange(fila, fechaEvento).getValue();
    if (String(valorEvento || '').trim() && !fechaTrazabilidadValida_(valorEvento)) errores.push('FECHA EVENTO');
  }
  sheet.getRange(fila, revision).setValue(errores.length ? 'REVISAR: ' + errores.join(', ') : '');
}

function registrarTrazabilidadNuevaCita_(sheet, fila, datos) {
  const mapa = encabezadosTrazabilidad_(sheet);
  const fechaAgendamiento = mapa['FECHA AGENDAMIENTO'];
  const origen = mapa['ORIGEN'];
  const tipo = mapa['TIPO CITA'];
  if (fechaAgendamiento && !sheet.getRange(fila, fechaAgendamiento).getValue()) {
    sheet.getRange(fila, fechaAgendamiento).setValue(new Date());
  }
  // ERP: origen real de la reserva ('ERP' o 'CAL.COM').
  if (origen && !sheet.getRange(fila, origen).getDisplayValue()) sheet.getRange(fila, origen).setValue(datos && datos.origen === 'ERP' ? 'ERP' : 'CAL.COM');
  if (tipo && !sheet.getRange(fila, tipo).getDisplayValue()) sheet.getRange(fila, tipo).setValue('PRIMERA');
  actualizarRevisionFechasCita_(sheet, fila);
}

function registrarTrazabilidadReprogramacion_(sheet, fila, idAnterior, datos, modalidadAnterior) {
  const mapa = encabezadosTrazabilidad_(sheet);
  const idPrincipal = String(sheet.getRange(fila, 1).getDisplayValue() || '').trim();
  const origen = mapa['ORIGEN'];
  const idOrigen = mapa['ID CITA ORIGEN'];
  const idNueva = mapa['ID CITA NUEVA'];
  const tipo = mapa['TIPO CITA'];
  const historialModalidad = mapa['HISTORIAL MODALIDAD'];
  // ERP: origen real de la reprogramación.
  if (origen) sheet.getRange(fila, origen).setValue(datos && datos.origen === 'ERP' ? 'REPROGRAMACIÓN ERP' : 'REPROGRAMACIÓN CAL.COM');
  if (idOrigen && !sheet.getRange(fila, idOrigen).getDisplayValue()) sheet.getRange(fila, idOrigen).setValue(idAnterior || idPrincipal);
  if (idNueva && datos.bookingId) sheet.getRange(fila, idNueva).setValue(datos.bookingId);
  if (tipo) sheet.getRange(fila, tipo).setValue('REPROGRAMADA');
  if (historialModalidad && datos.modalidad && modalidadAnterior && modalidadAnterior !== datos.modalidad) {
    const previo = String(sheet.getRange(fila, historialModalidad).getDisplayValue() || '').trim();
    const cambio = modalidadAnterior + ' → ' + datos.modalidad;
    sheet.getRange(fila, historialModalidad).setValue(previo ? previo + ' | ' + cambio : cambio);
  }
  actualizarRevisionFechasCita_(sheet, fila);
}

function buscarFilaPorId(
  sheet,
  bookingId
) {

  const id =
    String(bookingId || '').trim();

  if (
    !id ||
    sheet.getLastRow() < 2
  ) {
    return 0;
  }

  const valores =
    sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        1
      )
      .getDisplayValues();

  for (
    let i = valores.length - 1;
    i >= 0;
    i--
  ) {

    if (
      String(valores[i][0]).trim()
      === id
    ) {

      return i + 2;
    }
  }

  // Una reprogramación conserva el ID principal; el UID vigente de Cal.com
  // queda trazado en ID CITA NUEVA para reconocer cancelaciones posteriores.
  const columnaIdNueva = encabezadosTrazabilidad_(sheet)['ID CITA NUEVA'];
  if (columnaIdNueva) {
    const idsNuevos = sheet.getRange(2, columnaIdNueva, sheet.getLastRow() - 1, 1).getDisplayValues();
    for (let i = idsNuevos.length - 1; i >= 0; i--) {
      if (String(idsNuevos[i][0] || '').trim() === id) return i + 2;
    }
  }

  return 0;
}

function buscarFilaPorDatosReserva(
  sheet,
  datos,
  inicioReferencia
) {

  if (
    sheet.getLastRow() < 2
  ) {
    return 0;
  }

  const referencia =
    formatearFechaHora(
      inicioReferencia
    );

  const valores =
    sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        TOTAL_COLUMNAS
      )
      .getDisplayValues();

  for (
    let i = valores.length - 1;
    i >= 0;
    i--
  ) {

    const fila = valores[i];

    const correoFila =
      String(fila[5] || '')
        .trim()
        .toLowerCase();

    const telefonoFila =
      normalizarTelefono(
        fila[4]
      );

    const fechaFila =
      String(fila[8] || '').trim();

    const horaFila =
      String(fila[9] || '').trim();

    const coincidePersona =
      (
        datos.correo &&
        correoFila === datos.correo
      ) ||
      (
        datos.whatsapp &&
        telefonoFila === datos.whatsapp
      );

    if (!coincidePersona) {
      continue;
    }

    if (
      referencia.fecha &&
      referencia.hora
    ) {

      if (
        fechaFila === referencia.fecha &&
        horaFila === referencia.hora
      ) {

        return i + 2;
      }

      continue;
    }

    return i + 2;
  }

  return 0;
}

function obtenerMotivoReprogramacion(
  payload
) {

  const fuentes = [
    payload.responses,
    payload.bookingFieldsResponses,
    payload.userFieldsResponses
  ];

  return String(
    obtenerRespuestaEnFuentes(
      fuentes,
      [
        'rescheduleReason',
        'reason_for_reschedule'
      ]
    ) || ''
  ).trim();
}

function obtenerRespuestaEnFuentes(
  fuentes,
  claves
) {

  for (
    let i = 0;
    i < fuentes.length;
    i++
  ) {

    const valor =
      obtenerRespuesta(
        fuentes[i],
        claves
      );

    if (
      valor !== '' &&
      valor !== null &&
      valor !== undefined
    ) {

      return valor;
    }
  }

  return '';
}

function obtenerRespuesta(
  objeto,
  claves
) {

  if (!objeto) {
    return '';
  }

  for (
    let i = 0;
    i < claves.length;
    i++
  ) {

    const clave =
      claves[i];

    if (
      objeto[clave] !== undefined &&
      objeto[clave] !== null
    ) {

      const valor =
        objeto[clave];

      if (typeof valor === 'object') {

  if (
    valor.value !== undefined &&
    valor.value !== null
  ) {
    return valor.value;
  }

  return '';
}

return valor;
    }
  }

  // Cal.com puede entregar los campos personalizados con guiones, espacios,
  // mayúsculas o tildes distintas a las del identificador original. Busca por
  // la versión normalizada para no perder respuestas como "Modalidad de
  // atención" o "modalidad-de-atencion".
  const clavesNormalizadas = claves.map(function(clave) {
    return normalizarClaveRespuesta_(clave);
  });
  const clavesObjeto = Object.keys(objeto);
  for (let j = 0; j < clavesObjeto.length; j++) {
    const claveObjeto = clavesObjeto[j];
    if (clavesNormalizadas.indexOf(normalizarClaveRespuesta_(claveObjeto)) === -1) {
      continue;
    }
    const respuesta = objeto[claveObjeto];
    if (respuesta && typeof respuesta === 'object') {
      if (respuesta.value !== undefined && respuesta.value !== null) return respuesta.value;
      if (respuesta.label !== undefined && respuesta.label !== null) return respuesta.label;
      continue;
    }
    if (respuesta !== undefined && respuesta !== null) return respuesta;
  }

  return '';
}

function normalizarClaveRespuesta_(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function formatearFechaEvento(
  valor
) {

  if (
    valor === undefined ||
    valor === null ||
    valor === ''
  ) {

    return '';
  }

  const texto =
    String(valor).trim();

  // Ejemplo: 10092026. Solo se formatea si representa una fecha real;
  // un dato inválido se conserva tal cual para revisión manual.
  if (/^\d{8}$/.test(texto)) {
    const candidata = (
      texto.substring(0, 2) +
      '/' +
      texto.substring(2, 4) +
      '/' +
      texto.substring(4, 8)
    );
    return fechaTrazabilidadValida_(candidata) ? candidata : texto;
  }

  // Ejemplo: 2026-09-10
  const iso =
    texto.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

  if (iso) {

    const candidata = (
      iso[3] +
      '/' +
      iso[2] +
      '/' +
      iso[1]
    );
    return fechaTrazabilidadValida_(candidata) ? candidata : texto;
  }

  return texto;
}

function formatearFechaHora(
  inicio
) {

  if (!inicio) {

    return {
      fecha: '',
      hora: ''
    };
  }

  const fecha =
    new Date(inicio);

  if (
    isNaN(fecha.getTime())
  ) {

    return {
      fecha: '',
      hora: ''
    };
  }

  return {

    fecha:
      Utilities.formatDate(
        fecha,
        TIMEZONE,
        'dd/MM/yyyy'
      ),

    hora:
      Utilities.formatDate(
        fecha,
        TIMEZONE,
        'hh:mm a'
      )
  };
}

function normalizarTelefono(
  valor
) {

  return String(
    valor || ''
  ).replace(
    /\D/g,
    ''
  );
}

function asignarSiHay(
  arreglo,
  indice,
  valor
) {

  if (
    valor !== undefined &&
    valor !== null &&
    String(valor).trim() !== ''
  ) {

    arreglo[indice] =
      valor;
  }
}

function anexarObservacion(
  actual,
  nueva
) {

  const a =
    String(actual || '').trim();

  const n =
    String(nueva || '').trim();

  if (!n) {
    return a;
  }

  if (!a) {
    return n;
  }

  if (
    a.indexOf(n) !== -1
  ) {

    return a;
  }

  return (
    a +
    ' | ' +
    n
  );
}

function respuestaJson(
  objeto
) {

  return ContentService
    .createTextOutput(
      JSON.stringify(objeto)
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );
}

/*
 * CONFIGURA AUTOMÁTICAMENTE EL WEBHOOK DE CAL.COM
 * La API key permanece en Propiedades del script.
 */
function configurarWebhookCalAutomatico() {
  return configurarWebhookCalParaEvento_(EVENT_TYPE_ID, 'CAL_API_KEY');
}

function configurarWebhookCalBarranquilla() {
  return configurarWebhookCalParaEvento_(6644464, 'CAL_API_KEY_BARRANQUILLA');
}

function configurarWebhookCalBogota() {
  return configurarWebhookCalParaEvento_(6644131, 'CAL_API_KEY_BOGOTA');
}

// Configuración aislada de Pereira. No modifica otras sedes ni disponibilidad.
function configurarPereiraCal() {
  const propiedadClave = 'CAL_API_KEY_PEREIRA';
  const apiKey = obtenerPropiedad_(propiedadClave, '');
  if (!apiKey) throw new Error('Falta ' + propiedadClave + ' en Propiedades del script.');

  const headers = {
    Authorization: 'Bearer ' + apiKey,
    'Content-Type': 'application/json',
    // La lista/creación de tipos de evento exige la versión actual de API v2.
    // Se deja aislada para no cambiar las integraciones vigentes de otras sedes.
    'cal-api-version': '2026-06-12'
  };
  const llamar = function(metodo, ruta, cuerpo) {
    const respuesta = UrlFetchApp.fetch('https://api.cal.com/v2' + ruta, {
      method: metodo,
      headers: headers,
      payload: cuerpo ? JSON.stringify(cuerpo) : undefined,
      muteHttpExceptions: true
    });
    const codigo = respuesta.getResponseCode();
    const texto = respuesta.getContentText();
    if (codigo < 200 || codigo >= 300) throw new Error('Cal.com ' + metodo + ' ' + ruta + ' respondió HTTP ' + codigo + '.');
    return texto ? JSON.parse(texto) : {};
  };

  const identidad = llamar('get', '/me').data || {};
  const usuario = String(identidad.username || identidad.userName || '').trim();
  if (usuario !== 'ambarcouturepereira-704wcp') {
    throw new Error('La clave de Pereira no corresponde a la cuenta esperada.');
  }

  const lista = llamar('get', '/event-types?username=' + encodeURIComponent(usuario));
  const eventos = lista.data || [];
  const titulo = 'Cita Ámbar Couture – Pereira';
  let evento = eventos.find(function(item) {
    return String(item.title || '').trim() === titulo && Number(item.lengthInMinutes || item.length || 0) === 60;
  });

  if (!evento) {
    const creado = llamar('post', '/event-types', {
      title: titulo,
      slug: 'cita-ambar-couture-pereira',
      lengthInMinutes: 60,
      timeZone: 'America/Bogota',
      hidden: true
    });
    evento = creado.data || {};
  }

  const eventTypeId = String(evento.id || evento.eventTypeId || '').trim();
  const slug = String(evento.slug || 'cita-ambar-couture-pereira').trim();
  if (!eventTypeId) throw new Error('Cal.com no devolvió el ID del evento de Pereira.');
  const enlace = 'https://cal.com/' + usuario + '/' + slug;

  asegurarWebhookCalPereira_(eventTypeId, apiKey, headers);
  PropertiesService.getScriptProperties().setProperties({
    EVENT_TYPE_ID_PEREIRA: eventTypeId,
    CAL_LINK_PEREIRA: enlace
  }, false);
  actualizarSedesActivasPereira_();

  console.log('PEREIRA CAL CONFIGURADA: eventTypeId=' + eventTypeId);
  return { eventTypeId: eventTypeId, enlace: enlace, webhooks: true };
}

function asegurarWebhookCalPereira_(eventTypeId, apiKey, headers) {
  const url = 'https://api.cal.com/v2/event-types/' + encodeURIComponent(eventTypeId) + '/webhooks';
  const callback = ScriptApp.getService().getUrl();
  if (!callback) throw new Error('No se encontró la URL /exec vigente del CRM.');
  const normalizar = function(valor) { return String(valor || '').replace(/\/+$/, ''); };
  const listar = UrlFetchApp.fetch(url, { method: 'get', headers: headers, muteHttpExceptions: true });
  if (listar.getResponseCode() !== 200) throw new Error('No se pudieron consultar webhooks de Pereira.');
  const existentes = (JSON.parse(listar.getContentText()).data || []);
  let webhook = existentes.find(function(item) { return normalizar(item.subscriberUrl) === normalizar(callback); });
  if (!webhook) {
    const candidatos = existentes.filter(function(item) {
      return item.active && String(item.subscriberUrl || '').indexOf('script.google.com/macros/s/') !== -1;
    });
    if (candidatos.length === 1) webhook = candidatos[0];
  }
  const configuracion = {
    active: true,
    subscriberUrl: webhook ? webhook.subscriberUrl : callback,
    triggers: ['BOOKING_CREATED', 'BOOKING_RESCHEDULED', 'BOOKING_CANCELLED'],
    version: webhook && webhook.version ? webhook.version : '2021-10-20'
  };
  if (webhook && webhook.payloadTemplate) configuracion.payloadTemplate = webhook.payloadTemplate;
  if (webhook && webhook.secret) configuracion.secret = webhook.secret;
  const respuesta = UrlFetchApp.fetch(webhook ? url + '/' + encodeURIComponent(webhook.id) : url, {
    method: webhook ? 'patch' : 'post',
    headers: headers,
    payload: JSON.stringify(configuracion),
    muteHttpExceptions: true
  });
  if (respuesta.getResponseCode() < 200 || respuesta.getResponseCode() >= 300) {
    throw new Error('No se pudo guardar el webhook de Pereira.');
  }
}

function actualizarSedesActivasPereira_() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CONFIG_SHEET);
  if (!sheet || sheet.getLastRow() < 2) throw new Error('Falta CONFIG_AUTOMATIZACION para SEDES_ACTIVAS.');
  const datos = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getDisplayValues();
  for (let i = 0; i < datos.length; i++) {
    if (String(datos[i][0] || '').trim() !== 'SEDES_ACTIVAS') continue;
    const actual = String(datos[i][1] || '').trim();
    const separador = actual.indexOf('|') !== -1 ? '|' : ',';
    const sedes = actual.split(/[|,]/).map(function(valor) { return String(valor).trim(); }).filter(Boolean);
    if (!sedes.some(function(valor) { return valor.toLowerCase() === 'pereira'; })) sedes.push('Pereira');
    sheet.getRange(i + 2, 2).setValue(sedes.join(separador));
    return;
  }
  throw new Error('No existe la configuración SEDES_ACTIVAS.');
}

function configurarWebhookCalParaEvento_(eventTypeId, apiKeyProperty) {

  const apiKey =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        apiKeyProperty
      );

  if (!apiKey) {

    throw new Error(
      'No existe ' + apiKeyProperty + ' en Propiedades del script.'
    );
  }

  const webAppUrl =
    ScriptApp
      .getService()
      .getUrl();

  if (!webAppUrl) {

    throw new Error(
      'No se encontró la URL de la aplicación web.'
    );
  }

  const baseUrl =
    'https://api.cal.com/v2/event-types/' +
    eventTypeId +
    '/webhooks';

  const headers = {

    'Authorization':
      'Bearer ' + apiKey,

    'Content-Type':
      'application/json'
  };

  const respuestaLista =
    UrlFetchApp.fetch(
      baseUrl,
      {
        method: 'get',
        headers: headers,
        muteHttpExceptions: true
      }
    );

  const codigoLista =
    respuestaLista
      .getResponseCode();

  if (
    codigoLista !== 200
  ) {

    throw new Error(
      'Cal.com respondió ' +
      codigoLista +
      ': ' +
      respuestaLista
        .getContentText()
    );
  }

  const datos =
    JSON.parse(
      respuestaLista
        .getContentText()
    );

  const webhooks =
    datos.data || [];

  const normalizarUrl =
    function(url) {

      return String(
        url || ''
      ).replace(
        /\/+$/,
        ''
      );
    };

  let webhook =
    webhooks.find(
      function(w) {

        return (
          normalizarUrl(
            w.subscriberUrl
          ) ===
          normalizarUrl(
            webAppUrl
          )
        );
      }
    );

  if (!webhook) {

    const candidatos =
      webhooks.filter(
        function(w) {

          return (
            w.active &&
            String(
              w.subscriberUrl || ''
            ).indexOf(
              'script.google.com/macros/s/'
            ) !== -1
          );
        }
      );

    if (
      candidatos.length === 1
    ) {

      webhook =
        candidatos[0];
    }
  }

  if (!webhook) {

    throw new Error(
      'No pude identificar con seguridad el webhook correcto. ' +
      'No se modificó nada.'
    );
  }

  const configuracion = {

    active: true,

    subscriberUrl:
      webhook.subscriberUrl,

    triggers: [
      'BOOKING_CREATED',
      'BOOKING_RESCHEDULED',
      'BOOKING_CANCELLED'
    ],

    version:
      webhook.version ||
      '2021-10-20'
  };

  if (
    webhook.payloadTemplate
  ) {

    configuracion.payloadTemplate =
      webhook.payloadTemplate;
  }

  if (
    webhook.secret
  ) {

    configuracion.secret =
      webhook.secret;
  }

  const respuesta =
    UrlFetchApp.fetch(
      baseUrl +
      '/' +
      webhook.id,
      {
        method: 'patch',
        headers: headers,
        payload:
          JSON.stringify(
            configuracion
          ),
        muteHttpExceptions:
          true
      }
    );

  const codigo =
    respuesta
      .getResponseCode();

  const texto =
    respuesta
      .getContentText();

  if (
    codigo !== 200
  ) {

    throw new Error(
      'No se pudo actualizar el webhook. HTTP ' +
      codigo +
      ': ' +
      texto
    );
  }

  const resultado =
    JSON.parse(texto);

  console.log(
    'WEBHOOK CAL.COM CONFIGURADO CORRECTAMENTE'
  );

  console.log(
    'Webhook ID: ' +
    webhook.id
  );

  console.log(
    'Activadores: ' +
    resultado.data.triggers.join(', ')
  );
}

/* ============================================================================
 * META WHATSAPP CLOUD API + POST-CITA VILLAVICENCIO
 * ============================================================================ */

const POST_CITA_SHEET = 'POST_CITA';
const CONFIG_SHEET = 'CONFIG_AUTOMATIZACION';
const WEBHOOK_LOG_SHEET = 'WEBHOOK_LOG';
const META_GRAPH_VERSION_FALLBACK = 'v23.0';
const CAL_API_VERSION_BOOKING = '2026-02-25';
const CAL_API_VERSION_EVENT_TYPE = '2026-02-25';

const POST_CITA_HEADERS = [
  'ID CITA',
  'SEDE',
  'NOMBRE',
  'WHATSAPP',
  'CORREO',
  'FIN CITA',
  'ESTADO FLUJO',
  'WHATSAPP ASISTENCIA ENVIADO',
  'EMAIL ASISTENCIA ENVIADO',
  'RESPUESTA ASISTENCIA',
  'FECHA RESPUESTA ASISTENCIA',
  'PREGUNTA ALQUILER ENVIADA',
  'RESULTADO ALQUILER',
  'FECHA RESPUESTA ALQUILER',
  'MOTIVO NO ALQUILER',
  'FECHA MOTIVO',
  'LINK REAGENDAMIENTO ENVIADO',
  'ESTADO WHATSAPP',
  'ESTADO EMAIL',
  'OBSERVACIONES',
  'ACCIÓN ESPERADA',
  'ÚLTIMO BOTÓN ID',
  'CANAL RESPUESTA',
  'ID MENSAJE WHATSAPP',
  'ID MENSAJE EMAIL',
  'ERROR TÉCNICO'
];

/* --------------------------- CONFIGURACIÓN --------------------------- */

function obtenerPropiedad_(clave, valorPorDefecto) {
  const valor = PropertiesService
    .getScriptProperties()
    .getProperty(clave);

  if (valor === null || valor === undefined || String(valor).trim() === '') {
    return valorPorDefecto === undefined ? '' : valorPorDefecto;
  }

  return String(valor).trim();
}

function obtenerConfig_(clave, valorPorDefecto) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG_SHEET);

    if (!sheet || sheet.getLastRow() < 2) {
      return valorPorDefecto;
    }

    const datos = sheet
      .getRange(2, 1, sheet.getLastRow() - 1, 2)
      .getDisplayValues();

    for (let i = 0; i < datos.length; i++) {
      if (String(datos[i][0] || '').trim() === clave) {
        const valor = String(datos[i][1] || '').trim();
        return valor || valorPorDefecto;
      }
    }
  } catch (error) {
    console.warn('No se pudo leer CONFIG_AUTOMATIZACION: ' + error.message);
  }

  return valorPorDefecto;
}

/* ---------------------- CORREOS INTERNOS POR SEDE ---------------------- */

// La configuración vive en CONFIG_AUTOMATIZACION. Cada sede acepta varios
// destinatarios separados por coma, punto y coma o barra vertical.
function claveSedeCorreoInterno_(sede) {
  return String(sede || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const ADMINISTRADORAS_SEDES_ = ['Bogotá', 'Barranquilla', 'Villavicencio', 'Pereira'];
const ADMINISTRADORA_RESPONSABLE_HEADER_ = 'ADMINISTRADORA RESPONSABLE';

function claveAdministradoraResponsable_(sede) {
  return 'ADMINISTRADORA_' + claveSedeCorreoInterno_(sede);
}

function administradoraResponsablePorSede_(sede) {
  return obtenerConfig_(claveAdministradoraResponsable_(sede), '');
}

function columnaAdministradoraResponsable_(sheet) {
  const encabezados = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  for (let i = 0; i < encabezados.length; i++) {
    const encabezado = normalizarDashboard_(encabezados[i]);
    if (encabezado === 'ADMINISTRADORA RESPONSABLE' || encabezado === 'ASESORA') return i + 1;
  }
  return 0;
}

function asignarAdministradoraResponsableSiFalta_(sheet, fila, sede) {
  const columna = columnaAdministradoraResponsable_(sheet);
  const administradora = administradoraResponsablePorSede_(sede);
  if (!columna || !administradora) return false;
  const actual = String(sheet.getRange(fila, columna).getDisplayValue() || '').trim();
  if (actual) return false;
  sheet.getRange(fila, columna).setValue(administradora);
  return true;
}

function instalarAdministradorasResponsablesPorSede() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const config = ss.getSheetByName(CONFIG_SHEET);
  if (!config) throw new Error('Falta ' + CONFIG_SHEET + '.');
  const existentes = config.getLastRow() > 1
    ? config.getRange(2, 1, config.getLastRow() - 1, 1).getDisplayValues().map(function(fila) { return String(fila[0] || '').trim(); })
    : [];
  const nuevas = ADMINISTRADORAS_SEDES_.map(claveAdministradoraResponsable_).filter(function(clave) {
    return existentes.indexOf(clave) === -1;
  });
  if (nuevas.length) config.getRange(config.getLastRow() + 1, 1, nuevas.length, 3).setValues(nuevas.map(function(clave) {
    return [clave, '', 'PENDIENTE'];
  }));

  ['CITAS', 'VITRINA'].forEach(function(nombre) {
    const sheet = ss.getSheetByName(nombre);
    if (!sheet) return;
    const columna = columnaAdministradoraResponsable_(sheet);
    if (columna) sheet.getRange(1, columna).setValue(ADMINISTRADORA_RESPONSABLE_HEADER_);
    else sheet.getRange(1, sheet.getLastColumn() + 1).setValue(ADMINISTRADORA_RESPONSABLE_HEADER_);
  });
  return { creadas: nuevas, encabezado: ADMINISTRADORA_RESPONSABLE_HEADER_ };
}

function sincronizarAdministradorasPendientes() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const resultado = { registros: 0, seguimientos: 0 };
  const responsablesPorOportunidad = {};
  ['CITAS', 'VITRINA'].forEach(function(nombre) {
    const sheet = ss.getSheetByName(nombre);
    if (!sheet || sheet.getLastRow() < 2) return;
    const info = obtenerFilasDashboard_(sheet);
    const idHeader = nombre === 'CITAS' ? 'ID CITA' : 'ID VITRINA';
    const colResponsable = columnaAdministradoraResponsable_(sheet);
    if (!colResponsable) return;
    info.filas.forEach(function(fila, indice) {
      const id = String(valorDashboard_(fila, info.indice, idHeader) || '').trim();
      const sede = String(valorDashboard_(fila, info.indice, 'SEDE') || '').trim();
      const resultadoComercial = normalizarDashboard_(valorDashboard_(fila, info.indice, nombre === 'CITAS' ? 'RESULTADO COMERCIAL' : 'RESULTADO FINAL')) ||
        (nombre === 'VITRINA' ? normalizarDashboard_(valorDashboard_(fila, info.indice, 'RESULTADO VISITA')) : '');
      if (!id || resultadoComercial === 'ALQUILO' || resultadoComercial === 'NO ALQUILO') return;
      const administradora = administradoraResponsablePorSede_(sede);
      if (!administradora) return;
      if (String(fila[colResponsable - 1] || '').trim() !== administradora) {
        sheet.getRange(indice + 2, colResponsable).setValue(administradora);
        resultado.registros++;
      }
      responsablesPorOportunidad[nombre + ':' + id] = administradora;
    });
  });
  const historial = ss.getSheetByName(SEGUIMIENTO_COMERCIAL_SHEET_);
  if (!historial || historial.getLastRow() < 2) return resultado;
  const infoHistorial = obtenerFilasDashboard_(historial);
  const colOportunidad = infoHistorial.indice['ID OPORTUNIDAD'];
  const colEstado = infoHistorial.indice['ESTADO'];
  const colRealizado = infoHistorial.indice['REALIZADO'];
  const colResponsable = infoHistorial.indice['RESPONSABLE'];
  if (colOportunidad === undefined || colEstado === undefined || colRealizado === undefined || colResponsable === undefined) return resultado;
  infoHistorial.filas.forEach(function(fila, indice) {
    const administradora = responsablesPorOportunidad[String(fila[colOportunidad] || '').trim()];
    if (!administradora || normalizarDashboard_(fila[colRealizado]) === 'SI' || normalizarDashboard_(fila[colEstado]) !== 'PENDIENTE') return;
    if (String(fila[colResponsable] || '').trim() !== administradora) {
      historial.getRange(indice + 2, colResponsable + 1).setValue(administradora);
      resultado.seguimientos++;
    }
  });
  return resultado;
}

function destinatariosCorreoInterno_(sede) {
  const valor = obtenerConfig_('EMAIL_INTERNO_' + claveSedeCorreoInterno_(sede), '');
  const vistos = {};
  return String(valor || '').split(/[;,|\n]+/).map(function(correo) {
    return String(correo || '').trim().toLowerCase();
  }).filter(function(correo) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || vistos[correo]) return false;
    vistos[correo] = true;
    return true;
  });
}

function escaparHtmlCorreoInterno_(valor) {
  return String(valor === undefined || valor === null ? '' : valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function detalleCitaCorreoInterno_(datos) {
  const sede = String(datos.sede || SEDE || '').trim();
  const claveSede = claveSedeCorreoInterno_(sede);
  const direccion = obtenerConfig_('DIRECCION_' + claveSede, '');
  // ERP: sin enlace propio de la cita, se muestra la agenda del ERP de la sede (antes CAL_LINK_<SEDE>).
  const enlace = String(datos.enlace || datos.rescheduleUrl || enlaceAgendaERP_(sede) || '').trim();
  const filas = [
    ['Cliente', [datos.nombre, datos.apellido].filter(Boolean).join(' ').trim()],
    ['Sede', sede],
    ['Fecha y hora', [datos.fechaCita, datos.horaCita].filter(Boolean).join(' ')],
    ['Modalidad', datos.modalidad],
    ['WhatsApp', datos.whatsapp]
  ];
  if (direccion) filas.push(['Dirección', direccion]);
  if (enlace) filas.push(['Enlace', enlace]);
  return '<table>' + filas.filter(function(fila) { return String(fila[1] || '').trim(); }).map(function(fila) {
    return '<tr><td><b>' + escaparHtmlCorreoInterno_(fila[0]) + '</b></td><td>' + escaparHtmlCorreoInterno_(fila[1]) + '</td></tr>';
  }).join('') + '</table>';
}

function enviarCorreoInternoPorSede_(sede, asunto, html, claveIdempotencia, soloSimular) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(claveIdempotencia)) return {ok: true, omitido: 'YA_ENVIADO'};
  const destinatarios = destinatariosCorreoInterno_(sede);
  if (!destinatarios.length) return {ok: false, omitido: 'SIN_DESTINATARIOS_CONFIGURADOS'};
  if (soloSimular) return {ok: true, simulado: true, destinatarios: destinatarios.length};
  try {
    MailApp.sendEmail({
      to: destinatarios.join(','),
      subject: asunto,
      body: String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
      htmlBody: html,
      name: 'Ámbar Couture'
    });
    props.setProperty(claveIdempotencia, Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss'));
    return {ok: true, enviados: destinatarios.length};
  } catch (error) {
    console.warn('Correo interno no enviado: ' + error.message);
    return {ok: false, error: error.message};
  }
}

function notificarNuevaCitaInternaSiPendiente_(datos, soloSimular) {
  const idCita = String(datos && datos.bookingId || '').trim();
  if (!idCita) return {ok: false, omitido: 'SIN_ID_CITA'};
  const sede = String(datos.sede || SEDE || '').trim();
  return enviarCorreoInternoPorSede_(
    sede,
    'Ámbar Couture | Nueva cita | ' + sede,
    '<p>Se registró una nueva cita.</p>' + detalleCitaCorreoInterno_(datos),
    'EMAIL_INTERNO_NUEVA_' + idCita,
    Boolean(soloSimular)
  );
}

function notificarRecordatorioInternoSiPendiente_(datos, horas, soloSimular) {
  const idCita = String(datos && datos.bookingId || '').trim();
  if (!idCita) return {ok: false, omitido: 'SIN_ID_CITA'};
  const sede = String(datos.sede || SEDE || '').trim();
  return enviarCorreoInternoPorSede_(
    sede,
    'Ámbar Couture | Cita en ' + horas + ' h | ' + sede,
    '<p>Recordatorio interno: la cita inicia aproximadamente en ' + escaparHtmlCorreoInterno_(horas) + ' horas.</p>' + detalleCitaCorreoInterno_(datos),
    'EMAIL_INTERNO_RECORDATORIO_' + horas + 'H_' + idCita,
    Boolean(soloSimular)
  );
}

function mapaSedesPorOportunidadCorreoInterno_(ss) {
  const resultado = {};
  ['CITAS', 'VITRINA'].forEach(function(nombreHoja) {
    const sheet = ss.getSheetByName(nombreHoja);
    if (!sheet || sheet.getLastRow() < 2) return;
    const encabezados = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    const id = encabezados.indexOf(nombreHoja === 'CITAS' ? 'ID CITA' : 'ID VITRINA');
    const sede = encabezados.indexOf('SEDE');
    if (id < 0 || sede < 0) return;
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getDisplayValues().forEach(function(fila) {
      const clave = String(fila[id] || '').trim();
      if (clave && fila[sede]) resultado[nombreHoja + ':' + clave] = String(fila[sede]).trim();
    });
  });
  return resultado;
}

function resumenSeguimientoPorSedeCorreoInterno_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const historial = ss.getSheetByName(SEGUIMIENTO_COMERCIAL_SHEET_);
  if (!historial || historial.getLastRow() < 2) return {};
  const mapaSedes = mapaSedesPorOportunidadCorreoInterno_(ss);
  const encabezados = historial.getRange(1, 1, 1, historial.getLastColumn()).getDisplayValues()[0];
  const col = function(nombre) { return encabezados.indexOf(nombre); };
  const hoy = fechaSeguimiento_(new Date());
  const resumen = {};
  historial.getRange(2, 1, historial.getLastRow() - 1, historial.getLastColumn()).getValues().forEach(function(fila) {
    const sede = mapaSedes[String(fila[col('ID OPORTUNIDAD')] || '').trim()];
    if (!sede) return;
    if (!resumen[sede]) resumen[sede] = {amarillos: 0, rojos: 0, vencidosDosDias: 0};
    const estado = valorNormalizadoManual_(fila[col('ESTADO')]);
    const realizado = valorNormalizadoManual_(fila[col('REALIZADO')]);
    const fecha = fechaSeguimiento_(fila[col('FECHA PROGRAMADA')]);
    if (!fecha || realizado === 'SI' || estado !== 'PENDIENTE') return;
    const dias = Math.round((hoy.getTime() - fecha.getTime()) / 86400000);
    if (dias >= 1) resumen[sede].rojos++;
    if (dias >= 2) resumen[sede].vencidosDosDias++;
    if (dias === 0 || dias === -1) resumen[sede].amarillos++;
  });
  return resumen;
}

function enviarResumenDiarioSeguimientoInterno() {
  const resumen = resumenSeguimientoPorSedeCorreoInterno_();
  const fecha = Utilities.formatDate(new Date(), TIMEZONE, 'yyyyMMdd');
  const resultado = {enviados: 0, omitidos: 0};
  Object.keys(resumen).forEach(function(sede) {
    const datos = resumen[sede];
    const html = '<p>Resumen diario de seguimiento.</p><ul>' +
      '<li>Amarillos (hoy/mañana): <b>' + datos.amarillos + '</b></li>' +
      '<li>Rojos (vencidos): <b>' + datos.rojos + '</b></li>' +
      '<li>Vencidos 2+ días: <b>' + datos.vencidosDosDias + '</b></li></ul>';
    const envio = enviarCorreoInternoPorSede_(
      sede,
      'Ámbar Couture | Resumen diario de seguimiento | ' + sede,
      html,
      'EMAIL_INTERNO_RESUMEN_' + fecha + '_' + claveSedeCorreoInterno_(sede),
      false
    );
    if (envio.ok && !envio.omitido) resultado.enviados++;
    else resultado.omitidos++;
  });
  return resultado;
}

function instalarTriggerResumenDiarioSeguimientoInterno() {
  const funcion = 'enviarResumenDiarioSeguimientoInterno';
  const existentes = ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === funcion;
  });
  existentes.slice(1).forEach(function(trigger) { ScriptApp.deleteTrigger(trigger); });
  if (!existentes.length) {
    ScriptApp.newTrigger(funcion).timeBased().atHour(7).everyDays(1).create();
  }
  return {ok: true, funcion: funcion, instalados: existentes.length ? 0 : 1};
}

const CALIFICACION_SEDES_ = ['Bogotá', 'Barranquilla', 'Villavicencio', 'Pereira'];

function claveCalificacionPorSede_(sede) {
  return 'CALIFICACION_ENLACE_' + claveSedeCorreoInterno_(sede);
}

function configuracionCalificacionPorSede_(sede) {
  const sedeNormalizada = String(sede || '').trim();
  const clave = claveCalificacionPorSede_(sedeNormalizada);
  return { sede: sedeNormalizada, clave: clave, enlace: obtenerConfig_(clave, '') };
}

// Se deja preparada, sin activador ni envío, hasta que la sede tenga enlace oficial.
// El envío futuro debe invocarla solo para ALQUILÓ y el día siguiente al evento.
function prepararCalificacionPosteriorEvento(sede) {
  const configuracion = configuracionCalificacionPorSede_(sede);
  return {
    preparada: true,
    sede: configuracion.sede,
    clave: configuracion.clave,
    activa: Boolean(configuracion.enlace),
    motivo: configuracion.enlace ? 'ENLACE_OFICIAL_CONFIGURADO' : 'PENDIENTE_ENLACE_SEDE'
  };
}

function instalarClavesCalificacionPorSede() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG_SHEET);
  if (!sheet) throw new Error('Falta ' + CONFIG_SHEET + '.');
  const existentes = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues().map(function(fila) { return String(fila[0] || '').trim(); })
    : [];
  const nuevas = CALIFICACION_SEDES_.map(function(sede) {
    return claveCalificacionPorSede_(sede);
  }).filter(function(clave) { return existentes.indexOf(clave) === -1; });
  if (nuevas.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, nuevas.length, 3).setValues(nuevas.map(function(clave) {
      return [clave, '', 'PENDIENTE'];
    }));
  }
  return { creadas: nuevas, existentes: CALIFICACION_SEDES_.length - nuevas.length };
}

function probarConfiguracionCalificacionPorSede() {
  return CALIFICACION_SEDES_.map(function(sede) {
    const configuracion = configuracionCalificacionPorSede_(sede);
    return { sede: sede, clave: configuracion.clave, enlaceConfigurado: Boolean(configuracion.enlace) };
  });
}

function obtenerVerifyTokenMeta_() {
  let token = obtenerPropiedad_('META_WA_VERIFY_TOKEN', '');

  if (!token) {
    // Se crea una sola vez y queda guardado en Propiedades del script.
    token = 'ambar_' + Utilities.getUuid().replace(/-/g, '');
    PropertiesService
      .getScriptProperties()
      .setProperty('META_WA_VERIFY_TOKEN', token);
  }

  return token;
}

function obtenerMetaGraphVersion_() {
  return obtenerPropiedad_('META_GRAPH_VERSION', META_GRAPH_VERSION_FALLBACK);
}

function validarConfiguracionMeta_() {
  const faltantes = [];

  if (!obtenerPropiedad_('META_WA_TOKEN', '')) {
    faltantes.push('META_WA_TOKEN');
  }

  if (!obtenerPropiedad_('META_WA_PHONE_NUMBER_ID', '')) {
    faltantes.push('META_WA_PHONE_NUMBER_ID');
  }

  if (!obtenerPropiedad_('META_WA_WABA_ID', '')) {
    faltantes.push('META_WA_WABA_ID');
  }

  if (faltantes.length) {
    throw new Error(
      'Faltan Propiedades del script: ' + faltantes.join(', ')
    );
  }
}

/* ---------------------------- PRUEBAS SEGURAS ---------------------------- */

function probarConexionWhatsApp() {
  validarConfiguracionMeta_();

  const token = obtenerPropiedad_('META_WA_TOKEN', '');
  const phoneNumberId = obtenerPropiedad_('META_WA_PHONE_NUMBER_ID', '');
  const version = obtenerMetaGraphVersion_();

  const url =
    'https://graph.facebook.com/' +
    version + '/' +
    encodeURIComponent(phoneNumberId) +
    '?fields=id,display_phone_number,verified_name';

  const respuesta = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      Authorization: 'Bearer ' + token
    },
    muteHttpExceptions: true
  });

  const codigo = respuesta.getResponseCode();
  const texto = respuesta.getContentText();

  console.log('HTTP: ' + codigo);

  if (codigo >= 200 && codigo < 300) {
    let info = {};
    try {
      info = JSON.parse(texto);
    } catch (_) {}

    console.log('CONEXIÓN WHATSAPP OK');
    console.log('Phone Number ID: ' + String(info.id || phoneNumberId));
    console.log('Número: ' + String(info.display_phone_number || ''));
    console.log('Nombre verificado: ' + String(info.verified_name || ''));

    actualizarEstadoConfigConexion_('CONECTADO / PRUEBA API OK');

    return {
      ok: true,
      http: codigo,
      id: info.id || phoneNumberId,
      numero: info.display_phone_number || '',
      nombre: info.verified_name || ''
    };
  }

  // No se imprime el token ni se guarda en logs.
  console.error('Meta respondió HTTP ' + codigo + ': ' + texto);

  return {
    ok: false,
    http: codigo,
    respuesta: texto
  };
}

function prepararSistemaAmbar() {
  asegurarHojaPostCita_();
  const verifyToken = obtenerVerifyTokenMeta_();
  instalarTriggerPostCita_();

  const url = ScriptApp.getService().getUrl();

  console.log('SISTEMA ÁMBAR PREPARADO');
  console.log('Callback URL Meta: ' + (url || 'No disponible: actualiza la implementación web'));
  console.log('Verify token Meta: ' + verifyToken);
  console.log('Trigger post-cita: instalado');

  return {
    ok: true,
    callbackUrl: url || '',
    verifyToken: verifyToken
  };
}

function instalarTriggerPostCita_() {
  const nombreFuncion = 'procesarPostCitaVillavicencio';
  const triggers = ScriptApp.getProjectTriggers();

  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === nombreFuncion) {
      return;
    }
  }

  ScriptApp
    .newTrigger(nombreFuncion)
    .timeBased()
    .everyHours(1)
    .create();
}

/* ------------------------------ WEBHOOK META ------------------------------ */

function esWebhookMeta_(data) {
  return !!(
    data &&
    String(data.object || '') === 'whatsapp_business_account' &&
    Array.isArray(data.entry)
  );
}

function procesarWebhookMeta_(data) {
  const phoneNumberIdEsperado = obtenerPropiedad_('META_WA_PHONE_NUMBER_ID', '');
  let mensajesProcesados = 0;

  try {
    registrarLogTecnico_('META_WEBHOOK', data);

    const entries = Array.isArray(data.entry) ? data.entry : [];

    entries.forEach(function(entry) {
      const changes = Array.isArray(entry.changes) ? entry.changes : [];

      changes.forEach(function(change) {
        if (String(change.field || '') !== 'messages') {
          return;
        }

        const value = change.value || {};
        const metadata = value.metadata || {};
        const phoneNumberIdRecibido = String(metadata.phone_number_id || '');

        // Evita procesar mensajes que lleguen de otro número/WABA al mismo endpoint.
        if (
          phoneNumberIdEsperado &&
          phoneNumberIdRecibido &&
          phoneNumberIdRecibido !== phoneNumberIdEsperado
        ) {
          registrarLogTecnico_('META_IGNORADO_PHONE_ID', {
            recibido: phoneNumberIdRecibido
          });
          return;
        }

        const messages = Array.isArray(value.messages) ? value.messages : [];

        messages.forEach(function(message) {
          mensajesProcesados++;
          procesarMensajeEntranteWhatsApp_(message, value);
        });

        // Los statuses (sent, delivered, read, failed) se registran sin cambiar
        // el estado comercial de la cita.
        const statuses = Array.isArray(value.statuses) ? value.statuses : [];
        statuses.forEach(function(status) {
          registrarEstadoMensajeWhatsApp_(status);
        });
      });
    });

    return respuestaJson({
      ok: true,
      canal: 'META_WHATSAPP',
      mensajesProcesados: mensajesProcesados
    });

  } catch (error) {
    console.error('ERROR WEBHOOK META: ' + error.stack);
    registrarLogTecnico_('META_ERROR', {
      mensaje: error.message
    });

    // Meta necesita una respuesta rápida; devolvemos JSON y dejamos el error en log.
    return respuestaJson({
      ok: false,
      canal: 'META_WHATSAPP',
      error: error.message
    });
  }
}

function procesarMensajeEntranteWhatsApp_(message, value) {
  const telefono = normalizarTelefono(message.from || '');
  const messageId = String(message.id || '');

  if (!telefono) {
    return;
  }

  if (procesarSolicitudReprogramacion_(message, telefono, messageId)) {
    return;
  }

  const respuesta = extraerRespuestaWhatsApp_(message);

  if (!respuesta.id) {
    registrarLogTecnico_('META_MENSAJE_SIN_ACCION', {
      telefono: telefono,
      tipo: message.type || '',
      messageId: messageId
    });
    return;
  }

  const postSheet = asegurarHojaPostCita_();
  const filaPost = buscarPostCitaAbiertaPorTelefono_(postSheet, telefono);

  if (!filaPost) {
    registrarLogTecnico_('META_RESPUESTA_SIN_POST_CITA', {
      telefono: telefono,
      boton: respuesta.id,
      messageId: messageId
    });
    return;
  }

  const lock = LockService.getScriptLock();
  let lockTomado = false;

  try {
    lockTomado = lock.tryLock(10000);
    if (!lockTomado) {
      throw new Error('No se pudo bloquear la respuesta post-cita.');
    }

    procesarRespuestaPostCita_(
      postSheet,
      filaPost,
      respuesta.id,
      'WHATSAPP',
      messageId
    );

  } finally {
    if (lockTomado) {
      lock.releaseLock();
    }
  }
}


function procesarSolicitudReprogramacion_(message, telefono, messageId) {
  const botonId = String(
    message && message.interactive && message.interactive.button_reply
      ? message.interactive.button_reply.id || ''
      : message && message.button
        ? message.button.payload || ''
        : ''
  ).trim();

  const textoOriginal = String(
    message && message.text && message.text.body || ''
  ).trim();
  const texto = normalizarTextoAccion_(textoOriginal);

  if (botonId === 'cita_hablar_asesora') {
    enviarTextoWhatsApp_(telefono,
      'Claro. Una asesora de Ámbar Couture continuará contigo por este WhatsApp.');
    registrarLogTecnico_('CITA_SOLICITA_ASESORA', {telefono: telefono, messageId: messageId});
    return true;
  }

  const solicitudDirecta =
    botonId === 'cita_reprogramar' ||
    /\breprogram/.test(texto) ||
    /\bcambiar(?: la| mi)? cita\b/.test(texto) ||
    /\bmover(?: la| mi)? cita\b/.test(texto) ||
    /\botra fecha\b/.test(texto) ||
    /\botro horario\b/.test(texto);

  const rechazoReprogramar = /\bno quiero reprogram/.test(texto);
  const posibleInasistencia =
    /\bno puedo(?: asistir| ir| llegar)?\b/.test(texto) ||
    /\bno podre(?: asistir| ir| llegar)?\b/.test(texto) ||
    /\bno voy a poder\b/.test(texto) ||
    /\bno alcanzo\b/.test(texto) ||
    /\bno asistire\b/.test(texto);

  if (solicitudDirecta && !rechazoReprogramar) {
    enviarOpcionesReprogramacion_(telefono, messageId);
    return true;
  }

  if (posibleInasistencia) {
    enviarWhatsApp_(telefono, {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: {
          text: 'Entendemos. Si no puedes asistir, podemos ayudarte a elegir una nueva fecha para tu cita. ¿Qué deseas hacer?'
        },
        action: {
          buttons: [
            {type: 'reply', reply: {id: 'cita_reprogramar', title: 'Reprogramar cita'}},
            {type: 'reply', reply: {id: 'cita_hablar_asesora', title: 'Hablar con asesora'}}
          ]
        }
      }
    });
    registrarLogTecnico_('CITA_INVITACION_REPROGRAMAR', {telefono: telefono, messageId: messageId});
    return true;
  }

  return false;
}

function enviarTextoWhatsApp_(telefono, texto) {
  return enviarWhatsApp_(telefono, {
    type: 'text',
    text: {preview_url: false, body: texto}
  });
}

function enviarOpcionesReprogramacion_(telefono, messageId) {
  const citas = buscarCitasActivasPorTelefono_(telefono);

  if (!citas.length) {
    enviarTextoWhatsApp_(telefono,
      'No encontré una cita futura asociada a este número. Una asesora revisará tu caso por este WhatsApp.');
    registrarLogTecnico_('REPROGRAMACION_SIN_CITA', {telefono: telefono, messageId: messageId});
    return;
  }

  if (citas.length === 1) {
    const cita = citas[0];
    enviarTextoWhatsApp_(telefono,
      'Claro, ' + (cita.nombre || 'te ayudamos') + '. Puedes elegir una nueva fecha para tu cita de ' +
      cita.sede + ' (' + cita.fecha + ' a las ' + cita.hora + ') aquí:\n' + cita.url);
    registrarLogTecnico_('REPROGRAMACION_LINK_ENVIADO', {
      telefono: telefono, bookingId: cita.bookingId, fila: cita.fila, messageId: messageId
    });
    return;
  }

  let texto = 'Encontré varias citas futuras. Elige el enlace correspondiente:\n';
  citas.slice(0, 5).forEach(function(cita, i) {
    texto += '\n' + (i + 1) + '. ' + cita.sede + ' — ' + cita.fecha + ' ' + cita.hora + '\n' + cita.url + '\n';
  });
  enviarTextoWhatsApp_(telefono, texto);
  registrarLogTecnico_('REPROGRAMACION_VARIAS_CITAS', {
    telefono: telefono, cantidad: citas.length, messageId: messageId
  });
}

function buscarCitasActivasPorTelefono_(telefono) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const valores = sheet.getRange(2, 1, sheet.getLastRow() - 1, 22).getDisplayValues();
  const objetivo = normalizarTelefono(telefono);
  const ahora = new Date().getTime() - 15 * 60 * 1000;
  const citas = [];

  valores.forEach(function(v, indice) {
    const estado = String(v[10] || '').trim().toUpperCase();
    if (normalizarTelefono(v[4]) !== objetivo) return;
    if (['AGENDADA', 'REAGENDADA'].indexOf(estado) === -1) return;

    const inicio = convertirFechaHoraCita_(v[8], v[9]);
    if (!inicio || inicio.getTime() < ahora) return;

    let url = String(v[21] || '').trim();
    if (!url) {
      url = recuperarEnlaceReprogramacionDesdeLog_(v[0], v[5]);
      if (url) sheet.getRange(indice + 2, 22).setValue(url);
    }
    if (!url) return;

    citas.push({
      fila: indice + 2, bookingId: String(v[0] || ''), sede: String(v[1] || ''),
      nombre: String(v[2] || ''), fecha: String(v[8] || ''), hora: String(v[9] || ''),
      inicio: inicio.getTime(), url: url
    });
  });

  citas.sort(function(a, b) { return a.inicio - b.inicio; });
  return citas;
}

function convertirFechaHoraCita_(fecha, hora) {
  const f = String(fecha || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const h = String(hora || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!f || !h) return null;
  let horas = Number(h[1]);
  const minutos = Number(h[2]);
  const periodo = String(h[3] || '').toUpperCase();
  if (periodo === 'PM' && horas < 12) horas += 12;
  if (periodo === 'AM' && horas === 12) horas = 0;
  return new Date(Number(f[3]), Number(f[2]) - 1, Number(f[1]), horas, minutos, 0, 0);
}

function construirEnlaceReprogramacion_(bookingId, seatReferenceUid, correo) {
  const uid = String(seatReferenceUid || bookingId || '').trim();
  if (!uid) return '';
  let url = 'https://cal.com/reschedule/' + encodeURIComponent(uid);
  const parametros = [];
  if (correo) parametros.push('rescheduledBy=' + encodeURIComponent(String(correo).trim()));
  if (seatReferenceUid) parametros.push('seatReferenceUid=' + encodeURIComponent(String(seatReferenceUid).trim()));
  if (parametros.length) url += '?' + parametros.join('&');
  return url;
}

function guardarEnlaceReprogramacion_(sheet, fila, datos) {
  if (!sheet || !fila || !datos) return;
  const url = String(datos.rescheduleUrl || '').trim();
  if (!url) return;
  if (!sheet.getRange(1, 22).getDisplayValue()) {
    sheet.getRange(1, 22).setValue('LINK REPROGRAMACIÓN');
  }
  sheet.getRange(fila, 22).setValue(url);
}

function recuperarEnlaceReprogramacionDesdeLog_(bookingId, correo) {
  const id = String(bookingId || '').trim();
  if (!id) return '';
  const log = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(WEBHOOK_LOG_SHEET);
  if (!log || log.getLastRow() < 2) return '';
  const ultima = log.getLastRow();
  const primera = Math.max(2, ultima - 600);
  const filas = log.getRange(primera, 2, ultima - primera + 1, 2).getDisplayValues();

  for (let i = filas.length - 1; i >= 0; i--) {
    const cuerpo = String(filas[i][1] || '');
    if (cuerpo.indexOf(id) === -1) continue;
    try {
      const data = JSON.parse(cuerpo);
      const payload = data.payload || data;
      // ERP: el evento del ERP trae el enlace de reprogramación listo.
      if (esReservaERP_(payload)) return enlaceReprogramacionERP_(payload);
      const attendee = payload.attendees && payload.attendees[0] || payload.attendee || {};
      const seat = attendee.bookingSeat || {};
      const ref = String(seat.referenceUid || payload.attendeeSeatId || '').trim();
      return construirEnlaceReprogramacion_(id, ref, attendee.email || correo);
    } catch (_) {}
  }
  return '';
}

function extraerRespuestaWhatsApp_(message) {
  let id = '';
  let titulo = '';

  if (
    message.interactive &&
    message.interactive.button_reply
  ) {
    id = String(message.interactive.button_reply.id || '').trim();
    titulo = String(message.interactive.button_reply.title || '').trim();
  } else if (
    message.interactive &&
    message.interactive.list_reply
  ) {
    id = String(message.interactive.list_reply.id || '').trim();
    titulo = String(message.interactive.list_reply.title || '').trim();
  } else if (message.button) {
    // Respuesta a botón quick_reply de una plantilla.
    id = String(message.button.payload || '').trim();
    titulo = String(message.button.text || '').trim();
  } else if (message.text && message.text.body) {
    const texto = normalizarTextoAccion_(message.text.body);
    const equivalencias = {
      'pc asisti': 'pc_asisti',
      'si asisti': 'pc_asisti',
      'sí asisti': 'pc_asisti',
      'si asistí': 'pc_asisti',
      'no asisti': 'pc_no_asisti',
      'no asistí': 'pc_no_asisti',
      'pc no asisti': 'pc_no_asisti',
      'si alquile': 'pc_alquile',
      'sí alquile': 'pc_alquile',
      'si alquilé': 'pc_alquile',
      'no alquile': 'pc_no_alquile',
      'no alquilé': 'pc_no_alquile',
      'precio': 'mot_precio',
      'no encontre vestido': 'mot_no_vestido',
      'visitaré otras tiendas': 'mot_otras_tiendas',
      'visitare otras tiendas': 'mot_otras_tiendas',
      'debo consultarlo': 'mot_consultar',
      'fecha del evento': 'mot_fecha_evento',
      'talla diseño ajuste': 'mot_talla_diseno',
      'talla diseno ajuste': 'mot_talla_diseno',
      'otro': 'mot_otro'
    };

    id = equivalencias[texto] || '';
    titulo = String(message.text.body || '').trim();
  }

  return {
    id: id,
    titulo: titulo
  };
}

function normalizarTextoAccion_(texto) {
  return String(texto || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[✅❌💰👗🔎👥📅✂️📝]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* --------------------------- ENVÍO WHATSAPP --------------------------- */

function enviarConfirmacionCitaSiPendiente_(sheet, fila, datos) {
  const meetVirtual = asegurarMeetVirtual_(datos);
  const estadoActual = String(
    sheet.getRange(fila, 19).getDisplayValue() || ''
  ).trim().toUpperCase();

  if (estadoActual && estadoActual !== 'ERROR') {
    return {ok: true, omitida: true, estado: estadoActual};
  }

  if (!datos || !datos.whatsapp) {
    sheet.getRange(fila, 19, 1, 3).setValues([[
      'ERROR',
      '',
      new Date()
    ]]);
    registrarLogTecnico_('CONFIRMACION_CITA_ERROR', {
      bookingId: datos && datos.bookingId || '',
      fila: fila,
      error: 'Cita sin WhatsApp válido'
    });
    return {ok: false, error: 'Cita sin WhatsApp válido'};
  }

  try {
    const resultado = enviarWhatsApp_(datos.whatsapp, {
      type: 'template',
      template: {
        name: 'ambar_confirmacion_cita',
        language: {code: 'es'},
        components: [{
          type: 'body',
          parameters: [
            {type: 'text', text: String(datos.nombre || 'cliente')},
            {type: 'text', text: String(datos.sede || SEDE)},
            {type: 'text', text: String(datos.fechaCita || '')},
            {type: 'text', text: String(datos.horaCita || '')}
          ]
        }]
      }
    });

    sheet.getRange(fila, 19, 1, 3).setValues([[
      'ENVIADA',
      resultado.messageId,
      new Date()
    ]]);

    registrarLogTecnico_('CONFIRMACION_CITA_ENVIADA', {
      bookingId: datos.bookingId || '',
      fila: fila,
      messageId: resultado.messageId
    });

    return {ok: true, messageId: resultado.messageId};
  } catch (error) {
    sheet.getRange(fila, 19, 1, 3).setValues([[
      'ERROR',
      '',
      new Date()
    ]]);

    registrarLogTecnico_('CONFIRMACION_CITA_ERROR', {
      bookingId: datos.bookingId || '',
      fila: fila,
      error: error.message
    });

    return {ok: false, error: error.message};
  }
}

function procesarRecordatoriosCitas() {
  return procesarRecordatoriosCitas_(false);
}

function procesarRecordatoriosCitas_(soloSimular) {
  const bloqueo = LockService.getScriptLock();
  if (!bloqueo.tryLock(5000)) {
    return {ok: false, motivo: 'OTRA_EJECUCION_EN_CURSO'};
  }

  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('No existe la hoja ' + SHEET_NAME + '.');

    const ultimaFila = Math.max(2, sheet.getLastRow());
    const filas = sheet.getRange(2, 1, ultimaFila - 1, 24).getDisplayValues();
    const ahora = new Date();
    let revisadas = 0;
    let candidatas = 0;
    let enviadas = 0;
    let errores = 0;

    filas.forEach(function(valores, indice) {
      const bookingId = String(valores[0] || '').trim();
      if (!bookingId) return;

      const estado = String(valores[10] || '').trim().toUpperCase();
      if (estado !== 'AGENDADA' && estado !== 'REAGENDADA') return;

      revisadas++;
      const fechaHora = convertirFechaHoraCita_(valores[8], valores[9]);
      if (!fechaHora || isNaN(fechaHora.getTime())) return;

      const minutos = (fechaHora.getTime() - ahora.getTime()) / 60000;
      let horasObjetivo = 0;
      let columnaEstado = 0;
      let estadoActual = '';

      if (minutos > 1410 && minutos <= 1450) {
        horasObjetivo = 24;
        columnaEstado = 23;
        estadoActual = String(valores[22] || '').trim();
      } else if (minutos > 90 && minutos <= 130) {
        horasObjetivo = 2;
        columnaEstado = 24;
        estadoActual = String(valores[23] || '').trim();
      } else {
        return;
      }

      if (estadoActual.indexOf('ENVIADO') === 0) return;
      candidatas++;

      let enlace = String(valores[21] || '').trim();
      if (!enlace) {
        enlace = recuperarEnlaceReprogramacionDesdeLog_(bookingId);
        if (enlace && !soloSimular) {
          sheet.getRange(indice + 2, 22).setValue(enlace);
        }
      }

      if (!enlace) {
        errores++;
        registrarLogTecnico_('RECORDATORIO_SIN_ENLACE', {
          fila: indice + 2,
          idCita: bookingId,
          horas: horasObjetivo
        });
        return;
      }

      if (soloSimular) {
        console.log('SIMULACION RECORDATORIO ' + horasObjetivo + 'H | fila ' + (indice + 2) + ' | ' + enlace);
        return;
      }

      // Aviso interno independiente: no depende del resultado de WhatsApp ni lo bloquea.
      try {
        notificarRecordatorioInternoSiPendiente_({
          bookingId: bookingId,
          sede: String(valores[1] || SEDE).trim() || SEDE,
          nombre: String(valores[2] || '').trim(),
          apellido: String(valores[3] || '').trim(),
          whatsapp: String(valores[4] || '').trim(),
          fechaCita: String(valores[8] || '').trim(),
          horaCita: String(valores[9] || '').trim(),
          modalidad: String(valores[17] || '').trim(),
          enlace: enlace
        }, horasObjetivo, false);
      } catch (errorCorreoInterno) {
        console.warn('Correo interno de recordatorio: ' + errorCorreoInterno.message);
      }

      try {
        const respuesta = enviarRecordatorioCita_(
          valores[4],
          String(valores[2] || 'Cliente').trim() || 'Cliente',
          horasObjetivo,
          String(valores[1] || SEDE).trim() || SEDE,
          String(valores[8] || '').trim(),
          String(valores[9] || '').trim(),
          enlace
        );
        const marcaTiempo = Utilities.formatDate(new Date(), TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
        sheet.getRange(indice + 2, columnaEstado).setValue(
          'ENVIADO | ' + String(respuesta.messageId || '') + ' | ' + marcaTiempo
        );
        enviadas++;
        registrarLogTecnico_('RECORDATORIO_' + horasObjetivo + 'H_ENVIADO', {
          fila: indice + 2,
          idCita: bookingId,
          messageId: respuesta.messageId || '',
          enlace: enlace
        });
      } catch (error) {
        errores++;
        sheet.getRange(indice + 2, columnaEstado).setValue(
          'PENDIENTE_REINTENTO | ' + Utilities.formatDate(new Date(), TIMEZONE, 'dd/MM/yyyy HH:mm:ss')
        );
        registrarLogTecnico_('ERROR_RECORDATORIO_' + horasObjetivo + 'H', {
          fila: indice + 2,
          idCita: bookingId,
          error: error.message
        });
      }
    });

    SpreadsheetApp.flush();
    const resumen = {
      ok: true,
      simulacion: Boolean(soloSimular),
      revisadas: revisadas,
      candidatas: candidatas,
      enviadas: enviadas,
      errores: errores
    };
    console.log(JSON.stringify(resumen));
    return resumen;
  } finally {
    bloqueo.releaseLock();
  }
}

function enviarRecordatorioCita_(telefono, nombre, horas, sede, fecha, hora, enlace) {
  return enviarWhatsApp_(telefono, {
    type: 'template',
    template: {
      name: 'ambar_recordatorio_cita',
      language: {code: 'es'},
      components: [{
        type: 'body',
        parameters: [
          {type: 'text', text: String(nombre || 'Cliente')},
          {type: 'text', text: String(horas)},
          {type: 'text', text: String(sede || SEDE)},
          {type: 'text', text: String(fecha || '')},
          {type: 'text', text: String(hora || '')},
          {type: 'text', text: String(enlace || '')}
        ]
      }]
    }
  });
}

function instalarTriggerRecordatoriosCitas() {
  const nombreFuncion = 'procesarRecordatoriosCitas';
  const triggers = ScriptApp.getProjectTriggers();
  let existente = null;

  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === nombreFuncion) {
      if (!existente) {
        existente = trigger;
      } else {
        ScriptApp.deleteTrigger(trigger);
      }
    }
  });

  if (!existente) {
    existente = ScriptApp.newTrigger(nombreFuncion)
      .timeBased()
      .everyMinutes(15)
      .create();
  }

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  sheet.getRange(1, 23, 1, 2).setValues([['RECORDATORIO 24H', 'RECORDATORIO 2H']]);
  SpreadsheetApp.flush();

  const resultado = {
    ok: true,
    funcion: nombreFuncion,
    frecuenciaMinutos: 15,
    triggerId: existente.getUniqueId()
  };
  console.log(JSON.stringify(resultado));
  return resultado;
}

function enviarWhatsApp_(destinatario, cuerpo) {
  validarConfiguracionMeta_();

  const token = obtenerPropiedad_('META_WA_TOKEN', '');
  const phoneNumberId = obtenerPropiedad_('META_WA_PHONE_NUMBER_ID', '');
  const version = obtenerMetaGraphVersion_();
  const to = normalizarTelefono(destinatario);

  if (!to) {
    throw new Error('No hay número de WhatsApp válido.');
  }

  const url =
    'https://graph.facebook.com/' +
    version + '/' +
    encodeURIComponent(phoneNumberId) +
    '/messages';

  cuerpo.messaging_product = 'whatsapp';
  cuerpo.recipient_type = 'individual';
  cuerpo.to = to;

  const respuesta = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + token
    },
    payload: JSON.stringify(cuerpo),
    muteHttpExceptions: true
  });

  const codigo = respuesta.getResponseCode();
  const texto = respuesta.getContentText();

  let data = {};
  try {
    data = JSON.parse(texto);
  } catch (_) {}

  if (codigo < 200 || codigo >= 300) {
    const mensaje =
      data && data.error && data.error.message
        ? data.error.message
        : texto;

    throw new Error('Meta HTTP ' + codigo + ': ' + mensaje);
  }

  const messageId =
    data && data.messages && data.messages[0]
      ? String(data.messages[0].id || '')
      : '';

  return {
    ok: true,
    http: codigo,
    messageId: messageId,
    raw: data
  };
}

function enviarPlantillaAsistencia_(telefono) {
  const templateName = obtenerConfig_(
    'WA_TEMPLATE_ASISTENCIA',
    'ambar_post_cita_asistencia'
  );

  const lang = obtenerPropiedad_('META_WA_TEMPLATE_LANG', 'es_CO');

  const btnAsisti = obtenerConfig_('WA_BTN_ASISTI', 'pc_asisti');
  const btnNoAsisti = obtenerConfig_('WA_BTN_NO_ASISTI', 'pc_no_asisti');

  return enviarWhatsApp_(telefono, {
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: lang
      },
      components: [
        {
          type: 'button',
          sub_type: 'quick_reply',
          index: '0',
          parameters: [
            {
              type: 'payload',
              payload: btnAsisti
            }
          ]
        },
        {
          type: 'button',
          sub_type: 'quick_reply',
          index: '1',
          parameters: [
            {
              type: 'payload',
              payload: btnNoAsisti
            }
          ]
        }
      ]
    }
  });
}

function enviarBotonesAlquiler_(telefono) {
  return enviarWhatsApp_(telefono, {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: 'Gracias por visitarnos. ¿Alquilaste tu vestido con Ámbar Couture?'
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: obtenerConfig_('WA_BTN_ALQUILE', 'pc_alquile'),
              title: 'Sí alquilé'
            }
          },
          {
            type: 'reply',
            reply: {
              id: obtenerConfig_('WA_BTN_NO_ALQUILE', 'pc_no_alquile'),
              title: 'No alquilé'
            }
          }
        ]
      }
    }
  });
}

function enviarListaMotivos_(telefono) {
  return enviarWhatsApp_(telefono, {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: {
        text: 'Para ayudarnos a mejorar, ¿cuál fue la principal razón por la que no alquilaste?'
      },
      action: {
        button: 'Elegir motivo',
        sections: [
          {
            title: 'Motivo principal',
            rows: [
              {
                id: obtenerConfig_('MOTIVO_PRECIO', 'mot_precio'),
                title: 'Precio'
              },
              {
                id: obtenerConfig_('MOTIVO_NO_VESTIDO', 'mot_no_vestido'),
                title: 'No encontré vestido'
              },
              {
                id: obtenerConfig_('MOTIVO_OTRAS_TIENDAS', 'mot_otras_tiendas'),
                title: 'Visitaré otras tiendas'
              },
              {
                id: obtenerConfig_('MOTIVO_CONSULTAR', 'mot_consultar'),
                title: 'Debo consultarlo'
              },
              {
                id: obtenerConfig_('MOTIVO_FECHA_EVENTO', 'mot_fecha_evento'),
                title: 'Fecha del evento'
              },
              {
                id: obtenerConfig_('MOTIVO_TALLA_DISENO', 'mot_talla_diseno'),
                title: 'Talla / diseño / ajuste'
              },
              {
                id: obtenerConfig_('MOTIVO_OTRO', 'mot_otro'),
                title: 'Otro'
              }
            ]
          }
        ]
      }
    }
  });
}

function enviarLinkReagendamiento_(telefono, idCita) {
  // POST-CITA no depende de Gmail: usa siempre el enlace estándar individual.
  const link = obtenerLinkReagendamiento_(idCita, true);

  if (!link) {
    throw new Error('No fue posible obtener un enlace individual de reprogramación.');
  }

  // En ventana de servicio, el enlace se envía como texto clicable. Esto evita
  // depender de una plantilla adicional de URL dinámica durante el prototipo.
  return enviarWhatsApp_(telefono, {
    type: 'text',
    text: {
      preview_url: false,
      body:
        'No hay problema. Puedes reprogramar tu cita aquí:\n' +
        link
    }
  });
}

/* ------------------------------ POST-CITA ------------------------------ */

function asegurarHojaPostCita_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(POST_CITA_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(POST_CITA_SHEET);
    sheet.hideSheet();
  }

  const encabezadosActuales = sheet
    .getRange(1, 1, 1, POST_CITA_HEADERS.length)
    .getDisplayValues()[0];

  let necesitaEncabezados = false;
  for (let i = 0; i < POST_CITA_HEADERS.length; i++) {
    if (String(encabezadosActuales[i] || '') !== POST_CITA_HEADERS[i]) {
      necesitaEncabezados = true;
      break;
    }
  }

  if (necesitaEncabezados && sheet.getLastRow() <= 1) {
    sheet
      .getRange(1, 1, 1, POST_CITA_HEADERS.length)
      .setValues([POST_CITA_HEADERS]);
  }

  return sheet;
}

function procesarPostCitaVillavicencio() {
  const props = PropertiesService.getScriptProperties();
  const esJard = Session.getEffectiveUser().getEmail().toLowerCase() === 'jard139@gmail.com';
  if (!esJard && props.getProperty('POST_CITA_JARD_ACTIVO_20261008') === 'SI') {
    console.log('POST_CITA: activador anterior omitido; jard139 activo.');
    return { omitido: true };
  }
  if (esJard) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    if (!ss.getSheetByName(SHEET_NAME).getRange('O:P').canEdit() ||
        !ss.getSheetByName('POST_CITA').getDataRange().canEdit()) {
      throw new Error('jard139 no puede actualizar los rangos de poscita.');
    }
  }
  const resultado = procesarPostCita_(null, false);
  if (esJard) {
    props.setProperty('POST_CITA_JARD_ACTIVO_20261008', 'SI');
    console.log('POST_CITA: ejecución jard139 completada, permisos verificados.');
  }
  return resultado;
}

// Recuperación única, segura e idempotente: solo citas vencidas desde 04/09/2026
// que aún no tengan una fila POST_CITA.
function recuperarPostCitaVencidasDesde0409() {
  return procesarPostCita_(new Date(2026, 8, 4, 0, 0, 0, 0), true);
}

function procesarPostCita_(fechaDesde, soloSinPostCita) {
  const lock = LockService.getScriptLock();
  let lockTomado = false;
  const resultado = {enviados: 0, fallidos: 0, recuperadas: 0};

  try {
    lockTomado = lock.tryLock(10000);
    if (!lockTomado) {
      throw new Error('No se pudo obtener bloqueo post-cita.');
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const citasSheet = ss.getSheetByName(SHEET_NAME);
    const postSheet = asegurarHojaPostCita_();

    if (!citasSheet || citasSheet.getLastRow() < 2) {
      return resultado;
    }

    const demoraMin = parseInt(
      obtenerConfig_('DEMORA_POST_CITA_MIN', '90'),
      10
    ) || 90;

    const duracionMin = obtenerDuracionCitaMin_();
    const ahora = new Date();

    const datos = citasSheet
      .getRange(2, 1, citasSheet.getLastRow() - 1, TOTAL_COLUMNAS)
      .getDisplayValues();

    for (let i = 0; i < datos.length; i++) {
      const filaCita = i + 2;
      const fila = datos[i];

      const idCita = String(fila[0] || '').trim();
      const sede = String(fila[1] || '').trim();
      const telefono = normalizarTelefono(fila[4]);
      const correo = String(fila[5] || '').trim().toLowerCase();
      const estadoCita = String(fila[10] || '').trim().toUpperCase();
      const asistencia = String(fila[11] || '').trim().toUpperCase();

      if (!idCita || /^TEST/i.test(idCita)) {
        continue;
      }

      // ERP: Pereira incluida; el ERP ya agenda citas en Pereira.
      if (['Villavicencio', 'Bogotá', 'Barranquilla', 'Pereira'].indexOf(sede) === -1) {
        continue;
      }

      if (estadoCita === 'CANCELADA') {
        continue;
      }

      if (asistencia && asistencia !== 'PENDIENTE') {
        continue;
      }

      const inicio = parsearFechaHoraCita_(fila[8], fila[9]);
      if (!inicio) {
        continue;
      }

      if (fechaDesde && inicio.getTime() < fechaDesde.getTime()) {
        continue;
      }

      const fin = new Date(inicio.getTime() + duracionMin * 60000);
      const momentoEnviar = new Date(fin.getTime() + demoraMin * 60000);

      if (ahora.getTime() < momentoEnviar.getTime()) {
        continue;
      }

      let filaPost = buscarFilaPostCitaPorId_(postSheet, idCita);

      // La recuperación nunca toca filas ya existentes: evita duplicados.
      if (soloSinPostCita && filaPost) {
        continue;
      }

      if (!filaPost) {
        filaPost = crearFilaPostCita_(postSheet, {
          idCita: idCita,
          sede: sede,
          nombre: [fila[2], fila[3]].filter(Boolean).join(' ').trim(),
          whatsapp: telefono,
          correo: correo,
          finCita: fin
        });
        if (soloSinPostCita) {
          resultado.recuperadas++;
        }
      }

      const post = postSheet
        .getRange(filaPost, 1, 1, POST_CITA_HEADERS.length)
        .getValues()[0];

      const yaRespondio = String(post[9] || '').trim() !== '';
      const waEnviado = post[7] !== '' && post[7] !== null;
      const sinWhatsapp = String(post[17] || '').trim().toUpperCase() === 'SIN_WHATSAPP';

      if (yaRespondio || sinWhatsapp) {
        continue;
      }

      // POST-CITA usa exclusivamente WhatsApp; no hay respaldo por correo.
      if (!waEnviado && !telefono) {
        postSheet.getRange(filaPost, 18).setValue('SIN_WHATSAPP');
        postSheet.getRange(filaPost, 26).setValue('POST-CITA requiere un número WhatsApp.');
        if (soloSinPostCita) {
          resultado.fallidos++;
        }
        continue;
      }

      if (!waEnviado) {
        try {
          const envio = enviarPlantillaAsistencia_(telefono);

          postSheet.getRange(filaPost, 8).setValue(new Date());
          postSheet.getRange(filaPost, 18).setValue('ENVIADO');
          postSheet.getRange(filaPost, 21).setValue('ASISTENCIA');
          postSheet.getRange(filaPost, 24).setValue(envio.messageId || '');
          postSheet.getRange(filaPost, 26).clearContent();

          actualizarCitaSeguimiento_(filaCita, {
            proximaAccion: 'ESPERAR RESPUESTA ASISTENCIA',
            fechaSeguimiento: new Date()
          });

          if (soloSinPostCita) {
            resultado.enviados++;
          }

        } catch (errorWa) {
          postSheet.getRange(filaPost, 18).setValue('ERROR');
          postSheet.getRange(filaPost, 26).setValue('WhatsApp: ' + errorWa.message);
          if (soloSinPostCita) {
            resultado.fallidos++;
          }
        }
      }
    }

  } catch (error) {
    console.error('ERROR POST-CITA: ' + error.stack);
    registrarLogTecnico_('POST_CITA_ERROR', {
      mensaje: error.message
    });
  } finally {
    if (lockTomado) {
      lock.releaseLock();
    }
  }

  return resultado;
}

function crearFilaPostCita_(sheet, datos) {
  sheet.appendRow([
    datos.idCita,
    datos.sede,
    datos.nombre,
    datos.whatsapp,
    datos.correo,
    datos.finCita,
    'ESPERANDO_ASISTENCIA',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'PENDIENTE',
    'PENDIENTE',
    '',
    'ASISTENCIA',
    '',
    '',
    '',
    '',
    ''
  ]);

  return sheet.getLastRow();
}

function buscarFilaPostCitaPorId_(sheet, idCita) {
  const id = String(idCita || '').trim();

  if (!id || sheet.getLastRow() < 2) {
    return 0;
  }

  const ids = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, 1)
    .getDisplayValues();

  for (let i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0] || '').trim() === id) {
      return i + 2;
    }
  }

  return 0;
}

function buscarPostCitaAbiertaPorTelefono_(sheet, telefono) {
  const tel = normalizarTelefono(telefono);

  if (!tel || sheet.getLastRow() < 2) {
    return 0;
  }

  const datos = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, POST_CITA_HEADERS.length)
    .getDisplayValues();

  for (let i = datos.length - 1; i >= 0; i--) {
    const fila = datos[i];
    const telFila = normalizarTelefono(fila[3]);
    const accionEsperada = String(fila[20] || '').trim().toUpperCase();
    const estado = String(fila[6] || '').trim().toUpperCase();

    if (telFila !== tel) {
      continue;
    }

    if (
      accionEsperada === 'ASISTENCIA' ||
      accionEsperada === 'ALQUILER' ||
      accionEsperada === 'MOTIVO'
    ) {
      return i + 2;
    }

    if (estado.indexOf('ESPERANDO_') === 0) {
      return i + 2;
    }
  }

  return 0;
}

function procesarRespuestaPostCita_(postSheet, filaPost, botonId, canal, messageId) {
  const valores = postSheet
    .getRange(filaPost, 1, 1, POST_CITA_HEADERS.length)
    .getValues()[0];

  const idCita = String(valores[0] || '').trim();
  const telefono = normalizarTelefono(valores[3]);
  const accionEsperada = String(valores[20] || '').trim().toUpperCase();
  const ahora = new Date();

  if (!idCita) {
    throw new Error('POST_CITA sin ID CITA.');
  }

  // Idempotencia: si el mismo botón ya cerró la etapa, no se procesa de nuevo.
  if (
    String(valores[21] || '').trim() === botonId &&
    String(valores[22] || '').trim() !== ''
  ) {
    return;
  }

  const filaCita = buscarFilaCitaPorId_(idCita);
  const respuestaCita = filaCita
    ? SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME)
      .getRange(filaCita, 12, 1, 3).getDisplayValues()[0]
    : [];

  if (accionEsperada === 'ASISTENCIA') {
    if (['SI', 'NO'].indexOf(valorNormalizadoManual_(respuestaCita[0])) !== -1) return;
    const btnSi = obtenerConfig_('WA_BTN_ASISTI', 'pc_asisti');
    const btnNo = obtenerConfig_('WA_BTN_NO_ASISTI', 'pc_no_asisti');

    if (botonId !== btnSi && botonId !== btnNo) {
      return;
    }

    postSheet.getRange(filaPost, 22).setValue(botonId);
    postSheet.getRange(filaPost, 23).setValue(canal);
    postSheet.getRange(filaPost, 10).setValue(botonId === btnSi ? 'SI' : 'NO');
    postSheet.getRange(filaPost, 11).setValue(ahora);

    if (messageId) {
      postSheet.getRange(filaPost, 24).setValue(messageId);
    }

    if (filaCita) {
      actualizarCitaSeguimiento_(filaCita, {
        asistencia: botonId === btnSi ? 'SI' : 'NO',
        proximaAccion: botonId === btnSi ? 'PREGUNTAR ALQUILER' : 'REAGENDAR',
        fechaSeguimiento: ahora
      });
    }

    if (botonId === btnSi) {
      encolarCapiEventoPostCita_(
        idCita,
        valores[4],
        valores[3],
        'ASISTIO',
        'AppointmentAttended'
      );
    }

    if (botonId === btnSi) {
      postSheet.getRange(filaPost, 7).setValue('ESPERANDO_ALQUILER');
      postSheet.getRange(filaPost, 21).setValue('ALQUILER');

      try {
        const envio = enviarBotonesAlquiler_(telefono);
        postSheet.getRange(filaPost, 12).setValue(ahora);
        postSheet.getRange(filaPost, 18).setValue('ENVIADO');
        postSheet.getRange(filaPost, 24).setValue(envio.messageId || messageId || '');
      } catch (error) {
        postSheet.getRange(filaPost, 26).setValue('Alquiler WA: ' + error.message);
      }

    } else {
      postSheet.getRange(filaPost, 7).setValue('REAGENDAR');
      postSheet.getRange(filaPost, 21).setValue('CERRADO');

      try {
        const envio = enviarLinkReagendamiento_(telefono, idCita);
        postSheet.getRange(filaPost, 17).setValue(ahora);
        postSheet.getRange(filaPost, 18).setValue('ENVIADO');
        postSheet.getRange(filaPost, 24).setValue(envio.messageId || messageId || '');
      } catch (error) {
        postSheet.getRange(filaPost, 26).setValue('Reagendar WA: ' + error.message);
      }
    }

    return;
  }

  if (accionEsperada === 'ALQUILER') {
    if (['ALQUILO', 'NO ALQUILO'].indexOf(valorNormalizadoManual_(respuestaCita[1])) !== -1) return;
    const btnSi = obtenerConfig_('WA_BTN_ALQUILE', 'pc_alquile');
    const btnNo = obtenerConfig_('WA_BTN_NO_ALQUILE', 'pc_no_alquile');

    if (botonId !== btnSi && botonId !== btnNo) {
      return;
    }

    postSheet.getRange(filaPost, 22).setValue(botonId);
    postSheet.getRange(filaPost, 23).setValue(canal);
    postSheet.getRange(filaPost, 13).setValue(botonId === btnSi ? 'ALQUILÓ' : 'NO ALQUILÓ');
    postSheet.getRange(filaPost, 14).setValue(ahora);

    if (filaCita) {
      actualizarCitaSeguimiento_(filaCita, {
        resultadoComercial: botonId === btnSi ? 'ALQUILÓ' : 'NO ALQUILÓ',
        proximaAccion: botonId === btnSi ? 'CIERRE COMPLETADO' : 'IDENTIFICAR MOTIVO',
        fechaSeguimiento: ahora
      });
    }

    if (botonId === btnSi) {
      encolarCapiEventoPostCita_(
        idCita,
        valores[4],
        valores[3],
        'ALQUILO',
        'Purchase'
      );
    }

    if (botonId === btnSi) {
      postSheet.getRange(filaPost, 7).setValue('CERRADO_ALQUILO');
      postSheet.getRange(filaPost, 21).setValue('CERRADO');
    } else {
      postSheet.getRange(filaPost, 7).setValue('ESPERANDO_MOTIVO');
      postSheet.getRange(filaPost, 21).setValue('MOTIVO');

      try {
        const envio = enviarListaMotivos_(telefono);
        postSheet.getRange(filaPost, 18).setValue('ENVIADO');
        postSheet.getRange(filaPost, 24).setValue(envio.messageId || '');
      } catch (error) {
        postSheet.getRange(filaPost, 26).setValue('Motivo WA: ' + error.message);
      }
    }

    return;
  }

  if (accionEsperada === 'MOTIVO') {
    if (String(respuestaCita[2] || '').trim()) return;
    const motivo = motivoNormalizadoPorId_(botonId);

    if (!motivo) {
      return;
    }

    postSheet.getRange(filaPost, 15).setValue(motivo);
    postSheet.getRange(filaPost, 16).setValue(ahora);
    postSheet.getRange(filaPost, 7).setValue('CERRADO_NO_ALQUILO');
    postSheet.getRange(filaPost, 21).setValue('CERRADO');
    postSheet.getRange(filaPost, 22).setValue(botonId);
    postSheet.getRange(filaPost, 23).setValue(canal);

    if (filaCita) {
      actualizarCitaSeguimiento_(filaCita, {
        motivoNoAlquiler: motivo,
        proximaAccion: 'SEGUIMIENTO ' + motivo,
        fechaSeguimiento: ahora
      });
    }
  }
}

function motivoNormalizadoPorId_(id) {
  const mapa = {};
  mapa[obtenerConfig_('MOTIVO_PRECIO', 'mot_precio')] = 'PRECIO';
  mapa[obtenerConfig_('MOTIVO_NO_VESTIDO', 'mot_no_vestido')] = 'NO ENCONTRÓ VESTIDO';
  mapa[obtenerConfig_('MOTIVO_OTRAS_TIENDAS', 'mot_otras_tiendas')] = 'VISITARÁ OTRAS TIENDAS';
  mapa[obtenerConfig_('MOTIVO_CONSULTAR', 'mot_consultar')] = 'DEBE CONSULTAR';
  mapa[obtenerConfig_('MOTIVO_FECHA_EVENTO', 'mot_fecha_evento')] = 'FECHA EVENTO';
  mapa[obtenerConfig_('MOTIVO_TALLA_DISENO', 'mot_talla_diseno')] = 'TALLA/DISEÑO/AJUSTE';
  mapa[obtenerConfig_('MOTIVO_OTRO', 'mot_otro')] = 'OTRO';

  return mapa[String(id || '').trim()] || '';
}

function buscarFilaCitaPorId_(idCita) {
  const sheet = SpreadsheetApp
    .openById(SPREADSHEET_ID)
    .getSheetByName(SHEET_NAME);

  return sheet ? buscarFilaPorId(sheet, idCita) : 0;
}

function actualizarCitaSeguimiento_(fila, cambios) {
  const sheet = SpreadsheetApp
    .openById(SPREADSHEET_ID)
    .getSheetByName(SHEET_NAME);

  if (!sheet || !fila) {
    return;
  }

  if (cambios.asistencia !== undefined) {
    sheet.getRange(fila, 12).setValue(cambios.asistencia);
  }

  if (cambios.resultadoComercial !== undefined) {
    sheet.getRange(fila, 13).setValue(cambios.resultadoComercial);
  }

  if (cambios.motivoNoAlquiler !== undefined) {
    sheet.getRange(fila, 14).setValue(cambios.motivoNoAlquiler);
  }

  if (cambios.proximaAccion !== undefined) {
    sheet.getRange(fila, 15).setValue(cambios.proximaAccion);
  }

  if (cambios.fechaSeguimiento !== undefined) {
    sheet.getRange(fila, 16).setValue(cambios.fechaSeguimiento);
  }

  actualizarDashboardMetricas_();
}

/* ------------------------------ EMAIL RESPALDO ------------------------------ */

function obtenerSecretoPostCita_() {
  const props = PropertiesService.getScriptProperties();
  let secreto = props.getProperty('POST_CITA_LINK_SECRET');
  if (!secreto) {
    secreto = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('POST_CITA_LINK_SECRET', secreto);
  }
  return secreto;
}

function firmarRespuestaPostCita_(idCita, accion) {
  const bytes = Utilities.computeHmacSha256Signature(
    String(idCita || '') + '|' + String(accion || ''),
    obtenerSecretoPostCita_()
  );
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function construirEnlaceRespuestaPostCita_(idCita, accion) {
  const base = ScriptApp.getService().getUrl();
  if (!base) throw new Error('La aplicación web no tiene URL activa.');
  return base +
    '?pc_id=' + encodeURIComponent(String(idCita || '')) +
    '&pc_action=' + encodeURIComponent(String(accion || '')) +
    '&pc_sig=' + encodeURIComponent(firmarRespuestaPostCita_(idCita, accion));
}

function escaparHtml_(texto) {
  return String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function paginaPostCita_(titulo, cuerpo) {
  return HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;max-width:560px;margin:40px auto;text-align:center">' +
    '<h2>' + escaparHtml_(titulo) + '</h2>' + cuerpo +
    '<p style="font-size:12px;color:#666">Ámbar Couture</p></div>'
  );
}

function botonPostCitaHtml_(texto, url) {
  return '<a href="' + escaparHtml_(url) + '" style="display:inline-block;padding:12px 18px;' +
    'border:1px solid #222;border-radius:6px;text-decoration:none;margin:6px">' +
    escaparHtml_(texto) + '</a>';
}

function procesarRespuestaEmailDirecta_(idCita, accion, firma) {
  const id = String(idCita || '').trim();
  const respuesta = String(accion || '').trim();
  if (!id || firma !== firmarRespuestaPostCita_(id, respuesta)) {
    return paginaPostCita_('Enlace inválido', '<p>Solicita un nuevo enlace a Ámbar Couture.</p>');
  }

  const botones = ['pc_asisti', 'pc_no_asisti', 'pc_alquile', 'pc_no_alquile'];
  if (botones.indexOf(respuesta) === -1 && !motivoNormalizadoPorId_(respuesta)) {
    return paginaPostCita_('Respuesta inválida', '<p>La opción seleccionada no existe.</p>');
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return paginaPostCita_('Intenta nuevamente', '<p>Estamos procesando otra respuesta.</p>');
  }

  try {
    const postSheet = asegurarHojaPostCita_();
    const fila = buscarFilaPostCitaPorId_(postSheet, id);
    if (!fila) return paginaPostCita_('Cita no encontrada', '<p>Comunícate con Ámbar Couture.</p>');

    procesarRespuestaPostCita_(postSheet, fila, respuesta, 'EMAIL_DIRECTO', '');
    actualizarDashboardMetricas_();

    if (respuesta === 'pc_asisti') {
      return paginaPostCita_('¡Gracias por asistir!', '<p>¿Alquilaste tu vestido?</p>' +
        botonPostCitaHtml_('Sí, alquilé', construirEnlaceRespuestaPostCita_(id, 'pc_alquile')) +
        botonPostCitaHtml_('No alquilé', construirEnlaceRespuestaPostCita_(id, 'pc_no_alquile')));
    }

    if (respuesta === 'pc_no_asisti') {
      const link = obtenerLinkReagendamiento_(id, true);
      return paginaPostCita_('Te esperamos en una nueva fecha', '<p>Puedes reprogramar tu cita aquí:</p>' +
        botonPostCitaHtml_('Reprogramar cita', link));
    }

    if (respuesta === 'pc_no_alquile') {
      const motivos = [
        ['Precio', 'mot_precio'], ['No encontré vestido', 'mot_no_vestido'],
        ['Visitaré otras tiendas', 'mot_otras_tiendas'], ['Debo consultarlo', 'mot_consultar'],
        ['Fecha del evento', 'mot_fecha_evento'], ['Talla / diseño / ajuste', 'mot_talla_diseno'],
        ['Otro', 'mot_otro']
      ];
      return paginaPostCita_('Ayúdanos a entender', '<p>¿Cuál fue el motivo principal?</p>' +
        motivos.map(function(m) {
          return botonPostCitaHtml_(m[0], construirEnlaceRespuestaPostCita_(id, m[1]));
        }).join(''));
    }

    return paginaPostCita_('¡Gracias!', '<p>Tu respuesta quedó registrada correctamente.</p>');
  } finally {
    lock.releaseLock();
  }
}

function notificarReprogramacion_(sheet, fila, datos) {
  const resultado = {email: false, whatsapp: null};

  // ERP: el ERP ya le envía al cliente un correo por cada cambio de su cita;
  // este correo solo se mantiene para reservas de Cal.com, para no duplicarlo.
  if (datos && datos.correo && datos.origen !== 'ERP') {
    GmailApp.sendEmail(
      datos.correo,
      'Ámbar Couture | Cita reprogramada',
      'Tu cita fue reprogramada para el ' + datos.fechaCita + ' a las ' + datos.horaCita +
      ' en ' + (datos.sede || SEDE) + '.',
      {name: 'Ámbar Couture'}
    );
    resultado.email = true;
  }

  resultado.whatsapp = enviarConfirmacionCitaSiPendiente_(sheet, fila, datos);
  return resultado;
}

/* ----------------------------- CAL.COM APOYO ----------------------------- */

function obtenerDuracionCitaMin_() {
  const guardada = parseInt(
    obtenerPropiedad_('CAL_EVENT_DURATION_MIN', ''),
    10
  );

  if (guardada > 0) {
    return guardada;
  }

  const apiKey = obtenerPropiedad_('CAL_API_KEY', '');

  if (!apiKey) {
    return 60;
  }

  try {
    const respuesta = UrlFetchApp.fetch(
      'https://api.cal.com/v2/event-types/' + EVENT_TYPE_ID,
      {
        method: 'get',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'cal-api-version': CAL_API_VERSION_EVENT_TYPE
        },
        muteHttpExceptions: true
      }
    );

    if (respuesta.getResponseCode() === 200) {
      const data = JSON.parse(respuesta.getContentText());
      const minutos = parseInt(
        data && data.data ? data.data.lengthInMinutes : 0,
        10
      );

      if (minutos > 0) {
        PropertiesService
          .getScriptProperties()
          .setProperty('CAL_EVENT_DURATION_MIN', String(minutos));
        return minutos;
      }
    }
  } catch (error) {
    console.warn('No se pudo obtener duración Cal.com: ' + error.message);
  }

  return 60;
}

function obtenerLinkReagendamiento_(bookingUid, omitirGmail) {
  const uid = String(bookingUid || '').trim();

  if (!uid) {
    return '';
  }

  // ERP: si la cita es del ERP, se usa su enlace privado de reprogramación
  // (guardado en LINK REPROGRAMACIÓN o recuperado del WEBHOOK_LOG).
  const guardado = enlaceReprogramacionGuardado_(uid);
  if (esEnlaceERP_(guardado)) return guardado;
  const desdeLog = recuperarEnlaceReprogramacionDesdeLog_(uid);
  if (esEnlaceERP_(desdeLog)) return desdeLog;

  if (!omitirGmail) {
    // Fuera de POST-CITA se conserva el comportamiento existente.
    const linkCorreo = buscarLinkReagendamientoEnGmail_(uid);
    if (linkCorreo) {
      return linkCorreo;
    }
  }

  // Respaldo compatible con el flujo estándar de Cal.com.
  // Si el usuario tiene una URL pública específica de reprogramación puede
  // guardarla en CAL_RESCHEDULE_BASE_URL.
  const base = obtenerPropiedad_('CAL_RESCHEDULE_BASE_URL', 'https://cal.com/reschedule');
  return base.replace(/\/$/, '') + '/' + encodeURIComponent(uid);
}

function buscarLinkReagendamientoEnGmail_(bookingUid) {
  try {
    const consultas = [
      'from:(hello@cal.com) "' + bookingUid + '"',
      'from:(cal.com) "' + bookingUid + '"',
      '"' + bookingUid + '"'
    ];

    for (let q = 0; q < consultas.length; q++) {
      const threads = GmailApp.search(consultas[q], 0, 10);

      for (let i = 0; i < threads.length; i++) {
        const mensajes = threads[i].getMessages();

        for (let j = mensajes.length - 1; j >= 0; j--) {
          const html = mensajes[j].getBody();
          const texto = mensajes[j].getPlainBody();
          const combinado = String(html || '') + '\n' + String(texto || '');

          const urls = combinado.match(/https?:\/\/[^\s"'<>]+/g) || [];

          for (let k = 0; k < urls.length; k++) {
            const url = urls[k].replace(/&amp;/g, '&');
            if (/reschedul/i.test(url) && url.indexOf(bookingUid) !== -1) {
              return url;
            }
          }
        }
      }
    }
  } catch (error) {
    console.warn('No se pudo buscar link de reprogramación en Gmail: ' + error.message);
  }

  return '';
}

function parsearFechaHoraCita_(fechaTexto, horaTexto) {
  const f = String(fechaTexto || '').trim();
  const h = String(horaTexto || '').trim().toUpperCase();

  const mFecha = f.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const mHora = h.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);

  if (!mFecha || !mHora) {
    return null;
  }

  let hora = parseInt(mHora[1], 10);
  const minuto = parseInt(mHora[2], 10);
  const ampm = mHora[3];

  if (ampm === 'PM' && hora !== 12) {
    hora += 12;
  }

  if (ampm === 'AM' && hora === 12) {
    hora = 0;
  }

  // Crea la fecha como hora local de Colombia. El proyecto ya está configurado
  // en America/Bogota, por lo que new Date usa esa zona en Apps Script.
  return new Date(
    parseInt(mFecha[3], 10),
    parseInt(mFecha[2], 10) - 1,
    parseInt(mFecha[1], 10),
    hora,
    minuto,
    0,
    0
  );
}

/* ------------------------------- LOGS ------------------------------- */

function registrarLogTecnico_(tipo, objeto) {
  try {
    const sheet = SpreadsheetApp
      .openById(SPREADSHEET_ID)
      .getSheetByName(WEBHOOK_LOG_SHEET);

    if (!sheet) {
      return;
    }

    let texto = '';
    try {
      texto = JSON.stringify(objeto || {});
    } catch (_) {
      texto = String(objeto || '');
    }

    // Nunca registrar tokens aunque una excepción futura los incluya por error.
    texto = texto
      .replace(/EA[A-Za-z0-9_-]{30,}/g, '[TOKEN_OCULTO]')
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [TOKEN_OCULTO]');

    sheet.appendRow([
      new Date(),
      tipo,
      texto
    ]);
  } catch (error) {
    console.warn('No se pudo escribir WEBHOOK_LOG: ' + error.message);
  }
}

function registrarEstadoMensajeWhatsApp_(status) {
  const id = String(status && status.id || '');
  const estado = String(status && status.status || '');

  registrarLogTecnico_('META_STATUS_' + estado.toUpperCase(), {
    id: id,
    status: estado,
    timestamp: status && status.timestamp ? status.timestamp : ''
  });
}

function actualizarEstadoConfigConexion_(nuevoEstado) {
  try {
    const sheet = SpreadsheetApp
      .openById(SPREADSHEET_ID)
      .getSheetByName(CONFIG_SHEET);

    if (!sheet || sheet.getLastRow() < 2) {
      return;
    }

    const datos = sheet
      .getRange(2, 1, sheet.getLastRow() - 1, 4)
      .getValues();

    for (let i = 0; i < datos.length; i++) {
      if (String(datos[i][0] || '').trim() === 'CANAL_WHATSAPP') {
        sheet.getRange(i + 2, 3).setValue(nuevoEstado);
      }

      if (String(datos[i][0] || '').trim() === 'PHONE_NUMBER_ID') {
        sheet.getRange(i + 2, 2).setValue(
          obtenerPropiedad_('META_WA_PHONE_NUMBER_ID', '')
        );
        sheet.getRange(i + 2, 3).setValue('CONFIRMADO');
      }
    }
  } catch (error) {
    console.warn('No se pudo actualizar CONFIG_AUTOMATIZACION: ' + error.message);
  }
}
function suscribirAppWhatsAppAWABA() {
  const props = PropertiesService.getScriptProperties();

  const token = props.getProperty('META_WA_TOKEN');
  const wabaId = props.getProperty('META_WA_WABA_ID');

  if (!token || !wabaId) {
    throw new Error('Faltan META_WA_TOKEN o META_WA_WABA_ID');
  }

  const url =
    'https://graph.facebook.com/v26.0/' +
    wabaId +
    '/subscribed_apps';

  // Suscribir la aplicación a la WABA
  const respuesta = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: {
      Authorization: 'Bearer ' + token
    },
    muteHttpExceptions: true
  });

  console.log('SUSCRIPCIÓN HTTP: ' + respuesta.getResponseCode());
  console.log(respuesta.getContentText());

  // Verificar inmediatamente
  const verificacion = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      Authorization: 'Bearer ' + token
    },
    muteHttpExceptions: true
  });

  console.log('VERIFICACIÓN HTTP: ' + verificacion.getResponseCode());
  console.log(verificacion.getContentText());
}
function corregirWebhookWhatsApp() {
  const props = PropertiesService.getScriptProperties();

  const token = props.getProperty('META_WA_TOKEN');
  const wabaId = props.getProperty('META_WA_WABA_ID');
  const verifyToken = props.getProperty('META_WA_VERIFY_TOKEN');

  const callbackUrl = 'https://script.google.com/macros/s/AKfycbw9z3dX8owhXcFqE04yLtccHBxcTIKniA8eAOZgouNzQ1jNbBONAK8hUVvAIQg5Nw9N5g/exec';

  if (!token) throw new Error('Falta META_WA_TOKEN');
  if (!wabaId) throw new Error('Falta META_WA_WABA_ID');
  if (!verifyToken) throw new Error('Falta META_WA_VERIFY_TOKEN');
  if (!callbackUrl) throw new Error('No existe URL de aplicación web');

  if (!/\/exec$/.test(callbackUrl)) {
    throw new Error(
      'La URL obtenida no termina en /exec. No se modificó Meta. URL: ' +
      callbackUrl
    );
  }

  console.log('URL CALLBACK: ' + callbackUrl);

  const url =
    'https://graph.facebook.com/v26.0/' +
    wabaId +
    '/subscribed_apps';

  const respuesta = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + token
    },
    payload: JSON.stringify({
      override_callback_uri: callbackUrl,
      verify_token: verifyToken
    }),
    muteHttpExceptions: true
  });

  const codigo = respuesta.getResponseCode();
  const texto = respuesta.getContentText();

  console.log('SUSCRIPCIÓN CALLBACK HTTP: ' + codigo);
  console.log(texto);

  if (codigo < 200 || codigo >= 300) {
    throw new Error(
      'Meta rechazó la configuración: HTTP ' +
      codigo +
      ' - ' +
      texto
    );
  }

  const verificacion = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      Authorization: 'Bearer ' + token
    },
    muteHttpExceptions: true
  });

  console.log(
    'VERIFICACIÓN CALLBACK HTTP: ' +
    verificacion.getResponseCode()
  );

  console.log(verificacion.getContentText());
}function configurarWebhookMetaDefinitivo() {
  const props = PropertiesService.getScriptProperties();

  const appId = props.getProperty('META_APP_ID');
  const appSecret = props.getProperty('META_APP_SECRET');
  const verifyToken = props.getProperty('META_WA_VERIFY_TOKEN');
  const waToken = props.getProperty('META_WA_TOKEN');
  const wabaId = props.getProperty('META_WA_WABA_ID');

  const callbackUrl =
    'https://script.google.com/macros/s/AKfycbw9z3dX8owhXcFqE04yLtccHBxcTIKniA8eAOZgouNzQ1jNbBONAK8hUVvAIQg5Nw9N5g/exec';

  if (!appId) throw new Error('Falta META_APP_ID');
  if (!appSecret) throw new Error('Falta META_APP_SECRET');
  if (!verifyToken) throw new Error('Falta META_WA_VERIFY_TOKEN');
  if (!waToken) throw new Error('Falta META_WA_TOKEN');
  if (!wabaId) throw new Error('Falta META_WA_WABA_ID');

  // 1. Configura el producto Webhooks de la APP:
  // whatsapp_business_account -> messages
  const appUrl =
    'https://graph.facebook.com/v26.0/' +
    appId +
    '/subscriptions';

  const appAccessToken = appId + '|' + appSecret;

  const respuestaApp = UrlFetchApp.fetch(appUrl, {
    method: 'post',
    headers: {
      Authorization: 'Bearer ' + appAccessToken
    },
    payload: {
      object: 'whatsapp_business_account',
      callback_url: callbackUrl,
      verify_token: verifyToken,
      fields: 'messages',
      include_values: 'true'
    },
    muteHttpExceptions: true
  });

  const codigoApp = respuestaApp.getResponseCode();
  const textoApp = respuestaApp.getContentText();

  console.log('WEBHOOK APP HTTP: ' + codigoApp);
  console.log(textoApp);

  if (codigoApp < 200 || codigoApp >= 300) {
    throw new Error(
      'Falló configuración Webhooks App. HTTP ' +
      codigoApp +
      ': ' +
      textoApp
    );
  }

  // 2. Suscribe la APP a la WABA.
  const wabaUrl =
    'https://graph.facebook.com/v26.0/' +
    wabaId +
    '/subscribed_apps';

  const respuestaWaba = UrlFetchApp.fetch(wabaUrl, {
    method: 'post',
    headers: {
      Authorization: 'Bearer ' + waToken
    },
    muteHttpExceptions: true
  });

  const codigoWaba = respuestaWaba.getResponseCode();
  const textoWaba = respuestaWaba.getContentText();

  console.log('SUSCRIPCIÓN WABA HTTP: ' + codigoWaba);
  console.log(textoWaba);

  if (codigoWaba < 200 || codigoWaba >= 300) {
    throw new Error(
      'Falló suscripción WABA. HTTP ' +
      codigoWaba +
      ': ' +
      textoWaba
    );
  }

  console.log('✅ WEBHOOK META CONFIGURADO COMPLETAMENTE');
}

function asegurarMeetVirtual_(datos) {
  // ERP: las reservas del ERP no crean eventos en Google Calendar. Sin esta salida,
  // la búsqueda caería en "eventos[0]" y modificaría (y notificaría) la cita de OTRA
  // persona. El enlace de Meet de las reservas del ERP lo registra la asesora en el ERP.
  if (datos && datos.origen === 'ERP') {
    return { ok: true, omitido: 'RESERVA_ERP' };
  }

  const modalidad = String(datos && datos.modalidad || '').toLowerCase();
  const esVirtual = modalidad.indexOf('virtual') !== -1;

  try {
    const sede = normalizarTextoAccion_(datos.sede || '');
    const calendarItem = (Calendar.CalendarList.list().items || []).find(function(item) {
      return normalizarTextoAccion_(item.summary || '').indexOf(sede) !== -1 &&
        normalizarTextoAccion_(item.summary || '').indexOf('citas') !== -1;
    });
    if (!calendarItem) throw new Error('No se encontró el calendario de citas de ' + datos.sede);

    const inicio = Utilities.parseDate(
      datos.fechaCita + ' ' + datos.horaCita,
      TIMEZONE,
      'dd/MM/yyyy HH:mm'
    );
    const ventana = 10 * 60 * 1000;
    const eventos = Calendar.Events.list(calendarItem.id, {
      singleEvents: true,
      timeMin: new Date(inicio.getTime() - ventana).toISOString(),
      timeMax: new Date(inicio.getTime() + 70 * 60 * 1000).toISOString(),
      maxResults: 20
    }).items || [];
    const correo = String(datos.correo || '').toLowerCase();
    // El mismo cliente puede tener varias citas consecutivas. Antes se tomaba
    // la primera cita de la ventana, por lo que una reserva podía actualizar
    // la cita anterior. Se exige coincidencia de asistente y hora de inicio.
    const evento = eventos.find(function(item) {
      const esDelCliente = (item.attendees || []).some(function(a) {
        return String(a.email || '').toLowerCase() === correo;
      });
      const inicioEvento = item.start && item.start.dateTime
        ? new Date(item.start.dateTime).getTime()
        : 0;
      return esDelCliente && Math.abs(inicioEvento - inicio.getTime()) < 60000;
    }) || eventos.find(function(item) {
      return (item.attendees || []).some(function(a) {
        return String(a.email || '').toLowerCase() === correo;
      });
    }) || eventos[0];

    if (!evento) throw new Error('No se encontró el evento de Calendar para la cita virtual');
    // Dirección oficial de la sede: CONFIG_AUTOMATIZACION (DIRECCION_<SEDE>) y, si falta, la de respaldo.
    const direccionPorSede = {
      'bogota': 'Carrera 15 #106-76, segundo piso, Molinos Norte, Bogotá',
      'villavicencio': 'Calle 15 #42-21, casa 7, Villavicencio',
      'barranquilla': 'Carrera 54 #84-95, Riomar, Barranquilla',
      'pereira': 'Carrera 17 #9-70, local 101, Pinares, Pereira'
    };
    direccionPorSede[sede] = obtenerConfig_('DIRECCION_' + claveSedeCorreoInterno_(datos.sede || ''), '') || direccionPorSede[sede];
    const cuerpo = esVirtual
      ? {
          location: 'Asesoría virtual por Google Meet',
          conferenceData: evento.conferenceData && (evento.conferenceData.entryPoints || []).length
            ? evento.conferenceData
            : { createRequest: { requestId: 'ambar-virtual-' + String(datos.bookingId || evento.id) } }
        }
      : { location: direccionPorSede[sede] || 'Ámbar Couture' };

    const actualizado = Calendar.Events.patch(cuerpo, calendarItem.id, evento.id, {
      conferenceDataVersion: 1,
      sendUpdates: 'all'
    });

    return {
      ok: true,
      eventId: actualizado.id,
      meet: actualizado.hangoutLink || '',
      modalidad: esVirtual ? 'VIRTUAL' : 'PRESENCIAL'
    };
  } catch (error) {
    console.error('MEET VIRTUAL: ' + error.message);
    return { ok: false, error: error.message };
  }
}

function pruebaModalidadVirtual_() {
  return asegurarMeetVirtual_({ modalidad: 'Presencial en Bogotá' });
}

// Prueba controlada de la única reserva virtual de Bogotá del 24/08/2026.
// No crea reservas ni modifica capacidad; solo completa su enlace Meet.
function probarMeetVirtualBogota() {
  const resultado = asegurarMeetVirtual_({
    sede: 'Bogotá',
    modalidad: 'Asesoría virtual por Google Meet',
    fechaCita: '24/08/2026',
    horaCita: '11:00',
    correo: 'jard139@gmail.com',
    bookingId: 'prueba-virtual-bogota-20260824-1100'
  });
  console.log('PRUEBA MEET BOGOTÁ: ' + JSON.stringify(resultado));
  return resultado;
}


function autorizarCalendarVirtual() {
  return (Calendar.CalendarList.list().items || []).map(function(item) { return item.summary; });
}


function obtenerModalidadReserva_(payload, fuentesRespuestas) {
  // ERP: la modalidad llega explícita (PRESENCIAL / VIRTUAL); se guarda con las
  // mismas etiquetas que ya tiene la columna R.
  if (esReservaERP_(payload)) {
    const modo = String(payload.responses && payload.responses.modalidad || '').toUpperCase();
    return modo === 'VIRTUAL'
      ? 'Asesoría virtual por Google Meet'
      : 'Presencial en ' + (sedeReservaERP_(payload) || SEDE);
  }

  const directa = String(obtenerRespuestaEnFuentes(fuentesRespuestas, [
    'modalidad_atencion',
    'modalidad-de-atencion',
    'modalidad de atención',
    'modalidad de atencion',
    'modalidad'
  ]) || '').trim();
  if (directa) return directa;

  // El enlace exclusivo de fin de semana de Bogotá solo admite atención
  // presencial. Mantener esta regla en el servidor evita celdas vacías
  // cuando Cal.com no envía una pregunta de modalidad en ese enlace.
  const ids = [
    payload && payload.eventTypeId,
    payload && payload.event_type_id,
    payload && payload.eventType && payload.eventType.id,
    payload && payload.booking && payload.booking.eventTypeId
  ].map(function(id) { return String(id || '').trim(); });
  if (ids.indexOf('6958981') !== -1) return 'Presencial en Bogotá';

  const bruto = JSON.stringify(payload || {}).toLowerCase();
  return (bruto.indexOf('virtual') !== -1 || bruto.indexOf('google meet') !== -1)
    ? 'Asesoría virtual por Google Meet'
    : '';
}

function actualizarDashboardMetricas_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const citas = ss.getSheetByName(SHEET_NAME);
  const vitrina = ss.getSheetByName('VITRINA');
  const seguimiento = ss.getSheetByName(SEGUIMIENTO_COMERCIAL_SHEET_);
  if (!citas || !vitrina || !seguimiento) return;

  let dash = ss.getSheetByName('DASHBOARD CITAS');
  if (!dash) dash = ss.insertSheet('DASHBOARD CITAS');
  // A1:D8 contiene filtros históricos (incluye validaciones en B8/D8).
  // La tabla de resultados se mantiene desde la fila 12 para no alterarlos.
  const filaSalida = 12;
  const headers = [
    'ORIGEN', 'SEDE', 'ADMINISTRADORA RESPONSABLE', 'ATENDIDAS', 'NO ALQUILARON',
    'ENTRARON A SEGUIMIENTO', 'SEGUIMIENTO REALIZADO', 'ALQUILER DIRECTO',
    'ALQUILER RECUPERADO', 'SEGUIMIENTOS VENCIDOS', 'CONVERSIÓN',
    'TOTAL REGISTROS', 'ACTUALIZADO'
  ];
  const columnaTotalRegistros = headers.indexOf('TOTAL REGISTROS') + 1;
  const registros = obtenerRegistrosDashboard_(citas, 'CITAS')
    .concat(obtenerRegistrosDashboard_(vitrina, 'VITRINA'));
  const porId = {};
  registros.forEach(function(registro) { porId[registro.idOportunidad] = registro; });
  const grupos = {};
  registros.forEach(function(registro) {
    gruposDashboard_(registro).forEach(function(clave) {
      const grupo = grupos[clave] || (grupos[clave] = nuevoGrupoDashboard_(clave));
      grupo.total += 1;
      if (registro.atendida) grupo.atendidas += 1;
      if (registro.noAlquilo) grupo.noAlquilaron += 1;
      if (registro.alquilerRecuperado) grupo.alquilerRecuperado += 1;
      else if (registro.alquilo) grupo.alquilerDirecto += 1;
    });
  });

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const historial = obtenerFilasDashboard_(seguimiento);
  const yaContadoSeguimiento = {};
  const yaContadoRealizado = {};
  historial.filas.forEach(function(fila) {
    const id = String(fila[historial.indice['ID OPORTUNIDAD']] || '').trim();
    const registro = porId[id];
    if (!registro) return;
    const estado = normalizarDashboard_(fila[historial.indice['ESTADO']]);
    const realizado = normalizarDashboard_(fila[historial.indice['REALIZADO']]);
    gruposDashboard_(registro).forEach(function(clave) {
      const grupo = grupos[clave];
      if (!yaContadoSeguimiento[clave + '|' + id]) {
        grupo.enSeguimiento += 1;
        yaContadoSeguimiento[clave + '|' + id] = true;
      }
      if (realizado === 'SI' && !yaContadoRealizado[clave + '|' + id]) {
        grupo.seguimientoRealizado += 1;
        yaContadoRealizado[clave + '|' + id] = true;
      }
      const fecha = fila[historial.indice['FECHA PROGRAMADA']];
      if (estado === 'PENDIENTE' && realizado !== 'SI' && fecha instanceof Date && fecha < hoy) {
        grupo.vencidos += 1;
      }
    });
  });

  const ahora = new Date();
  const salidaPorClave = {};
  Object.keys(grupos).forEach(function(clave) {
    const grupo = grupos[clave];
    const conversion = grupo.atendidas ? (grupo.alquilerDirecto + grupo.alquilerRecuperado) / grupo.atendidas : 0;
    salidaPorClave[clave] = [grupo.origen, grupo.sede, grupo.asesora, grupo.atendidas, grupo.noAlquilaron,
      grupo.enSeguimiento, grupo.seguimientoRealizado, grupo.alquilerDirecto,
      grupo.alquilerRecuperado, grupo.vencidos, conversion, grupo.total, ahora];
  });
  const salida = Object.keys(grupos).sort(ordenGrupoDashboard_).map(function(clave) {
    return salidaPorClave[clave];
  });
  const resumenSuperior = [
    'TODOS|TOTAL|TOTAL', 'CITA|TOTAL|TOTAL', 'VITRINA|TOTAL|TOTAL',
    'CITA|Barranquilla|TOTAL', 'CITA|Bogotá|TOTAL', 'CITA|Villavicencio|TOTAL'
  ].map(function(clave) { return salidaPorClave[clave]; }).filter(function(fila) { return !!fila; });

  // El resumen ocupa A1:M7; la fila 8 se reserva para filtros con validaciones.
  dash.getRange(1, 1, 7, headers.length).breakApart();
  dash.getRange(1, 1, 7, headers.length).clearContent();
  dash.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (resumenSuperior.length) dash.getRange(2, 1, resumenSuperior.length, headers.length).setValues(resumenSuperior);
  dash.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#5b1235')
    .setFontColor('#ffffff')
    .setWrap(true)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  if (resumenSuperior.length) {
    dash.getRange(2, 1, resumenSuperior.length, headers.length).setVerticalAlignment('middle');
    dash.getRange(2, 2, resumenSuperior.length, headers.length - 1).setHorizontalAlignment('center');
    dash.getRange(2, 1, resumenSuperior.length, headers.length)
      .setBorder(true, true, true, true, true, true, '#d9c4cf', SpreadsheetApp.BorderStyle.SOLID);
    dash.getRange(2, 11, resumenSuperior.length, 1).setNumberFormat('0.0%');
    dash.getRange(2, columnaTotalRegistros, resumenSuperior.length, 1).setNumberFormat('0');
    dash.getRange(2, 13, resumenSuperior.length, 1).setNumberFormat('dd/MM/yyyy HH:mm');
  }

  dash.getRange(filaSalida, 1, dash.getMaxRows() - filaSalida + 1, headers.length).clearContent();
  dash.getRange(filaSalida, 1, 1, headers.length).setValues([headers]);
  if (salida.length) dash.getRange(filaSalida + 1, 1, salida.length, headers.length).setValues(salida);
  dash.getRange(filaSalida, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#5b1235')
    .setFontColor('#ffffff')
    .setWrap(true)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  if (salida.length) {
    dash.getRange(filaSalida + 1, 1, salida.length, headers.length).setVerticalAlignment('middle');
    dash.getRange(filaSalida + 1, 2, salida.length, headers.length - 1).setHorizontalAlignment('center');
    dash.getRange(filaSalida + 1, 1, salida.length, headers.length)
      .setBorder(true, true, true, true, true, true, '#d9c4cf', SpreadsheetApp.BorderStyle.SOLID);
    dash.getRange(filaSalida + 1, 11, salida.length, 1).setNumberFormat('0.0%');
    dash.getRange(filaSalida + 1, columnaTotalRegistros, salida.length, 1).setNumberFormat('0');
    dash.getRange(filaSalida + 1, headers.length, salida.length, 1).setNumberFormat('dd/MM/yyyy HH:mm');
  }
  dash.setRowHeight(filaSalida, 42);
  dash.setColumnWidth(1, 110);
  dash.setColumnWidth(2, 130);
  dash.setColumnWidth(3, 150);
  for (let columna = 4; columna <= headers.length - 1; columna++) {
    dash.setColumnWidth(columna, 115);
  }
  dash.setColumnWidth(headers.length, 145);
}

function normalizarDashboard_(valor) {
  return String(valor || '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

function obtenerFilasDashboard_(hoja) {
  const columnas = Math.max(1, hoja.getLastColumn());
  const valores = hoja.getLastRow() > 0 ? hoja.getRange(1, 1, hoja.getLastRow(), columnas).getValues() : [[]];
  const indice = {};
  (valores[0] || []).forEach(function(encabezado, i) { indice[normalizarDashboard_(encabezado)] = i; });
  return { indice: indice, filas: valores.slice(1) };
}

function valorDashboard_(fila, indice, encabezado) {
  const posicion = indice[encabezado];
  return posicion === undefined ? '' : fila[posicion];
}

function obtenerRegistrosDashboard_(hoja, origen) {
  const datos = obtenerFilasDashboard_(hoja);
  const esCita = origen === 'CITAS';
  return datos.filas.map(function(fila) {
    const id = String(valorDashboard_(fila, datos.indice, esCita ? 'ID CITA' : 'ID VITRINA') || '').trim();
    if (!id) return null;
    const resultado = normalizarDashboard_(valorDashboard_(fila, datos.indice, esCita ? 'RESULTADO COMERCIAL' : 'RESULTADO VISITA'));
    const resultadoFinal = esCita ? '' : normalizarDashboard_(valorDashboard_(fila, datos.indice, 'RESULTADO FINAL'));
    const alquilo = resultado === 'ALQUILO' || resultadoFinal === 'ALQUILO';
    const noAlquilo = resultado === 'NO ALQUILO' || resultadoFinal === 'NO ALQUILO';
    const recuperada = normalizarDashboard_(valorDashboard_(fila, datos.indice, 'RECUPERADA')) === 'SI' ||
      normalizarDashboard_(valorDashboard_(fila, datos.indice, 'RESULTADO RECUPERACION')) === 'ALQUILO';
    return {
      idOportunidad: origen + ':' + id,
      origen: esCita ? 'CITA' : 'VITRINA',
      sede: String(valorDashboard_(fila, datos.indice, 'SEDE') || 'SIN SEDE').trim() || 'SIN SEDE',
      asesora: String(valorDashboard_(fila, datos.indice, 'ADMINISTRADORA RESPONSABLE') || valorDashboard_(fila, datos.indice, 'ASESORA') || 'SIN ADMINISTRADORA').trim() || 'SIN ADMINISTRADORA',
      atendida: esCita ? normalizarDashboard_(valorDashboard_(fila, datos.indice, 'ASISTENCIA')) === 'SI' : (alquilo || noAlquilo || normalizarDashboard_(valorDashboard_(fila, datos.indice, 'ASISTIO REGRESO')) === 'SI'),
      noAlquilo: noAlquilo,
      alquilo: alquilo,
      alquilerRecuperado: alquilo && recuperada
    };
  }).filter(function(registro) { return !!registro; });
}

function gruposDashboard_(registro) {
  return [
    'TODOS|TOTAL|TOTAL',
    registro.origen + '|TOTAL|TOTAL',
    registro.origen + '|' + registro.sede + '|TOTAL',
    registro.origen + '|' + registro.sede + '|' + registro.asesora
  ];
}

function nuevoGrupoDashboard_(clave) {
  const partes = clave.split('|');
  return { origen: partes[0], sede: partes[1], asesora: partes[2], total: 0, atendidas: 0,
    noAlquilaron: 0, enSeguimiento: 0, seguimientoRealizado: 0,
    alquilerDirecto: 0, alquilerRecuperado: 0, vencidos: 0 };
}

function ordenGrupoDashboard_(a, b) {
  const prioridad = function(valor) {
    return valor.indexOf('TODOS|') === 0 ? '0' : valor.indexOf('|TOTAL|TOTAL') > -1 ? '1' : valor.indexOf('|TOTAL') > -1 ? '2' : '3';
  };
  return (prioridad(a) + a).localeCompare(prioridad(b) + b);
}

function actualizarDashboardMetricas() {
  actualizarDashboardMetricas_();
  return 'DASHBOARD CITAS actualizado';
}

/* ============================================================================
 * PREPARACIÓN LOCAL — ESTRUCTURA Y SEGUIMIENTO MANUAL CITAS / VITRINA
 *
 * No es un activador y no envía mensajes.  La aplicación real exige pasar
 * { aplicar: true }; sin ello solamente devuelve una vista previa.
 * ============================================================================ */

const MANUAL_CITAS_HEADERS_ = {
  id: ['ID CITA', 'ID', 'BOOKING ID'],
  asesora: ['ADMINISTRADORA RESPONSABLE', 'ASESORA'],
  asistencia: ['ASISTENCIA'],
  resultado: ['RESULTADO COMERCIAL', 'RESULTADO'],
  motivo: ['MOTIVO NO ALQUILER', 'MOTIVO'],
  proximaAccion: ['PRÓXIMA ACCIÓN', 'PROXIMA ACCION']
};

const MANUAL_VITRINA_HEADERS_ = {
  id: ['ID VITRINA', 'ID'],
  fechaEvento: ['FECHA EVENTO'],
  resultadoVisita: ['RESULTADO VISITA'],
  motivo: ['MOTIVO NO ALQUILER'],
  seguimiento: ['SEGUIMIENTO'],
  resultadoFinal: ['RESULTADO FINAL'],
  estadoFinal: ['ESTADO FINAL'],
  observaciones: ['OBSERVACIONES']
};

const SEGUIMIENTO_COMERCIAL_SHEET_ = 'SEGUIMIENTO COMERCIAL';
const SEGUIMIENTO_COMERCIAL_FLAG_ = 'SEGUIMIENTO_COMERCIAL_HABILITADO';
const SEGUIMIENTO_VISIBLE_HEADERS_ = ['FECHA SEGUIMIENTO', '¿SE REALIZÓ?', 'OBSERVACIÓN', 'RESULTADO SEGUIMIENTO', 'OBSERVACIÓN FINAL'];
const SEGUIMIENTO_HISTORY_HEADERS_ = [
  'ID OPORTUNIDAD', 'ID REGISTRO', 'ID ETAPA', 'ORIGEN', 'ETAPA',
  'FECHA PROGRAMADA', 'ESTADO', 'REALIZADO', 'OBSERVACIÓN', 'RESPONSABLE',
  'CREADO EN', 'ACTUALIZADO EN', 'REALIZADO EN', 'MOTIVO ORIGINAL',
  'RESULTADO SEGUIMIENTO', 'OBSERVACIÓN FINAL', 'ID NUEVA RESERVA', 'CIERRE/PAUSA'
];
const RESULTADOS_SEGUIMIENTO_ = ['EN SEGUIMIENTO', 'ALQUILÓ', 'AGENDÓ NUEVA CITA', 'DESISTIÓ', 'CERRADO SIN RESPUESTA', 'NO CONTACTAR', 'EVENTO FINALIZADO'];

function moduloSeguimientoComercialHabilitado_() {
  return PropertiesService.getScriptProperties().getProperty(SEGUIMIENTO_COMERCIAL_FLAG_) === 'true';
}

function configurarModuloSeguimientoComercial_(activo) {
  PropertiesService.getScriptProperties().setProperty(SEGUIMIENTO_COMERCIAL_FLAG_, activo ? 'true' : 'false');
  return { habilitado: !!activo };
}

function aplicarSeguimientoAprobado_() {
  return ajustarEstructuraSeguimientoManual_({ aplicar: true });
}

function activarSeguimientoAprobado_() {
  return configurarModuloSeguimientoComercial_(true);
}

// Envoltorios públicos: Apps Script no muestra en el selector nombres con _.
function VistaPreviaSeguimientoComercial() {
  return vistaPreviaAjusteEstructuraSeguimientoManual_();
}

function AplicarSeguimientoComercial() {
  return aplicarSeguimientoAprobado_();
}

function ActivarSeguimientoComercial() {
  return activarSeguimientoAprobado_();
}

function procesarEdicionSeguimientoComercial(e) {
  return manejarEdicionManualSeguimiento_(e);
}

function actualizarSeguimientoComercialPeriodico() {
  if (!moduloSeguimientoComercialHabilitado_()) return { activo: false };
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const historial = ss.getSheetByName(SEGUIMIENTO_COMERCIAL_SHEET_);
  if (!historial || historial.getLastRow() < 2) return { activo: true, revisadas: 0 };
  const info = mapaSeguimientoHistorial_(historial);
  const col = function(nombre) { return columnaManual_(info.mapa, [nombre]); };
  const filas = historial.getRange(2, 1, historial.getLastRow() - 1, info.total).getValues();
  const oportunidades = {};
  filas.forEach(function(fila) { oportunidades[String(fila[col('ID OPORTUNIDAD') - 1] || '')] = true; });
  Object.keys(oportunidades).forEach(function(oportunidad) {
    const partes = oportunidad.split(':');
    const sheet = ss.getSheetByName(partes[0]);
    if (!sheet) return;
    const datos = sheet.getDataRange().getValues();
    const fuente = mapaEncabezadosManual_(sheet);
    const idCol = columnaManual_(fuente.mapa, partes[0] === 'CITAS' ? MANUAL_CITAS_HEADERS_.id : MANUAL_VITRINA_HEADERS_.id);
    for (let i = 1; i < datos.length; i++) {
      if (String(datos[i][idCol - 1] || '') !== partes.slice(1).join(':')) continue;
      const resultado = resultadoComercialSeguimiento_(partes[0], datos[i], fuente);
      if (valorNormalizadoManual_(resultado) === 'ALQUILO') cerrarSeguimientoResultado_(historial, oportunidad, 'ALQUILÓ', '');
      const visibles = columnasVisiblesSeguimiento_(fuente);
      const fecha = datos[i][visibles[normalizarEncabezadoManual_('FECHA SEGUIMIENTO')] - 1];
      const etapa = etapaVisibleSeguimiento_(historial, oportunidad, fecha);
      if (etapa) sheet.getRange(i + 1, visibles[normalizarEncabezadoManual_('¿SE REALIZÓ?')]).setBackground(colorEstadoSeguimiento_(etapa.item.fila[col('ESTADO') - 1], etapa.item.fila[col('REALIZADO') - 1], etapa.fecha, null, etapa.item.fila[col('RESULTADO SEGUIMIENTO') - 1]));
      break;
    }
  });
  return { activo: true, revisadas: Object.keys(oportunidades).length };
}

function InstalarConexionesSeguimientoComercial() {
  const triggers = ScriptApp.getProjectTriggers();
  const asegurar = function(funcion, tipo) {
    if (triggers.some(function(t) { return t.getHandlerFunction() === funcion; })) return false;
    const creador = ScriptApp.newTrigger(funcion);
    if (tipo === 'edit') creador.forSpreadsheet(SPREADSHEET_ID).onEdit().create();
    else creador.timeBased().everyMinutes(5).create();
    return true;
  };
  return { edicionCreado: asegurar('procesarEdicionSeguimientoComercial', 'edit'), periodicoCreado: asegurar('actualizarSeguimientoComercialPeriodico', 'time') };
}

function normalizarEncabezadoManual_(valor) {
  return String(valor || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function mapaEncabezadosManual_(sheet) {
  const total = Math.max(1, sheet.getLastColumn());
  const headers = sheet.getRange(1, 1, 1, total).getDisplayValues()[0];
  const mapa = {};
  headers.forEach(function(header, indice) {
    const clave = normalizarEncabezadoManual_(header);
    if (clave && !mapa[clave]) mapa[clave] = indice + 1;
  });
  return { headers: headers, mapa: mapa, total: total };
}

function columnaManual_(mapa, alternativas) {
  for (let i = 0; i < alternativas.length; i++) {
    const columna = mapa[normalizarEncabezadoManual_(alternativas[i])];
    if (columna) return columna;
  }
  return 0;
}

function filaVitrinaReal_(valores, columnaId) {
  return valores.some(function(valor, indice) {
    return indice + 1 !== columnaId && String(valor || '').trim() !== '';
  });
}

function nuevoIdVitrina_() {
  return 'VIT-' + Utilities.getUuid();
}

function planAjusteEstructuraSeguimientoManual_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const plan = { hojas: {}, errores: [] };

  ['CITAS', 'VITRINA'].forEach(function(nombre) {
    if (!ss.getSheetByName(nombre)) plan.errores.push('No existe la hoja ' + nombre + '.');
  });
  if (plan.errores.length) return plan;

  const citas = ss.getSheetByName('CITAS');
  const vitrina = ss.getSheetByName('VITRINA');
  const citasInfo = mapaEncabezadosManual_(citas);
  const vitrinaInfo = mapaEncabezadosManual_(vitrina);
  const citasAsesora = columnaManual_(citasInfo.mapa, MANUAL_CITAS_HEADERS_.asesora);
  const vitrinaFecha = columnaManual_(vitrinaInfo.mapa, MANUAL_VITRINA_HEADERS_.fechaEvento);
  const vitrinaId = columnaManual_(vitrinaInfo.mapa, MANUAL_VITRINA_HEADERS_.id);
  const filasVitrina = vitrina.getLastRow() > 1
    ? vitrina.getRange(2, 1, vitrina.getLastRow() - 1, vitrinaInfo.total).getDisplayValues()
    : [];
  const idsPendientes = filasVitrina.reduce(function(total, fila) {
    return total + (filaVitrinaReal_(fila, vitrinaId) && (!vitrinaId || !String(fila[vitrinaId - 1] || '').trim()) ? 1 : 0);
  }, 0);

  const visiblesFaltantes = function(info) {
    return SEGUIMIENTO_VISIBLE_HEADERS_.filter(function(header) {
      return !info.mapa[normalizarEncabezadoManual_(header)];
    });
  };
  plan.hojas.CITAS = { agregarAsesora: !citasAsesora, camposSeguimientoFaltantes: visiblesFaltantes(citasInfo), columnaActual: citasInfo.total };
  plan.hojas.VITRINA = {
    agregarFechaEvento: !vitrinaFecha,
    agregarIdVitrina: !vitrinaId,
    idsPendientes: idsPendientes,
    camposSeguimientoFaltantes: visiblesFaltantes(vitrinaInfo),
    columnaActual: vitrinaInfo.total
  };
  plan.crearHistorialSeguimiento = !ss.getSheetByName(SEGUIMIENTO_COMERCIAL_SHEET_);
  return plan;
}

function vistaPreviaAjusteEstructuraSeguimientoManual_() {
  return planAjusteEstructuraSeguimientoManual_();
}

function asegurarColumnaManual_(sheet, encabezado) {
  const info = mapaEncabezadosManual_(sheet);
  const existente = info.mapa[normalizarEncabezadoManual_(encabezado)];
  if (existente) return existente;
  const columna = info.total + 1;
  sheet.insertColumnsAfter(info.total, 1);
  sheet.getRange(1, columna).setValue(encabezado);
  return columna;
}

function configurarValidacionesSeguimientoManual_(sheet) {
  if (!SpreadsheetApp.newDataValidation) return;
  const info = mapaEncabezadosManual_(sheet);
  const filas = Math.max(1, sheet.getMaxRows ? sheet.getMaxRows() - 1 : sheet.getLastRow() - 1);
  const listas = {
    'FECHA SEGUIMIENTO': [],
    '¿SE REALIZÓ?': ['NO', 'SÍ'],
    'RESULTADO SEGUIMIENTO': RESULTADOS_SEGUIMIENTO_
  };
  Object.keys(listas).forEach(function(encabezado) {
    const columna = columnaManual_(info.mapa, [encabezado]);
    if (!columna || !listas[encabezado].length) return;
    const validacion = SpreadsheetApp.newDataValidation().requireValueInList(listas[encabezado], true).setAllowInvalid(false).build();
    sheet.getRange(2, columna, filas, 1).setDataValidation(validacion);
  });
}

function ajustarEstructuraSeguimientoManual_(opciones) {
  opciones = opciones || {};
  const plan = planAjusteEstructuraSeguimientoManual_();
  if (!opciones.aplicar || plan.errores.length) return { aplicado: false, vistaPrevia: plan };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const citas = ss.getSheetByName('CITAS');
  const vitrina = ss.getSheetByName('VITRINA');
  const resultado = { aplicado: true, columnasAgregadas: [], idsVitrinaAsignados: 0 };

  if (plan.hojas.CITAS.agregarAsesora) {
    asegurarColumnaManual_(citas, 'ASESORA');
    resultado.columnasAgregadas.push('CITAS.ASESORA');
  }
  plan.hojas.CITAS.camposSeguimientoFaltantes.forEach(function(header) {
    asegurarColumnaManual_(citas, header);
    resultado.columnasAgregadas.push('CITAS.' + header);
  });
  if (plan.hojas.VITRINA.agregarFechaEvento) {
    asegurarColumnaManual_(vitrina, 'FECHA EVENTO');
    resultado.columnasAgregadas.push('VITRINA.FECHA EVENTO');
  }
  if (plan.hojas.VITRINA.agregarIdVitrina) {
    asegurarColumnaManual_(vitrina, 'ID VITRINA');
    resultado.columnasAgregadas.push('VITRINA.ID VITRINA');
  }
  plan.hojas.VITRINA.camposSeguimientoFaltantes.forEach(function(header) {
    asegurarColumnaManual_(vitrina, header);
    resultado.columnasAgregadas.push('VITRINA.' + header);
  });
  if (plan.crearHistorialSeguimiento) {
    const historial = ss.insertSheet(SEGUIMIENTO_COMERCIAL_SHEET_);
    historial.getRange(1, 1, 1, SEGUIMIENTO_HISTORY_HEADERS_.length).setValues([SEGUIMIENTO_HISTORY_HEADERS_]);
    resultado.historialCreado = true;
  }
  configurarValidacionesSeguimientoManual_(citas);
  configurarValidacionesSeguimientoManual_(vitrina);

  const vitrinaInfo = mapaEncabezadosManual_(vitrina);
  const columnaId = columnaManual_(vitrinaInfo.mapa, MANUAL_VITRINA_HEADERS_.id);
  if (vitrina.getLastRow() > 1) {
    const rango = vitrina.getRange(2, 1, vitrina.getLastRow() - 1, vitrinaInfo.total);
    const valores = rango.getValues();
    valores.forEach(function(fila, indice) {
      if (filaVitrinaReal_(fila, columnaId) && !String(fila[columnaId - 1] || '').trim()) {
        fila[columnaId - 1] = nuevoIdVitrina_();
        resultado.idsVitrinaAsignados++;
      }
    });
    rango.setValues(valores);
  }
  return resultado;
}

function valorManual_(fila, columna) {
  return columna ? String(fila[columna - 1] || '').trim() : '';
}

function valorNormalizadoManual_(valor) {
  return normalizarEncabezadoManual_(valor);
}

function intersecaColumnasManual_(rango, columnas) {
  const inicio = rango.getColumn();
  const fin = inicio + rango.getNumColumns() - 1;
  return columnas.some(function(columna) { return columna >= inicio && columna <= fin; });
}

function resolverSeguimientoManualCitas_(fila, columnas) {
  const asistencia = valorNormalizadoManual_(valorManual_(fila, columnas.asistencia));
  const resultado = valorNormalizadoManual_(valorManual_(fila, columnas.resultado));
  const motivo = valorManual_(fila, columnas.motivo);
  const conflictos = [];
  let proximaAccion = '';

  if (asistencia === 'NO' && resultado === 'ALQUILO') {
    conflictos.push('ASISTENCIA NO contradice RESULTADO COMERCIAL ALQUILÓ.');
  } else if (asistencia === 'NO') {
    proximaAccion = 'REAGENDAR';
  } else if (resultado === 'ALQUILO') {
    if (motivo) conflictos.push('ALQUILÓ no debe conservar MOTIVO NO ALQUILER.');
    proximaAccion = 'CIERRE COMPLETADO';
  } else if (resultado === 'NO ALQUILO') {
    proximaAccion = motivo ? 'SEGUIMIENTO ' + motivo : 'IDENTIFICAR MOTIVO';
  } else if (asistencia === 'SI') {
    proximaAccion = 'PREGUNTAR ALQUILER';
  }
  return { conflictos: conflictos, proximaAccion: proximaAccion };
}

function resolverSeguimientoManualVitrina_(fila, columnas) {
  const resultadoVisita = valorNormalizadoManual_(valorManual_(fila, columnas.resultadoVisita));
  const resultadoFinal = valorNormalizadoManual_(valorManual_(fila, columnas.resultadoFinal));
  const motivo = valorManual_(fila, columnas.motivo);
  const conflictos = [];
  if ((resultadoVisita === 'ALQUILO' || resultadoFinal === 'ALQUILO') && motivo) {
    conflictos.push('ALQUILÓ contradice MOTIVO NO ALQUILER.');
  }
  if (resultadoFinal === 'NO ALQUILO' && !motivo && valorNormalizadoManual_(valorManual_(fila, columnas.estadoFinal)) === 'CERRADO') {
    conflictos.push('ESTADO FINAL CERRADO requiere MOTIVO NO ALQUILER cuando no alquiló.');
  }
  return { conflictos: conflictos };
}

function ejecutarConBloqueoSeguimiento_(trabajo) {
  if (typeof LockService === 'undefined') return trabajo();
  const bloqueo = LockService.getScriptLock();
  if (!bloqueo.tryLock(5000)) return { ok: false, motivo: 'Otra edición de seguimiento sigue en curso; intente de nuevo.' };
  try {
    return trabajo();
  } finally {
    bloqueo.releaseLock();
  }
}

function manejarEdicionManualSeguimiento_(e) {
  if (!moduloSeguimientoComercialHabilitado_()) {
    return { ok: true, desactivado: true, cambios: 0, motivo: 'Módulo de seguimiento comercial desactivado.' };
  }
  return ejecutarConBloqueoSeguimiento_(function() {
    return manejarEdicionManualSeguimientoSinBloqueo_(e);
  });
}

function manejarEdicionManualSeguimientoSinBloqueo_(e) {
  if (!e || !e.range) return { ok: false, motivo: 'Evento de edición inválido.' };
  const rango = e.range;
  const sheet = rango.getSheet();
  const nombre = String(sheet.getName() || '').trim().toUpperCase();
  if (nombre !== 'CITAS' && nombre !== 'VITRINA') return { ok: true, ignoradas: 0, cambios: 0, conflictos: [] };

  const info = mapaEncabezadosManual_(sheet);
  const definicion = nombre === 'CITAS' ? MANUAL_CITAS_HEADERS_ : MANUAL_VITRINA_HEADERS_;
  const columnas = {};
  Object.keys(definicion).forEach(function(clave) {
    columnas[clave] = columnaManual_(info.mapa, definicion[clave]);
  });
  const relevantes = nombre === 'CITAS'
    ? [columnas.asistencia, columnas.resultado, columnas.motivo].filter(Boolean)
    : [columnas.resultadoVisita, columnas.resultadoFinal, columnas.motivo, columnas.estadoFinal, columnas.seguimiento].filter(Boolean);
  SEGUIMIENTO_VISIBLE_HEADERS_.forEach(function(header) {
    const columna = columnaManual_(info.mapa, [header]);
    if (columna) relevantes.push(columna);
  });
  if (!intersecaColumnasManual_(rango, relevantes)) {
    return { ok: true, ignoradas: rango.getNumRows(), cambios: 0, conflictos: [], motivo: 'Edición sin campo de seguimiento.' };
  }

  const resumen = { ok: true, procesadas: 0, cambios: 0, conflictos: [] };
  const inicio = Math.max(2, rango.getRow());
  const fin = rango.getRow() + rango.getNumRows() - 1;
  for (let filaNumero = inicio; filaNumero <= fin; filaNumero++) {
    const fila = sheet.getRange(filaNumero, 1, 1, info.total).getValues()[0];
    const id = valorManual_(fila, columnas.id);
    if (!id) {
      resumen.conflictos.push({ fila: filaNumero, mensaje: 'Fila sin ID permanente; no se aplicó transición.' });
      continue;
    }
    if (nombre === 'CITAS') {
      const postSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('POST_CITA');
      const filaPost = postSheet ? buscarFilaPostCitaPorId_(postSheet, id) : 0;
      if (filaPost) {
        const post = postSheet.getRange(filaPost, 1, 1, POST_CITA_HEADERS.length).getValues()[0];
        [
          { columna: columnas.asistencia, valor: post[9], validos: ['SI', 'NO'] },
          { columna: columnas.resultado, valor: post[12], validos: ['ALQUILO', 'NO ALQUILO'] },
          { columna: columnas.motivo, valor: post[14], validos: null }
        ].forEach(function(campo) {
          if (!campo.columna || !campo.valor || !intersecaColumnasManual_(rango, [campo.columna])) return;
          if (campo.validos && campo.validos.indexOf(valorNormalizadoManual_(campo.valor)) === -1) return;
          if (valorNormalizadoManual_(fila[campo.columna - 1]) === valorNormalizadoManual_(campo.valor)) return;
          sheet.getRange(filaNumero, campo.columna).setValue(campo.valor);
          fila[campo.columna - 1] = campo.valor;
          resumen.conflictos.push({ fila: filaNumero, mensaje: 'Se conservó la respuesta ya registrada en POST_CITA.' });
        });
      }
    }
    const resolucion = nombre === 'CITAS'
      ? resolverSeguimientoManualCitas_(fila, columnas)
      : resolverSeguimientoManualVitrina_(fila, columnas);
    resolucion.conflictos.forEach(function(mensaje) {
      resumen.conflictos.push({ fila: filaNumero, mensaje: mensaje });
    });
    if (nombre === 'CITAS' && !resolucion.conflictos.length && resolucion.proximaAccion && columnas.proximaAccion) {
      const actual = valorManual_(fila, columnas.proximaAccion);
      const prioridad = function(valor) {
        const accion = valorNormalizadoManual_(valor);
        if (accion === 'CIERRE COMPLETADO') return 4;
        if (accion.indexOf('SEGUIMIENTO ') === 0) return 3;
        if (accion === 'IDENTIFICAR MOTIVO') return 2;
        if (accion === 'PREGUNTAR ALQUILER' || accion === 'REAGENDAR') return 1;
        return 0;
      };
      if (!actual || (resolucion.proximaAccion !== actual && prioridad(resolucion.proximaAccion) >= prioridad(actual))) {
        sheet.getRange(filaNumero, columnas.proximaAccion).setValue(resolucion.proximaAccion);
        resumen.cambios++;
      }
    }
    const comercial = procesarEdicionBloqueSeguimiento_(sheet, filaNumero, rango);
    if (comercial.conflicto) resumen.conflictos.push({ fila: filaNumero, mensaje: comercial.conflicto });
    resumen.cambios += comercial.cambios || 0;
    resumen.procesadas++;
  }
  return resumen;
}

/* Seguimiento comercial: funciones preparadas, sin activador instalado. */
function fechaSeguimiento_(valor) {
  if (Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor.getTime())) {
    return new Date(valor.getFullYear(), valor.getMonth(), valor.getDate());
  }
  const partes = String(valor || '').trim().match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (!partes) return null;
  const fecha = new Date(Number(partes[3]), Number(partes[2]) - 1, Number(partes[1]));
  return fecha.getFullYear() === Number(partes[3]) && fecha.getMonth() === Number(partes[2]) - 1 && fecha.getDate() === Number(partes[1]) ? fecha : null;
}

function claveFechaSeguimiento_(fecha) {
  return fecha ? [fecha.getFullYear(), ('0' + (fecha.getMonth() + 1)).slice(-2), ('0' + fecha.getDate()).slice(-2)].join('-') : '';
}

function sumarDiasSeguimiento_(fecha, dias) {
  const salida = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  salida.setDate(salida.getDate() + dias);
  return salida;
}

function planCincoSeguimientos_(fechaVisita, fechaEvento) {
  const visita = fechaSeguimiento_(fechaVisita);
  const evento = fechaSeguimiento_(fechaEvento);
  if (!visita || !evento) return { estado: 'REVISAR', motivo: 'FECHA VISITA o FECHA EVENTO incompleta o inválida.', fechas: [null, null, null, null, null] };
  const dias = Math.round((evento.getTime() - visita.getTime()) / 86400000);
  if (dias <= 1) return { estado: 'REVISAR', motivo: 'La fecha de evento debe ser posterior a la visita.', fechas: [null, null, null, null, null] };
  const disponibles = [];
  for (let i = 1; i < dias; i++) disponibles.push(sumarDiasSeguimiento_(visita, i));
  const fechas = [null, null, null, null, null];
  if (dias >= 30) {
    const inicio = sumarDiasSeguimiento_(visita, 2);
    const fin = sumarDiasSeguimiento_(evento, -7);
    const tramo = Math.round((fin.getTime() - inicio.getTime()) / 86400000);
    for (let i = 0; i < 5; i++) fechas[i] = sumarDiasSeguimiento_(inicio, Math.round(tramo * i / 4));
  } else {
    const cantidad = Math.min(5, disponibles.length);
    for (let i = 0; i < cantidad; i++) fechas[i] = disponibles[Math.round((disponibles.length - 1) * i / Math.max(1, cantidad - 1))];
  }
  const usadas = {};
  fechas.forEach(function(fecha, indice) {
    if (!fecha) return;
    const clave = claveFechaSeguimiento_(fecha);
    if (usadas[clave]) fechas[indice] = null;
    else usadas[clave] = true;
  });
  return { estado: 'OK', fechas: fechas, motivo: '' };
}

function mapaSeguimientoHistorial_(sheet) {
  return mapaEncabezadosManual_(sheet);
}

function datosFilaSeguimiento_(sheet, filaNumero) {
  const info = mapaEncabezadosManual_(sheet);
  return { info: info, fila: sheet.getRange(filaNumero, 1, 1, info.total).getValues()[0] };
}

function columnasVisiblesSeguimiento_(info) {
  const salida = {};
  SEGUIMIENTO_VISIBLE_HEADERS_.forEach(function(header) {
    salida[normalizarEncabezadoManual_(header)] = columnaManual_(info.mapa, [header]);
  });
  return salida;
}

function oportunidadSeguimiento_(nombre, fila, info) {
  const esCitas = nombre === 'CITAS';
  const id = columnaManual_(info.mapa, esCitas ? MANUAL_CITAS_HEADERS_.id : MANUAL_VITRINA_HEADERS_.id);
  const valorId = valorManual_(fila, id);
  return valorId ? nombre + ':' + valorId : '';
}

function filasHistorialOportunidad_(historial, oportunidad) {
  const info = mapaSeguimientoHistorial_(historial);
  if (historial.getLastRow() <= 1) return { info: info, filas: [] };
  const valores = historial.getRange(2, 1, historial.getLastRow() - 1, info.total).getValues();
  const colOportunidad = columnaManual_(info.mapa, ['ID OPORTUNIDAD']);
  return { info: info, filas: valores.map(function(fila, indice) { return { fila: fila, numero: indice + 2 }; }).filter(function(item) { return String(item.fila[colOportunidad - 1] || '') === oportunidad; }) };
}

function esElegibleSeguimiento_(nombre, fila, info) {
  if (nombre === 'CITAS') {
    const asistencia = valorNormalizadoManual_(valorManual_(fila, columnaManual_(info.mapa, MANUAL_CITAS_HEADERS_.asistencia)));
    const resultado = valorNormalizadoManual_(valorManual_(fila, columnaManual_(info.mapa, MANUAL_CITAS_HEADERS_.resultado)));
    return asistencia === 'SI' && resultado === 'NO ALQUILO';
  }
  const resultado = valorNormalizadoManual_(valorManual_(fila, columnaManual_(info.mapa, MANUAL_VITRINA_HEADERS_.resultadoVisita)));
  const final = valorNormalizadoManual_(valorManual_(fila, columnaManual_(info.mapa, MANUAL_VITRINA_HEADERS_.resultadoFinal)));
  return resultado === 'NO ALQUILO' || final === 'NO ALQUILO';
}

function crearSeguimientoOportunidad_(sheet, filaNumero) {
  const nombre = String(sheet.getName()).toUpperCase();
  const datos = datosFilaSeguimiento_(sheet, filaNumero);
  if (!esElegibleSeguimiento_(nombre, datos.fila, datos.info)) return { creado: false, motivo: 'La oportunidad no está en seguimiento elegible.' };
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const historial = ss.getSheetByName(SEGUIMIENTO_COMERCIAL_SHEET_);
  if (!historial) return { creado: false, motivo: 'Falta instalar la hoja de historial.' };
  const oportunidad = oportunidadSeguimiento_(nombre, datos.fila, datos.info);
  if (!oportunidad) return { creado: false, motivo: 'Falta ID permanente.' };
  const existentes = filasHistorialOportunidad_(historial, oportunidad);
  if (existentes.filas.length) return { creado: false, existente: true, oportunidad: oportunidad };
  // Conservar Date de Sheets: convertirla a texto impediría validarla en fechaSeguimiento_.
  const columnaFechaVisita = columnaManual_(datos.info.mapa, nombre === 'CITAS' ? ['FECHA CITA'] : ['FECHA VISITA']);
  const columnaFechaEvento = columnaManual_(datos.info.mapa, ['FECHA EVENTO']);
  const fechaVisita = columnaFechaVisita ? datos.fila[columnaFechaVisita - 1] : '';
  const fechaEvento = columnaFechaEvento ? datos.fila[columnaFechaEvento - 1] : '';
  const plan = planCincoSeguimientos_(fechaVisita, fechaEvento);
  const motivo = valorManual_(datos.fila, columnaManual_(datos.info.mapa, nombre === 'CITAS' ? MANUAL_CITAS_HEADERS_.motivo : MANUAL_VITRINA_HEADERS_.motivo));
  const responsable = valorManual_(datos.fila, columnaManual_(datos.info.mapa, ['ADMINISTRADORA RESPONSABLE', 'ASESORA']));
  const ahora = new Date();
  const filas = plan.fechas.map(function(fecha, indice) {
    return [oportunidad, Utilities.getUuid(), oportunidad + ':S' + (indice + 1), nombre, 'S' + (indice + 1), fecha || '', fecha ? 'PENDIENTE' : plan.estado, 'NO', '', responsable, ahora, ahora, '', motivo, 'EN SEGUIMIENTO', '', '', plan.motivo];
  });
  historial.getRange(historial.getLastRow() + 1, 1, filas.length, SEGUIMIENTO_HISTORY_HEADERS_.length).setValues(filas);
  return { creado: true, oportunidad: oportunidad, plan: plan };
}

function colorEstadoSeguimiento_(estado, realizado, fecha, hoy, resultadoSeguimiento) {
  const estadoNorm = valorNormalizadoManual_(estado);
  if (estadoNorm === 'CERRADO' && valorNormalizadoManual_(resultadoSeguimiento) === 'ALQUILO') return '#bbf7d0';
  if (estadoNorm === 'CERRADO' || estadoNorm === 'PAUSADO' || estadoNorm === 'DESACTIVADO' || estadoNorm === 'NO APLICA' || estadoNorm === 'REVISAR') return '#d1d5db';
  if (valorNormalizadoManual_(realizado) === 'SI') return '#bbf7d0';
  const programada = fechaSeguimiento_(fecha);
  const ahora = fechaSeguimiento_(hoy || new Date());
  if (!programada || !ahora) return '#ffffff';
  const diferencia = Math.round((programada.getTime() - ahora.getTime()) / 86400000);
  if (diferencia < 0) return '#fecaca';
  if (diferencia <= 1) return '#fef3c7';
  return '#ffffff';
}

function cerrarSeguimientoResultado_(historial, oportunidad, resultado, idNuevaReserva) {
  const datos = filasHistorialOportunidad_(historial, oportunidad);
  const col = function(nombre) { return columnaManual_(datos.info.mapa, [nombre]); };
  const resultadoNorm = valorNormalizadoManual_(resultado);
  if (resultadoNorm === 'AGENDO NUEVA CITA' && !String(idNuevaReserva || '').trim()) return { ok: false, motivo: 'AGENDÓ NUEVA CITA requiere un ID de reserva identificado.' };
  const accion = resultadoNorm === 'ALQUILO' ? 'CERRADO' : (resultadoNorm === 'AGENDO NUEVA CITA' ? 'PAUSADO' : (resultadoNorm === 'DESISTIO' || resultadoNorm === 'NO CONTACTAR' || resultadoNorm === 'EVENTO FINALIZADO' ? 'DESACTIVADO' : ''));
  if (!accion) return { ok: true, cambios: 0 };
  let cambios = 0;
  datos.filas.forEach(function(item) {
    const hecho = valorNormalizadoManual_(item.fila[col('REALIZADO') - 1]) === 'SI';
    if (hecho) return;
    item.fila[col('ESTADO') - 1] = accion;
    item.fila[col('RESULTADO SEGUIMIENTO') - 1] = resultado;
    item.fila[col('ACTUALIZADO EN') - 1] = new Date();
    item.fila[col('CIERRE/PAUSA') - 1] = accion;
    if (idNuevaReserva) item.fila[col('ID NUEVA RESERVA') - 1] = idNuevaReserva;
    historial.getRange(item.numero, 1, 1, datos.info.total).setValues([item.fila]);
    cambios++;
  });
  return { ok: true, cambios: cambios };
}

function registrarNuevaCitaSeguimiento_(idOportunidad, idNuevaReserva) {
  if (!String(idNuevaReserva || '').trim()) return { ok: false, motivo: 'Se requiere ID de nueva reserva.' };
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const historial = ss.getSheetByName(SEGUIMIENTO_COMERCIAL_SHEET_);
  return historial ? cerrarSeguimientoResultado_(historial, idOportunidad, 'AGENDÓ NUEVA CITA', idNuevaReserva) : { ok: false, motivo: 'Falta historial.' };
}

function resultadoComercialSeguimiento_(nombre, fila, info) {
  const alternativas = nombre === 'CITAS'
    ? MANUAL_CITAS_HEADERS_.resultado
    : [MANUAL_VITRINA_HEADERS_.resultadoFinal[0], MANUAL_VITRINA_HEADERS_.resultadoVisita[0]];
  for (let i = 0; i < alternativas.length; i++) {
    const valor = valorManual_(fila, columnaManual_(info.mapa, [alternativas[i]]));
    if (valor) return valor;
  }
  return '';
}

function actualizarVisibleSeguimiento_(sheet, filaNumero, info, etapa) {
  const visibles = columnasVisiblesSeguimiento_(info);
  const datos = {};
  datos[visibles[normalizarEncabezadoManual_('FECHA SEGUIMIENTO')]] = etapa.fecha || '';
  datos[visibles[normalizarEncabezadoManual_('¿SE REALIZÓ?')]] = etapa.realizado || 'NO';
  datos[visibles[normalizarEncabezadoManual_('OBSERVACIÓN')]] = etapa.observacion || '';
  datos[visibles[normalizarEncabezadoManual_('RESULTADO SEGUIMIENTO')]] = etapa.resultado || 'EN SEGUIMIENTO';
  datos[visibles[normalizarEncabezadoManual_('OBSERVACIÓN FINAL')]] = etapa.observacionFinal || '';
  Object.keys(datos).forEach(function(columna) {
    if (Number(columna)) sheet.getRange(filaNumero, Number(columna)).setValue(datos[columna]);
  });
  const columnaRealizado = visibles[normalizarEncabezadoManual_('¿SE REALIZÓ?')];
  const historial = etapa.datos.info.mapa;
  if (columnaRealizado) {
    sheet.getRange(filaNumero, columnaRealizado).setBackground(colorEstadoSeguimiento_(
      etapa.item.fila[columnaManual_(historial, ['ESTADO']) - 1],
      etapa.item.fila[columnaManual_(historial, ['REALIZADO']) - 1],
      etapa.fecha,
      null,
      etapa.item.fila[columnaManual_(historial, ['RESULTADO SEGUIMIENTO']) - 1]
    ));
  }
}

function etapaVisibleSeguimiento_(historial, oportunidad, fecha) {
  const datos = filasHistorialOportunidad_(historial, oportunidad);
  const col = function(nombre) { return columnaManual_(datos.info.mapa, [nombre]); };
  const clave = claveFechaSeguimiento_(fechaSeguimiento_(fecha));
  const item = datos.filas.filter(function(actual) {
    return clave && claveFechaSeguimiento_(fechaSeguimiento_(actual.fila[col('FECHA PROGRAMADA') - 1])) === clave;
  })[0];
  if (!item) return null;
  return {
    item: item, datos: datos,
    fecha: item.fila[col('FECHA PROGRAMADA') - 1], realizado: item.fila[col('REALIZADO') - 1],
    observacion: item.fila[col('OBSERVACIÓN') - 1], resultado: item.fila[col('RESULTADO SEGUIMIENTO') - 1],
    observacionFinal: item.fila[col('OBSERVACIÓN FINAL') - 1]
  };
}

function siguientePendienteSeguimiento_(historial, oportunidad) {
  const datos = filasHistorialOportunidad_(historial, oportunidad);
  const colEstado = columnaManual_(datos.info.mapa, ['ESTADO']);
  const colFecha = columnaManual_(datos.info.mapa, ['FECHA PROGRAMADA']);
  return datos.filas.filter(function(item) {
    return valorNormalizadoManual_(item.fila[colEstado - 1]) === 'PENDIENTE' && fechaSeguimiento_(item.fila[colFecha - 1]);
  }).sort(function(a, b) {
    return fechaSeguimiento_(a.fila[colFecha - 1]).getTime() - fechaSeguimiento_(b.fila[colFecha - 1]).getTime();
  })[0] || null;
}

function procesarEdicionBloqueSeguimiento_(sheet, filaNumero, rangoEditado) {
  const info = mapaEncabezadosManual_(sheet);
  const visibles = columnasVisiblesSeguimiento_(info);
  const relevantes = Object.keys(visibles).map(function(clave) { return visibles[clave]; }).filter(Boolean);
  if (!intersecaColumnasManual_(rangoEditado, relevantes)) {
    // Un cambio de asistencia/resultado puede abrir la oportunidad, pero nunca manda mensajes.
    const creado = crearSeguimientoOportunidad_(sheet, filaNumero);
    const datos = datosFilaSeguimiento_(sheet, filaNumero);
    const oportunidad = oportunidadSeguimiento_(String(sheet.getName()).toUpperCase(), datos.fila, datos.info);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const historial = ss.getSheetByName(SEGUIMIENTO_COMERCIAL_SHEET_);
    const comercial = resultadoComercialSeguimiento_(String(sheet.getName()).toUpperCase(), datos.fila, datos.info);
    if (historial && oportunidad && valorNormalizadoManual_(comercial) === 'ALQUILO') {
      const cierre = cerrarSeguimientoResultado_(historial, oportunidad, 'ALQUILÓ', '');
      return { cambios: (creado.creado ? 1 : 0) + (cierre.cambios || 0) };
    }
    if (historial && oportunidad && creado.creado) {
      const siguiente = siguientePendienteSeguimiento_(historial, oportunidad);
      if (siguiente) {
        const etapa = etapaVisibleSeguimiento_(historial, oportunidad, siguiente.fila[columnaManual_(mapaSeguimientoHistorial_(historial).mapa, ['FECHA PROGRAMADA']) - 1]);
        actualizarVisibleSeguimiento_(sheet, filaNumero, datos.info, etapa);
      }
    }
    return { cambios: creado.creado ? 1 : 0 };
  }
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const historial = ss.getSheetByName(SEGUIMIENTO_COMERCIAL_SHEET_);
  if (!historial) return { cambios: 0, conflicto: 'Falta instalar el historial de seguimiento.' };
  const fila = sheet.getRange(filaNumero, 1, 1, info.total).getValues()[0];
  const oportunidad = oportunidadSeguimiento_(String(sheet.getName()).toUpperCase(), fila, info);
  if (!oportunidad) return { cambios: 0, conflicto: 'Falta ID permanente para seguimiento.' };
  const creado = crearSeguimientoOportunidad_(sheet, filaNumero);
  const fecha = fila[visibles[normalizarEncabezadoManual_('FECHA SEGUIMIENTO')] - 1];
  let etapa = etapaVisibleSeguimiento_(historial, oportunidad, fecha);
  if (!etapa) return { cambios: creado.creado ? 1 : 0, conflicto: fecha ? 'La fecha elegida no corresponde a una etapa programada.' : '' };
  // Cambiar de fecha es una consulta: primero recuperar su estado y su nota,
  // sin sobrescribirla con los valores que quedaron visibles de otra etapa.
  const columnaFechaVisible = visibles[normalizarEncabezadoManual_('FECHA SEGUIMIENTO')];
  if (intersecaColumnasManual_(rangoEditado, [columnaFechaVisible])) {
    actualizarVisibleSeguimiento_(sheet, filaNumero, info, etapa);
    return { cambios: 1 + (creado.creado ? 1 : 0) };
  }
  const realizado = valorNormalizadoManual_(fila[visibles[normalizarEncabezadoManual_('¿SE REALIZÓ?')] - 1]);
  const observacion = fila[visibles[normalizarEncabezadoManual_('OBSERVACIÓN')] - 1] || '';
  const resultado = fila[visibles[normalizarEncabezadoManual_('RESULTADO SEGUIMIENTO')] - 1] || 'EN SEGUIMIENTO';
  const observacionFinal = fila[visibles[normalizarEncabezadoManual_('OBSERVACIÓN FINAL')] - 1] || '';
  const col = function(nombre) { return columnaManual_(etapa.datos.info.mapa, [nombre]); };
  // Seleccionar fecha o escribir nota guarda la nota, pero no avanza.
  etapa.item.fila[col('OBSERVACIÓN') - 1] = observacion;
  etapa.item.fila[col('RESULTADO SEGUIMIENTO') - 1] = resultado;
  etapa.item.fila[col('OBSERVACIÓN FINAL') - 1] = observacionFinal;
  etapa.item.fila[col('ACTUALIZADO EN') - 1] = new Date();
  if (realizado === 'SI') {
    etapa.item.fila[col('REALIZADO') - 1] = 'SÍ';
    etapa.item.fila[col('ESTADO') - 1] = 'REALIZADO';
    etapa.item.fila[col('REALIZADO EN') - 1] = new Date();
  }
  historial.getRange(etapa.item.numero, 1, 1, etapa.datos.info.total).setValues([etapa.item.fila]);
  const cierre = cerrarSeguimientoResultado_(historial, oportunidad, resultado, '');
  if (!cierre.ok) return { cambios: 1, conflicto: cierre.motivo };
  if (realizado === 'SI') {
    const siguiente = siguientePendienteSeguimiento_(historial, oportunidad);
    if (siguiente) {
      const siguienteEtapa = etapaVisibleSeguimiento_(historial, oportunidad, siguiente.fila[columnaManual_(etapa.datos.info.mapa, ['FECHA PROGRAMADA']) - 1]);
      actualizarVisibleSeguimiento_(sheet, filaNumero, info, siguienteEtapa);
    }
  }
  return { cambios: 1 + (creado.creado ? 1 : 0) };
}

/* ======================= ERP: ENLACE GUARDADO ======================= */

// ERP: enlace guardado en la columna V (LINK REPROGRAMACIÓN) de la cita con ese ID.
function enlaceReprogramacionGuardado_(idCita) {
  const fila = buscarFilaCitaPorId_(idCita);
  if (!fila) return '';
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  return String(sheet.getRange(fila, 22).getDisplayValue() || '').trim();
}
/* ======================= ERP: AGENDA DEL ERP ======================= */

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
