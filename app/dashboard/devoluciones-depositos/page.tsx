'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Banknote, Search, Upload, CheckCircle2, MessageCircle, AlertCircle, FileText, ChevronRight, ChevronLeft, Calculator, FileCheck2, Loader2, HandCoins
} from 'lucide-react';

interface Contrato {
  id: string;
  numero_contrato: string;
  cliente_nombre: string;
  cliente_documento: string;
  valor_deposito: number;
  whatsapp: string;
  created_at: string;
  sede: string;
}

interface Devolucion {
  id: string;
  contrato_id: string;
  monto_deposito_original: number;
  monto_descuento: number;
  motivo_descuento: string | null;
  monto_devuelto: number;
  fecha_devolucion: string;
  fecha_pago_deposito: string | null;
  comprobante_url: string | null;
  observaciones: string | null;
  estado: string;
  sede: string | null;
  created_at: string;
  contrato?: {
    numero_contrato: string;
    cliente_nombre: string;
    whatsapp: string;
    sede?: string;
  };
}

export default function DevolucionesDepositosPage() {
  const router = useRouter();
  
  // App States
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState<any>(null);

  // Data States
  const [historial, setHistorial] = useState<Devolucion[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  
  // Search & Form States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContrato, setSelectedContrato] = useState<Contrato | null>(null);
  
  const [form, setForm] = useState({
    hubo_descuento: false,
    monto_descuento: 0,
    motivo_descuento: '',
    observaciones: '',
    fecha_pago_deposito: '',
    comprobante: null as File | null,
  });

  // Filters State
  const [filtroInicio, setFiltroInicio] = useState('');
  const [filtroFin, setFiltroFin] = useState('');
  const [filtroSede, setFiltroSede] = useState('');
  const [filtroBusqueda, setFiltroBusqueda] = useState('');

  const [uploadPreview, setUploadPreview] = useState<string | null>(null);

  // Exito
  const [successDevolucion, setSuccessDevolucion] = useState<Devolucion | null>(null);

  // ─── INIT ────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.push('/login'); return; }
      setUser(authUser);
      await fetchHistorial();
      await fetchContratos();
      setLoading(false);
    };
    init();
  }, [router, supabase]);

  const fetchHistorial = async () => {
    const { data, error } = await supabase
      .from('devoluciones_depositos')
      .select('*, contrato:contratos(numero_contrato, cliente_nombre, whatsapp, sede)')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching historial:', error);
    } else {
      setHistorial(data || []);
    }
  };

  const fetchContratos = async () => {
    const { data, error } = await supabase
      .from('contratos')
      .select('id, numero_contrato, cliente_nombre, cliente_documento, valor_deposito, whatsapp, created_at, sede')
      .not('estado', 'in', '(cancelado,rechazado)')
      .gt('valor_deposito', 0)
      .order('created_at', { ascending: false })
      .limit(500);
    
    if (!error && data) {
      setContratos(data);
    }
  };

  // ─── HANDLERS ────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setForm({ ...form, comprobante: file });
      if (file.type.startsWith('image/')) {
        setUploadPreview(URL.createObjectURL(file));
      } else {
        setUploadPreview(null);
      }
    }
  };

  const montoFinal = useMemo(() => {
    if (!selectedContrato) return 0;
    const base = Number(selectedContrato.valor_deposito) || 0;
    const desc = form.hubo_descuento ? (Number(form.monto_descuento) || 0) : 0;
    return Math.max(0, base - desc);
  }, [selectedContrato, form.hubo_descuento, form.monto_descuento]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContrato) {
      toast.error('Seleccione un contrato primero');
      return;
    }

    setSubmitting(true);
    let comprobante_url = null;

    try {
      // 1. Subir archivo si existe
      if (form.comprobante) {
        const fileExt = form.comprobante.name.split('.').pop();
        const fileName = `${Date.now()}_${selectedContrato.numero_contrato}.${fileExt}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('comprobantes_depositos')
          .upload(fileName, form.comprobante);

        if (uploadError) {
          throw new Error('Error subiendo comprobante: ' + uploadError.message);
        }

        const { data: { publicUrl } } = supabase.storage
          .from('comprobantes_depositos')
          .getPublicUrl(uploadData.path);
          
        comprobante_url = publicUrl;
      }

      // 2. Insertar registro
      const today = new Date().toISOString().split('T')[0];
      const payload = {
        contrato_id: selectedContrato.id && selectedContrato.id.trim() !== "" ? selectedContrato.id : null,
        monto_deposito_original: Number(selectedContrato.valor_deposito) || 0,
        monto_descuento: form.hubo_descuento ? (Number(form.monto_descuento) || 0) : 0,
        motivo_descuento: form.hubo_descuento ? (form.motivo_descuento.trim() || null) : null,
        monto_devuelto: Number(montoFinal) || 0,
        fecha_devolucion: today,
        fecha_pago_deposito: form.fecha_pago_deposito || null,
        comprobante_url,
        observaciones: form.observaciones.trim() || null,
        estado: 'completado',
        sede: selectedContrato.sede || null
      };

      const { data: insertedData, error: dbError } = await supabase
        .from('devoluciones_depositos')
        .insert([payload])
        .select()
        .single();

      if (dbError) {
        const errorMsg = dbError.message || dbError.details || JSON.stringify(dbError);
        console.error('Error detallado Supabase:', errorMsg);
        alert(`Error al guardar la devolución: ${errorMsg}`);
        setSubmitting(false);
        return;
      }

      // Preparar Success Card
      const finalRecord = { ...insertedData, contrato: selectedContrato };
      setSuccessDevolucion(finalRecord);
      
      toast.success('Devolución registrada exitosamente');
      
      // Limpiar Formulario
      setSelectedContrato(null);
      setSearchTerm('');
      setForm({ hubo_descuento: false, monto_descuento: 0, motivo_descuento: '', observaciones: '', fecha_pago_deposito: '', comprobante: null });
      setUploadPreview(null);
      
      await fetchHistorial();

    } catch (err: any) {
      toast.error(err.message || 'Error inesperado');
    } finally {
      setSubmitting(false);
    }
  };

  const getWhatsappUrl = (devolucion: Devolucion) => {
    if (!devolucion.contrato?.whatsapp) return '#';
    const phone = devolucion.contrato.whatsapp.replace(/\D/g, '');
    let msg = `Hola ${devolucion.contrato.cliente_nombre}, desde Ámbar Couture te informamos que se ha procesado la devolución de tu garantía por valor de $${devolucion.monto_devuelto.toLocaleString()}.`;
    if (devolucion.comprobante_url) {
      msg += ` Adjuntamos tu comprobante: ${devolucion.comprobante_url}`;
    }
    msg += ` ¡Gracias por confiar en nosotros!`;
    return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`;
  };

  const fmtMoneda = (val: number) => '$' + Number(val).toLocaleString('es-CO');

  // Filtro Contratos Predicitivo
  const contratosFiltrados = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const q = searchTerm.toLowerCase();
    return contratos.filter(c => 
      c.numero_contrato.toLowerCase().includes(q) || 
      c.cliente_nombre.toLowerCase().includes(q) ||
      (c.cliente_documento && c.cliente_documento.toLowerCase().includes(q))
    ).slice(0, 10);
  }, [searchTerm, contratos]);

  // Filtros Historial
  const sedesUnicas = useMemo(() => {
    const s = new Set<string>();
    historial.forEach(d => {
      const sede = d.sede || d.contrato?.sede;
      if (sede) s.add(sede);
    });
    return Array.from(s).sort();
  }, [historial]);

  const historialFiltrado = useMemo(() => {
    return historial.filter(d => {
      // Date filter
      if (filtroInicio && d.fecha_devolucion < filtroInicio) return false;
      if (filtroFin && d.fecha_devolucion > filtroFin) return false;
      
      // Sede filter
      const sede = d.sede || d.contrato?.sede || '';
      if (filtroSede && sede !== filtroSede) return false;

      // Text filter
      if (filtroBusqueda) {
        const q = filtroBusqueda.toLowerCase();
        const numContrato = d.contrato?.numero_contrato?.toLowerCase() || d.contrato_id.toLowerCase();
        const clienteNombre = d.contrato?.cliente_nombre?.toLowerCase() || '';
        if (!numContrato.includes(q) && !clienteNombre.includes(q)) return false;
      }
      return true;
    });
  }, [historial, filtroInicio, filtroFin, filtroSede, filtroBusqueda]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50/50 pb-20">
      {/* HEADER */}
      <div className="bg-white border-b border-gray-200 px-8 py-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                <HandCoins className="w-5 h-5" />
              </div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">Liquidación de Depósitos</h1>
            </div>
            <p className="text-sm text-gray-500 font-medium ml-13">Gestiona la devolución de garantías y registra comprobantes.</p>
          </div>
          <div>
            <button 
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-bold shadow-sm hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Volver al Dashboard
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-8 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* COL 1: Buscador y Formulario */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Tarjeta de Éxito Flotante */}
          {successDevolucion && (
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-3xl p-6 text-white shadow-xl shadow-emerald-500/20 relative overflow-hidden">
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
              <CheckCircle2 className="w-10 h-10 text-white/90 mb-4" />
              <h3 className="text-xl font-bold mb-1">¡Devolución Procesada!</h3>
              <p className="text-emerald-100 text-sm mb-5">El depósito para el contrato <strong className="text-white">{successDevolucion.contrato?.numero_contrato}</strong> se registró correctamente.</p>
              
              <div className="bg-white/10 rounded-xl p-3 mb-5 backdrop-blur-sm">
                <p className="text-xs text-emerald-100 uppercase tracking-wider font-bold mb-1">Monto Devuelto</p>
                <p className="text-2xl font-black">{fmtMoneda(successDevolucion.monto_devuelto)}</p>
              </div>

              <div className="flex gap-3">
                <a 
                  href={getWhatsappUrl(successDevolucion)} 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex-1 bg-white text-emerald-600 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-emerald-50 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" /> Enviar WhatsApp
                </a>
                <button 
                  onClick={() => setSuccessDevolucion(null)}
                  className="px-4 py-2.5 bg-emerald-700/50 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}

          {/* BUSCADOR */}
          <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm">
            <h2 className="text-sm font-black text-gray-800 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Search className="w-4 h-4 text-emerald-500" />
              Buscar Contrato
            </h2>
            
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="N° contrato, nombre o CC..."
                value={searchTerm}
                onChange={e => {
                  setSearchTerm(e.target.value);
                  if (selectedContrato) setSelectedContrato(null);
                }}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 outline-none transition-all"
              />
            </div>

            {searchTerm && !selectedContrato && (
              <div className="border border-gray-200 rounded-xl max-h-60 overflow-y-auto bg-white shadow-sm">
                {contratosFiltrados.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500 text-center">No se encontraron contratos con depósito</p>
                ) : (
                  contratosFiltrados.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { 
                        setSelectedContrato(c); 
                        setSearchTerm(''); 
                        setForm(prev => ({ ...prev, fecha_pago_deposito: c.created_at ? c.created_at.split('T')[0] : '' }));
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-emerald-50 border-b border-gray-100 last:border-0 flex justify-between items-center transition-colors"
                    >
                      <div>
                        <p className="font-bold text-gray-800 text-sm">{c.numero_contrato}</p>
                        <p className="text-xs text-gray-500 truncate max-w-[160px]">{c.cliente_nombre}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-emerald-600 text-sm">{fmtMoneda(c.valor_deposito)}</p>
                        <p className="text-[10px] text-gray-400 font-medium uppercase">Depósito</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {selectedContrato && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 relative">
                <button onClick={() => setSelectedContrato(null)} className="absolute top-2 right-2 text-emerald-400 hover:text-emerald-600 text-xs font-bold px-2 py-1">Cambiar</button>
                <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider mb-1">Contrato Seleccionado</p>
                <p className="font-black text-gray-900 text-lg">{selectedContrato.numero_contrato}</p>
                <p className="text-sm text-gray-700 font-medium mb-3">{selectedContrato.cliente_nombre}</p>
                <div className="bg-white rounded-lg px-3 py-2 border border-emerald-100 flex justify-between items-center shadow-sm">
                  <span className="text-xs text-gray-500 font-bold">MONTO ORIGINAL</span>
                  <span className="font-black text-emerald-700">{fmtMoneda(selectedContrato.valor_deposito)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* COL 2: Formulario de Liquidación */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-3xl p-6 md:p-8 border border-gray-200 shadow-sm relative overflow-hidden">
            {!selectedContrato && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center text-gray-500">
                <Calculator className="w-12 h-12 text-gray-300 mb-3" />
                <p className="font-medium text-sm">Selecciona un contrato para liquidar</p>
              </div>
            )}

            <h2 className="text-lg font-black text-gray-800 mb-6 flex items-center gap-2">
              <Calculator className="w-5 h-5 text-emerald-500" />
              Liquidación de Depósito
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* Fecha de Pago Depósito */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Fecha Pago Depósito (Original)</label>
                  <input 
                    type="date"
                    required
                    value={form.fecha_pago_deposito}
                    onChange={e => setForm({ ...form, fecha_pago_deposito: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-200 outline-none"
                  />
                </div>
              </div>

              {/* Descuentos */}
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={form.hubo_descuento}
                    onChange={e => setForm({ ...form, hubo_descuento: e.target.checked, monto_descuento: 0, motivo_descuento: '' })}
                    className="w-5 h-5 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                  />
                  <span className="font-bold text-gray-800 text-sm">¿Aplicar descuento por daños, multas o mora?</span>
                </label>

                {form.hubo_descuento && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Monto a descontar ($)</label>
                      <input 
                        type="number" 
                        min="0"
                        max={selectedContrato?.valor_deposito || 0}
                        required={form.hubo_descuento}
                        value={form.monto_descuento || ''}
                        onChange={e => setForm({ ...form, monto_descuento: Number(e.target.value) })}
                        className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-200 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Motivo del descuento</label>
                      <input 
                        type="text" 
                        required={form.hubo_descuento}
                        value={form.motivo_descuento}
                        onChange={e => setForm({ ...form, motivo_descuento: e.target.value })}
                        placeholder="Ej. Mancha de vino, retraso 2 días"
                        className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-200 outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Total a Devolver */}
              <div className="flex items-center justify-between p-5 bg-gray-900 rounded-2xl text-white">
                <div>
                  <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">Monto Final a Devolver</p>
                  <div className="flex items-center gap-2 text-gray-300 text-sm">
                    <span>{fmtMoneda(selectedContrato?.valor_deposito || 0)}</span>
                    {form.hubo_descuento && form.monto_descuento > 0 && (
                      <>
                        <span className="text-red-400">- {fmtMoneda(form.monto_descuento)}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-3xl font-black text-emerald-400 tracking-tight">
                  {fmtMoneda(montoFinal)}
                </div>
              </div>

              <hr className="border-gray-100" />

              {/* Archivo y Obs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Comprobante de Transferencia</label>
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors relative overflow-hidden">
                    {uploadPreview ? (
                      <img src={uploadPreview} alt="Preview" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                    ) : null}
                    <div className="flex flex-col items-center justify-center pt-5 pb-6 relative z-10">
                      <Upload className={`w-8 h-8 mb-2 ${form.comprobante ? 'text-emerald-500' : 'text-gray-400'}`} />
                      <p className="text-xs font-medium text-gray-500">
                        {form.comprobante ? form.comprobante.name : 'Click para subir imagen o PDF'}
                      </p>
                    </div>
                    <input type="file" className="hidden" onChange={handleFileChange} accept="image/*,.pdf" />
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Observaciones Internas (Opcional)</label>
                  <textarea
                    value={form.observaciones}
                    onChange={e => setForm({ ...form, observaciones: e.target.value })}
                    rows={4}
                    placeholder="Notas adicionales..."
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-200 outline-none resize-none"
                  />
                </div>
              </div>

              {/* Submit */}
              <div className="flex justify-end pt-4">
                <button
                  type="submit"
                  disabled={submitting || !selectedContrato}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-8 py-3.5 rounded-xl font-bold text-sm shadow-lg shadow-emerald-500/30 transition-all flex items-center gap-2"
                >
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</> : <><CheckCircle2 className="w-4 h-4" /> Registrar Devolución</>}
                </button>
              </div>

            </form>
          </div>
        </div>
      </div>

      {/* HISTORIAL */}
      <div className="max-w-6xl mx-auto px-8 py-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-gray-400" />
            Historial de Devoluciones
          </h2>
        </div>

        {/* Barra de Filtros */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm mb-6 flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Buscar</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Nombre, CC, N° Contrato..."
                value={filtroBusqueda}
                onChange={e => setFiltroBusqueda(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Desde</label>
            <input 
              type="date"
              value={filtroInicio}
              onChange={e => setFiltroInicio(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Hasta</label>
            <input 
              type="date"
              value={filtroFin}
              onChange={e => setFiltroFin(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Sede</label>
            <select 
              value={filtroSede}
              onChange={e => setFiltroSede(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-200"
            >
              <option value="">Todas</option>
              {sedesUnicas.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        
        <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500 font-bold">
                  <th className="px-4 py-4"># Contrato</th>
                  <th className="px-4 py-4">Cliente</th>
                  <th className="px-4 py-4">Sede</th>
                  <th className="px-4 py-4">Fecha Depósito</th>
                  <th className="px-4 py-4">Fecha Devolución</th>
                  <th className="px-4 py-4">Depósito Orig.</th>
                  <th className="px-4 py-4">Descuento</th>
                  <th className="px-4 py-4">Total Devuelto</th>
                  <th className="px-4 py-4 text-center">Comprobante</th>
                  <th className="px-4 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {historialFiltrado.length === 0 ? (
                  <tr><td colSpan={10} className="px-6 py-8 text-center text-sm text-gray-500 font-medium">No hay devoluciones registradas o que coincidan con los filtros</td></tr>
                ) : (
                  historialFiltrado.map((d) => (
                    <tr key={d.id} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="px-4 py-4 text-sm font-bold text-gray-900">{d.contrato?.numero_contrato || d.contrato_id.substring(0,8)}</td>
                      <td className="px-4 py-4 text-sm font-medium text-gray-700 truncate max-w-[150px]">{d.contrato?.cliente_nombre || '—'}</td>
                      <td className="px-4 py-4 text-sm text-gray-500">{d.sede || d.contrato?.sede || '—'}</td>
                      <td className="px-4 py-4 text-sm text-gray-500">{d.fecha_pago_deposito ? new Date(d.fecha_pago_deposito).toLocaleDateString('es-CO') : '—'}</td>
                      <td className="px-4 py-4 text-sm font-medium text-gray-600">{new Date(d.fecha_devolucion).toLocaleDateString('es-CO')}</td>
                      <td className="px-4 py-4 text-sm font-medium text-gray-500">{fmtMoneda(d.monto_deposito_original)}</td>
                      <td className="px-4 py-4">
                        {d.monto_descuento > 0 ? (
                          <div>
                            <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">{fmtMoneda(d.monto_descuento)}</span>
                            <p className="text-[10px] text-gray-400 mt-1 truncate max-w-[100px]" title={d.motivo_descuento || ''}>{d.motivo_descuento}</p>
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">Sin desc.</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm font-black text-gray-900">{fmtMoneda(d.monto_devuelto)}</td>
                      <td className="px-4 py-4 text-center">
                        {d.comprobante_url ? (
                          <a 
                            href={d.comprobante_url} 
                            target="_blank" 
                            rel="noreferrer"
                            className="inline-flex p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Ver Comprobante"
                          >
                            <FileText className="w-4 h-4" />
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400">N/A</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right flex items-center justify-end gap-2">
                        <a 
                          href={getWhatsappUrl(d)} 
                          target="_blank" 
                          rel="noreferrer"
                          className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Enviar por WhatsApp"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </a>
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
