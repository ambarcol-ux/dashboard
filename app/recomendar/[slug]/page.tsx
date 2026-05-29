'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Sparkles, Copy, CheckCircle2, Gift, AlertCircle, Loader2 } from 'lucide-react';
import { toast, Toaster } from 'sonner';

interface Referidor {
  id: string;
  nombre: string;
  slug: string;
}

export default function RecomendarPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [isLoading, setIsLoading] = useState(true);
  const [referidor, setReferidor] = useState<Referidor | null>(null);
  
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [fechaEvento, setFechaEvento] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [codigoGenerado, setCodigoGenerado] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    async function checkReferidor() {
      if (!slug) {
        setIsLoading(false);
        return;
      }
      
      try {
        const { data, error } = await supabase
          .from('referidores')
          .select('id, nombre, slug')
          .eq('slug', slug)
          .single();

        if (error) {
          console.error('Error fetching referidor:', error);
          setReferidor(null);
        } else {
          setReferidor(data);
        }
      } catch (err) {
        console.error('Unexpected error:', err);
        setReferidor(null);
      } finally {
        setIsLoading(false);
      }
    }

    checkReferidor();
  }, [slug]);

  const generarCodigoAleatorio = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `AMBAR-${result}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!referidor) return;
    if (!nombre.trim() || !telefono.trim() || !fechaEvento) {
      toast.error('Por favor, completa todos los campos.');
      return;
    }

    setIsSubmitting(true);

    try {
      const nuevoCodigo = generarCodigoAleatorio();
      
      const { error } = await supabase.from('codigos_descuento').insert([{
        codigo: nuevoCodigo,
        referidor_id: referidor.id,
        quinceanera_nombre: nombre.trim(),
        telefono: telefono.trim(),
        fecha_evento: fechaEvento,
        usado: false
      }]);

      if (error) {
        if (error.code === '23505') { // Unique violation, rare but possible
          toast.error('Hubo un problema de colisión, intenta de nuevo.');
        } else {
          throw error;
        }
        return;
      }

      setCodigoGenerado(nuevoCodigo);
    } catch (err) {
      console.error('Error guardando el código:', err);
      toast.error('Ocurrió un error inesperado al procesar tu invitación. Intenta nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = () => {
    if (!codigoGenerado) return;
    navigator.clipboard.writeText(codigoGenerado);
    setIsCopied(true);
    toast.success('¡Código copiado al portapapeles!');
    setTimeout(() => setIsCopied(false), 3000);
  };

  // 1. LOADING STATE
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#faf8f5] flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <Loader2 className="w-10 h-10 text-rose-300 animate-spin" />
          <p className="text-zinc-500 tracking-[0.2em] text-xs uppercase font-medium">Verificando invitación...</p>
        </div>
      </div>
    );
  }

  // 2. ERROR / NOT FOUND STATE
  if (!referidor) {
    return (
      <div className="min-h-screen bg-[#faf8f5] flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-white p-10 rounded-3xl shadow-[0_8px_40px_rgba(0,0,0,0.04)] border border-zinc-100 text-center">
          <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-rose-400" />
          </div>
          <h1 className="text-2xl text-zinc-900 font-serif mb-3 tracking-tight">Invitación Inválida</h1>
          <p className="text-zinc-500 font-light leading-relaxed">
            Este enlace de invitación no es válido o ha expirado. Por favor, solicita un nuevo enlace a tu referidor.
          </p>
        </div>
      </div>
    );
  }

  // 3. SUCCESS STATE (Código Generado)
  if (codigoGenerado) {
    return (
      <div className="min-h-screen bg-[#faf8f5] flex items-center justify-center p-6 font-sans relative overflow-hidden">
        {/* Decoraciones de fondo */}
        <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-rose-50/50 to-transparent -z-10" />
        
        <Toaster position="top-center" richColors />
        
        <div className="max-w-md w-full bg-white p-10 sm:p-12 rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.04)] border border-zinc-100 text-center relative animate-in fade-in zoom-in duration-700">
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm border border-zinc-50">
            <Sparkles className="w-5 h-5 text-amber-400" />
          </div>

          <h1 className="text-3xl text-zinc-900 font-serif mb-2 tracking-tight mt-4">¡Felicidades!</h1>
          <p className="text-zinc-500 font-light text-sm mb-10">
            Tu invitación VIP a través de <strong className="font-medium text-zinc-800">{referidor.nombre}</strong> ha sido activada con éxito.
          </p>

          <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 rounded-2xl p-8 mb-8 shadow-2xl shadow-zinc-900/20 relative overflow-hidden group">
            {/* Brillo dinámico en el código */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-[100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
            
            <p className="text-zinc-400 text-[10px] uppercase tracking-[0.3em] font-medium mb-3">Tu Código Exclusivo</p>
            <div className="text-3xl sm:text-4xl font-light text-amber-50 tracking-widest font-mono">
              {codigoGenerado}
            </div>
          </div>

          <button 
            onClick={handleCopy}
            className={`w-full py-4 rounded-xl flex items-center justify-center gap-2 font-medium tracking-wide transition-all duration-300 ${isCopied ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-zinc-50 text-zinc-900 hover:bg-zinc-100 border border-zinc-200'}`}
          >
            {isCopied ? <CheckCircle2 className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
            {isCopied ? 'COPIADO AL PORTAPAPELES' : 'COPIAR CÓDIGO'}
          </button>

          <p className="mt-8 text-xs text-zinc-400 font-light leading-relaxed">
            Presenta este código durante tu primera visita a Ámbar Couture para hacer válido tu beneficio exclusivo.
          </p>
        </div>
      </div>
    );
  }

  // 4. FORM STATE (Landing Inicial)
  return (
    <div className="min-h-screen bg-[#faf8f5] flex items-center justify-center p-6 font-sans relative overflow-hidden">
      {/* Decoraciones de Alta Costura */}
      <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-rose-50/50 to-transparent -z-10" />
      <Toaster position="top-center" richColors />
      
      <div className="max-w-md w-full bg-white p-8 sm:p-12 rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.03)] border border-zinc-100 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        
        <div className="text-center mb-10">
          <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-6 rotate-3">
            <Gift className="w-6 h-6 text-rose-400 -rotate-3" />
          </div>
          <h1 className="text-3xl text-zinc-900 font-serif tracking-tight mb-3">Invitación Especial</h1>
          <p className="text-zinc-500 font-light text-sm leading-relaxed">
            Has sido invitada por <strong className="font-medium text-zinc-800">{referidor.nombre}</strong> para vivir la experiencia Ámbar Couture.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider ml-1">Nombre de la Quinceañera</label>
            <input 
              type="text" 
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3.5 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-300 transition-all text-sm font-light"
              placeholder="Ej. Valentina Gómez"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider ml-1">Teléfono de Contacto</label>
            <input 
              type="tel" 
              required
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3.5 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-300 transition-all text-sm font-light"
              placeholder="+57 300 000 0000"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider ml-1">Fecha Estimada del Evento</label>
            <input 
              type="date" 
              required
              value={fechaEvento}
              onChange={(e) => setFechaEvento(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3.5 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-300 transition-all text-sm font-light"
            />
          </div>

          <button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full mt-4 bg-zinc-900 text-white rounded-xl py-4 font-medium tracking-wide text-sm flex items-center justify-center gap-2 hover:bg-zinc-800 focus:ring-4 focus:ring-zinc-200 transition-all disabled:opacity-70 shadow-xl shadow-zinc-900/10"
          >
            {isSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              'REVELAR MI CÓDIGO'
            )}
          </button>
        </form>

      </div>
    </div>
  );
}
