import { contractEvents, type CalendarContract } from './contract-calendar';

export type OperationContract = CalendarContract & { cliente_documento?: string | null; mantenimientos?: { vestido_id?:string|null; tipo?:string|null; tipo_mantenimiento?:string|null; estado?:string|null; completado?:boolean|null }[]; entregas?: { id: string }[] };
export const operationGroups = [
  { id: 'pending', label: 'Por entregar' },
  { id: 'event', label: 'En evento' },
  { id: 'care', label: 'Mantenimiento · Arreglos' },
  { id: 'laundry', label: 'Lavandería' },
  { id: 'unclassified', label: 'Por clasificar' },
  { id: 'history', label: 'Finalizados' },
  { id: 'cancelled', label: 'Desistidos / Anulados / Rechazados' },
] as const;

const normalizeCare = (value: string | null | undefined) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

export function operationGroupsForContract(contract: OperationContract): string[] {
  const state = normalizeCare(contract.estado);
  if (['cancelado', 'cancelada', 'anulado', 'anulada', 'rechazado'].includes(state)) return ['cancelled'];
  if (['finalizado', 'liquidado', 'historial'].includes(state)) return ['history'];
  if (state === 'mantenimiento') {
    const active=(contract.mantenimientos||[]).filter(row=>row.completado!==true && (['en proceso','pendiente','en mantenimiento'].includes(normalizeCare(row.estado)) || (!row.estado && row.completado===false)));
    const types=active.map(row=>normalizeCare(row.tipo||row.tipo_mantenimiento));
    const groups:string[]=[];
    if(types.some(type=>['sastreria','arreglo','arreglos','reparacion','reparacion tecnica'].includes(type)))groups.push('care');
    if(types.some(type=>type==='lavanderia'))groups.push('laundry');
    return groups.length?groups:['unclassified'];
  }
  if (['entregado', 'evento', 'en evento'].includes(state)) return ['event'];
  return ['pending'];
}

export function operationGroup(contract: OperationContract) { return operationGroupsForContract(contract)[0]; }
export function operationLabel(contract: OperationContract) {
  return operationGroupsForContract(contract).map(id=>operationGroups.find(group=>group.id===id)?.label).join(' · ');
}

export function matchesOperation(contract: OperationContract, filters: { search: string; sede: string; group: string; prexv: boolean; type: string }, hasPrexv: (c: CalendarContract) => boolean) {
  const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
  const term = normalized(filters.search.trim());
  const fields = [contract.cliente_nombre, contract.quinceanera_name, contract.cliente_documento, contract.numero_contrato, contract.numero_factura, contract.referencia_vestido];
  const digits = filters.search.replace(/\D/g, '');
  const documentMatch = /^[\d.\s-]+$/.test(filters.search.trim()) && digits.length > 0 && String(contract.cliente_documento || '').replace(/\D/g, '').includes(digits);
  const searchMatch = !term || fields.some(value => normalized(String(value || '')).includes(term)) || documentMatch;
  return (!filters.sede || contract.sede_id === filters.sede)
    && (!filters.group || operationGroupsForContract(contract).includes(filters.group))
    && (!filters.prexv || hasPrexv(contract))
    && (!filters.type || contractEvents([contract]).some(e => e.field === filters.type))
    && searchMatch;
}
