'use client';

import MoneyInput from '@/components/MoneyInput';
import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Toaster, toast } from 'sonner';
import { 
  Loader2, 
  ArrowLeft, 
  DollarSign, 
  CreditCard,
  CheckCircle,
  Clock,
  FileText,
  AlertTriangle
} from 'lucide-react';
import Link from 'next/link';
import PaymentSupportUpload from '@/components/PaymentSupportUpload';
import AttachPaymentSupport from '@/components/AttachPaymentSupport';
import SiigoContrato from '@/components/SiigoContrato';
import { SUPPORT_BUCKET, type UploadedSupport } from '@/lib/payment-support';
import { porPagarContrato, puedeAbonar, saldoContrato } from '@/lib/saldo';

type PagoSoporte = { id: string; archivo_path: string; nombre: string; activo: boolean };

export default function RegistrarPagoPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [contrato, setContrato] = useState<any>(null);
  const [pagos, setPagos] = useState<any[]>([]);
  const [soportes, setSoportes] = useState<UploadedSupport[]>([]);
  const [subiendoSoporte, setSubiendoSoporte] = useState(false);
  const [esAdmin, setEsAdmin] = useState(false);
  const [condonar, setCondonar] = useState<{ valor: string; motivo: string } | null>(null);
  const [condonando, setCondonando] = useState(false);
  useEffect(() => { void supabase.rpc('es_finanzas').then(({ data }) => setEsAdmin(data === true)); }, []);
  // Stores with Siigo: the receipt number is the one Siigo gives (RC-…), not typed here.
  const [siigoActivo, setSiigoActivo] = useState(false);
  useEffect(() => { if (!contrato?.sede_id) return; let live = true; void supabase.rpc('siigo_sede_activa', { p_sede: contrato.sede_id }).then(({ data }) => { if (live) setSiigoActivo(!!(data as { activa?: boolean } | null)?.activa); }); return () => { live = false; }; }, [contrato?.sede_id]);

  const [formData, setFormData] = useState({
    valor_pagado: '',
    medio_pago: 'Transferencia',
    numero_recibo: '',
    observaciones: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Contrato
      const { data: cData, error: cError } = await supabase
        .from('contratos')
        .select('*')
        .eq('id', id)
        .single();
      
      if (cError) throw cError;
      setContrato(cData);

      const { data: pData, error: pError } = await supabase
        .from('pagos')
        .select('*, soportes_pago(id, archivo_path, nombre, activo)')
        .eq('contrato_id', id)
        .order('created_at', { ascending: false });

      if (pError) throw pError;
      setPagos(pData || []);

    } catch (err: any) {
      console.error(err);
      toast.error('No se pudo cargar la información.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchData();
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // ── REAL-TIME VALIDATION ──────────────────────────────────────────────────
  // Includes penalties: the release keeps the contract open until they are paid too.
  const saldoNumber = contrato ? porPagarContrato(contrato) : 0;
  const multasTotal = Number(contrato?.total_multas) || 0;
  // Payments cover the rental first; whatever is still owed beyond it is the pending penalty.
  const multaPendiente = Math.min(multasTotal, Math.max(0, saldoNumber));
  const saldoAlquiler = Math.max(0, saldoNumber - multaPendiente);
  const confirmarCondonacion = async () => {
    if (!condonar) return;
    const valor = Number(condonar.valor.replace(/\D/g, '')) || 0;
    if (valor <= 0 || valor > multaPendiente) { toast.error(`El valor debe estar entre $1 y ${formatCurrency(multaPendiente)}.`); return; }
    if (condonar.motivo.trim().length < 10) { toast.error('Escribe el motivo (mínimo 10 caracteres).'); return; }
    setCondonando(true);
    const { error } = await supabase.rpc('condonar_multa', { p_contrato: id, p_valor: valor, p_motivo: condonar.motivo.trim() });
    setCondonando(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Multa condonada: ${formatCurrency(valor)}. Queda registrado en la bitácora del contrato.`);
    setCondonar(null);
    void fetchData();
  };
  const montoIngresado = parseFloat(formData.valor_pagado) || 0;
  const excedeBalance = montoIngresado > saldoNumber && formData.valor_pagado !== '';
  const montoInvalido = montoIngresado <= 0 && formData.valor_pagado !== '';

  const isSubmitDisabled =
    submitting ||
    formData.valor_pagado === '' ||
    montoIngresado <= 0 ||
    excedeBalance ||
    subiendoSoporte ||
    soportes.length === 0;
  // ─────────────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contrato) return;

    const montoAbono = parseFloat(formData.valor_pagado);

    // ── BACKEND SECURITY GUARD (Front-to-back double-check) ──────────────
    if (montoAbono <= 0) {
      toast.error('El monto debe ser mayor a $0.');
      return;
    }
    if (subiendoSoporte || soportes.length === 0) {
      toast.error('Adjunta el soporte para generar el recibo.');
      return;
    }

    // Hard-stop: Operación denegada si genera saldo negativo
    const saldoPendienteActual = porPagarContrato(contrato);
    if (montoAbono > saldoPendienteActual) {
      toast.error(
        `Operación denegada: El pago genera un saldo negativo. ` +
        `Monto ingresado: ${formatCurrency(montoAbono)} — Saldo pendiente: ${formatCurrency(saldoPendienteActual)}.`
      );
      return; // No impacta la base de datos bajo ninguna circunstancia
    }
    // ─────────────────────────────────────────────────────────────────────

    setSubmitting(true);
    try {
      // 1. Abono, soportes y anticipo del contrato en una sola operación (todo o nada; un reintento no lo duplica).
      const { error: insertError } = await supabase.rpc('registrar_abono_contrato', {
        p_contrato: id,
        p_valor: montoAbono,
        p_medio: formData.medio_pago,
        p_recibo: siigoActivo ? '' : formData.numero_recibo,
        p_observaciones: formData.observaciones,
        p_soportes: soportes,
      });

      if (insertError) throw insertError;

      // 1.1 Bitácora Automática: Registrar el abono en el historial
      await supabase.from('bitacora_contratos').insert({
        contrato_id: id,
        accion: 'Abono Registrado',
        detalle: `Se registró un abono de $${montoAbono.toLocaleString('es-CO')} ${siigoActivo ? 'con recibo de caja de Siigo (número automático)' : `con el recibo #${formData.numero_recibo}`}. Soporte adjunto (${soportes.length} archivo${soportes.length === 1 ? '' : 's'}).`,
        usuario: contrato.asesora || 'Administrador'
      });

      toast.success('¡Abono registrado exitosamente!');
      
      // Limpiar y recargar
      setFormData({ valor_pagado: '', medio_pago: 'Transferencia', numero_recibo: '', observaciones: '' });
      setSoportes([]);
      fetchData();
      
    } catch (err: any) {
      console.error(err);
      toast.error(err?.code === 'P0001' && err?.message ? err.message : 'Ocurrió un error al registrar el pago.');
    } finally {
      setSubmitting(false);
    }
  };

  const openSupport = async (path: string) => {
    const { data, error } = await supabase.storage.from(SUPPORT_BUCKET).createSignedUrl(path, 300);
    if (error || !data?.signedUrl) { toast.error('No se pudo abrir el soporte.'); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  if (loading && !contrato) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#fafafa]">
        <Loader2 className="w-12 h-12 animate-spin text-emerald-500 mb-4" />
        <p className="text-gray-600 font-medium">Cargando detalles...</p>
      </div>
    );
  }

  if (!contrato) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#fafafa]">
        <p className="text-xl text-gray-500">Contrato no encontrado.</p>
      </div>
    );
  }

  const estaPagado = !puedeAbonar(contrato);

  return (
    <div className="min-h-screen bg-[#fafafa] p-4 sm:p-8 font-sans pb-20">
      <Toaster position="top-right" richColors />
      
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <Link 
            href="/dashboard"
            className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors font-medium"
          >
            <ArrowLeft className="w-4 h-4" /> Volver al Dashboard
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Columna Izquierda: Formulario e Info */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Header Ficha Cliente */}
            <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-1">{contrato.cliente_nombre}</h1>
                <p className="text-sm font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded inline-block">
                  Contrato No. {contrato.numero_contrato}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500 font-semibold mb-1">{Number(contrato.total_multas) > 0 ? 'Saldo pendiente (incluye multas)' : 'Saldo Pendiente'}</p>
                <div className={`text-3xl font-black ${saldoNumber > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {formatCurrency(saldoNumber)}
                </div>
                {multaPendiente > 0 && <p className="text-xs font-bold text-gray-500 mt-1">Alquiler {formatCurrency(saldoAlquiler)} · <span className="text-violet-700">Multa {formatCurrency(multaPendiente)}</span></p>}
              </div>
            </div>

            {/* Multa: se ve aparte, con opción de pagarla o condonarla */}
            {multasTotal > 0 && (
              <div className="bg-violet-50 rounded-2xl p-6 border-2 border-violet-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-violet-600">Multa del contrato</p>
                    <p className="text-2xl font-black text-violet-900">{multaPendiente > 0 ? `${formatCurrency(multaPendiente)} pendiente` : 'Multa pagada ✅'}</p>
                    <p className="text-xs text-violet-700">Multa cargada: {formatCurrency(multasTotal)}. Se paga como abono o, si se perdona, se condona y queda en ceros.</p>
                  </div>
                  {multaPendiente > 0 && (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setFormData(prev => ({ ...prev, valor_pagado: String(multaPendiente), observaciones: prev.observaciones || 'Pago de multa' }))}
                        className="px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-black hover:bg-violet-700">Pagar multa</button>
                      {esAdmin && <button type="button" onClick={() => setCondonar({ valor: String(multaPendiente), motivo: '' })}
                        className="px-4 py-2.5 rounded-xl border-2 border-violet-300 bg-white text-violet-800 text-sm font-black hover:bg-violet-100">Condonar multa</button>}
                    </div>
                  )}
                </div>
                {condonar && (
                  <div className="bg-white rounded-xl border border-violet-200 p-4 space-y-3">
                    <p className="text-sm font-bold text-gray-800">Condonar multa (no entra dinero; queda registrado quién y por qué)</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <label className="text-xs font-bold text-gray-600">Valor a condonar
                        <input inputMode="numeric" value={condonar.valor ? Number(condonar.valor.replace(/\D/g, '') || 0).toLocaleString('es-CO') : ''} onChange={e => setCondonar({ ...condonar, valor: e.target.value.replace(/\D/g, '') })}
                          className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 font-semibold" />
                      </label>
                      <label className="text-xs font-bold text-gray-600 md:col-span-2">Motivo *
                        <input value={condonar.motivo} maxLength={300} onChange={e => setCondonar({ ...condonar, motivo: e.target.value })} placeholder="Ej.: Autorizado por gerencia, la clienta devolvió a tiempo según acuerdo"
                          className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2" />
                      </label>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={() => setCondonar(null)} disabled={condonando} className="px-4 py-2 rounded-xl border text-sm font-bold">Cancelar</button>
                      <button type="button" onClick={() => void confirmarCondonacion()} disabled={condonando} className="px-4 py-2 rounded-xl bg-violet-700 text-white text-sm font-black disabled:opacity-50">{condonando ? 'Condonando…' : 'Confirmar condonación'}</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Formulario de Pago */}
            <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-emerald-100 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-emerald-400"></div>
              
              {estaPagado ? (
                <div className="text-center py-10 space-y-4">
                  <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto" />
                  <h2 className="text-2xl font-bold text-gray-900">¡Paz y Salvo!</h2>
                  <p className="text-gray-500 max-w-sm mx-auto">
                    Este contrato ha sido pagado en su totalidad. No es posible generar más abonos.
                  </p>
                </div>
              ) : (
                <>
                  <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-emerald-500" /> Nuevo Abono
                  </h2>
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                      {/* ── MONTO DEL ABONO con validación en tiempo real ── */}
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">
                          Monto del Abono ($)
                        </label>
                        <MoneyInput
                          name="valor_pagado"
                          value={formData.valor_pagado}
                          onChange={handleChange}
                          placeholder={`Máx: ${formatCurrency(saldoNumber)}`}
                          className={`w-full bg-gray-50 border text-gray-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 transition-all font-semibold ${
                            excedeBalance
                              ? 'border-rose-400 focus:ring-rose-200 focus:border-rose-400 bg-rose-50'
                              : 'border-gray-200 focus:ring-emerald-200 focus:border-emerald-300'
                          }`}
                          required
                        />
                        {/* Alerta dinámica en rojo cuando el monto supera el saldo */}
                        {excedeBalance && (
                          <div className="flex items-start gap-2 mt-1.5 p-2.5 bg-rose-50 border border-rose-200 rounded-lg">
                            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                            <p className="text-xs font-semibold text-rose-700 leading-snug">
                              ❌ El monto del abono ({formatCurrency(montoIngresado)}) supera el saldo pendiente actual ({formatCurrency(saldoNumber)}). Por favor verifica el número.
                            </p>
                          </div>
                        )}
                        {/* Indicador helper cuando el monto es válido y mayor a 0 */}
                        {!excedeBalance && montoIngresado > 0 && (
                          <p className="text-xs text-emerald-600 font-medium mt-1">
                            ✅ Saldo restante tras este abono: {formatCurrency(saldoNumber - montoIngresado)}
                          </p>
                        )}
                      </div>
                      {/* ────────────────────────────────────────────────── */}

                      <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">Medio de Pago</label>
                        <select
                          name="medio_pago"
                          value={formData.medio_pago}
                          onChange={handleChange}
                          className="w-full bg-gray-50 border border-gray-200 text-gray-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300 transition-all"
                          required
                        >
                          <option value="Transferencia">Transferencia</option>
                          <option value="Efectivo">Efectivo</option>
                          <option value="Tarjeta">Tarjeta (Datafono/Link)</option>
                        </select>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {siigoActivo ? <div className="space-y-1">
                        <span className="text-sm font-medium text-gray-700">Número de Recibo de Caja</span>
                        <p className="w-full bg-indigo-50 border border-indigo-100 text-indigo-800 rounded-xl px-4 py-3 text-sm font-semibold">Lo asigna Siigo automáticamente (RC-…) al registrar el abono.</p>
                      </div> : <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">Número de Recibo de Caja</label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                             <FileText className="w-4 h-4" />
                          </div>
                          <input
                            type="text"
                            name="numero_recibo"
                            value={formData.numero_recibo}
                            onChange={handleChange}
                            placeholder="Ej: REC-1025..."
                            className="w-full bg-gray-50 border border-gray-200 text-gray-800 rounded-xl pl-9 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300 transition-all font-semibold"
                            required
                          />
                        </div>
                      </div>}
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">Observaciones (Opcional)</label>
                        <textarea
                          name="observaciones"
                          value={formData.observaciones}
                          onChange={handleChange}
                          placeholder="Ej. Bancolombia p-4321..."
                          rows={1}
                          className="w-full bg-gray-50 border border-gray-200 text-gray-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300 transition-all text-sm resize-none"
                        />
                      </div>
                    </div>

                    <PaymentSupportUpload
                      sedeId={contrato.sede_id}
                      value={soportes}
                      onChange={setSoportes}
                      onBusyChange={setSubiendoSoporte}
                      title="Documento soporte"
                      help="Pantallazo de Nequi, comprobante del banco o voucher del datáfono. Foto o PDF."
                      missingMessage="Adjunta el soporte para generar el recibo."
                    />

                    {/* ── BOTÓN DESHABILITADO si el monto supera el saldo ── */}
                    <button
                      type="submit"
                      disabled={isSubmitDisabled}
                      className={`w-full font-bold text-lg py-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 ${
                        isSubmitDisabled
                          ? excedeBalance
                            ? 'bg-rose-200 text-rose-400 cursor-not-allowed shadow-none'
                            : 'bg-emerald-300 text-white cursor-not-allowed shadow-none opacity-70'
                          : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-200 active:scale-[0.98]'
                      }`}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" /> Guardando...
                        </>
                      ) : excedeBalance ? (
                        <>
                          <AlertTriangle className="w-5 h-5" /> Monto no válido
                        </>
                      ) : (
                        'Registrar Pago'
                      )}
                    </button>
                    {/* ──────────────────────────────────────────────────── */}
                  </form>
                </>
              )}
            </div>
          </div>

          {/* Columna Derecha: Historial */}
          <div className="lg:col-span-1 space-y-6">
            <SiigoContrato contratoId={contrato.id} />
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-gray-400" /> Historial de Pagos
              </h2>
              
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {pagos.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm border-2 border-dashed border-gray-100 rounded-xl">
                    No se han registrado abonos previos.
                  </div>
                ) : (
                  pagos.map((pago) => (
                    <div key={pago.id} className={`p-4 rounded-xl border ${pago.anulado_at ? 'bg-rose-50 border-rose-100 opacity-70' : 'bg-gray-50 border-gray-100'}`}>
                      {pago.anulado_at ? <p className="text-[11px] font-black text-rose-600 mb-1">ANULADO · {pago.motivo_anulacion}</p> : (
                        <button type="button" className="float-right text-[11px] font-bold text-rose-600 underline" onClick={async () => {
                          const motivo = window.prompt('Motivo de la anulación (mínimo 10 caracteres):');
                          if (!motivo) return;
                          const { data: res, error } = await supabase.rpc('anular_pago_contrato', { p_pago: pago.id, p_motivo: motivo });
                          // Only administración or contabilidad annul: anyone else sends a request that they approve.
                          if (error) toast.error(error.message); else if ((res as { solicitud?: boolean; mensaje?: string } | null)?.solicitud) toast.success((res as { mensaje?: string }).mensaje || 'Solicitud enviada a administración.'); else { toast.success('Pago anulado. El saldo se recalculó.'); fetchData(); }
                        }}>Anular</button>
                      )}
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold text-emerald-600">{formatCurrency(Number(pago.valor_pagado))}</span>
                        <span className="text-xs font-semibold text-gray-500 bg-white px-2 py-0.5 rounded border border-gray-200">
                          {pago.fecha_pago}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-1.5 text-xs text-gray-600 font-medium mb-1">
                        <span className="flex items-center gap-1.5">
                          <CreditCard className="w-3.5 h-3.5" /> 
                          {pago.medio_pago}
                        </span>
                        {pago.numero_recibo && (
                          <span className="text-gray-400">Recibo: <span className="text-gray-600 font-bold">{pago.numero_recibo}</span></span>
                        )}
                      </div>
                      {pago.observaciones && (
                        <p className="text-xs text-gray-500 mt-2 bg-white p-2 rounded border border-gray-100 italic">
                          {pago.observaciones}
                        </p>
                      )}
                      {((pago.soportes_pago || []) as PagoSoporte[]).filter(s => s.activo).map(s => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => void openSupport(s.archivo_path)}
                          className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                        >
                          <FileText className="w-3.5 h-3.5" /> Ver soporte · {s.nombre}
                        </button>
                      ))}
                      {!pago.anulado_at && contrato?.sede_id && !((pago.soportes_pago || []) as PagoSoporte[]).some(s => s.activo) && (
                        <AttachPaymentSupport sedeId={contrato.sede_id} pagoId={pago.id} onDone={() => void fetchData()} />
                      )}
                    </div>
                  ))
                )}
              </div>
              
              <div className="mt-6 pt-4 border-t border-gray-100">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-500 font-medium">Sumatoria Abonos:</span>
                  <span className="font-bold text-gray-900">{formatCurrency(Number(contrato.anticipo))}</span>
                </div>
                {Number(contrato.plan_ahorro_aplicado)+Number(contrato.descuento_plan_ahorro)>0 && (
                  <div className="text-xs text-emerald-800 bg-emerald-50 rounded-lg p-2 mb-1">
                    Incluye Plan Ahorro XV: ahorro {formatCurrency(Number(contrato.plan_ahorro_aplicado))} (ya entró a caja con cada cuota) + extra como descuento {formatCurrency(Number(contrato.descuento_plan_ahorro))}.
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 font-medium">Valor Total Contrato:</span>
                  <span className="font-bold text-gray-900">{formatCurrency(Number(contrato.valor_total))}</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
