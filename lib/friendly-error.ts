/** Turns technical database errors into a clear Spanish notice that says what is missing and what to do. */
const CAMPOS: Record<string, string> = {
  cliente_email: 'el correo de la clienta', cliente_documento: 'el número de documento de la clienta', cliente_nombre: 'el nombre de la clienta',
  cliente_whatsapp: 'el WhatsApp de la clienta', whatsapp: 'el WhatsApp', telefono: 'el teléfono', email: 'el correo', documento: 'el documento',
  fecha_evento: 'la fecha del evento', fecha_entrega_envio: 'la fecha de entrega', sede_id: 'la sede', sede_actual_id: 'la sede del vestido',
  valor_total: 'el valor del contrato', numero_contrato: 'el número de contrato', asesora_id: 'la asesora', vestido_id: 'el vestido',
  codigo: 'el código', nombre: 'el nombre', talla: 'la talla', color: 'el color', clasificacion_id: 'la clasificación', precio_sugerido: 'el precio',
  valor: 'el valor', valor_pagado: 'el valor del pago', medio_pago: 'el medio de pago', medio: 'el medio de pago', categoria: 'la categoría',
  descripcion: 'la descripción', motivo: 'el motivo', fecha: 'la fecha', contrato_id: 'el contrato', proveedor_id: 'el proveedor', cuenta_id: 'la cuenta',
  numero_factura: 'el número de factura', banco: 'el banco', cuenta: 'la cuenta bancaria o llave', titular: 'el titular',
};
const campo = (col: string) => CAMPOS[col] || `el campo «${col.replace(/_/g, ' ')}»`;
const campoDeRestriccion = (name: string) => {
  const hit = Object.keys(CAMPOS).sort((a, b) => b.length - a.length).find(k => name.includes(k));
  return hit ? campo(hit) : 'uno de los datos';
};

export function mensajeAmigable(msg: string): string {
  if (!msg) return msg;
  let m = msg.match(/null value in column "([^"]+)"(?: of relation "[^"]+")? violates not-null constraint/i);
  if (m) return msg.replace(m[0], `Falta ${campo(m[1])}. Llénalo en el formulario y vuelve a guardar.`);
  m = msg.match(/duplicate key value violates unique constraint "([^"]+)"/i);
  if (m) return msg.replace(m[0], `Ya existe un registro con ${campoDeRestriccion(m[1])} igual. Revisa que no esté repetido.`);
  m = msg.match(/new row for relation "[^"]+" violates check constraint "([^"]+)"|violates check constraint "([^"]+)"/i);
  if (m) return msg.replace(m[0], `Revisa ${campoDeRestriccion(m[1] || m[2])}: el valor no tiene el formato permitido o está fuera del rango.`);
  m = msg.match(/violates foreign key constraint "([^"]+)"/i);
  if (m) return msg.replace(m[0], `${campoDeRestriccion(m[1]).replace(/^./, c => c.toUpperCase())} que elegiste ya no existe o no es válido. Vuelve a elegirlo.`);
  m = msg.match(/invalid input syntax for type (\w+)[^"]*(?:"([^"]*)")?/i);
  if (m) return msg.replace(m[0], `Hay un valor con formato incorrecto${m[2] ? ` («${m[2]}»)` : ''}: revisa números y fechas.`);
  if (/row-level security|permission denied/i.test(msg)) return 'No tienes permiso para hacer este cambio. Si lo necesitas, pídelo a administración.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'No hay conexión con el ERP. Revisa el internet y vuelve a intentarlo.';
  if (/JWT expired|invalid JWT|not authenticated/i.test(msg)) return 'Tu sesión se cerró. Vuelve a entrar al ERP e inténtalo de nuevo.';
  return msg;
}
