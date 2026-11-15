'use client';

import React, { useState, useMemo } from 'react';
import { BookOpen, Search, Menu, X, ChevronRight, CheckCircle2, AlertTriangle, Lightbulb, Play, ArrowRight, LayoutDashboard, CalendarDays, ShoppingBag, HandCoins, Package, TrendingUp, Handshake, Clock, ShieldCheck, Store, Truck, Images, Gift, Wallet, Receipt, BarChart3, Mail, Users, Settings, UserCircle, Sparkles, ClipboardList, Printer } from 'lucide-react';
import { useRouter } from 'next/navigation';

const MANUAL_DATA = [
  {
    id: 'empezar',
    title: '👋 Empieza aquí: cómo está organizado el ERP',
    description: 'Lo básico para moverte por el ERP sin perderte.',
    icon: <BookOpen className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve este manual?', content: 'Aquí está explicado, módulo por módulo, para qué sirve cada parte del ERP de Ámbar Couture y cómo se usa paso a paso. Usa el buscador de la izquierda: escribe una palabra (por ejemplo «abono», «multa», «traslado» o «caja») y te muestra el módulo donde está.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **MANUAL DE USUARIO** (abajo, en Soporte y ayuda).' },
      { type: 'steps', title: '📝 Lo que debes saber primero', items: [
        '**Cada persona ve lo de su rol y su sede.** Si un módulo no te aparece en el menú, es porque tu rol no lo tiene. Administración lo puede habilitar en Accesos / Roles.',
        '**El menú lateral está por bloques:** Operaciones (contratos, citas, vestidos), Finanzas (caja y cartera), Proveedores, Ventas y CRM, Red de aliados y Administración.',
        '**El Inicio es tu tablero:** arriba están las alertas de colores con todo lo pendiente. Tocas una y te lleva directo al módulo.',
        '**Todo queda registrado:** quién hizo cada cambio, cuándo y por qué (bitácoras e historial). Los cambios importantes piden un motivo.',
        '**Hora de Colombia:** fechas, citas y cierres de caja se manejan en hora de Colombia.',
        '**Imprimir el manual:** usa el botón «Imprimir manual completo» para guardarlo en PDF o entregarlo impreso al equipo.'
      ] },
      { type: 'warning', title: '⚠️ Reglas de oro', content: '**Nunca escribas a mano lo que el ERP ya trae** (por ejemplo, un abono en la caja: se confirma desde la sugerencia). **No se entrega un vestido con saldo pendiente.** **Todo pago lleva soporte** (foto o PDF del comprobante). **Usa siempre el código del vestido**, nunca solo el nombre.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Una asesora llega en la mañana: abre el Inicio, ve en la franja «Agenda de hoy: 5» y «Seguimientos: 3 hoy». Toca cada mosaico, atiende lo pendiente y al final del día cierra la caja de su sede.' }
    ]
  },
  {
    id: 'inicio',
    title: '🏠 Inicio (Dashboard) y alertas',
    description: 'El tablero principal: alertas, cifras del mes y la lista de contratos.',
    icon: <LayoutDashboard className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve este módulo?', content: 'Es lo primero que ves al entrar. Reúne en un solo lugar lo urgente (alertas de colores), las cifras del mes (lo vendido, lo recaudado y lo pendiente por cobrar) y la lista de contratos organizada por etapa: por entregar, en evento, lavandería, historial y anulados.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **INICIO / DASHBOARD**.' },
      { type: 'steps', title: '📝 Las partes del Inicio', items: [
        '**Franja de alertas (arriba):** mosaicos de colores con lo pendiente. Solo aparecen los que tienen algo; si todo está bien dice «Todo al día ✅». Cada mosaico te lleva a su módulo. Están explicados uno por uno en «🚨 Alertas del Inicio».',
        '**Pendiente por recaudar:** lo que deben las clientas en contratos vigentes (saldo + multas). Es la misma cifra de Cuentas por cobrar; tócala para ver el detalle.',
        '**Rendimiento comercial:** el recaudo real del mes (abonos y ventas de contado), lo vendido y la meta, igual que en Metas y Ventas.',
        '**Pestañas de logística:** Por entregar, En evento, Lavandería/Mantenimiento, Historial y Anulados. Cambia de pestaña para ver cada grupo de contratos.',
        '**Filtros de hito:** Cita de medidas, Prueba final, Entrega/Envío y Sesión Pre-XV, con rango de fechas (hoy, esta semana, este mes o personalizado).',
        '**Buscador:** escribe nombre, cédula, número de contrato o código del vestido; busca en todos los contratos, sin importar la pestaña.',
        '**Acciones de cada contrato (menú de la fila):** registrar abono, ver o editar el contrato, registrar entrega y liberar el vestido al regresar.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'Lo que ves depende de tu sede: una asesora ve sus contratos; administración y contabilidad ven todo. Si una cifra no te cuadra, toca la tarjeta: te lleva al detalle donde se calcula.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Ves «Entregas sin registrar: 2» en rojo. Lo tocas, la lista se filtra solo con esos 2 contratos, registras la entrega de cada uno y la alerta desaparece.' }
    ]
  },
  {
    id: 'alertas',
    title: '🚨 Alertas del Inicio (qué significa cada color)',
    description: 'Cada mosaico de la franja superior, qué indica y qué hacer.',
    icon: <AlertTriangle className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirven?', content: 'Son los pendientes importantes del día. Se actualizan solos cada minuto, muestran solo lo de tu sede y solo los módulos que tu rol puede ver. Tocar un mosaico te lleva directo a resolverlo.' },
      { type: 'steps', title: '📝 Cada alerta y qué hacer', items: [
        '**Depósitos por devolver:** solicitudes de devolución de depósito pendientes. 👉 Ir a Depósitos y devolverlo.',
        '**Saldos por cobrar (7 días):** contratos que se entregan en 7 días o menos (o ya vencidos) y todavía deben dinero. 👉 Cobrar antes de entregar.',
        '**Seguimientos (hoy / vencidos):** clientas de primeras visitas a quienes hay que escribir hoy o ya se pasó el día. 👉 Primeras visitas › Seguimientos.',
        '**Agenda de hoy / de mañana:** citas de medidas, pruebas, entregas, sesiones Pre-XV y primeras citas del día. 👉 Calendario.',
        '**Entregas sin registrar:** la fecha de entrega ya pasó y no se registró la entrega. 👉 Filtra la lista del Inicio.',
        '**Borradores sin firmar (+48 h):** contratos creados hace más de 2 días que siguen en borrador. 👉 Completar o anular.',
        '**Vestidos fuera de tienda en alerta:** vestidos que salieron y ya deberían haber vuelto. 👉 Llamar a la clienta.',
        '**Pre-XV incompletos:** contratos de 15 años sin fotógrafo, maquilladora o locación.',
        '**Pedidos de estrene en riesgo:** el vestido pedido al proveedor llega muy cerca o después de la entrega.',
        '**Abonos sin pasar a caja:** pagos registrados en contratos que nadie confirmó en la caja. 👉 Cierres de caja › Ir al día.',
        '**Días de caja sin cerrar / Cierres con diferencia / Abonos sin soporte:** control de la caja de cada sede.',
        '**Traslados por aprobar / Préstamos vencidos:** vestidos que van o vienen entre sedes.',
        '**Mantenimiento demorado (+7 días):** vestidos en lavandería o arreglo hace más de una semana.',
        '**Ventas sin factura:** ventas de vestidos a las que les falta el número de factura de Siigo.',
        '**Servicios de proveedores por pagar** (solo administración) y **Contratos con datos por revisar** (abre una lista con lo que no cuadra en cada contrato).'
      ] },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'La líder de Villavicencio ve «Abonos sin pasar a caja: 6». Lo toca, entra a Cierres de caja, usa «Ir al día» en cada uno, confirma la sugerencia y el mosaico baja a 0.' }
    ]
  },
  {
    id: 'contrato',
    title: '📝 Nuevo contrato (alquiler)',
    description: 'Cómo crear un contrato de alquiler de principio a fin.',
    icon: <ClipboardList className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve este módulo?', content: 'Aquí nace cada alquiler: datos de la clienta, vestidos, fechas, valores, depósito, primer abono y firma digital. El contrato conecta con la agenda de vestidos, la caja, la cartera y las alertas.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Inicio 👉 botón **NUEVO CONTRATO**.' },
      { type: 'steps', title: '📝 Paso a paso', items: [
        '**Visita de origen (obligatoria):** todo contrato directo sale de una cita o vitrina. Busca la visita por código, nombre, teléfono o cédula. Si la clienta llegó sin cita, toca «Registrar vitrina». Al guardar, la visita queda como «Alquiló».',
        '**Clasificación:** «Cliente directo» (lo normal), «Aliado» (el cliente es un aliado y se cargan los datos de su clienta) o «Venta» (venta de un vestido sin contrato; ver «🛍️ Venta de vestidos»).',
        '**Sede y asesora responsable:** primero la sede, luego la asesora de esa sede.',
        '**Datos de la clienta:** tipo y número de documento, nombre, WhatsApp, correo, dirección, fecha y tipo de evento.',
        '**Vestidos:** busca por código. El ERP revisa la disponibilidad en esas fechas y avisa si el vestido está en otra sede (cruce de sedes).',
        '**Fechas:** cita de medidas, prueba final, entrega/envío y devolución. Estas fechas alimentan el calendario y las alertas.',
        '**Valores:** alquiler, arreglos, servicios adicionales y descuentos (promociones o aliado). El depósito sugerido se calcula según el tipo de vestido.',
        '**Cuenta para devolver el depósito:** cuenta bancaria o **llave Bre-B** (celular, cédula, correo o alfanumérica). Es obligatoria salvo que administración la haya hecho opcional en Configuración › Formularios.',
        '**Abono inicial:** valor, medio de pago y **soporte** (foto o PDF del comprobante).',
        '**Firma:** envía el enlace de firma a la clienta; firma desde su celular y el contrato queda firmado.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: '**Un contrato firmado ya no se cambia libremente:** solo administración (o la asesora de operaciones de su sede) puede corregir datos pactados, y queda en el historial. **Los borradores de más de 48 horas** aparecen en las alertas: complétalos o anúlalos.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Sofía vino a su primera cita y escogió el vestido 1390. Buscas su cita por el celular, eliges «Cliente directo», cargas el vestido, pones las fechas, registra un abono de $500.000 con la foto de la transferencia y le envías el enlace de firma.' }
    ]
  },
  {
    id: 'abonos',
    title: '💳 Registrar abono y multas',
    description: 'Cómo registrar pagos, y cómo pagar o condonar una multa.',
    icon: <HandCoins className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Para registrar cada pago que hace la clienta después de firmar. El saldo se recalcula solo, el pago aparece como sugerencia en la caja del día y queda el recibo con su soporte.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Inicio o Cuentas por cobrar 👉 en el contrato, **REGISTRAR ABONO**.' },
      { type: 'steps', title: '📝 Paso a paso', items: [
        'Revisa arriba el **saldo pendiente**. Si hay multa, verás aparte «Alquiler $X · Multa $Y».',
        'Escribe el **monto** (no puede ser mayor que lo que se debe), el **medio de pago** y el número de recibo.',
        'Adjunta el **soporte** (foto o PDF). Sin soporte no se puede guardar.',
        'Guarda. El abono queda en el historial del contrato y en la caja del día como sugerencia para confirmar.',
        '**Multas:** se ven en el recuadro morado «Multa del contrato». **Pagar multa** llena el abono con el valor de la multa. **Condonar multa** (administración y contabilidad) la deja en ceros o la rebaja, sin entrar dinero; pide el motivo y queda en la bitácora.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'Cuando dice **«¡Paz y salvo!»** ya no se pueden registrar más abonos: no debe nada (ni saldo ni multa). Un contrato con multa pendiente **no se puede cerrar** hasta que la multa se pague o se condone.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'El vestido volvió 11 días tarde y el contrato tiene multa de $550.000. Si la clienta paga, tocas «Pagar multa», adjuntas el soporte y guardas. Si gerencia decide perdonarla, administración toca «Condonar multa» y escribe el motivo.' }
    ]
  },
  {
    id: 'entrega',
    title: '📦 Entregas, devoluciones y cierre del contrato',
    description: 'Qué pasa cuando el vestido sale, vuelve y se cierra el contrato.',
    icon: <Package className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Controla el recorrido del vestido: se entrega a la clienta, va al evento, vuelve, pasa por lavandería o arreglo y queda disponible. Al final el contrato se cierra y se resuelve el depósito.' },
      { type: 'steps', title: '📝 Paso a paso', items: [
        '**Entrega:** solo se puede entregar si el saldo está pagado. Registra la entrega en el contrato; el vestido pasa a «en evento».',
        '**Devolución:** cuando el vestido regresa, se revisa su estado y se registra. Si llegó tarde, el ERP calcula la mora y se puede cargar la multa.',
        '**Mantenimiento:** si el vestido necesita lavandería o arreglo, queda «EN MANTENIMIENTO» mientras ese mantenimiento esté abierto; al cerrarlo vuelve a estar disponible.',
        '**Liberar el vestido:** cuando todo está listo, se libera y queda disponible para otros alquileres.',
        '**Cerrar el contrato:** si no debe nada, se abre la confirmación de cierre para revisar el depósito: se devuelve completo o con descuentos por daños. Si debe saldo o multa, el ERP lo dice por su nombre («MULTA pendiente de $…») y el contrato sigue activo.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'Para contratos **Pre-XV (15 años)** no se puede pasar el vestido a lavandería sin llenar antes fotógrafo, maquilladora y locación.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'El vestido de Laura volvió el lunes en buen estado y sin saldo. Lo liberas, el ERP abre el cierre, confirmas devolver el depósito completo a su llave Bre-B y el contrato queda finalizado.' }
    ]
  },
  {
    id: 'calendario',
    title: '🗓️ Calendario de contratos',
    description: 'Pruebas, entregas y fechas de cada clienta, día por día.',
    icon: <CalendarDays className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Muestra en una agenda las citas de medidas, pruebas finales, entregas y sesiones de cada contrato. Abre en el día de hoy y se actualiza sola.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **CALENDARIO CONTRATOS**.' },
      { type: 'steps', title: '📝 Paso a paso', items: [
        'Elige el día o la semana que quieres revisar.',
        'Toca una fila para abrir el contrato en el panel lateral: ahí ves saldo, vestidos y fechas, y puedes editar lo permitido.',
        'El panel muestra si el contrato tiene saldo, para cobrarlo antes de la entrega.'
      ] },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Antes de abrir la tienda revisas el calendario: hoy hay 2 pruebas finales y 1 entrega. Tocas la entrega y ves que tiene saldo de $300.000: llamas a la clienta para que lo traiga.' }
    ]
  },
  {
    id: 'visitas',
    title: '👰 Primeras visitas: citas, vitrinas y seguimientos',
    description: 'Agenda de primeras citas, resultado de cada visita y seguimiento comercial.',
    icon: <Sparkles className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Organiza las primeras citas (presenciales y virtuales), las vitrinas (clientas que llegan sin cita) y el seguimiento a quienes no alquilaron, para no perder ninguna venta.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **PRIMERAS VISITAS** (pestañas Citas y Seguimientos).' },
      { type: 'steps', title: '📝 Paso a paso', items: [
        '**Horarios:** citas de 1 hora, de 9:00 a. m. a 7:00 p. m., de lunes a sábado. Presencial: 2 por hora en cada sede. Virtual: 1 por hora entre todas las sedes. Domingos y festivos no se atiende.',
        '**Reservar:** la clienta reserva con el enlace público («Copiar enlace para reservar») o la asesora la agenda.',
        '**Vitrina:** si llega sin cita, toca «+ Nueva vitrina». No gasta cupos de cita.',
        '**Resultado:** después de la visita registra si asistió, si alquiló o no y por qué.',
        '**Seguimientos:** quien asistió y no alquiló, o no asistió, entra a seguimiento: 5 contactos en días hábiles. Registra cada contacto y su conclusión; un cierre marca los siguientes como «No necesario».',
        '**Buscar a una clienta:** en la pestaña Seguimientos usa «Buscar» con nombre, celular, cédula o contrato (también encuentra seguimientos cerrados). Así registras su respuesta aunque escriba mucho tiempo después.',
        '**Cancelar cita:** en el panel de la cita, «Cancelar cita».'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'Para no crear seguimiento a una vitrina que no alquiló, hay que escribir un motivo de al menos 30 caracteres. Las cifras de «Análisis comercial» salen de estos resultados: regístralos siempre.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Camila vino hace un mes, no alquiló y hoy escribe por WhatsApp. En Seguimientos buscas su celular, abres su seguimiento y registras «Volvió a escribir, agenda prueba»; luego creas el contrato desde su visita.' }
    ]
  },
  {
    id: 'agenda',
    title: '📅 Agenda de vestidos (disponibilidad)',
    description: 'Qué vestido está libre o reservado en una fecha.',
    icon: <CalendarDays className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Para no cruzar fechas: muestra si un vestido está libre, reservado, en evento o en mantenimiento, con sus fotos, en tu sede o en todas (si tu rol tiene «Todas las sedes»).' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **AGENDA DE VESTIDOS**.' },
      { type: 'steps', title: '📝 Paso a paso', items: [
        'Busca el vestido por código o filtra por tipo, talla, color o categoría.',
        'Toca la foto para verla en grande.',
        'Revisa las fechas ocupadas y el precio de lista. Los de «Solo venta» no se alquilan.',
        'Si el vestido está en otra sede, usa **«Pedir traslado / préstamo»** para solicitarlo.'
      ] },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Una clienta de Villavicencio quiere un vestido que está en Bogotá. Lo ves libre para su fecha y tocas «Pedir traslado / préstamo»; Bogotá lo aprueba y lo envía.' }
    ]
  },
  {
    id: 'inventario',
    title: '👗 Gestión de inventario',
    description: 'Crear, editar, archivar y controlar los vestidos.',
    icon: <Store className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Es la base de todos los vestidos: código, nombre, tipo, talla, color, precios, sede, estado, fotos e historial (alquileres, mantenimientos, traslados y estadísticas).' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **GESTIÓN DE INVENTARIO**.' },
      { type: 'steps', title: '📝 Paso a paso', items: [
        '**Nuevo vestido:** botón «Nuevo vestido». Todo es obligatorio: código, clasificación (XV, Gala, Novia, Pajecita, Vestido de cambio, Otro), nombre, talla, color, para qué es (alquiler, venta o ambos) y su precio.',
        '**Reglas del código:** solo letras, números y guiones, sin espacios ni descripción, de 2 a 20 caracteres, en mayúsculas. Es **único en todo el inventario** (todas las sedes, también archivados). Ej.: 1390, 5053XVROJO, QPAC-1438.',
        '**Categoría:** se asigna sola según el tipo y el precio de alquiler (Esencial, Clásica, Premium, Exclusiva, Gala, Nupcial, Encanto, Destello).',
        '**Vistas:** lista o cuadrícula, pestaña «Por estado» y el interruptor «Archivados».',
        '**Ficha del vestido:** toca un vestido para ver sus pestañas de alquileres, mantenimiento, estadísticas y traslados.',
        '**Cambiar de sede:** se hace con un traslado (queda registrado), no editando a mano.',
        '**Archivar / dar de baja:** con motivo; el vestido deja de aparecer para alquilar pero su historial se conserva.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'Cada sede **edita solo su inventario**; los franquiciados y líderes pueden ver el de otras sedes, pero no editarlo. Si un vestido dice «no tiene una sede válida», administración debe asignarle la sede en la columna Ubicación.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Llegó un vestido nuevo de XV a Bogotá. Creas el código 1501, eliges XV Años, talla 8, color rosa, alquiler $1.800.000 y el ERP le pone la categoría sola.' }
    ]
  },
  {
    id: 'traslados',
    title: '🚚 Traslados y préstamos entre sedes',
    description: 'Mover vestidos de una sede a otra, con aprobación y seguimiento.',
    icon: <Truck className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Para pedir un vestido a otra sede, ya sea prestado (vuelve en una fecha) o definitivo, y seguirlo hasta que llegue y regrese.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **TRASLADOS** (o desde la Agenda de vestidos: «Pedir traslado / préstamo»).' },
      { type: 'steps', title: '📝 Paso a paso', items: [
        '**Solicitar:** elige el vestido, la sede destino, el tipo (préstamo o definitivo), la fecha de devolución si es préstamo y el motivo.',
        '**Aprobar:** lo aprueba la sede dueña del vestido o administración.',
        '**Enviar:** la sede de origen registra el envío (transportadora y guía; el costo es opcional).',
        '**Recibir:** la sede destino confirma que llegó.',
        '**Devolver:** si es préstamo, al terminar se registra la devolución.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'Un vestido no puede tener dos traslados en curso. Si un préstamo pasa su fecha de devolución, aparece como «Préstamo vencido» en las alertas.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Barranquilla pide prestado el vestido 5051 a Bogotá hasta el 20 de diciembre. Bogotá aprueba, lo envía con guía, Barranquilla lo recibe y después del evento lo devuelve.' }
    ]
  },
  {
    id: 'ventas',
    title: '🛍️ Venta de vestidos',
    description: 'Vender un vestido de contado, con su comprobante o factura de venta.',
    icon: <ShoppingBag className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Para vender un vestido (sin contrato de alquiler). La venta entra sola a la caja del día, suma en Metas y Ventas y genera el comprobante para imprimir. Queda lista para la factura electrónica en Siigo con el código del vestido + V.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Nuevo contrato 👉 botón **VENTA** (al lado de Aliado), o la alerta «Ventas sin factura».' },
      { type: 'steps', title: '📝 Paso a paso', items: [
        'El vestido debe estar marcado **«Venta»** en Inventario y tener precio de venta.',
        'Busca el vestido por código y toca **Vender**.',
        'Si hay descuento, escribe el valor y el motivo.',
        'Elige el medio de pago y, si es transferencia o tarjeta, la cuenta que recibió.',
        'Llena los datos para la factura: nombre, cédula o NIT, teléfono y correo de quien compra.',
        'Guarda: se abre el **comprobante** (consecutivo VTA-000001…) para imprimir o guardar en PDF.',
        'Cuando hagas la factura en Siigo, toca **«N° factura»** y anota el número: el documento pasa a llamarse «Factura de venta».'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'No se puede vender un vestido con contratos de alquiler activos. **Anular** una venta (administración y contabilidad) la saca de la caja y el vestido vuelve a estar disponible.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Una clienta compra el vestido 1390 por $2.000.000 con $200.000 de descuento por exhibición. Registras la venta, le entregas el comprobante y más tarde anotas el número de factura de Siigo.' }
    ]
  },
  {
    id: 'catalogo',
    title: '📸 Catálogo de vestidos',
    description: 'El catálogo para mostrar y compartir con las clientas.',
    icon: <Images className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Muestra los vestidos con foto, tipo, categoría y precio, filtrables, y permite descargar un catálogo en PDF para enviar a las clientas.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **CATÁLOGO DE VESTIDOS**.' },
      { type: 'steps', title: '📝 Paso a paso', items: [
        'Filtra por tipo, categoría, talla o color.',
        'Revisa el precio de alquiler o «Solo venta», y el precio de venta si aplica.',
        'Descarga el PDF con los vestidos filtrados para compartir.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'Cada asesora ve el catálogo de su sede. El descuento de aliados nunca se muestra en el catálogo.' }
    ]
  },
  {
    id: 'estrene',
    title: '🛒 Pedidos estrene',
    description: 'Seguimiento de los vestidos que se piden nuevos para una clienta.',
    icon: <Package className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Cuando un contrato es de «Alquiler estrene», el vestido se pide al proveedor. Aquí se sigue ese pedido hasta que llega y se entrega, con un semáforo que avisa si no alcanza a llegar.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **PEDIDOS ESTRENE**.' },
      { type: 'steps', title: '📝 Paso a paso', items: [
        'Vincula el contrato y registra el pedido al proveedor con la fecha estimada de llegada.',
        'Actualiza el estado: Pendiente de compra → Comprado → En tránsito → Recibido en tienda → Entregado a clienta.',
        'Revisa el semáforo: 🟢 a tiempo, 🟡 ajustado (5 días o menos de margen), 🔴 crítico (no alcanza).',
        'Cada cambio queda en la bitácora del pedido.'
      ] },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'El pedido de Valentina sale 🟡 ajustado: llega 3 días antes de su entrega. Llamas al proveedor para confirmar el envío.' }
    ]
  },
  {
    id: 'retablos',
    title: '🖼️ Retablos',
    description: 'Seguimiento de cada retablo vendido en un contrato.',
    icon: <Gift className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Lleva el control de cada retablo vendido en un contrato, desde que se marca en el contrato hasta que se entrega.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **RETABLOS**.' },
      { type: 'steps', title: '📝 Paso a paso', items: [
        'En el contrato, marca el retablo en su sección.',
        'En Retablos sigue su estado hasta la entrega.',
        'Si el contrato se anula, el retablo también.'
      ] }
    ]
  },
  {
    id: 'depositos',
    title: '🔐 Depósitos y devoluciones',
    description: 'Control del depósito de garantía de cada contrato y su devolución.',
    icon: <ShieldCheck className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Cada contrato tiene un depósito de garantía. Aquí se ve cuánto se recibió, se solicitan y registran las devoluciones (completas o con descuentos por daños) y se guarda el soporte.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **DEPÓSITOS Y DEVOLUCIONES** (o la alerta «Depósitos por devolver»).' },
      { type: 'steps', title: '📝 Paso a paso', items: [
        'Al cerrar un contrato se crea la solicitud de devolución.',
        'Revisa la cuenta o llave Bre-B de la clienta (se valida el formato de cada tipo de llave).',
        'Si hay descuentos (daños, mora), escríbelos con su motivo.',
        'Haz la transferencia y registra la devolución con el comprobante.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'Los depósitos se manejan **aparte** del dinero de la caja (pestaña «Depósitos (aparte)» en Cierres de caja), porque no son ingresos de Ámbar: se devuelven.' }
    ]
  },
  {
    id: 'cobros',
    title: '💰 Cuentas por cobrar',
    description: 'Quién debe, cuánto y cuándo se entrega su vestido.',
    icon: <Wallet className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Lista los contratos vigentes que deben dinero (saldo + multas), ordenados por la fecha de entrega del vestido, para cobrar a tiempo. Avisa a 7 días y a 3 días de la entrega.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **FINANZAS › CUENTAS POR COBRAR** (o la tarjeta «Pendiente por recaudar» del Inicio).' },
      { type: 'steps', title: '📝 Paso a paso', items: [
        'Mira las tarjetas de arriba: vencido (ya pasó la entrega), 3 días o menos, 4 a 7 días y más adelante.',
        'Filtra por plazo, sede, asesora o busca por contrato o cliente. «Solo mis contratos» muestra los tuyos.',
        'Toca **Registrar abono** en el contrato para cobrar.',
        '**Exportar Excel** descarga la lista filtrada.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: '**El vestido no se entrega mientras el contrato tenga saldo.** Esta cifra es la misma «Pendiente por recaudar» del Inicio y de Reportes.' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'El lunes filtras «Urgentes»: 6 contratos se entregan esta semana con saldo. Le escribes a cada clienta y registras los abonos a medida que pagan.' }
    ]
  },
  {
    id: 'caja',
    title: '🧾 Cierres de caja',
    description: 'Ingresos, egresos y cierre diario de cada sede.',
    icon: <Receipt className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Registra todo el dinero que entra y sale de cada sede cada día, por medio de pago y por cuenta, y cierra la caja con el conteo del efectivo. Así se sabe dónde está cada peso.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **FINANZAS › CIERRES DE CAJA**.' },
      { type: 'steps', title: '📝 Paso a paso del día', items: [
        '**Confirma los abonos:** los pagos de contratos aparecen como **sugerencias** («Pago de contrato»). Confírmalos y elige la cuenta donde llegó la transferencia. No los escribas a mano.',
        '**Registra otros movimientos:** ingresos (otro ingreso) y egresos (gastos, transporte, compras, consignación a banco), con su comprobante.',
        '**Revisa «¿Dónde quedó el dinero de este día?»:** cuánto entró y salió por cada cuenta y la caja menor. «Sin cuenta asignada» significa que falta decir a qué banco llegó una transferencia.',
        '**Cierra la caja:** cuenta el efectivo, escríbelo y cierra. El ERP calcula la diferencia contra lo esperado.',
        '**Aviso amarillo «abonos sin pasar a caja»:** muestra los pagos de días anteriores que faltan. «Ir al día» abre ese día; si dice «cerrado: reabrir», primero hay que reabrirlo.',
        '**Pestañas:** «¿Dónde está la plata?» (saldo de cada cuenta), «Depósitos (aparte)» y «Cuentas y caja menor» (configurar bancos, billeteras y cajas menores).'
      ] },
      { type: 'steps', title: '📝 Quién puede hacer qué', items: [
        '**Asesoras:** confirmar abonos, registrar movimientos y cerrar la caja de su sede.',
        '**Asesora líder y franquiciado (su sede):** además corregir la cuenta, el medio o la descripción de un movimiento, reabrir un día cerrado y configurar las cuentas de su sede.',
        '**Contabilidad y administración (todas las sedes):** todo lo anterior, más corregir valor y categoría, cuentas para todas las sedes y el inicio de la caja.',
        'Todo cambio pide motivo y queda en el historial del movimiento.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: '**Cierra la caja todos los días.** Un día sin cerrar o con diferencia aparece en las alertas. Las transferencias deben decir a qué cuenta llegaron: registra primero los bancos y billeteras en «Cuentas y caja menor».' },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Al final del día en Pereira: confirmas 2 abonos (uno por Nequi, otro en efectivo), registras un egreso de $3.700 de insumos con foto del recibo, cuentas $164.500 en efectivo, coincide con lo esperado y cierras.' }
    ]
  },
  {
    id: 'metas',
    title: '🎯 Metas y ventas',
    description: 'Meta del mes por sede, lo vendido y cuánto falta.',
    icon: <TrendingUp className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Muestra la meta del mes de cada sede, lo vendido (contratos del mes y ventas de vestidos), el porcentaje de cumplimiento, la meta de hoy y lo recaudado.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **METAS Y VENTAS**.' },
      { type: 'steps', title: '📝 Paso a paso', items: [
        'Elige el mes y la sede.',
        '**Meta de hoy** = (meta del mes − lo vendido hasta ayer) ÷ días operativos que faltan (lunes a sábado sin festivos).',
        'Administración define la meta en «Configuración de metas» y puede asignar metas por asesora.',
        'El historial muestra los contratos y abonos de cualquier periodo.'
      ] },
      { type: 'example', title: '💡 Ejemplo práctico', content: 'Bogotá tiene meta de $50.000.000 y lleva $20.000.000 a mitad de mes: la meta de hoy sube para alcanzarla.' }
    ]
  },
  {
    id: 'reportes',
    title: '📊 Reportes y estadísticas',
    description: 'Cifras del negocio: facturado, pendiente y vestidos más alquilados.',
    icon: <BarChart3 className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Da una vista de inteligencia del negocio: lo facturado en el periodo, lo pendiente por recaudar y los vestidos más rentables por sede.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **REPORTES Y ESTADÍSTICAS** (o «Ver reporte full» en el Inicio).' },
      { type: 'steps', title: '📝 Paso a paso', items: ['Elige el periodo y la sede.', 'Revisa las tarjetas y el ranking de vestidos.', 'Usa estas cifras para decidir compras y promociones.'] }
    ]
  },
  {
    id: 'proveedores',
    title: '🤝 Proveedores',
    description: 'Catálogo de servicios, gestión de proveedores y pagos.',
    icon: <Handshake className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Maneja los proveedores de servicios (fotografía, maquillaje, locaciones, etc.), sus tarifas por sede, los servicios que se agregan a cada contrato y el pago a cada proveedor.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **PROVEEDORES** (Catálogo, Gestión y Pagos).' },
      { type: 'steps', title: '📝 Paso a paso', items: [
        '**Catálogo de proveedores:** las asesoras consultan servicios, paquetes, tarifas y condiciones para ofrecer a la clienta.',
        '**En el contrato:** se agregan los servicios del proveedor; el valor para la clienta se suma al contrato.',
        '**Gestión (administración):** datos del proveedor, cuenta bancaria o llave Bre-B, tarifas y documentos.',
        '**Pagos a proveedores (administración):** solo se pagan servicios marcados como Realizados. Marca uno o varios del mismo proveedor, adjunta el comprobante y registra el pago.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'Marca el servicio como **Realizado** cuando el proveedor cumpla; si no, no aparece para pago.' }
    ]
  },
  {
    id: 'correo',
    title: '✉️ Correo (promociones)',
    description: 'Correos automáticos y promociones a clientas con autorización.',
    icon: <Mail className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Envía correos de bienvenida, agradecimiento y promociones a las clientas que dieron su autorización comercial, respetando horarios y cupos.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **CORREO (PROMOCIONES)**.' },
      { type: 'steps', title: '📝 Paso a paso', items: [
        'Solo reciben quienes tienen **autorización comercial vigente**.',
        'Los envíos se detienen si la persona alquila, se da de baja o su seguimiento se cierra con «No contactar».',
        'Lo que no cabe en el cupo o el horario queda en cola para el siguiente turno (hora de Colombia).',
        'A quien tiene contrato vigente solo le llegan la bienvenida y el agradecimiento.'
      ] }
    ]
  },
  {
    id: 'aliados',
    title: '🌟 Red de aliados',
    description: 'Aliados que refieren clientas, sus clientas y contratos en modo aliado.',
    icon: <Users className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Los aliados (organizadores, fotógrafos, etc.) refieren clientas a Ámbar. El ERP guarda a cada clienta referida, le da su beneficio y permite hacer contratos donde el aliado es el cliente.' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **VENTAS Y CRM** › **Aliados**.' },
      { type: 'steps', title: '📝 Reglas principales', items: [
        '**Acuerdo del aliado:** se firma digitalmente y dura 1 año; se renueva solo si tuvo al menos un contrato en ese año. Si no, queda inactivo.',
        '**Clientas referidas:** el aliado las registra con su enlace o código. Una clienta solo puede tener un aliado (el primero que la registró).',
        '**Vigencia de la clienta:** 1 año desde su registro si no hace contrato. Si se vence, vuelve a ser cliente directa.',
        '**Contrato modo Aliado:** en Nuevo contrato elige «Aliado», carga el aliado y su clienta. Tiene descuento sobre el vestido y un pago mínimo; no se despacha con saldo pendiente.',
        '**Gestión de aliados (administración):** métricas, enlaces de referencia y aprobación de aliados.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'El porcentaje de descuento de aliados nunca se muestra en el catálogo ni a las clientas.' }
    ]
  },
  {
    id: 'horarios',
    title: '⏰ Control de asistencia (horarios)',
    description: 'Turnos planificados del personal y horas trabajadas.',
    icon: <Clock className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Planifica los turnos semanales del personal de cada sede y suma las horas: lunes a sábado, domingos y horas extras (más de 42 horas a la semana).' },
      { type: 'route', title: '📍 ¿Cómo llegar aquí?', content: 'Menú lateral 👉 **CONTROL DE ASISTENCIA**.' },
      { type: 'steps', title: '📝 Paso a paso', items: [
        'Elige la sede y la semana.',
        'Escribe el horario de cada persona; «Repetir semana 1» copia el horario planificado.',
        'Guarda los cambios (el ERP avisa si sales sin guardar).',
        '«Ver reporte» muestra el resumen mensual agrupado.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'Si no aparece nadie, revisa que las asesoras estén activas y tengan sede asignada en Gestión de equipo.' }
    ]
  },
  {
    id: 'admin',
    title: '⚙️ Administración y configuración',
    description: 'Equipo, roles, permisos, configuración y conexiones (solo administración).',
    icon: <Settings className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'Desde aquí administración maneja quién entra al ERP, qué puede hacer cada rol y cómo funcionan las reglas del negocio.' },
      { type: 'steps', title: '📝 Cada opción', items: [
        '**Gestión de equipo:** crear usuarios, asignar rol y sedes, activar o desactivar.',
        '**Roles y permisos:** qué puede hacer cada rol (por ejemplo «Corregir movimientos de caja», «Reabrir caja», «Registrar venta de vestidos») y si ve **«Todas las sedes»** en un módulo.',
        '**Accesos por perfil:** qué paneles ve una persona en particular («Quitar» oculta un panel).',
        '**Configuración base:** formularios (qué campos son obligatorios, como la cuenta para devolver el depósito), categorías de vestidos por precio y otras reglas.',
        '**Cláusulas del contrato:** el texto legal de los contratos.',
        '**Facturación por sede (Siigo):** credenciales de Siigo de cada sede.',
        '**Integraciones:** conexión de WhatsApp (número 304) y otras.'
      ] },
      { type: 'warning', title: '⚠️ ¡Ojo con esto!', content: 'Cambiar un rol afecta a todas las personas con ese rol. Las claves y tokens de integraciones nunca se comparten por chat.' }
    ]
  },
  {
    id: 'perfil',
    title: '🙋 Mi perfil y soporte',
    description: 'Tus datos, tu rol y cómo pedir ayuda.',
    icon: <UserCircle className="w-5 h-5" />,
    sections: [
      { type: 'intro', title: '🎯 ¿Para qué sirve?', content: 'En «Mi perfil» ves tu nombre, tu rol y tu sede. Si algo no corresponde (por ejemplo, no ves un módulo que necesitas), avisa a administración.' },
      { type: 'steps', title: '📝 Cuando algo falle', items: [
        'Lee el mensaje del ERP: casi siempre dice qué falta (soporte, motivo, cuenta, sede).',
        'Busca la palabra en este manual.',
        'Si sigue, envía a administración una captura de pantalla con el número del contrato o el código del vestido.'
      ] }
    ]
  }
];

export default function ManualUsuarioPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(MANUAL_DATA[0].id);
  const [search, setSearch] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const filteredData = useMemo(() => {
    if (!search.trim()) return MANUAL_DATA;
    const q = search.toLowerCase();
    return MANUAL_DATA.filter(item => 
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
    return MANUAL_DATA.find(t => t.id === activeTab) || MANUAL_DATA[0];
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
            filteredData.map(tab => (
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
                Guía Oficial
              </span>
              <h1 className="text-3xl md:text-5xl font-black mb-4 tracking-tight leading-tight">
                {activeContent.title}
              </h1>
              <p className="text-gray-300 text-lg md:text-xl font-medium max-w-2xl">
                {activeContent.description}
              </p>
            </div>
          </div>

          {/* Cuerpo del Artículo */}
          <div className="p-8 md:p-12">
            {activeContent.sections.map((sec, i) => renderSection(sec, i))}
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
        <p className="mb-6 text-gray-600">Guía módulo por módulo para todo el equipo.</p>
        {MANUAL_DATA.map(m => (
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
