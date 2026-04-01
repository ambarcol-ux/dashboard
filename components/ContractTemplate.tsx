import React from 'react';

export interface ContractData {
  numero_contrato: string;
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
}

interface ContractTemplateProps {
  data: ContractData;
}

export default function ContractTemplate({ data }: ContractTemplateProps) {
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
      <style dangerouslySetInnerHTML={{ __html: `
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
            <span className="text-[10px] text-gray-400 mt-2 italic font-medium">Validación Original Auténtica</span>
          </div>
        </div>

        {/* Párrafo de Apertura */}
        <p className="mb-6 text-base md:text-lg">
          Entre los suscritos, de una parte, <strong>AMBAR COUTURE</strong>, sociedad legalmente constituida, 
          con domicilio en Villavicencio, Meta, Colombia, de aquí en adelante llamada <strong>EL PRESTADOR/ARRENDADOR</strong>, 
          y de la otra, <strong>{data.cliente_nombre.toUpperCase()}</strong>, identificado(a) con cédula 
          de ciudadanía No. <strong>{data.cliente_documento}</strong>, con domicilio en <strong>{data.cliente_direccion}</strong>, 
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
                <strong>Tipo de Servicio:</strong> {data.tipo_evento === 'PreXV' ? 'Fotografía Pre-XV' : (data.tipo_evento || '—')} <br/>
                
                {data.tipo_evento === 'PreXV' ? (
                  <>
                    <strong className="text-amber-700 block mt-2">Día de Fotos / Entrega: {formatDate(data.fecha_evento)}</strong>
                  </>
                ) : (
                  <>
                    <strong>Día del Evento:</strong> {formatDate(data.fecha_evento)} <br/>
                    {data.tipo_evento !== 'Evento' && (
                      <div className="mt-1 border-t border-gray-200 pt-1">
                      <strong>P. Fotografía:</strong> {formatDate(data.fecha_pre_xv)}<br/>
                      </div>
                    )}
                  </>
                )}
             </div>
             <div className="col-span-2 sm:col-span-1 pl-0 sm:pl-2">
                <strong>Accesorios Inclusivos:</strong> {data.accesorios && data.accesorios.length > 0 ? data.accesorios.join(', ') : '—'}<br/>
                <strong>Asesora a Cargo:</strong> {data.asesora || '—'}<br/>
                
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
                   <strong>Cita Medidas:</strong> {formatDate(data.fecha_cita_medidas)} <br/>
                   <strong>Prueba Final:</strong> {formatDate(data.fecha_prueba_final)} <br/>
                   {data.tipo_evento !== 'PreXV' && (
                     <><strong>Entrega {data.tipo_entrega === 'Nacional' ? '(Nacional)' : '(Local)'}:</strong> {formatDate(data.fecha_entrega_envio)}</>
                   )}
                </div>
                <div className="col-span-2 sm:col-span-1 pl-0 sm:pl-2">
                  <strong>Valor Alquiler Base:</strong> {formatCurrency(data.valor_total)}<br/>
                  <strong>Servicio Arreglos:</strong> {formatCurrency(data.total_arreglos || 0)}<br/>
                  <strong>Abono Confirmado:</strong> {formatCurrency(data.anticipo)}<br/>
                  <strong className="text-gray-900 border-t border-gray-300 block mt-1 pt-1 text-base">SALDO PENDIENTE: {formatCurrency(data.saldo)}</strong>
                </div>
             </div>
             {data.arreglos && data.arreglos.length > 0 && (
                <div className="col-span-2 mt-2 pt-2 border-t border-dashed border-gray-400 text-xs text-gray-800">
                  <strong className="text-gray-900 font-bold">Modificaciones Aprobadas:</strong> {data.arreglos.map((a: any) => `${a.tipo || '—'} (${a.cm ? a.cm+'cm' : '—'} → $${a.precio || 0})`).join(' | ')}
                </div>
             )}
             {(data.banco_deposito || data.numero_cuenta_deposito) && (
                <div className="col-span-2 mt-2 text-xs italic text-gray-600 font-medium border-t border-gray-200 pt-1">
                  * Depósito de garantía asociado a {data.banco_deposito || '—'} {data.tipo_cuenta_deposito || '—'} {data.numero_cuenta_deposito || '—'} ({data.titular_cuenta_deposito || '—'}).
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
              <span className="text-gray-900">{data.cliente_documento || '—'}</span>
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
          <p>
            <strong>PRIMERA. Objeto del Contrato:</strong> <strong>EL PRESTADOR/ARRENDADOR</strong> se compromete a entregar en arriendo a <strong>EL CONTRATANTE/ARRENDATARIO</strong> la prenda que se describe en la sección "Información del Cliente y del Alquiler" de este documento. Así mismo, <strong>EL PRESTADOR/ARRENDADOR</strong> se compromete a prestar los servicios asociados a este arriendo, como las <strong>citas para tomar medidas y las pruebas finales para alquiler de fiesta o evento</strong>. En el caso de <strong>Alquiler Pre XV</strong>, también coordinará las fechas y horas para las fotos y el maquillaje. La prenda se entrega en perfecto estado y limpia, a menos que se anote algo distinto en la sección de "Observaciones".
          </p>
          <p>
            <strong>SEGUNDA. Precio y Forma de Pago:</strong> El valor total por el arriendo de la prenda y los servicios 
            asociados es el que se indica en la sección &lsquo;Total Alquiler&rsquo; de este contrato (<strong>{formatCurrency(data.valor_total)}</strong>). 
            EL CONTRATANTE/ARRENDATARIO se compromete a pagar ese valor según el "Método de Pago" y los "Abonos" y "Saldos" que allí se especifican.
          </p>
          <p>
            <strong>TERCERA. Depósito en Garantía:</strong> Para asegurar que se cumplan las obligaciones de este contrato y 
            para proteger la prenda arrendada, EL CONTRATANTE/ARRENDATARIO entrega a EL PRESTADOR/ARRENDADOR un depósito 
            en garantía por valor de $100.000, $200.000, $300.000, $400.000 o $500.000, dependiendo del alquiler. 
            Este depósito solo se puede hacer por transferencia. El depósito se le devolverá a EL CONTRATANTE/ARRENDATARIO 
            en un plazo de 72 horas una vez la prenda regrese a la tienda y se verifique que está en perfectas condiciones. Si se presenta alguna novedad o daño, el depósito se retendrá por <strong>6 días hábiles</strong> mientras se valoran los daños, y se le informarán los descuentos pertinentes, los cuales <strong>EL CONTRATANTE/ARRENDATARIO</strong> autoriza a ser descontados de dicho depósito.
          </p>
          <div>
            <p className="mb-2"><strong>CUARTA. Plazo del Arrendamiento y Duración de los Servicios Asociados:</strong></p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Para Alquiler General:</strong> El arriendo de la prenda será por <strong>cinco (5) días calendario,</strong> contados desde el día de su entrega a <strong>EL CONTRATANTE/ARRENDATARIO o a quien este designe formalmente mediante autorización o delegación por escrito para recibir la prenda, documento que se anexará al presente contrato.</strong>
              </li>
              <li>
                <strong>Para Alquiler Pre XV:</strong> El arriendo de la prenda será por el <strong>tiempo que duren las fotos programadas.</strong> Si al terminar este periodo no se devuelve la prenda, se cobrará el valor total del alquiler.
              </li>
            </ul>
          </div>
          <div>
            <p className="mb-2"><strong>QUINTA. Obligaciones de EL CONTRATANTE/ARRENDATARIO:</strong></p>
            <ul className="list-disc pl-6 space-y-2">
              <li>No hacerle ninguna modificación a la prenda por fuera de <strong>AMBAR COUTURE</strong>. <strong>EL PRESTADOR/ARRENDADOR</strong> es el único autorizado para hacer cualquier arreglo o modificación.</li>
              <li>Devolver la prenda en la fecha acordada. Para el alquiler general, por cada día de retraso en la devolución, se cobrará una multa de <strong>$100.000</strong>, la cual se descontará del depósito en garantía. Para el alquiler <strong>Pre XV</strong>, si al terminar el tiempo de duración de las fotos no se devuelve la prenda, se cobrará la tarifa plena.</li>
              <li>Entregar la prenda sucia. Sin embargo, si la prenda tiene una mancha o daño que no se pueda quitar al momento de la devolución, la prenda se retendrá y se enviará a lavandería. Una vez se verifique que la prenda está en perfectas condiciones después del lavado, se hará el reembolso del depósito.</li>
              <li>Pagar el valor total de la prenda en caso de pérdida total o daños graves que impidan que se pueda volver a alquilar.</li>
              <li>Pagar el saldo pendiente en caso de que los daños a la prenda sean más costosos que el depósito en garantía.</li>
              <li>Asumir los costos adicionales por domicilios o envíos que se deban hacer, ya que <strong>AMBAR COUTURE</strong> no se hace responsable de estos.</li>
              <li>Asumir una penalidad de <strong>$30.000 por cambio vestido</strong>, cuando este cambio sea de segunda vez que se solicita en el alquiler general o para evento. Para el alquiler <strong>Pre XV</strong>, esta penalidad es de <strong>$50.000</strong>.</li>
              <li>Avisar con mínimo <strong>30 días de anticipación</strong> cualquier cambio de fecha o de vestido, los cuales estarán sujetos a la disponibilidad de <strong>AMBAR COUTURE</strong>.</li>
              <li>Se recomienda el <strong>no uso de ningún tipo de pólvora</strong>, es la principal causa de daños en los vestidos, llegando a pérdida total, que le genera al cliente la reposición total del mismo.</li>
              <li>Asumir los costos de transporte y desplazamiento de la prenda y de <strong>LA QUINCEAÑERA</strong> al lugar donde se realice la sesión fotográfica o actividad <strong>Pre XV</strong>, cuando dicha sesión se lleve a cabo por fuera de las instalaciones de <strong>AMBAR COUTURE</strong>. En consecuencia, el transporte hacia y desde el lugar de la sesión será asumido exclusivamente por <strong>EL CONTRATANTE/ARRENDATARIO</strong>, y <strong>AMBAR COUTURE</strong> no se hace responsable de la logística, costos, coordinación ni riesgos asociados a dicho desplazamiento.</li>
            </ul>
          </div>
          <div className="space-y-4">
            <p>
              <strong>SEXTA. Condiciones de Reembolso y Desistimiento:</strong> En caso de que <strong>EL CONTRATANTE/ARRENDATARIO</strong> decida no continuar con el alquiler y solicite un reembolso, <strong>EL PRESTADOR/ARRENDADOR</strong> descontará <strong>$100.000</strong> por cada cita de reserva realizada, de acuerdo con el siguiente detalle:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Cita de primera vez (selección de vestido)</li>
              <li>Cita de medidas de selección</li>
              <li>Cita de prueba final de vestido</li>
            </ul>
            <p>
              Es importante destacar que, en el caso de que <strong>EL CONTRATANTE/ARRENDATARIO</strong> solicite y utilice más de una cita, el cobro de <strong>$100.000</strong> se aplicará por cada una de las citas utilizadas. Si solo se utiliza la cita de primera vez, únicamente se cobrará esa cantidad. El cobro se efectuará por cada etapa completada del proceso, es decir, si se realizan las tres citas, se cobrará el total de <strong>$300.000</strong>, más el valor de los arreglos que se hayan hecho a la prenda, si aplica.
            </p>

            <p>
              <strong>PARÁGRAFO PRIMERO. NATURALEZA COMPENSATORIA.</strong><br />
              Las retenciones, cobros y valores establecidos en el presente contrato no constituyen sanciones, sino compensaciones económicas razonables, destinadas a cubrir costos administrativos, operativos, logísticos, de agenda, personal, ajustes, uso de la prenda y pérdida de oportunidad comercial en que incurre <strong>EL PRESTADOR/ARRENDADOR</strong>.
            </p>

            <p>
              <strong>PARÁGRAFO SEGUNDO – PROCEDIMIENTO Y PLAZOS</strong><br />
              Toda solicitud de desistimiento deberá presentarse por escrito a través de los canales oficiales de la empresa. <strong>AMBAR COUTURE</strong> (ambarcouturedresses@gmail.com) dará respuesta dentro de un plazo máximo de cinco (5) días hábiles indicando la procedencia conforme a lo pactado en el presente contrato.<br />
              En caso de proceder la devolución, esta se realizará dentro de los quince (15) días hábiles siguientes a la aceptación escrita, una vez aplicadas las deducciones contractuales correspondientes. La devolución se efectuará por el mismo medio de pago utilizado o mediante transferencia a la cuenta certificada informada por el cliente.
            </p>

            <p>
              <strong>PARÁGRAFO TERCERO – RESERVA DE AGENDA DE SERVICIOS ASOCIADOS</strong><br />
              Cuando el servicio contratado incluya la participación de proveedores o recursos que requieren reserva previa de agenda, tales como fotógrafo, maquillaje, peinado, caballos u otros servicios asociados a la sesión <strong>PRE XV</strong>, <strong>EL CONTRATANTE/ARRENDATARIO</strong> reconoce que dichos servicios requieren la separación previa de fecha y disponibilidad.<br />
              Para garantizar dicha disponibilidad, <strong>EL CONTRATANTE/ARRENDATARIO</strong> deberá realizar un pago por concepto de reserva de agenda, cuyos valores serán los siguientes:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Reserva de fotógrafo: <strong>$70.000</strong></li>
              <li>Reserva de maquillaje y peinado: <strong>$40.000</strong></li>
            </ul>
          </div>
          <p>
            <strong>SÉPTIMA. Arreglos:</strong> Los arreglos no están incluidos en el precio del alquiler cuando se obtiene 
            un descuento o promoción.
          </p>
          <div className="space-y-4">
            <p><strong>OCTAVA. CONDICIONES ESPECÍFICAS PARA LA RECEPCIÓN, DESISTIMIENTO Y NO ACEPTACIÓN DE VESTIDOS DE “ESTRENO” O IMPORTADOS</strong></p>
            <p>
              <strong>EL CONTRATANTE/ARRENDATARIO</strong> reconoce que la mayoría de los vestidos de alquiler de <strong>EL PRESTADOR/ARRENDADOR</strong> ya han tenido una o más posturas. Sin embargo, en los casos en que se acuerde expresamente que el servicio de alquiler de un vestido de quince (15) años se presta bajo la modalidad de “estreno”, uso exclusivo para la quinceañera en su evento, o cuando el vestido sea importado, mandado a elaborar o confeccionado con base en fotografías, referencias visuales o indicaciones específicas proporcionadas por <strong>EL CONTRATANTE/ARRENDATARIO</strong>, se aplicarán las siguientes condiciones especiales.
            </p>
            <p>
              Se entiende y acepta que, por la naturaleza de los procesos de importación, confección e elaboración a partir de referencias visuales, las fotografías o imágenes de referencia pueden no ser idénticas al vestido final, pudiendo existir variaciones razonables en tonos, texturas, brillos, materiales o detalles menores, lo cual es expresamente aceptado por <strong>EL CONTRATANTE/ARRENDATARIO</strong>.
            </p>
            <p>
              Dada esta particularidad, el carácter personalizado del servicio, la exclusividad del “estreno” cuando aplique, la naturaleza del bien como prenda de vestir para un evento único y de uso personal, así como los preparativos, ajustes, gestiones administrativas y costos en que incurre <strong>EL PRESTADOR/ARRENDADOR</strong>, se establecen las siguientes condiciones:
            </p>
            <p>
              <strong>• Derecho de desistimiento con antelación mínima</strong><br />
              <strong>EL CONTRATANTE/ARRENDATARIO</strong> podrá manifestar su desistimiento o arrepentimiento por cualquier motivo, únicamente cuando dicha manifestación se realice con una antelación igual o superior a dos (2) meses respecto de la fecha programada de entrega del vestido.
            </p>
            <p>
              En este caso, <strong>EL PRESTADOR/ARRENDADOR</strong> efectuará la devolución de las sumas pagadas, reteniendo el veinte por ciento (20%) del valor total del paquete contratado, valor que las partes reconocen corresponde a gastos administrativos, operativos, de asesoría, gestión del pedido, separación de agenda y demás costos internos ya causados, sin que dicho cobro tenga carácter de sanción.
            </p>
            <p>
              <strong>• Improcedencia del desistimiento dentro de los dos (2) meses previos a la entrega</strong><br />
              Si <strong>EL CONTRATANTE/ARRENDATARIO</strong> manifiesta su intención de desistir dentro de los dos (2) meses previos a la fecha de entrega programada, esto es, cuando falte menos de dicho término (por ejemplo, un (1) mes, cuarenta (40) días, treinta (30) días u otro plazo inferior), no procederá el desistimiento, retracto ni cancelación del contrato, aun cuando el vestido no haya sido entregado físicamente.
            </p>
            <p>
              En este escenario, <strong>EL CONTRATANTE/ARRENDATARIO</strong> se obliga a recibir el vestido y continuar con la ejecución del contrato, sin que haya lugar a devoluciones parciales o totales del dinero pagado.
            </p>
            <p>
              <strong>• Revisión y aceptación en la entrega</strong><br />
              <strong>EL CONTRATANTE/ARRENDATARIO</strong> y <strong>LA QUINCEAÑERA</strong> se comprometen a revisar el vestido y los accesorios en el momento de la entrega final, verificando que corresponde al modelo seleccionado, aceptando las variaciones propias del proceso, y constatando que cumple con los ajustes acordados.
            </p>

            <p>
              <strong>• Improcedencia de retracto o devolución por “no gusto”</strong><br />
              Una vez el vestido haya sido entregado al cliente por parte del <strong>EL PRESTADOR/ARRENDADOR</strong>, no procederá el derecho de retracto ni la devolución del dinero por razones subjetivas tales como “ya no me gusta”, “me arrepentí” o “no era lo que esperaba” u otras no objetivas.
            </p>

            <p>
              <strong>• Garantía legal</strong><br />
              Lo anterior no limita el derecho del <strong>EL CONTRATANTE/ARRENDATARIO</strong> a la garantía legal, conforme a la Ley 1480 de 2011, cuando exista un defecto objetivo de calidad, idoneidad o un incumplimiento imputable a <strong>EL PRESTADOR/ARRENDADOR</strong>.
            </p>

            <p>
              <strong>• Incumplimiento injustificado del cliente</strong><br />
              Si, sin existir causal de garantía legal, <strong>EL CONTRATANTE/ARRENDATARIO</strong> decide no recibir o no hacer uso del vestido una vez cumplidas las condiciones anteriores, <strong>EL PRESTADOR/ARRENDADOR</strong> retendrá el cien por ciento (<strong>100%</strong>) del valor total del paquete contratado, atendiendo al carácter personalizado del servicio y a la imposibilidad de reasignar el vestido.
            </p>

            <p>
              <strong>PARÁGRAFO PRIMERO – DISPONIBILIDAD DEL VESTIDO DE ESTRENO O IMPORTADO</strong><br />
              En los casos de vestidos contratados bajo la modalidad de alquiler estreno, importado o elaborado bajo pedido, <strong>EL CONTRATANTE/ARRENDATARIO</strong> reconoce y acepta que la prenda podrá estar disponible en las instalaciones de <strong>AMBAR COUTURE</strong> en un plazo aproximado de hasta quince (15) días calendario antes de la fecha programada de entrega o del evento, una vez finalizados los procesos logísticos de adquisición, importación, transporte, recepción, verificación de calidad, ajustes y preparación de la prenda.<br />
              En consecuencia, <strong>EL CONTRATANTE/ARRENDATARIO</strong> entiende y acepta que el vestido no necesariamente estará disponible para visualización o prueba con mayor anticipación, sin que ello constituya incumplimiento del presente contrato.
            </p>

            <p>
              <strong>PARAGRAFO SEGUNDO: ANTICIPO PARA PROCESO DE ADQUISICIÓN DEL VESTIDO “ESTRENO”.</strong><br />
              Cuando el vestido contratado corresponda a la modalidad de alquiler “estreno”, importación o adquisición especial para la cliente, <strong>EL CONTRATANTE/ARRENDATARIO</strong> deberá cancelar como mínimo el ochenta por ciento (<strong>80%</strong>) del valor total del contrato al momento de la firma del mismo, requisito indispensable para que <strong>AMBAR COUTURE</strong> inicie el proceso de pedido, adquisición, importación, confección o gestión logística del vestido.<br />
              Este anticipo se justifica en que el vestido será gestionado o producido específicamente para la cliente, generando compromisos económicos inmediatos con proveedores, procesos de producción, transporte y logística.
            </p>
          </div>
          <div className="space-y-4 text-justify">
            <p><strong>NOVENA. Accesorios (Cojines, Aros, Tiaras, Corbatas, Corbatinas, Zapatos, Camisas):</strong></p>
            <p>
              Queda claro que los accesorios anteriormente mencionados son elementos complementarios incluidos sin costo adicional dentro del servicio principal de arriendo del vestido y no constituyen un bien objeto de arrendamiento independiente ni generan derecho a reclamación específica.
            </p>
            <p>
              Debido a su naturaleza, uso recurrentes y la alta probabilidad de presentar desgaste, daños o variaciones en su estado, <strong>EL PRESTADOR/ARRENDADOR</strong> no garantiza la disponibilidad ni las condiciones del accesorio específico seleccionado al momento de la contratación para la fecha del evento.
            </p>
            <p>
              Por lo anterior, <strong>EL CONTRATANTE/ARRENDATARIO</strong> acepta que la selección definitiva de los accesorios se realizará el día de la cita de toma de medidas, fecha más cercana al evento, en la cual se contará con mayor disponibilidad real de opciones, sin que ello dé lugar a cambios, descuentos, devoluciones, compensaciones económicas o reclamaciones posteriores por la no disponibilidad del accesorio inicialmente elegido.
            </p>

            <p>
              <strong>PARÁGRAFO-DAÑOS EN TIARA:</strong><br />
              En caso de fractura, ruptura estructural o daño grave de la tiara entregada, <strong>EL CONTRATANTE/ARRENDATARIO</strong> autoriza expresamente a <strong>EL PRESTADOR/ARRENDADOR</strong> a cobrar un valor por concepto de reposición o reparación, el cual será del valor de venta del producto (accesorio) por parte del prestador/arrendador la cual podrá el contratante/arrendatario tener conocimiento en el instante de la entrega o en el momento de realizar el alquiler, suma que podrá ser descontada del depósito en garantía o cobrada directamente al cliente si dicho valor supera el monto del depósito.
            </p>
            <p>
              Se aclara expresamente que la caída o desprendimiento de piedras, cristales o elementos decorativos adheridos, cuando estos sean reparables mediante fijación, será asumida por <strong>EL PRESTADOR/ARRENDADOR</strong> y no generará cobro adicional al cliente, por tratarse de un desgaste normal del uso del accesorio.
            </p>
          </div>
          <div className="space-y-4 text-justify">
            <p><strong>DÉCIMA. Alquiler para Pre XV (Aplicable a Alquiler General):</strong></p>
            <p>
              Si <strong>EL CONTRATANTE/ARRENDATARIO</strong> quiere alquilar el vestido para un evento Pre XV, debe estar al día con su factura para que la prenda pueda salir de la tienda y debe pagar el respectivo depósito, si aplica. Además, <strong>EL CONTRATANTE/ARRENDATARIO</strong> deberá pagar <strong>$140.000</strong> por concepto de lavandería.
            </p>

            <p>
              <strong>PARAGRAFO PRIMERO. Condición de pago previo para cualquier uso del vestido:</strong><br />
              En los servicios de Alquiler PRE XV, se establece expresamente que cualquier uso del vestido posterior a su selección, ya sea dentro o fuera de las instalaciones de <strong>AMBAR COUTURE</strong>, incluyendo, pero sin limitarse a <strong>pruebas, sesiones fotográficas, grabaciones, generación de contenido, ensayos o cualquier otra utilización</strong>, requerirá que la factura se encuentre pagada en su totalidad, así como el depósito correspondiente si aplica.<br />
              En consecuencia, ningún vestido podrá ser utilizado, manipulado o dispuesto para fines distintos a la simple selección inicial, mientras exista saldo pendiente por pagar.
            </p>

            <p>
              <strong>PARAGRAFO SEGUNDO: CONDICIONES DE LA CITA Y SESIÓN PRE XV</strong><br />
              Para la correcta prestación del servicio de Pre XV, <strong>EL CONTRATANTE/ARRENDATARIO</strong> y <strong>LA QUINCEAÑERA</strong> se obligan a cumplir las siguientes condiciones, las cuales hacen parte integral del presente contrato:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Preparación personal:</strong> <strong>LA QUINCEAÑERA</strong> deberá asistir a la cita y/o sesión con el cabello limpio y completamente seco, y con las cejas previamente depiladas, a fin de garantizar el adecuado desarrollo del servicio de maquillaje y peinado.</li>
              <li><strong>Vestimenta:</strong> Se recomienda asistir con ropa cómoda, preferiblemente camisa de botones, con el fin de evitar daños al peinado y maquillaje una vez finalizados.</li>
              <li><strong>Acompañantes:</strong> Se permitirá un máximo de un (1) acompañante durante la cita o sesión, salvo autorización expresa del <strong>PRESTADOR/ARRENDADOR</strong>.</li>
              <li><strong>Puntualidad:</strong> <strong>EL CONTRATANTE/ARRENDATARIO</strong> reconoce que la puntualidad es obligatoria. Un retraso superior a quince (15) minutos podrá afectar el desarrollo de la sesión y las citas posteriores, sin que ello genere derecho a reprogramación, devolución o compensación alguna.</li>
              <li><strong>Inasistencia o cancelación:</strong> En caso de no poder asistir a la cita o sesión programada, <strong>EL CONTRATANTE/ARRENDATARIO</strong> deberá informar con antelación suficiente. La inasistencia injustificada se considerará cita utilizada para todos los efectos contractuales.</li>
              <li><strong>Decoración y elementos adicionales:</strong> Cualquier elemento decorativo para la sesión fotográfica, tales como <strong>tortas, globos, flores, bengalas, mascotas u otros</strong>, deberá ser definido y aportado previamente por <strong>EL CONTRATANTE/ARRENDATARIO</strong>, entendiéndose que la decoración no se encuentra incluida dentro del valor del servicio contratado.</li>
              <li><strong>Participación de terceros en las fotos:</strong> Los padres o familiares podrán participar en la sesión fotográfica únicamente si se informa previamente al fotógrafo y se ajusta a la logística y tiempos del servicio.</li>
              <li><strong>Estilo y locación de la sesión:</strong> <strong>EL CONTRATANTE/ARRENDATARIO</strong> declara conocer y aceptar que la sesión se realizará conforme a las locaciones, estilo y línea estética previamente trabajadas por <strong>ÁMBAR COUTURE</strong>, las cuales pueden ser consultadas en sesiones anteriores, sin que procedan reclamaciones posteriores por diferencias de estilo o concepto.</li>
            </ul>
            <p>
              <strong>PARÁGRAFO TERCERO – ENTREGA DE MATERIAL FOTOGRÁFICO PRE XV</strong><br />
              En los casos en que el paquete contratado incluya sesión fotográfica PRE XV con entrega de material digital, impresiones físicas, ampliaciones o retablos, <strong>AMBAR COUTURE</strong> realizará la entrega conforme a los siguientes plazos:<br />
              <strong>a)</strong> El material digital editado será entregado dentro de los <strong>treinta (30) días calendario</strong> siguientes a la fecha efectiva de realización de la sesión fotográfica.<br />
              <strong>b)</strong> Las impresiones físicas, ampliaciones, retablos u otros productos físicos serán entregados dentro de los <strong>cuarenta y cinco (45) días calendario</strong> siguientes a la sesión, sujetos a los tiempos de producción de proveedores externos.<br />
              En caso de retrasos razonables atribuibles a terceros proveedores o circunstancias logísticas ajenas a la voluntad de <strong>AMBAR COUTURE</strong>, el plazo podrá extenderse informando oportunamente al cliente.<br />
              La entrega digital se realizará mediante enlace electrónico o medio definido por la empresa. Los productos físicos deberán ser reclamados en la sede correspondiente o enviados bajo costo asumido por <strong>EL CONTRATANTE/ARRENDATARIO</strong>.
            </p>

            <p>
              <strong>PARAGRAFO CUARTO - CLÁUSULA DÉCIMA – CONDICIONES ESPECIALES PARA SESIONES PRE-XV</strong><br />
              <strong>ÁMBAR COUTURE</strong> ofrece la posibilidad de realizar sesiones fotográficas denominadas PRE-XV, las cuales podrán desarrollarse bajo las siguientes condiciones:<br />
              <strong>1.</strong> Cliente que alquila el vestido para el evento principal:<br />
              Cuando el vestido haya sido alquilado para el evento principal de quince años, el cliente podrá realizar una sesión PRE-XV.<br />
              <strong>a)</strong> PRE-XV dentro de la semana del evento:<br />
              Cuando la sesión PRE-XV se realice dentro de la misma semana programada para la entrega del vestido, el cliente podrá retirar el vestido para realizar la sesión fotográfica y posteriormente utilizarlo en el evento principal.<br />
              En este caso:<br />
              <strong>No se cobrará alquiler adicional del vestido.</strong><br />
              El cliente únicamente deberá asumir los costos correspondientes a: <strong>fotografía, maquillaje, peinado, lavandería del vestido.</strong><br />
              En estos casos el tiempo de tenencia del vestido podrá superar el límite general de <strong>cinco (5) días</strong> establecido en el contrato, sin generar cargos adicionales por alquiler, siempre que el uso se encuentre dentro de la semana del evento y haya sido previamente autorizado por <strong>ÁMBAR COUTURE</strong>.
            </p>

            <p>
              <strong>b) PRE-XV</strong> fuera de la semana del evento:<br />
              Cuando el cliente desee realizar la sesión <strong>PRE-XV</strong> en una fecha diferente a la semana programada para el evento, se generará un cargo adicional equivalente al: <strong>50% del valor del alquiler del vestido</strong>.<br />
              Además de los costos correspondientes a: <strong>fotografía, maquillaje, peinado, lavandería.</strong>
            </p>

            <p>
              <strong>2.</strong> Cliente que solo desea realizar sesión <strong>PRE-XV</strong> con <strong>ÁMBAR COUTURE</strong>:<br />
              Cuando el cliente no alquile el vestido para el evento principal y únicamente contrate la sesión <strong>PRE-XV</strong> con <strong>ÁMBAR COUTURE</strong>, deberá cancelar: <strong>50% del valor del alquiler del vestido, fotografía, maquillaje, peinado, lavandería.</strong>
            </p>

            <p>
              <strong>3.</strong> Cliente que alquila el vestido para el evento pero realiza el <strong>PRE-XV</strong> con otro proveedor:<br />
              Cuando el cliente haya alquilado el vestido para el evento principal pero decida realizar la sesión <strong>PRE-XV</strong> con un proveedor diferente a <strong>ÁMBAR COUTURE</strong>, la empresa únicamente autorizará el uso del vestido.<br />
              En este caso el cliente deberá asumir únicamente: el costo de <strong>lavandería</strong> del vestido. <strong>No se cobrará alquiler adicional del vestido.</strong>
            </p>

            <p>
              <strong>4.</strong> Cliente que alquila el vestido exclusivamente para sesión <strong>PRE-XV</strong>:<br />
              Cuando el vestido sea solicitado únicamente para realizar la sesión <strong>PRE-XV</strong> y no para el evento principal, el cliente deberá cancelar: <strong>70% del valor del alquiler del vestido</strong> y <strong>el costo de lavandería</strong>. Este servicio no incluye fotografía, maquillaje ni peinado, los cuales deberán ser contratados por el cliente por su cuenta si así lo desea.
            </p>

            <p>
              <strong>5. Disponibilidad del vestido</strong><br />
              El uso del vestido para sesiones <strong>PRE-XV</strong> estará sujeto a la disponibilidad del inventario y programación de agenda de <strong>ÁMBAR COUTURE</strong>, quien podrá autorizar o negar el préstamo del vestido según la disponibilidad del mismo.
            </p>

            <p>
              <strong>6. Condiciones de cuidado del vestido durante el PRE-XV</strong><br />
              Durante la sesión <strong>PRE-XV</strong> el cliente deberá garantizar el cuidado adecuado del vestido, respondiendo por cualquier daño, deterioro o pérdida del mismo conforme a las condiciones establecidas en el presente contrato.
            </p>
          </div>
          <p>
            <strong>DÉCIMA PRIMERA. Pérdida de la Funda del Vestido:</strong>
            La pérdida de la funda del vestido tendrá un costo de <strong>$30.000</strong> para el tamaño pequeño y <strong>$50.000</strong> para el tamaño grande.
          </p>

          <div className="space-y-4 text-justify">
            <p><strong>DÉCIMA SEGUNDA. SERVICIOS PRE XV CON TERCEROS – ACTIVIDAD CON EQUINOS</strong></p>
            <p>
              Cuando dentro del servicio <strong>PRE XV</strong> contratado se incluya sesión fotográfica o actividad con equinos (caballos o ponys), <strong>EL CONTRATANTE/ARRENDATARIO</strong> declara conocer y aceptar lo siguiente:
            </p>
            <ol className="list-decimal pl-6 space-y-2">
              <li><strong>1.</strong> Que la actividad con equinos es prestada por un tercero independiente, quien actúa con autonomía técnica y administrativa, sin que exista relación laboral, societaria o de subordinación con <strong>AMBAR COUTURE</strong>.</li>
              <li><strong>2.</strong> Que la interacción con equinos constituye una actividad que puede implicar riesgo inherente, por tratarse de animales vivos con comportamiento instintivo e imprevisible.</li>
              <li><strong>3.</strong> Que <strong>AMBAR COUTURE</strong> actúa exclusivamente como coordinador logístico y comercial del servicio dentro del paquete <strong>PRE XV</strong>, sin intervenir en la ejecución, manejo, control o supervisión directa de los animales.</li>
            </ol>
            <p><strong>En consecuencia:</strong></p>
            <p><strong>AMBAR COUTURE no será responsable por accidentes, lesiones, daños o perjuicios derivados de la reacción natural, instintiva o imprevisible del equino, siempre que dichos hechos no sean atribuibles a culpa directa de AMBAR COUTURE.</strong></p>
            <p>
              La responsabilidad por el manejo, control, custodia y supervisión del equino recaerá exclusivamente en el prestador del servicio ecuestre, quien deberá contar con sus propios protocolos de seguridad y consentimiento informado firmado por el cliente.
            </p>
            <p>
              <strong>EL CONTRATANTE/ARRENDATARIO</strong> declara conocer que la actividad puede implicar riesgo natural y acepta participar bajo su propia responsabilidad dentro de los límites permitidos por la ley.
            </p>

            <p>
              <strong>PARÁGRAFO PRIMERO.</strong> En caso de desistimiento del servicio con equinos, aplicarán las condiciones de cancelación y penalidad establecidas para dicho servicio, conforme al contrato suscrito con el prestador especializado.
            </p>

            <p>
              <strong>PARÁGRAFO SEGUNDO.</strong> En ningún caso <strong>AMBAR COUTURE</strong> responderá por hechos constitutivos de fuerza mayor o caso fortuito derivados del comportamiento natural del animal.
            </p>

            <p>
              <strong>PARÁGRAFO TERCERO. REPROGRAMACIÓN DE SESIÓN PRE XV POR CONDICIONES CLIMÁTICAS.</strong> En caso de que la sesión fotográfica <strong>PRE XV</strong> no pueda realizarse en la fecha programada debido a condiciones climáticas adversas tales como <strong>lluvias intensas, tormentas eléctricas, alertas meteorológicas, riesgos de seguridad</strong>, o cualquier circunstancia que comprometa la integridad física de la quinceañera, su familia, el equipo técnico o terceros vinculados (fotógrafo, maquillador, prestador de equinos u otros), las partes acuerdan lo siguiente:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>1.</strong> La sesión será reprogramada en una nueva fecha, sujeta estrictamente a la disponibilidad de agenda de <strong>AMBAR COUTURE</strong> y de los terceros involucrados.</li>
              <li><strong>2.</strong> La reprogramación no generará devolución de dinero ni penalidad para ninguna de las partes.</li>
              <li><strong>3.</strong> En caso de que la nueva fecha implique costos adicionales derivados de proveedores externos, logística adicional o ajustes operativos, dichos costos deberán ser asumidos por <strong>EL CONTRATANTE/ARRENDATARIO</strong>.</li>
              <li><strong>4.</strong> La decisión final sobre la viabilidad técnica de realizar la sesión ante condiciones climáticas adversas será adoptada por <strong>AMBAR COUTURE</strong> y su equipo profesional, atendiendo criterios objetivos de seguridad y operatividad.</li>
            </ul>

            <p>
              <strong>PARÁGRAFO CUARTO – SERVICIOS EFECTIVAMENTE EJECUTADOS</strong><br />
              Si al momento de suspender la sesión ya se hubiere ejecutado el servicio de <strong>maquillaje y/o peinado</strong>, dichos servicios se entenderán como efectivamente prestados, consumidos y <strong>no reembolsables</strong>.<br />
              En caso de reprogramación, si <strong>EL CONTRATANTE/ARRENDATARIO</strong> decide contratar nuevamente <strong>maquillaje y/o peinado</strong> para la nueva fecha, deberá asumir el pago correspondiente como un nuevo servicio independiente.<br />
              Lo anterior no constituye penalidad ni sanción, sino el reconocimiento de un servicio personal ya ejecutado y no reutilizable.
            </p>
          </div>

          <p>
            <strong>DÉCIMA TERCERA. Riesgo Compartido:</strong>
            <strong>EL PRESTADOR/ARRENDADOR</strong> tiene derecho a usar la prenda hasta <strong>8 días antes</strong> de la fecha de alquiler seleccionada por <strong>EL CONTRATANTE/ARRENDATARIO</strong>. Por lo tanto, durante ese periodo, la prenda podría sufrir desgaste o daño. Si se identifica alguna de estas novedades, <strong>EL PRESTADOR/ARRENDADOR</strong> se contactará con <strong>EL CONTRATANTE/ARRENDATARIO</strong> para pedirle que se comunique con la empresa y realizar un cambio de prenda por los motivos ya expuestos.
          </p>

          <p>
            <strong>DÉCIMO CUARTA. Notificaciones:</strong>
            Después de <strong>24 horas</strong> de enviado el correo electrónico con las condiciones, se entenderá que <strong>EL CONTRATANTE/ARRENDATARIO</strong> ha recibido y conoce dichas condiciones. En caso de que <strong>EL CONTRATANTE/ARRENDATARIO</strong> no comunique explícitamente la no recepción o su desacuerdo con las condiciones dentro de este plazo, se entenderá que el contrato ha sido <strong>recibido y aceptado en su totalidad</strong>.
          </p>

          <p>
            <strong>DÉCIMOQUINTA. Observaciones:</strong>
            Cualquier observación adicional o particular sobre el estado de la prenda al momento de la entrega o devolución deberá registrarse en la sección de <strong>"Observaciones"</strong> de este documento.
          </p>
          <p>
            <strong>DÉCIMOSEXTA. Legislación Aplicable y Solución de Controversias:</strong>
            Este contrato se rige por las <strong>leyes de la República de Colombia.</strong> Cualquier discusión o diferencia que surja entre las partes por la celebración, ejecución, interpretación, liquidación o terminación de este contrato, se resolverá, en primera instancia, de forma amigable. Si no es posible llegar a un acuerdo directo, las partes podrán acudir a los <strong>mecanismos alternativos de solución de conflictos (MASC)</strong> previstos en la legislación colombiana, tales como la <strong>conciliación, mediación o transacción</strong>, a través de los centros de conciliación autorizados. Si aun así la controversia persiste, se someterá a la jurisdicción de los <strong>jueces competentes de la República de Colombia.</strong>
          </p>
          <p>
            <strong>DÉCIMO SÉPTIMA. Autorización para el uso de imagen y datos personales:</strong>
            <strong>EL CONTRATANTE/ARRENDATARIO</strong>, y <strong>LA QUINCEAÑERA</strong>, autorizan el uso de su imagen y datos personales en cualquier material publicitario, promocional y de marketing que se utilice, inclusive, pero sin limitarse a, en los siguientes medios: <strong>Redes Sociales (Facebook, Instagram, TikTok, entre otras)</strong>. <strong>Medios impresos (Volantes, folletos, posters, entre otros)</strong>. <strong>Medios audiovisuales (Videos, comerciales, entre otros)</strong>. Esta autorización es válida por un período de <strong>diez (10) años</strong>, contados a partir de la firma del presente contrato, y sin limitación geográfica. <strong>EL CONTRATANTE/ARRENDATARIO</strong>, y <strong>LA QUINCEAÑERA</strong>, renuncian a cualquier compensación, indemnización o regalía por el uso de su imagen y datos personales en el marco de esta autorización.
          </p>
          <p>
            <strong>DÉCIMA OCTAVA. Efectividad del Contrato:</strong>
            Las partes acuerdan que el presente contrato, así como las obligaciones y derechos que de él se desprenden, surtirá plenos efectos legales y será exigible para ambas partes a partir de la fecha en que <strong>EL PRESTADOR/ARRENDADOR</strong> reciba el pago inicial o el abono correspondiente por parte de <strong>EL CONTRATANTE/ARRENDATARIO</strong>, según se especifica en la sección de "Información del Cliente y del Alquiler" del presente documento. Sin dicho pago, el contrato no se considerará perfeccionado ni vinculante.
          </p>
          <p>
            <strong>DÉCIMA NOVENA– FUERZA MAYOR O CASO FORTUITO:</strong>
            <strong>1.</strong> Ninguna de las partes será responsable por el incumplimiento total o parcial de sus obligaciones cuando dicho incumplimiento sea consecuencia de eventos de fuerza mayor o caso fortuito debidamente comprobados, tales como desastres naturales, actos de autoridad, emergencias sanitarias, fallas generalizadas de servicios públicos u otros hechos imprevisibles e irresistibles ajenos a la voluntad de las partes.
          </p>
        </div>

        {/* Firmas - Refactorizadas a 2 columnas con efecto de estampado y prevención de salto de página */}
        <div className="mt-12 pt-6 flex justify-around items-end gap-16" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
          <div className="text-center w-full max-w-[300px] flex flex-col items-center">
            <div className="flex justify-center items-center h-20 -mb-8 z-10 relative">
              <img 
                src="/assets/firma_representante.png" 
                alt="Firma Jorge Romero" 
                className="max-h-[130%] w-auto object-contain"
              />
            </div>
            <div className="border-t-2 border-black pt-2">
                <p className="font-extrabold text-sm uppercase">FIRMA DEL PRESTADOR/ARRENDADOR</p>
                <p className="font-bold text-sm">AMBAR COUTURE</p>
                <p className="text-xs">Jorge Andres Romero</p>
                <p className="text-xs">Cédula #80.031.674</p>
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
                <p className="text-xs">C.C. {data.cliente_documento}</p>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="mt-16 text-center text-xs text-gray-500 font-sans border-t border-gray-200 pt-6">
          <p>Documento generado el {formatDate(data.created_at)}</p>
          <p className="mt-1">Ambar Couture © {new Date().getFullYear()} - Todos los derechos reservados.</p>
        </div>

      </div>
    </div>
  );
}
