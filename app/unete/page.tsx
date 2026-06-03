// Versión de producción - Ámbar Couture ERP
'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Sparkles, CheckCircle2, Building2, User, Phone, MapPin, Mail, ArrowRight } from 'lucide-react';
import { Toaster, toast } from 'sonner';

export default function UnetePage() {
  const [formData, setFormData] = useState({
    marca: '',
    contacto: '',
    telefono: '',
    correo: ''
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Validation logic
  const isEmailValid = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  
  const isFormValid = 
    formData.marca.trim() !== '' &&
    formData.contacto.trim() !== '' &&
    formData.telefono.trim() !== '' &&
    isEmailValid(formData.correo);

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isFormValid) return;

    setIsSubmitting(true);
    
    try {
      const slug = generateSlug(formData.marca);

      // Verify if slug already exists
      const { data: existing } = await supabase
        .from('referidores')
        .select('id')
        .eq('slug_unico', slug)
        .single();
        
      if (existing) {
        toast.error('Ya existe una marca registrada con un nombre similar. Por favor añade un identificador extra a tu marca (ej. "Maquillaje Pro BQ").');
        setIsSubmitting(false);
        return;
      }

      const payload = {
        nombre_aliado: formData.marca,
        contacto_nombre: formData.contacto,
        telefono: formData.telefono,
        correo: formData.correo,
        porcentaje_comision: 0,
        estado: 'Activo',
        vitrina_sede: 'Ámbar Couture',
        slug_unico: slug
      };

      const { error } = await supabase.from('referidores').insert([payload]);

      if (error) throw error;

      // Failsafe Welcome Email
      try {
        const link = `${window.location.origin}/recomendar/${slug}`;
        await fetch('/api/send-welcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            correo: formData.correo,
            contacto: formData.contacto,
            link: link
          })
        });
      } catch (emailError) {
        console.error('Error enviando correo de bienvenida (silenciado):', emailError);
      }

      setIsSuccess(true);
    } catch (error: any) {
      console.error('Error al registrar aliado:', error);
      toast.error('Ocurrió un error al procesar tu solicitud. Intenta nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-[#faf8f5] flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl shadow-amber-900/5 p-10 text-center border border-amber-100/50">
          <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-3xl font-serif text-zinc-900 mb-4">¡Registro Exitoso!</h2>
          <p className="text-zinc-600 mb-8 leading-relaxed">
            Tu link de comisiones de <strong>Ámbar Couture</strong> se ha activado. 
            Pronto un miembro de nuestro equipo se comunicará contigo para darte la bienvenida oficial.
          </p>
          <button 
            onClick={() => window.location.href = '/'}
            className="w-full bg-zinc-900 text-white font-bold py-4 rounded-xl hover:bg-zinc-800 transition-colors"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf8f5] flex flex-col items-center justify-center p-4 sm:p-8 font-sans selection:bg-amber-200">
      <Toaster position="top-center" richColors />
      
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-0 bg-white rounded-[2rem] shadow-2xl shadow-zinc-200/50 overflow-hidden border border-zinc-100">
        
        {/* Lado Izquierdo - Branding */}
        <div className="bg-zinc-900 p-12 flex flex-col justify-between relative overflow-hidden text-white">
          <div className="absolute top-0 left-0 w-full h-full opacity-20 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-400 via-zinc-900 to-zinc-900"></div>
          
          <div className="relative z-10">
            <h1 className="text-amber-400 tracking-[0.2em] text-sm font-bold uppercase mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> Alianzas VIP
            </h1>
            <h2 className="text-4xl sm:text-5xl font-serif font-light leading-tight mb-6">
              Únete a la <br />red exclusiva <br /><span className="font-medium italic text-amber-100">Ámbar Couture.</span>
            </h2>
            <p className="text-zinc-400 text-lg leading-relaxed max-w-sm">
              Monetiza tu influencia. Regístrate como socio comercial oficial y obtén comisiones inmediatas por referir quinceañeras.
            </p>
          </div>

          <div className="relative z-10 mt-16 space-y-6 text-sm text-zinc-500">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full border border-zinc-800 flex items-center justify-center">
                <span className="text-amber-500 font-bold">1</span>
              </div>
              <p>Completa este formulario de registro.</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full border border-zinc-800 flex items-center justify-center">
                <span className="text-amber-500 font-bold">2</span>
              </div>
              <p>Obtén tu link personalizado inmediatamente.</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full border border-zinc-800 flex items-center justify-center">
                <span className="text-amber-500 font-bold">3</span>
              </div>
              <p>Empieza a ganar comisiones reales.</p>
            </div>
          </div>
        </div>

        {/* Lado Derecho - Formulario */}
        <div className="p-8 sm:p-12 lg:p-16 flex flex-col justify-center">
          <div className="mb-10">
            <h3 className="text-2xl font-bold text-zinc-900 tracking-tight">Formulario de Registro</h3>
            <p className="text-zinc-500 mt-2">Diligencia tus datos comerciales para activar tu portal.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5" /> Nombre de la Marca o Empresa *
              </label>
              <input
                type="text"
                required
                value={formData.marca}
                onChange={(e) => setFormData({...formData, marca: e.target.value})}
                placeholder="Ej: MakeUp By Laura"
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3.5 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-medium placeholder:text-zinc-400 placeholder:font-normal"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                <User className="w-3.5 h-3.5" /> Nombre del Contacto Principal *
              </label>
              <input
                type="text"
                required
                value={formData.contacto}
                onChange={(e) => setFormData({...formData, contacto: e.target.value})}
                placeholder="Tu nombre completo"
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3.5 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-medium placeholder:text-zinc-400 placeholder:font-normal"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                <Phone className="w-3.5 h-3.5" /> Teléfono / WhatsApp *
              </label>
              <input
                type="tel"
                required
                value={formData.telefono}
                onChange={(e) => setFormData({...formData, telefono: e.target.value})}
                placeholder="300 123 4567"
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3.5 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-medium placeholder:text-zinc-400 placeholder:font-normal"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                <Mail className="w-3.5 h-3.5" /> Correo Electrónico *
              </label>
              <input
                type="email"
                required
                value={formData.correo}
                onChange={(e) => setFormData({...formData, correo: e.target.value})}
                placeholder="correo@ejemplo.com"
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3.5 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-medium placeholder:text-zinc-400 placeholder:font-normal"
              />
            </div>

            <button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className="w-full bg-zinc-900 text-white font-bold py-4 rounded-xl hover:bg-zinc-800 focus:ring-4 focus:ring-zinc-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-4"
            >
              {isSubmitting ? 'Procesando registro...' : (
                <>
                  Crear mi Portal de Aliado <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
            
          </form>
        </div>
      </div>
    </div>
  );
}
