'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {operationToken} from '@/lib/operation-links';
import ContractTemplate, { ContractData } from '@/components/ContractTemplate';
import SignatureCanvas from 'react-signature-canvas';
import { Toaster, toast } from 'sonner';
import { Loader2, Eraser, PenTool, CheckCircle, AlertCircle } from 'lucide-react';

export default function FirmaPage() {
  const params = useParams();
  const id = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [contract, setContract] = useState<any>(null);
  const [isSigned, setIsSigned] = useState(false);
  const sigCanvas = useRef<SignatureCanvas>(null);

  useEffect(() => {
    if (id) {
      fetchContract();
    }
  }, [id]);

  const fetchContract = async () => {
    try {
      const {data:result,error}=await supabase.rpc('consultar_enlace_operaciones',{p_id:id,p_token:operationToken(),p_tipo:'firma'});
      if(error)throw error;
      const data=result?.contrato;
      if (data) {
        setContract(data);
        setIsSigned(!!data.firma_base64);
      }
    } catch (err) {
      console.error('Excepción al cargar contrato:', err);
      toast.error('No se pudo encontrar el contrato o el enlace es inválido.');
    } finally {
      setLoading(false);
    }
  };

  const mapToContractData = (dbData: any): ContractData => {
    return {
      numero_contrato: dbData.numero_contrato,
      sede: dbData.sede,
      cliente_nombre: dbData.cliente_nombre,
      cliente_documento: dbData.cliente_documento,
      cliente_email: dbData.cliente_email,
      cliente_whatsapp: dbData.cliente_whatsapp,
      cliente_direccion: dbData.cliente_direccion,
      fecha_evento: dbData.fecha_evento,
      valor_total: Number(dbData.valor_total) || 0,
      anticipo: Number(dbData.anticipo) || 0,
      saldo: (Number(dbData.valor_total) || 0) + (Number(dbData.total_arreglos) || 0) - (Number(dbData.anticipo) || 0),
      created_at: dbData.created_at,
      firma_base64: dbData.firma_base64,
      tipo_evento: dbData.tipo_evento,
      fecha_pre_xv: dbData.fecha_pre_xv,
      prexv_componentes: dbData.prexv_componentes,
      prexv_fotografo: dbData.prexv_fotografo,
      prexv_maquilladora: dbData.prexv_maquilladora,
      prexv_locacion: dbData.prexv_locacion,

      fecha_cita_medidas: dbData.fecha_cita_medidas,
      fecha_prueba_final: dbData.fecha_prueba_final,
      fecha_entrega_envio: dbData.fecha_entrega_envio,
      tipo_entrega: dbData.tipo_entrega,
      accesorios: Array.isArray(dbData.accesorios) ? dbData.accesorios : (dbData.accesorios ? [dbData.accesorios] : []),
      arreglos: dbData.arreglos || [],
      total_arreglos: Number(dbData.total_arreglos || 0),
      metodos_pago: dbData.metodos_pago,
      banco_deposito: dbData.banco_deposito,
      tipo_cuenta_deposito: dbData.tipo_cuenta_deposito,
      numero_cuenta_deposito: dbData.numero_cuenta_deposito,
      titular_cuenta_deposito: dbData.titular_cuenta_deposito,
      asesora: dbData.asesora,
      vestidos: dbData.vestidos || [],
      quinceanera_name: dbData.quinceanera_name
    };
  };

  const handleClear = () => {
    sigCanvas.current?.clear();
  };

  const handleSign = async () => {
    if (sigCanvas.current?.isEmpty()) {
      toast.error('Por favor dibuja tu firma en el recuadro antes de aceptar.');
      return;
    }
    
    setSubmitting(true);
    try {
      // Obtener la firma en base64
      const firmaBase64 = sigCanvas.current?.getTrimmedCanvas().toDataURL('image/png');
      
      const {error}=await supabase.rpc('firmar_enlace_operaciones',{p_id:id,p_token:operationToken(),p_tipo:'firma',p_firma:firmaBase64});
      if(error)throw error;

      toast.success('¡Contrato firmado exitosamente!');
      setIsSigned(true);
      
      // Actualizar el estado local para mostrar la firma en el mensaje de agradecimiento
      setContract({ ...contract, firma_base64: firmaBase64 });
      
    } catch (err) {
      console.error('Error al guardar la firma:', err);
      toast.error('Hubo un error al guardar tu firma. Por favor, intenta nuevamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
        <Loader2 className="w-12 h-12 animate-spin text-rose-500 mb-4" />
        <p className="text-gray-600 font-medium text-lg tracking-wide">Cargando documento seguro...</p>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 p-6">
        <div className="bg-white p-8 rounded-2xl shadow-md text-center max-w-sm">
          <p className="text-xl font-bold text-gray-800 mb-2">Enlace no válido</p>
          <p className="text-gray-500">Este contrato no existe o el enlace está corrupto.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-200 pb-20">
      <Toaster position="top-center" richColors />
      
      {/* Visualización del Contrato */}
      <ContractTemplate data={mapToContractData(contract)} />

      {/* Sección Interactiva de Firma */}
      <div className="max-w-4xl mx-auto px-4 sm:px-8 mt-4 md:mt-[-2rem] mb-12 relative z-10">
        <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-10 border border-gray-100/50">
          
          {isSigned ? (
            <div className="text-center py-8 space-y-4">
              <div className="flex justify-center flex-col items-center">
                <CheckCircle className="w-20 h-20 text-emerald-500 mb-4 animate-bounce" />
                <h3 className="text-3xl font-bold text-gray-900 tracking-tight">¡Contrato Firmado!</h3>
              </div>
              <p className="text-gray-600 max-w-md mx-auto text-lg">
                Gracias por confiar en <strong>Ambar Couture</strong>. Hemos registrado e integrado tu firma digital de manera segura.
              </p>
              {contract.firma_base64 && (
                <div className="mt-8 p-6 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50 max-w-sm mx-auto">
                  <p className="text-sm text-gray-400 mb-4 font-semibold uppercase tracking-wider">Registro de Tu Firma</p>
                  <img src={contract.firma_base64} alt="Firma del cliente" className="mx-auto max-h-32 object-contain filter contrast-125" />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              <div className="text-center border-b border-gray-100 pb-6">
                <h3 className="text-2xl font-bold text-gray-900 mb-3 flex items-center justify-center gap-3">
                  <PenTool className="w-6 h-6 text-rose-500" /> Firma Digital Requerida
                </h3>
                <p className="text-gray-500 text-base max-w-xl mx-auto">
                  Al firmar en el recuadro inferior, declaras que has leído detenidamente y aceptas la totalidad 
                  de los términos, condiciones y cláusulas indicadas en el contrato superior.
                </p>
              </div>

              {/* Contenedor del Pad de Firma - Optimizado para Táctil */}
              <div 
                className="border-2 border-rose-200 rounded-2xl bg-[#fafafa] relative overflow-hidden shadow-inner group transition-colors focus-within:border-rose-400 focus-within:ring-4 focus-within:ring-rose-50" 
                style={{ touchAction: 'none' }}
              >
                <div className="absolute top-4 left-4 text-gray-400 text-sm font-medium opacity-50 pointer-events-none flex items-center gap-2">
                  <Eraser className="w-4 h-4" /> Dibuja aquí tu firma
                </div>
                <SignatureCanvas
                  ref={sigCanvas}
                  penColor="#0f172a"
                  canvasProps={{
                    className: "w-full h-72 sm:h-80 cursor-crosshair",
                  }}
                />
              </div>

              {/* Acciones */}
              <div className="flex flex-col gap-4 pt-2">
                {(!contract.vestidos || contract.vestidos.length === 0) && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3 text-amber-800">
                    <AlertCircle className="w-6 h-6 flex-shrink-0" />
                    <p className="font-bold text-sm">
                      No se puede firmar: este contrato no tiene un vestido asignado. 
                      Por favor, contacta con la tienda.
                    </p>
                  </div>
                )}
                
                <div className="flex flex-col sm:flex-row gap-4 justify-end">
                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={submitting}
                    className="flex items-center justify-center gap-2 px-6 py-4 rounded-xl border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-50"
                  >
                    <Eraser className="w-5 h-5" />
                    Limpiar Firma
                  </button>
                  <button
                    type="button"
                    onClick={handleSign}
                    disabled={submitting || !contract.vestidos || contract.vestidos.length === 0}
                    className="flex items-center justify-center gap-2 px-10 py-4 rounded-xl bg-rose-500 text-white font-semibold text-lg hover:bg-rose-600 shadow-lg shadow-rose-200 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:cursor-wait disabled:hover:translate-y-0"
                  >
                    {submitting ? (
                      <span className="flex items-center gap-2 animate-pulse">
                        <Loader2 className="w-5 h-5 animate-spin" /> Procesando firma...
                      </span>
                    ) : (
                      'Firmar y Aceptar Contrato'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

