'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { FileText, Save, Loader2, Edit3, CheckCircle, XCircle } from 'lucide-react';

interface PlantillaContrato {
  id: string;
  numero_orden: number;
  titulo: string;
  contenido: string;
}

export default function ContratosAdminPage() {
  const router = useRouter();
  const [plantillas, setPlantillas] = useState<PlantillaContrato[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetchPlantillas();
  }, []);

  const fetchPlantillas = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('plantillas_contratos')
      .select('*')
      .order('numero_orden', { ascending: true });
      
    if (error) {
      showToast('Error al cargar plantillas', 'error');
    } else if (data) {
      setPlantillas(data);
    }
    setLoading(false);
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleUpdate = async (id: string, nuevoContenido: string) => {
    console.log("Intentando guardar id:", id, "Contenido:", nuevoContenido);
    setSaving(id);
    const { data, error } = await supabase
      .from('plantillas_contratos')
      .update({ contenido: nuevoContenido })
      .eq('id', id)
      .select();

    console.log("Resultado:", data, "Error:", error);

    if (error) {
      showToast('Error al guardar', 'error');
    } else {
      showToast('Guardado exitosamente', 'success');
      // Update local state
      setPlantillas(plantillas.map(p => p.id === id ? { ...p, contenido: nuevoContenido } : p));
      router.refresh();
    }
    setSaving(null);
  };

  const handleChange = (id: string, value: string) => {
    setPlantillas(plantillas.map(p => p.id === id ? { ...p, contenido: value } : p));
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto min-h-screen">
      <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3">
            <FileText className="w-8 h-8 text-rose-500" />
            ADMINISTRACIÓN DE CONTRATOS
          </h1>
          <p className="text-gray-500 mt-2 font-medium">Gestiona y edita en caliente las cláusulas del contrato general y Pre XV.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="w-10 h-10 animate-spin text-rose-500" />
        </div>
      ) : (
        <div className="space-y-6">
          {plantillas.map((plantilla) => (
            <div key={plantilla.id} className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4">
                <div className="flex items-center gap-3">
                  <div className="bg-gray-50 text-gray-400 w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg">
                    {plantilla.numero_orden}
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">{plantilla.titulo}</h2>
                </div>
                
                <button
                  onClick={() => handleUpdate(plantilla.id, plantilla.contenido)}
                  disabled={saving === plantilla.id}
                  className="flex items-center justify-center gap-2 bg-rose-500 hover:bg-rose-600 text-white px-6 py-2.5 rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving === plantilla.id ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Save className="w-5 h-5" />
                  )}
                  {saving === plantilla.id ? 'Guardando...' : 'Guardar Cláusula'}
                </button>
              </div>
              
              <div className="relative group">
                <div className="absolute top-3 right-3 text-gray-300 group-focus-within:text-rose-400 transition-colors pointer-events-none">
                  <Edit3 className="w-5 h-5" />
                </div>
                <textarea
                  value={plantilla.contenido}
                  onChange={(e) => handleChange(plantilla.id, e.target.value)}
                  className="w-full h-48 p-5 bg-gray-50 border-2 border-transparent focus:border-rose-100 focus:bg-white rounded-2xl outline-none resize-y transition-all text-gray-700 font-mono text-sm leading-relaxed"
                  placeholder="Escribe el contenido HTML de la cláusula aquí..."
                />
              </div>
              <p className="text-xs text-gray-400 mt-3 flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                Puedes utilizar etiquetas HTML básicas como &lt;strong&gt;, &lt;ul&gt;, &lt;li&gt;, y &lt;p&gt; para el formato.
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 flex items-center gap-3 px-6 py-4 rounded-2xl shadow-lg border animate-in slide-in-from-right-8 z-50 ${
          toast.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-6 h-6 text-emerald-500" /> : <XCircle className="w-6 h-6 text-red-500" />}
          <p className="font-bold">{toast.message}</p>
        </div>
      )}
    </div>
  );
}
