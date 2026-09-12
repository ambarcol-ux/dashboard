type EditingUser = {
  email?: string;
  app_metadata?: Record<string, unknown>;
};

// Consume only the server-managed claim returned by Supabase Auth.
// Database access continues to be enforced by the existing RLS policies.
export function canEditSavedRecords(user: EditingUser | null | undefined): boolean {
  return user?.app_metadata?.can_edit_saved_records === true ||
    user?.email === 'dubian.h88@gmail.com';
}

export const additionalContractFields = [
  { key: 'numero_contrato', label: 'Número de contrato', type: 'text' },
  { key: 'cliente_documento', label: 'Documento del cliente', type: 'text' },
  { key: 'cliente_email', label: 'Correo del cliente', type: 'email' },
  { key: 'quinceanera_name', label: 'Nombre de la quinceañera', type: 'text' },
  { key: 'tipo_evento', label: 'Tipo de evento', type: 'text' },
  { key: 'fecha_evento', label: 'Fecha del evento', type: 'date' },
  { key: 'fecha_pre_xv', label: 'Fecha de Pre XV', type: 'date' },
  { key: 'fecha_retorno_prevista', label: 'Fecha de retorno prevista', type: 'date' },
  { key: 'fecha_fotografia', label: 'Fecha y hora de fotografía', type: 'datetime-local' },
  { key: 'fecha_maquillaje', label: 'Fecha y hora de maquillaje', type: 'datetime-local' },
  { key: 'prexv_fotografo', label: 'Fotógrafo', type: 'text' },
  { key: 'prexv_maquilladora', label: 'Maquilladora', type: 'text' },
  { key: 'prexv_locacion', label: 'Locación de Pre XV', type: 'text' },
  { key: 'tipo_entrega', label: 'Tipo de entrega', type: 'text' },
  { key: 'observaciones_vestido', label: 'Observaciones del vestido', type: 'text' },
  { key: 'observaciones_arreglos', label: 'Observaciones de arreglos', type: 'text' },
  { key: 'total_arreglos', label: 'Valor de arreglos', type: 'number' },
  { key: 'valor_deposito', label: 'Valor del depósito', type: 'number' },
  { key: 'banco_deposito', label: 'Banco del depósito', type: 'text' },
  { key: 'tipo_cuenta_deposito', label: 'Tipo de cuenta', type: 'text' },
  { key: 'numero_cuenta_deposito', label: 'Número de cuenta', type: 'text' },
  { key: 'titular_cuenta_deposito', label: 'Titular de la cuenta', type: 'text' },
] as const;

export function toEditingValue(value: unknown, type: string): string {
  if (value == null || value === '') return '';
  if (type === 'date') return String(value).split('T')[0];
  if (type === 'datetime-local') {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return '';
    // Render in the browser's local timezone; convert back to UTC on save.
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  return String(value);
}

export function getAdditionalContractUpdates(form: Record<string, unknown>, original: Record<string, unknown>) {
  const updates: Record<string, string | number | null> = {};
  for (const field of additionalContractFields) {
    const value = form[field.key];
    if (value === original[field.key]) continue;
    if (field.type === 'number') {
      const amount = Number(value || 0);
      if (!Number.isFinite(amount) || amount < 0) throw new Error(`${field.label}: ingresa un valor válido.`);
      updates[field.key] = amount;
    } else if (field.type === 'datetime-local') {
      updates[field.key] = value ? new Date(String(value)).toISOString() : null;
    } else {
      updates[field.key] = value == null || value === '' ? null : String(value);
    }
  }
  return updates;
}
