'use server';

import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// Centralización del cliente Admin para evitar problemas de contexto en Vercel
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Debug (Safe Log for Developer)
  console.log('🔍 [DEBUG] Env Check:', { 
    hasUrl: !!url, 
    keyPrefix: serviceKey ? serviceKey.substring(0, 5) + '...' : 'undefined',
    expectedName: 'SUPABASE_SERVICE_ROLE_KEY' 
  });

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
  const token = (await cookies()).get('sb-access-token')?.value;
  if (!token) return { success: false, message: 'Inicia sesión como administrador.' };
  const caller = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await caller.auth.getUser(token);
  if (authError || !user) return { success: false, message: 'Sesión inválida.' };
  const { data: profile } = await caller.from('profiles').select('rol,activo').eq('id', user.id).single();
  if (profile?.rol?.toLowerCase() !== 'admin' || profile.activo === false) return { success: false, message: 'Solo el administrador puede crear usuarios.' };
  if (!['admin', 'asesora', 'contabilidad'].includes(params.rol)) return { success: false, message: 'Rol no válido.' };
  const supabaseAdmin = getAdminClient();
  
  if (!supabaseAdmin) {
    return { success: false, message: "Error de configuración: Faltan variables de entorno (Service Role Key) en el servidor." };
  }

  // Validación explícita de password para evitar que Supabase intente enviar un "Invite" (lo hace si el password está vacío)
  if (!params.password || params.password.trim().length < 6) {
    return { success: false, message: "La contraseña es obligatoria (mínimo 6 caracteres). Sin contraseña, Supabase intenta modo 'Invitar' el cual no está configurado." };
  }

  // Normalización de Roles para integridad de datos
  const finalRol = params.rol;

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
        rol: finalRol
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
        sede_id: params.sede_id || null,
        rol: finalRol
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

/** Administration sets a temporary password for a team member. */
export async function resetPasswordAction(userId: string, password: string) {
  const token = (await cookies()).get('sb-access-token')?.value;
  if (!token) return { success: false, message: 'Inicia sesión como administrador.' };
  const caller = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user } } = await caller.auth.getUser(token);
  const { data: isAdmin } = await caller.rpc('es_admin');
  if (!user || isAdmin !== true) return { success: false, message: 'Solo el administrador puede restablecer claves.' };
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !password || password.trim().length < 6) return { success: false, message: 'La clave temporal debe tener mínimo 6 caracteres.' };
  const admin = getAdminClient();
  if (!admin) return { success: false, message: 'Falta la configuración del servidor.' };
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  return error ? { success: false, message: error.message } : { success: true, message: 'Clave restablecida.' };
}
