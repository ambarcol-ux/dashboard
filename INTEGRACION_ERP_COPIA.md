# Integración ERP COPIA → DASHBOARD

Origen auditado: `ambarcol-ux/ambar-erp-copia`, commit `a389f5f16771c828437621fff28a417dc040f330`.
Destino base: `ambarcol-ux/dashboard`, commit `3583fdf049df23bfdd07da1aabc2c4ef354dd43f`.
Base destino: `topldhogulsqfppbvwjw`. ERP COPIA (`fqbkhlkyjlltimornzla`) se inspeccionó sin modificarlo.

## Alcance

- Calendario de contratos con vistas agenda, mes y semana; filtros; edición con control de conflictos y disponibilidad de vestido.
- Depósitos: entradas con comprobante, solicitudes de transferencia para Contabilidad, alerta de pendientes, toma de solicitudes y pago con comprobante. Efectivo con entrada suficiente se devuelve directamente sin autorización. Se conserva el historial y el saldo hasta el pago efectivo.
- PRE-XV: selección independiente de fotos, maquillaje y locación desde contrato nuevo o existente; nombres de proveedores, fechas propias y confirmaciones separadas. Cambiar proveedor/horario invalida solo la reserva correspondiente; reprogramar la sesión invalida todas.
- Contabilidad: navegación exclusiva a depósitos y restricciones de escritura/lectura, incluyendo vistas existentes.

## Compatibilidad conservada

Se integraron cambios específicos, sin reemplazar todo DASHBOARD por COPIA. Permanecen la factura obligatoria, su presentación en contrato/PDF, las validaciones al firmar/emitir y el permiso administrado de edición de registros guardados. Los depósitos se gestionan con comprobantes desde su módulo; el importe ya no se edita libremente en el formulario general.

Los componentes de contratos anteriores quedan NULL (sin selección inferida). No se reconstruyen ni reescriben firmas, nombres, fechas o importes anteriores. Los comprobantes históricos se abren mediante enlaces temporales del mismo depósito de archivos.

No se trasladaron configuración de conexión de COPIA, migraciones de clonación, datos demo ni su módulo administrativo de Sedes. Los servicios externos de correo/agendamiento conservan su comportamiento con claves configuradas y responden 503 si faltan, usando la inicialización diferida ya existente en COPIA.

## Base de datos

- `contratos`: cuatro columnas PRE-XV y validaciones de proveedores, reprogramación, sede y depósito con comprobante.
- Nuevas tablas: `movimientos_depositos`, `solicitudes_depositos`, `historial_solicitudes_depositos`, `soportes_depositos_anteriores`.
- `devoluciones_depositos`: comprobante_path, validación y acceso limitado; escrituras solo por operación transaccional.
- `profiles`: consulta propia de Contabilidad y comprobación administrativa sin recursión.
- Funciones auxiliares en `private`, operación pública `gestionar_deposito`, triggers y permisos de ejecución.
- `storage.buckets/objects`: comprobantes privados, PDF/JPG/PNG/WebP, 10 MB, acceso por contrato y soporte de rutas históricas.
- Restricciones para Contabilidad en tablas públicas existentes; `kpi_vestidos_populares` y `vista_historial_alquileres` usan `security_invoker` para respetarlas.

Migraciones locales:
- `20260917005400_integrar_copia_calendario_depositos_prexv.sql`: reúne las diez migraciones funcionales auditadas de COPIA y sus dependencias/adaptaciones para DASHBOARD.
- `20260917010039_contabilidad_respetar_rls_vistas.sql`: evita acceso por vistas que ignoraban RLS.

Se aplicaron por el conector Supabase. Versiones remotas: `20260917005915` y `20260917010111`. Difieren de los nombres locales; reconciliar historial antes de usar `supabase db push`, sin reejecutarlas.

## Pruebas

- Compilación de producción Next.js y TypeScript.
- Nueve suites locales: calendario, API/edición, límite de espera y errores de guardado, depósitos/saldos, ocho combinaciones PRE-XV, roles, factura obligatoria y edición de registros guardados.
- Supabase: simulación de migraciones y pruebas con ROLLBACK antes de aplicar; luego pruebas transaccionales de depósitos, comprobantes, saldos, duplicados, efectivo, Contabilidad, separación entre sedes, PRE-XV y factura obligatoria con datos ficticios revertidos.
- Integridad histórica: 356 contratos; digest de todos los campos anteriores sin cambios: `5e52fb1530e0f8465db9b8509b5a0a8f` antes/después.

La inspección de seguridad detecta avisos en funciones/políticas preexistentes ajenas a estos módulos. No constituye una auditoría integral del ERP.
