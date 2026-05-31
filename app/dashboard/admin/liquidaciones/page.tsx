'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast, Toaster } from 'sonner';
import { Banknote, CheckCircle2, ChevronRight, X, Calendar, Wallet, Building2, Search, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function LiquidacionesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [aliados, setAliados] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal de Pago
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAliado, setSelectedAliado] = useState<any>(null);
  const [comprobante, setComprobante] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchLiquidaciones();
  }, []);

  const fetchLiquidaciones = async () => {
    try {
      setLoading(true);

      // 1. Traer Referidores Activos
      const { data: refData, error: refErr } = await supabase
        .from('referidores')
        .select('*')
        .eq('estado', 'Activo')
        .order('nombre_aliado', { ascending: true });
        
      if (refErr) throw refErr;

      // 2. Traer códigos usados
      const { data: codigosUsados, error: codErr } = await supabase
        .from('codigos_descuento')
        .select('*')
        .eq('usado', true);

      // 3. Traer contratos
      const nombres = (codigosUsados || []).map(c => c.nombre_quinceanera);
      let contratosVinculados: any[] = [];
      if (nombres.length > 0) {
        const { data: contratos } = await supabase
          .from('contratos')
          .select(`id, cliente_nombre, valor_total, anticipo, pagos ( valor_pagado )`)
          .in('cliente_nombre', nombres);
        contratosVinculados = contratos || [];
      }

      // 4. Traer Escalas VIP
      const { data: escalas } = await supabase.from('config_escalas').select('*').order('minimo', { ascending: true });

      // 5. Traer Liquidaciones previas
      const { data: liquidaciones } = await supabase
        .from('cierres_mensuales_aliados')
        .select('*')
        .eq('estado', 'PAGADO');

      // Procesamiento de Saldos
      const aliadosConSaldos = (refData || []).map(aliado => {
        // Encontrar códigos de este aliado
        const codigosDelAliado = (codigosUsados || []).filter(c => c.referidor_id === aliado.id);
        
        let comisionesTotales = 0;
        let contratosEfectivos = 0;

        for (const codigo of codigosDelAliado) {
          const contrato = contratosVinculados.find(c => 
            c.cliente_nombre.toLowerCase().trim() === codigo.nombre_quinceanera.toLowerCase().trim()
          );

          if (contrato) {
            const pagosAdicionales = (contrato.pagos || []).reduce((sum: number, p: any) => sum + (Number(p.valor_pagado) || 0), 0);
            const totalAbonado = (Number(contrato.anticipo) || 0) + pagosAdicionales;
            const mitadContrato = (Number(contrato.valor_total) || 0) * 0.5;

            // Si cumplió el 50%, suma
            if (totalAbonado >= mitadContrato) {
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
              comisionesTotales += comisionAsignada;
              contratosEfectivos++;
            }
          }
        }

        // Consistencia Absoluta: Usamos la columna real guardada en BD en vez de recalcular sumas dinámicas
        const saldoPendiente = Number(aliado.saldo_comisiones) || 0;

        return {
          ...aliado,
          contratosEfectivos,
          saldoPendiente
        };
      });

      setAliados(aliadosConSaldos);
    } catch (err: any) {
      console.error('Error cargando liquidaciones:', err.message || err);
      toast.error('Error cargando datos financieros');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (aliado: any) => {
    setSelectedAliado(aliado);
    setComprobante('');
    setIsModalOpen(true);
  };

  const handleProcesarPago = async () => {
    if (!comprobante.trim()) {
      toast.error('Debes ingresar el comprobante de transferencia');
      return;
    }

    try {
      setIsSubmitting(true);
      
      const { error } = await supabase
        .from('cierres_mensuales_aliados')
        .insert([{
          referidor_id: selectedAliado.id,
          monto: selectedAliado.saldoPendiente,
          estado: 'PAGADO',
          comprobante: comprobante.trim(),
          // fecha_pago / created_at se maneja por DB default
        }]);

      if (error) throw error;

      toast.success(`Liquidación procesada a ${selectedAliado.nombre_aliado}`);
      setIsModalOpen(false);
      fetchLiquidaciones(); // Refrescar los saldos
    } catch (err: any) {
      console.error('Error procesando pago:', err.message || err);
      toast.error('Ocurrió un error al registrar la liquidación');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(val || 0);
  };

  const filteredAliados = aliados.filter(a => 
    a.nombre_aliado?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    a.contacto_nombre?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const mesActual = new Date().toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }).toUpperCase();

  return (
    <div className="min-h-screen bg-zinc-50 py-10 px-4 sm:px-8 font-sans">
      <Toaster position="top-right" richColors />
      
      <div className="max-w-7xl mx-auto space-y-8">
        
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

        {/* Header Corporativo */}
        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-zinc-200 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-50 rounded-full blur-[80px] -z-10" />
          
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-zinc-100 text-zinc-600 font-bold text-[10px] tracking-widest uppercase rounded-full mb-4">
              <Banknote className="w-3.5 h-3.5" /> Módulo Contable
            </span>
            <h1 className="text-3xl font-black text-zinc-900 tracking-tight">Cierre de Mes y Nómina de Aliados</h1>
            <p className="text-sm text-zinc-500 mt-2">Liquida las comisiones VIP de tus socios comerciales con precisión.</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="bg-zinc-900 text-white px-6 py-4 rounded-2xl shadow-xl shadow-zinc-900/10 flex items-center gap-3">
              <Calendar className="w-5 h-5 text-amber-400" />
              <div>
                <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">Periodo en curso</p>
                <p className="text-sm font-black tracking-wide">{mesActual}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Búsqueda */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
          <input 
            type="text" 
            placeholder="Buscar aliado por empresa o contacto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-zinc-200 rounded-2xl pl-12 pr-4 py-4 text-sm font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 shadow-sm transition-all"
          />
        </div>

        {/* Tabla de Liquidación */}
        <div className="bg-white rounded-[2rem] shadow-sm border border-zinc-200 overflow-hidden">
          {loading ? (
            <div className="py-24 text-center">
              <Wallet className="w-8 h-8 text-amber-400 animate-pulse mx-auto mb-4" />
              <p className="text-sm font-bold text-zinc-500">Calculando saldos corporativos...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50/80 border-b border-zinc-100 text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
                    <th className="py-6 px-6">Aliado / Empresa</th>
                    <th className="py-6 px-6">Contacto Bancario</th>
                    <th className="py-6 px-6 text-center">Contratos Efectivos</th>
                    <th className="py-6 px-6 text-right">Monto a Liquidar</th>
                    <th className="py-6 px-6 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredAliados?.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-zinc-400 font-medium">No hay comisiones acumuladas en este periodo.</td>
                    </tr>
                  ) : (
                    filteredAliados?.map((aliado) => (
                      <tr key={aliado.id} className="hover:bg-zinc-50/50 transition-colors group">
                        <td className="py-5 px-6">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 border border-amber-100">
                              <Building2 className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="font-black text-zinc-900">{aliado.nombre_aliado}</p>
                              <p className="text-xs text-zinc-500">{aliado.telefono}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-5 px-6">
                          <p className="font-bold text-zinc-700 text-sm">{aliado.contacto_nombre}</p>
                          <p className="text-xs text-zinc-500">{aliado.correo || 'Sin correo'}</p>
                        </td>
                        <td className="py-5 px-6 text-center">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-zinc-100 text-zinc-700 font-bold text-xs border border-zinc-200">
                            {aliado.contratosEfectivos}
                          </span>
                        </td>
                        <td className="py-5 px-6 text-right">
                          <p className={`font-black text-lg tracking-tight ${aliado.saldoPendiente > 0 ? 'text-amber-600' : 'text-zinc-400'}`}>
                            {formatMoney(aliado.saldoPendiente)}
                          </p>
                        </td>
                        <td className="py-5 px-6 text-right">
                          {aliado.saldoPendiente > 0 ? (
                            <button
                              onClick={() => handleOpenModal(aliado)}
                              className="inline-flex items-center gap-2 px-5 py-2.5 bg-zinc-900 hover:bg-amber-400 hover:text-amber-950 text-white font-bold text-xs rounded-xl transition-all shadow-md hover:shadow-amber-400/20"
                            >
                              Procesar Pago <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-50 text-emerald-700 font-bold text-xs rounded-xl border border-emerald-100">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Al día
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Desembolso */}
      {isModalOpen && selectedAliado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            
            <div className="p-6 sm:p-8 relative">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="absolute top-6 right-6 p-2 bg-zinc-100 hover:bg-zinc-200 rounded-full text-zinc-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mb-6">
                <Banknote className="w-6 h-6" />
              </div>

              <h2 className="text-2xl font-black text-zinc-900 tracking-tight mb-2">Liquidación de Comisiones</h2>
              <p className="text-sm text-zinc-500 leading-relaxed mb-6">
                Vas a liquidar el saldo disponible a la cuenta registrada de <strong>{selectedAliado.contacto_nombre}</strong>.
              </p>

              <div className="bg-zinc-50 rounded-2xl p-5 border border-zinc-200 flex items-center justify-between mb-8">
                <div>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-1">Monto a Transferir</p>
                  <p className="text-2xl font-black text-amber-600 tracking-tight">{formatMoney(selectedAliado.saldoPendiente)}</p>
                </div>
                <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-zinc-400 border border-zinc-100">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>

              <div className="space-y-2 mb-8">
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest">
                  Comprobante de Transferencia <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="ID de transacción Nequi / Bancolombia..."
                  value={comprobante}
                  onChange={(e) => setComprobante(e.target.value)}
                  className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3.5 text-sm font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                />
              </div>

              <button
                onClick={handleProcesarPago}
                disabled={isSubmitting || !comprobante.trim()}
                className="w-full bg-zinc-900 hover:bg-amber-400 hover:text-amber-950 text-white font-black py-4 px-6 rounded-xl transition-all shadow-xl shadow-zinc-900/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
              >
                {isSubmitting ? 'Procesando...' : 'Confirmar Liquidación'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
