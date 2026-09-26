'use client';
import PreXvFields from '@/components/PreXvFields';
import { generateBlockedRanges, rangesOverlap } from '@/lib/availability';
import { saveCalendarContract } from '@/lib/save-calendar-contract';
import { hasPrexv, includedPrexv, prexvPending, prexvSummary, prexvFields, type PrexvData } from '@/lib/prexv';
import { dateInput } from '@/lib/calendar-edit';
import DepositAlert, {useDepositCount} from '@/components/DepositAlert';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { requireInvoice, INVOICE_REQUIRED_MESSAGE } from '@/lib/invoice-validation';
import { canEditSavedRecords, additionalContractFields, toEditingValue, getAdditionalContractUpdates } from '@/lib/saved-record-editing';
import { Toaster, toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { 
  FileText, 
  Clock, 
  DollarSign, 
  Link as LinkIcon, 
  AlertCircle,
  TrendingUp,
  TrendingDown,
  MapPin,
  ShieldCheck,
  ChevronLeft,
  Building2,
  Users,
  MessageCircle,
  MessageSquare,
  Phone,
  ArrowRight,
  UploadCloud,
  RefreshCw,
  Loader2,
  LogOut,
  Download,
  CheckCircle2,
  XCircle,
  X,
  Edit2, 
  Edit3,
  Trash2,
  Search,
  Package,
  Truck,
  Camera,
  MoreVertical,
  CalendarDays,
  Hourglass,
  Settings,
  Tag,
  ClipboardList,
  ShieldAlert,
  Calendar,
  Plus,
  User,
  AlertTriangle
} from 'lucide-react';
import Link from 'next/link';
import ContractTemplate, { ContractData } from '@/components/ContractTemplate';
import Sidebar from '@/components/Sidebar';

export default function DashboardPage() {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'contratos' | 'vencimientos' | 'logistica'>('contratos');
  const [allVestidos, setAllVestidos] = useState<any[]>([]);
  const [assigningId, setAssigningId] = useState<string | number | null>(null);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [selectedDressToAssign, setSelectedDressToAssign] = useState('');
  const [contratos, setContratos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfGeneratingId, setPdfGeneratingId] = useState<string | null>(null);
  const [contractForPdf, setContractForPdf] = useState<ContractData | null>(null);
  const [plantillas, setPlantillas] = useState<any[]>([]);

  // -- Quality Control Filters --
  const [filtroSede, setFiltroSede] = useState<string>('Todas');
  const [filtroHito, setFiltroHito] = useState<string>('Todos'); // 'Cita de Medidas'|'Prueba Final'|'Fecha de Entrega/Envío'|'Sesión Pre-XV'
  const [filtroRango, setFiltroRango] = useState<string>('Cualquier Fecha'); // 'Hoy'|'Esta Semana'|'Este Mes'|'Personalizado'
  const [fechaDesde, setFechaDesde] = useState<string>('');
  const [fechaHasta, setFechaHasta] = useState<string>('');
  const [filtroAlerta, setFiltroAlerta] = useState<'ninguna' | 'entregas_omitidas' | 'borradores_sin_firmar'>('ninguna');
  // -- PREXV Filter (15 Años) --
  const [filtroTipoEvento, setFiltroTipoEvento] = useState<'Todos' | 'PREXV'>('Todos');

  // -- Modals Quality Control --
  const [missedModalOpen, setMissedModalOpen] = useState(false);
  const [missedData, setMissedData] = useState<{ id: string, type: string, title: string } | null>(null);
  const [missedMotivo, setMissedMotivo] = useState('');
  
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editData, setEditData] = useState<{ contrato: any, fieldKey: string, fieldLabel: string } | null>(null);
  const [editNewDate, setEditNewDate] = useState('');
  const [editMotivo, setEditMotivo] = useState('');
  const [modalLocalHistory, setModalLocalHistory] = useState<any[]>([]);

  // -- Modals Post-Firma QC --
  const [preXvModalOpen, setPreXvModalOpen] = useState(false);
  const [preXvData, setPreXvData] = useState<any>(null);
  const [preXvError, setPreXvError] = useState('');
  const [preXvForm, setPreXvForm] = useState<PrexvData>({ prexv_componentes: [] });
  
  const [editingFacturaId, setEditingFacturaId] = useState<string | null>(null);
  const [facturaValue, setFacturaValue] = useState('');

  // -- Modals Delivery QC --
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);
  const [deliveryData, setDeliveryData] = useState<any>(null);
  const [deliveryObs, setDeliveryObs] = useState('');
  const [deliveryPhotos, setDeliveryPhotos] = useState<File[]>([]);
  const [deliveryType, setDeliveryType] = useState<'PREXV' | 'EVENTO' | 'AMBOS'>('EVENTO');
  const [deliveryConjunta, setDeliveryConjunta] = useState(false);
  const [depositBlock, setDepositBlock] = useState<{id:string;numero:string}|null>(null);
  const [outsideDresses, setOutsideDresses] = useState<any[]>([]);
  const [asesoras, setAsesoras] = useState<any[]>([]);
  const [sedes, setSedes] = useState<any[]>([]);
  const [selectedAsesoraId, setSelectedAsesoraId] = useState<string>('');
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const pendingDeposits = useDepositCount(user ? undefined : null, user?.id);
  const isDashboardAdmin = canEditSavedRecords(user);
  // -- Modals Invoice/Factura QC --
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [invoiceContract, setInvoiceContract] = useState<any>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);
  const [isSubmittingException, setIsSubmittingException] = useState(false);

  // -- Contract 360 View (Drawer) --
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<any>(null);
  const [drawerDelivery, setDrawerDelivery] = useState<any>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  
  // -- Edit State for Drawer --
  const [isEditingDrawer, setIsEditingDrawer] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [asesorasFiltradasEdit, setAsesorasFiltradasEdit] = useState<any[]>([]);
  
  // -- History State for Drawer --
  const [drawerHistory, setDrawerHistory] = useState<any[]>([]);
  const [showDeliveryEvidence, setShowDeliveryEvidence] = useState(false);

  // -- Triage State --
  const [triageModalOpen, setTriageModalOpen] = useState(false);
  const [triageContract, setTriageContract] = useState<any>(null);
  const [triageForm, setTriageForm] = useState({
    tipo: 'Lavandería',
    detalles_danos: '',
    dias_estimados: 2
  });

  const [modalLoading, setModalLoading] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [removingItem, setRemovingItem] = useState<any>(null);
  const [removeReason, setRemoveReason] = useState('');

  // -- Reversion State --
  const [isReversionModalOpen, setIsReversionModalOpen] = useState(false);
  const [reversionReason, setReversionReason] = useState('');
  const [revertingContractId, setRevertingContractId] = useState<string | null>(null);
  const [isReverting, setIsReverting] = useState(false);

  // -- Follow-up Notes State --
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteForm, setNoteForm] = useState({ tipo: 'WhatsApp', contenido: '' });
  const [noteLoading, setNoteLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTabLogistica, setActiveTabLogistica] = useState<'por_entregar' | 'en_evento' | 'lavanderia' | 'historial' | 'anulados'>('por_entregar');
  const [kpiVestidos, setKpiVestidos] = useState<any[]>([]);

  // -- Global Meta State --
  const [globalMetaId, setGlobalMetaId] = useState<string | null>(null);
  const [globalMetaVal, setGlobalMetaVal] = useState<number>(120000000);
  const [isEditGlobalMetaOpen, setIsEditGlobalMetaOpen] = useState(false);
  const [editGlobalMetaInput, setEditGlobalMetaInput] = useState('');
  const [pagosMesActual, setPagosMesActual] = useState<any[]>([]);

  const getPendingInvoicesCount = () => {
    return contratos.filter(c => !c.numero_factura && isOverdue(c.created_at)).length;
  };

  const fetchKPIs = async () => {
    try {
      // 1. Ranking Query para Vestidos por su sede_actual_id
      const rankingQuery = supabase
        .from('contrato_items_vestidos')
        .select(`
          vestido_id,
          vestidos!inner(
            codigo,
            nombre,
            sede_actual_id
          )
        `);
      // 2. Fetch Sedes in parallel with the independent ranking query.
      const [{ data: rankingData, error: rankingErr }, { data: sedesData, error: sedesErr }] = await Promise.all([
        rankingQuery,
        supabase.from('sedes').select('id, nombre')
      ]);
      if (rankingErr) throw rankingErr;
      if (sedesErr) throw sedesErr;

      const sedesMap = new Map((sedesData || []).map((s: any) => [s.id, s.nombre]));

      // 3. Agrupamiento manual seguro por UUID
      const counts: Record<string, any> = {};
      (rankingData || []).forEach((item: any) => {
        const v = item.vestidos as any;
        if (!v) return;
        const codigo = v.codigo;
        if (!counts[codigo]) {
          counts[codigo] = {
            codigo,
            nombre: v.nombre,
            sede_nombre: sedesMap.get(v.sede_actual_id) || 'Sin Sede',
            total_alquileres: 0
          };
        }
        counts[codigo].total_alquileres += 1;
      });

      const sorted = Object.values(counts)
        .sort((a: any, b: any) => b.total_alquileres - a.total_alquileres)
        .slice(0, 5);

      setKpiVestidos(sorted);
    } catch (err) {
      console.error('Error fetching KPIs:', err);
    }
  };



  const getMaintenanceDaysInfo = (fechaSalida: string) => {
    const diff = new Date(fechaSalida).getTime() - new Date().getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  };

  useEffect(() => {
    if (editForm.sede_id) {
      setAsesorasFiltradasEdit(asesoras.filter(a => a.sede_id === editForm.sede_id && a.activo));
    } else {
      setAsesorasFiltradasEdit([]);
    }
  }, [editForm.sede_id, asesoras]);

  useEffect(() => {
    if (typeof window !== 'undefined' && contratos.length > 0 && !drawerOpen) {
      const urlParams = new URLSearchParams(window.location.search);
      const contratoId = urlParams.get('contratoId');
      if (contratoId) {
        window.history.replaceState({}, document.title, window.location.pathname);
        const found = contratos.find(c => c.id === contratoId || c.numero_contrato === contratoId);
        if (found) {
          setSelectedContract(found);
          setDrawerOpen(true);
        }
      }
    }
  }, [contratos, drawerOpen]);

  const validateStoredInvoice = async (id: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.rpc('contract_invoice_for_issue', { contract_id: id });
      if (error) throw error;
      return requireInvoice(data);
    } catch (error: any) {
      toast.error(error?.message || INVOICE_REQUIRED_MESSAGE);
      return null;
    }
  };

  const generatePDF = async (contrato: any) => {
    const numeroFactura = await validateStoredInvoice(contrato.id);
    if (!numeroFactura) return;
    setPdfGeneratingId(contrato.id);
    const mappedData: ContractData = {
      numero_contrato: contrato.numero_contrato,
      numero_factura: numeroFactura,
      sede: contrato.sede,
      cliente_nombre: contrato.cliente_nombre,
      cliente_documento: contrato.cliente_documento,
      cliente_email: contrato.cliente_email,
      cliente_whatsapp: contrato.cliente_whatsapp,
      cliente_direccion: (() => {
        if (!contrato.cliente_direccion) return '—';
        const parts = contrato.cliente_direccion.split(',').map((p: string) => p.trim()).filter((p: string) => p !== '');
        return [...new Set(parts)].join(', ');
      })(),
      fecha_evento: contrato.fecha_evento,
      valor_total: Number(contrato.valor_total) || 0,
      anticipo: Number(contrato.anticipo) || 0,
      saldo: (Number(contrato.valor_total) || 0) + (Number(contrato.total_arreglos) || 0) - (Number(contrato.anticipo) || 0),
      created_at: contrato.created_at,
      firma_base64: contrato.firma_base64,
      tipo_evento: contrato.tipo_evento,
      fecha_pre_xv: contrato.fecha_pre_xv,
      prexv_componentes: contrato.prexv_componentes,
      prexv_fotografo: contrato.prexv_fotografo,
      prexv_maquilladora: contrato.prexv_maquilladora,
      prexv_locacion: contrato.prexv_locacion,

      fecha_cita_medidas: contrato.fecha_cita_medidas,
      fecha_prueba_final: contrato.fecha_prueba_final,
      fecha_entrega_envio: contrato.fecha_entrega_envio,
      tipo_entrega: contrato.tipo_entrega,
      accesorios: Array.isArray(contrato.accesorios) ? contrato.accesorios : (contrato.accesorios ? [contrato.accesorios] : []),
      arreglos: contrato.arreglos || [],
      total_arreglos: Number(contrato.total_arreglos || 0),
      metodos_pago: contrato.metodos_pago,
      banco_deposito: contrato.banco_deposito,
      tipo_cuenta_deposito: contrato.tipo_cuenta_deposito,
      numero_cuenta_deposito: contrato.numero_cuenta_deposito,
      titular_cuenta_deposito: contrato.titular_cuenta_deposito,
      asesora: contrato.asesora,
      vestidos: contrato.items || contrato.vestidos || [], // Los vestidos en la tabla contratos suelen estar NULL si es ERP, usamos el join 'items'
      quinceanera_name: contrato.quinceanera_name,
      autoriza_uso_imagen: contrato.autoriza_uso_imagen,
      fechas_bloqueo_especial: Array.isArray(contrato.fechas_bloqueo_especial) ? contrato.fechas_bloqueo_especial : []
    };
    setContractForPdf(mappedData);
    toast.info('Preparando el PDF, por favor espera un momento...');

    setTimeout(async () => {
      try {
        const element = document.getElementById('hidden-pdf-template');
        if (!element) throw new Error('Contenedor no encontrado');

        const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
          import('html2canvas'),
          import('jspdf')
        ]);
        let canvas;
        try {
          canvas = await html2canvas(element, { 
            scale: 2, 
            useCORS: true, 
            logging: true, // Habilitar logs para depuración de colores lab()
            allowTaint: true,
            onclone: (clonedDoc) => {
              const clonedElement = clonedDoc.getElementById('hidden-pdf-template');
              if (clonedElement) {
                clonedElement.style.padding = '0';
                clonedElement.style.margin = '0';
                clonedElement.style.backgroundColor = '#ffffff';
                const elements = clonedElement.getElementsByTagName('*');
                
                for (let i = 0; i < elements.length; i++) {
                  const el = elements[i] as HTMLElement;
                  
                  // Eliminar sombras agresivamente
                  el.style.boxShadow = 'none';
                  
                  // Sobrescritura garantizada a Hexadecimal
                  const cls = el.className || '';
                  if (typeof cls === 'string') {
                    // Textos
                    if (cls.includes('text-rose-') || cls.includes('text-indigo-')) el.style.color = '#111827';
                    else if (cls.includes('text-gray-900') || cls.includes('text-black')) el.style.color = '#111827';
                    else if (cls.includes('text-gray-700')) el.style.color = '#374151';
                    else if (cls.includes('text-gray-600') || cls.includes('text-gray-500')) el.style.color = '#4b5563';
                    else el.style.color = '#111827';
                    
                    // Fondos
                    if (cls.includes('bg-rose-50') || cls.includes('bg-indigo-50')) el.style.backgroundColor = '#fff1f2';
                    else if (cls.includes('bg-gray-50') || cls.includes('bg-gray-100')) el.style.backgroundColor = '#f9fafb';
                    // ELIMINADO: else el.style.backgroundColor = '#ffffff'; // Esta línea causaba que TODO elemento tuviera fondo blanco, tapando otros textos
                    
                    // Bordes
                    if (cls.includes('border-black') || cls.includes('border-gray-900')) el.style.borderColor = '#111827';
                    else if (cls.includes('border-')) el.style.borderColor = '#d1d5db';
                  }

                  // Si hay inline styles pre-existentes con lab u oklch, pisarlos a fuerza bruta
                  if (el.style.color?.match(/(oklch|lab|lch|oklab)\(/)) el.style.color = '#111827';
                  if (el.style.backgroundColor?.match(/(oklch|lab|lch|oklab)\(/)) el.style.backgroundColor = 'transparent';
                  if (el.style.borderColor?.match(/(oklch|lab|lch|oklab)\(/)) el.style.borderColor = '#d1d5db';
                }

                // NUEVO: Limpieza extrema de las hojas de estilo incrustadas por Tailwind Server
                const styleTags = clonedDoc.getElementsByTagName('style');
                for (let j = 0; j < styleTags.length; j++) {
                  let css = styleTags[j].innerHTML || '';
                  if (css.match(/(oklch|lab|lch|oklab)\(/)) {
                     // Reemplazamos todos los colores modernos por un tono seguro para renderizar
                     styleTags[j].innerHTML = css.replace(/(oklch|lab|lch|oklab)\([^)]+\)/gi, '#111827');
                  }
                }
              }
            }
          });
        } catch (hErr) {
          console.error("HTML2Canvas Error Interno:", hErr);
          throw new Error("Error aislando gráficas de colores. Refresca la ventana y reinténtalo.");
        }

        const imgData = canvas.toDataURL('image/jpeg', 1.0);
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        
        let heightLeft = pdfHeight;
        let position = 0;

        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= pdf.internal.pageSize.getHeight();

        while (heightLeft > 0) {
          position = heightLeft - pdfHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
          heightLeft -= pdf.internal.pageSize.getHeight();
        }

        pdf.save(`Contrato_${contrato.numero_contrato}.pdf`);
        toast.success(`PDF del contrato ${contrato.numero_contrato} descargado con éxito.`);
      } catch (err: any) {
        console.error('Error generando PDF:', err);
        toast.error(err.message || 'Ocurrió un error al generar el PDF.');
      } finally {
        setPdfGeneratingId(null);
        setContractForPdf(null);
      }
    }, 800);
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      window.location.href = '/login';
    } catch (err) {
      console.error(err);
      toast.error('Error al cerrar sesión');
    }
  };

  const fetchContratos = async () => {
    setLoading(true);

    try {
      const [plantillasResult, authResult] = await Promise.all([
      supabase.from('plantillas_contratos').select('*').order('numero_orden', { ascending: true }),
      supabase.auth.getUser()
    ]);
      if (plantillasResult.data) setPlantillas(plantillasResult.data);
      const { data: { user: authUser }, error: authErr } = authResult;
      if (authErr || !authUser) throw new Error("No autenticado");
      setUser(authUser);

      const { data: pData, error: pError } = await supabase
        .from('profiles')
        .select('id, email, rol, nombre, sede_id')
        .eq('id', authUser.id)
        .maybeSingle();

      if (pError) console.error("Error al cargar perfil:", pError.message);
      
      // Valores por defecto si el perfil no existe
      let profile = pData || { rol: 'asesora', sede_id: null, nombre: 'Colaborador' };
      
      setUser({ ...authUser, rol: profile.rol, nombre: profile.nombre });


      // OFICIAL QUERY: Explicit joins to avoid 400 errors and multiple roundtrips
      // Note: Bypassing any backend/server-side filters or conditions like .eq('saldo', 0) or where: { saldo: 0 }.
      // This ensures all draft contracts with all balances travel in the initial payload.
      let query = supabase
        .from('contratos')
        .select(`
          *,
          quinceanera_name,
          arreglos(*),
          items:contrato_items_vestidos(
            *,
            vestido:vestidos(*)
          ),
          entregas:entregas_bitacora(*)
        `)
        .order('created_at', { ascending: false });

      // -- NEW: State Filtering & Global Search (Dashboard 4 Tabs Requeriment) --
      if (searchTerm) {
        // 1. Check if the search term matches any dress code in the database
        const { data: matchedItems } = await supabase
          .from('contrato_items_vestidos')
          .select('contrato_id, vestidos!inner(codigo)')
          .ilike('vestidos.codigo', `%${searchTerm}%`);
        
        let relatedIds: string[] = [];
        if (matchedItems && matchedItems.length > 0) {
          relatedIds = Array.from(new Set(matchedItems.map(m => m.contrato_id)));
        }

        // Búsqueda Global: Construimos el operador .or dinámicamente
        let orQuery = `cliente_nombre.ilike.%${searchTerm}%,cliente_documento.ilike.%${searchTerm}%,numero_contrato.ilike.%${searchTerm}%`;
        
        if (relatedIds.length > 0) {
           orQuery += `,id.in.(${relatedIds.join(',')})`;
        }

        query = query.or(orQuery);
      } else {
        // En el nuevo dashboard de 4 pestañas, fetchContratos trae todo "lo relevante".
        // Eliminamos filtros restrictivos para que la pestaña de HISTORIAL se llene correctamente.
        // Si la tabla crece mucho en el futuro, podríamos añadir .limit(1000).
      }

      if (profile && profile.rol !== 'admin' && profile.sede_id) {
        query = query.eq('sede_id', profile.sede_id);
      }

      const [{ data: finalData, error: errC }, { data: outside }] = await Promise.all([
        query,
        supabase.rpc('vestidos_fuera_activos')
      ]);
      if (errC) {
        console.error("Error en consulta maestra:", errC.message);
        throw errC;
      }

      // DEBUG: removed — data payload confirmed clean by Supabase REST audit.

      const mappedData = (finalData || []).map(c => ({
        ...c,
        prendas: (c as any).items || []
      }));

      // NOTE: Auto-cleanup of expired borradores has been REMOVED.
      // It was silently mutating estado = 'cancelado' on non-zero-balance drafts
      // BEFORE the alert counter ran, which caused the alert to under-count.
      // Draft expiry management must be done explicitly by an admin action, not
      // as a side-effect of the dashboard load.

      setContratos(mappedData);
      setOutsideDresses(outside || []);
      setLoading(false);
      return mappedData;
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar la lista de contratos.');
      return [];
    } finally {
      setLoading(false);
    }
  };



  const deleteContract = async (id: string, numero: string) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar PERMANENTEMENTE el contrato ${numero}? Esta acción es IRREVERSIBLE.`)) return;
    if (!confirm(`CONFIRMACIÓN DOBLE: Al eliminar este contrato se borrarán en cascada todos los vestidos, pagos y bitácoras vinculadas. ¿Deseas proceder?`)) return;
    
    try {
      setLoading(true);
      
      // Cascada manual: Eliminar dependencias primero
      await supabase.from('contrato_items_vestidos').delete().eq('contrato_id', id);
      await supabase.from('pagos').delete().eq('contrato_id', id);
      await supabase.from('bitacora_contratos').delete().eq('contrato_id', id);
      await supabase.from('entregas_bitacora').delete().eq('contrato_id', id);
      await supabase.from('arreglos').delete().eq('contrato_id', id);

      const { error } = await supabase
        .from('contratos')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      toast.success(`Contrato ${numero} eliminado permanentemente en cascada.`);
      fetchContratos();
    } catch (err: any) {
      console.error(err);
      toast.error('Error al eliminar el contrato: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveException = async (id: string) => {
    if (!await validateStoredInvoice(id)) return;
    try {
      setLoading(true);
      // Update both tables just to be sure we hit the user's requirement
      const { error: errItems } = await supabase
        .from('contrato_items_vestidos')
        .update({ estado_aprobacion: 'aprobado' })
        .eq('contrato_id', id);
      
      if (errItems) console.error('Error in items:', errItems);

      const { error } = await supabase
        .from('contratos')
        .update({ estado_aprobacion: 'aprobado' })
        .eq('id', id);
        
      if (error) throw error;

      toast.success('Excepción aprobada correctamente');
      fetchContratos();
      if (selectedContract && selectedContract.id === id) {
         setSelectedContract({ ...selectedContract, estado_aprobacion: 'aprobado' });
      }
    } catch (err) {
      toast.error('Error al aprobar excepción');
    } finally {
      setLoading(false);
    }
  };

  const approveContract = async (id: string) => {
    if (!await validateStoredInvoice(id)) return;
    try {
      setLoading(true);
      const { error } = await supabase
        .from('contratos')
        .update({ estado_aprobacion: 'aprobado' })
        .eq('id', id);
      if (error) throw error;

      // Update the dress status to vinculado_confirmado
      const { error: errItems } = await supabase
        .from('contrato_items_vestidos')
        .update({ estado: 'vinculado_confirmado' })
        .eq('contrato_id', id);
      if (errItems) console.error('Error al confirmar vestidos:', errItems);

      toast.success('Excepción aprobada y contrato confirmado');
      fetchContratos();
      if (selectedContract && selectedContract.id === id) {
         setSelectedContract({ ...selectedContract, estado_aprobacion: 'aprobado' });
      }
    } catch (err) {
      toast.error('Error al aprobar contrato');
    } finally {
      setLoading(false);
    }
  };

  const rejectContract = async (id: string) => {
    const contrato = contratos.find(c => c.id === id);
    if (!confirm('¿Estás seguro de que deseas rechazar esta solicitud de excepción? El contrato se marcará como cancelado y los vestidos se liberarán.')) return;
    try {
      setLoading(true);

      // 1. Liberar vestidos vinculados
      if (contrato && contrato.vestidos && contrato.vestidos.length > 0) {
         for (const item of contrato.vestidos) {
            if (item.vestido_id) {
               await supabase.from('vestidos')
                 .update({ estado: 'Disponible' })
                 .eq('id', item.vestido_id);
            }
         }
      }

      // 2. Actualizar contrato
      const { error } = await supabase
        .from('contratos')
        .update({ estado: 'cancelado', estado_aprobacion: 'rechazado' })
        .eq('id', id);
      if (error) throw error;

      // 3. Bitácora
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('bitacora_contratos').insert([{
         contrato_id: id,
         usuario_email: user?.email,
         accion: 'Rechazo de Exception',
         detalle: 'El Administrador rechazó manualmente la solicitud de alquiler por alistamiento.'
      }]);

      toast.success('Contrato rechazado y vestidos liberados');
      fetchContratos();
    } catch (err) {
      console.error('Error al rechazar contrato:', err);
      toast.error('Error al rechazar contrato');
    } finally {
      setLoading(false);
    }
  };

  const refreshBitacora = async (contratoId: string) => {
    try {
      const { data, error } = await supabase
        .from('bitacora_contratos')
        .select('*')
        .eq('contrato_id', contratoId)
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      setDrawerHistory(data || []);
    } catch (err) {
      console.error('Error refrescando bitácora:', err);
    }
  };

  const openDrawer = async (contrato: any, startEditing = false) => {
    if (startEditing && !isDashboardAdmin) {
      toast.error('Solo un administrador puede editar un contrato pactado.');
      return;
    }
    setSelectedContract(contrato);
    setEditForm(startEditing ? { ...contrato } : {});
    setDrawerOpen(true);
    setDrawerDelivery(null);
    setIsEditingDrawer(startEditing);
    setShowDeliveryEvidence(false); // Reset evidence view
    setDrawerHistory([]);
    setShowAssignForm(false); // Reset assign form
    setSelectedDressToAssign(''); // Reset selected dress

    // Parallel fetching for performance
    const fetchPromises = [];
    
    if (contrato.estado === 'entregado') {
      fetchPromises.push(
        supabase
          .from('entregas_bitacora')
          .select('*')
          .eq('contrato_id', contrato.id)
          .maybeSingle()
          .then(({ data }) => setDrawerDelivery(data))
      );
    }
    
    fetchPromises.push(refreshBitacora(contrato.id));

    setDrawerLoading(true);
    await Promise.all(fetchPromises);
    setDrawerLoading(false);
  };

  // -- Edit Functions --
  const handleEditStart = () => {
    if (!isDashboardAdmin) {
      toast.error('Solo un administrador puede editar un contrato pactado.');
      return;
    }
    setEditForm({ ...selectedContract });
    setIsEditingDrawer(true);
  };

  const handleEditChange = (field: string, value: any) => {
    setEditForm((prev: any) => {
      const updated = { ...prev, [field]: value };
      
      // Auto-recalculate Saldo if finance fields change
      if (field === 'valor_total' || field === 'anticipo' || field === 'total_arreglos') {
        updated.saldo = Number(updated.valor_total || 0) + Number(updated.total_arreglos || 0) - Number(updated.anticipo || 0);
      }
      return updated;
    });
  };

  const getMaintenanceDays = (tipoEvento: string) => {
    return (tipoEvento === 'PreXV' || tipoEvento === 'PREXV' || tipoEvento === 'Fotografía') ? 2 : 5;
  };

  const calculateReturnDate = (deliveryDate: string, tipoEvento: string) => {
    if (!deliveryDate) return 'Sin fecha';
    const d = new Date(deliveryDate);
    let daysToAdd = 5; // Default for 'Evento'
    if (tipoEvento === 'Boda' || tipoEvento === 'Quinceañera') daysToAdd = 6;
    if (tipoEvento === 'Prueba' || tipoEvento === 'Otro') daysToAdd = 3;
    
    d.setDate(d.getDate() + daysToAdd);
    return d.toISOString().split('T')[0];
  };

  const calculateLateDays = (contrato: any) => {
    const pactada = contrato.fecha_disponibilidad_real || calculateReturnDate(contrato.fecha_entrega_envio || contrato.fecha_evento, contrato.tipo_evento);
    if (!pactada || pactada === 'Sin fecha') return 0;
    
    const pactadaDate = new Date(pactada);
    pactadaDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (today <= pactadaDate) return 0;
    
    const diffTime = Math.abs(today.getTime() - pactadaDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const validateDressesAvailability = async (dressIds: string[], newDates: any, currentContractId: string, previousDates?: any) => {
    const ids = Array.from(new Set(dressIds.filter(Boolean)));
    if (!ids.length) return { severity: null, message: '' };
    const requested = generateBlockedRanges([{ ...newDates, id: currentContractId, estado: 'firmado' }]);
    const previous = previousDates ? generateBlockedRanges([{ ...previousDates, id: currentContractId, estado: 'firmado' }]) : [];
    for (const id of ids) {
      const [{ data: items, error: ie }, { data: legacy, error: le }, { data: special, error: se }] = await Promise.all([
        supabase.from('contrato_items_vestidos')
          .select('vestido_id,contratos!inner(id,numero_contrato,cliente_nombre,estado,tipo_evento,fecha_evento,fecha_pre_xv,fechas_bloqueo_especial)')
          .eq('vestido_id', id).neq('contrato_id', currentContractId),
        supabase.from('contratos')
          .select('id,numero_contrato,cliente_nombre,estado,tipo_evento,fecha_evento,fecha_pre_xv,fechas_bloqueo_especial')
          .eq('vestido_id', id).neq('id', currentContractId),
        supabase.from('contratos')
          .select('id,numero_contrato,cliente_nombre,estado,bloqueo_especial_fecha,bloqueo_especial_vestido_id')
          .eq('bloqueo_especial_vestido_id', id).neq('id', currentContractId)
      ]);
      if (ie || le || se) throw ie || le || se;
      const blocks = generateBlockedRanges([...(items || []), ...(legacy || []), ...(special || [])]);
      for (const wanted of requested) {
        if (wanted.id.startsWith('legacy-') && newDates.bloqueo_especial_vestido_id !== id) continue;
        const conflict = blocks.find(block => rangesOverlap(wanted, block) &&
          !previous.some(old => old.id === wanted.id && rangesOverlap(old, block)));
        if (conflict) return { severity: 'red' as const,
          message: `El vestido ya está reservado por el contrato #${conflict.contractNumber} en estas fechas.` };
      }
    }
    return { severity: null, message: '' };
  };

  const saveContractEdit = async () => {
    if (!selectedContract) return;
    if (!isDashboardAdmin) {
      toast.error('Solo un administrador puede modificar un contrato pactado.');
      setIsEditingDrawer(false);
      return;
    }
    
    let invoiceUpdate: { numero_factura?: string };
    try {
      invoiceUpdate = { numero_factura: requireInvoice(editForm.numero_factura) };
    } catch {
      toast.error(INVOICE_REQUIRED_MESSAGE);
      return;
    }

    // 1. Detect Granular Date Changes
    const detectedLogs: string[] = [];
    const dateLabelMap: Record<string, string> = {
      fecha_cita_medidas: 'Cita de Medidas',
      fecha_prueba_final: 'Prueba Final',
      fecha_entrega_envio: 'Fecha de Entrega/Envío',
      fecha_evento: 'Fecha del Evento',
      fecha_pre_xv: 'Fecha de Pre XV',
      fecha_retorno_prevista: 'Fecha de Retorno',
      fecha_fotografia: 'Fotografía',
      fecha_maquillaje: 'Maquillaje'
    };

    Object.keys(dateLabelMap).forEach(key => {
      const oldVal = selectedContract[key] || '';
      const newVal = editForm[key] || '';
      
      if (oldVal !== newVal) {
        detectedLogs.push(`Se cambió la fecha de ${dateLabelMap[key]} de ${oldVal || 'N/A'} a ${newVal || 'N/A'}`);
      }
    });

    // -- Conflict Validation --
    if (detectedLogs.length > 0) {
      const dressIds = Array.from(new Set<string>([selectedContract.vestido_id,...(selectedContract.items || []).map((i: any) => i.vestido_id)].filter(Boolean)));
      const validation = await validateDressesAvailability(dressIds, editForm, selectedContract.id, selectedContract);
      
      if (validation.severity === 'red') {
        toast.error(validation.message);
        return;
      }
      

    }

    setModalLoading(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Debes iniciar sesión nuevamente.');
      const { data: editorProfile, error: editorProfileError } = await supabase
        .from('profiles')
        .select('rol,activo')
        .eq('id', authUser.id)
        .single();
      if (editorProfileError || !editorProfile || editorProfile.activo === false || String(editorProfile.rol || '').toLowerCase() !== 'admin') {
        throw new Error('Solo un administrador activo puede modificar un contrato pactado.');
      }
      const additionalUpdates = getAdditionalContractUpdates(editForm, selectedContract);
      for (const key of ['valor_total', 'anticipo', 'total_arreglos']) {
        if (!Number.isFinite(Number(editForm[key] || 0)) || Number(editForm[key] || 0) < 0) {
          throw new Error('Los valores del contrato deben ser números mayores o iguales a cero.');
        }
      }

      const payload = {
        cliente_nombre: editForm.cliente_nombre,
        cliente_documento: editForm.cliente_documento,
        cliente_whatsapp: editForm.cliente_whatsapp,
        cliente_direccion: editForm.cliente_direccion,
        cliente_email: editForm.cliente_email,
        sede_id: editForm.sede_id,
        asesora_id: editForm.asesora_id,
        asesora: asesoras.find(a => a.id === editForm.asesora_id)?.nombre_completo || editForm.asesora,
        sede: sedes.find(s => s.id === editForm.sede_id)?.nombre || editForm.sede,
        fecha_evento: editForm.fecha_evento || null,
        fecha_pre_xv: editForm.fecha_pre_xv || null,
        fecha_cita_medidas: editForm.fecha_cita_medidas || null,
        fecha_prueba_final: editForm.fecha_prueba_final || null,
        fecha_entrega_envio: editForm.fecha_entrega_envio || null,
        fecha_disponibilidad_real: (editForm.fecha_entrega_envio || editForm.fecha_evento) ? calculateReturnDate(editForm.fecha_entrega_envio || editForm.fecha_evento, editForm.tipo_evento) : null,
        fechas_bloqueo_especial: Array.from(new Set(
          (Array.isArray(editForm.fechas_bloqueo_especial) ? editForm.fechas_bloqueo_especial : []).filter(Boolean)
        )).sort(),
        tipo_evento: editForm.tipo_evento,
        valor_total: Number(editForm.valor_total || 0),
        anticipo: Number(editForm.anticipo || 0),
        total_arreglos: Number(editForm.total_arreglos || 0),
        ...invoiceUpdate,
        autoriza_uso_imagen: editForm.autoriza_uso_imagen,
        ...additionalUpdates,
      };

      const { data: savedContract, error } = await supabase
        .from('contratos')
        .update(payload)
        .eq('id', selectedContract.id)
        .select('*')
        .single();

      if (error) throw error;
      if (!savedContract) throw new Error('No se pudo confirmar el guardado del contrato.');

      const changedFields = Object.keys(payload).filter(key =>
        String(selectedContract[key] ?? '') !== String(payload[key as keyof typeof payload] ?? '')
      );
      const { error: auditError } = await supabase.from('bitacora_contratos').insert({
        contrato_id: selectedContract.id,
        accion: 'Edición de contrato guardado',
        detalle: changedFields.map(key => `${key}: ${selectedContract[key] ?? 'N/A'} → ${payload[key as keyof typeof payload] ?? 'N/A'}`).join('; ') || 'Sin cambios de valores.',
        usuario: (user as any)?.nombre || authUser.email || authUser.id,
      });
      if (auditError) toast.warning('Cambios guardados, pero no se pudo registrar el detalle en la bitácora.');

      // 2. Log detected date changes individualy or in a single consolidated entry
      if (detectedLogs.length > 0) {
        for (const logDetail of detectedLogs) {
          await supabase.from('bitacora_contratos').insert({
            contrato_id: selectedContract.id,
            accion: '📅 Cambio de Logística',
            detalle: logDetail,
            usuario: (user as any)?.nombre || selectedContract.asesora || 'Administrador'
          });
        }
      } else {
        // Generic log if no dates changed but other fields did
        await supabase.from('bitacora_contratos').insert({
          contrato_id: selectedContract.id,
          accion: 'Contrato Actualizado',
          detalle: 'Se modificaron datos generales del contrato (ERP).',
          usuario: (user as any)?.nombre || selectedContract.asesora || 'Administrador'
        });
      }

      toast.success('Contrato actualizado correctamente');
      
      // Refresh local data optimistically
      const updatedContract = { 
        ...selectedContract, 
        ...savedContract,
        saldo: Number(savedContract.saldo || 0) + Number(savedContract.total_arreglos || 0),
        updated_at: new Date().toISOString()
      };
      
      setSelectedContract(updatedContract);
      setContratos(prev => prev.map(c => c.id === selectedContract.id ? updatedContract : c));
      
      // REAL-TIME SYNC: Refresh the bitácora timeline immediately
      await refreshBitacora(selectedContract.id);
      
      setIsEditingDrawer(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Error al guardar los cambios');
    } finally {
      setModalLoading(false);
    }
  };

  const handleSaveNote = async () => {
    if (!selectedContract || !noteForm.contenido) return;
    
    setNoteLoading(true);
    try {
      // 1. Guardar en notas_contrato
      const { error: noteErr } = await supabase
        .from('notas_contrato')
        .insert([{
          contrato_id: selectedContract.id,
          tipo_contacto: noteForm.tipo,
          contenido: noteForm.contenido,
          usuario: (user as any)?.nombre || selectedContract.asesora || 'Administrador'
        }]);

      if (noteErr) throw noteErr;

      // 2. Log en bitacora_contratos
      const snippet = noteForm.contenido.length > 60 
        ? noteForm.contenido.substring(0, 60) + '...' 
        : noteForm.contenido;

      const { error: bitErr } = await supabase
        .from('bitacora_contratos')
        .insert([{
          contrato_id: selectedContract.id,
          accion: 'Nota de Seguimiento',
          detalle: `${noteForm.tipo}: ${snippet}`,
          usuario: (user as any)?.nombre || selectedContract.asesora || 'Administrador'
        }]);

      if (bitErr) throw bitErr;

      // 3. Clear form & Refresh local timeline
      setNoteForm({ tipo: 'WhatsApp', contenido: '' });
      await refreshBitacora(selectedContract.id);
      
      toast.success('Nota guardada correctamente');
      setIsNoteModalOpen(false);

    } catch (err: any) {
      console.error(err);
      toast.error('Error al guardar la nota');
    } finally {
      setNoteLoading(false);
    }
  };

  // ─── GUARDRAIL: Validate contract data before allowing laundry transition ───
  const validateContractForLaundry = (contrato: any): string[] => {
    const missing: string[] = [];

    // 1. Basic client data
    if (!contrato.cliente_nombre?.trim()) missing.push('Nombre del cliente');
    if (!contrato.cliente_documento?.trim()) missing.push('Documento del cliente');
    if (!contrato.cliente_whatsapp?.trim()) missing.push('WhatsApp del cliente');
    if (!contrato.cliente_email?.trim()) missing.push('Correo electrónico del cliente');

    // 2. Key logistics
    if (!contrato.fecha_evento) missing.push('Fecha del evento');
    if (!contrato.valor_total || Number(contrato.valor_total) <= 0) missing.push('Valor total del contrato');

    // Provider requirements apply only to explicitly contracted services.
    for (const service of includedPrexv(contrato)) {
      if (!contrato[service.name]?.trim()) missing.push(service.person);
    }

    return missing;
  };

  const openTriage = (contrato: any) => {
    // GUARDRAIL: block if required fields are missing
    const missingFields = validateContractForLaundry(contrato);
    if (missingFields.length > 0) {
      toast.error(
        `No se puede enviar a lavandería: el contrato tiene información pendiente por diligenciar. Campos faltantes: ${missingFields.join(', ')}.`,
        { duration: 6000 }
      );
      return;
    }

    setTriageContract(contrato);
    setTriageForm({
      tipo: 'Lavandería',
      detalles_danos: '',
      dias_estimados: 2
    });
    setTriageModalOpen(true);
  };

  const submitTriage = async () => {
    if (!triageContract) return;

    // SECOND-LAYER GUARDRAIL: re-validate before persisting (defense in depth)
    const missingFields = validateContractForLaundry(triageContract);
    if (missingFields.length > 0) {
      toast.error(
        `No se puede enviar a lavandería: el contrato tiene información pendiente por diligenciar. Campos faltantes: ${missingFields.join(', ')}.`,
        { duration: 6000 }
      );
      return;
    }

    if (triageForm.tipo === 'Sastrería' && !triageForm.detalles_danos) {
      toast.error('Por favor detalla los daños para sastrería');
      return;
    }
    
    setModalLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const fechaFin = new Date();
      fechaFin.setDate(fechaFin.getDate() + Number(triageForm.dias_estimados));

      // 0. Fetch the actual dresses from the database using the UUID
      const { data: dbDresses, error: fetchErr } = await supabase
        .from('contrato_items_vestidos')
        .select('*, vestidos(*)')
        .eq('contrato_id', triageContract.id);
        
      if (fetchErr) {
        toast.error('Error de base de datos al obtener vestidos vinculados.');
        setModalLoading(false);
        return;
      }

      const dresses = dbDresses || [];
      if (dresses.length === 0) {
        toast.error('No hay vestidos vinculados a este contrato para recibir.');
        setModalLoading(false);
        return;
      }

      // 1. Update Contract State to 'mantenimiento'
      const { error: contractError } = await supabase
        .from('contratos')
        .update({ estado: 'mantenimiento' })
        .eq('id', triageContract.id);
      if (contractError) throw contractError;

      // 2. Process EACH dress in the contract
      for (const item of dresses) {
        // vId must be the clean identifier (BIGINT ID or UUID string)
        const vId = item.vestido_id || (item.vestido && (typeof item.vestido === 'object' ? item.vestido.id : item.vestido));
        
        if (!vId) {
          console.warn('Vestido sin ID en contrato:', item);
          continue;
        }

        const payload = {
          contrato_id: triageContract.id,
          vestido_id: vId,
          tipo: triageForm.tipo.toUpperCase(),
          dias_estimados: Number(triageForm.dias_estimados),
          estado: 'en proceso'
        };

        console.log('Payload a enviar (mantenimiento_bitacora):', payload);

        const { error: maintError } = await supabase
          .from('mantenimiento_bitacora')
          .insert(payload);

        if (maintError) {
          console.error('Error al insertar en bitácora:', maintError);
          throw maintError;
        }

        // B. Update dress state to 'EN MANTENIMIENTO'
        const { error: dressError } = await supabase
          .from('vestidos')
          .update({ estado: 'EN MANTENIMIENTO' })
          .eq('id', vId);
        if (dressError) throw dressError;
      }

      // 3. Log into bitacora_cambios
      const { data: profile } = await supabase.from('profiles').select('nombre').eq('id', user?.id).single();
      const editorName = profile?.nombre || user?.email || 'Administrador';
      
      await supabase.from('bitacora_cambios').insert({
        contrato_id: triageContract.id,
        tipo_evento: `🛠️ Recepción: ${triageForm.tipo.toUpperCase()}`,
        motivo: `Por ${editorName}. Retorno: ${fechaFin.toLocaleDateString('es-CO')}. ${triageForm.tipo === 'Sastrería' ? `Arreglos: ${triageForm.detalles_danos}` : 'Limpieza.'}`,
        usuario_id: user?.id
      });

      toast.success('Vestido ingresado a mantenimiento correctamente ✅');
      setTriageModalOpen(false);
      fetchContratos();
    } catch (err: any) {
      toast.error('Error en triage: ' + err.message);
    } finally {
      setModalLoading(false);
    }
  };

  const handleManualRelease = async (contrato: any) => {
    if (!await validateStoredInvoice(contrato.id)) return;
    const pass = window.confirm(`⚠️ ADVERTENCIA ADMINISTRATIVA: ¿Confirmas la liberación MANUAL y ANTICIPADA del contrato #${contrato.numero_contrato}? Esto pondrá los vestidos como DISPONIBLES de inmediato e ignorará los días de lavandería restantes.`);
    if (!pass) return;

    setModalLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // 1. Liberar vestidos asociados en tabla maestra
      const dresses = contrato.vestidos || [];
      for (const item of dresses) {
        const vId = item.vestido_id || item.vestido?.id;
        if (!vId) continue;
        await supabase.from('vestidos').update({ estado: 'Disponible' }).eq('id', vId);
      }

      // 2. Finalizar registros en mantenimiento_bitacora (Cerrar el ciclo de Lavandería/Taller)
      await supabase
        .from('mantenimiento_bitacora')
        .update({ estado: 'finalizado' })
        .eq('contrato_id', contrato.id)
        .neq('estado', 'finalizado');

      // 3. Regla de Oro: Transición de Contrato según Saldo
      const saldo = Number(contrato.saldo) || 0;
      const multas = Number(contrato.total_multas) || 0;
      const totalPendiente = saldo + multas;
      let finalMsg = 'Vestido liberado y disponible correctamente ✅';
      
      if (totalPendiente <= 0) {
        // Solo si el total (incluyendo multas) es <= 0 lo mandamos a Historial
        const { error } = await supabase
          .from('contratos')
          .update({ estado: 'finalizado' })
          .eq('id', contrato.id);
        if (error) throw error;
        finalMsg = 'Vestido liberado y contrato FINALIZADO (saldo $0) ✅';
      } else {
        // Bloqueo de Finalización Administrative
        await supabase
          .from('contratos')
          .update({ estado: 'firmado' }) 
          .eq('id', contrato.id);
        finalMsg = `Vestido liberado. El contrato sigue activo debido a SALDO PENDIENTE de $${totalPendiente.toLocaleString('es-CO')} 💰`;
        toast.warning(`⚠️ ATENCIÓN: El contrato no se cerró completamente porque existe un saldo de $${totalPendiente.toLocaleString('es-CO')}.`);
      }

      // 4. Registrar en bitácora de cambios (Audit Trail)
      const { data: profile } = await supabase.from('profiles').select('nombre').eq('id', user?.id).single();
      const editorName = profile?.nombre || user?.email || 'Administrador';

      await supabase.from('bitacora_cambios').insert({
        contrato_id: contrato.id,
        tipo_evento: '🔓 Liberación Manual',
        motivo: `Ingreso manual anticipado realizado por ${editorName}. Vestidos liberados. saldo: ${saldo}.`,
        usuario_id: user?.id
      });

      toast.success(finalMsg);
      setDrawerOpen(false);
      setOpenDropdownId(null);
      fetchContratos();
    } catch (err: any) {
      console.error(err);
      toast.error('Error al liberar manualmente: ' + err.message);
    } finally {
      setModalLoading(false);
    }
  };

  const handleConfirmReturn = async (contrato: any) => {
    const pass = window.confirm(`¿Confirmas el retorno físico de la prenda del contrato #${contrato.numero_contrato}? Esto actualizará el estado a 'En Mantenimiento/Lavandería'.`);
    if (!pass) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const editorName = (user as any)?.nombre || user?.email || 'Administrador';

      // 1. Update Contract State
      const { error: updErr } = await supabase
        .from('contratos')
        .update({ 
          estado: 'mantenimiento',
          // If the DB has no availability date yet (old contract), we set it now for persistence
          fecha_disponibilidad_real: contrato.fecha_disponibilidad_real || calculateReturnDate(contrato.fecha_entrega_envio || contrato.fecha_evento, contrato.tipo_evento)
        })
        .eq('id', contrato.id);
      if (updErr) throw updErr;

      // 2. Log in bitacora_contratos
      const { error: logErr } = await supabase
        .from('bitacora_contratos')
        .insert([{
          contrato_id: contrato.id,
          accion: 'Retorno de Prenda',
          detalle: `Confirmado ingreso físico a Lavandería/Mantenimiento por ${editorName}. El inventario queda bloqueado por periodo de alistamiento.`,
          usuario: editorName
        }]);
      if (logErr) throw logErr;

      toast.success('Retorno confirmado. Vestido en mantenimiento.');
      fetchContratos();
      if (selectedContract?.id === contrato.id) {
         await refreshBitacora(contrato.id);
         const { data: refreshed } = await supabase.from('contratos').select('*').eq('id', contrato.id).single();
         if (refreshed) setSelectedContract(refreshed);
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Error al confirmar retorno');
    } finally {
      setLoading(false);
    }
  };

  const fetchAsesoras = async () => {
    try {
      const { data: catAsesoras, error } = await supabase
        .from('asesoras')
        .select('*, sedes(nombre)')
        .eq('activo', true)
        .order('nombre_completo');
      if (error) {
        console.error('[DATABASE ERROR] Asesoras Entrega:', error);
        throw error;
      }
      setAsesoras(catAsesoras || []);
    } catch (err: any) {
      console.log('Error detallado (fetchAsesoras):', err);
      toast.error('Error al cargar la lista de asesoras oficial.');
    }
  };

  const submitInvoiceUpdate = async () => {
    if (!invoiceContract) return;
    let invoice: string;
    try {
      invoice = requireInvoice(invoiceNumber);
    } catch {
      toast.error(INVOICE_REQUIRED_MESSAGE);
      return;
    }
    setModalLoading(true);
    try {
      const { error } = await supabase
        .from('contratos')
        .update({ numero_factura: invoice })
        .eq('id', invoiceContract.id);

      if (error) throw error;
      toast.success('Factura legalizada correctamente');
      setInvoiceModalOpen(false);
      fetchContratos();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message === INVOICE_REQUIRED_MESSAGE ? INVOICE_REQUIRED_MESSAGE : 'Error al actualizar factura');
    } finally {
      setModalLoading(false);
    }
  };

  const fetchSedes = async () => {
    try {
      const { data, error } = await supabase
        .from('sedes')
        .select('id, nombre')
        .eq('activo', true);
      if (error) throw error;
      setSedes(data || []);
    } catch (err) {
      console.error('Error cargando sedes:', err);
    }
  };

  const handleMarkAsistio = async (id: string, fieldType: string) => {
    try {
      const { error } = await supabase.from('contratos').update({ [fieldType]: 'Asistió' }).eq('id', id);
      if (error) throw error;
      toast.success('Asistencia registrada correctamente.');
      fetchContratos();
    } catch (err) {
      console.error(err);
      toast.error('Error al registrar asistencia.');
    }
  };

  const openMissedModal = (id: string, fieldType: string, title: string) => {
    setMissedData({ id, type: fieldType, title });
    setMissedMotivo('');
    setMissedModalOpen(true);
  };

  const submitMissedModal = async () => {
    if (!missedMotivo.trim() || !missedData) return toast.error('Debes ingresar un motivo obligatorio');
    setModalLoading(true);
    try {
      // 1. Update contratos
      const { error: err1 } = await supabase.from('contratos').update({ [missedData.type]: 'No Asistió' }).eq('id', missedData.id);
      if (err1) throw err1;

      // 2. Traer sesion
      const { data: { user } } = await supabase.auth.getUser();

      // 3. Registrar inasistencia en bitacora
      const { error: err2 } = await supabase.from('bitacora_cambios').insert([{
        contrato_id: missedData.id,
        tipo_evento: `Inasistencia: ${missedData.title}`,
        motivo: missedMotivo.trim(),
        fecha_anterior: null,
        fecha_nueva: null,
        usuario_id: user?.id || undefined
      }]);
      if (err2) throw err2;

      toast.success('Inasistencia y penalización registradas en la bitácora.');
      setMissedModalOpen(false);
      fetchContratos();
    } catch(err) {
      console.error(err);
      toast.error('Error al guardar inasistencia.');
    } finally {
      setModalLoading(false);
    }
  };

  const openEditModal = async (contrato: any, fieldKey: string, fieldLabel: string) => {
    setEditData({ contrato, fieldKey, fieldLabel });
    setEditNewDate(contrato[fieldKey] || '');
    setEditMotivo('');
    setEditModalOpen(true);

    // FETCH LOCAL HISTORY for the modal (Imagen 2 request)
    try {
      const { data, error } = await supabase
        .from('bitacora_contratos')
        .select('*')
        .eq('contrato_id', contrato.id)
        .or('accion.eq.📅 Cambio de Logística,accion.eq.Reprogramación')
        .order('created_at', { ascending: false });
      
      if (!error) setModalLocalHistory(data || []);
    } catch (e) {
      console.error('Error fetching modal history:', e);
    }
  };

  const submitEditModal = async () => {
    if (!editMotivo.trim() || !editNewDate || !editData) return toast.error('Debes completar la nueva fecha y el motivo.');
    setModalLoading(true);
    try {
      const { contrato, fieldKey, fieldLabel } = editData;

      if (fieldKey === 'fecha_evento' || fieldKey === 'fecha_pre_xv') {
        const ids = Array.from(new Set<string>([
          contrato.vestido_id, ...(contrato.vestidos || []).map((v: any) => v.vestido_id)
        ].filter(Boolean)));
        const validation = await validateDressesAvailability(ids, { ...contrato, [fieldKey]: editNewDate }, contrato.id, contrato);
        if (validation.severity === 'red') {
          toast.error(validation.message);
          setModalLoading(false);
          return;
        }
      }

      // 2. Aplicar cambio en DB si está libre o es fecha administrativa
      const { error: errUpdate } = await supabase.from('contratos').update({ [fieldKey]: editNewDate }).eq('id', contrato.id);
      if (errUpdate) throw errUpdate;

      const { data: { user: authUser } } = await supabase.auth.getUser();

      // STEP 1 DEFINITIVE: Explicit Insert into bitacora_contratos for Vista 360 Visibility
      const { error: errLog } = await supabase.from('bitacora_contratos').insert([{
        contrato_id: contrato.id,
        accion: '📅 Cambio de Logística',
        detalle: `Se reprogramó ${fieldLabel} de ${contrato[fieldKey] || 'N/A'} a ${editNewDate}. Motivo: ${editMotivo.trim()}`,
        usuario: (user as any)?.nombre || contrato.asesora || 'Administrador'
      }]);
      if (errLog) throw errLog;

      toast.success('Reprogramación guardada validada en bitácora.');
      setEditModalOpen(false);
      fetchContratos();
      
      // STEP 2 DEFINITIVE: Force Refresh of Vista 360 Bitácora
      await refreshBitacora(contrato.id);
    } catch (err) {
      console.error(err);
      toast.error('Ocurrió un error general reprogramando.');
    } finally {
      setModalLoading(false);
    }
  };

  const openPreXvModal = (contrato: any) => {
    setPreXvError('');
    setPreXvData(contrato);
    setPreXvForm({ ...contrato });
    setPreXvModalOpen(true);
  };

  const submitPreXvModal = async () => {
    setPreXvError('');
    setModalLoading(true);
    try {
      const keys = [...prexvFields, 'fecha_pre_xv', 'fecha_fotografia', 'fecha_maquillaje'] as const;
      const changes = Object.fromEntries(keys.filter(k => JSON.stringify(preXvForm[k] ?? null) !== JSON.stringify(preXvData[k] ?? null)).map(k => [k, ['fecha_fotografia','fecha_maquillaje'].includes(k) ? dateInput(preXvForm[k] as string) : preXvForm[k]]));
      if (!Object.keys(changes).length) { setPreXvModalOpen(false); return; }
      const original = Object.fromEntries(keys.map(k => [k, preXvData[k] ?? null]));
      const result = await saveCalendarContract({ id: preXvData.id, changes, original });
      setPreXvData((prev: any) => ({ ...prev, ...result.contract }));
      setPreXvForm(result.contract);
      setContratos((prev: any[]) => prev.map(c => c.id === result.contract.id ? { ...c, ...result.contract } : c));
      if (selectedContract?.id === preXvData.id) setSelectedContract((prev: any) => ({ ...prev, ...result.contract }));
      if (result.warning) toast.warning(result.warning);
      else toast.success('PRE-XV guardado en el contrato y el calendario.');
      setPreXvModalOpen(false);
      fetchContratos();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Error guardando PRE-XV.';
      setPreXvError(message);
      toast.error(message);
    } finally {
      setModalLoading(false);
    }
  };

  const handleSaveFactura = async (id: string) => {
    let invoice: string;
    try {
      invoice = requireInvoice(facturaValue);
    } catch {
      toast.error(INVOICE_REQUIRED_MESSAGE);
      return;
    }
    try {
      const { error } = await supabase.from('contratos').update({ numero_factura: invoice }).eq('id', id);
      if (error) throw error;
      toast.success('Factura vinculada.');
      setEditingFacturaId(null);
      fetchContratos();
    } catch(e) {
      toast.error('Error al vincular factura');
    }
  };

  const updateDressLogistics = async (dressItemId: number, newStatus: string, newSedeId?: string) => {
    setModalLoading(true);
    try {
      const updates: any = { estado: newStatus };
      if (newSedeId) updates.sede_actual_id = newSedeId;

      const { error } = await supabase
        .from('vestidos')
        .update(updates)
        .eq('id', dressItemId);
      
      if (error) throw error;
      
      toast.success(newStatus === 'Traslado' ? 'Envío marcado correctamente' : 'Recepción confirmada');
      fetchContratos(); // Recargar todo para refrescar el drawer
    } catch (err) {
      console.error(err);
      toast.error('Error al actualizar logística');
    } finally {
      setModalLoading(false);
    }
  };

  const assignDress = async (contractId: string, dressId: string) => {
    if (!dressId) return;

    // 0. Seguridad: Verificar si el contrato está firmado y si el usuario es Admin
    const targetContract = contratos.find(c => c.id === contractId);
    const isAdmin = isDashboardAdmin;

    if (targetContract?.estado?.toLowerCase() === 'firmado' && !isAdmin) {
      toast.error("Este contrato ya está firmado y no puede ser modificado.");
      return;
    }

    setModalLoading(true);
    try {
      console.log('--- DEBUG: Iniciando asginación de vestido ---');
      console.log('Enviando a DB:', { contractId, dressId });

      // 1. Vincular en Tabla Relacional (Join Table)
      const { error: errRel } = await supabase
        .from('contrato_items_vestidos')
        .insert([{
          contrato_id: contractId,
          vestido_id: dressId,
          tipo: 'XV',
          tipo_uso: 'XV' 
        }]);
      if (errRel) {
        console.error('Error en contrato_items_vestidos:', errRel);
        throw errRel;
      }

      // 2. Vincular en Tabla Contratos (Direct column)
      // Ahora es obligatorio porque el usuario confirmó que la base de datos es tipo UUID
      const { error: errContrato } = await supabase
        .from('contratos')
        .update({ vestido_id: dressId })
        .eq('id', contractId);
      
      if (errContrato) {
        console.error('Error actualizando vestido_id en tabla contratos:', errContrato);
        throw errContrato;
      }

      // 3. Cambiar estado a Reservado
      const { error: errDress } = await supabase
        .from('vestidos')
        .update({ estado: 'Reservado' })
        .eq('id', dressId);
      if (errDress) {
        console.error('Error actualizando estado del vestido:', errDress);
        throw errDress;
      }
      
      console.log('--- DEBUG: Asignación exitosa, refrescando datos... ---');
      toast.success('Vestido asignado y reservado correctamente');
      setShowAssignForm(false);
      setSelectedDressToAssign('');
      
      // Forzar refresco global
      await fetchContratos();
    } catch (err: any) {
      console.error('Error real de DB:', err.message || err);
      toast.error('Error al asignar vestido: ' + (err.message || 'Ver consola'));
    } finally {
      setModalLoading(false);
    }
  };

  // -- Professional Removal Workflow --
  const openRemoveModal = (item: any) => {
    setRemovingItem(item);
    setRemoveReason('');
    setShowRemoveModal(true);
  };

  const handleRemoveDress = async () => {
    // Validaciones preventivas básicas
    if (!selectedContract || !removingItem || !removeReason || removeReason.length < 5) {
      toast.error('Debes proporcionar un motivo válido (mín. 5 caracteres).');
      return;
    }

    const vestidoId = removingItem.vestido?.id;
    const dressCodigo = removingItem.vestido?.codigo || 'V-PEND';

    setModalLoading(true);
    try {
      // 1. REGISTRO DE AUDITORÍA SIMPLIFICADO
      // Omitimos lectura/escritura en 'profiles' para evitar el 403 de esa tabla.
      // Usamos directamente el email o ID de la sesión activa.
      const { error: errLog } = await supabase.from('bitacora_eliminaciones_contrato').insert({
        contrato_id: selectedContract.id,
        vestido_id: vestidoId,
        codigo_vestido_eliminado: dressCodigo,
        detalle: removeReason,
        usuario_id: user?.id,
        motivo: 'Eliminación Directa (Permisos Depurados)'
      });

      // Si la bitácora falla por permisos (403), lo atrapamos de inmediato
      if (errLog) {
        if ((errLog as any).status === 403 || errLog.code === '42501') {
          throw new Error('Error de permisos en la base de datos');
        }
        throw new Error(`Fallo de Auditoría: ${errLog.message}`);
      }

      // 2. BORRADO FÍSICO REAL
      const { error: deleteError } = await supabase
        .from('contrato_items_vestidos')
        .delete()
        .match({ 
          contrato_id: selectedContract.id, 
          vestido_id: vestidoId 
        });

      // Verificación de permisos en el borrado
      if (deleteError) {
        if ((deleteError as any).status === 403 || deleteError.code === '42501') {
          throw new Error('Error de permisos en la base de datos');
        }
        throw new Error(`Error de Borrado: ${deleteError.message}`);
      }

      // 3. LIBERACIÓN DE INVENTARIO
      const { error: inventoryError } = await supabase
        .from('vestidos')
        .update({ estado: 'Disponible' })
        .eq('id', vestidoId);

      if (inventoryError) {
        throw new Error(`Error de Inventario: ${inventoryError.message}`);
      }

      // 4. ACTUALIZACIÓN DE ESTADO LOCAL (Solo si llegamos aquí no hubo error)
      setSelectedContract((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          prendas: prev.prendas?.filter((p: any) => p.vestido?.id !== vestidoId) || []
        };
      });

      setShowRemoveModal(false);
      setRemovingItem(null);
      setRemoveReason('');

      // Sincronización final con el servidor
      await fetchContratos(); 
      router.refresh();

      toast.success(`La prenda ${dressCodigo} ha sido físicamente eliminada.`);

    } catch (err: any) {
      console.error('--- FALLO CRÍTICO DETECTADO ---', err);
      // Aquí está el manejo estricto: SI HAY ERROR, NO HAY ÉXITO.
      const msg = err.message || 'Error desconocido en la base de datos';
      toast.error(msg === 'Error de permisos en la base de datos' ? msg : `Error: ${msg}`);
      
    } finally {
      setModalLoading(false);
    }
  };

  const handleRevertirAPorEntregar = async () => {
    if (!revertingContractId || !reversionReason || reversionReason.trim().length < 10) {
      toast.error('Debes proporcionar un motivo detallado (mín. 10 caracteres).');
      return;
    }
    setIsReverting(true);
    try {
      // 1. Actualizar estado principal
      const { error: updateErr } = await supabase
        .from('contratos')
        .update({ estado: 'Por Entregar' })
        .eq('id', revertingContractId);
      
      if (updateErr) throw updateErr;

      // 2. Registrar en bitacora_contratos (Auditoría General)
      const { error: logErr1 } = await supabase.from('bitacora_contratos').insert([{
         contrato_id: revertingContractId,
         accion: 'REVERSIÓN',
         detalle: `Se revirtió de Finalizado a Por Entregar. Razón: ${reversionReason}`,
         usuario: user?.nombre || user?.email || 'Administrador'
      }]);

      if (logErr1) console.error("Error bitacora_contratos:", logErr1);

      // 3. Registrar en entregas_bitacora (Auditoría Logística requerida)
      const { error: logErr2 } = await supabase.from('entregas_bitacora').insert([{
         contrato_id: revertingContractId,
         observaciones: `[REVERSIÓN DE ESTADO] Razón: ${reversionReason}`,
         estado_firma: 'Reversión (Admin)',
         tipo_entrega: 'reversion',
         usuario_id: user?.id
      }]);

      if (logErr2) console.error("Error entregas_bitacora:", logErr2);

      toast.success('Contrato revertido exitosamente a Por Entregar.');
      setIsReversionModalOpen(false);
      setReversionReason('');
      setRevertingContractId(null);
      setDrawerOpen(false); // Cierra el modal/drawer para refrescar
      
      await fetchContratos();
    } catch (error: any) {
      console.error('Error al revertir el estado:', error);
      toast.error('Error al revertir el estado: ' + error.message);
    } finally {
      setIsReverting(false);
    }
  };


  const fetchSubstitutionHistory = async (contractId: string) => {
    try {
      const { data, error } = await supabase
        .from('historial_cambios_contrato')
        .select(`
          *,
          vestido_anterior:vestido_anterior_id(codigo),
          vestido_nuevo:vestido_nuevo_id(codigo),
          profiles:usuario_id(nombre)
        `)
        .eq('contrato_id', contractId)
        .order('created_at', { ascending: false });
      
      if (!error && data) {
        // setSubstitutionHistory(data); // State removed in previous turn
      }
    } catch (err) {
      console.error('Error fetching history:', err);
    }
  };


  const fetchAllVestidos = async () => {
    if (!selectedContract?.sede_id) {
      console.warn('--- DEBUG: Buscador abortado por falta de sede_id ---', selectedContract);
      return;
    }
    
    console.log('--- DEBUG: Buscador Inicia ---');
    console.log('ID de Sede enviado (selectedContract.sede_id):', selectedContract.sede_id);

    // Buscamos vestidos de forma DIRECTA y limpia la tabla 'vestidos', sin condicionar ni cruzar con contratos.
    const { data, error } = await supabase
      .from('vestidos')
      .select('*')
      .eq('sede_actual_id', selectedContract.sede_id)
      .order('codigo');
    
    console.log('Vestidos disponibles encontrados:', data);
    
    if (error) {
      console.error('Error en fetchAllVestidos:', error.message);
      console.error('Detalles:', error.details);
      toast.error('Error al cargar lista de vestidos');
    }

    setAllVestidos(data || []);
  };

  useEffect(() => {
    if (drawerOpen || showAssignForm) fetchAllVestidos();
  }, [drawerOpen, showAssignForm]);

  // Modales Delivery
  const openDeliveryModal = (contrato: any, tipo: 'PREXV' | 'EVENTO' | 'AMBOS' = 'EVENTO') => {
    setDeliveryData(contrato);
    setDeliveryType(tipo);
    setDeliveryConjunta(tipo === 'AMBOS');
    setDeliveryObs('');
    setDeliveryPhotos([]);
    setSelectedAsesoraId(''); // Reset selector
    setDeliveryModalOpen(true);
  };

  const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 1200; // Máximo 1200px
          if (width > height) {
            if (width > maxDim) {
              height *= maxDim / width;
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width *= maxDim / height;
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            resolve(blob || file);
          }, 'image/jpeg', 0.75); // Calidad 75%
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const submitDeliveryModal = async () => {
    if (!selectedAsesoraId) return toast.error('Debes seleccionar a la asesora responsable.');
    if (!deliveryObs.trim()) return toast.error('Las observaciones de entrega son obligatorias.');
    if (deliveryPhotos.length === 0) return toast.error('Se requiere al menos una foto de evidencia.');
    
    setModalLoading(true);
    try {
      // 1. Verificar autenticación antes de cualquier operación
      const { data: { user: supabaseUser }, error: authError } = await supabase.auth.getUser();
      if (authError || !supabaseUser) {
        throw new Error('Debes estar autenticado para registrar una entrega.');
      }
      
      // Candado Financiero de Seguridad ESTRICTO
      if (Number(deliveryData.saldo) > 0) {
         setModalLoading(false);
         return toast.error('⚠️ ACCIÓN BLOQUEADA: Pendiente pago de $' + Number(deliveryData.saldo).toLocaleString('es-CO'));
      }

      const { data: depositOk, error: depositError } = await supabase.rpc('contrato_tiene_deposito_valido', { p_contrato: deliveryData.id });
      if (depositError) throw depositError;
      if (!depositOk) {
        setDepositBlock({id: deliveryData.id, numero: deliveryData.numero_contrato});
        setModalLoading(false);
        return;
      }

      const uploadedUrls: string[] = [];
      const bucket = 'fotos-entregas'; // Exact name check

      for (const file of deliveryPhotos) {
        // Comprimir imagen antes de subir
        const compressedBlob = await compressImage(file);
        
        const fileExt = file.name.split('.').pop();
        const fileName = `${deliveryData.id}/${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { error: uploadErr } = await supabase.storage.from(bucket).upload(fileName, compressedBlob, {
          contentType: 'image/jpeg',
          cacheControl: '3600', // Solicitado por el usuario para RLS/Caché
          upsert: false
        });
        
        if (uploadErr) {
          console.error('Error en Supabase Storage:', uploadErr);
          throw uploadErr;
        }

        const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(fileName);
        uploadedUrls.push(publicUrl);
      }

      // 3. Confirm Database Record (Asegurar la Creación)
      const { data: insertedBitacora, error: insertErr } = await supabase.from('entregas_bitacora').insert([{
        contrato_id: deliveryData.id,
        fotos_uris: uploadedUrls,
        usuario_id: selectedAsesoraId,
        tipo_entrega: deliveryConjunta ? 'AMBOS' : deliveryType
      }]).select('id').single();
      
      if (insertErr) {
        console.error('Error insertando en entregas_bitacora:', insertErr);
        toast.error('Error al registrar el acta en la base de datos (400: Columnas no válidas).');
        throw insertErr;
      }

      // 4. Generate & Copy Link (ONLY on confirmed success)
      if (insertedBitacora?.id) {
        toast.success('¡Acta Sellada con Éxito!');
        const url = `${window.location.origin}/entrega/${insertedBitacora.id}`;
        await navigator.clipboard.writeText(url);
        toast.info('Link de Satisfacción copiado al portapapeles.');
        setDeliveryModalOpen(false);
        fetchContratos();
      } else {
        throw new Error('No se pudo recuperar el ID del acta recién creada.');
      }

    } catch (err: any) {
      // Catch-all for other errors if toast wasn't triggered
      if (!err.message.includes('Columnas')) {
        toast.error('Ocurrió un problema inesperado: ' + err.message);
      }
      console.error(err);
    } finally {
      setModalLoading(false);
    }
  };

  // Componente de Acción Rose Gold
  const ActionButton = ({ onClick, icon: Icon, label, colorClass = 'text-rose-600 bg-rose-50 hover:bg-rose-100', disabled = false }: any) => (
    <button 
      onClick={onClick} 
      disabled={disabled}
      title={label}
      className={`p-2.5 rounded-xl transition-all duration-200 flex items-center justify-center shadow-sm hover:shadow-md border border-transparent hover:border-rose-200 disabled:opacity-50 ${colorClass}`}
    >
      <Icon className="w-5 h-5" />
    </button>
  );

  const ActionMenu = ({ c }: { c: any }) => {
    const hasDelivery = c.entregas && c.entregas.length > 0;
    const isEnEvento = c.estado === 'entregado' || hasDelivery;
    const isLavanderia = c.estado === 'mantenimiento';

    return (
      <div className="relative inline-block text-left">
         <div className="flex items-center justify-end gap-2">
           {isDashboardAdmin && (
             <button
               onClick={() => { setOpenDropdownId(null); router.push(`/contratos/nuevo?editar=${encodeURIComponent(c.id)}`); }}
               title="Editar Contrato"
               className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 border border-amber-200 font-black rounded-xl hover:bg-amber-100 transition-all active:scale-95 uppercase text-[10px] tracking-wider"
             >
               <Edit2 className="w-4 h-4" />
               <span>Editar</span>
             </button>
           )}
           <button 
             onClick={() => setOpenDropdownId(openDropdownId === c.id ? null : c.id)} 
             title="Gestionar Contrato"
             className="flex items-center gap-2 px-4 py-2 bg-rose-500 text-white font-black rounded-xl shadow-lg shadow-rose-200 hover:bg-rose-600 transition-all active:scale-95 uppercase text-[10px] tracking-wider"
           >
              <Settings className="w-4 h-4" />
              <span>Gestionar</span>
           </button>
         </div>
         {openDropdownId === c.id && (
           <div className="mt-2 ml-auto w-64 max-w-full rounded-2xl shadow-xl bg-white ring-1 ring-black ring-opacity-5 animate-in fade-in slide-in-from-top-2 border border-gray-100 overflow-hidden">
             <div className="py-2 p-1">
               {/* 1. Abrir Vista 360 (Ruta Oficial) */}
               <button 
                 onClick={() => { setOpenDropdownId(null); openDrawer(c); }} 
                 className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-rose-50 rounded-xl flex items-center gap-3 font-black transition-all border-b border-gray-50 mb-1"
               >
                 <Search className="w-4 h-4 text-rose-500" /> Abrir Vista 360 (Bitácora)
               </button>

               <button onClick={() => { setOpenDropdownId(null); generatePDF(c); }} disabled={pdfGeneratingId === c.id} className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-rose-50 rounded-xl flex items-center gap-3 font-bold transition-all">
                 <Download className="w-4 h-4 text-rose-500" /> Generar PDF Contrato
               </button>


               <Link href={`/dashboard/pago/${c.id}`} className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-emerald-50 rounded-xl flex items-center gap-3 font-bold transition-all">
                 <DollarSign className="w-4 h-4 text-emerald-500" /> Registrar Abono
               </Link>

               {c.estado_aprobacion !== 'pendiente_admin' && (
                 <button onClick={() => { setOpenDropdownId(null); copyToClipboard(c.id, c.numero_contrato); }} className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-rose-50 rounded-xl flex items-center gap-3 font-bold transition-all">
                   <LinkIcon className="w-4 h-4 text-rose-500" /> Copiar Link de Firma
                 </button>
               )}

               <button 
                 onClick={() => { 
                   setOpenDropdownId(null); 
                   setInvoiceContract(c);
                   setInvoiceNumber(c.numero_factura || '');
                   setInvoiceModalOpen(true);
                 }} 
                 className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-rose-50 rounded-xl flex items-center gap-3 font-bold transition-all"
               >
                 <Tag className="w-4 h-4 text-rose-500" /> Legalizar Factura
               </button>

               {/* Logistics Specific */}
               <div className="h-px bg-gray-100 my-1 mx-2"></div>
               
               {isEnEvento && (
                 <button 
                   onClick={() => { setOpenDropdownId(null); openTriage(c); }}
                   className="w-full text-left px-4 py-3 text-sm text-rose-600 hover:bg-rose-50 rounded-xl flex items-center gap-3 font-black transition-all"
                 >
                   <span className="text-base text-rose-500">📥</span> Registrar Devolución
                 </button>
               )}

               {isLavanderia && (
                 <button 
                   onClick={() => { setOpenDropdownId(null); handleManualRelease(c); }}
                   className="w-full text-left px-4 py-3 text-sm text-indigo-600 hover:bg-indigo-50 rounded-xl flex items-center gap-3 font-black transition-all"
                 >
                   <RefreshCw className="w-4 h-4 text-indigo-500" /> 🔓 Marcar como Disponible / Ingreso a Tienda
                 </button>
               )}

               {c.estado === 'entregado' ? (
                  <>
                    <button 
                      onClick={async () => {
                        setOpenDropdownId(null);
                        const { data: bit } = await supabase
                          .from('entregas_bitacora')
                          .select('id')
                          .eq('contrato_id', c.id)
                          .order('created_at', { ascending: false })
                          .limit(1)
                          .single();
                        
                        const link = `${window.location.origin}/entrega/${bit?.id || c.id}`;
                        navigator.clipboard.writeText(link);
                        toast.success('Link de Acta de Conformidad copiado');
                      }} 
                      className="w-full text-left px-4 py-3 text-sm text-indigo-700 hover:bg-indigo-50 rounded-xl flex items-center gap-3 font-black transition-all"
                    >
                      <ShieldCheck className="w-4 h-4 text-indigo-500" /> Ver Acta de Entrega
                    </button>
                    <button 
                      onClick={async () => {
                        setOpenDropdownId(null);
                        const { data: bit } = await supabase
                          .from('entregas_bitacora')
                          .select('id')
                          .eq('contrato_id', c.id)
                          .order('created_at', { ascending: false })
                          .limit(1)
                          .single();
                        
                        const url = `${window.location.origin}/entrega/${bit?.id || c.id}`;
                        const msg = `Hola ${c.cliente_nombre}, adjunto el link para tu entrega de Ámbar Couture: ${url}`;
                        window.open(`https://wa.me/57${c.cliente_whatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
                      }} 
                      className="w-full text-left px-4 py-3 text-sm text-green-700 hover:bg-green-50 rounded-xl flex items-center gap-3 font-black transition-all"
                    >
                      <MessageCircle className="w-4 h-4 text-green-500" /> WhatsApp Entrega
                    </button>
                  </>
               ) : (
                  <>
                    {!isLavanderia && (
                      <button 
                        onClick={() => { setOpenDropdownId(null); openDeliveryModal(c); }} 
                        disabled={Number(c.saldo) > 0}
                        className={`w-full text-left px-4 py-3 text-sm rounded-xl flex items-center justify-between font-black transition-all ${
                          Number(c.saldo) > 0
                          ? 'text-rose-400 bg-rose-50 cursor-not-allowed'
                          : 'text-amber-700 hover:bg-amber-50'
                        }`}
                      >
                        <span className="flex items-center gap-3"><ShieldCheck className="w-4 h-4" /> Registrar Entrega</span>
                      </button>
                    )}
                  </>
               )}

               {user?.rol === 'admin' && (
                  <>
                    <div className="h-px bg-gray-100 my-1 mx-2"></div>
                    <button 
                      onClick={() => { setOpenDropdownId(null); deleteContract(c.id, c.numero_contrato); }}
                      className="w-full text-left px-4 py-3 text-xs text-rose-600 hover:bg-rose-50 rounded-xl flex items-center gap-3 font-bold transition-all"
                    >
                      <Trash2 className="w-4 h-4 text-rose-500" /> Eliminar Contrato Permanentemente
                    </button>
                  </>
               )}
             </div>
           </div>
         )}
      </div>
    );
  };

  const fetchDashboardMetas = async () => {
    try {
      // Fetch Global Meta
      const { data: metaData } = await supabase
        .from('metas')
        .select('*')
        .eq('tipo', 'global')
        .maybeSingle();
      
      if (metaData) {
        setGlobalMetaId(metaData.id);
        setGlobalMetaVal(Number(metaData.monto_meta) || 120000000);
      } else {
        const now = new Date();
        const { data: newMeta } = await supabase
          .from('metas')
          .insert({
            tipo: 'global',
            nombre_objetivo: 'Meta Global',
            monto_meta: 120000000,
            mes: now.getMonth() + 1,
            anio: now.getFullYear()
          })
          .select()
          .single();
        if (newMeta) {
          setGlobalMetaId(newMeta.id);
          setGlobalMetaVal(120000000);
        }
      }

      // Fetch Pagos for Recaudo Real
      const now = new Date();
      const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

      const { data: pagos } = await supabase
        .from('pagos')
        .select('valor_pagado, fecha_pago, contratos!inner(sede_id, estado)')
        .gte('fecha_pago', firstDay)
        .lte('fecha_pago', lastDay);
      const validPagos = (pagos || []).filter((p: any) => {
        const est = p.contratos?.estado?.toLowerCase() || '';
        return !['cancelado', 'borrador', 'anulado'].includes(est);
      });
      setPagosMesActual(validPagos);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    fetchContratos();
    fetchAsesoras();
    fetchSedes();
    fetchKPIs();
    fetchDashboardMetas();
  }, []);

  const handleUpdateGlobalMeta = async () => {
    if (!globalMetaId) return;
    try {
      const newVal = Number(editGlobalMetaInput);
      if (isNaN(newVal) || newVal <= 0) {
        toast.error('Monto inválido');
        return;
      }
      const { error } = await supabase
        .from('metas')
        .update({ monto_meta: newVal })
        .eq('id', globalMetaId);
      
      if (error) throw error;
      setGlobalMetaVal(newVal);
      setIsEditGlobalMetaOpen(false);
      toast.success('Meta global actualizada');
    } catch (err: any) {
      toast.error('Error al actualizar meta: ' + err.message);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const copyToClipboard = async (id: string, numero: string) => {
    if (!await validateStoredInvoice(id)) return;
    const url = `${window.location.origin}/firma/${id}`;
    navigator.clipboard.writeText(url);
    toast.success(`Enlace del contrato ${numero} copiado al portapapeles.`);
  };

  const isToday = (dateString: string) => {
    const cDate = new Date(dateString);
    const today = new Date();
    return cDate.getDate() === today.getDate() &&
      cDate.getMonth() === today.getMonth() &&
      cDate.getFullYear() === today.getFullYear();
  };

  const isOverdue = (dateString: string) => {
    const d = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
  };

  // -- Admin Security Helper --
  const isAdmin = isDashboardAdmin;

  // Motor de Filtros Locales (QC Logística & 4 Tabs)
  const tabCounts = React.useMemo(() => {
    return {
      por_entregar: contratos.filter(c => {
        const est = c.estado?.toLowerCase();
        const hasDelivery = c.entregas && c.entregas.length > 0;
        return !['entregado', 'mantenimiento', 'finalizado', 'cancelado', 'rechazado'].includes(est) && !hasDelivery;
      }).length,
      en_evento: contratos.filter(c => {
        const est = (c.estado || '').toLowerCase();
        const hasDelivery = c.entregas && c.entregas.length > 0;
        const isExcluded = ['mantenimiento', 'finalizado', 'cancelado', 'rechazado'].includes(est);
        return (est === 'entregado' || hasDelivery) && !isExcluded;
      }).length,
      lavanderia: contratos.filter(c => c.estado?.toLowerCase() === 'mantenimiento').length,
      historial: contratos.filter(c => {
        const est = c.estado?.toLowerCase();
        const totalPendiente = (Number(c.saldo) || 0) + (Number(c.total_multas) || 0);
        return ['finalizado', 'cancelado', 'rechazado'].includes(est) && totalPendiente === 0;
      }).length,
    };
  }, [contratos]);

  const alerts = React.useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    // Entregas Vencidas — STRICTLY 'Por Entregar' only.
    // A contract in 'Evento', 'Entregado', or with any delivery record already
    // had its dress physically dispatched — it must NOT appear as overdue.
    const ESTADOS_EXCLUIDOS_ENTREGA = [
      'finalizado', 'cancelado', 'rechazado',
      'mantenimiento', 'entregado', 'evento',
      'liquidado', 'historial'
    ];
    const entregasOmitidasCount = contratos.filter(c => {
      if (!c.fecha_entrega_envio) return false;
      const estadoContrato = c.estado?.toLowerCase() || '';
      if (ESTADOS_EXCLUIDOS_ENTREGA.includes(estadoContrato)) return false;
      // Exclude if the dress has already been physically delivered (en evento)
      const hasDelivery = c.entregas && c.entregas.length > 0;
      if (hasDelivery) return false;
      // Logistics state must be strictly 'Por Entregar' — 'Pendiente' alone is not overdue
      if ((c.estado_entrega_envio || '') !== 'Por Entregar') return false;
      return c.fecha_entrega_envio < todayStr;
    }).length;

    // FIX 2: Borradores — ALL drafts older than 48 h, no balance restriction whatsoever.
    const borradoresVencidosCount = contratos.filter(c => {
      const estadoLower = c.estado?.toLowerCase();
      return (estadoLower === 'borrador' || estadoLower === 'draft') && new Date(c.created_at) < fortyEightHoursAgo;
    }).length;

    return {
      entregasOmitidasCount,
      borradoresVencidosCount
    };
  }, [contratos]);

  const contratosFiltrados = React.useMemo(() => {
    let result = [...contratos];

    // 1. Prioridad: Búsqueda Global (Si hay término, ignora la pestaña activa y busca en todo)
    // El backend (Supabase) ya hizo el filtro exhaustivo (por texto y por IDs vinculados).
    // Devolvemos el resultado tal cual para asegurar que lo que trajo la BD se muestre siempre.
    if (searchTerm) {
      console.log('🔍 [Buscador Global] Contratos Encontrados por BD:', result.map(r => r.id));
      return result;
    }

    // 0. PREXV Filter: Only show 15-year (PreXV) contracts if toggled
    if (filtroTipoEvento === 'PREXV') {
      result = result.filter(c => hasPrexv(c));
    }

    // Apply administrative alert filters and return immediately — must mirror badge logic exactly.
    if (filtroAlerta === 'entregas_omitidas') {
      const todayStr = new Date().toISOString().split('T')[0];
      const ESTADOS_EXCLUIDOS_ENTREGA = [
        'finalizado', 'cancelado', 'rechazado',
        'mantenimiento', 'entregado', 'evento',
        'liquidado', 'historial'
      ];
      return result.filter(c => {
        if (!c.fecha_entrega_envio) return false;
        const estadoContrato = c.estado?.toLowerCase() || '';
        if (ESTADOS_EXCLUIDOS_ENTREGA.includes(estadoContrato)) return false;
        const hasDelivery = c.entregas && c.entregas.length > 0;
        if (hasDelivery) return false;
        if ((c.estado_entrega_envio || '') !== 'Por Entregar') return false;
        return c.fecha_entrega_envio < todayStr;
      });
    } else if (filtroAlerta === 'borradores_sin_firmar') {
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
      return result.filter(c => {
        const estadoLower = c.estado?.toLowerCase();
        return (estadoLower === 'borrador' || estadoLower === 'draft') && new Date(c.created_at) < fortyEightHoursAgo;
      });
    }

    // 2. Filtrado por Pestaña Logística
    if (filtroAlerta === 'ninguna') {
      result = result.filter(c => {
        const estado = c.estado?.toLowerCase();
        switch (activeTabLogistica) {
          case 'por_entregar': {
            const hasDelivery = c.entregas && c.entregas.length > 0;
            return !['entregado', 'mantenimiento', 'finalizado', 'cancelado', 'rechazado'].includes(estado) && !hasDelivery;
          }
          case 'en_evento': {
            const hasDelivery = c.entregas && c.entregas.length > 0;
            const isExcluded = ['mantenimiento', 'finalizado', 'cancelado', 'rechazado'].includes(estado);
            return (estado === 'entregado' || hasDelivery) && !isExcluded;
          }
          case 'lavanderia':
            return estado === 'mantenimiento';
          case 'historial': {
            const totalPendiente = (Number(c.saldo) || 0) + (Number(c.total_multas) || 0);
            return ['finalizado', 'cancelado', 'rechazado'].includes(estado) && totalPendiente === 0;
          }
          case 'anulados':
            return estado === 'anulado';
          default:
            return true;
        }
      });
    }

    // 3. Filtros Complementarios (Sede, Hito, Fecha)
    if (filtroSede !== 'Todas') {
      if (filtroSede === 'unassigned') {
        result = result.filter(c => !c.sede_id || !sedes.some(s => s.id === c.sede_id));
      } else {
        result = result.filter(c => c.sede_id === filtroSede);
      }
    }

    const startOfToday = new Date().setHours(0,0,0,0);
    const endOfWeek = new Date(startOfToday + 7 * 24 * 60 * 60 * 1000).setHours(0,0,0,0);
    const endOfMonth = new Date(startOfToday + 30 * 24 * 60 * 60 * 1000).setHours(0,0,0,0);

    const toTimestamp = (ds: string | null) => {
      if (!ds) return null;
      try {
        const d = new Date(ds);
        if (isNaN(d.getTime())) return null;
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() + offset).setHours(0,0,0,0);
      } catch { return null; }
    };

    const isDateInRange = (t: number | null) => {
      if (!t) return false;
      if (filtroRango === 'Hoy') return t === startOfToday;
      if (filtroRango === 'Esta Semana') return t >= startOfToday && t <= endOfWeek;
      if (filtroRango === 'Este Mes') return t >= startOfToday && t <= endOfMonth;
      if (filtroRango === 'Personalizado') {
         const dDesde = toTimestamp(fechaDesde);
         const dHasta = toTimestamp(fechaHasta);
         if (dDesde && t < dDesde) return false;
         if (dHasta && t > dHasta) return false;
         return true;
      }
      return true;
    };

    if (filtroHito !== 'Todos') {
      let dateKey = '';
      if (filtroHito === 'Cita de Medidas') dateKey = 'fecha_cita_medidas';
      else if (filtroHito === 'Prueba Final') dateKey = 'fecha_prueba_final';
      else if (filtroHito === 'Fecha de Entrega/Envío') dateKey = 'fecha_entrega_envio';
      else if (filtroHito === 'Sesión Pre-XV') dateKey = 'fecha_pre_xv';

      if (dateKey) {
        result = result.filter(c => {
           const val = c[dateKey];
           if (!val) return false;
           if (filtroRango !== 'Cualquier Fecha' && !isDateInRange(toTimestamp(val))) return false;
           return true;
        });
      }
    } else if (filtroRango !== 'Cualquier Fecha') {
       result = result.filter(c => 
          isDateInRange(toTimestamp(c.fecha_cita_medidas)) || 
          isDateInRange(toTimestamp(c.fecha_prueba_final)) || 
          isDateInRange(toTimestamp(c.fecha_entrega_envio)) || 
          isDateInRange(toTimestamp(c.fecha_pre_xv))
       );
    }

    // 4. PREXV tipo evento filter after complementary filters
    if (filtroTipoEvento === 'PREXV') {
      result = result.filter(c => hasPrexv(c));
    }

    return result;
  }, [contratos, activeTabLogistica, searchTerm, filtroSede, filtroHito, filtroRango, fechaDesde, fechaHasta, filtroAlerta, filtroTipoEvento]);

  // -- KPI STATS CALCULATION (Imagen 5 Request Restore) --
  const activeBranchName = filtroSede === 'Todas' ? 'Todas' : (filtroSede === 'unassigned' ? 'Pereira' : (sedes.find(s => s.id === filtroSede)?.nombre || 'Todas'));

  const stats = React.useMemo(() => {
    return {
      totalPendiente: contratosFiltrados.reduce((acc, c) => acc + (Number(c.saldo) || 0) + (Number(c.total_multas) || 0), 0),
      totalContratos: contratosFiltrados.length,
      totalEnEvento: tabCounts.en_evento,
      activeBranch: activeBranchName
    };
  }, [contratosFiltrados, tabCounts, activeBranchName]);

  const salesStats = React.useMemo(() => {
    try {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      if (!Array.isArray(contratos)) return { recaudado: 0, count: 0, goal: 120000000 };

      const monthContracts = contratos.filter(c => {
         if (!c) return false;
         
         if (c.created_at) {
           const createdDate = new Date(c.created_at);
           if (isNaN(createdDate.getTime())) return false;
           
           if (createdDate.getMonth() !== currentMonth || createdDate.getFullYear() !== currentYear) {
             return false;
           }
         } else {
           return false; // Skip if no creation date
         }

         if (filtroSede && filtroSede !== 'Todas') {
           if (filtroSede === 'unassigned') {
             if (c.sede_id && sedes.some(s => s.id === c.sede_id)) return false;
           } else {
             if (String(c.sede_id) !== String(filtroSede)) return false;
           }
         }

         return true;
      });

      const count = monthContracts.length;
      
      // Calcular recaudo real mensual basado en pagos filtrados por sede
      const pagosFiltrados = pagosMesActual.filter(p => {
        if (filtroSede && filtroSede !== 'Todas') {
           if (filtroSede === 'unassigned') {
             if (p.contratos?.sede_id && sedes.some(s => s.id === p.contratos?.sede_id)) return false;
           } else {
             if (String(p.contratos?.sede_id) !== String(filtroSede)) return false;
           }
        }
        return true;
      });

      const recaudado = pagosFiltrados.reduce((acc, p) => acc + (Number(p.valor_pagado) || 0), 0);

      console.log(`[VERIFICACIÓN] Sede Filtro: ${filtroSede} | Contratos: ${count} | Recaudo: ${recaudado}`);

      return {
         recaudado,
         count,
         goal: globalMetaVal
      };
    } catch (err) {
      console.error("Error in salesStats useMemo:", err);
      return { recaudado: 0, count: 0, goal: globalMetaVal };
    }
  }, [contratos, filtroSede, globalMetaVal, pagosMesActual]);

  const uniqueSedes = Array.from(new Set(contratos.map(c => c.sede_id).filter(Boolean)));

  const renderLogisticsDate = (contrato: any, label: string, dateString: string | null, stateField: string, stateValue: string, dateField: string) => {
     if (!dateString) return null;
     const d = new Date(dateString);
     
     // Normalize to midnight para comprobaciones
     const offset = d.getTimezoneOffset() * 60000;
     const t = new Date(d.getTime() + offset).setHours(0,0,0,0);
     const startOfToday = new Date().setHours(0,0,0,0);

     let colorClass = "text-gray-500 bg-gray-100";
     let displayState = stateValue;
     let isDelivery = label === 'P. de Entrega';
     let isCompletedDelivery = isDelivery && (
       stateValue?.toLowerCase() === 'entregado' || 
       contrato.estado_entrega?.toLowerCase() === 'entregado' ||
       contrato.estado?.toLowerCase() === 'entregado' ||
       contrato.entregado_evento === true
     );

     if (isDelivery) {
       if (isCompletedDelivery) {
         colorClass = "text-emerald-700 bg-emerald-100 border-emerald-200";
         displayState = "ENTREGADO";
       } else if (t === startOfToday) {
         colorClass = "text-amber-800 bg-amber-100 animate-pulse border-amber-300";
       } else if (t < startOfToday) {
         colorClass = "text-rose-800 bg-rose-50 border-rose-300";
       } else {
         colorClass = "text-indigo-700 bg-indigo-50 border-indigo-100";
       }
     } else {
       if (stateValue === 'Asistió') {
         colorClass = "text-emerald-700 bg-emerald-100 border-emerald-200";
       } else if (stateValue === 'No Asistió') {
         colorClass = "text-rose-700 bg-rose-100 border-rose-200";
       } else if (t === startOfToday) {
         colorClass = "text-amber-800 bg-amber-100 animate-pulse border-amber-300";
       } else if (t < startOfToday) {
         colorClass = "text-rose-800 bg-rose-50 border-rose-300"; // Past due but pending
       } else {
         colorClass = "text-indigo-700 bg-indigo-50 border-indigo-100"; // Future appointments
       }
     }

     return (
       <div className={`text-xs p-2 mt-1.5 font-medium rounded-lg border ${colorClass} flex justify-between items-center group transition-colors shadow-sm`}>
         <div>
           <span className="font-bold uppercase opacity-80">{label}</span><br/>
           <span className="font-semibold text-sm -mt-0.5 block">{new Date(t).toLocaleDateString('es-CO')}</span>
           {(stateValue === 'Asistió' || stateValue === 'No Asistió' || isCompletedDelivery) && (
             <span className="block text-[9px] font-black uppercase tracking-wider mt-0.5">{displayState}</span>
           )}
         </div>
         <div className="flex gap-1 items-center">
           {!isDelivery && t <= startOfToday && stateValue !== 'Asistió' && (
             <>
               <button onClick={() => handleMarkAsistio(contrato.id, stateField)} className="p-1.5 bg-white hover:bg-emerald-50 text-emerald-600 rounded-md shadow-sm transition-colors border border-gray-100" title="Asistió / Realizado">
                 <CheckCircle2 className="w-4 h-4" />
               </button>
               <button onClick={() => openMissedModal(contrato.id, stateField, label)} className="p-1.5 bg-white hover:bg-rose-50 text-rose-600 rounded-md shadow-sm transition-colors border border-gray-100" title="No Asistió / Faltó">
                 <XCircle className="w-4 h-4" />
               </button>
             </>
           )}
           <button onClick={() => openEditModal(contrato, dateField, label)} className="p-1.5 bg-white hover:bg-blue-50 text-blue-600 rounded-md shadow-sm transition-colors border border-gray-100" title="Reprogramar">
             <Edit2 className="w-4 h-4" />
           </button>
         </div>
       </div>
     );
  };

  if (!isMounted) return null; // Evitar Hydration Mismatch en render inicial de fechas

  return (
    <div className="min-h-screen bg-[#f8fafc] flex">
      {/* MODAL DE EDICIÓN DE META GLOBAL */}
      {isEditGlobalMetaOpen && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-8 border border-white/20">
            <h3 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-indigo-500" /> Editar Meta Global
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Meta (COP)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="text-gray-400 font-bold">$</span>
                  </div>
                  <input
                    type="number"
                    value={editGlobalMetaInput}
                    onChange={(e) => setEditGlobalMetaInput(e.target.value)}
                    className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-gray-900 font-bold focus:ring-4 focus:ring-indigo-50 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  type="button"
                  onClick={() => setIsEditGlobalMetaOpen(false)}
                  className="flex-1 py-3 text-sm font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-2xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleUpdateGlobalMeta}
                  className="flex-1 py-3 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-2xl shadow-[0_0_20px_rgba(79,70,229,0.3)] transition-all"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Toaster position="top-center" richColors />

      <Sidebar user={user} handleLogout={handleLogout} activePage="dashboard" pendingDeposits={pendingDeposits} />

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-8">
        
        {String(user?.rol || '').toLowerCase() === 'admin' && <DepositAlert count={pendingDeposits}/>}
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-rose-100">
          <div className="flex-1">
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Dashboard Logístico</h1>
            <p className="text-rose-500 font-bold uppercase tracking-widest text-[10px] mt-1">Gestión Central de Inventario · Ambar Couture</p>
          </div>
          
          {/* SEARCH BAR COMPACTA */}
          <div className="relative group w-full sm:w-80">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400 group-hover:text-rose-500 transition-colors" />
            </div>
            <input
              type="text"
              placeholder="Buscar por nombre, cédula o contrato..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all hover:bg-white"
            />
          </div>

          <div className="flex items-center gap-3">
             <button 
               onClick={fetchContratos}
               className="p-2.5 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-rose-500 hover:bg-rose-50 transition-all"
               title="Refrescar Datos"
             >
               <RefreshCw className="w-5 h-5" />
             </button>
             <Link 
               href="/contratos/nuevo"
               className="flex items-center gap-2 px-5 py-2.5 bg-rose-500 text-white rounded-xl font-black text-sm shadow-lg shadow-rose-200 hover:bg-rose-600 transition-all active:scale-95"
             >
               <Plus className="w-5 h-5" /> NUEVO CONTRATO
             </Link>
          </div>
        </div>

        {/* --- CITAS ANALYTICS DASHBOARD --- */}


        {/* SUMMARY STATS (Imagen 5 Restore) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-700">
           <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-5 group hover:border-rose-200 transition-all">
              <div className="p-4 bg-rose-50 rounded-2xl text-rose-500 group-hover:rotate-6 transition-transform">
                 <ClipboardList className="w-6 h-6" />
              </div>
              <div>
                 <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Contratos {stats.activeBranch !== 'Todas' ? `(${stats.activeBranch})` : 'Globales'}</p>
                 <h3 className="text-2xl font-black text-gray-900 leading-none tracking-tighter">{stats.totalContratos}</h3>
              </div>
           </div>

           <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-5 group hover:border-indigo-200 transition-all">
              <div className="p-4 bg-indigo-50 rounded-2xl text-indigo-500 group-hover:rotate-6 transition-transform">
                 <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                 <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Vestidos en Evento</p>
                 <h3 className="text-2xl font-black text-gray-900 leading-none tracking-tighter">{stats.totalEnEvento}</h3>
              </div>
           </div>

           <div className="bg-white p-6 rounded-3xl shadow-sm border-2 border-emerald-100 flex items-center gap-5 group hover:bg-emerald-50 transition-all bg-emerald-50/20">
              <div className="p-4 bg-emerald-500 rounded-2xl text-white shadow-lg shadow-emerald-100 group-hover:scale-110 transition-transform">
                 <DollarSign className="w-6 h-6" />
              </div>
              <div>
                 <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest leading-none mb-1">Pendiente por Recaudar</p>
                 <h3 className="text-2xl font-black text-gray-900 leading-none tracking-tighter">{formatCurrency(stats.totalPendiente)}</h3>
              </div>
           </div>
        </div>

        {/* NEW: KPI QUICK VIEW (Imagen 5 Request) */}
        {kpiVestidos.length > 0 && (
           <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 p-6 animate-in slide-in-from-top-4 duration-500">
             <div className="flex items-center justify-between mb-4 px-2">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-500" /> Vestidos con mayor rentabilidad
                </h3>
                <Link href="/admin/reports" className="text-[10px] font-black text-rose-500 hover:text-rose-600 uppercase tracking-tighter"> Ver Reporte Full → </Link>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {kpiVestidos.map((v, i) => (
                  <div key={v.codigo} className="relative group">
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 group-hover:bg-rose-50 group-hover:border-rose-100 transition-all">
                       <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-black text-gray-900 truncate pr-2">{v.codigo}</span>
                          <span className="text-[10px] bg-white px-2 py-0.5 rounded-lg border border-gray-100 text-gray-500 font-bold">#{i+1}</span>
                       </div>
                       
                       {/* Official Name from sede_actual_id */}
                       <span className="mb-2 px-2 py-0.5 bg-gray-200 text-gray-600 rounded-lg text-[8px] font-black uppercase tracking-tight inline-block">
                          📍 {v.sede_nombre}
                       </span>

                       <p className="text-[9px] text-gray-400 font-bold truncate mb-2">{v.nombre || 'Vestido'}</p>
                       <div className="flex items-center gap-1">
                          <div className="h-1.5 flex-1 bg-gray-200 rounded-full overflow-hidden">
                             <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, (v.total_alquileres / kpiVestidos[0].total_alquileres) * 100)}%` }}></div>
                          </div>
                          <span className="text-[10px] font-black text-emerald-600">{v.total_alquileres} rentals</span>
                       </div>
                    </div>
                  </div>
                ))}
             </div>
           </div>
         )}

        {/* NEW: SALES THERMOMETER (Dashboard Recaudo) */}
        <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 p-6 animate-in slide-in-from-top-4 duration-500 mt-6 relative">
          
          {filtroSede === 'Todas' && isAdmin && (
            <div className="absolute top-6 right-6 z-10">
              <button 
                onClick={() => {
                  setEditGlobalMetaInput(globalMetaVal.toString());
                  setIsEditGlobalMetaOpen(true);
                }}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                title="Editar Meta Global"
              >
                <MoreVertical className="w-5 h-5 text-gray-400" />
              </button>
            </div>
          )}

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
             <div>
               <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                 <DollarSign className="w-4 h-4 text-rose-500" /> Rendimiento Comercial (Mes Actual)
               </h3>
               <p className="text-[10px] text-gray-500 font-bold mt-1">Contratos Creados este Mes: <span className="text-rose-500 font-black text-xs ml-1">{salesStats.count}</span></p>
             </div>
             
             <div className="text-right pr-10">
               <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">
                 Recaudo Real {filtroSede === 'Todas' ? '(Global)' : `(${activeBranchName})`}
               </p>
               <h3 className="text-3xl font-black text-gray-900 leading-none tracking-tighter">
                 {formatCurrency(salesStats.recaudado)}
               </h3>
               {filtroSede === 'Todas' && (
                 <p className="text-xs text-gray-400 font-bold mt-1">
                   Meta: {formatCurrency(salesStats.goal)}
                 </p>
               )}
             </div>
          </div>

          {/* Barra de Progreso Dinámica (Solo Global) */}
          {filtroSede === 'Todas' && (
            <div className="mt-4">
               {(() => {
                 const pct = Math.min(100, Math.round((salesStats.recaudado / salesStats.goal) * 100));
                 let colorClass = "bg-red-500";
                 if (pct > 50 && pct <= 99) colorClass = "bg-yellow-500";
                 if (pct >= 100) colorClass = "bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)]";

                 return (
                   <div className="relative">
                     <div className="flex justify-between text-[10px] font-bold text-gray-400 mb-1">
                       <span>Progreso de Meta</span>
                       <span className={pct >= 100 ? 'text-green-500 font-black' : ''}>{pct}%</span>
                     </div>
                     <div className="h-4 bg-gray-100 rounded-full overflow-hidden relative">
                       <div 
                         className={`h-full rounded-full transition-all duration-1000 ${colorClass}`}
                         style={{ width: `${pct}%` }}
                       />
                     </div>
                   </div>
                 );
               })()}
            </div>
          )}
        </div>

        {/* ALERTAS DE CONTROL OPERATIVO */}
        {(alerts.entregasOmitidasCount > 0 || alerts.borradoresVencidosCount > 0) && (
          <div className="flex flex-wrap gap-4 p-4 bg-white rounded-2xl border border-rose-100 shadow-sm animate-in fade-in duration-500">
            <span className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center mr-2 self-center">
              ⚠️ Alertas de Control:
            </span>
            
            {alerts.entregasOmitidasCount > 0 && (
              <button
                onClick={() => setFiltroAlerta(filtroAlerta === 'entregas_omitidas' ? 'ninguna' : 'entregas_omitidas')}
                className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 border uppercase tracking-tighter ${
                  filtroAlerta === 'entregas_omitidas'
                    ? 'bg-rose-600 border-rose-700 text-white shadow-md shadow-rose-200 animate-pulse'
                    : 'bg-rose-50 border-rose-100 text-rose-600 hover:bg-rose-100'
                }`}
              >
                ⚠️ {alerts.entregasOmitidasCount} Entregas pendientes por registrar (fechas vencidas)
              </button>
            )}

            {alerts.borradoresVencidosCount > 0 && (
              <button
                onClick={() => setFiltroAlerta(filtroAlerta === 'borradores_sin_firmar' ? 'ninguna' : 'borradores_sin_firmar')}
                className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 border uppercase tracking-tighter ${
                  filtroAlerta === 'borradores_sin_firmar'
                    ? 'bg-amber-500 border-amber-600 text-white shadow-md shadow-amber-100 animate-pulse'
                    : 'bg-amber-50 border-amber-100 text-amber-600 hover:bg-amber-100'
                }`}
              >
                📝 {alerts.borradoresVencidosCount} Contratos en borrador pendientes por firmar
              </button>
            )}

            {filtroAlerta !== 'ninguna' && (
              <button
                onClick={() => setFiltroAlerta('ninguna')}
                className="ml-auto px-3 py-2 text-xs font-bold text-gray-500 hover:text-gray-700 bg-gray-50 border border-gray-200 rounded-xl transition-all"
              >
                Mostrar Todos
              </button>
            )}
          </div>
        )}

        {/* Filtros de Calidad Logistica */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-gray-500 font-bold text-sm mr-2 w-full md:w-auto">Hito Logístico:</span>
                {['Todos', 'Cita de Medidas', 'Prueba Final', 'Fecha de Entrega/Envío', 'Sesión Pre-XV'].map(fh => (
                  <button
                    key={fh}
                    onClick={() => setFiltroHito(fh)}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                      filtroHito === fh 
                        ? 'bg-rose-500 text-white shadow-md shadow-rose-200' 
                        : 'bg-gray-100 text-gray-600 hover:bg-rose-50 hover:text-rose-600'
                    }`}
                  >
                    {fh}
                  </button>
                ))}
              </div>
              
              <div className="flex flex-wrap items-center gap-3">
                {/* PREXV Toggle Filter */}
                {(() => {
                  const prexvCount = contratos.filter(c => hasPrexv(c)).length;
                  const prexvIncompletos = contratos.filter(c => {
                    const isPreXV = hasPrexv(c);
                    if (!isPreXV) return false;
                    const excluido = ['cancelado', 'rechazado', 'finalizado'].includes(c.estado?.toLowerCase());
                    if (excluido) return false;
                    return prexvPending(c).length > 0;
                  }).length;
                  return (
                    <button
                      onClick={() => setFiltroTipoEvento(filtroTipoEvento === 'PREXV' ? 'Todos' : 'PREXV')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black transition-all border-2 ${
                        filtroTipoEvento === 'PREXV'
                          ? 'bg-violet-600 border-violet-700 text-white shadow-md shadow-violet-200'
                          : 'bg-white border-gray-200 text-gray-500 hover:border-violet-300 hover:text-violet-600'
                      }`}
                    >
                      <Camera className="w-4 h-4" />
                      Solo PREXV / 15 Años
                      <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                        filtroTipoEvento === 'PREXV' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {prexvCount}
                      </span>
                      {prexvIncompletos > 0 && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-400 text-white rounded-full text-[10px] font-black">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          {prexvIncompletos} incompletos
                        </span>
                      )}
                    </button>
                  );
                })()}

                <div className="flex items-center gap-2">
                  <span className="text-gray-500 font-bold text-sm">Sede:</span>
                  <select 
                    value={filtroSede} 
                    onChange={(e) => setFiltroSede(e.target.value)}
                    className="bg-gray-50 border border-gray-200 text-gray-800 rounded-xl px-4 py-2 font-bold focus:ring-2 focus:ring-rose-300 outline-none"
                  >
                    <option value="Todas">Todas las Sedes</option>
                    {sedes.map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                    {contratos.some(c => !c.sede_id || !sedes.some(s => s.id === c.sede_id)) && (
                      <option value="unassigned">Pereira</option>
                    )}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 items-center pt-4 border-t border-gray-100">
              <span className="text-gray-500 font-bold text-sm mr-2 w-full md:w-auto">Rango de Tiempo:</span>
              {['Cualquier Fecha', 'Hoy', 'Esta Semana', 'Este Mes', 'Personalizado'].map(fr => (
                 <button
                   key={fr}
                   onClick={() => setFiltroRango(fr)}
                   className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${
                     filtroRango === fr 
                       ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' 
                       : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                   }`}
                 >
                   {fr}
                 </button>
              ))}

              {filtroRango === 'Personalizado' && (
                <div className="flex items-center gap-2 ml-2 animate-in fade-in zoom-in duration-200">
                  <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="text-sm bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 font-medium focus:ring-2 focus:ring-indigo-300" />
                  <span className="text-gray-400 font-bold">-</span>
                  <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="text-sm bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 font-medium focus:ring-2 focus:ring-indigo-300" />
                </div>
              )}
            </div>
        </div>

        {/* Tabla Principal */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h2 className="text-xl font-black text-gray-900 uppercase tracking-tighter">Gestión de Operaciones</h2>
              <div className="flex bg-gray-200/50 p-1 rounded-2xl border border-gray-100 shadow-inner">
                {[
                  { id: 'por_entregar', label: 'Por Entregar', icon: '📦' },
                  { id: 'en_evento', label: 'En Evento', icon: '👗' },
                  { id: 'lavanderia', label: 'Logística / Lavandería', icon: '🧼' },
                  { id: 'historial', label: 'Historial', icon: '📁' },
                  { id: 'anulados', label: 'Anulados', icon: '🚫' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTabLogistica(tab.id as any)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
                      activeTabLogistica === tab.id
                        ? `bg-white text-rose-600 shadow-md transform scale-105`
                        : 'text-gray-400 hover:text-gray-600 hover:bg-white/50'
                    }`}
                  >
                    <span>{tab.icon}</span>
                    <span className="hidden md:inline uppercase tracking-tighter">{tab.label}</span>
                  </button>
                ))}
              </div>
            </div>
          
          <div className="overflow-x-visible pb-32">
            {outsideDresses.filter(v=>Number(v.dias_fuera)>=9).length>0&&<section className="mx-4 mb-5 rounded-2xl border border-red-200 bg-red-50 p-5"><h2 className="font-black text-red-800">Gestión de Operaciones · vestidos fuera de tienda</h2><div className="mt-3 grid gap-3">{outsideDresses.filter(v=>Number(v.dias_fuera)>=9).map(v=><article key={v.id} className="rounded-xl bg-white p-4 text-sm shadow-sm"><strong className="text-red-700">⚠️ Vestido fuera de tienda por {v.dias_fuera} días</strong><p>Vestido: {v.vestido_codigo} · Cliente: {v.cliente_nombre} · Contrato: {v.numero_contrato}</p><p>Factura: {v.numero_factura||'Sin factura'} · Sede: {v.sede} · Salida: {new Date(v.salida_at).toLocaleString('es-CO')}</p><p className="font-bold">Estado: ALERTA · Requiere seguimiento</p></article>)}</div></section>}
            
            {/* VISTA MOBILE (Cards) */}
            <div className="xl:hidden p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
              {loading && contratos.length === 0 ? (
                 <div className="col-span-1 md:col-span-2 text-center text-gray-400 py-12">
                   <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-rose-300" />
                   Cargando contratos...
                 </div>
              ) : contratosFiltrados.length === 0 ? (
                 <div className="col-span-1 md:col-span-2 text-center text-gray-500 py-12 bg-gray-50 rounded-2xl border border-gray-100">
                   No hay contratos que coincidan con los filtros actuales.
                 </div>
              ) : contratosFiltrados.map((c) => {
                  const isPreXVIncompleto = (() => {
                    const isPreXV = hasPrexv(c);
                    if (!isPreXV) return false;
                    const excluido = ['cancelado', 'rechazado', 'finalizado'].includes(c.estado?.toLowerCase());
                    if (excluido) return false;
                    return prexvPending(c).length > 0;
                  })();
                  return (
                 <div key={c.id} className={`bg-white rounded-2xl shadow-sm border p-5 flex flex-col gap-4 relative hover:shadow-md transition-shadow ${
                    calculateLateDays(c) > 0 && activeTabLogistica === 'en_evento' ? 'border-rose-500 border-2 animate-pulse-slow shadow-rose-100 ring-4 ring-rose-50/50' : 
                    isPreXVIncompleto ? 'border-amber-300 border-2 bg-amber-50/30' : 'border-gray-200'
                  }`}>
                    <div className="absolute top-4 right-4 z-10"><ActionMenu c={c} /></div>
                    
                    <div>
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col gap-1">
                           <span className="text-xs bg-rose-100 text-rose-700 font-black px-2 py-1 rounded-md w-fit">
                             {c.numero_contrato}
                           </span>
                           {calculateLateDays(c) > 0 && activeTabLogistica === 'en_evento' && (
                             <span className="text-[10px] bg-rose-600 text-white font-black px-2 py-0.5 rounded-full animate-bounce w-fit shadow-lg">
                               ⚠️ MORA: {calculateLateDays(c)} DÍAS
                             </span>
                           )}
                        </div>
                      </div>
                      <h3 className="font-bold text-gray-900 mt-2 text-lg">
                        {c.cliente_nombre}
                      </h3>
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-1"><FileText className="w-3 h-3"/> {c.cliente_documento}</p>
                    </div>

                    <div className="flex flex-wrap justify-between items-center gap-2 border-y border-gray-50 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2.5 py-1 inline-flex text-xs font-bold rounded-lg ${
                          ['finalizado', 'cancelado', 'rechazado'].includes(c.estado?.toLowerCase()) ? 'bg-emerald-500 text-white shadow-sm' :
                          c.estado === 'mantenimiento' ? 'bg-amber-500 text-white shadow-sm shadow-amber-200' :
                          ((c.entregas && c.entregas.length > 0) || c.estado === 'entregado') ? 'bg-indigo-600 text-white shadow-sm' :
                          c.estado === 'firmado' ? 'bg-emerald-100 text-emerald-800' : 
                          c.estado === 'borrador' ? 'bg-amber-100 text-amber-800' : 
                          'bg-gray-100 text-gray-800'}`}>
                          {['finalizado', 'cancelado', 'rechazado'].includes(c.estado?.toLowerCase()) ? '✅ FINALIZADO' :
                           c.estado === 'mantenimiento' ? '🛠️ EN MANTENIMIENTO' :
                           ((c.entregas && c.entregas.length > 0) || c.estado === 'entregado') ? '👗 EN EVENTO' : 
                           c.estado.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    <div className="bg-gray-50/50 rounded-xl p-3 border border-gray-100/50 space-y-1">
                      {renderLogisticsDate(c, 'Cita Medidas', c.fecha_cita_medidas, 'estado_medidas', c.estado_medidas, 'fecha_cita_medidas')}
                      {renderLogisticsDate(c, 'Prueba Final', c.fecha_prueba_final, 'estado_prueba_final', c.estado_prueba_final, 'fecha_prueba_final')}
                      {renderLogisticsDate(c, 'P. de Entrega', c.fecha_entrega_envio, 'estado_entrega_envio', c.estado_entrega_envio, 'fecha_entrega_envio')}
                      
                      {c.fecha_pre_xv && (
                        <div 
                          onClick={() => openPreXvModal(c)}
                          className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-all group/prexv ${isPreXVIncompleto ? 'bg-amber-100 hover:bg-amber-200 border border-amber-200' : 'bg-emerald-50 hover:bg-emerald-100 border border-emerald-100'}`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-md shadow-sm ${isPreXVIncompleto ? 'bg-amber-200 text-amber-700' : 'bg-white text-emerald-600'}`}>
                              <Camera className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex flex-col">
                              <span className={`text-[10px] font-black uppercase tracking-widest leading-none mb-0.5 ${isPreXVIncompleto ? 'text-amber-800' : 'text-emerald-700'}`}>Sesión Pre-XV</span>
                              <span className={`text-xs font-bold leading-tight ${isPreXVIncompleto ? 'text-amber-900' : 'text-emerald-600'}`}>
                                {prexvSummary(c)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex justify-between items-end mt-2 pt-2 border-t border-gray-100">
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-gray-400">Saldo</span>
                        {Number(c.saldo) > 0 ? (
                           <span className="font-bold text-rose-600 text-base">{formatCurrency(Number(c.saldo))}</span>
                        ) : (
                           <span className="font-bold text-emerald-500 text-base flex items-center gap-1"><CheckCircle2 className="w-4 h-4"/> Pagado</span>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="text-xs font-bold text-gray-500 line-clamp-1 max-w-[100px]" title="Vestidos Atados">
                          Vestidos: {loading ? '(Cargando...)' : (c.vestidos_count || c.prendas?.length || 0)}
                        </span>
                        {activeTabLogistica === 'lavanderia' && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleManualRelease(c);
                            }}
                            className="px-3 py-1.5 bg-indigo-500 text-white text-[10px] font-black rounded-lg transition-all shadow-md shadow-indigo-100 flex items-center gap-1.5 uppercase active:scale-95"
                          >
                            <RefreshCw className="w-3 h-3" /> Ingreso Tienda
                          </button>
                        )}
                      </div>
                    </div>
                 </div>
              ); })}
            </div>

            {/* VISTA DESKTOP (Table) */}
            <div className="hidden xl:block overflow-x-auto overflow-y-visible">
              <table className="w-full text-left border-collapse min-w-[1200px]">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="px-6 py-4 font-semibold">Número</th>
                  <th className="px-6 py-4 font-semibold">Cliente</th>
                  <th className="px-6 py-4 font-semibold">Logística</th>
                  <th className="px-6 py-4 font-semibold">Vestido(s)</th>
                  <th className="px-6 py-4 font-semibold">Sede</th>
                  <th className="px-6 py-4 font-semibold">Estado</th>
                  <th className="px-6 py-4 font-semibold">Saldo</th>
                  <th className="px-6 py-4 font-black uppercase text-rose-800 text-center sticky right-0 bg-gray-50/95 z-10 shadow-l-md">Gestión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && contratos.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-rose-300" />
                      Cargando contratos...
                    </td>
                  </tr>
                ) : contratosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                      No hay contratos que coincidan con los filtros actuales.
                    </td>
                  </tr>
                ) : (
                  contratosFiltrados.map((c) => {
                    const isPreXVIncompleto = (() => {
                      const isPreXV = hasPrexv(c);
                      if (!isPreXV) return false;
                      const excluido = ['cancelado', 'rechazado', 'finalizado'].includes(c.estado?.toLowerCase());
                      if (excluido) return false;
                      return prexvPending(c).length > 0;
                    })();
                    return (
                    <tr key={c.id} className={`transition-colors group border-b border-gray-100 ${isPreXVIncompleto ? 'bg-amber-50/60 hover:bg-amber-100/60' : 'hover:bg-rose-50/40'}`}>
                      <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-800">{c.numero_contrato}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{c.cliente_nombre}</div>
                        <div className="text-xs text-gray-500">{c.cliente_documento}</div>
                      </td>
                      <td className="px-4 py-2 min-w-[200px]">
                        {renderLogisticsDate(c, 'Cita Medidas', c.fecha_cita_medidas, 'estado_medidas', c.estado_medidas, 'fecha_cita_medidas')}
                        {renderLogisticsDate(c, 'Prueba Final', c.fecha_prueba_final, 'estado_prueba_final', c.estado_prueba_final, 'fecha_prueba_final')}
                        {renderLogisticsDate(c, 'P. de Entrega', c.fecha_entrega_envio, 'estado_entrega_envio', c.estado_entrega_envio, 'fecha_entrega_envio')}
                        
                        {c.fecha_pre_xv && (
                          <div 
                            onClick={() => openPreXvModal(c)}
                            className={`mt-1 flex items-center justify-between p-2 border rounded-lg cursor-pointer transition-all ${isPreXVIncompleto ? 'bg-amber-100 border-amber-200' : 'bg-emerald-50 border-emerald-100'}`}
                          >
                            <div className="flex items-center gap-2">
                              <Camera className={`w-3.5 h-3.5 ${isPreXVIncompleto ? 'text-amber-700' : 'text-emerald-600'}`} />
                              <div className="flex flex-col">
                                <span className={`text-[9px] font-black uppercase tracking-widest ${isPreXVIncompleto ? 'text-amber-800' : 'text-emerald-700'} leading-none`}>Sesión Pre-XV</span>
                                <span className={`text-[11px] font-bold ${isPreXVIncompleto ? 'text-amber-900' : 'text-emerald-600'} leading-tight`}>
                                  {prexvSummary(c)}
                                </span>
                              </div>
                            </div>
                            {isPreXVIncompleto && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-700">
                        {c.vestidos_count || c.prendas?.length || 0}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{c.sede}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-lg border ${
                          ['finalizado', 'cancelado', 'rechazado'].includes(c.estado?.toLowerCase()) ? 'bg-emerald-500 text-white shadow-md border-transparent' :
                          c.estado === 'mantenimiento' ? 'bg-amber-500 text-white border-transparent' : 
                          ((c.entregas && c.entregas.length > 0) || c.estado === 'entregado') ? 'bg-indigo-600 text-white shadow-md border-transparent' : 
                          'bg-gray-50 text-gray-700 border-gray-200'}`}>
                          {['finalizado', 'cancelado', 'rechazado'].includes(c.estado?.toLowerCase()) ? '✅ FINALIZADO' :
                           c.estado === 'mantenimiento' ? '🛠️ EN MANTENIMIENTO' :
                           ((c.entregas && c.entregas.length > 0) || c.estado === 'entregado') ? '👗 EN EVENTO' : 
                           c.estado ? c.estado.toUpperCase() : 'SIN ESTADO'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-700">
                        {formatCurrency(Number(c.saldo))}
                      </td>
                       <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-black flex items-center justify-end gap-2 sticky right-0 z-10 shadow-l-md"
                         style={{ backgroundColor: isPreXVIncompleto ? 'rgb(255 251 235 / 0.95)' : 'rgb(255 255 255 / 0.95)' }}
                       >
                         <ActionMenu c={c} />
                       </td>
                    </tr>
                  ); })
                )}
              </tbody>
              </table>
            </div>
          </div>
        </div>
      {/* End max-w-7xl Wrapper */}

      {/* Render oculto para generación de PDF */}
      {contractForPdf && (
        <div style={{ position: 'absolute', top: '-10000px', left: '-10000px', opacity: 0, pointerEvents: 'none' }}>
          <div id="hidden-pdf-template" style={{ width: '800px', backgroundColor: 'white' }}>
            <ContractTemplate data={contractForPdf} plantillas={plantillas} />
          </div>
        </div>
      )}

      {/* Modal Reusable: Inasistencia */}
      {missedModalOpen && missedData && (
        <div className="fixed inset-0 z-50 bg-gray-900/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-rose-500 px-6 py-4 flex justify-between items-center text-white">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5"/> Penalización de Asistencia
              </h3>
              <button disabled={modalLoading} onClick={() => setMissedModalOpen(false)} className="text-rose-100 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Estás a punto de registrar una inasistencia para la fase <strong>"{missedData.title}"</strong>. Esto quedará registrado en la bitácora de auditoría inmutable de la empresa.
              </p>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-800">Causal o Motivo *</label>
                <textarea 
                  value={missedMotivo}
                  onChange={(e) => setMissedMotivo(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 text-gray-900 justify-start rounded-xl px-4 py-3 focus:ring-2 focus:ring-rose-300 font-medium" 
                  rows={3} 
                  placeholder="Ej: Cliente canceló a última hora, cliente postergó viaje..."
                  required
                />
              </div>
              <div className="pt-2 flex gap-3">
                <button 
                  onClick={() => setMissedModalOpen(false)}
                  disabled={modalLoading}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors disabled:opacity-50"
                >Cancelar</button>
                <button 
                  onClick={submitMissedModal}
                  disabled={modalLoading || missedMotivo.trim().length < 5}
                  className="flex-1 px-4 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 flex justify-center items-center gap-2 shadow-md shadow-rose-200"
                >{modalLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sancionar Cita'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Reusable: Edición de Fecha (Reprogramación con Validación) */}
      {editModalOpen && editData && (
        <div className="fixed inset-0 z-50 bg-gray-900/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center text-white">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <CalendarDays className="w-5 h-5"/> Cambiar Fecha: {editData.fieldLabel}
              </h3>
              <button disabled={modalLoading} onClick={() => setEditModalOpen(false)} className="text-indigo-100 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Se ejecutará el motor de validación para asegurar que los cambios de fecha no causen superposición (Overbooking) con el inventario actual.
              </p>
              
              <div className="space-y-4">
                <div>
                   <label className="text-sm font-semibold text-gray-800 block mb-1">Nueva Fecha Seleccionada *</label>
                   <input 
                     type={editData.fieldKey === 'fecha_pre_xv' ? 'datetime-local' : 'date'} 
                     value={editNewDate} 
                     onChange={(e)=>setEditNewDate(e.target.value)} 
                     className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-300 font-medium" 
                   />
                </div>
                <div>
                   <label className="text-sm font-semibold text-gray-800 block mb-1">Causal / Motivo del Cambio *</label>
                   <textarea 
                     value={editMotivo}
                     onChange={(e) => setEditMotivo(e.target.value)}
                     className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-300 font-medium" 
                     rows={3} 
                     placeholder="Explica a detalle por qué se requiere mover esta fecha oficial."
                     required
                   />
                </div>
              </div>
              
              <div className="pt-2 flex gap-3">
                <button 
                  onClick={() => setEditModalOpen(false)}
                  disabled={modalLoading}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors disabled:opacity-50"
                >Cancelar</button>
                <button 
                  onClick={submitEditModal}
                  disabled={modalLoading || editMotivo.trim().length < 5 || !editNewDate}
                  className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 flex justify-center items-center gap-2 shadow-md shadow-indigo-200"
                >{modalLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Re-Validar e Impactar'}</button>
              </div>

              {/* STEP 3 DEFINITIVE: Localized History (Imagen 2 Request) */}
              {modalLocalHistory.length > 0 && (
                <div className="mt-6 pt-4 border-t border-gray-100">
                   <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                     <Clock className="w-3 h-3" /> Historial de Cambios de Fechas
                   </h4>
                   <div className="space-y-3 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                     {modalLocalHistory.map((h, i) => (
                       <div key={i} className="p-3 bg-gray-50 rounded-xl border border-gray-100 relative overflow-hidden">
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-[9px] font-black text-indigo-600 uppercase bg-white px-2 py-0.5 rounded shadow-sm">Auditado</span>
                            <span className="text-[9px] text-gray-400 font-bold">{new Date(h.created_at).toLocaleDateString()}</span>
                          </div>
                          <p className="text-[11px] text-gray-700 font-medium leading-relaxed">{h.detalle}</p>
                          <p className="text-[9px] text-gray-400 mt-1 font-bold italic">— {h.usuario}</p>
                       </div>
                     ))}
                   </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Reusable: Vendors Pre-XV */}
      {preXvModalOpen && preXvData && (
        <div role="dialog" aria-modal="true" aria-label="Servicios PRE-XV del contrato" className="fixed inset-0 z-[200] bg-gray-900/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
            <div className="bg-emerald-600 px-6 py-4 flex justify-between items-center text-white">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Camera className="w-5 h-5"/> Tarjeta Logística Pre-XV
              </h3>
              <button disabled={modalLoading} onClick={() => setPreXvModalOpen(false)} className="text-emerald-100 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <PreXvFields baseline={preXvData} value={preXvForm} onChange={patch => setPreXvForm(prev => ({ ...prev, ...patch }))} confirmations disabled={modalLoading} />
              <div role="status" className="text-sm text-red-700">{preXvError}</div>
              <div className="pt-2 flex gap-3">
                <button 
                  onClick={() => setPreXvModalOpen(false)}
                  disabled={modalLoading}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors disabled:opacity-50"
                >Cerrar</button>
                <button 
                  onClick={submitPreXvModal}
                  disabled={modalLoading}
                  className="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 flex justify-center items-center gap-2 shadow-md shadow-emerald-200"
                >{modalLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Guardar PRE-XV'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Reusable: Registro de Entrega Blindada */}
      {deliveryModalOpen && deliveryData && (
        <div className="fixed inset-0 z-50 bg-gray-900/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-amber-600 px-6 py-4 flex justify-between items-center text-white">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <ShieldCheck className="w-6 h-6"/> Bitácora de Entrega Física
              </h3>
              <button disabled={modalLoading} onClick={() => setDeliveryModalOpen(false)} className="text-amber-100 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {depositBlock?.id===deliveryData.id&&<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><strong className="block">No se puede entregar el vestido.</strong> Primero debe registrarse el depósito correspondiente. <Link className="mt-3 inline-flex rounded-lg bg-red-700 px-3 py-2 font-bold text-white" href={`/dashboard/devoluciones-depositos?contratoId=${encodeURIComponent(deliveryData.id)}`}>REGISTRAR DEPÓSITO</Link></div>}
              <p className="text-sm text-gray-600">
                Registra fotográficamente el estado del vestido al momento de entregarlo. El expediente generará un acta de conformidad vinculante.
              </p>
              
              <div className="space-y-4">
                
                <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 flex items-center justify-between">
                  <div className="flex-1">
                    {deliveryData.fecha_pre_xv ? (
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-black text-amber-800 uppercase tracking-widest">Tipo de Entrega</label>
                        <select 
                          value={deliveryType}
                          onChange={(e) => {
                            setDeliveryType(e.target.value as any);
                            setDeliveryConjunta(e.target.value === 'AMBOS');
                          }}
                          className="bg-white border border-amber-200 text-amber-900 rounded-lg px-2 py-1 text-xs font-bold outline-none"
                        >
                          {!deliveryData.entregado_prexv && <option value="PREXV">PRE-XV (Sesión)</option>}
                          {!deliveryData.entregado_evento && <option value="EVENTO">EVENTO PRINCIPAL</option>}
                          {deliveryConjunta && <option value="AMBOS">CONJUNTA (PRE-XV + EVENTO)</option>}
                        </select>
                      </div>
                    ) : (
                      <p className="text-xs font-black text-amber-800 uppercase tracking-widest">
                        Tipo de Entrega: EVENTO PRINCIPAL
                      </p>
                    )}
                  </div>
                  {deliveryData.fecha_pre_xv && (
                    <label className="flex items-center gap-2 cursor-pointer ml-4">
                      <input 
                        type="checkbox" 
                        checked={deliveryConjunta}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setDeliveryConjunta(checked);
                          if (checked) {
                            setDeliveryType('AMBOS');
                          } else {
                            setDeliveryType(!deliveryData.entregado_prexv ? 'PREXV' : 'EVENTO');
                          }
                        }}
                        className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500 cursor-pointer"
                      />
                      <span className="text-[10px] font-bold text-gray-700 uppercase tracking-widest mt-0.5">Conjunta</span>
                    </label>
                  )}
                </div>

                <div>
                   <label className="text-sm font-bold text-gray-800 block mb-1">Asesora Responsable *</label>
                   <select 
                      value={selectedAsesoraId}
                      onChange={(e) => setSelectedAsesoraId(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-4 py-3 focus:ring-2 focus:ring-amber-400 outline-none font-bold"
                   >
                      <option value="">Selecciona una asesora...</option>
                      {(() => {
                        const filtradas = asesoras.filter((a: any) => {
                          if (!deliveryData?.sede_id) return true;
                          return a.sede_id === deliveryData.sede_id;
                        });
                        const listaFinal = filtradas.length > 0 ? filtradas : asesoras;
                        return listaFinal.map((a: any) => (
                          <option key={a.id} value={a.id}>{a.nombre_completo}</option>
                        ));
                      })()}
                   </select>
                </div>

                <div>
                   <label className="text-sm font-bold text-gray-800 block mb-1">Estado Físico y Accesorios *</label>
                   <textarea 
                     value={deliveryObs}
                     onChange={(e)=>setDeliveryObs(e.target.value)}
                     className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-4 py-3 focus:ring-2 focus:ring-amber-400 focus:border-transparent font-medium" 
                     rows={3}
                     placeholder="Ej: Vestido en excelente estado, sin manchas. Se entrega corona modelo X, y cancan reforzado..."
                   />
                </div>
                
                <div>
                   <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-bold text-gray-800">Evidencias Fotográficas</label>
                      <span className="text-xs font-bold text-gray-400">{deliveryPhotos.length} / 5</span>
                   </div>
                   <div className="border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center hover:bg-gray-50 transition-colors relative cursor-pointer">
                      <input 
                         type="file" 
                         accept="image/*" 
                         multiple 
                         disabled={deliveryPhotos.length >= 5}
                         onChange={(e) => {
                            if(e.target.files) {
                               const arr = Array.from(e.target.files);
                               if (arr.length + deliveryPhotos.length > 5) return toast.error('Máximo 5 imágenes permitidas en total.');
                               setDeliveryPhotos((prev) => [...prev, ...arr].slice(0, 5));
                            }
                         }}
                         className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" 
                      />
                      <UploadCloud className="w-8 h-8 mx-auto text-amber-500 mb-2"/>
                      <p className="text-sm text-gray-600 font-bold">Haz Clic o Arrastra fotos aquí</p>
                      <p className="text-xs text-gray-400 mt-1">Soporta JPG, PNG (Máx 5M/foto)</p>
                   </div>
                   {deliveryPhotos.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                         {deliveryPhotos.map((f, i) => (
                            <div key={i} className="px-3 py-1 bg-amber-50 rounded-lg text-xs font-semibold text-amber-700 border border-amber-200 flex items-center gap-2 shadow-sm">
                              {f.name.substring(0,12)}... <button onClick={()=>setDeliveryPhotos(deliveryPhotos.filter((_,ix)=>ix!==i))}><X className="w-3 h-3 text-rose-500 hover:text-rose-700"/></button>
                            </div>
                         ))}
                      </div>
                   )}
                </div>
              </div>
              
              <div className="pt-4 flex gap-3">
                <button 
                  onClick={() => setDeliveryModalOpen(false)}
                  disabled={modalLoading}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors disabled:opacity-50"
                >Cancelar</button>
                <button 
                  onClick={submitDeliveryModal}
                  disabled={modalLoading || deliveryObs.trim().length < 5 || deliveryPhotos.length === 0}
                  className="flex-1 px-4 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-colors disabled:opacity-50 border-b-4 border-amber-700 active:border-b-0 active:translate-y-1 shadow-md shadow-amber-200 flex items-center justify-center gap-2"
                >{modalLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sellar Acta y Generar Firma'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Agregar Nota de Seguimiento */}
      {isNoteModalOpen && selectedContract && (
        <div className="fixed inset-0 z-[250] bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
           <div className="bg-white rounded-[2.5rem] w-full max-w-lg overflow-hidden shadow-2xl border border-sky-100 animate-in zoom-in-95 duration-300">
              <div className="p-8">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                          <span className="p-2 bg-sky-100 rounded-xl text-sky-600"><MessageSquare className="w-6 h-6" /></span> 
                          Seguimiento Cliente
                        </h2>
                        <p className="text-sky-500 text-xs font-bold uppercase tracking-widest mt-2 ml-1">Registro de Comunicación Interna</p>
                    </div>
                    <button onClick={() => setIsNoteModalOpen(false)} className="p-2 hover:bg-sky-50 rounded-full transition-colors">
                        <X className="w-6 h-6 text-gray-400" />
                    </button>
                  </div>

                  <div className="p-5 bg-sky-50/50 rounded-2xl border border-sky-100 mb-6 flex justify-between items-center">
                    <div>
                      <span className="block text-[10px] font-black uppercase text-sky-400 mb-1 tracking-widest">Contrato / Cliente</span>
                      <span className="text-base font-black text-sky-900">#{selectedContract.numero_contrato} - {selectedContract.cliente_nombre}</span>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Tipo de Contacto</label>
                      <div className="grid grid-cols-2 gap-3">
                        {['WhatsApp', 'Llamada', 'Presencial', 'Otro'].map((tipo) => (
                           <button
                            key={tipo}
                            onClick={() => setNoteForm({ ...noteForm, tipo })}
                            className={`py-3 px-4 rounded-xl border-2 font-bold text-sm transition-all active:scale-95 ${
                              noteForm.tipo === tipo 
                                ? 'bg-sky-500 border-sky-600 text-white shadow-lg shadow-sky-100' 
                                : 'bg-gray-50 border-gray-100 text-gray-600 hover:border-sky-200'
                            }`}
                           >
                             {tipo}
                           </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Resumen de lo conversado</label>
                      <textarea
                        value={noteForm.contenido}
                        onChange={(e) => setNoteForm({ ...noteForm, contenido: e.target.value })}
                        placeholder="Ej: La cliente confirma que vendrá mañana por la tarde para la prueba..."
                        className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-sky-500 focus:ring-4 focus:ring-sky-50 transition-all font-medium text-gray-900 placeholder:text-gray-300 min-h-[160px] outline-none"
                      />
                    </div>

                    <div className="flex gap-3 pt-2">
                       <button 
                        onClick={() => setIsNoteModalOpen(false)}
                        disabled={noteLoading}
                        className="flex-1 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black rounded-2xl transition-all active:scale-95 disabled:opacity-50"
                       >Cancelar</button>
                       <button 
                        onClick={handleSaveNote}
                        disabled={noteLoading || !noteForm.contenido.trim()}
                        className="flex-[1.5] py-4 bg-sky-500 hover:bg-sky-600 text-white font-black rounded-2xl shadow-lg shadow-sky-200 transition-all active:scale-95 flex items-center justify-center gap-2 border-b-4 border-sky-700 active:border-b-0 active:translate-y-1 disabled:opacity-50"
                       >
                         {noteLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Guardar Nota'}
                       </button>
                    </div>
                  </div>
              </div>
           </div>
        </div>
      )}

        </div>
      </main>

      {/* DRAWER: Vista 360 del Contrato */}
      {drawerOpen && selectedContract && (
        <div className="fixed inset-0 z-[150] overflow-hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setDrawerOpen(false)} />
          
          <div className="absolute inset-y-0 right-0 max-w-full flex">
            <div className="w-screen max-w-md transform transition-all duration-500 ease-in-out">
              <div className="h-full flex flex-col bg-white shadow-2xl rounded-l-[3rem] overflow-hidden border-l border-rose-100">
                
                {/* Drawer Header */}
                <div className={`p-8 border-b transition-colors duration-300 flex justify-between items-center ${isEditingDrawer ? 'bg-amber-50 border-amber-100' : 'bg-rose-50 border-rose-100'}`}>
                  <div>
                    <span className={`text-[10px] font-black uppercase tracking-widest ${isEditingDrawer ? 'text-amber-500' : 'text-rose-400'}`}>
                      {isEditingDrawer ? 'Modo Edición ERP' : 'Vista 360 del Contrato'}
                    </span>
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">#{selectedContract.numero_contrato}</h2>
                  </div>
                  {isEditingDrawer ? (
                    <button 
                      onClick={() => setIsEditingDrawer(false)}
                      className="px-4 py-2 bg-white hover:bg-amber-100 rounded-xl text-xs font-black text-amber-600 transition-all shadow-sm border border-amber-200"
                    >
                      Cancelar
                    </button>
                  ) : (
                    <div className="flex gap-2">
                       <button 
                        onClick={() => setIsNoteModalOpen(true)}
                        title="Agregar Nota de Seguimiento"
                        className="p-3 bg-white hover:bg-sky-50 rounded-2xl transition-all shadow-sm border border-sky-100 text-sky-500 group"
                      >
                        <MessageSquare className="w-6 h-6 group-hover:scale-110 transition-transform" />
                      </button>
                      <button onClick={() => setDrawerOpen(false)} className="p-3 hover:bg-white rounded-2xl transition-all shadow-sm border border-rose-100/50">
                        <X className="w-6 h-6 text-gray-400" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Drawer Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {!isEditingDrawer ? (
                    <div className="p-8 space-y-8">
                  
                  {/* Client Info Section */}
                  <section>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-rose-100 rounded-lg text-rose-600"><Users className="w-5 h-5"/></div>
                      <h3 className="font-black text-gray-900 text-sm uppercase tracking-wider">Información de Cliente</h3>
                    </div>
                    <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 space-y-3">
                      <div>
                        <p className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Nombre Completo</p>
                        <p className="font-bold text-gray-900">{selectedContract.cliente_nombre}</p>
                      </div>
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">WhatsApp</p>
                          <p className="font-bold text-gray-900">{selectedContract.cliente_whatsapp}</p>
                        </div>
                        <a 
                          href={`https://wa.me/57${selectedContract.cliente_whatsapp}`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors"
                        >
                          <MessageCircle className="w-5 h-5" />
                        </a>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Dirección</p>
                        <p className="text-sm font-medium text-gray-600">{selectedContract.cliente_direccion}</p>
                      </div>
                    </div>
                  </section>

                  {/* Financial Status Section */}
                  <section>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600"><DollarSign className="w-5 h-5"/></div>
                      <h3 className="font-black text-gray-900 text-sm uppercase tracking-wider">Estado Financiero</h3>
                    </div>
                    <div className="bg-white rounded-2xl p-5 border border-emerald-100 shadow-sm space-y-4">
                      <div className="flex justify-between items-end">
                        <span className="text-xs font-bold text-gray-500 uppercase">Progreso de Pago</span>
                        <span className="text-lg font-black text-emerald-600">{Math.round((Number(selectedContract.anticipo) / Number(selectedContract.valor_total)) * 100)}%</span>
                      </div>
                      <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-emerald-500 h-full rounded-full" 
                          style={{ width: `${Math.min(100, (Number(selectedContract.anticipo) / Number(selectedContract.valor_total)) * 100)}%` }} 
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                          <p className="text-[9px] uppercase font-bold text-gray-400 tracking-widest mb-1">Pagado (Abonos)</p>
                          <p className="font-black text-gray-900">{formatCurrency(Number(selectedContract.anticipo))}</p>
                        </div>
                        <div className="p-3 bg-rose-50 rounded-xl border border-rose-100">
                          <p className="text-[9px] uppercase font-bold text-rose-400 tracking-widest mb-1">Saldo</p>
                          <p className="font-black text-rose-600">{formatCurrency(Number(selectedContract.saldo))}</p>
                        </div>
                      </div>
                    </div>
                  </section>

                   <section className="rounded-xl border border-rose-200 p-4 space-y-3">
                     <h3 className="font-bold">Servicios PRE-XV</h3>
                     <p>{prexvSummary(selectedContract)}</p>
                     {includedPrexv(selectedContract).map(service => <p key={service.id}>{service.label}: {selectedContract[service.name] || 'Sin asignar'} · {selectedContract[service.confirmed] ? 'Confirmado' : 'Pendiente'}</p>)}
                     <button className="rounded-lg bg-rose-100 px-4 py-2 font-bold" onClick={() => openPreXvModal(selectedContract)}>Agregar o editar PRE-XV</button>
                   </section>
                   {/* PRENDAS Y LOGÍSTICA (PERSISTENTE) */}
                   <section className="animate-in slide-in-from-right-4 duration-500 delay-150">
                     <div className="flex justify-between items-center mb-4">
                       <div className="flex items-center gap-3">
                         <div className="p-2 bg-rose-100 rounded-lg text-rose-600"><Package className="w-5 h-5"/></div>
                         <h3 className="font-black text-gray-900 text-sm uppercase tracking-wider">📦 Prendas y Logística</h3>
                       </div>
                       {!showAssignForm ? (
                         <button 
                           onClick={() => setShowAssignForm(true)}
                           className="px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-500 text-[10px] font-black rounded-lg transition-all border border-rose-100 uppercase"
                         >
                           + Asignar
                         </button>
                       ) : (
                         <button 
                           onClick={() => setShowAssignForm(false)}
                           className="px-3 py-1 bg-gray-50 text-gray-400 text-[10px] font-black rounded-lg transition-all border border-gray-100 uppercase"
                         >
                           Cancelar
                         </button>
                       )}
                     </div>

                     {showAssignForm && (
                        <div className="mb-4 p-4 bg-amber-50 rounded-2xl border border-amber-100 space-y-3 animate-in zoom-in-95 duration-200">
                           <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Seleccionar del Inventario</p>
                           <div className="flex gap-2">
                             <select 
                               className="flex-1 px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-amber-300"
                               value={selectedDressToAssign}
                               onChange={(e) => setSelectedDressToAssign(e.target.value)}
                             >
                               <option value="">Buscar Vestido...</option>
                                {allVestidos.map(v => {
                                  const rels = v.contrato_items_vestidos || [];
                                  const lastNum = rels[0]?.contratos?.numero_contrato;
                                  const isOccupied = v.estado === "Alquilado" || v.estado === "Reservado" || v.estado === "Traslado";
                                  const label = (isOccupied && lastNum)
                                    ? `${v.codigo} - [NO DISPONIBLE: CTR #${lastNum}]`
                                    : `${v.codigo} - ${v.color} (${v.talla})`;
                                  return (
                                    <option key={v.id} value={v.id} disabled={isOccupied} className={isOccupied ? "text-gray-400 italic" : "text-gray-900 font-bold"}>
                                      {label}
                                    </option>
                                  );
                                })}
                             </select>
                             <button 
                               onClick={() => assignDress(selectedContract.id, selectedDressToAssign)}
                               disabled={!selectedDressToAssign || modalLoading}
                               className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black rounded-xl shadow-md border-b-2 border-amber-700 active:border-b-0 active:translate-y-0.5 disabled:opacity-50"
                             >
                               ASIGNAR
                             </button>
                           </div>
                        </div>
                     )}

                     <div className="space-y-3">
                       {selectedContract.prendas?.map((item: any, idx: number) => {
                          const v = item.vestido;
                          const isDifferentSede = v?.sede_actual_id !== selectedContract.sede_id;
                          const isInTransit = v?.estado === 'Traslado';
                          
                          return (
                            <div key={idx} className="bg-white rounded-2xl p-4 border border-rose-100 shadow-sm space-y-3">
                               <div className="flex justify-between items-start">
                                  <div className="flex items-center gap-3">
                                     <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs ${isInTransit ? 'bg-amber-100 text-amber-600 animate-pulse' : 'bg-rose-50 text-rose-500'}`}>
                                       {v?.codigo?.substring(0,2) || '??'}
                                     </div>
                                     <div>
                                        <p className="font-black text-gray-900 text-sm tracking-tight uppercase leading-none">
                                          {v?.codigo || 'V-PEND'} - {v?.nombre || 'SIN NOMBRE'}
                                        </p>
                                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                                          {item.tipo_uso || 'USO'} | TALLA: {v?.talla || 'T'}
                                        </p>
                                     </div>
                                  </div>
                                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${
                                    isInTransit ? 'bg-amber-100 text-amber-600 border-amber-200' : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                  }`}>
                                    {v?.estado || 'SEDE'}
                                  </span>
                               </div>

                               <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
                                     <MapPin className="w-3 h-3 text-rose-400" />
                                     <span className="uppercase">Ubicación: <span className="text-gray-900">{v?.sede_actual_id === selectedContract.sede_id ? 'EN ESTA SEDE' : 'OTRA SEDE'}</span></span>
                                  </div>
                                  
                                  {isDifferentSede && !isInTransit && (
                                    <button 
                                      onClick={() => updateDressLogistics(v.id, 'Traslado')}
                                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[9px] font-black rounded-lg transition-all shadow-sm border-b-2 border-amber-700"
                                    >
                                      📦 MARCAR ENVÍO
                                    </button>
                                  )}

                                  {isInTransit && (
                                    <button 
                                      onClick={() => updateDressLogistics(v.id, 'Sede', selectedContract.sede_id)}
                                      className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[9px] font-black rounded-lg transition-all shadow-sm border-b-2 border-emerald-700"
                                    >
                                      📥 RECIBIR PRENDA
                                    </button>
                                  )}

                                   {(user?.rol === 'admin' || user?.email === 'dubian.h88@gmail.com') && (
                                     <button 
                                       onClick={() => openRemoveModal(item)}
                                       className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white text-[9px] font-black rounded-lg transition-all shadow-sm border-b-2 border-rose-700 flex items-center gap-1"
                                     >
                                       <Trash2 className="w-3 h-3" /> QUITAR
                                     </button>
                                   )}
                               </div>
                            </div>
                          );
                       })}
                       {(!selectedContract.prendas || selectedContract.prendas.length === 0) && (
                         <div className="p-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                            <Package className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">No hay prendas vinculadas</p>
                            <button 
                              onClick={() => setShowAssignForm(true)}
                              className="px-6 py-3 bg-rose-500 text-white rounded-xl text-[11px] font-black uppercase tracking-widest shadow-lg shadow-rose-100 active:scale-95 transition-all"
                            >
                              👗 Asignar Vestido
                            </button>
                         </div>
                       )}
                      </div>
                    </section>

                      {/* ACCIONES RÁPIDAS DE ALTA PRIORIDAD */}
                      <div className="grid grid-cols-2 gap-3 mb-6">
                        <button 
                          onClick={() => generatePDF(selectedContract)}
                          className="flex items-center justify-center gap-2 py-4 bg-gray-900 text-white rounded-2xl font-black text-xs shadow-lg hover:bg-black transition-all active:scale-95 uppercase tracking-widest"
                        >
                          <Download className="w-4 h-4" /> PDF Contrato
                        </button>
                        <Link 
                          href={`/dashboard/pago/${selectedContract.id}`}
                          className="flex items-center justify-center gap-2 py-4 bg-emerald-500 text-white rounded-2xl font-black text-xs shadow-lg shadow-emerald-200 hover:bg-emerald-600 transition-all active:scale-95 uppercase tracking-widest"
                        >
                          <DollarSign className="w-4 h-4" /> Registrar Pago
                        </Link>
                      </div>

                      {/* NEW: GESTIÓN DE ENTREGAS FÍSICAS (DUAL) */}
                      {selectedContract.estado !== 'borrador' && (
                        <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150 mb-6">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-amber-100 rounded-lg text-amber-600"><Package className="w-5 h-5"/></div>
                            <h3 className="font-black text-gray-900 text-sm uppercase tracking-wider">Gestión de Entregas</h3>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* BLOQUE PRE-XV (Condicional) */}
                            {selectedContract.fecha_pre_xv && (
                              <div className="bg-white rounded-2xl p-5 border-2 border-amber-50 shadow-sm relative overflow-hidden">
                                <div className="flex justify-between items-start mb-4">
                                  <div>
                                    <h4 className="font-black text-gray-800 text-xs uppercase tracking-widest">Logística de Sesión (Pre-XV)</h4>
                                    <p className="text-[10px] text-gray-400 mt-1 font-bold">{new Date(selectedContract.fecha_pre_xv).toLocaleDateString()}</p>
                                  </div>
                                  <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest ${selectedContract.entregado_prexv ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                                    {selectedContract.entregado_prexv ? 'Entregado' : 'Pendiente'}
                                  </span>
                                </div>
                                <div className="mt-4">
                                  <button 
                                    onClick={() => { 
                                      setDrawerOpen(false); 
                                      openDeliveryModal(selectedContract, 'PREXV'); 
                                    }}
                                    disabled={selectedContract.entregado_prexv || Number(selectedContract.saldo) > 0}
                                    className={`w-full py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
                                      selectedContract.entregado_prexv ? 'bg-gray-100 text-gray-400 cursor-not-allowed' :
                                      Number(selectedContract.saldo) > 0 ? 'bg-rose-50 text-rose-400 cursor-not-allowed' :
                                      'bg-amber-500 hover:bg-amber-600 text-white shadow-md active:scale-95'
                                    }`}
                                  >
                                    Registrar Entrega Pre-XV
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* BLOQUE EVENTO PRINCIPAL */}
                            <div className="bg-white rounded-2xl p-5 border-2 border-amber-50 shadow-sm relative overflow-hidden">
                              <div className="flex justify-between items-start mb-4">
                                <div>
                                  <h4 className="font-black text-gray-800 text-xs uppercase tracking-widest">Logística de Evento</h4>
                                  <p className="text-[10px] text-gray-400 mt-1 font-bold">{new Date(selectedContract.fecha_evento).toLocaleDateString()}</p>
                                </div>
                                <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest ${selectedContract.entregado_evento ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                                  {selectedContract.entregado_evento ? 'Entregado' : 'Pendiente'}
                                </span>
                              </div>
                              <div className="mt-4">
                                <button 
                                  onClick={() => { 
                                    setDrawerOpen(false); 
                                    openDeliveryModal(selectedContract, 'EVENTO'); 
                                  }}
                                  disabled={selectedContract.entregado_evento || Number(selectedContract.saldo) > 0}
                                  className={`w-full py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
                                    selectedContract.entregado_evento ? 'bg-gray-100 text-gray-400 cursor-not-allowed' :
                                    Number(selectedContract.saldo) > 0 ? 'bg-rose-50 text-rose-400 cursor-not-allowed' :
                                    'bg-amber-500 hover:bg-amber-600 text-white shadow-md active:scale-95'
                                  }`}
                                >
                                  Registrar Entrega Evento
                                </button>
                              </div>
                            </div>
                          </div>
                          {Number(selectedContract.saldo) > 0 && (
                            <div className="mt-3 text-center">
                              <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest bg-rose-50 px-3 py-1 rounded-full">
                                ⚠️ Entregas bloqueadas: Pendiente pago de ${Number(selectedContract.saldo).toLocaleString('es-CO')}
                              </span>
                            </div>
                          )}
                        </section>
                      )}

                    {/* NEW: GESTIÓN DE RETORNO Y MANTENIMIENTO (Imagen 1 Request) */}
                    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600"><Truck className="w-5 h-5"/></div>
                        <h3 className="font-black text-gray-900 text-sm uppercase tracking-wider">GESTIÓN DE RETORNO Y MANTENIMIENTO</h3>
                      </div>
                      <div className="bg-white rounded-3xl p-6 border-2 border-indigo-50 shadow-lg shadow-indigo-100/50 space-y-6 relative overflow-hidden">
                        <div className="absolute -top-4 -right-4 w-24 h-24 bg-indigo-50 rounded-full opacity-50 blur-2xl"></div>
                        
                        <div className="grid grid-cols-2 gap-6 relative z-10">
                          <div className="space-y-1.5">
                            <div className="text-[10px] uppercase font-black text-indigo-400 tracking-widest flex items-center gap-1">
                              <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full"></div> Estado Logístico
                            </div>
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter shadow-sm border ${
                              selectedContract.estado === 'entregado' ? 'bg-amber-100 text-amber-700 border-amber-200 animate-pulse' :
                              selectedContract.estado === 'mantenimiento' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' :
                              'bg-emerald-100 text-emerald-700 border-emerald-200'
                            }`}>
                              {selectedContract.estado === 'entregado' ? 'En Evento / Retorno' : 
                               selectedContract.estado === 'mantenimiento' ? 'En Mantenimiento (Lavandería)' : 
                               selectedContract.estado === 'liquidado' ? 'Disponible / Liquidado' : 'Pendiente de Entrega'}
                            </span>
                          </div>
                          
                          <div className="space-y-1.5 text-right">
                             <p className="text-[10px] uppercase font-black text-indigo-400 tracking-widest">Margen de Alistamiento</p>
                             <p className="text-xs font-black text-gray-700">+{getMaintenanceDays(selectedContract.tipo_evento)} DÍAS CALENDARIO</p>
                          </div>
                          
                          <div className="col-span-2 p-4 bg-gray-50 rounded-2xl border border-gray-100 flex justify-between items-center group hover:border-indigo-200 transition-all">
                             <div>
                                <p className="text-[9px] uppercase font-black text-gray-400 tracking-widest mb-0.5">Bloqueo de Inventario Hasta</p>
                                <p className="text-sm font-black text-indigo-600">
                                  {selectedContract.fecha_disponibilidad_real || calculateReturnDate(selectedContract.fecha_entrega_envio || selectedContract.fecha_evento, selectedContract.tipo_evento)}
                                </p>
                             </div>
                             <Calendar className="w-5 h-5 text-indigo-300 group-hover:scale-110 transition-transform" />
                          </div>
                        </div>

                        {selectedContract.estado === 'entregado' && (
                          <button 
                            onClick={() => handleConfirmReturn(selectedContract)}
                            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 transition-all active:scale-95 flex items-center justify-center gap-3 border-b-4 border-indigo-800 active:border-b-0 active:translate-y-1"
                          >
                            <RefreshCw className="w-5 h-5 animate-spin-slow" />
                            CONFIRMAR RETORNO / INGRESO A LAVANDERÍA
                          </button>
                        )}

                        {/* Early Return Force Button (Imagen 5 Request) */}
                        {(((selectedContract.entregas && selectedContract.entregas.length > 0) || selectedContract.estado === 'entregado')) && (
                          <button 
                            onClick={() => {
                              setTriageContract(selectedContract);
                              setTriageModalOpen(true);
                            }}
                            className="w-full py-4 mt-2 bg-rose-50 hover:bg-rose-100 text-rose-600 font-black rounded-2xl border-2 border-rose-100 shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2 uppercase text-xs tracking-widest"
                          >
                             <span className="text-xl">📥</span> REGISTRAR DEVOLUCIÓN (ANTICIPADA)
                          </button>
                        )}

                        {selectedContract.estado === 'mantenimiento' && (
                          <div className="space-y-4">
                            <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center gap-3">
                               <div className="p-2 bg-white rounded-lg shadow-sm">
                                  <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin-slow" />
                               </div>
                               <div className="flex-1">
                               </div>
                            </div>
                            
                            <button 
                              onClick={() => handleManualRelease(selectedContract)}
                              disabled={modalLoading}
                              className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-2xl shadow-xl shadow-emerald-100 transition-all active:scale-95 flex items-center justify-center gap-2 uppercase text-[10px] tracking-widest border-b-4 border-emerald-700 active:border-b-0 active:translate-y-1"
                            >
                              {modalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-5 h-5" /> FINALIZAR MANTENIMIENTO Y LIBERAR VESTIDO AHORA</>}
                            </button>
                          </div>
                        )}
                      </div>
                    </section>

                  {/* Internal Control Section */}
                  <section>
                    {selectedContract.estado?.toLowerCase() === 'finalizado' && user?.rol === 'admin' && (
                      <div className="mb-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 bg-red-100 rounded-lg text-red-600"><AlertTriangle className="w-5 h-5"/></div>
                          <h3 className="font-black text-gray-900 text-sm uppercase tracking-wider">Acciones de Administrador</h3>
                        </div>
                        <button
                          onClick={() => {
                            setRevertingContractId(selectedContract.id);
                            setIsReversionModalOpen(true);
                          }}
                          className="w-full py-4 bg-red-50 hover:bg-red-100 text-red-600 font-black rounded-2xl border-2 border-red-100 shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2 uppercase text-xs tracking-widest"
                        >
                          <RefreshCw className="w-5 h-5" /> REVERTIR A "POR ENTREGAR"
                        </button>
                      </div>
                    )}

                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-gray-100 rounded-lg text-gray-600"><Tag className="w-5 h-5"/></div>
                      <h3 className="font-black text-gray-900 text-sm uppercase tracking-wider">Control Interno</h3>
                    </div>
                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 flex justify-between items-center">
                      <div>
                        <p className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Número de Factura</p>
                        <p className={`font-black tracking-tight ${selectedContract.numero_factura ? 'text-gray-900' : 'text-gray-300 italic'}`}>
                          {selectedContract.numero_factura || 'Sin Legalizar'}
                        </p>
                      </div>
                      <button 
                        onClick={() => {
                          setInvoiceContract(selectedContract);
                          setInvoiceNumber(selectedContract.numero_factura || '');
                          setInvoiceModalOpen(true);
                        }}
                        className="p-2 px-4 bg-white hover:bg-rose-50 border border-gray-100 rounded-xl text-xs font-bold text-rose-500 transition-all shadow-sm"
                      >
                        {selectedContract.numero_factura ? 'Editar' : 'Agregar'}
                      </button>
                    </div>
                  </section>

                  {/* HISTORIAL Y BITÁCORA (Always Visible) */}
                  <section className="animate-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-rose-100 rounded-lg text-rose-600"><ClipboardList className="w-5 h-5"/></div>
                      <h3 className="font-black text-gray-900 text-sm uppercase tracking-wider">🕒 HISTORIAL Y BITÁCORA</h3>
                    </div>

                    {drawerLoading ? (
                      <div className="p-8 text-center bg-gray-50 rounded-2xl border border-gray-100">
                         <Loader2 className="w-6 h-6 animate-spin text-rose-400 mx-auto mb-2" />
                         <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Cargando historial...</p>
                      </div>
                    ) : (
                      <div className="relative pl-8 space-y-8 before:absolute before:inset-y-0 before:left-[11px] before:w-[2px] before:bg-rose-100 before:rounded-full pb-4">
                        
                        {/* Timeline: ENTREGA (If exists) */}
                        {drawerDelivery && (
                          <div className="relative group">
                            <div className="absolute -left-[27px] p-1.5 bg-indigo-500 text-white rounded-full z-10 shadow-lg shadow-indigo-100 ring-4 ring-white">
                              <Camera className="w-3.5 h-3.5" />
                            </div>
                            <div className="space-y-2">
                              <div className="flex justify-between items-start">
                                <div>
                                  <h4 className="font-black text-gray-900 text-sm leading-tight">📦 Entrega Registrada</h4>
                                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">{new Date(drawerDelivery.fecha_entrega).toLocaleString()}</p>
                                </div>
                                <button 
                                  onClick={() => setShowDeliveryEvidence(!showDeliveryEvidence)}
                                  className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-[10px] font-black rounded-lg transition-all border border-indigo-100 shadow-sm"
                                >
                                  {showDeliveryEvidence ? 'Ocultar' : 'Ver Fotos y Firma'}
                                </button>
                              </div>
                              
                              {showDeliveryEvidence && (
                                <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                  <div className="grid grid-cols-3 gap-2">
                                    {drawerDelivery.fotos_uris?.map((url: string, i: number) => (
                                      <div key={i} className="aspect-square bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
                                        <img src={url} alt={`Evidencia ${i+1}`} className="w-full h-full object-cover" />
                                      </div>
                                    ))}
                                  </div>
                                  {drawerDelivery.firma_url && (
                                    <div className="p-3 bg-white rounded-xl border border-gray-100 shadow-sm text-center">
                                      <p className="text-[8px] uppercase font-bold text-gray-400 tracking-widest mb-1">Firma del Cliente</p>
                                      <img src={drawerDelivery.firma_url} alt="Firma" className="max-h-12 mx-auto grayscale opacity-70" />
                                    </div>
                                  )}
                                  <p className="text-xs text-gray-500 italic font-medium p-2 bg-gray-50 rounded-lg">"{drawerDelivery.observaciones}"</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Timeline: BITACORA AUTOMÁTICA */}
                        {drawerHistory.map((h, i) => {
                          const isPayment = h.accion === 'Abono Registrado';
                          const isUpdate = h.accion === 'Contrato Actualizado';
                          const isNote = h.accion === 'Nota de Seguimiento';
                          const isLogisticsChange = h.accion === '📅 Cambio de Logística';
                          
                          return (
                            <div key={h.id || i} className="relative group">
                              <div className={`absolute -left-[27px] p-1.5 text-white rounded-full z-10 shadow-lg ring-4 ring-white ${
                                isPayment ? 'bg-emerald-500 shadow-emerald-100' : 
                                isUpdate ? 'bg-amber-500 shadow-amber-100' : 
                                isNote ? 'bg-sky-500 shadow-sky-100' :
                                isLogisticsChange ? 'bg-violet-500 shadow-violet-100' :
                                'bg-gray-400 shadow-gray-100'
                              }`}>
                                {isPayment ? <DollarSign className="w-3.5 h-3.5" /> : 
                                 isNote ? <MessageSquare className="w-3.5 h-3.5" /> :
                                 isLogisticsChange ? <CalendarDays className="w-3.5 h-3.5" /> :
                                 <Edit3 className="w-3.5 h-3.5" />}
                              </div>
                              <div>
                                <h4 className="font-black text-gray-900 text-sm leading-tight">
                                  {h.accion}
                                  {h.accion === 'Solicitud de excepción por alistamiento' && (
                                    <button 
                                      onClick={() => handleApproveException(selectedContract.id)}
                                      className="ml-3 px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-black rounded-lg transition-all border border-rose-100 shadow-sm"
                                    >
                                      Aprobar Excepción
                                    </button>
                                  )}
                                </h4>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">
                                  {new Date(h.created_at).toLocaleString()} • {h.usuario || 'Sistema'}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">{h.detalle}</p>
                              </div>
                            </div>
                          );
                        })}

                        {/* Timeline: CREACIÓN */}
                        <div className="relative group">
                          <div className="absolute -left-[27px] p-1.5 bg-emerald-500 text-white rounded-full z-10 shadow-lg shadow-emerald-100 ring-4 ring-white">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <h4 className="font-black text-gray-900 text-sm leading-tight">💎 Contrato Creado</h4>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">{new Date(selectedContract.created_at).toLocaleString()}</p>
                            <p className="text-xs text-gray-500 mt-1 uppercase font-bold tracking-widest text-[9px]">{selectedContract.sede} | {selectedContract.asesora || 'Administrador'}</p>
                          </div>
                        </div>

                      </div>
                    )}
                  </section>

                    </div>
                  ) : (
                    <div className="p-8 space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                      {/* Formulario de Edición */}
                      {isDashboardAdmin && (
                        <section className="space-y-4">
                          <h3 className="font-black text-gray-900 text-sm uppercase tracking-wider">Datos adicionales del contrato</h3>
                          <div className="grid grid-cols-2 gap-3">
                            {additionalContractFields.map(field => (
                              <label key={field.key} className="block text-xs font-bold text-gray-600">
                                {field.label}
                                <input
                                  type={field.type}
                                  disabled={field.key === 'valor_deposito'}
                                  title={field.key === 'valor_deposito' ? 'Gestiona el depósito y su comprobante en Depósitos y devoluciones.' : undefined}
                                  value={toEditingValue(editForm[field.key], field.type)}
                                  onChange={event => handleEditChange(field.key, event.target.value)}
                                  min={field.type === 'number' ? 0 : undefined}
                                  step={field.type === 'number' ? '0.01' : undefined}
                                  className="mt-1 w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-amber-500 font-bold text-gray-900"
                                />
                              </label>
                            ))}
                          </div>
                        </section>
                      )}
                      
                      <section className="space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-amber-100 rounded-lg text-amber-600"><Users className="w-5 h-5"/></div>
                          <h3 className="font-black text-gray-900 text-sm uppercase tracking-wider">Datos de Cliente</h3>
                        </div>
                        <div className="space-y-3">
                          <input 
                            type="text" 
                            placeholder="Nombre Completo"
                            value={editForm.cliente_nombre || ''}
                            onChange={(e) => handleEditChange('cliente_nombre', e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-amber-500 transition-all font-bold text-gray-900"
                          />
                          <input 
                            type="text" 
                            placeholder="WhatsApp"
                            value={editForm.cliente_whatsapp || ''}
                            onChange={(e) => handleEditChange('cliente_whatsapp', e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-amber-500 transition-all font-bold text-gray-900"
                          />
                          <textarea 
                            placeholder="Dirección"
                            value={editForm.cliente_direccion || ''}
                            onChange={(e) => handleEditChange('cliente_direccion', e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-amber-500 transition-all font-bold text-gray-900 min-h-[80px]"
                          />
                        </div>
                      </section>

                      {/* NEW: Logistics Dates Section */}
                      <section className="space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600"><Calendar className="w-5 h-5"/></div>
                          <h3 className="font-black text-gray-900 text-sm uppercase tracking-wider">Fechas de Seguimiento</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                           <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase ml-1 block mb-1">Cita Medidas</label>
                            <input 
                              type="date" 
                              value={editForm.fecha_cita_medidas || ''}
                              onChange={(e) => handleEditChange('fecha_cita_medidas', e.target.value)}
                              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-amber-500 transition-all font-bold text-gray-900 text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase ml-1 block mb-1">Prueba Final</label>
                            <input 
                              type="date" 
                              value={editForm.fecha_prueba_final || ''}
                              onChange={(e) => handleEditChange('fecha_prueba_final', e.target.value)}
                              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-amber-500 transition-all font-bold text-gray-900 text-xs"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase ml-1 block mb-1">Fecha Entrega / Envío</label>
                            <input 
                              type="date" 
                              value={editForm.fecha_entrega_envio || ''}
                              onChange={(e) => handleEditChange('fecha_entrega_envio', e.target.value)}
                              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-amber-500 transition-all font-bold text-gray-900"
                            />
                          </div>
                        </div>
                      </section>

                      <section className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-100 rounded-lg text-amber-600"><CalendarDays className="w-5 h-5"/></div>
                            <div>
                              <h3 className="font-black text-gray-900 text-sm uppercase tracking-wider">Bloqueo fechas especiales</h3>
                              <p className="text-[10px] text-gray-400 font-bold mt-1">Bloquea todos los vestidos vinculados al contrato.</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleEditChange('fechas_bloqueo_especial', [
                              ...(Array.isArray(editForm.fechas_bloqueo_especial) ? editForm.fechas_bloqueo_especial : []),
                              ''
                            ])}
                            className="p-2.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl hover:bg-amber-100 transition-all"
                            title="Agregar fecha especial"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="p-3 bg-amber-50/60 border border-amber-100 rounded-xl">
                          <p className="text-[9px] uppercase font-black text-amber-700 tracking-widest">Referencias afectadas</p>
                          <p className="text-xs font-bold text-gray-700 mt-1">
                            {(selectedContract.items || []).map((item: any) => item.vestido?.codigo).filter(Boolean).join(' · ') || 'Sin referencias vinculadas'}
                          </p>
                        </div>
                        {(Array.isArray(editForm.fechas_bloqueo_especial) && editForm.fechas_bloqueo_especial.length > 0) ? (
                          <div className="space-y-2">
                            {editForm.fechas_bloqueo_especial.map((fecha: string, idx: number) => (
                              <div key={idx} className="grid grid-cols-[1fr_auto] gap-2 items-center">
                                <input
                                  type="date"
                                  value={fecha || ''}
                                  onChange={(e) => {
                                    const next = [...editForm.fechas_bloqueo_especial];
                                    next[idx] = e.target.value;
                                    handleEditChange('fechas_bloqueo_especial', next);
                                  }}
                                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-amber-500 transition-all font-bold text-gray-900"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleEditChange(
                                    'fechas_bloqueo_especial',
                                    editForm.fechas_bloqueo_especial.filter((_: string, i: number) => i !== idx)
                                  )}
                                  className="p-3 bg-red-50 text-red-500 border border-red-100 rounded-xl hover:bg-red-100 transition-all"
                                  title="Quitar fecha"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 italic">Sin fechas especiales agregadas.</p>
                        )}
                      </section>

                      <section className="space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-rose-100 rounded-lg text-rose-600"><Building2 className="w-5 h-5"/></div>
                          <h3 className="font-black text-gray-900 text-sm uppercase tracking-wider">Logística ERP</h3>
                        </div>
                        <div className="space-y-3">
                          <select 
                            value={editForm.sede_id || ''}
                            onChange={(e) => handleEditChange('sede_id', e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-amber-500 transition-all font-bold text-gray-900"
                          >
                            <option value="">Selecciona Sede</option>
                            {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                          </select>
                          <select 
                            value={editForm.asesora_id || ''}
                            onChange={(e) => handleEditChange('asesora_id', e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-amber-500 transition-all font-bold text-gray-900"
                            disabled={!editForm.sede_id}
                          >
                            <option value="">Selecciona Asesora</option>
                            {asesorasFiltradasEdit.map(a => <option key={a.id} value={a.id}>{a.nombre_completo}</option>)}
                          </select>
                        </div>
                      </section>

                      <section className="space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600"><DollarSign className="w-5 h-5"/></div>
                          <h3 className="font-black text-gray-900 text-sm uppercase tracking-wider">Plan de Pagos</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Valor Total</label>
                            <input 
                              type="number" 
                              value={editForm.valor_total || ''}
                              onChange={(e) => handleEditChange('valor_total', e.target.value)}
                              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-amber-500 transition-all font-bold text-gray-900"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Anticipo</label>
                            <input 
                              type="number" 
                              value={editForm.anticipo || ''}
                              onChange={(e) => handleEditChange('anticipo', e.target.value)}
                              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-amber-500 transition-all font-bold text-gray-900"
                            />
                          </div>
                          <div className="col-span-2 p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex justify-between items-center">
                            <span className="text-xs font-black text-emerald-600 uppercase">Saldo Recalculado</span>
                            <span className="text-lg font-black text-emerald-700">{formatCurrency(editForm.saldo || 0)}</span>
                          </div>
                        </div>
                      </section>

                      <section className="space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600"><Tag className="w-5 h-5"/></div>
                          <h3 className="font-black text-gray-900 text-sm uppercase tracking-wider">Facturación</h3>
                        </div>
                        <input 
                          type="text" 
                          aria-label="Número de Factura"
                          aria-describedby="edit-invoice-help"
                          required
                          aria-required="true"
                          placeholder="Número de Factura (obligatorio)"
                          value={editForm.numero_factura || ''}
                          onChange={(e) => handleEditChange('numero_factura', e.target.value)}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-amber-500 transition-all font-bold text-gray-900"
                        />
                        <p id="edit-invoice-help" className="text-xs text-gray-500">El número de factura es obligatorio para guardar los cambios del contrato.</p>
                      </section>

                      {/* CLÁUSULA DÉCIMO SÉPTIMA: USO DE IMAGEN */}
                      <section className="space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-rose-100 rounded-lg text-rose-600"><Camera className="w-5 h-5"/></div>
                          <h3 className="font-black text-gray-900 text-sm uppercase tracking-wider">Autorización de Uso de Imagen</h3>
                        </div>
                        <div className="p-4 bg-white border-2 border-rose-100 rounded-2xl space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                              Estado de Autorización
                            </span>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input 
                                type="checkbox" 
                                className="sr-only peer"
                                checked={editForm.autoriza_uso_imagen || false}
                                onChange={(e) => handleEditChange('autoriza_uso_imagen', e.target.checked)}
                              />
                              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-500 shadow-inner"></div>
                            </label>
                          </div>
                          <p className="text-[9px] text-gray-500 leading-relaxed font-bold italic">
                            EL CONTRATANTE autoriza el uso de imagen y datos personales (Redes Sociales, Medios impresos, etc.) por un periodo de 10 años.
                          </p>
                        </div>
                      </section>

                      <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 text-[10px] font-bold text-gray-400 uppercase leading-relaxed">
                        ⚠️ Al guardar los cambios, la bitácora del sistema registrará esta acción para auditoría.
                      </div>
                    </div>
                  )}
                </div>

                {/* Drawer Footer Actions */}
                <div className="p-8 bg-white border-t border-gray-50 grid grid-cols-2 gap-3">
                  {isEditingDrawer ? (
                    <>
                      <button 
                        onClick={() => setIsEditingDrawer(false)}
                        className="py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black rounded-2xl transition-all active:scale-95"
                      >
                        Descartar
                      </button>
                      <button 
                        onClick={saveContractEdit}
                        disabled={modalLoading}
                        className="py-4 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-2xl shadow-lg shadow-amber-200 transition-all active:scale-95 flex items-center justify-center gap-2 border-b-4 border-amber-700 active:border-b-0 active:translate-y-1"
                      >
                        {modalLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><ShieldCheck className="w-5 h-5" /> Guardar Cambios</>}
                      </button>
                    </>
                  ) : (
                    <>
                      {selectedContract.estado === 'entregado' && (
                        <button 
                          onClick={() => { 
                            setDrawerOpen(false); 
                            openTriage(selectedContract); 
                          }}
                          className="col-span-2 py-4 bg-rose-500 hover:bg-rose-600 text-white font-black rounded-2xl shadow-lg shadow-rose-200 transition-all active:scale-95 flex items-center justify-center gap-2 border-b-4 border-rose-700 active:border-b-0 active:translate-y-1"
                        >
                          <span className="text-xl">📥</span> Recibir Devolución (Triage)
                        </button>
                      )}
                      {/* Old delivery button removed as it is now in Gestión de Entregas */}
                      <Link href={`/dashboard/pago/${selectedContract.id}`} className="col-span-2 py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-2xl shadow-lg shadow-emerald-200 transition-all active:scale-95 text-center flex items-center justify-center gap-2">
                        <DollarSign className="w-5 h-5" /> Registrar Abono / Pago
                      </Link>
                      <button 
                        onClick={() => { setDrawerOpen(false); generatePDF(selectedContract); }} 
                        disabled={pdfGeneratingId === selectedContract.id}
                        className="py-4 bg-rose-50 hover:bg-rose-100 text-rose-600 font-black rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2 border border-rose-100"
                      >
                        <Download className="w-5 h-5" /> PDF
                      </button>
                      {isDashboardAdmin && (
                        <button 
                          onClick={() => router.push(`/contratos/nuevo?editar=${encodeURIComponent(selectedContract.id)}`)}
                          className="py-4 bg-amber-50 hover:bg-amber-100 text-amber-700 font-black rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2 border border-amber-200"
                        >
                          <Edit2 className="w-5 h-5" /> Editar Contrato
                        </button>
                      )}
                    </>
                  )}
                </div>
                
                {/* Audit Bottom Note */}
                <div className="px-8 pb-4 bg-white">
                  <p className="text-[9px] text-gray-300 font-medium text-center uppercase tracking-widest">
                    {selectedContract.updated_at ? `Última edición técnica: ${new Date(selectedContract.updated_at).toLocaleDateString()}` : 'Contrato original sin modificaciones'}
                  </p>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}
      {/* MODAL: Legalización de Factura (Control Interno) */}
      {invoiceModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300">
           <div className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl border border-rose-100 animate-in zoom-in-95 duration-300">
              <div className="p-8">
                 <div className="flex justify-between items-center mb-6">
                    <div>
                       <h2 className="text-2xl font-black text-gray-900 tracking-tight">Legalización de Factura</h2>
                       <p className="text-rose-500 text-xs font-bold uppercase tracking-widest mt-1">Control Interno Administrativo</p>
                    </div>
                    <button onClick={() => setInvoiceModalOpen(false)} className="p-2 hover:bg-rose-50 rounded-full transition-colors">
                       <X className="w-6 h-6 text-gray-400" />
                    </button>
                 </div>

                 <div className="space-y-6">
                    <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100/50">
                       <span className="block text-[10px] font-black uppercase text-rose-400 mb-1 tracking-widest">Contrato Seleccionado</span>
                       <span className="text-lg font-black text-rose-700">#{invoiceContract?.numero_contrato}</span>
                       <p className="text-sm font-bold text-gray-600 mt-1">{invoiceContract?.cliente_nombre}</p>
                    </div>

                    <div>
                       <label htmlFor="invoice-number" className="block text-sm font-black text-gray-700 uppercase tracking-wider mb-2 ml-1">Número de Factura *</label>
                       <div className="relative">
                          <Tag className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-rose-400" />
                          <input 
                            type="text" 
                            id="invoice-number"
                            required
                            aria-describedby="invoice-required-help"
                            placeholder="Ej: FAC-12345"
                            value={invoiceNumber}
                            onChange={(e) => setInvoiceNumber(e.target.value)}
                            className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-rose-500 focus:ring-4 focus:ring-rose-50 transition-all font-bold text-gray-900 placeholder:text-gray-300"
                            autoFocus
                          />
                       </div>
                       <p id="invoice-required-help" className="text-xs text-gray-600 mt-3">{INVOICE_REQUIRED_MESSAGE}</p>
                       <p className="text-[10px] text-gray-400 mt-3 font-medium leading-relaxed px-1">
                          Este número es solo para rastreo interno y no aparecerá en el PDF del contrato de la cliente.
                       </p>
                    </div>

                    <div className="flex gap-3 pt-2">
                       <button 
                         onClick={() => setInvoiceModalOpen(false)}
                         disabled={modalLoading}
                         className="flex-1 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black rounded-2xl transition-all active:scale-95 disabled:opacity-50"
                       >Cancelar</button>
                       <button 
                         onClick={submitInvoiceUpdate}
                         disabled={modalLoading}
                         className="flex-[1.5] py-4 bg-rose-500 hover:bg-rose-600 text-white font-black rounded-2xl shadow-lg shadow-rose-200 transition-all active:scale-95 flex items-center justify-center gap-2 border-b-4 border-rose-700 active:border-b-0 active:translate-y-1 disabled:opacity-50"
                       >
                         {modalLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Vincular Factura'}
                       </button>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}
      
      {/* MODAL: Recepción y Triage de Vestido */}
      {triageModalOpen && triageContract && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300">
           <div className="bg-white rounded-[2.5rem] w-full max-w-lg overflow-hidden shadow-2xl border border-rose-100 animate-in zoom-in-95 duration-300">
              <div className="p-8">
                 <div className="flex justify-between items-center mb-6">
                    <div>
                       <h2 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                         <span className="p-2 bg-rose-100 rounded-xl">📥</span> Recepción y Triage
                       </h2>
                       <p className="text-rose-500 text-xs font-bold uppercase tracking-widest mt-2 ml-1">Control de Calidad e Inventario</p>
                    </div>
                    <button onClick={() => setTriageModalOpen(false)} className="p-2 hover:bg-rose-50 rounded-full transition-colors">
                       <X className="w-6 h-6 text-gray-400" />
                    </button>
                 </div>

                 <div className="space-y-6">
                    {/* Resumen del Contrato */}
                    <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 space-y-4">
                       <div className="flex justify-between items-center">
                          <div>
                             <span className="block text-[10px] font-black uppercase text-gray-400 mb-1 tracking-widest">Contrato / Cliente</span>
                             <span className="text-base font-black text-gray-800">#{triageContract.numero_contrato} - {triageContract.cliente_nombre}</span>
                          </div>
                          <div className="text-right">
                             <span className="block text-[10px] font-black uppercase text-gray-400 mb-1 tracking-widest">Vestidos</span>
                             <span className="text-xs font-bold text-rose-600">{triageContract.vestidos_count || triageContract.prendas?.length || 1} vinculados</span>
                          </div>
                       </div>

                       {/* Calculador de Moras */}
                       {calculateLateDays(triageContract) > 0 && (
                          <div className="p-4 bg-rose-50 border-2 border-rose-100 rounded-xl flex flex-col gap-2">
                             <div className="flex justify-between items-center">
                                <span className="text-xs font-black text-rose-600 uppercase tracking-tight flex items-center gap-2">
                                   <Clock className="w-4 h-4" /> Mora detectada: {calculateLateDays(triageContract)} días.
                                </span>
                                <span className="text-lg font-black text-rose-700">
                                   Multa: ${(calculateLateDays(triageContract) * 50000).toLocaleString('es-CO')}
                                </span>
                             </div>
                             <button 
                               onClick={async () => {
                                  const multas = calculateLateDays(triageContract) * 50000;
                                  const totalMultasPrev = Number(triageContract.total_multas) || 0;
                                  setModalLoading(true);
                                  try {
                                     // 1. Update total_multas in Contracts
                                     await supabase.from('contratos').update({ 
                                        total_multas: totalMultasPrev + multas 
                                     }).eq('id', triageContract.id);

                                     // 2. Audit bitacora
                                     await supabase.from('bitacora_cambios').insert({
                                        contrato_id: triageContract.id,
                                        tipo_evento: '💸 Multa por Mora',
                                        motivo: `Sistema detectó ${calculateLateDays(triageContract)} días de retraso. Multa aplicada: $${multas.toLocaleString('es-CO')}.`,
                                        usuario_id: user?.id
                                     });

                                     toast.success(`Multa de $${multas.toLocaleString('es-CO')} cargada al saldo.`);
                                     fetchContratos();
                                     setTriageModalOpen(false);
                                  } catch (error) {
                                     toast.error('Error al aplicar multa');
                                  } finally {
                                     setModalLoading(false);
                                  }
                               }}
                               className="w-full py-2 bg-rose-600 text-white font-black text-[10px] uppercase tracking-widest rounded-lg hover:bg-rose-700 transition-all shadow-md active:scale-95"
                             >
                               💰 Cargar Multa al Saldo
                             </button>
                          </div>
                       )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                       <button 
                         onClick={() => setTriageForm({...triageForm, tipo: 'Lavandería', dias_estimados: 2})}
                         className={`p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-3 group ${triageForm.tipo === 'Lavandería' ? 'border-amber-500 bg-amber-50/50' : 'border-gray-100 hover:border-amber-200 bg-white'}`}
                       >
                         <span className="text-4xl group-hover:scale-110 transition-transform">🧼</span>
                         <div className="text-center">
                            <span className="block font-black text-gray-900 uppercase text-xs">Lavandería</span>
                            <span className="text-[10px] text-gray-400 font-bold tracking-tighter">(Bloqueo de 2 días)</span>
                         </div>
                       </button>

                       <button 
                         onClick={() => setTriageForm({...triageForm, tipo: 'Sastrería', dias_estimados: 5})}
                         className={`p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-3 group ${triageForm.tipo === 'Sastrería' ? 'border-amber-500 bg-amber-50/50' : 'border-gray-100 hover:border-amber-200 bg-white'}`}
                       >
                         <span className="text-4xl group-hover:scale-110 transition-transform">🪡</span>
                         <div className="text-center">
                            <span className="block font-black text-gray-900 uppercase text-xs">Sastrería</span>
                            <span className="text-[10px] text-gray-400 font-bold tracking-tighter">(Reparación técnica)</span>
                         </div>
                       </button>
                    </div>

                    {triageForm.tipo === 'Sastrería' && (
                       <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                          <div>
                             <label className="block text-sm font-black text-gray-700 uppercase tracking-wider mb-2 ml-1">Detalle de Daños / Arreglos *</label>
                             <textarea 
                               placeholder="Ej: Quemadura en el ruedo, cambio de cierre, limpieza profunda de manchas..."
                               value={triageForm.detalles_danos}
                               onChange={(e) => setTriageForm({...triageForm, detalles_danos: e.target.value})}
                               className="w-full px-4 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-amber-500 transition-all font-bold text-gray-900 placeholder:text-gray-300 min-h-[100px]"
                               required
                             />
                          </div>
                       </div>
                    )}

                    <div>
                       <label className="block text-sm font-black text-gray-700 uppercase tracking-wider mb-2 ml-1">Días Estimados fuera de Inventario</label>
                       <select 
                         value={triageForm.dias_estimados}
                         onChange={(e) => setTriageForm({...triageForm, dias_estimados: Number(e.target.value)})}
                         className="w-full px-4 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-amber-500 transition-all font-bold text-gray-900 appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cpath%20d%3D%22M5%207L10%2012L15%207%22%20stroke%3D%22%2394A3B8%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22/%3E%3C/svg%3E')] bg-[length:20px_20px] bg-[right_1rem_center] bg-no-repeat"
                       >
                          {[2, 3, 5, 8, 10, 15, 20, 30].map(d => (
                             <option key={d} value={d}>{d} Días {d === 2 && triageForm.tipo === 'Lavandería' ? '(Predeterminado)' : ''}</option>
                          ))}
                       </select>
                    </div>

                    <div className="flex gap-4 pt-4">
                       <button 
                         onClick={() => setTriageModalOpen(false)}
                         className="flex-1 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black rounded-2xl transition-all active:scale-95 uppercase text-xs"
                       >Cancelar</button>
                       <button 
                         onClick={submitTriage}
                         disabled={modalLoading}
                         className="flex-[1.5] py-4 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-2xl shadow-lg shadow-amber-200 transition-all active:scale-95 flex items-center justify-center gap-2 border-b-4 border-amber-700 active:border-b-0 active:translate-y-1 uppercase text-xs"
                       >
                         {modalLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirmar Recepción'}
                       </button>
                    </div>
                     <div className="flex gap-4 pt-4">
                        <button
                          onClick={() => setTriageModalOpen(false)}
                          className="flex-1 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black rounded-2xl transition-all active:scale-95 uppercase text-xs"
                        >Cancelar</button>
                        <button
                          onClick={submitTriage}
                          disabled={modalLoading}
                          className="flex-[1.5] py-4 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-2xl shadow-lg shadow-amber-200 transition-all active:scale-95 flex items-center justify-center gap-2 border-b-4 border-amber-700 active:border-b-0 active:translate-y-1 uppercase text-xs"
                        >
                          {modalLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Confirmar Recepción"}
                        </button>
                     </div>
                  </div>
               </div>
            </div>
         </div>
      )}
      {showRemoveModal && removingItem && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-rose-600 p-6 text-center">
               <h2 className="text-xl font-black text-white uppercase tracking-tight italic">Justificación de Eliminación</h2>
               <p className="text-rose-100 text-[10px] font-bold uppercase tracking-widest mt-1">Control de Inventario Crítico</p>
            </div>
            <div className="p-8 space-y-6 text-center">
               <div className="flex flex-col items-center gap-2">
                 <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center text-rose-500 mb-2">
                   <Trash2 className="w-8 h-8" />
                 </div>
                 <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest leading-none">Prenda a Quitar</p>
                 <p className="text-lg font-black text-gray-900 tracking-tight">{removingItem.vestido?.codigo} - {removingItem.vestido?.nombre}</p>
               </div>
               <div className="space-y-2 text-left">
                 <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">¿Por qué deseas quitar este vestido del contrato?</label>
                 <textarea
                   rows={3}
                   className="w-full px-4 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl text-xs font-bold text-gray-700 outline-none focus:border-rose-500 transition-all placeholder:text-gray-300 shadow-inner"
                   placeholder="Mínimo 5 caracteres: Ej: Cambio por talla, prenda dañada, etc."
                   value={removeReason}
                   onChange={(e) => setRemoveReason(e.target.value)}
                 />
                 {removeReason.length > 0 && removeReason.length < 5 && (
                   <p className="text-[9px] font-bold text-rose-500 ml-1 italic animate-pulse tracking-tight">Motivo demasiado corto...</p>
                 )}
               </div>
               <div className="flex gap-3 pt-2">
                 <button
                   onClick={() => setShowRemoveModal(false)}
                   className="flex-1 py-4 bg-gray-100 text-gray-400 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-200 transition-all active:scale-95"
                 >
                   Cancelar
                 </button>
                 <button
                   onClick={handleRemoveDress}
                   disabled={removeReason.length < 5 || modalLoading}
                   className="flex-[1.5] py-4 bg-rose-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-rose-100 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-2 border-b-4 border-rose-800 active:border-b-0 active:translate-y-1"
                 >
                   {modalLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : (
                     <>
                        <ShieldAlert className="w-4 h-4" /> CONFIRMAR Y QUITAR
                     </>
                   )}
                 </button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* NEW: REVERSION MODAL */}
      {isReversionModalOpen && revertingContractId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-red-600 p-6 text-center">
               <h2 className="text-xl font-black text-white uppercase tracking-tight italic">Revertir Contrato</h2>
               <p className="text-red-100 text-[10px] font-bold uppercase tracking-widest mt-1">Acción Restringida (Admin)</p>
            </div>
            <div className="p-8 space-y-6 text-center">
               <div className="flex flex-col items-center gap-2">
                 <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center text-red-500 mb-2">
                   <AlertTriangle className="w-8 h-8" />
                 </div>
                 <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest leading-none">Advertencia de Sistema</p>
                 <p className="text-sm font-bold text-gray-900 tracking-tight leading-tight">Estás a punto de devolver este contrato al estado <span className="font-black text-red-600">Por Entregar</span>. Deberás justificar este movimiento operativo.</p>
               </div>
               <div className="space-y-2 text-left">
                 <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Justificación del Cambio (Obligatorio)</label>
                 <textarea
                   rows={3}
                   className="w-full px-4 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl text-xs font-bold text-gray-700 outline-none focus:border-red-500 transition-all placeholder:text-gray-300 shadow-inner"
                   placeholder="Mínimo 10 caracteres: Ej: Contrato finalizado por error..."
                   value={reversionReason}
                   onChange={(e) => setReversionReason(e.target.value)}
                 />
                 {reversionReason.length > 0 && reversionReason.trim().length < 10 && (
                   <p className="text-[9px] font-bold text-red-500 ml-1 italic animate-pulse tracking-tight">La justificación debe tener al menos 10 caracteres...</p>
                 )}
               </div>
               <div className="flex gap-3 pt-2">
                 <button
                   onClick={() => {
                     setIsReversionModalOpen(false);
                     setReversionReason('');
                     setRevertingContractId(null);
                   }}
                   className="flex-1 py-4 bg-gray-100 text-gray-400 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-200 transition-all active:scale-95"
                 >
                   Cancelar
                 </button>
                 <button
                   onClick={handleRevertirAPorEntregar}
                   disabled={reversionReason.trim().length < 10 || isReverting}
                   className="flex-[1.5] py-4 bg-red-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-red-100 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-2 border-b-4 border-red-800 active:border-b-0 active:translate-y-1"
                 >
                   {isReverting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : (
                     <>
                        <RefreshCw className="w-4 h-4" /> CONFIRMAR REVERSIÓN
                     </>
                   )}
                 </button>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

