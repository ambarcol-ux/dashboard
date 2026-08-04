'use client';

import React, { useState, useMemo } from 'react';
import { BookOpen, Search, Menu, X, ChevronRight, CheckCircle2, AlertTriangle, Lightbulb, Play, ArrowRight, LayoutDashboard, CalendarDays, ShoppingBag, HandCoins, Package, TrendingUp, Handshake, Clock, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';

const MANUAL_DATA = [
  {
    id: 'dashboard',
    title: '🏠 Dashboard y Contratos (¡Hola, PREXV!)',
    description: 'El corazón de Ámbar Couture donde nacen los alquileres y ventas.',
    icon: <LayoutDashboard className="w-5 h-5" />,
    sections: [
      {
        type: 'intro',
        title: '🎯 ¿Para qué sirve este módulo?',
        content: '¡Es la puerta principal! Aquí puedes ver un resumen rápido de cómo va el negocio, crear nuevos contratos para nuestras hermosas clientas, y manejar las rentas normales o los paquetes súper especiales de 15 Años (PREXV).'
      },
      {
        type: 'route',
        title: '📍 ¿Cómo llegar aquí?',
        content: 'Abre el menú lateral (Sidebar) 👉 Haz clic en **DASHBOARD** (el primer botón).'
      },
      {
        type: 'steps',
        title: '📝 Paso a paso para usarlo',
        items: [
          '**Crear un Contrato:** Haz clic en el botón verde "Nuevo Contrato".',
          '**Llenar los datos:** Escribe el nombre de la clienta, el vestido que se lleva y cuándo es el evento.',
          '**¡Mágico PREXV!** Si seleccionas el tipo de evento "PreXV", el sistema automáticamente preparará todo para una sesión de fotos increíble.',
          '**Firmar:** Pídele a la clienta que firme digitalmente y ¡listo!'
        ]
      },
      {
        type: 'warning',
        title: '⚠️ ¡Ojo con esto!',
        content: 'Si estás haciendo un contrato PREXV (15 Años), **¡Cuidado!** El sistema no te dejará pasar el vestido a estado de "Lavandería" si no has llenado antes los datos del Fotógrafo, Maquilladora y Locación. ¡No olvides llenar la bitácora de fotos!'
      },
      {
        type: 'example',
        title: '💡 Ejemplo práctico',
        content: 'Llega Sofía a alquilar su vestido de 15 años. Creas el contrato, marcas "PreXV" y al guardar, el sistema te crea una "Ruta Especial" solo para ella. ¡Le puedes agendar la sesión de fotos ahí mismo!'
      }
    ]
  },
  {
    id: 'agenda',
    title: '📅 Agenda de Vestidos',
    description: 'El calendario mágico donde vemos dónde está cada vestido.',
    icon: <CalendarDays className="w-5 h-5" />,
    sections: [
      {
        type: 'intro',
        title: '🎯 ¿Para qué sirve este módulo?',
        content: '¡Para no chocar fechas! Como en un hotel, aquí miras qué vestido está libre o reservado para una fecha específica.'
      },
      {
        type: 'route',
        title: '📍 ¿Cómo llegar aquí?',
        content: 'Menú lateral 👉 Haz clic en **AGENDA DE VESTIDOS**.'
      },
      {
        type: 'steps',
        title: '📝 Paso a paso para usarlo',
        items: [
          '**Buscar:** Escribe el nombre o código del vestido en la barra superior.',
          '**Mover el calendario:** Usa las flechitas para cambiar de mes.',
          '**Ver colores:** Si ves una barrita roja, el vestido está alquilado. Si está verde, está libre y listo para brillar.'
        ]
      },
      {
        type: 'warning',
        title: '⚠️ ¡Ojo con esto!',
        content: 'Si un vestido está bloqueado para un fin de semana, NO intentes alquilarlo otra vez para la misma fecha. ¡Las fechas bloqueadas son ley!'
      },
      {
        type: 'example',
        title: '💡 Ejemplo práctico',
        content: 'Una novia pregunta por el vestido "Princesa Esmeralda" para el 15 de Octubre. Vas a la agenda, lo buscas y ¡uf, está libre! Puedes decirle que sí de inmediato.'
      }
    ]
  },
  {
    id: 'estrene',
    title: '✨ Pedidos de Alquiler Estrene',
    description: 'Sigue el rastro de esos vestidos nuevos que vienen en camino.',
    icon: <ShoppingBag className="w-5 h-5" />,
    sections: [
      {
        type: 'intro',
        title: '🎯 ¿Para qué sirve este módulo?',
        content: 'Es tu radar personal. Te ayuda a rastrear los vestidos totalmente nuevos que encargamos para las clientas (Alquiler Estrene), desde que se compran hasta que llegan a la tienda.'
      },
      {
        type: 'route',
        title: '📍 ¿Cómo llegar aquí?',
        content: 'Menú lateral 👉 Haz clic en **PEDIDOS ESTRENE**.'
      },
      {
        type: 'steps',
        title: '📝 Paso a paso para usarlo',
        items: [
          '**Nuevo Pedido:** Clic en "Nuevo Pedido Estrene".',
          '**Vincular:** Selecciona el contrato de la clienta al que pertenece este vestido.',
          '**Llenar fechas vitales:** Anota cuándo lo compraste y cuándo crees que llegará (Fecha Estimada). NUNCA dejes el nombre del vestido vacío.',
          '**Mover Tarjetitas (Kanban):** Cuando el vestido avance, arrastra su tarjetita con el mouse a la siguiente columna (Ej. De "Comprado" a "En Camino").'
        ]
      },
      {
        type: 'warning',
        title: '⚠️ ¡Ojo con esto!',
        content: '¡El Nombre o Referencia del Vestido es súper OBLIGATORIO! Además, si un vestido se retrasa y pasa su fecha estimada, la tarjetita se pondrá Roja 🚨. ¡Avisa a la clienta!'
      },
      {
        type: 'example',
        title: '💡 Ejemplo práctico',
        content: 'Compramos un vestido sirena en Miami. Creas el pedido, lo arrastras a "Comprado". Cuando la transportadora te envíe la guía, entras, dejas un comentario ("Guía #123") y lo arrastras a "En Camino". ¡Todo el equipo sabrá dónde está!'
      }
    ]
  },
  {
    id: 'depositos',
    title: '💰 Devolución de Depósitos',
    description: 'Regresando el dinero a las clientas como unos profesionales.',
    icon: <HandCoins className="w-5 h-5" />,
    sections: [
      {
        type: 'intro',
        title: '🎯 ¿Para qué sirve este módulo?',
        content: 'Es la caja fuerte virtual. Sirve para registrar cuando le devolvemos a una clienta el dinero de garantía (depósito) que dejó por su vestido, e incluso aplicarle descuentos si el vestido sufrió algún accidente.'
      },
      {
        type: 'route',
        title: '📍 ¿Cómo llegar aquí?',
        content: 'Menú lateral 👉 Haz clic en **DEVOLUCIÓN DEPÓSITOS**.'
      },
      {
        type: 'steps',
        title: '📝 Paso a paso para usarlo',
        items: [
          '**Buscar Contrato:** En el cajón de búsqueda, escribe el número de contrato o la cédula de la clienta.',
          '**Revisar fecha:** Automáticamente verás la fecha original en que pagaron.',
          '**¿Descuentos?:** Si el vestido llegó con una mancha de vino o un roto, activa la opción de descuento y anota el valor.',
          '**Subir comprobante:** Sube la foto o PDF de la transferencia bancaria de la devolución.',
          '**Guardar y Notificar:** Haz clic en guardar, y luego, en la tabla de abajo, presiona el logo de WhatsApp para enviarle un mensaje automático a la clienta.'
        ]
      },
      {
        type: 'warning',
        title: '⚠️ ¡Ojo con esto!',
        content: 'Si aplicas un descuento, SIEMPRE debes escribir el motivo (Ej: "Daño en el velo"). Las cuentas claras conservan la amistad.'
      },
      {
        type: 'example',
        title: '💡 Ejemplo práctico',
        content: 'María dejó $100.000 de depósito. Pero entregó el vestido 2 días tarde. En el módulo, buscas a María, aplicas un descuento de $20.000, escribes "Mora de 2 días" y le devuelves $80.000. ¡El sistema hace la resta solito!'
      }
    ]
  },
  {
    id: 'inventario',
    title: '👗 Gestión de Inventario',
    description: 'El armario digital de todos nuestros tesoros.',
    icon: <Package className="w-5 h-5" />,
    sections: [
      {
        type: 'intro',
        title: '🎯 ¿Para qué sirve este módulo?',
        content: 'Aquí guardamos todos y cada uno de los vestidos y accesorios que tenemos en las tiendas. Si entra algo nuevo, aquí se registra.'
      },
      {
        type: 'route',
        title: '📍 ¿Cómo llegar aquí?',
        content: 'Menú lateral 👉 Haz clic en **GESTIÓN DE INVENTARIO** (Solo para Administradores).'
      },
      {
        type: 'steps',
        title: '📝 Paso a paso para usarlo',
        items: [
          'Haz clic en el botón "Nuevo Artículo".',
          'Tómale una foto bonita al vestido y súbela.',
          'Escribe su nombre, talla, color y precio de alquiler.',
          'Selecciona a qué Sede pertenece (Villavicencio, Cúcuta, etc.).',
          'Guarda los cambios y ¡listo!, ya se puede alquilar en el Dashboard.'
        ]
      },
      {
        type: 'warning',
        title: '⚠️ ¡Ojo con esto!',
        content: 'No dupliques los códigos. Cada vestido es único como un copo de nieve ❄️ y necesita su propio código irrepetible.'
      },
      {
        type: 'example',
        title: '💡 Ejemplo práctico',
        content: 'Llegó una corona nueva de cristales. Vas a inventario, creas un accesorio, subes su foto y le pones de precio $50.000. Desde ese momento, las asesoras ya la pueden ofrecer.'
      }
    ]
  },
  {
    id: 'aliados',
    title: '🤝 Red de Aliados',
    description: 'Llevando la cuenta de nuestros súper amigos promotores.',
    icon: <Handshake className="w-5 h-5" />,
    sections: [
      {
        type: 'intro',
        title: '🎯 ¿Para qué sirve este módulo?',
        content: 'Sirve para registrar a los maquilladores, fotógrafos o amigos que nos recomiendan clientas, y para saber cuánto dinero (comisión) les debemos a fin de mes.'
      },
      {
        type: 'route',
        title: '📍 ¿Cómo llegar aquí?',
        content: 'Menú lateral 👉 En la sección "RED DE ALIADOS", tienes **GESTIÓN DE ALIADOS** y **CIERRE DE MES**.'
      },
      {
        type: 'steps',
        title: '📝 Paso a paso para usarlo',
        items: [
          '**Crear Aliado:** En Gestión de Aliados, registra su nombre y su nivel (Oro, Plata, Bronce).',
          '**Asignar en Ventas:** Cuando hagas un contrato en el Dashboard, pon el nombre de ese aliado para que se gane su puntito.',
          '**Pagar a Fin de Mes:** Entra a "Cierre de Mes", selecciona el mes, y verás exactamente cuánto hay que depositarle a cada aliado.'
        ]
      },
      {
        type: 'warning',
        title: '⚠️ ¡Ojo con esto!',
        content: 'Las comisiones varían según el nivel. Un aliado Oro gana más porcentaje que un Bronce. ¡Revisa bien la Configuración de Escalas!'
      },
      {
        type: 'example',
        title: '💡 Ejemplo práctico',
        content: 'El fotógrafo "Flash" nos envió a 5 quinceañeras este mes. En el Cierre de Mes, el sistema sumó todo lo que Flash nos trajo y nos dice "Págale $300.000". Clic en "Pagar" y le envías el comprobante por WhatsApp.'
      }
    ]
  },
  {
    id: 'horarios',
    title: '⏱️ Control de Asistencia',
    description: 'La maquinita del tiempo para marcar tu entrada y salida.',
    icon: <Clock className="w-5 h-5" />,
    sections: [
      {
        type: 'intro',
        title: '🎯 ¿Para qué sirve este módulo?',
        content: 'Para registrar a qué hora llegas a la tienda, cuándo sales a almorzar y cuándo terminas tu turno. Es como ponchar tarjeta digitalmente.'
      },
      {
        type: 'route',
        title: '📍 ¿Cómo llegar aquí?',
        content: 'Menú lateral 👉 Haz clic en **CONTROL DE ASISTENCIA**.'
      },
      {
        type: 'steps',
        title: '📝 Paso a paso para usarlo',
        items: [
          'Llegas a la tienda, abres el módulo y presionas "Entrada".',
          'Si sales a comer, presionas "Inicio Pausa". Al volver, "Fin Pausa".',
          'Al irte a casa, presionas "Salida".',
          'Si el sistema te lo pide, puedes tomarte una selfie rapidita para comprobar que estás ahí.'
        ]
      },
      {
        type: 'warning',
        title: '⚠️ ¡Ojo con esto!',
        content: '¡No olvides marcar tu salida! Si se te olvida, el sistema pensará que te quedaste a dormir en la tienda.'
      },
      {
        type: 'example',
        title: '💡 Ejemplo práctico',
        content: 'Llegas a las 9:00 AM, marcas Entrada. Te vas a almorzar a la 1:00 PM (Inicio Pausa), regresas a las 2:00 PM (Fin Pausa). Al cerrar la tienda a las 7:00 PM, marcas Salida.'
      }
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
      <div className="md:hidden p-4 bg-white border-b border-gray-200 flex justify-between items-center z-20">
        <div className="flex items-center gap-2 text-indigo-600 font-black">
          <BookOpen className="w-5 h-5" /> Manual
        </div>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 bg-gray-100 rounded-lg">
          {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Sidebar de Navegación */}
      <div className={`
        fixed inset-y-0 left-0 z-10 w-72 bg-white border-r border-gray-200 flex flex-col transition-transform duration-300 md:relative md:translate-x-0
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
      <div className="flex-1 w-full h-screen overflow-y-auto relative bg-gray-50/50">
        
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
      
    </div>
  );
}
