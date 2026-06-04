'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, Link as LinkIcon, Copy, Plus, ArrowLeft, CheckCircle2, ExternalLink, Search, ArrowUpDown, MoreVertical, Edit2, Ban, Play, X, Calendar } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AdminAliadosPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [aliados, setAliados] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // CRM States
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc'|'desc'>('asc');
  const [selectedMonth, setSelectedMonth] = useState<string>('todos');
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  // Edit Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingAliado, setEditingAliado] = useState<any>(null);
  const [editFormData, setEditFormData] = useState({
    nombreContacto: '',
    telefono: '',
    comision: 0
  });

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
        .select('id, slug_unico, slug, creado_el, nombre_aliado, contacto_nombre, telefono, correo, vitrina_sede, sede_origen, estado, saldo_comisiones, porcentaje_comision, banco_nombre, numero_cuenta, acepto_terminos, fecha_aceptacion_terminos, activo')
        .order('nombre_aliado', { ascending: true });

      if (error) throw error;
      setAliados(data || []);
    } catch (err: any) {
      console.error('Error detallado de Supabase:', err);
      toast.error('Error cargando aliados');
    } finally {
      setLoading(false);
    }
  };

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    aliados.forEach(a => {
      if (a.creado_el) {
        const d = new Date(a.creado_el);
        const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        months.add(val);
      }
    });
    return Array.from(months).sort((a,b) => b.localeCompare(a));
  }, [aliados]);

  // ------------------------------------------------------------------
  // LÓGICA DE FILTRADO, BÚSQUEDA Y ORDENAMIENTO (Reactivo - Client Side)
  // ------------------------------------------------------------------
  const filteredAndSortedAliados = useMemo(() => {
    let result = [...aliados];
    
    if (selectedMonth !== 'todos') {
      const [year, month] = selectedMonth.split('-');
      result = result.filter(a => {
        if (!a.creado_el) return false;
        const date = new Date(a.creado_el);
        return date.getFullYear() === parseInt(year) && (date.getMonth() + 1) === parseInt(month);
      });
    }

    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      result = result.filter(a => a.nombre_aliado?.toLowerCase().includes(lowerTerm));
    }
    
    result.sort((a, b) => {
      const nameA = a.nombre_aliado || '';
      const nameB = b.nombre_aliado || '';
      return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    });
    
    return result;
  }, [aliados, searchTerm, sortOrder, selectedMonth]);

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombreEmpresa) return toast.error('El nombre de la empresa es obligatorio');

    setIsSubmitting(true);
    try {
      const slug = generateSlug(formData.nombreEmpresa);

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
        activo: true,
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
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://erp.ambarcouture.com';
    const linkCompleto = `${baseUrl}/recomendar/${slug}`;
    navigator.clipboard.writeText(linkCompleto);
    toast.success('📋 ¡Link copiado listo para enviar por WhatsApp!');
  };

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(val || 0);
  };

  const toggleEstado = async (aliado: any) => {
    const isCurrentlyInactive = aliado.estado === 'Inactivo' || aliado.activo === false;
    const nuevoEstado = isCurrentlyInactive ? 'Activo' : 'Inactivo';
    const nuevoActivo = isCurrentlyInactive ? true : false;
    try {
      const { error } = await supabase.from('referidores').update({ estado: nuevoEstado, activo: nuevoActivo }).eq('id', aliado.id);
      if (error) throw error;
      toast.success(`Aliado marcado como ${nuevoEstado}`);
      fetchAliados();
    } catch (e) {
      console.error(e);
      toast.error('Error al actualizar estado');
    }
  };

  const openEditModal = (aliado: any) => {
    setEditingAliado(aliado);
    setEditFormData({
      nombreContacto: aliado.contacto_nombre || '',
      telefono: aliado.telefono || '',
      comision: aliado.porcentaje_comision || 0
    });
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAliado) return;
    try {
      const { error } = await supabase.from('referidores').update({
        contacto_nombre: editFormData.nombreContacto,
        telefono: editFormData.telefono,
        porcentaje_comision: editFormData.comision
      }).eq('id', editingAliado.id);
      
      if (error) throw error;
      toast.success('Datos comerciales actualizados');
      setIsEditModalOpen(false);
      fetchAliados();
    } catch (e) {
      toast.error('Error al actualizar datos');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 py-10 px-4 sm:px-8 font-sans">
      <Toaster position="top-right" richColors />
      
      <div className="max-w-[1400px] mx-auto space-y-8">
        
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
              <h1 className="text-3xl font-black text-zinc-900 tracking-tight mb-2">CRM Red de Aliados VIP</h1>
              <p className="text-zinc-500 font-medium">Gestiona socios, analiza métricas y controla los enlaces de referenciación.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          
          {/* Columna Izquierda: Formulario */}
          <div className="xl:col-span-1 space-y-6">
            <div className="bg-white rounded-3xl shadow-sm border border-zinc-100 p-8 sticky top-8">
              <h2 className="text-xl font-bold text-zinc-900 mb-6 flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-500" /> Nuevo Aliado
              </h2>
              
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Nombre de Marca/Empresa</label>
                  <input
                    type="text"
                    required
                    value={formData.nombreEmpresa}
                    onChange={(e) => setFormData({...formData, nombreEmpresa: e.target.value})}
                    placeholder="Ej: Maquillaje Élite"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Nombre del Contacto</label>
                  <input
                    type="text"
                    value={formData.nombreContacto}
                    onChange={(e) => setFormData({...formData, nombreContacto: e.target.value})}
                    placeholder="Encargado"
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
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Correo (Opcional)</label>
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
                  {isSubmitting ? 'Registrando...' : 'Guardar Aliado'}
                </button>
              </form>
            </div>
          </div>

          {/* Columna Derecha: CRM Tabla */}
          <div className="xl:col-span-3">
            <div className="bg-white rounded-3xl shadow-sm border border-zinc-100 overflow-hidden">
              <div className="p-6 border-b border-zinc-100 bg-zinc-50/50">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                  <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Analítica de Referidos
                  </h3>
                  <span className="text-xs font-bold text-zinc-500 bg-white px-3 py-1 rounded-full border border-zinc-200 shadow-sm">
                    {filteredAndSortedAliados.length} Aliados Encontrados
                  </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Buscador */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input 
                      type="text" 
                      placeholder="Buscar por marca o aliado..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all shadow-sm"
                    />
                  </div>
                  
                  {/* Filtro Mes (creado_el) */}
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all appearance-none cursor-pointer shadow-sm"
                    >
                      <option value="todos">Métricas Históricas (Todos)</option>
                      {availableMonths.map(m => {
                        const [y, mm] = m.split('-');
                        const date = new Date(parseInt(y), parseInt(mm)-1);
                        const label = date.toLocaleString('es-CO', { month: 'long', year: 'numeric' });
                        return <option key={m} value={m}>{label.charAt(0).toUpperCase() + label.slice(1)} {y}</option>;
                      })}
                    </select>
                  </div>

                  {/* Ordenamiento */}
                  <button
                    onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                    className="flex items-center justify-center gap-2 py-2.5 px-4 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-xl text-sm font-bold text-zinc-700 transition-colors shadow-sm"
                  >
                    <ArrowUpDown className="w-4 h-4" />
                    {sortOrder === 'asc' ? 'Ordenar: A - Z' : 'Ordenar: Z - A'}
                  </button>
                </div>
              </div>
              
              <div className="overflow-x-auto min-h-[500px]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50/50 border-b border-zinc-100 text-[11px] uppercase tracking-widest text-zinc-500 font-bold">
                      <th className="py-4 px-6">Aliado / Empresa</th>
                      <th className="py-4 px-6">Contacto</th>
                      <th className="py-4 px-6 text-center">Pendientes</th>
                      <th className="py-4 px-6 text-center">Total Traídos</th>
                      <th className="py-4 px-6">Financiero</th>
                      <th className="py-4 px-6 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100" onClick={() => { if(openDropdownId) setOpenDropdownId(null) }}>
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-zinc-400 font-medium">Cargando base de datos...</td>
                      </tr>
                    ) : filteredAndSortedAliados.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-zinc-400 font-medium">No se encontraron aliados comerciales.</td>
                      </tr>
                    ) : (
                      filteredAndSortedAliados.map((aliado) => {
                        const isInactive = aliado.estado === 'Inactivo' || aliado.activo === false;
                        
                        // Simulated metrics due to removed cross-relation fetch per user instructions
                        const pendientes = 0; 
                        const historico = 0;

                        return (
                          <tr key={aliado.id} className={`hover:bg-zinc-50/50 transition-colors ${isInactive ? 'opacity-50 grayscale-[50%] bg-zinc-50/50' : ''}`}>
                            <td className="py-4 px-6 relative">
                              {isInactive && <span className="absolute left-0 top-0 bottom-0 w-1 bg-zinc-400 rounded-r"></span>}
                              <div className="flex items-center gap-2">
                                <p className="font-black text-zinc-900">{aliado.nombre_aliado}</p>
                                {isInactive && <span className="px-2 py-0.5 bg-zinc-200 text-zinc-600 text-[9px] font-bold rounded uppercase tracking-wider">Pausado</span>}
                              </div>
                              <p className="text-xs text-zinc-500 font-medium mt-1 truncate max-w-[200px]">
                                {aliado.slug_unico ? `.../recomendar/${aliado.slug_unico}` : 'Sin link'}
                              </p>
                            </td>
                            <td className="py-4 px-6">
                              <p className="font-bold text-zinc-700">{aliado.contacto_nombre || 'N/A'}</p>
                              <p className="text-xs text-zinc-500 font-medium mt-0.5">{aliado.telefono || 'Sin teléfono'}</p>
                            </td>
                            <td className="py-4 px-6 text-center">
                              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-700 font-bold text-sm shadow-sm">
                                {pendientes}
                              </span>
                            </td>
                            <td className="py-4 px-6 text-center">
                              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-bold text-sm shadow-sm">
                                {historico}
                              </span>
                            </td>
                            <td className="py-4 px-6">
                              <div className="flex flex-col gap-1.5 items-start">
                                <span className="inline-flex items-center px-2.5 py-1 bg-emerald-50 text-emerald-700 font-bold text-[11px] rounded-lg border border-emerald-200 shadow-sm">
                                  {formatMoney(aliado.saldo_comisiones)} Acumulado
                                </span>
                                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                                  {aliado.porcentaje_comision || 0}% Comisión
                                </span>
                              </div>
                            </td>
                            <td className="py-4 px-6 text-right relative">
                              <div className="flex items-center justify-end gap-2">
                                <Link
                                  href={`/dashboard/aliados/${aliado.slug_unico}`}
                                  className="p-2 hover:bg-zinc-100 text-zinc-500 rounded-xl transition-colors"
                                  title="Ver panel de control y analítica interna del aliado"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </Link>
                                <button
                                  onClick={(e) => { e.stopPropagation(); isInactive ? toast.error('El aliado está pausado') : copyToClipboard(aliado.slug_unico); }}
                                  disabled={isInactive}
                                  className="p-2 bg-zinc-900 hover:bg-amber-400 hover:text-amber-950 text-white rounded-xl transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Copiar enlace de referidor al portapapeles"
                                >
                                  <Copy className="w-4 h-4" />
                                </button>
                                
                                {/* Dropdown Menu */}
                                <div className="relative">
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setOpenDropdownId(openDropdownId === aliado.id ? null : aliado.id); }}
                                    className="p-2 hover:bg-zinc-200 rounded-xl transition-colors text-zinc-500"
                                    title="Más opciones (Editar datos / Desactivar aliado)"
                                  >
                                    <MoreVertical className="w-4 h-4" />
                                  </button>
                                  
                                  {openDropdownId === aliado.id && (
                                    <div className="absolute right-0 top-10 w-48 bg-white border border-zinc-200 shadow-[0_10px_40px_rgba(0,0,0,0.1)] rounded-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); openEditModal(aliado); setOpenDropdownId(null); }}
                                        className="w-full text-left px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-3 font-medium transition-colors"
                                      >
                                        <Edit2 className="w-4 h-4 text-zinc-400" /> Editar Datos
                                      </button>
                                      <div className="h-px bg-zinc-100 my-1"></div>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); toggleEstado(aliado); setOpenDropdownId(null); }}
                                        className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 font-medium transition-colors ${isInactive ? 'text-emerald-600 hover:bg-emerald-50' : 'text-red-600 hover:bg-red-50'}`}
                                      >
                                        {isInactive ? <Play className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                                        {isInactive ? 'Reactivar Aliado' : 'Desactivar Aliado'}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && editingAliado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
              <h3 className="font-serif text-xl text-zinc-900 font-bold">Editar Aliado</h3>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="p-2 hover:bg-zinc-200 rounded-full transition-colors text-zinc-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="p-8 space-y-5">
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Nombre del Contacto</label>
                <input
                  type="text"
                  required
                  value={editFormData.nombreContacto}
                  onChange={(e) => setEditFormData({...editFormData, nombreContacto: e.target.value})}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Teléfono</label>
                <input
                  type="tel"
                  required
                  value={editFormData.telefono}
                  onChange={(e) => setEditFormData({...editFormData, telefono: e.target.value})}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Comisión (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  required
                  value={editFormData.comision}
                  onChange={(e) => setEditFormData({...editFormData, comision: Number(e.target.value)})}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3.5 px-4 rounded-xl transition-colors mt-6 shadow-lg shadow-amber-500/20"
              >
                Actualizar Datos
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
