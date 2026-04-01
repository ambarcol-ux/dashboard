'use server';

import { createClient } from '@supabase/supabase-js';

// Inicialización de cliente administrativo (SOLO EN SERVIDOR)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

interface CreateUserParams {
  email: string;
  password?: string;
  nombre: string;
  sede_id: string;
  rol: string;
}

export async function createUserAction(params: CreateUserParams) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY no configurada en el servidor.");
    }

    // 1. Crear el usuario en Auth con confirmación automática
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: params.email,
      password: params.password,
      email_confirm: true,
      user_metadata: {
        nombre: params.nombre,
        rol: params.rol
      }
    });

    if (error) throw error;
    if (!data.user) throw new Error("No se pudo obtener el ID del nuevo usuario.");

    // 2. Crear el perfil en la tabla pública
    const { error: profileErr } = await supabaseAdmin.from('profiles').upsert([{
      id: data.user.id,
      email: params.email,
      nombre: params.nombre,
      sede_id: params.sede_id,
      rol: params.rol
    }], { onConflict: 'id' });

    if (profileErr) {
      console.error("Error creando perfil administrativo:", profileErr);
      return { success: false, message: "Usuario creado pero falló la creación del perfil. Verifique la base de datos." };
    }

    return { success: true, user: data.user };

  } catch (err: any) {
    console.error("Error en createUserAction:", err.message);
    return { success: false, message: err.message };
  }
}
