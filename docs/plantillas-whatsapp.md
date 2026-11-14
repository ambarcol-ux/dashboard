# Plantillas de WhatsApp para la confirmación de primera cita

Se crean en **WhatsApp Manager → Plantillas de mensajes → Crear plantilla**.
Mientras Meta no las apruebe, el ERP sigue enviando la confirmación corta (`ambar_confirmacion_cita`);
apenas queden aprobadas, el ERP empieza a usarlas solo, sin desplegar nada.

Datos comunes a las dos:
- **Categoría:** Utilidad
- **Idioma:** Español (`es`)
- **Tipo de variable:** Número
- Encabezado, pie de página y botones: ninguno

## 1. Cita presencial — nombre `ambar_cita_confirmada_sede`

Cuerpo (copiar tal cual):

```
Hola, {{1}} 👋

Tu cita *presencial en Ámbar Couture {{2}}* está confirmada. ✨

📅 *Fecha:* {{3}}
🕒 *Hora:* {{4}}

📍 *Dirección:* {{5}}

🗺️ *Cómo llegar en Google Maps:*
{{6}}

📲 *¿Tienes alguna pregunta?*
Contacta a nuestra sede {{7}}: *{{8}}*

*Escribir por WhatsApp:*
{{9}}

🔄 *¿Necesitas cambiar la fecha o la hora de tu cita?*

Puedes reprogramarla fácilmente aquí:
https://erp.ambarcouture.com/reprogramar-primera-cita

¡Te esperamos para ayudarte a encontrar el vestido ideal! 👗✨
```

Ejemplos que pide Meta para las variables:

| Variable | Ejemplo |
|---|---|
| {{1}} | Andrés |
| {{2}} | Pereira |
| {{3}} | 15 de octubre de 2026 |
| {{4}} | 3:00 p. m. |
| {{5}} | Carrera 17 #9-70, local 101, barrio Pinares, Pereira, Risaralda. |
| {{6}} | https://maps.app.goo.gl/bfZE7XW9rxfcV8vt7 |
| {{7}} | Pereira |
| {{8}} | 321 347 3757 |
| {{9}} | https://wa.me/573213473757 |

## 2. Cita virtual — nombre `ambar_cita_confirmada_virtual`

```
Hola, {{1}} 👋

Tu cita *virtual con Ámbar Couture* está confirmada. ✨

📅 *Fecha:* {{2}}
🕒 *Hora:* {{3}}

💻 Te enviaremos el enlace de la videollamada antes de tu cita.

📲 *¿Tienes alguna pregunta?*
Contacta a nuestra sede {{4}}: *{{5}}*

*Escribir por WhatsApp:*
{{6}}

🔄 *¿Necesitas cambiar la fecha o la hora de tu cita?*

Puedes reprogramarla fácilmente aquí:
https://erp.ambarcouture.com/reprogramar-primera-cita

¡Te esperamos para ayudarte a encontrar el vestido ideal! 👗✨
```

| Variable | Ejemplo |
|---|---|
| {{1}} | Andrés |
| {{2}} | 15 de octubre de 2026 |
| {{3}} | 3:00 p. m. |
| {{4}} | Bogotá |
| {{5}} | 305 807 3210 |
| {{6}} | https://wa.me/573058073210 |

Los datos de cada sede (dirección, mapa, teléfono y WhatsApp) están en `lib/first-visit-sites.ts`.

## Recordatorio con confirmación — `ambar_recordatorio_confirmar`

Categoría **Utilidad** · Idioma **Español (COL)** · Botones de respuesta rápida: **Confirmo** y **Reagendar** (en ese orden).

```
Hola {{1}} 💛 Te recordamos tu primera cita en Ámbar Couture {{2}} el {{3}} a las {{4}}.

¿Nos confirmas que vienes?
```

| Variable | Ejemplo |
|---|---|
| {{1}} | Ana María |
| {{2}} | Pereira |
| {{3}} | 15 de octubre de 2026 |
| {{4}} | 3:00 p. m. |

«Confirmo» deja la cita como confirmada; «Reagendar» le envía el enlace para cambiarla. Mientras Meta no la apruebe, sale el recordatorio de siempre.

## Recuperar a quien no llegó — `ambar_cita_reprogramar`

Categoría **Utilidad** · Idioma **Español (COL)** · Sin botones.

```
Hola {{1}} 💛 Hoy te esperábamos en tu cita en Ámbar Couture. Si quieres, elige una nueva fecha aquí y te tenemos los vestidos listos: {{2}}
```

| Variable | Ejemplo |
|---|---|
| {{1}} | Ana María |
| {{2}} | https://erp.ambarcouture.com/agendar-primera-cita/gestionar#… |

Se envía cuando la cita queda en «No asistió». Si la clienta escribió al 304 en las últimas 24 horas, ambos mensajes salen como mensaje normal sin plantilla.

## Saludo para iniciar o retomar el chat — `ambar_seguimiento`

Categoría **Marketing** (Meta clasifica así los seguimientos) · Idioma **Español (COL)** · Sin botones.

```
Hola {{1}} 💛 Te escribimos de Ámbar Couture {{2}} para acompañarte con tu vestido. ¿Tienes un momento para conversar?
```

| Variable | Ejemplo |
|---|---|
| {{1}} | Luisa |
| {{2}} | Barranquilla |

Se envía desde WhatsApp 304 cuando la clienta nunca escribió al 304 o pasaron más de 24 horas («Enviarle un saludo»). Cuando responde, la asesora sigue escribiéndole normal desde el ERP.

## Seguimiento con promoción — `ambar_seguimiento_promo`

Categoría **Marketing** · Idioma **Español (COL)** · Sin botones.

```
Hola {{1}} 💛 Soy de Ámbar Couture {{2}}. ¿Ya encontraste tu vestido? Tenemos {{3}}. Responde este mensaje y te mostramos opciones o separamos tu cita.
```

| Variable | Ejemplo |
|---|---|
| {{1}} | Luisa |
| {{2}} | Barranquilla |
| {{3}} | 20% de descuento pagando de contado en tienda hasta el 30 de noviembre |

Los seguimientos automáticos la usan cuando hay una promoción vigente (Ventas y CRM › Promociones) para la sede y el tipo de vestido de la clienta; si no hay promoción o la plantilla aún no está aprobada, sale `ambar_seguimiento_v2` (o `ambar_seguimiento` si tampoco está aprobada).

## Seguimiento mejorado — `ambar_seguimiento_v2`

Categoría **Marketing** · Idioma **Español (COL)** · Sin botones.

```
Hola {{1}} 💛 Soy de Ámbar Couture {{2}}. ¿Ya encontraste tu vestido? Tenemos modelos nuevos y te ayudamos a elegir el ideal para tu evento. Responde este mensaje y te mostramos opciones o te agendamos una cita.
```

| Variable | Ejemplo |
|---|---|
| {{1}} | Luisa |
| {{2}} | Barranquilla |

Reemplaza a `ambar_seguimiento` en los seguimientos automáticos en cuanto Meta la aprueba (no hay que cambiar nada en el ERP).
