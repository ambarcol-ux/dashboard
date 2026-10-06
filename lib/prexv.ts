export const prexvServices = [
  { id: 'fotos', label: 'Fotos', name: 'prexv_fotografo', person: 'Nombre del fotógrafo', confirmed: 'prexv_fotografo_agendado', confirmation: 'Fotógrafo agendado', date: 'fecha_fotografia' },
  { id: 'maquillaje', label: 'Maquillaje', name: 'prexv_maquilladora', person: 'Nombre de la maquilladora', confirmed: 'prexv_maquilladora_agendada', confirmation: 'Maquilladora agendada', date: 'fecha_maquillaje' },
  { id: 'locacion', label: 'Locación', name: 'prexv_locacion', person: 'Nombre de la locación', confirmed: 'prexv_locacion_confirmada', confirmation: 'Locación confirmada', date: 'fecha_pre_xv' },
] as const;
export type PrexvComponent = typeof prexvServices[number]['id'];
export type PrexvData = {
  prexv_componentes?: PrexvComponent[] | null;
  prexv_fotografo?: string | null;
  prexv_maquilladora?: string | null;
  prexv_locacion?: string | null;
  prexv_fotografo_agendado?: boolean | null;
  prexv_maquilladora_agendada?: boolean | null;
  prexv_locacion_confirmada?: boolean | null;
  fecha_pre_xv?: string | null;
  fecha_fotografia?: string | null;
  fecha_maquillaje?: string | null;
  tipo_evento?: string | null;
};
export const prexvFields = ['prexv_componentes', ...prexvServices.flatMap(s => [s.name, s.confirmed])] as const;
export const hasPrexv = (data: PrexvData) => Boolean(data.prexv_componentes?.length || data.fecha_pre_xv || ['prexv', 'ambos'].includes(data.tipo_evento?.toLowerCase() || '') || prexvServices.some(s => data[s.name]));
export const needsPrexvReview = (data: PrexvData) => data.prexv_componentes == null && hasPrexv(data);
export const includedPrexv = (data: PrexvData) => prexvServices.filter(s => data.prexv_componentes?.includes(s.id));
export function prexvPending(data: PrexvData): string[] {
  if (needsPrexvReview(data)) return ['Revisar componentes PRE-XV contratados'];
  return includedPrexv(data).filter(s => !data[s.confirmed] || !data[s.name]?.trim()).map(s => s.confirmation);
}
export function prexvSummary(data: PrexvData): string {
  if (needsPrexvReview(data)) return 'PRE-XV · Revisar componentes';
  const included = includedPrexv(data);
  if (!included.length) return 'Sin servicios PRE-XV';
  const pending = prexvPending(data).length;
  return `${included.map(s => s.label).join(' + ')} · ${pending ? included.filter(s => !data[s.confirmed] || !data[s.name]?.trim()).map(s => !data[s.name]?.trim() ? `${s.label}: falta nombre` : `${s.label}: por confirmar`).join(' · ') : 'Confirmado'}`;
}
