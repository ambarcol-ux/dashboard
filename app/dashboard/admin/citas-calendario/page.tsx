'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar } from 'lucide-react';

export default function CitasCalendario() {
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm shadow-gray-50">
        <div>
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-400 hover:text-rose-500 transition-colors mb-2 group">
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Volver al Dashboard
          </Link>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <Calendar className="w-7 h-7 text-rose-500" />
            Módulo de Agenda Ámbar Couture
          </h1>
          <p className="text-sm text-gray-500 font-medium mt-1">
            (Powered by GoHighLevel)
          </p>
        </div>
      </div>

      {/* GOHIGHLEVEL IFRAME PLACEHOLDER */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm shadow-gray-50 overflow-hidden flex flex-col items-center justify-center min-h-[600px] bg-gray-50/50 p-6 text-center">
        <div className="w-20 h-20 bg-rose-50 border border-rose-100 text-rose-500 rounded-full flex items-center justify-center mb-6 shadow-sm">
          <Calendar className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-black text-gray-800 mb-3 tracking-tight">Integración en Progreso</h2>
        <p className="text-gray-500 font-medium max-w-lg mb-8 leading-relaxed">
          El módulo de calendario local ha sido revertido exitosamente para garantizar la estabilidad comercial. 
          Este contenedor está listo para embeber el <strong className="text-gray-700">Widget Oficial de GoHighLevel</strong> en el próximo despliegue.
        </p>
        
        <div className="w-full max-w-4xl mx-auto border-2 border-dashed border-gray-200 rounded-2xl p-4 bg-white relative h-[400px] flex items-center justify-center mb-6">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-2 text-xs font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 border border-emerald-100 px-4 py-2 rounded-xl">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              Plataforma Lista para Conexión GHL
            </div>
          </div>
          {/* Iframe Placeholder - Ready for GHL src */}
          <iframe 
            src="about:blank" 
            className="w-full h-full opacity-50" 
            title="GoHighLevel Calendar Integration"
            style={{ display: 'block', border: 'none' }}
          />
        </div>
      </div>
    </div>
  );
}
