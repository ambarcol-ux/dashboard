-- =========================================================================
-- MIGRATION: 20260608_fix_foreign_keys_ambiguity.sql
-- DESCRIPTION: Corrección de llaves foráneas y ambigüedad relacional
-- =========================================================================

-- 1. Creación de Foreign Key para Asesoras
-- Resuelve el error de Supabase/PostgREST: "Could not find a relationship between 'citas' and 'asesoras' in the schema cache"
-- Garantiza la integridad referencial vinculando citas.asesora_id -> asesoras.id
ALTER TABLE public.citas 
ADD CONSTRAINT fk_citas_asesoras 
FOREIGN KEY (asesora_id) 
REFERENCES public.asesoras(id) 
ON DELETE SET NULL;

-- 2. Creación de Foreign Key para Sedes
-- Vincula citas.sede_id -> sedes.id
ALTER TABLE public.citas 
ADD CONSTRAINT fk_citas_sedes 
FOREIGN KEY (sede_id) 
REFERENCES public.sedes(id) 
ON DELETE SET NULL;

-- =========================================================================
-- NOTA TÉCNICA (AMBIGÜEDAD DE FOREIGN KEYS PGRST201)
-- =========================================================================
-- Al ejecutar el constraint anterior (fk_citas_sedes), PostgREST puede lanzar
-- un error de ambigüedad (PGRST201) si ya existía implícitamente o por defecto
-- un constraint de llave foránea llamado 'citas_sede_id_fkey'.
-- 
-- PostgREST no sabrá cuál "cable" utilizar (si fk_citas_sedes o citas_sede_id_fkey)
-- para realizar el JOIN.
-- 
-- SOLUCIÓN FRONTEND:
-- En el cliente (SDK de Supabase / Next.js), las consultas .select()
-- deben especificar explícitamente el nombre del constraint utilizando
-- el operador '!'. Ejemplo:
-- .select('*, asesoras(nombre_completo), sedes!citas_sede_id_fkey(nombre)')
-- =========================================================================
