import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({error:'El servicio de agenda no está configurado.'},{status:503});
    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY);
    const body = await request.json();
    const { cliente_nombre, cliente_telefono, fecha, hora, sede_id, notas_ia, creado_por_ia = true, asesora_id, asesora_nombre, sede_nombre } = body;

    console.log("Payload recibido en el backend:", body);

    // Validación estricta de parámetros requeridos
    if (!cliente_nombre || !cliente_telefono || !fecha || !hora || !sede_id) {
      return NextResponse.json(
        { error: 'Faltan parámetros obligatorios (cliente_nombre, cliente_telefono, fecha, hora, sede_id)' },
        { status: 400 }
      );
    }

    // Construir historial inicial para citas manuales
    let historial_atencion: any[] | undefined = undefined;
    if (creado_por_ia === false && asesora_nombre && sede_nombre) {
      historial_atencion = [
        {
          timestamp: new Date().toISOString(),
          accion: `Cita creada manualmente por la asesora ${asesora_nombre} en la sede ${sede_nombre}`
        }
      ];
    }

    // Inserción en la base de datos de Supabase usando clave de servicio
    const { data, error } = await supabaseAdmin
      .from('citas')
      .insert([
        {
          cliente_nombre,
          cliente_telefono,
          fecha,
          hora,
          sede_id,
          asesora_id: asesora_id || null,
          notas_ia: notas_ia || null,
          creado_por_ia: creado_por_ia,
          historial_atencion: historial_atencion,
          estado: 'pendiente_validacion'
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('--- ERROR INSERTING CITA ---', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Respuesta de éxito al cliente/agente IA
    return NextResponse.json(
      { 
        success: true, 
        message: 'Cita agendada correctamente',
        data 
      },
      { status: 200 }
    );

  } catch (error: any) {
    console.error('--- ERROR INESPERADO EN API/CITAS/AGENDAR ---', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
