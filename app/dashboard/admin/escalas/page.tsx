'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Edit, Save, TrendingUp, X, ArrowLeft } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { useRouter } from 'next/navigation';

export default function EscalasAdminPage() {
  const router = useRouter();
  const [escalas, setEscalas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Estado para el modal de edición
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEscala, setSelectedEscala] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    minimo: '',
    maximo: '',
    descuento_cliente: '',
    comision_aliado: ''
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchEscalas();
  }, []);

  const fetchEscalas = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('config_escalas')
      .select('*')
      .order('minimo', { ascending: true });
      
    console.log('Datos recibidos de Supabase:', data);
    if (error) {
      console.error('Error del fetch:', error);
      toast.error('Error al cargar las escalas');
    } else {
      setEscalas(data || []);
    }
    setLoading(false);
  };

  const handleCargarIniciales = async () => {
    setIsSaving(true);
    const defaults = [
      { minimo: 0, maximo: 800000, descuento_cliente: 30000, comision_aliado: 30000 },
      { minimo: 800001, maximo: 1800000, descuento_cliente: 50000, comision_aliado: 50000 },
      { minimo: 1800001, maximo: 3000000, descuento_cliente: 100000, comision_aliado: 100000 },
      { minimo: 3000001, maximo: 3500000, descuento_cliente: 150000, comision_aliado: 150000 },
      { minimo: 3500001, maximo: null, descuento_cliente: 200000, comision_aliado: 200000 }
    ];

    const { error } = await supabase.from('config_escalas').insert(defaults);
    setIsSaving(false);

    if (error) {
      console.error('Error detallado BD:', error.message || error);
      toast.error('Error al insertar escalas base.');
    } else {
      toast.success('Escalas base cargadas con éxito');
      fetchEscalas();
    }
  };

  const formatMoney = (val: number | null | undefined) => {
    if (val === null || val === undefined) return 'En adelante';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(val);
  };

  const handleEditClick = (escala: any) => {
    setSelectedEscala(escala);
    setEditForm({
      minimo: escala.minimo?.toString() || '',
      maximo: escala.maximo?.toString() || '',
      descuento_cliente: escala.descuento_cliente?.toString() || '',
      comision_aliado: escala.comision_aliado?.toString() || ''
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!selectedEscala) return;
    setIsSaving(true);
    
    const payload = {
      minimo: editForm.minimo ? parseInt(editForm.minimo, 10) : 0,
      maximo: editForm.maximo ? parseInt(editForm.maximo, 10) : null,
      descuento_cliente: editForm.descuento_cliente ? parseInt(editForm.descuento_cliente, 10) : 0,
      comision_aliado: editForm.comision_aliado ? parseInt(editForm.comision_aliado, 10) : 0,
    };

    const { error } = await supabase
      .from('config_escalas')
      .update(payload)
      .eq('id', selectedEscala.id);

    setIsSaving(false);

    if (error) {
      console.error('Error updating escala:', error);
      toast.error('Ocurrió un error al guardar');
    } else {
      toast.success('¡Escala actualizada correctamente!');
      setIsModalOpen(false);
      fetchEscalas();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 sm:px-8 font-sans">
      <Toaster position="top-right" richColors />
      
      <div className="max-w-6xl mx-auto">
        {/* Botón Volver */}
        <div className="mb-4">
          <button 
            onClick={() => router.push('/dashboard')}
            className="flex items-center text-sm font-semibold text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver al Dashboard
          </button>
        </div>

        {/* Header Elegante */}
        <div className="mb-10 bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex items-start gap-4">
          <div className="p-4 bg-emerald-50 rounded-xl">
            <TrendingUp className="w-8 h-8 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-2">Configuración de Incentivos VIP</h1>
            <p className="text-gray-500 font-medium text-sm leading-relaxed max-w-2xl">
              Gestione los rangos de precio de los vestidos, los descuentos para clientas y las comisiones de los aliados comerciales. Estos valores nutren dinámicamente los contratos nuevos.
            </p>
          </div>
        </div>

        {/* Tabla Limpia Tailwind */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-widest text-gray-500 font-bold">
                  <th className="py-4 px-6">Rango Mínimo</th>
                  <th className="py-4 px-6">Rango Máximo</th>
                  <th className="py-4 px-6 text-rose-600">Descuento Cliente</th>
                  <th className="py-4 px-6 text-emerald-600">Comisión Aliado</th>
                  <th className="py-4 px-6 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-gray-400 font-medium">Cargando escalas...</td>
                  </tr>
                ) : escalas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-gray-400 font-medium">
                      No hay reglas configuradas.
                      <div className="mt-4">
                        <button 
                          onClick={handleCargarIniciales}
                          className="px-6 py-3 bg-zinc-900 text-white rounded-xl font-bold shadow-md hover:bg-zinc-800 transition-colors"
                        >
                          Cargar Rangos Iniciales por Defecto
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  escalas.map((escala) => (
                    <tr key={escala.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="py-4 px-6 text-gray-900 font-semibold">{formatMoney(escala.minimo)}</td>
                      <td className="py-4 px-6 text-gray-900 font-semibold">{formatMoney(escala.maximo)}</td>
                      <td className="py-4 px-6 font-black text-rose-600">{formatMoney(escala.descuento_cliente)}</td>
                      <td className="py-4 px-6 font-black text-emerald-600">{formatMoney(escala.comision_aliado)}</td>
                      <td className="py-4 px-6 text-center">
                        <button 
                          onClick={() => handleEditClick(escala)}
                          className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-zinc-900 hover:text-white transition-all opacity-70 group-hover:opacity-100 shadow-sm"
                          title="Editar Escala"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal Dialog Elegante */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Edit className="w-5 h-5 text-emerald-600" /> Editar Regla de Negocio
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-rose-500 transition-colors p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Rango Mínimo ($)</label>
                  <input 
                    type="number" 
                    value={editForm.minimo} 
                    onChange={(e) => setEditForm({...editForm, minimo: e.target.value})}
                    className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-400 font-semibold outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Rango Máximo ($)</label>
                  <input 
                    type="number" 
                    value={editForm.maximo} 
                    onChange={(e) => setEditForm({...editForm, maximo: e.target.value})}
                    placeholder="En adelante"
                    className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-400 font-semibold outline-none"
                  />
                </div>
              </div>

              <div className="p-4 bg-rose-50/50 border border-rose-100 rounded-2xl space-y-1.5">
                <label className="text-xs font-bold text-rose-600 uppercase tracking-wider">Descuento Cliente VIP ($)</label>
                <input 
                  type="number" 
                  value={editForm.descuento_cliente} 
                  onChange={(e) => setEditForm({...editForm, descuento_cliente: e.target.value})}
                  className="w-full bg-white border border-rose-200 text-rose-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-rose-400 font-black outline-none"
                />
              </div>

              <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl space-y-1.5">
                <label className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Comisión Aliado ($)</label>
                <input 
                  type="number" 
                  value={editForm.comision_aliado} 
                  onChange={(e) => setEditForm({...editForm, comision_aliado: e.target.value})}
                  className="w-full bg-white border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-400 font-black outline-none"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="px-6 py-2.5 rounded-xl text-sm font-bold bg-zinc-900 text-white hover:bg-zinc-800 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isSaving ? 'Guardando...' : <><Save className="w-4 h-4" /> Guardar Cambios</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
