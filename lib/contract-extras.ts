/** Contract data the client also signs: document type, deposit, discounts, extra services, retablo and payment methods. */
type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v) || 0;
export type ContractExtras = {
  tipo_documento_cliente?: string | null;
  valor_deposito?: number;
  tipo_documento_titular?: string | null;
  documento_titular?: string | null;
  descuento_promocion?: number;
  descuento_aliado?: number;
  servicios_contrato?: { nombre: string; valor: number }[];
  retablo_valor?: number | null;
  metodos_pago_lista?: string[];
  medio_deposito?: string | null;
};
/** Embeds to add to a contratos select so the extras travel with the contract. */
export const CONTRACT_EXTRAS_SELECT = 'servicios_contrato:contrato_servicios(servicio,descripcion,valor_cliente,estado),retablos_contrato:retablos(valor_cliente,estado)';

export function contractExtras(c: Row): ContractExtras {
  const servicios = ((c.servicios_contrato || []) as Row[])
    .filter(s => String(s.estado || '').toLowerCase() !== 'cancelado')
    .map(s => ({ nombre: [s.servicio, s.descripcion].filter(Boolean).join(' · ') || 'Servicio', valor: n(s.valor_cliente) }));
  const retablo = ((c.retablos_contrato || []) as Row[]).find(r => String(r.estado || '').toLowerCase() !== 'anulado');
  const metodos = Array.isArray(c.metodos_pago) ? (c.metodos_pago as unknown[]).map(String).filter(Boolean) : c.metodos_pago ? [String(c.metodos_pago)] : [];
  return {
    tipo_documento_cliente: (c.tipo_documento_cliente as string) || null,
    valor_deposito: n(c.valor_deposito),
    tipo_documento_titular: (c.tipo_documento_titular as string) || null,
    documento_titular: (c.documento_titular as string) || null,
    descuento_promocion: n(c.descuento_promocion),
    descuento_aliado: n(c.descuento_aliado),
    servicios_contrato: servicios,
    retablo_valor: retablo ? n(retablo.valor_cliente) : c.lleva_retablo ? 0 : null,
    metodos_pago_lista: metodos,
    medio_deposito: (c.medio_deposito as string) || null,
  };
}
