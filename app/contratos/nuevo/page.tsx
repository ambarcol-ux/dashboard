'use client';
import { isRetiredDress } from '@/lib/inventory';
import PaymentSupportUpload from '@/components/PaymentSupportUpload';
import type { UploadedSupport } from '@/lib/payment-support';
import {canEditSavedRecords} from '@/lib/saved-record-editing';

import PreXvFields from '@/components/PreXvFields';
import { generateBlockedRanges, rangesOverlap } from '@/lib/availability';
import { initialDepositAmount } from '@/lib/initial-deposit';
import { contractSuggestedDeposit } from '@/lib/deposit-rules';
import ContractAllyMode, { ALLY_DISCOUNT, EMPTY_ALLY_MODE, allyModeError, allyModePayload, type ContractAllyModeValue } from '@/components/ContractAllyMode';
import ContractRetabloSection, { EMPTY_CONTRACT_RETABLO, retabloError, saveContractRetablo, type ContractRetabloValue } from '@/components/retablos/ContractRetabloSection';
import { type PrexvData } from '@/lib/prexv';
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { requireInvoice, INVOICE_REQUIRED_MESSAGE } from '@/lib/invoice-validation';
import { Toaster, toast } from 'sonner';
import {
  Save, User, Calendar, DollarSign, MapPin, Phone, Mail,
  FileText, Briefcase, Camera, Scissors, ShieldCheck, Tag, Plus, Trash2, CheckCircle2, Loader2, AlertTriangle, Clock,
  ChevronLeft, XCircle
} from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function NuevoContratoPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingContractId, setEditingContractId] = useState<string | null>(null);
  const [editingContractNumber, setEditingContractNumber] = useState<string>('');
  const [editingContractState, setEditingContractState] = useState<string>('');
  const [editingSnapshot, setEditingSnapshot] = useState<any>(null);
  const [loadingEditContract, setLoadingEditContract] = useState(false);
  const isEditMode = Boolean(editingContractId);
  const [firstVisit,setFirstVisit]=useState<any>(null);
  const [firstVisitError,setFirstVisitError]=useState('');
  const [firstVisitLoading,setFirstVisitLoading]=useState(false);

  useEffect(() => {
    setMounted(true);
    const id = new URLSearchParams(window.location.search).get('editar');
    if (id) setEditingContractId(id);
  }, []);
  const [sedesList, setSedesList] = useState<any[]>([]);
  const [alistamientoData, setAlistamientoData] = useState<any>(null);
  const [isSubmittingException, setIsSubmittingException] = useState(false);

  // -- New States for Conflict Logic --
  const [conflictSeverity, setConflictSeverity] = useState<'red' | 'yellow' | null>(null);
  const [conflictType, setConflictType] = useState<'preparacion' | 'logistica' | null>(null);
  const [conflictDays, setConflictDays] = useState<number>(5);
  const [conflictDressCode, setConflictDressCode] = useState('');
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [showYellowModal, setShowYellowModal] = useState(false);

  // -- New States for Cross-Branch & Pricing --
  const [userRole, setUserRole] = useState<string>('user');
  const [motivoValores, setMotivoValores] = useState('');
  // Owner/admin may correct the initial payment and deposit of a signed contract (with reason and history).
  const canFixInitial = isEditMode && String(userRole).toLowerCase() === 'admin' && !['borrador','pendiente_admin'].includes(String(editingContractState).toLowerCase());
  const [crossBranchWarning, setCrossBranchWarning] = useState<{ active: boolean; origin: string; codigo: string }>({ active: false, origin: '', codigo: '' });
  const [adminAuthorizedTransfer, setAdminAuthorizedTransfer] = useState(false);

  // -- VIP Discount State --
  const [vipCodeInput, setVipCodeInput] = useState('');
  const [vipStatus, setVipStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [vipMessage, setVipMessage] = useState('');
  const [vipDiscount, setVipDiscount] = useState(0);
  const [vipAliado, setVipAliado] = useState('');

  // -- State Principal --
  const [formData, setFormData] = useState({
    // Básicos
    numero_factura: '',
    sede: '',
    sede_id: '',
    asesora: '',
    asesora_id: '',
    cliente_nombre: '',
    cliente_documento: '',
    whatsapp: '',
    cliente_email: '',
    direccion: '',
    quinceanera_name: '',

    // Logística
    tipo_evento: 'Evento', // Evento | PreXV | Ambos
    fecha_evento: '',
    fecha_fotografia: '',
    fecha_maquillaje: '',
    incluye_retablo: false,
    incluye_book: false,
    cita_medidas: '',
    prueba_final: '',
    fecha_entrega: '',
    tipo_entrega: 'Local', // Local | Nacional

    // Finanzas
    valor_total: '',
    servicios_adicionales: '',
    anticipo: '',

    // Depósito
    valor_deposito: '',
    deposito_banco: '',
    deposito_tipo_cuenta: '',
    deposito_numero: '',
    deposito_titular: '',
    autoriza_uso_imagen: false
  });

  const [prexv, setPrexv] = useState<PrexvData>({ prexv_componentes: [] });
  const [retablo, setRetablo] = useState<ContractRetabloValue>(EMPTY_CONTRACT_RETABLO);
  const [hadRetablo, setHadRetablo] = useState(false);
  const [aliadoModo, setAliadoModo] = useState<ContractAllyModeValue>(EMPTY_ALLY_MODE);
  const valorAlquilerNum = parseFloat(String(formData.valor_total).replace(/[^0-9.-]+/g, '')) || 0;
  // Aliado: 5% discount only on the dress line (rental value).
  const descuentoAliado = aliadoModo.tiene ? Math.round(valorAlquilerNum * ALLY_DISCOUNT) : 0;
  const aliadoModoError = () => isEditMode ? (aliadoModo.tiene && !aliadoModo.aliado ? 'En modo Aliado busca y carga el aliado.' : null)
    : allyModeError(aliadoModo, Math.max(0, valorAlquilerNum - vipDiscount - descuentoAliado) + (parseFloat(String(formData.servicios_adicionales).replace(/[^0-9.-]+/g, '')) || 0), parseFloat(String(formData.anticipo).replace(/[^0-9.-]+/g, '')) || 0);
  const sendAllyMeasures = async (contratoId: string) => {
    if (!aliadoModo.tiene) return;
    const { data: s } = await supabase.auth.getSession();
    const r = await fetch('/api/aliados/medidas', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token || ''}` }, body: JSON.stringify({ accion: 'crear', contrato_id: contratoId }) }).catch(() => null);
    if (!r?.ok) toast.error('El contrato se guardó, pero no se pudo enviar al aliado el enlace de medidas. Reenvíalo desde Aliados Directos › Medidas.');
  };
  const syncRetablo = async (contractId: string) => {
    const err = await saveContractRetablo(contractId, retablo, hadRetablo);
    if (err) toast.error(`El contrato se guardó, pero el retablo no se registró: ${err}`);
  };
  const prexvPayload = () => ({
    ...prexv,
    fecha_pre_xv: formData.fecha_fotografia || null,
    ...(isEditMode ? {} : {
      prexv_fotografo_agendado: false,
      prexv_maquilladora_agendada: false,
      prexv_locacion_confirmada: false
    })
  });

  // Items Multi-Vestido
  const [vestidos, setVestidos] = useState<{ vestido_id: string | null; referencia: string; tipo: string; observaciones: string }[]>([
    { vestido_id: null, referencia: '', tipo: 'XV', observaciones: '' }
  ]);

  const [bloqueoEspecial, setBloqueoEspecial] = useState<{
    vestido_id: string | null;
    referencia: string;
    fecha: string;
  }>({
    vestido_id: null,
    referencia: '',
    fecha: ''
  });

  const [fechasBloqueoEspecial, setFechasBloqueoEspecial] = useState<string[]>([]);
  const addFechaBloqueoEspecial = () => setFechasBloqueoEspecial(prev => [...prev, '']);
  const updateFechaBloqueoEspecial = (idx: number, value: string) =>
    setFechasBloqueoEspecial(prev => prev.map((fecha, i) => i === idx ? value : fecha));
  const removeFechaBloqueoEspecial = (idx: number) =>
    setFechasBloqueoEspecial(prev => prev.filter((_, i) => i !== idx));

  const [accesoriosSeleccionados, setAccesoriosSeleccionados] = useState<string[]>([]);
  const opcionesAccesorios = ["Tiara", "Corbatín", "Corbata", "Pañuelo", "Velo/Mantilla", "Aro/Gitana"];

  const [metodosPago, setMetodosPago] = useState<string[]>([]);
  const [anticipoSoportes, setAnticipoSoportes] = useState<UploadedSupport[]>([]);
  const [subiendoSoporte, setSubiendoSoporte] = useState(false);
  const opcionesPago = ["Efectivo", "Transferencia", "Tarjeta", "Link de Pago"];

  // Arreglos dinámicos
  const [arreglos, setArreglos] = useState<{ tipo: string; cm: string; precio: string }[]>([]);

  // Totales Calculados
  const [totalArreglos, setTotalArreglos] = useState(0);
  const [saldoCalc, setSaldoCalc] = useState(0);

  // Catálogo Global
  const [vestidosMaestro, setVestidosMaestro] = useState<any[]>([]);
  const [clasificaciones, setClasificaciones] = useState<{ id: number; nombre: string }[]>([]);
  useEffect(() => {
    void supabase.from('clasificaciones_vestido').select('id, nombre').then(({ data }) => setClasificaciones(data || []));
  }, []);
  const [loadingVestidos, setLoadingVestidos] = useState(false);
  const [asesorasList, setAsesorasList] = useState<any[]>([]);
  const [asesorasFiltradas, setAsesorasFiltradas] = useState<any[]>([]);
  const [busyVestidoIds, setBusyVestidoIds] = useState<Set<string>>(new Set());

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search),id=params.get('primeraCita');
    if(!id||params.has('editar')||!sedesList.length)return;
    let live=true;setFirstVisitLoading(true);
    void (async()=>{
      const {data:c,error}=await supabase.from('primeras_citas').select('id,sede_id,cliente_nombre,telefono,email,estado').eq('id',id).single();
      if(error||!c)throw new Error('No puedes acceder a esta primera cita. Vuelve al Calendario.');
      if(!['asistio','seguimiento'].includes(c.estado))throw new Error('Registra primero la atención de la cita en Calendario.');
      const {data:existing,error:ce}=await supabase.from('contratos').select('id').eq('primera_cita_id',id).maybeSingle();
      if(ce)throw new Error('No se pudo verificar si la cita ya tiene contrato.');
      if(existing)throw new Error('Esta cita ya tiene un contrato. Ábrelo desde Calendario.');
      const site=sedesList.find(s=>s.id===c.sede_id);if(!site)throw new Error('La sede de la cita no está disponible.');
      if(live){setFirstVisit(c);setFormData(prev=>({...prev,cliente_nombre:c.cliente_nombre,whatsapp:c.telefono,cliente_email:c.email||'',sede_id:site.id,sede:site.nombre}));}
    })().catch(e=>{if(live)setFirstVisitError(e.message);}).finally(()=>{if(live)setFirstVisitLoading(false);});
    return()=>{live=false;};
  },[sedesList]);
  const assertFirstVisitReady=()=>{
    if(!isEditMode&&new URLSearchParams(window.location.search).has('primeraCita')){
      if(!firstVisit||firstVisitLoading||firstVisitError)throw new Error(firstVisitError||'Espera a que se cargue la primera cita.');
      if(formData.sede_id!==firstVisit.sede_id)throw new Error('El contrato debe conservar la sede de la primera cita.');
    }
  };

  // -- Helper de UX: Confirmación al Salir --
  const isFormDirty = () => {
    return !!(
      formData.numero_factura ||
      formData.cliente_nombre ||
      formData.cliente_documento ||
      formData.whatsapp ||
      vestidos[0].referencia ||
      bloqueoEspecial.referencia ||
      bloqueoEspecial.fecha ||
      fechasBloqueoEspecial.some(Boolean) ||
      formData.valor_total
    );
  };

  const handleBack = () => {
    if (isFormDirty()) {
      if (window.confirm('⚠️ ¿Seguro que quieres salir? Tienes datos ingresados y se perderán si no los has guardado.')) {
        router.push('/dashboard');
      }
    } else {
      router.push('/dashboard');
    }
  };

  // -- Efectos --

  useEffect(() => {
    const fetchSedesYAsesoras = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();

        let userProfile = null;
        if (user) {
          const { data: pData } = await supabase
            .from('profiles')
            .select('id, email, rol, nombre, sede_id')
            .eq('id', user.id)
            .maybeSingle();
          userProfile = pData;
          if (pData?.rol) setUserRole(pData.rol);
        }

        const { data: sedes, error } = await supabase.from('sedes').select('*').eq('activo', true).order('nombre');
        if (!error && sedes) {
          setSedesList(sedes);

          // Auto-seleccionamos la sede si el perfil la tiene
          const editingFromUrl = new URLSearchParams(window.location.search).has('editar');
          if (userProfile?.sede_id && !editingFromUrl) {
            const mySede = sedes.find(s => s.id === userProfile.sede_id);
            if (mySede) {
              setFormData(prev => ({ ...prev, sede_id: mySede.id, sede: mySede.nombre }));
            }
          }
        }

        const { data: catAsesoras, error: aError } = await supabase.from('asesoras').select('*, sedes(nombre)').eq('activo', true).order('nombre_completo');
        if (aError) {
          console.error('[DATABASE ERROR] Asesoras:', aError.message, aError.details);
        } else if (catAsesoras) {
          setAsesorasList(catAsesoras);
        }

      } catch (err: any) {
        console.error('Error cargando catálogos:', err?.message || err);
      }
    };
    fetchSedesYAsesoras();
  }, []);

  // -- Carga del contrato existente en la MISMA pantalla de creación --
  useEffect(() => {
    if (!editingContractId) return;

    const loadExistingContract = async () => {
      setLoadingEditContract(true);
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) throw new Error('Debes iniciar sesión nuevamente.');

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('rol, activo')
          .eq('id', user.id)
          .single();

        if (profileError || !profile || profile.activo === false || !canEditSavedRecords({...profile,id:user.id})) {
          toast.error('Solo un administrador puede editar un contrato pactado.');
          router.replace('/dashboard');
          return;
        }

        setUserRole(profile.rol);

        const { data: contract, error } = await supabase
          .from('contratos')
          .select(`
            *,
            items:contrato_items_vestidos(
              id, vestido_id, tipo_uso, tipo, observaciones,
              vestido:vestidos(id,codigo,nombre,estado,sede_actual_id)
            ),
            arreglos(*)
          `)
          .eq('id', editingContractId)
          .single();

        if (error || !contract) throw error || new Error('Contrato no encontrado.');

        setEditingContractNumber(contract.numero_contrato || '');
        setEditingContractState(contract.estado || '');
        setEditingSnapshot(contract);

        setFormData({
          numero_factura: contract.numero_factura || '',
          sede: contract.sede || '',
          sede_id: contract.sede_id || '',
          asesora: contract.asesora || '',
          asesora_id: contract.asesora_id || '',
          cliente_nombre: contract.cliente_nombre || '',
          cliente_documento: contract.cliente_documento || '',
          whatsapp: contract.cliente_whatsapp || '',
          cliente_email: contract.cliente_email || '',
          direccion: contract.cliente_direccion || '',
          quinceanera_name: contract.quinceanera_name || '',
          tipo_evento: contract.tipo_evento || 'Evento',
          fecha_evento: contract.fecha_evento || '',
          fecha_fotografia: contract.fecha_pre_xv || '',
          fecha_maquillaje: contract.fecha_maquillaje ? String(contract.fecha_maquillaje).slice(0,10) : '',
          incluye_retablo: false,
          incluye_book: false,
          cita_medidas: contract.fecha_cita_medidas || '',
          prueba_final: contract.fecha_prueba_final || '',
          fecha_entrega: contract.fecha_entrega_envio || '',
          tipo_entrega: contract.tipo_entrega || 'Local',
          valor_total: contract.valor_total == null ? '' : String(contract.valor_total),
          servicios_adicionales: '',
          anticipo: contract.anticipo == null ? '' : String(contract.anticipo),
          valor_deposito: contract.valor_deposito == null ? '' : String(contract.valor_deposito),
          deposito_banco: contract.banco_deposito || '',
          deposito_tipo_cuenta: contract.tipo_cuenta_deposito || '',
          deposito_numero: contract.numero_cuenta_deposito || '',
          deposito_titular: contract.titular_cuenta_deposito || '',
          autoriza_uso_imagen: Boolean(contract.autoriza_uso_imagen)
        });
        if (contract.tiene_aliado && contract.aliado_id) {
          const d = contract.aliado_datos || {};
          const { data: cl } = contract.aliado_clienta_id ? await supabase.from('aliado_clientas').select('*').eq('id', contract.aliado_clienta_id).maybeSingle() : { data: null };
          setAliadoModo({ tiene: true, aliado: { id: contract.aliado_id, nombre: d.nombre || '', cedula: d.cedula || '', codigo: d.codigo || null, celular: d.celular || '', correo: d.correo || '', direccion: d.direccion || '', tipo: d.tipo || '' }, clienta: cl, categoria: contract.categoria_aliado || cl?.categoria || '' });
        }

        setPrexv({
          prexv_componentes: contract.prexv_componentes || [],
          prexv_fotografo: contract.prexv_fotografo || '',
          prexv_maquilladora: contract.prexv_maquilladora || '',
          prexv_locacion: contract.prexv_locacion || '',
          prexv_fotografo_agendado: Boolean(contract.prexv_fotografo_agendado),
          prexv_maquilladora_agendada: Boolean(contract.prexv_maquilladora_agendada),
          prexv_locacion_confirmada: Boolean(contract.prexv_locacion_confirmada),
          fecha_pre_xv: contract.fecha_pre_xv || null,
          fecha_fotografia: contract.fecha_fotografia || null,
          fecha_maquillaje: contract.fecha_maquillaje || null,
          tipo_evento: contract.tipo_evento || null
        });

        const contractItems = Array.isArray(contract.items) ? contract.items : [];
        setVestidos(
          contractItems.length
            ? contractItems.map((item: any) => ({
                vestido_id: item.vestido_id || item.vestido?.id || null,
                referencia: item.vestido?.codigo || '',
                tipo: item.tipo_uso || item.tipo || 'XV',
                observaciones: item.observaciones || ''
              }))
            : [{
                vestido_id: contract.vestido_id || null,
                referencia: '',
                tipo: 'XV',
                observaciones: contract.observaciones_vestido || ''
              }]
        );

        setAccesoriosSeleccionados(Array.isArray(contract.accesorios) ? contract.accesorios : []);
        setMetodosPago(Array.isArray(contract.metodos_pago) ? contract.metodos_pago : []);
        setFechasBloqueoEspecial(Array.isArray(contract.fechas_bloqueo_especial) ? contract.fechas_bloqueo_especial : []);
        setBloqueoEspecial({
          vestido_id: contract.bloqueo_especial_vestido_id || null,
          referencia: contract.bloqueo_especial_referencia || '',
          fecha: contract.bloqueo_especial_fecha || ''
        });

        setArreglos(
          Array.isArray(contract.arreglos)
            ? contract.arreglos.map((a: any) => ({
                tipo: a.tipo_arreglo || a.tipo || '',
                cm: a.centimetros || a.cm || '',
                precio: a.precio == null ? '' : String(a.precio)
              }))
            : []
        );

        setVipCodeInput('');
        setVipDiscount(0);
        setVipStatus('idle');
      } catch (err: any) {
        console.error('Error cargando contrato para edición:', err);
        toast.error(err?.message || 'No se pudo cargar el contrato para edición.');
        router.replace('/dashboard');
      } finally {
        setLoadingEditContract(false);
      }
    };

    void loadExistingContract();
  }, [editingContractId, router]);

  // -- Fetch Vestidos Dinámico por Sede --
  useEffect(() => {
    if (!formData.sede_id) {
      setVestidosMaestro([]);
      setLoadingVestidos(false);
      return;
    }

    const fetchVestidosSede = async () => {
      setLoadingVestidos(true);
      try {
        const selectedSedeId = formData.sede_id;
        console.log('Filtrando vestidos activos globally para Typeahead de Sede:', selectedSedeId);

        // Buscador global de emergencia para contratos
        const { data, error } = await supabase
          .from('vestidos')
          .select('*, sedes(nombre), stock_total, precio_sugerido')
          .in('estado', ['Disponible', 'Mantenimiento', 'disponible', 'mantenimiento'])
          .eq('archivado', false);

        if (error) {
          console.error('[DATABASE ERROR] Vestidos:', error.message, error.details);
          throw error;
        }

        console.log('Vestidos encontrados para esta sede:', data?.length || 0);
        setVestidosMaestro(data || []);
      } catch (err: any) {
        console.error('[CRASH] fetchVestidosSede:', err?.message || err);
        setVestidosMaestro([]);
      } finally {
        console.log('[DEBUG] Finalizando carga de vestidos');
        setLoadingVestidos(false);
      }
    };

    fetchVestidosSede();
  }, [formData.sede_id]);

  // -- Cascading Filter for Asesoras --
  useEffect(() => {
    if (formData.sede_id && asesorasList.length > 0) {
      console.log("[DEBUG CONTRATO] Sede Seleccionada ID:", formData.sede_id, "Primer asesora sede_id:", asesorasList[0]?.sede_id);
      const filtered = asesorasList.filter(a => a.sede_id === formData.sede_id);
      setAsesorasFiltradas(filtered);
      // Reset asesora if not in filtered list anymore
      if (formData.asesora_id && !filtered.find(a => a.id === formData.asesora_id)) {
        setFormData(prev => ({ ...prev, asesora_id: '', asesora: '' }));
      }
    } else if (!formData.sede_id) {
      setAsesorasFiltradas([]);
    }
  }, [formData.sede_id, asesorasList]);

  // -- Lógica de Disponibilidad Dinámica --
  // -- Helper de Lógica de Disponibilidad Inteligente --
  const parseSafeDate = (dateStr: string) => {
    if (!dateStr || !dateStr.includes('-')) return new Date().getTime();
    const [y, m, d] = dateStr.split('T')[0].split('-');
    return new Date(parseInt(y), parseInt(m) - 1, parseInt(d), 12, 0, 0).getTime();
  };

  const getMaintenanceDays = (tipoEvento: string) => {
    return (tipoEvento === 'PreXV' || tipoEvento === 'PREXV' || tipoEvento === 'Fotografía') ? 2 : 5;
  };

  const calculateDisponibilidadReal = (fechaEntrega: string, tipoEvento: string) => {
    if (!fechaEntrega) return null;
    const date = new Date(fechaEntrega);
    date.setDate(date.getDate() + getMaintenanceDays(tipoEvento));
    return date.toISOString().split('T')[0];
  };

  const getZoneSeverity = (pointTime: number, baseTime: number, tipoEvento?: string) => {
    const diffDays = Math.abs(Math.round((pointTime - baseTime) / (24 * 60 * 60 * 1000)));
    const diasRequeridos = (tipoEvento === 'PreXV' || tipoEvento === 'Fotografía') ? 2 : 5;

    if (diffDays < diasRequeridos) return 'red'; // Bloqueo Total
    if (diffDays <= (diasRequeridos === 2 ? 4 : 10)) return 'yellow'; // Zona de Permiso

    return null;
  };

  useEffect(() => {
    if (!formData.sede_id) return;
    if (!formData.fecha_evento && !formData.fecha_fotografia) {
      setBusyVestidoIds(new Set());
      return;
    }

    const checkAllAvailability = async () => {
      try {
        const requestedDates: Array<{ date: string; type: string }> = [];
        const mainType = formData.tipo_evento === 'PreXV' ? 'PreXV' : 'Evento';
        if (formData.fecha_evento) requestedDates.push({ date: formData.fecha_evento, type: mainType });
        if (formData.fecha_fotografia) requestedDates.push({ date: formData.fecha_fotografia, type: 'PreXV' });

        if (requestedDates.length === 0) return;

        let availabilityQuery = supabase
          .from('contrato_items_vestidos')
          .select('vestido_id, vestidos!inner(stock_total, estado), contratos!inner(id, numero_contrato, fecha_evento, fecha_pre_xv, fechas_bloqueo_especial, tipo_evento, tipo_entrega, estado, fecha_entrega_envio, fecha_disponibilidad_real)')
          .not('contratos.estado', 'in', '("cancelado","rechazado","CANCELADO","RECHAZADO","borrador","BORRADOR")');

        if (editingContractId) availabilityQuery = availabilityQuery.neq('contrato_id', editingContractId);

        const { data, error } = await availabilityQuery;

        if (error) {
          console.error('[CRASH] Error en checkAllAvailability:', error);
          throw error;
        }

        let specialLocksQuery = supabase
          .from('contratos')
          .select('id, numero_contrato, bloqueo_especial_vestido_id, bloqueo_especial_referencia, bloqueo_especial_fecha, estado')
          .not('estado', 'in', '("cancelado","anulado","rechazado","CANCELADO","ANULADO","RECHAZADO")')
          .not('bloqueo_especial_vestido_id', 'is', null)
          .not('bloqueo_especial_fecha', 'is', null);

        if (editingContractId) specialLocksQuery = specialLocksQuery.neq('id', editingContractId);

        const { data: specialLocks, error: specialLocksError } = await specialLocksQuery;

        if (specialLocksError) {
          console.error('[CRASH] Error consultando bloqueos especiales:', specialLocksError);
          throw specialLocksError;
        }

        // Mapa de conteo de conflictos por ID de vestido
        const conflictCounts: Record<string, number> = {};
        const stockTable: Record<string, number> = {};

        (data as any[]).forEach(item => {
          const c = item.contratos;
          const vInfo = item.vestidos;
          const vId = item.vestido_id;

          if (!stockTable[vId]) stockTable[vId] = vInfo?.stock_total || 1;

          const otherDates: Array<{ date: string; type: string }> = [];
          const mainType = c.tipo_evento === 'PreXV' ? 'PreXV' : 'Evento';
          if (c.fecha_evento) otherDates.push({ date: c.fecha_evento, type: mainType });

          const mDays = getMaintenanceDays(c.tipo_evento);
          const deliveryTime = c.fecha_entrega_envio ? parseSafeDate(c.fecha_entrega_envio) : null;
          const returnTime = deliveryTime ? deliveryTime + (mDays * 24 * 60 * 60 * 1000) : null;

          // NUEVO: Regla 2 días post Pre-XV
          const preXvBlockStart = c.fecha_pre_xv ? parseSafeDate(c.fecha_pre_xv) : null;
          const preXvBlockEnd = preXvBlockStart ? preXvBlockStart + (2 * 24 * 60 * 60 * 1000) : null;
          const isDisponible = vInfo?.estado === 'Disponible';
          const now = new Date().getTime();
          const isPreXvLiberado = isDisponible && preXvBlockEnd && now > preXvBlockEnd;

          let hasLocalConflict = false;

          const fechasEspeciales = Array.isArray(c.fechas_bloqueo_especial) ? c.fechas_bloqueo_especial : [];

          for (const myD of requestedDates) {
            const tReq = parseSafeDate(myD.date);

            if (fechasEspeciales.includes(myD.date)) {
              hasLocalConflict = true;
              break;
            }

            // BLOQUEO PRE-XV STRICTO
            if (preXvBlockStart && preXvBlockEnd && !isPreXvLiberado) {
              if (tReq >= preXvBlockStart && tReq < preXvBlockEnd) {
                hasLocalConflict = true;
                break;
              }
            }

            // BLOQUEO POR DISPONIBILIDAD REAL (Mantenimiento)
            if (c.fecha_disponibilidad_real) {
              const tRelease = parseSafeDate(c.fecha_disponibilidad_real);
              if (tReq < tRelease && tReq >= (deliveryTime || (parseSafeDate(c.fecha_evento) - (2 * 24 * 60 * 60 * 1000)))) {
                hasLocalConflict = true;
                break;
              }
            }

            // CHECK 1: "Vestido en Evento" - El vestido está fuera de tienda
            if (deliveryTime && returnTime && tReq >= deliveryTime && tReq <= returnTime) {
              hasLocalConflict = true;
              break;
            }

            // CHECK 2: Standard point-to-point check (Solo para Eventos)
            for (const otherD of otherDates) {
              const tExt = new Date(otherD.date).getTime();
              const s = getZoneSeverity(tReq, tExt, otherD.type);
              if (s === 'red' || (tReq === tExt)) {
                hasLocalConflict = true;
                break;
              }
            }
            if (hasLocalConflict) break;
          }

          if (hasLocalConflict) {
            conflictCounts[vId] = (conflictCounts[vId] || 0) + 1;
          }
        });

        (specialLocks || []).forEach((lock: any) => {
          const vId = lock.bloqueo_especial_vestido_id;
          const lockTime = parseSafeDate(lock.bloqueo_especial_fecha);
          const conflictsRequestedDate = requestedDates.some(rd => parseSafeDate(rd.date) === lockTime);

          if (vId && conflictsRequestedDate) {
            conflictCounts[vId] = (conflictCounts[vId] || 0) + 1;
          }
        });

        const busyIds = new Set<string>();
        Object.keys(conflictCounts).forEach(id => {
          if (conflictCounts[id] >= stockTable[id]) {
            busyIds.add(id);
          }
        });

        // Determinamos severidad basada en hallazgos globales
        const currentSeverity = busyIds.size > 0 ? 'red' : null;
        const cType = busyIds.size > 0 ? 'logistica' : null;

        if (currentSeverity) {
          setConflictSeverity(currentSeverity);
          setConflictType(cType);
        } else {
          setConflictSeverity(null);
          setConflictType(null);
        }
        setBusyVestidoIds(busyIds);
      } catch (err) {
        console.error('Error calculando disponibilidad:', err);
      }
    };

    checkAllAvailability();
  }, [formData.fecha_evento, formData.fecha_fotografia, formData.fecha_entrega, formData.tipo_evento, formData.tipo_entrega, formData.sede_id, editingContractId]);

  // -- "Freno de Mano": Limpieza Automática por Conflicto --
  useEffect(() => {
    if (busyVestidoIds.size > 0 && vestidos.length > 0) {
      vestidos.forEach((v, idx) => {
        if (v.vestido_id && busyVestidoIds.has(v.vestido_id)) {
          // Si es RED, limpiamos siempre y mostramos el modal rojo
          if (conflictSeverity === 'red') {
            setConflictDressCode(v.referencia || 'Seleccionado');
            setShowConflictModal(true);
            updateVestidoMulti(idx, { vestido_id: null, referencia: '' });
          } else {
            // Si es YELLOW, mostramos el modal de excepción pero NO limpiamos aún
            setConflictDressCode(v.referencia || 'Seleccionado');
            setShowYellowModal(true);
          }
        }
      });
    }
  }, [busyVestidoIds, conflictSeverity]);

  useEffect(() => {
    // Calculo dinámico de finanzas
    const valorAlquiler = parseFloat(formData.valor_total.toString().replace(/[^0-9.-]+/g, "")) || 0;
    const anticipo = parseFloat(formData.anticipo.toString().replace(/[^0-9.-]+/g, "")) || 0;
    const serviciosExtra = parseFloat(formData.servicios_adicionales.toString().replace(/[^0-9.-]+/g, "")) || 0;

    const sumArreglos = arreglos.reduce((acc, curr) => acc + (parseFloat(curr.precio.toString().replace(/[^0-9.-]+/g, "")) || 0), 0);
    setTotalArreglos(sumArreglos);

    // Saldo Final Real = Valor Alquiler Base + Servicios Extra + Costo Arreglos - Descuento VIP - Abono Inicial
    const nuevoSaldo = (valorAlquiler + serviciosExtra + sumArreglos) - vipDiscount - descuentoAliado - anticipo;
    setSaldoCalc(Math.max(0, nuevoSaldo));
  }, [formData.valor_total, formData.servicios_adicionales, formData.anticipo, arreglos, vipDiscount, descuentoAliado]);


  // -- Manejadores VIP --
  const handleValidateVIP = async () => {
    if (!vipCodeInput.trim()) return;
    setVipStatus('loading');
    setVipMessage('');
    
    try {
      const cleanText = formData.valor_total ? String(formData.valor_total).replace(/[^0-9.-]+/g, "") : "0";
      const currentTotal = parseInt(cleanText, 10) || 0;

      // 1. Validar código en Supabase (Solo Lectura)
      const { data: codeData, error: codeErr } = await supabase
        .from('codigos_descuento')
        .select('id, usado, referidor_id')
        .eq('codigo_seguridad', vipCodeInput.trim())
        .single();

      if (codeErr || !codeData) {
        throw new Error('Código no existe en el sistema.');
      }

      if (codeData.usado) {
        throw new Error('El código ya fue utilizado en otro contrato.');
      }

      // 2. Traer aliado asociado
      const { data: refData } = await supabase
        .from('referidores')
        .select('nombre_aliado, estado, activo')
        .eq('id', codeData.referidor_id)
        .single();

      if (!refData || refData.estado === 'Inactivo' || refData.activo === false) {
        throw new Error('El aliado asociado a este código se encuentra inactivo.');
      }

      // 3. Calcular descuento
      const { data: escalas } = await supabase
        .from('config_escalas')
        .select('descuento_cliente, minimo, maximo')
        .order('minimo', { ascending: true });

      let calculatedDiscount = 0;
      if (escalas) {
        const applicableScale = escalas.find((e: any) => 
          currentTotal >= e.minimo && (e.maximo === null || currentTotal <= e.maximo)
        );
        if (applicableScale) {
          calculatedDiscount = applicableScale.descuento_cliente || 0;
        }
      }

      // Aplicar descuento solo en el Frontend (Reversible)
      setVipStatus('success');
      setVipAliado(refData.nombre_aliado || 'Referidor VIP');
      setVipDiscount(calculatedDiscount);

    } catch (err: any) {
      console.error('Error detallado:', err?.message, err);
      setVipStatus('error');
      setVipMessage(err?.message || 'Error crítico al validar el código.');
    }
  };

  // -- Manejadores --

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleCheckboxArray = (
    item: string,
    list: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    if (list.includes(item)) {
      setList(list.filter(i => i !== item));
    } else {
      setList([...list, item]);
    }
  };

  const addArreglo = () => setArreglos([...arreglos, { tipo: '', cm: '', precio: '' }]);
  const removeArreglo = (idx: number) => setArreglos(arreglos.filter((_, i) => i !== idx));
  const updateArreglo = (idx: number, field: string, value: string) => {
    const updated = [...arreglos];
    updated[idx] = { ...updated[idx], [field]: value };
    setArreglos(updated);
  };

  const depositoSugerido = useMemo(() => contractSuggestedDeposit(vestidos.filter(v => v.vestido_id).map(v => {
    const row = vestidosMaestro.find(m => m.id === v.vestido_id);
    return { categoria: clasificaciones.find(c => c.id === row?.clasificacion_id)?.nombre ?? null, precio: row?.precio_sugerido };
  })), [vestidos, vestidosMaestro, clasificaciones]);
  const addVestido = () => setVestidos([...vestidos, { vestido_id: null, referencia: '', tipo: 'XV', observaciones: '' }]);
  const removeVestido = (idx: number) => setVestidos(vestidos.filter((_, i) => i !== idx));
  const updateVestido = (idx: number, field: string, value: any) => {
    setVestidos(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  const updateVestidoMulti = (idx: number, updates: Record<string, any>) => {
    setVestidos(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], ...updates };
      return updated;
    });
  };

  const resolveVestidoIds = async (vestidosList: any[]) => {
    const resolved: {
      idx: number;
      id: string;
      referencia: string;
      tipo: string;
      observaciones: string;
      stock_total: number;
      sede_actual_id: string;
      sede_nombre: string;
      estado: string;
    }[] = [];

    for (let i = 0; i < vestidosList.length; i++) {
      const v = vestidosList[i];
      if (!v.referencia.trim()) continue;
      const codigoUpper = v.referencia.trim().toUpperCase();

      let query = supabase
        .from('vestidos')
        .select('id, codigo, nombre, estado, sede_actual_id, stock_total, precio_sugerido, sedes(nombre)')
        .eq('archivado', false);

      if (v.vestido_id) {
        query = query.eq('id', v.vestido_id);
      } else {
        query = query.or(`codigo.ilike.%${codigoUpper}%,nombre.ilike.%${codigoUpper}%`);
      }

      const { data: existingList, error } = await query.limit(1);

      if (error) {
        console.error('Error Supabase Vestidos:', error);
      }

      const existing = existingList && existingList.length > 0 ? existingList[0] : null;

      if (existing && existing.id) {
        if (isRetiredDress(existing.estado)) {
          throw new Error(`❌ El vestido ${codigoUpper} no está disponible (Estado: ${existing.estado})`);
        }

        // TRASLADO DE INVENTARIO: Actualizar sede si es diferente
        if (existing.sede_actual_id !== formData.sede_id) {
          const sedeActualNombre = (existing.sedes as any)?.nombre || 'otra sede';
          throw new Error(`❌ El vestido ${existing.codigo} existe pero está ubicado en ${sedeActualNombre}. Por favor, realiza el traslado logístico físico primero o autoriza el movimiento.`);
        }

        resolved.push({
          idx: i,
          id: existing.id,
          referencia: existing.codigo || codigoUpper,
          tipo: v.tipo,
          observaciones: v.observaciones,
          stock_total: existing.stock_total || 1,
          sede_actual_id: formData.sede_id, 
          sede_nombre: formData.sede,
          estado: existing.estado 
        });
      } else {
        throw new Error(`❌ El vestido '${codigoUpper}' no se encontró en el inventario global. Verifica si el código o nombre es correcto.`);
      }
    }
    return resolved;
  };

  const resolveBloqueoEspecial = async () => {
    const referencia = bloqueoEspecial.referencia.trim().toUpperCase();
    const fecha = bloqueoEspecial.fecha;

    if (!referencia && !fecha) return null;

    if (!referencia || !fecha) {
      throw new Error('⚠️ En Bloqueo fechas especiales debes indicar la referencia y la fecha por bloquear.');
    }

    let query = supabase
      .from('vestidos')
      .select('id, codigo, nombre, estado, sede_actual_id, stock_total, sedes(nombre)')
      .eq('archivado', false);

    if (bloqueoEspecial.vestido_id) {
      query = query.eq('id', bloqueoEspecial.vestido_id);
    } else {
      query = query.ilike('codigo', referencia);
    }

    const { data, error } = await query.limit(1);
    if (error) throw error;

    const vestido = data && data.length > 0 ? data[0] : null;
    if (!vestido?.id) {
      throw new Error(`❌ La referencia '${referencia}' del bloqueo especial no existe en el inventario.`);
    }

    if (isRetiredDress(vestido.estado)) {
      throw new Error(`❌ La referencia ${vestido.codigo} está dada de baja y no puede bloquearse.`);
    }

    if (vestido.sede_actual_id !== formData.sede_id) {
      const sedeActualNombre = (vestido.sedes as any)?.nombre || 'otra sede';
      throw new Error(`❌ La referencia ${vestido.codigo} del bloqueo especial está ubicada en ${sedeActualNombre}. Realiza primero el traslado logístico.`);
    }

    return {
      id: vestido.id,
      referencia: vestido.codigo || referencia,
      fecha,
      stock_total: vestido.stock_total || 1
    };
  };

  const checkInventory = async (resolvedVestidos: any[], currentContractId?: string | null, specialBlock?: any) => {
    const dates = Array.from(new Set(fechasBloqueoEspecial.filter(Boolean)));
    if (dates.length !== fechasBloqueoEspecial.filter(Boolean).length) {
      toast.error('No puedes repetir la misma fecha especial dentro del contrato.');
      return false;
    }
    const proposed = generateBlockedRanges([{
      id: currentContractId || 'nuevo',
      numero_contrato: editingContractNumber || 'Nuevo',
      estado: 'firmado',
      tipo_evento: formData.tipo_evento,
      fecha_evento: formData.fecha_evento,
      fecha_pre_xv: formData.fecha_fotografia,
      fechas_bloqueo_especial: dates
    }]);
    const dressIds = Array.from(new Set<string>([
      ...resolvedVestidos.map((v: any) => v.id).filter(Boolean),
      specialBlock?.id
    ].filter(Boolean)));
    if (!dressIds.length) return true;
    for (const id of dressIds) {
      const [{ data: items, error: itemError }, { data: legacy, error: legacyError },
        { data: special, error: specialError }] = await Promise.all([
        supabase.from('contrato_items_vestidos')
          .select('vestido_id,contratos!inner(id,numero_contrato,cliente_nombre,estado,tipo_evento,fecha_evento,fecha_pre_xv,fechas_bloqueo_especial)')
          .eq('vestido_id', id),
        supabase.from('contratos')
          .select('id,numero_contrato,cliente_nombre,estado,tipo_evento,fecha_evento,fecha_pre_xv,fechas_bloqueo_especial')
          .eq('vestido_id', id),
        supabase.from('contratos')
          .select('id,numero_contrato,cliente_nombre,estado,bloqueo_especial_fecha,bloqueo_especial_vestido_id')
          .eq('bloqueo_especial_vestido_id', id).not('bloqueo_especial_fecha', 'is', null)
      ]);
      if (itemError || legacyError || specialError) {
        toast.error('No se pudo verificar la disponibilidad del vestido.');
        return false;
      }
      const others = [...(items || []), ...(legacy || []), ...(special || [])]
        .filter((row: any) => (row.contratos || row).id !== currentContractId);
      const blocks = generateBlockedRanges(others);
      const requested = [...proposed];
      if (specialBlock?.id === id && specialBlock.fecha) {
        requested.push(...generateBlockedRanges([{
          id: currentContractId || 'nuevo-especial',
          numero_contrato: editingContractNumber || 'Nuevo',
          estado: 'firmado', bloqueo_especial_fecha: specialBlock.fecha,
          bloqueo_especial_vestido_id: id
        }]));
      }
      const dress = resolvedVestidos.find((v: any) => v.id === id);
      const capacity = Math.max(1, Number(dress?.stock_total || specialBlock?.stock_total || 1));
      for (const wanted of requested) {
        const conflicting = new Set(blocks.filter(block => rangesOverlap(wanted, block)).map(block => block.contractNumber));
        if (conflicting.size >= capacity) {
          toast.error(`El vestido ${dress?.referencia || specialBlock?.referencia || id} está reservado en esas fechas por el contrato ${[...conflicting].join(', ')}.`);
          return false;
        }
      }
    }
    return true;
  };

  const handleSolicitarAutorizacion = async () => {
    if (isEditMode) {
      toast.error('En modo edición no se crea una solicitud nueva. Ajusta las fechas o guarda el contrato existente.');
      return;
    }
    let depositoInicial: number;
    try { depositoInicial = initialDepositAmount(formData.valor_deposito); }
    catch { toast.error('El depósito debe ser un valor válido mayor o igual a cero.'); return; }
    let numeroFactura: string;
    try {
      numeroFactura = requireInvoice(formData.numero_factura);
    } catch {
      toast.error(INVOICE_REQUIRED_MESSAGE);
      document.getElementById('numero_factura')?.focus();
      return;
    }
    const errorRetabloSolicitud = retabloError(retablo);
    if (errorRetabloSolicitud) { toast.error(errorRetabloSolicitud); return; }
    const errorAliadoModo = aliadoModoError();
    if (errorAliadoModo) { toast.error(errorAliadoModo); return; }
    setIsSubmittingException(true);
    try {
      // 1. Resolver IDs de vestidos primero
      const resolved = await resolveVestidoIds(vestidos);
      if (!resolved || resolved.length === 0) {
        toast.error('No se pudieron resolver los vestidos del contrato.');
        return;
      }

      const resolvedSpecialBlock = await resolveBloqueoEspecial();
      if (!(await checkInventory(resolved, null, resolvedSpecialBlock))) return;

      // 2. Crear contrato con estado 'pendiente_admin'
      const prefixMap: Record<string, string> = {
        'Villavicencio': 'VILL',
        'Bogotá': 'BOG',
        'Bogota': 'BOG',
        'Barranquilla': 'BARR'
      };
      const prefix = prefixMap[formData.sede] || formData.sede.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 4);
      const year = new Date().getFullYear();

      const { data: lastContratos, error: countError } = await supabase
        .from('contratos')
        .select('numero_contrato')
        .like('numero_contrato', `${prefix}-${year}-%`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (countError) throw countError;

      let correlativo = 1;
      if (lastContratos && lastContratos.length > 0) {
        const parts = lastContratos[0].numero_contrato.split('-');
        if (parts.length === 3) correlativo = parseInt(parts[2], 10) + 1;
      }
      const numero_contrato = `${prefix}-${year}-${String(correlativo).padStart(4, '0')}`;

      const validArreglos = arreglos.filter(a => a.tipo.trim() !== '');

      // ----------------------------------------------------
      // RECALCULO ESTRICTO DE FINANZAS
      // ----------------------------------------------------
      const valorAlquilerBase = parseFloat(String(formData.valor_total).replace(/[^0-9.-]+/g, "")) || 0;
      const serviciosAdicionales = parseFloat(String(formData.servicios_adicionales).replace(/[^0-9.-]+/g, "")) || 0;
      const abonoInicial = parseFloat(String(formData.anticipo).replace(/[^0-9.-]+/g, "")) || 0;
      
      const valorAlquilerConDescuento = Math.max(0, valorAlquilerBase - vipDiscount - descuentoAliado);
      const verdaderoValorTotal = valorAlquilerConDescuento + serviciosAdicionales;

      assertFirstVisitReady();
      const payload = {
        ...(firstVisit?{primera_cita_id:firstVisit.id}:{}),
        numero_contrato,
        numero_factura: numeroFactura,
        estado: 'borrador',

        // Cliente
        cliente_nombre: formData.cliente_nombre.trim(),
        cliente_documento: formData.cliente_documento.trim(),
        cliente_whatsapp: formData.whatsapp.trim(),
        cliente_email: formData.cliente_email.trim(),
        cliente_direccion: formData.direccion.trim(),
        quinceanera_name: formData.quinceanera_name.trim(),

        // Logística
        sede: formData.sede,
        sede_id: formData.sede_id,
        tipo_evento: formData.tipo_evento,
        tipo_entrega: formData.tipo_entrega,
        asesora: formData.asesora.trim(),
        asesora_id: formData.asesora_id,

        // Fechas
        fecha_evento: formData.tipo_evento === 'PreXV' ? formData.fecha_fotografia : formData.fecha_evento,
        ...prexvPayload(),
        fecha_cita_medidas: formData.cita_medidas || null,
        fecha_prueba_final: formData.prueba_final || null,
        fecha_entrega_envio: formData.fecha_entrega || null,

        // Finanzas Recalculadas
        valor_total: verdaderoValorTotal,
        anticipo: abonoInicial,
        total_arreglos: totalArreglos,
        valor_deposito: depositoInicial,
        ...allyModePayload(aliadoModo, descuentoAliado),

        // Garantías/Depósitos
      banco_deposito: formData.deposito_banco || null,
        tipo_cuenta_deposito: formData.deposito_tipo_cuenta || null,
        numero_cuenta_deposito: formData.deposito_numero || null,
        titular_cuenta_deposito: formData.deposito_titular || null,

        // Extras Mantenidos
        accesorios: accesoriosSeleccionados,
        metodos_pago: metodosPago,

        // Vestido Principal (para consistencia con Dashboard)
        vestido_id: resolved.length > 0 ? resolved[0].id : null,

        bloqueo_especial_referencia: resolvedSpecialBlock?.referencia || null,
        bloqueo_especial_fecha: resolvedSpecialBlock?.fecha || null,
        bloqueo_especial_vestido_id: resolvedSpecialBlock?.id || null,
        fechas_bloqueo_especial: Array.from(new Set(fechasBloqueoEspecial.filter(Boolean))).sort(),

        // Estado de Aprobación (Zona Amarilla)
        estado_aprobacion: 'pendiente_admin'
      };

      const { data: newDoc, error: errC } = await supabase
        .from('contratos')
        .insert([payload])
        .select('id')
        .single();

      if (errC) throw errC;
      if (newDoc?.id) await sendAllyMeasures(newDoc.id);
      if (newDoc?.id) await syncRetablo(newDoc.id);

      // Quema del código VIP (si fue usado)
      if (vipCodeInput.trim() && newDoc && vipDiscount > 0) {
        const { error: errorCupon } = await supabase
          .from('codigos_descuento')
          .update({ 
            usado: true, 
            fecha_uso: new Date().toISOString(),
            contrato_id: newDoc.id 
          })
          .eq('codigo_seguridad', vipCodeInput.trim());
          
        if (errorCupon) {
          console.error("Error al quemar el cupón VIP:", errorCupon);
        }
      }

      // 3. Vincular vestidos
      const itemPayload = resolved.map(rv => ({
        contrato_id: newDoc.id,
        vestido_id: rv.id,
        tipo_uso: rv.tipo,
        observaciones: rv.observaciones
      }));

      const { error: errV } = await supabase.from('contrato_items_vestidos').insert(itemPayload);
      if (errV) throw errV;

      // 4. Inserción de Tabla Relacional de Arreglos
      if (validArreglos.length > 0 && newDoc) {
        const arreglosPayload = validArreglos.map(a => ({
          contrato_id: newDoc.id,
          tipo: a.tipo.trim(),
          cm: a.cm.trim() ? a.cm.trim() : null,
          precio: parseFloat(a.precio) || 0
        }));
        const { error: arreglosError } = await supabase.from('arreglos').insert(arreglosPayload);
        if (arreglosError) {
          console.error("Error al insertar los arreglos en la solicitud de excepción", arreglosError);
        }
      }

      // Bitácora para servicios adicionales
      if (serviciosAdicionales > 0 && newDoc) {
        await supabase.from('bitacora_contratos').insert([{
          contrato_id: newDoc.id,
          usuario_email: 'Sistema',
          accion: 'Registro de Servicios Adicionales',
          detalle: `Se agregaron servicios adicionales por un valor de $${serviciosAdicionales}`
        }]);
      }

      // 5. Registrar en Bitácora
      const { data: { user } } = await supabase.auth.getUser();
      const detalleMilestones = [
        formData.fecha_evento && `Evento: ${formData.fecha_evento}`,
        formData.fecha_fotografia && `Sesión Pre-XV: ${formData.fecha_fotografia}`,
        resolvedSpecialBlock && `Bloqueo especial: ${resolvedSpecialBlock.referencia} · ${resolvedSpecialBlock.fecha}`,
        fechasBloqueoEspecial.filter(Boolean).length > 0 && `Fechas especiales: ${Array.from(new Set(fechasBloqueoEspecial.filter(Boolean))).sort().join(', ')} · Todas las referencias del contrato`
      ].filter(Boolean).join(' | ');

      await supabase.from('bitacora_contratos').insert([{
        contrato_id: newDoc.id,
        usuario_email: user?.email,
        accion: 'Solicitud de excepción por alistamiento',
        detalle: `Vestido ${alistamientoData?.referencia} (Alerta en #${alistamientoData?.contratoPadre}). Logística: ${detalleMilestones}`
      }]);

      toast.success(`✅ Solicitud enviada. El contrato #${numero_contrato} quedó pendiente de aprobación.`);
      setShowYellowModal(false);
      router.push('/dashboard');
    } catch (err: any) {
      console.error('Error al procesar solicitud de excepción:', err.message, err);
      toast.error('Error al procesar solicitud: ' + err.message);
    } finally {
      setIsSubmittingException(false);
    }
  };

  const saveExistingContract = async (resolvedVestidos: any[], numeroFactura: string) => {
    if (!editingContractId) throw new Error('No hay un contrato seleccionado para editar.');

    const valorAlquilerBase = parseFloat(String(formData.valor_total).replace(/[^0-9.-]+/g, "")) || 0;
    const serviciosAdicionales = parseFloat(String(formData.servicios_adicionales).replace(/[^0-9.-]+/g, "")) || 0;
    const verdaderoValorTotal = Math.max(0, valorAlquilerBase - vipDiscount - descuentoAliado) + serviciosAdicionales;
    const abonoInicial = parseFloat(String(formData.anticipo).replace(/[^0-9.-]+/g, "")) || 0;

    const datos = {
      numero_factura: numeroFactura,
      cliente_nombre: formData.cliente_nombre.trim(),
      cliente_documento: formData.cliente_documento.trim(),
      cliente_whatsapp: formData.whatsapp.trim(),
      cliente_email: formData.cliente_email.trim(),
      cliente_direccion: formData.direccion.trim(),
      quinceanera_name: formData.quinceanera_name.trim(),
      sede: formData.sede,
      sede_id: formData.sede_id,
      asesora: formData.asesora.trim(),
      asesora_id: formData.asesora_id,
      tipo_evento: formData.tipo_evento,
      tipo_entrega: formData.tipo_entrega,
      fecha_evento: formData.tipo_evento === 'PreXV' ? formData.fecha_fotografia : (formData.fecha_evento || null),
      fecha_pre_xv: formData.fecha_fotografia || null,
      fecha_cita_medidas: formData.cita_medidas || null,
      fecha_prueba_final: formData.prueba_final || null,
      fecha_entrega_envio: formData.fecha_entrega || null,
      fecha_fotografia: prexv.fecha_fotografia || null,
      fecha_maquillaje: prexv.fecha_maquillaje || null,
      valor_total: verdaderoValorTotal,
      anticipo: abonoInicial,
      total_arreglos: totalArreglos,
      ...allyModePayload(aliadoModo, descuentoAliado),
      banco_deposito: formData.deposito_banco || null,
      tipo_cuenta_deposito: formData.deposito_tipo_cuenta || null,
      numero_cuenta_deposito: formData.deposito_numero || null,
      titular_cuenta_deposito: formData.deposito_titular || null,
      accesorios: accesoriosSeleccionados,
      metodos_pago: metodosPago,
      prexv_componentes: prexv.prexv_componentes || [],
      prexv_fotografo: prexv.prexv_fotografo || null,
      prexv_maquilladora: prexv.prexv_maquilladora || null,
      prexv_locacion: prexv.prexv_locacion || null,
      prexv_fotografo_agendado: Boolean(prexv.prexv_fotografo_agendado),
      prexv_maquilladora_agendada: Boolean(prexv.prexv_maquilladora_agendada),
      prexv_locacion_confirmada: Boolean(prexv.prexv_locacion_confirmada),
      autoriza_uso_imagen: formData.autoriza_uso_imagen,
      fechas_bloqueo_especial: Array.from(new Set(fechasBloqueoEspecial.filter(Boolean))).sort()
    };

    const vestidosPayload = resolvedVestidos.map(v => ({
      vestido_id: v.id,
      tipo_uso: v.tipo,
      tipo: v.tipo,
      observaciones: v.observaciones?.trim() || null
    }));

    const arreglosPayload = arreglos
      .filter(a => a.tipo.trim() !== '')
      .map(a => ({
        tipo: a.tipo.trim(),
        cm: a.cm.trim() || null,
        precio: parseFloat(a.precio) || 0
      }));

    if (canFixInitial) {
      const anticipoAnterior = Number(editingSnapshot?.anticipo || 0);
      const depositoNuevo = parseFloat(String(formData.valor_deposito).replace(/[^0-9.-]+/g, "")) || 0;
      const depositoAnterior = Number(editingSnapshot?.valor_deposito || 0);
      if (abonoInicial !== anticipoAnterior || depositoNuevo !== depositoAnterior) {
        if (motivoValores.trim().length < 10) throw new Error('Escribe el motivo de la corrección del abono inicial o del depósito (mínimo 10 caracteres).');
        const { error: fixError } = await supabase.rpc('corregir_valores_iniciales_contrato', {
          p_contrato: editingContractId,
          p_anticipo: abonoInicial !== anticipoAnterior ? abonoInicial : null,
          p_deposito: depositoNuevo !== depositoAnterior ? depositoNuevo : null,
          p_motivo: motivoValores.trim()
        });
        if (fixError) throw fixError;
      }
    }

    const { data, error } = await supabase.rpc('editar_contrato_completo_admin', {
      p_contrato: editingContractId,
      p_datos: datos,
      p_vestidos: vestidosPayload,
      p_arreglos: arreglosPayload
    });

    if (error) throw error;
    await syncRetablo(editingContractId);

    toast.success(`✅ Contrato ${editingContractNumber || data?.numero_contrato || ''} actualizado correctamente`);
    router.push(`/dashboard?contratoId=${encodeURIComponent(editingContractId)}`);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (prexv.prexv_componentes?.length && !formData.fecha_fotografia) { toast.error('Indica la fecha de sesión PRE-XV.'); return; }

    let depositoInicial: number;
    try { depositoInicial = initialDepositAmount(formData.valor_deposito); }
    catch { toast.error('El depósito debe ser un valor válido mayor o igual a cero.'); return; }
    let numeroFactura: string;
    try {
      numeroFactura = requireInvoice(formData.numero_factura);
    } catch {
      toast.error(INVOICE_REQUIRED_MESSAGE);
      document.getElementById('numero_factura')?.focus();
      return;
    }

    const errorRetablo = retabloError(retablo);
    if (errorRetablo) { toast.error(errorRetablo); return; }
    const errorModo = aliadoModoError();
    if (errorModo) { toast.error(errorModo); return; }

    // 0. Validación de Vestido Obligatorio
    const hasValidDress = vestidos.some(v => v.vestido_id || v.referencia.trim().length > 0);
    if (!hasValidDress) {
      toast.error('¡Atención! Debes asignar al menos un vestido para crear el contrato.');
      return;
    }

    // Soporte obligatorio del anticipo (también se valida en la base de datos)
    const abonoConSoporte = parseFloat(String(formData.anticipo).replace(/[^0-9.-]+/g, "")) || 0;
    if (!isEditMode && abonoConSoporte > 0) {
      if (subiendoSoporte) { toast.error('Espera a que termine de subir el soporte del anticipo.'); return; }
      if (!anticipoSoportes.length) { toast.error('Falta el soporte de ingreso. Adjunta el comprobante del anticipo para poder guardar el contrato.'); return; }
    }

    setLoading(true);

    // 0. Resetear Advertencias previas
    setCrossBranchWarning({ active: false, origin: '', codigo: '' });

    // 1. Resolución de códigos a IDs de vestidos
    let resolvedVestidos: any[] = [];
    try {
      resolvedVestidos = await resolveVestidoIds(vestidos);
    } catch (err: any) {
      toast.error(err.message);
      setLoading(false);
      return;
    }

    let resolvedSpecialBlock: any = null;
    try {
      if (!isEditMode) {
        resolvedSpecialBlock = await resolveBloqueoEspecial();

      }

    } catch (err: any) {
      toast.error(err.message);
      setLoading(false);
      return;
    }

    // 2. PRIORIDAD 1: Validar Inventario (Calendario Global)
    const isAvailable = await checkInventory(resolvedVestidos, editingContractId, resolvedSpecialBlock);
    if (!isAvailable) {
      setLoading(false);
      return;
    }

    // 3. PRIORIDAD 2: Validar Sede (Cruce de Sedes)
    const conflictSede = resolvedVestidos.find(rv => rv.sede_actual_id !== formData.sede_id);
    if (conflictSede) {
      setCrossBranchWarning({ active: true, origin: conflictSede.sede_nombre, codigo: conflictSede.referencia });
      if (!adminAuthorizedTransfer && userRole !== 'admin') {
        toast.error(`⚠️ El vestido ${conflictSede.referencia} pertenece a la sede ${conflictSede.sede_nombre}. Autoriza el traslado.`);
        setLoading(false);
        return;
      }
    }

    if (isEditMode && editingContractId) {
      try {
        await saveExistingContract(resolvedVestidos, numeroFactura);
      } catch (error: any) {
        console.error('Error actualizando contrato existente:', error);
        toast.error(error?.message || 'No se pudo actualizar el contrato.');
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      // 2. Determinar el prefijo
      const prefixMap: Record<string, string> = {
        'Villavicencio': 'VILL',
        'Bogotá': 'BOG',
        'Bogota': 'BOG',
        'Barranquilla': 'BARR'
      };
      const prefix = prefixMap[formData.sede] || formData.sede.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 4);
      const year = new Date().getFullYear();

      // 3. Obtener correlativo
      const { data: lastContratos, error: countError } = await supabase
        .from('contratos')
        .select('numero_contrato')
        .like('numero_contrato', `${prefix}-${year}-%`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (countError) throw countError;

      let correlativo = 1;
      if (lastContratos && lastContratos.length > 0) {
        const parts = lastContratos[0].numero_contrato.split('-');
        if (parts.length === 3) correlativo = parseInt(parts[2], 10) + 1;
      }
      const numero_contrato = `${prefix}-${year}-${String(correlativo).padStart(4, '0')}`;

      const validArreglos = arreglos.filter(a => a.tipo.trim() !== '');

      // ----------------------------------------------------
      // RECALCULO ESTRICTO DE FINANZAS
      // ----------------------------------------------------
      const valorAlquilerBase = parseFloat(String(formData.valor_total).replace(/[^0-9.-]+/g, "")) || 0;
      const serviciosAdicionales = parseFloat(String(formData.servicios_adicionales).replace(/[^0-9.-]+/g, "")) || 0;
      const abonoInicial = parseFloat(String(formData.anticipo).replace(/[^0-9.-]+/g, "")) || 0;
      
      const valorAlquilerConDescuento = Math.max(0, valorAlquilerBase - vipDiscount - descuentoAliado);
      const verdaderoValorTotal = valorAlquilerConDescuento + serviciosAdicionales;

      // 5. Inserción ERP: Mapeo Estricto de Columnas
      assertFirstVisitReady();
      const payload = {
        ...(firstVisit?{primera_cita_id:firstVisit.id}:{}),
        numero_contrato,
        numero_factura: numeroFactura,
        estado: 'borrador',

        // Cliente
        cliente_nombre: formData.cliente_nombre.trim(),
        cliente_documento: formData.cliente_documento.trim(),
        cliente_whatsapp: formData.whatsapp.trim(),
        cliente_email: formData.cliente_email.trim(),
        cliente_direccion: formData.direccion.trim(),
        quinceanera_name: formData.quinceanera_name.trim(),

        // Logística
        sede: formData.sede,
        sede_id: formData.sede_id,
        tipo_evento: formData.tipo_evento,
        tipo_entrega: formData.tipo_entrega,
        asesora: formData.asesora.trim(),
        asesora_id: formData.asesora_id,

        // Fechas
        fecha_evento: formData.tipo_evento === 'PreXV' ? formData.fecha_fotografia : formData.fecha_evento,
        ...prexvPayload(),
        fecha_cita_medidas: formData.cita_medidas || null,
        fecha_prueba_final: formData.prueba_final || null,
        fecha_entrega_envio: formData.fecha_entrega || null,

        // Finanzas Recalculadas
        valor_total: verdaderoValorTotal,
        anticipo: abonoInicial,
        total_arreglos: totalArreglos,
        valor_deposito: depositoInicial,
        ...allyModePayload(aliadoModo, descuentoAliado),

        // Garantías/Depósitos
        banco_deposito: formData.deposito_banco || null,
        tipo_cuenta_deposito: formData.deposito_tipo_cuenta || null,
        numero_cuenta_deposito: formData.deposito_numero || null,
        titular_cuenta_deposito: formData.deposito_titular || null,

        // Extras Mantenidos
        accesorios: accesoriosSeleccionados,
        metodos_pago: metodosPago,

        // Vestido Principal (para consistencia con Dashboard)
        vestido_id: resolvedVestidos.length > 0 ? resolvedVestidos[0].id : null,

        bloqueo_especial_referencia: resolvedSpecialBlock?.referencia || null,
        bloqueo_especial_fecha: resolvedSpecialBlock?.fecha || null,
        bloqueo_especial_vestido_id: resolvedSpecialBlock?.id || null,
        fechas_bloqueo_especial: Array.from(new Set(fechasBloqueoEspecial.filter(Boolean))).sort(),

        // Estado de Aprobación (Zona Amarilla)
        estado_aprobacion: 'aprobado',
        autoriza_uso_imagen: formData.autoriza_uso_imagen
      };

      const { data: insertedContract, error: insertError } = await supabase.from('contratos').insert([payload]).select('id').single();

      if (insertError) throw insertError;
      if (insertedContract?.id) await syncRetablo(insertedContract.id);
      if (insertedContract?.id) await sendAllyMeasures(insertedContract.id);

      // REGISTRO DE RECAUDO REAL: Si hay abono inicial, insertarlo inmediatamente en la tabla 'pagos'
      if (abonoInicial > 0 && insertedContract) {
        const metodosString = metodosPago && metodosPago.length > 0 ? metodosPago.join(', ') : 'Múltiple/Otro';
        const { error: pagoError } = await supabase.rpc('registrar_pago_con_soporte', {
          p_contrato: insertedContract.id,
          p_valor: abonoInicial,
          p_medio: metodosString,
          p_recibo: '',
          p_observaciones: 'Abono inicial al firmar contrato',
          p_soportes: anticipoSoportes,
        });
        if (pagoError) {
          console.error("Error al registrar el anticipo en pagos:", pagoError);
          toast.error(`El contrato se creó, pero el anticipo no quedó registrado: ${pagoError.message} Avisa a administración para registrarlo sin duplicar el valor.`);
        }
      }

      // Quema del código VIP (si fue usado)
      if (vipCodeInput.trim() && insertedContract && vipDiscount > 0) {
        const { error: errorCupon } = await supabase
          .from('codigos_descuento')
          .update({ 
            usado: true, 
            fecha_uso: new Date().toISOString(),
            contrato_id: insertedContract.id 
          })
          .eq('codigo_seguridad', vipCodeInput.trim());
          
        if (errorCupon) {
          console.error("Error al quemar el cupón VIP:", errorCupon);
        }
      }

      // 6. Inserción del Array Múltiple de Vestidos (usando vestido_id numérico)
      if (resolvedVestidos.length > 0 && insertedContract) {
        const vestidosPayload = resolvedVestidos.map(v => ({
          contrato_id: insertedContract.id,
          vestido_id: v.id,
          tipo_uso: v.tipo,
          observaciones: v.observaciones.trim()
        }));
        const { error: vestidosError } = await supabase.from('contrato_items_vestidos').insert(vestidosPayload);
        if (vestidosError) {
          console.error("Error al insertar items de vestido", vestidosError);
          throw vestidosError;
        }
      }

      // 7. Inserción de Tabla Relacional de Arreglos
      if (validArreglos.length > 0 && insertedContract) {
        const arreglosPayload = validArreglos.map(a => ({
          contrato_id: insertedContract.id,
          tipo: a.tipo.trim(),
          cm: a.cm.trim() ? a.cm.trim() : null,
          precio: parseFloat(a.precio) || 0
        }));
        const { error: arreglosError } = await supabase.from('arreglos').insert(arreglosPayload);
        if (arreglosError) {
          console.error("Error al insertar los arreglos", arreglosError);
        }
      }

      // Bitácora para servicios adicionales
      if (serviciosAdicionales > 0 && insertedContract) {
        await supabase.from('bitacora_contratos').insert([{
          contrato_id: insertedContract.id,
          usuario_email: 'Sistema',
          accion: 'Registro de Servicios Adicionales',
          detalle: `Se agregaron servicios adicionales por un valor de $${serviciosAdicionales}`
        }]);
      }

      // 8. Registro de Excepción en Bitácora (NUEVA TABLA: bitacora_contratos) - Solo para casos legacy si llegaran aquí
      if (false && insertedContract) {
        const targetId = (insertedContract as any).id;
        const { data: { user } } = await supabase.auth.getUser();

        await supabase.from('bitacora_contratos').insert([{
          contrato_id: targetId,
          usuario_email: user?.email || 'Sistema',
          accion: 'Solicitud de excepción por alistamiento',
          detalle: `Se solicita alquilar vestido ${vestidos[0]?.referencia || 'N/A'} en periodo de preparación (Alistamiento)`
        }]);

        toast.success(`✅ Solicitud enviada. El contrato #${numero_contrato} quedó pendiente de aprobación.`);
      } else {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const detail = [
          formData.fecha_evento && `Evento: ${formData.fecha_evento}`,
          formData.fecha_fotografia && `Sesión Pre-XV: ${formData.fecha_fotografia}`,
          resolvedSpecialBlock && `Bloqueo especial: ${resolvedSpecialBlock.referencia} · ${resolvedSpecialBlock.fecha}`,
        fechasBloqueoEspecial.filter(Boolean).length > 0 && `Fechas especiales: ${Array.from(new Set(fechasBloqueoEspecial.filter(Boolean))).sort().join(', ')} · Todas las referencias del contrato`
        ].filter(Boolean).join(' | ');

        await supabase.from('bitacora_contratos').insert([{
          contrato_id: insertedContract.id,
          usuario_email: authUser?.email || 'Sistema',
          accion: 'Creación de contrato (Solo Vestidos)',
          detalle: `Contrato administrativo generado. Logística: ${detail}`
        }]);

        toast.success(`✅ Contrato ${numero_contrato} registrado exitosamente ERP`);
      }

      // 9. QUEMADO DEFINITIVO DEL CÓDIGO VIP
      if (vipStatus === 'success' && vipCodeInput.trim()) {
        await supabase
          .from('codigos_descuento')
          .update({ 
            usado: true,
            fecha_uso: new Date().toISOString(),
            contrato_id: insertedContract.id
          })
          .eq('codigo_seguridad', vipCodeInput.trim());
      }

      router.push('/dashboard');

    } catch (error: any) {
      console.error('Error al guardar contrato ERP:', error);
      toast.error(error?.message || 'Ocurrió un error al procesar la inserción en el sistema.');
    } finally {
      setLoading(false);
    }
  };

  // Auxiliares visuales
  const renderTextInput = (label: string, name: keyof typeof formData, icon: React.ReactNode, type = "text", req = false, extraClasses = "") => (
    <div className={`space-y-1 ${extraClasses}`}>
      <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
        {icon} {label} {req && <span className="text-rose-500">*</span>}
      </label>
      <input
        type={type}
        name={name}
        value={String(formData[name])}
        onChange={handleChange}
        disabled={isEditMode && name === 'anticipo' && !canFixInitial}
        title={isEditMode && name === 'anticipo' && !canFixInitial ? 'Los abonos de un contrato pactado se gestionan desde Registrar Abono / Pago.' : undefined}
        className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-rose-300 font-medium disabled:opacity-60 disabled:cursor-not-allowed"
        required={req}
      />
    </div>
  );

  if (!mounted) return null;
  if (isEditMode && (loadingEditContract || !editingSnapshot)) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-rose-500" />
        <p className="font-bold text-gray-600">Cargando contrato para edición...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex justify-center py-8 font-sans px-2 sm:px-4 pb-24">
      <Toaster position="top-right" richColors />
      {(firstVisit||firstVisitLoading||firstVisitError)&&<div className="mx-auto max-w-6xl rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm" role={firstVisitError?'alert':'status'}>{firstVisitError|| (firstVisitLoading?'Cargando primera cita…':`Contrato originado en primera visita: ${firstVisit.cliente_nombre}. Al guardarlo quedará vinculado a su seguimiento.`)} <a className="font-bold underline" href="/dashboard/primeras-citas">Volver al Calendario</a></div>}

      <div className="w-full max-w-5xl bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-200">


        {/* MODAL DE FIRMA (Actual) */}
        {/* Header Hero */}
        <div className="bg-gradient-to-r from-gray-900 to-rose-900 px-8 py-10 text-center relative overflow-hidden flex flex-col md:flex-row items-center justify-center gap-6">
          <button
            type="button"
            onClick={handleBack}
            className="absolute left-8 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl border border-white/20 transition-all active:scale-95 group"
            title="Volver al Dashboard"
          >
            <ChevronLeft className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
          </button>

          <div className="relative z-10">
            <h1 className="text-3xl font-black text-white tracking-wide uppercase">
              {isEditMode ? 'Editar Contrato ERP' : 'Nuevo Contrato ERP'}
            </h1>
            <p className="text-rose-200 mt-1 font-medium tracking-[0.18em] uppercase opacity-80">
              {isEditMode ? `${editingContractNumber} · Estado: ${editingContractState}` : 'Ambar Couture'}
            </p>
          </div>

          <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 -translate-y-10 translate-x-10 animate-pulse"></div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 sm:p-10 space-y-10">
          <section className="space-y-3">
            <label htmlFor="numero_factura" className="text-sm font-semibold text-gray-700">
              Factura <span className="text-rose-500">*</span>
            </label>
            <input id="numero_factura" name="numero_factura" type="text" required
              aria-required="true" aria-describedby="invoice-help"
              value={formData.numero_factura}
              onChange={(e) => setFormData(prev => ({ ...prev, numero_factura: e.target.value }))}
              placeholder="Número de factura"
              className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-4 py-3 font-bold focus:ring-2 focus:ring-rose-300" />
            <p id="invoice-help" className="text-xs text-gray-500">
              {isEditMode
                ? 'Edición administrativa del contrato existente. El número de contrato, firma y estado actual se conservarán.'
                : 'El número de factura es obligatorio para guardar y generar el contrato.'}
            </p>
          </section>

          {isEditMode && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-black text-amber-900 uppercase text-sm">Edición posterior al contrato</p>
                <p className="text-sm text-amber-800 mt-1">
                  Estás modificando el contrato pactado <strong>{editingContractNumber}</strong>. Los cambios quedarán auditados y se volverá a validar la disponibilidad de todos los vestidos.
                </p>
              </div>
            </div>
          )}


          <ContractAllyMode value={aliadoModo} onChange={setAliadoModo} descuento={descuentoAliado} numero={editingContractNumber}
            total={Math.max(0, valorAlquilerNum - vipDiscount - descuentoAliado) + (parseFloat(String(formData.servicios_adicionales).replace(/[^0-9.-]+/g, '')) || 0)}
            disabled={isEditMode && !['borrador','pendiente_admin'].includes(String(editingContractState).toLowerCase()) && String(userRole).toLowerCase() !== 'admin'}
            onAlly={a => setFormData(prev => ({ ...prev, cliente_nombre: a.nombre, cliente_documento: a.cedula, cliente_email: a.correo, whatsapp: a.celular, direccion: a.direccion }))}
            onClienta={c => setFormData(prev => ({ ...prev, quinceanera_name: c.clienta_nombre, fecha_evento: prev.fecha_evento || c.fecha_evento }))} />
          {/* SECCIÓN 1: DATOS BÁSICOS */}
          <section className="space-y-6">
            <h2 className="text-2xl font-bold border-b border-gray-200 pb-2 text-gray-800 flex items-center gap-2">
              <User className="text-rose-500" /> Información Cliente
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-rose-500" /> Sede <span className="text-rose-500">*</span>
                </label>
                <select
                  name="sede_id"
                  value={formData.sede_id}
                  onChange={(e) => {
                    const selected = sedesList.find(s => s.id === e.target.value);
                    setFormData(prev => ({ ...prev, sede_id: e.target.value, sede: selected?.nombre || '' }));
                  }}
                  className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-4 py-3 font-bold focus:ring-2 focus:ring-rose-300"
                  required
                >
                  <option value="">Selecciona Sede...</option>
                  {sedesList.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-rose-500" /> Asesora Responsable <span className="text-rose-500">*</span>
                </label>
                <select
                  name="asesora_id"
                  value={formData.asesora_id}
                  onChange={(e) => {
                    const selected = asesorasList.find(a => a.id === e.target.value);
                    setFormData(prev => ({ ...prev, asesora_id: e.target.value, asesora: selected?.nombre_completo || '' }));
                  }}
                  disabled={!formData.sede_id}
                  className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-4 py-3 font-bold focus:ring-2 focus:ring-rose-300 disabled:opacity-50"
                  required
                >
                  {!formData.sede_id ? (
                    <option value="">Selecciona primero una sede</option>
                  ) : asesorasFiltradas.length === 0 ? (
                    <option value="">No hay asesoras registradas en esta sede</option>
                  ) : (
                    <>
                      <option value="">Selecciona Asesora...</option>
                      {asesorasFiltradas.map(a => (
                        <option key={a.id} value={a.id}>{a.nombre_completo}</option>
                      ))}
                    </>
                  )}
                </select>
              </div>
              {renderTextInput("Nombre Completo", "cliente_nombre", <User className="w-4 h-4 text-rose-500" />, "text", true)}
              {renderTextInput("Documento/CC", "cliente_documento", <FileText className="w-4 h-4 text-rose-500" />, "text", true)}
              {renderTextInput("WhatsApp", "whatsapp", <Phone className="w-4 h-4 text-rose-500" />, "tel", true)}
              {renderTextInput("Correo", "cliente_email", <Mail className="w-4 h-4 text-rose-500" />, "email", true)}
              {renderTextInput("Dirección", "direccion", <MapPin className="w-4 h-4 text-rose-500" />, "text", false, "lg:col-span-2")}
              {renderTextInput("Nombre de la Quinceañera", "quinceanera_name", <User className="w-4 h-4 text-emerald-500" />, "text", true, "lg:col-span-2")}
            </div>
          </section>

          {/* SECCIÓN 2: LOGÍSTICA & EVENTO */}
          <section className="space-y-6 bg-rose-50/50 p-6 rounded-2xl border border-rose-100">
            <h2 className="text-2xl font-bold border-b border-rose-200 pb-2 text-gray-800 flex items-center gap-2">
              <Calendar className="text-rose-500" /> Logística de Evento
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700">Tipo de Evento</label>
                <select name="tipo_evento" value={formData.tipo_evento} onChange={handleChange} className="w-full bg-white border border-gray-200 text-gray-900 rounded-xl px-4 py-3 font-bold focus:ring-2 focus:ring-rose-300">
                  <option value="Evento">Evento General</option>
                  <option value="PreXV">Sesión Pre XV</option>
                  <option value="Ambos">Ambos (Combo)</option>
                </select>
              </div>

              {/* Dependencia: Fecha Evento */}
              {(formData.tipo_evento === 'Evento' || formData.tipo_evento === 'Ambos') &&
                renderTextInput("Fecha del Evento", "fecha_evento", <Calendar className="w-4 h-4 text-rose-500" />, "date", true)
              }

              {/* Dependencia: Tipo Envío */}
              {(formData.tipo_evento === 'Evento' || formData.tipo_evento === 'Ambos') && (
                <div className="space-y-1 transition-opacity">
                  <label className="text-sm font-semibold text-gray-700">Tipo Envío</label>
                  <select name="tipo_entrega" value={formData.tipo_entrega} onChange={handleChange} className="w-full bg-white border border-gray-200 text-gray-900 rounded-xl px-4 py-3 font-bold focus:ring-2 focus:ring-rose-300">
                    <option value="Local">Local (5 días bloq.)</option>
                    <option value="Nacional">Nacional (8 días bloq.)</option>
                  </select>
                </div>
              )}
            </div>

            <PreXvFields value={{ ...prexv, fecha_pre_xv: formData.fecha_fotografia }} onChange={patch => {
              setPrexv(prev => ({ ...prev, ...patch }));
              if ('fecha_pre_xv' in patch) setFormData(prev => ({ ...prev, fecha_fotografia: patch.fecha_pre_xv || '' }));
            }} disabled={loading} />
            {!prexv.prexv_componentes?.length && (formData.tipo_evento === 'PreXV' || formData.tipo_evento === 'Ambos') && renderTextInput('Fecha de uso del vestido PRE-XV', 'fecha_fotografia', <Calendar className="w-4 h-4" />, 'date', true)}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
              {renderTextInput("Cita Medidas", "cita_medidas", <Calendar className="w-4 h-4 text-rose-500" />, "date")}
              {renderTextInput("Prueba Final", "prueba_final", <Calendar className="w-4 h-4 text-rose-500" />, "date")}
              {renderTextInput("Entrega/Envío Vestido", "fecha_entrega", <Calendar className="w-4 h-4 text-rose-500" />, "date")}
            </div>
          </section>

          {/* BLOQUEO DE FECHAS ESPECIALES */}
          <section className="space-y-5 bg-amber-50/60 p-6 rounded-2xl border border-amber-200">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold border-b border-amber-200 pb-2 text-gray-800 flex items-center gap-2">
                  <Calendar className="text-amber-600" /> Bloqueo fechas especiales
                </h2>
                <p className="text-sm text-amber-800 mt-2">
                  Agrega todas las fechas adicionales que necesites. Cada fecha bloqueará automáticamente todos los vestidos vinculados a este contrato.
                </p>
              </div>
              <button type="button" onClick={addFechaBloqueoEspecial} className="shrink-0 flex items-center justify-center gap-2 bg-amber-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-amber-700 transition-colors">
                <Plus className="w-4 h-4" /> Agregar fecha
              </button>
            </div>

            <div className="bg-white/80 border border-amber-200 rounded-xl p-4">
              <span className="text-xs uppercase tracking-wider font-black text-amber-700">Referencias que quedarán bloqueadas</span>
              <p className="mt-1 font-bold text-gray-900">
                {vestidos.filter(v => v.referencia.trim()).length > 0
                  ? vestidos.filter(v => v.referencia.trim()).map(v => v.referencia.trim().toUpperCase()).join(' · ')
                  : 'Selecciona primero los vestidos del contrato'}
              </p>
              <p className="text-xs text-gray-500 mt-1">Si agregas o cambias un vestido del contrato, estas fechas se aplicarán también a esa referencia.</p>
            </div>

            {fechasBloqueoEspecial.length === 0 ? (
              <div className="border-2 border-dashed border-amber-200 rounded-xl p-5 text-center text-sm text-amber-700">
                No hay fechas especiales agregadas.
              </div>
            ) : (
              <div className="space-y-3">
                {fechasBloqueoEspecial.map((fecha, idx) => (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end bg-white p-4 rounded-xl border border-amber-200">
                    <div className="space-y-1">
                      <label className="text-sm font-semibold text-gray-700">Fecha por bloquear #{idx + 1}</label>
                      <input type="date" value={fecha} onChange={(e) => updateFechaBloqueoEspecial(idx, e.target.value)} className="w-full bg-white border border-gray-200 text-gray-900 rounded-xl px-4 py-3 font-bold focus:outline-none focus:ring-2 focus:ring-amber-300" />
                    </div>
                    <button type="button" onClick={() => removeFechaBloqueoEspecial(idx)} className="h-[50px] px-4 rounded-xl border border-red-200 bg-red-50 text-red-600 font-bold hover:bg-red-100 transition-colors flex items-center justify-center gap-2">
                      <Trash2 className="w-4 h-4" /> Quitar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* SECCIÓN 3: INVENTARIO, ACCESORIOS Y ARREGLOS */}
          <section className="space-y-6">
            <h2 className="text-2xl font-bold border-b border-gray-200 pb-2 text-gray-800 flex items-center gap-2">
              <Tag className="text-rose-500" /> Vestido & Adaptaciones
            </h2>

            <div className="flex justify-between items-center mb-4 mt-2 border-b border-gray-200 pb-2">
              <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2"><Tag className="w-5 h-5 text-rose-500" /> Vestidos Seleccionados</h3>
              <button type="button" onClick={addVestido} className="flex items-center gap-1 text-sm bg-rose-100 text-rose-700 px-4 py-2 rounded-lg hover:bg-rose-200 transition-colors font-bold shadow-sm border border-rose-200">
                <Plus className="w-4 h-4" /> Agregar Referencia
              </button>
            </div>

            <div className="space-y-4">

              {/* Datalist Oculto para Combobox Nativo */}
              <datalist id="vestidos-opts">
                {vestidosMaestro.map((vm, i) => (
                  <option key={i} value={vm.codigo_referencia}>{vm.nombre} ({vm.talla})</option>
                ))}
              </datalist>

              {vestidos.map((v, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-6 rounded-2xl border border-gray-200 relative group transition-all hover:border-rose-200">
                  {vestidos.length > 1 && (
                    <button type="button" onClick={() => removeVestido(idx)} title="Eliminar este vestido" className="absolute top-4 right-4 text-gray-400 hover:text-rose-600 p-2 bg-white rounded-full shadow-sm hover:shadow transition-all border border-gray-100 z-20">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <div className="space-y-1 relative">
                    <label className="text-sm font-semibold text-gray-700">Buscador de Vestido *</label>
                    <div className="relative">
                      <input
                        type="text"
                        autoComplete="off"
                        placeholder={formData.sede_id ? "Busca por código o nombre..." : "⚠️ Primero elige una Sede"}
                        value={v.referencia}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase();
                          updateVestidoMulti(idx, { referencia: val });
                          const found = vestidosMaestro.find(vm =>
                            (vm.codigo || '').trim().toUpperCase() === val ||
                            (vm.nombre || '').trim().toUpperCase() === val
                          );
                          if (found) {
                            updateVestidoMulti(idx, {
                              referencia: found.codigo,
                              vestido_id: found.id
                            });
                          } else {
                            updateVestidoMulti(idx, { vestido_id: null });
                          }
                        }}
                        className={`w-full bg-white border text-gray-900 rounded-xl px-4 py-3 focus:ring-2 font-bold tracking-widest uppercase transition-all pr-10 relative z-10 ${v.referencia && !v.vestido_id
                            ? 'border-amber-400 bg-amber-50 ring-amber-100'
                            : busyVestidoIds.has(v.vestido_id || '')
                              ? (conflictSeverity === 'yellow' ? 'border-amber-400 ring-amber-100 bg-amber-50' : 'border-rose-500 ring-rose-200 bg-rose-50')
                              : 'border-gray-200 focus:ring-rose-300'
                          }`}
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2 z-20 pointer-events-none">
                        {loadingVestidos ? (
                          <Loader2 className="w-4 h-4 text-rose-400 animate-spin" />
                        ) : v.vestido_id ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        ) : (
                          <div className="w-5 h-5 border-2 border-gray-200 border-dashed rounded-full" />
                        )}
                      </div>
                    </div>

                    {/* Resultados de búsqueda rápidos */}
                    {/* Alerta de inventario vació (Opcional, mantenemos por si acaso pero limpio) */}

                    {v.referencia.length > 1 && !v.vestido_id && vestidosMaestro.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 max-h-48 overflow-y-auto animate-in slide-in-from-top-2 duration-200">
                        {vestidosMaestro
                          .filter(vm =>
                            (vm.codigo || '').toLowerCase().includes(v.referencia.toLowerCase()) ||
                            (vm.nombre || '').toLowerCase().includes(v.referencia.toLowerCase())
                          )
                          .slice(0, 8)
                          .map((vm) => (
                            <button
                              key={vm.id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                if (busyVestidoIds.has(vm.id)) {
                                  setConflictDressCode(vm.codigo);
                                  setShowConflictModal(true);
                                  return;
                                }
                                updateVestidoMulti(idx, {
                                  referencia: vm.codigo,
                                  vestido_id: vm.id,
                                  tipo: vm.categoria || 'XV'
                                });
                                // --- PRECIO DINÁMICO ---
                                if (!formData.valor_total && vm.precio_sugerido) {
                                  setFormData(prev => ({ ...prev, valor_total: vm.precio_sugerido.toString() }));
                                  toast.success(`Precio base aplicado: $${vm.precio_sugerido.toLocaleString()}`);
                                }
                                // --- ALERTA CROSS-BRANCH ---
                                if (vm.sede_actual_id !== formData.sede_id) {
                                  setCrossBranchWarning({ active: true, origin: vm.sedes?.nombre || 'Otra Sede', codigo: vm.codigo });
                                } else {
                                  setCrossBranchWarning({ active: false, origin: '', codigo: '' });
                                }
                                setLoadingVestidos(false);
                              }}
                              onClick={() => {
                                if (busyVestidoIds.has(vm.id)) {
                                  setConflictDressCode(vm.codigo);
                                  setShowConflictModal(true);
                                  return;
                                }
                                updateVestidoMulti(idx, {
                                  referencia: vm.codigo,
                                  vestido_id: vm.id
                                });
                                if (!formData.valor_total && vm.precio_sugerido) {
                                  setFormData(prev => ({ ...prev, valor_total: vm.precio_sugerido.toString() }));
                                }
                                if (vm.sede_actual_id !== formData.sede_id) {
                                  setCrossBranchWarning({ active: true, origin: vm.sedes?.nombre || 'Otra Sede', codigo: vm.codigo });
                                } else {
                                  setCrossBranchWarning({ active: false, origin: '', codigo: '' });
                                }
                                setLoadingVestidos(false);
                              }}
                              className="w-full text-left px-4 py-3 hover:bg-rose-50 flex justify-between items-center border-b border-gray-50 last:border-none transition-colors cursor-pointer"
                            >
                              <div className="flex flex-col">
                                <span className="font-black text-gray-900 truncate uppercase">
                                  {vm.codigo} - {vm.sedes?.nombre || formData.sede}
                                </span>
                                <span className="text-[9px] text-gray-400 font-bold uppercase">{vm.talla} | {vm.color}</span>
                                {busyVestidoIds.has(vm.id) && (
                                  <span className="text-[8px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded mt-1 font-black inline-block w-fit">CONOCER DISPONIBILIDAD</span>
                                )}
                              </div>
                              <span className={`text-[8px] px-2 py-1 rounded-md font-black border ${busyVestidoIds.has(vm.id) ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                }`}>
                                {busyVestidoIds.has(vm.id) ? 'RESERVADO' : 'DISPONIBLE'}
                              </span>
                            </button>
                          ))
                        }
                        {vestidosMaestro.filter(vm =>
                          (vm.codigo || '').toLowerCase().includes(v.referencia.toLowerCase()) ||
                          (vm.nombre || '').toLowerCase().includes(v.referencia.toLowerCase())
                        ).length === 0 && (
                            <div className="p-4 text-center">
                              <p className="text-xs text-gray-400 font-bold italic">No se encontraron coincidencias exactas.</p>
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-gray-700">Clasificación / Uso</label>
                    <select value={v.tipo} onChange={(e) => updateVestido(idx, 'tipo', e.target.value)} className="w-full bg-white border border-gray-200 text-gray-900 rounded-xl px-4 py-3 focus:ring-2 focus:ring-rose-300 font-medium h-[50px]">
                      <option value="XV">XV Años</option>
                      <option value="Gala">Gala</option>
                      <option value="Cambio">Vestido Retoque / Cambio</option>
                      <option value="Novia">Novia</option>
                      <option value="Invitada">Invitada General</option>
                    </select>
                  </div>
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-sm font-semibold text-gray-700">Observaciones del Estado o Entrega</label>
                    <textarea value={v.observaciones} onChange={(e) => updateVestido(idx, 'observaciones', e.target.value)} className="w-full bg-white border border-gray-200 text-gray-900 rounded-xl px-4 py-3 focus:ring-2 focus:ring-rose-300 transition-all focus:bg-white" rows={2} placeholder="Ej: Talla ajustable, requiere tintorería express..."></textarea>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Accesorios */}
              <div className="space-y-3">
                <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2"><Briefcase className="w-4 h-4 text-rose-500" /> Accesorios Incluidos</h3>
                <div className="grid grid-cols-2 gap-3 p-4 border border-gray-200 rounded-xl bg-white shadow-sm">
                  {opcionesAccesorios.map(ac => (
                    <label key={ac} className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer hover:text-rose-600 transition-colors">
                      <input
                        type="checkbox"
                        checked={accesoriosSeleccionados.includes(ac)}
                        onChange={() => handleCheckboxArray(ac, accesoriosSeleccionados, setAccesoriosSeleccionados)}
                        className="w-4 h-4 accent-rose-500 rounded"
                      />
                      {ac}
                    </label>
                  ))}
                </div>
              </div>

              {/* Arreglos */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2"><Scissors className="w-4 h-4 text-rose-500" /> Módulo Arreglos</h3>
                  <button type="button" onClick={addArreglo} className="flex items-center gap-1 text-sm bg-rose-100 text-rose-700 px-3 py-1.5 rounded-lg hover:bg-rose-200 transition-colors font-bold shadow-sm">
                    <Plus className="w-4 h-4" /> Fila
                  </button>
                </div>
                {arreglos.length === 0 ? (
                  <p className="text-sm text-gray-400 italic text-center py-4 border-2 border-dashed rounded-xl">Sin arreglos cobrados adicionales.</p>
                ) : (
                  <div className="space-y-2">
                    {arreglos.map((arr, idx) => (
                      <div key={idx} className="flex gap-2 items-center bg-white p-2 border border-gray-200 rounded-xl shadow-sm">
                        <input type="text" placeholder="Ej. Dobladillo" value={arr.tipo} onChange={(e) => updateArreglo(idx, 'tipo', e.target.value)} className="w-1/3 p-2 bg-gray-50 rounded-lg text-sm border-gray-200 outline-none focus:ring-1 focus:ring-rose-300" />
                        <input type="text" placeholder="5 cm" value={arr.cm} onChange={(e) => updateArreglo(idx, 'cm', e.target.value)} className="w-1/4 p-2 bg-gray-50 rounded-lg text-sm border-gray-200 outline-none focus:ring-1 focus:ring-rose-300" />
                        <input type="number" placeholder="$ Precio" value={arr.precio} onChange={(e) => updateArreglo(idx, 'precio', e.target.value)} className="w-1/3 p-2 bg-gray-50 rounded-lg text-sm border-gray-200 outline-none font-bold text-rose-700 focus:ring-1 focus:ring-rose-300" />
                        <button type="button" onClick={() => removeArreglo(idx)} className="p-2 text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* SECCIÓN 4: FINANZAS Y GARANTÍA */}
          <section className="space-y-6">
            <h2 className="text-2xl font-bold border-b border-gray-200 pb-2 text-gray-800 flex items-center gap-2">
              <DollarSign className="text-emerald-500" /> Finanzas & Depósitos
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Costos Centrales */}
              <div className="bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100 shadow-sm space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  {renderTextInput("Valor Alquiler Base", "valor_total", <DollarSign className="w-4 h-4 text-emerald-600" />, "number", true)}
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-emerald-600" /> Servicios Adicionales (Maquillaje, Fotografía, Otros)
                    </label>
                    <input
                      type="number"
                      name="servicios_adicionales"
                      value={String(formData.servicios_adicionales)}
                      onChange={handleChange}
                      className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-rose-300 font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="space-y-1 col-span-2">
                    <label className="text-sm font-semibold text-gray-600 flex items-center gap-2 px-1">Costo Arreglos (+)</label>
                    <div className="w-full bg-white border border-gray-200 text-gray-900 rounded-xl px-4 py-3 font-bold text-lg opacity-80 cursor-not-allowed">
                      $ {totalArreglos.toLocaleString('es-CO')}
                    </div>
                  </div>
                </div>

                {/* VIP Code Section - solo al crear */}
                {!isEditMode && (
                <div className="p-4 bg-white border border-rose-100 rounded-xl shadow-sm">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-2">
                    <Tag className="w-4 h-4 text-rose-500" /> Código VIP de Referido
                  </label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={vipCodeInput}
                      onChange={(e) => setVipCodeInput(e.target.value)}
                      disabled={vipStatus === 'success' || vipStatus === 'loading'}
                      placeholder="Ej: AMBAR-ABCD"
                      className="flex-1 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-4 py-2.5 font-medium focus:ring-2 focus:ring-rose-300 disabled:opacity-50 outline-none"
                    />
                    {vipStatus === 'success' ? (
                      <button 
                        type="button"
                        onClick={() => {
                          setVipStatus('idle');
                          setVipCodeInput('');
                          setVipDiscount(0);
                          setVipMessage('');
                        }}
                        className="bg-red-50 text-red-600 border border-red-200 px-5 py-2.5 rounded-xl font-medium hover:bg-red-100 flex items-center gap-2 transition-colors"
                        title="Remover código y restaurar precio"
                      >
                        <Trash2 className="w-4 h-4" /> Remover
                      </button>
                    ) : (
                      <button 
                        type="button"
                        onClick={handleValidateVIP}
                        disabled={vipStatus === 'loading' || !vipCodeInput.trim()}
                        className="bg-zinc-900 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-zinc-800 disabled:opacity-50 flex items-center gap-2 transition-colors"
                      >
                        {vipStatus === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Validar'}
                      </button>
                    )}
                  </div>
                  {vipStatus === 'error' && (
                    <p className="text-red-500 text-xs font-semibold mt-2 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {vipMessage}
                    </p>
                  )}
                  {vipStatus === 'success' && (
                    <div className="mt-2 space-y-1">
                      <p className="text-emerald-600 text-xs font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" /> ✨ Descuento aplicado por invitación de {vipAliado}
                      </p>
                      <p className="text-rose-600 text-[11px] font-bold uppercase tracking-wider">
                        Descuento Aliado: -${vipDiscount.toLocaleString('es-CO')}
                      </p>
                    </div>
                  )}
                </div>
                )}
                
                <div className="grid grid-cols-2 gap-4 items-end">
                  {renderTextInput("Abono Inicial", "anticipo", <DollarSign className="w-4 h-4 text-emerald-600" />, "number", true)}
                  <div className="p-3 bg-white rounded-xl shadow-inner border border-rose-200 text-center relative overflow-hidden group">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Saldo Final Real</span>
                    <span className="text-2xl font-black text-rose-600">${saldoCalc.toLocaleString('es-CO')}</span>
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-rose-500"></div>
                  </div>
                </div>

                {!isEditMode && (parseFloat(String(formData.anticipo).replace(/[^0-9.-]+/g, "")) || 0) > 0 && (
                  <PaymentSupportUpload
                    sedeId={formData.sede_id}
                    value={anticipoSoportes}
                    onChange={setAnticipoSoportes}
                    onBusyChange={setSubiendoSoporte}
                    help="Comprobante de la transferencia o del pago. Obligatorio para guardar el contrato."
                    missingMessage="Falta el soporte de ingreso. Adjunta el comprobante del anticipo para poder guardar el contrato."
                  />
                )}

                <div className="pt-2 border-t border-emerald-200/50">
                  <h3 className="font-bold text-gray-700 mb-2 text-sm">Métodos de Pago Utilizados (Abono)</h3>
                  <div className="flex flex-wrap gap-2">
                    {opcionesPago.map(mp => (
                      <label key={mp} className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-semibold cursor-pointer hover:border-emerald-300 transition-colors">
                        <input type="checkbox" checked={metodosPago.includes(mp)} onChange={() => handleCheckboxArray(mp, metodosPago, setMetodosPago)} className="w-4 h-4 accent-emerald-500" /> {mp}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2"><ContractRetabloSection contractId={editingContractId} value={retablo} onChange={setRetablo} onLoaded={setHadRetablo} /></div>
              {/* Info Garante */}
              <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-gray-800 mb-2 border-b border-gray-200 pb-2">
                  <ShieldCheck className="w-5 h-5 text-gray-500" />
                  <h3 className="font-bold">Datos Cuenta Bancaria (Devolución Garantía)</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1">
                    <label htmlFor="valor_deposito" className="text-sm font-semibold text-gray-700">Valor del depósito de garantía</label>
                    <input id="valor_deposito" name="valor_deposito" type="number" min="0" step="0.01" value={formData.valor_deposito} onChange={handleChange} disabled={isEditMode && !canFixInitial} title={isEditMode && !canFixInitial ? 'El depósito de un contrato pactado se gestiona desde Depósitos y devoluciones.' : undefined} placeholder="0" className="w-full bg-white border border-gray-200 text-gray-900 rounded-xl px-4 py-3 disabled:opacity-60 disabled:cursor-not-allowed" />
                    {canFixInitial && (Number(formData.anticipo || 0) !== Number(editingSnapshot?.anticipo || 0) || Number(formData.valor_deposito || 0) !== Number(editingSnapshot?.valor_deposito || 0)) && (
                      <label className="block text-sm font-semibold text-amber-800">Motivo de la corrección del abono inicial / depósito (obligatorio)
                        <input value={motivoValores} onChange={e => setMotivoValores(e.target.value)} maxLength={500} placeholder="Explica por qué se corrige el valor" className="w-full mt-1 bg-white border border-amber-300 text-gray-900 rounded-xl px-4 py-3" />
                      </label>
                    )}
                    {depositoSugerido !== null && !isEditMode && (
                      <div className="flex flex-wrap items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 text-sm text-emerald-800">
                        <span>Depósito sugerido según la tabla: <b>{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(depositoSugerido)}</b></span>
                        {Number(formData.valor_deposito) !== depositoSugerido && <button type="button" onClick={() => setFormData(prev => ({ ...prev, valor_deposito: String(depositoSugerido) }))} className="px-3 py-1 rounded-lg bg-emerald-600 text-white font-bold text-xs">Usar este valor</button>}
                      </div>
                    )}
                    <p className="text-sm text-emerald-700">Registra el depósito recibido. No se suma al alquiler ni al abono. Adjunta su comprobante en Depósitos y devoluciones, sin registrar nuevamente el ingreso.</p>
                  </div>
                  {renderTextInput("Banco", "deposito_banco", null, "text", false, "bg-white")}
                  {renderTextInput("Tipo Cta", "deposito_tipo_cuenta", null, "text", false, "bg-white")}
                  {renderTextInput("N° Cuenta", "deposito_numero", null, "text", false, "bg-white")}
                  {renderTextInput("Titular Cta", "deposito_titular", null, "text", false, "bg-white")}
                </div>
                <p className="text-xs text-gray-400 font-medium italic mt-2 text-center">
                  La devolución se programa en 72hrs previa inspección.
                </p>
              </div>
            </div>
          </section>

          {/* Alerta de Conflicto de Sede (Cross-Branch) */}
          {crossBranchWarning.active && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm animate-in zoom-in-95 duration-200">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center shrink-0 shadow-lg shadow-orange-200">
                  <MapPin className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-black text-orange-900 text-lg uppercase tracking-tight">⚠️ Cruce de Sedes Detectado</h3>
                  <p className="text-orange-800 font-medium text-sm">
                    El vestido <span className="font-bold">{crossBranchWarning.codigo}</span> está ubicado físicamente en <span className="font-black">{crossBranchWarning.origin}</span>.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 w-full md:w-auto">
                {(userRole === 'admin' || adminAuthorizedTransfer) ? (
                  <div className="flex items-center gap-2 bg-emerald-100 text-emerald-800 px-4 py-3 rounded-xl font-bold text-sm shadow-inner uppercase tracking-wider">
                    <CheckCircle2 className="w-5 h-5" /> Traslado Autorizado
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAdminAuthorizedTransfer(true)}
                    className="w-full md:w-auto px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white font-black rounded-xl shadow-xl shadow-orange-200 transition-all active:scale-95 text-sm uppercase tracking-wider flex items-center gap-2"
                  >
                    <ShieldCheck className="w-4 h-4" /> Autorizar Traslado
                  </button>
                )}
              </div>
            </div>
          )}

          {/* CLÁUSULA DÉCIMO SÉPTIMA: USO DE IMAGEN */}
          <section className="bg-white p-6 rounded-3xl border-2 border-rose-100 shadow-sm space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 mt-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-rose-100 rounded-lg flex items-center justify-center">
                    <Camera className="w-5 h-5 text-rose-600" />
                  </div>
                  <h3 className="font-black text-gray-900 uppercase tracking-tight">Autorización de Uso de Imagen</h3>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed font-medium mt-2">
                  EL CONTRATANTE/ARRENDATARIO, y LA QUINCEAÑERA, autorizan el uso de su imagen y datos personales en cualquier material publicitario, promocional y de marketing (Redes Sociales, Medios impresos, Medios audiovisuales). Válido por 10 años. Renuncian a compensación.
                </p>
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                <label className="relative inline-flex items-center cursor-pointer group">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={formData.autoriza_uso_imagen}
                    onChange={(e) => setFormData({ ...formData, autoriza_uso_imagen: e.target.checked })}
                  />
                  <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-rose-500 shadow-inner"></div>
                </label>
                <span className={`text-[10px] font-black uppercase tracking-widest ${formData.autoriza_uso_imagen ? 'text-rose-600' : 'text-gray-400'}`}>
                  {formData.autoriza_uso_imagen ? 'Aprobado (Cláusula 17)' : 'No Autorizado'}
                </span>
              </div>
            </div>
          </section>

          {/* Submit */}
          <div className="pt-6 border-t border-gray-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={handleBack}
                className="w-full py-4 px-6 bg-white hover:bg-gray-50 text-gray-400 hover:text-gray-600 font-black text-lg transition-all rounded-2xl border-2 border-gray-100 flex items-center justify-center gap-2 shadow-sm uppercase tracking-widest"
              >
                <XCircle className="w-5 h-5" /> Cancelar
              </button>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={
                  loading ||
                  subiendoSoporte ||
                  (!isEditMode && (parseFloat(String(formData.anticipo).replace(/[^0-9.-]+/g, "")) || 0) > 0 && !anticipoSoportes.length) ||
                  vestidos.some(v => !v.vestido_id || busyVestidoIds.has(v.vestido_id || '')) ||
                  (crossBranchWarning.active && !adminAuthorizedTransfer && userRole !== 'admin')
                }
                className="w-full relative overflow-hidden group rounded-2xl p-4 shadow-xl shadow-rose-200 text-white font-black text-xl transition-all disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed hover:scale-[1.01]"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-rose-500 to-rose-600 group-hover:from-rose-600 group-hover:to-rose-700 transition-colors"></div>
                <div className="relative z-10 flex items-center justify-center gap-3">
                  {loading
                    ? <span className="animate-pulse">{isEditMode ? 'Guardando Cambios...' : 'Validando Logística...'}</span>
                    : <><Save className="w-6 h-6" /> {isEditMode ? 'Guardar Cambios del Contrato' : 'Procesar y Generar Contrato'}</>}
                </div>
              </button>
            </div>
          </div>

        </form>
        {/* Modal de Conflicto de Disponibilidad */}
        {showConflictModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="bg-rose-600 p-6 text-center text-white">
                <div className="bg-white/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/30">
                  <AlertTriangle className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tight">🚫 Vestido No Disponible</h3>
              </div>
              <div className="p-8 text-center space-y-4">
                <p className="text-gray-600 font-medium leading-relaxed">
                  El Vestido <span className="font-black text-gray-900 underline decoration-rose-500 decoration-2">{conflictDressCode}</span> está en un <span className="text-rose-600 font-bold uppercase">Bloqueo Total</span>.
                  <br /><br />
                  La diferencia entre fechas es <strong>menor a {conflictDays} días</strong>, lo cual no permite tiempo suficiente para lavandería y arreglos. No es posible solicitar autorización para este periodo.
                </p>
                <p className="text-sm border-l-4 border-rose-500 bg-rose-50 p-3 italic text-gray-500 font-semibold rounded-r-xl">
                  🚫 No Disponible (Menos de {conflictDays} días)
                </p>
                <button
                  onClick={() => setShowConflictModal(false)}
                  className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold py-4 rounded-2xl transition-all shadow-lg hover:shadow-gray-200 uppercase tracking-widest text-sm"
                >
                  Aceptar
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Modal de Alistamiento (Yellow Zone) Optimized */}
        {showYellowModal && (
          <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border-4 border-amber-400">
              <div className="p-8 bg-amber-400 text-gray-900">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-lg">
                    <Clock className="w-8 h-8 text-amber-500" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black uppercase tracking-tight">Alerta de Alistamiento</h2>
                    <p className="text-amber-900 text-xs font-black uppercase tracking-widest opacity-80">Zona Amarilla Logística</p>
                  </div>
                </div>
              </div>

              <div className="p-8 space-y-6">
                <div className="bg-amber-50 border-2 border-amber-200 p-6 rounded-3xl space-y-3">
                  <p className="font-bold text-gray-800 leading-relaxed text-sm">
                    El vestido <span className="text-amber-700 font-black">"{alistamientoData?.referencia || conflictDressCode}"</span> entra en el rango de <span className="text-amber-600 font-black uppercase">Permiso Especial</span> (5 a 10 días).
                    {alistamientoData?.contratoPadre && (
                      <span className="block mt-2 text-xs text-gray-500">
                        Cruce con contrato: #{alistamientoData.contratoPadre} (Evento: {alistamientoData.fechaOcupado})
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-2 text-amber-600 font-black text-[10px] uppercase tracking-widest bg-white/50 p-2 rounded-lg border border-amber-100">
                    <Clock className="w-4 h-4" />
                    Requiere Autorización del Administrador
                  </div>
                </div>

                <p className="text-xs text-gray-400 font-medium px-2 text-center">
                  ¿Deseas solicitar una autorización especial para alquilar esta prenda en este periodo? El contrato se creará con estado <span className="font-bold underline">"Pendiente de Aprobación"</span>.
                </p>

                <div className="flex gap-4 pt-4">
                  <button
                    onClick={() => setShowYellowModal(false)}
                    className="flex-1 py-4 border-2 border-gray-100 rounded-2xl font-black text-gray-400 hover:bg-gray-50 transition-all uppercase tracking-widest text-[10px]"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSolicitarAutorizacion}
                    disabled={isSubmittingException}
                    className="flex-[2] py-4 bg-gray-900 hover:bg-black text-white rounded-2xl font-black transition-all shadow-lg shadow-amber-100 disabled:opacity-50 uppercase tracking-widest text-[10px] flex items-center justify-center gap-2"
                  >
                    {isSubmittingException ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Solicitar Autorización'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
