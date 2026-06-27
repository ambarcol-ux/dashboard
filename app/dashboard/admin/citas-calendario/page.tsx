'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar, ExternalLink, MessageCircle, Filter } from 'lucide-react';

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
            (Centro de Control Operativo de Citas)
          </p>
        </div>
      </div>

      {/* CALL TO ACTION */}
      <div className="bg-white shadow-xl rounded-2xl p-8 max-w-2xl mx-auto text-center border border-slate-100 mt-12">
        <h2 className="text-2xl font-black text-gray-800 mb-6">💬 Centro de Conversaciones y Pipeline CRM</h2>
        <p className="text-gray-500 font-medium mb-8">
          Accede de forma directa y segura a la consola maestra para gestionar todas las reservas, auditar el bot de WhatsApp y mover las oportunidades del embudo comercial.
        </p>
        <a 
          href="https://app.gohighlevel.com/v2/location/mDlRNcVMlZ2nGyRLJf3w/conversations/conversations/vNbFhgOwmNX4ysNBOTO4?category=team-inbox&tab=unread" 
          target="_blank" 
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 bg-rose-500 text-white px-8 py-4 rounded-xl font-black text-lg hover:bg-rose-600 transition-colors shadow-lg shadow-rose-200 w-full sm:w-auto"
        >
          <ExternalLink className="w-5 h-5" />
          Abrir GoHighLevel en Vivo
        </a>
      </div>

      {/* GUIA OPERATIVA */}
      <div className="max-w-4xl mx-auto mt-12">
        <h3 className="text-lg font-black text-gray-700 mb-4 px-2 uppercase tracking-wide">Guía Operativa del Flujo IA</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
          {/* Tarjeta 1 */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4">
              <MessageCircle className="w-6 h-6" />
            </div>
            <h4 className="text-lg font-black text-gray-900 mb-2">1. IA de WhatsApp (Conversaciones)</h4>
            <p className="text-sm text-gray-500 leading-relaxed font-medium">
              Nuestra inteligencia artificial califica a las clientas que llegan desde los catálogos en WordPress automáticamente. 
              Como asesora, tu deber es monitorear la pestaña <strong className="text-gray-700">Conversaciones</strong> en GHL para auditar las respuestas de la IA e intervenir únicamente en escenarios críticos o cuando el bot asigne a un humano.
            </p>
          </div>

          {/* Tarjeta 2 */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-4">
              <Filter className="w-6 h-6" />
            </div>
            <h4 className="text-lg font-black text-gray-900 mb-2">2. Embudo y Pipeline Comercial</h4>
            <p className="text-sm text-gray-500 leading-relaxed font-medium">
              Cada cita agendada de forma exitosa por el bot genera automáticamente una tarjeta de oportunidad en el <strong className="text-gray-700">Pipeline</strong>. 
              Es tu responsabilidad arrastrar y soltar los tratos (ej. "Asistió a Prueba", "Canceló", "Vestido Separado") según el flujo real que suceda dentro de tu sede.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
