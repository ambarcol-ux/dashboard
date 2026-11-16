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

## Plantillas con botones de la etapa 4 (se crean solas con «Crear plantillas en Meta»)

| Plantilla | Categoría | Botones | Uso |
|---|---|---|---|
| `ambar_cita_confirmada_sede_v2` / `ambar_cita_confirmada_virtual_v2` | Utilidad (idioma de confirmación) | Confirmo · Cambiar hora | Confirmación detallada; mismas variables que las de siempre |
| `ambar_recordatorio_hoy` | Utilidad | Ver ubicación · Cambiar hora | Recordatorio del mismo día fuera de las 24 h ({{1}} nombre, {{2}} sede, {{3}} hora) |
| `ambar_seguimiento_botones` | Marketing | Agendar cita · Ver vestidos · No me interesa | Reactivación del CRM (días 2 y 7) |
| `ambar_seguimiento_promo_botones` | Marketing | Quiero mi cita · No recibir más | Reactivación con promoción vigente |

Mientras Meta no aprueba una plantilla con botones, sale la anterior. Dentro de las 24 h todo sale como mensaje con botones (también el empujón de la IA, con Agendar cita · Ver vestidos · No me interesa).
«Cambiar hora» ofrece los 2 horarios libres más cercanos como botones (y «Otro día», que sigue la IA). «No me interesa» cierra el seguimiento; «No recibir más» además revoca la autorización comercial del teléfono (Ley 1581).

## Reseña de Google — `ambar_resena`

Categoría **Marketing** · Idioma **Español (COL)** · Botones: **Dejar reseña** (enlace: `https://search.google.com/local/writereview?placeid={{1}}`, el Place ID de la sede) y **Ahora no** (respuesta rápida). Se crea con «Crear plantillas en Meta».

```
Hola {{1}} 💛 Tu opinión ayuda a otras quinceañeras a elegir. ¿Nos cuentas tu experiencia en Google?
```

Se pide a **todas** las que reportan que asistieron (Google prohíbe pedir reseñas solo a las satisfechas). Sale al responder la satisfacción (Excelente o Bien), 3 horas después si no responde o, con «Puede mejorar», cuando administración cierra el caso o a las 72 horas. Dentro de las 24 horas sale como mensaje con el botón «⭐ Dejar reseña».

## Satisfacción (mensajes dentro de las 24 h, sin plantilla)

Después de «Fui y alquilé» (o del motivo, si «Aún no decido»): «¿Cómo te sentiste con la atención en Ámbar?» [😍 Excelente · 🙂 Bien · 😕 Puede mejorar]. «Puede mejorar» abre la lista Atención · Tiempo de espera · Vestidos · Precio · Instalaciones · Otro; la clienta recibe «La administración de Ámbar te contactará» y el caso aparece solo a administración (aviso morado en el ERP).

## Post-cita en un paso — `ambar_post_cita_v2`

Categoría **Utilidad** · Idioma **Español (COL)** · Botones de respuesta rápida: **Fui y alquilé**, **Aún no decido** y **No pude ir** (en ese orden). Se crea con «Crear plantillas en Meta».

```
Hola {{1}} 💛 ¿Cómo te fue en tu cita en Ámbar Couture {{2}}?

Tu respuesta nos ayuda a acompañarte en la elección de tu vestido.
```

| Variable | Ejemplo |
|---|---|
| {{1}} | Ana |
| {{2}} | Pereira |

Reemplaza a `ambar_post_cita_asistencia` (que sigue de respaldo mientras Meta no la aprueba). «Aún no decido» pide el motivo; «No pude ir» envía el enlace para reagendar. La respuesta queda como asistencia reportada: no marca la llegada (eso lo hacen el QR, la videollamada o el contrato) y, si nada lo confirma, la cita aparece en Primeras visitas como «Dice que asistió · por verificar».

## Recordatorio con 3 botones — `ambar_recordatorio_confirmar_v2`

Categoría **Utilidad** · Idioma **Español (COL)** · Botones de respuesta rápida: **Ahí estaré**, **Cambiar hora** y **No puedo** (en ese orden). Mismo texto y variables que `ambar_recordatorio_confirmar`. Se crea con el botón «Crear plantillas en Meta» de Integraciones › WhatsApp. Mientras Meta no la apruebe, sale la de 2 botones.

«No puedo» pregunta «¿Cancelamos tu cita?» (Sí, cancelar · No, la mantengo); si cancela, la cita queda cancelada y recibe el botón «Agendar otra cita».

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

## Recordatorio a posibles aliados — `ambar_aliado_recordatorio`

Categoría **Marketing** · Idioma **Español (COL)** · Sin botones.

```
Hola {{1}} 💛 Te escribimos de Ámbar Couture. ¿Pudiste revisar el programa de aliados? Incluye en tus paquetes nuestros vestidos de XV y gala con descuentos especiales para aliados y más de 600 vestidos en 4 sedes. Responde este mensaje y te ayudamos a completar tu vinculación.
```

| Variable | Ejemplo |
|---|---|
| {{1}} | Carolina |

Se envía una vez, de lunes a sábado 10:35 a. m. y 4:35 p. m., a quien conversó como posible aliado hace 1 a 10 días y no se vinculó. Sin aprobación de Meta no sale nada.

## Bienvenida al aliado — `ambar_aliado_bienvenida_v2`

Categoría **Marketing** · Idioma **Español (COL)** · Sin botones. (Meta rechazó `ambar_aliado_bienvenida` y `ambar_aliado_aprobado` como Utilidad.)

```
Hola {{1}} 💛 Ya eres aliado de Ámbar Couture. Tu código de aliado es {{2}}. Te enviamos al correo tus enlaces para registrar a tus clientas y consultar disponibilidad de vestidos. Responde este mensaje y te explicamos cómo registrar tu primera clienta.
```

| Variable | Ejemplo |
|---|---|
| {{1}} | Carolina |
| {{2}} | ALI-FOT-0003 |

Se envía al aprobar un aliado si no ha escrito al 304 en las últimas 24 horas (si escribió, sale como mensaje normal).

# Plan Ahorro XV (Ventas › Plan Ahorro XV)

Las cuatro son de categoría **Utilidad** (avisos sobre un plan que la familia ya firmó, sin promociones) · Idioma **Español (COL)** · Sin encabezado, pie ni botones. Mientras Meta no las apruebe, el ERP no envía nada.

## Cuota recibida — `ambar_ahorro_pago_recibido`

```
Hola {{1}} 💛 Recibimos tu cuota de {{2}} del Plan Ahorro XV. Total ahorrado: {{3}}. Con tu extra, tienes {{4}} para escoger tu vestido y servicios desde el {{5}}.
```

| Variable | Ejemplo |
|---|---|
| {{1}} | Luisa |
| {{2}} | $150.000 |
| {{3}} | $600.000 |
| {{4}} | $660.000 |
| {{5}} | 15 de marzo de 2027 |

Se envía al registrar una cuota.

## Recordatorio de cuota — `ambar_ahorro_recordatorio`

```
Hola {{1}} 💛 Te recordamos la cuota de tu Plan Ahorro XV por {{2}}, que vence el {{3}}. Hasta hoy llevas {{4}} ahorrados. Si ya pagaste, puedes ignorar este mensaje.
```

| Variable | Ejemplo |
|---|---|
| {{1}} | Luisa |
| {{2}} | $150.000 |
| {{3}} | 5 de diciembre |
| {{4}} | $600.000 |

Se envía 2 días antes del día de pago de cada mes, si ese mes aún no ha pagado.

## Cuota pendiente — `ambar_ahorro_pendiente`

```
Hola {{1}}, no hemos recibido la cuota de {{2}} de tu Plan Ahorro XV que vencía el {{3}}. Recuerda que si se dejan de pagar 2 cuotas seguidas el plan termina. Responde este mensaje si necesitas ayuda.
```

| Variable | Ejemplo |
|---|---|
| {{1}} | Luisa |
| {{2}} | $150.000 |
| {{3}} | 5 de diciembre |

Se envía 3 días después del día de pago si la familia está atrasada (una vez por mes).

## Plan listo para usar — `ambar_ahorro_listo`

```
Hola {{1}} 🎉 Ya puedes usar tu Plan Ahorro XV en Ámbar Couture {{2}}: tienes {{3}} para escoger tu vestido y servicios. Responde este mensaje para agendar tu cita de selección.
```

| Variable | Ejemplo |
|---|---|
| {{1}} | Luisa |
| {{2}} | Villavicencio |
| {{3}} | $1.320.000 |

Se envía una vez, 3 meses antes del evento.
