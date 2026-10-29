'use client';
import {usePermissions} from '@/lib/use-permissions';
import {canEditSavedRecords} from '@/lib/saved-record-editing';
import {useVerifiedAccess} from '@/components/VerifiedAccessProvider';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Search, Package, MapPin, ArrowLeftRight, Loader2, 
  Trash2, Plus, Filter, LayoutGrid, List as ListIcon, CheckCircle2, ChevronLeft, ShieldAlert, ChevronDown,
  X, FileText, TrendingUp, Clock, DollarSign, List, RotateCcw, Archive, ArchiveRestore, QrCode, Download
} from 'lucide-react';
import {downloadDressQr,dressLabelsPdf} from '@/lib/dress-qr';
import { toast, Toaster } from 'sonner';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import InventoryByStatus from '@/components/InventoryByStatus';
import DressRemovalDialog from '@/components/DressRemovalDialog';
import {CLASSIFICATION_STYLES, UNCLASSIFIED_STYLE, type DressClassification} from '@/lib/inventory';

export default function InventoryPage() {
  const readAccess = useVerifiedAccess();
  const [loading, setLoading] = useState(true);
  const [vestidos, setVestidos] = useState<any[]>([]);
  const [sedes, setSedes] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [updatingId, setUpdatingId] = useState<string | number | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newDress, setNewDress] = useState({
    codigo: '',
    nombre: '',
    clasificacion_id: '',
    talla: '',
    color: '',
    precio: '',
    precio_venta: '',
    sede_actual_id: ''
  });
  const [clasificaciones, setClasificaciones] = useState<DressClassification[]>([]);
  const [clasificacionFilter, setClasificacionFilter] = useState<string>(''); // '' todas, 'none' sin clasificar, o id
  const [showArchived, setShowArchived] = useState(false);
  const [inventoryTab, setInventoryTab] = useState<'bandeja' | 'estado'>('bandeja');
  const [removalTarget, setRemovalTarget] = useState<{id: string; codigo: string} | null>(null);
  const [user, setUser] = useState<any>(null);
  const userPermissions = usePermissions(user?.id ? String(user.id) : null);
  const [sedeFilter, setSedeFilter] = useState<string>(''); // Filtro por Sede Principal ('none' = sin sede)
  const [novedadFilter, setNovedadFilter] = useState<string>('');
  const [editState, setEditState] = useState<Record<number, any>>({}); // Estado local de edición por vestidoid
  const [profilesList, setProfilesList] = useState<any[]>([]);

  // -- Expediente de Prenda Dossier (New) --
  const [dossierOpen, setDossierOpen] = useState(false);
  const [selectedDressDossier, setSelectedDressDossier] = useState<any>(null);
  const [activeDossierTab, setActiveDossierTab] = useState<'alquileres' | 'mantenimiento' | 'estadisticas' | 'traslados'>('alquileres');
  const [dossierRentals, setDossierRentals] = useState<any[]>([]);
  const [dossierMaintenance, setDossierMaintenance] = useState<any[]>([]);
  const [dossierStats, setDossierStats] = useState<any>(null);
  const [dossierTransfers, setDossierTransfers] = useState<any[]>([]);
  const [dossierLoading, setDossierLoading] = useState(false);

  const [editingDress, setEditingDress] = useState<EditableDress | null>(null);
  // -- Modal de Traslado --
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferVestido, setTransferVestido] = useState<any>(null);
  const [transferTargetSede, setTransferTargetSede] = useState<string>('');
  const [transferForm, setTransferForm] = useState({
    motivo: '',
    realizado_por: '',
    autorizado_por: ''
  });

  // -- Reversión de Venta (Rollback) --
  const [showRollbackModal, setShowRollbackModal] = useState(false);
  const [rollbackDress, setRollbackDress] = useState<any>(null);
  const [rollbackLoading, setRollbackLoading] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      const {user, profile} = await readAccess();
      if (user) {
        setUser({ ...user, rol: profile?.rol, nombre: profile?.nombre });
      }
    };
    void checkUser().catch(() => {window.location.href='/login';});
    loadData();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const handleAddDress = async () => {
    const faltan = dressMissing(newDress);
    if (faltan.length) {
       toast.error(`Completa: ${faltan.join(', ')}.`);
       return;
    }
    setSaving(true);
    try {
      // 0. El código es único en todo el inventario (todas las sedes, también archivados).
      const { data: duplicate } = await supabase
        .from('vestidos')
        .select('id')
        .ilike('codigo', newDress.codigo)
        .limit(1)
        .maybeSingle();

      if (duplicate) {
        toast.error(`El código ${newDress.codigo} ya existe en el inventario. Usa un código diferente.`);
        return;
      }

      // 1. Mapeo Quirúrgico: Solo enviamos lo que el usuario confirmó
      const insertData = {
        codigo: newDress.codigo,
        nombre: newDress.nombre.trim(),
        talla: newDress.talla.trim().toUpperCase(),
        color: newDress.color.trim().toUpperCase(),
        precio_sugerido: Number(newDress.precio),
        precio_venta: newDress.precio_venta ? Number(newDress.precio_venta) : null,
        clasificacion_id: Number(newDress.clasificacion_id),
        sede_principal_id: newDress.sede_actual_id,
        sede_actual_id: newDress.sede_actual_id,
        estado: 'Disponible'
      };
      
      const { error } = await supabase
        .from('vestidos')
        .insert([insertData]);
      
      if (error) throw error;
      toast.success('Vestido registrado correctamente 💎');
      
      setIsModalOpen(false);
      setNewDress({ 
        codigo: '', 
        nombre: '', 
        clasificacion_id: '', 
        talla: '', 
        color: '', 
        precio: '', 
        precio_venta: '', 
        sede_actual_id: '' 
      });
      loadData();
    } catch (err: any) {
      console.error('Error detallado de DB:', err.message, err.details, err.hint);
      toast.error('Error al registrar: ' + (err.message || 'Error desconocido'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeBajaVestido = async (id: number, codigo: string) => {
    const motivo = confirm(`¿Dar de BAJA el vestido ${codigo} por DAÑO? OK para DAÑO, Cancelar para VENTA.`);
    const nuevoEstado = motivo ? 'Dañado/Baja' : 'Vendido';
    
    setUpdatingId(id);
    try {
      const { error } = await supabase
        .from('vestidos')
        .update({ estado: nuevoEstado })
        .eq('id', id);
      
      if (error) throw error;
      toast.success(`Vestido marcado como ${nuevoEstado} 💎`);
      loadData();
    } catch (err: any) {
      console.error(err);
      toast.error('Error al dar de baja: ' + err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const loadData = async () => {
    setLoading(true);
    let sData: any[] = [];
    let vData: any[] = [];

    // 1. FETCH SEDES (ULTRA SIMPLE - MINUSCULAS)
    try {
      const { data, error } = await supabase
        .from('sedes')
        .select('id, nombre');
      
      if (error) {
        console.error('Error Sedes detallado:', JSON.stringify(error, null, 2));
      } else {
        sData = data || [];
        console.log('Sedes cargadas OK:', sData);
      }
    } catch (err) {
      console.error('Crash Sedes:', JSON.stringify(err, null, 2));
    }

    // 2. FETCH VESTIDOS
    try {
      const { data, error } = await supabase
        .from('vestidos')
        .select('id, codigo, nombre, talla, color, sede_principal_id, sede_actual_id, estado, precio_sugerido, precio_venta, stock_total, clasificacion_id, archivado, archivado_at, motivo_archivo, qr_token, imagen_url, foto_frente, foto_espalda, foto_detalle')
        .order('codigo', { ascending: true });
      
      if (error) {
        console.error('Error Vestidos detallado:', JSON.stringify(error, null, 2));
      } else {
        vData = data || [];
      }
    } catch (err) {
      console.error('Crash Vestidos:', JSON.stringify(err, null, 2));
    }

    // 2.2 FETCH CLASIFICACIONES
    try {
      const { data, error } = await supabase
        .from('clasificaciones_vestido')
        .select('id, nombre, orden, activo')
        .order('orden');
      if (error) throw error;
      setClasificaciones(data || []);
    } catch (err) {
      console.error('Error cargando clasificaciones:', err);
    }

    // 2.5 FETCH PROFILES FOR TRANSFERS
    try {
      const { data: profilesData } = await supabase.from('profiles').select('id, nombre, rol, email').order('nombre');
      if (profilesData) setProfilesList(profilesData);
    } catch (err) {
      console.error('Error cargando perfiles:', err);
    }

    // 3. MAPPING & STATE
    const mapped = vData.map(v => ({
      ...v,
      sede: sData.find(s => s.id === v.sede_actual_id) || null
    }));

    setSedes(sData);
    setVestidos(mapped);
    setLoading(false);
  };

  const handleEditChange = (id: number, field: string, value: any) => {
    setEditState(prev => ({
      ...prev,
      [id]: { 
        ...(prev[id] || {}), 
        [field]: field === 'precio_venta' ? (value === '' ? null : Number(value)) : field === 'precio_sugerido' || field === 'stock_total' ? Number(value) : value 
      }
    }));
  };

  const handleSaveVestido = async (id: number) => {
    const changes = editState[id];
    if (!changes) return;

    setUpdatingId(id);
    try {
      const { error } = await supabase
        .from('vestidos')
        .update(changes)
        .eq('id', id);
      
      if (error) throw error;
      toast.success('Cambios guardados con éxito 💎');
      
      // Limpiar estado de edición para esta fila y recargar
      setEditState(prev => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
      });
      loadData();
    } catch (err: any) {
      console.error(err);
      toast.error('Error al guardar: ' + err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  // A dress whose sede no longer exists gets its sede assigned directly (state unchanged, logged); otherwise it is a transfer.
  const changeSede = async (v: { id: number; codigo: string; sede_actual_id: string | null }, newSedeId: string) => {
    if (!newSedeId || sedes.some(s => s.id === v.sede_actual_id)) return handleTransfer(v, newSedeId);
    setUpdatingId(v.id);
    try {
      const { error } = await supabase.from('vestidos').update({ sede_actual_id: newSedeId, sede_principal_id: newSedeId }).eq('id', v.id);
      if (error) throw error;
      await supabase.from('bitacora_vestidos').insert({ vestido_id: v.id, usuario_email: user?.email || user?.nombre || null, accion: 'Sede asignada', motivo: 'Vestido sin sede asignada', detalle: `Sede: ${sedes.find(s => s.id === newSedeId)?.nombre || newSedeId}` });
      toast.success(`Sede asignada a ${v.codigo}. El estado no cambió.`);
      loadData();
    } catch (err) {
      toast.error('No se pudo asignar la sede: ' + (err instanceof Error ? err.message : (err as { message?: string })?.message || 'Error desconocido'));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleTransfer = (v: any, newSedeId: string) => {
    if (!newSedeId || newSedeId === v.sede_actual_id) return;
    setTransferVestido(v);
    setTransferTargetSede(newSedeId);
    setTransferForm({ motivo: '', realizado_por: '', autorizado_por: '' });
    setShowTransferModal(true);
  };

  const confirmTransfer = async () => {
    if (!transferVestido || !transferTargetSede) return;
    if (!transferForm.motivo || !transferForm.realizado_por || !transferForm.autorizado_por) {
      toast.error('Todos los campos del traslado son obligatorios');
      return;
    }
    
    setUpdatingId(transferVestido.id);
    setShowTransferModal(false);
    
    try {
      // 1. Insertar en traslados_bitacora
      const { error: bitacoraError } = await supabase
        .from('traslados_bitacora')
        .insert({
          vestido_id: transferVestido.id,
          sede_origen_id: transferVestido.sede_actual_id,
          sede_destino_id: transferTargetSede,
          motivo: transferForm.motivo,
          realizado_por: transferForm.realizado_por,
          autorizado_por: transferForm.autorizado_por
        });
      
      if (bitacoraError) throw bitacoraError;

      // 2. Actualizar vestido (sede_principal y sede_actual)
      const { error: dressError } = await supabase
        .from('vestidos')
        .update({ 
          sede_principal_id: transferTargetSede,
          sede_actual_id: transferTargetSede,
          estado: 'Disponible' // Al trasladar vuelve a estar disponible en sede
        })
        .eq('id', transferVestido.id);
      
      if (dressError) throw dressError;

      toast.success('Traslado registrado en historial y completado con éxito 💎');
      loadData();
    } catch (err: any) {
      console.error(err);
      toast.error('Error al procesar traslado: ' + err.message);
    } finally {
      setUpdatingId(null);
      setTransferVestido(null);
      setTransferTargetSede('');
    }
  };

  const handleDeleteVestido = (id: string, codigo: string) => setRemovalTarget({ id, codigo });

  const handleRestoreVestido = async (id: string, codigo: string) => {
    setUpdatingId(id);
    const { error } = await supabase.rpc('restaurar_vestido', { p_id: id });
    setUpdatingId(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`Código ${codigo} restaurado en la bandeja`);
    loadData();
  };

  const handleClasificacion = async (id: string, value: string) => {
    setUpdatingId(id);
    const { data, error } = await supabase
      .from('vestidos')
      .update({ clasificacion_id: value ? Number(value) : null })
      .eq('id', id)
      .select('id');
    setUpdatingId(null);
    if (error) { toast.error('No se pudo guardar la clasificación: ' + error.message); return; }
    if (!data?.length) { toast.error('No tienes permiso sobre códigos de esta sede.'); return; }
    setVestidos(prev => prev.map(v => v.id === id ? { ...v, clasificacion_id: value ? Number(value) : null } : v));
  };

  const clasificacionNombre = (id: number | null | undefined) => clasificaciones.find(c => c.id === id)?.nombre;

  const confirmRollback = async () => {
    if (!rollbackDress) return;
    setRollbackLoading(true);
    try {
      const { error } = await supabase
        .from('vestidos')
        .update({ estado: 'Disponible' })
        .eq('codigo', rollbackDress.codigo);
      
      if (error) throw error;
      
      toast.success(`Venta del vestido ${rollbackDress.codigo} revertida con éxito 💎`);
      setShowRollbackModal(false);
      setRollbackDress(null);
      loadData();
    } catch (err: any) {
      console.error('Error al revertir venta:', err);
      toast.error('Error al revertir venta: ' + (err.message || 'Error desconocido'));
    } finally {
      setRollbackLoading(false);
    }
  };

  // -- EXPEDIENTE DE PRENDA: LOGIC --
  const openDossier = async (dress: any) => {
    setSelectedDressDossier(dress);
    setDossierOpen(true);
    setDossierLoading(true);
    setActiveDossierTab('alquileres');

    try {
      // Parallel Fetching for Dossier Tabs
      const [rentalsRes, maintenanceRes, statsRes, trasladosRes] = await Promise.all([
        // 1. Alquileres (History of Contracts)
        supabase
          .from('contrato_items_vestidos')
          .select('contrato_id, contratos(numero_contrato, cliente_nombre, fecha_evento, fecha_entrega_envio, estado)')
          .eq('vestido_id', dress.id)
          .order('created_at', { ascending: false }),

        // 2. Mantenimiento (History of repairs)
        supabase
          .from('mantenimiento_bitacora')
          .select('*')
          .eq('vestido_id', dress.id)
          .order('created_at', { ascending: false }),

        // 3. Estadísticas (Performance)
        supabase
          .from('kpi_vestidos_populares')
          .select('*')
          .eq('codigo', dress.codigo)
          .maybeSingle(),

        // 4. Traslados (History of locations)
        supabase
          .from('traslados_bitacora')
          .select('*')
          .eq('vestido_id', dress.id)
          .order('created_at', { ascending: false })
      ]);

      if (rentalsRes.error) throw new Error(`Alquileres: ${rentalsRes.error.message}`);
      if (maintenanceRes.error) throw new Error(`Mantenimiento: ${maintenanceRes.error.message}`);
      if (statsRes.error && statsRes.error.code !== 'PGRST116') throw new Error(`Estadísticas: ${statsRes.error.message}`);
      if (trasladosRes.error) throw new Error(`Traslados: ${trasladosRes.error.message}`);

      setDossierRentals(rentalsRes.data || []);
      setDossierMaintenance(maintenanceRes.data || []);
      setDossierStats(statsRes.data || null);
      setDossierTransfers(trasladosRes.data || []);

    } catch (err: any) {
      console.error('Error fetching dossier:', err);
      toast.error('No se pudo cargar la hoja de vida completa. Detalles: ' + (err.message || 'Error desconocido'));
    } finally {
      setDossierLoading(false);
    }
  };

  const sedeExiste = (id: string | null | undefined) => !!id && sedes.some(s => s.id === id);
  // Data issues to clean before invoicing (Siigo).
  const novedadesDe = (v: {clasificacion_id?: unknown; codigo?: unknown; sede_actual_id?: string | null; talla?: unknown; color?: unknown; nombre?: unknown; precio_sugerido?: unknown; precio_venta?: unknown; imagen_url?: unknown}) => {
    const n: string[] = [];
    if (!v.clasificacion_id) n.push('Sin clasificación');
    if (!/^[A-Z0-9][A-Z0-9-]{1,19}$/.test(String(v.codigo || ''))) n.push('Código inválido');
    if (!sedeExiste(v.sede_actual_id)) n.push('Sin sede');
    if (!String(v.talla || '').trim()) n.push('Sin talla');
    if (!String(v.color || '').trim()) n.push('Sin color');
    if (!String(v.nombre || '').trim()) n.push('Sin nombre');
    if (!(Number(v.precio_sugerido) > 0)) n.push('Sin precio de alquiler');
    if (v.precio_venta == null) n.push('Sin precio de venta');
    if (!String(v.imagen_url || '').trim()) n.push('Sin fotos');
    return n;
  };
  const filtered = vestidos.filter(v => {
    const searchMatch = 
      (v.codigo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (clasificacionNombre(v.clasificacion_id) || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.nombre && v.nombre.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const sedeMatch = sedeFilter === '' || (sedeFilter === 'none' ? !sedeExiste(v.sede_actual_id) : v.sede_actual_id === sedeFilter);
    const novedadMatch = novedadFilter === '' || (novedadFilter === 'any' ? novedadesDe(v).length > 0 : novedadesDe(v).includes(novedadFilter));
    const clasificacionMatch = clasificacionFilter === '' ||
      (clasificacionFilter === 'none' ? !v.clasificacion_id : String(v.clasificacion_id) === clasificacionFilter);
    
    return searchMatch && sedeMatch && clasificacionMatch && novedadMatch && Boolean(v.archivado) === showArchived;
  });

  if (loading && vestidos.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-rose-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex">
      <Toaster position="top-right" richColors />
      
      <Sidebar user={user} handleLogout={handleLogout} activePage="inventory" />

      <main translate="no" className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link 
              href="/dashboard" 
              className="p-3 bg-white text-gray-400 hover:text-rose-500 rounded-2xl border border-gray-100 shadow-sm transition-all active:scale-95 group"
            >
              <ChevronLeft className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
            </Link>
            <div>
              <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3 tracking-tight">
                <Package className="w-8 h-8 text-rose-500" /> LOGÍSTICA DE VESTIDOS
              </h1>
              <p className="text-gray-500 font-bold text-sm mt-1 uppercase tracking-widest">Inventory & Transfer Control</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
             <Link href="/dashboard" className="p-3 bg-white text-gray-400 hover:text-gray-600 rounded-2xl border border-gray-100 shadow-sm transition-all active:scale-95">
               <ArrowLeftRight className="w-5 h-5 rotate-90" />
             </Link>
             <div className="flex items-center gap-2 bg-white p-1 rounded-2xl shadow-sm border border-gray-100">
              <button 
                onClick={() => setViewMode('table')}
                className={`p-2 rounded-xl transition-all ${viewMode === 'table' ? 'bg-rose-500 text-white shadow-lg shadow-rose-100' : 'text-gray-400 hover:bg-gray-50'}`}
              >
                <ListIcon className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-rose-500 text-white shadow-lg shadow-rose-100' : 'text-gray-400 hover:bg-gray-50'}`}
              >
                <LayoutGrid className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Vista: bandeja o por estado */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-2xl shadow-sm border border-gray-100 w-fit">
          {([['bandeja', 'Por sede'], ['estado', 'Por estado']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setInventoryTab(id)}
              className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${inventoryTab === id ? 'bg-rose-500 text-white shadow-lg shadow-rose-100' : 'text-gray-400 hover:bg-gray-50'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {inventoryTab === 'estado' ? (
          <InventoryByStatus vestidos={vestidos.filter(v => !v.archivado)} sedes={sedes} clasificaciones={clasificaciones} />
        ) : (<>
        {/* Filters & Actions */}
        <div className="bg-white p-4 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Buscar por código, nombre o clasificación..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-rose-200 font-bold text-gray-700 transition-all"
            />
          </div>

          <div className="w-full md:w-64">
            <select 
              className="w-full px-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-rose-200 font-bold text-gray-700 outline-none transition-all"
              value={sedeFilter}
              onChange={(e) => setSedeFilter(e.target.value)}
            >
              <option value="">🏠 Todas las Sedes</option>
              {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              <option value="none">Sin sede</option>
            </select>
          </div>
          {canEditSavedRecords(user, userPermissions) && <div className="w-full md:w-56">
            <select
              className="w-full px-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-rose-200 font-bold text-gray-700 outline-none transition-all"
              value={novedadFilter}
              onChange={(e) => setNovedadFilter(e.target.value)}
              aria-label="Novedades"
            >
              <option value="">⚠️ Novedades: todas</option>
              <option value="any">Con alguna novedad</option>
              {['Sin clasificación','Código inválido','Sin sede','Sin talla','Sin color','Sin nombre','Sin precio de alquiler','Sin precio de venta','Sin fotos'].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>}
          <div className="w-full md:w-56">
            <select 
              className="w-full px-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-rose-200 font-bold text-gray-700 outline-none transition-all"
              value={clasificacionFilter}
              onChange={(e) => setClasificacionFilter(e.target.value)}
            >
              <option value="">👗 Todas las clasificaciones</option>
              {clasificaciones.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              <option value="none">Sin clasificar</option>
            </select>
          </div>
          <button
            onClick={() => setShowArchived(a => !a)}
            className={`w-full md:w-auto px-5 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest border transition-all flex items-center justify-center gap-2 ${showArchived ? 'bg-gray-900 text-white border-gray-900' : 'bg-gray-50 text-gray-500 border-gray-100 hover:bg-gray-100'}`}
            title="Ver los códigos archivados para restaurarlos"
          >
            <Archive className="w-4 h-4" /> Archivados
          </button>
          <button
            onClick={() => { const t = toast.loading('Generando etiquetas…'); dressLabelsPdf(filtered).then(() => toast.success('Etiquetas listas', { id: t })).catch(e => toast.error(e.message, { id: t })); }}
            className="w-full md:w-auto px-5 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest border transition-all flex items-center justify-center gap-2 bg-gray-50 text-gray-500 border-gray-100 hover:bg-gray-100"
            title="PDF con el QR de los vestidos de la lista"
          >
            <QrCode className="w-4 h-4" /> Etiquetas QR
          </button>
          {canEditSavedRecords(user, userPermissions) && <button
            onClick={() => {
              // No xlsx library in the project: CSV UTF-8 with BOM opens directly in Excel.
              const cell = (x: unknown) => { const t = String(x ?? ''); return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
              const head = ['Código','Nombre','Clasificación','Talla','Color','Precio alquiler','Precio venta','Sede actual','Estado','Novedades'];
              const rows = filtered.map(v => [v.codigo, v.nombre, clasificacionNombre(v.clasificacion_id) || '', v.talla, v.color, v.precio_sugerido ?? '', v.precio_venta ?? '', sedes.find(s => s.id === v.sede_actual_id)?.nombre || 'Sin sede', v.estado, novedadesDe(v).join(' · ')]);
              const blob = new Blob(['\uFEFF' + [head, ...rows].map(r => r.map(cell).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
              const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `inventario-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
            }}
            className="w-full md:w-auto px-5 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest border transition-all flex items-center justify-center gap-2 bg-gray-50 text-gray-500 border-gray-100 hover:bg-gray-100"
            title="Descargar la lista filtrada para Excel"
          >
            <Download className="w-4 h-4" /> Exportar
          </button>}
          <div className="flex items-center gap-3 w-full md:w-auto">
             <div className="px-6 py-4 bg-gray-50 rounded-2xl text-gray-400 font-black text-[10px] uppercase tracking-widest border border-gray-100 italic">
               {showArchived ? 'ARCHIVADOS' : 'TOTAL STOCK'}: {filtered.length}
             </div>
             <button 
               onClick={() => {
                 loadData(); // Force database read
                 setIsModalOpen(true);
               }}
               className="flex-1 md:flex-none px-8 py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-rose-100 transition-all active:scale-95 flex items-center justify-center gap-2"
             >
               <Plus className="w-4 h-4" /> Nuevo Vestido
             </button>
          </div>
        </div>

        {editingDress && <EditDressModal dress={editingDress} clasificaciones={clasificaciones} onClose={() => setEditingDress(null)} onSaved={() => { setEditingDress(null); loadData(); }} />}
        {/* Modal Nuevo Vestido */}
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-xl rounded-[3rem] shadow-2xl border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="bg-rose-500 p-8 text-center relative">
                 <h2 className="text-2xl font-black text-white tracking-tight uppercase">Registrar Prenda V2</h2>
                 <p className="text-rose-100 text-[10px] font-bold uppercase tracking-widest mt-1">Conexión Directa con Sedes</p>
                 <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 text-white/80 hover:text-white transition-colors">
                   <Trash2 className="w-6 h-6 rotate-45" />
                 </button>
              </div>
              
              <div className="p-10 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">1. Código de Referencia *</label>
                    <input 
                      type="text" 
                      placeholder="Ej: BOG-2024-001"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-rose-200 font-bold text-gray-700 outline-none uppercase"
                      value={newDress.codigo}
                      onChange={(e) => setNewDress({...newDress, codigo: cleanDressCode(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">2. Clasificación *</label>
                    <select 
                      className={`w-full px-4 py-3 bg-gray-50 border rounded-xl focus:ring-2 focus:ring-rose-200 font-bold text-gray-700 outline-none ${newDress.clasificacion_id ? 'border-gray-100' : 'border-rose-200'}`}
                      value={newDress.clasificacion_id}
                      onChange={(e) => setNewDress({...newDress, clasificacion_id: e.target.value})}
                    >
                      <option value="">Selecciona...</option>
                      {clasificaciones.filter(c => c.activo).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">3. Nombre / Descripción *</label>
                  <input 
                    type="text" 
                    placeholder="Ej: Vestido Rosado con Pedrería"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-rose-200 font-bold text-gray-700 outline-none"
                    value={newDress.nombre}
                    onChange={(e) => setNewDress({...newDress, nombre: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">4. Talla *</label>
                    <input 
                      type="text" 
                      placeholder="Ej: S, 8, M"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-rose-200 font-bold text-gray-700 outline-none uppercase"
                      value={newDress.talla}
                      onChange={(e) => setNewDress({...newDress, talla: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">5. Color *</label>
                    <input 
                      type="text" 
                      placeholder="Ej: Rose Gold"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-rose-200 font-bold text-gray-700 outline-none"
                      value={newDress.color}
                      onChange={(e) => setNewDress({...newDress, color: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">6. Precio de alquiler *</label>
                    <input 
                      type="number" min="1" step="1000"
                      placeholder="Ej: 1500000"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-rose-200 font-bold text-gray-700 outline-none"
                      value={newDress.precio}
                      onChange={(e) => setNewDress({...newDress, precio: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Precio de venta sugerido</label>
                    <input 
                      type="number" min="1" step="1000"
                      placeholder="Opcional"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-rose-200 font-bold text-gray-700 outline-none"
                      value={newDress.precio_venta}
                      onChange={(e) => setNewDress({...newDress, precio_venta: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">7. Sede Base *</label>
                    <select 
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-rose-200 font-bold text-gray-700 outline-none"
                      value={newDress.sede_actual_id}
                      onChange={(e) => setNewDress({...newDress, sede_actual_id: e.target.value})}
                    >
                      <option value="">Selecciona...</option>
                      {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                    </select>
                  </div>
                </div>

                <button 
                  onClick={handleAddDress}
                  disabled={saving || dressMissing(newDress).length > 0}
                  className="w-full py-5 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-rose-100 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 mt-4"
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                  GUARDAR EN INVENTARIO
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        {viewMode === 'table' ? (
          <div className="bg-white rounded-[2.5rem] shadow-xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Prenda</th>
                    <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Clasificación</th>
                    <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Atributos</th>
                    <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Precio sugerido alquiler</th>
                    <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Precio de venta sugerido</th>
                    <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Stock</th>
                    <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Ubicación / Logística</th>
                    <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((v) => (
                    <tr 
                      key={v.id} 
                      className="hover:bg-rose-50/30 transition-colors group cursor-pointer"
                      onClick={() => openDossier(v)}
                    >
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black shadow-sm shrink-0 ${
                            v.estado === 'De Baja' ? 'bg-rose-600 text-white rotate-0' :
                            v.estado === 'Traslado' ? 'bg-amber-100 text-amber-600 animate-pulse' : 
                            'bg-rose-100 text-rose-500'
                          }`}>
                            {v.imagen_url ? <img src={v.imagen_url} alt="" className="w-12 h-12 rounded-2xl object-cover" /> : v.estado === 'De Baja' ? 'X' : v.codigo.substring(0, 2)}
                          </div>
                          <div>
                            <div className="font-black text-gray-900 text-base tracking-tighter uppercase leading-none mb-1">{v.codigo}</div>
                            {v.archivado && <div className="mb-1 text-[10px] text-gray-500 normal-case max-w-[220px]">Archivado{v.archivado_at ? ` el ${new Date(v.archivado_at).toLocaleDateString('es-CO')}` : ''}: <b>{v.motivo_archivo || 'sin motivo'}</b></div>}
                            {canEditSavedRecords(user, userPermissions) && !v.archivado && <button type="button" onClick={(e) => { e.stopPropagation(); setEditingDress(v); }} className="mb-1 text-[9px] font-black uppercase tracking-widest text-rose-500 hover:underline">Editar todo</button>}
                            <input 
                              type="text"
                              value={editState[v.id]?.nombre !== undefined ? editState[v.id].nombre : (v.nombre || '')}
                              onClick={(e) => e.stopPropagation()} // Prevent dossier opening when editing
                              onChange={(e) => handleEditChange(v.id, 'nombre', e.target.value)}
                              className="text-[10px] text-gray-700 bg-gray-50 border border-transparent hover:border-gray-200 focus:bg-white focus:border-rose-300 w-full rounded-md px-1 py-0.5 font-bold uppercase tracking-widest transition-all outline-none"
                              placeholder="Sin nombre"
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-6" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={v.clasificacion_id || ''}
                          disabled={updatingId === v.id}
                          onChange={(e) => handleClasificacion(v.id, e.target.value)}
                          className={`px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-wide outline-none cursor-pointer ${CLASSIFICATION_STYLES[clasificacionNombre(v.clasificacion_id) || ''] || UNCLASSIFIED_STYLE}`}
                          title="Cambiar clasificación"
                        >
                          <option value="">Sin clasificar</option>
                          {clasificaciones.filter(c => c.activo || c.id === v.clasificacion_id).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                      </td>
                      <td className="px-8 py-6">
                         <div className="flex flex-wrap gap-1.5 items-center">
                            <input
                              aria-label="Talla"
                              placeholder="Talla"
                              disabled={v.archivado}
                              value={editState[v.id]?.talla !== undefined ? editState[v.id].talla : (v.talla || '')}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => handleEditChange(v.id, 'talla', e.target.value.toUpperCase())}
                              className="w-16 px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[9px] font-black uppercase tracking-tighter border border-indigo-100 outline-none focus:border-indigo-300"
                            />
                            <input
                              aria-label="Color"
                              placeholder="Color"
                              disabled={v.archivado}
                              value={editState[v.id]?.color !== undefined ? editState[v.id].color : (v.color || '')}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => handleEditChange(v.id, 'color', e.target.value.toUpperCase())}
                              className="w-24 px-2 py-0.5 bg-rose-50 text-rose-600 rounded text-[9px] font-black uppercase tracking-tighter border border-rose-100 outline-none focus:border-rose-300"
                            />
                         </div>
                      </td>
                      <td className="px-6 py-6 text-center">
                        <div className="flex items-center justify-center gap-1 border border-gray-200 bg-white rounded-lg px-2 overflow-hidden focus-within:ring-2 focus-within:ring-rose-200 transition-all text-sm w-32 mx-auto">
                          <span className="text-gray-400 font-bold">$</span>
                          <input 
                            type="number"
                            className="bg-transparent w-full py-2 text-gray-700 font-bold text-center outline-none"
                            value={editState[v.id]?.precio_sugerido !== undefined ? editState[v.id].precio_sugerido : (v.precio_sugerido || 0)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handleEditChange(v.id, 'precio_sugerido', e.target.value)}
                            placeholder="0"
                          />
                        </div>
                      </td>
                      <td className="px-6 py-6 text-center">
                        <div className="flex items-center justify-center gap-1 border border-gray-200 bg-white rounded-lg px-2 overflow-hidden focus-within:ring-2 focus-within:ring-rose-200 transition-all text-sm w-32 mx-auto">
                          <span className="text-gray-400 font-bold">$</span>
                          <input 
                            type="number"
                            className="bg-transparent w-full py-2 text-gray-700 font-bold text-center outline-none"
                            value={editState[v.id]?.precio_venta !== undefined ? (editState[v.id].precio_venta ?? '') : (v.precio_venta ?? '')}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handleEditChange(v.id, 'precio_venta', e.target.value)}
                            placeholder="—"
                          />
                        </div>
                      </td>
                      <td className="px-6 py-6 text-center">
                         <div className="w-16 mx-auto">
                            <input 
                              type="number"
                              min="0"
                              className="w-full bg-white border border-gray-200 rounded-lg px-2 py-2 text-center text-sm font-black text-gray-700 outline-none focus:ring-2 focus:ring-rose-200"
                              value={editState[v.id]?.stock_total !== undefined ? editState[v.id].stock_total : (v.stock_total || 0)}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => handleEditChange(v.id, 'stock_total', e.target.value)}
                            />
                         </div>
                      </td>
                      <td className="px-6 py-6">
                        <div className="flex flex-col gap-2">
                          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Sede Actual</label>
                          <div className="relative group/select">
                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-rose-400 z-10" />
                            <select 
                              className="w-full bg-white border border-gray-200 hover:border-rose-300 rounded-xl pl-8 pr-10 py-2.5 text-[10px] font-black text-gray-700 outline-none focus:ring-2 focus:ring-rose-200 transition-all cursor-pointer appearance-none shadow-sm hover:bg-rose-50/50"
                              value={v.sede_actual_id || ''}
                              disabled={updatingId === v.id}
                              onChange={(e) => {
                                if (window.confirm(sedes.some(s => s.id === v.sede_actual_id) ? `¿Confirmar traslado de ${v.codigo} a la sede seleccionada?` : `¿Asignar esta sede a ${v.codigo}? El estado no cambia.`)) {
                                  changeSede(v, e.target.value);
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                               <option value="">Sin Asignar</option>
                               {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 group-hover/select:text-rose-500 transition-colors pointer-events-none" />
                          </div>
                          <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border text-center ${
                            v.estado === 'De Baja' || v.estado === 'Dañado/Baja'
                            ? 'bg-rose-600 text-white border-rose-700 shadow-sm'
                            : v.estado === 'Vendido'
                            ? 'bg-gray-800 text-white border-gray-900'
                            : v.estado === 'Traslado' 
                            ? 'bg-amber-100 text-amber-700 border-amber-200' 
                            : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                          }`}>
                            {v.estado === 'De Baja' ? '⛔ DE BAJA' : (v.estado || 'Disponible')}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-6">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveVestido(v.id);
                            }}
                            disabled={!editState[v.id] || updatingId === v.id}
                            className="p-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-200 text-white rounded-xl shadow-lg shadow-blue-100 transition-all active:scale-95 group"
                            title="Guardar Cambios"
                          >
                            {updatingId === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                          </button>
                          {v.archivado ? (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRestoreVestido(v.id, v.codigo);
                              }}
                              disabled={updatingId === v.id}
                              className="p-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-xl transition-all active:scale-95 group"
                              title={`Restaurar código${v.motivo_archivo ? ` (archivado: ${v.motivo_archivo})` : ''}`}
                            >
                              <ArchiveRestore className="w-4 h-4" />
                            </button>
                          ) : (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteVestido(v.id, v.codigo);
                            }}
                            disabled={updatingId === v.id}
                            className="p-3 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-xl transition-all active:scale-95 group"
                            title="Eliminar o archivar código"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          )}
                          {canEditSavedRecords(user, userPermissions) && !v.archivado && (
                            v.estado === 'Vendido' ? (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRollbackDress(v);
                                  setShowRollbackModal(true);
                                }}
                                disabled={updatingId === v.id}
                                className="p-3 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition-all active:scale-95 group animate-pulse"
                                title="Revertir Venta"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            ) : (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeBajaVestido(v.id, v.codigo);
                                }}
                                disabled={updatingId === v.id || v.estado === 'Dañado/Baja'}
                                className="p-3 bg-orange-50 hover:bg-orange-100 text-orange-600 rounded-xl transition-all active:scale-95 group"
                                title="Dar de Baja (Venta/Daño)"
                              >
                                <ShieldAlert className="w-4 h-4" />
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-8 py-20 text-center">
                        <Package className="w-16 h-16 text-gray-100 mx-auto mb-4" />
                        <p className="text-gray-400 font-bold">{showArchived ? 'No hay códigos archivados con estos filtros.' : 'No se encontraron vestidos en el inventario.'}</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.map((v) => (
              <div 
                key={v.id} 
                className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 hover:shadow-xl hover:scale-[1.02] transition-all group cursor-pointer"
                onClick={() => openDossier(v)}
              >
                <div className="flex justify-between items-start mb-4">
                  <div 
                    className="w-14 h-14 bg-rose-100 text-rose-500 rounded-3xl flex items-center justify-center text-xl font-black shadow-inner rotate-3 group-hover:rotate-0 transition-transform"
                    onClick={() => openDossier(v)}
                  >
                    {v.codigo?.substring(0, 2) || '??'}
                  </div>
                  <span className="text-[10px] font-black tracking-widest text-gray-300 uppercase">STOCK</span>
                </div>
                <h3 className="text-xl font-black text-gray-900 tracking-tighter uppercase mb-1">{v.codigo}</h3>
                <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-6 italic">{clasificacionNombre(v.clasificacion_id) || 'Sin Clasificar'}{v.archivado ? ' · Archivado' : ''}</p>
                
                <div className="space-y-4 pt-4 border-t border-gray-50">
                  {v.estado === 'De Baja' && (
                    <div className="bg-rose-600 text-white p-3 rounded-2xl mb-2 text-center animate-pulse">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em]">⚠️ FUERA DE SERVICIO</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 pb-4">
                     <div>
                       <span className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Stock</span>
                       <input 
                         type="number"
                         className="w-full bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-center text-xs font-black text-gray-700 outline-none focus:ring-2 focus:ring-rose-200"
                         value={editState[v.id]?.stock_total !== undefined ? editState[v.id].stock_total : (v.stock_total || 0)}
                         onChange={(e) => handleEditChange(v.id, 'stock_total', e.target.value)}
                       />
                     </div>
                     <div>
                       <span className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Precio sugerido alquiler</span>
                       <div className="flex items-center gap-1 bg-gray-50 border border-gray-100 rounded-lg px-2 overflow-hidden focus-within:ring-2 focus-within:ring-rose-200">
                          <span className="text-gray-400 text-xs font-bold">$</span>
                          <input 
                            type="number"
                            className="w-full text-xs font-black text-gray-700 bg-transparent py-2 outline-none"
                            value={editState[v.id]?.precio_sugerido !== undefined ? editState[v.id].precio_sugerido : (v.precio_sugerido || 0)}
                            onChange={(e) => handleEditChange(v.id, 'precio_sugerido', e.target.value)}
                          />
                       </div>
                     </div>
                     <div>
                       <span className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Precio de venta sugerido</span>
                       <div className="flex items-center gap-1 bg-gray-50 border border-gray-100 rounded-lg px-2 overflow-hidden focus-within:ring-2 focus-within:ring-rose-200">
                          <span className="text-gray-400 text-xs font-bold">$</span>
                          <input 
                            type="number"
                            className="w-full text-xs font-black text-gray-700 bg-transparent py-2 outline-none"
                            value={editState[v.id]?.precio_venta !== undefined ? (editState[v.id].precio_venta ?? '') : (v.precio_venta ?? '')}
                            onChange={(e) => handleEditChange(v.id, 'precio_venta', e.target.value)}
                            placeholder="—"
                          />
                       </div>
                     </div>
                  </div>

                  <div className="space-y-2 pt-4 border-t border-gray-50">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Sede / Ubicación</label>
                      <div className="relative group/select">
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-rose-400 z-10" />
                        <select 
                          className="w-full bg-white border border-gray-200 hover:border-rose-300 rounded-xl pl-10 pr-12 py-3 text-xs font-black text-gray-700 outline-none focus:ring-2 focus:ring-rose-200 transition-all cursor-pointer appearance-none shadow-sm hover:bg-rose-50/50"
                          value={v.sede_actual_id || ''}
                          disabled={updatingId === v.id}
                          onChange={(e) => {
                            if (window.confirm(sedes.some(s => s.id === v.sede_actual_id) ? `¿Confirmar traslado de ${v.codigo} a la sede seleccionada?` : `¿Asignar esta sede a ${v.codigo}? El estado no cambia.`)) {
                              changeSede(v, e.target.value);
                            }
                          }}
                        >
                           <option value="">Sin Asignar</option>
                           {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-hover/select:text-rose-500 transition-colors pointer-events-none" />
                      </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-6">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSaveVestido(v.id);
                      }}
                      disabled={!editState[v.id] || updatingId === v.id}
                      className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-200 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-100 transition-all flex items-center justify-center gap-2"
                    >
                      {updatingId === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      GUARDAR
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (v.archivado) handleRestoreVestido(v.id, v.codigo); else handleDeleteVestido(v.id, v.codigo);
                      }}
                      disabled={updatingId === v.id}
                      className={`p-3 rounded-xl transition-all ${v.archivado ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-600' : 'bg-rose-50 hover:bg-rose-100 text-rose-500'}`}
                      title={v.archivado ? 'Restaurar código' : 'Eliminar o archivar código'}
                    >
                      {v.archivado ? <ArchiveRestore className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                    {canEditSavedRecords(user, userPermissions) && !v.archivado && (
                      v.estado === 'Vendido' ? (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setRollbackDress(v);
                            setShowRollbackModal(true);
                          }}
                          disabled={updatingId === v.id}
                          className="p-3 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition-all active:scale-95 group animate-pulse"
                          title="Revertir Venta"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      ) : (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeBajaVestido(v.id, v.codigo);
                          }}
                          disabled={updatingId === v.id || v.estado === 'Dañado/Baja'}
                          className="p-3 bg-orange-50 hover:bg-orange-100 text-orange-600 rounded-xl transition-all"
                          title="Dar de Baja"
                        >
                          <ShieldAlert className="w-4 h-4" />
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        </>)}

        </div>
      </main>

      {removalTarget && (
        <DressRemovalDialog
          dress={removalTarget}
          onClose={() => setRemovalTarget(null)}
          onDone={(message) => {
            setRemovalTarget(null);
            toast.success(message);
            loadData();
          }}
        />
      )}

      {/* Modal de Traslado */}
      {showTransferModal && transferVestido && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-amber-500 p-6 text-center">
               <h2 className="text-xl font-black text-white uppercase tracking-tight">Confirmar Traslado Físico</h2>
               <p className="text-amber-100 text-[10px] font-bold uppercase tracking-widest mt-1">
                 {transferVestido.codigo} ➔ {sedes.find(s => s.id === transferTargetSede)?.nombre}
               </p>
            </div>
            <div className="p-8 space-y-4">
               <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-2 ml-1">Motivo del Traslado *</label>
                  <textarea 
                    value={transferForm.motivo}
                    onChange={e => setTransferForm({...transferForm, motivo: e.target.value})}
                    placeholder="Ej: Baja rotación en sede actual, requerido para evento urgente..."
                    className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-amber-500 transition-all text-sm font-bold text-gray-800"
                    rows={3}
                  />
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 ml-1">Realizado Por *</label>
                    <select 
                      value={transferForm.realizado_por}
                      onChange={e => setTransferForm({...transferForm, realizado_por: e.target.value})}
                      className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-amber-500 text-xs font-bold text-gray-800"
                    >
                      <option value="">Seleccionar...</option>
                      {profilesList.map(p => <option key={p.id} value={p.id}>{p.nombre || p.email} ({p.rol || 'Usuario'})</option>)}
                    </select>
                 </div>
                 <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 ml-1">Autorizado Por *</label>
                    <select 
                      value={transferForm.autorizado_por}
                      onChange={e => setTransferForm({...transferForm, autorizado_por: e.target.value})}
                      className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-amber-500 text-xs font-bold text-gray-800"
                    >
                      <option value="">Seleccionar...</option>
                      {profilesList
                        .filter(p => ['administrativo', 'director', 'gerente', 'administrador', 'admin'].includes((p.rol || '').toLowerCase()))
                        .map(p => <option key={p.id} value={p.id}>{p.nombre || p.email} ({p.rol || 'Admin'})</option>)}
                    </select>
                 </div>
               </div>
               
               <div className="flex gap-4 pt-4">
                  <button 
                    onClick={() => {
                      setShowTransferModal(false);
                      setTransferVestido(null);
                      setTransferTargetSede('');
                    }}
                    className="flex-1 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black rounded-2xl transition-all uppercase text-xs"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={confirmTransfer}
                    className="flex-[2] py-4 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-2xl shadow-lg shadow-amber-200 transition-all flex items-center justify-center gap-2 uppercase text-xs"
                  >
                    <ArrowLeftRight size={16} /> Procesar Traslado
                  </button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Reversión de Venta (Rollback) */}
      {showRollbackModal && rollbackDress && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-rose-600 p-6 text-center">
               <h2 className="text-xl font-black text-white uppercase tracking-tight">Confirmar Reversión de Venta</h2>
               <p className="text-rose-100 text-[10px] font-bold uppercase tracking-widest mt-1">
                 {rollbackDress.codigo} ➔ Disponible
               </p>
            </div>
            <div className="p-8 space-y-6">
               <div className="text-center">
                 <p className="text-gray-600 text-sm font-medium">
                   ¿Estás seguro de revertir la venta del vestido <strong>{rollbackDress.codigo}</strong>?
                 </p>
                 <p className="text-gray-400 text-xs mt-2">
                   Esta acción actualizará su estado a <strong>Disponible</strong> en el inventario.
                 </p>
               </div>
               
               <div className="flex gap-4">
                  <button 
                    onClick={() => {
                      setShowRollbackModal(false);
                      setRollbackDress(null);
                    }}
                    disabled={rollbackLoading}
                    className="flex-1 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black rounded-2xl transition-all uppercase text-xs disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={confirmRollback}
                    disabled={rollbackLoading}
                    className="flex-[2] py-4 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-2xl shadow-lg shadow-rose-200 transition-all flex items-center justify-center gap-2 uppercase text-xs disabled:opacity-50"
                  >
                    {rollbackLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw size={16} />}
                    Revertir Venta
                  </button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* -- EXPEDIENTE DE PRENDA (DOSSIER DRAWER) -- */}
      {dossierOpen && selectedDressDossier && (
        <div className="fixed inset-0 z-[200] overflow-hidden">
           <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity" onClick={() => setDossierOpen(false)} />
           
           <div className="absolute inset-y-0 right-0 max-w-full flex">
              <div className="w-screen max-w-xl bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-500">
                 {/* Header Dossier */}
                 <div className="relative h-48 bg-rose-500 overflow-hidden shrink-0">
                    <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>
                    <div className="absolute bottom-0 left-0 right-0 p-8 text-white z-10">
                       <p className="text-[10px] font-black uppercase tracking-[0.3em] text-rose-100 mb-2">Expediente Oficial de Prenda</p>
                       <h2 className="text-4xl font-black tracking-tighter leading-none mb-1">{selectedDressDossier.codigo}</h2>
                       <p className="text-rose-50 font-bold opacity-90 uppercase tracking-widest text-xs">{selectedDressDossier.nombre || 'VESTIDO SIN NOMBRE'}</p>
                    </div>
                    <button
                      onClick={() => downloadDressQr(selectedDressDossier).catch(e => toast.error(e.message))}
                      className="absolute top-6 right-20 px-3 py-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-all z-20 flex items-center gap-1 text-xs font-black"
                      title="Descargar QR (PNG)"
                    >
                      <QrCode size={16} /> QR
                    </button>
                    <button 
                      onClick={() => setDossierOpen(false)}
                      className="absolute top-6 right-6 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-all z-20"
                    >
                      <X size={20} />
                    </button>
                    {/* Badge Estado */}
                    <div className="absolute top-6 left-8 px-4 py-1.5 bg-white rounded-full shadow-lg">
                       <span className={`text-[10px] font-black uppercase tracking-widest ${
                         ['De Baja', 'Dañado/Baja'].includes(selectedDressDossier.estado) ? 'text-rose-600' : 'text-emerald-600'
                       }`}>
                         ● {selectedDressDossier.estado || 'DISPONIBLE'}
                       </span>
                    </div>
                 </div>

                 {/* Content Area */}
                 <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-[#f8fafc]">
                    <DressPhotos dress={selectedDressDossier} canEdit={canEditSavedRecords(user, userPermissions)} onSaved={(patch) => { setSelectedDressDossier((d: Record<string, unknown>) => ({ ...d, ...patch })); setVestidos(prev => prev.map(v => v.id === selectedDressDossier.id ? { ...v, ...patch } : v)); }} />
                    
                    {/* Atributos Quick View */}
                    <div className="grid grid-cols-4 gap-3 mb-8">
                       {[
                         { label: 'Talla', val: selectedDressDossier.talla || 'N/A', icon: LayoutGrid, color: 'indigo' },
                         { label: 'Color', val: selectedDressDossier.color || 'N/A', icon: Filter, color: 'rose' },
                         { label: 'Sede', val: selectedDressDossier.sede?.nombre || 'N/A', icon: MapPin, color: 'amber' },
                         { label: 'Garantía', val: '$0', icon: ShieldAlert, color: 'gray' }
                       ].map((atr, i) => (
                         <div key={i} className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm text-center shadow-indigo-100/10 hover:shadow-md transition-shadow">
                            <div className={`p-1.5 bg-${atr.color}-50 text-${atr.color}-500 rounded-lg w-fit mx-auto mb-2`}>
                               <atr.icon size={14} />
                            </div>
                            <p className="text-[8px] font-black text-gray-400 uppercase tracking-tighter mb-0.5">{atr.label}</p>
                            <p className="text-[11px] font-black text-gray-900 truncate">{atr.val}</p>
                         </div>
                       ))}
                    </div>

                    {/* Tabs Navigation */}
                    <div className="flex items-center gap-1 bg-gray-200/50 p-1 rounded-2xl mb-6 shadow-inner border border-gray-100 font-black text-[10px] uppercase tracking-tighter overflow-x-auto">
                       {[
                         { id: 'alquileres', label: 'Alquileres', icon: ListIcon },
                         { id: 'mantenimiento', label: 'Mantenimiento', icon: Package },
                         { id: 'estadisticas', label: 'Estadísticas', icon: TrendingUp },
                         { id: 'traslados', label: 'Traslados', icon: ArrowLeftRight }
                       ].map(t => (
                         <button 
                           key={t.id}
                           onClick={() => setActiveDossierTab(t.id as any)}
                           className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all ${
                             activeDossierTab === t.id ? 'bg-white text-rose-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                           }`}
                         >
                           <t.icon size={14} /> {t.label}
                         </button>
                       ))}
                    </div>

                    {/* Tab Content */}
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                       {dossierLoading ? (
                         <div className="py-20 flex flex-col items-center gap-4 text-gray-400">
                            <Loader2 className="w-10 h-10 animate-spin text-rose-500" />
                            <p className="font-black text-[10px] uppercase tracking-[0.3em]">Sincronizando Hoja de Vida...</p>
                         </div>
                       ) : (
                         <>
                           {activeDossierTab === 'alquileres' && (
                             <div className="space-y-4">
                                {dossierRentals.length === 0 ? (
                                   <div className="py-12 text-center bg-white rounded-3xl border border-dashed border-gray-200">
                                      <p className="text-gray-400 font-bold text-xs">Aún no tiene historial de alquileres registrados.</p>
                                   </div>
                                ) : (
                                  dossierRentals.map((r, i) => {
                                    const c = r.contratos;
                                    return (
                                      <div key={i} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-start gap-4 group hover:border-rose-100 transition-colors">
                                         <div className="p-3 bg-rose-50 text-rose-500 rounded-2xl group-hover:scale-110 transition-transform">
                                            <FileText size={18} />
                                         </div>
                                         <div className="flex-1">
                                            <div className="flex justify-between items-start mb-1">
                                               <h4 className="font-black text-gray-900 text-sm tracking-tight">{c?.numero_contrato || 'CTR-N/A'}</h4>
                                               <span className="text-[10px] font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded uppercase tracking-widest">{c?.estado || 'S/E'}</span>
                                            </div>
                                            <p className="text-[11px] font-bold text-gray-600 mb-2">{c?.cliente_nombre || 'Cliente Final'}</p>
                                            <div className="flex items-center gap-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">
                                               <span className="flex items-center gap-1"><MapPin size={10} /> {c?.fecha_evento ? new Date(c.fecha_evento).toLocaleDateString() : 'N/A'}</span>
                                               <span className="flex items-center gap-1"><ArrowLeftRight size={10} /> Salida: {c?.fecha_entrega_envio ? new Date(c.fecha_entrega_envio).toLocaleDateString() : 'N/A'}</span>
                                            </div>
                                         </div>
                                      </div>
                                    );
                                  })
                                )}
                             </div>
                           )}

                           {activeDossierTab === 'mantenimiento' && (
                             <div className="space-y-4">
                                {dossierMaintenance.length === 0 ? (
                                   <div className="py-12 text-center bg-white rounded-3xl border border-dashed border-gray-200">
                                      <p className="text-gray-400 font-bold text-xs">Sin registros de intervenciones técnicas.</p>
                                   </div>
                                ) : (
                                  dossierMaintenance.map((m, i) => (
                                    <div key={i} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-start gap-4">
                                       <div className={`p-3 rounded-2xl ${m.tipo === 'LAVANDERÍA' ? 'bg-blue-50 text-blue-500' : 'bg-amber-50 text-amber-500'}`}>
                                          <Package size={18} />
                                       </div>
                                       <div className="flex-1 text-sm">
                                          <div className="flex justify-between mb-1">
                                             <span className="font-black text-gray-900 uppercase tracking-tighter">{m.tipo}</span>
                                             <span className="text-[9px] text-gray-400 font-bold">{new Date(m.created_at).toLocaleDateString()}</span>
                                          </div>
                                          <p className="text-[11px] text-gray-500 font-bold opacity-80 uppercase tracking-widest mb-2 leading-tight">Estado: {m.estado}</p>
                                          <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 italic text-[10px] text-gray-600">
                                             "{m.detalle || 'Mantenimiento preventivo estándar sin anotaciones adicionales.'}"
                                          </div>
                                       </div>
                                    </div>
                                  ))
                                )}
                             </div>
                           )}

                           {activeDossierTab === 'traslados' && (
                             <div className="space-y-4">
                                {dossierTransfers.length === 0 ? (
                                   <div className="py-12 text-center bg-white rounded-3xl border border-dashed border-gray-200">
                                      <p className="text-gray-400 font-bold text-xs">Sin registros de traslados.</p>
                                   </div>
                                ) : (
                                  dossierTransfers.map((t, i) => {
                                    const origen = sedes.find(s => s.id === t.sede_origen_id)?.nombre || 'Desconocido';
                                    const destino = sedes.find(s => s.id === t.sede_destino_id)?.nombre || 'Desconocido';
                                    return (
                                      <div key={i} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-start gap-4">
                                         <div className="p-3 bg-amber-50 text-amber-500 rounded-2xl">
                                            <ArrowLeftRight size={18} />
                                         </div>
                                         <div className="flex-1 text-sm">
                                            <div className="flex justify-between mb-1">
                                               <span className="font-black text-gray-900 uppercase tracking-tighter">
                                                  {origen} ➔ {destino}
                                               </span>
                                               <span className="text-[9px] text-gray-400 font-bold">{new Date(t.created_at).toLocaleDateString()}</span>
                                            </div>
                                            <p className="text-[11px] text-gray-500 font-bold opacity-80 uppercase tracking-widest mb-1 leading-tight">
                                               Realizado por: <span className="text-gray-800">{profilesList.find(p => p.id === t.realizado_por)?.nombre || t.realizado_por}</span> | Aut: <span className="text-gray-800">{profilesList.find(p => p.id === t.autorizado_por)?.nombre || t.autorizado_por}</span>
                                            </p>
                                            <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 italic text-[10px] text-gray-600">
                                               "{t.motivo}"
                                            </div>
                                         </div>
                                      </div>
                                    );
                                  })
                                )}
                             </div>
                           )}

                           {activeDossierTab === 'estadisticas' && (
                             <div className="grid grid-cols-1 gap-4">
                                <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-8 rounded-[2.5rem] text-white shadow-xl shadow-emerald-100 relative overflow-hidden group">
                                   <div className="absolute top-0 right-0 opacity-10 -translate-y-4 translate-x-4"><TrendingUp size={120} /></div>
                                   <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-80 mb-4">Total Alquileres Confirmados</p>
                                   <h3 className="text-6xl font-black tracking-tighter mb-2">{dossierStats?.total_alquileres || 0}</h3>
                                   <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest bg-white/20 w-fit px-4 py-1 rounded-full">
                                      <TrendingUp size={12} /> Alta Rotación Comercial
                                   </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                   <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm text-center">
                                      <div className="p-3 bg-rose-50 text-rose-500 rounded-2xl w-fit mx-auto mb-4">
                                         <TrendingUp size={20} />
                                      </div>
                                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">ROI Estidmado</p>
                                      <h4 className="text-2xl font-black text-gray-900 leading-none">HIGH</h4>
                                      <p className="text-[8px] text-emerald-500 font-black mt-2 tracking-widest uppercase">Activo Rentable</p>
                                   </div>
                                   <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm text-center">
                                      <div className="p-3 bg-amber-50 text-amber-500 rounded-2xl w-fit mx-auto mb-4">
                                         <ArrowLeftRight size={20} />
                                      </div>
                                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Días en Taller</p>
                                      <h4 className="text-2xl font-black text-gray-900 leading-none">{dossierMaintenance.length * 3}d</h4>
                                      <p className="text-[8px] text-gray-400 font-bold mt-2 tracking-widest uppercase">Acumulado Anual</p>
                                   </div>
                                </div>
                             </div>
                           )}
                         </>
                       )}
                    </div>
                 </div>

                 {/* Footer Action */}
                 <div className="p-8 border-t border-gray-100 bg-white">
                    <button 
                      onClick={() => setDossierOpen(false)}
                      className="w-full py-5 bg-gray-900 text-white rounded-2xl font-black text-sm uppercase tracking-[0.3em] shadow-xl hover:bg-black transition-all active:scale-95"
                    >
                      Cerrar Expediente
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

    </div>
  );
}


/** Dress code: uppercase letters, numbers and dashes only (no spaces or descriptions). */
function cleanDressCode(v: string) { return v.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20); }
/** Required fields of a new dress, in the form order. */
function dressMissing(d: { codigo: string; clasificacion_id: string; nombre: string; talla: string; color: string; precio: string; sede_actual_id: string }) {
  return ([['Código', d.codigo.length >= 2], ['Clasificación', !!d.clasificacion_id], ['Nombre', d.nombre.trim().length >= 3], ['Talla', !!d.talla.trim()], ['Color', !!d.color.trim()], ['Precio de alquiler', Number(d.precio) > 0], ['Sede base', !!d.sede_actual_id]] as [string, boolean][]).filter(([, ok]) => !ok).map(([l]) => l);
}

type EditableDress = { id: number; codigo: string; nombre: string | null; clasificacion_id: number | null; talla: string | null; color: string | null; precio_sugerido: number | null; precio_venta?: number | null };
/** Edit every data field of an existing dress (same rules as a new one; sede and estado keep their own flows). */
function EditDressModal({ dress, clasificaciones, onClose, onSaved }: { dress: EditableDress; clasificaciones: { id: number; nombre: string; activo: boolean }[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ codigo: dress.codigo.trim(), clasificacion_id: dress.clasificacion_id ? String(dress.clasificacion_id) : '', nombre: dress.nombre || '', talla: dress.talla || '', color: dress.color || '', precio: dress.precio_sugerido ? String(dress.precio_sugerido) : '', precio_venta: dress.precio_venta ? String(dress.precio_venta) : '', sede_actual_id: 'x' });
  const [saving, setSaving] = useState(false);
  const faltan = dressMissing(f);
  const save = async () => {
    if (faltan.length) { toast.error(`Completa: ${faltan.join(', ')}.`); return; }
    if (f.codigo !== dress.codigo && !window.confirm(`¿Cambiar el código ${dress.codigo} por ${f.codigo}? Cambia también la etiqueta física del vestido.`)) return;
    setSaving(true);
    const changes: Record<string, unknown> = {};
    if (f.codigo !== dress.codigo) changes.codigo = f.codigo;
    if (f.nombre.trim() !== (dress.nombre || '')) changes.nombre = f.nombre.trim();
    if (Number(f.clasificacion_id) !== dress.clasificacion_id) changes.clasificacion_id = Number(f.clasificacion_id);
    if (f.talla.trim().toUpperCase() !== (dress.talla || '')) changes.talla = f.talla;
    if (f.color.trim().toUpperCase() !== (dress.color || '')) changes.color = f.color;
    if (Number(f.precio) !== Number(dress.precio_sugerido || 0)) changes.precio_sugerido = Number(f.precio);
    if ((f.precio_venta ? Number(f.precio_venta) : null) !== (dress.precio_venta ?? null)) changes.precio_venta = f.precio_venta ? Number(f.precio_venta) : null;
    if (!Object.keys(changes).length) { setSaving(false); onClose(); return; }
    const { error } = await supabase.from('vestidos').update(changes).eq('id', dress.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Vestido actualizado 💎');
    onSaved();
  };
  const input = 'w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-rose-200 font-bold text-gray-700 outline-none';
  const label = 'text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1';
  return <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-white rounded-3xl w-full max-w-lg p-8 space-y-4 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
      <h2 className="text-xl font-black text-gray-900 uppercase">Editar vestido {dress.codigo}</h2>
      <div className="grid grid-cols-2 gap-4">
        <label className={label}>1. Código *<input className={input} value={f.codigo} onChange={(e) => setF({ ...f, codigo: cleanDressCode(e.target.value) })} /></label>
        <label className={label}>2. Clasificación *<select className={input} value={f.clasificacion_id} onChange={(e) => setF({ ...f, clasificacion_id: e.target.value })}><option value="">Selecciona...</option>{clasificaciones.filter(c => c.activo || String(c.id) === f.clasificacion_id).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
      </div>
      <label className={label}>3. Nombre / Descripción *<input className={input} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></label>
      <div className="grid grid-cols-3 gap-4">
        <label className={label}>4. Talla *<input className={input} value={f.talla} onChange={(e) => setF({ ...f, talla: e.target.value.toUpperCase() })} /></label>
        <label className={label}>5. Color *<input className={input} value={f.color} onChange={(e) => setF({ ...f, color: e.target.value.toUpperCase() })} /></label>
        <label className={label}>6. Precio de alquiler *<input type="number" min="1" className={input} value={f.precio} onChange={(e) => setF({ ...f, precio: e.target.value })} /></label>
        <label className={label}>Precio de venta sugerido<input type="number" min="1" placeholder="Opcional" className={input} value={f.precio_venta} onChange={(e) => setF({ ...f, precio_venta: e.target.value })} /></label>
      </div>
      <p className="text-[11px] text-gray-400">La sede se cambia con la lista «Sede actual» de la fila (traslado) y el estado con sus botones de siempre.</p>
      <div className="flex gap-3 justify-end"><button onClick={onClose} disabled={saving} className="px-5 py-3 rounded-xl border font-bold text-sm">Cancelar</button>
        <button onClick={() => void save()} disabled={saving || faltan.length > 0} className="px-5 py-3 rounded-xl bg-rose-500 text-white font-black text-sm disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar'}</button></div>
    </div>
  </div>;
}

const PHOTO_SLOTS = [['foto_frente', 'Frente'], ['foto_espalda', 'Espalda'], ['foto_detalle', 'Detalle']] as const;
/** Resizes to max 1600 px JPEG so photos stay light. */
async function resizePhoto(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return await new Promise((ok, fail) => canvas.toBlob(b => b ? ok(b) : fail(new Error('No se pudo procesar la foto.')), 'image/jpeg', 0.82));
}
/** Catalog step 2: three photos per dress (front, back, detail); the front one is the list image. */
function DressPhotos({ dress, canEdit, onSaved }: { dress: Record<string, unknown>; canEdit: boolean; onSaved: (patch: Record<string, string>) => void }) {
  const [busy, setBusy] = useState('');
  const upload = async (field: string, file?: File) => {
    if (!file) return;
    setBusy(field);
    try {
      const path = `${dress.id}/${field}-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('vestidos_fotos').upload(path, await resizePhoto(file), { contentType: 'image/jpeg' });
      if (error) throw error;
      const url = supabase.storage.from('vestidos_fotos').getPublicUrl(path).data.publicUrl;
      const patch: Record<string, string> = { [field]: url, ...(field === 'foto_frente' ? { imagen_url: url } : {}) };
      const { error: e2 } = await supabase.from('vestidos').update(patch).eq('id', dress.id);
      if (e2) throw e2;
      onSaved(patch); toast.success('Foto guardada');
    } catch (e) { toast.error(e instanceof Error ? e.message : (e as { message?: string })?.message || 'No se pudo subir la foto.'); } finally { setBusy(''); }
  };
  return (
    <div className="grid grid-cols-3 gap-3 mb-8">
      {PHOTO_SLOTS.map(([field, label]) => (
        <label key={field} className={`relative block aspect-[3/4] rounded-2xl border-2 border-dashed border-gray-200 bg-white overflow-hidden ${canEdit ? 'cursor-pointer hover:border-rose-300' : ''}`}>
          {dress[field] ? <img src={String(dress[field])} alt={label} className="w-full h-full object-cover" /> : <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-gray-400 uppercase">{busy === field ? 'Subiendo…' : canEdit ? `Subir ${label}` : 'Sin foto'}</span>}
          <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] font-black uppercase tracking-widest text-center py-1">{busy === field ? 'Subiendo…' : label}</span>
          {canEdit && <input type="file" accept="image/*" className="hidden" disabled={!!busy} onChange={e => void upload(field, e.target.files?.[0])} />}
        </label>
      ))}
    </div>
  );
}
