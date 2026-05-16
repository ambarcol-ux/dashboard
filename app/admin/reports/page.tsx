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
    fetchKPIs();
  }, []);

  const fetchKPIs = async () => {
    try {
      const { data, error } = await supabase
        .from('kpi_vestidos_populares')
        .select('*')
        .limit(10); // Bring 10 to show a longer ranking if needed
      
      if (error) throw error;
      setPopularDresses(data || []);
    } catch (err) {
      console.error('Error fetching KPIs:', err);
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
              onClick={fetchKPIs} 
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-600 font-bold hover:bg-gray-50 transition-all shadow-sm"
            >
              <RefreshCw className="w-4 h-4" /> REFRESCAR DATOS
            </button>
          </div>

          {/* KPI VESTIDOS POPULARES */}
          <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl shadow-rose-100/20 border border-rose-50">
            <div className="flex items-center gap-4 mb-10">
              <div className="p-4 bg-rose-500 rounded-2xl text-white shadow-xl shadow-rose-200">
                <TrendingUp className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-gray-900 tracking-tight">Top 10 Vestidos más Rentados</h2>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-[0.2em] mt-1">Ranking Total Histórico de Alquileres</p>
              </div>
            </div>

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
                    <h4 className="text-xl font-black text-gray-900 tracking-tighter truncate w-full">{v.codigo}</h4>
                    <p className="text-[10px] text-gray-400 font-bold uppercase mt-2 tracking-widest">Alquileres Confirmados</p>
                    <span className="text-4xl font-black text-rose-500 mt-2">{v.total_alquileres || v.conteo_alquileres || 0}</span>
                  </div>
                </div>
              ))}

              {popularDresses.length === 0 && (
                <div className="col-span-full py-20 text-center text-gray-400 font-bold">
                  No hay datos suficientes para generar el ranking aún.
                </div>
              )}
            </div>
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
