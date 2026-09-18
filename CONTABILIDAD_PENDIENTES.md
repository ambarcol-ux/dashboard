# Acceso de Contabilidad — Dashboard

Contabilidad entra exclusivamente en `/dashboard/devoluciones-depositos`, en la bandeja «Depósitos pendientes por devolver». Conserva tomar solicitud, registrar el pago con comprobante y cancelar pendientes con motivo. No ve entradas, indicadores globales, contratos completos ni historial finalizado.

El backend deniega las demás tablas mediante políticas restrictivas que intersectan las existentes. La identificación del cliente/contrato/sede proviene de una operación con proyección mínima y solo para solicitudes pendientes. Los comprobantes se limitan a pendientes; subir una salida exige la solicitud asignada en proceso. Los permisos de otros roles permanecen intactos.

Los accesos por URL redirigen a la bandeja. Las escrituras ajenas al módulo devuelven 403, tanto con cookie como con token Bearer. No se confía en información de rol editable por el usuario.

Verificación: pruebas de rutas, consultas directas, pago atómico, carga restringida de comprobantes, prevención de duplicados, desaparición de solicitudes finalizadas, aislamiento por sede y regresiones de depósitos. Las pruebas SQL usan datos ficticios y ROLLBACK. TypeScript, revisión estática de archivos modificados y compilación de producción aprobados.
