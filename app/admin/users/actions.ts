'use server';

import { createClient } from '@supabase/supabase-js';

// Centralización del cliente Admin para evitar problemas de contexto en Vercel
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error('❌ CONFIG ERROR: Missing Supabase URL or SERVICE_ROLE_KEY');
    return null;
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

interface CreateUserParams {
  email: string;
  password?: string;
  nombre: string;
  sede_id: string;
  rol: string;
}

export async function createUserAction(params: CreateUserParams) {
  const supabaseAdmin = getAdminClient();
  
  if (!supabaseAdmin) {
    return { success: false, message: "Error de configuración: Faltan variables de entorno (Service Role Key) en el servidor." };
  }

  // Validación explícita de password para evitar que Supabase intente enviar un "Invite" (lo hace si el password está vacío)
  if (!params.password || params.password.trim().length < 6) {
    return { success: false, message: "La contraseña es obligatoria y debe ser de al menos 6 caracteres." };
  }

  console.log('🚀 [ADMIN_CREATE] Iniciando flujo para:', params.email);

  try {
    // 1. CREACIÓN EN AUTH (ADMIN)
    // Usamos createUser con email_confirm: true para evitar el envío de correos de confirmación/invitación.
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: params.email,
      password: params.password,
      email_confirm: true, // Esto es CRÍTICO para que no envíe correos y el usuario quede activo.
      user_metadata: {
        nombre: params.nombre,
        rol: params.rol
      }
    });

    if (authError) {
      console.error('❌ [AUTH_ERROR]:', authError.message);
      return { 
        success: false, 
        message: authError.message // Retornamos el mensaje directo de Supabase
      };
    }

    if (!authData?.user) {
      return { success: false, message: "Supabase no devolvió un usuario tras la creación." };
    }

    const userId = authData.user.id;
    console.log('✅ [AUTH_OK] User ID:', userId);

    // 2. CREACIÓN EN PROFILES (DB)
    // Usamos upsert por si acaso el perfil quedó a medias en un intento anterior fallido.
    // Confirmado: columnas id, email, rol, nombre, sede_id
    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .upsert([{
        id: userId,
        email: params.email,
        nombre: params.nombre,
        sede_id: params.sede_id,
        rol: params.rol
      }], { onConflict: 'id' });

    if (profileErr) {
      console.error('❌ [DB_ERROR]:', profileErr.message);
      // No borramos el usuario de Auth, permitimos que el admin lo vea como error de perfil
      return { 
        success: false, 
        message: `Usuario Auth creado pronto, pero falló la tabla de perfiles: ${profileErr.message}` 
      };
    }

    console.log('✨ [FLOW_COMPLETE] Usuario y Perfil listos.');

    return { 
      success: true, 
      user: { id: userId, email: params.email } 
    };

  } catch (err: any) {
    console.error('💥 [CRITICAL_FAIL]:', err);
    return { 
      success: false, 
      message: `Fallo inesperado del servidor: ${err.message || 'Error desconocido'}`
    };
  }
}


