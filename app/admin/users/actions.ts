'use server';

import { createClient } from '@supabase/supabase-js';

/**
 * Función interna para inicializar el cliente administrativo de forma segura.
 * Se hace bajo demanda para asegurar que las variables de entorno estén cargadas.
 */
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Configuración de Supabase incompleta (URL o SERVICE_ROLE_KEY faltantes).");
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

/**
 * Server Action para creación de usuarios administrativos.
 * Utiliza el Service Role para bypass de RLS y creación forzada en Auth.
 */
export async function createUserAction(params: CreateUserParams) {
  const supabaseAdmin = getAdminClient();
  
  console.log('🚀 Iniciando creación de usuario:', { email: params.email, role: params.rol, sede: params.sede_id });

  try {
    // 1. Crear el usuario en Auth con privilegios de administrador
    // Esto evita que el usuario tenga que confirmar el correo si se desea asì.
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: params.email,
      password: params.password,
      email_confirm: true,
      user_metadata: {
        nombre: params.nombre,
        rol: params.rol
      }
    });

    if (authError) {
      console.error('❌ Error en Supabase Auth Admin:', authError);
      return { 
        success: false, 
        message: `Error de Autenticación: ${authError.message}`,
        details: authError 
      };
    }

    if (!authData.user) {
      throw new Error("La creación en Auth fue exitosa pero no se retornó un objeto de usuario.");
    }

    console.log('✅ Usuario creado en Auth:', authData.user.id);

    // 2. Sincronizar con la tabla pública 'profiles'
    // Usamos los nombres exactos confirmados en el esquema: nombre, rol, sede_id
    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .insert([{
        id: authData.user.id,
        email: params.email,
        nombre: params.nombre,
        sede_id: params.sede_id,
        rol: params.rol
      }]);

    if (profileErr) {
      console.error('❌ Error sincronizando perfil en DB:', profileErr);
      // Intentamos un log más profundo si es posible
      return { 
        success: false, 
        message: `Usuario Auth creado, pero falló el perfil: ${profileErr.message}`,
        code: profileErr.code
      };
    }

    console.log('✨ Perfil sincronizado con éxito para:', params.email);

    return { 
      success: true, 
      user: authData.user 
    };

  } catch (err: any) {
    console.error('💥 Error fatal en createUserAction:', err);
    return { 
      success: false, 
      message: err.message || 'Error interno desconocido en el servidor.' 
    };
  }
}

