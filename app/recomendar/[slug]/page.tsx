'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Sparkles, Copy, CheckCircle2, Gift, AlertCircle, Loader2 } from 'lucide-react';
import { toast, Toaster } from 'sonner';

interface Referidor {
  id: string;
  nombre_aliado: string;
  slug_unico: string;
  estado?: string;
}

export default function RecomendarPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [isLoading, setIsLoading] = useState(true);
  const [referidor, setReferidor] = useState<Referidor | null>(null);
  
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [correo, setCorreo] = useState('');
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
        const response = await fetch(`/api/aliados/${encodeURIComponent(String(slug))}`, { cache: 'no-store' });
        setReferidor(response.ok ? await response.json() : null);
      } catch (err) {
        console.error('Unexpected error:', err);
        setReferidor(null);
      } finally {
        setIsLoading(false);
      }
    }

    checkReferidor();
  }, [slug]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!referidor) return;
    if (!nombre.trim() || !telefono.trim() || !correo.trim() || !fechaEvento) {
      toast.error('Por favor, completa todos los campos.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/aliados/${encodeURIComponent(String(slug))}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre.trim(), telefono: telefono.trim(), correo: correo.trim(), fechaEvento })
      });
      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error || 'Ocurrió un error inesperado al procesar tu invitación. Intenta nuevamente.');
        return;
      }
      const nuevoCodigo: string = result.codigo;

      setCodigoGenerado(nuevoCodigo);
    } catch (err) {
      console.error('--- DETALLE COMPLETO DEL ERROR ---', JSON.stringify(err, null, 2), err);
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

  // 2.5 SUSPENDED STATE
  if (referidor && referidor.estado === 'Inactivo') {
    return (
      <div className="min-h-screen bg-[#faf8f5] flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-white p-10 rounded-3xl shadow-[0_8px_40px_rgba(0,0,0,0.04)] border border-zinc-100 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-red-500"></div>
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-2xl text-zinc-900 font-serif mb-3 tracking-tight">Enlace Pausado</h1>
          <p className="text-zinc-500 font-light leading-relaxed">
            Este enlace de recomendación se encuentra temporalmente inactivo. Si eres la titular, por favor comunícate con la administración para reactivarlo.
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
            Tu invitación VIP a través de <strong className="font-medium text-zinc-800">{referidor.nombre_aliado}</strong> ha sido activada con éxito.
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
    <div className="min-h-screen bg-[#faf8f5] font-sans relative overflow-hidden">
      <Toaster position="top-center" richColors />
      
      <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
        
        {/* Columna Izquierda: Imagen Editorial */}
        <div className="hidden md:block relative w-full h-full">
          <img 
            src="https://ambarcouture.com/wp-content/uploads/2025/09/3.png" 
            alt="Quinceañera Alta Costura" 
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-black/10 mix-blend-multiply" />
        </div>

        {/* Columna Derecha: Formulario de Captura */}
        <div className="flex items-center justify-center p-6 sm:p-12 relative">
          <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-amber-50/50 to-transparent -z-10" />
          
          <div className="max-w-md w-full bg-white p-8 sm:p-12 rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.04)] border border-zinc-100 animate-in fade-in slide-in-from-bottom-4 duration-1000 relative z-10">
            
            <div className="text-center mb-10">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 font-bold text-[10px] tracking-widest uppercase rounded-full mb-6">
                <Sparkles className="w-3.5 h-3.5" /> BENEFICIO VIP EXCLUSIVO
              </span>
              <h1 className="text-3xl sm:text-4xl text-zinc-900 font-serif tracking-tight mb-4 leading-tight">
                Asegura hasta <span className="text-amber-500 font-black">$200.000</span> de regalo para tu vestido de 15 años
              </h1>
              <p className="text-zinc-500 font-light text-sm leading-relaxed">
                Por ser invitada especial de <strong className="font-bold text-zinc-800">{referidor.nombre_aliado}</strong>, has recibido un pase VIP dorado para tu alquiler de Alta Costura en Ámbar Couture.
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
            <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider ml-1">Correo Electrónico</label>
            <input 
              type="email" 
              required
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3.5 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-300 transition-all text-sm font-light"
              placeholder="quinceanera@email.com"
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
            className="w-full mt-4 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-amber-950 rounded-xl py-4 font-black tracking-wide text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-70 shadow-xl shadow-amber-500/20"
          >
            {isSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              '✨ RECLAMAR MI BONO DE REGALO'
            )}
          </button>
        </form>

          </div>
        </div>
      </div>
    </div>
  );
}
