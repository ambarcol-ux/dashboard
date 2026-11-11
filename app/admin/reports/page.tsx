'use client';
import {useVerifiedAccess} from '@/components/VerifiedAccessProvider';
import { totalPorCobrar, type Cobro } from '@/lib/cobros';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Toaster, toast } from 'sonner';
import { TrendingUp, RefreshCw, Loader2, DollarSign, Calendar } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import EventTypeByChannel from '@/components/EventTypeByChannel';

export default function ReportsPage() {
  const readAccess = useVerifiedAccess();
  const [user, setUser] = useState<any>(null);
  const [popularDresses, setPopularDresses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sedes, setSedes] = useState<any[]>([]);
  const [filters, setFilters] = useState({
    sede: 'global',
    dateRange: 'this_month',
    customStart: '',
    customEnd: ''
  });
  const [fetchingKPIs, setFetchingKPIs] = useState(false);
  const [financeStats, setFinanceStats] = useState({ facturadoTotal: 0, facturadoMes: 0, pendienteRecaudar: 0 });

  const formatSedeName = (name: string) => {
    if (!name) return '';
    const lower = name.toLowerCase();
    if (lower === 'bogota') return 'Bogotá';
    if (lower === 'villavicencio') return 'Villavicencio';
    if (lower === 'barranquilla') return 'Barranquilla';
    return name.charAt(0).toUpperCase() + lower.slice(1);
  };

  useEffect(() => {
    const checkUser = async () => {
      const {user, profile} = await readAccess();
      if (user) {
        setUser({ ...user, rol: profile?.rol, nombre: profile?.nombre });
      }
      setLoading(false);
    };
    void checkUser().catch(() => {window.location.href='/login';});
    fetchSedes();
  }, []);

  useEffect(() => {
    fetchKPIs(filters);
  }, [filters.sede, filters.dateRange, filters.customStart, filters.customEnd]);

  const fetchSedes = async () => {
    try {
      const { data, error } = await supabase
        .from('sedes')
        .select('id, nombre')
        .eq('activo', true);
      
      if (error) throw error;
      setSedes(data || []);
    } catch (err) {
      console.error('Error fetching sedes:', err);
    }
  };

  const getStartEndDates = (range: string, customStart: string, customEnd: string) => {
    const now = new Date();
    let start: Date;
    let end: Date = new Date();
  
    switch (range) {
      case 'this_month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'last_month':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        break;
      case 'last_3_months':
        start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        break;
      case 'this_year':
        start = new Date(now.getFullYear(), 0, 1);
        break;
      case 'custom':
        start = customStart ? new Date(customStart) : new Date(now.getFullYear(), 0, 1);
        end = customEnd ? new Date(customEnd) : new Date();
        if (customEnd) {
          end.setHours(23, 59, 59);
        }
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  };

  const fetchKPIs = async (currentFilters: typeof filters) => {
    setFetchingKPIs(true);
    try {
      const { startDate, endDate } = getStartEndDates(
        currentFilters.dateRange, 
        currentFilters.customStart, 
        currentFilters.customEnd
      );

      // 1. Ranking Query
      let rankingQuery = supabase
        .from('contrato_items_vestidos')
        .select(`
          vestido_id,
          vestidos!inner(
            codigo,
            nombre,
            sede_actual_id
          ),
          contratos!inner(id, sede_id, created_at)
        `)
        .gte('contratos.created_at', startDate)
        .lte('contratos.created_at', endDate);

      if (currentFilters.sede !== 'global') {
        rankingQuery = rankingQuery.eq('contratos.sede_id', currentFilters.sede);
      }

      // 2. Financial Queries
      let globalFinanceQuery = supabase
        .from('contratos')
        .select('valor_total')
        .neq('estado', 'cancelado')
        .gte('created_at', startDate)
        .lte('created_at', endDate);

      let monthlyFinanceQuery = supabase
        .from('contratos')
        .select('valor_total')
        .neq('estado', 'cancelado')
        .gte('created_at', startDate)
        .lte('created_at', endDate);

      let pendingFinanceQuery = supabase
        .from('contratos')
        .select('estado, valor_total, total_arreglos, anticipo, saldo, total_multas')
        .gte('created_at', startDate)
        .lte('created_at', endDate);

      if (currentFilters.sede !== 'global') {
        globalFinanceQuery = globalFinanceQuery.eq('sede_id', currentFilters.sede);
        monthlyFinanceQuery = monthlyFinanceQuery.eq('sede_id', currentFilters.sede);
        pendingFinanceQuery = pendingFinanceQuery.eq('sede_id', currentFilters.sede);
      }

      // Load all in parallel
      const [rankingRes, globalRes, monthlyRes, pendingRes, sedesRes] = await Promise.all([
        rankingQuery,
        globalFinanceQuery,
        monthlyFinanceQuery,
        pendingFinanceQuery,
        supabase.from('sedes').select('id, nombre')
      ]);

      if (rankingRes.error) throw rankingRes.error;
      if (globalRes.error) throw globalRes.error;
      if (monthlyRes.error) throw monthlyRes.error;
      if (pendingRes.error) throw pendingRes.error;
      if (sedesRes.error) throw sedesRes.error;

      // Process Ranking
      const counts: Record<string, { codigo: string; nombre: string; total_alquileres: number; sede_nombre: string }> = {};
      const sedesMap = new Map((sedesRes.data || []).map((s: any) => [s.id, s.nombre]));

      (rankingRes.data || []).forEach((item: any) => {
        const v = item.vestidos;
        if (!v) return;
        
        const codigo = v.codigo;
        const sede_nombre = sedesMap.get(v.sede_actual_id) || '';

        if (!counts[codigo]) {
          counts[codigo] = {
            codigo,
            nombre: v.nombre || '',
            total_alquileres: 0,
            sede_nombre
          };
        }
        counts[codigo].total_alquileres += 1;
      });

      const sorted = Object.values(counts)
        .sort((a, b) => b.total_alquileres - a.total_alquileres)
        .slice(0, 10);

      setPopularDresses(sorted);

      // Process Finance
      const totalFacturadoGlobal = (globalRes.data || []).reduce((acc, c) => acc + (Number(c.valor_total) || 0), 0);
      const totalFacturadoMes = (monthlyRes.data || []).reduce((acc, c) => acc + (Number(c.valor_total) || 0), 0);
      const totalPendienteDb = totalPorCobrar((pendingRes.data || []) as Cobro[]);

      setFinanceStats({
        facturadoTotal: totalFacturadoGlobal,
        facturadoMes: totalFacturadoMes,
        pendienteRecaudar: totalPendienteDb
      });

    } catch (err: any) {
      console.error('Error fetching KPIs:', err?.message || JSON.stringify(err) || err);
      toast.error('Error al cargar estadísticas.');
    } finally {
      setFetchingKPIs(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 animate-spin text-rose-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex">
      <Toaster position="top-right" richColors />
      
      <Sidebar user={user} handleLogout={handleLogout} activePage="reports" />

      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-700">
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 bg-white p-6 rounded-2xl shadow-sm border border-rose-50">
            <div>
              <h1 className="text-3xl font-black text-gray-900 tracking-tight">Reportes y Estadísticas</h1>
              <p className="text-rose-500 font-bold uppercase tracking-widest text-[10px] mt-1">Inteligencia de Negocio · Ambar Couture</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
              {/* Selector de Sede */}
              <div className="relative w-full sm:w-48">
                <select
                  value={filters.sede}
                  onChange={(e) => setFilters({ ...filters, sede: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-rose-200 font-bold text-gray-700 outline-none transition-all cursor-pointer shadow-sm hover:bg-gray-100/50"
                >
                  <option value="global">🌍 Sede Global</option>
                  {sedes.map(s => (
                    <option key={s.id} value={s.id}>
                      📍 {formatSedeName(s.nombre)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Selector de Periodo */}
              <div className="relative w-full sm:w-48">
                <select
                  value={filters.dateRange}
                  onChange={(e) => setFilters({ ...filters, dateRange: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-rose-200 font-bold text-gray-700 outline-none transition-all cursor-pointer shadow-sm hover:bg-gray-100/50"
                >
                  <option value="this_month">📅 Mes Actual</option>
                  <option value="last_month">📅 Mes Anterior</option>
                  <option value="last_3_months">📅 Últimos 3 Meses</option>
                  <option value="this_year">📅 Año Actual</option>
                  <option value="custom">⚙️ Rango Personalizado</option>
                </select>
              </div>

              {/* Rango Personalizado */}
              {filters.dateRange === 'custom' && (
                <div className="flex items-center gap-2 w-full sm:w-auto animate-in fade-in slide-in-from-right-4 duration-300">
                  <input
                    type="date"
                    value={filters.customStart}
                    onChange={(e) => setFilters({ ...filters, customStart: e.target.value })}
                    className="px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-200 font-bold text-gray-600 outline-none shadow-sm"
                  />
                  <span className="text-gray-400 font-bold">-</span>
                  <input
                    type="date"
                    value={filters.customEnd}
                    onChange={(e) => setFilters({ ...filters, customEnd: e.target.value })}
                    className="px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-200 font-bold text-gray-600 outline-none shadow-sm"
                  />
                </div>
              )}

              <button 
                onClick={() => fetchKPIs(filters)} 
                className="flex items-center gap-2 px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-600 font-bold hover:bg-gray-50 transition-all shadow-sm shrink-0"
              >
                {fetchingKPIs ? <Loader2 className="w-4 h-4 animate-spin text-rose-500" /> : <RefreshCw className="w-4 h-4" />} REFRESCAR
              </button>
            </div>
          </div>

          {/* FINANCIAL STATS GRID (3 columns) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             {/* Card 1: Facturado Total */}
             <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:border-rose-200 transition-all">
                <div className="p-4 bg-emerald-50 text-emerald-500 rounded-2xl group-hover:scale-110 transition-transform">
                   <DollarSign className="w-6 h-6" />
                </div>
                <div>
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Facturado Total</p>
                   <h3 className="text-2xl font-black text-gray-900 leading-none tracking-tighter">
                     {fetchingKPIs ? '...' : `$${financeStats.facturadoTotal.toLocaleString('es-CO')}`}
                   </h3>
                </div>
             </div>

             {/* Card 2: Facturado del Mes */}
             <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:border-rose-200 transition-all">
                <div className="p-4 bg-emerald-50 text-emerald-500 rounded-2xl group-hover:scale-110 transition-transform">
                   <Calendar className="w-6 h-6" />
                </div>
                <div>
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Facturado del Mes</p>
                   <h3 className="text-2xl font-black text-gray-900 leading-none tracking-tighter">
                     {fetchingKPIs ? '...' : `$${financeStats.facturadoMes.toLocaleString('es-CO')}`}
                   </h3>
                </div>
             </div>

             {/* Card 3: Pendiente por Recaudar */}
             <div className="bg-white p-6 rounded-[2rem] shadow-sm border-2 border-emerald-100 flex items-center gap-5 group hover:bg-emerald-50 transition-all bg-emerald-50/20">
                <div className="p-4 bg-emerald-500 rounded-2xl text-white shadow-lg shadow-emerald-100 group-hover:scale-110 transition-transform">
                   <DollarSign className="w-6 h-6" />
                </div>
                <div>
                   <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest leading-none mb-1">Pendiente por Recaudar</p>
                   <h3 className="text-2xl font-black text-gray-900 leading-none tracking-tighter">
                     {fetchingKPIs ? '...' : `$${financeStats.pendienteRecaudar.toLocaleString('es-CO')}`}
                   </h3>
                </div>
             </div>
          </div>

          {/* KPI VESTIDOS POPULARES */}
          <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl shadow-rose-100/20 border border-rose-50">
            <div className="flex items-center gap-4 mb-10">
              <div className="p-4 bg-rose-500 rounded-2xl text-white shadow-xl shadow-rose-200">
                <TrendingUp className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-gray-900 tracking-tight">Top 10 Vestidos más Rentados</h2>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-[0.2em] mt-1 font-sans">
                  Ranking {filters.sede === 'global' ? 'Total' : `Sede ${formatSedeName(sedes.find(s => s.id === filters.sede)?.nombre)}`} ({filters.dateRange === 'custom' ? 'Personalizado' : 'Filtrado'})
                </p>
              </div>
            </div>

            {fetchingKPIs ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
                <Loader2 className="w-10 h-10 animate-spin text-rose-500" />
                <p className="font-black text-[10px] uppercase tracking-[0.2em]">Recalculando ranking...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
                {popularDresses.map((v, idx) => (
                  <div 
                    key={v.codigo} 
                    className="relative group p-8 bg-gray-50/50 rounded-[2rem] border border-gray-100 hover:border-rose-200 hover:bg-white transition-all hover:shadow-2xl hover:shadow-rose-100/50 overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full -translate-y-8 translate-x-8"></div>
                    <div className="relative z-10 flex flex-col items-center text-center">
                      <span className={`text-[10px] font-black px-4 py-1.5 rounded-full mb-4 shadow-sm ${
                        idx === 0 ? 'bg-amber-400 text-white' : 
                        idx === 1 ? 'bg-gray-300 text-white' : 
                        idx === 2 ? 'bg-amber-600 text-white' : 
                        'bg-rose-100 text-rose-600'
                      }`}>
                        #{idx + 1} EN RANKING
                      </span>
                      <h4 className="text-xl font-black text-gray-900 tracking-tighter truncate w-full leading-none">{v.codigo}</h4>
                      
                      {/* Badge Sede Origen */}
                      <span className="mt-2 px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-[9px] font-bold tracking-tight inline-flex items-center gap-1 shadow-sm border border-gray-200">
                        📍 {formatSedeName(v.sede_nombre) || 'Sin Sede'}
                      </span>

                      <p className="text-[10px] text-gray-400 font-bold uppercase mt-3 tracking-widest">Alquileres Confirmados</p>
                      <span className="text-4xl font-black text-rose-500 mt-2">{v.total_alquileres || 0}</span>
                    </div>
                  </div>
                ))}

                {popularDresses.length === 0 && (
                  <div className="col-span-full py-20 text-center text-gray-400 font-bold">
                    No hay datos suficientes para generar el ranking aún.
                  </div>
                )}
              </div>
            )}
          </div>

          <EventTypeByChannel sede={filters.sede} {...getStartEndDates(filters.dateRange, filters.customStart, filters.customEnd)} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-center text-gray-300">
             <div className="p-20 border-4 border-dashed border-gray-100 rounded-[3rem] flex flex-col items-center gap-4">
                <div className="w-16 h-16 bg-gray-50 rounded-full"></div>
                <p className="font-black uppercase tracking-widest text-xs">Próximamente: Gráficas de Ingresos</p>
             </div>
             <div className="p-20 border-4 border-dashed border-gray-100 rounded-[3rem] flex flex-col items-center gap-4">
                <div className="w-16 h-16 bg-gray-50 rounded-full"></div>
                <p className="font-black uppercase tracking-widest text-xs">Próximamente: Metas Mensuales</p>
             </div>
          </div>

        </div>
      </main>
    </div>
  );
}

