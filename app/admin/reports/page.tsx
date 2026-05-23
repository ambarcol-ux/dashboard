'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Toaster, toast } from 'sonner';
import { TrendingUp, RefreshCw, Loader2 } from 'lucide-react';
import Sidebar from '@/components/Sidebar';

export default function ReportsPage() {
  const [user, setUser] = useState<any>(null);
  const [popularDresses, setPopularDresses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sedes, setSedes] = useState<any[]>([]);
  const [selectedSede, setSelectedSede] = useState<string>('global');
  const [fetchingKPIs, setFetchingKPIs] = useState(false);

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
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();
        setUser({ ...user, rol: profile?.rol, nombre: profile?.nombre });
      }
      setLoading(false);
    };
    checkUser();
    fetchSedes();
    fetchKPIs('global');
  }, []);

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

  const fetchKPIs = async (sedeId: string = 'global') => {
    setFetchingKPIs(true);
    try {
      let query = supabase
        .from('contrato_items_vestidos')
        .select(`
          vestido_id,
          vestidos!inner(
            codigo,
            nombre,
            sede_actual_id,
            sedes:sede_actual_id(nombre)
          ),
          contratos!inner(id, sede_id)
        `);

      if (sedeId !== 'global') {
        query = query.eq('contratos.sede_id', sedeId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const counts: Record<string, { codigo: string; nombre: string; total_alquileres: number; sede_nombre: string }> = {};

      (data || []).forEach((item: any) => {
        const v = item.vestidos;
        if (!v) return;
        
        const codigo = v.codigo;
        const sede_nombre = v.sedes?.nombre || '';

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
    } catch (err) {
      console.error('Error fetching KPIs:', err);
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
          
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-black text-gray-900 tracking-tight">Reportes y Estadísticas</h1>
              <p className="text-rose-500 font-bold uppercase tracking-widest text-[10px] mt-1">Inteligencia de Negocio · Ambar Couture</p>
            </div>
            <button 
              onClick={() => fetchKPIs(selectedSede)} 
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-600 font-bold hover:bg-gray-50 transition-all shadow-sm"
            >
              {fetchingKPIs ? <Loader2 className="w-4 h-4 animate-spin text-rose-500" /> : <RefreshCw className="w-4 h-4" />} REFRESCAR DATOS
            </button>
          </div>

          {/* KPI VESTIDOS POPULARES */}
          <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl shadow-rose-100/20 border border-rose-50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-rose-500 rounded-2xl text-white shadow-xl shadow-rose-200">
                  <TrendingUp className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-gray-900 tracking-tight">Top 10 Vestidos más Rentados</h2>
                  <p className="text-gray-400 text-xs font-bold uppercase tracking-[0.2em] mt-1 font-sans">
                    Ranking {selectedSede === 'global' ? 'Total Histórico' : `Sede ${formatSedeName(sedes.find(s => s.id === selectedSede)?.nombre)}`} de Alquileres
                  </p>
                </div>
              </div>

              {/* Selector de Sede */}
              <div className="relative w-full sm:w-64">
                <select
                  value={selectedSede}
                  onChange={(e) => {
                    setSelectedSede(e.target.value);
                    fetchKPIs(e.target.value);
                  }}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-rose-200 font-bold text-gray-700 outline-none transition-all cursor-pointer shadow-sm hover:bg-gray-100/50"
                >
                  <option value="global">🌍 Global</option>
                  {sedes.map(s => (
                    <option key={s.id} value={s.id}>
                      📍 {formatSedeName(s.nombre)}
                    </option>
                  ))}
                </select>
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
