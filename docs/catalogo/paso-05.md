# Paso 5 – Catálogo web
Ruta pública /catalogo con API de servidor (mismo patrón de páginas públicas existentes), devolviendo solo campos permitidos:
- Vestidos no archivados, con estado distinto de Vendido y Dañado/Baja, clasificación visible y con foto de frente.
- Muestra: fotos con marca de agua, código, sede, clasificación, categoría, color, precio de alquiler (precio_sugerido; si es 0 o vacío, "Consultar"), precio de venta (si existe; si no, "Consultar").
- Filtros: sede, clasificación, categoría (solo para XV Años y Gala), color. Miniaturas con carga diferida; foto grande solo al abrir. Caché larga en imágenes.
- Disponibilidad por fecha con lib/availability.ts.
- No mostrar Pre XV, accesorios ni el 5%. Nota fija "Vestidos de estreno bajo pedido". Botón de cita de primera vez.
- Límite de consultas por IP.
- Enlace del aliado: /catalogo?t=TOKEN (token de aliados, solo activo): solo su sede (sede_actual_id = aliados.sede_principal), SIN precios. Agregar este enlace en allyApprovedEmail y en la ficha del aliado (cambio en Aliados autorizado).
- Botón "Copiar enlace" del catálogo general en el inventario.
