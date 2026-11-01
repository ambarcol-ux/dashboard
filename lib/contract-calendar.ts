import { prexvFields, type PrexvData } from './prexv';

export const milestoneTypes = [
  { field: 'fecha_cita_medidas', label: 'Prueba de medidas', color: 'blue' },
  { field: 'fecha_prueba_final', label: 'Prueba final', color: 'violet' },
  { field: 'fecha_entrega_envio', label: 'Entrega / envío', color: 'amber' },
  { field: 'fecha_evento', label: 'Evento', color: 'rose' },
  { field: 'fecha_pre_xv', label: 'Sesión Pre-XV', color: 'cyan' },
  { field: 'fecha_fotografia', label: 'Fotografía', color: 'cyan' },
  { field: 'fecha_maquillaje', label: 'Maquillaje', color: 'pink' },
  { field: 'fecha_retorno_prevista', label: 'Retorno previsto', color: 'green' },
  { field: 'fecha_disponibilidad_real', label: 'Disponibilidad del vestido', color: 'green' },
  { field: 'fecha_entrega_prexv', label: 'Entrega realizada Pre-XV', color: 'slate' },
  { field: 'fecha_entrega_evento', label: 'Entrega realizada evento', color: 'slate' },
] as const;

export const specialMilestoneType = {
  field: 'fechas_bloqueo_especial',
  label: 'Bloqueo fecha especial',
  color: 'amber'
} as const;

export const calendarEventTypes = [...milestoneTypes, specialMilestoneType] as const;

export type MilestoneField = typeof milestoneTypes[number]['field'];
export type ContractEventField = MilestoneField | typeof specialMilestoneType.field;

export type CalendarContract = {
  id: string;
  numero_factura?: string | null;
  numero_contrato: string;
  cliente_nombre: string;
  quinceanera_name: string | null;
  sede: string | null;
  sede_id: string | null;
  estado: string;
  tipo_evento: string | null;
  vestido_id: string | null;
  referencia_vestido: string | null;
  fechas_bloqueo_especial?: string[] | null;
  bloqueo_especial_fecha?: string | null;
  bloqueo_especial_vestido_id?: string | null;
  bloqueo_especial_referencia?: string | null;
  cliente_email?: string | null;
  cliente_whatsapp?: string | null;
  cliente_direccion?: string | null;
  observaciones_vestido?: string | null;
  valor_total?: number | null;
  saldo?: number | null;
  items?: {
    vestido_id: string | null;
    vestido?: { codigo?: string | null; foto_frente?: string | null; foto_espalda?: string | null; foto_detalle?: string | null; imagen_url?: string | null } | null;
  }[];
} & PrexvData & Partial<Record<MilestoneField, string | null>>;

export type ContractEvent = {
  id: string;
  contract: CalendarContract;
  field: ContractEventField;
  label: string;
  color: string;
  date: string;
  time: string | null;
  href: string;
};

export const calendarColumns = [
  ...prexvFields,
  'numero_factura',
  'cliente_email',
  'cliente_whatsapp',
  'cliente_direccion',
  'observaciones_vestido',
  'valor_total',
  'saldo',
  'id',
  'numero_contrato',
  'cliente_nombre',
  'quinceanera_name',
  'sede',
  'sede_id',
  'estado',
  'tipo_evento',
  'vestido_id',
  'referencia_vestido',
  'fechas_bloqueo_especial',
  'bloqueo_especial_fecha',
  'bloqueo_especial_vestido_id',
  'bloqueo_especial_referencia',
  ...milestoneTypes.map(t=>t.field),
  'items:contrato_items_vestidos(vestido_id,vestido:vestidos(codigo,foto_frente,foto_espalda,foto_detalle,imagen_url))'
].join(',');

export function bogotaDay(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(value+'T12:00:00Z');
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0,10)!==value ? null : value;
  }
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return null;
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone:'America/Bogota',
    year:'numeric',
    month:'2-digit',
    day:'2-digit'
  }).formatToParts(d);
  const get=(type:string)=>parts.find(p=>p.type===type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function contractEvents(contracts: CalendarContract[]): ContractEvent[] {
  const events = contracts.flatMap(contract => {
    const regular = milestoneTypes.flatMap(type => {
      if (
        contract.prexv_componentes != null &&
        (
          (type.field === 'fecha_fotografia' && !contract.prexv_componentes.includes('fotos')) ||
          (type.field === 'fecha_maquillaje' && !contract.prexv_componentes.includes('maquillaje'))
        )
      ) return [];

      const value =
        contract[type.field] ||
        (
          type.field === 'fecha_fotografia' && contract.prexv_componentes?.includes('fotos')
            ? contract.fecha_pre_xv
            : type.field === 'fecha_maquillaje' && contract.prexv_componentes?.includes('maquillaje')
              ? contract.fecha_pre_xv
              : null
        );

      if(!value)return [];
      const date=bogotaDay(value);
      if(!date)return [];

      return [{
        id:`${contract.id}:${type.field}`,
        contract,
        field:type.field,
        label:type.label,
        color:type.color,
        date,
        time:value.includes('T')||value.includes(' ')
          ? new Intl.DateTimeFormat('es-CO',{
              timeZone:'America/Bogota',
              hour:'2-digit',
              minute:'2-digit',
              hour12:false
            }).format(new Date(value))
          : null,
        href:`/dashboard?contratoId=${encodeURIComponent(contract.id)}`
      }];
    });

    const specialDates = Array.from(new Set([
      ...(Array.isArray(contract.fechas_bloqueo_especial) ? contract.fechas_bloqueo_especial : []),
      ...(contract.bloqueo_especial_fecha ? [contract.bloqueo_especial_fecha] : [])
    ].filter(Boolean)));

    const special = specialDates.flatMap((value, index) => {
      const date = bogotaDay(value);
      if(!date)return [];
      return [{
        id:`${contract.id}:fechas_bloqueo_especial:${date}:${index}`,
        contract,
        field:'fechas_bloqueo_especial' as const,
        label:specialMilestoneType.label,
        color:specialMilestoneType.color,
        date,
        time:null,
        href:`/dashboard?contratoId=${encodeURIComponent(contract.id)}`
      }];
    });

    return [...regular, ...special];
  });

  return events.sort((a,b)=>
    `${a.date}${a.time||''}`.localeCompare(`${b.date}${b.time||''}`) ||
    a.contract.numero_contrato.localeCompare(b.contract.numero_contrato)
  );
}

export function dayKey(date:Date){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
