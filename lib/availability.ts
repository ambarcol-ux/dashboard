import { addDays, subDays, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';

export interface ContractBlock {
  id: string;
  contractNumber: string;
  clientName: string;
  type: string;
  warningStart: Date; // Días preventivos (Amarillo)
  start: Date; // Bloqueo estricto (Rojo)
  end: Date;   // Fin del bloqueo por mantenimiento
  eventDate: Date;
}

export function getMaintenanceDays(tipoEvento?: string) {
  if (tipoEvento === 'PreXV' || tipoEvento === 'Fotografía') return 2;
  return 5;
}

export function parseSafeDate(dateString: string | null | undefined): Date | null {
  if (!dateString) return null;
  try {
    return parseISO(dateString.split('T')[0]);
  } catch (e) {
    return null;
  }
}

export function generateBlockedRanges(contracts: any[]): ContractBlock[] {
  const blocks: ContractBlock[] = [];

  contracts.forEach(item => {
    // Si viene del join 'contrato_items_vestidos', la info está en item.contratos
    // Si viene directo, está en item
    const c = item.contratos || item;
    
    // Ignorar contratos cancelados o rechazados
    if (c.estado === 'cancelado' || c.estado === 'rechazado' || c.estado === 'CANCELADO') return;

    if (c.fecha_evento) {
      const eventDate = parseSafeDate(c.fecha_evento);
      const deliveryDate = parseSafeDate(c.fecha_entrega_envio || c.fecha_evento);
      
      if (eventDate && deliveryDate) {
        // Bloqueo logístico preventivo (10 días antes) y estricto (5 días antes)
        const strictDays = (c.tipo_evento === 'PreXV' || c.tipo_evento === 'Fotografía') ? 2 : 5;
        const warningDays = (c.tipo_evento === 'PreXV' || c.tipo_evento === 'Fotografía') ? 4 : 10;
        
        const warningStartBlocked = subDays(deliveryDate, warningDays);
        const startBlocked = subDays(deliveryDate, strictDays);
        
        let endBlocked: Date;
        if (c.fecha_disponibilidad_real) {
          const dReal = parseSafeDate(c.fecha_disponibilidad_real);
          endBlocked = dReal ? dReal : addDays(eventDate, getMaintenanceDays(c.tipo_evento));
        } else {
          endBlocked = addDays(eventDate, getMaintenanceDays(c.tipo_evento));
        }

        blocks.push({
          id: `evt-${c.id}`,
          contractNumber: c.numero_contrato,
          clientName: c.cliente_nombre,
          type: c.tipo_evento || 'Evento',
          warningStart: startOfDay(warningStartBlocked),
          start: startOfDay(startBlocked),
          end: endOfDay(endBlocked),
          eventDate: startOfDay(eventDate)
        });
      }
    }

    if (c.fecha_pre_xv) {
      const preXvDate = parseSafeDate(c.fecha_pre_xv);
      if (preXvDate) {
        const warningStartBlocked = subDays(preXvDate, 2);
        const startBlocked = preXvDate;
        const endBlocked = addDays(preXvDate, 2);

        blocks.push({
          id: `pxv-${c.id}`,
          contractNumber: c.numero_contrato,
          clientName: c.cliente_nombre,
          type: 'PreXV',
          warningStart: startOfDay(warningStartBlocked),
          start: startOfDay(startBlocked),
          end: endOfDay(endBlocked),
          eventDate: startOfDay(preXvDate)
        });
      }
    }
  });

  return blocks.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function isCurrentlyOccupied(blocks: ContractBlock[]): ContractBlock | null {
  const today = new Date();
  
  for (const block of blocks) {
    if (isWithinInterval(today, { start: block.start, end: block.end })) {
      return block;
    }
  }
  return null;
}
