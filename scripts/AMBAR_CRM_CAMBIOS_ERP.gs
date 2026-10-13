/**
 * ÁMBAR CRM — Funciones modificadas para usar la agenda del ERP en lugar de Cal.com.
 *
 * Instrucciones para Sergio:
 *  1. Pega primero AMBAR_CRM_AGENDA_ERP.gs como archivo nuevo (trae esReservaERP_, enlaceAgendaERP_, etc.).
 *  2. En el archivo actual del CRM, BORRA cada una de estas funciones y pega la versión de este archivo.
 *     No dejes las dos versiones: en Apps Script dos funciones con el mismo nombre se pisan sin avisar.
 *       extraerDatosReserva, obtenerSedeReserva_, obtenerModalidadReserva_,
 *       procesarReprogramacion, procesarCancelacion, registrarTrazabilidadNuevaCita_,
 *       registrarTrazabilidadReprogramacion_, recuperarEnlaceReprogramacionDesdeLog_,
 *       obtenerLinkReagendamiento_, notificarReprogramacion_, detalleCitaCorreoInterno_,
 *       asegurarMeetVirtual_, procesarPostCita_
 *  3. Agrega la función nueva enlaceReprogramacionGuardado_ (al final de este archivo).
 *
 * Cada cambio está marcado con "// ERP:". Las reservas de Cal.com que siguen abiertas
 * conservan exactamente el comportamiento anterior.
 */

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

/* ------------------------------ FUNCIÓN NUEVA ------------------------------ */

// ERP: enlace guardado en la columna V (LINK REPROGRAMACIÓN) de la cita con ese ID.
function enlaceReprogramacionGuardado_(idCita) {
  const fila = buscarFilaCitaPorId_(idCita);
  if (!fila) return '';
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  return String(sheet.getRange(fila, 22).getDisplayValue() || '').trim();
}
