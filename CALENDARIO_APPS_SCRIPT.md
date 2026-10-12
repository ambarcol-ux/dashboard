# Calendario: primeras visitas y automatización del Apps Script

## Alcance y publicación

Decisión confirmada: todas las nuevas reservas se harán directamente en el ERP. Cal.com no será el origen ni un requisito de este flujo.

Trabajo en la rama `codex/primeras-visitas`. Dashboard y Calendario conservan sus módulos separados. Las reglas de capacidad se aplican exclusivamente a `primeras_citas`. No se modifican medidas, pruebas, PRE XV, entregas, devoluciones ni fechas de contratos.

Esta ampliación no está promovida a erp.ambarcouture.com. Los mensajes están desactivados por defecto. No se ha enviado ningún mensaje a clientes durante las pruebas.

## Implementado y verificable sin proveedores externos

- Enlace público para reservar una primera visita sin contrato; sede, modalidad, nombre, contacto, tipo de vestido y fecha de evento opcional.
- Enlace individual privado para confirmar, cancelar con motivo, reprogramar sede/modalidad/fecha/hora y responder asistencia/alquiler/motivo de no alquiler.
- Enlaces firmados, con vencimiento; el secreto nunca llega al navegador. El token viaja en el fragmento del enlace y en el cuerpo de solicitudes, no en la URL del servidor.
- La reprogramación conserva la reserva anterior hasta que se confirma el nuevo cupo, guarda historial e invalida recordatorios anteriores.
- Compartir enlace en WhatsApp mediante un mensaje preparado, revisado y enviado por la asesora.
- Respuestas del cliente separadas del estado del contrato: una respuesta «alquilé» no crea contrato ni registra dinero.
- Gestión comercial, motivo de cierre, nueva reserva relacionada y hasta cinco seguimientos según la distancia al evento. Guardar una nota no completa una etapa. Etapas realizadas conservan su historia.
- Enlace de Google Meet registrado por la asesora y visible desde el enlace del cliente.
- Cola persistente de confirmación, recordatorios 24h/2h, encuesta post-cita (90 minutos después del final) y aviso interno.
- Adaptador WhatsApp con las mismas tres plantillas del script; preguntas interactivas de alquiler y motivo; enlace para reagendar cuando no asistió.
- Verificación criptográfica del webhook de Meta, identificación por mensaje y teléfono, deduplicación y restricción a la revisión vigente de la cita.
- Procesador privado; un timeout de envío queda en revisión en vez de reintentarse a ciegas.

## Configuración necesaria antes de activar los envíos

Vercel actualmente tiene Resend y Supabase, pero no las credenciales de WhatsApp del Apps Script. No copiar secretos a archivos públicos ni al chat.

Variables privadas requeridas:
- META_WA_TOKEN, META_WA_PHONE_NUMBER_ID, META_APP_SECRET, META_WA_VERIFY_TOKEN.
- META_GRAPH_VERSION: versión aprobada y probada con la cuenta real, sin asumir la versión del script.
- META_WA_TEMPLATE_LANG: idioma exacto aprobado para ambar_post_cita_asistencia (por defecto es_CO). Confirmación y recordatorio conservan es, como el script.
- FIRST_VISIT_PUBLIC_ORIGIN: dominio definitivo que sirve el formulario y el enlace individual.
- FIRST_VISIT_LINK_SECRET: secreto estable dedicado recomendado. Mientras no se configura se usa la clave del servidor; cambiar esa clave invalida enlaces anteriores.
- FIRST_VISIT_WORKER_SECRET: secreto del procesador.
- FIRST_VISIT_INTERNAL_RECIPIENTS: objeto JSON sede UUID → lista de correos autorizados.
- FIRST_VISIT_EMAIL_FROM: remitente autorizado en Resend.
- FIRST_VISIT_MESSAGES_ENABLED=true: activar solo después de probar plantillas, webhook y evitar solapamiento con Apps Script.

Procesador: POST /api/primeras-citas/procesar con autorización Bearer del worker, cada pocos minutos mediante un programador existente. No se ha contratado un servicio ni habilitado un cron de pago. Procesa hasta cinco mensajes por llamada.
Webhook: /api/primeras-citas/whatsapp. La suscripción de Meta debe coordinarse con el Apps Script actual: no reemplazarla mientras siga gestionando clientes allí.

## Diferencias pendientes para igualar todo el script

- Cal.com queda fuera del flujo de nuevas reservas por decisión del usuario. No se migran automáticamente sus citas históricas.
- Generación automática de Google Meet: actualmente se registra un enlace existente; requiere conectar el calendario de Google correcto por sede.
- Meta CAPI (Schedule, AppointmentAttended, Purchase): no está implementado ni activado. Requiere configuración y decidir el uso de los datos para medición. No enviar Purchase por una declaración del cliente sin verificar el contrato.
- Resumen diario de seguimientos por correo y avisos internos 24h/2h: pendientes; el aviso de nueva cita sí tiene adaptador.
- Importación de VITRINA y responsables definidos en la hoja de configuración: requiere acceso a esos datos; el texto solo contiene código, no los valores guardados.
- Calificación posterior al evento: el propio script la deja preparada sin envío y sin enlaces oficiales por sede. No afirmar que ya existe una automatización activa.
- Estados de WhatsApp implementados: enviado, entregado, leído y fallido, con firma de Meta y protección contra eventos fuera de orden. Su validación real requiere conectar el webhook.

La migración de automatizaciones requiere esos datos y la coordinación del WhatsApp existente. Ninguna configuración faltante se ha sustituido con valores inventados.

## Correos al cliente por cambios de agenda (Apps Script)

Cada reserva, confirmación, reprogramación, cancelación o enlace de Meet de una primera cita deja un correo en `primeras_citas_correos`. Apps Script los envía desde Gmail:

1. Copia las funciones nuevas de `scripts/AMBAR_ERP.gs` al proyecto de Apps Script del ERP (usa las mismas propiedades `ERP_ORIGIN` y `ERP_WORKER_SECRET`).
2. Ejecuta `activarCorreosERP` una vez: pide el permiso de Gmail, envía lo pendiente y programa `enviarCorreosERP` cada minuto.
3. `pausarCorreosERP` detiene el envío; los correos quedan en cola.

Es independiente de WhatsApp y de `FIRST_VISIT_MESSAGES_ENABLED`. Los correos salen desde la cuenta dueña del script; Gmail limita los envíos diarios (100 en cuentas personales, 1.500 en Google Workspace) y el script no reclama más de lo que la cuota permite. Los correos de más de 3 días sin enviar se omiten.
