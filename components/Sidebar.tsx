'use client';

import React from 'react';
import Link from 'next/link';
import { 
  FileText, Users, Package, Settings, User, LogOut, ShieldCheck, TrendingUp 
} from 'lucide-react';

interface SidebarProps {
  user: any;
  handleLogout: () => void;
  activePage?: 'dashboard' | 'reports' | 'users' | 'inventory' | 'config' | 'profile' | 'metas';
}

export default function Sidebar({ user, handleLogout, activePage }: SidebarProps) {
  const isAdmin = user?.role === 'admin' || user?.email === 'dubian.h88@gmail.com';

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

  return (
    <aside className="w-64 bg-white border-r border-gray-100 hidden lg:flex flex-col sticky top-0 h-screen">
      <div className="p-6 border-b border-gray-50 flex items-center gap-3">
        <div className="w-10 h-10 bg-rose-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-rose-200">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div>
          <h2 className="font-black text-gray-900 tracking-tight leading-none">AMBAR</h2>
          <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest mt-1">Couture ERP</p>
        </div>
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
          className={`flex items-center gap-3 px-4 py-3 rounded-xl font-black text-sm transition-all group ${
            activePage === 'profile' ? 'bg-rose-50 text-rose-600' : 'text-gray-400 hover:text-rose-500 hover:bg-rose-50'
          }`}
        >
          <User className="w-5 h-5" /> MI PERFIL
        </Link>
        <button 
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl font-black text-sm transition-all"
        >
          <LogOut className="w-5 h-5" /> CERRAR SESIÓN
        </button>
      </div>
    </aside>
  );
}
