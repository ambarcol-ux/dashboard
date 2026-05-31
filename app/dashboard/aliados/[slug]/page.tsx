'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { DollarSign, Users, QrCode, ArrowUpRight, CheckCircle2, Clock, Wallet, ArrowLeft } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { useRouter, useParams } from 'next/navigation';

export default function AliadosPortalPage() {
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(true);
  const [aliado, setAliado] = useState<any>(null);
  const [saldoDisponible, setSaldoDisponible] = useState(0);
  const [saldoEnProceso, setSaldoEnProceso] = useState(0);
  const [stats, setStats] = useState({
    totalGenerados: 0,
    totalUsados: 0,
  });
  const [codigos, setCodigos] = useState<any[]>([]);

  useEffect(() => {
    if (params?.slug) {
      fetchAliadoData();
    }
  }, [params?.slug]);

  const fetchAliadoData = async () => {
    try {
      setLoading(true);
      
      // 1. Consulta Dinámica por Slug
      const { data: aliadoData, error: aliadoErr } = await supabase
        .from('referidores')
        .select('*')
        .eq('slug_unico', params.slug)
        .single();
        
      if (aliadoErr) throw new Error('Error buscando aliado dinámico: ' + aliadoErr.message);
      
      setAliado(aliadoData);
      
      if (aliadoData?.id) {
        // 2. Traer todos los códigos asociados a este aliado
        const { data: codigosData, error: codigosErr } = await supabase
          .from('codigos_descuento')
          .select('*')
          .eq('referidor_id', aliadoData.id)
          .order('nombre_quinceanera', { ascending: true });
          
        if (codigosErr) throw new Error('Error buscando códigos: ' + codigosErr.message);
        
        setCodigos(codigosData || []);
        
        // 3. Contadores Reales
        const codigos = codigosData || [];
        const totalGenerados = codigos.length;
        const codigosUsados = codigos.filter(c => c.usado === true);
        const totalUsados = codigosUsados.length;
        
        setStats({ totalGenerados, totalUsados });

        // 4. Cruce Financiero Dinámico (Contratos >= 50%)
        const { data: escalas } = await supabase.from('config_escalas').select('*').order('minimo', { ascending: true });
        
        let saldoReal = 0;
        let saldoRetenido = 0;

        if (codigosUsados.length > 0) {
          const nombres = codigosUsados.map(c => c.nombre_quinceanera);
          const { data: contratosVinculados } = await supabase
            .from('contratos')
            .select(`
              id,
              cliente_nombre,
              valor_total,
              anticipo,
              pagos ( valor_pagado )
            `)
            .in('cliente_nombre', nombres);

          if (contratosVinculados) {
            for (const codigo of codigosUsados) {
              // Hacemos el match por nombre
              const contrato = contratosVinculados.find(c => 
                c.cliente_nombre.toLowerCase().trim() === codigo.nombre_quinceanera.toLowerCase().trim()
              );
              
              if (contrato) {
                // Cálculo de abonos
                const pagosAdicionales = (contrato.pagos || []).reduce((sum: number, p: any) => sum + (Number(p.valor_pagado) || 0), 0);
                const totalAbonado = (Number(contrato.anticipo) || 0) + pagosAdicionales;
                const mitadContrato = (Number(contrato.valor_total) || 0) * 0.5;

                // Encontrar la comisión de la escala
                let comisionAsignada = 0;
                if (escalas) {
                  const escalaAplicable = escalas.find(e => 
                    Number(contrato.valor_total) >= e.minimo && 
                    (e.maximo === null || Number(contrato.valor_total) <= e.maximo)
                  );
                  if (escalaAplicable) {
                    comisionAsignada = Number(escalaAplicable.comision_aliado) || 0;
                  }
                }

                // Regla del 50%
                if (totalAbonado >= mitadContrato) {
                  saldoReal += comisionAsignada;
                } else {
                  saldoRetenido += comisionAsignada;
                }
              }
            }
          }
        }

        // Consistencia de Datos: Leemos directamente el saldo_comisiones guardado en BD
        setSaldoDisponible(Number(aliadoData.saldo_comisiones) || 0);
        setSaldoEnProceso(saldoRetenido);
      }
    } catch (err: any) {
      console.error('Error detallado BD:', err.message || err);
      toast.error('Ocurrió un error cargando el portal');
    } finally {
      setLoading(false);
    }
  };

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(val || 0);
  };
  
  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <p className="text-zinc-500 font-medium flex items-center gap-2">
          <Wallet className="w-5 h-5 animate-pulse" /> Cargando portal VIP...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 py-10 px-4 sm:px-8 font-sans">
      <Toaster position="top-right" richColors />
      
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Botón Volver */}
        <div>
          <button 
            onClick={() => router.push('/dashboard')}
            className="flex items-center text-sm font-semibold text-zinc-500 hover:text-zinc-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver al Dashboard
          </button>
        </div>

        {/* Header Portal */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <p className="text-sm font-bold text-amber-600 tracking-widest uppercase mb-1">Portal de Alianzas VIP</p>
            <h1 className="text-3xl font-black text-zinc-900 tracking-tight">
              Bienvenido, {aliado?.nombre_aliado || 'Aliado VIP'}
            </h1>
          </div>
          <div className="bg-amber-50 text-amber-700 px-4 py-2 rounded-xl text-sm font-bold border border-amber-100 flex items-center gap-2">
            <QrCode className="w-4 h-4" /> Link de referido activo
          </div>
        </div>

        {/* Grid de Tarjetas Impactantes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Tarjeta 1: Saldo Disponible */}
          <div className="bg-zinc-900 rounded-3xl p-8 shadow-xl shadow-zinc-200 relative overflow-hidden group flex flex-col justify-between">
            <div className="absolute -right-6 -top-6 w-32 h-32 bg-amber-400 rounded-full blur-[80px] opacity-20 group-hover:opacity-30 transition-opacity"></div>
            <div className="relative z-10">
              <p className="text-zinc-400 text-sm font-bold tracking-widest uppercase flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-amber-400" /> Saldo Disponible
              </p>
              <p className="text-4xl font-black text-white mt-4 tracking-tight">
                {formatMoney(saldoDisponible)}
              </p>
              {saldoEnProceso > 0 && (
                <p className="text-amber-200 text-sm font-medium mt-2 flex items-center gap-1.5">
                  <Clock className="w-4 h-4" /> Comisiones Retenidas: {formatMoney(saldoEnProceso)}
                </p>
              )}
            </div>
            <div 
              className={`relative z-10 mt-8 w-full py-3 px-6 rounded-xl flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest text-center transition-all ${
                saldoDisponible > 0 
                  ? 'bg-zinc-800 text-amber-400 border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.1)]' 
                  : 'bg-zinc-800/50 text-zinc-500 border border-zinc-800'
              }`}
            >
              🗓️ Liquidación automática: Último día de cada mes
            </div>
          </div>

          {/* Tarjeta 2: Tráfico VIP */}
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-zinc-100 flex flex-col justify-center">
            <p className="text-zinc-500 text-sm font-bold tracking-widest uppercase flex items-center gap-2">
              <Users className="w-4 h-4 text-rose-500" /> Tráfico VIP
            </p>
            <p className="text-4xl font-black text-zinc-900 mt-4 tracking-tight">
              {stats.totalGenerados}
            </p>
            <p className="text-sm text-zinc-400 font-medium mt-2">Quinceañeras Registradas</p>
          </div>

          {/* Tarjeta 3: Conversión Real */}
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-zinc-100 flex flex-col justify-center">
            <p className="text-zinc-500 text-sm font-bold tracking-widest uppercase flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Conversión Real
            </p>
            <p className="text-4xl font-black text-zinc-900 mt-4 tracking-tight">
              {stats.totalUsados}
            </p>
            <p className="text-sm text-zinc-400 font-medium mt-2">Contratos Cerrados Efectivos</p>
          </div>

        </div>

        {/* Historial de Códigos - Tabla Inferior */}
        <div className="bg-white rounded-3xl shadow-sm border border-zinc-200 overflow-hidden">
          <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
            <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <QrCode className="w-5 h-5 text-zinc-400" /> Historial de Quinceañeras Invitadas
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50/50 border-b border-zinc-100 text-xs uppercase tracking-widest text-zinc-500 font-bold">
                  <th className="py-5 px-6">Código / Pase VIP</th>
                  <th className="py-5 px-6">Quinceañera</th>
                  <th className="py-5 px-6">Teléfono</th>
                  <th className="py-5 px-6">Fecha Registro</th>
                  <th className="py-5 px-6">Fecha Evento</th>
                  <th className="py-5 px-6">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {codigos?.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-zinc-400 font-medium">Aún no hay invitadas registradas con tu link VIP.</td>
                  </tr>
                ) : (
                  codigos?.map((codigo) => (
                    <tr key={codigo.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="py-4 px-6">
                        <span className="font-black text-zinc-900 tracking-widest bg-zinc-100 px-3 py-1.5 rounded-lg border border-zinc-200 uppercase">
                          {codigo.codigo_seguridad || 'N/A'}
                        </span>
                      </td>
                      <td className="py-4 px-6 font-bold text-zinc-700">
                        {codigo.nombre_quinceanera || 'No especificado'}
                      </td>
                      <td className="py-4 px-6 text-zinc-600 font-medium">
                        {codigo.telefono_quinceanera || 'No especificado'}
                      </td>
                      <td className="py-4 px-6 text-zinc-500 font-medium">
                        {formatDate(codigo.fecha_registro)}
                      </td>
                      <td className="py-4 px-6 text-amber-600 font-bold">
                        {formatDate(codigo.fecha_evento)}
                      </td>
                      <td className="py-4 px-6">
                        {codigo.usado ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-xs border border-emerald-100 shadow-sm">
                            <CheckCircle2 className="w-3.5 h-3.5" /> ¡Contrato Cerrado! 🎉
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 font-bold text-xs border border-amber-100">
                            <Clock className="w-3.5 h-3.5" /> Pendiente
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
