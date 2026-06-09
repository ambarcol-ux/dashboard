# Supabase Migrations

Esta carpeta almacena los scripts SQL estructurales de la base de datos para garantizar la reproducibilidad del entorno de **Ámbar ERP** entre entornos de desarrollo, staging y producción (Vercel + Supabase).

## ¿Cómo ejecutar una migración en un proyecto nuevo de Supabase?

Si necesitas levantar el proyecto desde cero en un nuevo entorno de Supabase Cloud, sigue estos pasos:

### Opción A: Supabase CLI (Recomendado)

Si tienes Supabase CLI instalado y vinculado a tu proyecto:

```bash
# Push de todas las migraciones pendientes hacia la base de datos remota
supabase db push
```

### Opción B: SQL Editor (Manual)

1. Ve a la consola web de [Supabase Dashboard](https://supabase.com/dashboard).
2. Selecciona tu proyecto y abre la pestaña **SQL Editor**.
3. Haz clic en **New query**.
4. Copia el contenido completo del archivo `20260608_fix_foreign_keys_ambiguity.sql` (o cualquier otra migración).
5. Pega el código en el editor y presiona **Run** o `CMD + Enter`.

### Convenciones de Nomenclatura

*   Todos los archivos de migración deben seguir el formato de fecha: `YYYYMMDD_nombre_descriptivo.sql`
*   Agrega siempre comentarios técnicos explicando el motivo de la migración (ej. resolución de errores PGRST201 o cambios en la arquitectura).
