'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, Link as LinkIcon, Copy, Plus, ArrowLeft, CheckCircle2, ExternalLink } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AdminAliadosPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [aliados, setAliados] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    nombreEmpresa: '',
    nombreContacto: '',
    telefono: '',
    correo: '',
    comision: 0,
    sede: ''
  });

  useEffect(() => {
    fetchAliados();
  }, []);

  const fetchAliados = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('referidores')
        .select('*')
        .order('nombre_aliado', { ascending: true });

      if (error) throw error;
      setAliados(data || []);
    } catch (err: any) {
      console.error('Error detallado Aliados:', err?.message || err);
      toast.error('Error cargando aliados');
    } finally {
      setLoading(false);
    }
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/[^a-z0-9\s-]/g, "") // Remove special chars
      .replace(/\s+/g, "-") // Replace spaces with hyphens
      .replace(/-+/g, "-"); // Remove duplicate hyphens
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombreEmpresa) return toast.error('El nombre de la empresa es obligatorio');

    setIsSubmitting(true);
    try {
      const slug = generateSlug(formData.nombreEmpresa);

      // Check if slug exists
      const { data: existing } = await supabase.from('referidores').select('id').eq('slug_unico', slug).single();
      if (existing) {
        toast.error('Ya existe un aliado con un nombre muy similar. Intenta agregarle un identificador.');
        return;
      }

      const payload = {
        nombre_aliado: formData.nombreEmpresa,
        contacto_nombre: formData.nombreContacto,
        telefono: formData.telefono,
        correo: formData.correo,
        porcentaje_comision: formData.comision || 0,
        estado: 'Activo',
        vitrina_sede: formData.sede || null,
        slug_unico: slug
      };

      const { error } = await supabase.from('referidores').insert([payload]);
      
      if (error) throw error;

      toast.success('Aliado registrado correctamente');
      setFormData({ nombreEmpresa: '', nombreContacto: '', telefono: '', correo: '', comision: 0, sede: '' });
      fetchAliados();
    } catch (err: any) {
      console.error('Error detallado guardando aliado:', err?.message || err);
      toast.error('Ocurrió un error al guardar el aliado');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (slug: string) => {
    const url = `https://ambarcouture.com/recomendar/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success('📋 ¡Link copiado listo para enviar por WhatsApp!');
  };

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(val || 0);
  };

  return (
    <div className="min-h-screen bg-zinc-50 py-10 px-4 sm:px-8 font-sans">
      <Toaster position="top-right" richColors />
      
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Navigation */}
        <div>
          <button 
            onClick={() => router.push('/dashboard')}
            className="flex items-center text-sm font-semibold text-zinc-500 hover:text-zinc-900 transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver al Dashboard
          </button>
          
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-100 flex items-start gap-4">
            <div className="p-4 bg-amber-50 rounded-xl">
              <Users className="w-8 h-8 text-amber-600" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-zinc-900 tracking-tight mb-2">Red de Aliados VIP</h1>
              <p className="text-zinc-500 font-medium">Registra socios comerciales y gestiona sus links de comisiones.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Columna Izquierda: Formulario */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-3xl shadow-sm border border-zinc-100 p-8">
              <h2 className="text-xl font-bold text-zinc-900 mb-6 flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-500" /> Nuevo Aliado
              </h2>
              
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Nombre del Aliado (Marca/Empresa)</label>
                  <input
                    type="text"
                    required
                    value={formData.nombreEmpresa}
                    onChange={(e) => setFormData({...formData, nombreEmpresa: e.target.value})}
                    placeholder="Ej: Maquillaje Élite"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                  />
                  {formData.nombreEmpresa && (
                    <p className="text-xs text-emerald-600 mt-2 font-medium flex items-center gap-1">
                      <LinkIcon className="w-3 h-3" /> Link: /recomendar/{generateSlug(formData.nombreEmpresa)}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Nombre del Contacto</label>
                  <input
                    type="text"
                    value={formData.nombreContacto}
                    onChange={(e) => setFormData({...formData, nombreContacto: e.target.value})}
                    placeholder="Nombre del dueño o encargado"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Teléfono</label>
                    <input
                      type="tel"
                      value={formData.telefono}
                      onChange={(e) => setFormData({...formData, telefono: e.target.value})}
                      placeholder="Ej: 300 123"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Comisión (%)</label>
                    <input
                      type="number"
                      value={0}
                      disabled
                      className="w-full bg-neutral-100 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-medium text-zinc-400 cursor-not-allowed transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Sede Origen (Opcional)</label>
                  <input
                    type="text"
                    value={formData.sede}
                    onChange={(e) => setFormData({...formData, sede: e.target.value})}
                    placeholder="Sede base del aliado"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Correo Electrónico</label>
                  <input
                    type="email"
                    value={formData.correo}
                    onChange={(e) => setFormData({...formData, correo: e.target.value})}
                    placeholder="aliado@correo.com"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-bold py-3.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 mt-4 disabled:opacity-50"
                >
                  {isSubmitting ? 'Registrando...' : 'Guardar y Generar Link'}
                </button>
              </form>
            </div>
          </div>

          {/* Columna Derecha: Tabla */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-3xl shadow-sm border border-zinc-100 overflow-hidden">
              <div className="p-6 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
                <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Aliados Activos
                </h3>
                <span className="text-xs font-bold text-zinc-500 bg-white px-3 py-1 rounded-full border border-zinc-200">
                  Total: {aliados.length}
                </span>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50/50 border-b border-zinc-100 text-xs uppercase tracking-widest text-zinc-500 font-bold">
                      <th className="py-4 px-6">Aliado / Empresa</th>
                      <th className="py-4 px-6">Contacto</th>
                      <th className="py-4 px-6">Acumulado</th>
                      <th className="py-4 px-6 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {loading ? (
                      <tr>
                        <td colSpan={4} className="py-12 text-center text-zinc-400 font-medium">Cargando aliados...</td>
                      </tr>
                    ) : aliados?.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-12 text-center text-zinc-400 font-medium">Aún no hay aliados comerciales registrados.</td>
                      </tr>
                    ) : (
                      aliados?.map((aliado) => (
                        <tr key={aliado.id} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="py-4 px-6">
                            <p className="font-black text-zinc-900">{aliado.nombre_aliado}</p>
                            <p className="text-xs text-zinc-500 font-medium mt-0.5">
                              {aliado.slug_unico ? `/recomendar/${aliado.slug_unico}` : 'Sin link generado'}
                            </p>
                          </td>
                          <td className="py-4 px-6">
                            <p className="font-bold text-zinc-700">{aliado.contacto_nombre || 'N/A'}</p>
                            <p className="text-xs text-zinc-500">{aliado.telefono || aliado.correo || 'Sin datos'}</p>
                          </td>
                          <td className="py-4 px-6 flex flex-col items-start gap-1">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 font-bold text-sm rounded-lg border border-emerald-100">
                              {formatMoney(aliado.saldo_comisiones)}
                            </span>
                            {aliado.porcentaje_comision && (
                              <span className="text-xs text-zinc-500 font-bold bg-zinc-100 px-2 py-0.5 rounded-md">
                                {aliado.porcentaje_comision}% Comisión
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Link
                                href={`/dashboard/aliados/${aliado.slug_unico}`}
                                target="_blank"
                                className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-zinc-100 text-zinc-900 font-bold text-xs rounded-xl transition-colors shadow-sm border border-zinc-200"
                              >
                                <ExternalLink className="w-3.5 h-3.5" /> Ver Portal
                              </Link>
                              <button
                                onClick={() => aliado.slug_unico ? copyToClipboard(aliado.slug_unico) : toast.error('No hay link para copiar')}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-amber-400 hover:text-amber-950 text-white font-bold text-xs rounded-xl transition-colors shadow-sm"
                              >
                                <Copy className="w-3.5 h-3.5" /> Copiar Link
                              </button>
                            </div>
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
      </div>
    </div>
  );
}
