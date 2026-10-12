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

Las funciones de ayuda están en `AMBAR_CRM_AGENDA_ERP.gs`. Los cambios en las funciones existentes son de una o dos líneas y no alteran el flujo de Cal.com: solo actúan si `esReservaERP_(payload)` es verdadero.

1. **Enlace de reprogramación** (`construirEnlaceReprogramacion_`): al inicio,
   ```js
   var enlaceERP = enlaceReprogramacionERP_(payload);
   if (enlaceERP) return enlaceERP;
   ```
   Y en `extraerDatosReserva`, guarda ese valor en la columna de enlace de reprogramación que usan los recordatorios. Nunca construir `https://cal.com/reschedule/...` para una reserva del ERP. Es un enlace privado por cita (vence 30 días después de la cita): no compartirlo entre clientes.

2. **Enlaces de agenda** (`CAL_LINK_*` en mensajes y correos): reemplazar por `enlaceAgendaERP_(sede)`; para "reprogramar sin enlace privado" usar `enlaceReprogramarPorCedulaERP_()`. Las citas de Cal.com que siguen abiertas conservan sus enlaces actuales.

3. **Sede** (`obtenerSedeReserva_`): al inicio,
   ```js
   var sedeERP = sedeReservaERP_(payload);
   if (sedeERP) return sedeERP;
   ```
   Así una reserva del ERP nunca cae por defecto en Villavicencio. Ajusta el formato del valor devuelto (BOGOTA, PEREIRA…) al que usa la hoja.

4. **Modalidad**: usar `payload.responses.modalidad` (`PRESENCIAL`/`VIRTUAL`) en lugar de las inferencias de Cal.com.

5. **Duración** (POSCITA): si `duracionReservaERP_(payload)` > 0, usarla en vez de `CAL_EVENT_DURATION_MIN` o la API de Cal.com.

6. **Meet** (`asegurarMeetVirtual_`): para reservas del ERP no buscar eventos por coincidencia; la asesora registra el enlace de Meet en el ERP (`payload.erp.enlaceVirtual`). Si se prefiere que el CRM cree el Meet, decidirlo antes del corte para no duplicar.

7. **Trazabilidad**: donde hoy se escribe `CAL.COM` / `REPROGRAMACIÓN CAL.COM`, usar `origenReserva_(payload)` (`ERP` para las nuevas). No cambiar etiquetas ni IDs de filas anteriores.

8. **Pereira en POSCITA**: `procesarPostCita_` solo admite Villavicencio, Bogotá y Barranquilla. Agregar Pereira, porque el ERP ya agenda en Pereira.

## Duplicados a evitar

- El CRM es el responsable de WhatsApp: **no activar** `activarWhatsAppERP` (`scripts/AMBAR_ERP_WHATSAPP.gs`) ni `FIRST_VISIT_MESSAGES_ENABLED` en Vercel.
- El ERP envía al cliente un correo por cada cambio de su cita (`activarCorreosERP`). Si el CRM también le envía correo de confirmación al cliente, dejar solo uno de los dos.

## Prueba y corte

1. Respaldar código, activadores y hoja; comparar con el deployment `/exec` vigente.
2. En un proyecto y hoja aislados (con mensajes externos bloqueados), ejecutar `sincronizarAgendaERP` contra reservas de prueba: alta, reprogramación dos veces, cancelación, sedes (incluida Pereira), virtual y presencial. Revisar CITAS, POST_CITA y WEBHOOK_LOG.
3. En producción, `activarAgendaERP` con una reserva controlada; verificar confirmación, enlace de reprogramación del ERP, recordatorios, POSCITA y CAPI.
4. Luego dejar de recibir reservas nuevas de Cal.com, conservando la lectura de las citas abiertas.
