'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  FileText, Users, Package, Settings, User, LogOut, ShieldCheck, TrendingUp, Menu, X 
} from 'lucide-react';

interface SidebarProps {
  user: any;
  handleLogout: () => void;
  activePage?: 'dashboard' | 'reports' | 'users' | 'inventory' | 'config' | 'profile' | 'metas';
}

export default function Sidebar({ user, handleLogout, activePage }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isAdmin = user?.rol === 'admin' || user?.email === 'dubian.h88@gmail.com';

  const navItems = [
    { id: 'dashboard', label: 'DASHBOARD', icon: FileText, href: '/dashboard', color: 'rose' },
    { id: 'reports', label: 'REPORTES Y ESTADÍSTICAS', icon: TrendingUp, href: '/admin/reports', color: 'rose', adminOnly: true },
  ];

  const adminNavItems = [
    { id: 'users', label: 'GESTIÓN DE EQUIPO', icon: Users, href: '/admin/users', color: 'rose' },
    { id: 'metas', label: 'METAS Y VENTAS', icon: TrendingUp, href: '/admin/metas', color: 'rose' },
    { id: 'inventory', label: 'GESTIÓN DE INVENTARIO', icon: Package, href: '/admin/inventory', color: 'amber' },
    { id: 'config', label: 'CONFIGURACIÓN BASE', icon: Settings, href: '/admin/config', color: 'gray', opacity: 'opacity-60 hover:opacity-100' },
  ];

  const SidebarContent = ({ isMobile = false }) => (
    <>
      <div className="p-6 border-b border-gray-50 flex items-center justify-between lg:justify-start gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-rose-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-rose-200">
            <ShieldCheck className="w-6 h-6" />
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

      <nav className="flex-1 p-4 space-y-4 overflow-y-auto">
        {navItems.map((item) => {
          if (item.adminOnly && !isAdmin) return null;
          const Icon = item.icon;
          const isActive = activePage === item.id;
          
          return (
            <Link 
              key={item.id} 
              href={item.href} 
              onClick={() => isMobile && setIsOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-black text-sm transition-all border ${
                isActive 
                  ? 'bg-rose-50 text-rose-600 border-rose-100 shadow-sm shadow-rose-50' 
                  : 'text-gray-500 hover:bg-rose-50 hover:text-rose-500 border-transparent'
              }`}
            >
              <Icon className="w-5 h-5" /> {item.label}
            </Link>
          );
        })}
        
        {isAdmin && (
          <div className="space-y-1">
            <p className="px-4 py-2 text-[9px] font-black text-gray-400 uppercase tracking-widest">Administración</p>
            {adminNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              
              return (
                <Link 
                  key={item.id}
                  href={item.href} 
                  onClick={() => isMobile && setIsOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl font-black text-sm transition-all group border ${
                    isActive
                      ? 'bg-rose-50 text-rose-600 border-rose-100 shadow-sm shadow-rose-50'
                      : `text-gray-500 hover:bg-rose-50 hover:text-rose-500 border-transparent ${item.opacity || ''}`
                  }`}
                >
                  <div className={`p-1.5 rounded-lg transition-colors shadow-sm ${
                    isActive ? 'bg-white text-rose-500' : `bg-gray-50 group-hover:bg-white text-${item.color}-500`
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  {item.label}
                </Link>
              );
            })}
          </div>
        )}
      </nav>

      <div className="p-4 border-t border-gray-50 flex flex-col gap-2">
        <Link 
          href="/perfil" 
          onClick={() => isMobile && setIsOpen(false)}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl font-black text-sm transition-all group ${
            activePage === 'profile' ? 'bg-rose-50 text-rose-600' : 'text-gray-400 hover:text-rose-500 hover:bg-rose-50'
          }`}
        >
          <User className="w-5 h-5" /> MI PERFIL
        </Link>
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
      {/* MOBILE HEADER (TRIGGER) */}
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

      {/* MOBILE DRAWER OVERLAY */}
      {isOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] transition-all animate-in fade-in duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* MOBILE DRAWER */}
      <div className={`
        lg:hidden fixed top-0 left-0 h-screen w-72 bg-white z-[110] shadow-2xl transition-transform duration-300 ease-out flex flex-col
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <SidebarContent isMobile />
      </div>

      {/* DESKTOP SIDEBAR */}
      <aside className="w-64 bg-white border-r border-gray-100 hidden lg:flex flex-col sticky top-0 h-screen">
        <SidebarContent />
      </aside>
    </>
  );
}
