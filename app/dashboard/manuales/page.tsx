'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  BookOpen, Users, ShieldCheck, FileText, CalendarDays, Package, TrendingUp, 
  Handshake, Settings, Banknote, Clock, Loader2, Info
} from 'lucide-react';
import Sidebar from '@/components/Sidebar';

type Role = 'ASESORAS' | 'ADMINISTRADORES';
type Section = string;

export default function ManualesPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeRole, setActiveRole] = useState<Role>('ASESORAS');
  const [activeSection, setActiveSection] = useState<Section>('contrato_nuevo');

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();
        setUser({ ...user, rol: profile?.rol, nombre: profile?.nombre });
        
        // Si es admin, mostrarle por defecto la vista de admin (aunque puede cambiar)
        if (profile?.rol === 'admin' || user.email === 'dubian.h88@gmail.com') {
          setActiveRole('ADMINISTRADORES');
          setActiveSection('gestion_inventario');
        }
      }
      setLoading(false);
    };
    checkUser();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const sectionsAsesoras = [
    { id: 'contrato_nuevo', label: 'Crear Contrato Nuevo', icon: FileText },
    { id: 'agenda_vestidos', label: 'Agenda de Vestidos', icon: CalendarDays },
    { id: 'control_asistencia', label: 'Control de Asistencia', icon: Clock },
  ];

  const sectionsAdmin = [
    { id: 'gestion_inventario', label: 'Gestión de Inventario', icon: Package },
    { id: 'reportes_estadisticas', label: 'Reportes y Estadísticas', icon: TrendingUp },
    { id: 'metas_ventas', label: 'Metas y Ventas', icon: TargetIcon },
    { id: 'gestion_aliados', label: 'Gestión de Aliados', icon: Handshake },
    { id: 'config_comisiones', label: 'Config. Comisiones', icon: Settings },
    { id: 'cierre_mes', label: 'Cierre de Mes', icon: Banknote },
    { id: 'gestion_equipo', label: 'Gestión de Equipo', icon: Users },
    { id: 'configuracion_base', label: 'Configuración Base', icon: Settings },
  ];

  // Helper icon component
  function TargetIcon(props: any) {
    return (
      <svg
        {...props}
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    );
  }

  const renderContent = () => {
    switch (activeSection) {
      // ----------------------------------------------------
      // SECCIÓN ASESORAS
      // ----------------------------------------------------
      case 'contrato_nuevo':
        return (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
            <div>
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">Cómo crear un Contrato Nuevo</h2>
              <p className="text-gray-500 mt-2">Sigue estos pasos para registrar el alquiler de un vestido a una cliente.</p>
            </div>
            
            <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-8">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center font-black text-lg">1</div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Ingresar al formulario</h3>
                  <p className="text-gray-600 leading-relaxed">
                    Dirígete a la opción <strong>DASHBOARD</strong> en el menú lateral izquierdo. Luego, en la esquina superior derecha, haz clic en el botón rosa que dice <strong>"NUEVO CONTRATO"</strong>.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center font-black text-lg">2</div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Llenar datos de la cliente</h3>
                  <p className="text-gray-600 leading-relaxed mb-4">
                    Escribe la fecha del evento, el nombre de la novia, documento de identidad, y su información de contacto (WhatsApp y Correo Electrónico). Es muy importante escribir el WhatsApp correctamente para poder enviarle notificaciones.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center font-black text-lg">3</div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Añadir el Vestido</h3>
                  <p className="text-gray-600 leading-relaxed">
                    En la sección de vestidos, busca el vestido por su código (Ej: <em>CV-01</em>) o escanea el código de barras si está disponible. El sistema cargará la foto y el precio del vestido. Ajusta el precio si hay un descuento autorizado.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center font-black text-lg">4</div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Registrar Pagos y Firmar</h3>
                  <p className="text-gray-600 leading-relaxed">
                    Ingresa con cuánto dinero la cliente está separando el vestido (anticipo). El sistema calculará automáticamente el saldo restante. Por último, guarda el contrato y solicita a la cliente que lo firme digitalmente.
                  </p>
                </div>
              </div>

              <div className="bg-rose-50 p-6 rounded-2xl flex gap-3 items-start border border-rose-100 mt-8">
                <Info className="w-6 h-6 text-rose-500 flex-shrink-0 mt-1" />
                <p className="text-sm text-rose-900 leading-relaxed">
                  <strong>Importante:</strong> Un vestido no quedará bloqueado en el calendario hasta que el contrato esté guardado exitosamente. Siempre verifica la disponibilidad antes de confirmar la fecha con la novia.
                </p>
              </div>
            </div>
          </div>
        );

      case 'agenda_vestidos':
        return (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
            <div>
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">Agenda de Vestidos (Disponibilidad)</h2>
              <p className="text-gray-500 mt-2">Cómo saber si un vestido está libre para alquiler.</p>
            </div>
            
            <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-8">
              <p className="text-gray-600 leading-relaxed">
                Este módulo es tu herramienta principal para revisar el calendario. Puedes acceder desde el menú lateral <strong>AGENDA DE VESTIDOS</strong>.
              </p>

              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-4 h-4 bg-emerald-500 rounded-full mt-1.5 flex-shrink-0 shadow-sm shadow-emerald-200"></div>
                  <div>
                    <h4 className="font-bold text-gray-900">Días Libres (Verde/Blanco)</h4>
                    <p className="text-sm text-gray-600 mt-1">Si el calendario no tiene colores en la fecha solicitada, el vestido está completamente disponible.</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-4 h-4 bg-rose-600 rounded-full mt-1.5 flex-shrink-0 shadow-sm shadow-rose-200"></div>
                  <div>
                    <h4 className="font-bold text-gray-900">Bloqueo Estricto (Rojo Fuerte)</h4>
                    <p className="text-sm text-gray-600 mt-1">El vestido está bloqueado <strong>5 días</strong> en total (desde antes del evento hasta que sale de lavandería). En este periodo es logísticamente imposible alquilarlo.</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-4 h-4 bg-yellow-400 rounded-full mt-1.5 flex-shrink-0 shadow-sm shadow-yellow-200"></div>
                  <div>
                    <h4 className="font-bold text-gray-900">Logística Preventiva (Amarillo)</h4>
                    <p className="text-sm text-gray-600 mt-1">Son los <strong>5 días anteriores</strong> al bloqueo estricto. Significa que está "Disponible con Precaución". Si lo alquilas en esta fecha, el vestido tendrá el tiempo justo para lavandería antes del siguiente evento.</p>
                  </div>
                </div>
              </div>

              <div className="p-6 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50">
                <h4 className="font-black text-gray-900 mb-2 uppercase text-xs tracking-widest">💡 Tip Rápido</h4>
                <p className="text-sm text-gray-600">Al hacer clic en cualquier día ocupado (Rojo o Amarillo), aparecerá un panel derecho con el detalle de <strong>quién tiene alquilado el vestido</strong> y un botón negro para abrir el contrato completo.</p>
              </div>
            </div>
          </div>
        );

      case 'control_asistencia':
        return (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
            <div>
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">Control de Asistencia</h2>
              <p className="text-gray-500 mt-2">Cómo registrar tu entrada y salida del trabajo.</p>
            </div>
            
            <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
              <p className="text-gray-600 leading-relaxed mb-6">
                Ingresa al módulo <strong>CONTROL DE ASISTENCIA</strong> en el menú lateral. Este sistema controla tu tiempo de trabajo y la puntualidad.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-2xl">
                  <h4 className="font-black text-emerald-800 mb-2">Entrada al Turno</h4>
                  <p className="text-sm text-emerald-700">Al llegar a la sede, abre este módulo y haz clic en el botón verde <strong>"Registrar Llegada"</strong>. Tu hora exacta quedará guardada.</p>
                </div>

                <div className="p-6 bg-rose-50 border border-rose-100 rounded-2xl">
                  <h4 className="font-black text-rose-800 mb-2">Salida del Turno</h4>
                  <p className="text-sm text-rose-700">Al terminar tu jornada, no olvides volver al sistema y presionar el botón rojo <strong>"Finalizar Turno"</strong> para contabilizar tus horas completas.</p>
                </div>
              </div>
            </div>
          </div>
        );

      // ----------------------------------------------------
      // SECCIÓN ADMINISTRADORES
      // ----------------------------------------------------
      case 'gestion_inventario':
        return (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
            <div>
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">Gestión de Inventario</h2>
              <p className="text-gray-500 mt-2">Administra el catálogo de vestidos, códigos y estados.</p>
            </div>
            
            <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
              <h3 className="font-black text-lg text-gray-900 border-b border-gray-100 pb-2">Crear o Editar Vestidos</h3>
              <p className="text-gray-600 leading-relaxed">
                Dirígete a <strong>GESTIÓN DE INVENTARIO</strong>. En la esquina superior derecha verás el botón para "Nuevo Vestido".
                <br/><br/>
                Debes asignar un <strong>Código Único</strong>, subir una o varias fotografías (muy importante para que las asesoras identifiquen la prenda), asignar la Categoría, Color, y Talla.
              </p>
              
              <h3 className="font-black text-lg text-gray-900 border-b border-gray-100 pb-2 mt-8">Dar de Baja</h3>
              <p className="text-gray-600 leading-relaxed">
                Si un vestido se daña irreversiblemente o se vende, no lo elimines. Búscalo en el inventario, edítalo y cambia su <strong>Estado</strong> a "Dado de Baja". Así conservas el historial clínico del vestido para futuras referencias, pero desaparece del calendario de disponibilidad.
              </p>
            </div>
          </div>
        );

      case 'reportes_estadisticas':
        return (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
             <div>
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">Reportes y Estadísticas</h2>
              <p className="text-gray-500 mt-2">Visualización de ingresos, cancelaciones y rendimiento de la boutique.</p>
            </div>
            
            <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
              <p className="text-gray-600 leading-relaxed">
                En este módulo se agrupa la analítica central del negocio. Los gráficos se calculan basándose únicamente en los <strong>Contratos Aprobados</strong> (se excluyen borradores o anulados).
              </p>

              <ul className="list-disc pl-5 space-y-4 text-gray-600">
                <li><strong>Métricas principales:</strong> Podrás ver los Ingresos Totales (Suma de los saldos completos de los contratos del mes seleccionado).</li>
                <li><strong>Filtros de Fecha:</strong> Arriba a la derecha tienes los botones para cambiar de mes y año. Todos los gráficos reaccionan automáticamente a este filtro.</li>
                <li><strong>Ranking de Sedes:</strong> Muestra qué sede está generando más ingresos proporcionalmente.</li>
              </ul>
            </div>
          </div>
        );

      case 'metas_ventas':
        return (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
             <div>
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">Metas y Ventas</h2>
              <p className="text-gray-500 mt-2">Establecimiento y medición de objetivos (KPIs) por Sede o por Asesora.</p>
            </div>
            
            <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
              <p className="text-gray-600 leading-relaxed">
                Usa este módulo para definir metas de ventas.
              </p>

              <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <h4 className="font-bold text-gray-900">Crear una Meta</h4>
                  <p className="text-sm text-gray-600 mt-1">Presiona "Configurar Meta", selecciona si es para una Sede (ej: <em>Sede Principal</em>) o para una Asesora, indica el monto en COP y el mes correspondiente.</p>
                </div>

                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <h4 className="font-bold text-gray-900">Progreso en Tiempo Real</h4>
                  <p className="text-sm text-gray-600 mt-1">A medida que se crean contratos en ese mes, la barra de progreso se llenará. Cambia de color (Rojo, Naranja, Verde) dependiendo de la cercanía a la meta.</p>
                </div>

                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <h4 className="font-bold text-gray-900">Edición / Eliminación</h4>
                  <p className="text-sm text-gray-600 mt-1">Haz clic en los tres puntos (⋮) arriba a la derecha de cualquier tarjeta de meta para editar el monto objetivo o eliminarla si hubo un error.</p>
                </div>
              </div>
            </div>
          </div>
        );

      case 'gestion_aliados':
        return (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
             <div>
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">Gestión de Aliados</h2>
              <p className="text-gray-500 mt-2">Creación y administración de fotógrafos, maquilladoras, etc.</p>
            </div>
            
            <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
              <p className="text-gray-600 leading-relaxed">
                Este directorio te permite registrar a todas las personas que colaboran con los eventos de la boutique.
              </p>
              <p className="text-gray-600 leading-relaxed">
                Al crear un Aliado (ej. "Juan Fotografía"), este aparecerá automáticamente en las listas desplegables del Dashboard cuando una asesora esté registrando las pruebas o sesiones de fotos de una novia.
                Es necesario crear el aliado aquí primero para poder generarle comisiones luego.
              </p>
            </div>
          </div>
        );

      case 'config_comisiones':
        return (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
             <div>
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">Configuración de Comisiones</h2>
              <p className="text-gray-500 mt-2">Definición de porcentajes y escalas de comisión.</p>
            </div>
            
            <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
              <p className="text-gray-600 leading-relaxed">
                Aquí se establecen las reglas de dinero que el ERP usa para automatizar cálculos de fin de mes.
              </p>
              <ul className="list-disc pl-5 space-y-3 text-gray-600">
                <li>Puedes fijar comisiones planas (Ej: 10% por venta cruzada).</li>
                <li>Al establecer estas reglas, el módulo de "Cierre de Mes" sabrá exactamente cuánto dinero asignarle a cada aliado o asesora.</li>
                <li>Asegúrate de revisar estos montos cuando haya cambios de tarifas a nivel empresarial.</li>
              </ul>
            </div>
          </div>
        );

      case 'cierre_mes':
        return (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
             <div>
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">Cierre de Mes (Liquidaciones)</h2>
              <p className="text-gray-500 mt-2">Generación de cuentas de cobro y pagos consolidados.</p>
            </div>
            
            <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
               <p className="text-gray-600 leading-relaxed">
                El ERP recoge todos los contratos aprobados en un mes, cruza la información con el módulo de Comisiones, y te presenta el total a pagar a cada integrante.
              </p>
               <div className="bg-rose-50 p-6 rounded-2xl flex gap-3 items-start border border-rose-100 mt-4">
                <Info className="w-6 h-6 text-rose-500 flex-shrink-0 mt-1" />
                <p className="text-sm text-rose-900 leading-relaxed">
                  <strong>Flujo correcto:</strong> No generes el cierre definitivo del mes hasta que estés 100% seguro de que las asesoras han ingresado todos los contratos. Una vez cerrado/liquidado, generará los recibos que se envían a contabilidad.
                </p>
              </div>
            </div>
          </div>
        );

      case 'gestion_equipo':
        return (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
             <div>
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">Gestión de Equipo</h2>
              <p className="text-gray-500 mt-2">Control de accesos al ERP.</p>
            </div>
            
            <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
               <p className="text-gray-600 leading-relaxed">
                Crea usuarios para las nuevas asesoras para que puedan hacer login en el sistema.
                <br/><br/>
                <strong>¡Importante!</strong> Si un empleado se retira de la empresa, NO elimines su usuario. En lugar de eso, presiona el botón para <strong>"Desactivar Cuenta"</strong>. Esto bloqueará su acceso inmediatamente pero conservará intacto el historial de contratos y ventas que esa persona generó en el pasado.
              </p>
            </div>
          </div>
        );

      case 'configuracion_base':
        return (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
             <div>
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">Configuración Base</h2>
              <p className="text-gray-500 mt-2">Ajustes generales del software.</p>
            </div>
            
            <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
               <p className="text-gray-600 leading-relaxed">
                Este es el núcleo del sistema. Aquí puedes configurar:
              </p>
              <ul className="list-disc pl-5 space-y-3 text-gray-600">
                <li><strong>Sedes:</strong> Crea nuevas tiendas si se expande la franquicia. El software se dividirá automáticamente en cajas para cada sede.</li>
                <li>
                  <strong>Plantillas PDF:</strong> Aquí está guardado el texto legal ("Las cláusulas") que aparece en los contratos. Puedes editar el texto estático si un abogado recomienda un cambio de políticas de arrendamiento.
                  
                  <div className="bg-amber-50 p-5 rounded-2xl border border-amber-200 mt-4 flex gap-4 items-start shadow-sm">
                    <Info className="w-6 h-6 text-amber-500 flex-shrink-0 mt-1" />
                    <div className="space-y-2">
                      <p className="text-sm font-bold text-amber-900">
                        ¡Atención al modificar las cláusulas de los contratos!
                      </p>
                      <p className="text-sm text-amber-800 leading-relaxed">
                        El texto utiliza etiquetas de formato (código HTML) para mantener el diseño visual del contrato impreso. Al hacer cambios en la redacción, <strong>no debes borrar ni alterar</strong> las etiquetas que están entre signos menor y mayor que (<code>&lt; &gt;</code>).
                      </p>
                      <ul className="text-sm text-amber-800 list-disc pl-4 space-y-1">
                        <li><code>&lt;strong&gt;</code> y <code>&lt;/strong&gt;</code> envuelven el texto que se verá en <strong>negrita</strong>.</li>
                        <li><code>&lt;p&gt;</code> y <code>&lt;/p&gt;</code> envuelven cada párrafo.</li>
                        <li><code>&lt;br /&gt;</code> crea un salto de línea.</li>
                      </ul>
                      <div className="bg-white/60 p-3 rounded-lg border border-amber-100 mt-2">
                        <p className="text-xs text-amber-900/70 mb-1 font-bold">Ejemplo de modificación correcta:</p>
                        <code className="text-xs text-amber-900 block bg-white p-2 rounded">
                          &lt;p&gt;La arrendataria &lt;strong&gt;se compromete&lt;/strong&gt; a devolver el vestido el lunes.&lt;/p&gt;
                        </code>
                        <p className="text-xs text-amber-800 mt-2">
                          Solo cambia las palabras (ej. "lunes" por "martes"), pero deja intactas las etiquetas.
                        </p>
                      </div>
                    </div>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        );
        
      default:
        return <div>Selecciona un tema en el menú.</div>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 animate-spin text-rose-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex">
      <Sidebar user={user} handleLogout={handleLogout} />

      <main className="flex-1 flex overflow-hidden">
        
        {/* SIDEBAR DE NAVEGACIÓN INTERNA DEL MANUAL */}
        <aside className="w-80 bg-white border-r border-gray-100 h-full flex flex-col">
          <div className="p-8 border-b border-gray-50">
            <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-3">
              <BookOpen className="w-7 h-7 text-indigo-500" /> Manual
            </h1>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1 ml-1">Centro de Aprendizaje</p>
          </div>

          <div className="p-4 flex gap-2 border-b border-gray-50 bg-gray-50/50">
            <button 
              onClick={() => { setActiveRole('ASESORAS'); setActiveSection('contrato_nuevo'); }}
              className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase transition-all flex items-center justify-center gap-2 ${activeRole === 'ASESORAS' ? 'bg-white shadow-sm text-rose-600 border border-rose-100' : 'text-gray-400 hover:bg-gray-100'}`}
            >
              <Users className="w-4 h-4" /> Asesoras
            </button>
            <button 
              onClick={() => { setActiveRole('ADMINISTRADORES'); setActiveSection('gestion_inventario'); }}
              className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase transition-all flex items-center justify-center gap-2 ${activeRole === 'ADMINISTRADORES' ? 'bg-white shadow-sm text-indigo-600 border border-indigo-100' : 'text-gray-400 hover:bg-gray-100'}`}
            >
              <ShieldCheck className="w-4 h-4" /> Admins
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-1">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 px-4 pt-2">
              {activeRole === 'ASESORAS' ? 'Operación Diaria' : 'Gestión y Estrategia'}
            </p>
            
            {(activeRole === 'ASESORAS' ? sectionsAsesoras : sectionsAdmin).map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-left ${activeSection === section.id ? (activeRole === 'ASESORAS' ? 'bg-rose-50 text-rose-700 font-bold' : 'bg-indigo-50 text-indigo-700 font-bold') : 'text-gray-600 hover:bg-gray-50 font-medium'}`}
              >
                <section.icon className={`w-5 h-5 ${activeSection === section.id ? (activeRole === 'ASESORAS' ? 'text-rose-500' : 'text-indigo-500') : 'text-gray-400'}`} />
                <span className="text-sm">{section.label}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* ÁREA DE CONTENIDO */}
        <section className="flex-1 p-10 overflow-y-auto bg-gray-50/50">
          <div className="max-w-4xl mx-auto">
             {renderContent()}
          </div>
        </section>

      </main>
    </div>
  );
}
