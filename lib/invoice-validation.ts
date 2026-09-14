export const INVOICE_REQUIRED_MESSAGE = 'El campo Factura es obligatorio. Ingresa el número de factura para guardar.';

export function requireInvoice(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(INVOICE_REQUIRED_MESSAGE);
  }
  return value.trim();
}

// Unrelated edits must not rewrite a legacy invoice that is still pending.
export function getInvoiceUpdate(value: unknown, original: unknown): { numero_factura?: string } {
  if ((value ?? '') === (original ?? '')) return {};
  return { numero_factura: requireInvoice(value) };
}
