'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import DepositAlert, {useDepositCount} from '@/components/DepositAlert';
import { isAccounting, isAdminProfile, isScopedOperationsAccount, operationsPanels } from '@/lib/role-access';
import {
  FileText, Users, Package, Settings, User, LogOut, ShieldCheck, TrendingUp, Menu, X, Handshake, Banknote, Calendar, Clock, CalendarDays, BookOpen, ShoppingBag, HandCoins, KeyRound, CalendarCheck
} from 'lucide-react';

interface SidebarProps {
  user: any;
  pendingDeposits?: number | null;
  handleLogout: () => void;
  activePage?: 'dashboard' | 'reports' | 'users' | 'inventory' | 'config' | 'profile' | 'metas' | 'calendario' | 'primeras-citas' | 'depositos';
}

export default function Sidebar({ user, handleLogout, activePage, pendingDeposits }: SidebarProps) {
  const depositCount = useDepositCount(pendingDeposits, user?.id);
  const [isOpen, setIsOpen] = useState(false);
  const normalizedRole = String(user?.rol || '').toLowerCase();
  const operationsOnly = isScopedOperationsAccount(user?.id);
  const accountingOnly = isAccounting(normalizedRole);
  const isAdmin = isAdminProfile(user);

  type SidebarItem = {
    id: string;
    label: string;
    icon: any;
    href: string;
    color: string;
    adminOnly?: boolean;
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
      title: 'OPERACIONES',
      adminOnly: false,
      items: [
        { id: 'dashboard', label: 'DASHBOARD', icon: FileText, href: '/dashboard', color: 'rose' },
        { id: 'calendario', label: 'CALENDARIO CONTRATOS', icon: Calendar, href: '/dashboard/calendario', color: 'rose' },
        { id: 'primeras-citas', label: 'CITAS PRIMERA VEZ', icon: CalendarCheck, href: '/dashboard/primeras-citas', color: 'rose' },
        { id: 'disponibilidad', label: 'AGENDA DE VESTIDOS', icon: CalendarDays, href: '/disponibilidad', color: 'emerald' },
        { id: 'pedidos_estrene', label: 'PEDIDOS ESTRENE', icon: ShoppingBag, href: '/dashboard/pedidos-estrene', color: 'violet' },
        { id: 'depositos', label: 'DEPÓSITOS Y DEVOLUCIONES', icon: HandCoins, href: '/dashboard/devoluciones-depositos', color: 'emerald' },
        { id: 'inventory', label: 'GESTIÓN DE INVENTARIO', icon: Package, href: '/admin/inventory', color: 'amber', adminOnly: true },
        { id: 'reports', label: 'REPORTES Y ESTADÍSTICAS', icon: TrendingUp, href: '/admin/reports', color: 'rose', adminOnly: true },
      ]
    },
    {
      title: 'VENTAS & CRM',
      adminOnly: true,
      items: [
        { id: 'metas', label: 'METAS Y VENTAS', icon: TrendingUp, href: '/admin/metas', color: 'emerald' },
      ]
    },
    {
      title: 'RED DE ALIADOS',
      adminOnly: true,
      items: [
        { id: 'aliados_admin', label: 'GESTIÓN DE ALIADOS', icon: Handshake, href: '/dashboard/admin/aliados', color: 'amber' },
        { id: 'comisiones', label: 'CONFIG. COMISIONES', icon: Settings, href: '/dashboard/admin/escalas', color: 'gray' },
        { id: 'liquidaciones', label: 'CIERRE DE MES', icon: Banknote, href: '/dashboard/admin/liquidaciones', color: 'emerald' },
      ]
    },
    {
      title: 'ADMINISTRACIÓN',
      adminOnly: true,
      items: [
        { id: 'users', label: 'GESTIÓN DE EQUIPO', icon: Users, href: '/admin/users', color: 'indigo' },
        { id: 'horarios', label: 'CONTROL DE ASISTENCIA', icon: Clock, href: '/dashboard/horarios', color: 'rose' },
        { id: 'config', label: 'CONFIGURACIÓN BASE', icon: Settings, href: '/admin/config', color: 'gray' },
        { id: 'clausulas', label: 'CLÁUSULAS DEL CONTRATO', icon: FileText, href: '/dashboard/admin/contratos', color: 'rose' },
        { id: 'siigo', label: 'FACTURACIÓN POR SEDE', icon: KeyRound, href: '/admin/config/siigo', color: 'emerald' },
      ]
    },
    {
      title: 'SOPORTE Y AYUDA',
      adminOnly: false,
      items: [
        { id: 'manual', label: 'MANUAL DE USUARIO', icon: BookOpen, href: '/dashboard/manuales', color: 'indigo' },
      ]
    }
  ];

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

      <nav className="flex-1 p-4 space-y-6 overflow-y-auto custom-scrollbar pb-10">
        <DepositAlert count={depositCount}/>
        {sidebarBlocks.map((block, blockIndex) => {
          if (operationsOnly && block.title !== 'OPERACIONES') return null;
          if (block.adminOnly && !isAdmin) return null;
          if (accountingOnly && !block.items.some(item => item.id === 'depositos')) return null;

          return (
            <div key={blockIndex} className="space-y-1">
              <p className="px-4 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">{block.title}</p>

              {block.items.map((item) => {
                if (operationsOnly && !operationsPanels.includes(item.href)) return null;
                if (item.adminOnly && !isAdmin && !(operationsOnly && item.id === 'inventory')) return null;
                if (accountingOnly && item.id !== 'depositos') return null;
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

                const className = `flex items-center gap-3 px-4 py-2.5 rounded-xl font-black text-xs transition-all group border ${
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
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-50 flex flex-col gap-2">
        {!accountingOnly && !operationsOnly && <Link
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
    </>
  );
}

