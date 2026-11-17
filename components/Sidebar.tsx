'use client';

import { usePermissions } from '@/lib/use-permissions';
import React, { useState } from 'react';
import Link from 'next/link';
import UpcomingVisitsAlert from '@/components/UpcomingVisitsAlert';
import PersonAttentionAlert from '@/components/PersonAttentionAlert';
import FixedPaymentsAlert from '@/components/FixedPaymentsAlert';
import SatisfactionAlert from '@/components/SatisfactionAlert';
import { panelAccess, isAccountingProfile, isAdminProfile } from '@/lib/panel-access';
import {
  FileText, Package, Settings, User, LogOut, ShieldCheck, TrendingUp, Menu, X, Receipt, Handshake, Banknote, Calendar, Clock, CalendarDays, BookOpen, ShoppingBag, Frame, Ruler, HandCoins, KeyRound, CalendarCheck, Wallet, Truck, ChevronDown, Mail, Plug, ArrowLeftRight, MessageCircle, FolderOpen, KanbanSquare, Megaphone, Tag, BarChart3, Clapperboard, History, CalendarClock, PiggyBank
} from 'lucide-react';

interface SidebarProps {
  user: any;
  pendingDeposits?: number | null;
  handleLogout: () => void;
  activePage?: 'gastos' | 'plan_ahorro' | 'dashboard' | 'reports' | 'users' | 'inventory' | 'config' | 'profile' | 'metas' | 'calendario' | 'primeras-citas' | 'retablos' | 'retablos-tipos' | 'depositos' | 'caja' | 'proveedores' | 'proveedores-pagos' | 'proveedores-catalogo' | 'accesos' | 'aliados_directos' | 'catalogo' | 'correo' | 'integraciones' | 'traslados' | 'cobros' | 'whatsapp' | 'documentos' | 'pipeline' | 'aliados_publicaciones' | 'estudio_contenido' | 'historial' | 'pagos_fijos';
}

// Deposit and balance reminders live in the Inicio alert strip (DashboardAlerts), not in the menu.
export default function Sidebar({ user, handleLogout, activePage }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const accountingOnly = isAccountingProfile(user);
  // Same rules as the route guard: role defaults plus the administrator's manual changes.
  const permissions = usePermissions(user?.id ? String(user.id) : null);
  const canSee = (id: string) => panelAccess(id, user || {}, null, permissions);

  type SidebarItem = {
    id: string;
    label: string;
    icon: any;
    href: string;
    color: string;
    adminOnly?: boolean;
    /** Panel that grants the item (defaults to its id). */
    panel?: string;
    disabled?: boolean;
    external?: boolean;
  };

  type SidebarBlock = {
    title: string;
    adminOnly: boolean;
    items: SidebarItem[];
  };

  const sidebarBlocks: SidebarBlock[] = [
    {
      title: 'INICIO',
      adminOnly: false,
      items: [
        { id: 'dashboard', label: 'DASHBOARD', icon: FileText, href: '/dashboard', color: 'rose' },
      ]
    },
    {
      title: 'VENTAS Y CRM',
      adminOnly: false,
      items: [
        { id: 'primeras-citas', label: 'PRIMERAS VISITAS', icon: CalendarCheck, href: '/dashboard/primeras-citas', color: 'rose' },
        { id: 'whatsapp', label: 'WHATSAPP 304', icon: MessageCircle, href: '/dashboard/whatsapp', color: 'emerald' },
        { id: 'pipeline', label: 'PIPELINE', icon: KanbanSquare, href: '/dashboard/pipeline', color: 'rose' },
        { id: 'calendario', label: 'CALENDARIO CONTRATOS', icon: Calendar, href: '/dashboard/calendario', color: 'rose' },
        { id: 'pedidos_estrene', label: 'PEDIDOS ESTRENE', icon: ShoppingBag, href: '/dashboard/pedidos-estrene', color: 'violet' },
        { id: 'metas', label: 'METAS Y VENTAS', icon: TrendingUp, href: '/admin/metas', color: 'emerald' },
        { id: 'aliados_directos', label: 'ALIADOS', icon: Handshake, href: '/dashboard/aliados-directos', color: 'rose' },
        { id: 'plan_ahorro', label: 'PLAN AHORRO XV', icon: PiggyBank, href: '/dashboard/plan-ahorro', color: 'emerald' },
        { id: 'catalogo', label: 'CATÁLOGO', icon: BookOpen, href: '/dashboard/catalogo', color: 'rose' },
      ]
    },
    {
      title: 'MARKETING',
      adminOnly: false,
      items: [
        { id: 'estudio_contenido', label: 'ESTUDIO DE CONTENIDO', icon: Clapperboard, href: '/dashboard/estudio-contenido', color: 'rose' },
        { id: 'aliados_publicaciones', label: 'REDES SOCIALES', icon: Megaphone, href: '/dashboard/aliados-publicaciones', color: 'rose' },
        { id: 'correo', label: 'CORREO', icon: Mail, href: '/dashboard/correo?tab=automatizaciones', color: 'rose' },
        { id: 'promociones', panel: 'correo', label: 'PROMOCIONES', icon: Tag, href: '/dashboard/correo?tab=promociones', color: 'rose' },
        { id: 'anuncios', panel: 'whatsapp', label: 'ANUNCIOS', icon: BarChart3, href: '/dashboard/whatsapp?tab=anuncios', color: 'rose', adminOnly: true },
      ]
    },
    {
      title: 'INVENTARIO',
      adminOnly: false,
      items: [
        { id: 'inventory', label: 'GESTIÓN DE INVENTARIO', icon: Package, href: '/admin/inventory', color: 'amber', adminOnly: true },
        { id: 'disponibilidad', label: 'AGENDA DE VESTIDOS', icon: CalendarDays, href: '/disponibilidad', color: 'emerald' },
        { id: 'traslados', label: 'TRASLADOS', icon: ArrowLeftRight, href: '/dashboard/traslados', color: 'amber' },
      ]
    },
    {
      title: 'OPERACIONES Y LOGÍSTICA',
      adminOnly: false,
      items: [
        { id: 'retablos', label: 'PANEL GENERAL', icon: Frame, href: '/dashboard/retablos', color: 'amber' },
        { id: 'retablos-tipos', panel: 'retablos', label: 'TIPOS DE RETABLO', icon: Ruler, href: '/dashboard/retablos/tipos', color: 'amber' },
      ]
    },
    {
      title: 'FINANZAS Y CONTABILIDAD',
      adminOnly: false,
      items: [
        { id: 'cobros', label: 'CUENTAS POR COBRAR', icon: HandCoins, href: '/dashboard/cuentas-por-cobrar', color: 'amber' },
        { id: 'caja', label: 'CIERRES DE CAJA', icon: Wallet, href: '/dashboard/caja', color: 'emerald' },
        { id: 'pagos_fijos', label: 'PAGOS FIJOS DE SEDE', icon: CalendarClock, href: '/dashboard/pagos-fijos', color: 'emerald' },
        { id: 'gastos', label: 'GASTOS Y ENTRE SEDES', icon: Receipt, href: '/dashboard/gastos', color: 'emerald' },
        { id: 'depositos', label: 'DEPÓSITOS Y DEVOLUCIONES', icon: HandCoins, href: '/dashboard/devoluciones-depositos', color: 'emerald' },
        { id: 'siigo', label: 'FACTURACIÓN POR SEDE', icon: KeyRound, href: '/admin/config/siigo', color: 'emerald' },
        // Suppliers (purchases) live together inside Finance.
        { id: 'proveedores-catalogo', label: 'CATÁLOGO DE PROVEEDORES', icon: BookOpen, href: '/dashboard/proveedores/catalogo', color: 'violet' },
        { id: 'proveedores', label: 'GESTIÓN DE PROVEEDORES', icon: Truck, href: '/dashboard/proveedores', color: 'violet', adminOnly: true },
        { id: 'proveedores-pagos', label: 'PAGOS A PROVEEDORES', icon: Banknote, href: '/dashboard/proveedores/pagos', color: 'violet', adminOnly: true },
      ]
    },
    {
      title: 'DOCUMENTACIÓN DE LA MARCA',
      adminOnly: false,
      items: [
        { id: 'documentos', label: 'DOCUMENTOS DE LA MARCA', icon: FolderOpen, href: '/dashboard/documentos', color: 'rose' },
      ]
    },
    {
      title: 'RECURSOS HUMANOS',
      adminOnly: false,
      items: [
        { id: 'horarios', label: 'CONTROL DE ASISTENCIA', icon: Clock, href: '/dashboard/horarios', color: 'rose' },
        { id: 'accesos', label: 'EQUIPO Y ACCESOS', icon: ShieldCheck, href: '/admin/accesos', color: 'indigo' },
      ]
    },
    {
      title: 'REPORTES E INDICADORES',
      adminOnly: false,
      items: [
        { id: 'reports', label: 'REPORTES Y ESTADÍSTICAS', icon: TrendingUp, href: '/admin/reports', color: 'rose', adminOnly: true },
      ]
    },
    {
      title: 'CONFIGURACIÓN',
      adminOnly: false,
      items: [
        { id: 'config', label: 'CONFIGURACIÓN BASE', icon: Settings, href: '/admin/config', color: 'gray' },
        { id: 'clausulas', label: 'CLÁUSULAS DEL CONTRATO', icon: FileText, href: '/dashboard/admin/contratos', color: 'rose' },
        { id: 'integraciones', label: 'INTEGRACIONES', icon: Plug, href: '/admin/config/integraciones', color: 'gray', adminOnly: true },
        { id: 'historial', label: 'HISTORIAL Y AUDITORÍA', icon: History, href: '/dashboard/historial', color: 'gray', adminOnly: true },
      ]
    }
  ];

  // Upcoming modules: shown greyed out, without link, only to the Administrador role.
  const comingSoon: Record<string, string[]> = {
    'VENTAS Y CRM': ['CLIENTES', 'COTIZACIONES'],
    'INVENTARIO': ['MANTENIMIENTO Y ARREGLOS', 'TOMA FÍSICA'],
    'OPERACIONES Y LOGÍSTICA': ['ENTREGAS Y DEVOLUCIONES', 'ADAPTACIONES Y CONFECCIÓN'],
    'FINANZAS Y CONTABILIDAD': ['ÓRDENES DE COMPRA', 'PRESUPUESTO', 'PRÉSTAMOS DE TERCEROS', 'CONCILIACIÓN BANCARIA', 'CONCILIACIÓN CON SIIGO'],
    'RECURSOS HUMANOS': ['NÓMINA', 'CONTRATOS LABORALES', 'VACACIONES E INCAPACIDADES'],
    'REPORTES E INDICADORES': ['ESTADO DE RESULTADOS POR SEDE', 'RENTABILIDAD POR VESTIDO', 'TABLEROS POR MÓDULO'],
  };
  const showComingSoon = isAdminProfile(user);
  const blocksWithSoon: SidebarBlock[] = sidebarBlocks.map(block => ({
    ...block,
    items: [...block.items, ...(showComingSoon ? (comingSoon[block.title] || []).map(label => ({ id: `soon-${label}`, label, icon: Clock, href: '#', color: 'gray', disabled: true })) : [])]
  }));
  const visible = (item: SidebarItem) => item.disabled || canSee(item.panel || item.id);
  // Collapsible sections: the one holding the current page starts open.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const isBlockOpen = (block: SidebarBlock) => toggled[block.title] ?? block.items.some(item => item.id === activePage);

  const renderSidebarContent = (isMobile = false) => (
    <>
      <div className="p-6 border-b border-gray-50 flex items-center justify-between lg:justify-start gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center">
            <img
              src="https://ambarcouture.com/wp-content/uploads/2026/06/logo-ambar-transparente.png"
              alt="Ambar Couture Logo"
              className="w-10 h-10 object-contain"
            />
          </div>
          <div>
            <h2 className="font-black text-gray-900 tracking-tight leading-none">AMBAR</h2>
            <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest mt-1">Couture ERP</p>
          </div>
        </div>
        {isMobile && (
          <button onClick={() => setIsOpen(false)} className="lg:hidden p-2 hover:bg-gray-50 rounded-full text-gray-400 transition-colors">
            <X className="w-6 h-6" />
          </button>
        )}
      </div>

      <nav className="flex-1 p-4 space-y-6 overflow-y-auto overflow-x-hidden custom-scrollbar pb-10">
        {blocksWithSoon.map((block, blockIndex) => {
          if (!block.items.some(item => !item.disabled && canSee(item.panel || item.id))) return null;
          const open = isBlockOpen(block);

          return (
            <div key={blockIndex} className="space-y-1">
              <button type="button" onClick={() => setToggled(prev => ({ ...prev, [block.title]: !open }))} aria-expanded={open} className="w-full flex items-center justify-between gap-2 px-4 py-2 text-left whitespace-normal break-words text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-rose-500">
                <span className="min-w-0 flex-1 text-left">{block.title}</span>
                <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
              </button>

              <div className={open ? 'space-y-1' : 'hidden'}>
              {block.items.map((item) => {
                if (!visible(item)) return null;
                const Icon = item.icon;
                const isActive = activePage === item.id;
                const isDisabled = item.disabled;

                const content = (
                  <>
                    <div className={`p-1.5 rounded-lg transition-colors shadow-sm ${
                      isActive
                        ? 'bg-white text-rose-500'
                        : isDisabled
                          ? 'bg-gray-100 text-gray-400'
                          : `bg-gray-50 group-hover:bg-white text-${item.color}-500`
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    {item.label}
                    {isDisabled && (
                      <span className="ml-auto text-[8px] font-black uppercase tracking-widest text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
                        Próximamente
                      </span>
                    )}
                  </>
                );

                const className = `flex items-center gap-3 px-4 py-2.5 rounded-xl font-black text-xs text-left break-words min-w-0 transition-all group border ${
                  isActive
                    ? 'bg-rose-50 text-rose-600 border-rose-100 shadow-sm shadow-rose-50'
                    : isDisabled
                      ? 'text-gray-400 bg-gray-50/50 border-transparent opacity-60 cursor-not-allowed grayscale'
                      : 'text-gray-500 hover:bg-rose-50 hover:text-rose-500 border-transparent'
                }`;

                if (isDisabled) {
                  return <div key={item.id} className={className}>{content}</div>;
                }

                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => isMobile && !item.external && setIsOpen(false)}
                    className={className}
                    {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  >
                    {content}
                  </Link>
                );
              })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-50 flex flex-col gap-2">
        {canSee('manual') && <Link
          href="/dashboard/manuales"
          onClick={() => isMobile && setIsOpen(false)}
          className="flex items-center gap-3 px-4 py-3 rounded-xl font-black text-sm transition-all text-gray-400 hover:text-rose-500 hover:bg-rose-50"
        >
          <BookOpen className="w-5 h-5" /> MANUAL DE USUARIO
        </Link>}
        {!accountingOnly && <Link
          href="/perfil"
          onClick={() => isMobile && setIsOpen(false)}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl font-black text-sm transition-all group ${
            activePage === 'profile' ? 'bg-rose-50 text-rose-600' : 'text-gray-400 hover:text-rose-500 hover:bg-rose-50'
          }`}
        >
          <User className="w-5 h-5" /> MI PERFIL
        </Link>}
        <button
          onClick={() => {
            setIsOpen(false);
            handleLogout();
          }}
          className="w-full flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl font-black text-sm transition-all"
        >
          <LogOut className="w-5 h-5" /> CERRAR SESIÓN
        </button>
      </div>
    </>
  );

  return (
    <>
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-100 px-4 flex items-center justify-between z-40 bg-white/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-rose-500 rounded-lg flex items-center justify-center text-white shadow-md shadow-rose-100">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-black text-gray-900 tracking-tight leading-none text-sm">AMBAR</h2>
            <p className="text-[8px] font-bold text-rose-500 uppercase tracking-widest leading-tight">Couture ERP</p>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(true)}
          className="p-2 hover:bg-rose-50 rounded-xl text-rose-500 transition-all active:scale-95 border border-rose-50 bg-white"
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] transition-all animate-in fade-in duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}

      <div className={`lg:hidden fixed top-0 left-0 h-screen w-72 bg-white z-[110] shadow-2xl transition-transform duration-300 ease-out flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {renderSidebarContent(true)}
      </div>

      <aside className="w-64 bg-white border-r border-gray-100 hidden lg:flex flex-col sticky top-0 h-screen">
        {renderSidebarContent()}
      </aside>
      {canSee('primeras-citas') && <UpcomingVisitsAlert />}
      {canSee('whatsapp') && <PersonAttentionAlert />}
      {canSee('pagos_fijos') && <FixedPaymentsAlert />}
      {isAdminProfile(user) && <SatisfactionAlert />}
    </>
  );
}

