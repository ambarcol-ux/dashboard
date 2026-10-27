# Paso 1 – Limpieza de datos (en dos fases, con aprobación)
FASE A (solo lectura): genera docs/catalogo/limpieza-propuesta.csv con columnas: vestido_id, codigo, sede_actual, problema, valor_actual, valor_propuesto, aplicar (vacío). Incluye:
- Códigos repetidos en todo el inventario (indica sede de cada uno).
- Códigos con espacios, minúsculas o descripción dentro (proponer código limpio y mover la descripción a nombre).
- Vestidos cuya sede_actual_id no existe en sedes (proponer sede_principal_id si existe).
- Vestidos sin clasificación, sin precio, sin color o sin talla (valor_propuesto vacío).
Termina e indica: "Revisa el CSV, escribe SI en la columna aplicar y completa valor_propuesto donde falte".
FASE B (solo cuando el usuario diga "aplica la limpieza"): aplica únicamente las filas con aplicar = SI, registrando cada cambio en bitacora_vestidos. Después crea la llave foránea de sede_actual_id hacia sedes (solo si ya no quedan sedes inexistentes). No toques nada más.
