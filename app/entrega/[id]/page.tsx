'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { 
  ShieldCheck, 
  Camera, 
  UserCheck, 
  X, 
  CheckCircle2, 
  Loader2,
  FileText,
  AlertCircle,
  Download,
  RefreshCw
} from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import { toast, Toaster } from 'sonner';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

export default function EntregaPublicPage() {
  const { id } = useParams();
  const sigCanvas = useRef<SignatureCanvas>(null);
  
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [success, setSuccess] = useState(false);
  const [contrato, setContrato] = useState<any>(null);
  const [bitacora, setBitacora] = useState<any>(null);
  
  // Re-añadido identificación por solicitud del usuario
  const [nombreRecibe, setNombreRecibe] = useState('');
  const [documentoRecibe, setDocumentoRecibe] = useState('');

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Schema Refresh - Sync with confirmed Supabase columns
      const { data: bit, error: bitErr } = await supabase
        .from('entregas_bitacora')
        .select(`
          id, 
          contrato_id, 
          usuario_id, 
          fotos_uris, 
          firma_cliente, 
          finalizado,
          tipo_entrega
        `)
        .eq('id', id)
        .single();
      
      if (bitErr || !bit) {
        console.error('Fetch Error Detail:', bitErr);
        setBitacora(null);
        toast.error(`Error de Conexión (400): ${bitErr?.message || 'Registro no encontrado'}`);
        throw new Error('No se encontró el registro de entrega.');
      }
      setBitacora(bit);

      // 2. Obtener contrato usando el contrato_id de la bitácora vinculada
      // Nota: La columna en 'vestidos' se renombró de codigo_referencia a codigo
      const { data: conv, error: convErr } = await supabase
        .from('contratos')
        .select(`*, vestidos:contrato_items_vestidos(id, vestido_id, vestido:vestidos(id, codigo))`)
        .eq('id', bit.contrato_id)
        .single();
      
      if (convErr) throw convErr;
      setContrato(conv);
      
      // Auto-identificación si existen en el objeto bit (pero no están en el select limitado)
      // Nota: Si el usuario confirma que existen, los volveremos a añadir al select.
      if (success || bit.firma_cliente) {
        setSuccess(true);
      }
    } catch (err) {
      console.error(err);
      toast.error('No se encontró el registro de entrega.');
    } finally {
      setLoading(false);
    }
  };

  const clearSignature = () => {
    sigCanvas.current?.clear();
  };

  const handleSaveSignature = async () => {
    if (!nombreRecibe.trim() || !documentoRecibe.trim()) {
      return toast.error('Por favor, ingresa el nombre y documento de quien recibe.');
    }
    if (sigCanvas.current?.isEmpty()) {
      return toast.error('Por favor, firma antes de continuar.');
    }

    setSigning(true);
    try {
      // 0. Candado Financiero de Seguridad Severo
      if (Number(contrato.saldo) > 0) {
         setSigning(false);
         return toast.error(`⚠️ ACCIÓN BLOQUEADA: Pendiente pago de $${Number(contrato.saldo).toLocaleString('es-CO')}`);
      }

      const signatureBase64 = sigCanvas.current?.getTrimmedCanvas().toDataURL('image/png');

      // 1. Actualizar bitácora con firma y marcar finalizado
      const { error: bitUpdateErr } = await supabase
        .from('entregas_bitacora')
        .update({ 
          firma_cliente: signatureBase64,
          finalizado: true 
        })
        .eq('id', id);
      
      if (bitUpdateErr) throw bitUpdateErr;

      // 2. Actualizar estado del contrato según el tipo de entrega
      const isPreXv = bitacora.tipo_entrega === 'PREXV' || bitacora.tipo_entrega === 'AMBOS';
      const isEvento = bitacora.tipo_entrega === 'EVENTO' || bitacora.tipo_entrega === 'AMBOS' || !bitacora.tipo_entrega;
      
      const payload: any = { estado: 'entregado' };
      if (isPreXv) {
        payload.entregado_prexv = true;
        payload.fecha_entrega_prexv = new Date().toISOString();
      }
      if (isEvento) {
        payload.entregado_evento = true;
        payload.fecha_entrega_evento = new Date().toISOString();
      }

      const { error: contrUpdateErr } = await supabase
        .from('contratos')
        .update(payload)
        .eq('id', contrato.id);
      
      if (contrUpdateErr) throw contrUpdateErr;

      // 3. Asegurar que el inventario sepa que el vestido está "Fuera de tienda" (Alquilado)
      if (contrato.vestidos && contrato.vestidos.length > 0) {
         // Some structures might return item.vestido as an object
         const vIds = contrato.vestidos.map((item: any) => item.vestido_id || (item.vestido && item.vestido.id) || item.id).filter(Boolean);
         if (vIds.length > 0) {
            await supabase
              .from('vestidos')
              .update({ estado: 'Alquilado' })
              .in('id', vIds);
         }
      }

      setSuccess(true);
      toast.success('¡Entrega firmada con éxito!');
      // Auto-generar recibo tras firma
      setTimeout(() => generateReceipt(), 1500);
    } catch (err) {
      console.error(err);
      toast.error('Hubo un error al guardar la firma.');
    } finally {
      setSigning(false);
    }
  };

  const generateReceipt = async () => {
    const element = document.getElementById('receipt-content');
    if (!element) return;
    
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Recibo_Entrega_${contrato.numero_contrato}.pdf`);
      toast.success('Recibo descargado.');
    } catch (err) {
      console.error(err);
      toast.error('Error generando el PDF.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-amber-500 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Cargando acta de conformidad...</p>
        </div>
      </div>
    );
  }

  if (!contrato || !bitacora) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6 text-center">
        <div className="max-w-md w-full space-y-8 animate-in fade-in zoom-in duration-500">
          <div className="relative mx-auto w-32 h-32 flex items-center justify-center bg-rose-50 rounded-full">
            <div className="absolute inset-0 bg-rose-100 rounded-full animate-ping opacity-20"></div>
            <AlertCircle className="w-16 h-16 text-rose-500 relative z-10" />
          </div>
          
          <div className="space-y-3">
            <h1 className="text-3xl font-black text-gray-900 tracking-tight uppercase">Enlace no válido o expirado</h1>
            <p className="text-gray-500 font-medium leading-relaxed px-4">
              Lo sentimos, no pudimos encontrar un acta de entrega asociada a este código. 
              Es posible que el enlace haya sido generado incorrectamente o que el registro 
              base haya fallado al guardarse.
            </p>
          </div>

          <div className="pt-6 space-y-4">
            <button 
              onClick={() => window.location.href = '/dashboard'}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 transition-all flex items-center justify-center gap-3 active:scale-95"
            >
              <RefreshCw className="w-5 h-5" /> REINTENTAR / VOLVER AL DASHBOARD
            </button>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
              Comunícate con tu asesora para generar un nuevo enlace.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-emerald-50 flex items-center justify-center p-6 text-center">
        <div className="max-w-md bg-white p-10 rounded-[3rem] shadow-xl border border-emerald-100 animate-in zoom-in duration-300">
          <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-12 h-12" />
          </div>
          <h1 className="text-3xl font-black text-gray-900 mb-4 tracking-tight">¡Recibido a Satisfacción!</h1>
          <p className="text-gray-600 mb-8 leading-relaxed">
            Gracias <strong>{contrato.cliente_nombre}</strong>. Tu firma ha sido registrada y el acta de entrega blindada ha sido sellada con éxito.
          </p>
          <div className="bg-gray-50 p-6 rounded-2xl mb-8 border border-gray-100">
             <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Contrato</p>
             <p className="text-xl font-bold text-emerald-700">{contrato.numero_contrato}</p>
          </div>
          
          <button 
            onClick={generateReceipt}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-2 mb-4"
          >
            <Download className="w-5 h-5" /> DESCARGAR RECIBO PDF
          </button>

          <p className="text-sm text-gray-400 font-medium italic">Ahora puedes cerrar esta ventana.</p>

          {/* Hidden Template for PDF */}
          <div className="fixed top-[-10000px] left-[-10000px]">
             <div id="receipt-content" style={{ width: '800px', backgroundColor: '#ffffff', padding: '48px', color: '#000000', fontFamily: 'sans-serif' }}>
                <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                   <h1 style={{ fontSize: '36px', fontWeight: '900', textTransform: 'uppercase', color: '#d97706', margin: '0 0 8px 0' }}>Ámbar Couture</h1>
                   <p style={{ fontWeight: 'bold', color: '#6b7280', margin: '0' }}>ACTA DE ENTREGA FÍSICA Y CONFORMIDAD</p>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '40px', borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', padding: '32px 0' }}>
                   <div>
                      <h3 style={{ fontSize: '12px', fontWeight: '900', textTransform: 'uppercase', color: '#6b7280', margin: '0 0 4px 0' }}>Recibido por</h3>
                      <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#000000', margin: '0 0 4px 0' }}>{bitacora.nombre_recibe || nombreRecibe}</p>
                      <p style={{ color: '#4b5563', margin: '0' }}>{bitacora.documento_recibe || documentoRecibe}</p>
                   </div>
                   <div style={{ textAlign: 'right' }}>
                      <h3 style={{ fontSize: '12px', fontWeight: '900', textTransform: 'uppercase', color: '#6b7280', margin: '0 0 4px 0' }}>Contrato</h3>
                      <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#d97706', margin: '0 0 4px 0' }}>{contrato.numero_contrato}</p>
                      <p style={{ color: '#4b5563', margin: '0' }}>{new Date().toLocaleDateString()}</p>
                   </div>
                </div>
                
                <div style={{ marginBottom: '40px' }}>
                   <h3 style={{ fontSize: '12px', fontWeight: '900', textTransform: 'uppercase', color: '#6b7280', marginBottom: '16px' }}>Estado del Vestido / Accesorios</h3>
                   <div style={{ padding: '24px', borderRadius: '16px', backgroundColor: '#f9fafb', border: '1px solid #f3f4f6', color: '#111827', fontSize: '18px', textAlign: 'center', fontStyle: 'italic' }}>
                      ACTA DE CONFORMIDAD FIRMADA ELECTRÓNICAMENTE
                   </div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '40px' }}>
                   {bitacora.fotos_uris?.map((url: string, i: number) => (
                      <img key={i} src={url} alt="Evidencia" style={{ width: '100%', height: '160px', objectFit: 'cover', borderRadius: '12px', border: '1px solid #e5e7eb' }} />
                   ))}
                </div>
                
                <div style={{ marginTop: '48px', paddingTop: '48px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                   <div style={{ textAlign: 'center', borderBottom: '2px solid #000000', paddingBottom: '8px', width: '256px' }}>
                      {bitacora.firma_cliente && <img src={bitacora.firma_cliente} alt="Firma" style={{ height: '96px', margin: '0 auto 8px auto', display: 'block' }} />}
                      <p style={{ fontSize: '12px', fontWeight: '900', textTransform: 'uppercase', color: '#000000', margin: '0' }}>Firma de Conformidad</p>
                   </div>
                   <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: '#9ca3af', margin: '0' }}>Sello de Calidad Ámbar Couture</p>
                   </div>
                </div>
             </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <Toaster position="top-center" richColors />
      
      {/* Header Premium */}
      <header className="bg-amber-600 text-white px-6 py-8 text-center rounded-b-[3rem] shadow-lg shadow-amber-100 mb-8">
        <div className="mb-2 flex justify-center">
           <ShieldCheck className="w-10 h-10" />
        </div>
        <h1 className="text-2xl font-black uppercase tracking-tighter">Acta de Entrega Blindada</h1>
        <p className="text-amber-100 text-sm mt-1 opacity-90">Confirmación de entrega y estado de prenda</p>
      </header>

      <main className="max-w-xl mx-auto px-5 space-y-6">
        
        {/* Info del Cliente */}
        <section className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
          <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <UserCheck className="w-4 h-4" /> Datos de Recepción
          </h2>
          <div className="grid grid-cols-2 gap-4">
             <div>
                <p className="text-[10px] text-gray-400 uppercase font-bold">Cliente</p>
                <p className="font-bold text-gray-800">{contrato.cliente_nombre}</p>
             </div>
             <div className="text-right">
                <p className="text-[10px] text-gray-400 uppercase font-bold">Documento</p>
                <p className="font-bold text-gray-800">{contrato.cliente_documento}</p>
             </div>
             <div>
                <p className="text-[10px] text-gray-400 uppercase font-bold">Contrato</p>
                <p className="font-bold text-amber-600">{contrato.numero_contrato}</p>
             </div>
             <div className="text-right">
                <p className="text-[10px] text-gray-400 uppercase font-bold">Fecha</p>
                <p className="font-bold text-gray-800">{new Date().toLocaleDateString('es-CO')}</p>
             </div>
          </div>
        </section>

        {/* Estado del Vestido y Fotos */}
        <section className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
           <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Camera className="w-4 h-4" /> Evidencia del Estado
          </h2>
          
          <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 mb-6 italic text-gray-700 text-sm leading-relaxed text-center font-bold">
            CONFIRMO RECIBO A SATISFACCIÓN
          </div>

          <div className="grid grid-cols-2 gap-3 mb-2">
            {bitacora.fotos_uris && bitacora.fotos_uris.map((url: string, index: number) => (
              <div key={index} className="aspect-square bg-gray-100 rounded-2xl overflow-hidden border border-gray-100 relative group">
                <img 
                  src={url} 
                  alt={`Evidencia ${index + 1}`} 
                  className="w-full h-full object-cover transition-transform group-hover:scale-110"
                />
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 font-bold text-center mt-3">Evidencias capturadas por el personal de Ámbar Couture</p>
        </section>

        {/* Firma Digital */}
        <section className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
           <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4" /> Firma de Recibido a Satisfacción
          </h2>
          
          <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl overflow-hidden mb-4 h-64 relative touch-none">
             <SignatureCanvas 
               ref={sigCanvas}
               penColor='#1e293b'
               canvasProps={{ className: 'w-full h-full cursor-crosshair' }}
             />
             <button 
               onClick={clearSignature}
               className="absolute top-3 right-3 p-2 bg-white rounded-full shadow-sm text-gray-400 hover:text-rose-500 transition-colors"
             >
               <X className="w-5 h-5" />
             </button>
          </div>

          <div className="space-y-4 mb-8">
             <div>
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest block mb-1.5 flex items-center gap-1.5">
                   <UserCheck className="w-3.5 h-3.5" /> Nombre de quien recibe
                </label>
                 <input 
                    type="text" 
                    value={nombreRecibe}
                    onChange={(e) => setNombreRecibe(e.target.value.toUpperCase())}
                    placeholder="EJ: MARIA PEREZ"
                    className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-black text-black placeholder:text-gray-600 focus:ring-4 focus:ring-amber-50 outline-none transition-all uppercase"
                 />
             </div>
             <div>
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest block mb-1.5 flex items-center gap-1.5">
                   <FileText className="w-3.5 h-3.5" /> Documento de Identidad / Cédula
                </label>
                 <input 
                    type="text" 
                    value={documentoRecibe}
                    onChange={(e) => setDocumentoRecibe(e.target.value)}
                    placeholder="NÚMERO DE DOCUMENTO"
                    className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-black text-black placeholder:text-gray-600 focus:ring-4 focus:ring-amber-50 outline-none transition-all"
                 />
             </div>
          </div>

          <p className="text-xs text-gray-500 mb-6 leading-relaxed">
            Al firmar, confirmo que he recibido la(s) prenda(s) y accesorios en perfecto estado y que las fotografías adjuntas representan fielmente lo entregado por <strong>Ámbar Couture</strong>.
          </p>

          <button
            onClick={handleSaveSignature}
            disabled={signing}
            className="w-full py-5 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-2xl shadow-lg shadow-amber-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50 border-b-4 border-amber-800 active:border-b-0 active:translate-y-1"
          >
            {signing ? <Loader2 className="w-6 h-6 animate-spin" /> : 'CONFIRMAR Y FINALIZAR'}
          </button>
        </section>

        <footer className="text-center">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Ámbar Couture ERP - Sistema de Gestión de Calidad</p>
        </footer>

      </main>
    </div>
  );
}
