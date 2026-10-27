# Paso 8 – Configuración de WhatsApp por empresa
Pantalla "Configuración de WhatsApp" (solo administradores), pensada para varias empresas (marca blanca):
- Tabla de configuración por empresa: número visible, phone_number_id, waba_id, idiomas de plantillas, interruptor de mensajes automáticos.
- Credenciales (token, app secret, verify token) cifradas con Supabase Vault, por empresa. Mientras no haya valores en la tabla, usar las variables META_* actuales de Vercel como respaldo (no romper lo que funciona).
- Todos los módulos (primeras citas, aliados, Dashboard, catálogo) leen el número y los enlaces wa.me desde esta configuración. Reemplaza los números escritos a mano.
- Clave de API del catálogo para el agente de Meta: generar, ver y regenerar.
- Historial de cambios (usuario, fecha, campo).
- Botón "Enviar mensaje de prueba".
- Lista de verificación al cambiar de número: suscripción Meta One activa, número verificado, plantillas aprobadas, agente configurado, conector conectado (casillas que marca el administrador).
