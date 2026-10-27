# Paso 9 – API del catálogo para Meta Business Agent
NO construyas un bot. Crea una API de solo lectura para el conector del agente de Meta:
- Autenticación con la clave del paso 8 en encabezado.
- Operaciones:
  1. Buscar referencias Activas por sede, tipo de evento, categoría y color.
  2. Detalle de una referencia: sede, categoría, color, precio de alquiler, precio de venta, URLs de fotos con marca de agua.
  3. Disponibilidad de una referencia para una fecha (lógica de bloqueos actual).
  4. Condiciones de Pre XV (texto configurable en el panel).
  5. Enlace de cita de primera vez.
- Nunca devolver datos de clientas, aliados, contratos ni el 5%.
- Límite de consultas por minuto por clave. Registrar cada consulta.
- En el catálogo web, botón "Preguntar por WhatsApp" con enlace wa.me (número del paso 8) y la referencia en el mensaje.
- Genera docs/catalogo/api-whatsapp.md con: URL base, autenticación, descripción de cada operación con parámetros y ejemplo de respuesta, y una especificación OpenAPI en docs/catalogo/openapi.json, para crear el conector en Meta.
