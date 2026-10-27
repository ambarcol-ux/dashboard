# Paso 2 – Inventario: categoría, precio de venta, fotos y hoja de vida
Campos:
- Categorías AUTOMÁTICAS por precio de alquiler (nadie las elige a mano). Crear tabla categorias_vestido (Postgres): clasificacion_id (FK a clasificaciones_vestido), nombre, precio_min, precio_max (NULL = sin límite), orden, activo. Rangos editables por administración en una pantalla, sin desarrollo. Datos iniciales:
  XV Años: Esencial 800.000–1.500.000; Clásica 1.500.001–2.500.000; Premium 2.500.001–3.500.000; Exclusiva 3.500.001–5.000.000.
  Gala: Gala Clásica 250.000–450.000; Gala Exclusiva 450.001–700.000.
  Novia: Nupcial Clásica 400.000–2.000.000; Nupcial Exclusiva 2.000.001–4.000.000.
  Pajecita: Encanto (única). Vestido de cambio (mostrar como "Cambio o corto"): Destello (única).
- Agregar vestidos.categoria_id (FK). La columna de texto categoria no se usa. Rangos inclusivos en ambos extremos.
- Al crear o editar un vestido (precio_sugerido o clasificación), recalcular categoria_id. Si el precio queda fuera del rango de su clasificación: mensaje "El precio de alquiler está fuera del rango permitido para [uso] ([mínimo] – [máximo])" y no guardar.
- Asignar categoría a los vestidos existentes; NO bloquear los que queden fuera de rango: listarlos en docs/catalogo/fuera-de-rango.csv (código, sede, clasificación, precio) para revisión.
- Clasificación obligatoria al crear vestidos nuevos.
- Agregar precio_venta (numeric, opcional). No influye en la categoría.
- Edición masiva en la lista: seleccionar varios vestidos y asignar clasificación (la categoría se calcula sola).
- Filtro de categoría en inventario, contrato y agenda: solo aparece con XV Años, Gala o Novia, mostrando las categorías de ese uso.
- Configuración "Clasificaciones visibles en catálogo" (por defecto XV Años, Gala, Novia, Pajecita y Vestido de cambio; Otro oculta).
Fotos:
- Tabla vestido_fotos (vestido_id, toma: frente/espalda/detalle, ruta_original, ruta_marca, ruta_miniatura, subido_por, subido_at). Única por vestido_id+toma.
- Buckets: vestidos-originales (privado) y vestidos-publicas (público, solo marca de agua y miniaturas).
- Procesar EN EL NAVEGADOR con canvas (no hay sharp): comprimir a máx. 200 KB WebP, miniatura máx. 30 KB, marca de agua según configuración (logo PNG, esquina inferior derecha, 25% del ancho, 50% de opacidad, editables). Botón "Regenerar marcas de agua" con barra de progreso, desde los originales.
- En la ficha del vestido, nueva pestaña "Fotos": 3 casillas (frente, espalda, detalle) con Subir, Reemplazar, Descargar; "Descargar todas" (zip). Solo administración. Al reemplazar, borrar archivos anteriores.
- Carga masiva: primero elegir la sede, luego subir archivos CODIGO-TOMA.jpg; emparejar código sin distinguir mayúsculas ni espacios dentro de esa sede; resumen de asignadas / no encontradas / nombre inválido; no reemplazar sin confirmación.
- imagen_url = miniatura de frente (para compatibilidad). Mostrarla en la vista de cuadrícula. Si no tiene foto, mostrar un espacio vacío con el texto "Sin foto".
- Avance de fotos en el inventario: indicador "X de N vestidos con sus 3 fotos" y filtro "Fotos: completas / incompletas / sin fotos", por sede.

Hoja de vida:
- En la ficha, nueva pestaña "Hoja de vida": línea de tiempo y totales consolidando lo existente (contratos, traslados, mantenimientos, cambios de contrato, bitácora). No duplicar datos: consultas o vista.
- Trigger en vestidos que registre en bitacora_vestidos los cambios de estado, precio, sede, clasificación, categoría y archivado. Registrar también cambios de fotos.
- Accesorios: fuera de este paso (se harán después).
