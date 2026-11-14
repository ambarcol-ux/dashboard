import { includedPrexv, type PrexvData } from '@/lib/prexv';
import type { ContractExtras } from '@/lib/contract-extras';
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { contractOwner } from '@/lib/contract-owner';

interface ContractDataBase extends PrexvData {
  numero_contrato: string;
  numero_factura?: string | null;
  sede: string;
  cliente_nombre: string;
  cliente_documento: string;
  cliente_email: string;
  cliente_whatsapp: string;
  cliente_direccion: string;
  fecha_evento: string;
  valor_total: number;
  anticipo: number;
  saldo: number;
  created_at: string;
  fecha_elaboracion?: string | null;
  firma_base64?: string;

  tipo_evento?: string;
  fecha_pre_xv?: string;
  fecha_cita_medidas?: string;
  fecha_prueba_final?: string;
  fecha_entrega_envio?: string;
  tipo_entrega?: string;

  vestidos?: any[];
  arreglos?: any[];
  total_arreglos?: number;

  accesorios?: string[];
  metodos_pago?: string[];

  banco_deposito?: string;
  tipo_cuenta_deposito?: string;
  numero_cuenta_deposito?: string;
  titular_cuenta_deposito?: string;
  asesora?: string;
  quinceanera_name?: string;
  autoriza_uso_imagen?: boolean;
  bloqueo_especial_referencia?: string | null;
  bloqueo_especial_fecha?: string | null;
  fechas_bloqueo_especial?: string[] | null;
}
// Document type, deposit, discounts, services, retablo and payment methods also go in the signed contract.
export type ContractData = ContractDataBase & ContractExtras;
const DOC_NOMBRE: Record<string, string> = { CC: 'cédula de ciudadanía', TI: 'tarjeta de identidad', CE: 'cédula de extranjería', PA: 'pasaporte', PP: 'pasaporte', PPT: 'permiso por protección temporal', NIT: 'NIT' };
const docNombre = (t?: string | null) => DOC_NOMBRE[String(t || 'CC').toUpperCase()] || String(t);
const docSigla = (t?: string | null) => String(t || 'CC').toUpperCase();

interface ContractTemplateProps {
  data: ContractData;
  plantillas?: any[];
}

export default function ContractTemplate({ data, plantillas: propPlantillas }: ContractTemplateProps) {
  const [plantillas, setPlantillas] = useState<any[]>(propPlantillas || []);

  useEffect(() => {
    if (!propPlantillas || propPlantillas.length === 0) {
      const fetchPlantillas = async () => {
        const { data: pData } = await supabase
          .from('plantillas_contratos')
          .select('*')
          .order('numero_orden', { ascending: true });
        if (pData) setPlantillas(pData);
      };
      fetchPlantillas();
    } else {
      setPlantillas(propPlantillas);
    }
  }, [propPlantillas]);

  const parseContenido = (html: string) => {
    let parsed = html;
    parsed = parsed.replace(/\{\{VALOR_TOTAL\}\}/g, formatCurrency(data.valor_total));
    parsed = parsed.replace(/\{\{ANTICIPO\}\}/g, formatCurrency(data.anticipo));
    parsed = parsed.replace(/\{\{SALDO\}\}/g, formatCurrency(data.saldo));
    parsed = parsed.replace(/\{\{CLIENTE_NOMBRE\}\}/g, data.cliente_nombre ? data.cliente_nombre.toUpperCase() : '');
    parsed = parsed.replace(/\{\{CLIENTE_DOCUMENTO\}\}/g, data.cliente_documento || '');
    parsed = parsed.replace(/\{\{CLIENTE_DIRECCION\}\}/g, data.cliente_direccion || '');
    parsed = parsed.replace(/\{\{FECHA_EVENTO\}\}/g, formatDate(data.fecha_evento));
    parsed = parsed.replace(/\{\{AUTORIZA_IMAGEN_SI\}\}/g, data.autoriza_uso_imagen ? 'X' : ' ');
    parsed = parsed.replace(/\{\{AUTORIZA_IMAGEN_NO\}\}/g, !data.autoriza_uso_imagen ? 'X' : ' ');
    return parsed;
  };
  // Función para formato de moneda (ej: $1.500.000)
  const formatCurrency = (amount: number | string | null | undefined) => {
    const value = Number(amount) || 0;
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  };

  // Función para formatear fechas (ej: 21 de marzo de 2026)
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '—';
      return new Intl.DateTimeFormat('es-CO', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC' // asegurar que no desplace el día si es solo YYYY-MM-DD
      }).format(date);
    } catch {
      return '—';
    }
  };

  // Función para sanear direcciones duplicadas (ej: "torre 5A, torre 5A")
  const sanitizeAddress = (addr: string | null | undefined): string => {
    if (!addr) return '—';
    const parts = addr.split(',').map(p => p.trim()).filter(p => p !== '');
    const uniqueParts = parts.filter((item, index) => parts.indexOf(item) === index);
    return uniqueParts.join(', ');
  };

  return (
    <div className="bg-gray-200 min-h-screen py-10 flex justify-center font-serif text-gray-900">
      {/* 
        ESTIILOS DE SEGURIDAD PARA PDF (Púrga de OKLCH/LAB)
        Tailwind 4 usa oklch() por defecto, lo cual rompe html2canvas.
        Aquí forzamos las variables críticas a HEX estándar.
      */}
      <style dangerouslySetInnerHTML={{
        __html: `
        :root, #hidden-pdf-template {
          --color-gray-900: #111827 !important;
          --color-gray-800: #1f2937 !important;
          --color-gray-700: #374151 !important;
          --color-gray-600: #4b5563 !important;
          --color-gray-500: #6b7280 !important;
          --color-gray-400: #9ca3af !important;
          --color-gray-300: #d1d5db !important;
          --color-gray-200: #e5e7eb !important;
          --color-gray-100: #f3f4f6 !important;
          --color-gray-50: #f9fafb !important;
          --color-rose-500: #f43f5e !important;
          --color-rose-600: #e11d48 !important;
          --color-rose-700: #be123c !important;
          --color-emerald-500: #10b981 !important;
          --color-amber-500: #f59e0b !important;
          --background: #ffffff !important;
          --foreground: #111827 !important;
        }
        * {
          -webkit-print-color-adjust: exact !important;
          color-adjust: exact !important;
          box-shadow: none !important;
        }
      `}} />
      <div className="bg-white w-full max-w-4xl shadow-2xl mx-4 sm:mx-8 md:mx-auto p-12 sm:p-16 md:p-20 leading-relaxed text-justify relative">

        {/* Encabezado Principal - Refactorizado para evitar solapamiento y mayor aire */}
        <div className="flex flex-col md:flex-row justify-between items-center sm:items-start mb-12 border-b-2 border-gray-900 pb-10 pt-4 h-auto relative">
          <div className="text-center md:text-left flex-grow pr-0 md:pr-8">
            <h1 className="text-2xl font-bold uppercase tracking-tight leading-tight mb-1">
              Contrato de Arrendamiento de Bien Mueble y Prestación de Servicios
            </h1>
            <p className="text-lg font-semibold opacity-90 uppercase tracking-[0.2em] text-gray-800">
              Ambar Couture
            </p>
          </div>
          <div className="mt-8 md:mt-0 flex flex-col items-center md:items-end min-w-[180px]">
            <div className="bg-white border-2 border-gray-900 rounded-lg px-4 py-2 shadow-sm text-center">
              <span className="text-[10px] uppercase font-bold text-gray-500 block leading-none mb-1">Documento No.</span>
              <span className="text-base font-black text-gray-900 tracking-wider">
                {data.numero_contrato}
              </span>
            </div>
            {data.numero_factura && <p className="text-sm font-semibold text-gray-900 mt-2 break-all">Factura: {data.numero_factura}</p>}
            <span className="text-[10px] text-gray-400 mt-2 italic font-medium">Validación Original Auténtica</span>
          </div>
        </div>

        {/* Párrafo de Apertura */}
        <p className="mb-6 text-base md:text-lg">
          Entre los suscritos, de una parte, <strong>AMBAR COUTURE</strong>, representada por <strong>{contractOwner(data.sede).nombre.toUpperCase()}</strong>,
          identificado(a) con cédula de ciudadanía No. <strong>{contractOwner(data.sede).cedula}</strong>,
          con domicilio en {contractOwner(data.sede).ciudad}, Colombia, de aquí en adelante llamada <strong>EL PRESTADOR/ARRENDADOR</strong>,
          y de la otra, <strong>{data.cliente_nombre.toUpperCase()}</strong>, identificado(a) con
          {docNombre(data.tipo_documento_cliente)} No. <strong>{data.cliente_documento}</strong>, con domicilio en <strong>{data.cliente_direccion}</strong>,
          de aquí en adelante llamado(a) <strong>EL CONTRATANTE/ARRENDATARIO</strong>, hemos acordado celebrar este contrato mixto.
          Este se regirá por las siguientes cláusulas y, en lo que no esté aquí previsto, por lo que dice el Código Civil Colombiano sobre
          el arriendo de cosas muebles y las normas generales de los contratos:
        </p>

        {/* --- ERP SUMMARY BOX --- */}
        <div className="my-8 border-2 border-gray-900 p-6 rounded text-sm text-left shadow-sm bg-gray-50/30">
          <h2 className="font-bold text-base mb-4 uppercase border-b border-gray-900 pb-1 flex justify-between">
            <span>Anexo Técnico del Servicio</span>
            <span className="text-gray-500 text-xs mt-1">Ref Principal: {(data.vestidos && data.vestidos.length > 0) ? (data.vestidos[0].vestido?.codigo || data.vestidos[0].vestido?.codigo_referencia || '—') : '—'}</span>
          </h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <div className="col-span-2 sm:col-span-1 border-b sm:border-b-0 sm:border-r border-dashed border-gray-400 pb-2 sm:pb-0 sm:pr-4">
              <strong>Tipo de Servicio:</strong> {
                data.tipo_evento === 'Evento' ? 'alquiler de vestido destinado exclusivamente para evento' :
                  data.tipo_evento === 'PreXV' ? 'alquiler de vestido destinado exclusivamente para sesión prexv' :
                    data.tipo_evento === 'Ambos' ? 'servicio de alquiler de vestido para evento y sesión prexv' :
                      (data.tipo_evento || '—')
              } <br />

              {data.tipo_evento === 'PreXV' ? (
                <>
                  <strong className="text-amber-700 block mt-2">Día de Fotos / Entrega: {formatDate(data.fecha_evento)}</strong>
                </>
              ) : (
                <>
                  <strong>Día del Evento:</strong> {formatDate(data.fecha_evento)} <br />
                  {(data.tipo_evento === 'PreXV' || data.tipo_evento === 'Ambos') && (
                    <div className="mt-1 border-t border-gray-200 pt-1">
                      <strong>P. Fotografía:</strong> {formatDate(data.fecha_pre_xv)}<br />
                    </div>
                  )}
                </>
              )}
            </div>
            {data.prexv_componentes && data.prexv_componentes.length > 0 && <div className="col-span-2 border-t pt-2">
              <strong>Servicios PRE-XV contratados · {formatDate(data.fecha_pre_xv || '')}</strong>
              {includedPrexv(data).map(service => <div key={service.id}>{service.label}: {data[service.name] || 'Por asignar'}</div>)}
            </div>}
            {Array.isArray(data.fechas_bloqueo_especial) && data.fechas_bloqueo_especial.length > 0 && (
              <div className="col-span-2 border-t border-amber-300 bg-amber-50/70 p-3 rounded mt-1">
                <strong className="uppercase text-amber-800 block mb-1">Bloqueo fechas especiales</strong>
                <div className="text-xs mb-2">
                  <strong>Referencias bloqueadas:</strong>{' '}
                  {(data.vestidos && data.vestidos.length > 0)
                    ? data.vestidos.map(v => v.vestido?.codigo || '—').join(' · ')
                    : '—'}
                </div>
                {Array.from(new Set(data.fechas_bloqueo_especial)).sort().map(fecha => (
                  <div key={fecha}>• {formatDate(fecha)}</div>
                ))}
              </div>
            )}
            {data.bloqueo_especial_referencia && data.bloqueo_especial_fecha && (
              <div className="col-span-2 border-t border-amber-300 bg-amber-50/70 p-3 rounded mt-1">
                <strong className="uppercase text-amber-800">Bloqueo fecha especial:</strong>{' '}
                <span className="font-bold">{data.bloqueo_especial_referencia}</span>
                {' · '}
                <span>{formatDate(data.bloqueo_especial_fecha)}</span>
              </div>
            )}
            <div className="col-span-2 sm:col-span-1 pl-0 sm:pl-2">
              <strong>Accesorios Inclusivos:</strong> {data.accesorios && data.accesorios.length > 0 ? data.accesorios.join(', ') : '—'}<br />
              <strong>Asesora a Cargo:</strong> {data.asesora || '—'}<br />

              <div className="mt-2 border-t border-gray-200 pt-2 text-xs">
                <strong className="block mb-1 text-sm">Referencias Asignadas:</strong>
                <ul className="list-disc pl-4 space-y-1 border-l-2 border-gray-300 ml-1">
                  {(data.vestidos && data.vestidos.length > 0) ? (
                    data.vestidos.map((v, i) => (
                      <li key={i}>
                        <span className="font-bold">{v.vestido?.codigo || '—'}</span> - {v.tipo_uso || '—'}
                        {v.observaciones && v.observaciones.trim() !== '' && (
                          <span className="block text-[10px] italic text-gray-500">Nota: {v.observaciones}</span>
                        )}
                      </li>
                    ))
                  ) : (
                    <li className="italic text-gray-500">— No hay prendas registradas —</li>
                  )}
                </ul>
              </div>
            </div>
            <div className="col-span-2 mt-2 pt-2 border-t border-dashed border-gray-400 grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1 border-b sm:border-b-0 sm:border-r border-dashed border-gray-400 pb-2 sm:pb-0 sm:pr-4">
                <strong>Cita Medidas:</strong> {formatDate(data.fecha_cita_medidas)} <br />
                <strong>Prueba Final:</strong> {formatDate(data.fecha_prueba_final)} <br />
                {data.tipo_evento !== 'PreXV' && (
                  <><strong>Entrega {data.tipo_entrega === 'Nacional' ? '(Nacional)' : '(Local)'}:</strong> {formatDate(data.fecha_entrega_envio)}</>
                )}
              </div>
              <div className="col-span-2 sm:col-span-1 pl-0 sm:pl-2">
                <strong>Valor Alquiler Base:</strong> {formatCurrency(data.valor_total)}<br />
                <strong>Servicio Arreglos:</strong> {formatCurrency(data.total_arreglos || 0)}<br />
                <strong>Abono Confirmado:</strong> {formatCurrency(data.anticipo)}<br />
                <strong className="text-gray-900 border-t border-gray-300 block mt-1 pt-1 text-base">SALDO PENDIENTE: {formatCurrency(data.saldo)}</strong>
              </div>
            </div>
            {data.arreglos && data.arreglos.length > 0 && (
              <div className="col-span-2 mt-2 pt-2 border-t border-dashed border-gray-400 text-xs text-gray-800">
                <strong className="text-gray-900 font-bold">Modificaciones Aprobadas:</strong> {data.arreglos.map((a: any) => `${a.tipo || '—'} (${a.cm ? a.cm + 'cm' : '—'} → $${a.precio || 0})`).join(' | ')}
              </div>
            )}
            {((data.descuento_promocion || 0) > 0 || (data.descuento_aliado || 0) > 0) && (
              <div className="col-span-2 mt-2 pt-2 border-t border-dashed border-gray-400 text-xs text-gray-800">
                <strong className="text-gray-900 font-bold">Descuentos aplicados (ya incluidos en el valor):</strong>{' '}
                {[(data.descuento_promocion || 0) > 0 ? `Promoción ${formatCurrency(data.descuento_promocion || 0)}` : null, (data.descuento_aliado || 0) > 0 ? `Aliado ${formatCurrency(data.descuento_aliado || 0)}` : null].filter(Boolean).join(' | ')}
              </div>
            )}
            {((data.servicios_contrato && data.servicios_contrato.length > 0) || data.retablo_valor != null) && (
              <div className="col-span-2 mt-2 pt-2 border-t border-dashed border-gray-400 text-xs text-gray-800">
                <strong className="text-gray-900 font-bold">Servicios adicionales:</strong>{' '}
                {[...(data.servicios_contrato || []).map(s => `${s.nombre} ${formatCurrency(s.valor)}`), data.retablo_valor != null ? `Retablo ${data.retablo_valor ? formatCurrency(data.retablo_valor) : ''}`.trim() : null].filter(Boolean).join(' | ')}
              </div>
            )}
            {data.metodos_pago_lista && data.metodos_pago_lista.length > 0 && (
              <div className="col-span-2 mt-2 pt-2 border-t border-dashed border-gray-400 text-xs text-gray-800">
                <strong className="text-gray-900 font-bold">Medio de pago del abono:</strong> {data.metodos_pago_lista.join(', ')}
              </div>
            )}
            {((data.valor_deposito || 0) > 0 || data.banco_deposito || data.numero_cuenta_deposito) && (
              <div className="col-span-2 mt-3 p-3 border border-gray-400 rounded text-xs text-gray-800">
                <strong className="text-gray-900 font-bold uppercase">Depósito de garantía</strong><br />
                {data.medio_deposito === 'En la entrega'
                  ? <><strong>Valor a pagar el día de la entrega del vestido:</strong> {formatCurrency(data.valor_deposito || 0)} (no hace parte del valor del alquiler ni del abono). Sin este pago no se entrega el vestido.<br /></>
                  : <><strong>Valor recibido:</strong> {formatCurrency(data.valor_deposito || 0)}{data.medio_deposito ? ` en ${data.medio_deposito.toLowerCase()}` : ''} (no hace parte del valor del alquiler ni del abono).<br /></>}
                {data.banco_deposito === 'Efectivo' ? <><strong>Devolución:</strong> en efectivo en la tienda.<br /></> : <><strong>Cuenta o llave para la devolución:</strong> {data.banco_deposito || '—'} · {data.tipo_cuenta_deposito || '—'} · {data.numero_cuenta_deposito || '—'}<br /></>}
                <strong>Titular:</strong> {data.titular_cuenta_deposito || '—'}{data.documento_titular ? ` · ${docSigla(data.tipo_documento_titular)} ${data.documento_titular}` : ''}<br />
                La devolución se programa dentro de las 72 horas siguientes a la devolución del vestido, previa inspección; de ella se descuentan los daños o la mora según las cláusulas de este contrato.
              </div>
            )}
          </div>
        </div>

        {/* Sección de Información del Cliente y del Alquiler */}
        <div className="mb-10 p-6 bg-gray-50 border border-gray-300 rounded-lg shadow-sm">
          <h2 className="text-xl font-bold mb-4 border-b border-gray-300 pb-2">
            Información del Cliente y del Alquiler
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8 text-base">
            <div className="md:col-span-2 bg-rose-50/50 p-2 rounded-lg border border-rose-100 mb-2">
              <span className="font-semibold block text-rose-800 text-xs uppercase tracking-widest">Beneficiaria (Quinceañera):</span>
              <span className="uppercase text-gray-900 font-black text-lg">{data.quinceanera_name || '—'}</span>
            </div>
            <div>
              <span className="font-semibold block text-gray-700">Nombre del Contratante:</span>
              <span className="uppercase text-gray-900 font-bold">{data.cliente_nombre || '—'}</span>
            </div>
            <div>
              <span className="font-semibold block text-gray-700">Documento de Identidad:</span>
              <span className="text-gray-900">{docSigla(data.tipo_documento_cliente)} {data.cliente_documento || '—'}</span>
            </div>
            <div>
              <span className="font-semibold block text-gray-700">Celular / WhatsApp:</span>
              <span className="text-gray-900">{data.cliente_whatsapp || '—'}</span>
            </div>
            <div>
              <span className="font-semibold block text-gray-700">Email:</span>
              <span className="text-gray-900">{data.cliente_email || '—'}</span>
            </div>
            <div className="md:col-span-2">
              <span className="font-semibold block text-gray-700">Dirección de Residencia:</span>
              <span className="text-gray-900">{sanitizeAddress(data.cliente_direccion)}</span>
            </div>
            <div className="md:col-span-2 mt-4 pt-4 border-t border-gray-300"></div>
            <div>
              <span className="font-semibold block text-gray-700">Sede de Contratación:</span>
              <span className="font-bold">{data.sede}</span>
            </div>
          </div>
        </div>

        {/* Cláusulas del Contrato */}
        <h2 className="text-xl font-bold mb-6 text-center underline tracking-wide">CLÁUSULAS</h2>

        <div className="space-y-6 text-base md:text-lg">
          {plantillas.length === 0 ? (
            <div className="text-center text-gray-500 py-10" id="loading-contrato">Cargando cláusulas del contrato...</div>
          ) : (
            plantillas.map((plantilla) => {
              // Filtrado condicional: Solo mostrar cláusulas PreXV si aplica
              if (plantilla.titulo.includes('[PreXV]') && data.tipo_evento !== 'PreXV' && data.tipo_evento !== 'Ambos') {
                return null;
              }
              
              const tituloLimpio = plantilla.titulo.replace('[PreXV] ', '');
              
              return (
                <div key={plantilla.id} className="space-y-2 text-justify">
                  {tituloLimpio && (
                    <p><strong>{tituloLimpio}</strong></p>
                  )}
                  <div 
                    className="space-y-4"
                    dangerouslySetInnerHTML={{ __html: parseContenido(plantilla.contenido) }} 
                  />
                </div>
              );
            })
          )}
        </div>

        {/* Firmas - Refactorizadas a 2 columnas con efecto de estampado y prevención de salto de página */}
        <div className="mt-12 pt-6 flex justify-around items-end gap-16" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
          <div className="text-center w-full max-w-[300px] flex flex-col items-center">
            <div className="flex justify-center items-center h-20 -mb-8 z-10 relative">
              {contractOwner(data.sede).firma && <img
                src={contractOwner(data.sede).firma}
                alt={`Firma ${contractOwner(data.sede).nombre}`}
                className="max-h-[130%] w-auto object-contain"
              />}
            </div>
            <div className="border-t-2 border-black pt-2">
              <p className="font-extrabold text-sm uppercase">FIRMA DEL PRESTADOR/ARRENDADOR</p>
              <p className="font-bold text-sm">AMBAR COUTURE</p>
              <p className="text-xs">{contractOwner(data.sede).nombre}</p>
              <p className="text-xs">Cédula #{contractOwner(data.sede).cedula}</p>
            </div>
          </div>

          {/* FIRMA CONTRATANTE */}
          <div className="text-center w-full max-w-[300px]">
            <div className="flex justify-center items-center h-20 mb-2">
              {data.firma_base64 ? (
                <img src={data.firma_base64} alt="Firma del cliente" className="max-h-full w-auto object-contain mix-blend-multiply" />
              ) : (
                <div className="h-full"></div>
              )}
            </div>
            <div className="border-t-2 border-black pt-2">
              <p className="font-extrabold text-sm uppercase leading-none mb-1">FIRMA DEL CONTRATANTE</p>
              <p className="font-bold text-sm uppercase tracking-tight">{data.cliente_nombre}</p>
              <p className="text-xs">{docSigla(data.tipo_documento_cliente)} {data.cliente_documento}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 text-center text-xs text-gray-500 font-sans border-t border-gray-200 pt-6">
          <p>Documento generado el {formatDate(data.fecha_elaboracion || data.created_at)}</p>
          <p className="mt-1">Ambar Couture © {new Date().getFullYear()} - Todos los derechos reservados.</p>
        </div>

      </div>
    </div>
  );
}
