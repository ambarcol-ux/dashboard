'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast, Toaster } from 'sonner';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import {
  ShoppingBag, Plus, Search, Loader2, X, AlertTriangle,
  CheckCircle2, Truck, Package, Clock, Calendar, List,
  LayoutGrid, ChevronLeft, ChevronRight, FileText, User,
  MessageSquare, Camera, RefreshCw, Edit2, ArrowRight,
  Milestone, ExternalLink, Send, UploadCloud, LogOut, ShieldCheck
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
type EstadoPedido = 'pendiente_compra' | 'comprado' | 'en_transito' | 'recibido' | 'entregado';
type VistaActiva = 'kanban' | 'calendario' | 'lista';
type RiesgoNivel = 'critico' | 'riesgo' | 'ok';
type BitacoraTipo = 'nota' | 'novedad' | 'foto' | 'actualizacion_estado';

interface ContratoJoined {
  numero_contrato: string;
  cliente_nombre: string;
  fecha_entrega_envio: string | null;
  fecha_evento: string | null;
  sede: string;
}

interface Pedido {
  id: string;
  contrato_id: string | null;
  estado: EstadoPedido;
  fecha_compra: string | null;
  fecha_estimada_llegada: string | null;
  proveedor: string | null;
  referencia_compra: string | null;
  vestido_nombre: string | null;
  observaciones_generales: string | null;
  created_at: string;
  contrato?: ContratoJoined;
}

interface BitacoraEntry {
  id: string;
  pedido_id: string;
  tipo: BitacoraTipo;
  contenido: string;
  fotos_urls: string[];
  usuario: string;
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ESTADOS: {
  id: EstadoPedido; label: string; emoji: string;
  color: string; bgCard: string; border: string; badge: string;
}[] = [
  { id: 'pendiente_compra', label: 'Pendiente de Compra', emoji: '⏳', color: 'text-gray-600',   bgCard: 'bg-gray-50',   border: 'border-gray-200',   badge: 'bg-gray-100 text-gray-700' },
  { id: 'comprado',         label: 'Comprado',            emoji: '🛒', color: 'text-blue-600',   bgCard: 'bg-blue-50',   border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-700' },
  { id: 'en_transito',      label: 'En Tránsito',         emoji: '🚚', color: 'text-amber-600',  bgCard: 'bg-amber-50',  border: 'border-amber-200',  badge: 'bg-amber-100 text-amber-700' },
  { id: 'recibido',         label: 'Recibido en Tienda',  emoji: '📦', color: 'text-teal-600',   bgCard: 'bg-teal-50',   border: 'border-teal-200',   badge: 'bg-teal-100 text-teal-700' },
  { id: 'entregado',        label: 'Entregado a Cliente', emoji: '✅', color: 'text-emerald-600', bgCard: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700' },
];

const TIPO_BITACORA: { id: BitacoraTipo; label: string; icon: string }[] = [
  { id: 'nota',               label: 'Nota',                     icon: '📝' },
  { id: 'novedad',            label: 'Novedad / Incidencia',     icon: '⚠️' },
  { id: 'foto',               label: 'Reporte con Foto',         icon: '📷' },
  { id: 'actualizacion_estado', label: 'Actualiz. Estado',       icon: '🔄' },
];

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS_SEMANA = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const calcRiesgo = (fechaETA: string | null, fechaEntrega: string | null): RiesgoNivel => {
  if (!fechaETA || !fechaEntrega) return 'ok';
  const eta = new Date(fechaETA).getTime();
  const entrega = new Date(fechaEntrega).getTime();
  const margen = Math.round((entrega - eta) / (1000 * 60 * 60 * 24));
  if (margen <= 0) return 'critico';
  if (margen <= 5) return 'riesgo';
  return 'ok';
};

const riesgoConfig: Record<RiesgoNivel, { label: string; className: string; dot: string }> = {
  critico: { label: '🔴 Crítico — No alcanza', className: 'bg-rose-100 text-rose-700 border border-rose-200',     dot: 'bg-rose-500' },
  riesgo:  { label: '🟡 Ajustado — Riesgo',    className: 'bg-amber-100 text-amber-700 border border-amber-200',   dot: 'bg-amber-500' },
  ok:      { label: '🟢 A tiempo',              className: 'bg-emerald-100 text-emerald-700 border border-emerald-200', dot: 'bg-emerald-500' },
};

const fmt = (d: string | null) => {
  if (!d) return '—';
  const part = d.split('T')[0];
  const [y, m, day] = part.split('-');
  return `${day}/${m}/${y}`;
};

const diasParaFecha = (d: string | null): number | null => {
  if (!d) return null;
  const diff = new Date(d.split('T')[0]).getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.round(diff / (1000 * 60 * 60 * 24));
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PedidosEstrenePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Data
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [contratosDisponibles, setContratosDisponibles] = useState<any[]>([]);
  const [bitacora, setBitacora] = useState<BitacoraEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingBitacora, setLoadingBitacora] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // UI
  const [vistaActiva, setVistaActiva] = useState<VistaActiva>('kanban');
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<EstadoPedido | 'todos'>('todos');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null);
  const [nuevaEntrada, setNuevaEntrada] = useState<{ tipo: BitacoraTipo; contenido: string }>({ tipo: 'nota', contenido: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [modalForm, setModalForm] = useState({
    contrato_id: '', proveedor: '', referencia_compra: '', vestido_nombre: '',
    fecha_compra: '', fecha_estimada_llegada: '', observaciones_generales: '',
    estado: 'pendiente_compra' as EstadoPedido,
  });

  // Calendar
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  // ─── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    setIsMounted(true);
    const init = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.push('/login'); return; }
      const { data: pData } = await supabase.from('profiles').select('*').eq('id', authUser.id).maybeSingle();
      setUser({ ...authUser, rol: pData?.rol || 'asesora', nombre: pData?.nombre || authUser.email });
    };
    init();
  }, [router]);

  // ─── Fetch Pedidos ─────────────────────────────────────────────────────────
  const fetchPedidos = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('pedidos_alquiler_estrene')
        .select('*, contrato:contratos(numero_contrato, cliente_nombre, fecha_entrega_envio, fecha_evento, sede)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPedidos((data || []) as Pedido[]);
    } catch (err: any) {
      toast.error('Error al cargar pedidos: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchContratosDisponibles = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('contratos')
        .select('id, numero_contrato, cliente_nombre, fecha_entrega_envio, fecha_evento, sede, created_at, referencia_vestido')
        .not('estado', 'in', '(cancelado,rechazado,finalizado)')
        .order('created_at', { ascending: false })
        .limit(300);
      setContratosDisponibles(data || []);
    } catch { /* silently */ }
  }, []);



  useEffect(() => { fetchPedidos(); fetchContratosDisponibles(); }, [fetchPedidos, fetchContratosDisponibles]);

  // ─── Bitácora ──────────────────────────────────────────────────────────────
  const fetchBitacora = useCallback(async (pedidoId: string) => {
    setLoadingBitacora(true);
    try {
      const { data, error } = await supabase
        .from('bitacora_pedidos_estrene')
        .select('*')
        .eq('pedido_id', pedidoId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setBitacora((data || []) as BitacoraEntry[]);
    } catch (err: any) {
      toast.error('Error bitácora: ' + err.message);
    } finally {
      setLoadingBitacora(false);
    }
  }, []);

  const openDrawer = (pedido: Pedido) => {
    setSelectedPedido(pedido);
    setDrawerOpen(true);
    fetchBitacora(pedido.id);
    setNuevaEntrada({ tipo: 'nota', contenido: '' });
  };

  const submitBitacora = async () => {
    if (!selectedPedido || !nuevaEntrada.contenido.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('bitacora_pedidos_estrene').insert({
        pedido_id: selectedPedido.id,
        tipo: nuevaEntrada.tipo,
        contenido: nuevaEntrada.contenido.trim(),
        fotos_urls: [],
        usuario: user?.nombre || user?.email || 'Operador',
      });
      if (error) throw error;
      toast.success('Entrada registrada ✅');
      setNuevaEntrada({ tipo: 'nota', contenido: '' });
      await fetchBitacora(selectedPedido.id);
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Estado ────────────────────────────────────────────────────────────────
  const cambiarEstado = async (pedidoId: string, nuevoEstado: EstadoPedido) => {
    try {
      const { error } = await supabase
        .from('pedidos_alquiler_estrene')
        .update({ estado: nuevoEstado })
        .eq('id', pedidoId);
      if (error) throw error;
      const label = ESTADOS.find(e => e.id === nuevoEstado)?.label || nuevoEstado;
      await supabase.from('bitacora_pedidos_estrene').insert({
        pedido_id: pedidoId,
        tipo: 'actualizacion_estado',
        contenido: `Estado actualizado a: ${label}`,
        fotos_urls: [],
        usuario: user?.nombre || 'Sistema',
      });
      toast.success(`Estado → ${label}`);
      await fetchPedidos();
      if (selectedPedido?.id === pedidoId) {
        setSelectedPedido(p => p ? { ...p, estado: nuevoEstado } : p);
        await fetchBitacora(pedidoId);
      }
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    }
  };

  // ─── Crear Pedido ──────────────────────────────────────────────────────────
  const crearPedido = async () => {
    if (!modalForm.contrato_id) { toast.error('Selecciona un contrato'); return; }
    setSubmitting(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      // Helper: devuelve fecha YYYY-MM-DD válida, fallback si no
      const safeDate = (val: string | null | undefined, fallback: string | null = null): string | null => {
        if (!val || !val.trim()) return fallback;
        const part = val.split('T')[0];
        if (/^\d{4}-\d{2}-\d{2}$/.test(part)) return part;
        return fallback;
      };

      // Sanitizar variables del formulario
      const contratoId = modalForm.contrato_id;
      const fechaCompra = modalForm.fecha_compra;
      const fechaEstimada = modalForm.fecha_estimada_llegada;

      const contrato_id_safe = contratoId && contratoId.trim() !== "" ? contratoId : null;

      // Buscar el contrato para extraer fechas heredadas
      const contratoSel = contratosDisponibles.find(c => c.id === contrato_id_safe);

      // Fechas NOT NULL — siempre tienen fallback "today"
      const fecha_contrato: string       = safeDate(contratoSel?.created_at, today)!;
      const fecha_entrega_cliente: string =
        safeDate(contratoSel?.fecha_entrega_envio) ||
        safeDate(contratoSel?.fecha_evento) ||
        today;

      // Construir payload — sin id ni created_at (los genera Supabase)
      const payload: Record<string, unknown> = {
        contrato_id:            contratoId && contratoId.trim() !== "" ? contratoId : null,
        estado:                 modalForm.estado,
        proveedor:              modalForm.proveedor.trim()          || null,
        referencia_compra:      modalForm.referencia_compra.trim()  || null,
        vestido_nombre:         modalForm.vestido_nombre.trim()     || null,
        fecha_compra:           fechaCompra && fechaCompra.trim() !== "" ? fechaCompra : null,
        fecha_estimada_llegada: fechaEstimada && fechaEstimada.trim() !== "" ? fechaEstimada : null,
        observaciones_generales: modalForm.observaciones_generales.trim()       || null,
        fecha_contrato,          // always YYYY-MM-DD
        fecha_entrega_cliente,   // always YYYY-MM-DD
      };

      // Eliminar preventivamente cualquier campo que el cliente no debe enviar
      delete payload.id;
      delete payload.created_at;

      console.log('Payload a insertar:', payload);

      const { error } = await supabase.from('pedidos_alquiler_estrene').insert(payload);

      if (error) {
        // Extraer propiedades no-enumerables del objeto error de Supabase
        console.error('Detalle error Supabase:', {
          message: error.message,
          details: error.details,
          hint:    error.hint,
          code:    error.code,
        });
        alert(`Error al guardar: ${error.message || 'Error desconocido en Supabase'}\nCódigo: ${error.code}\nHint: ${error.hint || '—'}\nDetalle: ${error.details || '—'}`);
        throw error;
      }

      toast.success('Pedido creado ✅');
      setModalOpen(false);
      setModalForm({
        contrato_id: '', proveedor: '', referencia_compra: '', vestido_nombre: '',
        fecha_compra: '', fecha_estimada_llegada: '', observaciones_generales: '',
        estado: 'pendiente_compra',
      });
      setModalSearch('');
      await fetchPedidos();
    } catch (err: any) {
      // El error ya fue mostrado en el alert() si viene de Supabase
      if (!err?.code) {
        toast.error('Error inesperado: ' + (err?.message || JSON.stringify(err)));
      }
    } finally {
      setSubmitting(false);
    }
  };




  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // ─── Filtered ─────────────────────────────────────────────────────────────
  const pedidosFiltrados = useMemo(() => {
    let r = [...pedidos];
    if (filtroEstado !== 'todos') r = r.filter(p => p.estado === filtroEstado);
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      r = r.filter(p =>
        p.contrato?.cliente_nombre?.toLowerCase().includes(q) ||
        p.contrato?.numero_contrato?.toLowerCase().includes(q) ||
        p.proveedor?.toLowerCase().includes(q) ||
        p.referencia_compra?.toLowerCase().includes(q) ||
        p.vestido_nombre?.toLowerCase().includes(q)
      );
    }
    return r;
  }, [pedidos, filtroEstado, searchTerm]);

  const kpis = useMemo(() => ({
    total: pedidos.length,
    enTransito: pedidos.filter(p => p.estado === 'en_transito').length,
    enRiesgo: pedidos.filter(p => {
      const r = calcRiesgo(p.fecha_estimada_llegada, p.contrato?.fecha_entrega_envio || p.contrato?.fecha_evento || null);
      return r === 'critico' || r === 'riesgo';
    }).length,
    completados: pedidos.filter(p => p.estado === 'entregado').length,
  }), [pedidos]);

  // ─── Calendar ─────────────────────────────────────────────────────────────
  const calendarDays = useMemo(() => {
    const first = new Date(calYear, calMonth, 1);
    const last = new Date(calYear, calMonth + 1, 0);
    const startDow = (first.getDay() + 6) % 7;
    const days: (number | null)[] = Array(startDow).fill(null);
    for (let d = 1; d <= last.getDate(); d++) days.push(d);
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [calYear, calMonth]);

  const pedidosPorDia = useMemo(() => {
    const map: Record<string, Pedido[]> = {};
    pedidos.forEach(p => {
      [p.fecha_estimada_llegada, p.contrato?.fecha_entrega_envio].forEach(f => {
        if (!f) return;
        const key = f.split('T')[0];
        if (!map[key]) map[key] = [];
        if (!map[key].find(x => x.id === p.id)) map[key].push(p);
      });
    });
    return map;
  }, [pedidos]);

  const contratosFiltradosModal = useMemo(() => {
    if (!modalSearch.trim()) return contratosDisponibles.slice(0, 50);
    const q = modalSearch.toLowerCase();
    return contratosDisponibles.filter(c =>
      c.numero_contrato?.toLowerCase().includes(q) ||
      c.cliente_nombre?.toLowerCase().includes(q)
    ).slice(0, 30);
  }, [contratosDisponibles, modalSearch]);

  if (!isMounted) return null;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Toaster richColors position="top-right" />
      <Sidebar user={user} handleLogout={handleLogout} activePage="dashboard" />

      <main className="flex-1 overflow-y-auto pt-16 lg:pt-0">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="bg-white border-b border-gray-100 sticky top-0 z-20 lg:z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-200 flex-shrink-0">
                <ShoppingBag className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-black text-gray-900 tracking-tight uppercase leading-tight">
                  Pedidos Alquiler Estrene
                </h1>
                <p className="text-xs font-bold text-violet-500 uppercase tracking-widest mt-0.5">
                  Trazabilidad · Proveedor → Clienta
                </p>
              </div>
            </div>
            <button
              onClick={() => { setModalOpen(true); fetchContratosDisponibles(); }}
              className="flex items-center gap-2 px-5 py-3 bg-violet-600 hover:bg-violet-700 text-white font-black text-sm rounded-2xl shadow-lg shadow-violet-200 transition-all active:scale-95 border-b-4 border-violet-800 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Nuevo Pedido
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

          {/* ── KPIs ──────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {([
              { label: 'Total Pedidos', value: kpis.total,       icon: ShoppingBag,   bg: 'bg-violet-50',  ic: 'text-violet-600' },
              { label: 'En Tránsito',   value: kpis.enTransito,   icon: Truck,          bg: 'bg-amber-50',   ic: 'text-amber-600' },
              { label: 'En Riesgo',     value: kpis.enRiesgo,     icon: AlertTriangle,  bg: 'bg-rose-50',    ic: 'text-rose-600' },
              { label: 'Entregados',    value: kpis.completados,  icon: CheckCircle2,   bg: 'bg-emerald-50', ic: 'text-emerald-600' },
            ] as const).map(({ label, value, icon: Icon, bg, ic }) => (
              <div key={label} className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4 shadow-sm">
                <div className={`w-11 h-11 ${bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-5 h-5 ${ic}`} />
                </div>
                <div>
                  <p className="text-2xl font-black text-gray-900 leading-none">{value}</p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mt-0.5">{label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Toolbar ───────────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="relative flex-1 min-w-0 w-full sm:w-auto">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar cliente, contrato, proveedor..."
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-violet-300 outline-none"
              />
            </div>
            <select
              value={filtroEstado}
              onChange={e => setFiltroEstado(e.target.value as any)}
              className="bg-white border border-gray-200 text-gray-700 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-violet-300 outline-none"
            >
              <option value="todos">Todos los estados</option>
              {ESTADOS.map(e => <option key={e.id} value={e.id}>{e.emoji} {e.label}</option>)}
            </select>
            <div className="flex bg-gray-100 p-1 rounded-xl gap-1">
              {([
                { id: 'kanban',    icon: LayoutGrid,   label: 'Kanban' },
                { id: 'calendario', icon: Calendar,     label: 'Calendario' },
                { id: 'lista',     icon: List,          label: 'Lista' },
              ] as const).map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => setVistaActiva(id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black transition-all ${
                    vistaActiva === id ? 'bg-white text-violet-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
            <button onClick={fetchPedidos} className="p-2.5 bg-white border border-gray-200 rounded-xl text-gray-500 hover:text-violet-600 hover:border-violet-200 transition-all flex-shrink-0">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* KANBAN VIEW                                                      */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {!loading && vistaActiva === 'kanban' && (
            <div className="overflow-x-auto pb-4 -mx-4 px-4">
              <div className="flex gap-4 min-w-[960px]">
                {ESTADOS.map(estado => {
                  const col = pedidosFiltrados.filter(p => p.estado === estado.id);
                  return (
                    <div key={estado.id} className="flex-1 min-w-[200px]">
                      <div className={`flex items-center justify-between px-4 py-3 bg-white rounded-t-2xl border-b-2 ${estado.border} shadow-sm mb-3`}>
                        <div className="flex items-center gap-2">
                          <span className="text-base">{estado.emoji}</span>
                          <span className="text-[11px] font-black text-gray-700 uppercase tracking-tight leading-tight">{estado.label}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${estado.badge}`}>{col.length}</span>
                      </div>
                      <div className="space-y-3">
                        {col.length === 0 ? (
                          <div className="text-center text-gray-300 text-xs py-10 bg-white rounded-2xl border-2 border-dashed border-gray-200">
                            Sin pedidos
                          </div>
                        ) : col.map(pedido => (
                          <PedidoCard
                            key={pedido.id}
                            pedido={pedido}
                            onOpen={openDrawer}
                            onCambiarEstado={cambiarEstado}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* CALENDAR VIEW                                                    */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {!loading && vistaActiva === 'calendario' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <button
                  onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }}
                  className="p-2 hover:bg-gray-100 rounded-xl transition-all"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-500" />
                </button>
                <h2 className="text-lg font-black text-gray-900">{MESES[calMonth]} {calYear}</h2>
                <button
                  onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }}
                  className="p-2 hover:bg-gray-100 rounded-xl transition-all"
                >
                  <ChevronRight className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="grid grid-cols-7 border-b border-gray-100">
                {DIAS_SEMANA.map(d => (
                  <div key={d} className="text-center text-[10px] font-black text-gray-400 uppercase tracking-widest py-2.5">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {calendarDays.map((day, i) => {
                  if (!day) return <div key={i} className="min-h-[90px] bg-gray-50/30 border-b border-r border-gray-100" />;
                  const dateKey = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const isToday = dateKey === new Date().toISOString().split('T')[0];
                  const dayPedidos = pedidosPorDia[dateKey] || [];
                  return (
                    <div key={i} className={`min-h-[90px] border-b border-r border-gray-100 p-1.5 ${isToday ? 'bg-violet-50' : 'bg-white hover:bg-gray-50'} transition-colors`}>
                      <span className={`text-xs font-black w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-violet-600 text-white' : 'text-gray-600'}`}>{day}</span>
                      <div className="mt-1 space-y-0.5">
                        {dayPedidos.slice(0, 3).map(p => {
                          const r = calcRiesgo(p.fecha_estimada_llegada, p.contrato?.fecha_entrega_envio || null);
                          const bg = r === 'critico' ? 'bg-rose-500' : r === 'riesgo' ? 'bg-amber-400' : 'bg-violet-500';
                          return (
                            <button
                              key={p.id}
                              onClick={() => openDrawer(p)}
                              className={`w-full text-left px-1.5 py-0.5 ${bg} text-white rounded text-[9px] font-bold truncate hover:opacity-80 transition-opacity`}
                            >
                              {p.contrato?.cliente_nombre || p.vestido_nombre || p.referencia_compra || 'Pedido'}
                            </button>
                          );
                        })}
                        {dayPedidos.length > 3 && (
                          <p className="text-[9px] text-gray-400 font-bold pl-1">+{dayPedidos.length - 3} más</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-6 px-6 py-3 border-t border-gray-100 bg-gray-50/50">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Referencia de riesgo:</span>
                {Object.entries(riesgoConfig).map(([key, cfg]) => (
                  <div key={key} className="flex items-center gap-1.5 text-xs font-bold text-gray-500">
                    <div className={`w-3 h-3 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* LIST VIEW                                                        */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {!loading && vistaActiva === 'lista' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs uppercase tracking-wider">
                      <th className="px-5 py-3.5 font-semibold">Contrato / Cliente</th>
                      <th className="px-5 py-3.5 font-semibold">Proveedor / Ref.</th>
                      <th className="px-5 py-3.5 font-semibold">Fecha Compra</th>
                      <th className="px-5 py-3.5 font-semibold">ETA Llegada</th>
                      <th className="px-5 py-3.5 font-semibold">Entrega Cliente</th>
                      <th className="px-5 py-3.5 font-semibold">Estado</th>
                      <th className="px-5 py-3.5 font-semibold">Riesgo</th>
                      <th className="px-5 py-3.5 font-semibold text-right sticky right-0 bg-gray-50">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pedidosFiltrados.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-5 py-12 text-center text-gray-400 text-sm">
                          No hay pedidos que coincidan con los filtros.
                        </td>
                      </tr>
                    )}
                    {pedidosFiltrados.map(pedido => {
                      const riesgo = calcRiesgo(
                        pedido.fecha_estimada_llegada,
                        pedido.contrato?.fecha_entrega_envio || pedido.contrato?.fecha_evento || null
                      );
                      const estado = ESTADOS.find(e => e.id === pedido.estado);
                      const fechaEntrega = pedido.contrato?.fecha_entrega_envio || pedido.contrato?.fecha_evento;
                      const diasRestantes = diasParaFecha(fechaEntrega || null);
                      return (
                        <tr
                          key={pedido.id}
                          className={`transition-colors ${
                            riesgo === 'critico' ? 'bg-rose-50/40 hover:bg-rose-50' :
                            riesgo === 'riesgo'  ? 'bg-amber-50/40 hover:bg-amber-50' :
                            'hover:bg-violet-50/30'
                          }`}
                        >
                          <td className="px-5 py-3.5">
                            <div className="font-bold text-gray-900 text-sm">{pedido.contrato?.numero_contrato || '—'}</div>
                            <div className="text-xs text-gray-500">{pedido.contrato?.cliente_nombre || 'Sin contrato'}</div>
                            <div className="text-[10px] text-gray-400">{pedido.contrato?.sede}</div>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="font-semibold text-gray-800 text-sm">{pedido.proveedor || '—'}</div>
                            <div className="text-xs text-gray-400 font-mono">{pedido.referencia_compra || ''}</div>
                          </td>
                          <td className="px-5 py-3.5 text-sm text-gray-700 font-medium">{fmt(pedido.fecha_compra)}</td>
                          <td className="px-5 py-3.5 text-sm font-bold text-gray-800">{fmt(pedido.fecha_estimada_llegada)}</td>
                          <td className="px-5 py-3.5">
                            <div className="text-sm font-bold text-gray-800">{fmt(fechaEntrega || null)}</div>
                            {diasRestantes !== null && (
                              <div className={`text-[10px] font-black mt-0.5 ${diasRestantes <= 0 ? 'text-rose-600' : diasRestantes <= 7 ? 'text-amber-600' : 'text-gray-400'}`}>
                                {diasRestantes <= 0 ? `⚠️ ${Math.abs(diasRestantes)}d pasados` : `en ${diasRestantes}d`}
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`px-2.5 py-1 rounded-lg text-xs font-black ${estado?.badge || 'bg-gray-100 text-gray-700'}`}>
                              {estado?.emoji} {estado?.label || pedido.estado}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`px-2 py-1 rounded-lg text-[10px] font-black ${riesgoConfig[riesgo].className}`}>
                              {riesgoConfig[riesgo].label}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right sticky right-0 bg-white/95">
                            <button
                              onClick={() => openDrawer(pedido)}
                              className="px-3 py-1.5 bg-violet-50 hover:bg-violet-100 text-violet-600 font-black text-xs rounded-lg transition-all"
                            >
                              Ver →
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loading && pedidos.length === 0 && (
            <div className="text-center py-20 bg-white rounded-2xl border-2 border-dashed border-gray-200">
              <div className="w-16 h-16 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <ShoppingBag className="w-8 h-8 text-violet-300" />
              </div>
              <h3 className="font-black text-gray-700 text-lg mb-2">Sin pedidos registrados</h3>
              <p className="text-gray-400 text-sm mb-6 max-w-xs mx-auto">Vincula contratos de Alquiler Estrene para comenzar el seguimiento de pedidos.</p>
              <button
                onClick={() => setModalOpen(true)}
                className="px-6 py-3 bg-violet-600 text-white font-black rounded-2xl hover:bg-violet-700 transition-all shadow-lg shadow-violet-200"
              >
                Crear Primer Pedido
              </button>
            </div>
          )}
        </div>
      </main>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* DRAWER — Detalle + Bitácora                                         */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {drawerOpen && selectedPedido && (
        <>
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 animate-in fade-in duration-200"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="fixed right-0 top-0 h-full w-full max-w-[480px] bg-white z-50 shadow-2xl flex flex-col animate-in slide-in-from-right-4 duration-300">

            {/* Drawer Header */}
            <div className="bg-violet-600 px-6 py-5 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-white font-black text-lg tracking-tight leading-none">
                  {selectedPedido.contrato?.numero_contrato || 'Pedido'}
                </h2>
                <p className="text-violet-200 text-xs font-bold mt-1">
                  {selectedPedido.contrato?.cliente_nombre || '—'} · {selectedPedido.contrato?.sede}
                </p>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="p-2 hover:bg-violet-700 rounded-full transition-colors">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">

              {/* Risk Banner */}
              {(() => {
                const riesgo = calcRiesgo(
                  selectedPedido.fecha_estimada_llegada,
                  selectedPedido.contrato?.fecha_entrega_envio || selectedPedido.contrato?.fecha_evento || null
                );
                return (
                  <div className={`px-4 py-3 rounded-xl text-sm font-black ${riesgoConfig[riesgo].className}`}>
                    {riesgoConfig[riesgo].label}
                    {riesgo !== 'ok' && (
                      <p className="text-xs font-medium mt-0.5 opacity-80">
                        Revisa las fechas del proveedor y coordina con el equipo.
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Dates Grid */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Fecha Contrato', value: selectedPedido.created_at },
                  { label: 'Entrega Cliente', value: selectedPedido.contrato?.fecha_entrega_envio || selectedPedido.contrato?.fecha_evento || null },
                  { label: 'Fecha de Compra', value: selectedPedido.fecha_compra },
                  { label: 'ETA Proveedor',   value: selectedPedido.fecha_estimada_llegada },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">{label}</p>
                    <p className="text-sm font-bold text-gray-900">{fmt(value || null)}</p>
                  </div>
                ))}
              </div>

              {/* Info */}
              <div className="space-y-2.5">
                {selectedPedido.proveedor && (
                  <div className="flex items-center gap-3 text-sm">
                    <Truck className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-gray-500">Proveedor:</span>
                    <span className="font-bold text-gray-800">{selectedPedido.proveedor}</span>
                  </div>
                )}
                {selectedPedido.vestido_nombre && (
                  <div className="flex items-center gap-3 text-sm">
                    <ShoppingBag className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-gray-500">Vestido:</span>
                    <span className="font-bold text-gray-800">{selectedPedido.vestido_nombre}</span>
                  </div>
                )}
                {selectedPedido.referencia_compra && (
                  <div className="flex items-center gap-3 text-sm">
                    <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-gray-500">Referencia:</span>
                    <span className="font-mono text-gray-700 bg-gray-100 px-2 py-0.5 rounded text-xs">{selectedPedido.referencia_compra}</span>
                  </div>
                )}
                {selectedPedido.observaciones_generales && (
                  <div className="flex gap-3 text-sm">
                    <MessageSquare className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <p className="text-gray-600 text-xs leading-relaxed">{selectedPedido.observaciones_generales}</p>
                  </div>
                )}
              </div>

              {/* Cambiar Estado */}
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2.5">Cambiar Estado del Pedido</p>
                <div className="flex flex-wrap gap-2">
                  {ESTADOS.map(e => (
                    <button
                      key={e.id}
                      onClick={() => cambiarEstado(selectedPedido.id, e.id)}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition-all border ${
                        selectedPedido.estado === e.id
                          ? `${e.badge} ${e.border} ring-2 ring-offset-1`
                          : `bg-white ${e.border} ${e.color} hover:opacity-80`
                      }`}
                    >
                      {e.emoji} {e.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-px bg-gray-100" />

              {/* Nueva entrada bitácora */}
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Nueva Entrada de Bitácora</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {TIPO_BITACORA.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setNuevaEntrada(p => ({ ...p, tipo: t.id }))}
                        className={`py-2 px-2 rounded-xl text-[10px] font-black transition-all border text-center ${
                          nuevaEntrada.tipo === t.id
                            ? 'bg-violet-600 text-white border-violet-700'
                            : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-violet-200'
                        }`}
                      >
                        {t.icon} {t.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={nuevaEntrada.contenido}
                    onChange={e => setNuevaEntrada(p => ({ ...p, contenido: e.target.value }))}
                    placeholder="Escribe la novedad, nota o actualización de estado..."
                    rows={3}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-violet-300 outline-none resize-none"
                  />
                  <button
                    onClick={submitBitacora}
                    disabled={submitting || !nuevaEntrada.contenido.trim()}
                    className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-black rounded-xl transition-all flex items-center justify-center gap-2 border-b-4 border-violet-800 active:border-b-0 active:translate-y-1"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Registrar en Bitácora
                  </button>
                </div>
              </div>

              <div className="h-px bg-gray-100" />

              {/* Timeline */}
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">
                  Historial / Timeline ({bitacora.length})
                </p>
                {loadingBitacora && (
                  <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-violet-300" /></div>
                )}
                {!loadingBitacora && bitacora.length === 0 && (
                  <div className="text-center text-gray-300 text-sm py-8 border-2 border-dashed border-gray-200 rounded-xl">
                    Sin entradas en la bitácora
                  </div>
                )}
                <div className="space-y-3">
                  {bitacora.map((entry, i) => {
                    const tipoInfo = TIPO_BITACORA.find(t => t.id === entry.tipo);
                    return (
                      <div key={entry.id} className="flex gap-3 relative">
                        {i < bitacora.length - 1 && (
                          <div className="absolute left-4 top-8 w-0.5 bg-gray-100 h-full z-0" />
                        )}
                        <div className="w-8 h-8 flex-shrink-0 bg-violet-50 border border-violet-100 rounded-full flex items-center justify-center text-sm z-10">
                          {tipoInfo?.icon || '📝'}
                        </div>
                        <div className="flex-1 min-w-0 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="text-[10px] font-black text-violet-600 uppercase tracking-wide">{tipoInfo?.label || entry.tipo}</span>
                            <span className="text-[9px] text-gray-400 font-medium flex-shrink-0">
                              {new Date(entry.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 leading-relaxed">{entry.contenido}</p>
                          <p className="text-[10px] text-gray-400 mt-1.5">— {entry.usuario}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </aside>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* MODAL — Nuevo Pedido                                                */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">

            <div className="bg-violet-600 px-6 py-5 flex items-center justify-between">
              <div>
                <h2 className="text-white font-black text-lg">Nuevo Pedido Estrene</h2>
                <p className="text-violet-200 text-xs font-bold mt-0.5">Vincula un contrato y registra el pedido al proveedor</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="p-2 hover:bg-violet-700 rounded-full transition-colors">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">

              {/* Selector de contrato */}
              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                  🔗 Contrato a Vincular *
                </label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    value={modalSearch}
                    onChange={e => setModalSearch(e.target.value)}
                    placeholder="Buscar contrato o cliente..."
                    className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-violet-300 outline-none"
                  />
                </div>
                <div className="max-h-44 overflow-y-auto space-y-1.5 border border-gray-100 rounded-xl p-2 bg-gray-50">
                  {contratosFiltradosModal.map(c => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setModalForm(f => ({ ...f, contrato_id: c.id, vestido_nombre: c.referencia_vestido || f.vestido_nombre }));
                      }}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-all ${
                        modalForm.contrato_id === c.id
                          ? 'bg-violet-600 text-white'
                          : 'hover:bg-white hover:border-violet-200 hover:shadow-sm text-gray-700 border border-transparent'
                      }`}
                    >
                      <div className="font-bold text-sm">{c.numero_contrato}</div>
                      <div className={`text-xs ${modalForm.contrato_id === c.id ? 'text-violet-200' : 'text-gray-400'}`}>
                        {c.cliente_nombre} · {c.sede} · Entrega: {fmt(c.fecha_entrega_envio || c.fecha_evento)}
                      </div>
                    </button>
                  ))}
                  {contratosFiltradosModal.length === 0 && (
                    <p className="text-center text-gray-400 text-sm py-4">No se encontraron contratos</p>
                  )}
                </div>
              </div>

              {/* Proveedor + Referencia */}
              <div className="grid grid-cols-2 gap-4">
                {/* Vestido */}
                <div className="col-span-2">
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">Nombre / Referencia del Vestido *</label>
                  <input
                    value={modalForm.vestido_nombre}
                    onChange={e => setModalForm(f => ({ ...f, vestido_nombre: e.target.value }))}
                    placeholder="Ej. Vestido Rojo Gala..."
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-violet-300 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">Proveedor</label>
                  <input
                    value={modalForm.proveedor}
                    onChange={e => setModalForm(f => ({ ...f, proveedor: e.target.value }))}
                    placeholder="Nombre del proveedor..."
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-violet-300 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">Referencia Compra</label>
                  <input
                    value={modalForm.referencia_compra}
                    onChange={e => setModalForm(f => ({ ...f, referencia_compra: e.target.value }))}
                    placeholder="ORD-0001"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-violet-300 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">Fecha de Compra</label>
                  <input
                    type="date"
                    value={modalForm.fecha_compra}
                    onChange={e => setModalForm(f => ({ ...f, fecha_compra: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-violet-300 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">ETA Llegada *</label>
                  <input
                    type="date"
                    value={modalForm.fecha_estimada_llegada}
                    onChange={e => setModalForm(f => ({ ...f, fecha_estimada_llegada: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-violet-300 outline-none"
                  />
                </div>
              </div>

              {/* Estado inicial */}
              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">Estado Inicial</label>
                <div className="flex flex-wrap gap-2">
                  {ESTADOS.map(e => (
                    <button
                      key={e.id}
                      onClick={() => setModalForm(f => ({ ...f, estado: e.id }))}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition-all border ${
                        modalForm.estado === e.id ? `${e.badge} ${e.border}` : `bg-white ${e.border} ${e.color}`
                      }`}
                    >
                      {e.emoji} {e.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview riesgo */}
              {modalForm.fecha_estimada_llegada && modalForm.contrato_id && (() => {
                const c = contratosDisponibles.find(x => x.id === modalForm.contrato_id);
                const r = calcRiesgo(modalForm.fecha_estimada_llegada, c?.fecha_entrega_envio || c?.fecha_evento || null);
                if (r === 'ok') return null;
                return (
                  <div className={`px-4 py-3 rounded-xl text-sm font-black ${riesgoConfig[r].className}`}>
                    ⚠️ Vista previa de riesgo: {riesgoConfig[r].label}
                  </div>
                );
              })()}

              {/* Observaciones */}
              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">Observaciones Generales</label>
                <textarea
                  value={modalForm.observaciones_generales}
                  onChange={e => setModalForm(f => ({ ...f, observaciones_generales: e.target.value }))}
                  rows={2}
                  placeholder="Notas adicionales del pedido..."
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-violet-300 outline-none resize-none"
                />
              </div>
            </div>

            <div className="px-6 pb-6 flex gap-3 border-t border-gray-100 pt-4">
              <button
                onClick={() => { setModalOpen(false); setModalSearch(''); }}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black rounded-2xl transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={crearPedido}
                disabled={submitting || !modalForm.contrato_id}
                className="flex-[1.5] py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-black rounded-2xl shadow-lg shadow-violet-200 transition-all active:scale-95 flex items-center justify-center gap-2 border-b-4 border-violet-800 active:border-b-0 active:translate-y-1"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Crear Pedido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PedidoCard Component ─────────────────────────────────────────────────────
function PedidoCard({
  pedido, onOpen, onCambiarEstado,
}: {
  pedido: Pedido;
  onOpen: (p: Pedido) => void;
  onCambiarEstado: (id: string, estado: EstadoPedido) => void;
}) {
  const fechaEntrega = pedido.contrato?.fecha_entrega_envio || pedido.contrato?.fecha_evento;
  const riesgo = calcRiesgo(pedido.fecha_estimada_llegada, fechaEntrega || null);
  const rCfg = riesgoConfig[riesgo];
  const dias = diasParaFecha(fechaEntrega || null);
  const estadoIdx = ESTADOS.findIndex(e => e.id === pedido.estado);
  const siguienteEstado = ESTADOS[estadoIdx + 1];

  return (
    <div
      onClick={() => onOpen(pedido)}
      className={`bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all cursor-pointer ${
        riesgo === 'critico' ? 'border-rose-300 ring-1 ring-rose-100' :
        riesgo === 'riesgo'  ? 'border-amber-300' :
        'border-gray-200 hover:border-violet-200'
      }`}
    >
      {/* Risk strip */}
      {riesgo !== 'ok' && (
        <div className={`h-1.5 w-full rounded-t-2xl ${riesgo === 'critico' ? 'bg-rose-500' : 'bg-amber-400'}`} />
      )}

      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-black text-violet-600 truncate">{pedido.contrato?.numero_contrato || '—'}</p>
            <p className="font-bold text-gray-900 text-sm leading-snug truncate">{pedido.contrato?.cliente_nombre || 'Sin contrato'}</p>
            <p className="text-[9px] text-gray-400 font-medium">{pedido.contrato?.sede}</p>
          </div>
          <span className={`flex-shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-lg ${rCfg.className}`}>
            {riesgo === 'critico' ? '🔴' : riesgo === 'riesgo' ? '🟡' : '🟢'}
          </span>
        </div>

        {/* Dates */}
        <div className="space-y-1">
          {pedido.proveedor && (
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <Truck className="w-3 h-3 text-violet-400 flex-shrink-0" />
              <span className="font-semibold truncate">{pedido.proveedor}</span>
            </div>
          )}
          {pedido.fecha_estimada_llegada && (
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <Package className="w-3 h-3 text-amber-400 flex-shrink-0" />
              <span>ETA: <span className="font-bold text-gray-700">{fmt(pedido.fecha_estimada_llegada)}</span></span>
            </div>
          )}
          {fechaEntrega && (
            <div className="flex items-center gap-1.5 text-[10px]">
              <Calendar className="w-3 h-3 text-rose-400 flex-shrink-0" />
              <span className="text-gray-500">
                Entrega: <span className={`font-bold ${dias !== null && dias <= 5 ? 'text-rose-600' : 'text-gray-700'}`}>{fmt(fechaEntrega)}</span>
                {dias !== null && (
                  <span className={`ml-1 font-black ${dias <= 0 ? 'text-rose-600' : dias <= 7 ? 'text-amber-600' : 'text-gray-400'}`}>
                    {dias <= 0 ? `(${Math.abs(dias)}d tarde)` : `(en ${dias}d)`}
                  </span>
                )}
              </span>
            </div>
          )}
        </div>

        {/* Advance button */}
        {siguienteEstado && (
          <button
            onClick={e => { e.stopPropagation(); onCambiarEstado(pedido.id, siguienteEstado.id); }}
            className={`w-full py-1.5 rounded-xl text-[10px] font-black transition-all flex items-center justify-center gap-1 ${siguienteEstado.badge} border ${siguienteEstado.border} hover:opacity-80`}
          >
            {siguienteEstado.emoji} Mover a {siguienteEstado.label} <ArrowRight className="w-2.5 h-2.5" />
          </button>
        )}
      </div>
    </div>
  );
}
