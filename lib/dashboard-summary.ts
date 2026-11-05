import {hasPrexv, prexvPending} from './prexv';
import {saldoContrato} from './saldo';
import {totalPorCobrar, type Cobro} from './cobros';
type Row = Record<string, any>;
export const CONTRACT_PAGE_SIZE = 30;
export type DashboardFilters = {
 searchTerm: string; filtroSede: string; filtroHito: string; filtroRango: string;
 fechaDesde: string; fechaHasta: string; filtroAlerta: string; filtroTipoEvento: string;
 activeTabLogistica: string; today: string; monthStart: number; monthEnd: number; dayStart: number;
};
export function filterDashboardContracts(contratos: Row[], sedes: Row[], filters: DashboardFilters, now = Date.now()) {
 const {searchTerm,filtroSede,filtroHito,filtroRango,fechaDesde,fechaHasta,filtroAlerta,filtroTipoEvento,activeTabLogistica,today} = filters;
    let result = [...contratos];

    // 1. Prioridad: Búsqueda Global (Si hay término, ignora la pestaña activa y busca en todo)
    // El backend (Supabase) ya hizo el filtro exhaustivo (por texto y por IDs vinculados).
    // Devolvemos el resultado tal cual para asegurar que lo que trajo la BD se muestre siempre.
    if (searchTerm) {
      return result;
    }

    // 0. PREXV Filter: Only show 15-year (PreXV) contracts if toggled
    if (filtroTipoEvento === 'PREXV') {
      result = result.filter(c => hasPrexv(c));
    }

    // Apply administrative alert filters and return immediately — must mirror badge logic exactly
    // (the badges count only the selected sede, so the alert list is limited to it too).
    if (filtroAlerta !== 'ninguna' && filtroSede !== 'Todas') {
      result = result.filter(c => filtroSede === 'unassigned' ? !c.sede_id || !sedes.some(s => s.id === c.sede_id) : c.sede_id === filtroSede);
    }
    if (filtroAlerta === 'entregas_omitidas') {
      const todayStr = new Date(now).toISOString().split('T')[0];
      const ESTADOS_EXCLUIDOS_ENTREGA = [
        'finalizado', 'cancelado', 'rechazado',
        'mantenimiento', 'entregado', 'evento',
        'liquidado', 'historial'
      ];
      return result.filter(c => {
        if (!c.fecha_entrega_envio) return false;
        const estadoContrato = c.estado?.toLowerCase() || '';
        if (ESTADOS_EXCLUIDOS_ENTREGA.includes(estadoContrato)) return false;
        const hasDelivery = c.entregas && c.entregas.length > 0;
        if (hasDelivery) return false;
        if ((c.estado_entrega_envio || '') !== 'Por Entregar') return false;
        return c.fecha_entrega_envio < todayStr;
      });
    } else if (filtroAlerta === 'borradores_sin_firmar') {
      const fortyEightHoursAgo = new Date(now - 48 * 60 * 60 * 1000);
      return result.filter(c => {
        const estadoLower = c.estado?.toLowerCase();
        return (estadoLower === 'borrador' || estadoLower === 'draft') && new Date(c.created_at) < fortyEightHoursAgo;
      });
    }

    // 2. Filtrado por Pestaña Logística
    if (filtroAlerta === 'ninguna') {
      result = result.filter(c => {
        const estado = c.estado?.toLowerCase();
        switch (activeTabLogistica) {
          case 'por_entregar': {
            const hasDelivery = c.entregas && c.entregas.length > 0;
            return !['entregado', 'mantenimiento', 'finalizado', 'cancelado', 'rechazado'].includes(estado) && !hasDelivery;
          }
          case 'en_evento': {
            const hasDelivery = c.entregas && c.entregas.length > 0;
            const isExcluded = ['mantenimiento', 'finalizado', 'cancelado', 'rechazado'].includes(estado);
            return (estado === 'entregado' || hasDelivery) && !isExcluded;
          }
          case 'lavanderia':
            return estado === 'mantenimiento';
          case 'historial': {
            const totalPendiente = saldoContrato(c) + (Number(c.total_multas) || 0);
            return ['finalizado', 'cancelado', 'rechazado'].includes(estado) && totalPendiente === 0;
          }
          case 'anulados':
            return estado === 'anulado';
          default:
            return true;
        }
      });
    }

    // 3. Filtros Complementarios (Sede, Hito, Fecha)
    if (filtroSede !== 'Todas') {
      if (filtroSede === 'unassigned') {
        result = result.filter(c => !c.sede_id || !sedes.some(s => s.id === c.sede_id));
      } else {
        result = result.filter(c => c.sede_id === filtroSede);
      }
    }

    const startOfToday = Date.parse(today + 'T00:00:00Z');
    const endOfWeek = startOfToday + 7 * 24 * 60 * 60 * 1000;
    const endOfMonth = startOfToday + 30 * 24 * 60 * 60 * 1000;

    const toTimestamp = (ds: string | null) => {
      if (!ds) return null;
      try {
        const d = new Date(ds);
        if (isNaN(d.getTime())) return null;
        return Date.parse(d.toISOString().slice(0,10) + 'T00:00:00Z');
      } catch { return null; }
    };

    const isDateInRange = (t: number | null) => {
      if (!t) return false;
      if (filtroRango === 'Hoy') return t === startOfToday;
      if (filtroRango === 'Esta Semana') return t >= startOfToday && t <= endOfWeek;
      if (filtroRango === 'Este Mes') return t >= startOfToday && t <= endOfMonth;
      if (filtroRango === 'Personalizado') {
         const dDesde = toTimestamp(fechaDesde);
         const dHasta = toTimestamp(fechaHasta);
         if (dDesde && t < dDesde) return false;
         if (dHasta && t > dHasta) return false;
         return true;
      }
      return true;
    };

    if (filtroHito !== 'Todos') {
      let dateKey = '';
      if (filtroHito === 'Cita de Medidas') dateKey = 'fecha_cita_medidas';
      else if (filtroHito === 'Prueba Final') dateKey = 'fecha_prueba_final';
      else if (filtroHito === 'Fecha de Entrega/Envío') dateKey = 'fecha_entrega_envio';
      else if (filtroHito === 'Sesión Pre-XV') dateKey = 'fecha_pre_xv';

      if (dateKey) {
        result = result.filter(c => {
           const val = c[dateKey];
           if (!val) return false;
           if (filtroRango !== 'Cualquier Fecha' && !isDateInRange(toTimestamp(val))) return false;
           return true;
        });
      }
    } else if (filtroRango !== 'Cualquier Fecha') {
       result = result.filter(c => 
          isDateInRange(toTimestamp(c.fecha_cita_medidas)) || 
          isDateInRange(toTimestamp(c.fecha_prueba_final)) || 
          isDateInRange(toTimestamp(c.fecha_entrega_envio)) || 
          isDateInRange(toTimestamp(c.fecha_pre_xv))
       );
    }

    // 4. PREXV tipo evento filter after complementary filters
    if (filtroTipoEvento === 'PREXV') {
      result = result.filter(c => hasPrexv(c));
    }

    return result;
}
export function summarizeDashboard(contratos: Row[], sedes: Row[], filters: DashboardFilters, now = Date.now()) {
 const {filtroSede} = filters;
    const branchContracts = filtroSede === 'Todas' ? contratos : contratos.filter(c =>
      filtroSede === 'unassigned'
        ? !c.sede_id || !sedes.some(s => s.id === c.sede_id)
        : c.sede_id === filtroSede
    );
    const tabCounts = {
      por_entregar: branchContracts.filter(c => {
        const est = c.estado?.toLowerCase();
        const hasDelivery = c.entregas && c.entregas.length > 0;
        return !['entregado', 'mantenimiento', 'finalizado', 'cancelado', 'rechazado'].includes(est) && !hasDelivery;
      }).length,
      en_evento: branchContracts.filter(c => {
        const est = (c.estado || '').toLowerCase();
        const hasDelivery = c.entregas && c.entregas.length > 0;
        const isExcluded = ['mantenimiento', 'finalizado', 'cancelado', 'rechazado'].includes(est);
        return (est === 'entregado' || hasDelivery) && !isExcluded;
      }).length,
      lavanderia: branchContracts.filter(c => c.estado?.toLowerCase() === 'mantenimiento').length,
      historial: branchContracts.filter(c => {
        const est = c.estado?.toLowerCase();
        const totalPendiente = saldoContrato(c) + (Number(c.total_multas) || 0);
        return ['finalizado', 'cancelado', 'rechazado'].includes(est) && totalPendiente === 0;
      }).length,
    };
    const todayStr = new Date(now).toISOString().split('T')[0];
    const fortyEightHoursAgo = new Date(now - 48 * 60 * 60 * 1000);

    // Entregas Vencidas — STRICTLY 'Por Entregar' only.
    // A contract in 'Evento', 'Entregado', or with any delivery record already
    // had its dress physically dispatched — it must NOT appear as overdue.
    const ESTADOS_EXCLUIDOS_ENTREGA = [
      'finalizado', 'cancelado', 'rechazado',
      'mantenimiento', 'entregado', 'evento',
      'liquidado', 'historial'
    ];
    const entregasOmitidasCount = branchContracts.filter(c => {
      if (!c.fecha_entrega_envio) return false;
      const estadoContrato = c.estado?.toLowerCase() || '';
      if (ESTADOS_EXCLUIDOS_ENTREGA.includes(estadoContrato)) return false;
      // Exclude if the dress has already been physically delivered (en evento)
      const hasDelivery = c.entregas && c.entregas.length > 0;
      if (hasDelivery) return false;
      // Logistics state must be strictly 'Por Entregar' — 'Pendiente' alone is not overdue
      if ((c.estado_entrega_envio || '') !== 'Por Entregar') return false;
      return c.fecha_entrega_envio < todayStr;
    }).length;

    // FIX 2: Borradores — ALL drafts older than 48 h, no balance restriction whatsoever.
    const borradoresVencidosCount = branchContracts.filter(c => {
      const estadoLower = c.estado?.toLowerCase();
      return (estadoLower === 'borrador' || estadoLower === 'draft') && new Date(c.created_at) < fortyEightHoursAgo;
    }).length;

    const alerts = {
      entregasOmitidasCount,
      borradoresVencidosCount
    };
 const filtered = filterDashboardContracts(contratos, sedes, filters, now);
 return {filtered, summary: {
   tabCounts, alerts,
   total: filtered.length,
   // Same figure as Cuentas por cobrar for the selected sede (does not depend on the open tab).
   totalPendiente: totalPorCobrar(branchContracts as Cobro[]),
   monthCount: branchContracts.filter(c => {const t=Date.parse(c.created_at); return t>=filters.monthStart && t<filters.monthEnd;}).length,
   pendingInvoices: contratos.filter(c => !c.numero_factura && Date.parse(c.created_at)<filters.dayStart).length,
   prexvCount: branchContracts.filter(hasPrexv).length,
   prexvIncomplete: branchContracts.filter(c => hasPrexv(c) && !['cancelado','rechazado','finalizado'].includes(c.estado?.toLowerCase()) && prexvPending(c).length>0).length,
   hasUnassigned: contratos.some(c => !c.sede_id || !sedes.some(s => s.id===c.sede_id)),
 }};
}
export type DashboardSummary = ReturnType<typeof summarizeDashboard>['summary'];
