import { addDays, subDays, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';

export interface ContractBlock {
  id: string;
  contractNumber: string;
  clientName: string;
  type: string;
  warningStart: Date;
  start: Date;
  end: Date;
  eventDate: Date;
}

export const BLOCK_DAYS = {
  evento: { before: 3, after: 2 },
  prexv: { before: 1, after: 1 },
  especial: { before: 1, after: 1 }
} as const;

export function getMaintenanceDays(tipoEvento?: string) {
  return tipoEvento === 'PreXV' || tipoEvento === 'Fotografía' ? 1 : 2;
}

export function parseSafeDate(dateString: string | null | undefined): Date | null {
  if (!dateString) return null;
  const parsed = parseISO(dateString.split('T')[0]);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function generateBlockedRanges(contracts: any[]): ContractBlock[] {
  const blocks: ContractBlock[] = [];
  for (const item of contracts) {
    const c = item.contratos || item;
    // A draft blocks the dress once it has money (anticipo): the family already paid even if it has not signed in the ERP.
    const est = String(c.estado || '').toLowerCase();
    if (['cancelado', 'anulado', 'rechazado'].includes(est) || (est === 'borrador' && !(Number(c.anticipo) > 0))) continue;
    const addBlock = (kind: keyof typeof BLOCK_DAYS, dateValue: string, id: string) => {
      const date = parseSafeDate(dateValue);
      if (!date) return;
      const { before, after } = BLOCK_DAYS[kind];
      const start = startOfDay(subDays(date, before));
      blocks.push({
        id, contractNumber: c.numero_contrato, clientName: c.cliente_nombre,
        type: kind === 'evento' ? 'Evento' : kind === 'prexv' ? 'PreXV' : 'Fecha especial',
        warningStart: start, start, end: endOfDay(addDays(date, after)), eventDate: startOfDay(date)
      });
    };
    // Every milestone is independent: an erroneous expected availability date
    // must not bridge unrelated appointments into one months-long reservation.
    if (c.fecha_evento && !['prexv', 'fotografía'].includes(String(c.tipo_evento || '').toLowerCase()))
      addBlock('evento', c.fecha_evento, `evt-${c.id}`);
    if (c.fecha_pre_xv) addBlock('prexv', c.fecha_pre_xv, `pxv-${c.id}`);
    for (const date of new Set<string>(Array.isArray(c.fechas_bloqueo_especial) ? c.fechas_bloqueo_especial : [])) {
      addBlock('especial', date, `special-${c.id}-${date}`);
    }
    if (c.bloqueo_especial_fecha && c.bloqueo_especial_vestido_id &&
      (!item.vestido_id || item.vestido_id === c.bloqueo_especial_vestido_id)) {
      addBlock('especial', c.bloqueo_especial_fecha, `legacy-${c.id}`);
    }
  }
  return blocks.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function rangesOverlap(a: ContractBlock, b: ContractBlock): boolean {
  return a.start <= b.end && b.start <= a.end;
}

export function isCurrentlyOccupied(blocks: ContractBlock[]): ContractBlock | null {
  const today = new Date();
  return blocks.find(block => isWithinInterval(today, { start: block.start, end: block.end })) || null;
}
