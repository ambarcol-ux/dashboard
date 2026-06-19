'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CrmClientes() {
  const router = useRouter();

  useEffect(() => {
    // Redirigir inmediatamente al dashboard
    router.replace('/dashboard');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold text-gray-800">Acceso Denegado</h1>
        <p className="text-gray-500">Módulo en mantenimiento. Redirigiendo...</p>
      </div>
    </div>
  );
}
