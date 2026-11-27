'use client';

import React, { useState, useMemo } from 'react';
import { BookOpen, Search, Menu, X, ChevronRight, CheckCircle2, AlertTriangle, Lightbulb, Play, ArrowRight, LayoutDashboard, CalendarDays, ShoppingBag, HandCoins, Package, TrendingUp, Handshake, Clock, ShieldCheck, Store, Truck, Images, Gift, Wallet, Receipt, BarChart3, Mail, Settings, UserCircle, Sparkles, ClipboardList, Printer } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PROTOCOLOS, IndicadorAmbar, PuntajeAmbar } from '@/components/ManualAmbar';
import AuditoriaSede from '@/components/AuditoriaSede';
import { AcademiaAvance, EvaluacionAmbar } from '@/components/AcademiaAmbar';

const MANUAL_DATA = [
  {
    id: 'empezar',
    title: '👋 Empieza aquí: cómo está organizado el ERP',
    description: 'El menú por bloques, cómo usar este manual y los protocolos del Manual Ámbar.',
    icon: <BookOpen className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve este manual?', content: 'Aquí está explicado, módulo por módulo, para qué sirve cada parte del ERP de Ámbar Couture y cómo se usa paso a paso. Debajo están los protocolos del Manual Ámbar: cómo se atiende, se vende y se opera igual en todas las sedes.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **MANUAL DE USUARIO** (abajo, encima de Mi perfil).' },
      { type: 'steps', title: '📝 Cómo está organizado el menú', items: [
        '**Paso 1 · Bloques:** el menú lateral está agrupado en bloques: **INICIO**, **VENTAS Y CRM**, **MARKETING**, **INVENTARIO**, **OPERACIONES Y LOGÍSTICA**, **FINANZAS Y CONTABILIDAD**, **DOCUMENTACIÓN DE LA MARCA**, **RECURSOS HUMANOS**, **REPORTES E INDICADORES** y **CONFIGURACIÓN**.',
        '**Paso 2 · Abrir un bloque:** toca el nombre del bloque para abrirlo o cerrarlo. El bloque del módulo donde estás se abre solo.',
        '**Paso 3 · Ventas y CRM:** aquí están **PRIMERAS VISITAS**, **WHATSAPP 304**, **PIPELINE**, **CALENDARIO CONTRATOS**, **PEDIDOS ESTRENE**, **METAS Y VENTAS**, **ALIADOS**, **PLAN AHORRO XV** y **CATÁLOGO**.',
        '**Paso 4 · Marketing:** **ESTUDIO DE CONTENIDO**, **REDES SOCIALES**, **CORREO**, **PROMOCIONES** y **ANUNCIOS**.',
        '**Paso 5 · Inventario y operaciones:** **GESTIÓN DE INVENTARIO**, **AGENDA DE VESTIDOS** y **TRASLADOS**; luego **PANEL GENERAL** y **TIPOS DE RETABLO** (retablos) y **ADAPTACIONES Y CONFECCIÓN**.',
        '**Paso 6 · Finanzas:** **CUENTAS POR COBRAR**, **CIERRES DE CAJA**, **BANCOS Y CONCILIACIÓN**, **PAGOS FIJOS DE SEDE**, **GASTOS, SEDES Y SOCIOS**, **DEPÓSITOS Y DEVOLUCIONES**, **FACTURACIÓN POR SEDE** y los tres de proveedores (**CATÁLOGO DE PROVEEDORES**, **GESTIÓN DE PROVEEDORES**, **PAGOS A PROVEEDORES**).',
        '**Paso 7 · Equipo, reportes y configuración:** **DOCUMENTOS DE LA MARCA**; **CONTROL DE ASISTENCIA** y **EQUIPO Y ACCESOS**; **TABLERO CEO Y REPORTES**; **CONFIGURACIÓN BASE**, **CLÁUSULAS DEL CONTRATO**, **INTEGRACIONES** e **HISTORIAL Y AUDITORÍA**.',
        '**Paso 8 · Abajo del menú:** **MANUAL DE USUARIO**, **MI PERFIL** y **CERRAR SESIÓN**.',
        '**Paso 9 · Lo que ves depende de tu rol:** cada persona ve solo los módulos de su rol y su sede. Si te falta uno que necesitas, pídelo a administración (se da en **EQUIPO Y ACCESOS**).'
      ] },
      { type: 'steps', title: '📱 Instalar el ERP como app en el celular', items: [
        '**Paso 1 · Abrir:** en el celular entra a **erp.ambarcouture.com** e inicia sesión.',
        '**Paso 2 · iPhone (Safari):** toca **Compartir** (el cuadro con la flecha) y elige **Agregar a pantalla de inicio** › **Agregar**.',
        '**Paso 3 · Android (Chrome):** toca los **tres puntos** y elige **Instalar app** o **Agregar a pantalla principal**.',
        '**Paso 4 · Usar:** queda el ícono de **Ámbar** junto a tus apps; ábrelo desde ahí y el ERP se ve a pantalla completa. Es el mismo ERP: se actualiza solo.'
      ] },
      { type: 'steps', title: '📝 Cómo usar este manual', items: [
        '**Paso 1 · Buscar:** escribe una palabra en **Buscar tema...** (por ejemplo «abono», «traslado» o «caja») y la lista muestra solo los módulos que la mencionan.',
        '**Paso 2 · Abrir un módulo:** tócalo en la lista. Cada módulo trae: para qué sirve, cómo llegar, el paso a paso, lo que debes cuidar y un ejemplo.',
        '**Paso 3 · Imprimir:** toca **Imprimir manual completo** para guardarlo en PDF o entregarlo impreso al equipo. Para un solo módulo toca **Imprimir / descargar este módulo**, y para una sola parte (por ejemplo «Anular un abono mal registrado») toca **Imprimir esta parte** encima de ella; en la ventana elige **Guardar como PDF**.'
      ] },
      { type: 'steps', title: '📝 Cómo usar el Manual Ámbar (protocolos)', items: [
        '**Paso 1 · Ubicarlo:** baja en la lista hasta **✨ Manual Ámbar · Protocolos**. Ahí están el Puntaje Ámbar, la Auditoría mensual, la Academia Ámbar y los protocolos de trabajo.',
        '**Paso 2 · Leer el protocolo:** ábrelo y léelo completo; arriba ves el indicador que el ERP mide para ese protocolo.',
        '**Paso 3 · Presentar la evaluación:** al final de cada protocolo responde la **evaluación**. Se aprueba con **80 % o más** y puedes repetirla.',
        '**Paso 4 · Certificarte:** con todos los protocolos aprobados quedas **«Certificada Ámbar»**. Tu avance se ve en **Academia Ámbar**.'
      ] },
      { type: 'warning', title: '⚠️ Reglas de oro', content: '**Nunca escribas a mano lo que el ERP ya trae** (por ejemplo, un abono en la caja: se confirma desde la sugerencia). **Las fechas siempre se eligen con el calendario**: al tocar un campo de fecha se abre el calendario y no se deja escribir, para evitar años mal digitados (como «0202»). **Todo pago lleva soporte** (foto o PDF del comprobante). **Usa siempre el código del vestido**, nunca solo el nombre. **Todo queda registrado:** quién hizo cada cambio y cuándo. Fechas, citas y cierres se manejan en **hora de Colombia**.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Una asesora nueva entra el primer día: abre **MANUAL DE USUARIO**, busca «abono» para aprender a cobrar, y en la semana presenta las evaluaciones de los protocolos del Manual Ámbar hasta quedar «Certificada Ámbar».' }
    ]
  },
  {
    id: 'inicio',
    title: '🏠 Inicio (Dashboard Logístico)',
    description: 'El tablero principal: pendientes, cifras del mes y la lista de contratos por etapa.',
    icon: <LayoutDashboard className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve este módulo?', content: 'Es lo primero que ves al entrar. Reúne lo urgente (la franja de pendientes de colores), las cifras del mes (lo recaudado, lo vendido y lo que falta por cobrar) y la lista de todos los contratos organizada por etapa, con las acciones de cada uno.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **DASHBOARD** (bloque Inicio). La pantalla se llama **Dashboard Logístico**.' },
      { type: 'steps', title: '📝 Revisar el día', items: [
        '**Paso 1 · Elegir la sede:** arriba, en **Sede:**, elige tu sede o **Todas las sedes**. Esto filtra toda la página: cifras, pendientes y contratos.',
        '**Paso 2 · Mirar los pendientes:** revisa la franja **Pendientes importantes · toca para ir al módulo**. Si no hay nada, dice **Todo al día ✅**. Cada mosaico está explicado en «🚨 Alertas del Inicio».',
        '**Paso 3 · Revisar las cifras:** mira **Vestidos en Evento**, **Pendiente por Recaudar** (toca **Ver detalle en Cuentas por cobrar →**) y **Rendimiento Comercial (Mes Actual)**, con el **Recaudo Real**, lo **Vendido**, la **Meta** y la barra **Progreso de Meta**.',
        '**Paso 4 · Elegir la pestaña:** en **Gestión de Operaciones** toca **Por Entregar**, **En Evento**, **Logística / Lavandería**, **Historial** o **Anulados**.',
        '**Paso 5 · Filtrar por fecha:** en **Hito Logístico:** elige **Cita de Medidas**, **Prueba Final**, **Fecha de Entrega/Envío** o **Sesión Pre-XV**, y en **Rango de Tiempo:** elige **Hoy**, **Esta Semana**, **Este Mes** o **Personalizado**.',
        '**Paso 6 · Buscar un contrato:** escribe en **Buscar por nombre, cédula o contrato...**.',
        '**Paso 7 · Actualizar:** toca el botón de flechas (**Refrescar Datos**) para traer lo último.'
      ] },
      { type: 'steps', title: '📝 Trabajar un contrato desde la lista', items: [
        '**Paso 1 · Ubicar el contrato:** búscalo con el buscador o con la pestaña y los filtros.',
        '**Paso 2 · Editar:** toca **Editar** para corregir los datos permitidos del contrato.',
        '**Paso 3 · Abrir el menú:** toca **Gestionar** para ver las acciones.',
        '**Paso 4 · Ver todo el contrato:** en el menú toca **Abrir Vista 360 (Bitácora)** para ver datos, pagos, vestidos, entregas e historial.',
        '**Paso 5 · Cobrar:** toca **Registrar Abono** (ver «💳 Registrar abono y multas»).',
        '**Paso 6 · Firma y documentos:** usa **Copiar Link de Firma** para enviarlo a la clienta, **Generar PDF Contrato** para descargarlo y **Legalizar Factura** para poner el número de factura (si la factura se hizo a mano en Siigo, ver «🔗 Vincular una factura hecha a mano en Siigo» en Facturación por sede).',
        '**Paso 7 · Entregar:** toca **Registrar Entrega**. Elige el **Tipo de Entrega**, la **Asesora Responsable**, escribe el **Estado Físico y Accesorios**, sube las **Evidencias Fotográficas** y toca **Sellar Acta y Generar Firma**.',
        '**Paso 8 · Después de entregar:** en el menú aparecen **Ver Acta de Entrega** (copia el enlace del acta) y **WhatsApp Entrega** (le envía el enlace a la clienta).',
        '**Paso 9 · Si la clienta desiste:** toca **Desistir del contrato** y escribe el motivo.',
        '**Paso 10 · Crear uno nuevo:** arriba a la derecha toca **NUEVO CONTRATO** (ver «📝 Nuevo contrato»).'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: '**Registrar Entrega queda bloqueado mientras el contrato tenga saldo.** Para entregar se exige la asesora responsable, las observaciones de entrega y al menos una foto (máximo 5). **Solo administración puede editar un contrato pactado.** **Desistir** no está disponible en contratos cancelados, anulados, finalizados, entregados o en mantenimiento.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Llegas a la tienda, eliges tu sede, ves «Pendiente por Recaudar» y en la pestaña Por Entregar filtras Fecha de Entrega/Envío · Esta Semana. Un contrato tiene saldo: tocas Gestionar › Registrar Abono, cobras y ya puedes registrar la entrega.' }
    ]
  },
  {
    id: 'alertas',
    title: '🚨 Alertas del Inicio (qué significa cada mosaico)',
    description: 'Cada mosaico de la franja de pendientes, qué indica y qué hacer.',
    icon: <ClipboardList className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirven?', content: 'Son los pendientes importantes del día. Solo aparecen los mosaicos que tienen algo, solo los de los módulos que tu rol puede ver y siguen la sede elegida en el Inicio. Se actualizan solos cada minuto.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **DASHBOARD** 👉 franja **Pendientes importantes · toca para ir al módulo** (arriba).' },
      { type: 'steps', title: '📝 Cómo usar la franja', items: [
        '**Paso 1 · Leer el número:** cada mosaico muestra cuántos casos hay y qué es.',
        '**Paso 2 · Tocar el mosaico:** te lleva al módulo ya filtrado con esos casos.',
        '**Paso 3 · Filtrar la lista del Inicio:** **Entregas sin registrar (fecha pasada)**, **Contratos con citas por agendar (medidas, prueba o entrega)**, **Borradores sin firmar (+48 h)** y **Pre-XV incompletos** no cambian de página: filtran la lista de contratos de abajo. Tócalo otra vez para quitar el filtro.',
        '**Paso 4 · Resolver:** registra lo que falta en el módulo. El mosaico baja o desaparece solo.'
      ] },
      { type: 'steps', title: '📝 Cada mosaico y qué hacer', items: [
        '**Depósitos por devolver:** depósitos pendientes de devolver. 👉 Abre Depósitos y devoluciones.',
        '**Saldos por cobrar (7 días):** contratos que se entregan en 7 días o menos y todavía deben. 👉 Cobra antes de entregar.',
        '**Seguimientos · N hoy · N vencidos:** clientas de primeras visitas a quienes toca escribir hoy o ya se pasó el día. 👉 Abre Primeras visitas › Seguimientos.',
        '**Citas por confirmar (hoy y mañana): llámalas:** citas de hoy y mañana sin confirmar. 👉 Llama a cada clienta.',
        '**Citas solicitadas hoy (nuevas)** y **Primeras citas de hoy:** 👉 Abre Primeras visitas con esas citas.',
        '**Agenda de hoy (medidas, pruebas, entregas)** y **Agenda de mañana:** 👉 Abre el Calendario en ese día.',
        '**Entregas sin registrar (fecha pasada):** la fecha de entrega pasó y no se registró. 👉 Registra la entrega.',
        '**Contratos con citas por agendar (medidas, prueba o entrega):** 👉 Ponle las fechas al contrato.',
        '**Borradores sin firmar (+48 h):** 👉 Complétalos o anúlalos.',
        '**Vestidos fuera de tienda en alerta:** vestidos sin regreso registrado desde hace 5 días o más. 👉 Baja a la sección de vestidos fuera y llama a la clienta.',
        '**Pre-XV incompletos:** contratos de 15 años con servicios Pre-XV sin completar. 👉 Complétalos.',
        '**Abonos sin pasar a caja**, **Días de caja sin cerrar**, **Cierres de caja por revisar (se corrigió un día anterior)**, **Cierres con diferencia (30 días)** y **Abonos sin soporte (30 días):** 👉 Abre Cierres de caja.',
        '**Traslados por aprobar** y **Préstamos de vestido vencidos:** 👉 Abre Traslados.',
        '**Mantenimiento demorado (+7 días):** 👉 Abre Inventario con los vestidos demorados.',
        '**Pedidos de estrene en riesgo (no alcanzan):** 👉 Abre Pedidos estrene.',
        '**Servicios de proveedores por pagar:** 👉 Abre Pagos a proveedores.',
        '**Ventas de vestido sin factura:** 👉 Abre Ventas y pon la factura.',
        '**Contratos con datos por revisar:** al tocarlo se abre una tabla con **Contrato**, **Sede** y **Qué revisar**. 👉 Corrige cada uno. Si dice **«Depósito marcado como pagado sin entrada a caja»**, envía a administración la fecha, el medio y el comprobante de ese pago (o avisa si la clienta no pagó).'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'Si un mosaico no te aparece es porque no hay pendientes o porque tu rol no ve ese módulo. Si eliges una sede en el Inicio, los mosaicos muestran solo esa sede.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Ves «Citas por confirmar (hoy y mañana): llámalas · 3». Lo tocas, se abre Primeras visitas con esas 3 citas, llamas a cada clienta y el mosaico baja.' }
    ]
  },
  {
    id: 'visitas',
    title: '👰 Primeras visitas: citas, vitrinas y seguimientos',
    description: 'Agendar primeras citas, registrar vitrinas, anotar el resultado y hacer el seguimiento.',
    icon: <Sparkles className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Aquí están las primeras citas (presenciales y virtuales), las vitrinas (clientas que llegan sin cita) y el seguimiento a quienes no alquilaron o no llegaron, para no perder ninguna venta.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **PRIMERAS VISITAS** (pestañas **Citas** y **Seguimientos**).' },
      { type: 'steps', title: '📝 Agendar una primera cita', items: [
        '**Paso 1 · Abrir los enlaces:** toca **Enlaces ▾**.',
        '**Paso 2 · Enviar el enlace:** toca **Copiar enlace para reservar** y pégalo en el chat de la clienta. Si antes elegiste una **Sede** en los filtros, el enlace sale con esa sede.',
        '**Paso 3 · O agendarla tú:** toca **Ver formulario** y llénalo con ella.',
        '**Paso 4 · Modalidad y sede:** elige **Modalidad** (presencial o virtual) y la **Sede que te atiende**.',
        '**Paso 5 · Día y hora:** elige el día y la **Hora de inicio**. Solo salen las horas con cupo.',
        '**Paso 6 · Datos:** escribe **Nombre completo**, **Cédula de la persona que reserva**, **Teléfono / WhatsApp** y **Correo electrónico**; elige **Tipo de vestido que buscas**, **¿Cómo nos conociste?** y, si la sabe, **Fecha de tu evento (si ya la sabes)**.',
        '**Paso 7 · Autorización:** marca **Autorizo el tratamiento de mis datos personales (obligatorio)** y elige si quiere recibir novedades.',
        '**Paso 8 · Reservar:** toca **Reservar mi primera cita**, revisa el número de WhatsApp y toca **Sí, es correcto: reservar**.',
        '**Paso 9 · Si necesita cambiar la cita:** en **Enlaces ▾** toca **Copiar enlace para reprogramar** y envíaselo.'
      ] },
      { type: 'steps', title: '📝 Registrar una vitrina (llegó sin cita)', items: [
        '**Paso 1 · Abrir:** toca **+ Nueva vitrina**.',
        '**Paso 2 · Datos de la clienta:** escribe **Nombre completo**, **Teléfono** y, si la tienes, **Cédula** y **Correo**.',
        '**Paso 3 · Si ya existe:** si el ERP avisa que el teléfono o la cédula ya están registrados, vincula el registro que muestra o toca **Continuar como vitrina nueva**.',
        '**Paso 4 · La visita:** elige **Sede**, **Fecha y hora de la visita**, **Asesora que atiende** y **Tipo de evento**; si los sabes, **Fecha del evento** y **Cómo se enteró**.',
        '**Paso 5 · Resultado:** en **¿Alquiló?** elige **Alquiló** o **No alquiló**. Si no alquiló, elige **¿Por qué no alquiló?**.',
        '**Paso 6 · Autorización:** marca la autorización de tratamiento de datos.',
        '**Paso 7 · Guardar:** toca **Guardar vitrina**, o **Guardar y crear contrato** si alquiló.'
      ] },
      { type: 'steps', title: '📝 Registrar el resultado de una cita', items: [
        '**Paso 1 · Buscar la cita:** en la pestaña **Citas** usa **Buscar por** (**Fecha de la cita** o **Fecha en que la pidió**), **Desde**, **Hasta** y **Buscar** (nombre, cédula, teléfono o contrato). Puedes filtrar por **Sede**, **Modalidad**, **Origen** y **Resultado**.',
        '**Paso 2 · Abrir la cita:** toca **Gestionar / historial**.',
        '**Paso 3 · Asistencia:** en **Asistencia (obligatoria)** elige **Asistió** o **No asistió**. Si no asistió, elige el **Motivo de no asistencia**.',
        '**Paso 4 · ¿Alquiló?:** si asistió, en **¿Alquiló? (obligatoria)** elige **Alquiló** o **No alquiló**. Si no alquiló, elige **¿Por qué no alquiló? (obligatoria)**.',
        '**Paso 5 · Fecha del evento:** escríbela si la clienta ya la sabe.',
        '**Paso 6 · Nota:** escribe lo importante en **Nota**. Si no se le debe hacer seguimiento, marca **No hacer seguimiento** y escribe el motivo.',
        '**Paso 7 · Guardar:** toca **Guardar resultado**.',
        '**Paso 8 · Crear el contrato:** si alquiló, en la fila de la cita toca **Crear contrato**. Si ya tiene contrato, sale **Ver contrato**.',
        '**Paso 9 · Revisar lo que falta:** si arriba sale **Faltan datos por registrar**, toca cada dato para ver esas citas y regístralas.'
      ] },
      { type: 'steps', title: '📝 Hacer un seguimiento', items: [
        '**Paso 1 · Ver lo de hoy:** toca la pestaña **Seguimientos** y en **Estado** elige **Hoy y vencidos**.',
        '**Paso 2 · Buscar a una clienta:** escribe en **Buscar** su nombre, celular, cédula o contrato. También encuentra los seguimientos cerrados.',
        '**Paso 3 · Abrir:** toca **Gestionar / historial**.',
        '**Paso 4 · Contactarla:** toca **Llamar** o **WhatsApp** (abre su chat del 304 en el ERP).',
        '**Paso 5 · Anotar:** en **Registrar seguimiento** escribe la **Conclusión de lo hablado** y elige **Canal** y **Resultado** si aparecen.',
        '**Paso 6 · Guardar:** toca **Registrar seguimiento**.',
        '**Paso 7 · Cerrar el seguimiento:** si ya no hay que seguir, toca **Finalizar seguimiento**, elige el **Motivo de cierre** y toca **Finalizar**.',
        '**Paso 8 · Reasignar (líderes y administración):** elige la **Sede**, marca las clientas, elige la asesora en **Reasignar a…** y toca **Reasignar N seleccionadas**.'
      ] },
      { type: 'steps', title: '📝 Cancelar una cita y poner el QR de llegada', items: [
        '**Paso 1 · Cancelar:** abre la cita con **Gestionar / historial** y toca **Cancelar cita**.',
        '**Paso 2 · Motivo:** escribe el **Motivo de la cancelación** y toca **Confirmar cancelación** (o **Volver** si te equivocaste).',
        '**Paso 3 · QR de llegada:** toca **QR de llegada**, busca tu sede y toca **Descargar afiche** o **Imprimir**. Ponlo en la entrada: con cita, la clienta registra su llegada sola; sin cita, se registra como vitrina.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: '**Citas de 1 hora, de 9:00 a. m. a 7:00 p. m., de lunes a sábado.** Presencial: 2 por hora en cada sede. Virtual: 1 por hora entre todas las sedes. Domingos y lunes festivos no se atiende. Las vitrinas no gastan cupos. **Crear contrato** solo aparece después de registrar la asistencia. Al guardar el resultado se crea solo el plan de **5 seguimientos en días hábiles**; solo se evita marcando **No hacer seguimiento** con un motivo largo. Solo se registra **un seguimiento por día** y cada uno desde su fecha. Si la llegada quedó registrada y nadie anota el resultado, a las 48 h queda «Asistió · no alquiló» con seguimiento. **Eliminar cita** es solo para citas de prueba o creadas por error, y no se puede si la cita tiene contrato.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Camila vino ayer, no alquiló por precio. Abres su cita, eliges Asistió › No alquiló › Precio y guardas. Hoy te sale en Seguimientos › Hoy y vencidos: la llamas, escribes «Le ofrecí la promoción, viene el sábado» y tocas Registrar seguimiento.' }
    ]
  },
  {
    id: 'whatsapp',
    title: '💬 WhatsApp 304: chats, comentarios e IA',
    description: 'Responder los chats del 304 con ayuda de la IA, los comentarios de redes y, para administración, la IA y los anuncios.',
    icon: <Mail className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Reúne los chats del WhatsApp 304 (y de Instagram y Messenger) unidos a la ficha de cada clienta. La IA etiqueta cada chat, detecta la sede y deja una respuesta sugerida que la asesora revisa antes de enviar. También se responden aquí los comentarios de Instagram y Facebook.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **WHATSAPP 304** (pestañas **Chats** y **Comentarios de redes**; administración ve además **IA de WhatsApp** y **Anuncios**). Los anuncios también se abren en Menú lateral 👉 **ANUNCIOS** (bloque Marketing).' },
      { type: 'steps', title: '📝 Responder un chat', items: [
        '**Paso 1 · Abrir:** toca la pestaña **Chats**.',
        '**Paso 2 · Filtrar:** en la lista elige **Todos los chats**, **Atender persona**, **Sin leer**, **Sin sede**, **Interesadas en Plan Ahorro XV**, una sede o **Atender persona · sede**.',
        '**Paso 3 · Buscar:** escribe en **Buscar nombre o celular**.',
        '**Paso 4 · Abrir el chat:** toca el chat. Arriba ves sus contratos y citas; tócalos para abrirlos.',
        '**Paso 5 · Revisar la sede:** si está mal o vacía, elígela en **Sede**.',
        '**Paso 6 · Leer la IA:** en el recuadro **IA** ves la etiqueta, el resumen y la respuesta sugerida.',
        '**Paso 7 · Usar la sugerencia:** toca **Usar sugerencia** para pasarla a la caja de texto y corrígela si hace falta. Si no te sirve, toca **Volver a sugerir**.',
        '**Paso 8 · Enviar:** toca **Enviar**.',
        '**Paso 9 · Atender persona:** si sale **Atender persona** en rojo, atiéndela tú y luego toca **✓ Marcar resuelto**.',
        '**Paso 10 · Plan Ahorro:** si sale **Interesada en el Plan Ahorro XV**, toca **Inscribir en el plan**.',
        '**Paso 11 · Cómo nos conoció:** si la clienta no llegó por un anuncio, la IA le pregunta una vez cómo nos encontró (Google, Instagram, recomendación…) y lo guarda en su cita; si atiendes tú, pregúntalo también.',
        '**Paso 11 · Pausar la IA en un chat:** cuando la respuesta automática está encendida, toca **IA activa · Pausar** para que no conteste sola; **IA pausada · Reactivar** la vuelve a encender.'
      ] },
      { type: 'steps', title: '📝 Escribirle a una clienta después de 24 horas', items: [
        '**Paso 1 · Ver el aviso:** si pasaron más de 24 horas desde su último mensaje, la caja dice **Ventana de 24 h cerrada**.',
        '**Paso 2 · Retomar:** toca **Enviarle un saludo para retomar**. Cuando ella responda, le escribes normal.',
        '**Paso 3 · Clienta sin chat:** si abres una clienta que nunca ha escrito al 304, toca **Enviarle un saludo desde el ERP**.'
      ] },
      { type: 'steps', title: '📝 Responder comentarios de redes', items: [
        '**Paso 1 · Abrir:** toca **Comentarios de redes** y deja **Pendientes**.',
        '**Paso 2 · Leer:** revisa el comentario, su tipo (por ejemplo **Interés en alquilar** o **Queja: atiende una persona**) y toca **Ver publicación** si necesitas contexto.',
        '**Paso 3 · Sugerencia:** si la caja está vacía, toca **Sugerir con IA**.',
        '**Paso 4 · Responder en público:** revisa la **Respuesta pública** y toca **Responder en público**.',
        '**Paso 5 · Escribir por privado:** escribe el **Mensaje privado** y toca **Responder por privado**. El chat sigue en **Chats**.',
        '**Paso 6 · Descartar:** si no merece respuesta, toca **No responder**.'
      ] },
      { type: 'steps', title: '📝 IA de WhatsApp (solo administración)', items: [
        '**Paso 1 · Abrir:** toca la pestaña **IA de WhatsApp**.',
        '**Paso 2 · Respuesta automática:** toca **Encender para todos los chats** o **Apagar para todos los chats**, y elige en cuántas horas vuelve sola la IA a un chat donde escribió una asesora.',
        '**Paso 3 · Lo que le falta a la IA:** en esa sección lee cada pregunta que la IA no supo responder, escribe la respuesta y toca **Enseñar a la IA**, o toca **No aplica**.',
        '**Paso 4 · Aprendizaje diario:** el botón **Aprende sola cada día** la enciende o la apaga.',
        '**Paso 5 · Conocimientos de la IA:** escríbele como a una persona («¿qué sabes del depósito?») y toca **Enviar**. Si propone un cambio, toca **Sí, ajústalo** o **No, déjalo así**.',
        '**Paso 6 · Textos de la IA:** en **Ver o editar el texto completo** ajusta **Conocimientos**, **Instrucciones y tono** y **Reglas de paso a una persona**, y toca **Guardar cambios**.',
        '**Paso 7 · Probar:** en **Probar como clienta** escribe como si fueras una clienta. No se envía nada por WhatsApp. **Nueva conversación** empieza de cero.',
        '**Paso 8 · Volver atrás:** en **Historial de cambios** toca **Cargar esta versión** y luego **Guardar cambios**.',
        '**Paso 9 · Informe rápido:** fuera de esta pestaña, el aviso **📝 La IA necesita N datos…** abre el **Informe · Lo que le falta a la IA**; toca **📋 Copiar informe** para pasarlo.'
      ] },
      { type: 'steps', title: '📝 Anuncios (solo administración)', items: [
        '**Paso 1 · Abrir:** toca la pestaña **Anuncios** (o Menú lateral 👉 **ANUNCIOS**).',
        '**Paso 2 · Informe diario:** lee el **Informe diario de anuncios** o toca **Generar ahora**.',
        '**Paso 3 · Portafolio:** en **Portafolio de anuncios en Meta** revisa gasto, chats, citas y contratos de cada campaña. Usa **Pausar**, **Activar** o **Presupuesto**; cada cambio pide confirmación.',
        '**Paso 4 · Efectividad:** en **Efectividad de los anuncios** elige **Desde** y **Hasta** y toca **Actualizar** para ver chats, citas, asistencias, contratos y el costo por cita y por contrato.'
      ] },
      { type: 'warning', title: '🔴 Si la IA se queda sin crédito', content: 'Si la cuenta de Anthropic que usa la IA se queda sin crédito, la IA deja de responder: administración ve un **aviso rojo arriba** con los chats sin respuesta y al dueño le llega un **correo** (cada 6 horas). Mientras tanto, las asesoras responden los chats a mano. El aviso se quita solo cuando se recarga y la IA vuelve a responder.' },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: '**Después de 24 horas sin mensaje de la clienta, Meta no deja escribirle libre:** solo con el saludo para retomar (en Instagram y Messenger hay que escribirle desde Meta Business Suite). **Por privado a un comentario solo se puede dentro de los 7 días.** La IA nunca contesta sola los chats marcados **Atender persona**, y cuando una asesora escribe en un chat, la IA se pausa en ese chat. Las pestañas IA de WhatsApp y Anuncios son solo para administración.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Una clienta pregunta por vestidos de XV. Abres su chat, ves que la IA ya sugirió ofrecerle la primera cita, tocas Usar sugerencia, agregas su nombre y tocas Enviar.' }
    ]
  },
  {
    id: 'pipeline',
    title: '📊 Pipeline: cada clienta en su etapa',
    description: 'Todas las clientas por etapa, desde que escriben hasta que alquilan, con lo que hay que hacer.',
    icon: <TrendingUp className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Muestra a cada clienta en su etapa: Interesada, Cita agendada, Asistió, En seguimiento, Contrato o Cerrada. La etapa cambia sola con lo que se registra en el ERP y cada tarjeta avisa lo que falta por hacer.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **PIPELINE**.' },
      { type: 'steps', title: '📝 Trabajar el pipeline', items: [
        '**Paso 1 · Elegir la sede (administración):** en el selector elige una sede o **Todas las sedes**. Las asesoras ven solo sus sedes.',
        '**Paso 2 · Ver lo pendiente:** toca **⚠️ Por hacer · N** para ver solo las tarjetas con algo pendiente. Tócalo otra vez para ver todas.',
        '**Paso 3 · Buscar:** escribe en **Buscar nombre, celular o código**.',
        '**Paso 4 · Elegir la etapa:** en el celular toca la etapa (**Interesada**, **Cita agendada**, **Asistió**, **En seguimiento**, **Contrato** o **Cerrada**); en el computador ves todas las columnas.',
        '**Paso 5 · Leer el aviso:** toca el aviso rojo **⚠️** de la tarjeta para ver qué significa y **Qué hacer**.',
        '**Paso 6 · Ir a resolver:** toca **Chat** para abrir su conversación en WhatsApp 304 o **Ficha** para abrir su primera visita.',
        '**Paso 7 · Registrar:** haz lo que pide el aviso (responder, confirmar, anotar el resultado). El aviso desaparece y la tarjeta cambia de etapa sola.',
        '**Paso 8 · Actualizar:** se actualiza solo cada minuto; toca **Actualizar** si quieres verlo ya.',
        '**Paso 9 · Dudas:** abre **¿Qué significa cada etapa y cada aviso?** para ver la explicación de todo.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: '**Las tarjetas no se mueven a mano:** cambian solas con los chats, citas, llegadas, resultados, seguimientos y contratos. Se ven los chats de los últimos 45 días. Las interesadas sin cita reciben solas un mensaje de la IA a las 20 horas y, si no responden, dos mensajes automáticos (día 2 y día 7); sin respuesta pasan a **Cerrada**. Primero salen las tarjetas que **Piden atención de una persona**.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Tocas Por hacer y ves a Valentina en Cita agendada con el aviso «Sin confirmar». Tocas Chat, le escribes para confirmar, luego en su Ficha la dejas confirmada y el aviso desaparece.' }
    ]
  },
  {
    id: 'calendario',
    title: '🗓️ Calendario de contratos',
    description: 'Pruebas, entregas y fechas de cada contrato, día por día, con su panel de edición.',
    icon: <CalendarDays className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Muestra en una agenda las pruebas de medidas, pruebas finales, entregas, eventos, sesiones Pre-XV y demás fechas de cada contrato. Desde aquí abres el contrato en un panel lateral para revisarlo y corregir datos y fechas.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **CALENDARIO CONTRATOS**.' },
      { type: 'steps', title: '📝 Revisar la agenda', items: [
        '**Paso 1 · Abrir:** entra al calendario. Abre en **Día a día** con la semana desde hoy.',
        '**Paso 2 · Elegir la vista:** toca **Mes**, **Semana** o **Día a día**.',
        '**Paso 3 · Moverte:** usa las flechas para ir al periodo anterior o siguiente, y **Hoy** para volver a hoy.',
        '**Paso 4 · Buscar:** escribe en **Cliente, contrato, factura o referencia**.',
        '**Paso 5 · Filtrar:** elige la sede en **Todas las sedes disponibles** y marca **Incluir cancelados** si los necesitas.',
        '**Paso 6 · Tipo de fecha:** toca **Todas** o un tipo, por ejemplo **Prueba de medidas**, **Prueba final**, **Entrega / envío**, **Evento** o **Sesión Pre-XV**.',
        '**Paso 7 · Abrir un contrato:** toca la fila o la tarjeta. Se abre el panel con **Cliente y contrato**, el valor y el **Saldo**.',
        '**Paso 8 · Pasar al siguiente:** usa las flechas del panel (contrato anterior o siguiente) para revisar uno tras otro.',
        '**Paso 9 · Si llegaste desde una alerta:** ves solo ese día; toca **Ver toda la semana** para ver el resto.'
      ] },
      { type: 'steps', title: '📝 Corregir datos o fechas de un contrato', items: [
        '**Paso 1 · Editar:** en el panel toca **Editar contrato**.',
        '**Paso 2 · Datos de la clienta:** en **Editar datos del cliente** corrige **Nombre del cliente**, **Quinceañera**, **Correo**, **WhatsApp** o **Dirección**.',
        '**Paso 3 · Pre-XV:** si el contrato tiene servicios Pre-XV, completa sus datos.',
        '**Paso 4 · Fechas especiales:** en **Bloqueo fechas especiales** toca **Agregar fecha** y elige la **Fecha especial**; usa **Quitar** para borrar una.',
        '**Paso 5 · Fechas del contrato:** cambia la fecha (y la hora si la pide) de cada hito.',
        '**Paso 6 · Observaciones:** escribe en **Observaciones del vestido** si hace falta.',
        '**Paso 7 · Guardar:** toca **Guardar cambios**, o **Cancelar** para salir sin guardar.',
        '**Paso 8 · Otras acciones:** **Recibir o devolver depósito** abre los depósitos del contrato y **Contrato completo** lo abre en el Inicio.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'Cada asesora ve solo los contratos de su sede (tu perfil debe tener sede asignada). Si el contrato tiene saldo y se entrega en 7 días o menos, el panel lo avisa: **cóbralo antes de la entrega**. Si el contrato tiene Pre-XV, la fecha de la sesión es obligatoria al guardar. Las fechas de entregas ya realizadas no se cambian desde el calendario. Las fechas sin hora se muestran sin hora.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Antes de abrir revisas Día a día: hoy hay 2 pruebas finales y 1 entrega. Tocas la entrega, el panel dice «se entrega hoy y aún debe»: llamas a la clienta para que traiga el saldo.' }
    ]
  },
  {
    id: 'contrato',
    title: '📝 Nuevo contrato (alquiler)',
    description: 'Cómo crear un contrato de alquiler de principio a fin y enviarlo a firmar.',
    icon: <ClipboardList className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve este módulo?', content: 'Aquí nace cada alquiler: datos de la clienta, fechas, vestidos, valores, depósito pactado, abono inicial y factura. Al guardarlo, el contrato bloquea los vestidos en la agenda y queda conectado con la caja, la cartera, las alertas y Siigo.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Lo ideal: Menú lateral 👉 **PRIMERAS VISITAS** 👉 en la cita, botón **Crear contrato** (queda ligado a su origen). También: Menú lateral 👉 **DASHBOARD** 👉 botón **NUEVO CONTRATO**.' },
      { type: 'steps', title: '📝 Crear el contrato', items: [
        '**Paso 1 · Visita de origen:** si no entraste desde la cita, en **Visita de origen** escribe el código, nombre, teléfono o cédula y toca **Usar** en la visita correcta. Si la clienta llegó sin cita, toca **Registrar vitrina**.',
        '**Paso 2 · Clasificación del contrato:** deja **Cliente directo** (lo normal). Elige **Aliado** solo si el contrato es de un aliado: escribe su ID, código o cédula y toca **Cargar**.',
        '**Paso 3 · Sede y asesora:** en **Información Cliente** elige la **Sede** y luego la **Asesora Responsable** de esa sede.',
        '**Paso 4 · Datos de la clienta:** llena **Tipo de documento**, **Número de documento**, **Nombre Completo**, **WhatsApp**, **Correo**, **Dirección** y **Nombre de la Quinceañera**. Sin correo no le llega su contrato ni su factura.',
        '**Paso 5 · Evento:** en **Logística de Evento** elige el **Tipo de Evento** (Evento General, Sesión Pre XV o Ambos), la **Fecha del Evento** y el **Tipo Envío** (Local o Nacional).',
        '**Paso 6 · Fechas de citas:** escribe **Cita Medidas**, **Prueba Final** y **Entrega/Envío Vestido**. Si aún no se pueden fijar, marca **Fechas por agendar**.',
        '**Paso 7 · Fechas especiales (opcional):** en **Bloqueo fechas especiales** toca **Agregar fecha** para bloquear los vestidos en días adicionales.',
        '**Paso 8 · Vestidos:** en **Vestido & Adaptaciones**, en **Buscador de Vestido**, busca por código y elige el vestido. Para más de uno toca **Agregar Referencia**. Si el vestido no está libre o está en otra sede, el ERP te avisa.',
        '**Paso 9 · Accesorios y arreglos:** en **Accesorios Incluidos** pon la cantidad de cada uno (0 = no incluido). En **Módulo Arreglos** agrega los arreglos cobrados con su precio.',
        '**Paso 10 · Valor del alquiler:** en **Finanzas & Depósitos** escribe el **Valor Alquiler Base**.',
        '**Paso 11 · Adicionales:** en **Qué incluye además del vestido** toca **Agregar concepto** por cada adicional (Pre XV, lavandería, accesorios…) con su valor. Cada uno sale en la factura.',
        '**Paso 12 · Promoción (opcional):** en **Promoción** elige la que aplique o deja **Sin promoción**.',
        '**Paso 13 · Abono inicial:** escribe el **Abono Inicial** y marca los **Métodos de Pago Utilizados (Abono)**. Revisa el **Saldo Final Real**.',
        '**Paso 14 · Soporte del abono:** sube la foto o PDF del comprobante. Si todavía no lo tienes, marca **El soporte lo adjunto después**: tendrás que adjuntarlo antes de cerrar la caja de hoy.',
        '**Paso 15 · Depósito pactado:** en **Valor del depósito de garantía** escribe el valor **pactado** (puedes tocar **Usar este valor** para el sugerido). Aquí no se da por pagado: el pago se registra en Depósitos › **Pago de depósito**.',
        '**Paso 16 · Cómo se devuelve el depósito:** en **¿Cómo se devuelve?** elige **A una cuenta o llave** (llena banco, tipo de cuenta o llave Bre-B, número y titular) o **En efectivo en la tienda**.',
        '**Paso 17 · Autorizaciones:** activa la **Autorización de Uso de Imagen** si la clienta acepta y, en **Autorización de datos personales**, marca el tratamiento (obligatorio) y elige **Sí autoriza** o **No autoriza** en información comercial.',
        '**Paso 18 · Factura:** en sedes con Siigo verás **Factura en Siigo (automática)**: elige **Tipo de factura** y **Tipo de venta**. El número de factura lo pone Siigo; no se escribe.',
        '**Paso 19 · Fecha de elaboración:** escógela en el **calendario** (hoy o una fecha pasada, nunca futura); no se escribe. Es la fecha del contrato y de su factura.',
        '**Paso 20 · Guardar:** toca **Procesar y Generar Contrato**. Sale la **Verificación final** con el resumen (clienta, vestidos, fechas, valores, depósito): revísalo y toca **Sí, guardar**, o **Volver a revisar** para corregir. El ERP te lleva al Dashboard.'
      ] },
      { type: 'steps', title: '✍️ Enviar el contrato a firmar', items: [
        '**Paso 1 · Buscar el contrato:** en el **DASHBOARD**, escribe en el buscador el nombre, la cédula o el número del contrato.',
        '**Paso 2 · Abrir el menú:** en la fila del contrato toca **Gestionar**.',
        '**Paso 3 · Correo automático:** al guardar, el ERP le envía el contrato al **correo** de la clienta para firmar, y si no firma le recuerda a las 24 horas, a los 3 días y a los 7 días. Si quieres que firme ya, toca **Copiar Link de Firma** y ábrelo en tu equipo o envíaselo por WhatsApp.',
        '**Paso 4 · Firma:** la clienta firma desde su celular. Logra que firme **ese mismo día**.',
        '**Paso 5 · PDF (si lo pide):** en **Gestionar** toca **Generar PDF Contrato**.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: '**Sin soporte no se guarda el abono inicial**, salvo que marques «El soporte lo adjunto después» (y entonces la caja de hoy no cierra hasta adjuntarlo). **El depósito nunca se registra como abono del contrato:** solo en Depósitos › «Pago de depósito». **Editar** un contrato guardado solo lo puede hacer administración (o la asesora de operaciones de su sede) y todo queda auditado.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Sofía escogió el vestido 1390 en su primera cita. Desde Primeras visitas tocas «Crear contrato», cargas el vestido, pones las fechas, el valor y un abono de $500.000 con la foto de la transferencia, escribes el depósito pactado y guardas. Luego, en Gestionar, copias el link de firma y se lo envías.' }
    ]
  },
  {
    id: 'abonos',
    title: '💳 Registrar abono y multas',
    description: 'Cómo registrar pagos del contrato, y cómo pagar o condonar una multa.',
    icon: <HandCoins className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Para registrar cada pago que hace la clienta después de crear el contrato. El saldo se recalcula solo, el pago queda en el historial con su soporte y llega a la caja del día para confirmarlo.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **DASHBOARD** 👉 en el contrato, **Gestionar** 👉 **Registrar Abono**. También desde **CUENTAS POR COBRAR** 👉 **Registrar abono**.' },
      { type: 'steps', title: '📝 Registrar un abono', items: [
        '**Paso 1 · Revisar el saldo:** arriba a la derecha mira el **Saldo Pendiente**. Si hay multa verás aparte «Alquiler $… · Multa $…».',
        '**Paso 2 · Monto:** en **Monto del Abono ($)** escribe lo que pagó. No puede ser mayor que el saldo; si lo es, el botón dice «Monto no válido».',
        '**Paso 3 · Medio de pago:** en **Medio de Pago** elige **Transferencia**, **Efectivo** o **Tarjeta (Datafono/Link)**.',
        '**Paso 4 · Recibo:** en sedes con Siigo el **Número de Recibo de Caja** lo asigna Siigo solo. En las demás sedes escríbelo.',
        '**Paso 5 · Fecha del pago:** elige el día en que la clienta **realmente** pagó (hoy o una fecha pasada; si esa caja ya está cerrada, primero hay que reabrirla).',
        '**Paso 6 · Observaciones (opcional):** escribe algo útil, por ejemplo el banco o la referencia.',
        '**Paso 7 · Soporte:** en **Documento soporte** sube el pantallazo de Nequi, el comprobante del banco o el voucher (foto o PDF). Es obligatorio.',
        '**Paso 8 · Guardar:** toca **Registrar Pago** y espera el mensaje «¡Abono registrado exitosamente!».',
        '**Paso 9 · No duplicar:** toca **Registrar Pago** una sola vez. El ERP no deja usar el mismo soporte en otro abono del mismo valor, y si ya hay un abono igual ese día te pregunta si es un pago diferente.',
        '**Paso 9 · Revisar:** el pago aparece a la derecha en **Historial de Pagos** con su botón **Ver soporte**.'
      ] },
      { type: 'steps', title: '📎 Adjuntar un soporte que quedó pendiente', items: [
        '**Paso 1 · Abrir el contrato:** entra a **Registrar Abono** del contrato.',
        '**Paso 2 · Buscar el pago:** en **Historial de Pagos** ubica el pago que dice **Sin soporte · Adjuntar soporte**.',
        '**Paso 3 · Adjuntar:** tócalo, elige la foto o PDF y espera «Soporte adjuntado.». Hazlo antes de cerrar la caja del día.'
      ] },
      { type: 'steps', title: '🟣 Pagar o condonar una multa', items: [
        '**Paso 1 · Ver la multa:** si el contrato tiene multa, aparece el recuadro morado **Multa del contrato** con lo pendiente.',
        '**Paso 2 · Pagar multa:** toca **Pagar multa**; el monto se llena solo. Completa medio, fecha y soporte y toca **Registrar Pago**.',
        '**Paso 3 · Condonar multa (administración y contabilidad):** toca **Condonar multa**, revisa el **Valor a condonar** y escribe el **Motivo**.',
        '**Paso 4 · Confirmar:** toca **Confirmar condonación**. No entra dinero y queda registrado quién y por qué.'
      ] },
      { type: 'steps', title: '📅 Cambiar la fecha de un abono (la plata entró otro día)', items: [
        '**¿Quién?:** la asesora líder de la sede (en Pereira también el franquiciado) o administración. No hace falta anular el abono.',
        '**Paso 1 · Ubicar el pago:** en **Registrar Abono** del contrato, en **Historial de Pagos**, toca **Cambiar fecha** en el abono.',
        '**Paso 2 · Fecha real:** elige el día en que entró la plata y escribe el **motivo** (ej.: «la transferencia entró ayer»).',
        '**Paso 3 · Guardar:** toca **Guardar fecha**. El abono y su movimiento de caja pasan a ese día y queda en el historial del contrato.',
        '**Ojo:** si la caja de alguno de los dos días ya está cerrada, primero pide reabrir ese día. Si el recibo ya estaba en Siigo, Contabilidad recibe el aviso para cambiar su fecha allá (Siigo no deja hacerlo desde el ERP).'
      ] },
      { type: 'steps', title: '↩️ Anular un abono mal registrado', items: [
        '**Paso 1 · Ubicar el pago:** en **Historial de Pagos** toca **Anular** en el pago equivocado.',
        '**Paso 2 · Motivo:** escribe el motivo (mínimo 10 caracteres).',
        '**Paso 3 · Resultado:** si eres administración o contabilidad, el pago se anula y el saldo se recalcula. Si no, se envía una solicitud a administración para que la apruebe.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: '**El depósito no se registra aquí:** va en Depósitos › «Pago de depósito». **Todo abono lleva soporte.** Cuando dice **«¡Paz y Salvo!»** ya no se pueden registrar más abonos. Un contrato con multa pendiente **no se cierra** hasta que la multa se pague o se condone.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Laura transfiere $300.000 el viernes y tú lo registras el lunes. En «Fecha del pago» eliges el viernes, adjuntas el pantallazo y tocas «Registrar Pago». La caja del viernes recibe la sugerencia y el saldo baja solo.' }
    ]
  },
  {
    id: 'entrega',
    title: '📦 Entregas, devoluciones y cierre del contrato',
    description: 'Entregar el vestido, recibirlo de vuelta, lavandería y finalizar el contrato.',
    icon: <Package className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Controla el recorrido del vestido: se entrega con acta y fotos, vuelve del evento, pasa por lavandería o sastrería y queda disponible. Al final se revisa el depósito y el contrato se finaliza.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **DASHBOARD** 👉 pestañas **Por Entregar**, **En Evento** y **Logística / Lavandería** 👉 en el contrato, botón **Gestionar**.' },
      { type: 'steps', title: '📤 Registrar la entrega', items: [
        '**Paso 1 · Paz y salvo:** confirma que el contrato no deba saldo. Si debe, **Registrar Entrega** sale bloqueado.',
        '**Paso 2 · Depósito pagado:** confirma que el depósito esté pagado completo en **DEPÓSITOS Y DEVOLUCIONES**.',
        '**Paso 3 · Abrir la entrega:** en la pestaña **Por Entregar**, toca **Gestionar** 👉 **Registrar Entrega**. Se abre **Bitácora de Entrega Física**.',
        '**Paso 4 · Comprobante del depósito:** en **Comprobante del depósito para esta entrega** sube el soporte del depósito ya recibido y elige el **Método del depósito**. No suma dinero otra vez.',
        '**Paso 5 · Tipo de entrega:** si el contrato tiene Pre-XV, elige **PRE-XV (Sesión)**, **EVENTO PRINCIPAL** o la entrega **Conjunta**.',
        '**Paso 6 · Asesora:** elige la **Asesora Responsable**.',
        '**Paso 7 · Estado del vestido:** en **Estado Físico y Accesorios** describe cómo sale el vestido y qué accesorios lleva.',
        '**Paso 8 · Fotos:** sube al menos una foto del vestido (máximo 5) en **Evidencias Fotográficas**.',
        '**Paso 9 · Guardar:** toca **Sellar Acta y Generar Firma**. El contrato pasa a **En Evento**.',
        '**Paso 10 · Acta para la clienta:** en **Gestionar** toca **WhatsApp Entrega** para enviarle el acta, o **Ver Acta de Entrega** para copiar el enlace.'
      ] },
      { type: 'steps', title: '📥 Recibir el vestido (Registrar Devolución)', items: [
        '**Paso 1 · Abrir:** en la pestaña **En Evento**, toca **Gestionar** 👉 **Registrar Devolución**. Se abre **Control de Calidad e Inventario**.',
        '**Paso 2 · Mora:** si volvió tarde, aparece **Mora detectada** con la multa. Toca **💰 Cargar Multa al Saldo** para sumarla al contrato.',
        '**Paso 3 · Destino:** elige **Lavandería** (bloqueo de 2 días) o **Sastrería** (reparación).',
        '**Paso 4 · Daños:** si elegiste Sastrería, escribe en **Detalle de Daños / Arreglos** qué tiene el vestido (obligatorio).',
        '**Paso 5 · Días:** revisa los **Días Estimados fuera de Inventario**.',
        '**Paso 6 · Confirmar:** toca **Confirmar Recepción**. El vestido queda **EN MANTENIMIENTO** y el contrato pasa a **Logística / Lavandería**.'
      ] },
      { type: 'steps', title: '✅ Liberar el vestido y finalizar el contrato', items: [
        '**Paso 1 · Abrir:** en la pestaña **Logística / Lavandería**, toca **Gestionar** 👉 **🔓 Marcar como Disponible / Ingreso a Tienda**.',
        '**Paso 2 · Si no debe nada:** se abre **Revisar depósito antes de finalizar** con el **Saldo disponible del depósito**.',
        '**Paso 3 · Descuentos:** si hubo daño o cobro, escribe el valor en **Descuento por daño o cobro (COP)** y describe el motivo.',
        '**Paso 4 · Revisar:** mira el **Valor a devolver al cliente**.',
        '**Paso 5 · Finalizar:** toca **Confirmar y finalizar contrato**. Los vestidos quedan disponibles y contabilidad recibe la solicitud de devolución del depósito.',
        '**Paso 6 · Si debe saldo o multa:** el ERP pide confirmar la liberación anticipada, deja el vestido disponible y el contrato **sigue activo**. Cobra en **Registrar Abono** y vuelve a este paso.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: '**No se entrega con saldo pendiente ni sin el depósito pagado completo:** si falta el depósito, el ERP muestra «No se puede entregar el vestido» con el botón **REGISTRAR DEPÓSITO**. **No se puede enviar a lavandería** si al contrato le faltan datos (nombre, documento, WhatsApp, correo, fecha del evento, valor total o los proveedores Pre-XV contratados). Un contrato con multa **no se finaliza** hasta pagarla o condonarla.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'El vestido de Laura volvió 2 días tarde. En «Registrar Devolución» cargas la multa, eliges Lavandería y confirmas. Ella paga la multa en «Registrar Abono». Al salir de lavandería tocas «Marcar como Disponible», revisas el depósito sin descuentos y finalizas el contrato.' }
    ]
  },
  {
    id: 'desistimientos',
    title: '🚪 Desistimientos',
    description: 'Cuando la clienta desiste: liquidación, retención y devolución del dinero.',
    icon: <ShieldCheck className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Cuando una clienta ya no quiere el alquiler, el ERP cancela el contrato y calcula cuánto se le devuelve: lo pagado menos un valor por cada cita usada y los arreglos ya hechos. Después se registra la devolución con su comprobante.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Para desistir: Menú lateral 👉 **DASHBOARD** 👉 en el contrato, **Gestionar** 👉 **Desistir del contrato**. Para devolver: Menú lateral 👉 **DEPÓSITOS Y DEVOLUCIONES** 👉 sección **Desistimientos**.' },
      { type: 'steps', title: '📝 Registrar el desistimiento', items: [
        '**Paso 1 · Por escrito:** pide a la clienta el desistimiento **por escrito** por los canales oficiales.',
        '**Paso 2 · Abrir el contrato:** en el **DASHBOARD** busca el contrato y toca **Gestionar**.',
        '**Paso 3 · Desistir:** toca **Desistir del contrato** y escribe el **motivo**.',
        '**Paso 4 · Citas usadas:** escribe cuántas citas usó (0 a 3: primera vez, medidas, prueba final). El ERP sugiere un número.',
        '**Paso 5 · Arreglos:** escribe el valor de los arreglos ya hechos al vestido (0 si no hubo).',
        '**Paso 6 · Revisar la liquidación:** el ERP muestra **Pagado**, **Retención** y **A devolver**. Si está bien, confirma.',
        '**Paso 7 · Listo:** el contrato queda cancelado y la liquidación guardada, pendiente de devolver.'
      ] },
      { type: 'steps', title: '💸 Registrar la devolución', items: [
        '**Paso 1 · Abrir:** Menú lateral 👉 **DEPÓSITOS Y DEVOLUCIONES** y baja a la sección **Desistimientos**.',
        '**Paso 2 · Ubicar el contrato:** busca la fila con estado **Devolución pendiente**. Si dice **Sin liquidar**, toca **Liquidar** y haz los pasos 4 a 6 de arriba.',
        '**Paso 3 · Abrir el formulario:** toca **Registrar devolución**.',
        '**Paso 4 · Fecha y medio:** elige la **Fecha** en que devolviste el dinero y el **Medio**.',
        '**Paso 5 · Cuenta:** si no fue en efectivo, elige la cuenta de la sede de donde salió el dinero.',
        '**Paso 6 · Comprobante:** sube el **Comprobante (foto o PDF)** de la devolución. Es obligatorio.',
        '**Paso 7 · Guardar:** toca **Registrar devolución**. Sale de la caja de la sede como devolución (no es gasto: baja el ingreso).'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'No se puede desistir un contrato que ya está entregado, en lavandería, finalizado o anulado. El valor retenido por cada cita lo fija administración en los parámetros del ERP. Contabilidad hace en Siigo la nota crédito por lo devuelto.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Camila pagó $800.000 y usó la primera cita y la de medidas, sin arreglos. Con $100.000 por cita, la retención es $200.000 y se le devuelven $600.000. Transfieres, subes el pantallazo en «Registrar devolución» y queda como «Devuelto».' }
    ]
  },
  {
    id: 'plan_ahorro',
    title: '🐷 Plan Ahorro XV',
    description: 'Familias que ahorran cada mes para el vestido y los servicios de los 15 años.',
    icon: <Gift className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'La familia ahorra cada mes (desde $150.000) y, 3 meses antes del evento, usa lo ahorrado más un extra en vestido y servicios de Ámbar. Según lo ahorrado sube de nivel (🌸 Rosa, 💎 Diamante, 👑 Corona) y gana premios. Cada cuota entra a Cierres de caja.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **PLAN AHORRO XV**.' },
      { type: 'steps', title: '📝 Inscribir una familia', items: [
        '**Paso 1 · Abrir:** toca **Inscribir familia**.',
        '**Paso 2 · Sede y evento:** elige la **Sede** y la **Fecha del evento** (al menos 6 meses después de hoy).',
        '**Paso 3 · Quién ahorra:** escribe **Quién ahorra (mamá, papá o acudiente)**, su **Cédula (opcional)** y su **Celular (WhatsApp)**.',
        '**Paso 4 · Más datos:** si los tienes, llena **Correo (opcional)** y **Nombre de la quinceañera (opcional)**.',
        '**Paso 5 · Cuota:** escribe la **Cuota mensual (mínimo $150.000)** y el **Día de pago de cada mes**.',
        '**Paso 6 · Guardar:** toca **Inscribir**. La familia aparece en **Activos**.'
      ] },
      { type: 'steps', title: '✍️ Enviar el contrato del plan', items: [
        '**Paso 1 · Ubicar la familia:** en **Activos** busca su tarjeta; dirá «Contrato sin firmar».',
        '**Paso 2 · Generar el enlace:** toca **Enviar contrato para firmar**.',
        '**Paso 3 · Enviar:** toca **Enviar por WhatsApp** (o **Copiar enlace**). El enlace vence en 30 días.',
        '**Paso 4 · Firma:** cuando firme, la tarjeta dice «Contrato firmado el…» y aparece **Ver contrato firmado**.'
      ] },
      { type: 'steps', title: '💵 Registrar una cuota', items: [
        '**Paso 1 · Abrir:** en la tarjeta de la familia toca **Registrar cuota** (sale solo cuando el contrato está firmado).',
        '**Paso 2 · Fecha y valor:** elige la **Fecha del pago** y revisa el **Valor** (puede abonar más de la cuota).',
        '**Paso 3 · Medio y cuenta:** elige el **Medio** y, si no es efectivo, **¿A qué cuenta llegó?**.',
        '**Paso 4 · Guardar:** toca **Registrar cuota**. Entra como ingreso «Plan Ahorro XV» en la caja de la sede.',
        '**Paso 5 · Revisar o corregir:** toca **Ver abonos** para ver los pagos; si uno quedó mal, toca **Anular** y escribe el motivo.'
      ] },
      { type: 'steps', title: '🔒 Cerrar el plan', items: [
        '**Paso 1 · Abrir:** en la tarjeta toca **Cerrar plan**.',
        '**Paso 2 · Motivo:** elige **Lo usó en su contrato**, **Desistió** o **Dejó de pagar 2 cuotas seguidas**.',
        '**Paso 3 · Si lo usa:** en **Contrato donde lo usa** elige el contrato (★ = misma familia). Lo ahorrado se abona al contrato y el extra entra como descuento. Si no aparece, crea primero el contrato.',
        '**Paso 4 · Nota:** escribe la **Nota (obligatoria)**.',
        '**Paso 5 · Guardar:** toca **Cerrar plan**. Si desistió o dejó de pagar, registra la devolución como egreso en Cierres de caja.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: '**Primero la firma, luego la cuota:** sin contrato firmado no se registran cuotas. La fecha de la cuota debe ser de los últimos 31 días y ese día de caja debe estar abierto (si ya se cerró, no deja anular: pide a administración reabrirlo). Si desiste o deja de pagar no recibe extra: se le devuelve lo pagado menos el 10 % de gastos administrativos.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'La mamá de Valentina se inscribe con $200.000 al mes para un evento en diciembre del próximo año. Le envías el contrato por WhatsApp, lo firma y registras su primera cuota. A 3 meses del evento creas su contrato y cierras el plan con «Lo usó en su contrato».' }
    ]
  },
  {
    id: 'cobros',
    title: '💰 Cuentas por cobrar',
    description: 'Quién debe, cuánto y cuándo se entrega su vestido.',
    icon: <Wallet className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Lista los contratos que deben dinero, ordenados por la fecha de entrega del vestido, para cobrar a tiempo. Avisa a 7 y a 3 días de la entrega.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **CUENTAS POR COBRAR** (bloque Finanzas y contabilidad), o la tarjeta «Pendiente por recaudar» del Dashboard.' },
      { type: 'steps', title: '📝 Paso a paso', items: [
        '**Paso 1 · Ver el resumen:** arriba están las tarjetas **Vencido (ya pasó la entrega)**, **Se entrega en 3 días o menos**, **Se entrega en 4 a 7 días** y **Más adelante**. Toca una para ver solo esos contratos.',
        '**Paso 2 · Elegir el plazo:** en **Plazo** deja **Urgentes (7 días o vencidos)** o elige **Todos con saldo**.',
        '**Paso 3 · Filtrar:** usa **Sede** y **Asesora**, o marca **Solo mis contratos**.',
        '**Paso 4 · Buscar:** en **Buscar** escribe el número del contrato o el nombre de la clienta.',
        '**Paso 5 · Cobrar:** contacta a la clienta y, cuando pague, toca **Registrar abono** en su fila.',
        '**Paso 6 · Actualizar:** toca **Actualizar** para ver los saldos al día.',
        '**Paso 7 · Exportar (opcional):** toca **Exportar Excel** para descargar la lista filtrada.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: '**El vestido no se puede entregar mientras el contrato tenga saldo.** Cobra antes de la fecha de entrega.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'El lunes abres Cuentas por cobrar en «Urgentes»: 6 contratos se entregan esta semana con saldo. Le escribes a cada clienta y registras los abonos a medida que pagan.' }
    ]
  },
  {
    id: 'ventas',
    title: '🛍️ Venta de vestidos',
    description: 'Vender un vestido de contado, con su comprobante y su factura de Siigo.',
    icon: <ShoppingBag className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Para vender un vestido de contado, sin contrato de alquiler. La venta entra a la caja del día, cuenta en Metas y Ventas y genera su comprobante. Se factura en Siigo con el código del vestido + V.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **DASHBOARD** 👉 **NUEVO CONTRATO** 👉 botón **Venta** (junto a la clasificación del contrato). También la alerta «Ventas de vestido sin factura».' },
      { type: 'steps', title: '📝 Registrar una venta', items: [
        '**Paso 1 · Buscar el vestido:** en **Nueva venta**, escribe el **Código del vestido** y toca **Buscar**.',
        '**Paso 2 · Revisar:** si el vestido no se puede vender, el ERP dice por qué (no marcado «Venta», sin precio o vendido) y te da **Abrir en Inventario**.',
        '**Paso 3 · Vender:** toca **Vender** en el vestido. Se abre **Vender vestido**.',
        '**Paso 4 · Descuento (opcional):** escribe el **Descuento** y el **Motivo del descuento**. Revisa el **Total a cobrar**.',
        '**Paso 5 · Pago:** elige el **Medio de pago** y, si no es efectivo, la **Cuenta que recibió**.',
        '**Paso 6 · Datos para la factura:** escribe **Nombre de quien compra**, **Cédula o NIT**, **Teléfono** y **Correo**.',
        '**Paso 7 · Autorización de datos:** marca el tratamiento de datos y elige **Sí autoriza** o **No autoriza**.',
        '**Paso 8 · Guardar:** toca **Registrar venta**, revisa la **Verificación final** (vestido, total, pago y datos de factura) y toca **Sí, registrar venta**. Se abre el **Comprobante** (VTA-000001…) para imprimir o guardar en PDF.'
      ] },
      { type: 'steps', title: '🧾 Anotar la factura de Siigo', items: [
        '**Paso 1 · Ubicar la venta:** en **Ventas del mes** elige el **Mes** y busca la venta con factura **Pendiente**.',
        '**Paso 2 · Anotar:** toca **N° factura** y escribe el número que generó Siigo.',
        '**Paso 3 · Revisar:** la columna **Factura Siigo** muestra el número y el contador **Sin factura de Siigo** baja.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'El vestido debe estar marcado **«Venta»** en Inventario y tener precio de venta. **No se vende un vestido con contratos de alquiler activos.** El descuento debe ser menor que el precio. Solo vendes vestidos de tu sede. **Anular** una venta (administración y contabilidad) pide motivo, la saca de la caja y el vestido vuelve a estar disponible.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Una clienta compra el vestido 1390 de $2.000.000 con $200.000 de descuento por exhibición. Registras la venta por transferencia, le entregas el comprobante y, cuando Siigo genera la factura, anotas su número con «N° factura».' }
    ]
  },
  {
    id: 'inventario',
    title: '👗 Gestión de inventario',
    description: 'Crear, editar, archivar, contar y medir la rotación de los vestidos.',
    icon: <Store className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Es la base de todos los vestidos y accesorios: código, clasificación, categoría, talla, color, estilo, tela, precios, sede, estado, fotos e historial. Desde aquí también se hace la toma física de cada sede y se ve cuánto se alquila cada vestido.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **INVENTARIO › GESTIÓN DE INVENTARIO**. Arriba están las pestañas **Por sede**, **Por estado**, **Rotación**, **Toma física** y **Duplicados**.' },
      { type: 'steps', title: '📝 Crear un vestido', items: [
        '**Paso 1 · Abrir el formulario:** en la pestaña **Por sede** toca **Nuevo Vestido** (solo si puedes editar el inventario de tu sede).',
        '**Paso 2 · Código:** en **1. Código de Referencia** escribe la referencia, solo letras, números o guiones, sin espacios (de 2 a 20 caracteres). Si hay varias tallas del mismo modelo usa referencia-talla, por ejemplo 1046-S.',
        '**Paso 3 · Clasificación:** en **2. Clasificación** elige XV Años, Gala, Novia, Pajecita, Vestido de cambio u Otro.',
        '**Paso 4 · Nombre:** en **3. Nombre / Descripción** escribe una descripción corta (mínimo 3 letras).',
        '**Paso 5 · Talla y color:** llena **4. Talla** y **5. Color**.',
        '**Paso 6 · Estilo:** elige **Silueta**, **Corpiño**, **Escote** y **Mangas**, y marca todos los **Detalles** que tenga. La **Tela** es opcional.',
        '**Paso 7 · Uso:** en **Disponible para** marca **Alquiler**, **Venta** o los dos.',
        '**Paso 8 · Precios:** escribe **6. Precio de alquiler** (obligatorio si es para alquiler) y **Precio de venta** (obligatorio si está marcado para venta).',
        '**Paso 9 · Sede:** en **7. Sede Base** elige la sede donde queda el vestido.',
        '**Paso 10 · Fotos:** en **8. Fotos** sube las tres: **Frente**, **Espalda** y **Detalle**.',
        '**Paso 11 · Guardar:** revisa la lista de lo que falta (si hay algo, el botón no deja guardar) y toca **GUARDAR EN INVENTARIO**. La categoría se pone sola según la clasificación y el precio de alquiler.'
      ] },
      { type: 'steps', title: '📝 Buscar, revisar y editar', items: [
        '**Paso 1 · Buscar:** escribe en **Buscar por código, nombre o clasificación...** o filtra por sede, **Novedades**, clasificación y categoría.',
        '**Paso 2 · Cambiar la vista:** usa los botones de lista o cuadrícula de arriba a la derecha.',
        '**Paso 3 · Abrir la ficha:** toca el vestido para ver su expediente con las pestañas **Alquileres**, **Mantenimiento**, **Historial** y **Traslados**, y su código QR.',
        '**Paso 4 · Editar:** toca **Editar todo** debajo del código, corrige los datos (incluido el estilo y la tela) y toca **Guardar**.',
        '**Paso 5 · Revisar el estilo:** si dejaste el estilo o la tela vacíos, la IA los llena sola desde la foto de frente. Revísalos y corrígelos si no coinciden, porque con eso la IA de WhatsApp recomienda vestidos.',
        '**Paso 6 · Fotos en bloque:** con **Carga masiva de fotos** subes muchas fotos a la vez (desde el equipo o con **Importar de Drive**); cada archivo debe empezar con la referencia del vestido.',
        '**Paso 7 · Descargar:** **Exportar** baja la lista filtrada para Excel, **Catálogo PDF** arma el catálogo con fotos y **Etiquetas QR** genera el PDF de etiquetas.'
      ] },
      { type: 'steps', title: '📝 Cambiar de sede, dar de baja o archivar', items: [
        '**Paso 1 · Cambiar de sede:** en la columna **Ubicación** elige la nueva sede: se abre la **Nueva solicitud** en **Traslados** con el vestido y la sede ya puestos. Todo cambio de sede pasa por solicitud y aprobación (solo un vestido **sin sede** se asigna directo).',
        '**Paso 2 · Abrir acciones:** toca **⋯** al final de la fila.',
        '**Paso 3 · Dar de baja o vender:** toca **Dar de baja**. Acepta (OK) si es por daño; cancela si es por venta y se abre la venta (el vestido debe estar marcado para **Venta**).',
        '**Paso 4 · Eliminar o archivar:** toca **Eliminar o archivar**. Si el código no tiene historial se borra; si tiene contratos, traslados o mantenimientos, escribe el **Motivo** y se archiva.',
        '**Paso 5 · Restaurar:** activa el botón **Archivados**, busca el código, toca **⋯** y luego **Restaurar código**.'
      ] },
      { type: 'steps', title: '📝 Por estado y Rotación', items: [
        '**Paso 1 · Por estado:** abre la pestaña **Por estado** para ver la tabla **Estado por sede**; toca un número para ver esos vestidos y usa **Exportar Excel** si lo necesitas.',
        '**Paso 2 · Rotación:** abre la pestaña **Rotación** y filtra por sede (**Todas las sedes**), por tipo (**Todos los tipos**) o busca por código, nombre o color.',
        '**Paso 3 · Elegir el grupo:** toca una tarjeta: **Nunca alquilados**, **Nuevos sin alquilar**, **Quietos +90 días**, **Pocas veces (1-2)** o **Más alquilados (5+)**.',
        '**Paso 4 · Leer las sugerencias:** revisa **💡 Sugerencias de traslado** para mover a otra sede los vestidos que no se alquilan.',
        '**Paso 5 · Descargar:** toca **Descargar Excel** para bajar la lista filtrada completa.'
      ] },
      { type: 'steps', title: '📝 Hacer la toma física', items: [
        '**Paso 1 · Abrir:** entra a la pestaña **Toma física** y elige la **Sede**.',
        '**Paso 2 · Iniciar:** toca **Iniciar toma física**.',
        '**Paso 3 · Marcar:** en **Código del vestido** escribe o escanea el código de cada vestido que tienes en la mano y toca **Marcar**. Repite con todos.',
        '**Paso 4 · Revisar las listas:** mira **Por encontrar**, **Sobrantes (de otra sede)**, **Afuera (contrato, traslado o mantenimiento)** y **Encontrados**. Busca otra vez los que siguen por encontrar.',
        '**Paso 5 · Cerrar:** escribe una **Nota (opcional)** y toca **Cerrar toma**. Los que no aparecieron quedan como faltantes en Novedades contables.'
      ] },
      { type: 'steps', title: '📝 Códigos repetidos', items: [
        '**Paso 1 · Abrir:** entra a la pestaña **Duplicados**.',
        '**Paso 2 · Mismo vestido:** si es el mismo vestido, elige la ficha que queda y toca **Unificar** (la otra se archiva y se puede deshacer).',
        '**Paso 3 · Vestidos distintos:** si son vestidos diferentes, dale a uno un **código nuevo**.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: '**El código es único en todo el inventario** (todas las sedes, también los archivados). Cada sede **edita solo su inventario**: los vestidos de otra sede solo se ven. Si un vestido dice «no tiene una sede válida», administración debe asignarle la sede. Los vestidos con **ficha incompleta** (fotos de frente, espalda y detalle, talla, color, clasificación o precio de alquiler) no se podrán incluir en contratos nuevos desde la fecha que muestra el aviso; administración puede dar una excepción temporal.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Llegó a Bogotá un vestido de XV talla 8. Creas el código 1501-8, eliges XV Años, color rosa, silueta y detalles, alquiler $1.800.000, sede Bogotá y subes las tres fotos. Al guardar, el ERP le pone la categoría sola.' }
    ]
  },
  {
    id: 'agenda',
    title: '📅 Agenda de vestidos (disponibilidad)',
    description: 'Qué vestido está libre u ocupado en una fecha.',
    icon: <CalendarDays className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Para no cruzar fechas: muestra si un vestido está disponible u ocupado hoy, en qué días está reservado y por qué contrato, con sus fotos y su precio de lista.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **INVENTARIO › AGENDA DE VESTIDOS**.' },
      { type: 'steps', title: '📝 Consultar un vestido', items: [
        '**Paso 1 · Buscar:** en **Referencia de Prenda** escribe el código, el nombre o el color (ej.: 5051 o verde lila) y toca **Consultar**.',
        '**Paso 2 · Elegir:** si salen **Múltiples vestidos encontrados**, toca **Ver Calendario →** en el que corresponde.',
        '**Paso 3 · Ver el estado de hoy:** la tarjeta verde dice **Disponible** y la roja **Ocupado**, con el contrato y la fecha en que se libera.',
        '**Paso 4 · Ver las fotos:** toca la foto para verla en grande. Revisa el precio de lista; si dice «Solo venta: no se alquila», no se puede alquilar.',
        '**Paso 5 · Revisar el calendario:** en **Calendario de Ocupación** toca un día rojo para ver el **Detalle del Bloqueo** (contrato, clienta, fecha de uso y periodo ocupado).',
        '**Paso 6 · Ver todo:** baja a **Todos los bloqueos del vestido** y a **Historial de Movimientos** para ver fechas pasadas y futuras.',
        '**Paso 7 · Pedirlo a otra sede:** si el vestido está en otra sede, toca **Pedir traslado / préstamo** (si tu rol lo permite).'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'El botón **Dar de Baja Definitiva** solo lo ve administración: pide el **Motivo** y saca el vestido de circulación para siempre.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Una clienta de Villavicencio quiere el 5051 para el 20 de diciembre. Lo consultas, ves que ese día no está en rojo y que el vestido está en Bogotá, y tocas «Pedir traslado / préstamo».' }
    ]
  },
  {
    id: 'traslados',
    title: '🚚 Traslados y préstamos entre sedes',
    description: 'Pedir, aprobar, enviar, recibir y devolver vestidos entre sedes.',
    icon: <Truck className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Para pedir un vestido que está en otra sede, prestado (vuelve a su sede en una fecha) o definitivo (se queda en la otra sede), y seguirlo desde la solicitud hasta que llega y regresa.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **INVENTARIO › TRASLADOS** (pestañas **Pendientes**, **Nueva solicitud** e **Historial**), o desde la Agenda de vestidos con **Pedir traslado / préstamo**.' },
      { type: 'steps', title: '📝 Pedir un vestido', items: [
        '**Paso 1 · Abrir:** entra a la pestaña **Nueva solicitud**.',
        '**Paso 2 · Buscar el vestido:** en **Código del vestido** escribe el código, toca **Buscar** y elige el vestido de la lista.',
        '**Paso 3 · Tipo:** elige **Préstamo (vuelve a su sede)** o **Definitivo (pasa a la otra sede)**.',
        '**Paso 4 · Destino:** en **Sede que lo recibe** elige la sede.',
        '**Paso 5 · Fecha:** si es préstamo, pon la **Fecha de devolución** (hoy o después).',
        '**Paso 6 · Contrato:** si es para un contrato, escribe su número en **Contrato (opcional)**.',
        '**Paso 7 · Motivo y envío:** escribe el **Motivo** y toca **Enviar solicitud**. Queda esperando aprobación.'
      ] },
      { type: 'steps', title: '📝 Aprobar, enviar y recibir', items: [
        '**Paso 1 · Revisar pendientes:** en **Pendientes** mira cada grupo: **Por aprobar (vestidos de tu sede)**, **Por enviar**, **Por recibir** y **Préstamos por devolver**.',
        '**Paso 2 · Aprobar:** la sede donde está el vestido (o administración) toca **Aprobar** y luego **Confirmar**. Para no aceptar, toca **Rechazar** y escribe el **Motivo del rechazo**.',
        '**Paso 3 · Enviar:** cuando lo empaques, toca **Marcar enviado**, llena si quieres **Transportadora**, **Guía** y **Costo del envío** y toca **Confirmar**. El vestido queda «En traslado».',
        '**Paso 4 · Recibir:** la sede que lo recibe toca **Marcar recibido**, escribe si quieres **¿En qué estado llegó?** y toca **Confirmar**.',
        '**Paso 5 · Cancelar:** si ya no se necesita, toca **Cancelar** antes de que salga.'
      ] },
      { type: 'steps', title: '📝 Devolver un préstamo', items: [
        '**Paso 1 · Iniciar:** en **Préstamos por devolver** toca **Iniciar devolución** y confirma en **Iniciar devolución del préstamo**. Se crea el envío de regreso, ya aprobado.',
        '**Paso 2 · Enviar:** cuando salga, toca **Marcar enviado** y **Confirmar**.',
        '**Paso 3 · Recibir:** la sede dueña toca **Marcar recibido** y **Confirmar**. Así el préstamo queda cerrado.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'Un vestido **no puede tener dos traslados en curso**. No se trasladan vestidos archivados, vendidos o dados de baja, ni vestidos sin sede. Solo se cancela antes del envío. Si un préstamo pasa su fecha de devolución, aparece en rojo como **«Préstamo vencido»**.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Barranquilla pide prestado el 5051 a Bogotá hasta el 20 de diciembre. Bogotá lo aprueba y lo marca enviado con la guía; Barranquilla lo marca recibido. Después del evento, Barranquilla toca «Iniciar devolución», lo envía y Bogotá lo recibe.' }
    ]
  },
  {
    id: 'arreglos',
    title: '✂️ Adaptaciones y confección',
    description: 'Arreglos de sastrería y lavandería de los vestidos, con fotos del antes y del después.',
    icon: <Sparkles className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Lleva el control de los arreglos y la lavandería de cada vestido: quién lo hace, qué se hizo, cuánto le cuesta a Ámbar, cuándo salió y cuándo volvió, con foto del antes y del después. El costo pasa solo a Pagos a proveedores.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **OPERACIONES Y LOGÍSTICA › ADAPTACIONES Y CONFECCIÓN**. El tablero tiene tres columnas: **Por enviar**, **Donde la costurera** y **Listos (30 días)**.' },
      { type: 'steps', title: '📝 Crear y enviar un arreglo', items: [
        '**Paso 1 · Abrir:** toca **+ Nuevo arreglo**. Si el ajuste viene de un contrato, búscalo en **Ajustes de contratos sin enviar a la costurera** y toca **Crear arreglo**.',
        '**Paso 2 · Vestido:** en **Vestido (código)** escribe el código y elige el vestido de la lista.',
        '**Paso 3 · Tipo:** elige **Arreglo (sastrería)** o **Lavandería**.',
        '**Paso 4 · Quién lo hace:** en **Quién lo hace** elige la costurera, el sastre o la lavandería.',
        '**Paso 5 · Trabajo:** en **Qué se hace** escribe el arreglo (ej.: subir ruedo 3 cm) y, si aplica, el **Daño o nota (opcional)**.',
        '**Paso 6 · Costo:** escribe el **Costo para Ámbar** o déjalo para cuando lo recibas.',
        '**Paso 7 · Foto del antes:** toma la **Foto del antes** (obligatoria en sastrería) y toca **Guardar**.',
        '**Paso 8 · Enviar:** cuando el vestido salga, toca **Enviar** en su tarjeta. Pasa a **Donde la costurera**. Con **WhatsApp** le escribes al proveedor.'
      ] },
      { type: 'steps', title: '📝 Recibir el vestido', items: [
        '**Paso 1 · Abrir:** en la tarjeta del vestido toca **Recibir**.',
        '**Paso 2 · Foto del después:** toma la **Foto del después** (obligatoria en sastrería).',
        '**Paso 3 · Costo:** confirma el **Costo para Ámbar** (en sastrería es obligatorio; pon 0 si lo hizo la sede).',
        '**Paso 4 · Cerrar:** toca **Recibir y cerrar**. El arreglo pasa a **Listos** y, si tiene costo, queda pendiente de pago al proveedor.',
        '**Paso 5 · Ver el historial:** toca el código del vestido en la tarjeta para ver todos sus arreglos.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'No se puede **Enviar** sin elegir quién lo hace ni, en sastrería, sin la foto del antes. La tarjeta sale en rojo si el evento es en 3 días o menos y el vestido no ha vuelto. Si un arreglo ya se pagó, su costo no se puede cambiar. Para que aparezcan en **Quién lo hace**, los proveedores deben estar en **Gestión de proveedores** con el servicio «Costura y arreglos» o «Lavandería».' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'El contrato de Sara pide subir el ruedo 3 cm. Tocas «Crear arreglo», eliges a la costurera, tomas la foto del antes y lo envías. Cuando vuelve, tocas «Recibir», tomas la foto del después, pones $25.000 y queda listo para pagarle.' }
    ]
  },
  {
    id: 'retablos',
    title: '🖼️ Retablos',
    description: 'Seguimiento de cada retablo vendido en un contrato y catálogo de tipos.',
    icon: <Gift className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Lleva el control de cada retablo vendido en un contrato, desde que se marca en el contrato hasta que se entrega. En Tipos de retablo están las medidas y los valores de cada tipo.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **OPERACIONES Y LOGÍSTICA › PANEL GENERAL** (retablos) y **TIPOS DE RETABLO**.' },
      { type: 'steps', title: '📝 Vender y seguir un retablo', items: [
        '**Paso 1 · En el contrato:** en la sección **Retablo**, en **¿Incluye retablo?** toca **Sí** y elige el tipo en **Selecciona el tipo**. Al guardar el contrato, el retablo se crea en **Pendiente**.',
        '**Paso 2 · Abrir el panel:** entra a **PANEL GENERAL** y toca una tarjeta (**Pendiente**, **Pendiente por recoger** o **Entregado**) para filtrar.',
        '**Paso 3 · Buscar:** en **Buscar** escribe nombre, cédula, factura o contrato; también puedes filtrar por **Estado**, **Tipo**, **Desde** y **Hasta**.',
        '**Paso 4 · Listo:** cuando el retablo llegue a la tienda, toca **Listo para recoger** y confirma.',
        '**Paso 5 · Entregar:** cuando la clienta se lo lleve, toca **Entregado** y confirma.',
        '**Paso 6 · Corregir:** si algo está mal antes de entregarlo, toca **Volver a Pendiente** y escribe qué hay que corregir.',
        '**Paso 7 · Historial:** toca **Historial** para ver cada cambio, quién lo hizo y cuándo.'
      ] },
      { type: 'steps', title: '📝 Crear o cambiar un tipo de retablo (administración)', items: [
        '**Paso 1 · Abrir:** entra a **TIPOS DE RETABLO** y toca **Nuevo tipo** (o **Editar** en un tipo existente).',
        '**Paso 2 · Datos:** llena **Nombre**, **Ancho (cm)**, **Alto (cm)**, **Valor**, **Valor cliente** y **Valor empresa** (todos mayores que cero).',
        '**Paso 3 · Guardar:** toca **Guardar tipo**.',
        '**Paso 4 · Retirar:** para que un tipo ya no salga en el contrato, toca **Desactivar** (con **Activar** vuelve).'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: '**Entregado es final:** después no se puede cambiar. Si el contrato se anula, el retablo queda **Anulado** (se ven con **Ver anulados**). Un tipo ya vendido no se borra: se desactiva. Si tu rol solo ve lo suyo, en el panel aparecen los retablos de los contratos que tú registraste.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Valentina compró un retablo 40×70 en su contrato. Cuando llega a la tienda lo pasas a «Listo para recoger»; el día que lo recoge tocas «Entregado».' }
    ]
  },
  {
    id: 'estrene',
    title: '🛒 Pedidos estrene',
    description: 'Seguimiento de los vestidos que se piden nuevos al proveedor para una clienta.',
    icon: <Package className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Cuando un contrato es de alquiler estrene, el vestido se pide al proveedor. Aquí se sigue ese pedido hasta que llega y se entrega, con un semáforo que avisa si no alcanza a llegar antes de la entrega a la clienta.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **VENTAS Y CRM › PEDIDOS ESTRENE** (vistas **Kanban**, **Calendario** y **Lista**).' },
      { type: 'steps', title: '📝 Registrar un pedido', items: [
        '**Paso 1 · Abrir:** toca **Nuevo Pedido**.',
        '**Paso 2 · Contrato:** en **🔗 Contrato a Vincular** busca el contrato o la clienta y elígelo.',
        '**Paso 3 · Vestido:** escribe **Nombre / Referencia del Vestido**.',
        '**Paso 4 · Proveedor:** escribe el **Proveedor** y la **Referencia Compra**.',
        '**Paso 5 · Fechas:** pon la **Fecha de Compra** y la **ETA Llegada** (fecha estimada en que llega).',
        '**Paso 6 · Estado y notas:** elige el **Estado Inicial** y escribe **Observaciones Generales** si hace falta.',
        '**Paso 7 · Guardar:** toca **Crear Pedido**.'
      ] },
      { type: 'steps', title: '📝 Seguir el pedido', items: [
        '**Paso 1 · Abrir el pedido:** tócalo en el tablero o en la lista (**Ver →**).',
        '**Paso 2 · Cambiar el estado:** en **Cambiar Estado del Pedido** toca el estado: Pendiente de Compra → Comprado → En Tránsito → Recibido en Tienda → Entregado a Cliente.',
        '**Paso 3 · Anotar novedades:** en **Nueva Entrada de Bitácora** elige el tipo (**Nota**, **Novedad / Incidencia**…), escribe y toca **Registrar en Bitácora**.',
        '**Paso 4 · Revisar el semáforo:** 🟢 **A tiempo**, 🟡 **Ajustado — Riesgo** (llega 5 días o menos antes de la entrega), 🔴 **Crítico — No alcanza** (llega el mismo día o después).'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'Sin contrato vinculado no se puede crear el pedido. Cada cambio de estado queda registrado solo en la bitácora del pedido.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'El pedido de Valentina sale 🟡 ajustado: llega 3 días antes de su entrega. Llamas al proveedor, anotas «Confirma envío el lunes» en la bitácora y, cuando llega, lo pasas a «Recibido en Tienda».' }
    ]
  },
  {
    id: 'catalogo',
    title: '📸 Catálogo de vestidos',
    description: 'El catálogo para mostrar a las clientas: PDF y links públicos.',
    icon: <Images className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Muestra los vestidos del inventario por tipo y categoría, con foto y precio de alquiler, para enviarlos a las clientas en PDF o con un link público que siempre está al día con el inventario. Las fotos y los datos se corrigen en Inventario.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **VENTAS Y CRM › CATÁLOGO**.' },
      { type: 'steps', title: '📝 Filtrar y descargar el PDF', items: [
        '**Paso 1 · Filtrar:** elige **Tipo**, **Categoría** y **Sede**, o escribe en **Buscar** el código, nombre o color. Marca **Solo con foto** si quieres.',
        '**Paso 2 · Ver un vestido:** toca la tarjeta para ver sus fotos de frente, espalda y detalle.',
        '**Paso 3 · PDF:** toca **Catálogo PDF** (una foto por vestido) o **PDF con 3 fotos** (frente, espalda y detalle).'
      ] },
      { type: 'steps', title: '📝 Compartir un link público', items: [
        '**Paso 1 · Filtrar:** deja elegidos el **Tipo**, la **Categoría** y la **Sede** que quieres mostrar.',
        '**Paso 2 · Precios:** marca **Sin precios** si el link es para **aliados**: no muestra precios, promociones ni el botón «Agendar cita».',
        '**Paso 3 · Crear el link:** toca **Copiar link público**. El link queda copiado: pégalo en el chat de la clienta.',
        '**Paso 4 · Enlace fijo:** si elegiste sede y tipo, también puedes tocar **Copiar enlace fijo**; agrégale ?o=origen al final para saber de dónde llegan las citas.',
        '**Paso 5 · Administrar links:** abre **Links públicos** para **Copiar** de nuevo, **Desactivar** o **Activar** los que creaste.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'Las clientas **no ven** los vestidos sin foto, sin precio de alquiler o de solo venta: el aviso naranja dice cuántos son y con **Ver cuáles son** los encuentras para completarlos en Inventario. Si tu rol es de sede, solo ves el catálogo de tus sedes. El descuento de aliados nunca se muestra en el catálogo.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Una clienta de Bogotá busca vestido de XV. Filtras Tipo XV Años y Sede Bogotá, tocas «Copiar link público» y se lo envías por WhatsApp.' }
    ]
  },
  {
    id: 'caja',
    title: '🧾 Cierres de caja',
    description: 'Ingresos, egresos, abonos del ERP y cierre diario de la caja de cada sede.',
    icon: <Receipt className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Aquí queda todo el dinero que entra y sale de cada sede cada día, con su medio de pago, la cuenta donde quedó y su comprobante. Al final del día cuentas el efectivo por billetes y cierras la caja; así administración sabe dónde está cada peso.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **FINANZAS Y CONTABILIDAD › CIERRES DE CAJA**. Arriba están las pestañas **Caja del día**, **¿Dónde está la plata?**, **Depósitos (aparte)**, **Cuadre con Siigo** y **Cuentas y caja menor** (esta última según tu rol).' },
      { type: 'steps', title: '📝 Pasar los abonos del ERP a la caja', items: [
        '**Paso 1 · Abrir el día:** en la pestaña **Caja del día** elige la **Sede** y la **Fecha** y toca **Actualizar**.',
        '**Paso 2 · Ver el estado:** la franja de arriba dice **Caja abierta** o **Caja cerrada** (quién la cerró, a qué hora, cuánto contó y la diferencia).',
        '**Paso 3 · Abonos del día:** baja al recuadro **Registrados hoy en el ERP**. Ahí están los pagos de contratos que aún no están en la caja. No los vuelvas a escribir a mano.',
        '**Paso 4 · Medio y cuenta:** en cada pago elige el **medio** (si no lo trae) y la **Cuenta** donde llegó el dinero.',
        '**Paso 5 · Agregar:** toca **Agregar a la caja**. Cada pago entra una sola vez.',
        '**Paso 6 · Abonos de días anteriores:** si sale el aviso amarillo **«abonos de contratos sin pasar a caja»**, ábrelo y toca **Arreglar** en el primero. La guía te lleva: si el día está cerrado, lo reabres; agregas cada abono con su cuenta y vuelves a cerrar. Al terminar toca **Ir al siguiente**.',
        '**Paso 7 · Ingresos sin soporte:** si aparece **«ingresos sin soporte»**, toca **+ Adjuntar** en cada uno y sube la foto o el PDF del comprobante. Sin eso no deja cerrar la caja.'
      ] },
      { type: 'steps', title: '📝 Registrar un egreso u otro ingreso', items: [
        '**Paso 1 · Formulario:** con la caja abierta, ve al recuadro **Nuevo movimiento**.',
        '**Paso 2 · Tipo:** elige **Ingreso** o **Egreso**.',
        '**Paso 3 · Categoría:** elige la **Categoría** (por ejemplo transporte, compras o **Consignación a banco**).',
        '**Paso 4 · Medio y cuenta:** elige el **Medio** y, si no es efectivo, la **Cuenta donde llegó** (ingreso) o la **Cuenta de donde salió** (egreso).',
        '**Paso 5 · Valor:** escribe el **Valor (COP)**.',
        '**Paso 6 · Descripción:** escribe para qué fue (ej.: «taxi para entrega de vestido»). En egresos es obligatoria.',
        '**Paso 7 · Comprobante:** sube el **Comprobante** (PDF o imagen, máximo 10 MB). En egresos es obligatorio.',
        '**Paso 8 · Guardar:** toca **Registrar movimiento**. Aparece en **Movimientos del día**.',
        '**Paso 9 · Enviar el gasto a Siigo (sedes con Siigo activo):** en el egreso toca **Siigo**, elige **Compra o gasto** o **Documento soporte**, escribe el **NIT o cédula del proveedor** y elige la **cuenta contable** (búscala o toca **Ver todas**). Toca **Guardar para Siigo**. Se envía cuando se cierre la caja del día; hasta entonces lo puedes **Corregir**.',
        '**Base de caja:** si pones efectivo en el cajón para trabajar el día, toca **+ Agregar base de caja**. No necesita soporte y no cuenta como venta.'
      ] },
      { type: 'steps', title: '📝 Corregir, anular o reabrir', items: [
        '**Paso 1 · Editar:** en **Movimientos del día** toca **Editar** en el movimiento.',
        '**Paso 2 · Cambiar:** en **Editar movimiento** corrige el **Medio**, la **Cuenta donde está el dinero** o la **Descripción**. Contabilidad y administración también pueden cambiar **Valor** y **Categoría**. Si es un abono, el ERP lo corrige también en Siigo.',
        '**Paso 3 · Motivo:** escribe el **Motivo del cambio (obligatorio)** y toca **Guardar cambio**.',
        '**Paso 4 · Varios sin cuenta:** en **¿Dónde quedó el dinero de este día?**, si hay movimientos «Sin cuenta», toca **Asignar cuenta a todos los movimientos sin cuenta**, elige la cuenta, escribe el motivo y toca **Asignar cuenta**.',
        '**Paso 5 · Anular:** toca **Anular** y escribe el motivo (mínimo 5 letras). El movimiento queda tachado con su motivo; no se borra.',
        '**Paso 6 · Día cerrado:** para cambiar algo de un día cerrado, toca **Reabrir caja de este día** y escribe el motivo (mínimo 5 letras). El cierre anterior queda guardado en el historial.'
      ] },
      { type: 'steps', title: '📝 Cerrar la caja del día', items: [
        '**Paso 1 · Pendientes:** revisa el recuadro **Pendientes de la sede** y resuelve lo que diga (toca **Ir al** día que indique).',
        '**Paso 2 · Esperado:** en **Cerrar caja** mira el **Efectivo esperado**: saldo inicial + ingresos en efectivo − egresos en efectivo (incluye depósitos recibidos o devueltos en efectivo).',
        '**Paso 3 · Contar billetes:** en **Conteo por billetes (obligatorio)** escribe cuántos hay de cada valor (**Billetes de $100.000** hasta **$1.000**). Pon 0 donde no haya.',
        '**Paso 4 · Monedas:** escribe el total en **Monedas (valor total)**. El ERP suma el **Efectivo contado**.',
        '**Paso 5 · Diferencia:** mira si dice **Cuadra**, **Falta dinero** o **Sobra dinero**.',
        '**Paso 6 · Si hay diferencia:** escribe el motivo en **Observaciones** y sube la **Foto de los billetes contados**. Las dos son obligatorias.',
        '**Paso 7 · Cerrar:** toca **Cerrar caja del día** y confirma. Lo contado queda como saldo inicial del día siguiente.'
      ] },
      { type: 'steps', title: '📝 Consignar el excedente del cajón', items: [
        '**Paso 1 · Sin tope:** hoy el cajón **no tiene tope de efectivo** (administración puede volver a fijarlo en «Topes de efectivo por sede»); consigna cuando lo indique administración.',
        '**Paso 2 · Consignar:** lleva el excedente al banco y guarda el comprobante.',
        '**Paso 3 · Registrar:** en **Nuevo movimiento** elige **Egreso**, categoría **Consignación a banco** y medio **Efectivo**.',
        '**Paso 4 · Banco:** en **Banco donde se consignó** elige la cuenta donde quedó la plata, escribe el valor y sube el comprobante.',
        '**Paso 5 · Cerrar:** toca **Registrar movimiento** y luego cierra la caja. Sin la consignación no deja cerrar.'
      ] },
      { type: 'steps', title: '📝 Las otras pestañas', items: [
        '**¿Dónde está la plata?:** elige **Desde** y **Hasta** y ve, por cada cuenta, lo que **Entró**, **Salió** y el **Neto**, más el **Efectivo en caja (último cierre)**. Abajo, **Registrado en el ERP pero no en la caja** muestra los pagos que nadie ha agregado a la caja.',
        '**Depósitos (aparte):** los depósitos en garantía por sede y medio (**Recibidos**, **Devueltos**, **Retenido**, **Neto**). No entran a la caja ni a su cierre.',
        '**Cuadre con Siigo:** elige **Sede**, **Desde** y **Hasta**. Cada movimiento del ERP sale con su lugar en la **Caja** y su documento en **Siigo**; lo que no cuadra sale en **Novedad**.',
        '**Cuentas y caja menor:** toca **Nueva cuenta**, elige la **Clase**, el **Banco o plataforma**, el **Tipo de cuenta**, el **Número de cuenta** o la **Llave (Bre-B)**, el **Titular** y la **Sede** (sin sede sirve para todas). Toca **Crear cuenta**. Con **Editar** y **Desactivar** la ajustas.',
        '**Solo contabilidad y administración:** en esa misma pestaña están **Topes de efectivo por sede** (tope del cajón y de depósitos en efectivo) e **Inicio de la caja por sede** (fecha y saldo de inicio, con motivo).'
      ] },
      { type: 'steps', title: '📝 Novedades contables', items: [
        '**Paso 1 · Abrir:** en la pestaña **Caja del día** (o en Inicio) abre el recuadro **Novedades contables**.',
        '**Paso 2 · Elegir el grupo:** toca un tipo de novedad. Cada uno muestra cuántas hay y su **Responsable** (sede, contabilidad o administración).',
        '**Paso 3 · Resolver:** toca **Ir a resolver**: te lleva al contrato o a la caja exacta.',
        '**Paso 4 · Lo hecho en Siigo:** si la corrección se hizo directamente en Siigo, toca **Ya lo hice en Siigo** para que salga de la lista.'
      ] },
      { type: 'steps', title: '📝 Quién puede hacer qué', items: [
        '**Asesoras:** agregar abonos a la caja, registrar movimientos y cerrar la caja de su sede.',
        '**Con permiso de su rol (líder o franquiciado, en su sede):** corregir cuenta, medio o descripción, reabrir un día cerrado y configurar las cuentas.',
        '**Contabilidad y administración (todas las sedes):** todo lo anterior, más corregir valor y categoría, retener o liberar gastos para Siigo, topes e inicio de la caja.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: '**Los egresos llevan descripción y comprobante.** **No deja cerrar** si hay ingresos sin soporte, si hay diferencia sin motivo y sin foto, o si falta consignar el excedente del cajón. **Un día cerrado no recibe movimientos:** hay que reabrirlo con motivo. **Los depósitos en garantía no se registran aquí:** van por Depósitos y devoluciones.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Al final del día en Pereira: agregas 2 abonos desde «Registrados hoy en el ERP» (uno por Nequi, otro en efectivo), registras un egreso de $3.700 de insumos con foto del recibo, cuentas los billetes, el ERP dice «Cuadra» y tocas «Cerrar caja del día».' }
    ]
  },
  {
    id: 'depositos',
    title: '🔐 Depósitos y devoluciones',
    description: 'Pago del depósito de garantía de cada contrato, su devolución y las solicitudes a Contabilidad.',
    icon: <ShieldCheck className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Cada contrato tiene un depósito de garantía. Aquí registras cada pago del depósito con su comprobante, apruebas la devolución cuando vuelve el vestido (completa o con descuento por daños) y Contabilidad paga las devoluciones por transferencia. El depósito no es venta: se lleva aparte de la caja.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **FINANZAS Y CONTABILIDAD › DEPÓSITOS Y DEVOLUCIONES**. Arriba ves **Depósitos registrados**, **Devuelto a clientes**, **Descuentos aplicados** y **Saldo por devolver**.' },
      { type: 'steps', title: '📝 Registrar un pago de depósito', items: [
        '**Paso 1 · Buscar el contrato:** en la tabla de contratos escribe en **«Cliente, documento o contrato»** el nombre, la cédula o el número del contrato.',
        '**Paso 2 · Filtrar (opcional):** usa **«Todas las sedes disponibles»** para ver tu sede y **«Todos los depósitos»** para ver un estado (ej.: «Pendiente de pago»).',
        '**Paso 3 · Abrir:** en la columna **Gestión** toca **+ Pago de depósito**. Se abre **«Pago de depósito · falta $…»**.',
        '**Si dice «Adjuntar comprobante»:** el contrato tiene un depósito anterior sin soporte. Súbelo primero y toca **Guardar comprobante sin sumar dinero**.',
        '**Paso 4 · Monto:** escribe el **Monto recibido (COP)**. No deja poner más de lo que falta.',
        '**Paso 5 · Fecha:** elige la **Fecha de recepción** (el día en que realmente recibiste el dinero).',
        '**Paso 6 · Método:** elige **Efectivo**, **Transferencia**, **Tarjeta** u **Otro**.',
        '**Paso 7 · Cuenta:** en **«Cuenta o caja de la sede donde se movió el dinero»** elige dónde entró. Si no es efectivo, es obligatoria.',
        '**Paso 8 · Observaciones (opcional):** por ejemplo «primer pago».',
        '**Paso 9 · Comprobante:** sube el soporte en **Comprobante obligatorio** (PDF o imagen, máximo 10 MB).',
        '**Paso 10 · Guardar:** toca **Registrar depósito recibido** y espera el mensaje de confirmación.',
        '**Paso 11 · Pagos por partes:** repite los pasos 3 a 10 por cada pago, cada uno con su comprobante.'
      ] },
      { type: 'steps', title: '📝 Consultar el historial de un contrato', items: [
        '**Paso 1 · Abrir:** toca **Historial** en la fila del contrato.',
        '**Paso 2 · Leer:** abajo sale **«Historial de depósitos y devoluciones»** con **Pactado**, **Pagado**, **Estado** y **Disponible**.',
        '**Paso 3 · Filtrar fechas:** usa **Desde** y **Hasta**.',
        '**Paso 4 · Soporte:** toca **Ver comprobante** en cada movimiento.',
        '**Paso 5 · Contrato:** toca **Ver contrato completo** para abrir el contrato.'
      ] },
      { type: 'steps', title: '📝 Aprobar la devolución del depósito', items: [
        '**Paso 1 · Recibir el vestido:** primero registra en el contrato que el vestido volvió. Si no, el botón queda gris («Primero recibe el vestido en el contrato»).',
        '**Paso 2 · Abrir:** busca el contrato y toca **Aprobar devolución**. Se abre **«Aprobar devolución del depósito»**.',
        '**Paso 3 · Monto:** revisa el **Monto a devolver al cliente (COP)**; viene con el saldo disponible.',
        '**Paso 4 · Descuento (si hay daño o multa):** escribe el **Descuento aplicado (COP)** y el **Motivo del descuento**, y baja el monto a devolver en ese mismo valor.',
        '**Paso 5 · Fecha y método:** elige la fecha y el **Método**: **Efectivo** o **Transferencia**.',
        '**Paso 6 · Si es transferencia:** escribe **Nombre del titular**, **Cédula del titular**, **Banco**, **Tipo de cuenta o llave** y el **Número de cuenta** o la **Llave**. El ERP revisa el formato.',
        '**Paso 7 · Si es efectivo:** sube el **Comprobante obligatorio**.',
        '**Paso 8 · Confirmar:** marca **«Confirmo que el vestido fue recibido y revisado correctamente»**.',
        '**Paso 9 · Guardar:** toca **Enviar solicitud a Contabilidad** (transferencia) o **Registrar devolución en efectivo**.'
      ] },
      { type: 'steps', title: '📝 Pagar una solicitud de devolución (Contabilidad)', items: [
        '**Paso 1 · Bandeja:** baja a **Solicitudes e historial de devoluciones** y deja el filtro en **Pendientes de pago**.',
        '**Paso 2 · Abrir:** toca **Ver solicitud**. Si dice «FALTA INFORMACIÓN DE CUENTA», toca **Editar datos de devolución** y complétalos.',
        '**Paso 3 · Tomar:** toca **Tomar solicitud e iniciar pago**. Queda **En proceso de pago** a tu nombre.',
        '**Paso 4 · Transferir:** haz la transferencia en el banco.',
        '**Paso 5 · Registrar:** escribe la **Fecha del pago**, elige la cuenta de donde salió y sube el **Comprobante de salida obligatorio**.',
        '**Paso 6 · Guardar:** toca **Registrar pago y comprobante**. El depósito queda devuelto.',
        '**Otras acciones:** **Retomar pago a mi nombre** (si otra persona la tenía en proceso), **Cancelar solicitud** (con motivo, mientras está pendiente) y **EXPORTAR PENDIENTES A EXCEL**.'
      ] },
      { type: 'steps', title: '📝 Movimientos del día y desistimientos', items: [
        '**Movimientos del día:** elige la **Fecha** y ve los ingresos y devoluciones de ese día con su comprobante. Es solo consulta.',
        '**Desistimientos · Paso 1:** en **Desistimientos** busca el contrato cancelado con abonos y toca **Liquidar**.',
        '**Desistimientos · Paso 2:** toca **Registrar devolución**, elige **Fecha**, **Medio** y cuenta, y sube el **Comprobante (foto o PDF)**. Sale de la caja de la sede; no es gasto.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: '**Todo pago de depósito lleva comprobante y cuenta**, y no puede pasar de lo que falta. **Solo se aprueba la devolución con el vestido recibido** en el contrato y con la casilla de revisión marcada. **El descuento siempre lleva motivo.** La devolución por transferencia la paga Contabilidad con el comprobante de salida.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Laura paga $200.000 de depósito: $100.000 por Nequi el lunes y $100.000 en efectivo el viernes. Registras dos «Pago de depósito», cada uno con su comprobante. Tras el evento, el vestido vuelve con una mancha: apruebas la devolución con $30.000 de descuento («mancha en la falda») y la envías a Contabilidad por transferencia.' }
    ]
  },
  {
    id: 'bancos',
    title: '🏦 Bancos y conciliación',
    description: 'Subir el extracto de cada cuenta y cruzarlo con lo que registra el ERP.',
    icon: <Wallet className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Subes el extracto del banco de cada cuenta y el ERP lo cruza con lo que tiene registrado. Lo que está en el banco y no en el ERP, o al revés, queda a la vista para revisarlo. Lo usan contabilidad y administración, cada mes.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **FINANZAS Y CONTABILIDAD › BANCOS Y CONCILIACIÓN**.' },
      { type: 'steps', title: '📝 Cargar el extracto', items: [
        '**Paso 1 · Elegir la cuenta:** arriba elige la **Cuenta** y las fechas **Desde** y **Hasta**. Si no hay cuentas, créalas en Cierres de caja › Cuentas y caja menor.',
        '**Paso 2 · Descargar:** en la banca en línea descarga el extracto del mes en **CSV**. Si te lo da en Excel, ábrelo y guárdalo como CSV.',
        '**Paso 3 · Subir:** en **Cargar extracto** toca el botón de archivo y elige el CSV.',
        '**Paso 4 · Fila de títulos:** revisa que **Fila de títulos** sea la fila con los nombres de las columnas.',
        '**Paso 5 · Columnas:** confirma **Fecha**, **Descripción**, **Referencia** y el valor: **Valor (con signo)** si viene en una sola columna, o **Entradas** y **Salidas** si vienen separadas. **Saldo** es opcional.',
        '**Paso 6 · Revisar:** lee el ejemplo que muestra el ERP («Se reconocen N movimientos…»).',
        '**Paso 7 · Cargar:** toca **Cargar N movimientos**. El ERP cruza solos los que tienen el mismo valor y hasta 4 días de diferencia. Si subes el mismo periodo otra vez, lo repetido no se duplica.'
      ] },
      { type: 'steps', title: '📝 Revisar lo que no cruzó', items: [
        '**Paso 1 · Resumen:** mira **Entró según el banco**, **Salió según el banco**, **Saldo del extracto**, **Del banco sin cruzar** y **Del ERP sin respaldo en el banco**.',
        '**Paso 2 · Movimientos del banco:** en **Ver** deja **Solo sin cruzar** (o **Todos**).',
        '**Paso 3 · Cruzar a mano:** toca **Cruzar** y elige en la lista el movimiento del ERP que corresponde.',
        '**Paso 4 · Ignorar:** si no es del ERP (ej.: comisión bancaria), toca **Ignorar**, escribe el motivo y toca **Ignorar** otra vez.',
        '**Paso 5 · Deshacer:** si te equivocaste, toca **Deshacer** en ese movimiento.',
        '**Paso 6 · Del ERP sin respaldo:** revisa la tabla **Del ERP sin respaldo en el banco**: lo que el ERP dice que entró o salió de esa cuenta y el banco no muestra.',
        '**Paso 7 · Cuenta de depósitos:** en la cuenta de depósitos compara el **Saldo del extracto** con **Depósitos que deberían estar en custodia**.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: '**Solo se aceptan archivos CSV.** Lo que quede del banco sin cruzar más de 3 días sale en **Novedades contables**. Ignorar un movimiento pide motivo y se puede deshacer.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'El 2 de diciembre subes el CSV de noviembre de Bancolombia: se cruzan solos 118 movimientos. Quedan 3: una comisión (la ignoras con el motivo «comisión bancaria») y dos transferencias que cruzas a mano con sus abonos.' }
    ]
  },
  {
    id: 'pagos_fijos',
    title: '📅 Pagos fijos de sede',
    description: 'Arriendos, servicios y demás pagos fijos de cada sede, con calendario y aviso antes de vencer.',
    icon: <CalendarDays className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Guardas una vez los pagos fijos de cada sede (arriendo, energía, agua, internet…). El ERP crea cada cuota, avisa antes del vencimiento y, al pagarla, registra el egreso en Cierres de caja con su comprobante.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **FINANZAS Y CONTABILIDAD › PAGOS FIJOS DE SEDE**. Pestañas **Calendario de pagos** y **Conceptos**.' },
      { type: 'steps', title: '📝 Crear un pago fijo (concepto)', items: [
        '**Paso 1 · Abrir:** toca la pestaña **Conceptos** y luego **Nuevo concepto**.',
        '**Paso 2 · Sede y categoría:** elige la **Sede** y la **Categoría** (Arriendo, Servicios públicos, Internet y telefonía…).',
        '**Paso 3 · Nombre:** escribe el **Nombre** (ej.: «Energía (Enel)»).',
        '**Paso 4 · Proveedor y referencia (opcional):** escribe el **Proveedor** y la **Referencia de pago o n.º de cuenta**.',
        '**Paso 5 · Frecuencia:** elige **Mensual**, **Bimestral**, **Trimestral**, **Semestral**, **Anual** o **Una sola vez**.',
        '**Paso 6 · Vencimiento:** elige el **Primer vencimiento**; ese día se repite.',
        '**Paso 7 · Valor:** escribe el **Valor**. Marca **«El valor es fijo»** si siempre es igual; si no, queda como aproximado.',
        '**Paso 8 · Aviso:** en **Avisar con (días de anticipación)** escribe cuántos días antes quieres el aviso.',
        '**Paso 9 · Medio habitual:** elige el **Medio de pago habitual** y la **Cuenta habitual**.',
        '**Paso 10 · Guardar:** toca **Guardar**.',
        '**Pausar:** toca **Pausar** en el concepto si ya no se paga. Se anulan sus cuotas pendientes futuras; lo pagado queda igual.'
      ] },
      { type: 'steps', title: '📝 Pagar una cuota', items: [
        '**Paso 1 · Calendario:** en **Calendario de pagos** elige la sede (o **Todas mis sedes**) y mira el mes. Rojo = vencida, amarillo = pendiente, verde = pagada.',
        '**Paso 2 · Buscar la cuota:** abajo está en **Vencidas**, **Vencen en los próximos 7 días** o **Próximas**.',
        '**Paso 3 · Ajustar (si llegó la factura con otro valor):** toca **Ajustar fecha o valor**, cambia la **Nueva fecha de vencimiento** o el **Valor** y toca **Guardar**. Solo cambia esa cuota.',
        '**Paso 4 · Registrar:** toca **Registrar pago**.',
        '**Paso 5 · Datos:** escribe la **Fecha del pago** y el **Valor pagado**, elige el **Medio** y **¿De qué cuenta salió?**.',
        '**Paso 6 · Comprobante:** sube el **Comprobante (foto o PDF, obligatorio)**.',
        '**Paso 7 · Guardar:** toca **Registrar pago**. La cuota pasa a **Pagadas este mes** y queda como egreso en Cierres de caja de la sede.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: '**Sin comprobante no deja pagar.** La fecha del pago debe ser de hoy o de los últimos 31 días y **ese día de caja debe estar abierto**. Solo administración puede **Apagar alerta**.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Creas «Arriendo local» para Pereira, mensual, día 5, $2.500.000 fijo, aviso 5 días antes. El 1 de cada mes sale en «Vencen en los próximos 7 días»; el 5 pagas por transferencia, subes el soporte y queda en la caja del día.' }
    ]
  },
  {
    id: 'gastos',
    title: '💸 Gastos, sedes y socios',
    description: 'Gastos de cada sede y de la administración, plata entre sedes, préstamos de socios y estado de resultados.',
    icon: <BarChart3 className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Registras los gastos de cada sede y de la administración con su comprobante, los retiros de utilidades, los traslados o préstamos entre sedes y los préstamos de los socios. Lo que sale de la caja o de una cuenta de una sede queda también en sus Cierres de caja. En **Estado de resultados** ves cuánto gana cada sede.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **FINANZAS Y CONTABILIDAD › GASTOS, SEDES Y SOCIOS**. Pestañas **Gastos**, **Entre sedes** (contabilidad y administración), **Préstamos de socios** y **Estado de resultados**.' },
      { type: 'steps', title: '📝 Registrar un gasto', items: [
        '**Paso 1 · Abrir:** en la pestaña **Gastos** toca **+ Registrar gasto**.',
        '**Paso 2 · Tipo (contabilidad y administración):** elige **Gasto** o **Retiro de utilidades (socios)**.',
        '**Paso 3 · Dueño del gasto:** en **¿De quién es el gasto?** elige la sede (o **Administración general**).',
        '**Paso 4 · Categoría y fecha:** elige la **Categoría** y la **Fecha**.',
        '**Paso 5 · Valor y medio:** escribe el **Valor**, elige el **Medio** y **¿De qué cuenta salió?**. Un gasto en efectivo sale de la caja menor de una sede.',
        '**Paso 6 · A quién:** en **A quién se pagó** elige el proveedor o escribe el nombre.',
        '**Paso 7 · Descripción:** escribe para qué fue (ej.: «pago honorarios contador noviembre»).',
        '**Paso 8 · Comprobante:** sube el **Comprobante (foto o PDF, obligatorio)**.',
        '**Paso 9 · Guardar:** toca **Registrar gasto**.',
        '**Si la caja de ese día está cerrada:** elige **1. Reabrir ese día y registrar el gasto** (luego vuelve a cerrar ese día) o **2. Usar la fecha de hoy**.',
        '**Paso 10 · Siigo:** en el gasto toca **Enviar a Siigo**, elige **¿Qué entregó el proveedor?**, escribe **NIT o cédula del proveedor** y toca **Enviar**.',
        '**Corregir:** un gasto mal registrado se **Anula** con motivo (también se anula en Cierres de caja) y se vuelve a registrar.'
      ] },
      { type: 'steps', title: '📝 Plata entre sedes (contabilidad y administración)', items: [
        '**Paso 1 · Abrir:** en **Entre sedes** toca **+ Registrar movimiento**.',
        '**Paso 2 · Tipo:** elige **Traslado**, **Préstamo** o **Devolución de préstamo**, y la **Fecha**.',
        '**Paso 3 · Origen y destino:** elige **Sale de** y **Entra a** (caja o cuenta de cada sede).',
        '**Paso 4 · Valor y nota:** escribe el **Valor** y la **Nota** (para qué es).',
        '**Paso 5 · Guardar:** sube el comprobante y toca **Registrar**. Queda en los Cierres de caja de ambas sedes; no es venta ni gasto.',
        '**Deudas:** arriba ves **Préstamos pendientes entre sedes**. Una deuda vieja se carga con **+ Saldo inicial al 30/10** (no mueve cajas).'
      ] },
      { type: 'steps', title: '📝 Préstamos de socios', items: [
        '**Paso 1 · Abrir:** en **Préstamos de socios** toca **+ Préstamo o devolución**.',
        '**Paso 2 · Tipo:** elige **Préstamo del socio a la sede** o **Devolución de la sede al socio**.',
        '**Paso 3 · Datos:** elige el **Socio**, la **Sede que debe**, la **Fecha** y la caja o cuenta donde entra o de donde sale.',
        '**Paso 4 · Guardar:** escribe el **Valor** y la **Nota**, sube el comprobante y toca **Registrar**.',
        '**Saldos:** arriba ves lo que cada sede le debe a cada socio. Una deuda anterior se carga con **+ Saldo inicial al 30/10**.'
      ] },
      { type: 'steps', title: '📊 Leer el estado de resultados', items: [
        '**Paso 1 · Abrir:** toca la pestaña **Estado de resultados**.',
        '**Paso 2 · Fechas:** elige **Desde** y **Hasta** (por defecto, el mes en curso).',
        '**Paso 3 · Totales:** mira **Ingresos**, **Gastos**, **Utilidad** y **Margen**.',
        '**Paso 4 · Por sede:** toca una sede para ver el detalle por concepto.',
        '**Paso 5 · Punto de equilibrio:** mira **Gastos fijos**, **Equilibrio**, **Resultado** y **Contratos hechos / necesarios** de cada sede.',
        '**Paso 6 · Fuente (contabilidad y administración):** en **Fuente** cambia entre **ERP (caja y gastos)** y **Siigo (facturas y compras)**.',
        '**Paso 7 · Trazabilidad de ventas:** con la fuente Siigo ves por sede **Vendido**, **Abonos ERP**, **Facturado Siigo**, **Cobrado Siigo** y **Sin rastro**.',
        '**Qué no cuenta:** depósitos en garantía, base de caja, consignaciones, dinero entre sedes o socios ni retiros de utilidades. Lo retenido de un depósito por daños sí cuenta como ingreso.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: '**Todo gasto lleva comprobante y descripción.** Si sale de la caja o de una cuenta de una sede, la fecha debe ser de los últimos 31 días y **ese día de caja debe estar abierto**. **La utilidad solo es real si cada sede registra todos sus gastos** (arriendo, nómina, servicios, insumos).' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'El contador cobra $800.000 de honorarios a la administración: registras el gasto en «Administración general», categoría «Honorarios (contador, abogado)», por transferencia, con su cuenta de cobro, y luego tocas «Enviar a Siigo».' }
    ]
  },
  {
    id: 'facturacion',
    title: '🔑 Facturación por sede',
    description: 'Credenciales de Siigo de cada sede, envío automático y conceptos del contrato (solo administración).',
    icon: <Settings className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Cada sede factura en su propia cuenta de Siigo. Aquí administración guarda las credenciales de cada sede, elige los documentos y cuentas contables, activa el envío automático y define los conceptos que se pueden agregar al contrato además del vestido.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **FINANZAS Y CONTABILIDAD › FACTURACIÓN POR SEDE**. Solo la ve administración.' },
      { type: 'steps', title: '📝 Conectar una sede con Siigo', items: [
        '**Paso 1 · Buscar la sede:** cada sede tiene su recuadro. Abajo del nombre dice **Access Key configurado** o **Sin credenciales**.',
        '**Paso 2 · Credenciales:** escribe el **Usuario API**, el **Partner-ID** y el **Access Key**.',
        '**Paso 3 · Producto:** revisa el **Código producto genérico** y el **Nombre producto** (por defecto, «Alquiler de Vestido»).',
        '**Paso 4 · Guardar:** toca **Guardar credenciales de** la sede. El Access Key no vuelve a mostrarse; para cambiarlo escribe uno nuevo.'
      ] },
      { type: 'steps', title: '📝 Configurar el envío automático', items: [
        '**Paso 1 · Traer opciones:** en **Envío automático a Siigo** toca **Traer opciones desde Siigo**.',
        '**Paso 2 · Documentos:** elige la **Factura por defecto** (**Electrónica** o **De ingreso**) y cada documento: factura, recibo de caja, nota crédito, comprobantes y documento soporte.',
        '**Paso 3 · Vendedor e inventario:** elige el **Vendedor** y el **Grupo de inventario (vestidos nuevos)**.',
        '**Paso 4 · Formas de pago:** en **Formas de pago (ERP → Siigo)** une cada medio del ERP con su forma de pago de Siigo (incluida la de crédito).',
        '**Paso 5 · Cuentas contables:** en **Cuentas contables (las define la contadora)** llena anticipos, ingreso por daños, caja, banco, gastos y las demás.',
        '**Paso 6 · Catálogo de cuentas:** toca **Cargar catálogo de cuentas (Excel de Siigo)** y sube el Excel. Así se pueden elegir cuentas al enviar gastos.',
        '**Paso 7 · Socios:** en **Socios** escribe uno por línea como Nombre=cédula.',
        '**Paso 8 · Guardar:** toca **Guardar parámetros de** la sede.',
        '**Paso 9 · Activar:** marca **Enviar a Siigo** y confirma. Desde ese momento la sede trabaja solo en el ERP: no se digita a mano en Siigo.',
        '**Herramientas:** **Cruzar vestidos con Siigo** (une productos), **Vincular facturas hechas a mano** y **Enviar cola ahora** (manda lo pendiente). Abajo ves **Documentos para Siigo** con su estado.',
        '**Factura que ya existe en Siigo:** si la clienta ya tiene en Siigo una factura hecha a mano por el mismo valor (60 días alrededor de la fecha del contrato), el ERP **no factura de nuevo** y deja el aviso «Esta clienta ya tiene en Siigo la factura FV-…». Toca **Vincular facturas hechas a mano** o, si esa factura sobra, anúlala con nota crédito y reenvía la cola.'
      ] },
      { type: 'steps', title: '🔗 Vincular una factura hecha a mano en Siigo', items: [
        '**¿Cuándo?:** cuando la venta ya se facturó directamente en Siigo (ej.: FV-1-372). Sin vincular, el ERP no factura de nuevo pero deja el aviso «Esta clienta ya tiene en Siigo la factura FV-…» y el contrato sale como **sin factura**.',
        '**Paso 1 · Número (líder o cobradora):** en Siigo copia el número completo de la factura de la clienta (ej.: **FV-1-372**).',
        '**Paso 2 · Contrato (líder o cobradora):** en el Dashboard abre el contrato › **Gestionar** › **Legalizar Factura**, escribe el número tal como sale en Siigo y guarda. Si estás creando el contrato, escríbelo antes de guardarlo.',
        '**Paso 3 · Avisar:** pasa a administración o a la contadora el número del contrato y el de la factura.',
        '**Paso 4 · Vincular (administración o contadora):** aquí, en la tarjeta de la sede, toca **Vincular facturas hechas a mano**.',
        '**Paso 5 · Revisar el resultado:** **Vinculados** (ej.: «VILL-0260 → FV-1-372») quedan listos; **No encontrados** tienen el número mal escrito o la factura es de otra sede: corrige el número en el contrato y repite el paso 4.',
        '**Después:** el contrato queda con su factura y sale de «Contrato sin factura en Siigo»; los abonos siguientes van a Siigo como recibos de caja contra esa factura.',
        '**Ojo:** no factures a mano en Siigo lo que se registra en el ERP. Si ya existen la factura del ERP y la hecha a mano (duplicadas), no se vincula: la contadora anula una con nota crédito.'
      ] },
      { type: 'steps', title: '📝 Conceptos del contrato', items: [
        '**Paso 1 · Ubicar:** baja hasta **Conceptos del contrato**.',
        '**Paso 2 · Crear:** escribe el **Nuevo concepto** (ej.: «Velo», «Corona»), su tipo y el **Precio sugerido**, y toca **Crear**.',
        '**Paso 3 · Producto en Siigo:** elige su producto en cada sede o déjalo vacío: la primera factura lo crea solo y lo deja enlazado.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: '**Para guardar las credenciales hay que escribir el Access Key.** **Enviar a Siigo solo se activa** con factura, recibo de caja, forma de pago de crédito, grupo de inventario y cuenta de anticipos elegidos. Con el envío activo, todo contrato, abono, depósito y gasto va a Siigo desde el ERP.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Abres una sede nueva: guardas sus credenciales, tocas «Traer opciones desde Siigo», la contadora elige documentos y cuentas, cargas el catálogo de cuentas, guardas los parámetros y marcas «Enviar a Siigo».' }
    ]
  },
  {
    id: 'proveedores',
    title: '🚚 Proveedores',
    description: 'Catálogo de servicios para asesoras, gestión de proveedores, tarifas y pagos.',
    icon: <Truck className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Reúne a los proveedores de servicios (fotografía, maquillaje, locaciones, etc.) con sus tarifas por sede. Las asesoras consultan el catálogo y asignan el servicio dentro del contrato; administración maneja los datos del proveedor y le paga los servicios realizados.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **FINANZAS Y CONTABILIDAD** › **CATÁLOGO DE PROVEEDORES** (todas), **GESTIÓN DE PROVEEDORES** y **PAGOS A PROVEEDORES** (solo administración).' },
      { type: 'steps', title: '📝 Consultar el catálogo (asesoras)', items: [
        '**Paso 1 · Abrir:** entra a **CATÁLOGO DE PROVEEDORES**.',
        '**Paso 2 · Elegir sede:** en **Sede** escoge la sede del contrato (por defecto sale la tuya).',
        '**Paso 3 · Filtrar:** en **Servicio** elige el tipo (por ejemplo fotografía) o escribe en **Buscar** el proveedor, paquete o lugar.',
        '**Paso 4 · Revisar:** mira **Qué incluye y condiciones** y el **Precio al cliente**.',
        '**Paso 5 · Ver condiciones:** toca **Condiciones** para leer los documentos del proveedor antes de ofrecerlo.'
      ] },
      { type: 'steps', title: '📝 Asignar un proveedor a un contrato', items: [
        '**Paso 1 · Abrir el contrato:** busca el contrato y ubica el bloque **Proveedores del contrato**.',
        '**Paso 2 · Servicio:** en **Servicio** elige el tipo de servicio.',
        '**Paso 3 · Tarifa:** en **Proveedor y tarifa** elige el proveedor; revisa el **Precio al cliente** y, si quieres, toca **Ver condiciones del proveedor**.',
        '**Paso 4 · Fecha y hora:** escribe la **Fecha** y la **Hora** del servicio.',
        '**Paso 5 · Lugar:** en **Lugar y notas para el proveedor** escribe la dirección o punto de encuentro.',
        '**Paso 6 · Asignar:** toca **Asignar proveedor**. Los valores se copian de la tarifa.',
        '**Paso 7 · Cerrar el servicio:** cuando el proveedor cumpla, toca **Marcar realizado** (o **Cancelar** si no se hizo).'
      ] },
      { type: 'steps', title: '📝 Crear un proveedor y sus tarifas (administración)', items: [
        '**Paso 1 · Nuevo:** en **GESTIÓN DE PROVEEDORES**, pestaña **Proveedores**, toca **Nuevo proveedor**.',
        '**Paso 2 · Datos básicos:** revisa el **Código** (sale solo), elige el **Tipo de servicio** y escribe el **Nombre**, **Celular** (10 dígitos) y **Correo**.',
        '**Paso 3 · Sedes:** marca las **Sedes donde trabaja** y toca **Crear proveedor**. Se abre su ficha.',
        '**Paso 4 · Pestaña Datos:** completa **Cédula o NIT**, **Banco**, **Tipo de cuenta o llave** y el número; toca **Guardar datos**.',
        '**Paso 5 · Pestaña Tarifas:** toca **Nueva tarifa**, elige **Sede** y **Servicio** y escribe la **Descripción del paquete**.',
        '**Paso 6 · Valores:** escribe el **Valor a empresa (se le paga al proveedor)**, el **Valor al cliente** y, si aplica, el **Adicional obligatorio** con su detalle o el **Adicional opcional**.',
        '**Paso 7 · Guardar:** toca **Guardar tarifa**. Revisa la columna **Margen**: si sale «⚠ Precio menor que el costo», corrige.',
        '**Paso 8 · Cambiar precio:** para subir o bajar un valor usa **Cambiar precio** (no edites la tarifa vieja); para quitarla usa **Desactivar**.',
        '**Paso 9 · Documentos:** en la pestaña **Documentos** elige **Tipo**, escribe el **Título**, la **Visibilidad**, el **Vence el (opcional)**, adjunta el archivo y toca **Subir documento**.',
        '**Paso 10 · Acceso al portal (opcional):** con el correo guardado, toca **Crear usuario** y comparte el usuario y la contraseña temporal con el proveedor.'
      ] },
      { type: 'steps', title: '📝 Pagar a un proveedor (administración)', items: [
        '**Paso 1 · Abrir:** entra a **PAGOS A PROVEEDORES** y filtra por **Sede** o **Proveedor** si quieres.',
        '**Paso 2 · Marcar:** en **Servicios por pagar** marca uno o varios servicios en estado «Realizado · pendiente» del mismo proveedor.',
        '**Paso 3 · Revisar:** en **Registrar pago** confirma el **Total a pagar** y los datos bancarios.',
        '**Paso 4 · Datos del pago:** escribe la **Fecha del pago**, el **Medio** y la **Referencia (número de transacción)**.',
        '**Paso 5 · Soporte:** adjunta el **Comprobante (PDF o imagen)**.',
        '**Paso 6 · Guardar:** toca **Guardar pago**. Queda en **Pagos registrados**, donde puedes ver el **Comprobante** o **Enviar a Siigo**.',
        '**Paso 7 · Si te equivocaste:** toca **Anular** y escribe el motivo; los servicios vuelven a Pendiente.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: '**El costo del proveedor y el margen son internos:** solo administración los ve; la asesora solo ve el precio al cliente. **Solo se pagan servicios marcados Realizado**, y cada pago es para un solo proveedor. Las asesoras solo ven proveedores con tarifas activas en la sede del contrato. **Un proveedor nunca se borra:** se marca Inactivo y deja de salir en el catálogo. Los documentos «Interno» solo los ve administración.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Una clienta quiere sesión de fotos: abres el catálogo, filtras Fotografía en tu sede, le muestras el precio al cliente y en el contrato asignas el proveedor con fecha y lugar. Después de la sesión lo marcas Realizado y administración se lo paga con el comprobante.' }
    ]
  },
  {
    id: 'correo',
    title: '✉️ Correo y promociones',
    description: 'Promociones vigentes, correos automáticos, envíos por segmento y reglas de envío.',
    icon: <Mail className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Aquí se crean las promociones de la marca y se manejan los correos que salen a las personas con autorización comercial: automatizaciones (bienvenida, agradecimiento, etc.), envíos manuales por segmento, reglas de horario y cupo, y el embudo de resultados.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **MARKETING** › **CORREO** (abre Automatizaciones) o **PROMOCIONES**. Pestañas: Promociones, Automatizaciones, Envíos, Reglas y Embudo.' },
      { type: 'steps', title: '📝 Crear una promoción (administración)', items: [
        '**Paso 1 · Abrir:** entra a **PROMOCIONES** y toca **+ Nueva promoción**.',
        '**Paso 2 · Nombre:** escribe el **Nombre** de la promoción.',
        '**Paso 3 · Beneficio:** en **Beneficio** elige **Porcentaje**, **Valor fijo** o **Incluido**, y escribe el valor o **Qué incluye**.',
        '**Paso 4 · Vigencia:** escribe **Desde** y **Hasta**; si quieres, un **Código (opcional)**.',
        '**Paso 5 · A quién aplica:** marca **Sedes**, **Tipos** y **Categorías** (si no marcas ninguna, aplica a todas).',
        '**Paso 6 · Condiciones:** escribe las **Condiciones** y deja marcada **Activa**.',
        '**Paso 7 · Guardar:** toca **Guardar**. Para cambiarla después usa **Editar**; para pausarla desmarca **Activa**.'
      ] },
      { type: 'steps', title: '📝 Ajustar una automatización (administración)', items: [
        '**Paso 1 · Abrir:** entra a **CORREO**, pestaña **Automatizaciones**.',
        '**Paso 2 · Editar:** en la automatización toca **Editar**.',
        '**Paso 3 · Momento y sedes:** ajusta el **Momento** (horas) y marca las **Sedes** (ninguna = todas).',
        '**Paso 4 · Texto:** cambia el **Asunto** y el **Texto**; puedes usar los datos automáticos que aparecen debajo.',
        '**Paso 5 · Guardar:** toca **Guardar**. Para detenerla sin borrarla toca **Apagar** (y **Encender** para volver a activarla).'
      ] },
      { type: 'steps', title: '📝 Hacer un envío manual (administración)', items: [
        '**Paso 1 · Abrir:** pestaña **Envíos**.',
        '**Paso 2 · Segmento:** elige **Sede**, **Tipo de vestido**, **Etapa**, **Promoción** y las fechas de evento o de última visita que necesites.',
        '**Paso 3 · Contar:** toca **Calcular destinatarios** y revisa cuántas personas son.',
        '**Paso 4 · Contenido:** escribe el **Nombre del envío**, el **Asunto** y el **Texto**.',
        '**Paso 5 · Enviar:** toca **Enviar** y confirma. Los correos salen poco a poco, dentro del horario y del cupo diario.'
      ] },
      { type: 'steps', title: '📝 Reglas y resultados', items: [
        '**Paso 1 · Reglas:** en la pestaña **Reglas** ajusta máximos por persona, horario, **Cupo diario total** y **No enviar domingos ni festivos**; toca **Guardar reglas**.',
        '**Paso 2 · Embudo:** en la pestaña **Embudo** elige **Desde** y **Hasta** para ver citas, asistencias y contratos logrados por cada automatización y envío.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'Solo reciben quienes tienen **autorización comercial vigente**. Los envíos se detienen si la persona alquila, se da de baja o su seguimiento se cierra con «No contactar». A quien tiene contrato vigente solo le llegan la bienvenida y el agradecimiento. Lo que no cabe en el cupo o el horario queda en cola (hora de Colombia). Solo administración ve las pestañas de correo; las demás personas solo consultan las promociones.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Para noviembre creas la promoción «Gala 15 %» solo para Gala, del 1 al 30. Luego, en Envíos, eliges Tipo Gala, calculas destinatarios y envías el correo con esa promoción.' }
    ]
  },
  {
    id: 'estudio_contenido',
    title: '🎬 Estudio de contenido',
    description: 'Piezas para redes creadas con IA, aprobación y publicación programada.',
    icon: <Sparkles className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Le pides a la IA historias, publicaciones, carruseles y reels con fotos reales del inventario y de la biblioteca. Administración las aprueba y el ERP las publica en Instagram y Facebook a la hora programada; los estados de WhatsApp quedan listos para descargar.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **MARKETING** › **ESTUDIO DE CONTENIDO**. Pestañas: Piezas, Crear con IA, Reglas, Biblioteca y Kit de marca.' },
      { type: 'steps', title: '📝 Crear una pieza con IA', items: [
        '**Paso 1 · Abrir:** toca la pestaña **Crear con IA**.',
        '**Paso 2 · Pedido:** en **¿Qué quieres publicar?** escribe lo que necesitas o toca uno de los ejemplos.',
        '**Paso 3 · Formato y sede:** elige el **Formato** (Historia, Publicación, Carrusel o Reel) y la **Sede**.',
        '**Paso 4 · Fecha:** si quieres, escribe **Publicar el (hora Colombia)**; sin fecha se publica apenas se apruebe.',
        '**Paso 5 · Redes:** marca Instagram, Facebook, TikTok o Estado de WhatsApp.',
        '**Paso 6 · Crear:** toca **Crear con IA**. La pieza queda en **Piezas › Por aprobar**.'
      ] },
      { type: 'steps', title: '📝 Revisar y aprobar una pieza', items: [
        '**Paso 1 · Abrir:** en **Piezas** toca **Por aprobar**.',
        '**Paso 2 · Ajustar:** corrige el texto, quita fotos con **✕** o aplica un **Diseño** del kit de marca; si cambias algo toca **Guardar cambios**.',
        '**Paso 3 · Aprobar (administración):** toca **Aprobar y programar** (si tiene fecha) o **Aprobar y publicar**. Si es urgente usa **Publicar ya**.',
        '**Paso 4 · WhatsApp:** si la pieza incluye estado de WhatsApp, toca **Descargar** en cada foto y **Copiar texto para el estado de WhatsApp**.',
        '**Paso 5 · Errores:** si queda en **Con error**, lee el aviso y toca **Reintentar**. Lo que no sirva, **Descartar**.'
      ] },
      { type: 'steps', title: '📝 Reglas automáticas y biblioteca', items: [
        '**Paso 1 · Nueva regla (administración):** en **Reglas** toca **Nueva regla** o uno de los ejemplos.',
        '**Paso 2 · Cuándo:** escribe el **Nombre** y en **Cuándo** elige **Días fijos de la semana** o **Cada vestido nuevo del inventario**.',
        '**Paso 3 · Detalles:** elige días, **Hora**, **Piezas por día**, **Formato**, **Sede**, redes y escribe la **Orden para la IA**; toca **Guardar regla**.',
        '**Paso 4 · Pausar:** usa **Pausar** o **Activar** en cada regla.',
        '**Paso 5 · Biblioteca:** en **Biblioteca** elige fotos o videos, escribe título y etiquetas, la sede, y marca **Aparece una clienta** y su autorización si aplica; toca **Subir**.',
        '**Paso 6 · Kit de marca (administración):** en **Kit de marca** sube el logo (PNG transparente), elige colores y tipografías, el usuario de Instagram y la frase; toca **Guardar kit de marca**.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: '**Nada se publica sin aprobación de administración**, ni siquiera lo que crean las reglas. La IA solo usa vestidos visibles en el catálogo, y **no usa fotos de clientas sin autorización de uso de imagen**. Las métricas de alcance llegan al día siguiente de publicar.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Escribes «Carrusel de 5 vestidos de XV en tonos rosa, con la promoción vigente», eliges Instagram y Facebook para el sábado 10 a. m. y tocas Crear con IA. Administración revisa el texto y toca Aprobar y programar.' }
    ]
  },
  {
    id: 'redes',
    title: '📣 Redes sociales (aliados)',
    description: 'Publicaciones pendientes para dar visibilidad a los aliados.',
    icon: <Images className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Es la lista de publicaciones que debemos hacer para los aliados: bienvenida al programa, historias y reel en colaboración por cada evento con vestido Ámbar, y publicación semanal para aliados constantes. Las tareas se crean solas cada día.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **MARKETING** › **REDES SOCIALES**.' },
      { type: 'steps', title: '📝 Hacer una publicación pendiente', items: [
        '**Paso 1 · Abrir:** entra a **REDES SOCIALES**; arriba queda marcado **Pendientes**.',
        '**Paso 2 · Leer la tarjeta:** mira el tipo de publicación, las redes, a quién **Etiquetar** y la fecha «Publicar a más tardar».',
        '**Paso 3 · Material:** si necesitas fotos del aliado, toca **Pedir material** (abre su WhatsApp).',
        '**Paso 4 · Publicar:** haz la publicación en la red indicada etiquetando al aliado.',
        '**Paso 5 · Registrar:** toca **Marcar publicada** y pega el enlace (opcional).',
        '**Paso 6 · Si no aplica:** toca **No se publica** y escribe el motivo. Si te equivocas, usa **deshacer**.'
      ] },
      { type: 'steps', title: '📝 Actualizar las redes de un aliado', items: [
        '**Paso 1 · Abrir:** al final despliega **Redes y directorio de cada aliado**.',
        '**Paso 2 · Editar:** toca **Editar** en el aliado.',
        '**Paso 3 · Datos:** escribe **Nombre comercial**, **Instagram (usuario)**, **TikTok (usuario)**, **Facebook (enlace)** y **Servicios en una frase**.',
        '**Paso 4 · Directorio:** marca la casilla de autorización solo si el aliado lo autorizó por escrito, y toca **Guardar**.',
        '**Paso 5 · Revisar:** toca **Ver directorio público ↗** para ver cómo queda.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'Si la tarjeta dice **«Sin autorización de uso de imagen de la clienta»**, no publiques su rostro. Las tarjetas en rojo están vencidas. Marca la autorización del directorio solo con autorización escrita del aliado.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Una fotógrafa aliada tuvo un evento con vestido Ámbar: aparece la tarjeta «Evento: historias». Pides el material, publicas las historias etiquetándola y tocas Marcar publicada.' }
    ]
  },
  {
    id: 'aliados',
    title: '🤝 Aliados',
    description: 'Perfiles de aliados directos, contrato de vinculación, clientas, medidas, envíos y enlaces.',
    icon: <Handshake className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Maneja a los aliados directos (organizadores, fotógrafos, tiendas, etc.): su perfil, su contrato firmado una sola vez, su cuenta bancaria y sus enlaces para registrar clientas y consultar disponibilidad. El aliado no recibe comisiones.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **VENTAS Y CRM** › **ALIADOS**. Pestañas: Perfiles, Clientas, Medidas, Envíos, Estadísticas y Configuración.' },
      { type: 'steps', title: '📝 Vincular un aliado nuevo', items: [
        '**Paso 1 · Enlace público:** en **Perfiles** toca **Copiar enlace** y envíaselo al aliado; él llena sus datos, adjunta la certificación bancaria y firma.',
        '**Paso 2 · O créalo tú:** toca **Nuevo aliado**, llena **Nombre completo**, **Cédula**, **Celular**, **Correo electrónico**, **Dirección**, **Tipo de aliado**, **Sede principal** y la **Cuenta bancaria**; toca **Guardar**.',
        '**Paso 3 · Firma:** si lo creaste tú, ábrelo y toca **Enviar contrato para firma**; el enlace se copia y puedes mandarlo por WhatsApp.',
        '**Paso 4 · Aprobar:** cuando firme queda «Pendiente de aprobación»; ábrelo y toca **Aprobar** (o **Rechazar** con motivo). Le llega por correo su código y enlaces.',
        '**Paso 5 · Validar la cuenta (Contabilidad):** en **Cuenta bancaria** toca **Ver certificación**, revisa que coincidan banco, número y titular, y toca **Marcar cuenta validada**. Si el aliado no la subió, súbela tú en **O validar con otra certificación**.',
        '**Paso 6 · Sin certificación no se aprueba:** si dice **Falta certificación bancaria**, el ERP no deja aprobar y le envía al aliado un correo con el enlace para subirla (también con **Pedir certificación bancaria por correo**). Cuando la sube, ya puedes aprobar.',
        '**Paso 7 · Eliminar (archivar):** abre el aliado y toca **Eliminar (archivar)** con el motivo: queda Inactivo y sale de la lista, sin borrar su historial. Para verlo marca **Ver archivados**; desde ahí puedes **Restaurar aliado**.'
      ] },
      { type: 'steps', title: '📝 Compartir los enlaces del aliado', items: [
        '**Paso 1 · Abrir:** en **Perfiles** toca el aliado activo.',
        '**Paso 2 · Copiar:** en **Vinculación** toca **Copiar enlace de registro de clientas**, **Copiar enlace de disponibilidad** o **Copiar enlace de catálogo con precios**.',
        '**Paso 3 · Reenviar:** si el aliado perdió sus enlaces, toca **Reenviar enlaces** y le llegan al correo.'
      ] },
      { type: 'steps', title: '📝 Lo que hace el aliado en sus páginas', items: [
        '**Paso 1 · Registro de clientas:** abre su enlace, elige **Tipo de evento**, **Categoría** y **Fecha del evento**, llena los datos de la clienta (o de su representante si es XV o menor de edad).',
        '**Paso 2 · Autorizaciones:** marca la autorización de datos, responde Sí o No al uso de imagen y a la publicidad, y toca **Registrar**. La clienta recibe su ID por correo.',
        '**Paso 3 · Disponibilidad:** en su enlace elige **Por vestido** (escribe la **Referencia del vestido**) o **Por categoría**, pone la **Fecha del evento** y toca **Consultar**. Solo consulta: para reservar debe comunicarse con Ámbar.'
      ] },
      { type: 'steps', title: '📝 Contrato en modo Aliado y seguimiento', items: [
        '**Paso 1 · Contrato:** en el contrato nuevo elige **Aliado** (en vez de **Cliente directo**), busca y carga el aliado y su clienta.',
        '**Paso 2 · Medidas:** en la pestaña **Medidas** revisa lo que envió el aliado y toca **Marcar revisadas**, **Aprobar** o **Pedir corrección**; si no le llegó, **Reenviar enlace**.',
        '**Paso 3 · Envíos:** en **Envíos** escribe la **Transportadora**, la **Guía de ida** y la **Guía de regreso**, sube las fotos y toca **Guardar**.',
        '**Paso 4 · Estadísticas:** en **Estadísticas** elige **Desde** y **Hasta**, toca **Aplicar** y revisa el ranking y las consultas de disponibilidad.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'Mientras el aliado no firme, **no aparece en los contratos de clientes**. Un cambio de cuenta bancaria queda pendiente hasta que **Contabilidad lo apruebe**. El aliado no recibe comisiones. **El porcentaje de descuento de aliados nunca se muestra** a las clientas ni en el catálogo. La página de disponibilidad no reserva vestidos.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Una organizadora de eventos firma por el enlace público. La apruebas, Contabilidad valida su cuenta y le copias su enlace de registro de clientas. Ella registra a una quinceañera y, cuando la clienta alquila, haces el contrato en modo Aliado.' }
    ]
  },
  {
    id: 'documentos',
    title: '📁 Documentos de la marca',
    description: 'Archivos por área, enlaces de Google, versiones, vencimientos y lo que lee la IA de WhatsApp.',
    icon: <ClipboardList className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Guarda los archivos de cada área de trabajo de Ámbar Couture (planes, precios, promociones, manuales, etc.). Cada área decide quién la ve y quién sube archivos, y las áreas marcadas con «La IA lee» alimentan a la IA de WhatsApp para atender a las clientas.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **DOCUMENTACIÓN DE LA MARCA** › **DOCUMENTOS DE LA MARCA**.' },
      { type: 'steps', title: '📝 Buscar y abrir un documento', items: [
        '**Paso 1 · Elegir área:** a la izquierda toca el área o subárea.',
        '**Paso 2 · Buscar:** o escribe en **Buscar en todas las áreas**.',
        '**Paso 3 · Abrir:** toca el nombre del documento o el botón **Abrir**: se ve en una ventana dentro del ERP (Word, PDF, imágenes, videos y enlaces de Google Drive). Excel y PowerPoint se abren con **Descargar**.',
        '**Paso 4 · Versiones:** toca el botón **v1, v2…** para ver las versiones anteriores.',
        '**Paso 5 · Comunicados:** todo documento que se sube a la carpeta **Comunicados** aparece 24 horas a todo el equipo en el botón morado **📣 Comunicados nuevos** (abajo a la izquierda). Toca **Ver comunicado** para leerlo en pantalla o **Ya lo vi** para ocultarlo.'
      ] },
      { type: 'steps', title: '📝 Subir archivos o enlaces', items: [
        '**Paso 1 · Abrir:** elige el área y toca **Subir documento** (solo sale si tu rol puede subir en esa área).',
        '**Paso 2 · Archivos:** en **Archivos** elige uno o varios (PDF, Word, Excel, imágenes, presentaciones; máximo 50 MB cada uno).',
        '**Paso 3 · Desde Google Drive:** o pega el **Link de la carpeta de Google Drive** (compartida como «Cualquier persona con el enlace»), toca **Buscar archivos** y marca los que quieres traer.',
        '**Paso 4 · Enlace (videos):** o pega el **Enlace** del video.',
        '**Paso 5 · Detalles:** escribe **Nombre**, **Descripción (opcional)**, elige **Sede** y, si aplica, **Vence (opcional)**.',
        '**Paso 6 · Guardar:** toca **Guardar**. Si el área tiene «La IA lee», la IA empieza a leerlo.'
      ] },
      { type: 'steps', title: '📝 Actualizar un documento', items: [
        '**Paso 1 · Editar:** toca el lápiz para cambiar nombre, sede o vencimiento y toca **Guardar cambios**.',
        '**Paso 2 · Nueva versión:** toca el botón de subir de la fila y elige el archivo nuevo; la versión anterior queda en «Versiones».',
        '**Paso 3 · Recuperar:** en «Versiones» toca **Volver a esta versión** si necesitas la anterior.',
        '**Paso 4 · Archivar:** toca el botón de archivar cuando el documento ya no sirva.'
      ] },
      { type: 'steps', title: '📝 Administrar áreas (administración)', items: [
        '**Paso 1 · Abrir:** toca **Administrar áreas**.',
        '**Paso 2 · Crear:** escribe la **Nueva área o subárea**, elige **Dentro de** y toca **Crear**.',
        '**Paso 3 · Permisos:** en cada área marca quiénes **Ven** y quiénes **Suben archivos**.',
        '**Paso 4 · IA:** en **La IA lee** elige **Sí** solo para áreas con información para clientas (planes, precios, promociones); deja **No** en lo interno.',
        '**Paso 5 · Terminar:** toca **Listo**.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'La IA de WhatsApp solo usa documentos **vigentes** de las áreas con «La IA lee»: no pongas información interna ahí. Arriba sale un aviso cuando un documento vence en 30 días o menos. Si no marcas a nadie en «Ven», el área la ven todos los perfiles con acceso; administración siempre ve y sube todo. No se aceptan programas ni accesos directos. Ninguna versión se borra.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Sale la nueva lista de precios: entras al área de precios (con «La IA lee» en Sí), subes el PDF como nueva versión del documento anterior y le pones vencimiento al final del año. La IA de WhatsApp empieza a usar los precios nuevos.' }
    ]
  },
  {
    id: 'metas',
    title: '🎯 Metas y ventas',
    description: 'Meta del mes por sede, lo vendido, la meta de hoy y el historial de contratos y abonos.',
    icon: <TrendingUp className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Muestra la meta del mes de cada sede, lo vendido, el porcentaje de cumplimiento y cuánto hay que vender hoy para llegar. Abajo, el panel de historial muestra lo facturado, lo recaudado y lo pendiente de cualquier periodo.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **METAS Y VENTAS** (bloque Ventas y CRM).' },
      { type: 'steps', title: '📝 Ver cómo va la sede', items: [
        '**Paso 1 · Elegir el mes:** arriba a la derecha usa las flechas **‹ ›** para pasar de mes.',
        '**Paso 2 · Elegir la sede:** administración y contabilidad eligen en la lista (**Todas las sedes** o una sede). Las demás personas ven solo su sede, con candado.',
        '**Paso 3 · Leer las tarjetas:** **Meta del mes**, **Vendido del mes**, **Cumplimiento** (con lo que falta) y **Meta de hoy**.',
        '**Paso 4 · Comparar sedes:** con **Todas las sedes** aparece una tabla con Meta, Vendido, Cumplimiento, Meta diaria base, Meta de hoy y Recaudado del mes. Toca una fila para ver esa sede.'
      ] },
      { type: 'steps', title: '📝 Revisar el historial de contratos y abonos', items: [
        '**Paso 1 · Elegir el periodo:** en **Período** escoge **Mes**, **Rango** (con **Desde** y **Hasta**), **Año** o **Todo el historial**.',
        '**Paso 2 · Elegir cómo contar:** en **Ver por** escoge **Contratos del período (fecha del contrato)** o **Caja del período (fecha del abono)**.',
        '**Paso 3 · Leer los totales:** **Facturado**, **Recaudado** y **Pendiente**.',
        '**Paso 4 · Filtrar por antigüedad:** toca **Todos**, **Al día**, **+30 días**, **+90 días**, **+120 días** o **Pagadas**.',
        '**Paso 5 · Ver el detalle:** toca una fila para ver la factura, los recibos de caja y los abonos de ese contrato.',
        '**Paso 6 · Exportar:** administración y contabilidad tocan **Exportar** para descargar la lista y abrirla en Excel.'
      ] },
      { type: 'steps', title: '📝 Configurar las metas del mes (administración)', items: [
        '**Paso 1 · Abrir la configuración:** toca **Configuración de metas**.',
        '**Paso 2 · Escribir la meta:** en cada sede escribe la **Meta mensual** en pesos.',
        '**Paso 3 · Ajustar los días:** si hace falta, cambia los **Días operativos** (el ERP muestra el número calculado).',
        '**Paso 4 · Guardar:** toca **Guardar cambios**. La sede pasa a **Activa**.',
        '**Paso 5 · Preparar el mes siguiente:** toca **Copiar metas al siguiente mes** para dejarlo listo con los mismos valores.',
        '**Paso 6 · Revisar cambios:** abajo, en **Historial de cambios de metas**, ves quién cambió qué meta y cuándo.',
        '**Paso 7 · Cerrar:** toca **Cerrar configuración**.'
      ] },
      { type: 'steps', title: '📝 Crear una meta por asesora (administración)', items: [
        '**Paso 1 · Abrir:** toca **Meta por asesora**.',
        '**Paso 2 · Elegir el tipo:** toca **Por Asesora** (o **Por Sede**) y elige el nombre en la lista.',
        '**Paso 3 · Escribir el monto:** llena **Monto Objetivo (COP)** y elige el **Mes** y el **Año**.',
        '**Paso 4 · Guardar:** toca **Establecer Objetivo**. La meta aparece en **Metas por asesora**; desde su menú puedes **Editar** o **Eliminar**.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: '**Meta de hoy** = (meta del mes − vendido hasta ayer) ÷ días operativos que faltan, incluido hoy. **Días operativos:** lunes a sábado sin festivos. Si una sede dice **Automática**, su meta se copió del mes anterior: revísala y guarda para confirmarla. Solo administración cambia metas; eliminar una meta por asesora no se puede deshacer.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Bogotá tiene meta de $50.000.000 y lleva $20.000.000 cuando faltan 12 días operativos: la Meta de hoy es $2.500.000.' }
    ]
  },
  {
    id: 'reportes',
    title: '📊 Tablero CEO y reportes',
    description: 'La plata, lo que se debe, cómo va el mes, el semáforo y el embudo por sede, y el ranking de vestidos.',
    icon: <BarChart3 className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Es la vista del dueño: dónde está la plata, cuánto se debe, cómo va el mes, hacia dónde va cada sede y de dónde llegan las clientas. Abajo están los reportes de facturado y los vestidos más alquilados. Solo lo ve administración.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **TABLERO CEO Y REPORTES** (bloque Reportes e indicadores), o **Ver Reporte Full →** en el Dashboard.' },
      { type: 'steps', title: '📝 Leer el Tablero CEO', items: [
        '**Paso 1 · Elegir la sede:** arriba a la derecha deja **Todas las sedes** o elige una.',
        '**Paso 2 · Puntaje Ámbar:** con todas las sedes ves el **Puntaje Ámbar por sede (últimos 30 días)**.',
        '**Paso 3 · Dónde está la plata:** **Efectivo en cajas**, **Bancos**, **No es tuya todavía** (depósitos, Plan Ahorro y socios) y **Plata libre**.',
        '**Paso 4 · Lo que tienes y lo que debes:** **Tienes**, **Debes**, **Lo que vale la empresa** y **Te deben vencido**.',
        '**Paso 5 · Cómo va el mes:** **Vendido**, **Entró / salió de caja**, **Ganancia del mes (aprox.)** y **Punto de equilibrio**.',
        '**Paso 6 · Para dónde vas:** **Proyección de ventas del mes**, **Plata asegurada**, **Citas → contratos** (meta 40 %) y **Vestidos activos**.',
        '**Paso 7 · Semáforo por sede:** 🟢 vende al ritmo del mes pasado o más y gana · 🟡 se está quedando atrás · 🔴 pierde plata o va por debajo del 70 % del mes pasado.',
        '**Paso 8 · Embudo por sede:** revisa **Chats de WhatsApp**, citas, asistencia, **Contrataron (de esas citas)**, ticket promedio, anuncios y **De dónde llegan**.'
      ] },
      { type: 'steps', title: '📝 Ver reportes y ranking de vestidos', items: [
        '**Paso 1 · Elegir la sede:** en **Reportes y Estadísticas** elige **🌍 Sede Global** o una sede.',
        '**Paso 2 · Elegir el periodo:** **Mes Actual**, **Mes Anterior**, **Últimos 3 Meses**, **Año Actual** o **Rango Personalizado** (con las dos fechas).',
        '**Paso 3 · Actualizar:** toca **REFRESCAR**.',
        '**Paso 4 · Leer las cifras:** **Facturado Total**, **Facturado del Mes** y **Pendiente por Recaudar**.',
        '**Paso 5 · Ranking:** revisa **Top 10 Vestidos más Rentados** (con sus alquileres confirmados) para decidir compras y promociones.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'Bancos y ganancia son **aproximados** mientras todas las sedes registren cada movimiento en **Cierres de caja**. El valor del inventario suma solo los vestidos con costo registrado. **Siigo confirma lo contable.** Si en el embudo salen citas «sin origen», regístralo en Primeras visitas › Origen de la cita.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'El día 15 Pereira sale en 🟡: la proyección va por debajo del mes pasado. En el embudo ves muchas citas pero pocas que contrataron: se refuerza el protocolo de primera cita esa semana.' }
    ]
  },
  {
    id: 'horarios',
    title: '⏰ Control de asistencia (horarios)',
    description: 'Turnos planificados del personal, horas trabajadas y reporte del mes.',
    icon: <Clock className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Planifica los turnos de cada persona por sede y suma las horas: lunes a sábado, domingos y horas extras. La entrada y salida del personal ahora se marca en **Nexora**; aquí queda el historial y la planificación.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **CONTROL DE ASISTENCIA** (bloque Recursos humanos).' },
      { type: 'steps', title: '📝 Marcar entrada y salida', items: [
        '**Paso 1 · Ir a Nexora:** toca **Ingresar a Nexora ↗** (franja rosada de arriba).',
        '**Paso 2 · Marcar:** cada persona marca su ingreso y su salida desde Nexora.'
      ] },
      { type: 'steps', title: '📝 Planificar y revisar horarios', items: [
        '**Paso 1 · Elegir la semana:** usa **← Anterior** y **Siguiente →**, o elige la fecha (se ajusta al lunes).',
        '**Paso 2 · Elegir cuántas semanas ver:** en la lista elige de **1 semana** a **5 semanas** (4 ≈ 1 mes).',
        '**Paso 3 · Elegir la sede:** toca la pestaña de la sede o **Todas las sedes**.',
        '**Paso 4 · Escribir el turno:** en cada día, en **Planificado**, escribe la hora de entrada y la de salida.',
        '**Paso 5 · Revisar lo real:** en **Real** quedan la entrada y salida; marca o desmarca **-1h Almuerzo** según el caso.',
        '**Paso 6 · Repetir:** si ves varias semanas, toca **Repetir semana 1** para copiar el horario planificado a las demás.',
        '**Paso 7 · Guardar:** toca **Guardar Cambios** (muestra cuántos días cambiaste).',
        '**Paso 8 · Leer los totales:** debajo de cada semana salen **Total Lun-Sáb**, **Horas Extras (más de 42 h)** y **Total Domingo**.',
        '**Paso 9 · Reporte del mes:** abajo toca **Ver Reporte** en **📊 Reporte Consolidado de Horas (Mes Actual)**: verás la **Vista por Asesora** y la **Vista por Sede**.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'Si cambias de semana o de sede sin guardar, el ERP pregunta si quieres descartar los cambios. Las horas extras se cuentan desde **42 horas** de lunes a sábado. Si sale **«No hay personal activo en esta sede»**, revisa en **EQUIPO Y ACCESOS** que las personas estén activas y tengan sede.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'La líder de Bogotá elige 4 semanas, escribe el turno de la primera semana, toca Repetir semana 1 y luego Guardar Cambios: queda planificado el mes.' }
    ]
  },
  {
    id: 'admin',
    title: '⚙️ Administración y configuración',
    description: 'Equipo y accesos, configuración base, cláusulas, integraciones e historial (solo administración).',
    icon: <Settings className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Desde aquí administración maneja quién entra al ERP, qué puede hacer cada rol, las listas y reglas del negocio, el texto del contrato, las conexiones externas y el historial de todos los cambios.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **EQUIPO Y ACCESOS** (Recursos humanos) y, en el bloque Configuración, **CONFIGURACIÓN BASE**, **CLÁUSULAS DEL CONTRATO**, **INTEGRACIONES** e **HISTORIAL Y AUDITORÍA**.' },
      { type: 'steps', title: '📝 Equipo y accesos: dar acceso a una persona nueva', items: [
        '**Paso 1 · Abrir:** entra a **EQUIPO Y ACCESOS**, pestaña **Personas**.',
        '**Paso 2 · Nueva persona:** toca **Nueva persona**.',
        '**Paso 3 · Datos:** escribe el **Nombre completo**, el **Correo** y una **Clave temporal**.',
        '**Paso 4 · Rol:** elige el **Rol**.',
        '**Paso 5 · Sedes:** marca sus **Sedes** (si el rol ve todas las sedes, no hace falta).',
        '**Paso 6 · Vendedora:** deja marcado **Aparece como vendedora** si vende (sale en contratos y metas).',
        '**Paso 7 · Crear:** toca **Crear persona**. Nace con la ficha confirmada; entrégale su correo y clave temporal.'
      ] },
      { type: 'steps', title: '📝 Equipo y accesos: cambiar a una persona', items: [
        '**Paso 1 · Buscar:** filtra por **Rol**, **Sede** o **Estado** (**Activos**, **Inactivos**, **Todos**) y toca a la persona.',
        '**Paso 2 · Cambiar datos:** ajusta **Nombre**, **Rol**, **Sedes**, **Activo** o **Aparece como vendedora**.',
        '**Paso 3 · Unir ficha:** si tiene una ficha de asesora suelta, elígela en **Unir otra ficha…** y toca **Unir**.',
        '**Paso 4 · Guardar:** toca **Guardar ficha**.',
        '**Paso 5 · Olvidó la clave:** escribe una **Clave temporal (mín. 6)** y toca **Restablecer clave**.',
        '**Paso 6 · Retiro:** para que alguien deje de entrar, apaga **Activo** y guarda.'
      ] },
      { type: 'steps', title: '📝 Equipo y accesos: roles y permisos', items: [
        '**Paso 1 · Abrir:** toca la pestaña **Configuración · Roles y permisos**.',
        '**Paso 2 · Elegir el rol:** escógelo en **Rol**. Para uno nuevo, escribe el nombre en **Nuevo rol** y toca **Crear rol**.',
        '**Paso 3 · Sedes del rol:** marca **Ve todas las sedes** si ese rol trabaja con todas.',
        '**Paso 4 · Marcar permisos:** en la tabla marca o desmarca **Activo** en cada permiso.',
        '**Paso 5 · Guardar:** toca **Guardar permisos del rol**. Cada usuario los recibe al recargar la página.',
        '**Paso 6 · Revisar:** en **Configuración · Historial** ves los cambios de paneles, roles, permisos, fichas y sedes.'
      ] },
      { type: 'steps', title: '📝 Configuración base', items: [
        '**Paso 1 · Abrir:** entra a **CONFIGURACIÓN BASE**.',
        '**Paso 2 · Sedes:** en **Gestionar Sedes** escribe el nombre en **Añadir Nueva Sede** y toca **+**; con el interruptor la activas o desactivas.',
        '**Paso 3 · Contacto de la sede:** abre **Contacto para clientas**, llena teléfono, WhatsApp, dirección, mapa, reseñas y correo, y toca **Guardar contacto**.',
        '**Paso 4 · Listas:** en la pestaña **Listas** escribe en **Nuevo valor** y toca **Agregar**; usa **Desactivar** o **Eliminar** en lo que ya no va.',
        '**Paso 5 · Parámetros:** en **Parámetros** cambia el número, el Sí/No o el correo; se guarda al salir del campo.',
        '**Paso 6 · Formularios:** en **Formularios** elige si cada campo es **Obligatorio**, **Opcional** u **Oculto**.',
        '**Paso 7 · Categorías:** en **Categorías** ajusta el nombre y el tope **Hasta $** de cada categoría por tipo de vestido, o agrega una con **Nueva categoría** y **Agregar**.',
        '**Paso 8 · Autorizaciones:** en **Autorizaciones** ves las autorizaciones de datos por sede, buscas una persona y guardas una nueva versión del texto.',
        '**Paso 9 · Historial:** en **Historial** ves cada cambio de listas, parámetros, formularios y categorías.'
      ] },
      { type: 'steps', title: '📝 Cláusulas del contrato', items: [
        '**Paso 1 · Abrir:** entra a **CLÁUSULAS DEL CONTRATO**.',
        '**Paso 2 · Editar:** busca la cláusula por su número y título y cambia el texto en el recuadro.',
        '**Paso 3 · Guardar:** toca **Guardar Cláusula** en esa misma cláusula.'
      ] },
      { type: 'steps', title: '📝 Integraciones', items: [
        '**Paso 1 · Abrir:** entra a **INTEGRACIONES**.',
        '**Paso 2 · Correo:** elige el **Proveedor**, pega la clave, escribe **Nombre del remitente** y **Correo del remitente**, y toca **Guardar**.',
        '**Paso 3 · Probar:** toca **Probar conexión** hasta que salga **Conectada**; si el proveedor lo permite, toca **Sincronizar autorizadas**.',
        '**Paso 4 · WhatsApp:** llena **Número visible**, **ID del número**, **ID de la cuenta de WhatsApp Business (WABA)** y **Token de acceso**; toca **Guardar** y luego **Probar conexión**.',
        '**Paso 5 · Instagram y Messenger:** escribe el **ID de la página de Facebook** y el **Token de la página**, toca **Guardar** y **Probar conexión**.',
        '**Paso 6 · TikTok:** pega **Client key** y **Client secret**, toca **Guardar**, luego **Conectar TikTok** y **Probar conexión**.'
      ] },
      { type: 'steps', title: '📝 Historial y auditoría', items: [
        '**Paso 1 · Abrir:** entra a **HISTORIAL Y AUDITORÍA**.',
        '**Paso 2 · Filtrar:** elige el **Área** y escribe en **Contrato, vestido o registro** o en **Texto o persona**; si quieres, pon **Desde** y **Hasta**.',
        '**Paso 3 · Buscar:** toca **Buscar**. Verás fecha, área, registro, acción, detalle y quién lo hizo.',
        '**Paso 4 · Más resultados:** usa **Anteriores** y **Siguientes**.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'Estas pantallas son **solo para administración**. Cambiar los permisos de un rol afecta a **todas** las personas con ese rol. Las claves de integraciones se guardan cifradas y **nunca se vuelven a mostrar**: no las compartas por chat. En WhatsApp, mientras el número no esté **«Conectada»**, el ERP sigue enviando con la configuración anterior. Al cambiar el tope de una categoría, **se recalculan todos los vestidos**. Lo que ya se usó en una lista solo se puede desactivar, no eliminar.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Entra una asesora a Pereira: en EQUIPO Y ACCESOS tocas Nueva persona, escribes su nombre, correo y clave temporal, eliges el rol Asesora y la sede Pereira, y tocas Crear persona. Al entrar ya ve los módulos de su rol.' }
    ]
  },
  {
    id: 'perfil',
    title: '🙋 Mi perfil y soporte',
    description: 'Tus datos, tu rol, cambiar tu contraseña y cómo pedir ayuda.',
    icon: <UserCircle className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'En Mi perfil ves tu nombre, tu rol, tu correo y tu sede, y puedes cambiar tu contraseña. Si algo no corresponde (por ejemplo, no ves un módulo que necesitas), avisa a administración.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **MI PERFIL** (abajo, debajo de Manual de usuario).' },
      { type: 'steps', title: '📝 Cambiar tu contraseña', items: [
        '**Paso 1 · Revisar tus datos:** confirma tu **Rol**, tu **Correo Electrónico** y tu **Sede Asignada**.',
        '**Paso 2 · Nueva contraseña:** en **Seguridad de la Cuenta** escribe la **Nueva Contraseña** (mínimo 6 caracteres).',
        '**Paso 3 · Confirmar:** repítela en **Confirmar Contraseña**.',
        '**Paso 4 · Guardar:** toca **ACTUALIZAR CREDENCIALES**. Tu sesión sigue abierta.'
      ] },
      { type: 'steps', title: '📝 Cuando algo falle', items: [
        '**Paso 1 · Leer el mensaje:** casi siempre dice qué falta (soporte, motivo, cuenta o sede).',
        '**Paso 2 · Buscar en el manual:** escribe la palabra en **Buscar tema...** de este manual.',
        '**Paso 3 · Pedir ayuda:** si sigue, envía a administración una captura de pantalla con el número del contrato o el código del vestido.',
        '**Paso 4 · Olvidaste la clave:** pide a administración que te ponga una clave temporal en **EQUIPO Y ACCESOS**.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'Las dos contraseñas deben coincidir y tener **al menos 6 caracteres**. Si tu sede o tu rol están mal, solo administración los puede cambiar.' }
    ]
  }
];

// Manual de usuario (how the ERP is used) + Manual Ámbar (how the service is done, Ámbar Exitoso): one module, one search.
const MANUAL_ALL = [...MANUAL_DATA.map(m => ({ ...m, grupo: 'erp', indicador: null as string | null })), ...PROTOCOLOS] as (typeof MANUAL_DATA[number] & { grupo: string; indicador: string | null })[];

export default function ManualUsuarioPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(MANUAL_ALL[0].id);
  const [search, setSearch] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // «Imprimir este módulo»: the print version holds only the open module (PDF of one tutorial).
  const [soloModulo, setSoloModulo] = useState(false);
  const imprimirModulo = () => { setSoloModulo(true); setTimeout(() => { window.print(); setSoloModulo(false); }, 80); };
  // «Imprimir esta parte»: only one tutorial of the module (e.g. «Anular un abono mal registrado»).
  const [soloSeccion, setSoloSeccion] = useState<number | null>(null);
  const imprimirSeccion = (i: number) => { setSoloSeccion(i); setTimeout(() => { window.print(); setSoloSeccion(null); }, 80); };

  const filteredData = useMemo(() => {
    if (!search.trim()) return MANUAL_ALL;
    const q = search.toLowerCase();
    return MANUAL_ALL.filter(item => 
      item.title.toLowerCase().includes(q) || 
      item.description.toLowerCase().includes(q) ||
      item.sections.some(sec => 
        sec.title.toLowerCase().includes(q) || 
        (sec.content && sec.content.toLowerCase().includes(q)) ||
        (sec.items && sec.items.some((i: string) => i.toLowerCase().includes(q)))
      )
    );
  }, [search]);

  const activeContent = useMemo(() => {
    return MANUAL_ALL.find(t => t.id === activeTab) || MANUAL_ALL[0];
  }, [activeTab]);

  const renderSection = (section: any, index: number) => {
    switch(section.type) {
      case 'intro':
        return (
          <div key={index} className="mb-8 p-6 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl border border-emerald-100">
            <h3 className="text-lg font-black text-emerald-800 mb-3 flex items-center gap-2">
              <span className="text-2xl">🎯</span> {section.title.replace('🎯 ', '')}
            </h3>
            <p className="text-gray-700 font-medium leading-relaxed">{section.content}</p>
          </div>
        );
      case 'route':
        return (
          <div key={index} className="mb-8">
            <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
              <span className="text-xl">📍</span> {section.title.replace('📍 ', '')}
            </h3>
            <div className="flex items-center gap-3 bg-gray-50 px-5 py-4 rounded-xl border border-gray-200">
              <Menu className="w-5 h-5 text-gray-400" />
              <ArrowRight className="w-4 h-4 text-gray-300" />
              <div 
                className="text-sm font-bold text-gray-700" 
                dangerouslySetInnerHTML={{ __html: section.content.replace(/\*\*(.*?)\*\*/g, '<span class="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md">$1</span>') }}
              />
            </div>
          </div>
        );
      case 'steps':
        return (
          <div key={index} className="mb-8">
            <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
              <span className="text-xl">📝</span> {section.title.replace('📝 ', '')}
            </h3>
            <div className="space-y-3">
              {section.items.map((item: string, i: number) => (
                <div key={i} className="flex gap-4 p-4 bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black flex-shrink-0">
                    {i + 1}
                  </div>
                  <p 
                    className="text-gray-700 pt-1 font-medium"
                    dangerouslySetInnerHTML={{ __html: item.replace(/\*\*(.*?)\*\*/g, '<strong class="text-gray-900">$1</strong>') }}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      case 'warning':
        return (
          <div key={index} className="mb-8 p-6 bg-amber-50 rounded-2xl border-l-4 border-amber-500 shadow-sm relative overflow-hidden">
            <AlertTriangle className="absolute -right-4 -bottom-4 w-24 h-24 text-amber-500/10" />
            <h3 className="text-lg font-black text-amber-800 mb-2 flex items-center gap-2">
              <span className="text-xl">⚠️</span> {section.title.replace('⚠️ ', '')}
            </h3>
            <p className="text-amber-900/80 font-medium relative z-10 leading-relaxed">
              <span dangerouslySetInnerHTML={{ __html: section.content.replace(/\*\*(.*?)\*\*/g, '<strong class="text-amber-900 font-black">$1</strong>') }} />
            </p>
          </div>
        );
      case 'example':
        return (
          <div key={index} className="mb-8 p-6 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100">
            <h3 className="text-lg font-black text-indigo-900 mb-3 flex items-center gap-2">
              <span className="text-xl">💡</span> {section.title.replace('💡 ', '')}
            </h3>
            <p className="text-indigo-800/80 italic font-medium leading-relaxed flex gap-3">
              <span className="text-2xl">👉</span>
              {section.content}
            </p>
          </div>
        );
      case 'checklist':
        return (
          <div key={index} className="mb-8 p-6 bg-emerald-50/60 rounded-2xl border border-emerald-100">
            <h3 className="text-lg font-black text-emerald-900 mb-3">✅ {section.title.replace('✅ ', '')}</h3>
            <div className="space-y-2">{section.items.map((item: string, i: number) => (
              <label key={i} className="flex items-center gap-3 text-gray-800 font-medium"><input type="checkbox" className="w-5 h-5 accent-emerald-600" />{item}</label>
            ))}</div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Botón Móvil */}
      <div className="md:hidden print:hidden p-4 bg-white border-b border-gray-200 flex justify-between items-center z-20">
        <div className="flex items-center gap-2 text-indigo-600 font-black">
          <BookOpen className="w-5 h-5" /> Manual
        </div>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 bg-gray-100 rounded-lg">
          {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Sidebar de Navegación */}
      <div className={`
        fixed inset-y-0 left-0 z-10 w-72 bg-white border-r border-gray-200 flex flex-col transition-transform duration-300 md:relative md:translate-x-0 print:hidden
        ${isSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
      `}>
        <div className="p-6 border-b border-gray-100 hidden md:block">
          <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 mb-4 shadow-sm">
            <BookOpen className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Manual de<br/>Usuario</h1>
          <p className="text-xs text-gray-500 font-medium mt-2">Aprende a usar Ámbar ERP de forma fácil y rápida.</p>
        </div>

        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar tema..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-gray-100 border-transparent rounded-xl text-sm outline-none focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all font-medium"
            />
          </div>
          <button type="button" onClick={() => window.print()} className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-black hover:bg-indigo-700">
            <Printer className="w-4 h-4" /> Imprimir manual completo
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {filteredData.length === 0 ? (
            <div className="text-center p-6 text-gray-400 text-sm font-medium">
              No encontré nada con esa palabra 😢
            </div>
          ) : (
            filteredData.map((tab, i) => (
              <React.Fragment key={tab.id}>
              {tab.grupo === 'ambar' && filteredData[i - 1]?.grupo !== 'ambar' && <p className="px-3 pt-4 pb-1 text-[11px] font-black uppercase tracking-widest text-rose-600">✨ Manual Ámbar · Protocolos</p>}
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setIsSidebarOpen(false);
                }}
                className={`w-full text-left p-3 rounded-xl flex items-start gap-3 transition-all group
                  ${activeTab === tab.id 
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' 
                    : 'hover:bg-gray-100 text-gray-700'
                  }
                `}
              >
                <div className={`mt-0.5 ${activeTab === tab.id ? 'text-indigo-200' : 'text-gray-400 group-hover:text-indigo-500'}`}>
                  {tab.icon}
                </div>
                <div>
                  <p className={`font-bold text-sm leading-snug ${activeTab === tab.id ? 'text-white' : 'text-gray-900'}`}>
                    {tab.title}
                  </p>
                </div>
              </button>
              </React.Fragment>
            ))
          )}
        </div>
      </div>

      {/* Contenido Principal */}
      <div className="flex-1 w-full h-screen overflow-y-auto relative bg-gray-50/50 print:hidden">
        
        {/* Decoración de fondo */}
        <div className="fixed top-0 right-0 w-96 h-96 bg-indigo-50 rounded-full blur-3xl -z-10 opacity-60"></div>
        <div className="fixed bottom-0 left-1/4 w-96 h-96 bg-emerald-50 rounded-full blur-3xl -z-10 opacity-60"></div>

        <div className="max-w-4xl mx-auto my-8 bg-white md:rounded-3xl md:shadow-xl md:border md:border-gray-100 overflow-hidden relative">
          
          {/* Cabecera del Artículo */}
          <div className="p-8 md:p-12 bg-gray-900 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <BookOpen className="w-48 h-48" />
            </div>
            <div className="relative z-10">
              <span className="px-3 py-1 bg-white/20 text-white text-xs font-black rounded-lg uppercase tracking-wider mb-4 inline-block backdrop-blur-md">
                {activeContent.grupo === 'ambar' ? 'Manual Ámbar · Protocolo' : 'Guía Oficial'}
              </span>
              <h1 className="text-3xl md:text-5xl font-black mb-4 tracking-tight leading-tight">
                {activeContent.title}
              </h1>
              <p className="text-gray-300 text-lg md:text-xl font-medium max-w-2xl">
                {activeContent.description}
              </p>
              <button type="button" onClick={imprimirModulo} className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-gray-900 text-sm font-black hover:bg-gray-100">
                <Printer className="w-4 h-4" /> Imprimir / descargar este módulo
              </button>
            </div>
          </div>

          {/* Cuerpo del Artículo */}
          <div className="p-8 md:p-12">
            {activeContent.indicador === 'puntaje' ? <div className="mb-8"><PuntajeAmbar /></div> : activeContent.indicador === 'auditoria' || activeContent.indicador === 'academia' ? null : activeContent.indicador && <IndicadorAmbar clave={activeContent.indicador} />}
            {activeContent.sections.map((sec, i) => sec.type === 'steps' ? (
              <div key={i}>
                <div className="flex justify-end -mb-6 relative z-10"><button type="button" onClick={() => imprimirSeccion(i)} title="Imprimir o descargar solo esta parte" className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 bg-white text-[11px] font-bold text-gray-600 hover:text-indigo-700 hover:border-indigo-300"><Printer className="w-3.5 h-3.5" /> Imprimir esta parte</button></div>
                {renderSection(sec, i)}
              </div>
            ) : renderSection(sec, i))}
            {activeContent.indicador === 'auditoria' && <AuditoriaSede />}
            {activeContent.indicador === 'academia' && <AcademiaAvance />}
            {activeContent.grupo === 'ambar' && <EvaluacionAmbar key={activeContent.id} clave={activeContent.id} />}
          </div>
          
        </div>

        {/* Footer */}
        <div className="text-center text-gray-400 text-sm font-medium pb-8">
          ¿Tienes más dudas? Consulta con el administrador del sistema.<br/>
          Hecho con ❤️ para el equipo de Ámbar Couture.
        </div>
      </div>

      {/* Versión para imprimir: todos los módulos seguidos (Imprimir manual completo) */}
      <div className="hidden print:block w-full p-6 text-black">
        <h1 className="text-3xl font-black mb-2">Manual de usuario · ERP Ámbar Couture</h1>
        <p className="mb-6 text-gray-600">{soloSeccion !== null || soloModulo ? 'Tutorial del módulo' : 'Guía módulo por módulo para todo el equipo.'}</p>
        {(soloSeccion !== null ? [{ ...activeContent, sections: [activeContent.sections[soloSeccion]].filter(Boolean) }] : soloModulo ? [activeContent] : MANUAL_DATA).map(m => (
          <section key={m.id} className="mb-10" style={{ breakInside: 'avoid-page' }}>
            <h2 className="text-2xl font-black border-b-2 border-gray-300 pb-2 mb-2">{m.title}</h2>
            <p className="mb-4 text-gray-600">{m.description}</p>
            {m.sections.map((sec, i) => renderSection(sec, i))}
          </section>
        ))}
      </div>
      
    </div>
  );
}
