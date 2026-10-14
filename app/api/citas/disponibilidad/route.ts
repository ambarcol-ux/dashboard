import { NextResponse } from 'next/server';
import { legacyApiAllowed } from '@/lib/legacy-api-key';
import { supabase } from '@/lib/supabase';

// Horario comercial estándar de la tienda (bloques de 1 hora)
const HORARIO_COMERCIAL = [
  "09:00", "10:00", "11:00", "12:00", 
  "13:00", "14:00", "15:00", "16:00", "17:00"
];

export async function GET(request: Request) {
  if (!legacyApiAllowed(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const sede_id = searchParams.get('sede_id');

    if (!date || !sede_id) {
      return NextResponse.json(
        { error: 'Faltan parámetros: date y sede_id son requeridos' },
        { status: 400 }
      );
    }

    // Consultar citas ocupadas para esta fecha y sede
    const { data: citas, error } = await supabase
      .from('citas')
      .select('hora')
      .eq('fecha', date)
      .eq('sede_id', sede_id)
      // Asumimos que las citas canceladas o rechazadas no ocupan espacio
      .neq('estado', 'cancelada')
      .neq('estado', 'rechazada');

    if (error) {
      console.error('--- ERROR FETCHING CITAS ---', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Extraer las horas que ya están ocupadas
    const horasOcupadas = new Set(citas?.map(c => c.hora));
    
    // Calcular la diferencia para obtener los horarios disponibles
    const horariosDisponibles = HORARIO_COMERCIAL.filter(hora => !horasOcupadas.has(hora));

    return NextResponse.json(
      { horarios_disponibles: horariosDisponibles },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('--- ERROR INESPERADO EN API/CITAS/DISPONIBILIDAD ---', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
