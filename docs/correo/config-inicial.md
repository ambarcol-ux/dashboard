# Correo – Configuración inicial (propuesta para aprobar)
Todos estos valores quedan editables en Configuración › Correo. Ninguno se escribe fijo en el código.

## 1. Conexión (proveedor intercambiable)
- Proveedores disponibles: Brevo, Mailjet, SendGrid y SMTP (Gmail, Outlook u hosting). Un proveedor activo a la vez.
- Datos que pide cada uno (guardados en Vault):
  - Brevo: clave API.
  - Mailjet: clave API y clave secreta.
  - SendGrid: clave API.
  - SMTP: servidor, puerto, usuario y contraseña. Solo envía (sin sincronizar contactos ni recibir eventos).
- Remitente: nombre «Ámbar Couture», correo a definir (ej. hola@tudominio.com), responder a: el mismo.
- Pie de todos los correos: dirección de la sede y enlace «Darme de baja».
- Baja en el proveedor = se revoca la autorización comercial en el ERP (y al revés).
- Solo se sincronizan y reciben correos de marketing las personas con autorización comercial vigente.

## 2. Automatizaciones (cada una con interruptor, texto, momento y sedes)
No reemplazan los correos que ya existen (reserva, confirmación, reprogramación, cancelación y enlace virtual de primeras citas; correos de aliados).

| # | Automatización | Momento | Encendida al inicio |
|---|---|---|---|
| 1 | Gracias por tu visita (con catálogo de su tipo y sede) | 2 horas después de marcar Asistió y no alquiló | Sí |
| 2 | Seguimiento: ¿ya elegiste tu vestido? | 3 días después de la visita, si no alquiló | Sí |
| 3 | Promoción vigente para tu tipo de vestido | 7 días después de la visita, si no alquiló y hay promoción vigente | Sí |
| 4 | Te esperamos: reagenda tu cita | 1 día después de No asistió | Sí |
| 5 | Último aviso antes de tu evento | 45 días antes de la fecha del evento, si no alquiló | No |
| 6 | Bienvenida al contrato (qué sigue: medidas, prueba, entrega) | Al firmar el contrato | No |
| 7 | Gracias y cuéntanos cómo te fue | 3 días después de devolver el vestido | No |

- Sedes: todas al inicio.
- Una automatización se detiene sola si la persona alquila, se da de baja o el seguimiento se cierra con «No contactar».

## 3. Envíos manuales por segmento
Segmentos disponibles (combinables):
- Sede, tipo de vestido, categoría.
- Etapa del embudo (ver punto 5).
- Origen del enlace (o=) y promoción.
- Fecha del evento (rango).
- Última visita (rango).

Antes de enviar se muestra cuántas personas recibirán el correo y cuántas se excluyen por las reglas.

## 4. Reglas de frecuencia
- Máximo 2 correos de marketing por persona por semana, y máximo 1 por día.
- No enviar entre 8:00 p. m. y 8:00 a. m. (hora de Colombia) ni domingos o festivos.
- No enviar a quien ya tenga contrato vigente (salvo automatizaciones 6 y 7).
- Si la persona no abre 5 correos seguidos: se pausa el marketing por 60 días.
- Cupo diario total: 300 (plan gratis de Brevo). Si se alcanza, lo pendiente pasa al día siguiente.

## 5. Embudo hasta contrato
1. Contacto autorizado
2. Cita agendada
3. Asistió (o vitrina)
4. En seguimiento
5. Contrato creado
6. Contrato firmado

Se mide por sede, origen (o=), promoción y automatización: cuántas personas pasan de cada etapa a la siguiente y cuántas llegan a contrato después de recibir un correo (30 días).
