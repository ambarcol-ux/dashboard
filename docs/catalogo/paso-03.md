# Paso 3 – Clasificación y categoría automáticas en el contrato
En Contratos > Vestido & Adaptaciones > grilla Vestidos Seleccionados (líneas en contrato_items_vestidos):
- Al digitar o elegir el código del vestido, llenar la Clasificación / Uso con la clasificación del vestido y mostrar su categoría (solo lectura). Siempre desde el vestido, nunca de la línea anterior.
- Como el código no es único entre sedes, si hay varios vestidos con ese código, pedir elegir cuál (mostrando la sede); guardar por vestido_id.
- Cambiar el código recalcula; borrar el código limpia la clasificación.
- Código inexistente o archivado: "Código de vestido no existe", la línea no se guarda.
- Vestido sin clasificación: "El vestido no tiene clasificación asignada; contacte al administrador", no guarda.
- Clasificación / Uso de solo lectura; solo administración puede cambiarla, registrando el cambio en historial_cambios_contrato o bitacora_vestidos.
- Cada línea tiene su propia clasificación.
- Antes de guardar, validar en el servidor que cada línea coincida con el vestido (salvo cambio autorizado).
- El buscador de vestidos del contrato muestra la clasificación y la categoría.
- Si el formato impreso del contrato muestra la clasificación, que lea la guardada.
- Contratos ya guardados no se modifican al abrirlos; la regla aplica a líneas nuevas o editadas.
- Interruptor en configuración para activar la validación que bloquea; mantenerlo apagado hasta que la limpieza deje 0 vestidos sin clasificación (en ese caso solo advertir).
