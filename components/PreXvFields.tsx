'use client';
import { dateInput } from '@/lib/calendar-edit';
import { includedPrexv, needsPrexvReview, prexvServices, prexvSummary, type PrexvData } from '@/lib/prexv';

export default function PreXvFields({ value, onChange, baseline, confirmations = false, disabled = false }: {
  value: PrexvData; baseline?: PrexvData; onChange: (patch: Partial<PrexvData>) => void; confirmations?: boolean; disabled?: boolean;
}) {
  const included = includedPrexv(value);
  const bookingChanged = (service: typeof prexvServices[number]) => Boolean(baseline && (!baseline.prexv_componentes?.includes(service.id) || value[service.name] !== baseline[service.name] || value[service.date] !== baseline[service.date] || value.fecha_pre_xv !== baseline.fecha_pre_xv));
  const change = (patch: Partial<PrexvData>) => {
    const next = { ...value, ...patch };
    for (const service of prexvServices) {
      if (!next.prexv_componentes?.includes(service.id) ||
        (service.name in patch && patch[service.name] !== value[service.name]) ||
        (service.date in patch && patch[service.date] !== value[service.date]) ||
        ('fecha_pre_xv' in patch && patch.fecha_pre_xv !== value.fecha_pre_xv)) patch[service.confirmed] = false;
    }
    onChange(patch);
  };
  return <fieldset disabled={disabled} className="space-y-4 rounded-xl border border-rose-200 bg-rose-50/40 p-4 text-black scheme-light">
    <legend className="px-2 font-bold">Servicios PRE-XV</legend>
    {needsPrexvReview(value) && <p className="text-sm text-black">Contrato anterior: revisa los servicios contratados. Sus fechas y nombres se conservan; aún no hay componentes definidos.</p>}
    <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={included.length > 0} onChange={e => change({ prexv_componentes: e.target.checked ? ['fotos'] : [] })} /> Agregar PRE-XV al contrato</label>
    {(included.length > 0 || needsPrexvReview(value)) && <>
      <p className="text-sm">Selecciona únicamente lo contratado. Puedes combinar los componentes.</p>
      <div className="flex flex-wrap gap-4">{prexvServices.map(service => <label key={service.id} className="flex items-center gap-2"><input type="checkbox" checked={value.prexv_componentes?.includes(service.id) || false} onChange={e => change({ prexv_componentes: e.target.checked ? [...(value.prexv_componentes || []), service.id] : (value.prexv_componentes || []).filter(id => id !== service.id) })} />{service.label}</label>)}</div>
      {needsPrexvReview(value) && <button type="button" onClick={() => change({ prexv_componentes: [] })} className="underline text-sm">Confirmar que no incluye estos servicios</button>}
    </>}
    {included.length > 0 && <>
      <label className="block text-sm font-semibold">Fecha de sesión PRE-XV<input className="block w-full rounded-lg border bg-white text-black p-2 mt-1" type="date" required value={dateInput(value.fecha_pre_xv).slice(0,10)} onChange={e => change({ fecha_pre_xv: e.target.value || null })} /></label>
      {included.map(service => <div key={service.id} className="space-y-2 border-t border-rose-100 pt-3">
        <label className="block text-sm font-semibold">{service.person}<input className="block w-full rounded-lg border bg-white text-black p-2 mt-1" maxLength={200} value={value[service.name] || ''} onChange={e => change({ [service.name]: e.target.value })} /></label>
        {service.id !== 'locacion' && <label className="block text-sm">Fecha y hora de {service.label.toLowerCase()}<input className="block w-full rounded-lg border bg-white text-black p-2 mt-1" type="datetime-local" value={dateInput(value[service.date])} onChange={e => change({ [service.date]: e.target.value ? new Date(e.target.value + ':00-05:00').toISOString() : null })} /></label>}
        {confirmations && <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={Boolean(value[service.confirmed])} disabled={!value[service.name]?.trim() || !value.fecha_pre_xv || bookingChanged(service)} onChange={e => onChange({ [service.confirmed]: e.target.checked })} />{service.confirmation}</label>}
      </div>)}
      {confirmations && included.some(bookingChanged) && <p className="text-sm text-black">Guarda los cambios de proveedor o fecha y vuelve a abrir el panel para confirmar las nuevas reservas.</p>}
      <p role="status" className="text-sm font-semibold">{prexvSummary(value)}</p>
      <p className="text-xs text-black">Los nombres no confirman la reserva. Confirma cada servicio desde el calendario. Cambiar proveedor o fecha requiere confirmar nuevamente.</p>
    </>}
  </fieldset>;
}
