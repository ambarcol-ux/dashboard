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
