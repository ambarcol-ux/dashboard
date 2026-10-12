# Agenda ERP → CRM Ámbar (para Sergio)

Objetivo: el ERP reemplaza a Cal.com como origen de reservas de primera cita. El CRM de Apps Script sigue registrando CITAS y enviando confirmaciones, recordatorios, POSCITA, correos, dashboard y Meta CAPI. No se copia el script dentro del ERP.

## Cómo llegan las reservas

En vez de que el ERP haga POST al `/exec` público, **el CRM las pide al ERP cada minuto** (`sincronizarAgendaERP`, en `scripts/AMBAR_CRM_AGENDA_ERP.gs`) usando la clave del programador (`ERP_WORKER_SECRET` = `FIRST_VISIT_WORKER_SECRET` de Vercel). Cada evento se pasa por el mismo `procesarWebhookCal_`, así que CITAS, WEBHOOK_LOG y las automatizaciones funcionan igual que con Cal.com. El web app no tiene que aceptar webhooks nuevos sin autenticar.

- El ERP marca un evento como entregado solo si `procesarWebhookCal_` responde `ok: true`; si no, lo reintenta hasta 5 veces.
- Los eventos de una misma cita llegan en orden (la reprogramación nunca antes que el alta).
- Las citas que vinieron del CRM (histórico importado) nunca se devuelven al CRM.

## Formato del evento (compatible con Cal.com)

| Operación ERP | `triggerEvent` | IDs |
| - | - | - |
| Reserva | `BOOKING_CREATED` | `payload.uid` = ID de la cita en el ERP (UUID, estable) |
| Reprogramación | `BOOKING_RESCHEDULED` | `payload.rescheduleUid` = ID original de la cita; `payload.uid` = `<ID>-r<revisión>` |
| Cancelación | `BOOKING_CANCELLED` | `payload.uid` = ID original; `payload.cancellationReason` = motivo |

`rescheduleUid` y la cancelación **siempre** apuntan al ID original, que es el ID principal de la fila en CITAS; no hace falta buscar en `ID CITA NUEVA`.

```json
{
  "triggerEvent": "BOOKING_RESCHEDULED",
  "payload": {
    "uid": "1b6c…-r2",
    "rescheduleUid": "1b6c…",
    "startTime": "2026-10-20T11:00:00-05:00",
    "endTime": "2026-10-20T12:00:00-05:00",
    "title": "Primera cita Ámbar Couture Pereira · PRESENCIAL",
    "sede": "Pereira",
    "sedeId": "c5162e37-6ffa-4cf5-8f25-6104e7f10725",
    "attendees": [{"name": "…", "email": "…", "phoneNumber": "573001234567", "timeZone": "America/Bogota"}],
    "responses": {"Tipo-de-vestido": "Quince", "Fecha-evento-cliente": "2027-03-20", "modalidad": "PRESENCIAL", "sede": "Pereira", "documento": "…"},
    "erp": {
      "origen": "ERP", "citaId": "1b6c…", "revision": 2, "duracionMin": 60, "enlaceVirtual": "",
      "enlaceGestion": "https://erp.ambarcouture.com/agendar-primera-cita/gestionar#…",
      "enlaceReprogramacion": "https://erp.ambarcouture.com/agendar-primera-cita/gestionar?accion=reprogramar#…",
      "enlaceAgenda": "https://erp.ambarcouture.com/agendar-primera-cita?sede=c5162e37-…",
      "enlaceReprogramarPorCedula": "https://erp.ambarcouture.com/reprogramar-primera-cita"
    }
  }
}
```

## Cambios en el CRM

Ya verificados contra el código del CRM (12/10/2026):

1. Pegar `scripts/AMBAR_CRM_AGENDA_ERP.gs` como archivo nuevo (funciones de ayuda + `sincronizarAgendaERP`).
2. En el archivo actual, **reemplazar** (borrar la versión vieja y pegar la nueva) las 13 funciones de `scripts/AMBAR_CRM_CAMBIOS_ERP.gs`, y agregar `enlaceReprogramacionGuardado_`. Cada cambio está marcado con `// ERP:`; las reservas de Cal.com conservan su comportamiento.

| Función | Cambio |
| - | - |
| `extraerDatosReserva` | Usa el enlace de reprogramación del ERP (nunca `cal.com/reschedule`) y marca `origen: 'ERP'`. |
| `obtenerSedeReserva_` | Toma la sede explícita del ERP; no cae en Villavicencio. |
| `obtenerModalidadReserva_` | `Presencial en <sede>` / `Asesoría virtual por Google Meet` desde el campo explícito. |
| `procesarReprogramacion`, `procesarCancelacion` | Observación "desde el ERP"; el respaldo usa la hora anterior exacta (`rescheduleStartTime`). |
| `registrarTrazabilidadNuevaCita_`, `registrarTrazabilidadReprogramacion_` | ORIGEN `ERP` / `REPROGRAMACIÓN ERP`. |
| `recuperarEnlaceReprogramacionDesdeLog_`, `obtenerLinkReagendamiento_` | Recordatorios, WhatsApp "reprogramar" y POSCITA "no asistí" usan el enlace del ERP. |
| `detalleCitaCorreoInterno_` | La agenda del ERP de la sede reemplaza `CAL_LINK_<SEDE>`. |
| `notificarReprogramacion_` | No envía el correo de reprogramación a reservas del ERP (el ERP ya lo envía). |
| `asegurarMeetVirtual_` | Se salta para reservas del ERP: sin evento en Calendar tomaría `eventos[0]`, la cita de otra persona, y la modificaría con aviso a todos. |
| `procesarPostCita_` | Incluye Pereira. |

Notas del código revisado:
- El código pegado venía **duplicado** (todo el archivo dos veces). Si en el proyecto está así, las `const` repetidas impiden que el script corra: dejar una sola copia.
- `enviarEventoScheduleMeta_` y `ambarMetaFinalizeStable_` se usan pero están en otro archivo; revisar que ahí no haya enlaces `cal.com` o `CAL_LINK_`.
- `asegurarMeetVirtual_` interpreta la hora con `'dd/MM/yyyy HH:mm'`, pero CITAS guarda `hh:mm a` (ej. `03:00 PM`); conviene revisarlo también para Cal.com.

## Duplicados a evitar

- El CRM es el responsable de WhatsApp: **no activar** `activarWhatsAppERP` (`scripts/AMBAR_ERP_WHATSAPP.gs`) ni `FIRST_VISIT_MESSAGES_ENABLED` en Vercel.
- El ERP envía al cliente un correo por cada cambio de su cita (`activarCorreosERP`). Si el CRM también le envía correo de confirmación al cliente, dejar solo uno de los dos.

## Prueba y corte

1. Respaldar código, activadores y hoja; comparar con el deployment `/exec` vigente.
2. En un proyecto y hoja aislados (con mensajes externos bloqueados), ejecutar `sincronizarAgendaERP` contra reservas de prueba: alta, reprogramación dos veces, cancelación, sedes (incluida Pereira), virtual y presencial. Revisar CITAS, POST_CITA y WEBHOOK_LOG.
3. En producción, `activarAgendaERP` con una reserva controlada; verificar confirmación, enlace de reprogramación del ERP, recordatorios, POSCITA y CAPI.
4. Luego dejar de recibir reservas nuevas de Cal.com, conservando la lectura de las citas abiertas.
