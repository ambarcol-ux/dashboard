import { supabase } from './supabase';
import type { CalendarContract } from './contract-calendar';

export type CalendarSaveRequest = {
  id: string;
  changes: Record<string, unknown>;
  original: Record<string, unknown>;
};

// Bound the complete operation, including session refresh and response parsing.
// A timeout is an unknown outcome: never retry a write automatically.
export async function saveCalendarContract(input: CalendarSaveRequest, timeoutMs = 20_000): Promise<{ contract: CalendarContract; warning?: string | null }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('El guardado tardó demasiado. Tus cambios siguen en el formulario. Puedes cerrar y actualizar para comprobar si se guardaron antes de volver a intentarlo.'));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([timeout, (async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (controller.signal.aborted) throw new Error('Guardado cancelado por tiempo de espera.');
      if (error || !session) throw new Error('Tu sesión venció. Vuelve a iniciar sesión.');
      const response = await fetch('/api/contratos/calendario', {
        method: 'PATCH', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(input),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'No se pudo completar el guardado. Actualiza para comprobar el contrato antes de reintentar.');
      if (result?.contract?.id !== input.id) throw new Error('No se recibió la confirmación del guardado. Actualiza para comprobar el contrato.');
      return result;
    })()]);
  } finally {
    clearTimeout(timer);
  }
}
