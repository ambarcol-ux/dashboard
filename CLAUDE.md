@AGENTS.md

# Reglas
- Respuestas mínimas. No muestres código ni resúmenes.
- Edita solo lo necesario. Nunca reescribas archivos completos.
- Reutiliza lo que ya existe. No hagas nada que no se pida.
- Nunca modifiques datos existentes sin aprobación explícita (ver paso 1).
- ANTES de crear cualquier cosa (tabla, columna, ruta, componente, función, bucket, política, trigger), busca si ya existe algo equivalente. Si existe: reutilízalo y ajústalo a lo nuevo, sin duplicar. Si lo existente choca con el paso: detente y pregunta en una línea.
- Nunca borres ni renombres tablas, columnas, rutas o funciones existentes. Solo cambios aditivos y migraciones reversibles.
- No rompas lo que funciona: contratos, primeras citas, aliados y disponibilidad deben seguir operando igual.
- Al terminar cada paso, responde solo: archivos tocados, migraciones creadas y una línea "Reutilizado:" con lo existente que aprovechaste.

# Contexto del módulo Catálogo
Aliados está terminado y aprobado: solo se toca en los puntos exactos que indique un paso; para cualquier otro cambio, detente y pregunta.
Se construye el catálogo de vestidos sobre el inventario existente. El 5% de aliados nunca se muestra.

# Datos clave del ERP (ya auditados, no volver a explorar)
- Inventario: /admin/inventory (app/admin/inventory/page.tsx). Lista/cuadrícula (viewMode), pestaña Por estado (InventoryByStatus), Archivados (interruptor), modal Nuevo vestido, ficha con pestañas alquileres/mantenimiento/estadísticas/traslados.
- Tabla vestidos: codigo (único solo por codigo+sede_actual_id; usar SIEMPRE id para relacionar), nombre, talla, color, sede_principal_id, sede_actual_id (sede_id no se usa), estado (texto: Disponible, EN MANTENIMIENTO, Reservado, Vendido, Dañado/Baja, Alquilado, EN EVENTO; comparar sin distinguir mayúsculas), imagen_url (vacía), precio_sugerido = precio de alquiler, categoria (vacía, se usará), clasificacion_id -> clasificaciones_vestido (XV Años, Gala, Novia, Pajecita, Otro, Vestido de cambio), archivado/archivado_at/archivado_por/motivo_archivo.
- Historial existente: bitacora_vestidos, traslados_bitacora, mantenimiento_vestidos, mantenimiento_bitacora, historial_cambios_contrato. Contratos: contrato_items_vestidos.vestido_id, contratos.bloqueo_especial_vestido_id.
- Disponibilidad: lib/availability.ts; página interna /disponibilidad; aliados /aliados/disponibilidad + app/api/aliados/disponibilidad/route.ts (token aliados.token, solo activo; consultas en aliado_consultas).
- Aliados: sede en aliados.sede_principal; registro de clientas /aliados/clientas + app/api/aliados/clientas/route.ts (tabla aliado_clientas); correo de aprobación allyApprovedEmail en lib/ally-emails.ts.
- Páginas públicas: patrón existente = API de servidor con cuenta de servicio + token o enlace firmado + validación de origen; el navegador nunca lee la base. Middleware exige sesión solo en /dashboard, /contratos, /admin, /perfil, /disponibilidad, /proveedor.
- Storage: no hay bucket de fotos de vestidos. jspdf disponible. No hay sharp.
- Permisos: editar = administración o asesora de operaciones de sede (canEditSavedRecords); RLS de sede operaciones_sede_limitada.
- Categorías: automáticas por precio de alquiler según tabla categorias_vestido (paso 2). XV: Esencial, Clásica, Premium, Exclusiva. Gala: Gala Clásica, Gala Exclusiva. Novia: Nupcial Clásica, Nupcial Exclusiva. Pajecita: Encanto. Vestido de cambio ("Cambio o corto"): Destello.
